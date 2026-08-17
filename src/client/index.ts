/**
 * wsl-keepalive browser half — registers a "Keep-Alive" toggle row under
 * "Settings → General", reading/toggling state through the same-origin
 * /api/wsl-keepalive/* JSON endpoints (static plugins use fetch instead of the
 * dynamic plugin's host.call). Does not import @deepseek-ai/*, only local
 * structural types.
 * @module wsl-keepalive/client
 */

import type { ClientContextLike, SlotsLike } from '../types.ts'
import { KeepAliveToggle, type KeepAliveToggleProps } from './KeepAliveToggle.tsx'

export { KeepAliveToggle } from './KeepAliveToggle.tsx'

/** Required service: slots (injection surface for settings rows). */
export const inject = ['slots']

/**
 * Registers the "Keep-Alive" toggle into the General settings section.
 * The locale/i18n service (when available) is passed into the component so the
 * settings text can follow the DSH UI language; otherwise the component falls
 * back to `<html lang>` / browser language / English.
 * @param ctx - the client root context.
 */
export function apply(ctx: ClientContextLike): void {
  ctx.inject(['slots'], (scope: ClientContextLike) => {
    const slots = scope.get('slots') as SlotsLike | undefined
    if (slots === undefined) return
    scope.effect(() => slots.register(
      {
        name: 'settings.general.item',
        id: 'wsl-keepalive',
        order: 30,
        inject: (): KeepAliveToggleProps => ({
          localeService: getLocaleService(scope),
        }),
      },
      KeepAliveToggle,
    ), 'wsl-keepalive: settings row')
  })
}

/** Best-effort lookup of the DSH locale/i18n service; missing services must not break the plugin. */
function getLocaleService(scope: ClientContextLike): unknown {
  try {
    return scope.get('locale') ?? scope.get('i18n')
  } catch {
    return undefined
  }
}
