/**
 * wsl-keepalive browser half — registers a "Keep-Alive" configuration tab
 * under "Settings → Plugins" (the plugin's own config surface), reading and
 * toggling state through the same-origin /api/wsl-keepalive/* JSON endpoints
 * (static plugins use fetch instead of the dynamic plugin's host.call).
 * Service references are explicit: the client scope's `slots` and `locale`
 * come from the real `@deepseek-ai/*` client contracts that augment the
 * cordis `Context` (no string-keyed `ctx.get` casts).
 *
 * Localization follows the official DSH pattern: the dictionary is registered
 * with `ctx.locale.register('wsl-keepalive', …)` and the slot entry declares
 * `locale: 'wsl-keepalive'`, so the renderer injects a `t` seat into the
 * component and re-derives it (new function reference) on every language
 * switch — the row text follows the DSH UI language automatically.
 * @module wsl-keepalive/client
 */

// The client runtime root became the cordis `Context` directly in DSH
// 0.1.2-rc.1 (the dedicated runtime package was removed); the client
// half now types its context as `Context` from `@deepseek-ai/cordis`. `ctx.slots`
// (the SlotRegistry service) is provided and typed by the ui-renderer package,
// so its module augmentation must be pulled in alongside the settings base.
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only merges: `ctx.slots`/`ctx.locale` become typed references, the
// `settings.plugins.tab` slot key is declared by the settings domain base,
// and the `wsl-keepalive` dictionary namespace is merged into LocaleNamespaceMap.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { KeepAliveConfig, type KeepAliveToggleInjected } from './KeepAliveConfig.tsx'
import { en, zh, type KeepAliveKey } from './i18n.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** wsl-keepalive row copy (title/subtitle/switch). */
    'wsl-keepalive': KeepAliveKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'wsl-keepalive'

export { KeepAliveConfig } from './KeepAliveConfig.tsx'
export type { KeepAliveToggleInjected, KeepAliveToggleProps } from './KeepAliveConfig.tsx'

/** Required services: slots (injection surface for settings rows); locale for the dictionary + t seat. */
export const inject = ['slots', 'locale']

/**
 * Registers the Keep-Alive toggle as this plugin's own configuration tab
 * under Settings → Plugins (rather than a row in Settings → General).
 * The framework injects the `t` translate seat (declared via `locale: NS`),
 * so the tab label and row copy follow the DSH UI language on every switch.
 *
 * The Plugins section declares the `settings.plugins.tab` slot; the tab only
 * becomes clickable once the Plugins section is shown. Registering goes
 * through `ctx.slots.inject(key, …)`: it runs only once the declaration is
 * committed and is owned by the caller's fiber (plugin unload cancels the
 * wait and removes any active contribution). This is the current
 * SlotRegistry pattern (the same one the harness's own settings plugins use);
 * the older `ctx.inject(['slots'], scope => scope.effect(() => slots.register(…)))`
 * form did not wait for the slot declaration.
 * @param ctx - the client root context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'wsl-keepalive: dictionaries')

  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register(
    {
      name: 'settings.plugins.tab',
      id: 'wsl-keepalive',
      order: 10,
      label: () => t('nav'),
      locale: NS,
      inject: (): KeepAliveToggleInjected => ({}),
    },
    KeepAliveConfig,
  ))
}
