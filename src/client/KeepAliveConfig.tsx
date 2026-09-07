/**
 * WSL keep-alive settings page. It renders two logical configuration areas:
 *
 * 1. 配置 / Configuration — the keep-alive toggle (enabled state + switch) and
 *    the live dbus-daemon PID line. On a failure the PID line turns into the
 *    red command output / rejection reason instead.
 * 2. 命令配置 / Command configuration — three text config items (distro, user,
 *    wsl.exe path), each with a description, validated at runtime. On commit
 *    (blur / Enter) the value is POSTed to the host; if the distro / user /
 *    wsl.exe does not resolve, the field is reverted to its last saved value
 *    and the rejection reason is shown in red. A successful change is persisted
 *    by the host to disk.
 *
 * The mockup's black frames are grouping markers only and are not rendered;
 * each area is a light neutral card instead.
 *
 * UI strings come from the framework-injected `t` translate seat (declared via
 * the entry's `locale:` namespace), so they follow the DSH UI language
 * automatically on every switch.
 * @module wsl-keepalive/client/KeepAliveConfig
 */

import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { KeepAliveKey } from './i18n.ts'
import css from './keepalive.module.css'

/** Business face produced by the entry's inject factory (the `t` seat is framework-injected separately). */
export interface KeepAliveToggleInjected {}

/** Full component props: the framework `t` seat (PropsLocale) plus the injected business face. */
export interface KeepAliveToggleProps extends KeepAliveToggleInjected, PropsLocale<'wsl-keepalive'> {}

/** Host keep-alive API (same-origin JSON endpoint). */
interface KeepAliveHttpStatus {
  running: boolean
  pids: string[]
  pid: string | null
  distro: string
  wslExecPath: string | null
  distName: string | null
  userName: string | null
  error: string | null
}

/** Command config returned by GET/POST /api/wsl-keepalive/config. */
interface ConfigView {
  distName: string
  userName: string
  wslExecPath: string
}

/**
 * Response from the config read/update endpoint. A failed update carries a
 * structured `code` + `params` (never a hardcoded string) that the client
 * localizes to the DSH UI language via the `t` seat.
 */
interface ConfigResponse {
  ok: boolean
  config?: ConfigView
  error?: string
  field?: string
  code?: string
  params?: Record<string, string>
}

type FieldKey = keyof ConfigView

interface FieldState {
  value: string
  error: string | null
  saving: boolean
}

/** Same-origin JSON fetch helper. */
async function keepAliveFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  if (!response.ok) {
    throw new Error(`wsl-keepalive ${path} failed: ${response.status}`)
  }
  return (await response.json()) as T
}

const initialFields = (config: ConfigView): Record<FieldKey, FieldState> => ({
  distName: { value: config.distName, error: null, saving: false },
  userName: { value: config.userName, error: null, saving: false },
  wslExecPath: { value: config.wslExecPath, error: null, saving: false },
})

/**
 * The keep-alive settings page (a settings tab, self-drawn).
 */
export function KeepAliveConfig({ t }: KeepAliveToggleProps): React.ReactElement {
  const [status, setStatus] = useState<{
    running: boolean
    loading: boolean
    busy: boolean
    error: string | null
    pid: string | null
    distro: string
  }>({ running: false, loading: true, busy: false, error: null, pid: null, distro: '' })

  const [config, setConfig] = useState<ConfigView>({ distName: '', userName: '', wslExecPath: '' })
  const [fields, setFields] = useState<Record<FieldKey, FieldState>>(initialFields({ distName: '', userName: '', wslExecPath: '' }))
  const [configLoading, setConfigLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Load both the status and the command config on mount.
  useEffect(() => {
    let live = true
    const poll = (): void => {
      keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/status').then((res) => {
        if (!live) return
        setStatus({
          running: !!res.running,
          loading: false,
          busy: false,
          error: res.error || null,
          pid: res.pid || null,
          distro: res.distro || '',
        })
      }, () => {
        if (!live) return
        setStatus((prev) => ({ ...prev, loading: false, error: t('cannotReachHost') }))
      })
    }
    const loadConfig = (): void => {
      keepAliveFetch<ConfigResponse>('/api/wsl-keepalive/config').then((res) => {
        if (!live) return
        if (res.ok && res.config) {
          setConfig(res.config)
          setFields(initialFields(res.config))
          setLoadError(null)
        } else {
          setLoadError(res.error || t('cannotReachHost'))
        }
        setConfigLoading(false)
      }, (e) => {
        if (!live) return
        setLoadError(t('cannotReachHost') + ': ' + String((e && (e as Error).message) || e))
        setConfigLoading(false)
      })
    }
    poll()
    loadConfig()
    return () => { live = false }
  }, [t])

  const onToggle = (): void => {
    const target = !status.running
    setStatus((prev) => ({ ...prev, busy: true, error: null }))
    keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: target }),
    }).then((res) => {
      setStatus({
        running: !!res.running,
        loading: false,
        busy: false,
        error: res.error || null,
        pid: res.pid || null,
        distro: res.distro || '',
      })
    }, (e) => {
      setStatus((prev) => ({ ...prev, busy: false, error: String((e && (e as Error).message) || e) }))
    })
  }

  // Commit a command-config field: POST, validate server-side, revert on failure.
  const saveField = useCallback(async (field: FieldKey, raw: string): Promise<void> => {
    const value = raw.trim()
    if (value === config[field]) return
    setFields((prev) => ({ ...prev, [field]: { ...prev[field], saving: true, error: null } }))
    try {
      const res = await keepAliveFetch<ConfigResponse>('/api/wsl-keepalive/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok && res.config) {
        setConfig(res.config)
        setFields((prev) => ({ ...prev, [field]: { value: res.config?.[field] ?? value, error: null, saving: false } }))
      } else {
        // Validation failed: revert to the last saved value and surface the reason.
        // The host returns a structured { code, params }, localized here with the
        // DSH UI language via the `t` seat (no hardcoded host strings).
        const saved = config[field]
        const message = res.code ? t(res.code as KeepAliveKey, res.params) : t('saveFailed')
        setFields((prev) => ({ ...prev, [field]: { value: saved, error: message, saving: false } }))
      }
    } catch (e) {
      setFields((prev) => ({ ...prev, [field]: { value: config[field], error: `${t('saveFailed')}: ${String((e && (e as Error).message) || e)}`, saving: false } }))
    }
  }, [config, t])

  const fieldDefs: { key: FieldKey; label: string; desc: string }[] = [
    { key: 'distName', label: t('distroLabel'), desc: t('distroDesc') },
    { key: 'userName', label: t('userLabel'), desc: t('userDesc') },
    { key: 'wslExecPath', label: t('wslExecLabel'), desc: t('wslExecDesc') },
  ]

  const statusText = status.error
    ? `${t('unavailable')} ${status.error}`
    : status.running
      ? `${t('enabled')}${status.distro ? ` · ${status.distro}` : ''}`
      : `${t('disabled')}${status.distro ? ` · ${status.distro}` : ''}`

  return (
    <div className={css.page}>
      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('configSection')}</h3>
        <div className={css.toggleRow}>
          <div className={css.toggleInfo}>
            <div className={css.toggleTitle}>{t('title')}</div>
            <div className={css.toggleSub}>{statusText}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={status.running}
            aria-label={t('ariaLabel')}
            disabled={status.loading || status.busy}
            className={`${css.switch}${status.running ? ` ${css.switchOn}` : ''}`}
            onClick={onToggle}
          >
            <span className={css.knob} />
          </button>
        </div>
        <div className={css.statusRow}>
          {status.error ? (
            <span className={css.error}>{status.error}</span>
          ) : (
            <>{t('pidLabel')} : <span className={css.pid}>{status.pid || t('noPid')}</span></>
          )}
        </div>
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('commandSection')}</h3>
        {configLoading ? (
          <div className={css.fieldError}>{t('detecting')}</div>
        ) : loadError ? (
          <div className={css.fieldError}>{loadError}</div>
        ) : (
          <div className={css.fields}>
            {fieldDefs.map((fd) => (
              <div className={css.field} key={fd.key}>
                <label className={css.fieldLabel}>{fd.label}</label>
                <input
                  className={`${css.fieldInput}${fields[fd.key].error ? ` ${css.fieldInputError}` : ''}`}
                  value={fields[fd.key].value}
                  disabled={fields[fd.key].saving}
                  onChange={(e) => setFields((prev) => ({ ...prev, [fd.key]: { ...prev[fd.key], value: e.target.value, error: null } }))}
                  onBlur={() => { void saveField(fd.key, fields[fd.key].value) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                />
                <div className={css.fieldDesc}>{fd.desc}</div>
                {fields[fd.key].saving
                  ? <div className={css.fieldDesc}>{t('saving')}</div>
                  : fields[fd.key].error
                    ? <div className={css.fieldError}>{fields[fd.key].error}</div>
                    : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
