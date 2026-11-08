import test from 'node:test'
import assert from 'node:assert/strict'
import { distroFromWslPath, WslHostService } from './hosts/wsl.ts'

test('parses the current distro from a WSL2 UNC path', () => {
  assert.equal(distroFromWslPath('\\\\wsl.localhost\\archlinux\\\n'), 'archlinux')
})

test('parses the legacy wsl$ UNC path', () => {
  assert.equal(distroFromWslPath('\\\\wsl$\\Ubuntu-22.04\\'), 'Ubuntu-22.04')
})

test('keeps spaces in the distro name', () => {
  assert.equal(distroFromWslPath('\\\\wsl.localhost\\My Distro\\home'), 'My Distro')
})

test('accepts a UNC path without a trailing separator', () => {
  assert.equal(distroFromWslPath('\\\\wsl.localhost\\archlinux'), 'archlinux')
})

test('rejects non-WSL paths and an empty share name', () => {
  assert.equal(distroFromWslPath('C:\\Windows\\'), null)
  assert.equal(distroFromWslPath('\\\\wsl.localhost\\'), null)
  assert.equal(distroFromWslPath(''), null)
})

test('rejects control characters and oversized names', () => {
  assert.equal(distroFromWslPath('\\\\wsl.localhost\\bad\nname\\'), null)
  assert.equal(distroFromWslPath('\\\\wsl.localhost\\' + 'a'.repeat(129) + '\\'), null)
})

test('WSL_DISTRO_NAME wins over the wslpath probe', async () => {
  const previous = process.env.WSL_DISTRO_NAME
  process.env.WSL_DISTRO_NAME = 'env-distro'
  try {
    const host = new WslHostService()
    assert.equal(await host.implicitDistro('/does/not/matter'), 'env-distro')
  } finally {
    if (previous === undefined) delete process.env.WSL_DISTRO_NAME
    else process.env.WSL_DISTRO_NAME = previous
  }
})
