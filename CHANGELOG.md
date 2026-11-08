# Changelog

## 0.3.1

- Add the Windows host implementation (`src/hosts/windows.ts`). DSH can run as
  a native Windows Node process and drive wsl.exe.
- The Windows implicit target is the WSL default distro from the `*` row of
  `wsl -l -v`; there is no WSL_DISTRO_NAME on this host.
- Windows environment checks list distros with `wsl -l -q` before probing the
  target, so a missing distro reports `errDistroMissing` instead of parsing
  localized error text.
- Windows path validation uses `path.win32`; the default wsl.exe path is
  `%SystemRoot%\System32\wsl.exe`, and wsl.exe runs with SystemRoot as cwd.
- path validation falls back to `wsl -l -q` when `--version` is unavailable on
  older inbox WSL.
- Document the Windows default-distro label and hints.
- Split the host seam (`src/core/host.ts` + `src/hosts/`) from the shared
  keep-alive core. `src/core/` no longer reads `process.platform`.
- New config shape: `keepDefault`, `targets: {name,user}[]`, and one global
  `preferredWslExec`. `wslExecPath` is resolved after reading config and kept
  in memory in `ResolvedConfig`; `ResolvedTarget` carries only identity.
- Distro names are required, trimmed, and unique. Duplicate targets are
  rejected with “不允许添加相同的发行版”; empty names with “发行版不能为空”.
- On the WSL host the implicit distro comes only from `WSL_DISTRO_NAME`.
  There is no `wsl -l --running --quiet` fallback; when it is missing the
  implicit target is dropped and the page shows “无法识别dsh运行的发行版”.
- If the implicit distro is already an explicit target, `keepDefault` is
  effectively true and the switch is locked.
- Add `core/implicit.ts` (`changeImplicitPlan(previous, current)`) and a
  distro-keyed keep-alive map; reconcile the implicit target when the switch
  or the implicit distro changes.
- Normalize 0.3.0 settings on read: rename `distro`/`userName`, take the
  first per-target path as `preferredWslExec`, drop empty/duplicate targets,
  and force `keepDefault` on when an empty legacy target is dropped.
- Add a fail-closed placeholder host for platforms other than Linux.

## 0.3.0

- Rename the package to `dsh-wsl-keepalive`; require DSH >= 0.2.2-rc.1 < 0.3.0.
- Multi-distro targets, each with its own wsl.exe path and user.
- Add a `keepDefault` switch (on by default) that keeps the DSH distro alive
  without inserting a target row. Turning it off stops a running implicit
  target on the next status pass and leaves only explicit targets.
- One sidebar switch below the balance card; the tooltip lists
  distro(pid) or distro(start failed).
- Host-held wsl.exe child per target; root kill via
  `wsl -d <distro> -u root --exec kill <pid>`.
- Verify keepalive.sh by a direct Node byte comparison before every start;
  force-write the canonical bytes on mismatch, chmod 700, log the repair
  (including the escaped, bounded original text of a tampered file), then
  compare again before start. No sha256sum/cut dependency.
- Create keepalive.sh with mode 700 when missing or not executable.
- Validate wsl.exe paths when saving: resolve to absolute, require a regular
  file, run wsl.exe --version, and cancel the write with a visible reason on
  failure.
- Re-check the PID shape and /proc cmdline marker before any root kill.
- Stop in-distro keep-alive PIDs on plugin unload before killing Host children.
- Cache environment checks for 60 seconds.
- Cap /set and /validate request bodies; set owner-only file modes on the cache
  directory, script, and PID file.
- Reject control characters and oversized target fields in the Config schema.
- Show a short localized introduction on the Plugins detail page instead of
  the complete README, selected through locale `meta.detail`.
- Give the target editor a card, a short explanation, and a clearer empty
  state; keep its actions beside the content instead of floating at the far
  right.
- binfmt_misc-first environment detection.
- No hard-coded rail width, no keyboard shortcuts, no .github or .editorconfig.
