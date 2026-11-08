/**
 * Host selection. Linux (WSL) is implemented in this build; Windows has a
 * placeholder so the abstraction is ready for a dedicated win32 host.
 * @module dsh-wsl-keepalive/hosts
 */

import type { HostService } from '../core/host.ts'
import { UnsupportedHostService } from './unsupported.ts'
import { WslHostService } from './wsl.ts'

export function createHostService(platform: NodeJS.Platform = process.platform): HostService {
  if (platform === 'linux') return new WslHostService()
  return new UnsupportedHostService()
}
