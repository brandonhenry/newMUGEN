#!/usr/bin/env python3
"""Restore Huntsclan Female black pixels hidden by the blue-matte mask."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
CHARACTER = REPO / "public/characters/huntsclan-female"
FRAMES = CHARACTER / "frames"
METADATA = FRAMES / "frames.json"
FEMALE_FRAMES = range(0, 91)


def repack(metadata: dict) -> None:
    entries = sorted(metadata["frames"], key=lambda entry: int(entry["index"]))
    images = [
        Image.open(FRAMES / f"frame-{int(entry['index']):03d}.png").convert("RGBA")
        for entry in entries
    ]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width = max_width + padding * 2
    cell_height = max_height + padding * 2
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
        entry["sheetPath"] = "/characters/huntsclan-female/animation-sheet.png"
    sheet.save(CHARACTER / "animation-sheet.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    metadata = json.loads(METADATA.read_text())
    changed: list[int] = []
    restored = 0
    candidates: dict[int, Image.Image] = {}
    for index in FEMALE_FRAMES:
        path = FRAMES / f"frame-{index:03d}.png"
        image = Image.open(path).convert("RGBA")
        pixels = image.load()
        original_alpha = image.getchannel("A")
        frame_restored = 0
        for y in range(image.height):
            for x in range(image.width):
                red, green, blue, alpha = pixels[x, y]
                opaque_neighbors = sum(
                    original_alpha.getpixel((nx, ny)) > 16
                    for ny in range(max(0, y - 1), min(image.height, y + 2))
                    for nx in range(max(0, x - 1), min(image.width, x + 2))
                    if (nx, ny) != (x, y)
                )
                if alpha <= 16 and (red, green, blue) == (0, 0, 0) and opaque_neighbors >= 5:
                    pixels[x, y] = (red, green, blue, 255)
                    frame_restored += 1
        if frame_restored:
            candidates[index] = image
            changed.append(index)
            restored += frame_restored

    print(json.dumps({"mode": "apply" if args.apply else "preview", "changedFrames": changed, "restoredPixels": restored}, indent=2))
    if not args.apply:
        return
    for index, image in candidates.items():
        image.save(FRAMES / f"frame-{index:03d}.png")
    if candidates:
        repack(metadata)
        METADATA.write_text(json.dumps(metadata, indent=2) + "\n")


if __name__ == "__main__":
    main()
