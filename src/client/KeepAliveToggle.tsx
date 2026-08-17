/**
 * The "Keep-Alive" toggle row on the settings page: on mount it fetches
 * /api/wsl-keepalive/status to initialize, and clicking the switch POSTs to
 * /api/wsl-keepalive/set to toggle; the subtitle displays the dbus-daemon PID
 * and the distro. UI strings are localized (en / zh-cn, fallback en).
 * @module wsl-keepalive/client/KeepAliveToggle
 */

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from './i18n.ts'
import css from './keepalive.module.css'

/** Optional props injected by the slots registration. */
export interface KeepAliveToggleProps {
  /** DSH locale/i18n service when the host provides one; otherwise browser/HTML lang is used. */
  localeService?: unknown
}

/** Host keep-alive API (same-origin JSON endpoint). */
interface KeepAliveHttpStatus {
  running: boolean
  pids: string[]
  pid: string | null
  distro: string
  wslExecPath: string | null
  distName: string | null
  error: string | null
}

/** Same-origin JSON fetch helper. */
async function keepAliveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(`wsl-keepalive ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

/**
 * Keep-alive toggle component (a settings row, self-drawn whole row:
 * title + subtitle + switch).
 */
export function KeepAliveToggle(props: unknown = {}): React.ReactElement {
  const { t } = useI18n((props as KeepAliveToggleProps | null | undefined)?.localeService)
  const [state, setState] = useState<{
    running: boolean
    loading: boolean
    busy: boolean
    error: string | null
    pid: string | null
    distro: string
  }>({ running: false, loading: true, busy: false, error: null, pid: null, distro: '' })

  const pollNow = useCallback(() => {
    let live = true
    keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/status').then((res) => {
      if (!live) return
      setState({
        running: !!res.running,
        loading: false,
        busy: false,
        error: res.error || null,
        pid: res.pid || null,
        distro: res.distro || '',
      })
    }, () => {
      if (!live) return
      setState((prev) => ({ ...prev, loading: false, error: t('cannotReachHost') }))
    })
    return () => { live = false }
  }, [t])

  useEffect(() => {
    const cleanup = pollNow()
    return cleanup
  }, [pollNow])

  const onToggle = (): void => {
    const target = !state.running
    setState((prev) => ({ ...prev, busy: true, error: null }))
    keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: target }),
    }).then((res) => {
      setState({
        running: !!res.running,
        loading: false,
        busy: false,
        error: res.error || null,
        pid: res.pid || null,
        distro: res.distro || '',
      })
    }, (e) => {
      setState((prev) => ({ ...prev, busy: false, error: String((e && (e as Error).message) || e) }))
    })
  }

  let statusText = t('detecting')
  if (!state.loading) {
    if (state.error) {
      // Refusal errors such as non-WSL: surface the reason clearly (from the host init gate).
      statusText = `${t('unavailable')} ${state.error}`
    } else if (state.running) {
      statusText = `${t('enabled')}${state.pid ? ` · PID ${state.pid}` : ''}${state.distro ? ` · ${state.distro}` : ''}`
    } else {
      statusText = `${t('disabled')}${state.distro ? ` · ${state.distro}` : ''}`
    }
  }

  return (
    <div className={css.row}>
      <div className={css.info}>
        <div className={css.title}>{t('title')}</div>
        <div className={`${css.sub}${state.error ? ` ${css.subError}` : ''}`} title={statusText}>{statusText}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={state.running}
        aria-label={t('ariaLabel')}
        disabled={state.loading || state.busy || !!state.error}
        className={`${css.switch}${state.running ? ` ${css.switchOn}` : ''}`}
        onClick={onToggle}
      >
        <span className={css.knob} />
      </button>
    </div>
  )
}
