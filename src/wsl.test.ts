import test from 'node:test'
import assert from 'node:assert/strict'
import { distroArgs, userArgs } from './wsl.ts'

test('omits -d when the distro is unknown', () => {
  assert.deepEqual(distroArgs(null), [])
  assert.deepEqual(distroArgs('  '), [])
})

test('builds per-target user arguments', () => {
  assert.deepEqual(userArgs('archlinux', 'wsl'), ['-d', 'archlinux', '--user', 'wsl'])
  assert.deepEqual(userArgs(null, ''), [])
})
