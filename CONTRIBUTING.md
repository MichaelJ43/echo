# Contributing to Echo

Thanks for helping improve Echo.

| Resource | Purpose |
|----------|---------|
| **[docs/contributors.md](docs/contributors.md)** | Branch workflow, where code lives, tests, SemVer, local dev, Playwright |
| **[AGENTS.md](AGENTS.md)** | Stack, IPC, persistence, CI, versioning — read before larger changes |
| **[docs/usage.md](docs/usage.md)** | End-user behavior of the app |

## Before you open a PR

1. Branch from up-to-date `main` (`feat/…`, `fix/…`, `chore/…`, `docs/…`).
2. Run checks locally: `npm test`, `npm run build`, and `cargo test` in `src-tauri/` when you touch Rust (see **contributors** doc).
3. Describe **what** changed and **why** in the PR body (the PR template will prompt you).

## Security

Do **not** open public issues for undisclosed vulnerabilities. See **[SECURITY.md](SECURITY.md)** for responsible disclosure.

## Code of Conduct

This project follows the **[Code of Conduct](CODE_OF_CONDUCT.md)**. By participating, you agree to uphold it.
