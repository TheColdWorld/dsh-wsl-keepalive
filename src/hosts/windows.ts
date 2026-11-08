/**
 * Windows-hosted platform service: DSH runs as a native Windows Node process
 * and drives wsl.exe. The implicit target is the WSL default distro from the
 * '*' row of `wsl -l -v`; there is no "DSH distro" on this host.
 * @module dsh-wsl-keepalive/hosts/windows
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { EnvCheck, ResolvedTarget, WslPathValidation } from '../core/types.ts'
import type { HostService, ResolvedWslExec } from '../core/host.ts'
import type { ExecOptions, WslResult } from '../core/wsl.ts'
import { runWsl, userArgs } from '../core/wsl.ts'
import {
  normalizeWslPath,
  validateExecPath,
  validatePreferredWslExec,
} from '../core/validate.ts'

const DEFAULT_SYSTEM_ROOT = 'C:\\Windows'
const DISTRO_CACHE_MS = 15_000
const ENV_CACHE_MS = 60_000

interface CachedEnv {
  at: number
  value: EnvCheck
}

interface CachedDistro {
  at: number
  execPath: string
  value: string | null
}

const envCache = new Map<string, CachedEnv>()

/** Drop cached verdicts, e.g. after tests or a manual recheck. */
export function clearWindowsCaches(): void {
  envCache.clear()
}

/** Parse the quiet distro list, one name per non-empty line. */
export function parseDistroList(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/\0/g, '').trim())
    .filter((line) => line !== '')
}

/**
 * Extract the default distro from `wsl -l -v`. The table is padded with
 * spaces and the default row starts with '*'. Names may contain spaces, so
 * split off the trailing STATE + VERSION columns instead of the first gap.
 */
export function parseDefaultDistro(output: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    if (!/^\s*\*/.test(line)) continue
    const rest = line.replace(/^\s*\*\s*/, '').replace(/\0/g, '').trim()
    const match = /^(.*?)(?:\s{2,}|\t+)\S+\s+[12]\s*$/.exec(rest)
    const name = (match?.[1] ?? rest.split(/\t+|\s{2,}/)[0] ?? '').trim()
    if (name !== '') return name
  }
  return null
}

function systemRoot(): string {
  const root = (process.env.SystemRoot ?? process.env.windir ?? DEFAULT_SYSTEM_ROOT).trim()
  return root === '' ? DEFAULT_SYSTEM_ROOT : root
}

export class WindowsHostService implements HostService {
  readonly kind = 'win32' as const

  private cachedDistro: CachedDistro | null = null

  defaultWslExec(): string {
    return path.win32.join(systemRoot(), 'System32', 'wsl.exe')
  }

  normalizeWslPath(input: string): string {
    return normalizeWslPath(input, path.win32)
  }

  execOptions(): ExecOptions {
    return { cwd: systemRoot() }
  }

  /**
   * Validate the preferred path. Store/inbox WSL versions differ in their
   * --version support, so fall back to `-l -q` when --version is unavailable.
   */
  private async probe(execPath: string): Promise<WslResult> {
    const options = this.execOptions()
    const version = await runWsl(execPath, ['--version'], 10000, options)
    if (version.code === 0) return version
    const list = await runWsl(execPath, ['-l', '-q'], 10000, options)
    if (list.code === 0) return list
    return version.error !== null ? version : list
  }

  async resolveWslExec(preferred: string): Promise<ResolvedWslExec> {
    const absolute = this.normalizeWslPath(preferred)
    const target = absolute === '' ? this.defaultWslExec() : absolute
    const verdict = await validateExecPath(target, (execPath) => this.probe(execPath))
    if (!verdict.ok) {
      return { ok: false, path: '', errorCode: verdict.errorCode, detail: verdict.detail }
    }
    return { ok: true, path: verdict.path, errorCode: null, detail: null }
  }

  async validateWslPath(preferred: string): Promise<WslPathValidation> {
    return validatePreferredWslExec(preferred, path.win32, (execPath) => this.probe(execPath))
  }

  async implicitDistro(wslExecPath: string): Promise<string | null> {
    const now = Date.now()
    if (
      this.cachedDistro !== null
      && this.cachedDistro.execPath === wslExecPath
      && now - this.cachedDistro.at < DISTRO_CACHE_MS
    ) {
      return this.cachedDistro.value
    }

    const result = await runWsl(wslExecPath, ['-l', '-v'], 10000, this.execOptions())
    const value = result.code === 0 ? parseDefaultDistro(result.stdout) : null
    this.cachedDistro = { at: now, execPath: wslExecPath, value }
    return value
  }

  private async listDistros(wslExecPath: string): Promise<WslResult> {
    return runWsl(wslExecPath, ['-l', '-q'], 10000, this.execOptions())
  }

  private async probeTarget(target: ResolvedTarget, wslExecPath: string): Promise<EnvCheck> {
    if (!existsSync(wslExecPath)) {
      return {
        ok: false,
        code: 'errWslExecMissing',
        params: { path: wslExecPath },
        detail: 'wsl.exe not found at ' + wslExecPath,
      }
    }

    const list = await this.listDistros(wslExecPath)
    if (list.error !== null) {
      return { ok: false, code: 'errCommandFailed', detail: list.error }
    }
    if (list.code !== 0) {
      return {
        ok: false,
        code: 'errCommandFailed',
        detail: list.stdout.trim() || list.stderr.trim() || 'wsl -l -q failed',
      }
    }

    const names = parseDistroList(list.stdout)
    if (!names.includes(target.name)) {
      return {
        ok: false,
        code: 'errDistroMissing',
        params: { name: target.name },
        detail: 'distro not found: ' + target.name,
      }
    }

    const probe = await runWsl(
      wslExecPath,
      [...userArgs(target.name, target.user), '--exec', 'true'],
      15000,
      this.execOptions(),
    )
    if (probe.error !== null) {
      return { ok: false, code: 'errCommandFailed', detail: probe.error }
    }
    if (probe.code === 0) {
      return { ok: true, code: 'ok', detail: 'wsl.exe executed successfully' }
    }
    return {
      ok: false,
      code: 'errCommandFailed',
      detail: probe.stdout.trim() || probe.stderr.trim() || 'wsl.exe exited with ' + String(probe.code),
    }
  }

  async checkEnv(target: ResolvedTarget, wslExecPath: string): Promise<EnvCheck> {
    const key = target.name + '\u0000' + target.user + '\u0000' + wslExecPath
    const hit = envCache.get(key)
    if (hit !== undefined && Date.now() - hit.at < ENV_CACHE_MS) return hit.value
    const value = await this.probeTarget(target, wslExecPath)
    envCache.set(key, { at: Date.now(), value })
    return value
  }
}
