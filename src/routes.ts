/**
 * wsl-keepalive HTTP routes — the browser half communicates with the Host
 * through same-origin JSON endpoints:
 * GET  /api/wsl-keepalive/status — query status (running/PID/distro)
 * POST /api/wsl-keepalive/set    — body { enabled: boolean } toggles keep-alive
 * GET  /api/wsl-keepalive/config — read the command config (distro/user/wsl.exe)
 * POST /api/wsl-keepalive/config — body { distName?, userName?, wslExecPath? }
 *                                  validates each present field at runtime and
 *                                  persists to disk only on full success
 *
 * The web server dispatches on (kind, path) only — a route has no `method`
 * field and a duplicate (kind, path) throws — so the config GET and POST share
 * one exact route whose handler branches on `req.method`.
 *
 * The route shape is the real `WebRoute` from `@deepseek-ai/dsh-host-webserver`
 * (an explicit reference, no local structural stub).
 * @module wsl-keepalive/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { KeepAliveService, KeepAliveConfigUpdate } from './service.ts'

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

/** Errors serialized into a stable `{ ok:false, error }` shape. */
function errorJson(res: ServerResponse, status: number, error: unknown): void {
  json(res, status, { ok: false, error: error instanceof Error ? error.message : String(error) })
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
          (error) => errorJson(res, 500, error),
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
          (error) => errorJson(res, 500, error),
        )
      },
    },
    {
      kind: 'exact',
      path: `${KEEPALIVE_API_PREFIX}/config`,
      handler: (req: IncomingMessage, res: ServerResponse): void => {
        // One route owns both methods; dispatch on the request method.
        if (req.method === 'GET') {
          Promise.resolve(service.getConfig()).then(
            (value) => json(res, 200, { ok: true, config: value }),
            (error) => errorJson(res, 500, error),
          )
          return
        }
        if (req.method === 'POST') {
          readBody(req).then((body) => {
            let update: KeepAliveConfigUpdate = {}
            try {
              const parsed = JSON.parse(body || '{}') as Record<string, unknown>
              if (typeof parsed.distName === 'string') update.distName = parsed.distName
              if (typeof parsed.userName === 'string') update.userName = parsed.userName
              if (typeof parsed.wslExecPath === 'string') update.wslExecPath = parsed.wslExecPath
            } catch {
              // ignore malformed JSON — treat as an empty update (no-op, reads back current config)
            }
            return service.updateConfig(update)
          }).then(
            (value) => json(res, 200, value),
            (error) => errorJson(res, 500, error),
          )
          return
        }
        json(res, 405, { ok: false, error: 'method-not-allowed' })
      },
    },
  ]
}
