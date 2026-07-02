#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image, ImageDraw


FRAME_RE = re.compile(r"frame-(\d+)\.png")
ANIMATION_KEYS = ["knockdown", "getupStand", "getupRollUp"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    repo = args.repo
    out = repo / "tmp" / "prone-scale-audit"
    out.mkdir(parents=True, exist_ok=True)
    candidates = collect_candidates(repo)
    render_sheet(repo, out / "tiny-prone-before-proposed.png", candidates)

    changed: list[dict[str, Any]] = []
    if args.apply:
        by_character: dict[str, list[dict[str, Any]]] = {}
        for candidate in candidates:
            by_character.setdefault(candidate["character"], []).append(candidate)
        for character, rows in by_character.items():
            manifest_path = repo / "public" / "characters" / character / "character.json"
            manifest = read_json(manifest_path)
            manifest.setdefault("animationFrameScales", {})
            for row in rows:
                key = row["animationKey"]
                frame = str(row["frame"])
                existing = (
                    manifest.get("animationFrameScales", {})
                    .get(key, {})
                    .get(frame)
                    or manifest.get("animationScales", {}).get(key)
                    or {"offsetX": 0}
                )
                manifest["animationFrameScales"].setdefault(key, {})
                manifest["animationFrameScales"][key][frame] = {
                    "width": row["nextScale"],
                    "height": row["nextScale"],
                    "offsetX": number(existing.get("offsetX"), 0),
                }
                changed.append(row)
            write_json(manifest_path, manifest)
        render_sheet(repo, out / "tiny-prone-after.png", collect_candidates(repo, include_changed=changed, after=True))

    write_csv(out / "tiny-prone-candidates.csv", candidates)
    write_csv(out / "tiny-prone-applied.csv", changed)
    write_report(out / "PRONE_SCALE_REPORT.md", candidates, changed)
    print(json.dumps({
        "apply": args.apply,
        "candidates": len(candidates),
        "characters": len({row["character"] for row in candidates}),
        "changed": len(changed),
    }, indent=2))


def collect_candidates(repo: Path, include_changed: list[dict[str, Any]] | None = None, after: bool = False) -> list[dict[str, Any]]:
    root = repo / "public" / "characters"
    if after and include_changed is not None:
        wanted = {(row["character"], row["animationKey"], row["frame"]) for row in include_changed}
    else:
        wanted = None
    rows: list[dict[str, Any]] = []
    for manifest_path in sorted(root.glob("*/character.json")):
        character = manifest_path.parent.name
        if character == "near":
            continue
        manifest = read_json(manifest_path)
        animation_frames = manifest.get("animationFrames") or {}
        idle_heights = []
        for source in animation_frames.get("idle", []) or []:
            bounds = voxel_bounds(root, character, frame_index(source))
            if bounds:
                idle_heights.append(bounds["height"])
        if not idle_heights:
            continue
        idle_height = median(idle_heights)
        for animation_key in ANIMATION_KEYS:
            for position, source in enumerate(animation_frames.get(animation_key, []) or []):
                index = frame_index(source)
                if index is None:
                    continue
                if wanted is not None and (character, animation_key, index) not in wanted:
                    continue
                bounds = voxel_bounds(root, character, index)
                if not bounds:
                    continue
                existing = (
                    manifest.get("animationFrameScales", {})
                    .get(animation_key, {})
                    .get(str(index))
                    or manifest.get("animationScales", {}).get(animation_key)
                    or {"width": 1, "height": 1, "offsetX": 0}
                )
                old_scale = min(number(existing.get("width"), 1), number(existing.get("height"), 1))
                raw_width = bounds["width"]
                raw_height = bounds["height"]
                aspect = raw_width / max(0.0001, raw_height)
                rendered_height_ratio = raw_height * old_scale / idle_height
                rendered_width_ratio = raw_width * old_scale / idle_height
                if wanted is None:
                    # These are semi-upright frames that were capped like prone frames.
                    if not (aspect < 1.4 and (rendered_height_ratio < 0.78 or rendered_width_ratio > 1.05)):
                        continue
                height_target = 0.84 * idle_height / raw_height
                width_cap = 1.04 * idle_height / raw_width
                target_scale = min(height_target, width_cap)
                next_scale = round(target_scale if rendered_width_ratio > 1.05 else max(old_scale, target_scale), 2)
                if wanted is None and abs(next_scale - old_scale) <= 0.005:
                    continue
                rows.append({
                    "character": character,
                    "displayName": manifest.get("displayName", character),
                    "animationKey": animation_key,
                    "position": position,
                    "frame": index,
                    "idleHeight": round(idle_height, 4),
                    "rawWidth": round(raw_width, 4),
                    "rawHeight": round(raw_height, 4),
                    "aspect": round(aspect, 3),
                    "oldScale": round(old_scale, 2),
                    "nextScale": next_scale,
                    "oldHeightRatio": round(rendered_height_ratio, 3),
                    "oldWidthRatio": round(rendered_width_ratio, 3),
                    "nextHeightRatio": round(raw_height * next_scale / idle_height, 3),
                    "nextWidthRatio": round(raw_width * next_scale / idle_height, 3),
                })
    return rows


def render_sheet(repo: Path, path: Path, rows: list[dict[str, Any]]) -> None:
    rows = rows[:80]
    cell_w, cell_h = 250, 130
    cols = 4
    sheet_rows = max(1, math.ceil(len(rows) / cols))
    sheet = Image.new("RGBA", (cols * cell_w, sheet_rows * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    for i, row in enumerate(rows):
        x = (i % cols) * cell_w
        y = (i // cols) * cell_h
        draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline=(180, 180, 180))
        draw.text((x + 5, y + 4), f"{row['displayName'][:24]} {row['animationKey']}", fill=(0, 0, 0))
        draw.text((x + 5, y + 18), f"f{row['frame']} {row['oldScale']} -> {row['nextScale']} h {row['oldHeightRatio']} -> {row['nextHeightRatio']}", fill=(0, 0, 0))
        src = repo / "public" / "characters" / row["character"] / "frames" / f"frame-{int(row['frame']):03d}.png"
        if not src.exists():
            continue
        image = Image.open(src).convert("RGBA")
        bbox = image.getchannel("A").getbbox() or (0, 0, image.width, image.height)
        crop = image.crop(bbox)
        for label, scale, dx in [("old", row["oldScale"], 62), ("new", row["nextScale"], 178)]:
            thumb_scale = min(1.0, 74 / max(1, crop.width), 74 / max(1, crop.height)) * (scale / max(row["nextScale"], row["oldScale"], 0.01))
            thumb = crop.resize((max(1, round(crop.width * thumb_scale)), max(1, round(crop.height * thumb_scale))), Image.Resampling.NEAREST)
            floor = y + 100
            sheet.alpha_composite(thumb, (x + dx - thumb.width // 2, floor - thumb.height))
            draw.line((x + dx - 42, floor, x + dx + 42, floor), fill=(210, 0, 0), width=1)
            draw.text((x + dx - 16, floor + 4), label, fill=(0, 0, 0))
    sheet.save(path)


def voxel_bounds(root: Path, character: str, index: int | None) -> dict[str, float] | None:
    if index is None:
        return None
    path = root / character / "voxels-hd" / f"frame-{index:03d}.json"
    if not path.exists():
        return None
    payload = read_json(path)
    voxels = payload.get("voxels") or []
    if not voxels:
        return None
    min_x = min(number(voxel.get("x"), 0) - number(voxel.get("w"), 0) / 2 for voxel in voxels)
    max_x = max(number(voxel.get("x"), 0) + number(voxel.get("w"), 0) / 2 for voxel in voxels)
    min_y = min(number(voxel.get("y"), 0) - number(voxel.get("h"), 0) / 2 for voxel in voxels)
    max_y = max(number(voxel.get("y"), 0) + number(voxel.get("h"), 0) / 2 for voxel in voxels)
    return {"width": max_x - min_x, "height": max_y - min_y}


def frame_index(source: str | None) -> int | None:
    match = FRAME_RE.search(str(source or ""))
    return int(match.group(1)) if match else None


def number(value: Any, fallback: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if math.isfinite(parsed) else fallback


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields: list[str] = []
    for row in rows:
        for key in row:
            if key not in fields:
                fields.append(key)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields or ["empty"])
        writer.writeheader()
        writer.writerows(rows)


def write_report(path: Path, candidates: list[dict[str, Any]], changed: list[dict[str, Any]]) -> None:
    lines = [
        "# KORE Prone Tiny Scale Audit",
        "",
        f"- Candidates: {len(candidates)}",
        f"- Applied: {len(changed)}",
        "",
        "| Character | Animation | Frame | Scale | Height Ratio | Width Ratio |",
        "| --- | --- | ---: | --- | --- | --- |",
    ]
    for row in (changed or candidates):
        lines.append(
            f"| {row['displayName']} (`{row['character']}`) | `{row['animationKey']}` | {row['frame']} | "
            f"{row['oldScale']} -> {row['nextScale']} | {row['oldHeightRatio']} -> {row['nextHeightRatio']} | "
            f"{row['oldWidthRatio']} -> {row['nextWidthRatio']} |"
        )
    path.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
