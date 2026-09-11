/**
 * wsl-keepalive host service — the keep-alive core logic. Reads/writes
 * <DSH_HOME|~/.dsh>/wsl-keepalive.json, records the dbus-daemon PIDs in memory,
 * validates the command config (distro / user / wsl.exe), and runs the
 * status/start/stop commands against wsl.exe.
 *
 * Execution model: this is a **host admin action**, so it runs through Node's
 * own `child_process` / `fs` directly (the dsh host process is Node running
 * inside WSL), NOT through the model-facing `ctx.shell`/`ctx.fs` services.
 * Those are per-session/agent-plane services that a top-level host row may not
 * see and that run under the workspace sandbox, which denies the `wsl.exe` /
 * `kill` operations this plugin needs. Raw Node primitives are always available
 * on the host plane and are never sandboxed.
 * @module wsl-keepalive/service
 */

import { exec, type ExecException } from 'node:child_process'
import { existsSync, promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { checkWslEnv } from './env.ts'

/** Plugin config: can be overridden by the cordis.patch.yml row; file values take precedence. */
export interface KeepAliveConfig {
  /** Target WSL distro name; when non-empty the start command appends `-d <name>`. */
  wslDistName?: string
  /** User (inside the target distro) to run the keep-alive process as; empty uses the distro default. */
  wslUserName?: string
  /** Absolute path to wsl.exe; auto-detected and written into the config on startup when unset. */
  wslExecPath?: string
}

/** Keep-alive status returned to the browser (pure JSON scalars). */
export interface KeepAliveStatus {
  running: boolean
  pids: string[]
  pid: string | null
  distro: string
  wslExecPath: string | null
  distName: string | null
  userName: string | null
  /**
   * Technical failure detail (command line, stderr, spawn error). This is the
   * host's own diagnostic text and is NOT meant to be shown as the primary UI
   * message — the browser localizes {@link KeepAliveStatus.errorCode} instead
   * and renders this only as a dimmed detail line.
   */
  error: string | null
  /**
   * Stable localization code for the failure, owned by the client dictionary
   * (`src/client/i18n.ts`). `null` means no failure. A client that does not
   * know the code falls back to `error`.
   */
  errorCode: string | null
  /** Template params for {@link KeepAliveStatus.errorCode}, if any. */
  errorParams: Record<string, string> | null
}

/** Command-config surface returned to the browser (pure JSON scalars). */
export interface KeepAliveConfigView {
  distName: string
  userName: string
  wslExecPath: string
}

/**
 * Command-config update payload. Each present field is validated at runtime;
 * an empty string clears the field and means "use the default".
 */
export interface KeepAliveConfigUpdate {
  distName?: string | null
  userName?: string | null
  wslExecPath?: string | null
}

/**
 * Result of one config update: either the resulting config or a structured
 * rejection. The rejection carries a stable `code` plus `params`, never a
 * hardcoded string, so the client can localize it to the DSH UI language.
 */
export type KeepAliveConfigResult =
  | { ok: true; config: KeepAliveConfigView }
  | { ok: false; field?: string; code: string; params?: Record<string, string> }

/** A structured validation rejection: a localization code plus its params. */
export interface KeepAliveValidationError {
  code: string
  params?: Record<string, string>
}

/** Result of one command execution (scalars extracted, no runtime objects). */
interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  infraError: string | null
}

/** A structured startup failure: a localization code, its params, and the raw detail. */
export interface StartupFailure {
  code: string
  params?: Record<string, string>
  detail: string
}

/** Startup parse result. */
type Startup =
  | { wslExecPath: string; distName: string; userName: string }
  | { failure: StartupFailure }

export class KeepAliveService {
  private readonly config: KeepAliveConfig
  private readonly CONFIG_NAME = 'wsl-keepalive.json'
  private readonly FALLBACK_WSL_EXE = '/mnt/c/Windows/System32/wsl.exe'

  /** dbus-daemon PIDs recorded in memory (updated after each status query). */
  private lastPids: string[] = []

  /** Startup sequence (resolve wsl-exec-path / wsl-dist-name / wsl-user-name), run once, lazily. */
  private startup: Promise<Startup> | null = null

  constructor(config: KeepAliveConfig = {}) {
    this.config = config
  }

  /**
   * Run the startup sequence once, on first use (status/set), not at mount.
   */
  private getStartup(): Promise<Startup> {
    if (this.startup === null) {
      this.startup = this.init()
      void this.startup.then((startup) => {
        if ('failure' in startup) {
          console.error(`[wsl-keepalive] cannot run: ${startup.failure.detail}`)
        }
      })
    }
    return this.startup
  }

  /**
   * The status payload for a startup refusal: every scalar is `null`/false, the
   * localization code and its params drive the browser copy, and `error` keeps
   * the raw detail for the log and for a client that predates `errorCode`.
   */
  private static failureStatus(failure: StartupFailure, label: string): KeepAliveStatus {
    return {
      running: false,
      pids: [],
      pid: null,
      distro: label,
      wslExecPath: null,
      distName: null,
      userName: null,
      error: failure.detail,
      errorCode: failure.code,
      errorParams: failure.params ?? null,
    }
  }

  /**
   * Config path: `${DSH_HOME}/wsl-keepalive.json` when DSH_HOME is set,
   * otherwise `~/.dsh/wsl-keepalive.json`. Keeps the same file the older
   * version used while honoring the DSH profile tree convention.
   */
  private configPath(): string {
    const dshHome = process.env.DSH_HOME
    if (dshHome) return `${dshHome}/${this.CONFIG_NAME}`
    const home = process.env.HOME || homedir()
    return home ? `${home}/.dsh/${this.CONFIG_NAME}` : this.CONFIG_NAME
  }

  private defaultConfig(): Record<string, string> {
    return { 'wsl-dist-name': '', 'wsl-user-name': '', 'wsl-exec-path': '' }
  }

  private async loadConfig(): Promise<Record<string, string>> {
    const empty = this.defaultConfig()
    try {
      const text = await fsp.readFile(this.configPath(), 'utf-8')
      const parsed = JSON.parse(text || '{}') as Record<string, unknown>
      return {
        'wsl-dist-name': typeof parsed['wsl-dist-name'] === 'string' ? parsed['wsl-dist-name'] : '',
        'wsl-user-name': typeof parsed['wsl-user-name'] === 'string' ? parsed['wsl-user-name'] : '',
        'wsl-exec-path': typeof parsed['wsl-exec-path'] === 'string' ? parsed['wsl-exec-path'] : '',
      }
    } catch {
      return empty
    }
  }

  private async saveConfig(cfg: Record<string, string>): Promise<boolean> {
    try {
      await fsp.writeFile(this.configPath(), JSON.stringify(cfg, null, 2), 'utf-8')
      return true
    } catch (e) {
      console.error('saveConfig failed:', String((e && (e as Error).message) || e))
      return false
    }
  }

  private pathExists(p: string): boolean {
    return existsSync(p)
  }

  private labelPromise: Promise<string> | null = null

  private getLabel(): Promise<string> {
    if (this.labelPromise !== null) return this.labelPromise
    this.labelPromise = (async () => {
      try {
        const osRelease = await fsp.readFile('/etc/os-release', 'utf-8')
        const m = /^ID=(.*)$/m.exec(osRelease)
        const id = m ? m[1].trim().replace(/"/g, '') : ''
        return id ? (id.charAt(0).toUpperCase() + id.slice(1)) : 'WSL'
      } catch {
        return 'WSL'
      }
    })()
    return this.labelPromise
  }

  /**
   * Decode a captured command stream. `wsl.exe` emits UTF-16LE (with or without
   * a BOM) whenever its stdout is piped rather than written to a console, so a
   * naive UTF-8 decode yields `a\0r\0c\0…` and a distro list never matches.
   * Detect the UTF-16LE signature (BOM, or interleaved nulls between ASCII
   * bytes) and decode as UTF-16LE; everything else — Linux commands such as
   * `pgrep` / `id` / `kill` — is UTF-8.
   */
  private decodeOutput(buf: Buffer | null | undefined): string {
    if (buf === null || buf === undefined || buf.length === 0) return ''
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2)
    const sample = Math.min(buf.length, 128)
    let nulls = 0
    for (let i = 0; i + 1 < sample; i += 2) if (buf[i + 1] === 0) nulls++
    if (nulls >= Math.floor(sample / 4)) return buf.toString('utf16le')
    return buf.toString('utf8')
  }

  /** Run a command via the host's own shell (never sandboxed, host-plane). */
  private runCommand(command: string, timeoutMs: number): Promise<CommandResult> {
    return new Promise((resolve) => {
      exec(
        command,
        { timeout: timeoutMs, maxBuffer: 64 * 1024, encoding: 'buffer' },
        (error: ExecException | null, stdout, stderr) => {
          const out = this.decodeOutput(stdout)
          const err = this.decodeOutput(stderr)
          if (error === null) {
            resolve({ exitCode: 0, stdout: out, stderr: err, infraError: null })
            return
          }
          // A string `code` means the process failed to spawn (missing binary,
          // permission), i.e. an infra failure rather than a command result.
          if (error.killed) {
            resolve({ exitCode: null, stdout: out, stderr: err, infraError: `command killed after ${timeoutMs}ms` })
          } else if (typeof error.code === 'string') {
            resolve({ exitCode: null, stdout: out, stderr: err, infraError: `spawn failed: ${error.code}` })
          } else {
            resolve({ exitCode: typeof error.code === 'number' ? error.code : 1, stdout: out, stderr: err, infraError: null })
          }
        },
      )
    })
  }

  /** Shell-quote a value for safe interpolation into the exec command line. */
  private static shq(s: string): string {
    return `'${String(s).replace(/'/g, `'\\''`)}'`
  }

  /** Resolve the wsl.exe path to use: configured value, else the fallback if present, else null. */
  private async resolveExec(): Promise<string | null> {
    const cfg = await this.loadConfig()
    const exe = cfg['wsl-exec-path'] || this.config.wslExecPath || ''
    if (exe) return exe
    if (this.pathExists(this.FALLBACK_WSL_EXE)) return this.FALLBACK_WSL_EXE
    return null
  }

  /**
   * Validate a wsl.exe path value: empty means auto-detect (allowed);
   * non-empty must exist. Returns a structured error (localization code +
   * params), never a hardcoded string, so the client owns the language.
   */
  private async validateWslExecPath(value: string): Promise<KeepAliveValidationError | null> {
    const trimmed = value.trim()
    if (trimmed === '') return null
    if (!this.pathExists(trimmed)) return { code: 'errWslPathMissing', params: { path: trimmed } }
    return null
  }

  /**
   * Validate a distro name: empty means the default distro (allowed); non-empty
   * must be installed. Returns a structured error, not a hardcoded string.
   */
  private async validateDistro(value: string): Promise<KeepAliveValidationError | null> {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const exe = await this.resolveExec()
    if (!exe) return { code: 'errWslExecUnavailable' }
    const r = await this.runCommand(`${KeepAliveService.shq(exe)} -l -q`, 20000)
    if (r.infraError) return { code: 'errCommandFailed', params: { detail: r.infraError } }
    if (r.exitCode !== 0) return { code: 'errListDistrosFailed' }
    const names = r.stdout
      .split(/\r?\n/g)
      .map((l) => l.trim().replace(/^\*\s*/, '').replace(/^\uFEFF/, ''))
      .filter(Boolean)
    if (!names.includes(trimmed)) return { code: 'errDistroMissing', params: { distro: trimmed } }
    return null
  }

  /**
   * Validate a user name inside a distro: empty means the distro default
   * (allowed); non-empty must exist. Returns a structured error.
   */
  private async validateUser(value: string, distro: string): Promise<KeepAliveValidationError | null> {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const exe = await this.resolveExec()
    if (!exe) return { code: 'errWslExecUnavailable' }
    const distArg = distro ? ` -d ${KeepAliveService.shq(distro)}` : ''
    // `id -u <user>` prints the uid and exits 0 when the user exists; otherwise non-zero / empty.
    const r = await this.runCommand(`${KeepAliveService.shq(exe)}${distArg} id -u ${KeepAliveService.shq(trimmed)}`, 20000)
    if (r.infraError) return { code: 'errCommandFailed', params: { detail: r.infraError } }
    if (r.exitCode !== 0 || r.stdout.trim() === '') {
      return distro
        ? { code: 'errUserMissingInDistro', params: { user: trimmed, distro } }
        : { code: 'errUserMissingInDefault', params: { user: trimmed } }
    }
    return null
  }

  /**
   * Startup sequence: first check the environment (refuse if not WSL), then
   * resolve wsl-exec-path / wsl-dist-name / wsl-user-name. When wsl-exec-path is
   * unset, check the fallback path; if present write it into the config,
   * otherwise error.
   */
  private async init(): Promise<Startup> {
    // 1) Environment gate: refuse immediately outside WSL. The refusal travels
    // as a localization code plus the one fact it needs (`kernel`); the English
    // sentence stays for the log and for pre-`errorCode` clients.
    const env = checkWslEnv()
    if (!env.ok) {
      const detail = env.reason ?? `Not a WSL environment; this plugin cannot run (${env.detail})`
      console.error(`[wsl-keepalive] refused to run: ${detail}`)
      return { failure: { code: 'envNotWsl', params: { kernel: env.kernel || 'unknown' }, detail } }
    }

    // 2) Resolve wsl-exec-path / wsl-dist-name / wsl-user-name.
    const cfg = await this.loadConfig()
    let exe = cfg['wsl-exec-path'] || this.config.wslExecPath || ''
    if (!exe) {
      if (this.pathExists(this.FALLBACK_WSL_EXE)) {
        exe = this.FALLBACK_WSL_EXE
        cfg['wsl-exec-path'] = exe
        await this.saveConfig(cfg)
        console.log('wsl-exec-path was unset; auto-wrote:', exe)
      } else {
        const detail = `wsl-exec-path unset and ${this.FALLBACK_WSL_EXE} does not exist; cannot start keep-alive`
        console.error(detail)
        return { failure: { code: 'errWslExecMissing', params: { fallback: this.FALLBACK_WSL_EXE }, detail } }
      }
    }
    return {
      wslExecPath: exe,
      distName: cfg['wsl-dist-name'] || this.config.wslDistName || '',
      userName: cfg['wsl-user-name'] || this.config.wslUserName || '',
    }
  }

  private async queryStatus(): Promise<{ running: boolean; pids: string[]; infraError: string | null }> {
    const r = await this.runCommand('pgrep -x dbus-daemon', 15000)
    const pids = r.stdout.trim().split(/\s+/).filter(Boolean)
    this.lastPids = pids
    return { running: r.exitCode === 0 && pids.length > 0, pids, infraError: r.infraError }
  }

  /** Query keep-alive status (including the PIDs recorded in memory). */
  async status(): Promise<KeepAliveStatus> {
    const init = await this.getStartup()
    // A startup refusal is terminal for this plugin: no process query is
    // attempted, so the browser gets the structured refusal instead of a
    // misleading "not running".
    if ('failure' in init) return KeepAliveService.failureStatus(init.failure, await this.getLabel())
    const status = await this.queryStatus()
    return {
      running: status.running,
      pids: this.lastPids,
      pid: this.lastPids.length > 0 ? this.lastPids[0] : null,
      distro: await this.getLabel(),
      wslExecPath: init.wslExecPath,
      distName: init.distName,
      userName: init.userName,
      error: status.infraError,
      errorCode: status.infraError === null ? null : 'errCommandFailed',
      errorParams: status.infraError === null ? null : { detail: status.infraError },
    }
  }

  /** Read the current command config (file values take precedence over mount config). */
  async getConfig(): Promise<KeepAliveConfigView> {
    const cfg = await this.loadConfig()
    return {
      distName: cfg['wsl-dist-name'] || this.config.wslDistName || '',
      userName: cfg['wsl-user-name'] || this.config.wslUserName || '',
      wslExecPath: cfg['wsl-exec-path'] || this.config.wslExecPath || '',
    }
  }

  /**
   * Update the command config. Every present field is validated at runtime:
   * if the distro / user / wsl.exe does not resolve, the whole update is
   * rejected (nothing is written) and the rejection reason is returned so the
   * UI can revert the field and prompt the error. Only on full success is the
   * config persisted to disk.
   */
  async updateConfig(update: KeepAliveConfigUpdate): Promise<KeepAliveConfigResult> {
    const current = await this.getConfig()
    const next: KeepAliveConfigView = {
      distName: current.distName,
      userName: current.userName,
      wslExecPath: current.wslExecPath,
    }

    if (update.distName !== undefined) {
      const distro = (update.distName ?? '').trim()
      const err = await this.validateDistro(distro)
      if (err) return { ok: false, field: 'distName', code: err.code, params: err.params }
      next.distName = distro
    }
    if (update.userName !== undefined) {
      const userName = (update.userName ?? '').trim()
      // Validate against the distro being set in this same request, else the current one.
      const distroForCheck = update.distName !== undefined ? (update.distName ?? '').trim() : current.distName
      const err = await this.validateUser(userName, distroForCheck)
      if (err) return { ok: false, field: 'userName', code: err.code, params: err.params }
      next.userName = userName
    }
    if (update.wslExecPath !== undefined) {
      const wslExecPath = (update.wslExecPath ?? '').trim()
      const err = await this.validateWslExecPath(wslExecPath)
      if (err) return { ok: false, field: 'wslExecPath', code: err.code, params: err.params }
      next.wslExecPath = wslExecPath
    }

    const cfg: Record<string, string> = {
      'wsl-dist-name': next.distName,
      'wsl-user-name': next.userName,
      'wsl-exec-path': next.wslExecPath,
    }
    const saved = await this.saveConfig(cfg)
    if (!saved) return { ok: false, code: 'errSaveConfigFailed' }
    // The startup sequence cached the previous distro/user/exe; invalidate it so
    // the next status/set re-resolves from the freshly persisted config.
    this.startup = null
    return { ok: true, config: next }
  }

  /**
   * Stop keep-alive: kill each dbus-daemon PID recorded in memory one by one.
   * Only stops the processes recorded/detected by this plugin.
   */
  private async stopPids(): Promise<void> {
    const targets = this.lastPids.length > 0
      ? this.lastPids
      : (await this.queryStatus()).pids
    if (targets.length === 0) return
    for (const pid of targets) {
      await this.runCommand(`kill ${pid} 2>/dev/null; true`, 10000)
    }
  }

  /** Toggle keep-alive: enabled=true starts (dedupes, then runs wsl.exe --exec dbus-launch true), false stops (precisely stops recorded PIDs). */
  async set(enabled: boolean): Promise<KeepAliveStatus> {
    const init = await this.getStartup()
    if ('failure' in init) return KeepAliveService.failureStatus(init.failure, await this.getLabel())
    const label = await this.getLabel()
    const before = await this.queryStatus()

    if (enabled) {
      if (before.running) {
        return { running: true, pids: this.lastPids, pid: this.lastPids[0] || null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, userName: init.userName, error: null, errorCode: null, errorParams: null }
      }
      const dist = init.distName
      const user = init.userName
      const distArg = dist ? ` -d ${KeepAliveService.shq(dist)}` : ''
      const userArg = user ? ` --user ${KeepAliveService.shq(user)}` : ''
      const cmd = `${KeepAliveService.shq(init.wslExecPath)}${distArg}${userArg} --exec dbus-launch true`
      const r = await this.runCommand(cmd, 30000)
      if (r.infraError) {
        return { running: false, pids: [], pid: null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, userName: init.userName, error: r.infraError, errorCode: 'errCommandFailed', errorParams: { detail: r.infraError } }
      }
      if (r.exitCode !== 0) {
        // Surface the exact reason (the command + stderr) so the failure is actionable.
        const detail = r.stderr.trim() || r.stdout.trim() || '(no output)'
        const message = `start failed: ${cmd} -> exit ${String(r.exitCode)}: ${detail}`
        console.error(`[wsl-keepalive] ${message}`)
        return { running: false, pids: [], pid: null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, userName: init.userName, error: message, errorCode: 'errStartFailed', errorParams: { exit: String(r.exitCode), detail } }
      }
      const after = await this.queryStatus()
      return {
        running: after.running,
        pids: this.lastPids,
        pid: this.lastPids[0] || null,
        distro: label,
        wslExecPath: init.wslExecPath,
        distName: init.distName,
        userName: init.userName,
        error: after.infraError,
        errorCode: after.infraError === null ? null : 'errCommandFailed',
        errorParams: after.infraError === null ? null : { detail: after.infraError },
      }
    }

    await this.stopPids()
    const after = await this.queryStatus()
    return { running: after.running, pids: this.lastPids, pid: this.lastPids[0] || null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, userName: init.userName, error: after.infraError, errorCode: after.infraError === null ? null : 'errCommandFailed', errorParams: after.infraError === null ? null : { detail: after.infraError } }
  }
}
