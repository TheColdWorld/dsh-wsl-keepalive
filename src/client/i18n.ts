/**
 * Minimal self-contained localization for the wsl-keepalive WebUI.
 *
 * Supported locales:
 * - `en` (default / fallback)
 * - `zh-cn`
 *
 * The locale is resolved from, in priority order:
 * 1. the DSH locale/i18n service if one is available through the client ctx
 * 2. `<html lang>` (so a DSH UI language switch is respected)
 * 3. the browser language (`navigator.language` / `navigator.languages`)
 * 4. `en`
 *
 * No external i18n library is used; this keeps the plugin's runtime
 * dependency surface unchanged (only `react`).
 * @module wsl-keepalive/client/i18n
 */

import { useCallback, useEffect, useState } from 'react'

export type Locale = 'en' | 'zh-cn'

export interface I18nMessages {
  title: string
  detecting: string
  unavailable: string
  enabled: string
  disabled: string
  ariaLabel: string
  cannotReachHost: string
}

export const messages: Record<Locale, I18nMessages> = {
  en: {
    title: 'Keep-Alive',
    detecting: 'Detecting…',
    unavailable: 'Unavailable:',
    enabled: 'Enabled',
    disabled: 'Disabled',
    ariaLabel: 'WSL keep-alive toggle',
    cannotReachHost: 'Cannot reach host /api/wsl-keepalive',
  },
  'zh-cn': {
    title: '保活',
    detecting: '检测中…',
    unavailable: '不可用：',
    enabled: '已启用',
    disabled: '已停用',
    ariaLabel: 'WSL 保活开关',
    cannotReachHost: '无法访问宿主 /api/wsl-keepalive',
  },
}

export function normalizeLocale(raw: string | null | undefined): Locale {
  if (typeof raw === 'string' && raw.toLowerCase().replace('_', '-').startsWith('zh')) {
    return 'zh-cn'
  }
  return 'en'
}

function readLocaleValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value
  if (typeof value === 'function') {
    try {
      const result = (value as () => unknown)()
      if (typeof result === 'string' && result.trim() !== '') return result
      return readLocaleValue(result)
    } catch {
      return null
    }
  }
  if (value !== null && typeof value === 'object') {
    const s = value as Record<string, unknown>
    for (const key of ['locale', 'currentLocale', 'current', 'language', 'lang', 'code', 'getLocale', 'getCurrentLocale', 'getLanguage'] as const) {
      const nested = readLocaleValue(s[key])
      if (nested !== null) return nested
    }
  }
  return null
}

function readLocaleFromService(service: unknown): string | null {
  return readLocaleValue(service)
}

/** Resolve the best supported locale from the available sources. */
export function resolveLocale(localeService?: unknown): Locale {
  const fromService = readLocaleFromService(localeService)
  if (fromService !== null) return normalizeLocale(fromService)

  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement?.getAttribute('lang')
    if (htmlLang) return normalizeLocale(htmlLang)
  }

  if (typeof navigator !== 'undefined') {
    const navLang = navigator.language || (navigator.languages && navigator.languages[0])
    if (navLang) return normalizeLocale(navLang)
  }

  return 'en'
}

/** Return the current locale, re-rendering when the UI/browser language changes. */
export function useLocale(localeService?: unknown): Locale {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(localeService))

  useEffect(() => {
    const update = (): void => setLocale(resolveLocale(localeService))

    update()
    if (typeof window !== 'undefined') {
      window.addEventListener('languagechange', update)
    }

    let observer: MutationObserver | null = null
    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined' && document.documentElement) {
      observer = new MutationObserver(update)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('languagechange', update)
      }
      observer?.disconnect()
    }
  }, [localeService])

  return locale
}

/** Translate a single message key for the given locale. */
export function translate(locale: Locale, key: keyof I18nMessages): string {
  return messages[locale][key]
}

/** Convenience hook returning both the current locale and a stable `t` function. */
export function useI18n(localeService?: unknown): { locale: Locale; t: (key: keyof I18nMessages) => string } {
  const locale = useLocale(localeService)
  const t = useCallback((key: keyof I18nMessages) => translate(locale, key), [locale])
  return { locale, t }
}
