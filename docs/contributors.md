# Contributing to Echo

Thanks for helping improve Echo. This doc is for **developers** who want to add features, fix bugs, or change the app’s behavior.

## What to read first

- **[AGENTS.md](../AGENTS.md)** — canonical overview: stack, entrypoints, IPC, persistence, semver, CI, and repo conventions. **Read it before larger changes** so your work matches how the project is structured.
- **[docs/architecture.md](architecture.md)** — higher-level module and data-flow notes (if present).

## Workflow

1. **Branch from up-to-date `main`:** `git fetch origin` → `git checkout main` → `git pull origin main` → `git checkout -b feat/short-description` (or `fix/…`, `docs/…`).
2. **Open a PR into `main`.** CI runs tests and builds; keep commits scoped to one theme when possible.
3. **Describe behavior changes** in the PR body so reviewers and users know what changed.

Prefixes that match the work: `feat/`, `fix/`, `chore/`, `docs/`.

## Where features live

| Layer | Location | Typical changes |
|-------|----------|------------------|
| UI | `src/` (React + TypeScript), `App.tsx`, `components/` | Screens, forms, tree, dialogs |
| Browser vs desktop API | `src/api.ts` | `invoke` when running in Tauri; fallbacks for plain `npm run dev` |
| Backend / IPC | `src-tauri/src/lib.rs`, command handlers | New `#[tauri::command]` or changed payloads |
| HTTP execution | `src-tauri/src/http_client.rs` | Headers, body, TLS, substitution, secrets |
| Persistence | `src-tauri/src/persistence.rs` | Workspace JSON shape (coordinate with `src/types.ts`) |
| Tauri permissions | `src-tauri/permissions/*.toml`, `capabilities/default.json` | **Every new command** must be allowed here |

If you add or rename a **`#[tauri::command]`**, wire it in **`invoke_handler`** in `lib.rs`, add a **permission** fragment listing `commands.allow`, reference it from **`capabilities/default.json`**, and run a build so **`src-tauri/gen/schemas/`** updates if your setup generates ACL manifests.

## Adding a feature (checklist)

1. **Types** — Extend `src/types.ts` (and Rust structs in `persistence.rs` / command payloads) if you change stored or IPC data.
2. **UI state** — Load/save through existing `load_state` / `save_state` patterns unless the feature is ephemeral.
3. **Tests** — Add or extend **Vitest** tests under `src/` (`*.test.ts` / `*.test.tsx`). For Rust, add unit tests in the relevant module or `cargo test` in `src-tauri/`.
4. **AGENTS.md** — Update in the **same PR** if you change architecture, entrypoints, IPC, major directories, or agent-facing conventions.
5. **SemVer** — See **AGENTS.md §5b**. PR titles can include **`+(semver:patch)`**, **`+(semver:minor)`**, or **`+(semver:major)`** for the automated version bump on merge.

## Local development

```bash
npm install
npm run tauri dev
```

Web-only UI (no Tauri shell; limited persistence/HTTP behavior):

```bash
npm run dev
```

**Tests:**

```bash
npm test
cd src-tauri && cargo test
```

**End-to-end (Playwright, Chromium):** requires browsers once — `npx playwright install chromium`. By default `npm run test:e2e` starts `npm run dev` automatically; if you already have the dev server on the same URL, use `PLAYWRIGHT_SKIP_WEBSERVER=1 npm run test:e2e`. Override the base URL with `PW_BASE_URL` if needed.

## Icons and assets

The canonical master icon is **`docs/logo-source.png`**. Running **`npm run icons`** (with **Python** and **`pip install -r scripts/requirements-images.txt`** for Pillow) produces **`logo.png`**, **`public/logo.png`**, and **`src-tauri/icons/*`**. Non-square sources are cropped via **`scripts/crop-logo-to-square.py`**. See **`scripts/make-icon.mjs`**.

**GitHub social preview:** **`scripts/compose-social-preview.py`** draws the 1280×640 background in Pillow (flat background + text on the right — **no** dimension labels), centers a square crop of **`logo-source`** in the **left third**, and writes **`docs/github-social-preview.png`**. It also saves **`docs/github-social-preview-template.png`** as the same layout **without** the logo (reference only). Edit **`build_template()`** in that script to change colors or typography; do not rely on hand-drawn template PNGs with rulers. Install **Python** and **`pip install -r scripts/requirements-images.txt`** (Pillow), then **`npm run icons`**.

## Releases and signing

Release builds, signing, and GitHub Actions secrets are documented in **AGENTS.md** and the maintainer-facing sections of the repo history; contributors usually do not need signing keys for day-to-day PRs.

## Questions

Open an issue or discussion on GitHub if something in **AGENTS.md** or this doc is unclear—suggesting doc improvements is welcome.
