# wsl-keepalive — WSL Keep-Alive Toggle Plugin

[中文](README.md) | [English](README.eng.md)

> [!IMPORTANT]
> **This is an unofficial third-party project.** This project is not an official DeepSeek product, and is not developed, published, endorsed, or supported by DeepSeek, nor does it represent DeepSeek's position. `DeepSeek`, `DeepSeek Harness`, `dsh` and related names, logos, and trademarks belong to their respective owners. For keep-alive issues, please submit them to this repository; do not contact DeepSeek official support.
> <br>This plugin is completely AI-generated and distributed under the MIT license.

Provides a **Keep-Alive** toggle in the **DSH WebUI** settings to prevent WSL distros from being automatically shut down by Windows when idle.
When toggled, the DSH host starts/stops/queries the dbus-daemon via `wsl.exe` and shows the current dbus-daemon PID in the settings UI.

---

## 1. Features

| Capability | Description |
| --- | --- |
| Keep-Alive toggle | Adds a **Keep-Alive** row under **Settings → Plugins**; flip it to enable/disable WSL keep-alive |
| Status / PID display | The subtitle shows `Enabled · PID <dbus-daemon>` or `Disabled` in real time, plus the distro name (e.g. `Enabled · PID 498 · Arch`) |
| Duplicate-start protection | Runs `pgrep -x dbus-daemon` before enabling; if already running, returns immediately without starting a duplicate |
| Precise stop | On disable, `kill`s only the dbus-daemon PIDs recorded in memory / detected, without indiscriminately killing all dbus-daemon processes |
| Auto-detect wsl.exe | When `wsl-exec-path` is not configured, auto-detects `/mnt/c/Windows/System32/wsl.exe` and writes it to the config if present |
| Command-config validation | The distro/user/wsl.exe items under **Command configuration** carry descriptions plus runtime validation — a failed check reverts the change and shows the reason in red, a successful one persists |
| Config persistence | Config is stored at `${DSH_HOME:-~/.dsh}/wsl-keepalive.json`, persists across restarts / sessions |
| Localized UI | WebUI display text supports Chinese (`zh`) and English (`en`), defaulting/falling back to English; the dictionary is registered into the DSH locale service and follows DSH UI language switches in real time |

## 2. Requirements (Prerequisites)

The machine running DSH Web must satisfy:

1. **WSL Interop**: This plugin works by launching dbus-daemon through wsl.exe to prevent the distro from going idle; it needs WSL Interop so that `wsl.exe --exec` can be called from within WSL.
2. **wsl.exe accessible**: `/mnt/c/Windows/System32/wsl.exe`, or set `wsl-exec-path` to its absolute path under the Linux environment.
3. **dbus-launch**: `dbus-launch` (`/usr/bin/dbus-launch`) must be installed inside the target distro.
4. **DSH Web**: The plugin must be installed via the Web profile (see "Installation").
5. **Node.js**: Required for the build toolchain (`^22.19.0 || >=24.0.0`).

> Note: Stopping keep-alive only `kill`s the dbus-daemon PIDs recorded/detected by the plugin; it never indiscriminately terminates all dbus-daemon processes in the target.

## 3. Configuration `~/.dsh/wsl-keepalive.json`

Read at plugin startup; missing fields or a missing file are treated as empty values, and the file is auto-created / written when needed. The path prefers `${DSH_HOME}/wsl-keepalive.json` (falling back to `~/.dsh/wsl-keepalive.json` when `DSH_HOME` is unset), matching the previous config location.

```json
{
  "wsl-dist-name": "",
  "wsl-user-name": "",
  "wsl-exec-path": "/mnt/c/Windows/System32/wsl.exe"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `wsl-dist-name` | string | The target distro name. When **non-empty**, the start command appends `-d ${wsl-dist-name}`; when **empty**, the default distro is used. Checked at runtime — if the distro does not exist the change is reverted and an error is shown |
| `wsl-user-name` | string | The user that runs the keep-alive process inside the distro. When **non-empty**, the start command appends `--user ${wsl-user-name}`; when **empty**, the distro default user is used. Checked at runtime — if the user does not exist the change is reverted and an error is shown |
| `wsl-exec-path` | string | Absolute path to `wsl.exe` on the Linux filesystem. When **empty**, `/mnt/c/Windows/System32/wsl.exe` is auto-detected at startup and written to the config if present; if neither exists it errors and enters an error state. Checked at runtime — if the file does not exist the change is reverted and an error is shown |

On the WSL Keep-Alive tab under **Settings → Plugins**, the three command-config items each carry a description plus runtime validation: editing commits on blur/Enter, a failed check reverts that change and shows the reason in red (distro missing / user missing / wsl.exe missing), and a successful check persists to the config file above.

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

After the restart, the **Keep-Alive** toggle appears under **Settings → Plugins** in the WebUI.

### Uninstall

```bash
dsh plugin --profile web remove wsl-keepalive
# restart dsh
```

The config file `~/.dsh/wsl-keepalive.json` is retained; delete it manually if needed.

## 5. How It Works

- **Communication**: The plugin Host exposes four same-origin JSON endpoints — `/api/wsl-keepalive/status`, `/api/wsl-keepalive/set`, and `/api/wsl-keepalive/config` (GET/POST); the browser half calls them with `fetch`.
- **The `webServer` carrier is optional (DSH ≥ 0.1.5)**: since 0.1.5 the HTTP carrier is an *optional* capability — non-HTTP shells (Electron, worker carriers) load the same client stack without it. The plugin therefore does not put `webServer` in its static `inject` (that would leave the row permanently `pending` and fail the boot activation audit); instead `apply` **always** acquires the carrier with `ctx.inject(['webServer'], …)` — the same shape as DSH's own `/api` route in `dsh-client-connection`. That call creates a child fiber which runs as soon as the carrier is available (already bound or bound later) while the row itself activates unconditionally. Route registration lives inside that fiber's `ctx.effect`, so the routes are removed with the carrier and rebuilt if it returns; with no carrier the row still activates and the routes simply 404. Do not read `ctx.webServer` on the row's own context — cordis 4 throws `cannot get property "webServer" without inject` for an undeclared service property.
- **Explicit service references**: the Host half imports only the contracts it uses — `Context` from `@deepseek-ai/cordis` and `WebRoute` from `@deepseek-ai/dsh-host-webserver` (whose `declare module` augmentation makes `ctx.webServer` a typed property). The browser half imports `dsh-client-ui-renderer` (`ctx.slots`), `dsh-client-ui-settings` (the `settings.plugins.tab` slot declaration), `dsh-client-ui-slots` (`PropsLocale`/`LocaleNamespaceMap`), and `dsh-client-locale` (`ctx.locale`). It does **not** use `ctx.shell`/`ctx.fs`: the keep-alive commands run on the host plane through Node's own `child_process`/`fs`, so `dsh-shell`/`dsh-fs` are no longer dependencies (the v0.1.2-rc.1 era imported them as empty `import type {}` augmentations that were erased at build time anyway).
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
├── shared/                 # common build helpers (web-platform.ts / tsdown.client.ts)
└── src/
    ├── index.ts            # Host plugin entry: acquires the carrier via ctx.inject(['webServer']) and registers /api/wsl-keepalive/* routes
    ├── service.ts          # keep-alive core: config read/write, PID tracking, status/start/stop
    ├── routes.ts           # HTTP routes (status / set / config)
    └── client/
        ├── index.ts        # Client module: registers the plugin config tab under "Settings → Plugins"
        ├── KeepAliveConfig.tsx
        ├── host-endpoint.ts # same-origin JSON fetch + failure classification (endpoint vs host)
        ├── i18n.ts         # localization dictionaries (en / zh), registered into the DSH locale service
        ├── keepalive.module.css
        └── css-modules.d.ts
```
