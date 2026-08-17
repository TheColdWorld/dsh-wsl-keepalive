# wsl-keepalive — WSL Keep-Alive Toggle Plugin

[中文](README.md) | [English](README.eng.md)

> [!IMPORTANT]
> **This is an unofficial third-party project.** This project is not an official DeepSeek product, and is not developed, published, endorsed, or supported by DeepSeek, nor does it represent DeepSeek's position. `DeepSeek`, `DeepSeek Harness`, `dsh` and related names, logos, and trademarks belong to their respective owners. For keep-alive issues, please submit them to this repository; do not contact DeepSeek official support.
> This plugin is completely AI-generated and distributed under the MIT license.

Provides a **Keep-Alive** toggle in the **DSH WebUI** settings to prevent WSL distros from being automatically shut down by Windows when idle.
When toggled, the DSH host starts/stops/queries the dbus-daemon via `wsl.exe` and shows the current dbus-daemon PID in the settings UI.

---

## 1. Features

| Capability | Description |
| --- | --- |
| Keep-Alive toggle | Adds a **Keep-Alive** row under **Settings → General**; flip it to enable/disable WSL keep-alive |
| Status / PID display | The subtitle shows `Enabled · PID <dbus-daemon>` or `Disabled` in real time, plus the distro name (e.g. `Enabled · PID 498 · Arch`) |
| Duplicate-start protection | Runs `pgrep -x dbus-daemon` before enabling; if already running, returns immediately without starting a duplicate |
| Precise stop | On disable, `kill`s only the dbus-daemon PIDs recorded in memory / detected, without indiscriminately killing all dbus-daemon processes |
| Auto-detect wsl.exe | When `wsl-exec-path` is not configured, auto-detects `/mnt/c/Windows/System32/wsl.exe` and writes it to the config if present |
| Config persistence | Config is stored at `~/.dsh/wsl-keepalive.json` (same directory as the dsh-ssh plugin), persists across restarts / sessions |
| Localized UI | WebUI display text supports Chinese (`zh-cn`) and English (`en`), defaulting/falling back to English |

## 2. Requirements (Prerequisites)

The machine running DSH Web must satisfy:

1. **WSL Interop**: This plugin works by launching dbus-daemon through wsl.exe to prevent the distro from going idle; it needs WSL Interop so that `wsl.exe --exec` can be called from within WSL.
2. **wsl.exe accessible**: `/mnt/c/Windows/System32/wsl.exe`, or set `wsl-exec-path` to its absolute path under the Linux environment.
3. **dbus-launch**: `dbus-launch` (`/usr/bin/dbus-launch`) must be installed inside the target distro.
4. **DSH Web**: The plugin must be installed via the Web profile (see "Installation").
5. **Node.js**: Required for the build toolchain (`^22.19.0 || >=24.0.0`).

> Note: Stopping keep-alive only `kill`s the dbus-daemon PIDs recorded/detected by the plugin; it never indiscriminately terminates all dbus-daemon processes in the target.

## 3. Configuration `~/.dsh/wsl-keepalive.json`

Read at plugin startup; missing fields or a missing file are treated as empty values, and the file is auto-created / written when needed.

```json
{
  "wsl-dist-name": "",
  "wsl-exec-path": "/mnt/c/Windows/System32/wsl.exe"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `wsl-dist-name` | string | The target distro name. When **non-empty**, the start command appends `-d ${wsl-dist-name}`; when **empty**, the default distro is used |
| `wsl-exec-path` | string | Absolute path to `wsl.exe` on the Linux filesystem. When **empty**, `/mnt/c/Windows/System32/wsl.exe` is auto-detected at startup and written to the config if present; if neither exists it errors and enters an error state |

## 4. Installation

### Option A — Install via `dsh plugin add`

The content repository is at `https://github.com/TheColdWorld/dsh-wsl-keepalive.git` and can be installed directly from the repository URL:

```bash
# 1. Install directly from the repository URL
dsh plugin --profile web add "github:TheColdWorld/dsh-wsl-keepalive"
#    Or use an explicit git URL:
#    dsh plugin --profile web add "git+https://github.com/TheColdWorld/dsh-wsl-keepalive.git"

# 2. Restart DSH
```

### Option B — Build locally

```bash
git clone https://github.com/TheColdWorld/dsh-wsl-keepalive.git
cd dsh-wsl-keepalive
pnpm install            # install build deps
pnpm build              # produce lib/index.js and lib/client.js
dsh plugin --profile web add link:$(pwd)
# restart dsh after this
```

After the restart, the **Keep-Alive** toggle appears under **Settings → General** in the WebUI.

### Uninstall

```bash
dsh plugin --profile web remove wsl-keepalive
# restart dsh
```

The config file `~/.dsh/wsl-keepalive.json` is retained; delete it manually if needed.

## 5. How It Works

- **Communication**: The plugin Host exposes two JSON endpoints `/api/wsl-keepalive/status` and `/api/wsl-keepalive/set` via `ctx.webServer.register`; the browser half calls them with `fetch`.
- **Minimal external references**: The source depends only on `react` (required at runtime by the browser half); the host services (shell/fs/webServer/slots) are accessed via local structural types in `src/types.ts` + `ctx.get()`, type-erased at build time, with zero extra runtime dependencies.
- **PID tracking**: dbus-daemon PIDs are recorded by the Host in memory after each query and live for the plugin's lifetime; the real state is re-queried after a restart.

## 6. Directory Structure

```
wsl-keepalive-static/
├── package.json            # dsh.bundle.patch + dsh.client declarations
├── tsconfig.json           # TypeScript build config
├── tsdown.config.ts        # tsdown build entry
├── cordis.patch.yml        # plugin row declaration (injected on `dsh plugin add`)
├── README.md               # this document (Chinese original)
├── README.eng.md           # this document (English translation)
├── shared/                 # common build helpers
└── src/
    ├── types.ts            # local minimal structural types (the only host interface)
    ├── index.ts            # Host plugin entry: registers /api/wsl-keepalive/* routes
    ├── service.ts          # keep-alive core: config read/write, PID tracking, status/start/stop
    ├── routes.ts           # HTTP routes (status / set)
    └── client/
        ├── index.ts        # Client module: registers the "Settings → General" toggle row
        ├── KeepAliveToggle.tsx
        ├── i18n.ts           # localization: en / zh-cn, fallback to en
        ├── keepalive.module.css
        └── css-modules.d.ts
```
