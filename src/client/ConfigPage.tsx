/**
 * Plugins-page configuration for the target list. The sidebar switch stays a
 * single compact row; this page owns the per-distro user, the global wsl.exe
 * preference, uniqueness checks, and the default-keep-alive switch.
 * @module dsh-wsl-keepalive/client/ConfigPage
 */

import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { getStatus, validateWslPath, type KeepAliveStatus } from './transport.ts'
import { en, type KeepAliveKey } from './i18n.ts'
import css from './keepalive.module.css'

interface TargetRow {
  name: string
  user: string
}

type StoredConfig = {
  targets?: Array<{ name?: unknown; user?: unknown; distro?: unknown; userName?: unknown; wslExecPath?: unknown }>
  keepDefault?: boolean
  preferredWslExec?: string
}

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
    name: typeof row?.name === 'string' && row.name.trim() !== ''
      ? row.name
      : typeof row?.distro === 'string' ? row.distro : '',
    user: typeof row?.user === 'string' && row.user.trim() !== ''
      ? row.user
      : typeof row?.userName === 'string' ? row.userName : '',
  }))
}

function keepDefaultOf(value: unknown): boolean {
  return value === null || typeof value !== 'object' || (value as StoredConfig).keepDefault !== false
}

function preferredWslExecOf(value: unknown): string {
  if (value === null || typeof value !== 'object') return ''
  const stored = value as StoredConfig
  if (typeof stored.preferredWslExec === 'string' && stored.preferredWslExec !== '') {
    return stored.preferredWslExec
  }
  for (const row of stored.targets ?? []) {
    if (typeof row?.wslExecPath === 'string' && row.wslExecPath.trim() !== '') return row.wslExecPath
  }
  return ''
}

function hasDuplicate(rows: readonly TargetRow[]): boolean {
  const seen = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    if (name === '') continue
    if (seen.has(name)) return true
    seen.add(name)
  }
  return false
}

export function ConfigPage(props: ConfigPageProps): React.ReactElement {
  const { t, view, form } = props
  const [rows, setRows] = useState<TargetRow[]>([])
  const [keepDefault, setKeepDefault] = useState(true)
  const [preferredWslExec, setPreferredWslExec] = useState('')
  const [status, setStatus] = useState<KeepAliveStatus | null>(null)
  const [supportsKeepDefault, setSupportsKeepDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [validationError, setValidationError] = useState<{ code: KeepAliveKey; detail: string } | null>(null)

  useEffect(() => {
    if (form === undefined) return
    setRows(rowsOf(form.state.value))
    setKeepDefault(keepDefaultOf(form.state.value))
    setPreferredWslExec(preferredWslExecOf(form.state.value))
  }, [form?.state.revision])

  useEffect(() => {
    let active = true
    getStatus().then(
      (next) => {
        if (!active) return
        setStatus(next)
        setSupportsKeepDefault(true)
      },
      () => {},
    )
    return () => { active = false }
  }, [])

  if (view === 'summary') return <>{t('description')}</>
  if (form === undefined) return <p className={css.note}>{t('unavailable')}</p>

  const host = status?.host ?? 'wsl'
  const locked = status?.keepDefaultLocked ?? false
  const implicitAvailable = status?.implicitAvailable ?? true
  const keepDefaultChecked = locked ? true : keepDefault
  const duplicate = hasDuplicate(rows)

  const keepDefaultText = host === 'win32'
    ? status?.defaultDistro
      ? t('keepDefaultDefaultDistroNamed', { name: status.defaultDistro })
      : t('keepDefaultDefaultDistroLabel')
    : status?.defaultDistro
      ? t('keepDefaultNamed', { name: status.defaultDistro })
      : t('keepDefaultLabel')

  const keepDefaultHint = !implicitAvailable
    ? host === 'win32' ? t('implicitUnavailableDefaultDistro') : t('implicitUnavailableDshDistro')
    : locked
      ? t('keepDefaultLockedHint')
      : host === 'win32' ? t('keepDefaultDefaultDistroHint') : t('keepDefaultHint')

  const update = (index: number, key: keyof TargetRow, value: string): void => {
    setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row))
    setFailed(false)
    setValidationError(null)
  }

  const save = async (): Promise<void> => {
    if (saving || duplicate) return
    setSaving(true)
    setFailed(false)
    setValidationError(null)
    try {
      const next: TargetRow[] = rows.map((row) => ({
        name: row.name.trim(),
        user: row.user.trim(),
      }))
      if (next.some((row) => row.name === '')) {
        setValidationError({ code: 'nameRequired', detail: '' })
        return
      }

      let path = preferredWslExec.trim()
      if (path !== '') {
        const verdict = await validateWslPath(path)
        if (!verdict.ok) {
          setValidationError({
            code: validationKey(verdict.errorCode),
            detail: verdict.detail ?? '',
          })
          return
        }
        path = verdict.path
      }

      setRows(next)
      setPreferredWslExec(path)
      const ops: Array<{ op: 'set'; path: string[]; value: unknown }> = [
        { op: 'set', path: ['targets'], value: next },
        { op: 'set', path: ['preferredWslExec'], value: path },
      ]
      if (supportsKeepDefault && !locked && keepDefault !== keepDefaultOf(form.state.value)) {
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
          <span className={css.defaultHint}>{keepDefaultHint}</span>
          {!supportsKeepDefault && <span className={css.note}>{t('keepDefaultUnavailable')}</span>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={keepDefaultChecked}
          aria-label={keepDefaultText}
          disabled={saving || !supportsKeepDefault || locked || !implicitAvailable}
          className={css.switchButton}
          onClick={() => {
            setKeepDefault((current) => !current)
            setFailed(false)
            setValidationError(null)
          }}
        >
          <span className={keepDefaultChecked ? css.switch + ' ' + css.switchOn : css.switch} aria-hidden="true">
            <span className={css.knob} />
          </span>
        </button>
      </div>
      <div className={css.target}>
        <label className={css.field}>
          <span>{t('wslPathLabel')}</span>
          <input
            value={preferredWslExec}
            placeholder={t('wslPathHint')}
            onChange={(event) => {
              setPreferredWslExec(event.target.value)
              setFailed(false)
              setValidationError(null)
            }}
          />
        </label>
        <p className={css.note}>{t('wslPathHint')}</p>
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
              value={row.name}
              placeholder={t('distroHint')}
              onChange={(event) => { update(index, 'name', event.target.value) }}
            />
          </label>
          <label className={css.field}>
            <span>{t('userLabel')}</span>
            <input
              value={row.user}
              placeholder={t('userHint')}
              onChange={(event) => { update(index, 'user', event.target.value) }}
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
      {duplicate && <p className={css.error}>{t('duplicateDistro')}</p>}
      <div className={css.actions}>
        <button
          type="button"
          className={css.secondary}
          onClick={() => { setRows((current) => [...current, { name: '', user: '' }]); setFailed(false); setValidationError(null) }}
        >
          {t('addTarget')}
        </button>
        <button type="button" className={css.primary} disabled={saving || duplicate} onClick={() => { void save() }}>
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
