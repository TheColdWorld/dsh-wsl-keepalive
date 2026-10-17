/**
 * wsl-keepalive host service — the keep-alive core logic. Reads the row's live
 * Volatile Config fields (distro / user / wsl.exe), records the dbus-daemon
 * PIDs in memory, and runs the status/start/stop commands against wsl.exe.
 *
 * Execution model: this is a **host admin action**, so it runs through Node's
 * own `child_process`, never through the model-facing `ctx.shell`/`ctx.fs`
 * services (which are per-session/agent-plane and run under the workspace
 * sandbox). Configuration comes from the row's projected Volatile Config, so
 * the Plugins page's own form is the single source of truth.
 * @module wsl-keepalive/service
 */

import { exec, type ExecException } from 'node:child_process'
import { existsSync, promises as fsp } from 'node:fs'
import type { Volatile } from '@deepseek-ai/cordis'
import { checkWslEnv } from './env.ts'

/** Live configuration references the settings service projects for this row. */
export interface KeepAliveConfigRefs {
  /** Target WSL distro name; empty uses the default distro. */
  wslDistName: Volatile<string>
  /** User (inside the target distro) to run the keep-alive process as; empty uses the distro default. */
  wslUserName: Volatile<string>
  /** Absolute path to wsl.exe; empty means auto-detect the fallback. */
  wslExecPath: Volatile<string>
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

/** Result of one command execution (scalars extracted, no runtime objects). */
interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  infraError: string | null
}

/** A structured startup failure: a localization code, its params, and the raw detail. */
interface StartupFailure {
  code: string
  params?: Record<string, string>
  detail: string
}

/** Startup parse result. */
type Startup =
  | { wslExecPath: string; distName: string; userName: string }
  | { failure: StartupFailure }

export class KeepAliveService {
  private readonly FALLBACK_WSL_EXE = '/mnt/c/Windows/System32/wsl.exe'

  /** dbus-daemon PIDs recorded in memory (updated after each status query). */
  private lastPids: string[] = []

  private labelPromise: Promise<string> | null = null

  /** @param config - the row's live Volatile Config references. */
  constructor(private readonly config: KeepAliveConfigRefs) {}

  /**
   * Resolve startup facts from the live Config. Re-read on every status/set so
   * a settings-form edit takes effect without a restart (read-only diagnostics
   * are cheap: /proc/version plus one existsSync).
   */
  private getStartup(): Promise<Startup> {
    return this.init().then((startup) => {
      if ('failure' in startup) console.error(`[wsl-keepalive] cannot run: ${startup.failure.detail}`)
      return startup
    })
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
   * naive UTF-8 decode yields `a\0r\0c\0…`. Detect the UTF-16LE signature
   * (BOM, or interleaved nulls between ASCII bytes) and decode as UTF-16LE;
   * everything else — Linux commands such as `pgrep` / `id` / `kill` — is UTF-8.
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

  /** Run a command via the host's own shell (host-plane, not sandboxed). */
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

  /** Resolve the wsl.exe path: configured value, else the fallback when it exists, else empty. */
  private resolveExec(): string {
    const configured = this.config.wslExecPath.get().trim()
    if (configured) return configured
    return existsSync(this.FALLBACK_WSL_EXE) ? this.FALLBACK_WSL_EXE : ''
  }

  /**
   * Startup sequence: resolve the wsl.exe candidate, then let the environment
   * check decide whether this host can actually run it. The check owns the
   * refusal code (interop / kernel / container), so the message matches the
   * client dictionary.
   */
  private async init(): Promise<Startup> {
    const exe = this.resolveExec()
    const env = checkWslEnv({ wslExecPath: exe, fallbackPath: this.FALLBACK_WSL_EXE })
    if (!env.ok) {
      const detail = env.detail
      console.error(`[wsl-keepalive] refused to run: ${detail}`)
      return { failure: { code: env.code, params: env.params ?? undefined, detail } }
    }
    return {
      wslExecPath: exe,
      distName: this.config.wslDistName.get().trim(),
      userName: this.config.wslUserName.get().trim(),
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
