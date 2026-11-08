import test from 'node:test'
import assert from 'node:assert/strict'
import { makeRoutes } from './core/routes.ts'
import type { KeepAliveService } from './core/service.ts'
import type { KeepAliveStatus, WslPathValidation } from './core/types.ts'

const status: KeepAliveStatus = {
  enabled: false,
  partial: false,
  host: 'wsl',
  defaultDistro: null,
  implicitAvailable: false,
  implicitReason: 'unidentified-dsh-distro',
  keepDefaultEffective: false,
  keepDefaultLocked: false,
  targets: [],
  errorCode: null,
  errorParams: null,
  error: null,
}

const emptyValidation: WslPathValidation = {
  ok: true,
  path: '',
  errorCode: null,
  detail: null,
}

function fakeService(): { service: KeepAliveService; calls: boolean[] } {
  const calls: boolean[] = []
  const service = {
    status: async () => status,
    set: async (enabled: boolean) => { calls.push(enabled); return status },
    validateWslPath: async () => emptyValidation,
  } as unknown as KeepAliveService
  return { service, calls }
}

function routeOf(service: KeepAliveService, suffix: string) {
  const route = makeRoutes(service).find((entry) => entry.path.endsWith(suffix))
  assert.ok(route)
  return route
}

test('/set accepts a tiny boolean body', async () => {
  const { service, calls } = fakeService()
  const response = await routeOf(service, '/set').fetch(new Request('http://localhost/api/wsl-keepalive/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [true])
})

test('/set refuses an oversized body before parsing', async () => {
  const { service, calls } = fakeService()
  const response = await routeOf(service, '/set').fetch(new Request('http://localhost/api/wsl-keepalive/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true, padding: 'x'.repeat(4096) }),
  }))
  assert.equal(response.status, 413)
  assert.deepEqual(calls, [])
})

test('/set refuses a non-boolean payload', async () => {
  const { service } = fakeService()
  const response = await routeOf(service, '/set').fetch(new Request('http://localhost/api/wsl-keepalive/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: 'true' }),
  }))
  assert.equal(response.status, 400)
})

test('/validate reports a normalized empty default without touching wsl.exe', async () => {
  const { service } = fakeService()
  const response = await routeOf(service, '/validate').fetch(new Request('http://localhost/api/wsl-keepalive/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preferredWslExec: '   ' }),
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, path: '', errorCode: null, detail: null })
})

test('/validate refuses the old wslExecPath field', async () => {
  const { service } = fakeService()
  const response = await routeOf(service, '/validate').fetch(new Request('http://localhost/api/wsl-keepalive/validate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ wslExecPath: '/usr/bin/true' }),
  }))
  assert.equal(response.status, 400)
})
