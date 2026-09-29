/**
 * wsl-keepalive browser half — registers the plugin's own configuration page
 * on the Plugins page (`plugins.row.config`, keyed by
 * `<bundle package>#<row id>`). The page binds the row's Volatile Config
 * through `ctx.configForms` and reads/toggles keep-alive state through the
 * same-origin /api/wsl-keepalive/* Connection Fetch routes.
 *
 * Service references are explicit: the client scope's `slots`, `locale`, and
 * `configForms` come from the real @deepseek-ai/* client contracts that augment
 * the cordis Context.
 *
 * Localization follows the official DSH pattern: the dictionary is registered
 * with `ctx.locale.register('wsl-keepalive', …)` and the slot entry declares
 * `locale: 'wsl-keepalive'`, so the renderer injects a `t` seat into the
 * component and re-derives it (new function reference) on every language
 * switch.
 * @module wsl-keepalive/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only merges: `ctx.slots`/`ctx.locale`/`ctx.configForms` become typed
// references, the `plugins.row.config` slot key is declared by the Plugin
// Manager package's domain contract, and the `wsl-keepalive` dictionary
// namespace is merged into LocaleNamespaceMap.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { KeepAliveConfig } from './KeepAliveConfig.tsx'
import { KeepAliveCardController, KEEPALIVE_ENTRY_ID, KEEPALIVE_ROW_KEY } from './controller.ts'
import { en, zh, type KeepAliveKey } from './i18n.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** wsl-keepalive page copy (title/summary/status/form labels). */
    'wsl-keepalive': KeepAliveKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'wsl-keepalive'

export { KeepAliveConfig } from './KeepAliveConfig.tsx'
export type { KeepAliveCardProps } from './KeepAliveConfig.tsx'
export type { KeepAliveCardFace, KeepAliveCardState, KeepAliveSettings } from './controller.ts'

/** Required services: slots (page registration), locale (dictionary + t seat), configForms (the row's Config form). */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Register the plugin's own configuration page while the Plugins page is on.
 * @param ctx - the client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'wsl-keepalive: dictionaries')

  const controller = new KeepAliveCardController(ctx.configForms.get(KEEPALIVE_ENTRY_ID), t)
  ctx.effect(() => () => controller.dispose(), 'wsl-keepalive: form subscription')

  ctx.slots.inject('plugins.row.config', () => ctx.slots.register(
    {
      name: 'plugins.row.config',
      key: KEEPALIVE_ROW_KEY,
      locale: NS,
      inject: () => controller.inject(),
    },
    KeepAliveConfig,
  ))
}
