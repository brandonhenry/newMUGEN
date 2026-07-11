#!/usr/bin/env python3
"""Remove detached alpha components introduced by a historical crop commit."""

from __future__ import annotations

import argparse
from collections import Counter, deque
from io import BytesIO
import json
import math
from pathlib import Path
import subprocess
from typing import Any

from PIL import Image


NARUTO_CHARACTERS = {
    "choji-akimichi", "deidara", "gaara", "ino-yamanaka", "jiraiya", "jirobo",
    "jirobo-curse-mark", "jugo", "kabuto", "kakashi-hatake", "karin", "kiba-inuzuka",
    "kidomaru", "kidomaru-curse-mark", "kimimaro", "kimimaru-curse-mark", "might-guy",
    "naruto-uzumaki-nine-tails-kyubi", "neji-hyuga", "orochimaru", "pain", "rock-lee",
    "sai", "sakon", "sakon-curse-mark", "sakura-haruno", "sasori", "sasuke-curse-mark",
    "suigetsu", "tayuya", "tayuya-curse-mark", "temari", "tsunade",
}


def git_bytes(repo: Path, ref: str, path: str) -> bytes | None:
    result = subprocess.run(
        ["git", "show", f"{ref}:{path}"], cwd=repo, capture_output=True, check=False
    )
    return result.stdout if result.returncode == 0 else None


def read_json_bytes(data: bytes) -> dict[str, Any]:
    return json.loads(data.decode("utf-8"))


def entries_by_index(metadata: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return {int(entry["index"]): entry for entry in metadata.get("frames", [])}


def alpha_components(image: Image.Image) -> list[list[int]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    mask = bytearray(alpha > 16 for alpha in rgba.getchannel("A").getdata())
    visited = bytearray(width * height)
    components: list[list[int]] = []
    for start, opaque in enumerate(mask):
        if not opaque or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        while queue:
            key = queue.popleft()
            component.append(key)
            x, y = key % width, key // width
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < width and 0 <= ny < height:
                    neighbor = ny * width + nx
                    if mask[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        components.append(component)
    return sorted(components, key=len, reverse=True)


def source_coordinates(image: Image.Image, entry: dict[str, Any] | None) -> set[tuple[int, int]]:
    width = image.width
    return {
        (key % width, key // width)
        for key, alpha in enumerate(image.convert("RGBA").getchannel("A").getdata())
        if alpha > 16
    }


def outside_original_span(
    coordinate: tuple[int, int], before_opaque: set[tuple[int, int]]
) -> bool:
    """True when the point is not bracketed by original alpha on either axis."""
    x, y = coordinate
    row = [px for px, py in before_opaque if py == y]
    column = [py for px, py in before_opaque if px == x]
    horizontal = bool(row) and min(row) < x < max(row)
    vertical = bool(column) and min(column) < y < max(column)
    return not horizontal and not vertical


def exact_color_alignment(current: Image.Image, before: Image.Image) -> tuple[int, int, float] | None:
    current_rgba = current.convert("RGBA")
    before_rgba = before.convert("RGBA")
    before_by_color: dict[tuple[int, int, int], list[tuple[int, int]]] = {}
    before_pixels = before_rgba.load()
    for y in range(before.height):
        for x in range(before.width):
            red, green, blue, alpha = before_pixels[x, y]
            if alpha > 16:
                before_by_color.setdefault((red, green, blue), []).append((x, y))
    opaque: list[tuple[int, int, tuple[int, int, int]]] = []
    current_pixels = current_rgba.load()
    for y in range(current.height):
        for x in range(current.width):
            red, green, blue, alpha = current_pixels[x, y]
            if alpha > 16:
                opaque.append((x, y, (red, green, blue)))
    if not opaque:
        return None
    anchors = sorted(opaque, key=lambda item: len(before_by_color.get(item[2], [])))[:100]
    votes: Counter[tuple[int, int]] = Counter()
    for x, y, color in anchors:
        for before_x, before_y in before_by_color.get(color, []):
            votes[(before_x - x, before_y - y)] += 1
    best: tuple[float, tuple[int, int]] | None = None
    denominator = max(1, min(len(opaque), sum(len(points) for points in before_by_color.values())))
    for offset, _ in votes.most_common(60):
        matches = 0
        for x, y, color in opaque:
            before_x, before_y = x + offset[0], y + offset[1]
            if 0 <= before_x < before.width and 0 <= before_y < before.height:
                if before_pixels[before_x, before_y][:3] == color and before_pixels[before_x, before_y][3] > 16:
                    matches += 1
        score = matches / denominator
        if best is None or score > best[0]:
            best = score, offset
    if best is None or best[0] < 0.70:
        return None
    return best[1][0], best[1][1], best[0]


def removable_added_pixels(
    image: Image.Image,
    before_opaque: set[tuple[int, int]],
    offset_x: int,
    offset_y: int,
) -> list[int]:
    width = image.width
    return [
        key
        for key, alpha in enumerate(image.convert("RGBA").getchannel("A").getdata())
        if alpha > 16
        and (coordinate := (key % width + offset_x, key // width + offset_y)) not in before_opaque
        and outside_original_span(coordinate, before_opaque)
    ]


def patch_atlas(character_dir: Path, changed_frames: set[int], metadata: dict[str, Any]) -> None:
    atlas_path = character_dir / "animation-sheet.png"
    if not atlas_path.exists():
        return
    atlas = Image.open(atlas_path).convert("RGBA")
    for entry in metadata.get("frames", []):
        index = int(entry["index"])
        if index not in changed_frames:
            continue
        box = entry.get("box")
        if not isinstance(box, list) or len(box) != 4:
            continue
        left, top, right, bottom = map(int, box)
        atlas.paste((0, 0, 0, 0), (left, top, right, bottom))
        frame = Image.open(character_dir / "frames" / f"frame-{index:03d}.png").convert("RGBA")
        atlas.alpha_composite(frame, (left, top))
    atlas.save(atlas_path)


def repack_atlas(character_dir: Path, character: str, metadata: dict[str, Any]) -> None:
    entries = sorted(metadata.get("frames", []), key=lambda entry: int(entry["index"]))
    images = [
        Image.open(character_dir / "frames" / f"frame-{int(entry['index']):03d}.png").convert("RGBA")
        for entry in entries
    ]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width, cell_height = max_width + padding * 2, max_height + padding * 2
    atlas = Image.new(
        "RGBA",
        (columns * cell_width, math.ceil(len(images) / columns) * cell_height),
        (0, 0, 0, 0),
    )
    for position, (entry, frame) in enumerate(zip(entries, images)):
        column, row = position % columns, position // columns
        left = column * cell_width + padding + (max_width - frame.width) // 2
        top = row * cell_height + padding + max_height - frame.height
        atlas.alpha_composite(frame, (left, top))
        entry["box"] = [left, top, left + frame.width, top + frame.height]
        entry["width"], entry["height"] = frame.size
        entry["row"] = row
        entry["sheetId"] = "generated"
        entry["sheetPath"] = f"/characters/{character}/animation-sheet.png"
    atlas.save(character_dir / "animation-sheet.png")
    metadata["count"] = len(entries)
    metadata["sheets"] = [{
        "id": "generated",
        "name": "Generated Frame Atlas",
        "path": f"/characters/{character}/animation-sheet.png",
        "frameStart": 0,
        "frameCount": len(entries),
    }]
    (character_dir / "frames" / "frames.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False) + "\n"
    )


def changed_frame_paths(repo: Path, bad_commit: str) -> dict[str, list[str]]:
    output = subprocess.check_output(
        ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", bad_commit],
        cwd=repo,
        text=True,
    )
    grouped: dict[str, list[str]] = {}
    for path in output.splitlines():
        parts = path.split("/")
        if (
            len(parts) == 5
            and parts[:2] == ["public", "characters"]
            and parts[3] == "frames"
            and parts[4].startswith("frame-")
            and parts[4].endswith(".png")
        ):
            grouped.setdefault(parts[2], []).append(path)
    return grouped


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--bad-commit", default="a2efe307e4")
    parser.add_argument("--character", action="append")
    parser.add_argument("--include-naruto", action="store_true")
    parser.add_argument(
        "--restore-frame",
        action="append",
        default=[],
        help="Explicit low-confidence frame to restore as character:index",
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--output", type=Path, default=Path("tmp/crop-debris-cleanup/report.json"))
    args = parser.parse_args()

    repo = args.repo.resolve()
    before_ref = f"{args.bad_commit}^"
    selected = set(args.character or [])
    explicit_restore = {
        (character, int(index))
        for value in args.restore_frame
        for character, index in [value.rsplit(":", 1)]
    }
    reports: list[dict[str, Any]] = []
    for character, paths in sorted(changed_frame_paths(repo, args.bad_commit).items()):
        if selected and character not in selected:
            continue
        if not args.include_naruto and character in NARUTO_CHARACTERS:
            continue
        character_dir = repo / "public" / "characters" / character
        current_meta_path = character_dir / "frames" / "frames.json"
        before_meta_data = git_bytes(
            repo, before_ref, f"public/characters/{character}/frames/frames.json"
        )
        if not current_meta_path.exists() or before_meta_data is None:
            continue
        current_meta = json.loads(current_meta_path.read_text())
        current_entries = entries_by_index(current_meta)
        before_entries = entries_by_index(read_json_bytes(before_meta_data))
        changed: list[dict[str, Any]] = []
        restored: set[int] = set()
        for relative in paths:
            index = int(Path(relative).stem.split("-")[-1])
            current_path = repo / relative
            before_data = git_bytes(repo, before_ref, relative)
            if not current_path.exists() or before_data is None:
                continue
            current = Image.open(current_path).convert("RGBA")
            before = Image.open(BytesIO(before_data)).convert("RGBA")
            before_opaque = source_coordinates(before, before_entries.get(index))
            alignment = exact_color_alignment(current, before)
            if alignment is None:
                if (character, index) in explicit_restore:
                    if args.apply:
                        before.save(current_path)
                        old_entry = before_entries.get(index)
                        current_entry = current_entries.get(index)
                        if old_entry is not None and current_entry is not None:
                            current_entry.clear()
                            current_entry.update(json.loads(json.dumps(old_entry)))
                    restored.add(index)
                    changed.append({
                        "frame": index,
                        "removedPixels": 0,
                        "restoredFrom": before_ref,
                    })
                continue
            offset_x, offset_y, alignment_score = alignment
            removable = removable_added_pixels(current, before_opaque, offset_x, offset_y)
            if not removable:
                continue
            if args.apply:
                pixels = current.load()
                for key in removable:
                    pixels[key % current.width, key // current.width] = (0, 0, 0, 0)
                current.save(current_path)
            changed.append({
                "frame": index,
                "removedPixels": len(removable),
                "alignmentOffset": [offset_x, offset_y],
                "alignmentScore": alignment_score,
            })
        if args.apply and changed:
            if restored:
                repack_atlas(character_dir, character, current_meta)
            else:
                patch_atlas(character_dir, {item["frame"] for item in changed}, current_meta)
        if changed:
            reports.append({
                "character": character,
                "changedFrames": [item["frame"] for item in changed],
                "removedPixels": sum(item["removedPixels"] for item in changed),
                "changes": changed,
            })

    output = args.output if args.output.is_absolute() else repo / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"reports": reports}, indent=2) + "\n")
    print(json.dumps({
        "characters": len(reports),
        "frames": sum(len(report["changedFrames"]) for report in reports),
        "removedPixels": sum(report["removedPixels"] for report in reports),
        "applied": args.apply,
    }, indent=2))


if __name__ == "__main__":
    main()
