/**
 * wsl-keepalive host half — mounts the keep-alive service and the /api/wsl-keepalive/* HTTP routes.
 * The browser half (./client entry) reads/toggles keep-alive state through these same-origin JSON endpoints.
 * Communication mechanism: static plugins cannot use the dynamic plugin's harness.handle/host.call,
 * so the Host registers HTTP routes + the Client uses fetch (same pattern as dsh-balance-meter's /api/balance).
 *
 * Route registration follows the documented host-route pattern: the row does
 * NOT hard-inject `webServer` (that would make the row `pending` and break the
 * web boot). Instead `apply` reads the route carrier with `ctx.get('webServer')`
 * (new key, with an `httpServer` fallback for the pre-rc.2 rename), registers
 * the routes inside a `ctx.effect`, and — because the carrier may bind *after*
 * `apply` — listens to the `internal/service` event to register as soon as it
 * appears. The keep-alive commands/config run on the host plane directly via
 * Node's own `child_process`/`fs` (inside the service), not the model-facing
 * `ctx.shell`/`ctx.fs` services. The Client half is mounted by the same
 * `dsh.client` declaration in package.json.
 * @module wsl-keepalive
 */

import { Context } from '@deepseek-ai/cordis'
// Module augmentations: importing the exported types registers `ctx.webServer`,
// `ctx.shell`, and `ctx.fs` on the cordis Context so references type-check.
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

/**
 * No top-level service dependency: the row activates unconditionally so it can
 * never be left `pending` and break the web boot. The web route carrier is read
 * inside apply via `ctx.get('webServer')` (documented host-route pattern) and
 * re-registered on the `internal/service` event if it binds after apply.
 */
export const inject: string[] = []

/** The minimal route-registration surface of the web server carrier. */
type RouteHost = { register(route: WebRoute): () => void }

/**
 * Registers the keep-alive service and its API routes.
 * Environment gate note: this plugin is only meaningful in a WSL environment. On
 * first use the service runs a WSL check inside `init()`; outside WSL it is
 * refused into an error state — every /api/wsl-keepalive/* call returns that
 * refusal reason (visible in the settings UI as "Unavailable: not a WSL
 * environment..."), and a clear hint is printed to the service log. The routes
 * are kept so the browser half can retrieve and display the refusal reason.
 */
export function apply(ctx: Context, config: KeepAliveConfig = {}): void {
  // The service is host-plane self-contained (runs commands/fs via Node
  // primitives), so it takes no injected harness service.
  const service = new KeepAliveService(config)
  const routes: WebRoute[] = makeKeepAliveRoutes(service)

  // `registered` guards against registering twice (once from the synchronous
  // attempt and again from the late-binding `internal/service` listener).
  let registered = false
  const registerRoutes = (): void => {
    if (registered) return
    const web = (ctx.get('webServer') ?? ctx.get('httpServer')) as RouteHost | undefined
    if (web === undefined) return
    registered = true
    ctx.effect(
      () => {
        const disposers = new Set<() => void>()
        for (const route of routes) {
          disposers.add(web.register(route))
        }
        return () => {
          for (const dispose of disposers) dispose()
        }
      },
      'wsl-keepalive: routes',
    )
  }

  // Try immediately (the carrier may already be bound), and re-register if it
  // binds after apply. ctx.get reads without the inject requirement, so this
  // row never waits pending.
  registerRoutes()
  ctx.on('internal/service', (serviceName: unknown) => {
    if (serviceName === 'webServer' || serviceName === 'httpServer') registerRoutes()
  })
}
