# dsh-wsl-keepalive — multi-distro WSL keep-alive switch

[中文](README.md) | [English](README.eng.md)

> [!IMPORTANT]
> **Unofficial third-party project.** This project is not an official DeepSeek product, and is not developed, published, or endorsed by DeepSeek.
> DeepSeek, DeepSeek Harness, dsh, and related names belong to their respective owners.
> <br>This plugin is completely AI-generated and distributed under the MIT license.

Adds one compact switch below the balance card in the DSH Web sidebar to start or stop keep-alive processes for multiple WSL distros together.

## Features

- One switch manages multiple distros.
- Each distro can be configured with its own wsl.exe path and start user.
- Keeps the distro that runs DSH alive by default; turn it off on the configuration page to keep only explicitly added targets.
- An empty distro still means the distro that runs this DSH process.
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

  Each distro uses its own wsl.exe path; before killing, it re-checks that the
  PID is numeric and that `/proc/<pid>/cmdline` contains the keep-alive
  marker. If the check fails, no root kill is performed.
- keepalive.sh is the only external script. Before each start, Node reads it
  back as raw bytes and compares it character by character. On mismatch it
  overwrites the file with the canonical content, chmods 700, logs the repair,
  and compares again before starting; the log includes the original text of
  the tampered file (JSON-escaped and length-bounded). It does not depend on
  extra tools such as sha256sum/cut.
- Environment detection checks the target distro's binfmt_misc first, then the /run/WSL interop socket, and finally performs a real wsl.exe probe.

## Requirements

- DSH >= 0.2.2-rc.1 < 0.3.0
- Node.js ^22.19.0 or >= 24
- A WSL environment where wsl.exe can run
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

Open this plugin's configuration page under Plugins and edit the target list. Each row has:

| Field | Description |
| --- | --- |
| Distro | Leave empty to use the distro that runs this DSH process |
| User | User that runs the keep-alive process; leave empty for the distro's default user |
| wsl.exe path | Leave empty to auto-detect /mnt/c/Windows/System32/wsl.exe |

The configuration page also has a “Keep the dsh distro alive (<distro name>)” switch, on by default. When it is off and the target list is empty, the main switch starts no keep-alive process.

Before saving, the path is resolved to an absolute path, checked to exist and be executable, and `wsl.exe --version` is run once; if any step fails, the write is cancelled and the reason is shown. Saving writes the profile's cordis.patch.yml.

## Development

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm pack

Tests use an isolated DSH_HOME and port 3099, never the running 3080 instance. See AGENTS.md.

## License

MIT
