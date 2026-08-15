/**
 * wsl-keepalive host service — 保活核心逻辑（由动态插件版迁移）：
 * 读取/写入 ~/.dsh/wsl-keepalive.json，内存记录 dbus-daemon PID，
 * 执行 status/start/stop 三条命令。不 import 外部包，只用本地结构类型。
 * @module wsl-keepalive/service
 */

import type { ContextLike, FsLike, ShellLike } from './types.ts'

/** 插件配置：可由 cordis.patch.yml 行配置覆盖，文件值优先。 */
export interface KeepAliveConfig {
  /** 目标 WSL 发行版名；非空时启动命令追加 `-d <name>`。 */
  wslDistName?: string
  /** wsl.exe 绝对路径；未配置时启动期自动探测并写入配置文件。 */
  wslExecPath?: string
}

/** 返回给浏览器的保活状态（纯 JSON 标量）。 */
export interface KeepAliveStatus {
  running: boolean
  pids: string[]
  pid: string | null
  distro: string
  wslExecPath: string | null
  distName: string | null
  error: string | null
}

/** 一次命令执行的结果（已提取标量，不含运行时对象）。 */
interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  infraError: string | null
}

/** 启动期解析结果。 */
type Startup = { wslExecPath: string; distName: string } | { error: string }

export class KeepAliveService {
  private readonly ctx: ContextLike
  private readonly config: KeepAliveConfig
  private readonly CONFIG_NAME = 'wsl-keepalive.json'
  private readonly FALLBACK_WSL_EXE = '/mnt/c/Windows/System32/wsl.exe'

  /** 内存中记录的 dbus-daemon PID（每次 status 查询后更新）。 */
  private lastPids: string[] = []

  /** 启动序列（解析 wsl-exec-path / wsl-dist-name），只执行一次。 */
  private readonly startup: Promise<Startup>

  constructor(ctx: ContextLike, config: KeepAliveConfig = {}) {
    this.ctx = ctx
    this.config = config
    this.startup = this.init()
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

  /** 配置路径：~/.dsh/wsl-keepalive.json（与 dsh-ssh 插件一致）。 */
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
   * 启动序列：解析 wsl-exec-path / wsl-dist-name。
   * 若 wsl-exec-path 未配置：检查回退路径，存在则写入配置，否则报错（服务进入错误态）。
   */
  private async init(): Promise<Startup> {
    const cfg = await this.loadConfig()
    let exe = cfg['wsl-exec-path'] || this.config.wslExecPath || ''
    if (!exe) {
      if (await this.pathExists(this.FALLBACK_WSL_EXE)) {
        exe = this.FALLBACK_WSL_EXE
        cfg['wsl-exec-path'] = exe
        await this.saveConfig(cfg)
        console.log('wsl-exec-path 未配置，已自动写入:', exe)
      } else {
        const error = `未配置 wsl-exec-path 且 ${this.FALLBACK_WSL_EXE} 不存在，无法启动保活`
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

  /** 查询保活状态（含内存记录的 PID）。 */
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
   * 停止保活：对内存中记录的 dbus-daemon PID 逐个精确 kill。
   * 只停本插件记录/检测到的进程，不用 pkill 无差别终止所有 dbus-daemon。
   */
  private async stopPids(): Promise<void> {
    const targets = this.lastPids.length > 0
      ? this.lastPids
      : (await this.queryStatus()).pids
    if (targets.length === 0) return
    // 逐 PID 精确终止；对已被系统 dbus 使用的 PID 无效时静默忽略（避免误伤）。
    for (const pid of targets) {
      await this.runCommand(`kill ${pid} 2>/dev/null; true`, 10000)
    }
  }

  /** 切换保活：enabled=true 启动（查重后执行 wsl.exe --exec dbus-launch true），false 停止（精确停止记录的 PID）。 */
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
        error: r.exitCode === 0 ? null : `启动失败 (exit ${String(r.exitCode)}): ${r.stderr.trim()}`,
      }
    }

    await this.stopPids()
    const after = await this.queryStatus()
    return { running: after.running, pids: this.lastPids, pid: this.lastPids[0] || null, distro: label, wslExecPath: init.wslExecPath, distName: init.distName, error: null }
  }
}
