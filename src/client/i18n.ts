/**
 * wsl-keepalive localization dictionaries — registered into the DSH locale
 * service (ctx.locale.register) under the `wsl-keepalive` namespace and read
 * through the framework-injected `t` seat (PropsLocale). The DSH renderer
 * re-derives `t` on every locale switch, so the row re-renders with the new
 * language automatically — no manual subscription needed.
 *
 * Supported locales:
 * - `en` (default / fallback)
 * - `zh`
 *
 * @module wsl-keepalive/client/i18n
 */

/** Dictionary keys of the `wsl-keepalive` namespace (merged into LocaleNamespaceMap). */
export type KeepAliveKey =
  | 'nav'
  | 'title'
  | 'detecting'
  | 'unavailable'
  | 'enabled'
  | 'disabled'
  | 'ariaLabel'
  | 'cannotReachHost'
  | 'retry'
  // --- Host endpoint not reachable (transport level; the plugin may be fine) --
  | 'errEndpointMissing'
  | 'errTransportFailed'
  | 'errHostError'
  | 'endpointHint'
  // --- Host refused because the environment is not applicable -----------------
  | 'envNotWsl'
  | 'errWslExecMissing'
  | 'errStartFailed'
  // --- Command configuration --------------------------------------------------
  | 'configSection'
  | 'commandSection'
  | 'pidLabel'
  | 'noPid'
  | 'saving'
  | 'saveFailed'
  | 'distroLabel'
  | 'distroDesc'
  | 'userLabel'
  | 'userDesc'
  | 'wslExecLabel'
  | 'wslExecDesc'
  | 'errDistroMissing'
  | 'errUserMissingInDistro'
  | 'errUserMissingInDefault'
  | 'errWslPathMissing'
  | 'errWslExecUnavailable'
  | 'errListDistrosFailed'
  | 'errSaveConfigFailed'
  | 'errCommandFailed'

/** English dictionary (the default / fallback). */
export const en: Record<KeepAliveKey, string> = {
  nav: 'WSL Keep-Alive',
  title: 'WSL Keep-Alive',
  detecting: 'Detecting…',
  unavailable: 'Unavailable:',
  enabled: 'Enabled',
  disabled: 'Disabled',
  ariaLabel: 'WSL keep-alive toggle',
  cannotReachHost: 'Cannot reach host /api/wsl-keepalive',
  retry: 'The toggle stays clickable so you can retry.',
  errEndpointMissing: 'The host does not serve /api/wsl-keepalive/* (response: HTTP {status}).',
  errTransportFailed: 'Cannot connect to the host: {detail}',
  errHostError: 'The host answered with an error: HTTP {status}',
  endpointHint: 'Likely causes: this shell provides no HTTP carrier (Electron / worker carriers load the client stack without `webServer`), or the plugin row is not active in this profile.',
  envNotWsl: 'Not a WSL environment (kernel: {kernel}) — this plugin needs wsl.exe, so it cannot work here. Enable it inside a WSL distro only.',
  errWslExecMissing: 'wsl.exe path is unset and the fallback {fallback} does not exist, so keep-alive cannot start.',
  errStartFailed: 'Starting keep-alive failed (exit {exit}): {detail}',
  configSection: 'Configuration',
  commandSection: 'Command configuration',
  pidLabel: 'Keep-alive process PID',
  noPid: '—',
  saving: 'Saving…',
  saveFailed: 'Save failed',
  distroLabel: 'Distro that runs the keep-alive process',
  distroDesc: 'The WSL distro that actually runs the keep-alive process (the start command appends `-d <distro>`); leave blank to use the default distro. On save the distro is checked for existence — if it is missing the change is reverted and an error is shown.',
  userLabel: 'User that runs the keep-alive process',
  userDesc: 'The user account inside the target distro that runs the keep-alive process (the start command appends `--user <user>`); leave blank to use that distro\u2019s default user. On save the user is looked up inside the distro — if it does not exist the change is reverted and an error is shown.',
  wslExecLabel: 'wsl.exe execution path',
  wslExecDesc: 'The absolute path to wsl.exe on the Linux filesystem, used to call into the Windows/WSL side; leave blank to auto-detect /mnt/c/Windows/System32/wsl.exe. On save the file is checked for existence — if it does not exist the change is reverted and an error is shown.',
  errDistroMissing: 'The distro "{distro}" does not exist.',
  errUserMissingInDistro: 'The user "{user}" does not exist in the distro "{distro}".',
  errUserMissingInDefault: 'The user "{user}" does not exist in the default distro.',
  errWslPathMissing: 'The wsl.exe path does not exist: {path}',
  errWslExecUnavailable: 'wsl.exe is unavailable, so the value cannot be validated.',
  errListDistrosFailed: 'Unable to list WSL distros (wsl.exe failed).',
  errSaveConfigFailed: 'Saving the configuration failed (the config file could not be written).',
  errCommandFailed: 'Command failed: {detail}',
}

/** Chinese (zh) dictionary. */
export const zh: Record<KeepAliveKey, string> = {
  nav: 'WSL保活',
  title: 'WSL保活',
  detecting: '检测中…',
  unavailable: '不可用：',
  enabled: '已启用',
  disabled: '已停用',
  ariaLabel: 'WSL 保活开关',
  cannotReachHost: '无法访问宿主 /api/wsl-keepalive',
  retry: '开关仍可点击重试。',
  errEndpointMissing: '宿主未挂载 /api/wsl-keepalive/* 端点（响应：HTTP {status}）',
  errTransportFailed: '无法连接宿主：{detail}',
  errHostError: '宿主返回错误：HTTP {status}',
  endpointHint: '常见原因：该外壳不提供 HTTP 载体（Electron / worker 载体不提供 `webServer`，同一套客户端栈仍会加载），或本插件行在当前 profile 中未激活。',
  envNotWsl: '当前不是 WSL 环境（内核：{kernel}）——本插件依赖 wsl.exe，无法在此工作。请仅在 WSL 发行版内启用。',
  errWslExecMissing: '未配置 wsl.exe 路径，且默认路径 {fallback} 不存在，保活无法启动',
  errStartFailed: '启动保活失败（退出码 {exit}）：{detail}',
  configSection: '配置',
  commandSection: '命令配置',
  pidLabel: '保活进程PID',
  noPid: '—',
  saving: '保存中…',
  saveFailed: '保存失败',
  distroLabel: '运行保活进程的发行版',
  distroDesc: '指定实际运行保活进程的 WSL 发行版（启动命令会带上 `-d <发行版>`）；留空则使用 WSL 的默认发行版。保存时会校验该发行版是否存在，若不存在将撤销修改并提示错误。',
  userLabel: '运行保活进程的用户',
  userDesc: '指定在目标发行版内以哪个用户运行保活进程（启动命令会带上 `--user <用户>`）；留空则使用该发行版的默认用户。保存时会校验该用户在该发行版中是否存在，若不存在将撤销修改并提示错误。',
  wslExecLabel: 'wsl.exe的运行路径',
  wslExecDesc: '指定 wsl.exe 在 Linux 文件系统下的绝对路径，用于调用 Windows / WSL 一侧；留空时自动探测 /mnt/c/Windows/System32/wsl.exe。保存时会校验该文件是否存在，若不存在将撤销修改并提示错误。',
  errDistroMissing: '发行版 "{distro}" 不存在',
  errUserMissingInDistro: '用户 "{user}" 在发行版 "{distro}" 中不存在',
  errUserMissingInDefault: '用户 "{user}" 在默认发行版中不存在',
  errWslPathMissing: 'wsl.exe 路径不存在：{path}',
  errWslExecUnavailable: 'wsl.exe 路径不可用，无法校验',
  errListDistrosFailed: '无法列出 WSL 发行版（wsl.exe 执行失败）',
  errSaveConfigFailed: '保存配置失败（无法写入配置文件）',
  errCommandFailed: '命令执行失败：{detail}',
}
