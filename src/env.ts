/**
 * wsl-keepalive environment check — refuse to run outside a WSL environment.
 * The plugin relies on wsl.exe to interact between Windows and WSL (launching
 * dbus-daemon to keep the distro from going idle), so it is meaningless in a
 * non-WSL environment (plain Linux distro / container / macOS, etc.).
 * It should refuse at install/mount time with a clear reason.
 * @module wsl-keepalive/env
 */

import type { FsLike, ShellLike } from './types.ts'

/** Environment check result: when ok=false, reason is always a human-readable message. */
export interface WslEnvResult {
  ok: boolean
  /** Human-readable failure reason when not in a WSL environment. */
  reason: string | null
  /** Short description for logs / debugging. */
  detail: string
}

interface CommandOutcome {
  exitCode: number | null
  stdout: string
  infraError: string | null
}

/** Run a single shell command (captures errors, does not throw). */
async function probe(shell: ShellLike | undefined, command: string, timeoutMs: number): Promise<CommandOutcome> {
  if (shell === undefined) return { exitCode: null, stdout: '', infraError: 'shell service unavailable' }
  try {
    const spec = shell.resolve({ command, timeoutMs, stdoutMaxBytes: 65536 })
    const res = await shell.run(spec)
    return {
      exitCode: res.exitCode,
      stdout: (res.stdout && res.stdout.text) || '',
      infraError: null,
    }
  } catch (e) {
    return { exitCode: null, stdout: '', infraError: String((e && (e as Error).message) || e) }
  }
}

/** fs probe: whether a path exists. */
async function fsExists(fsService: FsLike | undefined, path: string): Promise<boolean> {
  if (fsService === undefined) return false
  try {
    const target = await fsService.resolve(path)
    await fsService.readText(target)
    return true
  } catch {
    return false
  }
}

/**
 * Determine whether the current process runs inside WSL.
 * Detection (any match counts as WSL): the kernel release contains `microsoft`,
 * /etc/wsl.conf exists, or /mnt/c exists.
 */
export async function checkWslEnv(
  shell: { run: ShellLike['run']; resolve: ShellLike['resolve'] } | undefined,
  fsService: FsLike | undefined,
): Promise<WslEnvResult> {
  // 1) Kernel signature (both WSL1 and WSL2 kernel versions contain "microsoft") — the most authoritative.
  const uname = await probe(shell as ShellLike | undefined, 'uname -r', 10000)
  const kernel = uname.stdout.trim()
  const kernelIsWsl = /microsoft/i.test(kernel)

  // 2) Linux-side watchdog file: /etc/wsl.conf (exclusive to WSL distros). Skip the fs probe once the kernel confirms WSL.
  const hasWslConf = kernelIsWsl || (await fsExists(fsService, '/etc/wsl.conf'))

  const isWsl = kernelIsWsl || hasWslConf

  if (isWsl) {
    return { ok: true, reason: null, detail: kernel ? `WSL kernel (${kernel})` : 'WSL markers detected (/etc/wsl.conf)' }
  }

  const kernelText = kernel ? `kernel "${kernel}"` : 'unable to read kernel version'
  const detail = `${kernelText}, and no WSL markers detected (microsoft kernel signature / /etc/wsl.conf)`
  const reason =
    'This is not a WSL environment: this plugin depends on wsl.exe to interact between Windows and WSL ' +
    `to keep the distro alive, so it cannot work outside WSL. Detected: ${kernelText}, and no /etc/wsl.conf found. ` +
    'Please install this plugin only inside a WSL distro.'
  return { ok: false, reason, detail }
}
