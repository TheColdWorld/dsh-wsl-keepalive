import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Node platform names DSH accepts in `dsh.bundle.platforms` (mirrors
 * `NODE_PLATFORMS` in @deepseek-ai/dsh-app-boot). A value outside this list
 * makes DSH reject the declaration and skip the whole bundle.
 */
const NODE_PLATFORMS = new Set([
  'aix',
  'android',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'openbsd',
  'sunos',
  'win32',
  'cygwin',
  'netbsd',
])

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  dsh?: { bundle?: { platforms?: unknown } }
}

const platforms: unknown = manifest.dsh?.bundle?.platforms

test('dsh.bundle.platforms is a nonempty list of Node platform names', () => {
  assert.ok(Array.isArray(platforms), 'dsh.bundle.platforms must be an array')
  assert.ok(platforms.length > 0, 'dsh.bundle.platforms must not be empty')
  for (const value of platforms) {
    assert.equal(typeof value, 'string', 'every platform entry must be a string')
    assert.ok(
      NODE_PLATFORMS.has(value as string),
      `"${String(value)}" is not a Node platform name; DSH would reject it and skip the bundle. Use "linux" for WSL.`,
    )
  }
})

test('the bundle is composed only on WSL/plain Linux and Windows', () => {
  assert.deepEqual([...(platforms as string[])].sort(), ['linux', 'win32'])
  assert.ok(!(platforms as string[]).includes('wsl'), '"wsl" is not a Node platform; WSL uses "linux"')
})
