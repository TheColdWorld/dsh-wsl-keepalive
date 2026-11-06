/**
 * dsh-wsl-keepalive Host half: one row mounts the multi-distro keep-alive
 * service, its authenticated Connection Fetch routes, and the settings policy.
 * @module dsh-wsl-keepalive
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import { KeepAliveService } from './service.ts'
import { makeRoutes } from './routes.ts'
import type { DistroTarget } from './types.ts'

export type { DistroTarget, KeepAliveStatus, TargetStatus } from './types.ts'
export { KeepAliveService } from './service.ts'
export { API_PREFIX, makeRoutes } from './routes.ts'

export const name = 'wsl-keepalive'
export const inject: string[] = []

export interface Config {
  targets: Volatile<readonly DistroTarget[]>
  /** Keep the distro that runs this DSH process alive even when it is not listed. */
  keepDefault: Volatile<boolean>
}

/** Reject control characters that could forge tooltip lines or crash argv. */
const PRINTABLE = /^[^\u0000-\u001f\u007f]*$/
/** Empty means auto-detect; every explicit path must already be absolute. */
const ABSOLUTE_PATH = /^(?:$|\/)[^\u0000-\u001f\u007f]*$/

export const Config = z.object({
  targets: z.array(z.object({
    distro: z.string().max(128).pattern(PRINTABLE).default(''),
    userName: z.string().max(128).pattern(PRINTABLE).default(''),
    wslExecPath: z.string().max(4096).pattern(ABSOLUTE_PATH).default(''),
  })).default([]).volatile(),
  keepDefault: z.boolean().default(true).volatile(),
}) as unknown as z<Config>

export function apply(ctx: Context, config: Config): void {
  const service = new KeepAliveService(
    () => ({ targets: config.targets.get(), keepDefault: config.keepDefault.get() }),
    { warn: (message: string) => { ctx.logger.warn(message) } },
  )
  const routes: ConnectionFetchRoute[] = makeRoutes(service)
  ctx.effect(() => () => service.dispose(), 'wsl-keepalive: child cleanup')

  ctx.inject(['connection'], (carrierCtx) => {
    carrierCtx.effect(() => {
      const disposers = routes.map((route) => carrierCtx.connection.fetch.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'wsl-keepalive: fetch routes')
  })

  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'wsl-keepalive: settings page policy',
    )
  })
}