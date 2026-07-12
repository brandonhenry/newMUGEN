#!/usr/bin/env python3
"""Build KORE's browser font from the FontEngine SFIII 3rd Strike sheet."""

from pathlib import Path
import sys

from PIL import Image
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen


SOURCE = Path(
    "/Users/brandonhenry/Downloads/fontengine-complete/fonts/"
    "sf33-Street Fighter III 3rd Strike (Capcom).png"
)
OUTPUT = Path(__file__).resolve().parents[1] / "public/fonts/kore-arcade.woff2"
FIRST_CODEPOINT = 32
GLYPH_WIDTH = 8
GLYPH_HEIGHT = 8
UNITS_PER_PIXEL = 128


def build_glyph(pixels, x_offset: int):
    pen = TTGlyphPen(None)
    for y in range(GLYPH_HEIGHT):
        for x in range(GLYPH_WIDTH):
            red, green, blue, alpha = pixels[x_offset + x, y]
            # Keep the face and highlight while dropping the sheet's dark shadow.
            if alpha == 0 or max(red, green, blue) < 128:
                continue
            left = x * UNITS_PER_PIXEL
            right = left + UNITS_PER_PIXEL
            bottom = (GLYPH_HEIGHT - y - 1) * UNITS_PER_PIXEL
            top = bottom + UNITS_PER_PIXEL
            pen.moveTo((left, bottom))
            pen.lineTo((right, bottom))
            pen.lineTo((right, top))
            pen.lineTo((left, top))
            pen.closePath()
    return pen.glyph()


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"FontEngine sheet not found: {SOURCE}")

    image = Image.open(SOURCE).convert("RGBA")
    expected_width = 95 * GLYPH_WIDTH
    if image.size != (expected_width, GLYPH_HEIGHT):
        sys.exit(f"Unexpected font sheet size {image.size}; expected {(expected_width, GLYPH_HEIGHT)}")

    glyph_order = [".notdef"] + [f"uni{codepoint:04X}" for codepoint in range(32, 127)]
    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    metrics = {".notdef": (GLYPH_WIDTH * UNITS_PER_PIXEL, 0)}
    cmap = {}
    pixels = image.load()

    for index, codepoint in enumerate(range(32, 127)):
        name = f"uni{codepoint:04X}"
        glyphs[name] = build_glyph(pixels, index * GLYPH_WIDTH)
        metrics[name] = (GLYPH_WIDTH * UNITS_PER_PIXEL, 0)
        cmap[codepoint] = name

    builder = FontBuilder(UNITS_PER_PIXEL * 8, isTTF=True)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap(cmap)
    builder.setupGlyf(glyphs)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=UNITS_PER_PIXEL * 8, descent=0, lineGap=UNITS_PER_PIXEL)
    builder.setupOS2(
        sTypoAscender=UNITS_PER_PIXEL * 8,
        sTypoDescender=0,
        sTypoLineGap=UNITS_PER_PIXEL,
        usWinAscent=UNITS_PER_PIXEL * 8,
        usWinDescent=0,
        sxHeight=UNITS_PER_PIXEL * 5,
        sCapHeight=UNITS_PER_PIXEL * 7,
    )
    builder.setupNameTable(
        {
            "familyName": "KORE Arcade",
            "styleName": "Regular",
            "uniqueFontIdentifier": "KORE Arcade Regular 1.0",
            "fullName": "KORE Arcade Regular",
            "psName": "KOREArcade-Regular",
            "version": "Version 1.0",
        }
    )
    builder.setupPost(isFixedPitch=1)
    builder.setupMaxp()

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    builder.font.flavor = "woff2"
    builder.save(OUTPUT)
    print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
