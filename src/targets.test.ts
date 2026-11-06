import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeTargets } from './targets.ts'

const ubuntu = { distro: 'ubuntu', userName: '', wslExecPath: '/u/wsl.exe' }

test('appends the DSH distro when no target is configured', () => {
  const rows = mergeTargets([], 'archlinux')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].distro, 'archlinux')
  assert.equal(rows[0].implicit, true)
})

test('does not append the DSH distro when default keep-alive is off', () => {
  assert.deepEqual(mergeTargets([], 'archlinux', false), [])
})

test('keeps explicit targets when default keep-alive is off', () => {
  const rows = mergeTargets([ubuntu], 'archlinux', false)
  assert.deepEqual(rows.map((row) => row.distro), ['ubuntu'])
  assert.equal(rows[0].implicit, false)
})

test('still resolves an explicit empty distro when default keep-alive is off', () => {
  const rows = mergeTargets([{ distro: '', userName: 'wsl', wslExecPath: '' }], 'archlinux', false)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].distro, 'archlinux')
  assert.equal(rows[0].userName, 'wsl')
  assert.equal(rows[0].implicit, false)
})

test('keeps explicit targets and appends the missing DSH distro', () => {
  const rows = mergeTargets([ubuntu], 'archlinux')
  assert.deepEqual(rows.map((row) => row.distro), ['ubuntu', 'archlinux'])
  assert.equal(rows[1].implicit, true)
})

test('does not duplicate the DSH distro when it is configured', () => {
  const rows = mergeTargets([{ distro: 'archlinux', userName: '', wslExecPath: '' }], 'archlinux')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].implicit, false)
})

test('no target survives when the distro is unknown and nothing is configured', () => {
  assert.deepEqual(mergeTargets([], null), [])
})
