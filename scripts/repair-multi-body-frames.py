#!/usr/bin/env python3
"""Split contact-sheet character frames into clean per-character frames.

This repairs imported frames that accidentally contain many poses in one PNG.
For a split frame, the original frame index is replaced with the first clean
crop, remaining crops are appended as new frame indices, and every animation
sequence that referenced the composite frame is expanded to reference the new
clean sequence. UI/text-only frames can be quarantined out of animation rows.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
from collections import deque
from pathlib import Path
from statistics import median
from typing import Any

from PIL import Image, ImageDraw


FRAME_RE = re.compile(r"frame-(\d+)\.png$")


def public_frame_path(character_id: str, index: int) -> str:
    return f"/characters/{character_id}/frames/frame-{index:03d}.png"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


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
                components.append(
                    {
                        "box": [min_x, min_y, max_x + 1, max_y + 1],
                        "pixels": pixels,
                        "width": max_x - min_x + 1,
                        "height": max_y - min_y + 1,
                    }
                )
    return components


def crop_component(image: Image.Image, box: list[int], padding: int) -> Image.Image:
    x1, y1, x2, y2 = box
    crop_box = (
        max(0, x1 - padding),
        max(0, y1 - padding),
        min(image.size[0], x2 + padding),
        min(image.size[1], y2 + padding),
    )
    cropped = image.crop(crop_box).convert("RGBA")
    cropped = remove_border_matte(cropped)
    alpha_box = cropped.getchannel("A").getbbox()
    if alpha_box:
        return cropped.crop(alpha_box)
    return cropped


def color_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> int:
    return max(abs(left[index] - right[index]) for index in range(3))


def remove_border_matte(image: Image.Image, alpha_threshold: int = 24, tolerance: int = 10) -> Image.Image:
    """Clear opaque matte colors connected to the crop border.

    Many source sheets use solid red/teal/gray cells. The split crop must keep
    only the character pixels, so remove matte-colored pixels by flood filling
    from the border instead of globally deleting colors that may appear inside
    the sprite.
    """
    working = image.convert("RGBA")
    width, height = working.size
    pixels = working.load()
    border_colors: dict[tuple[int, int, int], int] = {}
    for x in range(width):
        for y in (0, height - 1):
            r, g, b, a = pixels[x, y]
            if a > alpha_threshold:
                border_colors[(r, g, b)] = border_colors.get((r, g, b), 0) + 1
    for y in range(height):
        for x in (0, width - 1):
            r, g, b, a = pixels[x, y]
            if a > alpha_threshold:
                border_colors[(r, g, b)] = border_colors.get((r, g, b), 0) + 1
    if not border_colors:
        return working

    minimum_count = max(4, int((width + height) * 0.04))
    matte_colors = [
        color
        for color, count in sorted(border_colors.items(), key=lambda item: item[1], reverse=True)[:6]
        if count >= minimum_count
    ]
    if not matte_colors:
        return working

    def is_matte(x: int, y: int) -> bool:
        r, g, b, a = pixels[x, y]
        if a <= alpha_threshold:
            return True
        return any(color_distance((r, g, b), matte) <= tolerance for matte in matte_colors)

    queue: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()
    for x in range(width):
        for y in (0, height - 1):
            if is_matte(x, y):
                queue.append((x, y))
                seen.add((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if (x, y) not in seen and is_matte(x, y):
                queue.append((x, y))
                seen.add((x, y))
    while queue:
        x, y = queue.popleft()
        r, g, b, _ = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in seen:
                continue
            if is_matte(nx, ny):
                seen.add((nx, ny))
                queue.append((nx, ny))

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (r, g, b, 255 if a > alpha_threshold else 0)
    return working


def split_frame(
    frame_path: Path,
    alpha_threshold: int,
    min_pixels: int,
    min_width: int,
    min_height: int,
    padding: int,
    exclude_components: set[int],
) -> tuple[list[Image.Image], list[dict[str, Any]]]:
    image = Image.open(frame_path).convert("RGBA")
    components = [
        component
        for component in connected_components(image, alpha_threshold, min_pixels)
        if component["width"] >= min_width and component["height"] >= min_height
    ]
    if components:
        median_pixels = median(component["pixels"] for component in components)
        minimum_body_pixels = max(min_pixels, int(median_pixels * 0.25))
        components = [component for component in components if component["pixels"] >= minimum_body_pixels]
    components.sort(key=lambda component: (component["box"][1], component["box"][0]))
    selected: list[Image.Image] = []
    selected_meta: list[dict[str, Any]] = []
    for component_index, component in enumerate(components):
        if component_index in exclude_components:
            continue
        crop = crop_component(image, component["box"], padding)
        if not crop.getchannel("A").getbbox():
            continue
        selected.append(crop)
        selected_meta.append({**component, "componentIndex": component_index})
    return selected, selected_meta


def make_face_card(frame: Image.Image) -> Image.Image:
    card = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    working = frame.convert("RGBA")
    width, height = working.size
    scale = min(210 / max(1, width), 220 / max(1, height), 4)
    scaled = working.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.NEAREST)
    x = (256 - scaled.size[0]) // 2
    y = 256 - scaled.size[1] - 18
    card.alpha_composite(scaled, (x, max(8, y)))
    return card


def regenerate_animation_sheet(character_dir: Path, character_id: str, frames_json: dict[str, Any]) -> None:
    frames = sorted(frames_json.get("frames", []), key=lambda frame: int(frame["index"]))
    frame_images: list[tuple[dict[str, Any], Image.Image]] = []
    for frame in frames:
        index = int(frame["index"])
        path = character_dir / "frames" / f"frame-{index:03d}.png"
        if path.exists():
            frame_images.append((frame, Image.open(path).convert("RGBA")))
    if not frame_images:
        return
    max_width = max(image.size[0] for _, image in frame_images)
    max_height = max(image.size[1] for _, image in frame_images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(frame_images)))))
    cell_width = max_width + padding * 2
    cell_height = max_height + padding * 2
    rows = math.ceil(len(frame_images) / columns)
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), (0, 0, 0, 0))
    for position, (frame, image) in enumerate(frame_images):
        col = position % columns
        row = position // columns
        x = col * cell_width + padding + (max_width - image.size[0]) // 2
        y = row * cell_height + padding + (max_height - image.size[1])
        sheet.alpha_composite(image, (x, y))
        frame["path"] = public_frame_path(character_id, int(frame["index"]))
        frame["sheetId"] = "generated"
        frame["sheetPath"] = f"/characters/{character_id}/animation-sheet.png"
        frame["box"] = [x, y, x + image.size[0], y + image.size[1]]
        frame["width"] = image.size[0]
        frame["height"] = image.size[1]
    sheet.save(character_dir / "animation-sheet.png")
    frames_json["sheets"] = [
        {
            "id": "generated",
            "name": "Generated Frame Atlas",
            "path": f"/characters/{character_id}/animation-sheet.png",
            "frameStart": 0,
            "frameCount": len(frame_images),
        }
    ]


def update_manifest_counts(character_dir: Path, character_id: str, frame_count: int) -> dict[str, Any]:
    manifest_path = character_dir / "character.json"
    manifest = read_json(manifest_path)
    manifest["spriteFrameCount"] = frame_count
    manifest["spriteSheetPath"] = f"/characters/{character_id}/animation-sheet.png"
    if isinstance(manifest.get("spriteSheets"), list):
        for sheet in manifest["spriteSheets"]:
            if isinstance(sheet, dict):
                sheet["path"] = f"/characters/{character_id}/animation-sheet.png"
                if "frameCount" in sheet:
                    sheet["frameCount"] = frame_count
    write_json(manifest_path, manifest)
    return manifest


def replace_animation_paths(manifest: dict[str, Any], replacements: dict[str, list[str]], removals: set[str]) -> dict[str, Any]:
    changes: dict[str, Any] = {}
    animation_frames = manifest.get("animationFrames")
    if not isinstance(animation_frames, dict):
        return changes
    for key, paths in animation_frames.items():
        if not isinstance(paths, list):
            continue
        next_paths: list[str] = []
        changed = False
        for path in paths:
            if path in removals:
                changed = True
                continue
            replacement = replacements.get(path)
            if replacement:
                next_paths.extend(replacement)
                changed = True
            else:
                next_paths.append(path)
        if changed:
            animation_frames[key] = next_paths
            changes[key] = {"before": paths, "after": next_paths}
    return changes


def make_proof_sheet(
    before_images: list[tuple[str, Image.Image]],
    after_images: list[tuple[str, Image.Image]],
    output_path: Path,
) -> None:
    def card(label: str, image: Image.Image) -> Image.Image:
        bg = Image.new("RGBA", image.size, (48, 48, 48, 255))
        bg.alpha_composite(image.convert("RGBA"))
        scale = min(180 / max(1, bg.size[0]), 160 / max(1, bg.size[1]), 4)
        scaled = bg.resize((max(1, int(bg.size[0] * scale)), max(1, int(bg.size[1] * scale))), Image.Resampling.NEAREST)
        result = Image.new("RGBA", (210, 210), (20, 20, 20, 255))
        result.alpha_composite(scaled, ((210 - scaled.size[0]) // 2, 34))
        ImageDraw.Draw(result).text((6, 7), label[:30], fill=(255, 255, 255, 255))
        return result

    cards = [card(label, image) for label, image in before_images] + [card(label, image) for label, image in after_images]
    if not cards:
        return
    columns = 4
    rows = math.ceil(len(cards) / columns)
    sheet = Image.new("RGBA", (columns * 210, rows * 210), (5, 5, 5, 255))
    for index, item in enumerate(cards):
        sheet.alpha_composite(item, ((index % columns) * 210, (index // columns) * 210))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)


def parse_frame_set(value: str | None) -> set[int]:
    if not value:
        return set()
    result: set[int] = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        result.add(int(part))
    return result


def parse_exclusions(values: list[str]) -> dict[int, set[int]]:
    exclusions: dict[int, set[int]] = {}
    for value in values:
        frame_text, component_text = value.split(":", 1)
        exclusions.setdefault(int(frame_text), set()).add(int(component_text))
    return exclusions


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--character", required=True)
    parser.add_argument("--split-frames", default="", help="Comma-separated frame indexes to split.")
    parser.add_argument("--remove-animation-frames", help="Comma-separated UI/text-only frame indexes to remove from animation rows.")
    parser.add_argument("--exclude-component", action="append", default=[], help="frame:componentIndex to omit from split output.")
    parser.add_argument("--alpha-threshold", type=int, default=24)
    parser.add_argument("--min-pixels", type=int, default=45)
    parser.add_argument("--min-width", type=int, default=8)
    parser.add_argument("--min-height", type=int, default=16)
    parser.add_argument("--padding", type=int, default=1)
    parser.add_argument("--report", type=Path, default=Path("tmp/non-character-frame-review/multi-body-repair-report.json"))
    parser.add_argument("--proof", type=Path, default=Path("tmp/non-character-frame-review/multi-body-repair-proof.png"))
    args = parser.parse_args()

    character_id = args.character
    character_dir = args.repo / "public" / "characters" / character_id
    frames_dir = character_dir / "frames"
    frames_json_path = frames_dir / "frames.json"
    manifest_path = character_dir / "character.json"
    frames_json = read_json(frames_json_path)
    manifest = read_json(manifest_path)
    frames = frames_json.setdefault("frames", [])
    frames_by_index = {int(frame["index"]): frame for frame in frames if "index" in frame}
    next_index = max(frames_by_index.keys(), default=-1) + 1
    split_frames = sorted(parse_frame_set(args.split_frames))
    remove_frames = sorted(parse_frame_set(args.remove_animation_frames))
    exclusions = parse_exclusions(args.exclude_component)

    report: dict[str, Any] = {"characterId": character_id, "splits": [], "removedAnimationFrames": remove_frames, "animationChanges": {}}
    replacements: dict[str, list[str]] = {}
    removals = {public_frame_path(character_id, index) for index in remove_frames}
    before_images: list[tuple[str, Image.Image]] = []
    after_images: list[tuple[str, Image.Image]] = []

    backup_dir = args.report.parent / "quarantine" / character_id
    backup_dir.mkdir(parents=True, exist_ok=True)

    for frame_index in split_frames:
        frame_file = frames_dir / f"frame-{frame_index:03d}.png"
        if not frame_file.exists():
            raise FileNotFoundError(frame_file)
        before_images.append((f"before {frame_index}", Image.open(frame_file).convert("RGBA")))
        crops, component_meta = split_frame(
            frame_file,
            args.alpha_threshold,
            args.min_pixels,
            args.min_width,
            args.min_height,
            args.padding,
            exclusions.get(frame_index, set()),
        )
        if len(crops) < 2:
            raise RuntimeError(f"Frame {frame_index} did not split into enough character crops.")

        original_meta = frames_by_index.get(frame_index, {"index": frame_index, "path": public_frame_path(character_id, frame_index)})
        new_paths: list[str] = []
        for crop_number, crop in enumerate(crops):
            output_index = frame_index if crop_number == 0 else next_index
            if crop_number > 0:
                next_index += 1
            output_path = frames_dir / f"frame-{output_index:03d}.png"
            crop.save(output_path)
            path = public_frame_path(character_id, output_index)
            new_paths.append(path)
            after_images.append((f"after {output_index}", crop))
            meta = {
                **original_meta,
                "index": output_index,
                "path": path,
                "width": crop.size[0],
                "height": crop.size[1],
                "sourceRepair": {
                    "type": "split-contact-frame",
                    "originalFrame": frame_index,
                    "componentIndex": component_meta[crop_number]["componentIndex"],
                    "componentBox": component_meta[crop_number]["box"],
                },
            }
            if crop_number == 0:
                frames_by_index[frame_index] = meta
            else:
                frames.append(meta)
                frames_by_index[output_index] = meta

        replacements[public_frame_path(character_id, frame_index)] = new_paths
        report["splits"].append(
            {
                "frame": frame_index,
                "outputFrames": [int(FRAME_RE.search(path).group(1)) for path in new_paths if FRAME_RE.search(path)],
                "componentCount": len(component_meta),
            }
        )

    for frame_index in remove_frames:
        frame_file = frames_dir / f"frame-{frame_index:03d}.png"
        if frame_file.exists():
            shutil.copy2(frame_file, backup_dir / frame_file.name)
            Image.new("RGBA", (1, 1), (0, 0, 0, 0)).save(frame_file)
            meta = frames_by_index.get(frame_index)
            if meta:
                meta["width"] = 1
                meta["height"] = 1
                meta["sourceRepair"] = {"type": "quarantined-non-character-ui", "originalFrame": frame_index}

    frames.sort(key=lambda frame: int(frame["index"]))
    frames_json["count"] = max(int(frame["index"]) for frame in frames) + 1 if frames else 0
    regenerate_animation_sheet(character_dir, character_id, frames_json)
    frames_json["count"] = len(frames)
    write_json(frames_json_path, frames_json)

    animation_changes = replace_animation_paths(manifest, replacements, removals)
    manifest["spriteFrameCount"] = frames_json["count"]
    manifest["spriteSheetPath"] = f"/characters/{character_id}/animation-sheet.png"
    if isinstance(manifest.get("spriteSheets"), list):
        for sheet in manifest["spriteSheets"]:
            if isinstance(sheet, dict):
                sheet["path"] = f"/characters/{character_id}/animation-sheet.png"
                sheet["frameCount"] = frames_json["count"]
    write_json(manifest_path, manifest)

    first_frame = Image.open(frames_dir / "frame-000.png").convert("RGBA")
    make_face_card(first_frame).save(character_dir / "face-card.png")
    report["animationChanges"] = animation_changes
    report["frameCount"] = frames_json["count"]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.report, report)
    make_proof_sheet(before_images, after_images, args.proof)
    print(json.dumps({"characterId": character_id, "frameCount": frames_json["count"], "report": str(args.report), "proof": str(args.proof)}, indent=2))


if __name__ == "__main__":
    main()
