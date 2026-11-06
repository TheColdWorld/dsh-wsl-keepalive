/**
 * Canonical keep-alive script plus the exact bytes the Host compares.
 *
 * The plugin keeps exactly one external script per target. The Host reads the
 * target file as raw bytes and compares it character by character with the
 * canonical content; no checksum utility is required in the distro.
 * @module dsh-wsl-keepalive/script
 */

/** Script path below the target user's \`$HOME\`. */
export const KEEPALIVE_MARKER = '.cache/dsh-wsl-keepalive/keepalive.sh'

/** Directory below the target user's \`$HOME\`. */
export const KEEPALIVE_DIR = '.cache/dsh-wsl-keepalive'

/**
 * Canonical POSIX loop. The target-side writer emits these bytes plus one
 * trailing newline, which is included in {@link KEEPALIVE_SCRIPT_BYTES}.
 */
export const KEEPALIVE_SCRIPT = [
  '#!/bin/sh',
  'umask 077',
  'home="$HOME"',
  '[ -n "$home" ] || home=/tmp',
  'dir="$home/.cache/dsh-wsl-keepalive"',
  'pidfile="$dir/keepalive.pid"',
  'rm -f "$pidfile"',
  'echo $$ > "$pidfile"',
  'chmod 600 "$pidfile" 2>/dev/null || true',
  'trap \'rm -f "$pidfile"\' EXIT INT TERM',
  'while :; do sleep 3600; done',
].join('\n')

/** Exact bytes written by the target-side writer. */
export const KEEPALIVE_SCRIPT_BYTES = KEEPALIVE_SCRIPT + '\n'

/**
 * Compare a string or raw buffer with the canonical script, character for
 * character (or byte for byte for a Buffer).
 * @param value - content read back from the target distro.
 * @returns true only for the exact canonical bytes.
 */
export function isCanonicalScript(value: string | Buffer): boolean {
  if (typeof value === 'string') return value === KEEPALIVE_SCRIPT_BYTES
  return value.equals(Buffer.from(KEEPALIVE_SCRIPT_BYTES, 'utf8'))
}

/** Maximum characters of a tampered script copied into one log record. */
export const MAX_LOGGED_SCRIPT_CHARS = 8192

/**
 * Render tampered content for a single log line. JSON escaping keeps newlines
 * and control characters from forging extra log records; long files are
 * bounded and the original character count is retained.
 * @param value - raw tampered content read from the target.
 * @returns escaped, size-bounded text suitable for ctx.logger.
 */
export function formatTamperedScript(value: string | Buffer): string {
  const text = typeof value === 'string' ? value : value.toString('utf8')
  const truncated = text.length > MAX_LOGGED_SCRIPT_CHARS
  const shown = truncated ? text.slice(0, MAX_LOGGED_SCRIPT_CHARS) : text
  const suffix = truncated ? ' (truncated; ' + String(text.length) + ' chars total)' : ''
  return JSON.stringify(shown) + suffix
}
