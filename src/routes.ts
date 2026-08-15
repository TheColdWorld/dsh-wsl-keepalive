/**
 * wsl-keepalive HTTP 路由 — 浏览器半边通过同源 JSON 端点与 Host 通信：
 * GET  /api/wsl-keepalive/status — 查询状态（running/PID/发行版）
 * POST /api/wsl-keepalive/set    — body { enabled: boolean } 切换保活
 * 不 import node:http，只用本地最小结构类型。
 * @module wsl-keepalive/routes
 */

import type { IncomingMessageLike, ServerResponseLike, WebRouteLike } from './types.ts'
import type { KeepAliveService } from './service.ts'

/** 浏览器端 API 基路径。 */
export const KEEPALIVE_API_PREFIX = '/api/wsl-keepalive'

/** 写一条 JSON 响应。 */
function json(res: ServerResponseLike, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** 校验方法，不匹配则回 405。 */
function requireMethod(req: IncomingMessageLike, res: ServerResponseLike, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** 读取请求体（小 JSON）。 */
function readBody(req: IncomingMessageLike): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: unknown) => { body += String(chunk) })
    req.on('end', () => resolve(body))
    req.on('error', (error: unknown) => reject(error))
  })
}

/** 构建完整的保活路由族。 */
export function makeKeepAliveRoutes(service: KeepAliveService): WebRouteLike[] {
  return [
    {
      kind: 'exact',
      path: `${KEEPALIVE_API_PREFIX}/status`,
      handler: (req: IncomingMessageLike, res: ServerResponseLike): void => {
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
      handler: (req: IncomingMessageLike, res: ServerResponseLike): void => {
        if (!requireMethod(req, res, 'POST')) return
        readBody(req).then((body) => {
          let enabled = false
          try {
            const parsed = JSON.parse(body || '{}') as { enabled?: unknown }
            enabled = parsed.enabled === true
          } catch {
            // 忽略坏 JSON，按关闭处理
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
