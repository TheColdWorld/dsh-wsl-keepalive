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
  | 'keepDefaultDefaultDistroLabel'
  | 'keepDefaultDefaultDistroNamed'
  | 'keepDefaultDefaultDistroHint'
  | 'keepDefaultLockedHint'
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
  | 'nameRequired'
  | 'duplicateDistro'
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
  | 'errDistroMissing'
  | 'pathCheckFailed'
  | 'interopDisabled'
  | 'interopUnavailable'
  | 'containerNoInterop'
  | 'envNotWsl'
  | 'errStartFailed'
  | 'errCommandFailed'
  | 'errDuplicateTargets'
  | 'errDistroNameRequired'
  | 'errHostUnsupported'
  | 'unsupportedEnv'
  | 'implicitUnavailableDshDistro'
  | 'implicitUnavailableDefaultDistro'

export const en: Record<KeepAliveKey, string> = {
  title: 'WSL keep-alive',
  description: 'Keep one or more WSL distros alive from the sidebar.',
  configTitle: 'WSL keep-alive targets',
  targetsHint: 'Each target uses its own user. Distro names are required and must be unique.',
  keepDefaultLabel: 'Keep the dsh distro alive',
  keepDefaultNamed: 'Keep the dsh distro alive ({name})',
  keepDefaultHint: 'When off, the distro that runs DSH is not added automatically. Explicit targets are unaffected.',
  keepDefaultDefaultDistroLabel: 'Keep the default distro alive',
  keepDefaultDefaultDistroNamed: 'Keep the default distro alive ({name})',
  keepDefaultDefaultDistroHint: 'The default distro comes from the Windows WSL settings. When off, only explicit targets are kept alive.',
  keepDefaultLockedHint: 'This distro is already in the target list, so default keep-alive is always on.',
  keepDefaultUnavailable: 'This switch needs the updated DSH host; restart DSH to use it.',
  distroLabel: 'Distro',
  distroHint: 'Required, and it must not duplicate another target.',
  userLabel: 'User',
  userHint: 'Leave empty to use the distro default user.',
  wslPathLabel: 'wsl.exe path',
  wslPathHint: 'Leave empty to auto-detect the host default wsl.exe.',
  addTarget: 'Add distro',
  remove: 'Remove',
  save: 'Save',
  saving: 'Saving…',
  saveFailed: 'The deployment did not accept these targets.',
  unavailable: 'This plugin is not configurable right now.',
  noTargets: 'No targets yet. Turn on default keep-alive or add a distro.',
  nameRequired: 'A distro name is required.',
  duplicateDistro: 'The same distro cannot be added twice.',
  startFailed: 'start failed',
  starting: 'Starting…',
  stopping: 'Stopping…',
  endpointMissing: 'The host does not serve /api/wsl-keepalive/*.',
  transportFailed: 'Cannot reach the host: ',
  hostError: 'The host returned an error.',
  errNoTargets: 'No explicit target is configured, and default keep-alive is off or the implicit distro cannot be identified.',
  errWslExecMissing: 'wsl.exe was not found.',
  errPathInvalid: 'The wsl.exe path is not a usable executable file.',
  errWslVersionFailed: 'wsl.exe --version failed.',
  errDistroMissing: 'The selected WSL distro does not exist.',
  pathCheckFailed: 'The wsl.exe path was rejected.',
  interopDisabled: 'WSL interop is disabled in this distro.',
  interopUnavailable: 'WSL interop is unavailable in this distro.',
  containerNoInterop: 'This is a container on a WSL host without interop.',
  envNotWsl: 'This is not a WSL environment.',
  errStartFailed: 'The keep-alive process failed to start.',
  errCommandFailed: 'The keep-alive command failed.',
  errDuplicateTargets: 'Duplicate distros found; the same distro cannot be added twice.',
  errDistroNameRequired: 'A distro name is required.',
  errHostUnsupported: 'This host is not supported for WSL keep-alive in this build.',
  unsupportedEnv: 'Unsupported environment',
  implicitUnavailableDshDistro: 'Cannot identify the distro that runs dsh.',
  implicitUnavailableDefaultDistro: 'Cannot identify the WSL default distro.',
}

export const zh: Record<KeepAliveKey, string> = {
  title: 'WSL 保活',
  description: '在侧边栏统一开关一个或多个 WSL 发行版的保活。',
  configTitle: 'WSL 保活目标',
  targetsHint: '每个目标使用独立的用户；发行版必须填写且不能重复。',
  keepDefaultLabel: '保活dsh所在的发行版',
  keepDefaultNamed: '保活dsh所在的发行版({name})',
  keepDefaultHint: '关闭后不会自动加入运行 DSH 的发行版；已添加的目标不受影响。',
  keepDefaultDefaultDistroLabel: '保活默认发行版',
  keepDefaultDefaultDistroNamed: '保活默认发行版({name})',
  keepDefaultDefaultDistroHint: '默认发行版来自 Windows 的 WSL 设置；关闭后只保活显式目标。',
  keepDefaultLockedHint: '该发行版已在目标列表中，默认保活始终开启。',
  keepDefaultUnavailable: '当前 Host 尚未加载此开关，重启 DSH 后可用。',
  distroLabel: '发行版',
  distroHint: '必填，且不能与其它目标重复。',
  userLabel: '用户',
  userHint: '留空使用该发行版的默认用户。',
  wslPathLabel: 'wsl.exe 路径',
  wslPathHint: '留空自动探测宿主默认的 wsl.exe。',
  addTarget: '添加发行版',
  remove: '移除',
  save: '保存',
  saving: '保存中…',
  saveFailed: '本部署没有接受这些目标。',
  unavailable: '该插件当前不可配置。',
  noTargets: '尚未添加目标。可开启默认保活，或添加一个发行版。',
  nameRequired: '发行版不能为空',
  duplicateDistro: '不允许添加相同的发行版',
  startFailed: '启动失败',
  starting: '启动中…',
  stopping: '停止中…',
  endpointMissing: '宿主未挂载 /api/wsl-keepalive/* 端点。',
  transportFailed: '无法连接宿主：',
  hostError: '宿主返回错误。',
  errNoTargets: '未配置显式目标，且隐式发行版保活已关闭或无法识别。',
  errWslExecMissing: '未找到 wsl.exe。',
  errPathInvalid: 'wsl.exe 路径不是可执行文件。',
  errWslVersionFailed: 'wsl.exe --version 执行失败。',
  errDistroMissing: '指定的 WSL 发行版不存在。',
  pathCheckFailed: 'wsl.exe 路径未通过校验。',
  interopDisabled: '该发行版禁用了 WSL interop。',
  interopUnavailable: '该发行版的 WSL interop 不可用。',
  containerNoInterop: '这是 WSL 宿主机上的容器，没有 interop。',
  envNotWsl: '当前不是 WSL 环境。',
  errStartFailed: '保活进程启动失败。',
  errCommandFailed: '保活命令执行失败。',
  errDuplicateTargets: '存在重复的发行版，不允许添加相同的发行版。',
  errDistroNameRequired: '发行版不能为空。',
  errHostUnsupported: '当前宿主暂不支持 WSL 保活。',
  unsupportedEnv: '不支持的环境',
  implicitUnavailableDshDistro: '无法识别dsh运行的发行版',
  implicitUnavailableDefaultDistro: '无法识别WSL默认发行版',
}
