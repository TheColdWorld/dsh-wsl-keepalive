import test from 'node:test'
import assert from 'node:assert/strict'
import { tooltipLines } from './tooltip.ts'
import type { KeepAliveStatus } from './transport.ts'
import type { KeepAliveKey } from './i18n.ts'

const t = (key: KeepAliveKey): string => key === 'startFailed' ? '启动失败' : key

function status(partial: Partial<KeepAliveStatus>): KeepAliveStatus {
  return {
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
    ...partial,
  }
}

test('renders one distro(pid) line per running target', () => {
  const lines = tooltipLines(status({
    enabled: true,
    targets: [
      { name: 'archlinux', pid: '1234', running: true, errorCode: null, errorParams: null, error: null },
      { name: 'ubuntu', pid: '5678', running: true, errorCode: null, errorParams: null, error: null },
    ],
  }), t)
  assert.deepEqual(lines, ['archlinux(1234)', 'ubuntu(5678)'])
})

test('renders a start failure line for a stopped target', () => {
  const lines = tooltipLines(status({
    enabled: true,
    partial: true,
    targets: [
      { name: 'archlinux', pid: '1234', running: true, errorCode: null, errorParams: null, error: null },
      { name: 'ubuntu', pid: null, running: false, errorCode: 'errStartFailed', errorParams: null, error: 'boom' },
    ],
  }), t)
  assert.deepEqual(lines, ['archlinux(1234)', 'ubuntu(启动失败)'])
})

test('empty distro names keep only the pid form', () => {
  const lines = tooltipLines(status({
    enabled: true,
    targets: [{ name: '', pid: '9', running: true, errorCode: null, errorParams: null, error: null }],
  }), t)
  assert.deepEqual(lines, ['(9)'])
})
