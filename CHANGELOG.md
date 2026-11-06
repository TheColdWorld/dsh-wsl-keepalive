# Changelog

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
