/**
 * wsl-keepalive HTTP endpoints — registered as Connection exact Fetch routes on
 * the authenticated `/api` bridge.
 *
 * The browser half reads/toggles keep-alive state through same-origin JSON:
 * GET  /api/wsl-keepalive/status — query status (running/PID/distro)
 * POST /api/wsl-keepalive/set    — body { enabled: boolean } toggles keep-alive
 *
 * The typed Remote API is not available to a package outside the DSH checkout
 * (its Client contribution requires generated strict codecs and an explicit
 * `api-remotes` assembly import), so the endpoints are feature-owned exact
 * Fetch routes. Registering through `ctx.connection.fetch` puts them behind
 * Connection's Host/Origin and browser-session checks — the same fence the
 * shared `/api` handler applies — unlike a raw `webServer` route.
 * Configuration is not served here: the Plugins page's own settings form writes
 * the row's Volatile Config through the settings service.
 * @module wsl-keepalive/routes
 */

import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type { KeepAliveService } from './service.ts'

/** API base path for the browser side. */
export const KEEPALIVE_API_PREFIX = '/api/wsl-keepalive'

/** Build a JSON response. */
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Build the full keep-alive route family. */
export function makeKeepAliveRoutes(service: KeepAliveService): ConnectionFetchRoute[] {
  return [
    {
      path: `${KEEPALIVE_API_PREFIX}/status`,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (): Promise<Response> => json(200, await service.status()),
    },
    {
      path: `${KEEPALIVE_API_PREFIX}/set`,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request: Request): Promise<Response> => {
        let enabled = false
        try {
          const parsed = await request.json() as { enabled?: unknown }
          enabled = parsed.enabled === true
        } catch {
          // malformed JSON: treat as disabled
        }
        return json(200, await service.set(enabled))
      },
    },
  ]
}
