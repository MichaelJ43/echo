# Echo

Echo is a fast, cross-platform desktop API client (a Postman-style alternative) built with **Rust** (HTTP and persistence) and **Tauri 2** (native shell). The UI is **React** and **TypeScript**.

## Features

- HTTP methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- URL, query parameters, headers, and body (JSON, raw, or form)
- Environments with `{{variable}}` substitution
- Authentication: none, Bearer, Basic, and API key (header or query)
- Post-response scripts using `pm.response` and `pm.console.log`
- Collections shown as a folder tree; active request highlighted
- Response panel: status, timing, body
- Workspace persisted under the OS app data directory (see [docs/usage.md](docs/usage.md))
- Right-click a folder in the tree: **Export workspace** or **Import workspace** (JSON)

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Platform dependencies for Tauri: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Development

```bash
npm install
npm run tauri dev
```

Plain Vite (no native shell; workspace uses `localStorage`, HTTP uses `fetch`):

```bash
npm run dev
```

## Git workflow (branches and pull requests)

Use **topic branches** and open **pull requests** into `main` instead of pushing straight to `main` when you want review and CI. Suggested prefixes:

- `feat/` — new feature
- `fix/` — bugfix
- `chore/` — tooling, config, or dependencies
- `docs/` — documentation only

Merge when CI is green. The version-bump and release workflows still assume **`main`** as the default branch.

## Build

Generate icon assets once (creates `logo.png` and `src-tauri/icons/*`):

```bash
npm run icons
```

Then build the desktop app (requires [Rust](https://www.rust-lang.org/tools/install) on your PATH):

```bash
npm run tauri build
```

Installers and bundles are emitted under `src-tauri/target/release/bundle/` (paths differ by OS). On **Windows** you typically get an **NSIS** `.exe` installer (and/or WiX `.msi` depending on tooling); on **macOS** a `.dmg` or `.app`; on **Linux** `.deb` / AppImage. It is **not** a single universal installer—Tauri produces **one installer format per platform** you build on.

## Tests

```bash
npm test
```

End-to-end (Chromium; start the dev server separately or set `PW_BASE_URL`):

```bash
npm run dev
# other terminal:
PW_BASE_URL=http://127.0.0.1:1420 npm run test:e2e
```

## Versioning

The app version is defined in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. **CI keeps them aligned** when you use the workflows below.

### GitHub Actions: semver and releases

- **Patch bump on merge:** When a PR is merged into `main`, [`.github/workflows/version-bump.yml`](.github/workflows/version-bump.yml) bumps the **patch** version, commits, pushes to `main`, pushes a `v*` tag, then **starts the Release workflow** via the API (`workflow_dispatch`). **Required:** repository secret **`RELEASE_PUSH_TOKEN`** — a [PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) used for `git push` only (the default Actions token cannot push to `main` in this flow). **Tag push alone does not reliably start other workflows** from automation; the bump job explicitly dispatches Release.
- **Manual minor or major:** In GitHub → **Actions** → **Version bump** → **Run workflow**, choose **minor** or **major**. The same bump → commit → tag flow runs with your selected segment.
- **Local bump (any segment):** `npm run version:bump -- patch` (or `minor` / `major`).

Default branch is assumed to be **`main`**. If you use another name, update `version-bump.yml`.

### Auto-updates (Tauri updater)

The app checks for updates **on launch** and **every hour** while running (desktop build only). Updates are delivered from **GitHub Releases** via [`latest.json`](https://v2.tauri.app/plugin/updater/) (uploaded by `tauri-apps/tauri-action`).

**One-time setup (or key rotation)**

1. **Signing keys** — The **public** key in `plugins.updater.pubkey` in `tauri.conf.json` is **supposed to be** in the repo: clients use it to verify update signatures. It is **not** a secret. The **private** key must **never** be committed.
   ```bash
   npm run tauri -- signer generate --ci -w src-tauri/echo.key -f
   ```
   - Put the **public** key string (same as `echo.key.pub` on one line) into `plugins.updater.pubkey` in `tauri.conf.json` if you rotate keys.
   - Add repository secret **`TAURI_SIGNING_PRIVATE_KEY`** with the **full contents** of `src-tauri/echo.key` (GitHub Actions release signing). For local release-style builds you can use `TAURI_SIGNING_PRIVATE_KEY_PATH` instead.
   - `src-tauri/*.key` and `src-tauri/*.key.pub` are **gitignored** so the generated files are not committed; the tracked copy of the public key is **`tauri.conf.json` only**.
2. **Updater URL:** The default endpoint uses this repository. For forks, change the GitHub URL in `tauri.conf.json`, **or** rely on CI: `scripts/inject-updater-endpoint.mjs` runs before release builds when `GITHUB_REPOSITORY` is set.

**Release workflow** (`.github/workflows/release.yml`) is **workflow_dispatch** only: it runs when **Version bump** dispatches it after a successful bump, or when you **Run workflow** manually and enter a tag (e.g. `v0.1.4`). It builds on Windows / macOS / Linux, signs bundles, and publishes assets + updater metadata. Requires **`TAURI_SIGNING_PRIVATE_KEY`**. **`RELEASE_PUSH_TOKEN`** is for **Version bump** pushes, not for Release itself.

**Secrets checklist:** `TAURI_SIGNING_PRIVATE_KEY` (signing) · `RELEASE_PUSH_TOKEN` (PAT for Version bump git push; optional alias **`GH_PAT`**).

**Tag exists but no GitHub Release / no installers:** open **Actions** → **Release** → **Run workflow** → type the tag (e.g. `v0.1.4`) → Run. That builds and attaches assets to a Release for that tag.

### Troubleshooting: Version bump failed on “Use PAT for git push”

That means **no PAT was found**. Add a **repository** secret (Settings → Secrets and variables → **Actions** → **New repository secret**):

1. Name: **`RELEASE_PUSH_TOKEN`** (exact), or **`GH_PAT`** as a fallback name.
2. Value: a [fine-grained PAT](https://github.com/settings/tokens?type=beta) with access to **this repo** and **Contents: Read and write** (or a classic PAT with **`repo`** scope).
3. Save, then **re-run** the failed workflow (**Re-run all jobs**) or **Actions** → **Version bump** → **Run workflow**.

Secrets added under **Environments** only apply if the workflow declares that `environment`; this repo uses **repository** secrets.

### Troubleshooting: Version bump fails when starting Release (HTTP 401 / dispatch error)

The job uses **`gh workflow run`** with **`GITHUB_TOKEN`**. If you see **401** or dispatch failures, open **Settings → Actions → General → Workflow permissions** and set **Workflow permissions** to **Read and write** (not *Read repository contents and packages permissions* only). The workflow requests `permissions: actions: write`; an **organization policy** can still block—check with an org admin.

**Recovery:** If the version commit and tag already landed on `main`, run **Actions → Release → Run workflow** and enter that tag (e.g. `v0.1.7`).

## License

MIT (add your preferred license).
