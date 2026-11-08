/**
 * Multi-target keep-alive orchestration. Platform differences live in the
 * HostService; this module owns target resolution, uniqueness, the implicit
 * target plan, and the status/set state machine.
 * @module dsh-wsl-keepalive/core/service
 */

import type {
  DistroTarget,
  KeepAliveStatus,
  ResolvedConfig,
  ResolvedTarget,
  TargetStatus,
  WslPathValidation,
} from './types.ts'
import { mergeTargets, validateTargets } from './targets.ts'
import { changeImplicitPlan, markKeepAlive, resetKeepAlive } from './implicit.ts'
import {
  denied,
  disposeAll,
  startTarget,
  statusTarget,
  stopTarget,
  type KeepAliveContext,
  type KeepAliveReporter,
} from './keepalive.ts'
import type { HostService, ResolvedWslExec } from './host.ts'

export interface KeepAliveSettings {
  keepDefault: boolean
  targets: readonly DistroTarget[]
  preferredWslExec: string
}

interface ResolvedState {
  wsl: ResolvedWslExec
  implicit: string | null
  covered: boolean
  config: ResolvedConfig | null
  empty: number[]
  duplicates: string[]
}

const silentReporter: KeepAliveReporter = { warn: () => {} }

export class KeepAliveService {
  /** Whether the sidebar switch was last turned on in this process. */
  private desiredEnabled = false
  /** Last implicit distro this service started or stopped. */
  private lastImplicit: string | null = null
  /** Last preferredWslExec value and its resolution. */
  private cachedPreferred: string | null = null
  private cachedWsl: ResolvedWslExec | null = null

  private readonly host: HostService
  private readonly getConfig: () => KeepAliveSettings
  private readonly report: KeepAliveReporter

  /**
   * @param host - platform adapter.
   * @param getConfig - reads the row's live Volatile Config.
   * @param report - Host logger sink for verified script repairs.
   */
  constructor(
    host: HostService,
    getConfig: () => KeepAliveSettings,
    report: KeepAliveReporter = silentReporter,
  ) {
    this.host = host
    this.getConfig = getConfig
    this.report = report
  }

  /** Validate a settings-page candidate path for the current host. */
  validateWslPath(preferred: string): Promise<WslPathValidation> {
    return this.host.validateWslPath(preferred)
  }

  private context(wslExecPath: string): KeepAliveContext {
    return { wslExecPath, execOptions: this.host.execOptions() }
  }

  private async resolveWsl(preferred: string): Promise<ResolvedWslExec> {
    if (this.cachedWsl !== null && this.cachedPreferred === preferred) return this.cachedWsl
    const resolved = await this.host.resolveWslExec(preferred)
    this.cachedPreferred = preferred
    this.cachedWsl = resolved
    return resolved
  }

  private async resolve(): Promise<ResolvedState> {
    const config = this.getConfig()
    const wsl = await this.resolveWsl(config.preferredWslExec)
    if (!wsl.ok) {
      return { wsl, implicit: null, covered: false, config: null, empty: [], duplicates: [] }
    }

    const implicit = await this.host.implicitDistro(wsl.path)
    const validation = validateTargets(config.targets)
    if (validation.empty.length > 0 || validation.duplicates.length > 0) {
      return {
        wsl,
        implicit,
        covered: false,
        config: null,
        empty: validation.empty,
        duplicates: validation.duplicates,
      }
    }

    const covered = implicit !== null
      && config.targets.some((target) => target.name.trim() === implicit)
    const keepDefault = config.keepDefault || covered
    const targets = mergeTargets(config.targets, implicit, keepDefault)
    return {
      wsl,
      implicit,
      covered,
      config: { keepDefault, targets, wslExecPath: wsl.path },
      empty: [],
      duplicates: [],
    }
  }

  private errorStatus(
    code: string,
    detail: string,
    params: Record<string, string> | null = null,
  ): KeepAliveStatus {
    return {
      enabled: false,
      partial: false,
      host: this.host.kind,
      defaultDistro: null,
      implicitAvailable: false,
      implicitReason: null,
      keepDefaultEffective: false,
      keepDefaultLocked: false,
      targets: [],
      errorCode: code,
      errorParams: params,
      error: detail,
    }
  }

  private implicitTarget(name: string): ResolvedTarget {
    return { name, user: '', implicit: true }
  }

  /**
   * Start or stop the implicit target when the switch or the default distro
   * changed. Only runs while the sidebar switch is on; otherwise status is
   * read-only.
   */
  private async reconcileImplicit(state: ResolvedState): Promise<void> {
    const config = state.config
    if (config === null) return
    const explicitNames = config.targets.filter((target) => !target.implicit).map((target) => target.name)
    const desired = config.keepDefault && state.implicit !== null && !state.covered
      ? state.implicit
      : null
    // A previous implicit distro that is now explicit is owned by the explicit
    // target; never stop it from the implicit path.
    const previous = this.lastImplicit !== null && !explicitNames.includes(this.lastImplicit)
      ? this.lastImplicit
      : null
    const plan = changeImplicitPlan(previous, desired)
    const ctx = this.context(config.wslExecPath)

    if (plan.stop !== null) {
      const result = await stopTarget(this.implicitTarget(plan.stop), ctx)
      markKeepAlive(plan.stop, !result.running)
    }
    if (plan.start !== null) {
      const result = await startTarget(this.implicitTarget(plan.start), ctx, this.report)
      markKeepAlive(plan.start, result.running)
    }
    this.lastImplicit = plan.next
  }

  /** Resolve configured targets plus the implicit target. */
  async resolveTargets(): Promise<ResolvedTarget[]> {
    const state = await this.resolve()
    return state.config?.targets ?? []
  }

  /** Kill Host-held children and their Linux keep-alive PIDs on unload. */
  dispose(): Promise<void> {
    this.desiredEnabled = false
    this.lastImplicit = null
    resetKeepAlive()
    return disposeAll()
  }

  /** Query every target. */
  async status(): Promise<KeepAliveStatus> {
    const state = await this.resolve()
    if (!state.wsl.ok) {
      return this.errorStatus(state.wsl.errorCode ?? 'errWslExecMissing', state.wsl.detail ?? '')
    }
    if (state.empty.length > 0) {
      return this.errorStatus('errDistroNameRequired', 'Distro name is required.', {
        rows: state.empty.map((index) => String(index + 1)).join(', '),
      })
    }
    if (state.duplicates.length > 0) {
      return this.errorStatus('errDuplicateTargets', 'The same distro cannot be added twice.', {
        names: state.duplicates.join(', '),
      })
    }

    const config = state.config
    if (config === null) return this.errorStatus('errCommandFailed', 'target resolution failed')

    if (this.desiredEnabled) await this.reconcileImplicit(state)

    const ctx = this.context(config.wslExecPath)
    const rows = await Promise.all(config.targets.map(async (target): Promise<TargetStatus> => {
      const env = await this.host.checkEnv(target, config.wslExecPath)
      if (!env.ok) return denied(target, env)
      return statusTarget(target, ctx)
    }))

    // If the implicit process died, clear the map so the next status pass can
    // restart it while the switch is on.
    if (this.lastImplicit !== null) {
      const implicitRow = rows.find((row) => row.name === this.lastImplicit)
      if (implicitRow !== undefined && !implicitRow.running) markKeepAlive(this.lastImplicit, false)
    }

    const enabled = rows.some((row) => row.running)
    const base: KeepAliveStatus = {
      enabled,
      partial: enabled && rows.some((row) => !row.running),
      host: this.host.kind,
      defaultDistro: state.implicit,
      implicitAvailable: state.implicit !== null,
      implicitReason: state.implicit !== null
        ? 'ok'
        : this.host.kind === 'wsl' ? 'unidentified-dsh-distro' : 'no-default-distro',
      keepDefaultEffective: config.keepDefault,
      keepDefaultLocked: state.covered,
      targets: rows,
      errorCode: null,
      errorParams: null,
      error: null,
    }

    if (rows.length === 0) {
      return {
        ...base,
        errorCode: 'errNoTargets',
        error: 'No keep-alive target is available.',
      }
    }
    return base
  }

  /** Start or stop every explicit target; the implicit target follows status(). */
  async set(enabled: boolean): Promise<KeepAliveStatus> {
    const state = await this.resolve()
    if (!state.wsl.ok) {
      return this.errorStatus(state.wsl.errorCode ?? 'errWslExecMissing', state.wsl.detail ?? '')
    }
    if (state.empty.length > 0) {
      return this.errorStatus('errDistroNameRequired', 'Distro name is required.')
    }
    if (state.duplicates.length > 0) {
      return this.errorStatus('errDuplicateTargets', 'The same distro cannot be added twice.', {
        names: state.duplicates.join(', '),
      })
    }

    const config = state.config
    if (config === null) return this.errorStatus('errCommandFailed', 'target resolution failed')
    const ctx = this.context(config.wslExecPath)
    this.desiredEnabled = enabled

    if (enabled) {
      await Promise.all(config.targets.filter((target) => !target.implicit).map(async (target) => {
        const env = await this.host.checkEnv(target, config.wslExecPath)
        if (!env.ok) return
        const before = await statusTarget(target, ctx)
        if (!before.running) await startTarget(target, ctx, this.report)
      }))
    } else {
      await Promise.all(config.targets.map(async (target) => {
        const before = await statusTarget(target, ctx)
        if (before.running) await stopTarget(target, ctx)
      }))
      if (this.lastImplicit !== null && !config.targets.some((target) => target.name === this.lastImplicit)) {
        await stopTarget(this.implicitTarget(this.lastImplicit), ctx).catch(() => undefined)
      }
      resetKeepAlive()
      this.lastImplicit = null
    }

    return this.status()
  }
}
