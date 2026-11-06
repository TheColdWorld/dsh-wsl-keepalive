/**
 * Localization dictionaries for the sidebar switch and configuration page.
 * @module dsh-wsl-keepalive/client/i18n
 */

export type KeepAliveKey =
  | 'title'
  | 'description'
  | 'configTitle'
  | 'targetsHint'
  | 'keepDefaultLabel'
  | 'keepDefaultNamed'
  | 'keepDefaultHint'
  | 'keepDefaultUnavailable'
  | 'distroLabel'
  | 'distroHint'
  | 'userLabel'
  | 'userHint'
  | 'wslPathLabel'
  | 'wslPathHint'
  | 'addTarget'
  | 'remove'
  | 'save'
  | 'saving'
  | 'saveFailed'
  | 'unavailable'
  | 'noTargets'
  | 'startFailed'
  | 'starting'
  | 'stopping'
  | 'endpointMissing'
  | 'transportFailed'
  | 'hostError'
  | 'errNoTargets'
  | 'errWslExecMissing'
  | 'errPathInvalid'
  | 'errWslVersionFailed'
  | 'pathCheckFailed'
  | 'interopDisabled'
  | 'interopUnavailable'
  | 'containerNoInterop'
  | 'envNotWsl'
  | 'errStartFailed'
  | 'errCommandFailed'

export const en: Record<KeepAliveKey, string> = {
  title: 'WSL keep-alive',
  description: 'Keep one or more WSL distros alive from the sidebar, including the DSH distro by default.',
  configTitle: 'WSL keep-alive targets',
  targetsHint: 'Each target uses its own user and wsl.exe path. The DSH distro is kept alive by default; turn that off below.',
  keepDefaultLabel: 'Keep the dsh distro alive',
  keepDefaultNamed: 'Keep the dsh distro alive ({name})',
  keepDefaultHint: 'When off, the distro that runs DSH is not added automatically. Explicit targets are unaffected.',
  keepDefaultUnavailable: 'This switch needs the updated DSH host; restart DSH to use it.',
  distroLabel: 'Distro',
  distroHint: 'Leave empty to use the distro that runs this DSH process.',
  userLabel: 'User',
  userHint: 'Leave empty to use the distro default user.',
  wslPathLabel: 'wsl.exe path',
  wslPathHint: 'Leave empty to auto-detect /mnt/c/Windows/System32/wsl.exe.',
  addTarget: 'Add distro',
  remove: 'Remove',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these targets.',
  unavailable: 'This plugin is not configurable right now.',
  noTargets: 'No targets yet. The DSH distro is kept alive by default; add another distro if needed.',
  startFailed: 'start failed',
  starting: 'Starting…',
  stopping: 'Stopping…',
  endpointMissing: 'The host does not serve /api/wsl-keepalive/*.',
  transportFailed: 'Cannot reach the host: ',
  hostError: 'The host returned an error.',
  errNoTargets: 'No distro is configured and default-distro keep-alive is off or the DSH distro cannot be detected.',
  errWslExecMissing: 'wsl.exe was not found.',
  errPathInvalid: 'The wsl.exe path is not a usable executable file.',
  errWslVersionFailed: 'wsl.exe --version failed.',
  pathCheckFailed: 'The wsl.exe path was rejected.',
  interopDisabled: 'WSL interop is disabled in this distro.',
  interopUnavailable: 'WSL interop is unavailable in this distro.',
  containerNoInterop: 'This is a container on a WSL host without interop.',
  envNotWsl: 'This is not a WSL environment.',
  errStartFailed: 'The keep-alive process failed to start.',
  errCommandFailed: 'The keep-alive command failed.',
}

export const zh: Record<KeepAliveKey, string> = {
  title: 'WSL 保活',
  description: '在侧边栏统一开关多个 WSL 发行版的保活，默认包含运行 DSH 的发行版。',
  configTitle: 'WSL 保活目标',
  targetsHint: '每个目标使用独立的用户和 wsl.exe 路径。默认自动保活 DSH 所在发行版，可用下方开关关闭。',
  keepDefaultLabel: '保活dsh所在的发行版',
  keepDefaultNamed: '保活dsh所在的发行版({name})',
  keepDefaultHint: '关闭后不会自动加入运行 DSH 的发行版；已添加的目标不受影响。',
  keepDefaultUnavailable: '当前 Host 尚未加载此开关，重启 DSH 后可用。',
  distroLabel: '发行版',
  distroHint: '留空使用运行此 DSH 进程的发行版。',
  userLabel: '用户',
  userHint: '留空使用该发行版的默认用户。',
  wslPathLabel: 'wsl.exe 路径',
  wslPathHint: '留空自动探测 /mnt/c/Windows/System32/wsl.exe。',
  addTarget: '添加发行版',
  remove: '移除',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些目标。',
  unavailable: '该插件当前不可配置。',
  noTargets: '尚未添加目标。默认会自动保活 DSH 所在发行版；也可以添加其他发行版。',
  startFailed: '启动失败',
  starting: '启动中…',
  stopping: '停止中…',
  endpointMissing: '宿主未挂载 /api/wsl-keepalive/* 端点。',
  transportFailed: '无法连接宿主：',
  hostError: '宿主返回错误。',
  errNoTargets: '未配置发行版，且默认发行版保活已关闭或无法检测 DSH 所在发行版。',
  errWslExecMissing: '未找到 wsl.exe。',
  errPathInvalid: 'wsl.exe 路径不是可执行文件。',
  errWslVersionFailed: 'wsl.exe --version 执行失败。',
  pathCheckFailed: 'wsl.exe 路径未通过校验。',
  interopDisabled: '该发行版禁用了 WSL interop。',
  interopUnavailable: '该发行版的 WSL interop 不可用。',
  containerNoInterop: '这是 WSL 宿主机上的容器，没有 interop。',
  envNotWsl: '当前不是 WSL 环境。',
  errStartFailed: '保活进程启动失败。',
  errCommandFailed: '保活命令执行失败。',
}
