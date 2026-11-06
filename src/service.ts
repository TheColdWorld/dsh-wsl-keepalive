/**
 * Multi-target keep-alive orchestration. One switch controls every resolved
 * distro; each target keeps its own wsl.exe path and PID file.
 * @module dsh-wsl-keepalive/service
 */

import type { DistroTarget, KeepAliveStatus, ResolvedTarget, TargetStatus } from './types.ts'
import { mergeTargets } from './targets.ts'
import { checkTarget } from './env.ts'
import { denied, disposeAll, startTarget, statusTarget, stopTarget, type KeepAliveReporter } from './keepalive.ts'
import { DEFAULT_WSL_EXE, runWsl } from './wsl.ts'

/** Read the distro that runs this DSH process. */
async function processDistro(preferredWsl = DEFAULT_WSL_EXE): Promise<string | null> {
  const fromEnv = (process.env.WSL_DISTRO_NAME ?? '').trim()
  if (fromEnv !== '') return fromEnv
  const result = await runWsl(preferredWsl, ['-l', '--running', '--quiet'], 10000)
  if (result.code !== 0) return null
  const names = result.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\*?\s*/, '').replace(/\0/g, '').trim())
    .filter((line) => line !== '')
  return names.length === 1 ? names[0] : null
}

export interface KeepAliveSettings {
  targets: readonly DistroTarget[]
  keepDefault: boolean
}

export class KeepAliveService {
  /** Whether the implicit DSH target was already stopped after the switch went off. */
  private implicitStopHandled = false

  /**
   * @param getConfig - reads the row's live Volatile Config.
   * @param report - Host logger sink for verified script repairs.
   */
  constructor(
    private readonly getConfig: () => KeepAliveSettings,
    private readonly report: KeepAliveReporter = { warn: () => {} },
  ) {}

  private async resolve(): Promise<{ targets: ResolvedTarget[]; current: string | null; keepDefault: boolean }> {
    const { targets: configured, keepDefault } = this.getConfig()
    const preferred = configured.map((entry) => entry.wslExecPath.trim()).find((path) => path !== '') ?? DEFAULT_WSL_EXE
    const current = await processDistro(preferred)
    return { targets: mergeTargets(configured, current, keepDefault), current, keepDefault }
  }

  /** Resolve configured targets plus the implicit DSH distro. */
  async resolveTargets(): Promise<ResolvedTarget[]> {
    return (await this.resolve()).targets
  }

  /** Kill Host-held children and their Linux keep-alive PIDs on unload. */
  dispose(): Promise<void> {
    return disposeAll()
  }

  /** Query every target. */
  async status(): Promise<KeepAliveStatus> {
    const { targets, current, keepDefault } = await this.resolve()

    // Turning the default switch off must also end a running implicit target.
    // The status poll is the only frequent hook on the live config, so stop it
    // once per off-transition instead of leaving an invisible process behind.
    if (keepDefault) {
      this.implicitStopHandled = false
    } else if (!this.implicitStopHandled && current !== null) {
      const implicit: ResolvedTarget = { distro: current, userName: '', wslExecPath: DEFAULT_WSL_EXE, implicit: true }
      // An explicit target for the same distro and user shares the keepalive
      // state directory; never kill it just because the implicit target is off.
      const explicitSameHome = targets.some((target) => target.distro === current
        && target.userName === '')
      if (!explicitSameHome) await stopTarget(implicit)
      this.implicitStopHandled = true
    }

    if (targets.length === 0) {
      return {
        enabled: false,
        partial: false,
        defaultDistro: current,
        targets: [],
        errorCode: 'errNoTargets',
        errorParams: null,
        error: 'No keep-alive target is available: default-distro keep-alive is off or undetected, and no explicit target is configured.',
      }
    }
    const rows = await Promise.all(targets.map(async (target): Promise<TargetStatus> => {
      const env = await checkTarget(target)
      if (!env.ok) return denied(target, env)
      return statusTarget(target)
    }))
    const enabled = rows.some((row) => row.running)
    return {
      enabled,
      partial: enabled && rows.some((row) => !row.running),
      defaultDistro: current,
      targets: rows,
      errorCode: null,
      errorParams: null,
      error: null,
    }
  }

  /** Start or stop every target; individual failures do not abort the rest. */
  async set(enabled: boolean): Promise<KeepAliveStatus> {
    const targets = await this.resolveTargets()
    await Promise.all(targets.map(async (target) => {
      if (enabled) {
        const env = await checkTarget(target)
        if (!env.ok) return
        const before = await statusTarget(target)
        if (!before.running) await startTarget(target, this.report)
      } else {
        const before = await statusTarget(target)
        if (before.running) await stopTarget(target)
      }
    }))
    return this.status()
  }
}