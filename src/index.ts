/**
 * dsh-wsl-keepalive Host half: one row mounts the host-selected keep-alive
 * service, its authenticated Connection Fetch routes, and the settings policy.
 * @module dsh-wsl-keepalive
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-settings'
import { KeepAliveService } from './core/service.ts'
import { makeRoutes } from './core/routes.ts'
import { normalizeSettings, type LegacyTarget } from './core/migrate.ts'
import type { DistroTarget } from './core/types.ts'
import { createHostService } from './hosts/index.ts'

export type { DistroTarget, KeepAliveStatus, TargetStatus } from './core/types.ts'
export { KeepAliveService } from './core/service.ts'
export { API_PREFIX, makeRoutes } from './core/routes.ts'

export const name = 'wsl-keepalive'
export const inject: string[] = []

export interface Config {
  keepDefault: Volatile<boolean>
  targets: Volatile<readonly DistroTarget[]>
  preferredWslExec: Volatile<string>
}

/** Reject control characters that could forge tooltip lines or crash argv. */
const PRINTABLE = /^[^\u0000-\u001f\u007f]*$/

export const Config = z.object({
  keepDefault: z.boolean().default(true).volatile(),
  targets: z.array(z.object({
    name: z.string().max(128).pattern(PRINTABLE).default(''),
    user: z.string().max(128).pattern(PRINTABLE).default(''),
    /** 0.3.0 compatibility; ignored after normalizeSettings(). */
    distro: z.string().max(128).pattern(PRINTABLE).default(''),
    userName: z.string().max(128).pattern(PRINTABLE).default(''),
    wslExecPath: z.string().max(4096).pattern(PRINTABLE).default(''),
  })).default([]).volatile(),
  preferredWslExec: z.string().max(4096).pattern(PRINTABLE).default('').volatile(),
}) as unknown as z<Config>

export function apply(ctx: Context, config: Config): void {
  const host = createHostService(process.platform)
  if (host.kind === 'unsupported') {
    ctx.logger.info('wsl-keepalive: this Host is not WSL or Windows; keep-alive is unavailable')
  }
  const readSettings = () => normalizeSettings({
    targets: config.targets.get() as unknown as readonly LegacyTarget[],
    keepDefault: config.keepDefault.get(),
    preferredWslExec: config.preferredWslExec.get(),
  })
  const initial = readSettings()
  for (const warning of initial.warnings) ctx.logger.warn(warning)

  const service = new KeepAliveService(
    host,
    readSettings,
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

  if (host.kind !== 'unsupported') {
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.effect(
        () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
        'wsl-keepalive: settings page policy',
      )
    })
  }
}
