import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeWslPath, validateWslPath } from './validate.ts'

test('normalizes relative and absolute paths to an absolute form', () => {
  assert.equal(normalizeWslPath(''), '')
  assert.equal(normalizeWslPath('  '), '')
  assert.equal(normalizeWslPath('/usr/bin/true'), '/usr/bin/true')
  assert.equal(normalizeWslPath('relative/wsl.exe'), process.cwd() + '/relative/wsl.exe')
})

test('missing executables are refused before any command runs', async () => {
  const verdict = await validateWslPath('/definitely/missing/wsl.exe')
  assert.equal(verdict.ok, false)
  assert.equal(verdict.errorCode, 'errWslExecMissing')
})
