/**
 * wsl-keepalive HTTP routes — the browser half communicates with the Host
 * through same-origin JSON endpoints:
 * GET  /api/wsl-keepalive/status — query status (running/PID/distro)
 * POST /api/wsl-keepalive/set    — body { enabled: boolean } toggles keep-alive
 * The route shape is the real `WebRoute` from `@deepseek-ai/dsh-host-webserver`
 * (an explicit reference, no local structural stub).
 * @module wsl-keepalive/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { KeepAliveService } from './service.ts'

/** API base path for the browser side. */
export const KEEPALIVE_API_PREFIX = '/api/wsl-keepalive'

/** Write a JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Validate the request method; reply 405 on mismatch. */
function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** Read the request body (small JSON). */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: unknown) => { body += String(chunk) })
    req.on('end', () => resolve(body))
    req.on('error', (error: unknown) => reject(error))
  })
}

/** Build the full keep-alive route family. */
export function makeKeepAliveRoutes(service: KeepAliveService): WebRoute[] {
  return [
    {
      kind: 'exact',
      path: `${KEEPALIVE_API_PREFIX}/status`,
      handler: (req: IncomingMessage, res: ServerResponse): void => {
        if (!requireMethod(req, res, 'GET')) return
        Promise.resolve(service.status()).then(
          (value) => json(res, 200, value),
          (error) => json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
        )
      },
    },
    {
      kind: 'exact',
      path: `${KEEPALIVE_API_PREFIX}/set`,
      handler: (req: IncomingMessage, res: ServerResponse): void => {
        if (!requireMethod(req, res, 'POST')) return
        readBody(req).then((body) => {
          let enabled = false
          try {
            const parsed = JSON.parse(body || '{}') as { enabled?: unknown }
            enabled = parsed.enabled === true
          } catch {
            // ignore malformed JSON, treat as disabled
          }
          return service.set(enabled)
        }).then(
          (value) => json(res, 200, value),
          (error) => json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }),
        )
      },
    },
  ]
}
