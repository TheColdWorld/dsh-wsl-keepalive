import { clientBundle } from './shared/tsdown.client.ts'

// The source no longer imports any @deepseek-ai/*; tsdown keeps @deepseek-ai/cordis
// external by default (the shared helper's default), so no explicit external is needed.
export default clientBundle('wsl-keepalive', [
  'src/index.ts',
])
