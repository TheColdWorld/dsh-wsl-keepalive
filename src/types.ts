/**
 * Minimal structural type set — this plugin deliberately does not import any
 * @deepseek-ai/* or node:http package (except react in the client components,
 * which is required at runtime). It only uses these local structural surfaces
 * to interact with the host, keeping external dependencies to a minimum.
 * Types are erased at build time, with zero extra runtime dependencies.
 * @module wsl-keepalive/types
 */

/** Minimal host ctx surface (only declares the methods this plugin uses). */
export interface ContextLike {
  get(name: string): unknown
  effect(fn: () => unknown, label?: string): unknown
}

/** Minimal shell service surface (resolve/run). */
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

/** Minimal fs service surface (resolve/readText/writeText). */
export interface FsLike {
  resolve(path: string): Promise<unknown>
  readText(target: unknown): Promise<string>
  writeText(target: unknown, content: string): Promise<unknown>
}

/** Minimal webServer service surface (route registration). */
export interface WebServerLike {
  register(route: WebRouteLike): unknown
}

/** Minimal HTTP request surface (only uses method/on). */
export interface IncomingMessageLike {
  method?: string
  on(event: string, listener: (...args: unknown[]) => void): unknown
}

/** Minimal HTTP response surface (only uses writeHead/end). */
export interface ServerResponseLike {
  writeHead(status: number, headers?: Record<string, string>): unknown
  end(body?: string): unknown
}

/** Minimal WebRoute shape (matches @deepseek-ai/dsh-host-webserver's exact routes). */
export interface WebRouteLike {
  kind: 'exact'
  path: string
  handler: (req: IncomingMessageLike, res: ServerResponseLike) => void
}

/** Minimal client root ctx surface. */
export interface ClientContextLike {
  get(name: string): unknown
  inject(deps: readonly string[], fn: (scope: ClientContextLike) => void): unknown
  effect(fn: () => unknown, label?: string): unknown
}

/** Minimal slots service surface (register settings rows). */
export interface SlotsLike {
  register(
    registration: { name: string; id: string; order?: number; inject?: () => unknown },
    render: (props: unknown) => unknown,
  ): unknown
}
