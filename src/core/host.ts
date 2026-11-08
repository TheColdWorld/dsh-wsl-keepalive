/**
 * Host-side platform seam. One implementation per host kind; core code calls
 * only this interface and never reads process.platform.
 * @module dsh-wsl-keepalive/core/host
 */

import type { EnvCheck, HostKind, ResolvedTarget, WslPathValidation } from './types.ts'
import type { ExecOptions } from './wsl.ts'

export interface ResolvedWslExec {
  ok: boolean
  /** Concrete absolute path when ok. */
  path: string
  errorCode: string | null
  detail: string | null
}

export interface HostService {
  readonly kind: HostKind

  /** Default wsl.exe path for this host. */
  defaultWslExec(): string

  /** Resolve preferredWslExec (empty = default) and verify it. */
  resolveWslExec(preferred: string): Promise<ResolvedWslExec>

  /** Implicit distro for this host; null when it cannot be identified. */
  implicitDistro(wslExecPath: string): Promise<string | null>

  /** Check that one target is reachable from this host. */
  checkEnv(target: ResolvedTarget, wslExecPath: string): Promise<EnvCheck>

  /** Resolve a user-supplied path for this host; empty stays empty. */
  normalizeWslPath(input: string): string

  /** Validate a candidate path saved from the settings page. */
  validateWslPath(preferred: string): Promise<WslPathValidation>

  /** Extra spawn/exec options for every wsl.exe call on this host. */
  execOptions(): ExecOptions
}
