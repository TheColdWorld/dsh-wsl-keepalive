import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeTargets, validateTargets } from './core/targets.ts'

const ubuntu = { name: 'ubuntu', user: '' }

test('appends the implicit distro when no target is configured', () => {
  const rows = mergeTargets([], 'archlinux', true)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'archlinux')
  assert.equal(rows[0].implicit, true)
})

test('does not append the implicit distro when default keep-alive is off', () => {
  assert.deepEqual(mergeTargets([], 'archlinux', false), [])
})

test('keeps explicit targets when default keep-alive is off', () => {
  const rows = mergeTargets([ubuntu], 'archlinux', false)
  assert.deepEqual(rows.map((row) => row.name), ['ubuntu'])
  assert.equal(rows[0].implicit, false)
})

test('keeps explicit targets and appends the missing implicit distro', () => {
  const rows = mergeTargets([ubuntu], 'archlinux', true)
  assert.deepEqual(rows.map((row) => row.name), ['ubuntu', 'archlinux'])
  assert.equal(rows[1].implicit, true)
})

test('does not duplicate an explicitly configured implicit distro', () => {
  const rows = mergeTargets([{ name: 'archlinux', user: 'wsl' }], 'archlinux', true)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].implicit, false)
  assert.equal(rows[0].user, 'wsl')
})

test('no target survives when the implicit distro is unknown and nothing is configured', () => {
  assert.deepEqual(mergeTargets([], null, true), [])
})

test('reports empty and duplicate distro names', () => {
  const verdict = validateTargets([
    { name: 'ubuntu', user: '' },
    { name: '  ', user: '' },
    { name: 'ubuntu', user: 'wsl' },
  ])
  assert.deepEqual(verdict.empty, [1])
  assert.deepEqual(verdict.duplicates, ['ubuntu'])
})
