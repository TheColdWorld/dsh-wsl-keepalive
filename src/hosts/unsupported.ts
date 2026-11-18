/**
 * Placeholder for hosts that are not implemented yet. It fails closed with a
 * visible error instead of accidentally driving wsl.exe on an unsupported host.
 * @module dsh-wsl-keepalive/hosts/unsupported
 */

import type { EnvCheck, ResolvedTarget, WslPathValidation } from '../core/types.ts'
import type { HostService, ResolvedWslExec } from '../core/host.ts'

const DETAIL = 'WSL keep-alive needs a WSL or Windows host; this environment is not supported.'

export class UnsupportedHostService implements HostService {
  readonly kind = 'unsupported' as const

  defaultWslExec(): string {
    return ''
  }

  async resolveWslExec(): Promise<ResolvedWslExec> {
    return { ok: false, path: '', errorCode: 'errHostUnsupported', detail: DETAIL }
  }

  async implicitDistro(): Promise<string | null> {
    return null
  }

  async checkEnv(target: ResolvedTarget): Promise<EnvCheck> {
    return { ok: false, code: 'errHostUnsupported', detail: target.name + ': ' + DETAIL }
  }

  normalizeWslPath(input: string): string {
    return input.trim()
  }

  async validateWslPath(): Promise<WslPathValidation> {
    return { ok: false, path: '', errorCode: 'errHostUnsupported', detail: DETAIL }
  }

  execOptions(): { cwd?: string } {
    return {}
  }
}
