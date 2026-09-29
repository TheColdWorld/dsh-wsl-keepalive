/**
 * wsl-keepalive localization dictionaries — registered into the DSH locale
 * service (ctx.locale.register) under the `wsl-keepalive` namespace and read
 * through the framework-injected `t` seat (PropsLocale). The DSH renderer
 * re-derives `t` on every locale switch, so the page re-renders with the new
 * language automatically.
 *
 * Supported locales: `en` (default / fallback), `zh`.
 * @module wsl-keepalive/client/i18n
 */

/** Dictionary keys of the `wsl-keepalive` namespace (merged into LocaleNamespaceMap). */
export type KeepAliveKey =
  | 'title'
  | 'description'
  | 'configSection'
  | 'commandSection'
  | 'detecting'
  | 'unavailable'
  | 'enabled'
  | 'disabled'
  | 'ariaLabel'
  | 'pidLabel'
  | 'noPid'
  | 'cannotReachHost'
  | 'retry'
  | 'errEndpointMissing'
  | 'errTransportFailed'
  | 'errHostError'
  | 'endpointHint'
  | 'envNotWsl'
  | 'errWslExecMissing'
  | 'errStartFailed'
  | 'errCommandFailed'
  | 'distroLabel'
  | 'distroDesc'
  | 'userLabel'
  | 'userDesc'
  | 'wslExecLabel'
  | 'wslExecDesc'
  | 'overridden'
  | 'reset'
  | 'readOnly'
  | 'namespaceUnavailable'
  | 'save'
  | 'saving'
  | 'saveFailed'
  | 'invalidValue'

/** English dictionary (the default / fallback). */
export const en: Record<KeepAliveKey, string> = {
  title: 'WSL Keep-Alive',
  description: 'Keep a WSL dbus session alive from the Web UI.',
  configSection: 'Configuration',
  commandSection: 'Command configuration',
  detecting: 'Detecting…',
  unavailable: 'Unavailable:',
  enabled: 'Enabled',
  disabled: 'Disabled',
  ariaLabel: 'WSL keep-alive toggle',
  pidLabel: 'Keep-alive process PID',
  noPid: '—',
  cannotReachHost: 'Cannot reach host /api/wsl-keepalive',
  retry: 'The toggle stays clickable so you can retry.',
  errEndpointMissing: 'The host does not serve /api/wsl-keepalive/* (response: HTTP {status}).',
  errTransportFailed: 'Cannot connect to the host: {detail}',
  errHostError: 'The host answered with an error: HTTP {status}',
  endpointHint: 'Likely causes: this shell provides no HTTP carrier, or the plugin row is not active in this profile.',
  envNotWsl: 'Not a WSL environment (kernel: {kernel}) — this plugin needs wsl.exe, so it cannot work here.',
  errWslExecMissing: 'wsl.exe path is empty and the fallback {fallback} does not exist, so keep-alive cannot start.',
  errStartFailed: 'Starting keep-alive failed (exit {exit}): {detail}',
  errCommandFailed: 'Command failed: {detail}',
  distroLabel: 'Distro that runs the keep-alive process',
  distroDesc: 'The WSL distro that runs the keep-alive process; leave blank to use the default distro.',
  userLabel: 'User that runs the keep-alive process',
  userDesc: 'The user inside the target distro; leave blank to use the distro default.',
  wslExecLabel: 'wsl.exe execution path',
  wslExecDesc: 'Absolute path to wsl.exe; leave blank to auto-detect /mnt/c/Windows/System32/wsl.exe.',
  overridden: 'Overridden',
  reset: 'Reset to default',
  readOnly: 'This deployment stores settings read-only.',
  namespaceUnavailable: 'This plugin is not loaded, so it cannot be configured right now.',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
  invalidValue: 'Enter a value, or leave blank to use the default.',
}

/** Chinese (zh) dictionary. */
export const zh: Record<KeepAliveKey, string> = {
  title: 'WSL保活',
  description: '在 Web UI 中保持 WSL 的 dbus 会话存活。',
  configSection: '配置',
  commandSection: '命令配置',
  detecting: '检测中…',
  unavailable: '不可用：',
  enabled: '已启用',
  disabled: '已停用',
  ariaLabel: 'WSL 保活开关',
  pidLabel: '保活进程PID',
  noPid: '—',
  cannotReachHost: '无法访问宿主 /api/wsl-keepalive',
  retry: '开关仍可点击重试。',
  errEndpointMissing: '宿主未挂载 /api/wsl-keepalive/* 端点（响应：HTTP {status}）',
  errTransportFailed: '无法连接宿主：{detail}',
  errHostError: '宿主返回错误：HTTP {status}',
  endpointHint: '常见原因：该外壳不提供 HTTP 载体，或本插件行在当前 profile 中未激活。',
  envNotWsl: '当前不是 WSL 环境（内核：{kernel}）——本插件依赖 wsl.exe，无法在此工作。',
  errWslExecMissing: 'wsl.exe 路径为空，且默认路径 {fallback} 不存在，保活无法启动',
  errStartFailed: '启动保活失败（退出码 {exit}）：{detail}',
  errCommandFailed: '命令执行失败：{detail}',
  distroLabel: '运行保活进程的发行版',
  distroDesc: '指定实际运行保活进程的 WSL 发行版；留空则使用默认发行版。',
  userLabel: '运行保活进程的用户',
  userDesc: '指定在目标发行版内运行保活进程的用户；留空则使用该发行版的默认用户。',
  wslExecLabel: 'wsl.exe的运行路径',
  wslExecDesc: 'wsl.exe 在 Linux 文件系统下的绝对路径；留空时自动探测 /mnt/c/Windows/System32/wsl.exe。',
  overridden: '已覆盖',
  reset: '恢复默认',
  readOnly: '本部署的设置为只读。',
  namespaceUnavailable: '该插件当前未加载，暂时无法配置。',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些值，已保留供你修改。',
  invalidValue: '请填一个值；留空表示使用默认值。',
}
