/**
 * Normalize persisted settings, including the 0.3.0 target shape
 * ({distro,userName,wslExecPath}). The new model stores one global
 * preferredWslExec and requires non-empty, unique distro names.
 *
 * New-shape rows are preserved as-is so the service can reject empty or
 * duplicate names with a visible error. Only a genuinely legacy payload is
 * deduplicated/repaired during migration.
 * @module dsh-wsl-keepalive/core/migrate
 */

import type { DistroTarget } from './types.ts'

export interface LegacyTarget {
  name?: string
  user?: string
  /** 0.3.0 field. */
  distro?: string
  /** 0.3.0 field. */
  userName?: string
  /** 0.3.0 field. */
  wslExecPath?: string
}

export interface LegacySettings {
  targets: readonly LegacyTarget[]
  keepDefault: boolean
  preferredWslExec: string
}

export interface NormalizedSettings {
  keepDefault: boolean
  targets: DistroTarget[]
  preferredWslExec: string
  warnings: string[]
}

function isLegacy(entry: LegacyTarget): boolean {
  return (entry.distro ?? '').trim() !== ''
    || (entry.userName ?? '').trim() !== ''
    || (entry.wslExecPath ?? '').trim() !== ''
}

/**
 * Convert legacy settings into the new shape. New-shape settings are returned
 * untouched (trimmed) so duplicate and empty names reach the service checks.
 */
export function normalizeSettings(raw: LegacySettings): NormalizedSettings {
  const warnings: string[] = []
  const legacy = raw.targets.some(isLegacy)

  if (!legacy) {
    return {
      keepDefault: raw.keepDefault,
      targets: raw.targets.map((entry) => ({
        name: (entry.name ?? '').trim(),
        user: (entry.user ?? '').trim(),
      })),
      preferredWslExec: raw.preferredWslExec.trim(),
      warnings,
    }
  }

  const targets: DistroTarget[] = []
  const seen = new Set<string>()
  let keepDefault = raw.keepDefault
  let sawImplicitRow = false

  for (const entry of raw.targets) {
    const name = entry.name?.trim() || entry.distro?.trim() || ''
    const user = entry.user?.trim() || entry.userName?.trim() || ''
    if (name === '') {
      sawImplicitRow = true
      warnings.push('dsh-wsl-keepalive: dropped a legacy target with an empty distro name; keepDefault is forced on.')
      continue
    }
    if (seen.has(name)) {
      warnings.push('dsh-wsl-keepalive: dropped duplicate legacy target "' + name + '".')
      continue
    }
    seen.add(name)
    targets.push({ name, user })
  }

  if (sawImplicitRow) keepDefault = true

  let preferredWslExec = raw.preferredWslExec.trim()
  if (preferredWslExec === '') {
    const legacyPaths = raw.targets
      .map((entry) => entry.wslExecPath?.trim() ?? '')
      .filter((path) => path !== '')
    if (legacyPaths.length > 0) {
      preferredWslExec = legacyPaths[0]
      warnings.push('dsh-wsl-keepalive: migrated a per-target wslExecPath to preferredWslExec.')
      if (new Set(legacyPaths).size > 1) {
        warnings.push('dsh-wsl-keepalive: legacy targets used different wsl.exe paths; kept the first one.')
      }
    }
  }

  return { keepDefault, targets, preferredWslExec, warnings }
}
