import { clientBundle } from './shared/tsdown.client.ts'

// The host half imports `@deepseek-ai/cordis` (the `Context` value/type) at runtime;
// tsdown keeps it external by default (the shared helper's default) and it resolves
// from the dsh profile tree at load time. The other @deepseek-ai/* references are
// type-only augmentations (webServer/slots/locale/settings) and are erased at build.
// No explicit external list is needed.
export default clientBundle('wsl-keepalive', [
  'src/index.ts',
])
