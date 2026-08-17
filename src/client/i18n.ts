/**
 * wsl-keepalive localization dictionaries — registered into the DSH locale
 * service (ctx.locale.register) under the `wsl-keepalive` namespace and read
 * through the framework-injected `t` seat (PropsLocale). The DSH renderer
 * re-derives `t` on every locale switch, so the row re-renders with the new
 * language automatically — no manual subscription needed.
 *
 * Supported locales:
 * - `en` (default / fallback)
 * - `zh`
 *
 * @module wsl-keepalive/client/i18n
 */

/** Dictionary keys of the `wsl-keepalive` namespace (merged into LocaleNamespaceMap). */
export type KeepAliveKey =
  | 'title'
  | 'detecting'
  | 'unavailable'
  | 'enabled'
  | 'disabled'
  | 'ariaLabel'
  | 'cannotReachHost'

/** English dictionary (the default / fallback). */
export const en: Record<KeepAliveKey, string> = {
  title: 'Keep-Alive',
  detecting: 'Detecting…',
  unavailable: 'Unavailable:',
  enabled: 'Enabled',
  disabled: 'Disabled',
  ariaLabel: 'WSL keep-alive toggle',
  cannotReachHost: 'Cannot reach host /api/wsl-keepalive',
}

/** Chinese (zh) dictionary. */
export const zh: Record<KeepAliveKey, string> = {
  title: '保活',
  detecting: '检测中…',
  unavailable: '不可用：',
  enabled: '已启用',
  disabled: '已停用',
  ariaLabel: 'WSL 保活开关',
  cannotReachHost: '无法访问宿主 /api/wsl-keepalive',
}
