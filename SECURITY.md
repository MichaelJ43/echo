# Security

Report vulnerabilities responsibly: open a **private** security advisory on GitHub (**Security → Advisories → Report a vulnerability**) or contact the maintainers with enough detail to reproduce.

## Dependency advisories (upstream constraints)

### `glib` (Rust crate, Linux GTK stack)

GitHub Dependabot may flag [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g) (affected `glib` versions before **0.20.0**). Echo’s desktop shell uses **Tauri 2**, which currently depends on **gtk-rs 0.18** on Linux, and that release line pulls **`glib` 0.18.x**. Upgrading to a patched **`glib`** requires **Tauri / gtk-rs** to ship a dependency tree that uses **`glib` 0.20+** (see [tauri-apps/tauri](https://github.com/tauri-apps/tauri) releases and Linux backend work).

Until a fixed **Tauri** release updates that dependency tree, Echo cannot bump `glib` alone without breaking the Linux build. Re-evaluate after upgrading Tauri when releases note an updated GTK / `glib` stack.
