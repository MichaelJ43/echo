#!/usr/bin/env python3
"""
Center-crop docs/logo-source.png to a square, then write:
  - logo.png              — 1024×1024 (Tauri `tauri icon`)
  - public/logo.png       — 256×256 (Vite favicon + in-app)

Requires: pip install -r scripts/requirements-images.txt (Pillow).
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print(
        "crop-logo-to-square: install Pillow: pip install -r scripts/requirements-images.txt",
        file=sys.stderr,
    )
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent
INPUT = REPO_ROOT / "docs" / "logo-source.png"
OUT_ROOT = REPO_ROOT / "logo.png"
OUT_PUBLIC = REPO_ROOT / "public" / "logo.png"
TAURI_SIZE = 1024
WEB_SIZE = 256


def main() -> None:
    if not INPUT.is_file():
        print(f"crop-logo-to-square: missing {INPUT}", file=sys.stderr)
        sys.exit(1)

    im = Image.open(INPUT).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    x = (w - side) // 2
    y = (h - side) // 2
    cropped = im.crop((x, y, x + side, y + side))

    tauri = cropped.resize((TAURI_SIZE, TAURI_SIZE), Image.Resampling.LANCZOS)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    tauri.save(OUT_ROOT, "PNG", optimize=True)
    print(f"Wrote {OUT_ROOT} ({TAURI_SIZE}x{TAURI_SIZE})")

    web = tauri.resize((WEB_SIZE, WEB_SIZE), Image.Resampling.LANCZOS)
    web.save(OUT_PUBLIC, "PNG", optimize=True)
    print(f"Wrote {OUT_PUBLIC} ({WEB_SIZE}x{WEB_SIZE} for web UI + favicon)")


if __name__ == "__main__":
    main()
