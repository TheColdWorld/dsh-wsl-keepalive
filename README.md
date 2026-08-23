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

- **通信机制**：插件 Host 通过 `ctx.webServer.register` 提供 `/api/wsl-keepalive/status` 与 `/api/wsl-keepalive/set` 两个 JSON 端点，浏览器半边通过 `fetch` 调用。
- **显性服务引用**：宿主服务（webServer/shell/fs）与浏览器服务（slots/locale）通过引入真实的 `@deepseek-ai/*` 契约（`@deepseek-ai/cordis` 的 `Context` 及 `dsh-host-webserver`/`dsh-shell`/`dsh-fs`/`dsh-client-*` 的类型增强）直接以类型化属性访问，如 `ctx.webServer`、`ctx.shell`、`ctx.fs`、`scope.slots`，替代原先基于字符串 `ctx.get('...')` 与本地结构类型（`src/types.ts`）的隐式引用；构建时类型擦除，运行时依赖来自 DSH 的 `@deepseek-ai/*` 包。
- **PID 记录**：dbus-daemon PID 由 Host 在每次查询后记录于内存，随插件生命周期存续；重启后重新查询真实状态。

## 六、目录结构

```
wsl-keepalive-static/
├── package.json            # dsh.bundle.patch + dsh.client 声明
├── tsconfig.json           # TypeScript 构建配置
├── tsdown.config.ts        # tsdown 构建入口
├── cordis.patch.yml        # 插件行声明（dsh plugin add 时注入）
├── README.md               # 本文档（中文原版）
├── README.eng.md           # 本文档（英文翻译）
├── shared/                 # 通用构建辅助
└── src/
    ├── index.ts            # Host 插件入口：注册 /api/wsl-keepalive/* 路由（显式引用 webServer/shell/fs）
    ├── service.ts          # 保活核心：配置读写、PID 记录、status/start/stop
    ├── routes.ts           # HTTP 路由（status / set）
    └── client/
        ├── index.ts        # Client 模块：注册「设置 → 插件」下的本插件配置选项卡
        ├── KeepAliveToggle.tsx
        ├── i18n.ts           # 本地化字典（en / zh），注册进 DSH locale 服务
        ├── keepalive.module.css
        └── css-modules.d.ts
```
