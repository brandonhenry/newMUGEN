#!/usr/bin/env python3
"""Restore Temari pixels lost when black was mistaken for transparency."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
CHARACTER = REPO / "public/characters/temari"
FRAMES_DIR = CHARACTER / "frames"
METADATA_PATH = FRAMES_DIR / "frames.json"
DEFAULT_SOURCE = Path(
    "/Users/brandonhenry/Documents/Kore/Characters/Naruto Universe/Temari/Temari.png"
)

# These are the three exact matte colors used by Temari's source sheet. Black
# is authored foreground art (outlines, hair, and the fan) and must be kept.
MATTES = {(24, 144, 0), (72, 176, 56), (0, 128, 128)}


def extract_frame(source: Image.Image, source_box: list[int]) -> Image.Image:
    frame = source.crop(tuple(int(value) for value in source_box)).convert("RGBA")
    pixels = frame.load()
    for y in range(frame.height):
        for x in range(frame.width):
            red, green, blue, alpha = pixels[x, y]
            if (red, green, blue) in MATTES:
                pixels[x, y] = (red, green, blue, 0)
            elif alpha:
                pixels[x, y] = (red, green, blue, 255)
    bounds = frame.getchannel("A").getbbox()
    return frame.crop(bounds) if bounds else Image.new("RGBA", (1, 1))


def repack(entries: list[dict]) -> None:
    images = [
        Image.open(FRAMES_DIR / f"frame-{int(entry['index']):03d}.png").convert("RGBA")
        for entry in entries
    ]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width, cell_height = max_width + 8, max_height + 8
    sheet = Image.new(
        "RGBA",
        (columns * cell_width, math.ceil(len(images) / columns) * cell_height),
    )
    for position, (entry, image) in enumerate(zip(entries, images)):
        column, row = position % columns, position // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        entry["box"] = [x, y, x + image.width, y + image.height]
        entry["width"], entry["height"], entry["row"] = image.width, image.height, row
        entry["sheetId"] = "generated"
        entry["sheetPath"] = "/characters/temari/animation-sheet.png"
    sheet.save(CHARACTER / "animation-sheet.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    metadata = json.loads(METADATA_PATH.read_text())
    entries = metadata["frames"]
    source = Image.open(args.source).convert("RGBA")
    restored_total = 0
    rebuilt: dict[int, Image.Image] = {}
    for entry in entries:
        index = int(entry["index"])
        current = Image.open(FRAMES_DIR / f"frame-{index:03d}.png").convert("RGBA")
        source_box = entry.get("sourceBox")
        repair = entry.get("sourceRepair")
        quarantined = (
            isinstance(repair, dict)
            and repair.get("type") == "quarantined-non-character-ui"
        )
        if quarantined:
            replacement = Image.new("RGBA", (1, 1))
        else:
            replacement = extract_frame(source, source_box) if source_box else current
        current_opaque = current.width * current.height - current.getchannel("A").histogram()[0]
        replacement_opaque = (
            replacement.width * replacement.height
            - replacement.getchannel("A").histogram()[0]
        )
        restored_total += max(0, replacement_opaque - current_opaque)
        rebuilt[index] = replacement

    print(f"frames={len(rebuilt)} restoredOpaquePixels={restored_total}")
    if not args.apply:
        return
    for index, replacement in rebuilt.items():
        replacement.save(FRAMES_DIR / f"frame-{index:03d}.png")
    repack(entries)
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n")
    print("rebuilt Temari frames and animation atlas with black foreground preserved")


if __name__ == "__main__":
    main()
