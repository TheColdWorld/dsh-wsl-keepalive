import test from 'node:test'
import assert from 'node:assert/strict'
import { changeImplicitPlan, markKeepAlive, resetKeepAlive } from './core/implicit.ts'

test('starts the first implicit distro', () => {
  resetKeepAlive()
  const plan = changeImplicitPlan(null, 'archlinux')
  assert.deepEqual(plan, { stop: null, start: 'archlinux', next: 'archlinux' })
})

test('moving the implicit distro stops the old and starts the new', () => {
  resetKeepAlive()
  markKeepAlive('archlinux', true)
  const plan = changeImplicitPlan('archlinux', 'ubuntu')
  assert.deepEqual(plan, { stop: 'archlinux', start: 'ubuntu', next: 'ubuntu' })
})

test('same current retries a failed start until marked alive', () => {
  resetKeepAlive()
  assert.equal(changeImplicitPlan('archlinux', 'archlinux').start, 'archlinux')
  markKeepAlive('archlinux', true)
  assert.equal(changeImplicitPlan('archlinux', 'archlinux').start, null)
})

test('disabling stops the previous implicit distro', () => {
  resetKeepAlive()
  markKeepAlive('archlinux', true)
  const plan = changeImplicitPlan('archlinux', null)
  assert.deepEqual(plan, { stop: 'archlinux', start: null, next: null })
})
