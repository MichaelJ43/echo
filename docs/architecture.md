# Architecture

## Stack

- **UI**: React 19 + TypeScript, Vite for bundling and dev server.
- **Shell**: Tauri 2 runs a system webview and exposes Rust commands over IPC.
- **HTTP**: `reqwest` (Tokio) in Rust for the packaged app; a browser `fetch` path exists for plain `npm run dev` without Tauri.
- **Persistence**: Workspace JSON is written to the OS app data directory via Rust (`std::fs`); browser dev mode uses `localStorage` through the same TypeScript API surface.

## Data flow

1. On startup, the UI loads `AppState` (collections, environments, active request id).
2. Edits update React state; a debounced save writes back to disk (or `localStorage`).
3. **Send** builds a `SendRequestPayload` (method, URL, headers, query, body, auth, resolved variables) and calls `send_http_request` in Rust when running under Tauri.
4. The response is shown in the lower panel; optional completion scripts run in the renderer with a small `pm` shim.

## Testing

- **Unit**: Vitest for pure helpers (`variables`, `collection`, `scriptRunner`) and Rust `#[cfg(test)]` in `http_client`.
- **Component**: Testing Library + Vitest (`App.test.tsx`) with mocked Tauri APIs.
- **E2E**: Playwright smoke test against the Vite dev server (`test/e2e`).

## Versioning and CI

- Align `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` versions for releases.
- GitHub Actions `ci.yml` runs `npm test`, `npm run build`, and `cargo test`.
- `release.yml` builds Tauri bundles on version tags (`v*`).
