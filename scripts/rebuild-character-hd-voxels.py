#!/usr/bin/env python3
"""Rebuild precomputed HD voxel JSON from transparent character frame PNGs."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from collections import Counter

from PIL import Image


def round_voxel(value: float) -> float:
    return round(value, 5)


def classify_part(row_ratio: float, x_ratio: float) -> str:
    if row_ratio < 0.29:
        return "head"
    if row_ratio > 0.58:
        return "leadLeg" if x_ratio >= 0 else "rearLeg"
    if abs(x_ratio) > 0.26:
        return "leadArm" if x_ratio >= 0 else "rearArm"
    return "torso"


def foreground_bounds(image: Image.Image, alpha_threshold: int) -> tuple[int, int, int, int] | None:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    for y in range(height):
        for x in range(width):
            _, _, _, a = rgba.getpixel((x, y))
            if a > alpha_threshold:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x < min_x or max_y < min_y:
        return None
    return min_x, min_y, max_x, max_y


def palette_index(color: str, palette: list[str], indexes: dict[str, int]) -> int:
    if color in indexes:
        return indexes[color]
    index = len(palette)
    indexes[color] = index
    palette.append(color)
    return index


def color_hex(red: int, green: int, blue: int) -> str:
    return f"#{red:02x}{green:02x}{blue:02x}"


def is_black_outline_pixel(red: int, green: int, blue: int) -> bool:
    maximum = max(red, green, blue)
    minimum = min(red, green, blue)
    return maximum <= 34 and maximum - minimum <= 18


def nearest_side_bleed_color(
    image: Image.Image,
    bounds: tuple[int, int, int, int],
    center_x: int,
    center_y: int,
    alpha_threshold: int,
) -> str | None:
    min_x, min_y, max_x, max_y = bounds
    pixels = image.load()
    for radius in [2, 4, 7, 11, 16, 24]:
        votes: Counter[str] = Counter()
        left = max(min_x, center_x - radius)
        right = min(max_x, center_x + radius)
        top = max(min_y, center_y - radius)
        bottom = min(max_y, center_y + radius)
        for y in range(top, bottom + 1):
            for x in range(left, right + 1):
                dx = x - center_x
                dy = y - center_y
                if dx * dx + dy * dy > radius * radius:
                    continue
                red, green, blue, alpha = pixels[x, y]
                if alpha <= alpha_threshold or is_black_outline_pixel(red, green, blue):
                    continue
                distance_weight = max(1, radius - round(math.hypot(dx, dy)))
                votes[color_hex(red, green, blue)] += distance_weight
        if votes:
            return votes.most_common(1)[0][0]
    return None


def build_payload(frame_path: Path, public_frame_path: str, alpha_threshold: int, depth: float, max_rows: int, baseline_height: int | None) -> dict:
    image = Image.open(frame_path).convert("RGBA")
    width, height = image.size
    bounds = foreground_bounds(image, alpha_threshold)
    if not bounds:
        return {
            "format": "kore-hd-voxels-v1",
            "palette": [],
            "voxels": [],
            "source": {"frame": public_frame_path, "width": width, "height": height, "sampleStep": 1},
        }

    min_x, min_y, max_x, max_y = bounds
    bbox_width = max_x - min_x + 1
    bbox_height = max_y - min_y + 1
    target_rows = max(24, min(128, max_rows))
    sample_step = max(1, math.ceil(bbox_height / target_rows))
    rows = max(1, math.ceil(bbox_height / sample_step))
    columns = max(1, math.ceil(bbox_width / sample_step))
    aspect = bbox_width / bbox_height
    max_model_width = 2.65
    base_model_height = min(2.08, max_model_width / aspect)
    baseline = max(1, baseline_height or bbox_height)
    model_height_scale = min(2.35, max(1.0, bbox_height / baseline))
    model_height = base_model_height * model_height_scale
    model_width = model_height * aspect
    cell_width = model_width / columns
    cell_height = model_height / rows
    palette: list[str] = []
    indexes: dict[str, int] = {}
    voxels: list[dict] = []

    for row in range(rows):
        source_y1 = min_y + row * sample_step
        source_y2 = min(max_y + 1, source_y1 + sample_step)
        for column in range(columns):
            source_x1 = min_x + column * sample_step
            source_x2 = min(max_x + 1, source_x1 + sample_step)
            colors: list[tuple[int, int, int, int]] = []
            side_color_votes: Counter[str] = Counter()
            for sy in range(source_y1, source_y2):
                for sx in range(source_x1, source_x2):
                    r, g, b, a = image.getpixel((sx, sy))
                    if a > alpha_threshold:
                        colors.append((r, g, b, a))
                        if not is_black_outline_pixel(r, g, b):
                            side_color_votes[color_hex(r, g, b)] += 1
            if not colors:
                continue
            total_alpha = sum(c[3] for c in colors)
            red = round(sum(c[0] * c[3] for c in colors) / total_alpha)
            green = round(sum(c[1] * c[3] for c in colors) / total_alpha)
            blue = round(sum(c[2] * c[3] for c in colors) / total_alpha)
            color = f"#{red:02x}{green:02x}{blue:02x}"
            c = palette_index(color, palette, indexes)
            center_x = round((source_x1 + source_x2 - 1) / 2)
            center_y = round((source_y1 + source_y2 - 1) / 2)
            side_color = (
                side_color_votes.most_common(1)[0][0]
                if side_color_votes
                else nearest_side_bleed_color(image, bounds, center_x, center_y, alpha_threshold)
            ) or color
            s = palette_index(side_color, palette, indexes)
            foreground_ratio = min(1, len(colors) / max(1, (source_x2 - source_x1) * (source_y2 - source_y1)))
            x = ((column + 0.5) / columns) * model_width - model_width / 2
            y = model_height - (row + 0.5) * cell_height + 0.02
            brightness = (red + green + blue) / 3
            voxels.append({
                "part": classify_part(row / rows, (column + 0.5) / columns - 0.5),
                "x": round_voxel(x),
                "y": round_voxel(y),
                "z": 0.018 if brightness > 150 else -0.012,
                "w": round_voxel(cell_width * 0.98),
                "h": round_voxel(cell_height * 0.98),
                "d": round_voxel(depth * (0.78 + foreground_ratio * 0.22)),
                "c": c,
                "s": s,
            })

    return {
        "format": "kore-hd-voxels-v1",
        "palette": palette,
        "voxels": voxels,
        "source": {
            "frame": public_frame_path,
            "width": width,
            "height": height,
            "sampleStep": sample_step,
            "foregroundWidth": bbox_width,
            "foregroundHeight": bbox_height,
            "baselineForegroundHeight": baseline,
            "modelHeight": round_voxel(model_height),
            "modelHeightScale": round_voxel(model_height_scale),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--character", required=True)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int)
    parser.add_argument("--alpha-threshold", type=int, default=24)
    parser.add_argument("--depth", type=float, default=0.24)
    parser.add_argument("--max-rows", type=int, default=128)
    args = parser.parse_args()

    character_dir = args.repo / "public" / "characters" / args.character
    frames_json = json.loads((character_dir / "frames" / "frames.json").read_text())
    frame_meta = {int(frame["index"]): frame for frame in frames_json.get("frames", []) if "index" in frame}
    voxels_dir = character_dir / "voxels-hd"
    voxels_dir.mkdir(parents=True, exist_ok=True)
    end = args.end if args.end is not None else max(frame_meta)
    rebuilt = 0
    for index in range(args.start, end + 1):
        frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
        if not frame_path.exists():
            continue
        meta = frame_meta.get(index, {})
        box = meta.get("box") if isinstance(meta.get("box"), list) else None
        baseline_height = None
        if box and len(box) == 4:
            baseline_height = max(1, round(float(box[3]) - float(box[1])))
        public_frame_path = f"/characters/{args.character}/frames/frame-{index:03d}.png"
        payload = build_payload(frame_path, public_frame_path, args.alpha_threshold, args.depth, args.max_rows, baseline_height)
        (voxels_dir / f"frame-{index:03d}.json").write_text(json.dumps(payload, separators=(",", ":")) + "\n")
        rebuilt += 1
    print(f"rebuilt={rebuilt} range={args.start}-{end}")


if __name__ == "__main__":
    main()
