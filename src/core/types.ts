/**
 * Shared Host-side shapes for the WSL keep-alive service.
 * @module dsh-wsl-keepalive/core/types
 */

/** One configured target. The distro name is the unique key. */
export interface DistroTarget {
  /** Distro name; required and unique across targets. */
  name: string
  /** User that starts the keep-alive; empty means the distro default user. */
  user: string
}

/** One target after config resolution. The concrete wsl.exe path lives in ResolvedConfig. */
export interface ResolvedTarget {
  name: string
  user: string
  implicit: boolean
}

/** Config after the host resolved preferredWslExec to a concrete path. */
export interface ResolvedConfig {
  /** Effective value: true when the switch is on or the implicit distro is explicit. */
  keepDefault: boolean
  targets: ResolvedTarget[]
  /** Concrete wsl.exe path; memory only, never persisted per target. */
  wslExecPath: string
}

export interface TargetStatus {
  name: string
  pid: string | null
  running: boolean
  errorCode: string | null
  errorParams: Record<string, string> | null
  error: string | null
}

export type HostKind = 'wsl' | 'win32' | 'unsupported'

export type ImplicitReason =
  | 'ok'
  | 'unidentified-dsh-distro'
  | 'no-default-distro'

export interface KeepAliveStatus {
  enabled: boolean
  partial: boolean
  host: HostKind
  /** Implicit distro: the DSH distro on WSL, the WSL default distro on Windows. */
  defaultDistro: string | null
  implicitAvailable: boolean
  implicitReason: ImplicitReason | null
  /** Effective switch value, including the explicit-target lock. */
  keepDefaultEffective: boolean
  /** True when the implicit distro is already present in targets. */
  keepDefaultLocked: boolean
  targets: TargetStatus[]
  errorCode: string | null
  errorParams: Record<string, string> | null
  error: string | null
}

export interface EnvCheck {
  ok: boolean
  code: string
  params?: Record<string, string>
  detail: string
}

/** Result of validating one candidate wsl.exe path. */
export interface WslPathValidation {
  ok: boolean
  /** Canonical absolute path when ok; empty for the auto-detect default. */
  path: string
  errorCode: string | null
  detail: string | null
}
