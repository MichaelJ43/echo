/**
 * Bump semver in package.json, package-lock.json (via npm), src-tauri/Cargo.toml, src-tauri/tauri.conf.json.
 * Usage: node scripts/bump-version.mjs patch|minor|major
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const kind = process.argv[2];
if (!["patch", "minor", "major"].includes(kind)) {
  console.error("Usage: node scripts/bump-version.mjs patch|minor|major");
  process.exit(1);
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) throw new Error(`Bad version: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bump(v, kind) {
  const { major, minor, patch } = parseSemver(v);
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const next = bump(pkg.version, kind);
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const cargoPath = join(root, "src-tauri", "Cargo.toml");
let cargo = readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = "[^"]+"/m, `version = "${next}"`);
writeFileSync(cargoPath, cargo);

const tauriPath = join(root, "src-tauri", "tauri.conf.json");
const tauri = JSON.parse(readFileSync(tauriPath, "utf8"));
tauri.version = next;
writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");

execSync("npm install --package-lock-only", { cwd: root, stdio: "inherit" });

try {
  execSync("cargo update -p echo", {
    cwd: join(root, "src-tauri"),
    stdio: "inherit",
  });
} catch {
  console.warn("cargo update -p echo skipped (cargo not installed or crate name mismatch).");
}

console.log(`Bumped to ${next}`);
