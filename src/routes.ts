/**
 * Connection exact Fetch routes for the browser half.
 * @module dsh-wsl-keepalive/routes
 */

import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type { KeepAliveService } from './service.ts'
import { validateWslPath } from './validate.ts'

export const API_PREFIX = '/api/wsl-keepalive'

/** The /set body is a single boolean field; anything larger is refused. */
const MAX_SET_BODY_BYTES = 1024
/** The /validate body is one path string; bound it well below the global cap. */
const MAX_VALIDATE_BODY_BYTES = 8192

type JsonRead =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/**
 * Read a JSON body with a route-local byte cap.
 * @param request - exact Fetch request.
 * @param limit - maximum UTF-8 bytes accepted.
 * @returns parsed JSON, or the refusal status.
 */
async function readJson(request: Request, limit: number): Promise<JsonRead> {
  const declared = request.headers.get('content-length')
  if (declared !== null) {
    const length = Number(declared)
    if (!Number.isFinite(length) || length < 0) return { ok: false, status: 400 }
    if (length > limit) {
      await request.body?.cancel().catch(() => {})
      return { ok: false, status: 413 }
    }
  }
  if (request.body === null) return { ok: false, status: 400 }
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => {})
        return { ok: false, status: 413 }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, status: 400 }
  }
  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400 }
  }
}

/** Build the status/set/validate route family. */
export function makeRoutes(service: KeepAliveService): ConnectionFetchRoute[] {
  return [
    {
      path: API_PREFIX + '/status',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (): Promise<Response> => json(200, await service.status()),
    },
    {
      path: API_PREFIX + '/set',
      methods: ['POST'],
      requestBody: 'streaming',
      fetch: async (request: Request): Promise<Response> => {
        const read = await readJson(request, MAX_SET_BODY_BYTES)
        if (!read.ok) {
          return json(read.status, { errorCode: read.status === 413 ? 'payloadTooLarge' : 'badRequest' })
        }
        const body = read.value as { enabled?: unknown }
        if (body === null || typeof body !== 'object' || typeof body.enabled !== 'boolean') {
          return json(400, { errorCode: 'badRequest' })
        }
        return json(200, await service.set(body.enabled))
      },
    },
    {
      path: API_PREFIX + '/validate',
      methods: ['POST'],
      requestBody: 'streaming',
      fetch: async (request: Request): Promise<Response> => {
        const read = await readJson(request, MAX_VALIDATE_BODY_BYTES)
        if (!read.ok) {
          return json(read.status, { errorCode: read.status === 413 ? 'payloadTooLarge' : 'badRequest' })
        }
        const body = read.value as { wslExecPath?: unknown }
        if (body === null || typeof body !== 'object' || typeof body.wslExecPath !== 'string') {
          return json(400, { errorCode: 'badRequest' })
        }
        return json(200, await validateWslPath(body.wslExecPath))
      },
    },
  ]
}
