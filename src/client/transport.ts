/**
 * Same-origin JSON transport and failure classification.
 * @module dsh-wsl-keepalive/client/transport
 */

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
  defaultDistro: string | null
  targets: TargetStatus[]
  errorCode: string | null
  errorParams: Record<string, string> | null
  error: string | null
}

/** Host verdict for one candidate wsl.exe path. */
export interface WslPathValidation {
  ok: boolean
  path: string
  errorCode: string | null
  detail: string | null
}

export type FailureKind = 'endpoint' | 'host'

export class RequestError extends Error {
  constructor(
    readonly code: 'endpointMissing' | 'transportFailed' | 'hostError',
    readonly kind: FailureKind,
    detail: string,
  ) {
    super(detail)
    this.name = 'RequestError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch (error) {
    const detail = String((error as Error | undefined)?.message ?? error)
    throw new RequestError('transportFailed', 'endpoint', detail)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    throw new RequestError('endpointMissing', 'endpoint', 'HTTP ' + String(response.status))
  }
  if (!response.ok) {
    throw new RequestError(response.status === 404 || response.status === 405 ? 'endpointMissing' : 'hostError', response.status === 404 || response.status === 405 ? 'endpoint' : 'host', 'HTTP ' + String(response.status))
  }
  return await response.json() as T
}

export function getStatus(): Promise<KeepAliveStatus> {
  return request<KeepAliveStatus>('/api/wsl-keepalive/status')
}

export function setEnabled(enabled: boolean): Promise<KeepAliveStatus> {
  return request<KeepAliveStatus>('/api/wsl-keepalive/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

/** Resolve and probe a candidate wsl.exe path before the form writes it. */
export function validateWslPath(wslExecPath: string): Promise<WslPathValidation> {
  return request<WslPathValidation>('/api/wsl-keepalive/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wslExecPath }),
  })
}