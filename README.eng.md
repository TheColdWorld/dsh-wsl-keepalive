# dsh-wsl-keepalive — multi-distro WSL keep-alive switch

[中文](README.md) | [English](README.eng.md)

> [!IMPORTANT]
> **Unofficial third-party project.** This project is not an official DeepSeek product, and is not developed, published, or endorsed by DeepSeek.
> DeepSeek, DeepSeek Harness, dsh, and related names belong to their respective owners.
> <br>This plugin is completely AI-generated and distributed under the MIT license.

Adds one compact switch below the balance card in the DSH Web sidebar to start or stop keep-alive processes for multiple WSL distros together.

## Features

- One switch manages multiple distros.
- Each target has its own user; the wsl.exe path is one global `preferredWslExec`, auto-detected when empty.
- Keeps the implicit distro alive by default. On a WSL host the implicit distro is the one that runs DSH: read `WSL_DISTRO_NAME` first and, when it is missing, use the UNC share name of `wslpath -w /` (`\\wsl.localhost\<name>\` or `\\wsl$\<name>\`) as the second probe. On a Windows host it is the WSL default distro, read only from the `*` row of `wsl -l -v`.
- When both WSL probes fail, no implicit target is started and there is no `wsl -l --running` fallback; the page shows “Cannot identify the distro that runs dsh” and the switch is shown off. On Windows, a missing default distro shows “Cannot identify the WSL default distro”.
- Distro names are required and must be unique; duplicates show “The same distro cannot be added twice”.
- If the implicit distro is already an explicit target, the default keep-alive switch is locked on.
- While on, the tooltip shows each target:

      distro1(1234)
      distro2(5678)

  A failed start shows:

      ubuntu(start failed)

  It never says “default distro”; when the distro name is unknown, the name is omitted.
- No shortcuts and no custom keyboard bindings.
- No hard-coded collapsed-sidebar width; layout follows the sidebar's wide state and CSS variables.
- No pgrep or pkill. Stopping uses:

      wsl -d <distro> -u root --exec kill <pid>

  It uses the resolved wsl.exe path and the target distro; before killing, it
  re-checks that the PID is numeric and that `/proc/<pid>/cmdline` contains the
  keep-alive marker. If the check fails, no root kill is performed.
- keepalive.sh is the only external script. Before each start, Node reads it
  back as raw bytes and compares it character by character. On mismatch it
  overwrites the file with the canonical content, chmods 700, logs the repair,
  and compares again before starting; the log includes the original text of
  the tampered file (JSON-escaped and length-bounded). It does not depend on
  extra tools such as sha256sum/cut.
- WSL environment detection lives in `src/hosts/wsl.ts`: binfmt_misc first, then the /run/WSL interop socket, then a real wsl.exe probe.

## Requirements

- DSH >= 0.2.2-rc.1 < 0.3.0
- Node.js ^22.19.0 or >= 24
- WSL host: a WSL environment where wsl.exe can run; Windows host: DSH runs on native Node and can invoke wsl.exe
- POSIX sh, sleep, kill, cat, chmod, grep, tr inside each target

## Install

Build and link locally:

    pnpm install
    pnpm build
    dsh plugin --profile web add link:$(pwd)

Or install from GitHub:

    dsh plugin --profile web add github:TheColdWorld/dsh-wsl-keepalive

A Git install runs the prepare script to build lib/. pnpm 10+ may block it on first install; allow the package in the profile's pnpm-workspace.yaml as dsh instructs.

Remove:

    dsh plugin --profile web remove dsh-wsl-keepalive

## Configuration

Open this plugin's configuration page under Plugins and edit the target list. Each target has:

| Field | Description |
| --- | --- |
| Distro | Required, non-empty after trim, and unique |
| User | User that runs the keep-alive process; leave empty for the distro's default user |
| wsl.exe path | Global setting; empty auto-detects the host default (WSL: `/mnt/c/Windows/System32/wsl.exe`; Windows: `%SystemRoot%\System32\wsl.exe`), non-empty must resolve to an absolute executable |

The page also has a default keep-alive switch, on by default: the WSL host labels it “Keep the dsh distro alive (<distro name>)”, the Windows host labels it “Keep the default distro alive (<distro name>)”. When it is off and the target list is empty, the main switch starts no keep-alive process. When the implicit distro is already an explicit target, the switch is on and cannot be changed. When the implicit distro cannot be identified, the switch is shown off (and disabled) and the hint uses the error color.

Before saving, the path is resolved to an absolute path, checked to exist and be executable, and `wsl.exe --version` is run once; if any step fails, the write is cancelled and the reason is shown. Saving writes the profile's cordis.patch.yml.

### Migration from 0.3.0

0.3.0 stored a per-target `wslExecPath`. When reading old settings the plugin:

- maps `distro` / `userName` to `name` / `user`;
- takes the first non-empty `wslExecPath` as the global `preferredWslExec`;
- drops empty-name targets and forces `keepDefault` on;
- drops duplicate distro names and logs a warning.

## Development

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm pack

Tests use an isolated DSH_HOME and port 3099, never the running 3080 instance. See AGENTS.md.

## License

MIT
