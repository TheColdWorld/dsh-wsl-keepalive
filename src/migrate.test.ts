import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettings } from './core/migrate.ts'

test('renames legacy target fields', () => {
  const next = normalizeSettings({
    keepDefault: true,
    preferredWslExec: '',
    targets: [{ name: '', user: '', distro: 'archlinux', userName: 'wsl', wslExecPath: '/mnt/c/Windows/System32/wsl.exe' }],
  })
  assert.deepEqual(next.targets, [{ name: 'archlinux', user: 'wsl' }])
  assert.equal(next.preferredWslExec, '/mnt/c/Windows/System32/wsl.exe')
})

test('drops empty legacy distro rows and forces keepDefault on', () => {
  const next = normalizeSettings({
    keepDefault: false,
    preferredWslExec: '',
    targets: [{ name: '', user: '', distro: '', userName: '', wslExecPath: '/mnt/c/Windows/System32/wsl.exe' }],
  })
  assert.deepEqual(next.targets, [])
  assert.equal(next.keepDefault, true)
  assert.equal(next.warnings.length > 0, true)
})

test('drops duplicate legacy targets and warns', () => {
  const next = normalizeSettings({
    keepDefault: true,
    preferredWslExec: '',
    targets: [
      { name: '', user: '', distro: 'archlinux', userName: '' },
      { name: '', user: '', distro: 'archlinux', userName: 'wsl' },
    ],
  })
  assert.deepEqual(next.targets, [{ name: 'archlinux', user: '' }])
  assert.equal(next.warnings.some((warning) => warning.includes('duplicate')), true)
})

test('keeps the first legacy path and warns when they differ', () => {
  const next = normalizeSettings({
    keepDefault: true,
    preferredWslExec: '',
    targets: [
      { name: '', user: '', distro: 'a', userName: '', wslExecPath: '/one/wsl.exe' },
      { name: '', user: '', distro: 'b', userName: '', wslExecPath: '/two/wsl.exe' },
    ],
  })
  assert.equal(next.preferredWslExec, '/one/wsl.exe')
  assert.equal(next.warnings.some((warning) => warning.includes('different')), true)
})

test('preserves new-shape duplicates for service validation', () => {
  const next = normalizeSettings({
    keepDefault: true,
    preferredWslExec: '',
    targets: [
      { name: 'archlinux', user: '' },
      { name: 'archlinux', user: 'wsl' },
    ],
  })
  assert.deepEqual(next.targets, [
    { name: 'archlinux', user: '' },
    { name: 'archlinux', user: 'wsl' },
  ])
  assert.equal(next.warnings.length, 0)
})

test('preserves new-shape empty names for service validation', () => {
  const next = normalizeSettings({
    keepDefault: false,
    preferredWslExec: '',
    targets: [{ name: '', user: '' }],
  })
  assert.deepEqual(next.targets, [{ name: '', user: '' }])
  assert.equal(next.keepDefault, false)
})
