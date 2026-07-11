#!/usr/bin/env python3
"""Detect imported KORE frames that look like contact sheets.

The detector is intentionally conservative: it reports frames that contain
many separated, body-sized alpha components laid out across a large image.
It is meant to find source-sheet/contact-strip mistakes such as one PNG
containing the same fighter many times. Visual review is still required before
repairing or deleting a reported frame.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, deque
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image


def connected_components(image: Image.Image, alpha_threshold: int, min_pixels: int) -> list[dict[str, Any]]:
    width, height = image.size
    alpha = image.getchannel("A").load()
    seen: set[tuple[int, int]] = set()
    components: list[dict[str, Any]] = []
    for start_y in range(height):
        for start_x in range(width):
            if (start_x, start_y) in seen or alpha[start_x, start_y] <= alpha_threshold:
                continue
            queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
            seen.add((start_x, start_y))
            min_x = max_x = start_x
            min_y = max_y = start_y
            pixels = 0
            while queue:
                x, y = queue.popleft()
                pixels += 1
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in seen:
                        continue
                    if alpha[nx, ny] <= alpha_threshold:
                        continue
                    seen.add((nx, ny))
                    queue.append((nx, ny))
            if pixels >= min_pixels:
                comp_width = max_x - min_x + 1
                comp_height = max_y - min_y + 1
                components.append(
                    {
                        "pixels": pixels,
                        "box": [min_x, min_y, max_x + 1, max_y + 1],
                        "width": comp_width,
                        "height": comp_height,
                        "area": comp_width * comp_height,
                        "center": [(min_x + max_x + 1) / 2, (min_y + max_y + 1) / 2],
                    }
                )
    return components


def component_rows_or_columns(components: list[dict[str, Any]], axis: str, tolerance: float) -> int:
    if not components:
        return 0
    index = 1 if axis == "y" else 0
    values = sorted(float(component["center"][index]) for component in components)
    buckets = 1
    last = values[0]
    for value in values[1:]:
        if abs(value - last) > tolerance:
            buckets += 1
            last = value
        else:
            last = (last + value) / 2
    return buckets


def analyze_frame(frame_path: Path, alpha_threshold: int) -> dict[str, Any] | None:
    image = Image.open(frame_path).convert("RGBA")
    width, height = image.size
    if width < 70 and height < 70:
        return None
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return None
    opaque_pixels = sum(1 for value in alpha.getdata() if value > alpha_threshold)
    if opaque_pixels <= 0:
        return None

    min_pixels = max(45, min(160, int(opaque_pixels * 0.006)))
    components = connected_components(image, alpha_threshold, min_pixels)
    body_like = [
        component
        for component in components
        if component["pixels"] >= min_pixels
        and component["width"] >= 8
        and component["height"] >= 8
        and component["area"] >= 80
    ]
    if len(body_like) < 4:
        return None

    widths = [component["width"] for component in body_like]
    heights = [component["height"] for component in body_like]
    median_width = float(median(widths))
    median_height = float(median(heights))
    x_span = max(component["box"][2] for component in body_like) - min(component["box"][0] for component in body_like)
    y_span = max(component["box"][3] for component in body_like) - min(component["box"][1] for component in body_like)
    rows = component_rows_or_columns(body_like, "y", max(12, median_height * 0.65))
    columns = component_rows_or_columns(body_like, "x", max(12, median_width * 0.65))
    comparable = [
        component
        for component in body_like
        if median_width * 0.45 <= component["width"] <= median_width * 1.9
        and median_height * 0.45 <= component["height"] <= median_height * 1.9
    ]

    reasons: list[str] = []
    if len(comparable) >= 8:
        reasons.append("many-comparable-components")
    if len(body_like) >= 6 and columns >= 3 and rows >= 2:
        reasons.append("grid-layout")
    if len(body_like) >= 4 and x_span >= median_width * 3.2 and (width >= 150 or columns >= 4):
        reasons.append("horizontal-contact-strip")
    if len(body_like) >= 4 and y_span >= median_height * 3.2 and (height >= 150 or rows >= 4):
        reasons.append("vertical-contact-strip")

    if not reasons:
        return None

    score = len(comparable) * 2 + len(body_like) + rows + columns
    if "grid-layout" in reasons:
        score += 8
    return {
        "framePath": str(frame_path),
        "width": width,
        "height": height,
        "opaquePixels": opaque_pixels,
        "componentCount": len(body_like),
        "comparableComponentCount": len(comparable),
        "rows": rows,
        "columns": columns,
        "medianComponentWidth": round(median_width, 2),
        "medianComponentHeight": round(median_height, 2),
        "xSpan": x_span,
        "ySpan": y_span,
        "score": score,
        "reasons": reasons,
        "components": sorted(body_like, key=lambda item: item["pixels"], reverse=True)[:24],
    }


def character_ids(repo: Path, args: argparse.Namespace) -> list[str]:
    if args.characters:
        return args.characters
    if args.from_selected:
        selected_path = repo / "tmp" / "july9-character-import" / "selected-imports.json"
        selected = json.loads(selected_path.read_text())
        return [
            item["characterId"]
            for item in selected
            if (repo / "public" / "characters" / item["characterId"]).exists()
        ]
    return sorted(
        path.name
        for path in (repo / "public" / "characters").iterdir()
        if (path / "frames" / "frames.json").exists()
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--characters", nargs="*")
    parser.add_argument("--from-selected", action="store_true")
    parser.add_argument("--alpha-threshold", type=int, default=24)
    parser.add_argument("--output", type=Path, default=Path("tmp/multi-character-frame-candidates.json"))
    args = parser.parse_args()

    repo = args.repo
    results: list[dict[str, Any]] = []
    for character_id in character_ids(repo, args):
        frames_dir = repo / "public" / "characters" / character_id / "frames"
        if not frames_dir.exists():
            continue
        for frame_path in sorted(frames_dir.glob("frame-*.png")):
            analysis = analyze_frame(frame_path, args.alpha_threshold)
            if analysis is None:
                continue
            index = int(frame_path.stem.split("-")[-1])
            analysis["characterId"] = character_id
            analysis["frame"] = index
            results.append(analysis)

    results.sort(key=lambda item: (-int(item["score"]), item["characterId"], item["frame"]))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2) + "\n")
    by_character = Counter(item["characterId"] for item in results)
    print(
        json.dumps(
            {
                "candidateCount": len(results),
                "characters": dict(sorted(by_character.items())),
                "output": str(args.output),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
