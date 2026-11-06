/**
 * wsl.exe execution: argument arrays only, UTF-16LE decoding, bounded output.
 * @module dsh-wsl-keepalive/wsl
 */

import { execFile } from 'node:child_process'

export const DEFAULT_WSL_EXE = '/mnt/c/Windows/System32/wsl.exe'

export interface WslResult {
  code: number | null
  stdout: string
  stderr: string
  error: string | null
}

/** Raw byte result for callers that must compare file contents exactly. */
export interface WslRawResult {
  code: number | null
  stdout: Buffer
  stderr: Buffer
  error: string | null
}

function decodeOutput(buf: Buffer | null | undefined): string {
  if (buf === null || buf === undefined || buf.length === 0) return ''
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le', 2)
  const sample = Math.min(buf.length, 128)
  let nulls = 0
  for (let i = 0; i + 1 < sample; i += 2) if (buf[i + 1] === 0) nulls++
  if (nulls >= Math.floor(sample / 4)) return buf.toString('utf16le')
  return buf.toString('utf8')
}

function execute(execPath: string, args: string[], timeoutMs: number): Promise<WslRawResult> {
  return new Promise((resolve) => {
    execFile(
      execPath,
      args,
      { timeout: timeoutMs, maxBuffer: 64 * 1024, encoding: 'buffer' },
      (error, stdout, stderr) => {
        const out = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '')
        const err = Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr ?? '')
        if (error === null) {
          resolve({ code: 0, stdout: out, stderr: err, error: null })
          return
        }
        if (error.killed) {
          resolve({ code: null, stdout: out, stderr: err, error: 'command killed after ' + timeoutMs + 'ms' })
          return
        }
        if (typeof error.code === 'string') {
          resolve({ code: null, stdout: out, stderr: err, error: 'spawn failed: ' + error.code })
          return
        }
        resolve({ code: typeof error.code === 'number' ? error.code : 1, stdout: out, stderr: err, error: null })
      },
    )
  })
}

/** Run wsl.exe and keep stdout/stderr as exact bytes. */
export function runWslRaw(execPath: string, args: string[], timeoutMs = 20000): Promise<WslRawResult> {
  return execute(execPath, args, timeoutMs)
}

export async function runWsl(execPath: string, args: string[], timeoutMs = 20000): Promise<WslResult> {
  const raw = await execute(execPath, args, timeoutMs)
  return {
    code: raw.code,
    stdout: decodeOutput(raw.stdout),
    stderr: decodeOutput(raw.stderr),
    error: raw.error,
  }
}

export function distroArgs(distro: string | null): string[] {
  return distro === null || distro.trim() === '' ? [] : ['-d', distro]
}

export function userArgs(distro: string | null, userName: string): string[] {
  return [...distroArgs(distro), ...(userName.trim() === '' ? [] : ['--user', userName.trim()])]
}
