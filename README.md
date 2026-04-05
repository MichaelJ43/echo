# Echo

<p align="center">
  <img src="public/logo.png" alt="Echo" width="120" height="120" />
</p>

<p align="center">
  <a href="https://github.com/MichaelJ43/echo/actions/workflows/ci.yml"><img src="https://github.com/MichaelJ43/echo/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  &nbsp;
  <a href="https://github.com/MichaelJ43/echo/actions/workflows/release.yml"><img src="https://github.com/MichaelJ43/echo/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
</p>

**Echo** is a free, cross-platform **desktop app for exploring and testing HTTP APIs**—send requests, organize them in collections, switch environments, and inspect responses. It is a lightweight alternative to tools like Postman or Insomnia, with a dark, focused UI.

## Download

Installers and auto-updates are published on **[GitHub Releases](https://github.com/MichaelJ43/echo/releases)** for **Windows**, **macOS**, and **Linux**. The desktop app checks for updates on its own; you can also open the releases page from the app when an update is available.

A **web-only** build is not distributed as a product; the full experience is the **native desktop** build (faster HTTP via Rust, workspace on disk, OS integrations).

## What you can do

- Send **GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS** with URL, query params, headers, and body (JSON, raw text, or form).
- Use **environments** and `{{variables}}` in URLs, headers, and bodies.
- Configure **authentication**: none, Bearer token, Basic, or API key (header or query).
- Organize work in a **tree of collections and requests**; export or import the whole workspace as JSON.
- Run optional **response scripts** (`pm.response`, `pm.console.log`) after each response.
- Store **local secrets** in the OS credential manager (desktop) and reference them with `{{secret:NAME}}` in requests—values never live in your exported workspace file.

More detail: **[docs/usage.md](docs/usage.md)**.

## Contributing

If you want to **build features or fix bugs**, see **[docs/contributors.md](docs/contributors.md)**.

## License

MIT (add your preferred license).
