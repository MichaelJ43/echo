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
| `src-tauri/src/lib.rs` | Tauri builder, plugins (`dialog`, `updater`, `process`), `invoke_handler` for load/save state, HTTP, import/export paths, **`open_external_url`**, **`list_secret_keys` / `set_secret` / `delete_secret`** (OS keychain). |
| `src/lib/updater.ts` | Desktop-only: `check` + `downloadAndInstall` + `relaunch`; scheduled on app load + hourly; **`openGitHubReleasesPage`** uses `invoke("open_external_url")` in Tauri (WebView `window.open` is unreliable). |
| `src-tauri/src/http_client.rs` | `reqwest` request execution; env substitution `{{name}}`, then `{{secret:NAME}}` from keychain at send time; masks secret values in outbound error strings. |
| `src-tauri/src/secrets.rs` | OS credential store (`keyring` crate) + `secret_index.json` (key names only, app data dir). |
| `src/lib/secretPlaceholders.ts` | Detects `{{secret:…}}` in payloads (browser path rejects; desktop resolves in Rust only). |
| `src/components/SecretsDialog.tsx` | Manage local secrets (Collections header context menu). |
| `src-tauri/src/persistence.rs` | Workspace types, `collections.json` under app data dir. |

**Dev (web only):** `npm run dev` → Vite on port **1420** (see `vite.config.ts`).

**Dev (desktop):** `npm run tauri dev` → builds/serves frontend + Tauri shell.

**Production UI:** `npm run build` → `tsc --noEmit` + Vite → `dist/`; Tauri `beforeBuildCommand` runs this before bundling.

**Desktop release binary / installers:** `npm run tauri build` or `npm run tauri:build` (injects `GITHUB_REPOSITORY` into updater endpoint when set; requires **Rust** + platform toolchain; see `README.md`). Output under `src-tauri/target/release/` and `src-tauri/target/release/bundle/`. **Signed updates** use `bundle.createUpdaterArtifacts` and `plugins.updater` in `tauri.conf.json`; signing env vars per Tauri docs (`TAURI_SIGNING_PRIVATE_KEY`).

---

## 3. High-level data flow

1. **UI state:** `AppState` (collections, environments, active request id) loaded via `load_state` / saved debounced via `save_state`.
2. **Send:** Frontend builds `SendRequestPayload` → `send_http_request` in Rust when `isTauri()`; otherwise `fetch` in `sendHttpRequestBrowser` (`src/api.ts`). **`{{secret:NAME}}`** placeholders are **not** resolved in the UI; Rust loads values from the host keychain only when building the outbound request. Plain web build errors if secrets are present.
3. **Persistence:** Rust writes JSON to the OS app data directory (`app.path().app_data_dir()` + `collections.json`). Paths surfaced in UI via `get_paths`.
4. **Import/export:** Dialog plugin + `import_workspace_file` / `export_workspace_file` (full workspace JSON).
5. **Collections tree:** Root **+ Collection** adds a top-level folder. Folder context menu: create nested folder, create request (prompts for names), export/import workspace, delete folder (confirm). Request context menu: delete (confirm). Mutations use helpers in `src/lib/collection.ts` (`addChildToFolder`, `removeNodeById`, etc.) from `App.tsx` / `components/TreeNodes.tsx`.

---

## 4. Directory map (authoritative overview)

```
src/                      # React + TS UI, Vite client
  api.ts                  # Tauri invoke + browser fallbacks
  App.tsx, App.css        # Root layout
  components/             # TreeNodes, UpdatePrompt, SecretsDialog
  lib/                    # variables, collection helpers, scriptRunner, secretPlaceholders
  types.ts
  *.test.ts(x)            # Vitest co-located tests
src-tauri/                # Rust crate + Tauri config (required layout for CLI)
  src/lib.rs, main.rs
  src/http_client.rs, persistence.rs, secrets.rs
  tauri.conf.json, Cargo.toml, capabilities/, permissions/
  icons/                  # Generated via npm run icons (see README)
  windows/                # NSIS `installerHooks` (.nsh) for the Windows `.exe` bundle
test/e2e/                 # Playwright (smoke / UI against dev server)
scripts/                  # make-icon.mjs, bump-version.mjs, inject-updater-endpoint.mjs
docs/                     # usage.md, architecture.md
.github/workflows/        # ci.yml, codeql.yml, release.yml, version-bump.yml
.github/codeql/             # codeql-config.yml (query filters for workflow-driven CodeQL)
```

**Imports:** ESM (`"type": "module"`). No `@/` path alias unless added to `tsconfig` / Vite—prefer relative imports matching existing files.

---

## 5. Configuration and environment

- **Tauri:** `src-tauri/tauri.conf.json` — app id `dev.echo.app`, window, bundle (`createUpdaterArtifacts`), `beforeDevCommand` / `frontendDist`, `plugins.updater` (pubkey + endpoints; GitHub `latest.json` URL).
- **Rust:** `src-tauri/Cargo.toml` — crate name `echo`, dependencies for `tauri`, `reqwest`, `tauri-plugin-updater`, `tauri-plugin-process`, etc.
- **Secrets:** No API keys in repo; user data lives in app data. **Release signing:** `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions only (never commit the private key file). The **public** updater key in `tauri.conf.json` is **not** a secret (embedded for signature verification). Respect `.cursorignore` for `.env*`.
- **Git and branches (required):**
  - **Default branch:** `main`. Do **not** push routine feature work directly to `main`. Use **topic branch → pull request → merge** so CI runs and changes are reviewable.
  - **Branch names:** Prefix + short slug, e.g. `feat/collection-create-delete`, `fix/dialog-windows`, `chore/deps`, `docs/agents`. Match the work (feature, fix, chore, docs).
  - **Before creating a branch:** `git fetch origin` and `git checkout main` + `git pull origin main` so the branch starts from current upstream `main`.
  - **PRs:** Open against `main`; keep commits scoped; describe behavior changes in the PR body.
  - **Never commit:** signing private keys (`src-tauri/*.key`), `.env`, or other secrets—use GitHub **Actions** secrets (e.g. `TAURI_SIGNING_PRIVATE_KEY`) only.
- **Icons:** `npm run icons` generates `logo.png` and refreshes `src-tauri/icons/` (see `scripts/make-icon.mjs`).

---

## 5b. Semantic versioning (SemVer 2.0.0)

This repo follows **[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html)**. The normative rules below match the official spec ([Summary](https://semver.org/spec/v2.0.0.html#summary) and the **Patch / Minor / Major** paragraphs under *Semantic Versioning Specification*); use them to decide **patch** vs **minor** vs **major** when shipping. Deprecation workflow is described in the [FAQ](https://semver.org/) (“How should I handle deprecating functionality?”).

### Official increment rules (spec)

Given a version **MAJOR.MINOR.PATCH** ([spec summary](https://semver.org/spec/v2.0.0.html#summary)):

| Bump | When (normative — see [SemVer 2.0.0 spec](https://semver.org/spec/v2.0.0.html) paragraphs on patch / minor / major) |
|------|------------------|
| **PATCH** | **Z** in `x.y.Z` (`x > 0`): increment only if **backward compatible bug fixes** are introduced. A **bug fix** is an internal change that fixes **incorrect** behavior. |
| **MINOR** | **Y** in `x.Y.z` (`x > 0`): increment if **new, backward compatible functionality** is introduced to the **public API**; **MUST** increment if any public API is **deprecated**; **MAY** increment for substantial new functionality in **private** code; **MAY** include patch-level changes; **patch MUST reset to 0** when minor increments. |
| **MAJOR** | **X** in `X.y.z` (`X > 0`): increment if **backward incompatible** changes are introduced to the **public API**; **MAY** include minor and patch changes; **minor and patch MUST reset to 0** when major increments. |

**Public API** (spec): software **MUST** declare a public API (code and/or documentation); it **SHOULD** be precise.

**Version 0.y.z:** initial development—anything **MAY** change; the public API **SHOULD NOT** be considered stable. The SemVer [FAQ](https://semver.org/) suggests incrementing **minor** for each subsequent **0.y.z** release in early development—**this repo’s CI** still defaults to **patch** on merge to `main`; use **manual** Version bump (**minor** / **major**) when the change set matches those segments (see **Version bump** below).

### Echo “public API” (for semver judgment)

Use this to classify changes in **this** app:

- **Tauri IPC:** `#[tauri::command]` names, payload shapes, and behavior of `invoke` from `src/api.ts` ↔ Rust.
- **Workspace / persistence:** JSON shape written for collections/environments (`persistence.rs` / `types.ts`) and import/export compatibility.
- **Observable behavior:** HTTP client semantics from the UI (methods, auth, variables, scripts) where users rely on stable behavior.
- **Release / updater:** `tauri.conf.json` updater URL and signing expectations for installed apps.

**Docs-only** or **internal refactors** with no user-visible behavior change: usually **patch** (or **minor** only if the spec’s “substantial private code” clause applies—use judgment).

### Ship it + CI

- **`ship it` (Cursor rule):** classify the change as **patch**, **minor**, or **major** using the table above; put **Recommended semver bump** and a short rationale in the **PR body** (see `.cursor/rules/ship-it.mdc`). For **minor** or **major**, add **`+(semver:minor)`** or **`+(semver:major)`** to the **PR title** so merge bumps the right segment (optional **`+(semver:patch)`** to be explicit).
- **Automation:** `.github/workflows/version-bump.yml` reads the merged **PR title** for `+(semver:patch|minor|major)`; if absent, it bumps **patch**. **workflow_dispatch** still bumps **patch**, **minor**, or **major** by choice.

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

**Code scanning (GitHub CodeQL):** `.github/workflows/codeql.yml` runs advanced CodeQL with `config-file` → `.github/codeql/codeql-config.yml` (excludes `rust/cleartext-transmission` for this HTTP client). **You cannot use that workflow and GitHub’s default CodeQL setup at the same time** — SARIF upload fails with *“advanced configurations cannot be processed when the default setup is enabled.”* **Disable default CodeQL** for this repo: **Settings → Code security → Code scanning** → **CodeQL analysis** → turn off **default setup** (keep only the workflow). [Editing default setup](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/editing-your-configuration-of-default-setup).

**Version bump:** `.github/workflows/version-bump.yml` — on merged PR to `main`, chooses **patch** / **minor** / **major** from **PR title** tokens **`+(semver:patch)`**, **`+(semver:minor)`**, **`+(semver:major)`** (case-insensitive; default **patch** if none); pushes to `main`, pushes `v*` tag, then **`gh workflow run`** with **`GH_TOKEN` = PAT** (`unset GITHUB_TOKEN` for that invocation) so **Release** dispatches; **`GITHUB_TOKEN` alone often 401s** `workflow_dispatch`. **Fine-grained PAT** needs **Actions: Read and write** for dispatch, not only **Contents**. **workflow_dispatch** bumps **patch**, **minor**, or **major** by input. **Requires** **`RELEASE_PUSH_TOKEN`** or **`GH_PAT`** for git push and dispatch.

**Release:** `.github/workflows/release.yml` — **`workflow_dispatch` only** (invoked by Version bump or manually). Matrix-build with `tauri-apps/tauri-action` (installers + `latest.json`). **Concurrency** is set on the **workflow** (not each matrix job) so all three OS jobs run in parallel; job-level `concurrency` with a tag-only group cancels the third matrix leg. Requires `TAURI_SIGNING_PRIVATE_KEY`. **Manual:** Actions → Release → **Run workflow** → tag (e.g. `v0.1.4`). **Do not** put `[skip ci]` on the release bump commit — it can skip workflows tied to that commit message.

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

1. **Branch** from `main` with a clear prefix (`feat/`, `fix/`, `chore/`, `docs/`) and open a **pull request** for merges that should go through review and CI. When using **ship it**, classify **patch / minor / major** per **§5b** and put **Recommended bump** + rationale in the PR body.
2. **Locate** the right layer: UI (`src/`), HTTP/persistence (`src-tauri/src/`), config (`tauri.conf.json`, `Cargo.toml`).
3. **Implement** with minimal scope; keep browser + Tauri paths in `api.ts` coherent when touching requests or storage.
4. **Run** `npm test` and `npm run build`; for native changes, `cargo test` / `npm run tauri build` locally when possible.
5. **Update** `AGENTS.md` if you changed architecture, scripts, CI, or structural rules.
6. **Do not** commit secrets, `src-tauri/*.key` private keys, or stray `.env` files ignored by git.

---

## 9. Meta

- **Single onboarding file:** New agents should read **this file first**, then `README.md` / `docs/usage.md`, then targeted source files.
- **Cursor:** `.cursor/rules/agents-md-first.mdc` (`alwaysApply: true`) instructs reading this file before substantive work and commands. `.cursor/rules/ship-it.mdc` defines the **ship it** flow: **SemVer classification** (§5b), branch from `main`, push, `gh pr create` (body includes recommended bump), watch checks, fix failures.
- **Stale content:** If this file drifts from the repo, update it—stale `AGENTS.md` is a bug.
