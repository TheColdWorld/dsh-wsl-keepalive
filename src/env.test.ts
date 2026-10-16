/**
 * Unit tests for the pure detection decision table (classifyWslEnv). They
 * synthesize WslFacts, so every branch is exercised without probing the real
 * system. Run with: pnpm test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyWslEnv, type WslFacts } from './env.ts'

const FALLBACK = '/mnt/c/Windows/System32/wsl.exe'
const WSL2_KERNEL = '6.6.87.2-microsoft-standard-WSL2'

/** A healthy WSL2 host: interop evidence plus a probe that succeeds. */
function facts(overrides: Partial<WslFacts> = {}): WslFacts {
  return {
    kernel: WSL2_KERNEL,
    kernelIsWsl: true,
    interopEvidence: true,
    interopDisabled: false,
    container: false,
    candidate: FALLBACK,
    fallback: FALLBACK,
    candidateExists: true,
    probe: { ok: true },
    ...overrides,
  }
}

test('probe success is the only ok verdict', () => {
  const result = classifyWslEnv(facts())
  assert.equal(result.ok, true)
  assert.equal(result.code, 'ok')
  assert.equal(result.params, null)
})

test('container on a WSL2 kernel with no interop is containerNoInterop', () => {
  const result = classifyWslEnv(facts({
    interopEvidence: false,
    container: true,
    candidate: '',
    candidateExists: false,
    probe: null,
  }))
  assert.equal(result.ok, false)
  assert.equal(result.code, 'containerNoInterop')
  assert.equal(result.params?.kernel, WSL2_KERNEL)
})

test('plain Linux is envNotWsl', () => {
  const result = classifyWslEnv(facts({
    kernel: '6.8.0-40-generic',
    kernelIsWsl: false,
    interopEvidence: false,
    candidate: '',
    candidateExists: false,
    probe: null,
  }))
  assert.equal(result.code, 'envNotWsl')
})

test('ENOENT probe is errWslExecMissing and names the path', () => {
  const result = classifyWslEnv(facts({ probe: { ok: false, failure: 'ENOENT', detail: 'spawn: ENOENT' } }))
  assert.equal(result.code, 'errWslExecMissing')
  assert.equal(result.params?.path, FALLBACK)
})

test('ENOEXEC probe is interopUnavailable', () => {
  const result = classifyWslEnv(facts({ probe: { ok: false, failure: 'ENOEXEC', detail: 'spawn: ENOEXEC' } }))
  assert.equal(result.code, 'interopUnavailable')
})

test('ENOEXEC with interop disabled in wsl.conf is interopDisabled', () => {
  const result = classifyWslEnv(facts({
    interopDisabled: true,
    probe: { ok: false, failure: 'ENOEXEC', detail: 'spawn: ENOEXEC' },
  }))
  assert.equal(result.code, 'interopDisabled')
})

test('missing wsl.exe while interop is present is errWslExecMissing', () => {
  const result = classifyWslEnv(facts({ candidate: '', candidateExists: false, probe: null }))
  assert.equal(result.code, 'errWslExecMissing')
  assert.equal(result.params?.path, FALLBACK)
})

test('explicit interop disable wins over the container label', () => {
  const result = classifyWslEnv(facts({
    interopEvidence: false,
    interopDisabled: true,
    candidate: '',
    candidateExists: false,
    probe: null,
  }))
  assert.equal(result.code, 'interopDisabled')
})

test('the kernel signature alone never grants access', () => {
  const result = classifyWslEnv(facts({
    kernelIsWsl: true,
    interopEvidence: false,
    candidate: '',
    candidateExists: false,
    probe: null,
  }))
  assert.notEqual(result.ok, true)
  assert.equal(result.code, 'containerNoInterop')
})
