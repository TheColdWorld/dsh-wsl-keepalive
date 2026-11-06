# AGENTS.md

Rules for agent contributors to this repository. Applies to the whole repo.

## Project shape

- dsh-wsl-keepalive is an unofficial DSH Web plugin.
- One Cordis row mounts a Host half (src/) and a Client half (src/client/).
- The Client half registers a compact switch in sidebar.footer.action and a configuration page in plugins.row.config.
- The Host half owns multi-distro process lifecycle and Connection exact Fetch routes.

## Non-negotiables

1. Never hard-code the sidebar rail width. In particular, do not add 56px. Use the wide owner prop, width: 100%, and the sidebar CSS variables.
2. Do not register DSH shortcuts or add custom keyboard handlers. A native button/switch keeps its browser behavior; nothing else.
3. Keep keep-alive out of pgrep/pkill. Stop with a root kill that first
   re-checks the PID shape and the /proc/<pid>/cmdline keepalive marker:

       wsl -d <distro> -u root --exec sh -c '<verify marker>; kill <pid>'

   Use the target's own wslExecPath and distro. Never pass an unvalidated PID
   to kill; the Host also validates PIDs it reads from wsl.exe output.
4. Each configured distro has its own wslExecPath and user. Never collapse them into one global setting.
5. An empty distro means the distro that runs this DSH process. Detect it from WSL_DISTRO_NAME, then wsl.exe -l --running --quiet when exactly one distro is running. Never invent a “default distro” label.
6. Keep the DSH distro alive by default. When `keepDefault` is true, append it
   as an implicit target if missing; when false, do not append it, and stop a
   running implicit target on the next status pass. De-duplicate by resolved
   distro name. This switch is a bool, never an inserted target row.
7. keepalive.sh is the only external script. Read it back as raw bytes and
   compare character by character in Node (no sha256sum/cut or other extra
   tool); on mismatch force-write the canonical bytes with the shell printf
   builtin, chmod 700, log the repair through ctx.logger, and compare again
   before starting. A content mismatch must also log the tampered file's
   original text (JSON-escaped and bounded). Do not run pgrep to find it.
8. Environment detection checks the target distro's binfmt_misc first, then /run/WSL interop sockets, then a real wsl.exe probe.
9. The tooltip has no “保活的发行版：” prefix. Running: distro(pid); failure: distro(启动失败). Multiple targets are separate newline lines.
10. The switch starts/stops every target. A partial failure must not prevent the other targets from running; show the failed target in the tooltip.
11. Do not add .github/ or .editorconfig. This repository deliberately has neither.
12. Do not run git add/commit/tag/push or publish to npm/GitHub without an explicit request.

## Tooltip contract

- Only enabled/partial/error states enable the tooltip.
- One line per target.
- Running line: distro(pid), or (pid) when the distro name is unknown.
- Failed line: distro(启动失败) in Chinese, distro(start failed) in English.
- No prefix and no “default distro”.

## Process lifecycle

- WSL kills background processes when the launching wsl.exe exits.
- The Host therefore keeps one foreground wsl.exe child per target.
- keepalive.sh is a POSIX loop; it writes its own PID and removes it on exit.
- Stop uses the root kill command, then waits, then falls back to -KILL, then cleans the PID file.
- disposeAll() kills the in-distro keep-alive PID (marker-verified root
  SIGKILL) and then every Host-held child when the plugin unloads.

## Build and validation

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm pack

Run tests with Node 22.19+ or 24+. Never test with the 3080 production instance; use an isolated DSH_HOME and port 3099.

## File map

| Path | Responsibility |
| --- | --- |
| src/index.ts | Host entry, Config schema, optional connection/settings carriers |
| src/targets.ts | Pure configured + implicit target merging |
| src/wsl.ts | execFile argument arrays, raw bytes + UTF-16LE decode, timeouts |
| src/env.ts | binfmt_misc -> socket -> probe detection, 60s cache |
| src/keepalive.ts | Host-held children, verified script, status, root kill, dispose |
| src/script.ts | Canonical keepalive.sh bytes and exact byte comparison |
| src/validate.ts | wslExecPath resolve/stat/--version validation |
| src/service.ts | Multi-target status/set orchestration |
| src/routes.ts | /api/wsl-keepalive/status, /set, /validate with body caps |
| src/client/index.ts | locale, sidebar.footer.action, plugins.row.config |
| src/client/KeepAliveSwitch.tsx | Compact switch and tooltip |
| src/client/ConfigPage.tsx | Target list editor |
| src/client/tooltip.ts | Pure tooltip line builder |
| tsdown.config.ts | Host ESM + lazy-CJS client build |
