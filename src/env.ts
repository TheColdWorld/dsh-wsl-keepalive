/**
 * Per-distro WSL environment check. binfmt_misc is consulted first, then the
 * interop socket, then a real wsl.exe invocation.
 * @module dsh-wsl-keepalive/env
 */

import { existsSync, readFileSync } from 'node:fs'
import type { EnvCheck, ResolvedTarget } from './types.ts'
import { runWsl, userArgs } from './wsl.ts'

const EVIDENCE_SCRIPT = [
  'if [ -e /proc/sys/fs/binfmt_misc/WSLInterop ] || [ -e /proc/sys/fs/binfmt_misc/WSLInterop-late ]; then',
  '  echo BINFMT',
  'elif ls /run/WSL/*_interop >/dev/null 2>&1; then',
  '  echo SOCKET',
  'else',
  '  echo NONE',
  'fi',
].join('\n')

function kernelLooksLikeWsl(): boolean {
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf8'))
  } catch {
    return false
  }
}

interface CachedEnv {
  at: number
  value: EnvCheck
}

const ENV_TTL_MS = 60_000
const envCache = new Map<string, CachedEnv>()

function envKey(target: ResolvedTarget): string {
  return (target.distro ?? '') + '\u0000' + target.wslExecPath + '\u0000' + target.userName
}

/** Drop cached verdicts, e.g. after tests or a manual recheck. */
export function clearEnvCache(): void {
  envCache.clear()
}

async function probeTarget(target: ResolvedTarget): Promise<EnvCheck> {
  const exe = target.wslExecPath
  if (exe.startsWith('/') && !existsSync(exe)) {
    return { ok: false, code: 'errWslExecMissing', params: { path: exe }, detail: 'wsl.exe not found at ' + exe }
  }

  const evidence = await runWsl(
    exe,
    [...userArgs(target.distro, target.userName), '--exec', 'sh', '-c', EVIDENCE_SCRIPT],
    15000,
  )
  const probe = await runWsl(
    exe,
    [...userArgs(target.distro, target.userName), '--exec', 'true'],
    15000,
  )

  if (probe.code === 0) {
    return { ok: true, code: 'ok', detail: 'wsl.exe executed successfully' }
  }

  const spawn = probe.error ?? evidence.error ?? ''
  if (spawn.includes('ENOENT')) {
    return { ok: false, code: 'errWslExecMissing', params: { path: exe }, detail: spawn }
  }

  const kind = evidence.code === 0 ? evidence.stdout.trim() : 'NONE'
  if (spawn !== '') {
    return { ok: false, code: 'interopUnavailable', detail: spawn }
  }
  if (kind === 'BINFMT' || kind === 'SOCKET') {
    return { ok: false, code: 'interopUnavailable', detail: 'interop evidence exists but wsl.exe failed' }
  }
  if (kernelLooksLikeWsl()) {
    return { ok: false, code: 'containerNoInterop', detail: 'WSL-like kernel without an interop channel' }
  }
  return { ok: false, code: 'envNotWsl', detail: 'no WSL kernel or interop marker detected' }
}

/**
 * Cached environment check. A verdict is reused for one minute so the
 * five-second status poll does not respawn two wsl.exe probes per target.
 * @param target - resolved distro/user/wsl.exe path.
 * @returns the cached or freshly probed verdict.
 */
export async function checkTarget(target: ResolvedTarget): Promise<EnvCheck> {
  const key = envKey(target)
  const hit = envCache.get(key)
  if (hit !== undefined && Date.now() - hit.at < ENV_TTL_MS) return hit.value
  const value = await probeTarget(target)
  envCache.set(key, { at: Date.now(), value })
  return value
}
