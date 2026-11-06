/**
 * Host-side validation for a configured wsl.exe path. This runs before the
 * settings form writes a target row, so a broken path never reaches Config.
 * @module dsh-wsl-keepalive/validate
 */

import { existsSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { runWsl } from './wsl.ts'

/** Result of validating one wsl.exe path. */
export interface WslPathValidation {
  ok: boolean
  /** Canonical absolute path when `ok`; empty for the auto-detect default. */
  path: string
  errorCode: string | null
  detail: string | null
}

function failed(errorCode: string, detail: string): WslPathValidation {
  return { ok: false, path: '', errorCode, detail }
}

/**
 * Resolve a user-supplied path to an absolute path.
 * @param input - raw setting value.
 * @returns absolute path, or an empty string for the auto-detect default.
 */
export function normalizeWslPath(input: string): string {
  const trimmed = input.trim()
  return trimmed === '' ? '' : resolve(trimmed)
}

/**
 * Resolve, stat, and probe a candidate wsl.exe path.
 *
 * A relative input is resolved against the Host working directory; the caller
 * persists the returned absolute path. Any failure cancels the settings write.
 * @param input - raw setting value.
 * @returns acceptance plus the path to persist, or the reason for refusal.
 */
export async function validateWslPath(input: string): Promise<WslPathValidation> {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: true, path: '', errorCode: null, detail: null }
  if (trimmed.includes('\0')) return failed('errPathInvalid', 'path contains a NUL byte')

  const absolute = resolve(trimmed)
  if (!isAbsolute(absolute)) return failed('errPathInvalid', 'path is not absolute')
  if (!existsSync(absolute)) return failed('errWslExecMissing', 'not found: ' + absolute)

  let stat
  try {
    stat = statSync(absolute)
  } catch (error) {
    return failed('errPathInvalid', 'cannot stat ' + absolute + ': ' + String((error as Error | undefined)?.message ?? error))
  }
  if (!stat.isFile()) return failed('errPathInvalid', 'not a regular file: ' + absolute)

  const probe = await runWsl(absolute, ['--version'], 10000)
  if (probe.error !== null) return failed('errWslVersionFailed', probe.error)
  if (probe.code !== 0) {
    const detail = probe.stderr.trim() || probe.stdout.trim() || 'exit code ' + String(probe.code)
    return failed('errWslVersionFailed', detail)
  }
  return { ok: true, path: absolute, errorCode: null, detail: null }
}
