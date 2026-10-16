/**
 * wsl-keepalive environment check — decide whether this host can run the
 * keep-alive service, and if not, why.
 *
 * The service only needs one thing: the ability to execute `wsl.exe` from
 * inside the distro (WSL interop). Detection therefore leads with evidence of a
 * working interop channel and ends with a real, cheap execution probe; the
 * kernel string is used only to explain a refusal, never to grant access.
 *
 * Order (see classifyWslEnv):
 *   1. resolve the wsl.exe candidate (configuration first, fallback second);
 *   2. cheap interop evidence: WSL_INTEROP pointing at a live socket, an
 *      interop socket under /run/WSL, or an enabled WSLInterop binfmt entry;
 *   3. a functional probe of the candidate — the authoritative verdict;
 *   4. kernel / container markers only label the failure.
 *
 * The kernel signature alone is deliberately not a gate: a container on a WSL2
 * host shares the `...-microsoft-standard-WSL2` kernel but has no interop, so
 * keying on it would advertise keep-alive where wsl.exe cannot run.
 *
 * The check runs on the host plane through Node's own primitives (fs/exec),
 * not through the model-facing `ctx.shell`/`ctx.fs` services.
 * @module wsl-keepalive/env
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { release as osRelease } from 'node:os'

/** Stable refusal code; the browser localizes it (src/client/i18n.ts). */
export type WslEnvCode =
  | 'ok'
  | 'envNotWsl'
  | 'containerNoInterop'
  | 'interopDisabled'
  | 'interopUnavailable'
  | 'errWslExecMissing'

/** Environment check result. When ok=false, code is always a localizable code. */
export interface WslEnvResult {
  ok: boolean
  /** Stable localization code (owned by the client dictionary). */
  code: WslEnvCode
  /** Human-readable failure reason when not usable (also the log line). */
  reason: string | null
  /** Short description for logs / debugging. */
  detail: string
  /**
   * Kernel release string read during detection. It is one concrete fact the
   * client can localize a refusal with, so it travels as a template param.
   */
  kernel: string
  /** Template params for code. */
  params: Record<string, string> | null
}

/** How the functional probe of the wsl.exe candidate failed. */
export type ProbeFailure = 'ENOENT' | 'ENOEXEC' | 'EACCES' | 'TIMEOUT' | 'OTHER'

/** Result of one wsl.exe probe. */
export type ProbeResult = { ok: true } | { ok: false; failure: ProbeFailure; detail: string }

/**
 * The facts classifyWslEnv needs. checkWslEnv gathers them from the real host;
 * unit tests synthesize them, which keeps the whole decision table testable
 * without touching the system.
 */
export interface WslFacts {
  /** Kernel release string (empty when unreadable). */
  kernel: string
  /** Kernel signature contains `microsoft` (may also be true inside a container). */
  kernelIsWsl: boolean
  /** Any interop evidence was found (env socket / /run/WSL socket / binfmt). */
  interopEvidence: boolean
  /** /etc/wsl.conf explicitly disables interop. */
  interopDisabled: boolean
  /** A container marker was found (diagnostic only). */
  container: boolean
  /** Resolved wsl.exe candidate ('' when none). */
  candidate: string
  /** Fallback wsl.exe path, used for the message when no candidate resolved. */
  fallback: string
  /** The candidate exists on disk. */
  candidateExists: boolean
  /** Probe result; null when the candidate does not exist and was not probed. */
  probe: ProbeResult | null
}

/** Build a refusal result with a stable code. */
function refuse(
  code: WslEnvCode,
  detail: string,
  params: Record<string, string> | null,
  kernel: string,
): WslEnvResult {
  return { ok: false, code, reason: detail, detail, kernel, params }
}

/**
 * Pure decision table. A candidate that exists is only usable when the
 * functional probe succeeds; every other signal merely explains the refusal.
 * @param facts - gathered (or synthetic) environment facts.
 * @returns the classified environment result.
 */
export function classifyWslEnv(facts: WslFacts): WslEnvResult {
  const { kernel } = facts
  const kernelParam = kernel || 'unknown'

  if (facts.candidateExists) {
    const probe = facts.probe
    if (probe !== null && probe.ok) {
      return { ok: true, code: 'ok', reason: null, detail: `wsl.exe is executable (${facts.candidate})`, kernel, params: null }
    }
    if (probe !== null && probe.failure === 'ENOENT') {
      return refuse('errWslExecMissing', `wsl.exe was not found at ${facts.candidate}`, { path: facts.candidate }, kernel)
    }
    if (facts.interopDisabled) {
      return refuse(
        'interopDisabled',
        `WSL interop is disabled in /etc/wsl.conf ([interop] enabled=false), so ${facts.candidate} cannot run`,
        null,
        kernel,
      )
    }
    const probeDetail = probe === null ? 'wsl.exe was not probed' : `probe failed (${probe.failure}): ${probe.detail}`
    return refuse('interopUnavailable', `${facts.candidate}: ${probeDetail}`, { detail: probeDetail }, kernel)
  }

  // No usable wsl.exe candidate: classify with the cheap signals.
  const pathParam = facts.candidate !== '' ? facts.candidate : facts.fallback
  if (facts.interopEvidence) {
    return refuse('errWslExecMissing', `WSL interop is available but wsl.exe was not found at ${pathParam}`, { path: pathParam }, kernel)
  }
  if (facts.interopDisabled) {
    return refuse('interopDisabled', 'WSL interop is disabled in /etc/wsl.conf ([interop] enabled=false)', null, kernel)
  }
  if (facts.kernelIsWsl || facts.container) {
    return refuse(
      'containerNoInterop',
      `WSL-like kernel (${kernelParam}) but no interop channel; likely a container on a WSL2 host`,
      { kernel: kernelParam },
      kernel,
    )
  }
  return refuse('envNotWsl', `not a WSL environment (kernel "${kernelParam}", no interop markers)`, { kernel: kernelParam }, kernel)
}

/** True when the path exists and is a Unix socket (follows symlinks). */
function isUnixSocket(path: string): boolean {
  try {
    return statSync(path).isSocket()
  } catch {
    return false
  }
}

/** The WSL_INTEROP socket, when the variable names a live socket. */
function envInteropSocket(env: NodeJS.ProcessEnv): string | null {
  const value = (env.WSL_INTEROP ?? '').trim()
  return value !== '' && isUnixSocket(value) ? value : null
}

/** A live *_interop socket under the well-known WSL run directories. */
function runDirInteropSocket(): string | null {
  for (const dir of ['/run/WSL', '/run/wsl']) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    const hit = entries.find(name => name.endsWith('_interop') && isUnixSocket(`${dir}/${name}`))
    if (hit !== undefined) return `${dir}/${hit}`
  }
  return null
}

/** True when binfmt_misc has an enabled WSLInterop registration. */
function binfmtInteropRegistered(): boolean {
  for (const name of ['WSLInterop', 'WSLInterop-late']) {
    try {
      const text = readFileSync(`/proc/sys/fs/binfmt_misc/${name}`, 'utf-8')
      if (/^\s*enabled\s*$/mi.test(text)) return true
    } catch {
      // Not registered, or /proc/sys/fs/binfmt_misc is not mounted here.
    }
  }
  return false
}

/** True when /etc/wsl.conf's [interop] section sets enabled=false. */
function interopDisabledInWslConf(): boolean {
  let text: string
  try {
    text = readFileSync('/etc/wsl.conf', 'utf-8')
  } catch {
    return false
  }
  let inInterop = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/[#;].*$/, '').trim()
    if (line === '') continue
    const section = /^\[([^\]]+)\]$/.exec(line)
    if (section !== null) {
      inInterop = section[1].trim().toLowerCase() === 'interop'
      continue
    }
    if (!inInterop) continue
    const entry = /^([^=]+)=\s*(.*)$/.exec(line)
    if (entry !== null && entry[1].trim().toLowerCase() === 'enabled') {
      return /^(false|no|0|off)$/i.test(entry[2].trim())
    }
  }
  return false
}

/** True when a container marker is present (diagnostic only). */
function containerPresent(): boolean {
  if (existsSync('/.dockerenv') || existsSync('/run/.containerenv')) return true
  try {
    return /docker|kubepods|containerd|podman|lxc/i.test(readFileSync('/proc/1/cgroup', 'utf-8'))
  } catch {
    return false
  }
}

/** Positive probe results are cached for the process lifetime; negatives expire so a fix is noticed. */
const NEGATIVE_PROBE_TTL_MS = 15_000
const probeCache = new Map<string, { result: ProbeResult; at: number }>()

/** Probe once per path, with a short negative TTL to keep UI polling cheap. */
function probeWslExe(exe: string): ProbeResult {
  const cached = probeCache.get(exe)
  if (cached !== undefined && (cached.result.ok || Date.now() - cached.at < NEGATIVE_PROBE_TTL_MS)) {
    return cached.result
  }
  const result = runProbe(exe)
  probeCache.set(exe, { result, at: Date.now() })
  return result
}

/** Probe timeout: the first wsl.exe call may have to start the WSL service. */
const PROBE_TIMEOUT_MS = 15_000

/**
 * Run `wsl.exe --list --quiet` as the authoritative interop test. Listing is
 * read-only, supported by every WSL version, and exits 0 when the Windows
 * binary actually ran through interop — unlike `--help`, which exits 255 on a
 * working host. Spawn/exec failures classify the refusal.
 */
function runProbe(exe: string): ProbeResult {
  try {
    execFileSync(exe, ['--list', '--quiet'], { timeout: PROBE_TIMEOUT_MS, stdio: ['ignore', 'ignore', 'ignore'] })
    return { ok: true }
  } catch (error) {
    const failure = error as { code?: unknown; status?: unknown; killed?: unknown; signal?: unknown; message?: string }
    if (failure.code === 'ENOENT') return { ok: false, failure: 'ENOENT', detail: `spawn ${exe}: ENOENT` }
    if (failure.code === 'ENOEXEC') return { ok: false, failure: 'ENOEXEC', detail: `spawn ${exe}: ENOEXEC` }
    if (failure.code === 'EACCES' || failure.code === 'EPERM') {
      return { ok: false, failure: 'EACCES', detail: `spawn ${exe}: ${String(failure.code)}` }
    }
    if (failure.killed === true || failure.signal !== undefined) {
      return { ok: false, failure: 'TIMEOUT', detail: `${exe} did not finish in ${PROBE_TIMEOUT_MS}ms` }
    }
    if (typeof failure.status === 'number' && failure.status !== 0) {
      return { ok: false, failure: 'OTHER', detail: `${exe} exited ${failure.status}` }
    }
    return { ok: false, failure: 'OTHER', detail: String(failure.message ?? error) }
  }
}

/** Kernel release string, empty when unreadable. */
function readKernel(): string {
  try {
    return osRelease()
  } catch {
    return ''
  }
}

/** Options for {@link checkWslEnv}. */
export interface CheckWslEnvOptions {
  /** Resolved wsl.exe candidate (config value, else the fallback when it exists, else ''). */
  wslExecPath: string
  /** Fallback path used for messages when no candidate was resolved. */
  fallbackPath: string
}

/**
 * Determine whether the current process can run the keep-alive service.
 * Detection order: interop evidence → functional probe → kernel/container
 * labels. The kernel signature never grants access on its own.
 * @param options - the resolved wsl.exe candidate and fallback path.
 * @returns the classified environment result.
 */
export function checkWslEnv(options: CheckWslEnvOptions): WslEnvResult {
  const kernel = readKernel()
  const interopEvidence = envInteropSocket(process.env) !== null
    || runDirInteropSocket() !== null
    || binfmtInteropRegistered()
  const candidate = options.wslExecPath.trim()
  const candidateExists = candidate !== '' && existsSync(candidate)
  return classifyWslEnv({
    kernel,
    kernelIsWsl: /microsoft/i.test(kernel),
    interopEvidence,
    interopDisabled: interopDisabledInWslConf(),
    container: containerPresent(),
    candidate,
    fallback: options.fallbackPath,
    candidateExists,
    probe: candidateExists ? probeWslExe(candidate) : null,
  })
}
