/**
 * wsl-keepalive host half — mounts the keep-alive service, its authenticated
 * `/api/wsl-keepalive/*` Connection Fetch routes, and the settings-page policy.
 * The browser half (./client entry) is discovered from package.json's
 * `dsh.client` declaration and is configured through the Plugins page.
 *
 * Configuration: the row declares Volatile Config fields, so the settings
 * service projects an editable form under this entry's id and the client half
 * binds it with `ctx.configForms.get('wsl-keepalive')`. Changes persist through
 * the active profile's Cordis patch, not a plugin-private file.
 *
 * Transport: the routes are Connection exact Fetch routes (optional carrier).
 * The row does NOT declare `connection` in its static `inject`, so it can never
 * be left `pending` on a non-HTTP shell; the carrier is acquired with
 * `ctx.inject(['connection'], ...)` and the registration lives in that child
 * fiber's `ctx.effect`, so it is removed when the carrier unloads.
 *
 * Command execution runs on the host plane directly via Node's own
 * `child_process` (inside the service), not the model-facing
 * `ctx.shell`/`ctx.fs` services.
 * @module wsl-keepalive
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
// Type-only: the `ctx.connection` Context merge and the ConnectionFetchRoute type.
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
// Type-only: the `ctx.settings` Context merge (page policy).
import type {} from '@deepseek-ai/dsh-settings'
import { KeepAliveService, type KeepAliveConfigRefs } from './service.ts'
import { makeKeepAliveRoutes } from './routes.ts'
import { migrateLegacyConfig } from './migrate.ts'

export { KeepAliveService } from './service.ts'
export type { KeepAliveConfigRefs, KeepAliveStatus } from './service.ts'
export { KEEPALIVE_API_PREFIX, makeKeepAliveRoutes } from './routes.ts'

/** Stable cordis plugin name (matches the cordis.patch.yml insert id). */
export const name = 'wsl-keepalive'

/**
 * No top-level service dependency: the row activates unconditionally so it can
 * never be left `pending`. The optional `connection` (and `settings`) carriers
 * are acquired inside apply through `ctx.inject([...], ...)`.
 */
export const inject: string[] = []

/** Row configuration, projected as an editable form by the settings service. */
export interface Config {
  /** Target WSL distro name; empty uses the default distro. */
  wslDistName: Volatile<string>
  /** User inside the target distro; empty uses the distro default. */
  wslUserName: Volatile<string>
  /** Absolute path to wsl.exe; empty auto-detects the fallback path. */
  wslExecPath: Volatile<string>
}

/** Schemastery schema; every field is Volatile so the settings form can edit it. */
export const Config = z.object({
  wslDistName: z.string().default('').volatile(),
  wslUserName: z.string().default('').volatile(),
  wslExecPath: z.string().default('').volatile(),
})

/**
 * Registers the keep-alive service, its API routes, and the page policy.
 * Environment gate: this plugin is only meaningful in a WSL environment. On
 * first use the service runs a WSL check inside `init()`; outside WSL it is
 * refused into an error state, every endpoint returns that refusal, and a hint
 * is printed to the service log.
 * @param ctx - the host plugin context.
 * @param config - the row's projected Volatile Config.
 */
export function apply(ctx: Context, config: Config): void {
  const service = new KeepAliveService(config as KeepAliveConfigRefs)
  const routes: ConnectionFetchRoute[] = makeKeepAliveRoutes(service)
  // Acquire the optional carrier; registering from its fiber ties the routes to
  // the carrier lifetime and never makes this row pending.
  ctx.inject(['connection'], (carrierCtx) => {
    carrierCtx.effect(() => {
      const disposers = routes.map(route => carrierCtx.connection.fetch.register(route))
      return () => {
        for (const dispose of disposers) void dispose()
      }
    }, 'wsl-keepalive: fetch routes')
  })

  // This package ships its own Plugins-page form; suppress the generated one.
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'wsl-keepalive: settings page policy',
    )
    // One-time import of the pre-0.2.0 ~/.dsh/wsl-keepalive.json.
    settingsCtx.effect(() => {
      const current: Record<string, string> = {
        wslDistName: config.wslDistName.get(),
        wslUserName: config.wslUserName.get(),
        wslExecPath: config.wslExecPath.get(),
      }
      void migrateLegacyConfig(
        { update: (ns, patch) => settingsCtx.settings.update(ns, patch) },
        current,
        name,
      ).then((fields) => {
        if (fields.length > 0) console.log('[wsl-keepalive] imported legacy config fields:', fields.join(', '))
      })
      return () => {}
    }, 'wsl-keepalive: legacy config import')
  })
}
