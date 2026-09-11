# wsl-keepalive — WSL 保活开关插件

[中文](README.md) | [English](README.eng.md)
> [!IMPORTANT]
> **这是非官方第三方项目。** 本项目并非 DeepSeek 官方产品，不由 DeepSeek 开发、发布、背书或提供支持，也不代表 DeepSeek 的立场。`DeepSeek`、`DeepSeek Harness`、`dsh` 及相关名称、标识和商标归其各自权利人所有。关于保活的问题请提交到本仓库，不要联系 DeepSeek 官方支持。
> <br>本插件完全由 AI 生成，以MIT协议进行分发

在 **DSH WebUI** 的设置里提供「保活」开关，用于防止 WSL 发行版因空闲被 Windows 自动关闭。
切换开关时，由 DSH 宿主机执行 dbus-daemon 的启动 / 停止 / 查询，并将当前 dbus-daemon 的 PID 显示在设置界面。

---

## 一、功能

| 能力 | 说明 |
| --- | --- |
| 保活开关 | 「设置 → 插件」里新增「保活」行，拨动即可开启/关闭 WSL 保活 |
| 状态 / PID 显示 | 副标题实时显示 `已启用 · PID <dbus-daemon>` 或 `已停用`，并附发行版名（如 `已启用 · PID 498 · Arch`）|
| 防重复启动 | 开启前先 `pgrep -x dbus-daemon` 查重，已在运行则直接返回，不重复拉起 |
| 精确停止 | 关闭时仅对内存记录/检测到的 dbus-daemon PID 逐个 `kill`，不无差别终止所有 dbus-daemon |
| 自动探测 wsl.exe | `wsl-exec-path` 未配置时，自动探测 `/mnt/c/Windows/System32/wsl.exe`，存在则写入配置 |
| 命令配置校验 | 「命令配置」区域的发行版/用户/wsl.exe 三项带描述与运行时校验，校验失败撤销修改并以红色提示原因，反之落盘 |
| 配置持久化 | 配置存于 `${DSH_HOME:-~/.dsh}/wsl-keepalive.json`，跨重启/跨会话保留 |
| 本地化显示 | WebUI 显示文本支持中文（zh）与英文（en），默认/回退为英文；字典注册进 DSH locale 服务，随 DSH UI 语言切换实时更新 |

## 二、要求（前置条件）

运行 DSH Web 的机器需满足：

1. **WSL Interop**：本插件的原理时通过wsl.exe拉起dbus-daemon防止发行版空闲，需要WSL Interop使得在Wsl中调用wsl.exe --exec
2. **wsl.exe 可访问**：`/mnt/c/Windows/System32/wsl.exe`，或通过配置 `wsl-exec-path` 指定其在 Linux 环境下的绝对路径。
3. **dbus-launch**：目标发行版内已安装 `dbus-launch`（`/usr/bin/dbus-launch`）。
4. **DSH Web**：已通过 Web profile 方式安装插件（见「安装」）。
5. **Node.js**：构建工具链运行所需（`^22.19.0 || >=24.0.0`）。

> 注：停止保活仅对插件记录/检测到的 dbus-daemon PID 精确 `kill`，不会无差别终止目标内所有 dbus-daemon。

## 三、配置 `~/.dsh/wsl-keepalive.json`

插件启动时读取；字段缺失或文件缺失时按空值处理，并在需要时自动创建 / 写入。配置路径优先使用 `${DSH_HOME}/wsl-keepalive.json`（`DSH_HOME` 未设置时回退到 `~/.dsh/wsl-keepalive.json`），与旧版配置地址一致。

```json
{
  "wsl-dist-name": "",
  "wsl-user-name": "",
  "wsl-exec-path": "/mnt/c/Windows/System32/wsl.exe"
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `wsl-dist-name` | 字符串 | 目标发行版命名。**非空**时启动命令追加 `-d ${wsl-dist-name}`；**为空**时使用默认发行版。设置后做运行时检查，若该发行版不存在则撤销修改并提示错误 |
| `wsl-user-name` | 字符串 | 运行保活进程的用户名（在指定发行版内）。**非空**时启动命令追加 `--user ${wsl-user-name}`；**为空**时使用该发行版的默认用户。设置后做运行时检查，若该用户不存在则撤销修改并提示错误 |
| `wsl-exec-path` | 字符串 | `wsl.exe` 在 Linux 文件系统下的绝对路径。**为空**时启动期自动探测 `/mnt/c/Windows/System32/wsl.exe`，存在则写入配置；两者皆无则报错进入错误态。设置后做运行时检查，若文件不存在则撤销修改并提示错误 |

在「设置 → 插件」的 WSL保活 页签中，「命令配置」区域的三个配置项均带有描述与运行时校验：编辑后失焦/回车即提交，校验失败会撤销该次修改并以红色提示具体原因（发行版不存在 / 用户不存在 / wsl.exe 不存在）；校验成功则落盘到上述配置文件。

## 四、安装

### 方式一：使用dsh plugin add安装

内容仓库位于 `https://github.com/TheColdWorld/dsh-wsl-keepalive.git`，可通过仓库地址直接安装：

```bash
# 1. 通过仓库地址直接安装
dsh plugin --profile web add "github:TheColdWorld/dsh-wsl-keepalive"
#    或使用显式 git 地址：
#    dsh plugin --profile web add "git+https://github.com/TheColdWorld/dsh-wsl-keepalive.git"

# 2. 重启 DSH
```

### 方式二：本地构建

```bash
git clone https://github.com/TheColdWorld/dsh-wsl-keepalive.git
cd dsh-wsl-keepalive
pnpm install .          # 安装构建依赖
pnpm build              # 构建产出 lib/index.js 与 lib/client.js
dsh plugin --profile web add link:$(pwd)
# 之后重启 dsh
```

重启完成后，在 WebUI「设置 → 插件」即可看到「保活」开关。

### 卸载

```bash
dsh plugin --profile web remove wsl-keepalive
#重启 dsh
```

配置文件 `~/.dsh/wsl-keepalive.json` 会保留，需要时手动删除。

## 五、工作原理

- **通信机制**：插件 Host 提供 `/api/wsl-keepalive/status`、`/api/wsl-keepalive/set`、`/api/wsl-keepalive/config`（GET/POST）四个同源 JSON 端点，浏览器半边通过 `fetch` 调用。
- **可选 webServer 载体（DSH ≥ 0.1.5）**：0.1.5 起 HTTP 载体 `webServer` 是**可选**能力（Electron / worker 等非 HTTP 外壳不提供它，同一套客户端栈仍要能加载）。因此本插件不把 `webServer` 写进行的静态 `inject`（那会让该行永久 `pending` 并让启动激活审计失败），而是**无条件**用 `ctx.inject(['webServer'], …)` 取得载体（与 DSH 自带的 `dsh-client-connection` 的 `/api` 路由同形）：该调用创建一个子 fiber，载体已绑定或稍后绑定都会在就绪时运行它，插件行自身始终照常激活。路由注册写在子 fiber 的 `ctx.effect` 内，随载体卸载而撤销、随其重新提供而重建；载体缺失时仅路由 404。注意不要在插件行自己的 ctx 上读 `ctx.webServer`——cordis 4 对未声明 inject 的服务属性访问会直接抛 `cannot get property "webServer" without inject`。
- **显性服务引用**：宿主侧只引入真正使用的契约——`@deepseek-ai/cordis` 的 `Context` 与 `@deepseek-ai/dsh-host-webserver` 的 `WebRoute`（其 `declare module` 增强使 `ctx.webServer` 成为带类型的属性）；浏览器侧引入 `dsh-client-ui-renderer`（`ctx.slots`）、`dsh-client-ui-settings`（`settings.plugins.tab` 槽位声明）、`dsh-client-ui-slots`（`PropsLocale`/`LocaleNamespaceMap`）、`dsh-client-locale`（`ctx.locale`）。**不使用** `ctx.shell`/`ctx.fs`：保活命令在宿主平面直接用 Node 的 `child_process`/`fs` 执行，因此 `dsh-shell`/`dsh-fs` 不再作为依赖引入（v0.1.2-rc.1 时代曾以空 `import type {}` 引入，仅为类型增强，构建时即被擦除）。
- **保活状态**：dbus-daemon PID 由 Host 在每次查询后记录于内存，随插件生命周期存续；重启后重新查询真实状态。
- **错误分类显示（两类失败绝不混为一谈）**：
  | 类别 | 触发条件 | 界面表现 |
  | --- | --- | --- |
  | **端点不可达**（`endpoint`） | 宿主根本没有 `/api/wsl-keepalive/*` 这条路由：该外壳不提供 HTTP 载体（Electron / worker 载体）、插件行未激活，或网络层直接失败。包含“SPA 兜底把未知路径用 `index.html` + HTTP 200 回包”这种伪成功 | 副标题：`不可用：宿主未挂载 /api/wsl-keepalive/* 端点（响应：HTTP …）`；状态行：红色“常见原因：该外壳不提供 HTTP 载体 / 插件行未激活”+ 灰色“开关仍可点击重试”与原始终点细节 |
  | **宿主拒绝**（`host`） | 请求到达了宿主，宿主明确拒绝：非 WSL 环境、wsl.exe 路径缺失、命令执行失败 | 副标题：按 DSH UI 语言本地化的原因（`当前不是 WSL 环境（内核：…）` 等）；状态行：灰色显示宿主原始细节（英文说明 / 命令行 / 退出码） |
  
  为此 `/api/wsl-keepalive/status` 与 `/set` 的响应新增两个字段：`errorCode`（稳定本地化码，由客户端字典 `src/client/i18n.ts` 拥有）与 `errorParams`（模板参数）；原有 `error` 保留为**技术细节**，不再作为界面主文案。

## 六、目录结构

```
wsl-keepalive/
├── package.json            # dsh.bundle.patch + dsh.client 声明
├── tsconfig.json           # TypeScript 构建配置
├── tsdown.config.ts        # tsdown 构建入口
├── cordis.patch.yml        # 插件行声明（dsh plugin add 时注入）
├── README.md               # 本文档（中文原版）
├── README.eng.md           # 本文档（英文翻译）
├── shared/                 # 通用构建辅助（web-platform.ts / tsdown.client.ts）
└── src/
    ├── index.ts            # Host 插件入口：ctx.inject(['webServer']) 取得载体并注册 /api/wsl-keepalive/* 路由
    ├── service.ts          # 保活核心：配置读写、PID 记录、status/start/stop
    ├── routes.ts           # HTTP 路由（status / set / config）
    └── client/
        ├── index.ts        # Client 模块：注册「设置 → 插件」下的本插件配置选项卡
        ├── KeepAliveConfig.tsx
        ├── host-endpoint.ts # 同源 JSON fetch + 失败分类（端点不可达 / 宿主拒绝）
        ├── i18n.ts         # 本地化字典（en / zh），注册进 DSH locale 服务
        ├── keepalive.module.css
        └── css-modules.d.ts
```
