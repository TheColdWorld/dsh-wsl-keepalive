/**
 * Shared executable validation. Hosts supply their path API and a version
 * probe; the logic is otherwise identical for POSIX and Windows paths.
 * @module dsh-wsl-keepalive/core/validate
 */

import { existsSync, statSync } from 'node:fs'
import type { WslPathValidation } from './types.ts'
import type { WslResult } from './wsl.ts'

/** The subset of node:path a host needs. */
export interface PathApi {
  resolve(...paths: string[]): string
  isAbsolute(path: string): boolean
}

export type ExecProbe = (execPath: string) => Promise<WslResult>

export function normalizeWslPath(input: string, pathApi: PathApi): string {
  const trimmed = input.trim()
  return trimmed === '' ? '' : pathApi.resolve(trimmed)
}

function failed(errorCode: string, detail: string): WslPathValidation {
  return { ok: false, path: '', errorCode, detail }
}

/**
 * Verify one absolute executable path and run the version probe.
 * @param absolute - already-resolved absolute path.
 * @param probe - host-specific wsl.exe probe.
 * @returns acceptance plus the canonical absolute path.
 */
export async function validateExecPath(
  absolute: string,
  probe: ExecProbe,
): Promise<WslPathValidation> {
  if (absolute.includes('\0')) return failed('errPathInvalid', 'path contains a NUL byte')
  if (!existsSync(absolute)) return failed('errWslExecMissing', 'not found: ' + absolute)

  let stat
  try {
    stat = statSync(absolute)
  } catch (error) {
    return failed('errPathInvalid', 'cannot stat ' + absolute + ': ' + String((error as Error | undefined)?.message ?? error))
  }
  if (!stat.isFile()) return failed('errPathInvalid', 'not a regular file: ' + absolute)

  const probeResult = await probe(absolute)
  if (probeResult.error !== null) return failed('errWslVersionFailed', probeResult.error)
  if (probeResult.code !== 0) {
    const detail = probeResult.stdout.trim() || probeResult.stderr.trim() || 'exit code ' + String(probeResult.code)
    return failed('errWslVersionFailed', detail)
  }
  return { ok: true, path: absolute, errorCode: null, detail: null }
}

/**
 * Resolve a settings value to an absolute path and verify it. Empty means the
 * auto-detect default and is accepted without touching the filesystem.
 * @param input - raw preferredWslExec value.
 * @param pathApi - host path rules.
 * @param probe - host-specific wsl.exe probe.
 */
export async function validatePreferredWslExec(
  input: string,
  pathApi: PathApi,
  probe: ExecProbe,
): Promise<WslPathValidation> {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: true, path: '', errorCode: null, detail: null }
  if (trimmed.includes('\0')) return failed('errPathInvalid', 'path contains a NUL byte')

  const absolute = pathApi.resolve(trimmed)
  if (!pathApi.isAbsolute(absolute)) return failed('errPathInvalid', 'path is not absolute')
  return validateExecPath(absolute, probe)
}
