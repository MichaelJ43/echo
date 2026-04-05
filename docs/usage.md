# Using Echo

## Overview

Echo lets you organize API requests in **collections** (folders) on the left. Selecting a request loads it in the main area. **Send** runs the request; the response appears in the panel below.

## Workspace storage

On the **desktop app** (Tauri), your workspace is saved automatically to a JSON file in the application data directory:

| OS      | Typical location |
|--------|-------------------|
| Windows | `%APPDATA%\dev.echo.app` (or the identifier set in `tauri.conf.json`) |
| macOS   | `~/Library/Application Support/dev.echo.app` |
| Linux   | `~/.local/share/dev.echo.app` (XDG) |

The status line at the bottom of the sidebar shows the resolved path to `collections.json`.

When you run the **web-only** dev server (`npm run dev` without Tauri), the workspace is stored in **browser `localStorage`** instead.

## Variables

Define variables in the **Environment** section. Use `{{variableName}}` in the URL, headers, query parameters, body, and auth fields. Disabled rows are ignored.

## Authentication

Choose **None**, **Bearer**, **Basic**, or **API key**. API keys can be sent as a header or as query parameters.

## Scripts

After a successful response, Echo runs your **Completion script** if it is non-empty. You can use:

- `pm.response.status()` — HTTP status code
- `pm.response.text()` — response body as text
- `pm.response.json()` — parse JSON (throws if invalid)
- `pm.console.log(...)` — messages appear in the script output area

## Import and export

Right-click a **folder** in the collection tree and choose:

- **Export workspace…** — save the full workspace (collections and environments) as JSON
- **Import workspace…** — replace the current workspace from a JSON file

Use exports for backup or sharing with teammates.

## Keyboard and UX

- Click a request in the tree to make it active (highlighted).
- Folder rows support a context menu (right-click) for import/export.
