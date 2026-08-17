/**
 * wsl-keepalive host half — mounts the keep-alive service and the /api/wsl-keepalive/* HTTP routes.
 * The browser half (./client entry) reads/toggles keep-alive state through these same-origin JSON endpoints.
 * Communication mechanism: static plugins cannot use the dynamic plugin's harness.handle/host.call,
 * so the Host registers HTTP routes + the Client uses fetch (the same pattern as dsh-balance-meter's /api/balance).
 * @module wsl-keepalive
 */

import type { ContextLike, WebServerLike } from './types.ts'
import { KeepAliveService, type KeepAliveConfig } from './service.ts'
import { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

export { KeepAliveService } from './service.ts'
export type { KeepAliveConfig, KeepAliveStatus } from './service.ts'
export { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

/** Stable cordis plugin name (matches the cordis.patch.yml insert id). */
export const name = 'wsl-keepalive'

/** Services that must be ready before mounting. */
export const inject = ['webServer']

/**
 * Registers the keep-alive service and its API routes.
 * Environment gate note: this plugin is only meaningful in a WSL environment. At mount time the
 * service runs a WSL check inside `init()`; outside WSL it is refused into an error state — every
 * /api/wsl-keepalive/* call returns that refusal reason (visible in the settings UI as
 * "Unavailable: not a WSL environment..."), and a clear hint is printed to the service log.
 * The routes are kept (rather than fully unmounted) so the browser half can retrieve and display
 * the refusal reason.
 */
export function apply(ctx: ContextLike, config: KeepAliveConfig = {}): void {
  const service = new KeepAliveService(ctx, config)

  const webServer = ctx.get('webServer') as WebServerLike | undefined
  if (webServer === undefined) return

  const routes = makeKeepAliveRoutes(service)
  ctx.effect(
    () => {
      const disposers: Array<() => unknown> = []
      for (const route of routes) {
        const dispose = webServer.register(route)
        if (typeof dispose === 'function') disposers.push(dispose as () => unknown)
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
    'wsl-keepalive: routes',
  )
}
