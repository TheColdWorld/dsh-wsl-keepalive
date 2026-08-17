/**
 * wsl-keepalive host service — the keep-alive core logic (migrated from the
 * dynamic-plugin version). Reads/writes ~/.dsh/wsl-keepalive.json, records the
 * dbus-daemon PIDs in memory, and runs the status/start/stop commands.
 * Does not import external packages, only local structural types.
 * @module wsl-keepalive/service
 */

import type { ContextLike, FsLike, ShellLike } from './types.ts'
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
  private readonly ctx: ContextLike
  private readonly config: KeepAliveConfig
  private readonly CONFIG_NAME = 'wsl-keepalive.json'
  private readonly FALLBACK_WSL_EXE = '/mnt/c/Windows/System32/wsl.exe'

  /** dbus-daemon PIDs recorded in memory (updated after each status query). */
  private lastPids: string[] = []

  /** Startup sequence (resolve wsl-exec-path / wsl-dist-name), run once. */
  private readonly startup: Promise<Startup>

  constructor(ctx: ContextLike, config: KeepAliveConfig = {}) {
    this.ctx = ctx
    this.config = config
    this.startup = this.init()
    void this.startup.then((startup) => {
      if ('error' in startup) {
        // Non-WSL environment or wsl.exe unreachable: log a clear reason and enter the error state.
        console.error(`[wsl-keepalive] cannot run: ${startup.error}`)
      }
    })
  }

  private get shell(): ShellLike | undefined {
    return this.ctx.get('shell') as ShellLike | undefined
  }

  private get fsService(): FsLike | undefined {
    return this.ctx.get('fs') as FsLike | undefined
  }

  private async runCommand(command: string, timeoutMs: number): Promise<CommandResult> {
    const shell = this.shell
    if (shell === undefined) {
      return { exitCode: null, stdout: '', stderr: '', infraError: 'shell service unavailable' }
    }
    try {
      const spec = shell.resolve({ command, timeoutMs, stdoutMaxBytes: 65536 })
      const res = await shell.run(spec)
      return {
        exitCode: res.exitCode,
        stdout: (res.stdout && res.stdout.text) || '',
        stderr: (res.stderr && res.stderr.text) || '',
        infraError: null,
      }
    } catch (e) {
      return { exitCode: null, stdout: '', stderr: '', infraError: String((e && (e as Error).message) || e) }
    }
  }

  /** Config path: ~/.dsh/wsl-keepalive.json (consistent with the dsh-ssh plugin). */
  private async configPath(): Promise<string> {
    const r = await this.runCommand('printenv HOME', 5000)
    const home = r.stdout.trim()
    return home ? `${home}/.dsh/${this.CONFIG_NAME}` : this.CONFIG_NAME
  }

  private async loadConfig(): Promise<Record<string, string>> {
    const empty: Record<string, string> = { 'wsl-dist-name': '', 'wsl-exec-path': '' }
    if (this.fsService === undefined) return empty
    const path = await this.configPath()
    try {
      const target = await this.fsService.resolve(path)
      const text = await this.fsService.readText(target)
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
    if (this.fsService === undefined) return false
    const path = await this.configPath()
    try {
      const target = await this.fsService.resolve(path)
      await this.fsService.writeText(target, JSON.stringify(cfg, null, 2))
      return true
    } catch (e) {
      console.error('saveConfig failed:', String((e && (e as Error).message) || e))
      return false
    }
  }

  private async pathExists(p: string): Promise<boolean> {
    const r = await this.runCommand(`test -e ${p} && echo yes`, 10000)
    return r.stdout.trim() === 'yes'
  }

  private labelPromise: Promise<string> | null = null

  private getLabel(): Promise<string> {
    if (this.labelPromise !== null) return this.labelPromise
    this.labelPromise = (async () => {
      if (this.shell === undefined) return 'WSL'
      const r = await this.runCommand('grep ^ID= /etc/os-release | cut -d= -f2', 10000)
      const id = r.stdout.trim()
      return id ? (id.charAt(0).toUpperCase() + id.slice(1)) : 'WSL'
    })()
    return this.labelPromise
  }

  /**
   * Startup sequence: first run the environment check (refuse if not WSL), then
   * resolve wsl-exec-path / wsl-dist-name. When wsl-exec-path is unset, check the
   * fallback path; if present write it into the config, otherwise error (the
   * service enters an error state).
   */
  private async init(): Promise<Startup> {
    // 1) Environment gate: refuse immediately outside WSL with a human-readable reason.
    const env = await checkWslEnv(this.shell, this.fsService)
    if (!env.ok) {
      const error = env.reason ?? `Not a WSL environment; this plugin cannot run (${env.detail})`
      console.error(`[wsl-keepalive] refused to run: ${error}`)
      return { error }
    }

    // 2) Resolve wsl-exec-path / wsl-dist-name.
    const cfg = await this.loadConfig()
    let exe = cfg['wsl-exec-path'] || this.config.wslExecPath || ''
    if (!exe) {
      if (await this.pathExists(this.FALLBACK_WSL_EXE)) {
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
    const init = await this.startup
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
   * Only stops the processes recorded/detected by this plugin; it never uses
   * pkill to indiscriminately terminate every dbus-daemon.
   */
  private async stopPids(): Promise<void> {
    const targets = this.lastPids.length > 0
      ? this.lastPids
      : (await this.queryStatus()).pids
    if (targets.length === 0) return
    // Terminate precisely per PID; silently ignore PIDs no longer valid to avoid harming system dbus.
    for (const pid of targets) {
      await this.runCommand(`kill ${pid} 2>/dev/null; true`, 10000)
    }
  }

  /** Toggle keep-alive: enabled=true starts (dedupes, then runs wsl.exe --exec dbus-launch true), false stops (precisely stops recorded PIDs). */
  async set(enabled: boolean): Promise<KeepAliveStatus> {
    const init = await this.startup
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
      const after = await this.queryStatus()
      return {
        running: after.running,
        pids: this.lastPids,
        pid: this.lastPids[0] || null,
        distro: label,
        wslExecPath: init.wslExecPath,
        distName: init.distName,
        error: r.exitCode === 0 ? null : `start failed (exit ${String(r.exitCode)}): ${r.stderr.trim()}`,
      }
    }

    await this.stopPids()
    const after = await this.queryStatus()
    return { running: after.running, pids: this.lastPids, pid: this.lastPids[0] || null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, error: null }
  }
}
