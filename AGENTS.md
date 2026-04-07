# AGENTS.md — canonical repository context for AI coding agents

> **MAINTENANCE (mandatory):** Any change that affects **architecture**, **entrypoints**, **scripts**, **CI**, **Tauri/Rust layout**, **env contract**, **major directory layout**, or **agent-relevant conventions** MUST update this file in the **same PR/commit** as the change. Treat this document as part of the codebase, not documentation fluff.

---

## 1. Identity

- **Name:** `echo` (npm package private, version aligned with `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`).
- **License:** MIT — see **`LICENSE`** at repo root (`package.json` and `src-tauri/Cargo.toml` declare `MIT`).
- **Security:** **`SECURITY.md`** — vulnerability reporting and notes on dependency advisories constrained by upstream (e.g. Tauri’s Linux `glib` stack).
- **Purpose:** Desktop **API client** (Postman-style): HTTP requests, collections tree, environments and `{{variables}}`, auth, response panel, optional completion scripts (`pm.*` shim). **Not** a trading or market app.
- **Visual design:** Dark, compact, tool-like UI. **Canonical spec:** **`docs/design.md`**. **Implementation:** `src/App.css` (`:root` CSS variables and shared classes). Agents must **reuse existing tokens** (`--bg`, `--accent`, `--danger`, `--warning`, etc.) for new UI; extend `App.css` consistently. Update **`docs/design.md`** and this file when you add or change global design rules.
- **Stack:** **Tauri 2** native shell, **Rust** backend (`src-tauri/`) for IPC commands, persistence, and HTTP via **reqwest**; **React 19** + **TypeScript** + **Vite** frontend (`src/`). Plain `npm run dev` runs the web UI only (localStorage + `fetch` fallbacks in `src/api.ts`); **`npm run tauri dev`** is the full desktop app.

---

## 2. Entrypoints and runtime shape

| Entry | Role |
|-------|------|
| `index.html` + `src/main.tsx` | Vite SPA bootstrap; mounts `App`. |
| `src/App.tsx` | Main UI: collection tree, request editor, response, environments. |
| `src/api.ts` | Tauri `invoke` + `isTauri()`; browser fallbacks when not in the webview. |
| `src-tauri/src/main.rs` | Rust binary entry; calls `echo_lib::run()`. |
| `src-tauri/src/lib.rs` | Tauri builder, plugins (`dialog`, `updater`, `process`), `invoke_handler` for load/save state, HTTP, import/export paths, **`open_external_url`**, **`open_containing_folder`** (reveal workspace file in system file manager), **`get_request_log_entries` / `get_request_log_settings` / `set_request_log_max_entries`**, **`list_secret_keys` / `list_secret_logical_names_for_env` / `set_secret` / `delete_secret` / `delete_secrets_for_environment` / `resolve_secret_placeholder_rows`** (OS keychain). |
| `src/lib/updater.ts` | Desktop-only: `check` + `downloadAndInstall` + `relaunch`; scheduled on app load + hourly; **`openGitHubReleasesPage`** / **`openSuggestFeedbackPage`** use `invoke("open_external_url")` in Tauri (WebView `window.open` is unreliable). |
| `src-tauri/src/http_client.rs` | `reqwest` request execution (**TLS:** `rustls-tls-native-roots` so the OS trust store is used, e.g. Windows Schannel-backed roots); shared `Client` with a stable **User-Agent** (`Echo/<version>`); env substitution `{{name}}`, then `{{secret:NAME}}` resolved via **`echo_<environmentId>_<logicalName>`** keychain keys (with legacy bare-name fallback); masks secret values in outbound error strings. |
| `src-tauri/src/secrets.rs` | OS credential store (`keyring` crate with **`apple-native` / `windows-native` / `sync-secret-service`** so secrets use the real keychain/Credential Manager/Secret Service, not the crate’s in-memory mock) + `secret_index.json` (key names only, app data dir); composed keys `echo_<uuid>_<logicalName>`; **deleting an environment** removes all keys with prefix `echo_<thatUuid>_` from the store and index; **`resolve_secret_placeholder_rows`** batch-checks the same resolution as HTTP `{{secret:NAME}}` for desktop secret sync. |
| `src/lib/secretPlaceholders.ts` | Detects `{{secret:…}}` in payloads (browser path rejects; desktop resolves in Rust only). |
| `src/lib/secretStorageKey.ts` | `composeSecretStorageKey` for TS ↔ keychain (must match Rust). |
| `src/lib/secretSync.ts` | Desktop secret sync: expected composed keys vs `secret_index.json`, missing-credential detection, orphan `echo_<uuid>_…` keys. |
| `src-tauri/src/persistence.rs` | Workspace types, `collections.json` under app data dir. |
| `src-tauri/src/request_log.rs` | Desktop **request history** JSON-lines file `request_history.log` (metadata only: request id/name, time, method, status, duration, short error); `request_log_settings.json` holds max retained rows; trimming is user-configurable. |

**Dev (web only):** `npm run dev` → Vite on port **1420** (see `vite.config.ts`).

**Dev (desktop):** `npm run tauri dev` → builds/serves frontend + Tauri shell.

**Production UI:** `npm run build` → `tsc --noEmit` + Vite → `dist/`; Tauri `beforeBuildCommand` runs this before bundling.

**Desktop release binary / installers:** `npm run tauri build` or `npm run tauri:build` (injects `GITHUB_REPOSITORY` into updater endpoint when set; requires **Rust** + platform toolchain; see `README.md`). Output under `src-tauri/target/release/` and `src-tauri/target/release/bundle/`. **Signed updates** use `bundle.createUpdaterArtifacts` and `plugins.updater` in `tauri.conf.json`; signing env vars per Tauri docs (`TAURI_SIGNING_PRIVATE_KEY`).

---

## 3. High-level data flow

1. **UI state:** `AppState` (collections, environments, active request id) loaded via `load_state` / saved debounced via `save_state`.
2. **Send:** `buildExpandedSendPayload` (`src/lib/expandForSend.ts`) resolves **`{{request:folder/sub/requestName}}`** (entire cached response body) or **`{{request:folder/sub/requestName:dot.path}}`** (value from the body parsed as JSON or YAML via `js-yaml`, then dotted path) against an in-memory **last-response cache** (per request id; not persisted), then **`{{name}}`** from enabled **Variable** and **File** rows in the active environment (`File` rows substitute the path string), then builds `SendRequestPayload` (includes **`environmentId`** and **`requestLog`** metadata for desktop) → `send_http_request` (Tauri) or `sendHttpRequestBrowser` (`src/api.ts`). **Desktop** appends a JSON line to **`request_history.log`** after each send (no URL or body stored); **Menu → Request log** shows a scrollable modal; retention is capped via **`request_log_settings.json`**. **`{{secret:NAME}}`** is resolved only in Rust for the desktop app using **`echo_<environmentId>_<NAME>`** in the keychain, with **legacy** bare `NAME` keys still read as fallback; web build errors if secrets are present in outbound fields. **Secret**-typed environment **Entries** store values only in the keychain (never in workspace JSON); they do not participate in `{{name}}` substitution—use **`{{secret:NAME}}`** in URLs/headers/bodies. **Multipart** (`multipart/form-data`) and **binary** (raw bytes from one file) bodies: keys, text values, paths, and content types go through the same `{{var}}` expansion; file bytes are read in Rust from `filePath` / `binaryBody.path` on desktop, or supplied from the browser via base64 session fields (`fileDataBase64` / `browserBase64`) that **`stripEphemeralWorkspaceFields`** (`src/lib/workspacePersist.ts`) removes before save. Rust enforces a **50 MiB** cap per file read for multipart and binary bodies.
3. **Persistence:** Rust writes JSON to the OS app data directory (`app.path().app_data_dir()` + `collections.json`; **`request_history.log`** and **`request_log_settings.json`** for desktop request history). Paths surfaced in UI via `get_paths` (includes **`requestHistoryLog`**). Each environment **variable row** in JSON may include **`entryKind`** (`variable` \| `file` \| `secret`); `src-tauri/src/persistence.rs` **`KeyValue`** must round-trip it so the desktop save path does not strip kinds (headers/query rows omit `entryKind`). **Deleting an environment** (desktop) invokes **`delete_secrets_for_environment`** so composed keychain keys `echo_<environmentId>_…` are removed with the environment. **Changing an environment entry’s kind** (Variable / File / Secret) clears its workspace `value`; switching **from** Secret also removes that row’s composed (and legacy) keychain entries for the current name (desktop). **Desktop secret sync** runs after workspace load and after **Import workspace** (full replace or folder merge): batch **`resolve_secret_placeholder_rows`** checks each Secret row against the OS store (same as send-time `{{secret:NAME}}`); missing credentials get a **warning** style on the secret value control; composed keys listed in `secret_index.json` that no longer match any Secret row (`echo_<uuid>_…`) can be removed via **Unused credential entries** modal. **Last HTTP responses** (response panel), **completion script output**, **last Send error** (expand / network / script throw), and **Raw vs Pretty** for the response body are **session-only** (RAM), keyed by **request id**—switching the active request shows that request’s cached response, script log, send error, and body view mode only; nothing is written to disk for responses. Bootstrap load failures use a separate loading-screen error, not the response header.
4. **Import/export:** Dialog plugin + `import_workspace_file` / `export_workspace_file` (full workspace JSON). **Menu → Import workspace** opens a confirm modal, then replaces the entire in-memory workspace from the chosen file. **Folder context menu → Import workspace** merges the file **under that folder**: each root node of the imported JSON’s `collections` array is appended as a child of the target folder; imported environment and request ids are remapped to avoid collisions (`src/lib/importWorkspace.ts`).
5. **Collections tree:** Root **+ Folder** adds a top-level folder. Folder/request context menus (create, export, rename, delete, import). **Folder and request names cannot contain `:`** (validated on create/rename; inline hint next to the name field via `src/lib/treeNames.ts`, no modal). Create/rename uses **inline editing** in the tree (`TreeInlineNameRow`, `src/lib/treeDraft.ts`). Mutations use `src/lib/collection.ts` from `App.tsx` / `components/TreeNodes.tsx`. A **collapsed** folder that still **contains the active request** shows only the single branch to that request (chevron stays collapsed); siblings stay hidden until the folder is expanded or another request is selected.
6. **Completion scripts** (`src/lib/scriptRunner.ts`): async **`pm` API** — `pm.response.*`, `pm.console.log`, **`pm.environment.set(key, value)`** (updates variables on the request’s environment), **`await pm.sendRequest("folder/sub/request")`** (chains another request, max depth 8). Response panel: **Raw / Pretty** structured body, **Page preview** for HTML (sandboxed, non-interactive iframe).

---

## 4. Directory map (authoritative overview)

```
src/                      # React + TS UI, Vite client
  api.ts                  # Tauri invoke + browser fallbacks
  App.tsx, App.css        # Root layout
  components/             # TreeNodes, TreeInlineNameRow, UpdatePrompt, HtmlPreviewModal, ImportWorkspaceConfirmDialog, OrphanCredentialsDialog, RequestLogDialog
  lib/                    # variables, collection, requestRef, expandForSend, responseFormat, importWorkspace, workspacePersist, secretStorageKey, secretSync, treeNames, treeDraft, scriptRunner, secretPlaceholders, migrateAppState
  types.ts
  *.test.ts(x)            # Vitest co-located tests
public/                   # Static assets for Vite (e.g. logo.png for favicon + sidebar)
src-tauri/                # Rust crate + Tauri config (required layout for CLI)
  src/lib.rs, main.rs
  src/http_client.rs, persistence.rs, request_log.rs, secrets.rs
  tauri.conf.json, Cargo.toml, capabilities/, permissions/
  icons/                  # Generated via npm run icons (see README, scripts/make-icon.mjs)
  windows/                # NSIS `installerHooks` (.nsh) for the Windows `.exe` bundle
test/e2e/                 # Playwright (smoke, menus/modals, live demo workspace vs httpbin/jsonplaceholder)
scripts/                  # make-icon.mjs, crop-logo-to-square.py, compose-social-preview.py, run-compose-social.mjs, requirements-images.txt, bump-version.mjs, inject-updater-endpoint.mjs
docs/                     # design.md (visual system), usage.md, architecture.md, contributors.md, screenshot-main.png (README hero), logo-source.png, github-social-preview.png (generated), github-social-preview-template.png (optional ref export from compose script)
.github/workflows/        # ci.yml, codeql.yml, release.yml, version-bump.yml
.github/ISSUE_TEMPLATE/     # bug_report.yml, feature_request.yml, config.yml (GitHub issue forms)
.github/pull_request_template.md  # default PR body scaffold
.github/codeql/             # codeql-config.yml (query filters for workflow-driven CodeQL)
CODE_OF_CONDUCT.md          # Contributor Covenant (community standards)
CONTRIBUTING.md             # entry point → docs/contributors.md, security, CoC
```

**Imports:** ESM (`"type": "module"`). No `@/` path alias unless added to `tsconfig` / Vite—prefer relative imports matching existing files.

### 4b. Visual design system (UI)

- **Authoritative doc:** **`docs/design.md`** — theme intent, color tokens, typography, spacing, layout (sidebar width, sections), and component patterns.
- **Code:** **`src/App.css`** defines `:root` variables and most layout/component styles; new surfaces should **use those variables** rather than one-off colors.
- **Maintenance:** Changes that alter the **global palette, spacing scale, or shell layout** must update **`docs/design.md`** and **§1 (Visual design)** above in the **same PR**.
- **Environment entry placeholders** (active environment **Entries** table in `App.tsx`): key column **`name`**; Variable and Secret **value** inputs use lowercase **`value`** (including the secret “replace stored” hint); File **path** uses **`path`**. After a secret is saved (desktop), the row briefly shows **Saved** with success styling, then returns to **Stored** (see **`docs/design.md`**).

---

## 5. Configuration and environment

- **Tauri:** `src-tauri/tauri.conf.json` — app id `dev.echo.app`, window, bundle (`createUpdaterArtifacts`), `beforeDevCommand` / `frontendDist`, `plugins.updater` (pubkey + endpoints; GitHub `latest.json` URL). **Windows:** main window sets `dragDropEnabled: false` so WebView2 does not capture OS file drops; that is required for **HTML5 drag-and-drop** in the collections tree (file open/save still uses the dialog plugin).
- **Tauri ACL:** `capabilities/default.json` references `permissions/*.toml`. Every custom `#[tauri::command]` must appear in a permission’s `commands.allow` (e.g. `echo-core.toml` for workspace load/save, `get_paths`, HTTP, import/export; `secrets.toml` / `open-external-url.toml` for those commands).
- **Rust:** `src-tauri/Cargo.toml` — crate name `echo`, dependencies for `tauri`, `reqwest`, `tauri-plugin-updater`, `tauri-plugin-process`, etc.
- **Secrets:** No API keys in repo; user data lives in app data. **Release signing:** `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions only (never commit the private key file). The **public** updater key in `tauri.conf.json` is **not** a secret (embedded for signature verification). Respect `.cursorignore` for `.env*`.
- **Git and branches (required):**
  - **Default branch:** `main`. Do **not** push routine feature work directly to `main`. Use **topic branch → pull request → merge** so CI runs and changes are reviewable.
  - **Branch names:** Prefix + short slug, e.g. `feat/collection-create-delete`, `fix/dialog-windows`, `chore/deps`, `docs/agents`. Match the work (feature, fix, chore, docs).
  - **Before creating a branch:** `git fetch origin` and `git checkout main` + `git pull origin main` so the branch starts from current upstream `main`.
  - **PRs:** Open against `main`; keep commits scoped; describe behavior changes in the PR body.
  - **Never commit:** signing private keys (`src-tauri/*.key`), `.env`, or other secrets—use GitHub **Actions** secrets (e.g. `TAURI_SIGNING_PRIVATE_KEY`) only.
- **Icons:** Canonical master is **`docs/logo-source.png`**. `npm run icons` runs `scripts/make-icon.mjs` (center-crops to 1024×1024 via **`crop-logo-to-square.py`** (Pillow) when the source is not already 1024×1024 square), writes **`logo.png`** (1024×1024 for `tauri icon`) and **`public/logo.png`** (256×256 for Vite favicon + in-app image), then `tauri icon logo.png` refreshes **`src-tauri/icons/`** (taskbar, dock, installers). **`scripts/compose-social-preview.py`** (Pillow: `pip install -r scripts/requirements-images.txt`) draws the social banner in code (no overlaid PNG with rulers), pastes **`logo-source`** centered in the **left third**, writes **`docs/github-social-preview.png`**, and re-exports a clean **`docs/github-social-preview-template.png`** (layout **without** the logo) for reference; **`run-compose-social.mjs`** runs it after Tauri icons (skips with a warning if Python/Pillow is missing). Change layout in **`build_template()`** in that script, not by editing an annotated raster. Install **Python** + **`pip install -r scripts/requirements-images.txt`** for non-square masters on any OS.

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
| `npm run test:e2e` | Playwright + Chromium; starts `npm run dev` unless `PLAYWRIGHT_SKIP_WEBSERVER=1`. Includes **live HTTP** tests (`test/e2e/live-demo-workspace.spec.ts`) that seed `examples/echo-feature-demo.workspace.json` via `localStorage` and call **httpbin.org** / **jsonplaceholder.typicode.com**; JSONPlaceholder cases **skip** if `page.request` cannot reach that host (offline/firewall). |
| `npm run tauri build` | Full desktop bundle (needs `cargo` on PATH and MSVC/WebView2 prerequisites on Windows). |
| `npm run tauri:build` | `inject-updater-endpoint.mjs` (if `GITHUB_REPOSITORY` is set) + `tauri build` — use for release-style local builds. |
| `npm run version:bump -- patch` | Bumps semver in `package.json`, `Cargo.toml`, `tauri.conf.json`, refreshes lockfiles (`scripts/bump-version.mjs`). |

**CI:** `.github/workflows/ci.yml` — path-filtered jobs (`dorny/paths-filter@v4`): **frontend** (`npm test`, `npm run build`) and **e2e** run when TypeScript/Vite/Playwright/test/e2e/examples roots or workflow files change; **rust** (`cargo test` in `src-tauri/`) runs when `src-tauri/**` or workflow files change. GitHub Actions npm jobs (**frontend**, **e2e**, **version bump**, **release**) use **Node.js 24** with current `actions/checkout`, `actions/setup-node`, and `dorny/paths-filter` majors (see workflow files). Docs-only / markdown-only commits skip build jobs; the **CI success** job still completes so branch protection can require a single check.

**Code scanning (GitHub CodeQL):** `.github/workflows/codeql.yml` runs advanced CodeQL with `config-file` → `.github/codeql/codeql-config.yml` (excludes `rust/cleartext-transmission` for this HTTP client and `rust/cleartext-logging` where outbound errors use `mask_for_log` and file errors avoid embedding paths). **Analyze** is skipped on push/PR when no `src-tauri/**`, `.github/workflows/**`, or `.github/codeql/**` paths change; the weekly **schedule** still runs a full Rust analysis. The **CodeQL success** job completes either way so branch protection can require one check. **You cannot use that workflow and GitHub’s default CodeQL setup at the same time** — SARIF upload fails with *“advanced configurations cannot be processed when the default setup is enabled.”* **Disable default CodeQL** for this repo: **Settings → Code security → Code scanning** → **CodeQL analysis** → turn off **default setup** (keep only the workflow). [Editing default setup](https://docs.github.com/en/code-security/code-scanning/managing-your-code-scanning-configuration/editing-your-configuration-of-default-setup).

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

- **Single onboarding file:** New agents should read **this file first**, then `README.md` / `docs/usage.md`, **`docs/design.md`** if touching UI, then targeted source files.
- **Cursor:** `.cursor/rules/agents-md-first.mdc` (`alwaysApply: true`) instructs reading this file before substantive work and commands. `.cursor/rules/token-guardrails.mdc` (`alwaysApply: true`) constrains planning, blast radius, and directory-scoped context gathering. `.cursor/rules/ship-it.mdc` defines the **ship it** flow: **SemVer classification** (§5b), branch from `main`, push, `gh pr create` (body includes recommended bump), watch checks, fix failures.
- **Stale content:** If this file drifts from the repo, update it—stale `AGENTS.md` is a bug.
