import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { normalizeWslPath } from './core/validate.ts'
import { WslHostService } from './hosts/wsl.ts'

test('normalizes relative and absolute paths to an absolute form', () => {
  assert.equal(normalizeWslPath('', path.posix), '')
  assert.equal(normalizeWslPath('  ', path.posix), '')
  assert.equal(normalizeWslPath('/usr/bin/true', path.posix), '/usr/bin/true')
  assert.equal(normalizeWslPath('relative/wsl.exe', path.posix), process.cwd() + '/relative/wsl.exe')
})

test('missing executables are refused before any command runs', async () => {
  const host = new WslHostService()
  const verdict = await host.validateWslPath('/definitely/missing/wsl.exe')
  assert.equal(verdict.ok, false)
  assert.equal(verdict.errorCode, 'errWslExecMissing')
})
