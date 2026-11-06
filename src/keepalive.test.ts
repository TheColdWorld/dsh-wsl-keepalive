import test from 'node:test'
import assert from 'node:assert/strict'
import { isPid } from './keepalive.ts'

test('accepts ordinary keep-alive PIDs', () => {
  assert.equal(isPid('2'), true)
  assert.equal(isPid('1234'), true)
  assert.equal(isPid('2147483647'), true)
})

test('rejects PID 0, PID 1, option-like and non-numeric values', () => {
  for (const value of ['', '0', '1', '-1', '--', '12a', '+12', ' 12', '12 ', '99999999999']) {
    assert.equal(isPid(value), false, value)
  }
})
