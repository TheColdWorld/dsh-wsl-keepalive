/**
 * Pure tooltip text for the sidebar switch.
 * @module dsh-wsl-keepalive/client/tooltip
 */

import { en, type KeepAliveKey } from './i18n.ts'
import type { KeepAliveStatus } from './transport.ts'

function known(code: string | null | undefined): code is KeepAliveKey {
  return code !== null && code !== undefined && Object.prototype.hasOwnProperty.call(en, code)
}

/**
 * Build the exact multi-line tooltip: one line per running target, then one
 * line per failed target. There is no prefix and no "default distro" wording.
 * @param status - current aggregate status, or null before the first read.
 * @param t - namespace translate function.
 * @returns lines; empty when there is nothing to show.
 */
export function tooltipLines(
  status: KeepAliveStatus | null,
  t: (key: KeepAliveKey) => string,
): string[] {
  if (status === null) return []
  if (status.errorCode !== null) return [known(status.errorCode) ? t(status.errorCode) : t('errNoTargets')]
  const lines: string[] = []
  for (const target of status.targets) {
    if (target.running) lines.push((target.distro ?? '') + '(' + (target.pid ?? '?') + ')')
  }
  for (const target of status.targets) {
    if (!target.running && target.errorCode !== null) {
      lines.push((target.distro ?? '') + '(' + t('startFailed') + ')')
    }
  }
  return lines
}
