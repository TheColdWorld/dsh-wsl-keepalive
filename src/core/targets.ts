/**
 * Pure target merging and validation. Distro name is the unique key; the
 * concrete wsl.exe path is attached later by the service as ResolvedConfig.
 * @module dsh-wsl-keepalive/core/targets
 */

import type { DistroTarget, ResolvedTarget } from './types.ts'

export interface TargetValidation {
  /** Indexes whose name is empty after trimming. */
  empty: number[]
  /** Duplicate trimmed names, in first-seen order. */
  duplicates: string[]
}

/** Trim and validate configured targets without any host knowledge. */
export function validateTargets(configured: readonly DistroTarget[]): TargetValidation {
  const empty: number[] = []
  const seen = new Set<string>()
  const duplicates: string[] = []
  for (let i = 0; i < configured.length; i++) {
    const name = configured[i]?.name.trim() ?? ''
    if (name === '') {
      empty.push(i)
      continue
    }
    if (seen.has(name)) {
      if (!duplicates.includes(name)) duplicates.push(name)
    } else {
      seen.add(name)
    }
  }
  return { empty, duplicates }
}

/**
 * Merge explicit targets with the implicit target. Explicit rows are
 * de-duplicated defensively; callers should surface validateTargets() first.
 * @param configured - live config rows.
 * @param implicit - implicit distro name, or null when unknown.
 * @param keepDefault - whether the implicit target is enabled.
 * @returns ordered explicit targets followed by the implicit target, if any.
 */
export function mergeTargets(
  configured: readonly DistroTarget[],
  implicit: string | null,
  keepDefault: boolean,
): ResolvedTarget[] {
  const resolved: ResolvedTarget[] = []
  const seen = new Set<string>()

  for (const entry of configured) {
    const name = entry.name.trim()
    const user = entry.user.trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    resolved.push({ name, user, implicit: false })
  }

  if (keepDefault && implicit !== null && !seen.has(implicit)) {
    resolved.push({ name: implicit, user: '', implicit: true })
  }

  return resolved
}
