/**
 * Runs scripts/compose-social-preview.py if Python + Pillow are available.
 * Does not fail `npm run icons` if Python is missing (warns only).
 *
 * On Windows, `spawnSync("python")` can hit the Store stub; use `cmd /c python …`
 * so PATH (e.g. pyenv) resolves like an interactive shell.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const script = join(__dirname, "compose-social-preview.py");

const attempts =
  platform() === "win32"
    ? [
        ["python", [script]],
        ["py", ["-3", script]],
        ["python3", [script]],
      ]
    : [
        ["python3", [script]],
        ["python", [script]],
        ["py", ["-3", script]],
      ];

function shouldTryNext(r) {
  if (r.error?.code === "ENOENT") return true;
  if (r.status === 9009) return true;
  return false;
}

function run(cmd, args) {
  if (platform() === "win32") {
    return spawnSync("cmd.exe", ["/c", cmd, ...args], {
      cwd: root,
      stdio: "inherit",
    });
  }
  return spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
}

for (const [cmd, args] of attempts) {
  const r = run(cmd, args);
  if (shouldTryNext(r)) continue;
  process.exit(r.status ?? 0);
}

console.warn(
  "[icons] Skipping GitHub social preview compose (Python not found). " +
    "Install Python and run: pip install -r scripts/requirements-images.txt"
);
process.exit(0);
