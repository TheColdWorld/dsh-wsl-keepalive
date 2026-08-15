# wsl-keepalive — WSL 保活开关插件

在 **DSH WebUI** 的设置里提供「保活」开关，用于防止 WSL 发行版因空闲被 Windows 自动关闭。
切换开关时，由 DSH 宿主机执行 dbus-daemon 的启动 / 停止 / 查询，并将当前 dbus-daemon 的 PID 显示在设置界面。

---

## 一、功能

| 能力 | 说明 |
| --- | --- |
| 保活开关 | 「设置 → General」里新增「保活」行，拨动即可开启/关闭 WSL 保活 |
| 状态 / PID 显示 | 副标题实时显示 `已启用 · PID <dbus-daemon>` 或 `已停用`，并附发行版名（如 `已启用 · PID 498 · Arch`）|
| 防重复启动 | 开启前先 `pgrep -x dbus-daemon` 查重，已在运行则直接返回，不重复拉起 |
| 精确停止 | 关闭时仅对内存记录/检测到的 dbus-daemon PID 逐个 `kill`，不无差别终止所有 dbus-daemon |
| 自动探测 wsl.exe | `wsl-exec-path` 未配置时，自动探测 `/mnt/c/Windows/System32/wsl.exe`，存在则写入配置 |
| 配置持久化 | 配置存于 `~/.dsh/wsl-keepalive.json`（与 dsh-ssh 插件同目录），跨重启/跨会话保留 |

## 二、要求（前置条件）

运行 DSH Web 的机器需满足：

1. **WSL Interop**：本插件的原理时通过wsl.exe拉起dbus-daemon防止发行版空闲，需要WSL Interop使得在Wsl中调用wsl.exe --exec
2. **wsl.exe 可访问**：`/mnt/c/Windows/System32/wsl.exe`，或通过配置 `wsl-exec-path` 指定其在 Linux 环境下的绝对路径。
3. **dbus-launch**：目标发行版内已安装 `dbus-launch`（`/usr/bin/dbus-launch`）。
4. **DSH Web**：已通过 Web profile 方式安装插件（见「安装」）。
5. **Node.js**：构建工具链运行所需（`^22.19.0 || >=24.0.0`）。

> 注：停止保活仅对插件记录/检测到的 dbus-daemon PID 精确 `kill`，不会无差别终止目标内所有 dbus-daemon。

## 三、配置 `~/.dsh/wsl-keepalive.json`

插件启动时读取；字段缺失或文件缺失时按空值处理，并在需要时自动创建 / 写入。

```json
{
  "wsl-dist-name": "",
  "wsl-exec-path": "/mnt/c/Windows/System32/wsl.exe"
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `wsl-dist-name` | 字符串 | 目标发行版命名。**非空**时启动命令追加 `-d ${wsl-dist-name}`；**为空**时使用默认发行版 |
| `wsl-exec-path` | 字符串 | `wsl.exe` 在 Linux 文件系统下的绝对路径。**为空**时启动期自动探测 `/mnt/c/Windows/System32/wsl.exe`，存在则写入配置；两者皆无则报错进入错误态 |

## 四、安装

使用 DSH 官方插件安装方式 `dsh plugin --profile web add`（与 dsh-balance-meter 相同）。

```bash
# 1. 进入本包目录
cd wsl-keepalive-static

# 2. 安装构建依赖并构建（产出 lib/index.js 与 lib/client.js）
pnpm build              # 等价于 tsc -b && tsdown

# 3. 安装进 web profile
dsh plugin --profile web add link:$(pwd)
#    等价于：把本包加入 ~/.dsh/profiles/web/package.json
#    的 dependencies 与 dsh.profile.bundles，并执行 pnpm install

# 4. 重启 DSH
```

重启完成后，在 WebUI「设置 → General」即可看到「保活」开关。

### 卸载

```bash
dsh plugin --profile web remove wsl-keepalive
#重启 dsh
```

配置文件 `~/.dsh/wsl-keepalive.json` 会保留，需要时手动删除。

## 五、工作原理

- **通信机制**：插件 Host 通过 `ctx.webServer.register` 提供 `/api/wsl-keepalive/status` 与 `/api/wsl-keepalive/set` 两个 JSON 端点，浏览器半边通过 `fetch` 调用。
- **外部引用最小化**：源码仅依赖 `react`（浏览器半边运行时必需）；宿主服务（shell/fs/webServer/slots）通过 `src/types.ts` 的本地结构类型 + `ctx.get()` 访问，构建时类型擦除，运行时零额外依赖。
- **PID 记录**：dbus-daemon PID 由 Host 在每次查询后记录于内存，随插件生命周期存续；重启后重新查询真实状态。

## 六、目录结构

```
wsl-keepalive-static/
├── package.json            # dsh.bundle.patch + dsh.client 声明
├── tsconfig.json           # TypeScript 构建配置
├── tsdown.config.ts        # tsdown 构建入口
├── cordis.patch.yml        # 插件行声明（dsh plugin add 时注入）
├── README.md               # 本文档
├── shared/                 # 通用构建辅助
└── src/
    ├── types.ts            # 本地最小结构类型（唯一的宿主交互面）
    ├── index.ts            # Host 插件入口：注册 /api/wsl-keepalive/* 路由
    ├── service.ts          # 保活核心：配置读写、PID 记录、status/start/stop
    ├── routes.ts           # HTTP 路由（status / set）
    └── client/
        ├── index.ts        # Client 模块：注册「设置 → General」开关行
        ├── KeepAliveToggle.tsx
        ├── keepalive.module.css
        └── css-modules.d.ts
```
