/**
 * Host selection. Linux (WSL) and Windows are implemented; other platforms
 * fail closed with a visible error.
 * @module dsh-wsl-keepalive/hosts
 */

import type { HostService } from '../core/host.ts'
import { UnsupportedHostService } from './unsupported.ts'
import { WindowsHostService } from './windows.ts'
import { isWsl, WslHostService } from './wsl.ts'

/**
 * Select the host adapter. Linux is only a WSL host when the process carries
 * WSL markers; a plain Linux host is deliberately unsupported so the plugin
 * does not pretend a WSL switch exists there.
 * @param platform - Node platform, injectable for tests.
 * @param wsl - whether this Linux host is WSL, injectable for tests.
 */
export function createHostService(
  platform: NodeJS.Platform = process.platform,
  wsl: boolean = isWsl({ platform }),
): HostService {
  if (platform === 'linux') return wsl ? new WslHostService() : new UnsupportedHostService()
  if (platform === 'win32') return new WindowsHostService()
  return new UnsupportedHostService()
}
