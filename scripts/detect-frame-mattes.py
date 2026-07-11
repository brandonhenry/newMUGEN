#!/usr/bin/env python3
"""Detect and optionally clear opaque sprite-sheet matte backgrounds.

This catches frames that are "fully opaque" in alpha terms but visually wrong
because a solid source-cell background is still present. The detector looks for
a dominant border-connected color region, then clears only that connected matte
region so character pixels remain opaque.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, deque
from pathlib import Path
from typing import Any

from PIL import Image


def color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> int:
    return max(abs(left[index] - right[index]) for index in range(3))


def color_bucket(color: tuple[int, int, int], bucket_size: int) -> tuple[int, int, int]:
    return tuple(value // bucket_size for value in color)


def is_low_risk_matte_color(color: tuple[int, int, int]) -> bool:
    r, g, b = color
    saturation = max(color) - min(color)
    brightness = max(color)
    # Avoid treating ordinary black outlines as a matte unless the area test is
    # extremely strong. Saturated sheet colors and light gray/white cells are
    # the common bad import backgrounds.
    return saturation >= 35 or brightness >= 96


def border_pixels(image: Image.Image, alpha_threshold: int) -> list[tuple[int, int, tuple[int, int, int]]]:
    width, height = image.size
    pixels = image.load()
    found: list[tuple[int, int, tuple[int, int, int]]] = []
    if width <= 0 or height <= 0:
        return found
    for x in range(width):
        for y in (0, height - 1):
            r, g, b, a = pixels[x, y]
            if a > alpha_threshold:
                found.append((x, y, (r, g, b)))
    for y in range(1, height - 1):
        for x in (0, width - 1):
            r, g, b, a = pixels[x, y]
            if a > alpha_threshold:
                found.append((x, y, (r, g, b)))
    return found


def flood_matte(
    image: Image.Image,
    matte_color: tuple[int, int, int],
    tolerance: int,
    alpha_threshold: int,
) -> set[tuple[int, int]]:
    width, height = image.size
    pixels = image.load()
    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()

    def matches(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        return a > alpha_threshold and color_distance((r, g, b), matte_color) <= tolerance

    for x in range(width):
        for y in (0, height - 1):
            if matches(x, y):
                seen.add((x, y))
                queue.append((x, y))
    for y in range(1, height - 1):
        for x in (0, width - 1):
            if (x, y) not in seen and matches(x, y):
                seen.add((x, y))
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in seen:
                continue
            if matches(nx, ny):
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def analyze_frame(
    frame_path: Path,
    alpha_threshold: int,
    bucket_size: int,
    tolerance: int,
    min_border_dominance: float,
    min_area_ratio: float,
    include_dark: bool,
) -> dict[str, Any] | None:
    image = Image.open(frame_path).convert("RGBA")
    width, height = image.size
    if width <= 0 or height <= 0:
        return None
    border = border_pixels(image, alpha_threshold)
    perimeter = max(1, 2 * width + 2 * height - 4)
    if len(border) < max(6, perimeter * 0.2):
        return None

    counts = Counter(color_bucket(color, bucket_size) for _, _, color in border)
    best_bucket, best_count = counts.most_common(1)[0]
    border_dominance = best_count / max(1, len(border))
    colors = [color for _, _, color in border if color_bucket(color, bucket_size) == best_bucket]
    matte_color = tuple(round(sum(color[index] for color in colors) / len(colors)) for index in range(3))
    matte_pixels = flood_matte(image, matte_color, tolerance, alpha_threshold)
    area_ratio = len(matte_pixels) / max(1, width * height)

    if border_dominance < min_border_dominance and area_ratio < min_area_ratio:
        return None
    if not include_dark and not is_low_risk_matte_color(matte_color) and area_ratio < 0.55:
        return None
    if len(matte_pixels) < max(12, int(width * height * min_area_ratio)):
        return None

    return {
        "framePath": str(frame_path),
        "width": width,
        "height": height,
        "borderOpaquePixels": len(border),
        "perimeter": perimeter,
        "borderDominance": round(border_dominance, 4),
        "matteColor": list(matte_color),
        "mattePixels": len(matte_pixels),
        "matteAreaRatio": round(area_ratio, 4),
    }


def clear_matte(frame_path: Path, analysis: dict[str, Any], tolerance: int, alpha_threshold: int) -> bool:
    image = Image.open(frame_path).convert("RGBA")
    matte_color = tuple(int(value) for value in analysis["matteColor"])
    matte_pixels = flood_matte(image, matte_color, tolerance, alpha_threshold)
    if not matte_pixels:
        return False
    pixels = image.load()
    for x, y in matte_pixels:
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
    for y in range(image.size[1]):
        for x in range(image.size[0]):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, 255 if a > alpha_threshold else 0)
    image.save(frame_path)
    return True


def character_ids(repo: Path, requested: list[str] | None) -> list[str]:
    if requested:
        return requested
    return sorted(
        path.name
        for path in (repo / "public" / "characters").iterdir()
        if (path / "frames").exists()
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--characters", nargs="*")
    parser.add_argument("--alpha-threshold", type=int, default=24)
    parser.add_argument("--bucket-size", type=int, default=8)
    parser.add_argument("--tolerance", type=int, default=12)
    parser.add_argument("--min-border-dominance", type=float, default=0.72)
    parser.add_argument("--min-area-ratio", type=float, default=0.18)
    parser.add_argument("--include-dark", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("tmp/non-character-frame-review/frame-matte-candidates.json"))
    args = parser.parse_args()

    results: list[dict[str, Any]] = []
    repaired = 0
    for character_id in character_ids(args.repo, args.characters):
        frames_dir = args.repo / "public" / "characters" / character_id / "frames"
        if not frames_dir.exists():
            continue
        for frame_path in sorted(frames_dir.glob("frame-*.png")):
            analysis = analyze_frame(
                frame_path,
                args.alpha_threshold,
                args.bucket_size,
                args.tolerance,
                args.min_border_dominance,
                args.min_area_ratio,
                args.include_dark,
            )
            if analysis is None:
                continue
            analysis["characterId"] = character_id
            analysis["frame"] = int(frame_path.stem.split("-")[-1])
            if args.apply and clear_matte(frame_path, analysis, args.tolerance, args.alpha_threshold):
                analysis["repaired"] = True
                repaired += 1
            results.append(analysis)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2) + "\n")
    by_character: dict[str, int] = {}
    for item in results:
        by_character[item["characterId"]] = by_character.get(item["characterId"], 0) + 1
    print(
        json.dumps(
            {
                "candidateCount": len(results),
                "repaired": repaired,
                "characters": dict(sorted(by_character.items())),
                "output": str(args.output),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
