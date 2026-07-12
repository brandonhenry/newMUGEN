#!/usr/bin/env python3
"""Rejoin Jirobo sprites that wrap across source-cell left/right edges."""

from __future__ import annotations

import argparse
from collections import deque
import json
import math
from pathlib import Path

from PIL import Image


SOURCE = Path("/Users/brandonhenry/Documents/Kore/Characters/Naruto Universe/Jirobo/Jirobo.png")
MATTE_COLORS = {(0, 160, 0), (0, 255, 255)}

# (frame indexes receiving the repaired pose, source cell box)
WRAPPED_GROUPS = [
    ((103, 104), (530, 2111, 793, 2182)),
    ((105, 106), (0, 2184, 263, 2255)),
    ((107, 108), (265, 2184, 528, 2255)),
    ((109, 110), (530, 2184, 793, 2255)),
    ((111, 112), (0, 2257, 263, 2328)),
    ((113, 114, 115), (265, 2257, 528, 2328)),
    ((116, 117, 118), (530, 2257, 793, 2328)),
    ((119, 120), (0, 2330, 263, 2401)),
    ((121, 122), (265, 2330, 528, 2401)),
    ((151, 152), (0, 3060, 263, 3131)),
    ((153, 154), (265, 3060, 528, 3131)),
    ((155, 156), (530, 3060, 793, 3131)),
    ((159, 160), (0, 3352, 263, 3430)),
    ((161, 162), (265, 3352, 528, 3430)),
    ((163, 164), (530, 3352, 793, 3430)),
    ((165, 166), (0, 3432, 263, 3510)),
    ((167, 168), (265, 3432, 528, 3510)),
    ((169, 170), (530, 3432, 793, 3510)),
    ((171, 172), (0, 3512, 263, 3590)),
    ((173, 174), (265, 3512, 528, 3590)),
    ((175, 176), (530, 3512, 793, 3590)),
    ((177, 178), (0, 3592, 263, 3670)),
]
STRAY_COMPONENT_FRAMES = (93,)


def clear_matte(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 16 and (red, green, blue) in MATTE_COLORS:
                pixels[x, y] = (red, green, blue, 0)
    return rgba


def longest_circular_empty_run(occupied: list[bool]) -> tuple[int, int]:
    width = len(occupied)
    best_start = 0
    best_length = 0
    start = 0
    length = 0
    for index in range(width * 2):
        if not occupied[index % width] and length < width:
            if length == 0:
                start = index
            length += 1
            if length > best_length:
                best_start, best_length = start, length
        else:
            length = 0
    return best_start % width, min(best_length, width)


def unwrap_cell(source: Image.Image, box: tuple[int, int, int, int]) -> tuple[Image.Image, int]:
    cell = clear_matte(source.crop(box))
    alpha = cell.getchannel("A")
    occupied = [alpha.crop((x, 0, x + 1, cell.height)).getbbox() is not None for x in range(cell.width)]
    empty_start, empty_length = longest_circular_empty_run(occupied)
    cut = (empty_start + empty_length // 2) % cell.width
    rotated = Image.new("RGBA", cell.size, (0, 0, 0, 0))
    rotated.alpha_composite(cell.crop((cut, 0, cell.width, cell.height)), (0, 0))
    rotated.alpha_composite(cell.crop((0, 0, cut, cell.height)), (cell.width - cut, 0))
    bounds = rotated.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError(f"No foreground found in source cell {box}")
    return rotated.crop(bounds), cut


def save_comparison(path: Path, current: Image.Image, candidate: Image.Image) -> None:
    scale = 2
    left = current.convert("RGBA").resize((current.width * scale, current.height * scale), Image.Resampling.NEAREST)
    right = candidate.resize((candidate.width * scale, candidate.height * scale), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (left.width + right.width + 12, max(left.height, right.height) + 8), (24, 24, 24, 255))
    canvas.alpha_composite(left, (4, 4))
    canvas.alpha_composite(right, (left.width + 8, 4))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def keep_largest_component(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    alpha = rgba.getchannel("A").tobytes()
    visited = bytearray(width * height)
    largest: list[int] = []
    for start, value in enumerate(alpha):
        if value <= 16 or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        while queue:
            key = queue.popleft()
            component.append(key)
            x, y = key % width, key // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                neighbor = ny * width + nx
                if not visited[neighbor] and alpha[neighbor] > 16:
                    visited[neighbor] = 1
                    queue.append(neighbor)
        if len(component) > len(largest):
            largest = component
    keep = set(largest)
    pixels = rgba.load()
    for key, value in enumerate(alpha):
        if value > 16 and key not in keep:
            x, y = key % width, key // width
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0)
    bounds = rgba.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("No foreground remains after component cleanup")
    return rgba.crop(bounds)


def repack(character_dir: Path, metadata: dict) -> None:
    entries = sorted(metadata["frames"], key=lambda entry: int(entry["index"]))
    images = [Image.open(character_dir / "frames" / f"frame-{int(entry['index']):03d}.png").convert("RGBA") for entry in entries]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width = max_width + padding * 2
    cell_height = max_height + padding * 2
    sheet = Image.new("RGBA", (columns * cell_width, math.ceil(len(images) / columns) * cell_height), (0, 0, 0, 0))
    for position, (entry, image) in enumerate(zip(entries, images)):
        column, row = position % columns, position // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        entry.update({
            "box": [x, y, x + image.width, y + image.height],
            "width": image.width,
            "height": image.height,
            "row": row,
            "sheetId": "generated",
            "sheetPath": "/characters/jirobo/animation-sheet.png",
        })
    sheet.save(character_dir / "animation-sheet.png")
    metadata["count"] = len(entries)
    metadata["sheets"] = [{
        "id": "generated",
        "name": "Generated Frame Atlas",
        "path": "/characters/jirobo/animation-sheet.png",
        "frameStart": 0,
        "frameCount": len(entries),
    }]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--preview-dir", type=Path, default=Path("tmp/jirobo-wrapped-frame-repair"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    character_dir = args.repo.resolve() / "public" / "characters" / "jirobo"
    metadata_path = character_dir / "frames" / "frames.json"
    metadata = json.loads(metadata_path.read_text())
    by_index = {int(entry["index"]): entry for entry in metadata["frames"]}
    source = Image.open(args.source).convert("RGBA")
    repaired: list[int] = []
    for indexes, box in WRAPPED_GROUPS:
        candidate, cut = unwrap_cell(source, box)
        for index in indexes:
            frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
            current = Image.open(frame_path).convert("RGBA")
            save_comparison(args.preview_dir / f"frame-{index:03d}.png", current, candidate)
            repaired.append(index)
            if args.apply:
                candidate.save(frame_path)
                entry = by_index[index]
                entry.pop("sourceBox", None)
                entry["sourceRepair"] = {
                    "type": "wrapped-source-cell",
                    "sourceCell": list(box),
                    "wrapCutX": cut,
                    "mergedFrames": list(indexes),
                }
                entry["width"], entry["height"] = candidate.size
    for index in STRAY_COMPONENT_FRAMES:
        frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
        current = Image.open(frame_path).convert("RGBA")
        candidate = keep_largest_component(current)
        save_comparison(args.preview_dir / f"frame-{index:03d}.png", current, candidate)
        repaired.append(index)
        if args.apply:
            candidate.save(frame_path)
            entry = by_index[index]
            entry.pop("sourceBox", None)
            entry["sourceRepair"] = {"type": "remove-stray-component", "kept": "largest"}
            entry["width"], entry["height"] = candidate.size
    if args.apply:
        repack(character_dir, metadata)
        metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"mode": "apply" if args.apply else "dry-run", "groups": len(WRAPPED_GROUPS), "frames": repaired}, indent=2))


if __name__ == "__main__":
    main()
