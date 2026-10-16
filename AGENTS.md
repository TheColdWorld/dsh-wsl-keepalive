# AGENTS.md

Guidance for AI coding agents working in this repository. Applies to the whole repo; a deeper `AGENTS.md` in a subdirectory overrides this one for that subtree.

`wsl-keepalive` is an **unofficial third-party DeepSeek Harness (DSH) WebUI plugin**. One Cordis row ships two halves:

- **Host half** (`src/`): a host-plane service that runs `wsl.exe` and registers authenticated JSON routes.
- **Browser half** (`src/client/`): React UI registered on the Plugins page.

User-facing behavior is documented in [README.md](README.md) (Chinese) and [README.eng.md](README.eng.md) (English). This file documents the rules an agent must not break.

## Non-negotiables

1. **Host commands run on the host plane through Node's own `child_process`** (`src/service.ts`). Never route keep-alive commands through the model-facing `ctx.shell` / `ctx.fs` services — those are per-session/agent plane and sandboxed.
2. **`connection` and `settings` are optional carriers.** Never add them to the top-level `inject` array in `src/index.ts`. Acquire them with `ctx.inject(['connection'], …)` / `ctx.inject(['settings'], …)` and register inside that child fiber's `ctx.effect`. This keeps the row from ever being stuck `pending` on a non-HTTP shell.
3. **Routes go through `ctx.connection.fetch.register`** so they sit behind Connection's `/api` `admit()` fence (Host/Origin + browser-session auth). Do **not** register raw `webServer` routes.
4. **Client bundle purity.** In `src/client/`, never import a cross-plugin `@deepseek-ai/*` runtime value. The `dsh-client-bundle-purity` build gate in `shared/tsdown.client.ts` fails the build for any specifier that is not a platform module (`shared/web-platform.ts`), an inline-safe wire layer, or a generated `/remote` contribution. Type-only imports are erased and safe. Collaborate across plugins through Cordis services, not value imports.
5. **Configuration is the row's Volatile Config**, persisted by the DSH settings service into the profile's `cordis.patch.yml`. Do not add a plugin-private config file. The legacy `~/.dsh/wsl-keepalive.json` is import-only (`src/migrate.ts`).
6. **Every user-facing string is localized.** Add keys to `KeepAliveKey` in `src/client/i18n.ts` with **both** `en` and `zh` values (`en` is the fallback). A new host refusal code must be added in the same change to the producer (`src/env.ts` / `src/service.ts`) **and** the dictionary, or the client renders a bare key (see `ownsCode` in `src/client/host-endpoint.ts`).
7. **Keep `README.md` and `README.eng.md` in sync.** Any behavior/config change updates both. Do **not** reference GitHub Discussions in the README or other docs.
8. **Do not commit build artifacts or local state.** `lib/`, `node_modules/`, `.agents/`, `skills-lock.json`, and `tmp/` are ignored — leave them ignored.

## Build, test, verify

```bash
pnpm install
pnpm build        # tsc -b && tsdown -> lib/index.js + lib/client.js + lib/types/
pnpm typecheck    # tsc -b --pretty false
pnpm test         # node --test src/env.test.ts (pure classifyWslEnv decision table)
```

- `tsconfig.json` excludes `*.test.ts` / `*.spec.ts` from the build program.
- The `prepare` script runs `tsdown`, so installing the package from git builds it automatically.
- `lib/` is git-ignored; a rebuild is only needed to smoke-test, never to finish a source change.

Runtime smoke test (a real WSL host is required for the happy path; the environment check itself refuses elsewhere):

```bash
dsh plugin --profile web add link:$(pwd)
# restart dsh, then Main page -> Plugins -> WSL Keep-Alive -> WSL Keep-Alive component
```

Before handing off, run `pnpm typecheck` and `pnpm test`, and confirm the README/i18n sync rules above.

## Source map

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Host entry: `name`, empty `inject`, Volatile Config schema, `apply` wiring routes + page policy + legacy import. |
| `src/service.ts` | Keep-alive core: resolves wsl.exe, runs `pgrep`/start/stop, records dbus-daemon PIDs in memory, shapes `KeepAliveStatus`. |
| `src/env.ts` | Environment gate: gathers facts, pure `classifyWslEnv` decision table, `checkWslEnv`, functional `wsl.exe` probe with a negative-result TTL. |
| `src/env.test.ts` | Unit tests for the decision table (synthesized facts; no real system access). |
| `src/routes.ts` | Connection exact Fetch routes (`GET /api/wsl-keepalive/status`, `POST /api/wsl-keepalive/set`). |
| `src/migrate.ts` | One-time import of the pre-0.2.0 JSON config into the row's settings document. |
| `src/client/index.ts` | Client entry: `inject`, dictionary registration, `plugins.row.config` slot registration. |
| `src/client/controller.ts` | Settings-form model over `ctx.configForms` + live status/toggle state; maps host codes to localized copy. |
| `src/client/KeepAliveConfig.tsx` | The React component for the config page. |
| `src/client/host-endpoint.ts` | Same-origin JSON fetch + failure classification (`endpoint` vs `host`). |
| `src/client/i18n.ts` | `KeepAliveKey` + `en` / `zh` dictionaries. |
| `shared/tsdown.client.ts` | The only build config: node-half lib build + browser client bundle + CSS-inline + bundle purity gate. |
| `shared/web-platform.ts` | Platform (module-table) module list; mirrors the shell seed table. Do not drift it silently. |
| `cordis.patch.yml` | The bundle patch that inserts this plugin row. |

## Environment gate (src/env.ts)

The service may run only when it can **actually execute `wsl.exe`**. A `microsoft` kernel string is never sufficient (a container on a WSL2 host shares that kernel but has no interop).

Detection order:

1. Resolve the `wsl.exe` candidate — configured `wslExecPath`, else the fallback `/mnt/c/Windows/System32/wsl.exe` if it exists, else empty.
2. Gather cheap interop evidence: `WSL_INTEROP` naming a live socket, a `*_interop` socket under `/run/WSL` or `/run/wsl`, or an enabled `WSLInterop` entry in `/proc/sys/fs/binfmt_misc`.
3. Run the **authoritative** functional probe: `wsl.exe --list --quiet` (read-only, exits 0 only when the Windows binary really ran through interop). Positive results are cached for the process lifetime; negative results expire after 15 s.
4. Kernel / container markers only **explain** a refusal.

The decision table lives in the pure function `classifyWslEnv`. Keep the code set and the client dictionary in lockstep:

| Code | Emitted when |
| --- | --- |
| `ok` | Candidate exists and the probe succeeded. |
| `errWslExecMissing` | Probe returned ENOENT, or no candidate resolved (params carry the path). |
| `interopDisabled` | `/etc/wsl.conf` has `[interop] enabled=false` (wins over the container label). |
| `interopUnavailable` | Interop evidence exists but executing the candidate failed (ENOEXEC / EACCES / timeout / non-zero). |
| `containerNoInterop` | WSL-like kernel or a container marker, but no interop channel. |
| `envNotWsl` | No WSL signature and no interop marker at all. |

## Failure taxonomy

The UI never conflates the two families:

- **`endpoint`** — the browser could not reach `/api/wsl-keepalive/*`: transport rejection, 404/405, or a non-JSON body (the shipped Web composition SPA-fallbacks unknown paths to `index.html` with HTTP 200, so a missing content-type is treated like a 404). The plugin may be healthy; the wiring is missing.
- **`host`** — the request reached the host and the host refused or the command failed. Routes always answer **HTTP 200 JSON**; failures travel as `errorCode` (stable code) + `errorParams` (template params), with `error` kept as raw technical detail only. The client localizes `errorCode` and renders `error` dimmed.

Host codes include the environment codes above plus `errStartFailed` (non-zero start command) and `errCommandFailed` (spawn failure / timeout). A client that meets an unknown code falls back to the raw `error` text.

## Client bundle notes

- `tsdown.config.ts` calls `clientBundle('wsl-keepalive', ['src/index.ts'])`; the browser entry is always `src/client/index.ts` (or its tsc emit under the Client face). A per-package tsdown config replaces the root layout, so both halves are restated in the shared helper.
- The browser artifact is a CJS closure factory handed to `window.__ModuleLoader__.load({ id, factory })`; externals resolve through the injected `require` (the loader module table), not globals or an import map.
- `*.module.css` is compiled by lightningcss; importing it yields the hashed class map and auto-injects a `<style data-plugin="wsl-keepalive">` tag.
- If you need a new shared runtime module, add it to `shared/web-platform.ts` **and** the matching list in the DSH checkout; a mismatch becomes a guaranteed runtime throw.
- React imports (`react`, `react/jsx-runtime`) are platform modules — leave them external.

## Code conventions

- Every module starts with a JSDoc `@module` header explaining its role and the DSH contract it honors. Comments explain **why**, and cite the host contract when behavior is subtle.
- ESM with explicit `.ts` import extensions (`allowImportingTsExtensions`); relative imports include the extension.
- SDK types resolve from the `@deepseek-ai/*` npm packages in `devDependencies` — **never** from a DSH source checkout. Type-only context merges are imported with `import type {}`.
- Register every cleanup through `ctx.effect`; do not leak listeners, routes, or subscriptions on unload.
- Keep the peer range honest (`dsh >=0.1.5-rc.2 <0.3.0`, `node ^22.19.0 || >=24.0.0`); prefer changes that keep working across that range rather than pinning one DSH build.
- Commit messages in this repo are concise, often `feat:` / `fix:` / `port to vX`; match the existing tone.
