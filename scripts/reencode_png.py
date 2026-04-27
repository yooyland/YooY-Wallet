import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python scripts/reencode_png.py <png-path>")
        return 2
    p = Path(sys.argv[1]).resolve()
    if not p.exists():
        print("File not found:", str(p))
        return 2

    try:
        from PIL import Image  # type: ignore
    except Exception as e:
        print("Pillow not available:", e)
        return 3

    bak = p.with_suffix(p.suffix + ".bak")
    try:
        bak.write_bytes(p.read_bytes())
    except Exception:
        pass

    try:
        # Pillow can read many "almost valid" PNGs and re-save cleanly.
        with Image.open(p) as im:
            im.load()
            rgba = im.convert("RGBA")
            rgba.save(p, format="PNG", optimize=False)
        print("[reencode_png] wrote", str(p), "backup:", str(bak))
        return 0
    except Exception as e:
        print("Failed to re-encode:", e)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

