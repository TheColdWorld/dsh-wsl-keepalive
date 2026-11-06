/**
 * Compact sidebar switch. One switch starts or stops every configured distro.
 * Only a running/partial/error state enables the tooltip; its text is the exact
 * multi-line list of running PIDs or start failures.
 * @module dsh-wsl-keepalive/client/KeepAliveSwitch
 */

import { useCallback, useEffect, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { tooltipLines } from './tooltip.ts'
import { getStatus, setEnabled, RequestError, type KeepAliveStatus } from './transport.ts'
import css from './keepalive.module.css'

export type KeepAliveSwitchProps =
  SidebarFooterActionOwnerProps
  & PropsLocale<'wsl-keepalive'>

export function KeepAliveSwitch(props: KeepAliveSwitchProps): React.ReactElement {
  const { t, wide } = props
  const [status, setStatus] = useState<KeepAliveStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [transportError, setTransportError] = useState<string | null>(null)

  const load = useCallback(() => {
    getStatus().then(
      (next) => { setStatus(next); setTransportError(null) },
      (error: unknown) => {
        setTransportError(error instanceof RequestError ? t(error.code) : t('hostError'))
      },
    )
  }, [t])

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 5000)
    return () => { window.clearInterval(timer) }
  }, [load])

  const toggle = useCallback(() => {
    if (busy) return
    setBusy(true)
    setEnabled(!(status?.enabled ?? false)).then(
      (next) => { setStatus(next); setTransportError(null) },
      (error: unknown) => {
        setTransportError(error instanceof RequestError ? t(error.code) : t('hostError'))
      },
    ).finally(() => { setBusy(false) })
  }, [busy, status, t])

  const enabled = status?.enabled ?? false
  const hasError = transportError !== null
    || (status !== null && (status.errorCode !== null || status.targets.some((target) => target.errorCode !== null)))
  const label = transportError ?? tooltipLines(status, t).join('\n')
  const showTooltip = label !== ''

  const dotClass = hasError ? css.dot + ' ' + css.dotError : enabled ? css.dot + ' ' + css.dotOn : css.dot

  return (
    <Tooltip label={label} side="top" delayMs={200} disabled={!showTooltip} maxWidth={320}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('title')}
        aria-busy={busy}
        disabled={busy}
        className={wide ? css.row : css.rowCompact}
        onClick={toggle}
      >
        <span className={css.leading}>
          <span className={dotClass} aria-hidden="true" />
          {wide && <span className={css.label}>{t('title')}</span>}
        </span>
        <span className={enabled ? css.switch + ' ' + css.switchOn : css.switch} aria-hidden="true">
          <span className={css.knob} />
        </span>
      </button>
    </Tooltip>
  )
}