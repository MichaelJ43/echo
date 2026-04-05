/**
 * Produces square 1024×1024 `logo.png` + `public/logo.png` from `docs/logo-source.png`,
 * then run: `tauri icon logo.png` (see `npm run icons`).
 *
 * - If the source is already 1024×1024 square, it is copied.
 * - Otherwise center-crop + resize via `crop-logo-to-square.py` (Pillow; see
 *   `scripts/requirements-images.txt`).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "docs", "logo-source.png");
const cropPy = join(__dirname, "crop-logo-to-square.py");

function pngDimensions(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  const i = buf.indexOf(Buffer.from("IHDR"));
  if (i < 0) return null;
  return { w: buf.readUInt32BE(i + 4), h: buf.readUInt32BE(i + 8) };
}

function shouldTryNext(r) {
  if (r.error?.code === "ENOENT") return true;
  if (r.status === 9009) return true;
  return false;
}

/** Run crop-logo-to-square.py; same Python resolution as run-compose-social.mjs */
function runCropScript() {
  const attempts = [
    ["python", [cropPy]],
    ["python3", [cropPy]],
    ["py", ["-3", cropPy]],
  ];
  for (const [cmd, args] of attempts) {
    const r =
      platform() === "win32"
        ? spawnSync("cmd.exe", ["/c", cmd, ...args], {
            cwd: root,
            stdio: "inherit",
          })
        : spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
    if (shouldTryNext(r)) continue;
    return r.status ?? 0;
  }
  console.error(
    "crop-logo-to-square: Python not found, or Pillow missing.\n" +
      "  Install Python and run: pip install -r scripts/requirements-images.txt"
  );
  return 1;
}

if (!existsSync(src)) {
  console.error("Missing docs/logo-source.png — add the master app icon there.");
  process.exit(1);
}

const buf = readFileSync(src);
const dim = pngDimensions(buf);
if (!dim) {
  console.error("docs/logo-source.png is not a valid PNG.");
  process.exit(1);
}

const dstRoot = join(root, "logo.png");
const dstPublic = join(root, "public", "logo.png");

if (dim.w === dim.h && dim.w === 1024) {
  mkdirSync(join(root, "public"), { recursive: true });
  copyFileSync(src, dstRoot);
  copyFileSync(src, dstPublic);
  console.log("Square 1024×1024: copied docs/logo-source.png → logo.png and public/logo.png");
} else {
  const code = runCropScript();
  process.exit(code);
}
