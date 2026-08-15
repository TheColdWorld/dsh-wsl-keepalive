/**
 * wsl-keepalive host half — 挂载保活服务与 /api/wsl-keepalive/* HTTP 路由。
 * 浏览器半边（./client 入口）通过同源 JSON 端点读取/切换保活状态。
 * 通信机制：静态插件无法使用动态插件的 harness.handle/host.call，
 * 故改用 Host 注册 HTTP 路由 + Client fetch（与 dsh-balance-meter 的 /api/balance 同模式）。
 * @module wsl-keepalive
 */

import type { ContextLike, WebServerLike } from './types.ts'
import { KeepAliveService, type KeepAliveConfig } from './service.ts'
import { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

export { KeepAliveService } from './service.ts'
export type { KeepAliveConfig, KeepAliveStatus } from './service.ts'
export { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

/** 稳定的 cordis 插件名（与 cordis.patch.yml insert id 一致）。 */
export const name = 'wsl-keepalive'

/** 挂载前必须就绪的服务。 */
export const inject = ['webServer']

/** 注册保活服务与其 API 路由。 */
export function apply(ctx: ContextLike, config: KeepAliveConfig = {}): void {
  const service = new KeepAliveService(ctx, config)

  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (webServer === undefined) return

  const routes = makeKeepAliveRoutes(service)
  ctx.effect(
    () => {
      const disposers = routes.map((route) => webServer.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
    'wsl-keepalive: routes',
  )
}
