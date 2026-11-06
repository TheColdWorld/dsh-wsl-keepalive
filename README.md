# dsh-wsl-keepalive — WSL 多发行版保活开关

[中文](README.md) | [English](README.eng.md)

> [!IMPORTANT]
> **非官方第三方项目。** 本项目不是 DeepSeek 官方产品，不由 DeepSeek 开发、发布或背书。
> DeepSeek、DeepSeek Harness、dsh 及相关名称归其各自权利人所有。
> <br>本插件完全由 AI 生成，以MIT协议进行分发

在 DSH Web 侧边栏的余额卡下方提供一行紧凑开关，用于统一开启/关闭多个 WSL 发行版的保活进程。

## 功能

- 一个开关管理多个发行版。
- 每个发行版可单独配置 wsl.exe 路径和启动用户。
- 默认自动保活 DSH 所在发行版，可用配置页的开关关闭；关闭后只保活显式添加的目标。
- 发行版留空时仍使用运行 DSH 进程的发行版。
- 打开后 Tooltip 显示每个目标：

      distro1(1234)
      distro2(5678)

  启动失败显示：

      ubuntu(启动失败)

  不写“默认发行版”；无法确定发行版名时省略名称。
- 不注册快捷键，不做自定义键盘绑定。
- 不硬编码侧边栏收起宽度；布局跟随侧边栏的 wide 状态和 CSS 变量。
- 不使用 pgrep / pkill。停止使用：

      wsl -d <distro> -u root --exec kill <pid>

  每个发行版使用自己的 wsl.exe 路径；kill 前再次校验 PID 为数字且
  `/proc/<pid>/cmdline` 含保活标记，校验不通过时不会执行 root kill。
- keepalive.sh 是唯一外部脚本。启动前由 Node 读回原始字节并逐字符比较，
  不一致时覆写标准内容、chmod 700、记录日志并再次比较后才启动；
  日志会带上被篡改文件的原文（JSON 转义、按长度截断）；
  不依赖 sha256sum/cut 等额外工具。
- 环境检测优先检查目标发行版的 binfmt_misc，再检查 /run/WSL interop socket，最后做真实 wsl.exe 探测。

## 要求

- DSH >= 0.2.2-rc.1 < 0.3.0
- Node.js ^22.19.0 或 >= 24
- 能执行 wsl.exe 的 WSL 环境
- 目标发行版有 POSIX sh、sleep、kill、cat、chmod、grep、tr

## 安装

本地构建并链接：

    pnpm install
    pnpm build
    dsh plugin --profile web add link:$(pwd)

或从 GitHub 安装：

    dsh plugin --profile web add github:TheColdWorld/dsh-wsl-keepalive

Git 安装会执行 prepare 脚本构建 lib/。pnpm 10+ 首次会拒绝构建脚本，按 dsh 提示在 profile 的 pnpm-workspace.yaml 中允许该包即可。

卸载：

    dsh plugin --profile web remove dsh-wsl-keepalive

## 配置

在 Plugins 页打开本插件的配置页，编辑目标列表。每行：

| 字段 | 说明 |
| --- | --- |
| 发行版 | 留空使用运行 DSH 进程的发行版 |
| 用户 | 启动保活进程的用户；留空使用发行版默认用户 |
| wsl.exe 路径 | 留空自动探测 /mnt/c/Windows/System32/wsl.exe |

配置页另有“保活dsh所在的发行版(<发行版名称>)”开关，默认开启。关闭后，
如果目标列表为空，开关不会启动任何保活进程。

保存前会把路径解析为绝对路径、检查文件存在且可执行，并执行一次
`wsl.exe --version`；任一步失败都会取消写入并显示原因。保存写入 profile 的
cordis.patch.yml。


## 开发

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm pack

测试使用独立的 DSH_HOME 和 3099 端口，不影响正在运行的 3080 实例。详见 AGENTS.md。

## License

MIT
