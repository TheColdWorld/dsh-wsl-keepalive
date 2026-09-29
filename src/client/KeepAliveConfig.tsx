/**
 * WSL keep-alive Plugins-page configuration form. It renders two logical
 * areas:
 *
 * 1. 配置 / Configuration — the keep-alive toggle (enabled state + switch) and
 *    the live dbus-daemon PID line. On a failure the PID line turns into the
 *    localized refusal / rejection reason instead.
 * 2. 命令配置 / Command configuration — the row's Volatile Config fields
 *    (distro, user, wsl.exe path) through the shared settings form. Saving
 *    writes the profile's Cordis patch through `ctx.configForms`.
 *
 * UI strings come from the framework-injected `t` seat (declared via the
 * entry's `locale:` namespace), so they follow the DSH UI language
 * automatically on every switch.
 * @module wsl-keepalive/client/KeepAliveConfig
 */

import { useEffect } from 'react'
import { SettingsForm, SettingsValueField, type SettingsFormLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { KeepAliveCardFace, KeepAliveCardState } from './controller.ts'
import type { KeepAliveKey } from './i18n.ts'
import css from './keepalive.module.css'

/** Props the renderer binds for this page. */
export type KeepAliveCardProps =
  PropsRuntime<'plugins.row.config'>
  & PropsLocale<'wsl-keepalive'>
  & InjectFace<KeepAliveCardFace>

/** The shared form frame's copy, read from this page's dictionary. */
function formLabels(t: (key: KeepAliveKey) => string): SettingsFormLabels {
  return {
    unavailable: t('namespaceUnavailable'),
    readOnly: t('readOnly'),
    saveFailed: t('saveFailed'),
    save: t('save'),
    saving: t('saving'),
  }
}

/** The toggle row's subtitle: the localized state, or the refusal headline. */
function statusText(state: KeepAliveCardState, t: (key: KeepAliveKey, params?: Record<string, string>) => string): string {
  const suffix = state.distro ? ' · ' + state.distro : ''
  if (state.failure !== null) return t('unavailable') + ' ' + state.failure.message
  return (state.running ? t('enabled') : t('disabled')) + suffix
}

/**
 * The keep-alive settings page.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the page.
 */
export function KeepAliveConfig(props: KeepAliveCardProps): React.ReactElement {
  const { t } = props
  const state = props.useKeepAliveCard(snapshot => snapshot)

  // Load the status once the page mounts.
  useEffect(() => { props.refresh() }, [props.refresh])

  if (props.view === 'summary') return <>{t('description')}</>

  const disabled = !state.writable
  const switchClass = state.running ? css.switch + ' ' + css.switchOn : css.switch

  return (
    <div className={css.page}>
      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('configSection')}</h3>
        <div className={css.toggleRow}>
          <div className={css.toggleInfo}>
            <div className={css.toggleTitle}>{t('title')}</div>
            <div className={css.toggleSub}>{statusText(state, t)}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={state.running}
            aria-label={t('ariaLabel')}
            disabled={state.loading || state.busy}
            className={switchClass}
            onClick={() => { props.toggle() }}
          >
            <span className={css.knob} />
          </button>
        </div>
        <div className={css.statusRow}>
          {state.failure === null ? (
            <>{t('pidLabel')} : <span className={css.pid}>{state.pid || t('noPid')}</span></>
          ) : state.failure.kind === 'endpoint' ? (
            <>
              <span className={css.error}>{t('endpointHint')}</span>
              <span className={css.detail}>{t('retry')}{state.failure.detail ? ' (' + state.failure.detail + ')' : ''}</span>
            </>
          ) : (
            <span className={css.detail}>{state.failure.detail}</span>
          )}
        </div>
      </section>

      <section className={css.card}>
        <h3 className={css.cardTitle}>{t('commandSection')}</h3>
        <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
          <SettingsValueField
            id="plugin-config-wsl-distro"
            label={t('distroLabel')}
            hint={t('distroDesc')}
            overriddenLabel={t('overridden')}
            resetLabel={t('reset')}
            invalidLabel={t('invalidValue')}
            disabled={disabled}
            {...state.wslDistName}
            onEdit={(text) => { props.edit('wslDistName', text) }}
            onReset={() => { props.resetField('wslDistName') }}
          />
          <SettingsValueField
            id="plugin-config-wsl-user"
            label={t('userLabel')}
            hint={t('userDesc')}
            overriddenLabel={t('overridden')}
            resetLabel={t('reset')}
            invalidLabel={t('invalidValue')}
            disabled={disabled}
            {...state.wslUserName}
            onEdit={(text) => { props.edit('wslUserName', text) }}
            onReset={() => { props.resetField('wslUserName') }}
          />
          <SettingsValueField
            id="plugin-config-wsl-exec"
            label={t('wslExecLabel')}
            hint={t('wslExecDesc')}
            overriddenLabel={t('overridden')}
            resetLabel={t('reset')}
            invalidLabel={t('invalidValue')}
            disabled={disabled}
            {...state.wslExecPath}
            onEdit={(text) => { props.edit('wslExecPath', text) }}
            onReset={() => { props.resetField('wslExecPath') }}
          />
        </SettingsForm>
      </section>
    </div>
  )
}
