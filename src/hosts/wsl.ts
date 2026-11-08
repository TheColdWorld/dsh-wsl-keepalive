/**
 * WSL-hosted platform service: DSH runs inside a WSL distro.
 * The implicit target is only WSL_DISTRO_NAME; there is intentionally no
 * "exactly one running distro" fallback.
 * @module dsh-wsl-keepalive/hosts/wsl
 */

import { existsSync, readFileSync } from 'node:fs'
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

  async implicitDistro(_wslExecPath: string): Promise<string | null> {
    const name = (process.env.WSL_DISTRO_NAME ?? '').trim()
    return name === '' ? null : name
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
