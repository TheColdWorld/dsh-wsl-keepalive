/**
 * wsl-keepalive host half — mounts the keep-alive service and the /api/wsl-keepalive/* HTTP routes.
 * The browser half (./client entry) reads/toggles keep-alive state through these same-origin JSON endpoints.
 * Communication mechanism: static plugins cannot use the dynamic plugin's harness.handle/host.call,
 * so the Host registers HTTP routes + the Client uses fetch (same pattern as dsh-balance-meter's /api/balance).
 *
 * Route registration follows the DSH >= 0.1.5 host-route pattern for an
 * *optional* carrier: the row does NOT declare `webServer` in its static
 * `inject` (that would leave the row `pending` and fail the boot activation
 * audit). DSH 0.1.5 made the HTTP carrier optional — non-HTTP shells (Electron,
 * worker carriers) load the same client stack without it — so the carrier is
 * acquired with `ctx.inject(['webServer'], ...)` and the routes are registered
 * from that child fiber, exactly like `dsh-client-connection`'s `/api` route.
 * The child fiber runs as soon as the carrier is available — a microtask after
 * this row when it is already bound, later when it binds afterwards — and its
 * `ctx.effect` owns the registration, so the routes are removed when the
 * carrier unloads and rebuilt when it returns. With no carrier the row still
 * activates and every `/api/wsl-keepalive/*` call simply 404s.
 *
 * Do NOT read `ctx.webServer` on this row's own context: cordis 4 throws
 * `cannot get property "webServer" without inject` for an undeclared service
 * property (verified against the shipped cordis 4.0.2 build), which is why the
 * registration lives entirely inside the injected child fiber. `ctx.get(...)`
 * would read without inject, but it hands back only a value: the registration
 * would then be owned by this row's fiber and would neither be removed with
 * the carrier nor rebuilt if the carrier were replaced.
 *
 * The keep-alive commands/config run on the host plane directly via Node's own
 * `child_process`/`fs` (inside the service), not the model-facing
 * `ctx.shell`/`ctx.fs` services. The Client half is mounted by the same
 * `dsh.client` declaration in package.json.
 * @module wsl-keepalive
 */

import { Context } from '@deepseek-ai/cordis'
// The `WebRoute` type import is the only Host-plane contract this half needs:
// it also pulls in `@deepseek-ai/dsh-host-webserver`'s `declare module`
// augmentation, which is what makes `ctx.webServer` a typed property. No
// `dsh-shell`/`dsh-fs` augmentation is imported (see the module note above):
// this plugin never reads `ctx.shell`/`ctx.fs`.
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { KeepAliveService, type KeepAliveConfig } from './service.ts'
import { makeKeepAliveRoutes } from './routes.ts'

export { KeepAliveService } from './service.ts'
export type { KeepAliveConfig, KeepAliveStatus } from './service.ts'
export { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

/** Stable cordis plugin name (matches the cordis.patch.yml insert id). */
export const name = 'wsl-keepalive'

/**
 * No top-level service dependency: the row activates unconditionally so it can
 * never be left `pending` and break the web boot. The optional `webServer`
 * carrier is acquired inside apply through `ctx.inject(['webServer'], ...)`
 * (DSH >= 0.1.5 pattern for a carrier that may be absent or bind late).
 */
export const inject: string[] = []

/**
 * Register every route inside the carrier fiber's effect. `effect` ties the
 * route disposers to that fiber, so an unloading carrier removes its own
 * routes and a re-provided one registers a fresh set.
 * @param carrierCtx - context whose fiber declares `webServer` in its inject
 * (the `ctx.inject(['webServer'], ...)` child scope) — the declaration is what
 * makes the `webServer` property access legal in cordis 4.
 * @param routes - the route family to publish.
 */
function registerRoutes(carrierCtx: Context, routes: readonly WebRoute[]): void {
  carrierCtx.effect(
    () => {
      const disposers = routes.map(route => carrierCtx.webServer.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    },
    'wsl-keepalive: routes',
  )
}

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

  // Acquire the optional carrier and register from its fiber. `ctx.inject`
  // creates a child fiber (never making this row `pending`) that runs once
  // `webServer` exists — already bound or bound later — and unloads when the
  // carrier goes away, taking the routes with it.
  ctx.inject(['webServer'], (carrierCtx) => { registerRoutes(carrierCtx, routes) })
}
