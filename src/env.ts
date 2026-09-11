/**
 * wsl-keepalive environment check — refuse to run outside a WSL environment.
 * The plugin relies on wsl.exe to interact between Windows and WSL, so it is
 * meaningless in a non-WSL environment (plain Linux distro / container / macOS
 * etc.) and should refuse at startup with a clear reason.
 *
 * The check runs on the host plane through Node's own primitives (exec/fs),
 * not through the model-facing `ctx.shell`/`ctx.fs` services.
 * @module wsl-keepalive/env
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

/** Environment check result: when ok=false, reason is always a human-readable message. */
export interface WslEnvResult {
  ok: boolean
  /** Human-readable failure reason when not in a WSL environment. */
  reason: string | null
  /** Short description for logs / debugging. */
  detail: string
  /**
   * Kernel release string read during detection (empty when unreadable). It is
   * the one concrete fact the client can localize a refusal with, so it travels
   * as a template param instead of being baked into an English sentence.
   */
  kernel: string
}

/** Safely read a short command's stdout (empty string on any failure). */
function readStdout(command: string, timeoutMs: number): string {
  try {
    return execSync(command, { timeout: timeoutMs, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

/**
 * Determine whether the current process runs inside WSL.
 * Detection (any match counts as WSL): the kernel release contains `microsoft`,
 * /etc/wsl.conf exists, or /mnt/c exists.
 */
export function checkWslEnv(): WslEnvResult {
  // 1) Kernel signature (both WSL1 and WSL2 kernels contain "microsoft").
  const kernel = readStdout('uname -r', 10000)
  const kernelIsWsl = /microsoft/i.test(kernel)

  // 2) Linux-side watchdog files: /etc/wsl.conf and /mnt/c (both WSL markers).
  const hasWslConf = existsSync('/etc/wsl.conf')
  const hasMountC = existsSync('/mnt/c')
  const isWsl = kernelIsWsl || hasWslConf || hasMountC

  if (isWsl) {
    const detail = kernel
      ? `WSL kernel (${kernel})`
      : hasWslConf
        ? 'detected /etc/wsl.conf'
        : 'detected /mnt/c (Windows mount)'
    return { ok: true, reason: null, detail, kernel }
  }

  const kernelText = kernel ? `kernel "${kernel}"` : 'unable to read kernel version'
  const detail = `${kernelText}, and no WSL markers detected (microsoft kernel signature / /etc/wsl.conf / /mnt/c)`
  const reason =
    'This is not a WSL environment: this plugin depends on wsl.exe to interact between Windows and WSL ' +
    `to keep the distro alive, so it cannot work outside WSL. Detected: ${kernelText}, and no WSL markers found. ` +
    'Please install this plugin only inside a WSL distro.'
  return { ok: false, reason, detail, kernel }
}
