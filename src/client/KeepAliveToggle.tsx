/**
 * The "Keep-Alive" toggle row on the settings page: on mount it fetches
 * /api/wsl-keepalive/status to initialize, and clicking the switch POSTs to
 * /api/wsl-keepalive/set to toggle; the subtitle displays the dbus-daemon PID
 * and the distro. UI strings come from the framework-injected `t` translate
 * seat (declared via the entry's `locale:` namespace), so they follow the DSH
 * UI language automatically on every switch.
 * @module wsl-keepalive/client/KeepAliveToggle
 */

import { useCallback, useEffect, useState } from 'react'
import type { KeepAliveKey } from './i18n.ts'
import css from './keepalive.module.css'

/** Business face produced by the entry's inject factory (the `t` seat is framework-injected separately). */
export interface KeepAliveToggleInjected {}

/** Full component props: the framework `t` seat (PropsLocale) plus the injected business face. */
export interface KeepAliveToggleProps extends KeepAliveToggleInjected {
  /** Translate a dictionary key of the `wsl-keepalive` namespace. */
  t: (key: KeepAliveKey, params?: Record<string, unknown>) => string
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
export function KeepAliveToggle({ t }: KeepAliveToggleProps): React.ReactElement {
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
