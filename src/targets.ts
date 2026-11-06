/**
 * Pure target merging: configured rows plus the implicit DSH distro.
 * @module dsh-wsl-keepalive/targets
 */

import type { DistroTarget, ResolvedTarget } from './types.ts'
import { DEFAULT_WSL_EXE } from './wsl.ts'

/**
 * Resolve configured targets and, when enabled, append the DSH distro if it
 * is missing.
 * @param configured - live config rows.
 * @param current - distro that runs this DSH process, when known.
 * @param keepDefault - whether the implicit DSH distro is kept alive.
 * @returns ordered, de-duplicated targets.
 */
export function mergeTargets(
  configured: readonly DistroTarget[],
  current: string | null,
  keepDefault = true,
): ResolvedTarget[] {
  const resolved: ResolvedTarget[] = []
  const seen = new Set<string>()
  for (const entry of configured) {
    const explicit = entry.distro.trim()
    const distro = explicit !== '' ? explicit : current
    const key = distro ?? ''
    if (seen.has(key)) continue
    seen.add(key)
    resolved.push({
      distro,
      userName: entry.userName.trim(),
      wslExecPath: entry.wslExecPath.trim() !== '' ? entry.wslExecPath.trim() : DEFAULT_WSL_EXE,
      implicit: false,
    })
  }
  if (keepDefault && current !== null && !seen.has(current)) {
    resolved.push({ distro: current, userName: '', wslExecPath: DEFAULT_WSL_EXE, implicit: true })
  }
  return resolved
}
