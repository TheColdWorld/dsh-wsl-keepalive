/**
 * 最小结构类型集 — 本插件刻意不 import 任何 @deepseek-ai/* 或 node:http 包
 * （除 client 组件里的 react，那是运行时必需），只用这些本地结构面与宿主交互，
 * 把外部引用降到最低。类型在构建时被擦除，运行时零额外依赖。
 * @module wsl-keepalive/types
 */

/** 最小化的宿主 ctx 面（只声明本插件用到的方法）。 */
export interface ContextLike {
  get(name: string): unknown
  effect(fn: () => unknown, label?: string): unknown
}

/** 最小化的 shell 服务面（resolve/run）。 */
export interface ShellLike {
  resolve(request: { command: string; timeoutMs?: number; stdoutMaxBytes?: number }): {
    command: string
    timeoutMs: number
    stdoutMaxBytes: number
  }
  run(spec: { command: string; timeoutMs: number; stdoutMaxBytes: number }): Promise<{
    exitCode: number | null
    stdout: { text: string }
    stderr: { text: string }
  }>
}

/** 最小化的 fs 服务面（resolve/readText/writeText）。 */
export interface FsLike {
  resolve(path: string): Promise<unknown>
  readText(target: unknown): Promise<string>
  writeText(target: unknown, content: string): Promise<unknown>
}

/** 最小化的 webServer 服务面（register 路由）。 */
export interface WebServerLike {
  register(route: WebRouteLike): unknown
}

/** 最小化的 HTTP 请求面（只用 method/on）。 */
export interface IncomingMessageLike {
  method?: string
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

/** 最小化的 HTTP 响应面（只用 writeHead/end）。 */
export interface ServerResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
}

/** 最小化的 WebRoute 形状（与 @deepseek-ai/dsh-host-webserver 的 exact 路由一致）。 */
export interface WebRouteLike {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessageLike, res: ServerResponseLike) => void
}

/** 最小化的 client 根 ctx 面。 */
export interface ClientContextLike {
  get(name: string): unknown
  inject(deps: readonly string[], fn: (scope: ClientContextLike) => void): unknown
  effect(fn: () => unknown, label?: string): unknown
}

/** 最小化的 slots 服务面（register 设置行）。 */
export interface SlotsLike {
  register(
    registration: { name: string; id: string; order?: number; inject?: () => unknown },
    render: (props: unknown) => unknown,
  ): unknown
}
