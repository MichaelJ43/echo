/**
 * When GITHUB_REPOSITORY is set (e.g. owner/repo in GitHub Actions), set the updater
 * endpoint to this repo's latest.json. Safe to run before `tauri build`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const tauriPath = join(root, "src-tauri", "tauri.conf.json");

const repo = process.env.GITHUB_REPOSITORY?.trim();
if (!repo) {
  console.log(
    "inject-updater-endpoint: GITHUB_REPOSITORY unset; leaving tauri.conf.json unchanged (set for release builds)."
  );
  process.exit(0);
}

const j = JSON.parse(readFileSync(tauriPath, "utf8"));
const url = `https://github.com/${repo}/releases/latest/download/latest.json`;
if (!j.plugins) j.plugins = {};
if (!j.plugins.updater) j.plugins.updater = {};
j.plugins.updater.endpoints = [url];
writeFileSync(tauriPath, JSON.stringify(j, null, 2) + "\n");
console.log(`inject-updater-endpoint: ${url}`);
