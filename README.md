# wsl-keepalive — WSL 保活开关插件

[中文](README.md) | [English](README.eng.md)
> [!IMPORTANT]
> **这是非官方第三方项目。** 本项目并非 DeepSeek 官方产品，不由 DeepSeek 开发、发布、背书或提供支持，也不代表 DeepSeek 的立场。`DeepSeek`、`DeepSeek Harness`、`dsh` 及相关名称、标识和商标归其各自权利人所有。关于保活的问题请提交到本仓库，不要联系 DeepSeek 官方支持。
> <br>本插件完全由 AI 生成，以MIT协议进行分发

> [!NOTE]
> **v0.2.0 官方对齐改造**：配置项改为本行的 **Volatile Config**，由 DSH settings 服务持久化到 profile 的 `cordis.patch.yml`（不再是 `~/.dsh/wsl-keepalive.json`）；配置界面从「设置 → 插件」标签页迁移到**主页面 → 插件 → WSL保活 → WSL保活组件**（`plugins.row.config`）；宿主端点改经 **Connection 精确 Fetch 路由**（`/api` 认证），不再直注册 `webServer`。

在 **DSH WebUI** 的**主页面 → 插件 → WSL保活 → WSL保活组件**页里提供「保活」开关，用于防止 WSL 发行版因空闲被 Windows 自动关闭。
切换开关时，由 DSH 宿主机执行 dbus-daemon 的启动 / 停止 / 查询，并将当前 dbus-daemon 的 PID 显示在该组件页面上。

---

## 一、功能

| 能力 | 说明 |
| --- | --- |
| 保活开关 | 在**主页面 → 插件 → WSL保活 → WSL保活组件**页面中拨动开关，即可开启/关闭 WSL 保活 |
| 状态 / PID 显示 | 副标题实时显示 `已启用 · PID <dbus-daemon>` 或 `已停用`，并附发行版名（如 `已启用 · PID 498 · Arch`）|
| 防重复启动 | 开启前先 `pgrep -x dbus-daemon` 查重，已在运行则直接返回，不重复拉起 |
| 精确停止 | 关闭时仅对内存记录/检测到的 dbus-daemon PID 逐个 `kill`，不无差别终止所有 dbus-daemon |
| 自动探测 wsl.exe | `wslExecPath` 为空时使用 `/mnt/c/Windows/System32/wsl.exe` 回退（只读，不再写配置文件） |
| 命令配置 | 「命令配置」区域的发行版/用户/wsl.exe 三项通过官方设置表单编辑并保存；具体校验在运行时（开关/命令）报错，不再在保存时撤销编辑 |
| 配置持久化 | 配置是本行的 Volatile Config，写入 profile 的 `cordis.patch.yml`，跨重启/跨会话保留 |
| 本地化显示 | 插件卡片标题/描述由 `locale/en.json` 与 `locale/zh.json` 的 `meta` 提供；页面文案支持中文（zh）与英文（en），默认/回退为英文，随 DSH UI 语言切换实时更新 |

## 二、要求（前置条件）

运行 DSH Web 的机器需满足：

1. **WSL Interop**：本插件的原理时通过wsl.exe拉起dbus-daemon防止发行版空闲，需要WSL Interop使得在Wsl中调用wsl.exe --exec
2. **wsl.exe 可访问**：`/mnt/c/Windows/System32/wsl.exe`，或通过配置 `wsl-exec-path` 指定其在 Linux 环境下的绝对路径。
3. **dbus-launch**：目标发行版内已安装 `dbus-launch`（`/usr/bin/dbus-launch`）。
4. **DSH Web**：已通过 Web profile 方式安装插件（见「安装」）。
5. **Node.js**：构建工具链运行所需（`^22.19.0 || >=24.0.0`）。

> 注：停止保活仅对插件记录/检测到的 dbus-daemon PID 精确 `kill`，不会无差别终止目标内所有 dbus-daemon。

## 三、配置

配置是**插件行的 Volatile Config**，由 DSH settings 服务投影为可编辑表单，并写入 profile 的 `cordis.patch.yml`（不是插件私有文件）。打开**主页面 → 插件 → WSL保活 → WSL保活组件**页面即可编辑（即 `wsl-keepalive` bundle 下 id 为 `wsl-keepalive` 行的配置页）。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `wslDistName` | 字符串 | 目标发行版名。**非空**时启动命令追加 `-d <name>`；**为空**时使用默认发行版 |
| `wslUserName` | 字符串 | 在目标发行版内运行保活进程的用户。**非空**时启动命令追加 `--user <name>`；**为空**时使用该发行版默认用户 |
| `wslExecPath` | 字符串 | `wsl.exe` 在 Linux 文件系统下的绝对路径。**为空**时回退到 `/mnt/c/Windows/System32/wsl.exe`（只读探测）；两者皆无则报错进入错误态 |

保存由 DSH settings 表单统一提交（`ctx.configForms` → profile patch）：schema 校验通过即写入，随后**无需重启**生效（服务在每次状态/开关时重读 Volatile Config）。发行版/用户/wsl.exe 是否真实存在的运行时校验发生在实际执行命令时，失败会通过状态区显示，而不会在保存时静默撤销。

> **从旧版自动迁移**：首次启动时若检测到旧的 `${DSH_HOME:-~/.dsh}/wsl-keepalive.json`，其非空字段会被一次性导入本行的设置文档（写入 profile 的 `cordis.patch.yml`），随后旧文件重命名为 `wsl-keepalive.json.imported`。已被配置过的字段不会被覆盖；若写入被拒绝则保留旧文件并在下次启动重试。

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

重启完成后，在 WebUI 打开**主页面 → 插件 → WSL保活 → WSL保活组件**即可看到「保活」开关。

### 卸载

```bash
dsh plugin --profile web remove wsl-keepalive
#重启 dsh
```

旧版配置文件 `~/.dsh/wsl-keepalive.json` 会保留，需要时手动删除。

## 五、工作原理

- **通信机制**：插件 Host 通过 **Connection 精确 Fetch 路由**提供 `/api/wsl-keepalive/status`（GET）与 `/api/wsl-keepalive/set`（POST）两个同源 JSON 端点，浏览器半边通过 `fetch` 调用；配置不再走 HTTP，而由 DSH settings 表单（`ctx.configForms`）写入 profile 的 Cordis patch。
- **可选 Connection 载体**：`connection` 是可选能力（非 HTTP 外壳不提供它）。因此本插件不把 `connection` 写进静态 `inject`（那会让该行永久 `pending`），而是用 `ctx.inject(['connection'], …)` 取得子 fiber，并在该 fiber 的 `ctx.effect` 内调用 `ctx.connection.fetch.register(route)`：路由随载体卸载而撤销、随其重新提供而重建。注册在 Connection 的 `/api` prefix 之下，因而经过 `ctx.connection.admit()` 的 Host/Origin 与浏览器会话鉴权，而不是绕过它。
- **显性服务引用**：宿主侧引入 `@deepseek-ai/cordis` 的 `Context`/`Volatile`、`@deepseek-ai/schemastery`（Config schema）、`@deepseek-ai/dsh-client-connection`（`ctx.connection` + `ConnectionFetchRoute`）、`@deepseek-ai/dsh-settings`（页面策略）；浏览器侧引入 `dsh-client-ui-renderer`（`ctx.slots`）、`dsh-client-ui-plugin-manager`（`plugins.row.config` 槽声明）、`dsh-client-ui-settings`（`ctx.configForms`）、`dsh-client-ui-primitives`（`SettingsForm`/`SettingsValueField`）、`dsh-client-ui-slots`（`PropsLocale`/`LocaleNamespaceMap`）、`dsh-client-locale`（`ctx.locale`）、`dsh-client-store`（`SnapshotStore`）。**不使用** `ctx.shell`/`ctx.fs`：保活命令在宿主平面直接用 Node 的 `child_process` 执行。
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
├── locale/                 # 插件卡片本地化元数据：en.json / zh.json（meta.title / meta.description）
├── shared/                 # 通用构建辅助（web-platform.ts / tsdown.client.ts）
└── src/
    ├── index.ts            # Host 插件入口：导出 Volatile Config schema，并用 ctx.inject(['connection']) 注册 /api/wsl-keepalive/* Fetch 路由
    ├── service.ts          # 保活核心：读取 Volatile Config、PID 记录、status/start/stop
    ├── routes.ts           # Connection 精确 Fetch 路由（status / set）
    └── client/
        ├── index.ts        # Client 模块：注册 plugins.row.config 页（主页面 → 插件 → WSL保活 → WSL保活组件）
        ├── controller.ts   # ctx.configForms 上的设置表单模型 + 状态/开关
        ├── KeepAliveConfig.tsx
        ├── host-endpoint.ts # 同源 JSON fetch + 失败分类（端点不可达 / 宿主拒绝）
        ├── i18n.ts         # 本地化字典（en / zh），注册进 DSH locale 服务
        ├── keepalive.module.css
        └── css-modules.d.ts
```
