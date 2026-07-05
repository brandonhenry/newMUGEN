#!/usr/bin/env python3
"""Generate crouch-derived crouch block frames."""

from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


GENERATED_SOURCE = "Generated Crouch Composite"
ALPHA_THRESHOLD = 24
DEFAULT_CROUCH_BLOCK_FPS = 5
WORLD_PX_PER_UNIT = 23.804193890891682
CROUCH_BLOCK_WIDTH_SCALE = 0.96
CROUCH_INTENT_KEYS = {"crouch", "crouchBlock"}
GENERATED_FC_ROLES = {"cmd:FC+1", "cmd:FC+2"}


@dataclass
class CharacterGeneration:
    character_id: str
    display_name: str
    crouch_block: list[int] = field(default_factory=list)
    removed_fc1: list[int] = field(default_factory=list)
    removed_fc2: list[int] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def frame_index_from_path(path: str) -> int | None:
    stem = Path(path).stem
    if not stem.startswith("frame-"):
        return None
    try:
        return int(stem.split("-", 1)[1])
    except ValueError:
        return None


def frame_path(character_id: str, index: int) -> str:
    return f"/characters/{character_id}/frames/frame-{index:03d}.png"


def local_frame_path(repo: Path, public_path: str) -> Path:
    return repo / "public" / public_path.lstrip("/")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def alpha_bounds(image: Image.Image, alpha_threshold: int = ALPHA_THRESHOLD) -> tuple[int, int, int, int] | None:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    for y in range(height):
      for x in range(width):
        if pixels[x, y][3] > alpha_threshold:
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    if max_x < min_x or max_y < min_y:
        return None
    return min_x, min_y, max_x + 1, max_y + 1


def visible_crop(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    bounds = alpha_bounds(rgba)
    return rgba.crop(bounds) if bounds else rgba


def compose_crouch_block(crouch_image: Image.Image) -> Image.Image:
    crouch = crouch_image.convert("RGBA")
    output = Image.new("RGBA", crouch.size, (0, 0, 0, 0))
    width = max(1, round(crouch.width * CROUCH_BLOCK_WIDTH_SCALE))
    squeezed = crouch.resize((width, crouch.height), Image.Resampling.NEAREST)
    output.alpha_composite(squeezed, ((crouch.width - width) // 2, 0))
    return output


def generated_key(role: str, crouch_path: str) -> str:
    return f"{role}|crouch={crouch_path}|widthScale={CROUCH_BLOCK_WIDTH_SCALE:g}"


def generated_index_by_key(frames_json: dict[str, Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    for frame in frames_json.get("frames", []):
        if not isinstance(frame, dict):
            continue
        if frame.get("sourceName") != GENERATED_SOURCE:
            continue
        key = frame.get("generatedCompositeKey")
        index = frame.get("index")
        if isinstance(key, str) and isinstance(index, int):
            result[key] = index
    return result


def generated_index_by_role(frames_json: dict[str, Any], role: str) -> int | None:
    for frame in frames_json.get("frames", []):
        if not isinstance(frame, dict):
            continue
        if frame.get("sourceName") == GENERATED_SOURCE and frame.get("generatedCompositeRole") == role and isinstance(frame.get("index"), int):
            return int(frame["index"])
    return None


def next_frame_index(frames_json: dict[str, Any], manifest: dict[str, Any]) -> int:
    indices: list[int] = []
    for frame in frames_json.get("frames", []):
        if isinstance(frame, dict) and isinstance(frame.get("index"), int):
            indices.append(int(frame["index"]))
    for paths in (manifest.get("animationFrames") or {}).values():
        if isinstance(paths, list):
            indices.extend(index for path in paths if isinstance(path, str) for index in [frame_index_from_path(path)] if index is not None)
    return (max(indices) + 1) if indices else 0


def upsert_frame_meta(frames_json: dict[str, Any], frame_meta: dict[str, Any]) -> None:
    frames = frames_json.setdefault("frames", [])
    index = frame_meta["index"]
    for offset, frame in enumerate(frames):
        if isinstance(frame, dict) and frame.get("index") == index:
            frames[offset] = frame_meta
            break
    else:
        frames.append(frame_meta)
    frames.sort(key=lambda item: int(item.get("index", 0)) if isinstance(item, dict) else 0)
    frames_json["count"] = max(int(frames_json.get("count", 0) or 0), index + 1)


def make_frame_meta(character_id: str, index: int, role: str, key: str, output: Image.Image, crouch_path: str) -> dict[str, Any]:
    return {
        "index": index,
        "path": frame_path(character_id, index),
        "sourceMode": "replacement",
        "sourceName": GENERATED_SOURCE,
        "replacementName": f"{role}.png",
        "replacementWidth": output.width,
        "replacementHeight": output.height,
        "box": [0, 0, output.width, output.height],
        "width": output.width,
        "height": output.height,
        "row": -1,
        "generatedComposite": True,
        "generatedCompositeRole": role,
        "generatedCompositeKey": key,
        "generatedSources": {
            "crouch": crouch_path,
        },
        "generatedTransform": {
            "widthScale": CROUCH_BLOCK_WIDTH_SCALE,
        },
    }


def ensure_animation_rate(manifest: dict[str, Any], key: str, fallback_key: str | None, fallback: int) -> None:
    rates = manifest.setdefault("animationFrameRates", {})
    if key in rates:
        return
    if fallback_key and fallback_key in rates:
        rates[key] = rates[fallback_key]
    else:
        rates[key] = fallback


def write_crouch_block(
    repo: Path,
    character_id: str,
    frames_json: dict[str, Any],
    existing_generated: dict[str, int],
    next_index_ref: list[int],
    crouch_path: str,
    apply: bool,
) -> tuple[str, int]:
    role = "crouchBlock"
    key = generated_key(role, crouch_path)
    index = existing_generated.get(key)
    if index is None:
        index = generated_index_by_role(frames_json, role)
    if index is None:
        index = next_index_ref[0]
        next_index_ref[0] += 1
        existing_generated[key] = index
    output_public_path = frame_path(character_id, index)
    if apply:
        crouch_image = Image.open(local_frame_path(repo, crouch_path)).convert("RGBA")
        output = compose_crouch_block(crouch_image)
        output_path = local_frame_path(repo, output_public_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output.save(output_path)
        upsert_frame_meta(
            frames_json,
            make_frame_meta(character_id, index, role, key, output, crouch_path),
        )
    return output_public_path, index


def frame_count_from_manifest_and_meta(manifest: dict[str, Any], frames_json: dict[str, Any]) -> int:
    indices: list[int] = []
    for frame in frames_json.get("frames", []):
        if isinstance(frame, dict) and isinstance(frame.get("index"), int):
            indices.append(int(frame["index"]))
    for paths in (manifest.get("animationFrames") or {}).values():
        if isinstance(paths, list):
            indices.extend(index for path in paths if isinstance(path, str) for index in [frame_index_from_path(path)] if index is not None)
    return (max(indices) + 1) if indices else 0


def remove_generated_full_crouch_jabs(repo: Path, character_id: str, manifest: dict[str, Any], frames_json: dict[str, Any], apply: bool) -> dict[str, list[int]]:
    animation_frames = manifest.setdefault("animationFrames", {})
    animation_rates = manifest.get("animationFrameRates") if isinstance(manifest.get("animationFrameRates"), dict) else {}
    frame_scales = manifest.get("animationFrameScales") if isinstance(manifest.get("animationFrameScales"), dict) else {}
    generated_by_path = {
        frame.get("path"): frame
        for frame in frames_json.get("frames", [])
        if isinstance(frame, dict)
        and frame.get("sourceName") == GENERATED_SOURCE
        and frame.get("generatedCompositeRole") in GENERATED_FC_ROLES
        and isinstance(frame.get("path"), str)
    }
    removed: dict[str, list[int]] = {"cmd:FC+1": [], "cmd:FC+2": []}
    removed_paths: set[str] = set()
    for key in sorted(GENERATED_FC_ROLES):
        paths = animation_frames.get(key)
        if not isinstance(paths, list) or not paths:
            continue
        generated_paths = [path for path in paths if path in generated_by_path and generated_by_path[path].get("generatedCompositeRole") == key]
        if not generated_paths or len(generated_paths) != len(paths):
            continue
        animation_frames[key] = []
        animation_rates.pop(key, None)
        if isinstance(frame_scales.get(key), dict):
            frame_scales[key] = {}
        for path in generated_paths:
            index = frame_index_from_path(path)
            if index is None:
                continue
            removed[key].append(index)
            removed_paths.add(path)
            if apply:
                local_frame_path(repo, path).unlink(missing_ok=True)
                (repo / "public" / "characters" / character_id / "voxels-hd" / f"frame-{index:03d}.json").unlink(missing_ok=True)
                (repo / "public" / "characters" / character_id / "voxels" / f"frame-{index:03d}.json").unlink(missing_ok=True)
    if removed_paths:
        frames_json["frames"] = [
            frame
            for frame in frames_json.get("frames", [])
            if not (isinstance(frame, dict) and frame.get("path") in removed_paths)
        ]
        frames_json["count"] = frame_count_from_manifest_and_meta(manifest, frames_json)
    return removed


def synthesize_character(repo: Path, character_id: str, apply: bool = False) -> CharacterGeneration:
    character_dir = repo / "public" / "characters" / character_id
    manifest_path = character_dir / "character.json"
    frames_json_path = character_dir / "frames" / "frames.json"
    manifest = load_json(manifest_path)
    result = CharacterGeneration(character_id=character_id, display_name=manifest.get("displayName", character_id))
    if manifest.get("unplayable"):
        result.skipped.append("unplayable")
        return result
    if not frames_json_path.exists():
        result.skipped.append("missingFramesJson")
        result.skipped.append("crouchBlock")
        return result
    frames_json = load_json(frames_json_path)
    animation_frames = manifest.setdefault("animationFrames", {})
    generated = generated_index_by_key(frames_json)
    next_index_ref = [next_frame_index(frames_json, manifest)]
    crouch_frames = animation_frames.get("crouch") if isinstance(animation_frames.get("crouch"), list) else []
    crouch_path = crouch_frames[0] if crouch_frames else None
    removed = remove_generated_full_crouch_jabs(repo, character_id, manifest, frames_json, apply)
    result.removed_fc1.extend(removed["cmd:FC+1"])
    result.removed_fc2.extend(removed["cmd:FC+2"])

    if crouch_path:
        path, index = write_crouch_block(repo, character_id, frames_json, generated, next_index_ref, crouch_path, apply)
        animation_frames["crouchBlock"] = [path]
        ensure_animation_rate(manifest, "crouchBlock", "crouch", DEFAULT_CROUCH_BLOCK_FPS)
        result.crouch_block.append(index)
    else:
        result.skipped.append("crouchBlock")

    if apply:
        frames_json["count"] = frame_count_from_manifest_and_meta(manifest, frames_json)
        manifest["spriteFrameCount"] = frames_json["count"]
        write_json(frames_json_path, frames_json)
        write_json(manifest_path, manifest)
    return result


def character_ids(repo: Path, selected: list[str], include_unplayable: bool = False) -> list[str]:
    characters_dir = repo / "public" / "characters"
    ids = selected or sorted(path.name for path in characters_dir.iterdir() if (path / "character.json").exists())
    if include_unplayable:
        return ids
    playable: list[str] = []
    for character_id in ids:
        manifest_path = characters_dir / character_id / "character.json"
        if not manifest_path.exists():
            continue
        manifest = load_json(manifest_path)
        if not manifest.get("unplayable"):
            playable.append(character_id)
    return playable


def summarize(results: list[CharacterGeneration]) -> dict[str, Any]:
    return {
        "characters": len(results),
        "crouchBlockCharacters": sum(1 for result in results if result.crouch_block),
        "removedFc1Characters": sum(1 for result in results if result.removed_fc1),
        "removedFc2Characters": sum(1 for result in results if result.removed_fc2),
        "removedFc1Frames": sum(len(result.removed_fc1) for result in results),
        "removedFc2Frames": sum(len(result.removed_fc2) for result in results),
        "newVoxelRanges": [
            {
                "character": result.character_id,
                "start": min(result.crouch_block),
                "end": max(result.crouch_block),
                "crouchBlock": result.crouch_block,
            }
            for result in results
            if result.crouch_block
        ],
        "removedFc1": [
            {"character": result.character_id, "frames": result.removed_fc1}
            for result in results
            if result.removed_fc1
        ],
        "removedFc2": [
            {"character": result.character_id, "frames": result.removed_fc2}
            for result in results
            if result.removed_fc2
        ],
        "skippedCrouchBlock": [result.character_id for result in results if "crouchBlock" in result.skipped],
    }


def rebuild_voxels(repo: Path, summary: dict[str, Any]) -> None:
    for item in summary["newVoxelRanges"]:
        subprocess.run(
            [
                "python3",
                str(repo / "scripts" / "rebuild-character-hd-voxels.py"),
                "--repo",
                str(repo),
                "--character",
                item["character"],
                "--start",
                str(item["start"]),
                "--end",
                str(item["end"]),
            ],
            check=True,
        )


def first_existing_frame(manifest: dict[str, Any], keys: list[str]) -> str | None:
    frames = manifest.get("animationFrames") or {}
    for key in keys:
        paths = frames.get(key)
        if isinstance(paths, list) and paths:
            return paths[0]
    return None


def thumb(repo: Path, path: str | None, size: tuple[int, int] = (72, 72)) -> Image.Image:
    tile = Image.new("RGBA", size, (20, 22, 28, 255))
    if not path:
        return tile
    image_path = local_frame_path(repo, path)
    if not image_path.exists():
        return tile
    image = visible_crop(Image.open(image_path).convert("RGBA"))
    scale = min((size[0] - 8) / max(1, image.width), (size[1] - 8) / max(1, image.height), 4)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.NEAREST)
    tile.alpha_composite(resized, ((size[0] - resized.width) // 2, size[1] - resized.height - 4))
    return tile


def generate_proof_sheet(repo: Path, results: list[CharacterGeneration], output: Path) -> None:
    rows = [result for result in results if result.crouch_block]
    cell_w, cell_h = 96, 94
    label_w = 210
    header_h = 34
    columns = ["crouch", "crouchBlock", "block"]
    image = Image.new("RGB", (label_w + cell_w * len(columns), header_h + cell_h * len(rows)), (13, 15, 20))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((10, 10), "character", fill=(230, 235, 244), font=font)
    for index, label in enumerate(columns):
        draw.text((label_w + index * cell_w + 8, 10), label, fill=(230, 235, 244), font=font)
    for row_index, result in enumerate(rows):
        y = header_h + row_index * cell_h
        manifest = load_json(repo / "public" / "characters" / result.character_id / "character.json")
        paths = [
            first_existing_frame(manifest, ["crouch"]),
            first_existing_frame(manifest, ["crouchBlock"]),
            first_existing_frame(manifest, ["block"]),
        ]
        draw.rectangle((0, y, image.width, y + cell_h - 1), fill=(17, 20, 27) if row_index % 2 else (22, 25, 33))
        draw.text((10, y + 10), result.character_id[:32], fill=(225, 229, 237), font=font)
        for col_index, path in enumerate(paths):
            tile = thumb(repo, path)
            image.paste(tile.convert("RGB"), (label_w + col_index * cell_w + 12, y + 14))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def finite_number(value: Any, fallback: float) -> float:
    return float(value) if isinstance(value, (int, float)) else fallback


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def normalize_voxel_payload(payload: Any) -> list[dict[str, float]]:
    if isinstance(payload, dict) and isinstance(payload.get("voxels"), list):
        return [
            {
                "x": finite_number(voxel.get("x"), 0),
                "y": finite_number(voxel.get("y"), 0),
                "w": max(0.001, finite_number(voxel.get("w"), 0.001)),
                "h": max(0.001, finite_number(voxel.get("h"), 0.001)),
            }
            for voxel in payload["voxels"]
            if isinstance(voxel, dict)
        ]
    if isinstance(payload, list):
        voxels: list[dict[str, float]] = []
        for voxel in payload:
            if not isinstance(voxel, dict):
                continue
            position = voxel.get("position")
            size = voxel.get("size")
            if not isinstance(position, list) or not isinstance(size, list) or len(position) < 2 or len(size) < 2:
                continue
            voxels.append({
                "x": finite_number(position[0], 0),
                "y": finite_number(position[1], 0),
                "w": max(0.001, finite_number(size[0], 0.001)),
                "h": max(0.001, finite_number(size[1], 0.001)),
            })
        return voxels
    return []


def voxel_bounds(path: Path) -> tuple[float, float] | None:
    voxels = normalize_voxel_payload(load_json(path))
    if not voxels:
        return None
    min_x = min(voxel["x"] - voxel["w"] / 2 for voxel in voxels)
    max_x = max(voxel["x"] + voxel["w"] / 2 for voxel in voxels)
    min_y = min(voxel["y"] - voxel["h"] / 2 for voxel in voxels)
    max_y = max(voxel["y"] + voxel["h"] / 2 for voxel in voxels)
    return max_x - min_x, max_y - min_y


def character_global_scale(manifest: dict[str, Any]) -> tuple[float, float]:
    model_scale = manifest.get("modelScale") if isinstance(manifest.get("modelScale"), dict) else {}
    fallback = finite_number(manifest.get("scale"), 1)
    return finite_number(model_scale.get("width"), fallback), finite_number(model_scale.get("height"), fallback)


def apply_crouch_intent_scales(repo: Path, selected: list[str], include_unplayable: bool = False, apply: bool = False) -> dict[str, Any]:
    ids = character_ids(repo, selected, include_unplayable=include_unplayable)
    summary = {
        "characters": 0,
        "frameUsages": 0,
        "updated": 0,
        "missing": 0,
        "samples": [],
    }
    for character_id in ids:
        manifest_path = repo / "public" / "characters" / character_id / "character.json"
        manifest = load_json(manifest_path)
        summary["characters"] += 1
        global_width, global_height = character_global_scale(manifest)
        _ = global_width
        animation_frames = manifest.get("animationFrames") if isinstance(manifest.get("animationFrames"), dict) else {}
        frame_scales = manifest.setdefault("animationFrameScales", {})
        changed = False
        for animation_key in CROUCH_INTENT_KEYS:
            frames = animation_frames.get(animation_key)
            if not isinstance(frames, list) or not frames:
                continue
            animation_map = frame_scales.setdefault(animation_key, {})
            for source in frames:
                if not isinstance(source, str):
                    summary["missing"] += 1
                    continue
                frame_index = frame_index_from_path(source)
                if frame_index is None:
                    summary["missing"] += 1
                    continue
                png_path = local_frame_path(repo, source)
                voxel_path = repo / "public" / "characters" / character_id / "voxels-hd" / f"frame-{frame_index:03d}.json"
                if not png_path.exists() or not voxel_path.exists():
                    summary["missing"] += 1
                    continue
                bounds = voxel_bounds(voxel_path)
                if not bounds or bounds[1] <= 0:
                    summary["missing"] += 1
                    continue
                summary["frameUsages"] += 1
                image = Image.open(png_path).convert("RGBA")
                visible_bounds = alpha_bounds(image)
                intended_width = (visible_bounds[2] - visible_bounds[0]) if visible_bounds else image.width
                intended_height = image.height
                raw_width = intended_width / (bounds[0] * global_width * WORLD_PX_PER_UNIT)
                raw_height = intended_height / (bounds[1] * global_height * WORLD_PX_PER_UNIT)
                next_width = round(clamp(raw_width, 0.25, 5), 2)
                next_height = round(clamp(raw_height, 0.25, 5), 2)
                existing = animation_map.get(str(frame_index)) if isinstance(animation_map.get(str(frame_index)), dict) else {}
                next_scale = {
                    "width": next_width,
                    "height": next_height,
                    "offsetX": existing.get("offsetX", 0),
                }
                if existing.get("width") != next_width or existing.get("height") != next_height:
                    summary["updated"] += 1
                    if len(summary["samples"]) < 16:
                        summary["samples"].append({
                            "character": character_id,
                            "animation": animation_key,
                            "frame": frame_index,
                            "pngWidth": intended_width,
                            "pngHeight": intended_height,
                            "width": next_width,
                            "height": next_height,
                        })
                animation_map[str(frame_index)] = next_scale
                changed = True
        if apply and changed:
            write_json(manifest_path, manifest)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--character", action="append", default=[])
    parser.add_argument("--include-unplayable", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--summary-file", type=Path)
    parser.add_argument("--rebuild-voxels", action="store_true")
    parser.add_argument("--proof-sheet", type=Path)
    parser.add_argument("--fix-crouch-intent-scales", action="store_true")
    args = parser.parse_args()

    apply = args.apply and not args.dry_run
    ids = character_ids(args.repo, args.character, include_unplayable=args.include_unplayable)
    results = [synthesize_character(args.repo, character_id, apply=apply) for character_id in ids]
    summary = summarize(results)
    print(json.dumps(summary, indent=2))
    if args.summary_file:
        args.summary_file.parent.mkdir(parents=True, exist_ok=True)
        write_json(args.summary_file, summary)
    if args.rebuild_voxels:
        if not apply:
            raise SystemExit("--rebuild-voxels requires --apply")
        rebuild_voxels(args.repo, summary)
    if args.proof_sheet:
        if not apply:
            raise SystemExit("--proof-sheet requires --apply")
        generate_proof_sheet(args.repo, results, args.proof_sheet)
    if args.fix_crouch_intent_scales:
        fix_summary = apply_crouch_intent_scales(args.repo, args.character, include_unplayable=args.include_unplayable, apply=apply)
        print(json.dumps({"crouchIntentScales": fix_summary}, indent=2))


if __name__ == "__main__":
    main()
