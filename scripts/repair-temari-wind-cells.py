#!/usr/bin/env python3
"""Rebuild Temari's split Wind Scythe frames from complete source cells."""

from __future__ import annotations

import argparse
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
CHARACTER = REPO / "public/characters/temari"
FRAMES_DIR = CHARACTER / "frames"
METADATA_PATH = FRAMES_DIR / "frames.json"
SOURCE_PATH = Path(
    "/Users/brandonhenry/Documents/Kore/Characters/Naruto Universe/Temari/Temari.png"
)
CELL_MATTE = (72, 176, 56)
MATTES = {(24, 144, 0), CELL_MATTE, (0, 128, 128)}
TARGETS = range(104, 151)
ORIGINAL_SPLIT_ORIGIN = (2, 2456)


def intersects(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def union(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def source_cells(source: Image.Image) -> list[tuple[int, int, int, int]]:
    rgb = source.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    seen = bytearray(width * height)
    pieces: list[tuple[int, int, int, int]] = []
    for y in range(height):
        for x in range(width):
            key = y * width + x
            if seen[key] or pixels[x, y] != CELL_MATTE:
                continue
            seen[key] = 1
            stack = [(x, y)]
            count = 0
            left = right = x
            top = bottom = y
            while stack:
                px, py = stack.pop()
                count += 1
                left, right = min(left, px), max(right, px)
                top, bottom = min(top, py), max(bottom, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    neighbor = ny * width + nx
                    if not seen[neighbor] and pixels[nx, ny] == CELL_MATTE:
                        seen[neighbor] = 1
                        stack.append((nx, ny))
            if count > 100:
                pieces.append((left, top, right + 1, bottom + 1))

    cells: list[tuple[int, int, int, int]] = []
    for piece in pieces:
        merged = piece
        changed = True
        while changed:
            changed = False
            kept = []
            for cell in cells:
                if intersects(merged, cell):
                    merged = union(merged, cell)
                    changed = True
                else:
                    kept.append(cell)
            cells = kept
        cells.append(merged)
    return sorted(cells, key=lambda box: (box[1], box[0]))


def overlap_area(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> int:
    return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(
        0, min(a[3], b[3]) - max(a[1], b[1])
    )


def provenance_box(entry: dict) -> tuple[int, int, int, int]:
    box = tuple(int(value) for value in entry["sourceBox"])
    if (box[2] - box[0], box[3] - box[1]) != (1, 1):
        return box
    repair = entry.get("sourceRepair", {})
    component = repair.get("componentBox") if isinstance(repair, dict) else None
    if isinstance(component, list) and len(component) == 4:
        x, y = ORIGINAL_SPLIT_ORIGIN
        return x + component[0], y + component[1], x + component[2], y + component[3]
    return box


def map_cell(box: tuple[int, int, int, int], cells: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int]:
    score, cell = max(((overlap_area(box, candidate), candidate) for candidate in cells), key=lambda item: item[0])
    if score <= 0:
        raise RuntimeError(f"No source cell overlaps {box}")
    return cell


def clear_border_matte(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()

    def matte(x: int, y: int) -> bool:
        return pixels[x, y][:3] in MATTES

    for x in range(width):
        queue.extend((x, y) for y in (0, height - 1) if matte(x, y))
    for y in range(height):
        queue.extend((x, y) for x in (0, width - 1) if matte(x, y))
    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not matte(x, y):
            continue
        seen.add((x, y))
        pixels[x, y] = (*pixels[x, y][:3], 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                queue.append((nx, ny))
    # Wind loops can completely enclose source matte. These exact colors are
    # Temari-specific keys, so clear enclosed islands as well as border matte.
    for y in range(height):
        for x in range(width):
            if pixels[x, y][:3] in MATTES:
                pixels[x, y] = (*pixels[x, y][:3], 0)
    bounds = rgba.getchannel("A").getbbox()
    return rgba.crop(bounds) if bounds else Image.new("RGBA", (1, 1))


def repack(entries: list[dict]) -> None:
    images = [Image.open(FRAMES_DIR / f"frame-{int(entry['index']):03d}.png").convert("RGBA") for entry in entries]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width, cell_height = max_width + 8, max_height + 8
    sheet = Image.new("RGBA", (columns * cell_width, math.ceil(len(images) / columns) * cell_height))
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
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    metadata = json.loads(METADATA_PATH.read_text())
    entries = metadata["frames"]
    source = Image.open(SOURCE_PATH).convert("RGBA")
    cells = source_cells(source)
    mapped: dict[int, tuple[int, int, int, int]] = {}
    for index in TARGETS:
        mapped[index] = map_cell(provenance_box(entries[index]), cells)
    mapped[146] = (182, 3016, 360, 3126)  # Its old 1px crop sat on the cell divider.
    print(json.dumps({str(index): list(cell) for index, cell in mapped.items()}, indent=2))
    if not args.apply:
        return
    for index, cell in mapped.items():
        rebuilt = clear_border_matte(source.crop(cell))
        rebuilt.save(FRAMES_DIR / f"frame-{index:03d}.png")
        previous = entries[index].get("sourceRepair")
        if isinstance(previous, dict) and previous.get("type") == "rebuild-complete-wind-cell":
            previous = previous.get("previousRepair")
        entries[index]["sourceBox"] = list(cell)
        entries[index]["sourceRepair"] = {
            "type": "rebuild-complete-wind-cell",
            "cell": list(cell),
            "previousRepair": previous,
        }
    repack(entries)
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"rebuilt {len(mapped)} complete Wind Scythe frames")


if __name__ == "__main__":
    main()
