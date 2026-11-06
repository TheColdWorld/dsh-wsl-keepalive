import test from 'node:test'
import assert from 'node:assert/strict'
import { KEEPALIVE_SCRIPT, KEEPALIVE_SCRIPT_BYTES, KEEPALIVE_MARKER, MAX_LOGGED_SCRIPT_CHARS, formatTamperedScript, isCanonicalScript } from './script.ts'

test('canonical bytes are exactly the script plus one newline', () => {
  assert.equal(KEEPALIVE_SCRIPT_BYTES, KEEPALIVE_SCRIPT + '\n')
  assert.equal(Buffer.byteLength(KEEPALIVE_SCRIPT_BYTES, 'utf8'), KEEPALIVE_SCRIPT_BYTES.length)
})

test('the comparison is exact for strings and raw buffers', () => {
  assert.equal(isCanonicalScript(KEEPALIVE_SCRIPT_BYTES), true)
  assert.equal(isCanonicalScript(Buffer.from(KEEPALIVE_SCRIPT_BYTES, 'utf8')), true)
  assert.equal(isCanonicalScript(KEEPALIVE_SCRIPT_BYTES + ' '), false)
  assert.equal(isCanonicalScript(KEEPALIVE_SCRIPT_BYTES.replace('\n', '\r\n')), false)
  assert.equal(isCanonicalScript(KEEPALIVE_SCRIPT_BYTES.replace('umask 077', 'umask 022')), false)
  assert.equal(isCanonicalScript(Buffer.from('#!/bin/sh\n', 'utf8')), false)
})

test('tampered content is logged as escaped, bounded text', () => {
  assert.equal(formatTamperedScript(Buffer.from('a\nb', 'utf8')), '"a\\nb"')
  assert.equal(formatTamperedScript('x'), '"x"')

  const long = 'x'.repeat(MAX_LOGGED_SCRIPT_CHARS + 10)
  const rendered = formatTamperedScript(long)
  assert.equal(rendered.includes('\n'), false)
  assert.ok(rendered.endsWith('(truncated; ' + String(MAX_LOGGED_SCRIPT_CHARS + 10) + ' chars total)'))
  assert.equal(rendered.startsWith('"xxx'), true)
})

test('the script is a single POSIX loop that hardens its own files', () => {
  assert.match(KEEPALIVE_SCRIPT, /^#!\/bin\/sh\n/)
  assert.match(KEEPALIVE_SCRIPT, /umask 077/)
  assert.match(KEEPALIVE_SCRIPT, /rm -f "\$pidfile"/)
  assert.match(KEEPALIVE_SCRIPT, /chmod 600 "\$pidfile"/)
  assert.match(KEEPALIVE_SCRIPT, /while :; do sleep 3600; done/)
  assert.equal(KEEPALIVE_MARKER, '.cache/dsh-wsl-keepalive/keepalive.sh')
})
