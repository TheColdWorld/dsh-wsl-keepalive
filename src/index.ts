/**
 * wsl-keepalive host half — mounts the keep-alive service and the /api/wsl-keepalive/* HTTP routes.
 * The browser half (./client entry) reads/toggles keep-alive state through these same-origin JSON endpoints.
 * Communication mechanism: static plugins cannot use the dynamic plugin's harness.handle/host.call,
 * so the Host registers HTTP routes + the Client uses fetch (the same pattern as dsh-balance-meter's /api/balance).
 *
 * Service references are explicit: `webServer`, `shell`, and `fs` are pulled from the real
 * `@deepseek-ai/*` contracts that augment the cordis `Context` (instead of a string-keyed
 * `ctx.get('...')` cast against a local structural stub). The Client half is mounted by the
 * same `dsh.client` declaration in package.json.
 * @module wsl-keepalive
 */

import { Context } from '@deepseek-ai/cordis'
// Module augmentations: importing the exported types registers `ctx.webServer`,
// `ctx.shell`, and `ctx.fs` on the cordis Context so the references are type-checked
// and explicit rather than `ctx.get('<name>')` string casts.
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-fs'
import { KeepAliveService, type KeepAliveConfig } from './service.ts'
import { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

export { KeepAliveService } from './service.ts'
export type { KeepAliveConfig, KeepAliveStatus } from './service.ts'
export { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

/** Stable cordis plugin name (matches the cordis.patch.yml insert id). */
export const name = 'wsl-keepalive'

/** Services that must be ready before mounting. */
export const inject = ['webServer', 'shell', 'fs']

/**
 * Registers the keep-alive service and its API routes.
 * Environment gate note: this plugin is only meaningful in a WSL environment. At mount time the
 * service runs a WSL check inside `init()`; outside WSL it is refused into an error state — every
 * /api/wsl-keepalive/* call returns that refusal reason (visible in the settings UI as
 * "Unavailable: not a WSL environment..."), and a clear hint is printed to the service log.
 * The routes are kept (rather than fully unmounted) so the browser half can retrieve and display
 * the refusal reason.
 */
export function apply(ctx: Context, config: KeepAliveConfig = {}): void {
  const service = new KeepAliveService(ctx, config)

  // `ctx.webServer` is a hard dependency declared above (inject); the real WebServer
  // type (from @deepseek-ai/dsh-host-webserver) is in force here.
  const webServer = ctx.webServer
  const routes: WebRoute[] = makeKeepAliveRoutes(service)

  ctx.effect(
    () => {
      const disposers = new Set<() => void>()
      for (const route of routes) {
        disposers.add(webServer.register(route))
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
    'wsl-keepalive: routes',
  )
}
