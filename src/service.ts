/**
 * wsl-keepalive host service — the keep-alive core logic. Reads/writes
 * ~/.dsh/wsl-keepalive.json, records the dbus-daemon PIDs in memory, and runs
 * the status/start/stop commands against wsl.exe.
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
  error: string | null
}

/** Result of one command execution (scalars extracted, no runtime objects). */
interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  infraError: string | null
}

/** Startup parse result. */
type Startup = { wslExecPath: string; distName: string } | { error: string }

export class KeepAliveService {
  private readonly config: KeepAliveConfig
  private readonly CONFIG_NAME = 'wsl-keepalive.json'
  private readonly FALLBACK_WSL_EXE = '/mnt/c/Windows/System32/wsl.exe'

  /** dbus-daemon PIDs recorded in memory (updated after each status query). */
  private lastPids: string[] = []

  /** Startup sequence (resolve wsl-exec-path / wsl-dist-name), run once, lazily. */
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
        if ('error' in startup) {
          console.error(`[wsl-keepalive] cannot run: ${startup.error}`)
        }
      })
    }
    return this.startup
  }

  /** Config path: ~/.dsh/wsl-keepalive.json (consistent with the dsh-ssh plugin). */
  private configPath(): string {
    const home = process.env.HOME || homedir()
    return home ? `${home}/.dsh/${this.CONFIG_NAME}` : this.CONFIG_NAME
  }

  private defaultConfig(): Record<string, string> {
    return { 'wsl-dist-name': '', 'wsl-exec-path': '' }
  }

  private async loadConfig(): Promise<Record<string, string>> {
    const empty = this.defaultConfig()
    try {
      const text = await fsp.readFile(this.configPath(), 'utf-8')
      const parsed = JSON.parse(text || '{}') as Record<string, unknown>
      return {
        'wsl-dist-name': typeof parsed['wsl-dist-name'] === 'string' ? parsed['wsl-dist-name'] : '',
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

  /** Run a command via the host's own shell (never sandboxed, host-plane). */
  private runCommand(command: string, timeoutMs: number): Promise<CommandResult> {
    return new Promise((resolve) => {
      exec(command, { timeout: timeoutMs, maxBuffer: 64 * 1024 }, (error: ExecException | null, stdout, stderr) => {
        if (error === null) {
          resolve({ exitCode: 0, stdout: stdout ?? '', stderr: stderr ?? '', infraError: null })
          return
        }
        // A string `code` means the process failed to spawn (missing binary,
        // permission), i.e. an infra failure rather than a command result.
        if (error.killed) {
          resolve({ exitCode: null, stdout: stdout ?? '', stderr: stderr ?? '', infraError: `command killed after ${timeoutMs}ms` })
        } else if (typeof error.code === 'string') {
          resolve({ exitCode: null, stdout: stdout ?? '', stderr: stderr ?? '', infraError: `spawn failed: ${error.code}` })
        } else {
          resolve({ exitCode: typeof error.code === 'number' ? error.code : 1, stdout: stdout ?? '', stderr: stderr ?? '', infraError: null })
        }
      })
    })
  }

  /**
   * Startup sequence: first check the environment (refuse if not WSL), then
   * resolve wsl-exec-path / wsl-dist-name. When wsl-exec-path is unset, check
   * the fallback path; if present write it into the config, otherwise error.
   */
  private async init(): Promise<Startup> {
    // 1) Environment gate: refuse immediately outside WSL with a human-readable reason.
    const env = checkWslEnv()
    if (!env.ok) {
      const error = env.reason ?? `Not a WSL environment; this plugin cannot run (${env.detail})`
      console.error(`[wsl-keepalive] refused to run: ${error}`)
      return { error }
    }

    // 2) Resolve wsl-exec-path / wsl-dist-name.
    const cfg = await this.loadConfig()
    let exe = cfg['wsl-exec-path'] || this.config.wslExecPath || ''
    if (!exe) {
      if (this.pathExists(this.FALLBACK_WSL_EXE)) {
        exe = this.FALLBACK_WSL_EXE
        cfg['wsl-exec-path'] = exe
        await this.saveConfig(cfg)
        console.log('wsl-exec-path was unset; auto-wrote:', exe)
      } else {
        const error = `wsl-exec-path unset and ${this.FALLBACK_WSL_EXE} does not exist; cannot start keep-alive`
        console.error(error)
        return { error }
      }
    }
    return { wslExecPath: exe, distName: cfg['wsl-dist-name'] || this.config.wslDistName || '' }
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
    const status = await this.queryStatus()
    return {
      running: status.running,
      pids: this.lastPids,
      pid: this.lastPids.length > 0 ? this.lastPids[0] : null,
      distro: await this.getLabel(),
      wslExecPath: 'wslExecPath' in init ? init.wslExecPath : null,
      distName: 'wslExecPath' in init ? init.distName : null,
      error: 'error' in init ? init.error : status.infraError,
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
    if ('error' in init) {
      return { running: false, pids: [], pid: null, distro: 'WSL', wslExecPath: null, distName: null, error: init.error }
    }
    const label = await this.getLabel()
    const before = await this.queryStatus()

    if (enabled) {
      if (before.running) {
        return { running: true, pids: this.lastPids, pid: this.lastPids[0] || null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, error: null }
      }
      const dist = init.distName
      const cmd = `${init.wslExecPath}${dist ? ` -d ${dist}` : ''} --exec dbus-launch true`
      const r = await this.runCommand(cmd, 30000)
      if (r.infraError) {
        return { running: false, pids: [], pid: null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, error: r.infraError }
      }
      if (r.exitCode !== 0) {
        // Surface the exact reason (the command + stderr) so the failure is actionable.
        const detail = r.stderr.trim() || r.stdout.trim() || '(no output)'
        const message = `start failed: ${cmd} -> exit ${String(r.exitCode)}: ${detail}`
        console.error(`[wsl-keepalive] ${message}`)
        return { running: false, pids: [], pid: null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, error: message }
      }
      const after = await this.queryStatus()
      return {
        running: after.running,
        pids: this.lastPids,
        pid: this.lastPids[0] || null,
        distro: label,
        wslExecPath: init.wslExecPath,
        distName: init.distName,
        error: null,
      }
    }

    await this.stopPids()
    const after = await this.queryStatus()
    return { running: after.running, pids: this.lastPids, pid: this.lastPids[0] || null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, error: null }
  }
}
