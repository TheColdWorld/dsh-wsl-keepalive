/**
 * Shared Host-side shapes for the WSL keep-alive service.
 * @module dsh-wsl-keepalive/types
 */

export interface DistroTarget {
  distro: string
  userName: string
  wslExecPath: string
}

export interface ResolvedTarget {
  distro: string | null
  userName: string
  wslExecPath: string
  implicit: boolean
}

export interface TargetStatus {
  distro: string | null
  pid: string | null
  running: boolean
  errorCode: string | null
  errorParams: Record<string, string> | null
  error: string | null
}

export interface KeepAliveStatus {
  enabled: boolean
  partial: boolean
  /** Distro that runs this DSH process, even when its keep-alive is off. */
  defaultDistro: string | null
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
