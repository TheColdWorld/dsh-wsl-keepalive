# wsl-keepalive — WSL Keep-Alive Toggle Plugin

[中文](README.md) | [English](README.eng.md)

> [!IMPORTANT]
> **This is an unofficial third-party project.** This project is not an official DeepSeek product, and is not developed, published, endorsed, or supported by DeepSeek, nor does it represent DeepSeek's position. `DeepSeek`, `DeepSeek Harness`, `dsh` and related names, logos, and trademarks belong to their respective owners. For keep-alive issues, please submit them to this repository; do not contact DeepSeek official support.
> <br>This plugin is completely AI-generated and distributed under the MIT license.

> [!NOTE]
> **v0.2.0 official-alignment rewrite**: configuration is now the row's **Volatile Config**, persisted by the DSH settings service into the profile's `cordis.patch.yml` (no more `~/.dsh/wsl-keepalive.json`); the page moved from the **Settings → Plugins** tab to **Main page → Plugins → WSL Keep-Alive → WSL Keep-Alive component** (`plugins.row.config`); the host endpoints are now **Connection exact Fetch routes** on the authenticated `/api` bridge instead of raw `webServer` routes.

Provides a **Keep-Alive** toggle on the **Main page → Plugins → WSL Keep-Alive → WSL Keep-Alive component** page of the **DSH WebUI** to prevent WSL distros from being automatically shut down by Windows when idle.
When toggled, the DSH host starts/stops/queries the dbus-daemon via `wsl.exe` and shows the current dbus-daemon PID on that component page.

---

## 1. Features

| Capability | Description |
| --- | --- |
| Keep-Alive toggle | Flip the switch on the **Main page → Plugins → WSL Keep-Alive → WSL Keep-Alive component** page to enable/disable WSL keep-alive |
| Status / PID display | The subtitle shows `Enabled · PID <dbus-daemon>` or `Disabled` in real time, plus the distro name (e.g. `Enabled · PID 498 · Arch`) |
| Duplicate-start protection | Runs `pgrep -x dbus-daemon` before enabling; if already running, returns immediately without starting a duplicate |
| Precise stop | On disable, `kill`s only the dbus-daemon PIDs recorded in memory / detected, without indiscriminately killing all dbus-daemon processes |
| Auto-detect wsl.exe | When `wslExecPath` is empty, falls back to `/mnt/c/Windows/System32/wsl.exe` (read-only; no config file is written) |
| Command configuration | The distro/user/wsl.exe items under **Command configuration** are edited and saved through the official settings form; runtime failures (toggle/command) surface in the UI, and a save no longer reverts in place |
| Config persistence | Config is the row's Volatile Config, written into the profile's `cordis.patch.yml`; persists across restarts / sessions |
| Localized UI | The plugin card title/description come from `meta` in `locale/en.json` and `locale/zh.json`; page copy supports Chinese (`zh`) and English (`en`), defaulting/falling back to English and following DSH UI language switches in real time |

## 2. Requirements (Prerequisites)

The machine running DSH Web must satisfy:

1. **WSL Interop**: This plugin works by launching dbus-daemon through wsl.exe to prevent the distro from going idle; it needs WSL Interop so that `wsl.exe --exec` can be called from within WSL.
2. **wsl.exe accessible**: `/mnt/c/Windows/System32/wsl.exe`, or set `wsl-exec-path` to its absolute path under the Linux environment.
3. **dbus-launch**: `dbus-launch` (`/usr/bin/dbus-launch`) must be installed inside the target distro.
4. **DSH Web**: The plugin must be installed via the Web profile (see "Installation").
5. **Node.js**: Required for the build toolchain (`^22.19.0 || >=24.0.0`).

> Note: Stopping keep-alive only `kill`s the dbus-daemon PIDs recorded/detected by the plugin; it never indiscriminately terminates all dbus-daemon processes in the target.

## 3. Configuration

Configuration is the plugin row's **Volatile Config**, projected by the DSH settings service as an editable form and persisted into the profile's `cordis.patch.yml` (not a plugin-private file). Open **Main page → Plugins → WSL Keep-Alive → WSL Keep-Alive component** (the config page of the `wsl-keepalive` bundle's row with id `wsl-keepalive`).

| Field | Type | Meaning |
| --- | --- | --- |
| `wslDistName` | string | Target distro name. When **non-empty** the start command appends `-d <name>`; when **empty** the default distro is used |
| `wslUserName` | string | User that runs the keep-alive process inside the target distro. When **non-empty** the start command appends `--user <name>`; when **empty** the distro default user is used |
| `wslExecPath` | string | Absolute path to `wsl.exe` on the Linux filesystem. When **empty** it falls back to `/mnt/c/Windows/System32/wsl.exe` (read-only probe); if neither exists the plugin errors |

Saving goes through the shared DSH settings form (`ctx.configForms` → profile patch): a schema-valid save is written and takes effect **without a restart** (the service re-reads the Volatile Config on every status/toggle). Whether the distro/user/wsl.exe actually exist is validated at execution time and surfaced in the status area, instead of silently reverting the save.

> **Automatic import from the old version**: on first start, if the legacy `${DSH_HOME:-~/.dsh}/wsl-keepalive.json` exists, its non-empty fields are imported once into this row's settings document (written to the profile's `cordis.patch.yml`), and the old file is renamed to `wsl-keepalive.json.imported`. Fields already configured are not overwritten; if the write is refused, the legacy file is kept and the import is retried on the next start.

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
pnpm install .          # install build deps
pnpm build              # produce lib/index.js and lib/client.js
dsh plugin --profile web add link:$(pwd)
# restart dsh after this
```

After the restart, open **Main page → Plugins → WSL Keep-Alive → WSL Keep-Alive component** in the WebUI to see the **Keep-Alive** toggle.

### Uninstall

```bash
dsh plugin --profile web remove wsl-keepalive
# restart dsh
```

The old config file `${DSH_HOME:-~/.dsh}/wsl-keepalive.json` is retained; delete it manually if needed.

## 5. How It Works

- **Communication**: the plugin Host provides two same-origin JSON endpoints through **Connection exact Fetch routes** — `/api/wsl-keepalive/status` (GET) and `/api/wsl-keepalive/set` (POST); the browser half calls them with `fetch`. Configuration no longer uses HTTP: the DSH settings form (`ctx.configForms`) writes it into the profile's Cordis patch.
- **The `connection` carrier is optional**: `connection` is an optional capability (non-HTTP shells do not provide it). The plugin therefore does not put it in its static `inject` (that would leave the row permanently `pending`); instead `apply` acquires it with `ctx.inject(['connection'], …)` and calls `ctx.connection.fetch.register(route)` inside that child fiber's `ctx.effect`, so the routes are removed with the carrier and rebuilt if it returns. Registration sits under Connection's `/api` prefix, so it passes `ctx.connection.admit()` (Host/Origin plus browser-session auth) instead of bypassing that fence.
- **Explicit service references**: the Host half imports `Context`/`Volatile` from `@deepseek-ai/cordis`, `@deepseek-ai/schemastery` (the Config schema), `@deepseek-ai/dsh-client-connection` (`ctx.connection` + `ConnectionFetchRoute`), and `@deepseek-ai/dsh-settings` (page policy). The browser half imports `dsh-client-ui-renderer` (`ctx.slots`), `dsh-client-ui-plugin-manager` (the `plugins.row.config` slot declaration), `dsh-client-ui-settings` (`ctx.configForms`), `dsh-client-ui-primitives` (`SettingsForm`/`SettingsValueField`), `dsh-client-ui-slots` (`PropsLocale`/`LocaleNamespaceMap`), `dsh-client-locale` (`ctx.locale`), and `dsh-client-store` (`SnapshotStore`). It does **not** use `ctx.shell`/`ctx.fs`: the keep-alive commands run on the host plane through Node's own `child_process`.
- **Keep-alive state**: dbus-daemon PIDs are recorded by the Host in memory after each query and live for the plugin's lifetime; the real state is re-queried after a restart.
- **Two failure families, never conflated**:
  | Family | Trigger | What the tab shows |
  | --- | --- | --- |
  | **Endpoint unreachable** (`endpoint`) | The host serves no `/api/wsl-keepalive/*` route at all: this shell provides no HTTP carrier (Electron / worker carriers), the plugin row is inactive, or the transport failed outright. Includes the "SPA fallback answers an unknown path with `index.html` and HTTP 200" pseudo-success | Subtitle: `Unavailable: the host does not serve /api/wsl-keepalive/* (response: HTTP …)`; status row: a red "likely causes" line (no HTTP carrier / row inactive) plus a dimmed retry note and the raw endpoint detail |
  | **Host refusal** (`host`) | The request reached the host and the host refused: not a WSL environment, missing wsl.exe path, or a failed command | Subtitle: the reason localized to the DSH UI language (`Not a WSL environment (kernel: …)`, …); status row: the host's own raw detail (English text / command line / exit code) in dimmed text |
  
  To support this, `/api/wsl-keepalive/status` and `/set` now carry two extra fields — `errorCode` (a stable localization code owned by the client dictionary in `src/client/i18n.ts`) and `errorParams` (its template params). The original `error` stays as **technical detail** and is no longer the primary UI message.

## 6. Directory Structure

```
wsl-keepalive/
├── package.json            # dsh.bundle.patch + dsh.client declarations
├── tsconfig.json           # TypeScript build config
├── tsdown.config.ts        # tsdown build entry
├── cordis.patch.yml        # plugin row declaration (injected on `dsh plugin add`)
├── README.md               # this document (Chinese original)
├── README.eng.md           # this document (English translation)
├── locale/                 # localized plugin-card metadata: en.json / zh.json (meta.title / meta.description)
├── shared/                 # common build helpers (web-platform.ts / tsdown.client.ts)
└── src/
    ├── index.ts            # Host plugin entry: exports the Volatile Config schema and registers /api/wsl-keepalive/* Fetch routes via ctx.inject(['connection'])
    ├── service.ts          # keep-alive core: reads the Volatile Config, PID tracking, status/start/stop
    ├── routes.ts           # Connection exact Fetch routes (status / set)
    └── client/
        ├── index.ts        # Client module: registers the plugins.row.config page (Main page → Plugins → WSL Keep-Alive → WSL Keep-Alive component)
        ├── controller.ts   # settings form model over ctx.configForms + live status/toggle
        ├── KeepAliveConfig.tsx
        ├── host-endpoint.ts # same-origin JSON fetch + failure classification (endpoint vs host)
        ├── i18n.ts         # localization dictionaries (en / zh), registered into the DSH locale service
        ├── keepalive.module.css
        └── css-modules.d.ts
```
