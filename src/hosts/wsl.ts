/**
 * WSL-hosted platform service: DSH runs inside a WSL distro.
 * The implicit target is WSL_DISTRO_NAME; when systemd or another launcher
 * drops that variable, the second probe is `wslpath -w /`, whose UNC share
 * name is the current distro. There is intentionally no running-distro
 * enumeration and no "default distro" guess.
 * @module dsh-wsl-keepalive/hosts/wsl
 */

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { release } from 'node:os'
import path from 'node:path'
import type { EnvCheck, ResolvedTarget, WslPathValidation } from '../core/types.ts'
import type { HostService, ResolvedWslExec } from '../core/host.ts'
import type { ExecOptions, WslResult } from '../core/wsl.ts'
import { runWsl, userArgs } from '../core/wsl.ts'
import {
  normalizeWslPath,
  validateExecPath,
  validatePreferredWslExec,
} from '../core/validate.ts'

export const DEFAULT_WSL_EXEC = '/mnt/c/Windows/System32/wsl.exe'

/** Host facts used to distinguish a WSL distro from an ordinary Linux host. */
export interface WslEnvironmentFacts {
  /** Node platform; defaults to the current Host. */
  platform?: string
  /** Process environment; defaults to the current Host. */
  env?: NodeJS.ProcessEnv
  /** Kernel release; defaults to this Host's `os.release()`. */
  osRelease?: string
}

/**
 * Identify a Linux process running under Windows Subsystem for Linux. WSL
 * always exports at least one marker, and a WSL2 kernel release carries
 * `microsoft`; plain Linux matches neither. The bundle declares `wsl` as its
 * supported platform, so this is also the guard that keeps the plugin from
 * loading on an ordinary Linux host.
 * @param facts - injectable process and kernel facts for tests.
 * @returns true only for a Linux host with WSL markers.
 */
export function isWsl(facts: WslEnvironmentFacts = {}): boolean {
  if ((facts.platform ?? process.platform) !== 'linux') return false
  const env = facts.env ?? process.env
  return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP)
    || (facts.osRelease ?? release()).toLowerCase().includes('microsoft')
}

/** WSL2 returns \\wsl.localhost\<name>\; WSL1 and older builds use \\wsl$\<name>\. */
const WSL_UNC = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(?:\\|$)/i

/** Re-probe interval when WSL_DISTRO_NAME is absent; the distro cannot change per process. */
const IMPLICIT_TTL_MS = 60_000

/**
 * Parse the current distro from `wslpath -w /`. The Windows share name in
 * `\\wsl.localhost\<name>\` or `\\wsl$\<name>\` is the registered distro
 * name, so the result is safe to pass to `wsl.exe -d`.
 * @param output - raw stdout from wslpath.
 * @returns the distro name, or null when the output is not a WSL UNC path.
 */
export function distroFromWslPath(output: string): string | null {
  const match = WSL_UNC.exec(output.trim())
  const name = match?.[1]?.trim() ?? ''
  if (name === '' || name.length > 128) return null
  if (/[\u0000-\u001f\u007f]/.test(name)) return null
  return name
}

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

function envKey(target: ResolvedTarget, wslExecPath: string): string {
  return target.name + '\u0000' + target.user + '\u0000' + wslExecPath
}

/** Drop cached verdicts, e.g. after tests or a manual recheck. */
export function clearEnvCache(): void {
  envCache.clear()
}

export class WslHostService implements HostService {
  readonly kind = 'wsl' as const
  /** Last `wslpath` probe; only used when WSL_DISTRO_NAME is absent. */
  private wslPathProbe: { at: number; value: string | null } | null = null

  defaultWslExec(): string {
    return DEFAULT_WSL_EXEC
  }

  normalizeWslPath(input: string): string {
    return normalizeWslPath(input, path.posix)
  }

  private probe(execPath: string): Promise<WslResult> {
    return runWsl(execPath, ['--version'], 10000, this.execOptions())
  }

  async resolveWslExec(preferred: string): Promise<ResolvedWslExec> {
    const absolute = this.normalizeWslPath(preferred)
    const target = absolute === '' ? this.defaultWslExec() : absolute
    const verdict = await validateExecPath(target, (execPath) => this.probe(execPath))
    if (!verdict.ok) {
      return { ok: false, path: '', errorCode: verdict.errorCode, detail: verdict.detail }
    }
    return { ok: true, path: verdict.path, errorCode: null, detail: null }
  }

  /**
   * Second probe for Linux/WSL when the launcher did not pass WSL_DISTRO_NAME.
   * `wslpath` is WSL's own /init helper, not a distro package; it translates
   * this distro's root to `\\wsl.localhost\<name>\` (or `\\wsl$\<name>\`).
   */
  private async wslPathDistro(): Promise<string | null> {
    const now = Date.now()
    if (this.wslPathProbe !== null && now - this.wslPathProbe.at < IMPLICIT_TTL_MS) {
      return this.wslPathProbe.value
    }
    const value = await new Promise<string | null>((resolve) => {
      execFile(
        'wslpath',
        ['-w', '/'],
        { timeout: 5000, maxBuffer: 4096, encoding: 'utf8' },
        (error, stdout) => {
          resolve(error === null ? distroFromWslPath(stdout) : null)
        },
      )
    })
    this.wslPathProbe = { at: now, value }
    return value
  }

  async implicitDistro(_wslExecPath: string): Promise<string | null> {
    const name = (process.env.WSL_DISTRO_NAME ?? '').trim()
    if (name !== '') return name
    return await this.wslPathDistro()
  }

  async validateWslPath(preferred: string): Promise<WslPathValidation> {
    return validatePreferredWslExec(preferred, path.posix, (execPath) => this.probe(execPath))
  }

  execOptions(): ExecOptions {
    return {}
  }

  private async probeTarget(target: ResolvedTarget, wslExecPath: string): Promise<EnvCheck> {
    if (!existsSync(wslExecPath)) {
      return {
        ok: false,
        code: 'errWslExecMissing',
        params: { path: wslExecPath },
        detail: 'wsl.exe not found at ' + wslExecPath,
      }
    }

    const options = this.execOptions()
    const evidence = await runWsl(
      wslExecPath,
      [...userArgs(target.name, target.user), '--exec', 'sh', '-c', EVIDENCE_SCRIPT],
      15000,
      options,
    )
    const probe = await runWsl(
      wslExecPath,
      [...userArgs(target.name, target.user), '--exec', 'true'],
      15000,
      options,
    )

    if (probe.code === 0) {
      return { ok: true, code: 'ok', detail: 'wsl.exe executed successfully' }
    }

    const spawn = probe.error ?? evidence.error ?? ''
    if (spawn.includes('ENOENT')) {
      return {
        ok: false,
        code: 'errWslExecMissing',
        params: { path: wslExecPath },
        detail: spawn,
      }
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

  async checkEnv(target: ResolvedTarget, wslExecPath: string): Promise<EnvCheck> {
    const key = envKey(target, wslExecPath)
    const hit = envCache.get(key)
    if (hit !== undefined && Date.now() - hit.at < ENV_TTL_MS) return hit.value
    const value = await this.probeTarget(target, wslExecPath)
    envCache.set(key, { at: Date.now(), value })
    return value
  }
}
