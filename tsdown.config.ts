import { clientBundle } from './shared/tsdown.client.ts'

// 源码已不 import 任何 @deepseek-ai/*，tsdown 默认把 @deepseek-ai/cordis 保持
// external（shared 助手的默认值），无需额外声明外部引用。
export default clientBundle('wsl-keepalive', [
  'src/index.ts',
])
