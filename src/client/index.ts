/**
 * dsh-wsl-keepalive browser half: the compact sidebar switch and the target
 * list page under Plugins.
 * @module dsh-wsl-keepalive/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { ConfigPage } from './ConfigPage.tsx'
import { KeepAliveSwitch } from './KeepAliveSwitch.tsx'
import { en, zh, type KeepAliveKey } from './i18n.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'wsl-keepalive': KeepAliveKey
  }
}

const NS = 'wsl-keepalive'
const ROW_KEY = 'dsh-wsl-keepalive#wsl-keepalive'

export { KeepAliveSwitch } from './KeepAliveSwitch.tsx'
export { ConfigPage } from './ConfigPage.tsx'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'wsl-keepalive: dictionaries')

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'wsl-keepalive',
    order: 10,
    locale: NS,
  }, KeepAliveSwitch))

  ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
    name: 'plugins.row.config',
    key: ROW_KEY,
    locale: NS,
  }, ConfigPage))
}
