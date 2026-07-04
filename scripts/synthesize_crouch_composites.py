#!/usr/bin/env python3
"""Generate readable crouch block and full-crouch jab composite frames."""

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
DEFAULT_FC_FPS = 8


@dataclass
class CharacterGeneration:
    character_id: str
    display_name: str
    crouch_block: list[int] = field(default_factory=list)
    fc1: list[int] = field(default_factory=list)
    fc2: list[int] = field(default_factory=list)
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


def resize_to_height(image: Image.Image, height: int) -> Image.Image:
    if image.height == height:
        return image
    width = max(1, round(image.width * height / max(1, image.height)))
    return image.resize((width, height), Image.Resampling.NEAREST)


def centered_layer(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - image.width) // 2
    y = size[1] - image.height
    layer.alpha_composite(image, (x, y))
    return layer


def compose_hard_split(crouch_image: Image.Image, upper_image: Image.Image) -> Image.Image:
    crouch = visible_crop(crouch_image)
    upper = resize_to_height(visible_crop(upper_image), crouch.height)
    width = max(crouch.width, upper.width)
    height = crouch.height
    split_y = max(1, height // 2)
    crouch_layer = centered_layer(crouch, (width, height))
    upper_layer = centered_layer(upper, (width, height))
    output = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    output.alpha_composite(upper_layer.crop((0, 0, width, split_y)), (0, 0))
    output.alpha_composite(crouch_layer.crop((0, split_y, width, height)), (0, split_y))
    return output


def generated_key(role: str, crouch_path: str, upper_path: str) -> str:
    return f"{role}|crouch={crouch_path}|upper={upper_path}"


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


def make_frame_meta(character_id: str, index: int, role: str, key: str, output: Image.Image, crouch_path: str, upper_path: str) -> dict[str, Any]:
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
            "upper": upper_path,
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


def write_composite(
    repo: Path,
    character_id: str,
    frames_json: dict[str, Any],
    existing_generated: dict[str, int],
    next_index_ref: list[int],
    role: str,
    crouch_path: str,
    upper_path: str,
    apply: bool,
) -> tuple[str, int]:
    key = generated_key(role, crouch_path, upper_path)
    index = existing_generated.get(key)
    if index is None:
        index = next_index_ref[0]
        next_index_ref[0] += 1
        existing_generated[key] = index
    output_public_path = frame_path(character_id, index)
    if apply:
        crouch_image = Image.open(local_frame_path(repo, crouch_path)).convert("RGBA")
        upper_image = Image.open(local_frame_path(repo, upper_path)).convert("RGBA")
        output = compose_hard_split(crouch_image, upper_image)
        output_path = local_frame_path(repo, output_public_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output.save(output_path)
        upsert_frame_meta(
            frames_json,
            make_frame_meta(character_id, index, role, key, output, crouch_path, upper_path),
        )
    return output_public_path, index


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
        result.skipped.append("fullCrouchJab")
        return result
    frames_json = load_json(frames_json_path)
    animation_frames = manifest.setdefault("animationFrames", {})
    generated = generated_index_by_key(frames_json)
    next_index_ref = [next_frame_index(frames_json, manifest)]
    crouch_frames = animation_frames.get("crouch") if isinstance(animation_frames.get("crouch"), list) else []
    block_frames = animation_frames.get("block") if isinstance(animation_frames.get("block"), list) else []
    jableft_frames = animation_frames.get("jableft") if isinstance(animation_frames.get("jableft"), list) else []
    jabright_frames = animation_frames.get("jabright") if isinstance(animation_frames.get("jabright"), list) else []
    crouch_path = crouch_frames[0] if crouch_frames else None

    if crouch_path and block_frames:
        path, index = write_composite(repo, character_id, frames_json, generated, next_index_ref, "crouchBlock", crouch_path, block_frames[0], apply)
        animation_frames["crouchBlock"] = [path]
        ensure_animation_rate(manifest, "crouchBlock", "block", DEFAULT_CROUCH_BLOCK_FPS)
        result.crouch_block.append(index)
    else:
        result.skipped.append("crouchBlock")

    if crouch_path and jableft_frames:
        paths: list[str] = []
        for source_path in jableft_frames:
            path, index = write_composite(repo, character_id, frames_json, generated, next_index_ref, "cmd:FC+1", crouch_path, source_path, apply)
            paths.append(path)
            result.fc1.append(index)
        animation_frames["cmd:FC+1"] = paths
        ensure_animation_rate(manifest, "cmd:FC+1", "jableft", DEFAULT_FC_FPS)
    elif crouch_path and jabright_frames:
        paths = []
        for source_path in jabright_frames:
            path, index = write_composite(repo, character_id, frames_json, generated, next_index_ref, "cmd:FC+2", crouch_path, source_path, apply)
            paths.append(path)
            result.fc2.append(index)
        animation_frames["cmd:FC+2"] = paths
        ensure_animation_rate(manifest, "cmd:FC+2", "jabright", DEFAULT_FC_FPS)
    else:
        result.skipped.append("fullCrouchJab")

    if apply:
        manifest["spriteFrameCount"] = max(int(manifest.get("spriteFrameCount", 0) or 0), next_index_ref[0])
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
        "fc1Characters": sum(1 for result in results if result.fc1),
        "fc2FallbackCharacters": sum(1 for result in results if result.fc2),
        "newVoxelRanges": [
            {
                "character": result.character_id,
                "start": min(result.crouch_block + result.fc1 + result.fc2),
                "end": max(result.crouch_block + result.fc1 + result.fc2),
                "crouchBlock": result.crouch_block,
                "fc1": result.fc1,
                "fc2": result.fc2,
            }
            for result in results
            if result.crouch_block or result.fc1 or result.fc2
        ],
        "fc2Fallbacks": [result.character_id for result in results if result.fc2],
        "skippedFullCrouchJab": [result.character_id for result in results if "fullCrouchJab" in result.skipped],
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
    rows = [result for result in results if result.crouch_block or result.fc1 or result.fc2]
    cell_w, cell_h = 96, 94
    label_w = 210
    header_h = 34
    columns = ["crouch", "block", "crouchBlock", "jab source", "FC result"]
    image = Image.new("RGB", (label_w + cell_w * len(columns), header_h + cell_h * len(rows)), (13, 15, 20))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    draw.text((10, 10), "character", fill=(230, 235, 244), font=font)
    for index, label in enumerate(columns):
        draw.text((label_w + index * cell_w + 8, 10), label, fill=(230, 235, 244), font=font)
    for row_index, result in enumerate(rows):
        y = header_h + row_index * cell_h
        manifest = load_json(repo / "public" / "characters" / result.character_id / "character.json")
        frames = manifest.get("animationFrames") or {}
        use_fc2 = bool(result.fc2)
        paths = [
            first_existing_frame(manifest, ["crouch"]),
            first_existing_frame(manifest, ["block"]),
            first_existing_frame(manifest, ["crouchBlock"]),
            first_existing_frame(manifest, ["jabright" if use_fc2 else "jableft"]),
            first_existing_frame(manifest, ["cmd:FC+2" if use_fc2 else "cmd:FC+1"]),
        ]
        draw.rectangle((0, y, image.width, y + cell_h - 1), fill=(17, 20, 27) if row_index % 2 else (22, 25, 33))
        draw.text((10, y + 10), result.character_id[:32], fill=(225, 229, 237), font=font)
        if use_fc2:
            draw.text((10, y + 27), "fallback FC+2", fill=(164, 197, 255), font=font)
        for col_index, path in enumerate(paths):
            tile = thumb(repo, path)
            image.paste(tile.convert("RGB"), (label_w + col_index * cell_w + 12, y + 14))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


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


if __name__ == "__main__":
    main()
