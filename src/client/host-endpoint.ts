/**
 * wsl-keepalive browser transport — one same-origin JSON fetch plus the
 * classification of its failure modes, deliberately kept out of the component
 * so the distinction is testable on its own.
 *
 * The settings page must never conflate two very different situations:
 *
 * - `endpoint` — the browser could not reach `/api/wsl-keepalive/*` at all: the
 *   host serves no such route (this shell provides no HTTP carrier, or the
 *   plugin row is inactive in this profile) or the transport itself failed.
 *   The plugin may be perfectly healthy; the wiring is what is missing.
 * - `host` — the request arrived and the Host answered, either with a
 *   structured refusal ("not a WSL environment") or with a failed command.
 *
 * A 404 is the obvious `endpoint` case, but the shipped Web composition answers
 * unknown paths with the SPA fallback instead: `index.html` and HTTP 200. A
 * missing content-type is therefore classified exactly like a 404 rather than
 * being handed to `response.json()` to explode.
 *
 * The codes are keys of this plugin's dictionary (`./i18n.ts`); this module
 * never produces user-facing English.
 * @module wsl-keepalive/client/host-endpoint
 */

/** Stable localization codes owned by this module's callers' dictionary. */
export type HostRequestCode = 'errEndpointMissing' | 'errTransportFailed' | 'errHostError'

/**
 * The two failure families described in the module note. `endpoint` points at
 * the wiring, `host` at the environment or the command.
 */
export type HostFailureKind = 'endpoint' | 'host'

/** A failed same-origin request, already classified and localizable. */
export class HostRequestError extends Error {
  /**
   * @param code - dictionary key describing the failure.
   * @param params - template params for `code`.
   * @param kind - which of the two families the failure belongs to.
   * @param detail - raw technical detail (path + status / transport message).
   */
  constructor(
    readonly code: HostRequestCode,
    readonly params: Record<string, string>,
    readonly kind: HostFailureKind,
    detail: string,
  ) {
    super(detail)
    this.name = 'HostRequestError'
  }
}

/**
 * Fetch a same-origin JSON endpoint and classify every failure mode.
 * @param path - same-origin path of the keep-alive endpoint.
 * @param init - optional fetch init (method/body for the POST endpoints).
 * @returns the parsed JSON body.
 * @throws {HostRequestError} for a transport rejection, an error status, or a
 * non-JSON body; never a bare `Error`, so callers can localize without parsing
 * messages.
 */
export async function keepAliveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch (error) {
    const detail = String((error as Error | undefined)?.message ?? error)
    throw new HostRequestError('errTransportFailed', { detail }, 'endpoint', `wsl-keepalive ${path}: ${detail}`)
  }
  if (!response.ok) {
    // 404/405 means the route is not registered; anything else is the host
    // answering with a failure, which is a different problem with a different
    // fix.
    const code: HostRequestCode = response.status === 404 || response.status === 405 ? 'errEndpointMissing' : 'errHostError'
    const kind: HostFailureKind = code === 'errEndpointMissing' ? 'endpoint' : 'host'
    throw new HostRequestError(code, { status: String(response.status) }, kind, `wsl-keepalive ${path}: HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const status = `${response.status} ${contentType || '(no content-type)'}`
    throw new HostRequestError('errEndpointMissing', { status }, 'endpoint', `wsl-keepalive ${path}: ${status}`)
  }
  return (await response.json()) as T
}

/**
 * True when `code` names a key this plugin's own dictionary owns, so an
 * unknown code from a newer host degrades to its raw detail instead of
 * rendering a bare key.
 * @param code - candidate code from a Host payload.
 * @param dictionary - the plugin's fallback dictionary.
 * @returns whether `code` is one of the dictionary's own keys.
 */
export function ownsCode(code: string | null | undefined, dictionary: Record<string, string>): boolean {
  return code !== null && code !== undefined && Object.prototype.hasOwnProperty.call(dictionary, code)
}
