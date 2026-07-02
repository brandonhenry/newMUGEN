#!/usr/bin/env python3
"""Rebuild precomputed HD voxel JSON from transparent character frame PNGs."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from collections import Counter

from PIL import Image


BODY_ZONES = {
    "chest": (0.25, 0.42),
    "waist": (0.43, 0.56),
    "hip": (0.55, 0.68),
    "ankle": (0.78, 0.92),
}
BODY_ZONE_ORDER = ["chest", "waist", "hip", "ankle"]


def round_voxel(value: float) -> float:
    return round(value, 5)


def median(values: list[float]) -> float | None:
    finite = sorted(value for value in values if math.isfinite(value))
    if not finite:
        return None
    middle = len(finite) // 2
    if len(finite) % 2 == 1:
        return finite[middle]
    return (finite[middle - 1] + finite[middle]) / 2


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


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


def row_spans(image: Image.Image, bounds: tuple[int, int, int, int], y: int, alpha_threshold: int) -> list[dict[str, float]]:
    min_x, _, max_x, _ = bounds
    pixels = image.load()
    spans: list[dict[str, float]] = []
    start = -1
    for x in range(min_x, max_x + 1):
        foreground = pixels[x, y][3] > alpha_threshold
        if foreground and start < 0:
            start = x
        if (not foreground or x == max_x) and start >= 0:
            end = x if foreground and x == max_x else x - 1
            width = end - start + 1
            spans.append({
                "minX": start,
                "maxX": end,
                "width": width,
                "centerX": (start + end) / 2,
            })
            start = -1
    return spans


def distance_to_span(span: dict[str, float], x: float) -> float:
    if span["minX"] <= x <= span["maxX"]:
        return 0
    return min(abs(x - span["minX"]), abs(x - span["maxX"]))


def choose_body_span(spans: list[dict[str, float]], center_x: float) -> dict[str, float] | None:
    if not spans:
        return None
    return sorted(spans, key=lambda span: (distance_to_span(span, center_x), -span["width"]))[0]


def estimate_body_center_x(image: Image.Image, bounds: tuple[int, int, int, int], alpha_threshold: int) -> float:
    min_x, min_y, max_x, max_y = bounds
    height = max_y - min_y + 1
    fallback = (min_x + max_x) / 2
    samples: list[float] = []
    start_y = round(min_y + height * 0.35)
    end_y = round(min_y + height * 0.88)
    for y in range(start_y, end_y + 1):
        span = choose_body_span(row_spans(image, bounds, y, alpha_threshold), fallback)
        if span:
            samples.append(span["centerX"])
    return median(samples) or fallback


def measure_body_metrics(image: Image.Image, bounds: tuple[int, int, int, int], alpha_threshold: int) -> dict | None:
    min_x, min_y, max_x, max_y = bounds
    height = max_y - min_y + 1
    center_x = estimate_body_center_x(image, bounds, alpha_threshold)
    zones: dict[str, dict[str, float | int]] = {}
    for zone, (start_ratio, end_ratio) in BODY_ZONES.items():
        start_y = max(min_y, round(min_y + height * start_ratio))
        end_y = min(max_y, round(min_y + height * end_ratio))
        widths: list[float] = []
        for y in range(start_y, end_y + 1):
            span = choose_body_span(row_spans(image, bounds, y, alpha_threshold), center_x)
            if span:
                widths.append(span["width"])
        width = median(widths)
        if width is not None:
            zones[zone] = {"width": round_voxel(width), "rows": len(widths)}
    if not zones:
        return None
    return {
        "bounds": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
        "centerX": round_voxel(center_x),
        "height": height,
        "zones": zones,
    }


def compute_body_normalization(reference: dict | None, current: dict | None, enabled: bool, min_scale: float, max_scale: float) -> tuple[float, dict[str, float]]:
    if not enabled or not reference or not current:
        return 1, {}
    ratios: dict[str, float] = {}
    usable: list[float] = []
    for zone in BODY_ZONE_ORDER:
        ref_width = reference.get("zones", {}).get(zone, {}).get("width")
        cur_width = current.get("zones", {}).get(zone, {}).get("width")
        if not isinstance(ref_width, (int, float)) or not isinstance(cur_width, (int, float)) or cur_width <= 0:
            continue
        ratio = ref_width / cur_width
        if not math.isfinite(ratio) or ratio <= 0:
            continue
        ratios[zone] = round_voxel(ratio)
        usable.append(ratio)
    scale = median(usable) or 1
    return round_voxel(clamp(scale, min_scale, max_scale)), ratios


def apply_body_scale(voxels: list[dict], scale: float, anchor_x: float = 0, anchor_y: float = 0.02) -> list[dict]:
    if not math.isfinite(scale) or abs(scale - 1) < 0.00001:
        return voxels
    scaled: list[dict] = []
    for voxel in voxels:
        next_voxel = dict(voxel)
        next_voxel["x"] = round_voxel(anchor_x + (float(voxel["x"]) - anchor_x) * scale)
        next_voxel["y"] = round_voxel(anchor_y + (float(voxel["y"]) - anchor_y) * scale)
        next_voxel["w"] = round_voxel(float(voxel["w"]) * scale)
        next_voxel["h"] = round_voxel(float(voxel["h"]) * scale)
        next_voxel["d"] = round_voxel(float(voxel["d"]) * scale)
        scaled.append(next_voxel)
    return scaled


def payload_bounds(payload: dict) -> tuple[float, float, float, float] | None:
    voxels = payload.get("voxels", [])
    if not voxels:
        return None
    return (
        min(float(voxel["x"]) - float(voxel["w"]) / 2 for voxel in voxels),
        min(float(voxel["y"]) - float(voxel["h"]) / 2 for voxel in voxels),
        max(float(voxel["x"]) + float(voxel["w"]) / 2 for voxel in voxels),
        max(float(voxel["y"]) + float(voxel["h"]) / 2 for voxel in voxels),
    )


def frame_index_from_path(path: str) -> int | None:
    stem = Path(path.split("?")[0]).stem
    if not stem.startswith("frame-"):
        return None
    try:
        return int(stem.split("-")[-1])
    except ValueError:
        return None


def scale_payload_to_idle_reference(payload: dict, scale_x: float, scale_y: float, anchor_y: float) -> dict:
    for voxel in payload.get("voxels", []):
        voxel["x"] = round_voxel(float(voxel["x"]) * scale_x)
        voxel["y"] = round_voxel(anchor_y + (float(voxel["y"]) - anchor_y) * scale_y)
        voxel["z"] = round_voxel(float(voxel.get("z", 0)) * scale_x)
        voxel["w"] = round_voxel(float(voxel["w"]) * scale_x)
        voxel["h"] = round_voxel(float(voxel["h"]) * scale_y)
        voxel["d"] = round_voxel(float(voxel["d"]) * scale_x)
    return payload


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


def build_payload(frame_path: Path, public_frame_path: str, alpha_threshold: int, depth: float, max_rows: int, baseline_height: int | None) -> tuple[dict, dict | None]:
    image = Image.open(frame_path).convert("RGBA")
    width, height = image.size
    bounds = foreground_bounds(image, alpha_threshold)
    if not bounds:
        return {
            "format": "kore-hd-voxels-v1",
            "palette": [],
            "voxels": [],
            "source": {"frame": public_frame_path, "width": width, "height": height, "sampleStep": 1},
        }, None

    min_x, min_y, max_x, max_y = bounds
    metrics = measure_body_metrics(image, bounds, alpha_threshold)
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
    }, metrics


def normalize_payloads(
    frames: list[dict],
    enabled: bool,
    reference_frame: int,
    min_scale: float,
    max_scale: float,
) -> list[dict]:
    reference = next((frame for frame in frames if frame["frameIndex"] == reference_frame and frame.get("metrics")), None)
    if reference is None:
        reference = next((frame for frame in frames if frame.get("metrics")), None)
    resolved_reference_frame = int(reference["frameIndex"]) if reference else reference_frame
    reference_metrics = reference.get("metrics") if reference else None
    normalized: list[dict] = []
    for frame in frames:
        payload = frame["payload"]
        scale, ratios = compute_body_normalization(reference_metrics, frame.get("metrics"), enabled, min_scale, max_scale)
        payload["voxels"] = apply_body_scale(payload.get("voxels", []), scale)
        source = payload.setdefault("source", {})
        if isinstance(source.get("modelHeight"), (int, float)):
            source["modelHeight"] = round_voxel(float(source["modelHeight"]) * scale)
        if isinstance(source.get("modelHeightScale"), (int, float)):
            source["modelHeightScale"] = round_voxel(float(source["modelHeightScale"]) * scale)
        normalization = {
            "enabled": bool(enabled and reference_metrics and frame.get("metrics")),
            "referenceFrame": resolved_reference_frame,
            "scale": scale,
            "ratios": ratios,
        }
        if frame.get("metrics"):
            normalization["metrics"] = frame["metrics"]
        source["normalization"] = normalization
        normalized.append(frame)
    return normalized


def idle_reference(character_manifest: dict, frames: list[dict]) -> dict | None:
    by_index = {int(frame["frameIndex"]): frame["payload"] for frame in frames}
    animation_frames = character_manifest.get("animationFrames", {})
    if not isinstance(animation_frames, dict):
        animation_frames = {}
    for animation in ["idle", "walkForward", "walkBack", "sidestepLeft", "sidestepRight", "block"]:
        indices = [
            frame_index_from_path(path)
            for path in animation_frames.get(animation, [])
            if isinstance(path, str)
        ]
        indices = [index for index in indices if index is not None and index in by_index]
        bounds = [payload_bounds(by_index[index]) for index in indices]
        bounds = [bound for bound in bounds if bound is not None]
        if bounds:
            return {
                "animation": animation,
                "frames": indices,
                "targetWidth": median([bound[2] - bound[0] for bound in bounds]) or bounds[0][2] - bounds[0][0],
                "targetHeight": median([bound[3] - bound[1] for bound in bounds]) or bounds[0][3] - bounds[0][1],
            }
    if not frames:
        return None
    first = sorted(frames, key=lambda frame: int(frame["frameIndex"]))[0]
    bound = payload_bounds(first["payload"])
    if not bound:
        return None
    return {
        "animation": "firstFrame",
        "frames": [int(first["frameIndex"])],
        "targetWidth": bound[2] - bound[0],
        "targetHeight": bound[3] - bound[1],
    }


def normalize_payloads_to_idle_visual(character_manifest: dict, frames: list[dict], min_scale: float = 0.2, max_scale: float = 6.0) -> list[dict]:
    reference = idle_reference(character_manifest, frames)
    if not reference:
        return frames
    for frame in frames:
        payload = frame["payload"]
        bound = payload_bounds(payload)
        if not bound:
            continue
        width = bound[2] - bound[0]
        height = bound[3] - bound[1]
        raw_scale_x = float(reference["targetWidth"]) / width if width > 0 else 1
        raw_scale_y = float(reference["targetHeight"]) / height if height > 0 else 1
        scale_x = clamp(raw_scale_x, min_scale, max_scale)
        scale_y = clamp(raw_scale_y, min_scale, max_scale)
        scale_payload_to_idle_reference(payload, scale_x, scale_y, bound[1])
        next_bound = payload_bounds(payload)
        source = payload.setdefault("source", {})
        if next_bound:
            source["idleVisualWidth"] = round_voxel(next_bound[2] - next_bound[0])
            source["idleVisualHeight"] = round_voxel(next_bound[3] - next_bound[1])
        source["idleVisualNormalization"] = {
            "enabled": True,
            "referenceAnimation": reference["animation"],
            "referenceFrames": reference["frames"],
            "targetWidth": round_voxel(float(reference["targetWidth"])),
            "targetHeight": round_voxel(float(reference["targetHeight"])),
            "scaleX": round_voxel(scale_x),
            "scaleY": round_voxel(scale_y),
            "rawScaleX": round_voxel(raw_scale_x),
            "rawScaleY": round_voxel(raw_scale_y),
            "minScale": min_scale,
            "maxScale": max_scale,
        }
    return frames


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--character", required=True)
    parser.add_argument("--start", type=int, default=0)
    parser.add_argument("--end", type=int)
    parser.add_argument("--alpha-threshold", type=int, default=24)
    parser.add_argument("--depth", type=float, default=0.24)
    parser.add_argument("--max-rows", type=int, default=128)
    parser.add_argument("--no-normalize-body", action="store_true", help="Disable body-width normalization while rebuilding HD voxels.")
    parser.add_argument("--normalization-reference-frame", type=int, help="Override the reference frame used by body-width normalization.")
    parser.add_argument("--normalization-min-scale", type=float, help="Minimum body normalization scale.")
    parser.add_argument("--normalization-max-scale", type=float, help="Maximum body normalization scale.")
    args = parser.parse_args()

    character_dir = args.repo / "public" / "characters" / args.character
    frames_json = json.loads((character_dir / "frames" / "frames.json").read_text())
    frame_meta = {int(frame["index"]): frame for frame in frames_json.get("frames", []) if "index" in frame}
    character_manifest = {}
    manifest_path = character_dir / "character.json"
    if manifest_path.exists():
        character_manifest = json.loads(manifest_path.read_text())
    manifest_fidelity = character_manifest.get("voxelFidelity", {})
    if not isinstance(manifest_fidelity, dict):
        manifest_fidelity = {}
    manifest_normalization = manifest_fidelity.get("normalization", {})
    if not isinstance(manifest_normalization, dict):
        manifest_normalization = {}
    normalization_enabled = not args.no_normalize_body and manifest_normalization.get("enabled", True) is not False
    reference_frame = (
        args.normalization_reference_frame
        if args.normalization_reference_frame is not None
        else int(manifest_normalization.get("referenceFrame", 0) or 0)
    )
    min_scale = clamp(
        args.normalization_min_scale
        if args.normalization_min_scale is not None
        else float(manifest_normalization.get("minScale", 0.75) or 0.75),
        0.25,
        1,
    )
    max_scale = clamp(
        args.normalization_max_scale
        if args.normalization_max_scale is not None
        else float(manifest_normalization.get("maxScale", 1.35) or 1.35),
        1,
        2.5,
    )
    voxels_dir = character_dir / "voxels-hd"
    voxels_dir.mkdir(parents=True, exist_ok=True)
    end = args.end if args.end is not None else max(frame_meta)
    frames: list[dict] = []
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
        payload, metrics = build_payload(frame_path, public_frame_path, args.alpha_threshold, args.depth, args.max_rows, baseline_height)
        frames.append({"frameIndex": index, "payload": payload, "metrics": metrics})
    normalized_frames = normalize_payloads(frames, normalization_enabled, reference_frame, min_scale, max_scale)
    normalized_frames = normalize_payloads_to_idle_visual(character_manifest, normalized_frames)
    for frame in normalized_frames:
        index = int(frame["frameIndex"])
        (voxels_dir / f"frame-{index:03d}.json").write_text(json.dumps(frame["payload"], separators=(",", ":")) + "\n")
    print(f"rebuilt={len(normalized_frames)} range={args.start}-{end} normalizeBody={normalization_enabled} referenceFrame={reference_frame}")


if __name__ == "__main__":
    main()
