"""
Build a clean 1280×640 GitHub social preview (no rulers/dimension overlays) and
composite docs/logo-source.png into the left third.

Requires: pip install -r scripts/requirements-images.txt

Layout is defined entirely in build_template() so the icon slot matches paste math.
Optional: commit docs/github-social-preview-template.png as a PNG export of the
same layout for reference only — it is not loaded for composition (avoids stale
or annotated artwork).
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print(
        "compose-social-preview: skip (install Pillow: pip install -r scripts/requirements-images.txt)"
    )
    sys.exit(0)

# GitHub social preview
OUT_W, OUT_H = 1280, 640
LEFT_W = OUT_W // 3
ICON_PADDING = 48

REPO_ROOT = Path(__file__).resolve().parent.parent
LOGO_PATH = REPO_ROOT / "docs" / "logo-source.png"
OUT_PATH = REPO_ROOT / "docs" / "github-social-preview.png"
# Reference export only (optional); never read for composition
TEMPLATE_REF_PATH = REPO_ROOT / "docs" / "github-social-preview-template.png"


def crop_square(im: Image.Image) -> Image.Image:
    w, h = im.size
    side = min(w, h)
    x = (w - side) // 2
    y = (h - side) // 2
    return im.crop((x, y, x + side, y + side))


def _try_font(size: int):
    import os

    candidates = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def build_template() -> Image.Image:
    """
    Single flat background — no borders, rulers, or dimension text.
    Branding only in the right two thirds. Icon is pasted later into [0, LEFT_W).
    """
    bg = "#1a1d23"
    text_primary = "#e6edf3"
    text_muted = "#8b949e"
    img = Image.new("RGBA", (OUT_W, OUT_H), bg)
    draw = ImageDraw.Draw(img)

    title_font = _try_font(76)
    sub_font = _try_font(26)
    x0 = LEFT_W + 64
    mid = OUT_H // 2
    draw.text((x0, mid - 58), "Echo", fill=text_primary, font=title_font)
    draw.text((x0, mid + 28), "Desktop API client", fill=text_muted, font=sub_font)
    return img


def main() -> None:
    if not LOGO_PATH.is_file():
        print(f"compose-social-preview: missing {LOGO_PATH}", file=sys.stderr)
        sys.exit(1)

    tpl = build_template()
    logo = crop_square(Image.open(LOGO_PATH).convert("RGBA"))
    icon_max = min(LEFT_W - ICON_PADDING * 2, OUT_H - ICON_PADDING * 2)
    icon_size = max(64, icon_max)
    logo = logo.resize((icon_size, icon_size), Image.Resampling.LANCZOS)

    # Center the icon in the left third only (matches empty left panel above)
    x = (LEFT_W - icon_size) // 2
    y = (OUT_H - icon_size) // 2

    out = tpl.copy()
    out.paste(logo, (x, y), logo)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT_PATH, "PNG", optimize=True)
    print(f"compose-social-preview: wrote {OUT_PATH} ({OUT_W}x{OUT_H})")

    # Keep optional reference PNG in sync for designers (same pixels, no logo)
    try:
        tpl.save(TEMPLATE_REF_PATH, "PNG", optimize=True)
    except OSError as e:
        print(f"compose-social-preview: could not write template ref: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
