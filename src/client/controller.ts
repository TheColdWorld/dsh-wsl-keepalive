/**
 * wsl-keepalive settings-page controller — stages the row's Volatile Config
 * fields over `ctx.configForms` and owns the live status/toggle state.
 * @module wsl-keepalive/client/controller
 */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsFormModel, settingsTextField,
  type SettingsFieldState, type SettingsFormActions, type SettingsFormScope, type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { HostRequestError, keepAliveFetch, ownsCode, type HostFailureKind } from './host-endpoint.ts'
import { en, type KeepAliveKey } from './i18n.ts'

/** Profile entry id of this plugin row; the settings namespace the form binds. */
export const KEEPALIVE_ENTRY_ID = 'wsl-keepalive'

/** `plugins.row.config` key: `<bundle package>#<row id>`. */
export const KEEPALIVE_ROW_KEY = 'wsl-keepalive#wsl-keepalive'

/** The subset of the row's Config this page edits. */
export interface KeepAliveSettings {
  wslDistName?: string
  wslUserName?: string
  wslExecPath?: string
}

/** Host keep-alive status payload (same-origin JSON endpoint). */
export interface KeepAliveHttpStatus {
  running: boolean
  pids: string[]
  pid: string | null
  distro: string
  wslExecPath: string | null
  distName: string | null
  userName: string | null
  error: string | null
  /** Stable localization code for a Host refusal. Absent on hosts that predate it. */
  errorCode?: string | null
  /** Template params for errorCode. */
  errorParams?: Record<string, string> | null
}

/** A failure the page renders: a localized headline plus raw detail. */
export interface HostFailure {
  message: string
  detail: string
  kind: HostFailureKind
}

/** What the settings page renders. */
export interface KeepAliveCardState extends SettingsFormShell {
  wslDistName: SettingsFieldState
  wslUserName: SettingsFieldState
  wslExecPath: SettingsFieldState
  running: boolean
  loading: boolean
  busy: boolean
  failure: HostFailure | null
  pid: string | null
  distro: string
}

/** The face the page's slot entry injects. */
export interface KeepAliveCardFace extends SettingsFormActions {
  hooks: {
    /** Page snapshot bound by the renderer as useKeepAliveCard. */
    keepAliveCard: SnapshotStore<KeepAliveCardState>
  }
  /** Re-read the host status. */
  refresh: () => void
  /** Toggle keep-alive on/off. */
  toggle: () => void
}

/** Namespace-bound translate function. */
export type Translate = (key: KeepAliveKey, params?: Record<string, string>) => string

export class KeepAliveCardController {
  private readonly form: SettingsFormModel<KeepAliveSettings>
  private readonly store: SnapshotStore<KeepAliveCardState>
  private running = false
  private loading = true
  private busy = false
  private failure: HostFailure | null = null
  private pid: string | null = null
  private distro = ''
  private live = true

  /**
   * @param scope - the shared configuration form of the `wsl-keepalive` entry.
   * @param t - the page's namespace-bound translate function.
   */
  constructor(scope: SettingsFormScope<KeepAliveSettings>, private readonly t: Translate) {
    this.form = new SettingsFormModel(scope, [
      settingsTextField('wslDistName'),
      settingsTextField('wslUserName'),
      settingsTextField('wslExecPath'),
    ])
    this.store = this.form.bind(() => this.projection())
  }

  private isKeepAliveKey(code: string | null | undefined): code is KeepAliveKey {
    return ownsCode(code, en)
  }

  private describeFailure(error: unknown): HostFailure {
    if (error instanceof HostRequestError) {
      return { message: this.t(error.code), detail: error.message, kind: error.kind }
    }
    return {
      message: this.t('cannotReachHost'),
      detail: String((error as Error | undefined)?.message ?? error),
      kind: 'endpoint',
    }
  }

  private describeStatus(res: KeepAliveHttpStatus): HostFailure | null {
    if (res.errorCode === null || res.errorCode === undefined) {
      return res.error === null || res.error === undefined
        ? null
        : { message: res.error, detail: res.error, kind: 'host' }
    }
    return {
      message: this.isKeepAliveKey(res.errorCode) ? this.t(res.errorCode, res.errorParams ?? undefined) : (res.error ?? this.t('cannotReachHost')),
      detail: res.error ?? '',
      kind: 'host',
    }
  }

  private projection(): KeepAliveCardState {
    return {
      ...this.form.shell(),
      wslDistName: this.form.field('wslDistName'),
      wslUserName: this.form.field('wslUserName'),
      wslExecPath: this.form.field('wslExecPath'),
      running: this.running,
      loading: this.loading,
      busy: this.busy,
      failure: this.failure,
      pid: this.pid,
      distro: this.distro,
    }
  }

  private applyStatus(res: KeepAliveHttpStatus): void {
    this.running = !!res.running
    this.loading = false
    this.busy = false
    this.failure = this.describeStatus(res)
    this.pid = res.pid || null
    this.distro = res.distro || ''
    this.store.set(this.projection())
  }

  private applyFailure(error: unknown): void {
    this.loading = false
    this.busy = false
    this.failure = this.describeFailure(error)
    this.store.set(this.projection())
  }

  /** Re-read the host status. */
  refresh(): void {
    keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/status').then(
      (res) => { if (this.live) this.applyStatus(res) },
      (error) => { if (this.live) this.applyFailure(error) },
    )
  }

  /** Toggle keep-alive. */
  toggle(): void {
    const target = !this.running
    this.busy = true
    this.failure = null
    this.store.set(this.projection())
    keepAliveFetch<KeepAliveHttpStatus>('/api/wsl-keepalive/set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: target }),
    }).then(
      (res) => { if (this.live) this.applyStatus(res) },
      (error) => { if (this.live) this.applyFailure(error) },
    )
  }

  /** Build the face the page's slot entry injects. */
  inject(): KeepAliveCardFace {
    return {
      hooks: { keepAliveCard: this.store },
      refresh: () => { this.refresh() },
      toggle: () => { this.toggle() },
      ...this.form.actions(),
    }
  }

  /** Release the form subscription. */
  dispose(): void {
    this.live = false
    this.form.dispose()
  }
}
