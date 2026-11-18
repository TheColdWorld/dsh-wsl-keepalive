# AGENTS.md

Rules for agent contributors to this repository. Applies to the whole repo.

## Project shape

- dsh-wsl-keepalive is an unofficial DSH Web plugin for WSL and Windows hosts only.
- The bundle declares `dsh.bundle.platforms: ["wsl", "win32"]`; on plain Linux DSH must not compose either half. The Client also treats an `unsupported` Host status as absent: no sidebar switch, and the configuration page only shows the unsupported-environment notice.
- One Cordis row mounts a Host half (src/) and a Client half (src/client/).
- The Client half registers a compact switch in sidebar.footer.action and a configuration page in plugins.row.config.
- The Host half owns the host-selected keep-alive service, multi-distro process lifecycle, and Connection exact Fetch routes.
- The platform seam is `src/core/host.ts` + `src/hosts/`. Core modules never read `process.platform`; only a host implementation may.

## Non-negotiables

1. Never hard-code the sidebar rail width. In particular, do not add 56px. Use the wide owner prop, width: 100%, and the sidebar CSS variables.
2. Do not register DSH shortcuts or add custom keyboard handlers. A native button/switch keeps its browser behavior; nothing else.
3. Keep keep-alive out of pgrep/pkill. Stop with a root kill that first
   re-checks the PID shape and the /proc/<pid>/cmdline keepalive marker:

       wsl -d <distro> -u root --exec sh -c '<verify marker>; kill <pid>'

   Use the resolved `ResolvedConfig.wslExecPath` and the target distro. Never
   pass an unvalidated PID to kill; the Host also validates PIDs it reads from
   wsl.exe output.
4. `preferredWslExec` is one global setting. Resolve it once per config read to
   `ResolvedConfig.wslExecPath`; keep that concrete path in memory and never
   persist it per target. An empty preference means the host default.
5. On the WSL host, the implicit distro is `WSL_DISTRO_NAME`. When it is
   missing, the second probe is `wslpath -w /`: the UNC share name in
   `\\wsl.localhost\<name>\` or `\\wsl$\<name>\` is the current distro.
   Do not fall back to `wsl -l --running --quiet`; if both probes fail, drop
   the implicit target and show `无法识别dsh运行的发行版` under the switch.
   Never invent a "default distro" label on the WSL host. On the Windows host,
   the implicit distro is only the WSL default distro from the `*` row of
   `wsl -l -v`; label it as the default distro, never as the DSH distro.
6. Keep the implicit distro alive by default. When `keepDefault` is true, append
   it as an implicit target if missing; when false, do not append it, and stop a
   running implicit target on the next status pass. If the implicit distro is
   already an explicit target, `keepDefault` is effectively true and the switch
   is locked. De-duplicate by resolved distro name. This switch is a bool, never
   an inserted target row.
7. keepalive.sh is the only external script. Read it back as raw bytes and
   compare character by character in Node (no sha256sum/cut or other extra
   tool); on mismatch force-write the canonical bytes with the shell printf
   builtin, chmod 700, log the repair through ctx.logger, and compare again
   before starting. A content mismatch must also log the tampered file's
   original text (JSON-escaped and bounded). Do not run pgrep to find it.
8. WSL environment detection lives in `src/hosts/wsl.ts`: check the target
   distro's binfmt_misc first, then /run/WSL interop sockets, then a real
   wsl.exe probe.
9. The tooltip has no "保活的发行版：" prefix. Running: distro(pid); failure: distro(启动失败). Multiple targets are separate newline lines.
10. The switch starts/stops every target. A partial failure must not prevent the other targets from running; show the failed target in the tooltip.
11. Do not add .editorconfig. `.github/` is limited to `workflows/`
    (`publish.yml`); do not add issue/PR templates, custom actions, CODEOWNERS,
    dependabot config, or any other .github content.
12. Do not run git add/commit/tag/push or publish to npm/GitHub without an explicit request.
13. A target's distro name is required, trimmed, and unique. `user` is not part
    of the key. Reject duplicates with `不允许添加相同的发行版`; reject empty
    names with `发行版不能为空`. Never start a target whose distro name is empty
    or unresolved.
14. Before every commit, compare the pnpm version pinned in
    `.github/workflows/publish.yml` (`pnpm/action-setup` `version:`) with
    `packageManager` in `package.json`. If they differ, replace the workflow
    value with the `package.json` version; the manifest is the only source of
    truth.

## Tooltip contract

- Only enabled/partial/error states enable the tooltip.
- One line per target.
- Running line: distro(pid), or (pid) when the distro name is unknown.
- Failed line: distro(启动失败) in Chinese, distro(start failed) in English.
- No prefix and no "default distro".

## Process lifecycle

- WSL kills background processes when the launching wsl.exe exits.
- The Host therefore keeps one foreground wsl.exe child per target.
- keepalive.sh is a POSIX loop; it writes its own PID and removes it on exit.
- Stop uses the root kill command, then waits, then falls back to -KILL, then cleans the PID file.
- disposeAll() kills the in-distro keep-alive PID (marker-verified root
  SIGKILL) and then every Host-held child when the plugin unloads.
- `LiveChild` keeps the concrete `wslExecPath` used to start it; `ResolvedTarget`
  carries only `{name,user,implicit}`.

## Build and validation

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm pack

Run tests with Node 22.19+ or 24+. Never test with the 3080 production instance; use an isolated DSH_HOME and port 3099. The isolated check should mount the linked plugin, authenticate with the printed token cookie, and exercise `/api/wsl-keepalive/status`, `/set`, and `/validate`.

## File map

| Path | Responsibility |
| --- | --- |
| src/index.ts | Host entry, Config schema, legacy normalization, carriers |
| src/core/host.ts | HostService seam (resolve path, implicit distro, env check, validate) |
| src/core/types.ts | Config/runtime/status shapes |
| src/core/targets.ts | Target validation and explicit + implicit merging |
| src/core/implicit.ts | changeImplicitPlan, keep-alive map, transition rules |
| src/core/wsl.ts | execFile argument arrays, raw bytes + UTF-16LE decode, cwd options |
| src/core/keepalive.ts | Host-held children, verified script, status, root kill, dispose |
| src/core/script.ts | Canonical keepalive.sh bytes and exact byte comparison |
| src/core/validate.ts | Shared absolute path/stat/--version validation |
| src/core/migrate.ts | 0.3.0 config normalization |
| src/core/service.ts | Resolution, uniqueness, status/set orchestration |
| src/core/routes.ts | /api/wsl-keepalive/status, /set, /validate with body caps |
| src/hosts/wsl.ts | WSL host: isWsl host detector, WSL_DISTRO_NAME then wslpath UNC, binfmt -> socket -> probe, POSIX paths |
| src/hosts/windows.ts | Windows host: '*' default distro, Windows paths, SystemRoot cwd |
| src/hosts/unsupported.ts | Fail-closed placeholder for other hosts |
| src/hosts/index.ts | createHostService(platform) |
| src/client/index.ts | locale, sidebar.footer.action, plugins.row.config |
| src/client/KeepAliveSwitch.tsx | Compact switch and tooltip |
| src/client/ConfigPage.tsx | Target editor, uniqueness, global wsl.exe path |
| src/client/tooltip.ts | Pure tooltip line builder |
| tsdown.config.ts | Host ESM + lazy-CJS client build |
