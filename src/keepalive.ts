/**
 * Keep-alive process lifecycle inside one distro.
 *
 * WSL tears down background processes when the launching wsl.exe exits, so the
 * Host keeps one foreground wsl.exe child per target. The child runs exactly
 * one external script, whose SHA-256 is verified and repaired before startup.
 * Stopping uses the requested 'wsl -d <distro> -u root --exec kill <pid>',
 * guarded by a PID shape check and a cmdline marker check.
 * @module dsh-wsl-keepalive/keepalive
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { EnvCheck, ResolvedTarget, TargetStatus } from './types.ts'
import { distroArgs, runWsl, runWslRaw, userArgs } from './wsl.ts'
import { KEEPALIVE_MARKER, KEEPALIVE_SCRIPT_BYTES, formatTamperedScript, isCanonicalScript } from './script.ts'

/** A Host-held wsl.exe child plus the Linux PID it reported. */
interface LiveChild {
  child: ChildProcess
  pid: string
  target: ResolvedTarget
}

/** Sink for repair events; the Host passes its logger. */
export interface KeepAliveReporter {
  warn(message: string): void
}

const silentReporter: KeepAliveReporter = { warn: () => {} }

const live = new Map<string, LiveChild>()

/** Whether a string is a safe, non-trivial Linux PID. */
export function isPid(value: string): boolean {
  return /^[1-9][0-9]{0,9}$/.test(value) && Number(value) > 1
}

function keyOf(target: ResolvedTarget): string {
  return (target.distro ?? '') + '\u0000' + target.wslExecPath + '\u0000' + target.userName
}

function display(target: ResolvedTarget): string {
  return target.distro ?? 'unknown distro'
}

/**
 * Read the existing script as exact stdout bytes. State and executable bit are
 * reported on stderr so the content itself stays untouched.
 */
const READ_SCRIPT = [
  'home="$HOME"',
  '[ -n "$home" ] || home=/tmp',
  'script="$home/.cache/dsh-wsl-keepalive/keepalive.sh"',
  'if [ ! -f "$script" ]; then echo "STATE=missing" >&2; exit 0; fi',
  'echo "STATE=present" >&2',
  'if [ -x "$script" ]; then echo "MODE=exec" >&2; else echo "MODE=noexec" >&2; fi',
  'cat "$script"',
].join('\n')

/**
 * Write the canonical bytes passed as $1. printf is a shell builtin, so no
 * checksum or text-processing utility is needed beyond the existing shell,
 * cat, chmod, mkdir, and rm.
 */
const WRITE_SCRIPT = [
  'umask 077',
  'home="$HOME"',
  '[ -n "$home" ] || home=/tmp',
  'dir="$home/.cache/dsh-wsl-keepalive"',
  'script="$dir/keepalive.sh"',
  'mkdir -p "$dir" || { echo "ERR=mkdir" >&2; exit 1; }',
  'chmod 700 "$dir" 2>/dev/null || true',
  'rm -f "$script"',
  'printf \'%s\' "$1" > "$script" || { echo "ERR=write" >&2; exit 1; }',
  'chmod 700 "$script" || { echo "ERR=chmod" >&2; exit 1; }',
].join('\n')

const START_SCRIPT = [
  'home="$HOME"',
  '[ -n "$home" ] || home=/tmp',
  'echo "PID=$$"',
  'exec sh "$home/.cache/dsh-wsl-keepalive/keepalive.sh"',
].join('\n')

const STATUS_SCRIPT = [
  'home="$HOME"',
  '[ -n "$home" ] || home=/tmp',
  'dir="$home/.cache/dsh-wsl-keepalive"',
  'script="$dir/keepalive.sh"',
  'pidfile="$dir/keepalive.pid"',
  'if [ ! -f "$pidfile" ]; then echo STOPPED; exit 0; fi',
  'pid=$(cat "$pidfile" 2>/dev/null)',
  'case "$pid" in \'\'|*[!0-9]*) pid=;; esac',
  'if [ -n "$pid" ] && [ -r "/proc/$pid/cmdline" ]; then',
  '  if tr \'\\0\' \' \' < "/proc/$pid/cmdline" | grep -F "$script" >/dev/null 2>&1; then',
  '    echo "RUNNING=$pid"',
  '    exit 0',
  '  fi',
  'fi',
  'rm -f "$pidfile"',
  'echo STOPPED',
].join('\n')

const CLEANUP_SCRIPT = [
  'home="$HOME"',
  '[ -n "$home" ] || home=/tmp',
  'rm -f "$home/.cache/dsh-wsl-keepalive/keepalive.pid"',
].join('\n')

const KILL_SCRIPT = [
  'pid="$1"',
  'signal="$2"',
  'marker="$3"',
  'case "$pid" in \'\'|*[!0-9]*) echo "ERR=badpid"; exit 2;; esac',
  '[ -r "/proc/$pid/cmdline" ] || { echo "ERR=gone"; exit 4; }',
  'if ! tr \'\\0\' \' \' < "/proc/$pid/cmdline" | grep -F "$marker" >/dev/null 2>&1; then',
  '  echo "ERR=mismatch"',
  '  exit 5',
  'fi',
  'kill -"$signal" "$pid" 2>/dev/null || kill "$pid" 2>/dev/null || { echo "ERR=kill"; exit 6; }',
].join('\n')

function field(stdout: string, key: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(key + '=')) return line.slice(key.length + 1).trim()
  }
  return null
}

function failure(target: ResolvedTarget, code: string, detail: string, params: Record<string, string> | null = null): TargetStatus {
  return { distro: target.distro, pid: null, running: false, errorCode: code, errorParams: params, error: detail }
}

interface ScriptState {
  present: boolean
  executable: boolean
  content: Buffer
  error: string | null
}

async function readScript(target: ResolvedTarget): Promise<ScriptState> {
  const result = await runWslRaw(
    target.wslExecPath,
    [...userArgs(target.distro, target.userName), '--exec', 'sh', '-c', READ_SCRIPT],
    15000,
  )
  if (result.error !== null) {
    return { present: false, executable: false, content: Buffer.alloc(0), error: result.error }
  }
  if (result.code !== 0) {
    const detail = result.stderr.toString('utf8').trim()
      || result.stdout.toString('utf8').trim()
      || 'reading keepalive.sh failed'
    return { present: false, executable: false, content: Buffer.alloc(0), error: detail }
  }
  const meta = result.stderr.toString('utf8')
  return {
    present: field(meta, 'STATE') === 'present',
    executable: field(meta, 'MODE') === 'exec',
    content: result.stdout,
    error: null,
  }
}

/**
 * Compare the target file with the canonical bytes and rewrite it when it is
 * missing, altered, or not executable. Verification is a direct byte-for-byte
 * comparison in Node; the target needs no checksum utility.
 */
async function ensureScript(target: ResolvedTarget, report: KeepAliveReporter): Promise<string | null> {
  const current = await readScript(target)
  if (current.error !== null) return current.error
  if (current.present && current.executable && isCanonicalScript(current.content)) return null
  if (current.present && !isCanonicalScript(current.content)) {
    report.warn('wsl-keepalive: keepalive.sh tampered for ' + display(target)
      + '; original=' + formatTamperedScript(current.content))
  }

  const reason = !current.present ? 'missing' : !current.executable ? 'not executable' : 'content mismatch'
  const write = await runWslRaw(
    target.wslExecPath,
    [...userArgs(target.distro, target.userName), '--exec', 'sh', '-c', WRITE_SCRIPT, 'sh', KEEPALIVE_SCRIPT_BYTES],
    15000,
  )
  if (write.error !== null) return write.error
  if (write.code !== 0) {
    return write.stderr.toString('utf8').trim()
      || write.stdout.toString('utf8').trim()
      || 'writing keepalive.sh failed'
  }

  const verify = await readScript(target)
  if (verify.error !== null) return verify.error
  if (!verify.present || !verify.executable || !isCanonicalScript(verify.content)) {
    report.warn('wsl-keepalive: keepalive.sh verification failed for ' + display(target) + ' after rewrite')
    return 'keepalive.sh verification failed after rewrite'
  }
  report.warn('wsl-keepalive: repaired keepalive.sh for ' + display(target)
    + ' (' + reason + '); wrote ' + String(Buffer.byteLength(KEEPALIVE_SCRIPT_BYTES, 'utf8')) + ' canonical bytes')
  return null
}

function waitForPid(child: ChildProcess, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let buffer = ''
    let stderr = ''
    let settled = false
    const finish = (pid: string | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(pid)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      const pid = field(buffer, 'PID')
      if (pid !== null) finish(pid)
    })
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', () => finish(null))
    child.on('exit', () => finish(field(buffer, 'PID')))
    ;(child as ChildProcess & { stderrText?: () => string }).stderrText = () => stderr
  })
}

async function runStatusScript(target: ResolvedTarget): Promise<TargetStatus> {
  const result = await runWsl(
    target.wslExecPath,
    [...userArgs(target.distro, target.userName), '--exec', 'sh', '-c', STATUS_SCRIPT],
    15000,
  )
  if (result.error !== null) return failure(target, 'errCommandFailed', result.error, { detail: result.error })
  if (result.code !== 0) return failure(target, 'errCommandFailed', result.stderr.trim() || 'status failed')
  const pid = field(result.stdout, 'RUNNING')
  return {
    distro: target.distro,
    pid,
    running: pid !== null,
    errorCode: null,
    errorParams: null,
    error: null,
  }
}

/** Query one target, preferring the Host-held child. */
export async function statusTarget(target: ResolvedTarget): Promise<TargetStatus> {
  const entry = live.get(keyOf(target))
  if (entry !== undefined && entry.child.exitCode === null && !entry.child.killed) {
    return { distro: target.distro, pid: entry.pid, running: true, errorCode: null, errorParams: null, error: null }
  }
  if (entry !== undefined) live.delete(keyOf(target))
  return runStatusScript(target)
}

/**
 * Start one target in a Host-held foreground wsl.exe child.
 * @param target - resolved distro/user/wsl.exe path.
 * @param report - sink for a verified script repair.
 */
export async function startTarget(target: ResolvedTarget, report: KeepAliveReporter = silentReporter): Promise<TargetStatus> {
  const before = await statusTarget(target)
  if (before.running) return before
  const scriptError = await ensureScript(target, report)
  if (scriptError !== null) return failure(target, 'errStartFailed', scriptError, { detail: scriptError })

  const args = [...userArgs(target.distro, target.userName), '--exec', 'sh', '-c', START_SCRIPT]
  const child = spawn(target.wslExecPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const pid = await waitForPid(child, 10000)
  if (pid === null || !isPid(pid)) {
    const detail = (child as ChildProcess & { stderrText?: () => string }).stderrText?.() ?? 'wsl.exe did not report a valid PID'
    child.kill('SIGKILL')
    return failure(target, 'errStartFailed', detail, { detail })
  }
  live.set(keyOf(target), { child, pid, target })
  child.on('exit', () => {
    const current = live.get(keyOf(target))
    if (current?.child === child) live.delete(keyOf(target))
  })
  return { distro: target.distro, pid, running: true, errorCode: null, errorParams: null, error: null }
}

async function killPid(target: ResolvedTarget, pid: string, signal: 'TERM' | 'KILL'): Promise<void> {
  if (!isPid(pid)) throw new Error('refusing to kill invalid pid ' + JSON.stringify(pid))
  const result = await runWsl(
    target.wslExecPath,
    [...distroArgs(target.distro), '-u', 'root', '--exec', 'sh', '-c', KILL_SCRIPT, 'sh', pid, signal, KEEPALIVE_MARKER],
    10000,
  )
  if (result.error !== null) throw new Error(result.error)
  if (result.code === 0 || result.code === 4 || result.code === 5) return
  throw new Error(result.stderr.trim() || result.stdout.trim() || 'kill exited with ' + String(result.code))
}

/** Stop one target with the root wsl.exe kill command. */
export async function stopTarget(target: ResolvedTarget): Promise<TargetStatus> {
  const before = await statusTarget(target)
  if (!before.running || before.pid === null) return before
  let failureDetail: string | null = null
  try {
    await killPid(target, before.pid, 'TERM')
  } catch (error) {
    failureDetail = String((error as Error | undefined)?.message ?? error)
  }
  let after = before
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    after = await statusTarget(target)
    if (!after.running) break
  }
  if (after.running && after.pid !== null) {
    try {
      await killPid(target, after.pid, 'KILL')
    } catch (error) {
      failureDetail = String((error as Error | undefined)?.message ?? error)
    }
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      after = await statusTarget(target)
      if (!after.running) break
    }
  }
  const entry = live.get(keyOf(target))
  if (entry !== undefined) {
    entry.child.kill('SIGKILL')
    live.delete(keyOf(target))
  }
  await runWsl(
    target.wslExecPath,
    [...userArgs(target.distro, target.userName), '--exec', 'sh', '-c', CLEANUP_SCRIPT],
    10000,
  )
  if (after.running && failureDetail !== null) {
    return { ...after, errorCode: 'errCommandFailed', errorParams: { detail: failureDetail }, error: failureDetail }
  }
  return after
}

/**
 * Kill every Host-held child and its Linux keep-alive PID, e.g. when the
 * plugin unloads. Root kills are marker-verified; the Host child is always
 * SIGKILLed even when the in-distro kill cannot run.
 */
export async function disposeAll(): Promise<void> {
  const entries = Array.from(live.values())
  live.clear()
  await Promise.all(entries.map(async ({ child, pid, target }) => {
    try {
      if (isPid(pid)) await killPid(target, pid, 'KILL')
    } catch {
      // Fall through to the Host child SIGKILL below.
    }
    if (child.exitCode === null && !child.killed) child.kill('SIGKILL')
  }))
}

/** Whether an environment check permits touching this target. */
export function denied(target: ResolvedTarget, env: EnvCheck): TargetStatus {
  return {
    distro: target.distro,
    pid: null,
    running: false,
    errorCode: env.code,
    errorParams: env.params ?? null,
    error: env.detail,
  }
}
