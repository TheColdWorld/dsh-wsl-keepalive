/**
 * Plugins-page configuration for the target list. The sidebar switch stays a
 * single compact row; this page owns the per-distro wsl.exe and user settings.
 * @module dsh-wsl-keepalive/client/ConfigPage
 */

import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { getStatus, validateWslPath } from './transport.ts'
import { en, type KeepAliveKey } from './i18n.ts'
import css from './keepalive.module.css'

interface TargetRow {
  distro: string
  userName: string
  wslExecPath: string
}

type StoredConfig = { targets?: TargetRow[]; keepDefault?: boolean }

export type ConfigPageProps =
  PluginConfigViewProps
  & PropsLocale<'wsl-keepalive'>

function validationKey(code: string | null): KeepAliveKey {
  return code !== null && Object.prototype.hasOwnProperty.call(en, code)
    ? code as KeepAliveKey
    : 'pathCheckFailed'
}

function rowsOf(value: unknown): TargetRow[] {
  if (value === null || typeof value !== 'object') return []
  const targets = (value as StoredConfig).targets
  if (!Array.isArray(targets)) return []
  return targets.map((row) => ({
    distro: typeof row?.distro === 'string' ? row.distro : '',
    userName: typeof row?.userName === 'string' ? row.userName : '',
    wslExecPath: typeof row?.wslExecPath === 'string' ? row.wslExecPath : '',
  }))
}

function keepDefaultOf(value: unknown): boolean {
  return value === null || typeof value !== 'object' || (value as StoredConfig).keepDefault !== false
}

export function ConfigPage(props: ConfigPageProps): React.ReactElement {
  const { t, view, form } = props
  const [rows, setRows] = useState<TargetRow[]>([])
  const [keepDefault, setKeepDefault] = useState(true)
  const [defaultDistro, setDefaultDistro] = useState<string | null>(null)
  const [supportsKeepDefault, setSupportsKeepDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [validationError, setValidationError] = useState<{ code: KeepAliveKey; detail: string } | null>(null)

  useEffect(() => {
    if (form === undefined) return
    setRows(rowsOf(form.state.value))
    setKeepDefault(keepDefaultOf(form.state.value))
  }, [form?.state.revision])

  useEffect(() => {
    let active = true
    getStatus().then(
      (status) => {
        if (!active) return
        const reported = (status as { defaultDistro?: string | null }).defaultDistro
        if (typeof reported === 'string' && reported !== '') {
          setDefaultDistro(reported)
          setSupportsKeepDefault(true)
          return
        }
        if (reported === null) {
          setDefaultDistro(null)
          setSupportsKeepDefault(true)
          return
        }
        // Older Hosts do not return defaultDistro and do not know this switch.
        setSupportsKeepDefault(false)
        setDefaultDistro(status.targets.length === 1 ? status.targets[0].distro : null)
      },
      () => {},
    )
    return () => { active = false }
  }, [])

  if (view === 'summary') return <>{t('description')}</>
  if (form === undefined) return <p className={css.note}>{t('unavailable')}</p>

  const keepDefaultText = defaultDistro === null || defaultDistro === ''
    ? t('keepDefaultLabel')
    : t('keepDefaultNamed', { name: defaultDistro })

  const update = (index: number, key: keyof TargetRow, value: string): void => {
    setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
    setFailed(false)
    setValidationError(null)
  }

  const save = async (): Promise<void> => {
    if (saving) return
    setSaving(true)
    setFailed(false)
    setValidationError(null)
    try {
      const next: TargetRow[] = []
      for (const row of rows) {
        const distro = row.distro.trim()
        const userName = row.userName.trim()
        const requested = row.wslExecPath.trim()
        if (requested === '') {
          next.push({ distro, userName, wslExecPath: '' })
          continue
        }
        const verdict = await validateWslPath(requested)
        if (!verdict.ok) {
          setValidationError({
            code: validationKey(verdict.errorCode),
            detail: verdict.detail ?? '',
          })
          return
        }
        next.push({ distro, userName, wslExecPath: verdict.path })
      }
      setRows(next)
      const ops: Array<{ op: 'set'; path: string[]; value: unknown }> = [
        { op: 'set', path: ['targets'], value: next },
      ]
      if (supportsKeepDefault && keepDefault !== keepDefaultOf(form.state.value)) {
        ops.push({ op: 'set', path: ['keepDefault'], value: keepDefault })
      }
      const accepted = await form.mutate(ops as never, form.state.revision)
      if (!accepted) setFailed(true)
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={css.config}>
      <header className={css.configHeader}>
        <h3 className={css.configTitle}>{t('configTitle')}</h3>
        <p className={css.hint}>{t('targetsHint')}</p>
      </header>
      <div className={css.defaultSwitch}>
        <div className={css.defaultText}>
          <span className={css.defaultTitle}>{keepDefaultText}</span>
          <span className={css.defaultHint}>{t('keepDefaultHint')}</span>
          {!supportsKeepDefault && <span className={css.note}>{t('keepDefaultUnavailable')}</span>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={keepDefault}
          aria-label={keepDefaultText}
          disabled={saving || !supportsKeepDefault}
          className={css.switchButton}
          onClick={() => {
            setKeepDefault((current) => !current)
            setFailed(false)
            setValidationError(null)
          }}
        >
          <span className={keepDefault ? css.switch + ' ' + css.switchOn : css.switch} aria-hidden="true">
            <span className={css.knob} />
          </span>
        </button>
      </div>
      {rows.length === 0 && (
        <div className={css.empty}>
          <p className={css.note}>{t('noTargets')}</p>
        </div>
      )}
      {rows.map((row, index) => (
        <div className={css.target} key={String(index)}>
          <label className={css.field}>
            <span>{t('distroLabel')}</span>
            <input
              value={row.distro}
              placeholder={t('distroHint')}
              onChange={(event) => { update(index, 'distro', event.target.value) }}
            />
          </label>
          <label className={css.field}>
            <span>{t('userLabel')}</span>
            <input
              value={row.userName}
              placeholder={t('userHint')}
              onChange={(event) => { update(index, 'userName', event.target.value) }}
            />
          </label>
          <label className={css.field}>
            <span>{t('wslPathLabel')}</span>
            <input
              value={row.wslExecPath}
              placeholder={t('wslPathHint')}
              onChange={(event) => { update(index, 'wslExecPath', event.target.value) }}
            />
          </label>
          <button
            type="button"
            className={css.remove}
            onClick={() => { setRows((current) => current.filter((_, i) => i !== index)); setFailed(false); setValidationError(null) }}
          >
            {t('remove')}
          </button>
        </div>
      ))}
      <div className={css.actions}>
        <button
          type="button"
          className={css.secondary}
          onClick={() => { setRows((current) => [...current, { distro: '', userName: '', wslExecPath: '' }]); setFailed(false); setValidationError(null) }}
        >
          {t('addTarget')}
        </button>
        <button type="button" className={css.primary} disabled={saving} onClick={() => { void save() }}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
      {validationError !== null && (
        <p className={css.error}>
          {t(validationError.code)}{validationError.detail !== '' ? ': ' + validationError.detail : ''}
        </p>
      )}
      {failed && <p className={css.error}>{t('saveFailed')}</p>}
    </section>
  )
}