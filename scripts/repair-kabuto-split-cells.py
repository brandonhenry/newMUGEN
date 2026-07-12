#!/usr/bin/env python3
"""Repair Kabuto frames that were split into multiple component crops.

Kabuto.png uses cyan between cells and a green matte inside each cell.  The
original importer occasionally exported disconnected pieces from one green
cell as separate frames (head/body, upper/lower body, or attack debris).  This
script finds the original green cells, maps frame source boxes back to them,
and rebuilds every duplicated cell mapping as a complete transparent sprite.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
CHARACTER = REPO / "public/characters/kabuto"
FRAMES_DIR = CHARACTER / "frames"
FRAMES_JSON = FRAMES_DIR / "frames.json"
SOURCE = Path(
    "/Users/brandonhenry/Documents/Kore/Characters/Naruto Universe/Kabuto/Kabuto.png"
)
GREEN = (48, 200, 152)
CYAN = (0, 255, 255)
OBSOLETE_SPLIT_FRAMES = tuple(range(273, 281))


def intersects(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def union(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> tuple[int, int, int, int]:
    return min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])


def green_components(source: Image.Image) -> list[tuple[int, int, int, int]]:
    """Return significant exact-green connected-component bounds."""
    rgb = source.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    seen = bytearray(width * height)
    boxes: list[tuple[int, int, int, int]] = []

    for y in range(height):
        for x in range(width):
            key = y * width + x
            if seen[key] or pixels[x, y] != GREEN:
                continue
            seen[key] = 1
            stack = [(x, y)]
            count = 0
            min_x = max_x = x
            min_y = max_y = y
            while stack:
                px, py = stack.pop()
                count += 1
                min_x, max_x = min(min_x, px), max(max_x, px)
                min_y, max_y = min(min_y, py), max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    neighbor = ny * width + nx
                    if not seen[neighbor] and pixels[nx, ny] == GREEN:
                        seen[neighbor] = 1
                        stack.append((nx, ny))
            if count > 100:
                boxes.append((min_x, min_y, max_x + 1, max_y + 1))
    return boxes


def merge_cell_pieces(boxes: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """Merge matte components separated by a sprite inside the same cell."""
    cells: list[tuple[int, int, int, int]] = []
    for box in boxes:
        merged = box
        changed = True
        while changed:
            changed = False
            kept: list[tuple[int, int, int, int]] = []
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


def map_to_cell(source_box: list[int], cells: list[tuple[int, int, int, int]]) -> tuple[int, int, int, int] | None:
    box = tuple(source_box)
    candidates = [(overlap_area(box, cell), cell) for cell in cells]
    score, cell = max(candidates, default=(0, None), key=lambda item: item[0])
    return cell if score > 0 else None


def clear_border_matte(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()

    def is_matte(x: int, y: int) -> bool:
        return pixels[x, y][:3] in (GREEN, CYAN)

    for x in range(width):
        for y in (0, height - 1):
            if is_matte(x, y):
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if is_matte(x, y):
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in seen or not is_matte(x, y):
            continue
        seen.add((x, y))
        pixels[x, y] = (*pixels[x, y][:3], 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                queue.append((nx, ny))

    # Energy rings can fully enclose islands of Kabuto's exact green cell
    # matte. Green is not part of his authored palette, so remove those
    # enclosed islands too. Cyan remains border-connected only because it is
    # also used by the authored energy effects.
    for y in range(height):
        for x in range(width):
            if pixels[x, y][:3] == GREEN:
                pixels[x, y] = (*pixels[x, y][:3], 0)

    alpha_box = rgba.getchannel("A").getbbox()
    return rgba.crop(alpha_box) if alpha_box else Image.new("RGBA", (1, 1))


def regenerate_animation_sheet(entries: list[dict]) -> None:
    images = [Image.open(FRAMES_DIR / f"frame-{int(entry['index']):03d}.png").convert("RGBA") for entry in entries]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width = max_width + padding * 2
    cell_height = max_height + padding * 2
    rows = math.ceil(len(images) / columns)
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height))
    for position, (entry, image) in enumerate(zip(entries, images)):
        column, row = position % columns, position // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        entry["path"] = f"/characters/kabuto/frames/frame-{int(entry['index']):03d}.png"
        entry["sheetId"] = "generated"
        entry["sheetPath"] = "/characters/kabuto/animation-sheet.png"
        entry["box"] = [x, y, x + image.width, y + image.height]
        entry["width"], entry["height"] = image.size
    sheet.save(CHARACTER / "animation-sheet.png")


def update_manifest_count(count: int) -> None:
    path = CHARACTER / "character.json"
    manifest = json.loads(path.read_text())
    manifest["spriteFrameCount"] = count
    for sheet in manifest.get("spriteSheets", []):
        if isinstance(sheet, dict) and "frameCount" in sheet:
            sheet["frameCount"] = count
    path.write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--rebuild-all",
        action="store_true",
        help="Rebuild every mapped source cell, preserving authored black pixels.",
    )
    args = parser.parse_args()

    data = json.loads(FRAMES_JSON.read_text())
    entries = data["frames"]
    source = Image.open(SOURCE).convert("RGB")
    cells = merge_cell_pieces(green_components(source))

    mapped: dict[int, tuple[int, int, int, int]] = {}
    by_cell: dict[tuple[int, int, int, int], list[int]] = {}
    for index, entry in enumerate(entries):
        source_box = entry.get("sourceBox")
        if index in OBSOLETE_SPLIT_FRAMES or not isinstance(source_box, list) or len(source_box) != 4:
            continue
        cell = map_to_cell(source_box, cells)
        if cell is None:
            continue
        mapped[index] = cell
        by_cell.setdefault(cell, []).append(index)

    repair_groups = {cell: indices for cell, indices in by_cell.items() if len(indices) > 1}
    repaired = (
        sorted(mapped)
        if args.rebuild_all
        else sorted(index for indices in repair_groups.values() for index in indices)
    )
    print(f"source cells: {len(cells)}")
    print(f"duplicate-cell groups: {len(repair_groups)}")
    print(f"frames to rebuild: {repaired}")
    print(f"obsolete unreferenced split frames to remove: {list(OBSOLETE_SPLIT_FRAMES)}")

    if not args.apply:
        return

    for index in repaired:
        cell = mapped[index]
        rebuilt = clear_border_matte(source.crop(cell))
        rebuilt.save(FRAMES_DIR / f"frame-{index:03d}.png")
        entries[index]["width"], entries[index]["height"] = rebuilt.size
        entries[index]["sourceBox"] = list(cell)
        entries[index]["sourceRepair"] = {
            "type": "rebuild-complete-source-cell",
            "cell": list(cell),
        }

    for index in reversed(OBSOLETE_SPLIT_FRAMES):
        if index < len(entries):
            entries.pop(index)
        path = FRAMES_DIR / f"frame-{index:03d}.png"
        if path.exists():
            path.unlink()
        voxel_path = CHARACTER / "voxels-hd" / f"frame-{index:03d}.json"
        if voxel_path.exists():
            voxel_path.unlink()

    data["count"] = len(entries)
    regenerate_animation_sheet(entries)
    data["sheets"] = [{
        "id": "generated",
        "name": "Generated Frame Atlas",
        "path": "/characters/kabuto/animation-sheet.png",
        "frameStart": 0,
        "frameCount": len(entries),
    }]
    FRAMES_JSON.write_text(json.dumps(data, indent=2) + "\n")
    update_manifest_count(len(entries))
    print(f"applied {len(repaired)} repairs; frame count is now {len(entries)}")


if __name__ == "__main__":
    main()
