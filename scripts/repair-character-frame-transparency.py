#!/usr/bin/env python3
"""Re-key character frame PNG backgrounds to transparent from frames.json metadata."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from collections import Counter, deque
from typing import Iterable

from PIL import Image


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


def dominant_corner_color(image: Image.Image) -> tuple[int, int, int] | None:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    if width <= 0 or height <= 0:
        return None
    points = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
        (width // 2, 0),
        (0, height // 2),
    ]
    samples: list[tuple[int, int, int]] = []
    for x, y in points:
        r, g, b, a = rgba.getpixel((x, y))
        if a > 16:
            samples.append((r, g, b))
    if not samples:
        return None
    return max(samples, key=lambda color: sum(1 for sample in samples if color_distance(color, sample) <= 18))


def background_candidates(image: Image.Image) -> list[tuple[int, int, int]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    if width <= 0 or height <= 0:
        return []
    perimeter: list[tuple[int, int, int]] = []
    for x in range(width):
        for y in (0, height - 1):
            r, g, b, a = rgba.getpixel((x, y))
            if a > 16:
                perimeter.append((r, g, b))
    for y in range(1, height - 1):
        for x in (0, width - 1):
            r, g, b, a = rgba.getpixel((x, y))
            if a > 16:
                perimeter.append((r, g, b))
    if not perimeter:
        return []

    quantized = Counter((r // 8, g // 8, b // 8) for r, g, b in perimeter)
    minimum = max(3, round(len(perimeter) * 0.04))
    candidates: list[tuple[int, int, int]] = []
    for bucket, count in quantized.most_common(8):
        if count < minimum:
            continue
        members = [color for color in perimeter if (color[0] // 8, color[1] // 8, color[2] // 8) == bucket]
        if not members:
            continue
        candidates.append((
            round(sum(color[0] for color in members) / len(members)),
            round(sum(color[1] for color in members) / len(members)),
            round(sum(color[2] for color in members) / len(members)),
        ))
    dominant = dominant_corner_color(rgba)
    if dominant is not None:
        candidates.append(dominant)

    unique: list[tuple[int, int, int]] = []
    for candidate in candidates:
        if all(color_distance(candidate, seen) > 10 for seen in unique):
            unique.append(candidate)
    return unique


def clean_frame(frame_path: Path, backgrounds: list[tuple[int, int, int]], tolerance: int) -> bool:
    image = Image.open(frame_path).convert("RGBA")
    width, height = image.size
    if width <= 0 or height <= 0 or not backgrounds:
        return False

    pixels = image.load()
    remove: set[tuple[int, int]] = set()
    queue: deque[tuple[int, int]] = deque()

    def looks_like_background(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        return a > 0 and any(color_distance((r, g, b), background) <= tolerance for background in backgrounds)

    for x in range(width):
        for y in (0, height - 1):
            if looks_like_background(x, y):
                queue.append((x, y))
                remove.add((x, y))
    for y in range(1, height - 1):
        for x in (0, width - 1):
            if looks_like_background(x, y):
                queue.append((x, y))
                remove.add((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in remove:
                continue
            if looks_like_background(nx, ny):
                remove.add((nx, ny))
                queue.append((nx, ny))

    if not remove:
        return False

    changed = False
    for x, y in remove:
        r, g, b, a = pixels[x, y]
        if a:
            pixels[x, y] = (r, g, b, 0)
            changed = True
    if not changed:
        return False
    image.save(frame_path)
    return True


def iter_target_frames(frames: Iterable[dict], sheet_ids: set[str], start: int | None, end: int | None) -> Iterable[dict]:
    for frame in frames:
        index = int(frame.get("index", -1))
        if index < 0:
            continue
        if start is not None and index < start:
            continue
        if end is not None and index > end:
            continue
        if sheet_ids and str(frame.get("sheetId", "")) not in sheet_ids:
            continue
        yield frame


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--character", required=True)
    parser.add_argument("--sheet-id", action="append", default=[])
    parser.add_argument("--start", type=int)
    parser.add_argument("--end", type=int)
    parser.add_argument("--tolerance", type=int, default=70)
    args = parser.parse_args()

    character_dir = args.repo / "public" / "characters" / args.character
    frames_json = character_dir / "frames" / "frames.json"
    data = json.loads(frames_json.read_text())
    frames = list(iter_target_frames(data.get("frames", []), set(args.sheet_id), args.start, args.end))
    if not frames:
        raise SystemExit("No matching frames found")

    sheet_cache: dict[str, list[tuple[int, int, int]]] = {}
    repaired = 0
    skipped = 0
    for frame in frames:
        sheet_path = frame.get("sheetPath")
        path = frame.get("path")
        if not isinstance(sheet_path, str) or not isinstance(path, str):
            skipped += 1
            continue
        if sheet_path not in sheet_cache:
            source = character_dir.parent.parent / sheet_path.lstrip("/")
            backgrounds = background_candidates(Image.open(source))
            if not backgrounds:
                skipped += 1
                continue
            sheet_cache[sheet_path] = backgrounds
        frame_path = character_dir.parent.parent / path.lstrip("/")
        if clean_frame(frame_path, sheet_cache[sheet_path], args.tolerance):
            repaired += 1

    print(f"checked={len(frames)} repaired={repaired} skipped={skipped}")


if __name__ == "__main__":
    main()
