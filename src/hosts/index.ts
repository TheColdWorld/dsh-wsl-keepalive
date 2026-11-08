/**
 * Host selection. Linux (WSL) and Windows are implemented; other platforms
 * fail closed with a visible error.
 * @module dsh-wsl-keepalive/hosts
 */

import type { HostService } from '../core/host.ts'
import { UnsupportedHostService } from './unsupported.ts'
import { WindowsHostService } from './windows.ts'
import { WslHostService } from './wsl.ts'

export function createHostService(platform: NodeJS.Platform = process.platform): HostService {
  if (platform === 'linux') return new WslHostService()
  if (platform === 'win32') return new WindowsHostService()
  return new UnsupportedHostService()
}
