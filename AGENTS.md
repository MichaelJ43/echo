# AGENTS.md — canonical repository context for AI coding agents

> **MAINTENANCE (mandatory):** Any change that affects **architecture**, **entrypoints**, **scripts**, **CI**, **Tauri/Rust layout**, **env contract**, **major directory layout**, or **agent-relevant conventions** MUST update this file in the **same PR/commit** as the change. Treat this document as part of the codebase, not documentation fluff.

---

## 1. Identity

- **Name:** `echo` (npm package private, version aligned with `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`).
- **Purpose:** Desktop **API client** (Postman-style): HTTP requests, collections tree, environments and `{{variables}}`, auth, response panel, optional completion scripts (`pm.*` shim). **Not** a trading or market app.
- **Stack:** **Tauri 2** native shell, **Rust** backend (`src-tauri/`) for IPC commands, persistence, and HTTP via **reqwest**; **React 19** + **TypeScript** + **Vite** frontend (`src/`). Plain `npm run dev` runs the web UI only (localStorage + `fetch` fallbacks in `src/api.ts`); **`npm run tauri dev`** is the full desktop app.

---

## 2. Entrypoints and runtime shape

| Entry | Role |
|-------|------|
| `index.html` + `src/main.tsx` | Vite SPA bootstrap; mounts `App`. |
| `src/App.tsx` | Main UI: collection tree, request editor, response, environments. |
| `src/api.ts` | Tauri `invoke` + `isTauri()`; browser fallbacks when not in the webview. |
| `src-tauri/src/main.rs` | Rust binary entry; calls `echo_lib::run()`. |
| `src-tauri/src/lib.rs` | Tauri builder, plugins (`dialog`, `updater`, `process`), `invoke_handler` for load/save state, HTTP, import/export paths. |
| `src/lib/updater.ts` | Desktop-only: `check` + `downloadAndInstall` + `relaunch`; scheduled on app load + hourly. |
| `src-tauri/src/http_client.rs` | `reqwest` request execution; variable substitution `{{name}}`. |
| `src-tauri/src/persistence.rs` | Workspace types, `collections.json` under app data dir. |

**Dev (web only):** `npm run dev` → Vite on port **1420** (see `vite.config.ts`).

**Dev (desktop):** `npm run tauri dev` → builds/serves frontend + Tauri shell.

**Production UI:** `npm run build` → `tsc --noEmit` + Vite → `dist/`; Tauri `beforeBuildCommand` runs this before bundling.

**Desktop release binary / installers:** `npm run tauri build` or `npm run tauri:build` (injects `GITHUB_REPOSITORY` into updater endpoint when set; requires **Rust** + platform toolchain; see `README.md`). Output under `src-tauri/target/release/` and `src-tauri/target/release/bundle/`. **Signed updates** use `bundle.createUpdaterArtifacts` and `plugins.updater` in `tauri.conf.json`; signing env vars per Tauri docs (`TAURI_SIGNING_PRIVATE_KEY`).

---

## 3. High-level data flow

1. **UI state:** `AppState` (collections, environments, active request id) loaded via `load_state` / saved debounced via `save_state`.
2. **Send:** Frontend builds `SendRequestPayload` → `send_http_request` in Rust when `isTauri()`; otherwise `fetch` in `sendHttpRequestBrowser` (`src/api.ts`).
3. **Persistence:** Rust writes JSON to the OS app data directory (`app.path().app_data_dir()` + `collections.json`). Paths surfaced in UI via `get_paths`.
4. **Import/export:** Dialog plugin + `import_workspace_file` / `export_workspace_file` (full workspace JSON).

---

## 4. Directory map (authoritative overview)

```
src/                      # React + TS UI, Vite client
  api.ts                  # Tauri invoke + browser fallbacks
  App.tsx, App.css        # Root layout
  components/             # e.g. TreeNodes
  lib/                    # variables, collection helpers, scriptRunner
  types.ts
  *.test.ts(x)            # Vitest co-located tests
src-tauri/                # Rust crate + Tauri config (required layout for CLI)
  src/lib.rs, main.rs
  src/http_client.rs, persistence.rs
  tauri.conf.json, Cargo.toml, capabilities/
  icons/                  # Generated via npm run icons (see README)
test/e2e/                 # Playwright (smoke / UI against dev server)
scripts/                  # make-icon.mjs, bump-version.mjs, inject-updater-endpoint.mjs
docs/                     # usage.md, architecture.md
.github/workflows/        # ci.yml, release.yml (tauri-apps/tauri-action on v* tags), version-bump.yml
```

**Imports:** ESM (`"type": "module"`). No `@/` path alias unless added to `tsconfig` / Vite—prefer relative imports matching existing files.

---

## 5. Configuration and environment

- **Tauri:** `src-tauri/tauri.conf.json` — app id `dev.echo.app`, window, bundle (`createUpdaterArtifacts`), `beforeDevCommand` / `frontendDist`, `plugins.updater` (pubkey + endpoints; GitHub `latest.json` URL).
- **Rust:** `src-tauri/Cargo.toml` — crate name `echo`, dependencies for `tauri`, `reqwest`, `tauri-plugin-updater`, `tauri-plugin-process`, etc.
- **Secrets:** No API keys in repo; user data lives in app data. **Release signing:** `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions only (never commit the private key file). The **public** updater key in `tauri.conf.json` is **not** a secret (embedded for signature verification). Respect `.cursorignore` for `.env*`.
- **Git workflow:** Work on branches such as `feat/…`, `fix/…`, `chore/…`, `docs/…` and open PRs into `main`; avoid pushing secrets or `src-tauri/*.key`.
- **Icons:** `npm run icons` generates `logo.png` and refreshes `src-tauri/icons/` (see `scripts/make-icon.mjs`).

---

## 6. Linting, typecheck, tests, CI

| Command | What it does |
|---------|----------------|
| `npm run lint` | `tsc -b --noEmit` — TypeScript is the linter (no ESLint in this repo). |
| `npm run build` | `tsc --noEmit` + `vite build` → `dist/`. |
| `npm test` | Vitest; jsdom + Testing Library (`src/setupTests.ts`). |
| `npm run test:e2e` | Playwright; typically needs dev server (`PW_BASE_URL` or default in `test/e2e`). |
| `npm run tauri build` | Full desktop bundle (needs `cargo` on PATH and MSVC/WebView2 prerequisites on Windows). |
| `npm run tauri:build` | `inject-updater-endpoint.mjs` (if `GITHUB_REPOSITORY` is set) + `tauri build` — use for release-style local builds. |
| `npm run version:bump -- patch` | Bumps semver in `package.json`, `Cargo.toml`, `tauri.conf.json`, refreshes lockfiles (`scripts/bump-version.mjs`). |

**CI:** `.github/workflows/ci.yml` — Node install, `npm test`, `npm run build`, and `cargo test` in `src-tauri/` when Rust is available on the runner.

**Version bump:** `.github/workflows/version-bump.yml` — on merged PR to `main`, bumps **patch** and pushes a `v*` tag (`[skip ci]` on the version commit). **workflow_dispatch** bumps **patch**, **minor**, or **major** manually.

**Release:** `.github/workflows/release.yml` — on **`v*` tag** push, matrix-builds with `tauri-apps/tauri-action` (uploads installers + `latest.json` for the updater). Requires `TAURI_SIGNING_PRIVATE_KEY` secret.

**Rust tests:** `cd src-tauri && cargo test` (unit tests in `http_client.rs`, etc.).

---

## 7. Coding conventions (repository-specific)

- **Minimal diffs:** Change only what the task requires; no drive-by refactors or unrelated files.
- **Match existing style:** React hooks patterns, Rust formatting, existing naming in `src/` and `src-tauri/`.
- **No gratuitous new markdown** unless the user asks; **this file** is the exception for agent onboarding. `README.md` / `docs/` updates when behavior or developer workflow changes.
- **Tests:** Add or update Vitest tests for TS logic; Rust `#[cfg(test)]` for pure Rust; component tests in `src/*.test.tsx`.
- **IPC contracts:** `invoke` payloads must stay aligned with `#[tauri::command]` args and `serde` names (`camelCase` where used).

---

## 8. How to make changes (checklist)

1. **Branch** from `main` with a clear prefix (`feat/`, `fix/`, `chore/`, `docs/`) and open a **pull request** for merges that should go through review and CI.
2. **Locate** the right layer: UI (`src/`), HTTP/persistence (`src-tauri/src/`), config (`tauri.conf.json`, `Cargo.toml`).
3. **Implement** with minimal scope; keep browser + Tauri paths in `api.ts` coherent when touching requests or storage.
4. **Run** `npm test` and `npm run build`; for native changes, `cargo test` / `npm run tauri build` locally when possible.
5. **Update** `AGENTS.md` if you changed architecture, scripts, CI, or structural rules.
6. **Do not** commit secrets, `src-tauri/*.key` private keys, or stray `.env` files ignored by git.

---

## 9. Meta

- **Single onboarding file:** New agents should read **this file first**, then `README.md` / `docs/usage.md`, then targeted source files.
- **Cursor:** `.cursor/rules/agents-md-first.mdc` (`alwaysApply: true`) instructs reading this file before substantive work and commands.
- **Stale content:** If this file drifts from the repo, update it—stale `AGENTS.md` is a bug.
