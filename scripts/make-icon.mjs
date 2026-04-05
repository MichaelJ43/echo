/**
 * Produces square 1024×1024 `logo.png` + `public/logo.png` from `docs/logo-source.png`,
 * then run: `tauri icon logo.png` (see `npm run icons`).
 *
 * - If the source is already 1024×1024 square, it is copied.
 * - On Windows, non-square sources are center-cropped via `crop-logo-to-square.ps1`.
 * - On other OSes, replace `docs/logo-source.png` with a square master or run this on Windows once.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "docs", "logo-source.png");

function pngDimensions(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  const i = buf.indexOf(Buffer.from("IHDR"));
  if (i < 0) return null;
  return { w: buf.readUInt32BE(i + 4), h: buf.readUInt32BE(i + 8) };
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
} else if (platform() === "win32") {
  const ps = join(__dirname, "crop-logo-to-square.ps1");
  const r = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps],
    { cwd: root, stdio: "inherit" }
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
} else {
  console.error(
    `docs/logo-source.png is ${dim.w}×${dim.h} (Tauri requires a square source). On Windows run: npm run icons. Or replace docs/logo-source.png with a 1024×1024 square PNG.`
  );
  process.exit(1);
}
