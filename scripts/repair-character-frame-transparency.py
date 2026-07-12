#!/usr/bin/env python3
"""Audit and conservatively restore playable character frames from source sheets.

The runtime animation atlas may have replaced the original source coordinates in
``frames.json``.  This tool recovers those coordinates from ``sourceBox`` or Git
history, restores only pixels that are safely distinguishable from the keyed
background, and records the source provenance before repacking an affected atlas.
Dry-run is the default; pass ``--apply`` to write assets.
"""

from __future__ import annotations

import argparse
from collections import Counter, deque
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import subprocess
import sys
from typing import Any, Iterable

from PIL import Image


Box = tuple[int, int, int, int]

EXACT_KEYS_BY_CHARACTER: dict[str, set[tuple[int, int, int]]] = {
    # Exact chroma colors present in the source sheets.  These are scoped to
    # characters whose sheets use the color as a matte, never as authored art.
    "choji-akimichi": {(48, 200, 152)},
    "gaara": {(0, 0, 248), (0, 200, 120), (0, 216, 0)},
    "ino-yamanaka": {(56, 192, 48)},
    "kiba-inuzuka": {(248, 0, 0), (0, 0, 248)},
    "kimimaro": {(32, 192, 32)},
    "sakon-curse-mark": {(0, 160, 0), (0, 255, 255)},
    "temari": {(72, 176, 56), (0, 128, 128)},
    "tsunade": {(0, 136, 0)},
}

TARGETED_CROP_OVERRIDES: dict[str, dict[int, Box]] = {
    # Confirmed packed source cells found during the visual attack-sheet pass.
    "serpent": {120: (0, 0, 66, 66)},
    "temari": {
        107: (0, 0, 184, 83),
        114: (0, 0, 184, 92),
        121: (0, 0, 184, 83),
        130: (0, 0, 184, 72),
    },
}


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def valid_box(value: Any, width: int, height: int) -> bool:
    if not isinstance(value, list) or len(value) != 4:
        return False
    left, top, right, bottom = (int(part) for part in value)
    return 0 <= left < right <= width and 0 <= top < bottom <= height


def frame_box(frame: dict[str, Any]) -> list[int] | None:
    source_box = frame.get("sourceBox")
    if isinstance(source_box, list) and len(source_box) == 4:
        return [int(value) for value in source_box]
    box = frame.get("box")
    if isinstance(box, list) and len(box) == 4:
        return [int(value) for value in box]
    return None


def boxes_fit_source(frames: Iterable[dict[str, Any]], size: tuple[int, int]) -> bool:
    width, height = size
    boxes = [frame_box(frame) for frame in frames]
    return bool(boxes) and all(valid_box(box, width, height) for box in boxes)


def index_source_files(source_root: Path) -> dict[str, list[Path]]:
    indexed: dict[str, list[Path]] = {}
    for path in source_root.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".png", ".gif"}:
            indexed.setdefault(path.name, []).append(path)
    return indexed


def source_dimensions(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def resolve_source_path(
    source_name: str,
    candidates: list[Path],
    provenance_frames: list[dict[str, Any]],
) -> tuple[Path | None, str]:
    if not candidates:
        return None, "missing-source"
    fitting = [path for path in candidates if boxes_fit_source(provenance_frames, source_dimensions(path))]
    if len(fitting) == 1:
        return fitting[0], "coordinates"
    if len(fitting) > 1:
        hashes = {sha256(path) for path in fitting}
        if len(hashes) == 1:
            return sorted(fitting)[0], "duplicate-identical"
        return None, "ambiguous-source"
    if len(candidates) == 1:
        return candidates[0], "filename"
    hashes = {sha256(path) for path in candidates}
    if len(hashes) == 1:
        return sorted(candidates)[0], "duplicate-identical"
    return None, "ambiguous-source"


def git_versions(repo: Path, relative_path: Path) -> Iterable[tuple[str, dict[str, Any]]]:
    result = subprocess.run(
        ["git", "log", "--format=%H", "--", relative_path.as_posix()],
        cwd=repo,
        text=True,
        capture_output=True,
        check=False,
    )
    for commit in result.stdout.splitlines():
        shown = subprocess.run(
            ["git", "show", f"{commit}:{relative_path.as_posix()}"],
            cwd=repo,
            text=True,
            capture_output=True,
            check=False,
        )
        if shown.returncode:
            continue
        try:
            yield commit, json.loads(shown.stdout)
        except json.JSONDecodeError:
            continue


def recover_provenance(
    repo: Path,
    character_id: str,
    current: dict[str, Any],
    candidates: list[Path],
) -> tuple[list[dict[str, Any]] | None, str]:
    current_frames = current.get("frames", [])
    for source_path in candidates:
        if boxes_fit_source(current_frames, source_dimensions(source_path)):
            return current_frames, "current-metadata"

    relative = Path("public") / "characters" / character_id / "frames" / "frames.json"
    versions = list(git_versions(repo, relative))
    source_sizes = [source_dimensions(path) for path in candidates]
    best_commit = ""
    current_direct: dict[int, dict[str, Any]] = {}
    for frame in current_frames:
        source_box = frame.get("sourceBox")
        if isinstance(source_box, list) and any(valid_box(source_box, width, height) for width, height in source_sizes):
            current_direct[int(frame["index"])] = frame
    best_direct: dict[int, dict[str, Any]] = {}
    repair_metadata: dict[int, dict[str, Any]] = {}
    # Prefer the original split metadata over later crop annotations that may
    # have replaced sourceRepair on the component-zero frame.
    for _, historic in reversed(versions):
        for frame in historic.get("frames", []):
            repair = frame.get("sourceRepair")
            if isinstance(repair, dict):
                index = int(frame.get("index", -1))
                if repair.get("type") == "split-contact-frame" or index not in repair_metadata:
                    repair_metadata[index] = repair
    for commit, historic in versions:
        direct: dict[int, dict[str, Any]] = {}
        for frame in historic.get("frames", []):
            box = frame_box(frame)
            if box is None or frame.get("sourceName") != current.get("source"):
                continue
            if any(valid_box(box, width, height) for width, height in source_sizes):
                direct[int(frame["index"])] = frame
        if len(direct) > len(best_direct):
            best_direct = direct
            best_commit = commit
    if best_direct:
        best_direct.update(current_direct)
        recovered: list[dict[str, Any]] = []
        for frame in current_frames:
            index = int(frame["index"])
            if index in current_direct:
                recovered.append(current_direct[index])
                continue
            repair = repair_metadata.get(index)
            if isinstance(repair, dict) and repair.get("type") == "split-contact-frame":
                original_index = int(repair.get("originalFrame", -1))
                original = best_direct.get(original_index)
                component_box = repair.get("componentBox")
                original_box = frame_box(original) if original else None
                if original_box and isinstance(component_box, list) and len(component_box) == 4:
                    left, top, _, _ = original_box
                    component = [
                        left + int(component_box[0]),
                        top + int(component_box[1]),
                        left + int(component_box[2]),
                        top + int(component_box[3]),
                    ]
                    recovered.append({**frame, "box": component})
                    continue
            direct = best_direct.get(index)
            if direct is not None:
                recovered.append(direct)
        if recovered:
            return recovered, f"git:{best_commit[:12]}+derived-repairs"
    return None, "redetect-required"


def load_import_detector(repo: Path):
    scripts = repo / "scripts"
    sys.path.insert(0, str(scripts))
    path = scripts / "batch-import-kore-characters.py"
    spec = importlib.util.spec_from_file_location("kore_batch_import", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def redetect_provenance(
    detector: Any,
    source_path: Path,
    character_id: str,
    current_frames: list[dict[str, Any]],
) -> list[dict[str, Any]] | None:
    image = detector.load_source_image(source_path)
    entries, _ = detector.filtered_projection_boxes(image, character_id)
    if len(entries) != len(current_frames):
        return None
    recovered: list[dict[str, Any]] = []
    for current, entry in zip(current_frames, entries):
        recovered.append({
            **current,
            "box": [int(value) for value in entry["box"]],
            "row": int(entry.get("row", current.get("row", 0))),
        })
    return recovered


def dominant_perimeter_colors(image: Image.Image, limit: int = 4) -> list[tuple[int, int, int]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    perimeter: list[tuple[int, int, int]] = []
    for x in range(width):
        for y in (0, height - 1):
            red, green, blue, alpha = rgba.getpixel((x, y))
            if alpha > 16:
                perimeter.append((red, green, blue))
    for y in range(1, height - 1):
        for x in (0, width - 1):
            red, green, blue, alpha = rgba.getpixel((x, y))
            if alpha > 16:
                perimeter.append((red, green, blue))
    if not perimeter:
        return []
    buckets = Counter((red // 4, green // 4, blue // 4) for red, green, blue in perimeter)
    colors: list[tuple[int, int, int]] = []
    for bucket, _ in buckets.most_common(limit):
        members = [color for color in perimeter if tuple(value // 4 for value in color) == bucket]
        colors.append(tuple(round(sum(color[channel] for color in members) / len(members)) for channel in range(3)))
    return colors


def clear_border_background(
    image: Image.Image,
    backgrounds: list[tuple[int, int, int]],
    tolerance: int,
) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    queued: deque[tuple[int, int]] = deque()
    removed = bytearray(width * height)

    def enqueue(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= width or y >= height:
            return
        key = y * width + x
        if removed[key]:
            return
        red, green, blue, alpha = pixels[x, y]
        if alpha <= 16 or any(color_distance((red, green, blue), background) <= tolerance for background in backgrounds):
            removed[key] = 1
            queued.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(1, height - 1):
        enqueue(0, y)
        enqueue(width - 1, y)
    while queued:
        x, y = queued.popleft()
        enqueue(x - 1, y)
        enqueue(x + 1, y)
        enqueue(x, y - 1)
        enqueue(x, y + 1)
    for y in range(height):
        for x in range(width):
            if removed[y * width + x]:
                red, green, blue, _ = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0)
    return rgba


def alpha_bounds(image: Image.Image, threshold: int = 16) -> Box | None:
    alpha = image.convert("RGBA").getchannel("A")
    mask = alpha.point(lambda value: 255 if value > threshold else 0)
    return mask.getbbox()


def clear_exact_keys(image: Image.Image, keys: set[tuple[int, int, int]]) -> tuple[Image.Image, int]:
    rgba = image.convert("RGBA")
    if not keys:
        return rgba, 0
    pixels = rgba.load()
    removed = 0
    for y in range(rgba.height):
        for x in range(rgba.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 16 and (red, green, blue) in keys:
                pixels[x, y] = (red, green, blue, 0)
                removed += 1
    return rgba, removed


def trim_candidate(
    image: Image.Image,
    source_box: Box,
    crop_override: Box | None = None,
) -> tuple[Image.Image, Box]:
    working = image.convert("RGBA")
    offset_x = 0
    offset_y = 0
    if crop_override is not None:
        left, top, right, bottom = crop_override
        left, top = max(0, left), max(0, top)
        right, bottom = min(working.width, right), min(working.height, bottom)
        if left < right and top < bottom:
            working = working.crop((left, top, right, bottom))
            offset_x, offset_y = left, top
    bounds = alpha_bounds(working)
    if bounds is None:
        return Image.new("RGBA", (1, 1), (0, 0, 0, 0)), (source_box[0], source_box[1], source_box[0] + 1, source_box[1] + 1)
    trim = padded_box(bounds, working.size, 1)
    final = working.crop(trim)
    left = source_box[0] + offset_x + trim[0]
    top = source_box[1] + offset_y + trim[1]
    return final, (left, top, left + final.width, top + final.height)


def padded_box(box: Box, size: tuple[int, int], padding: int) -> Box:
    left, top, right, bottom = box
    width, height = size
    return max(0, left - padding), max(0, top - padding), min(width, right + padding), min(height, bottom + padding)


def make_candidate(
    source: Image.Image,
    source_box: Box,
    current: Image.Image,
    sheet_backgrounds: list[tuple[int, int, int]],
    padding: int,
    border_tolerance: int,
    restore_distance: int,
) -> tuple[Image.Image, Box, dict[str, int]]:
    expanded = padded_box(source_box, source.size, padding)
    crop = source.crop(expanded).convert("RGBA")
    crop_backgrounds = dominant_perimeter_colors(crop) or sheet_backgrounds
    candidate = clear_border_background(crop, crop_backgrounds, border_tolerance)
    pixels = candidate.load()
    current_rgba = current.convert("RGBA")
    current_pixels = current_rgba.load()
    offset_x = source_box[0] - expanded[0]
    offset_y = source_box[1] - expanded[1]
    restored = 0
    preserved_transparent = 0
    for y in range(candidate.height):
        for x in range(candidate.width):
            cx = x - offset_x
            cy = y - offset_y
            if cx < 0 or cy < 0 or cx >= current_rgba.width or cy >= current_rgba.height:
                if pixels[x, y][3] > 16:
                    restored += 1
                continue
            _, _, _, current_alpha = current_pixels[cx, cy]
            red, green, blue, candidate_alpha = pixels[x, y]
            if current_alpha > 16:
                if candidate_alpha <= 16:
                    source_pixel = crop.getpixel((x, y))
                    pixels[x, y] = source_pixel
                continue
            distance = min(
                (color_distance((red, green, blue), background) for background in crop_backgrounds),
                default=10_000,
            )
            if candidate_alpha > 16 and distance <= restore_distance:
                pixels[x, y] = (red, green, blue, 0)
                preserved_transparent += 1
            elif candidate_alpha > 16:
                restored += 1

    bounds = alpha_bounds(candidate)
    if bounds is None:
        return current_rgba, source_box, {"restoredPixels": 0, "preservedTransparentPixels": preserved_transparent}
    trim = padded_box(bounds, candidate.size, 1)
    final = candidate.crop(trim)
    final_source_box = (
        expanded[0] + trim[0],
        expanded[1] + trim[1],
        expanded[0] + trim[2],
        expanded[1] + trim[3],
    )
    return final, final_source_box, {"restoredPixels": restored, "preservedTransparentPixels": preserved_transparent}


def images_equal(a: Image.Image, b: Image.Image) -> bool:
    left = a.convert("RGBA")
    right = b.convert("RGBA")
    return left.size == right.size and left.tobytes() == right.tobytes()


def connected_components(image: Image.Image, threshold: int = 16) -> list[tuple[int, Box]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    alpha = rgba.getchannel("A").tobytes()
    visited = bytearray(width * height)
    components: list[tuple[int, Box]] = []
    for start, value in enumerate(alpha):
        if visited[start] or value <= threshold:
            continue
        queue = deque([start])
        visited[start] = 1
        area = 0
        min_x, min_y, max_x, max_y = width, height, -1, -1
        while queue:
            key = queue.popleft()
            x, y = key % width, key // width
            area += 1
            min_x, min_y = min(min_x, x), min(min_y, y)
            max_x, max_y = max(max_x, x), max(max_y, y)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                next_key = ny * width + nx
                if not visited[next_key] and alpha[next_key] > threshold:
                    visited[next_key] = 1
                    queue.append(next_key)
        if area >= 4:
            components.append((area, (min_x, min_y, max_x + 1, max_y + 1)))
    return sorted(components, reverse=True)


def suspicious_candidate(current: Image.Image, candidate: Image.Image, restored: int) -> list[str]:
    reasons: list[str] = []
    if restored <= 0 and current.size == candidate.size:
        return reasons
    current_area = max(1, sum(value > 16 for value in current.convert("RGBA").getchannel("A").tobytes()))
    candidate_area = sum(value > 16 for value in candidate.convert("RGBA").getchannel("A").tobytes())
    if candidate_area > current_area * 1.8 and candidate_area - current_area > 200:
        reasons.append("large-alpha-growth")
    current_components = connected_components(current)
    candidate_components = connected_components(candidate)
    significant = [area for area, _ in candidate_components if area >= max(25, candidate_area * 0.08)]
    if len(significant) > max(2, len([area for area, _ in current_components if area >= max(25, current_area * 0.08)]) + 1):
        reasons.append("new-large-component")
    if candidate.width > max(current.width + 12, current.width * 1.45) or candidate.height > max(current.height + 12, current.height * 1.45):
        reasons.append("large-crop-growth")
    return reasons


def save_comparison(path: Path, current: Image.Image, candidate: Image.Image) -> None:
    scale = 2
    left = current.convert("RGBA").resize((current.width * scale, current.height * scale), Image.Resampling.NEAREST)
    right = candidate.convert("RGBA").resize((candidate.width * scale, candidate.height * scale), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (left.width + right.width + 12, max(left.height, right.height) + 8), (0, 0, 0, 255))
    canvas.alpha_composite(left, (4, 4))
    canvas.alpha_composite(right, (left.width + 8, 4))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def regenerate_animation_sheet(character_dir: Path, character_id: str, frames_json: dict[str, Any]) -> None:
    frames = sorted(frames_json.get("frames", []), key=lambda frame: int(frame["index"]))
    images = [(frame, Image.open(character_dir / "frames" / f"frame-{int(frame['index']):03d}.png").convert("RGBA")) for frame in frames]
    max_width = max(image.width for _, image in images)
    max_height = max(image.height for _, image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width, cell_height = max_width + padding * 2, max_height + padding * 2
    sheet = Image.new("RGBA", (columns * cell_width, math.ceil(len(images) / columns) * cell_height), (0, 0, 0, 0))
    for position, (frame, image) in enumerate(images):
        column, row = position % columns, position // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        frame["path"] = f"/characters/{character_id}/frames/frame-{int(frame['index']):03d}.png"
        frame["sheetId"] = "generated"
        frame["sheetPath"] = f"/characters/{character_id}/animation-sheet.png"
        frame["box"] = [x, y, x + image.width, y + image.height]
        frame["width"], frame["height"] = image.size
    sheet.save(character_dir / "animation-sheet.png")
    frames_json["sheets"] = [{
        "id": "generated",
        "name": "Generated Frame Atlas",
        "path": f"/characters/{character_id}/animation-sheet.png",
        "frameStart": 0,
        "frameCount": len(images),
    }]


def refresh_face_card(character_dir: Path) -> None:
    source = Image.open(character_dir / "frames" / "frame-000.png").convert("RGBA")
    card = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    scale = min(210 / max(1, source.width), 220 / max(1, source.height), 4)
    scaled = source.resize((max(1, round(source.width * scale)), max(1, round(source.height * scale))), Image.Resampling.NEAREST)
    card.alpha_composite(scaled, ((256 - scaled.width) // 2, max(8, 256 - scaled.height - 18)))
    card.save(character_dir / "face-card.png")


def playable_character_ids(repo: Path, selected: list[str]) -> list[str]:
    if selected:
        return sorted(set(selected))
    ids: list[str] = []
    for manifest_path in sorted((repo / "public" / "characters").glob("*/character.json")):
        manifest = read_json(manifest_path)
        if not manifest.get("unplayable"):
            ids.append(manifest_path.parent.name)
    return ids


def repair_known_key_colors(
    repo: Path,
    character_id: str,
    apply: bool,
    preview_dir: Path,
) -> dict[str, Any]:
    character_dir = repo / "public" / "characters" / character_id
    frames_path = character_dir / "frames" / "frames.json"
    if not frames_path.exists():
        return {"character": character_id, "status": "missing-frame-metadata", "changes": []}
    metadata = read_json(frames_path)
    keys = EXACT_KEYS_BY_CHARACTER.get(character_id, set())
    changes: list[dict[str, Any]] = []
    for frame in metadata.get("frames", []):
        index = int(frame["index"])
        frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
        if not frame_path.exists():
            continue
        current = Image.open(frame_path).convert("RGBA")
        candidate, removed = clear_exact_keys(current, keys)
        if removed <= 0:
            continue
        changes.append({"frame": index, "removedKeyPixels": removed, "action": "repair"})
        save_comparison(preview_dir / character_id / "known-keys" / f"frame-{index:03d}.png", current, candidate)
        if apply:
            candidate.save(frame_path)
    if apply and changes:
        regenerate_animation_sheet(character_dir, character_id, metadata)
        write_json(frames_path, metadata)
    return {
        "character": character_id,
        "status": "repaired" if apply and changes else "candidates" if changes else "clean",
        "acceptedFrames": [change["frame"] for change in changes],
        "changes": changes,
    }


def repair_character(
    repo: Path,
    character_id: str,
    source_index: dict[str, list[Path]],
    detector: Any,
    apply: bool,
    padding: int,
    border_tolerance: int,
    restore_distance: int,
    preview_dir: Path,
) -> dict[str, Any]:
    character_dir = repo / "public" / "characters" / character_id
    frames_path = character_dir / "frames" / "frames.json"
    if not frames_path.exists():
        return {"character": character_id, "status": "missing-frame-metadata", "changes": []}
    metadata = read_json(frames_path)
    source_name = metadata.get("source")
    if not isinstance(source_name, str):
        return {"character": character_id, "status": "missing-source-name", "changes": []}
    candidates = source_index.get(source_name, [])
    provenance_frames, provenance = recover_provenance(repo, character_id, metadata, candidates)
    source_path, resolution = resolve_source_path(source_name, candidates, provenance_frames or metadata.get("frames", []))
    if source_path is None:
        return {"character": character_id, "status": resolution, "provenance": provenance, "changes": []}
    if provenance_frames is None:
        provenance_frames = redetect_provenance(detector, source_path, character_id, metadata.get("frames", []))
        if provenance_frames is None:
            return {"character": character_id, "status": "ambiguous-redetection", "source": str(source_path), "changes": []}
        provenance = "redetected-row-order"
    if not boxes_fit_source(provenance_frames, source_dimensions(source_path)):
        return {"character": character_id, "status": "invalid-source-coordinates", "source": str(source_path), "changes": []}

    source = Image.open(source_path).convert("RGBA")
    sheet_backgrounds = dominant_perimeter_colors(source)
    provenance_by_index = {int(frame["index"]): frame for frame in provenance_frames}
    changes: list[dict[str, Any]] = []
    accepted: list[tuple[int, Image.Image, Box]] = []
    for frame in metadata.get("frames", []):
        index = int(frame["index"])
        historic = provenance_by_index.get(index)
        if historic is None:
            changes.append({"frame": index, "action": "ambiguous", "reason": "missing-provenance-frame"})
            continue
        source_box_value = frame_box(historic)
        if source_box_value is None:
            changes.append({"frame": index, "action": "ambiguous", "reason": "missing-source-box"})
            continue
        source_box = tuple(source_box_value)
        frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
        if not frame_path.exists():
            changes.append({"frame": index, "action": "ambiguous", "reason": "missing-frame-png"})
            continue
        current = Image.open(frame_path).convert("RGBA")
        candidate, candidate_box, metrics = make_candidate(
            source,
            source_box,
            current,
            sheet_backgrounds,
            0 if isinstance(frame.get("sourceBox"), list) else padding,
            border_tolerance,
            restore_distance,
        )
        candidate, removed_pixels = clear_exact_keys(candidate, EXACT_KEYS_BY_CHARACTER.get(character_id, set()))
        configured_override = TARGETED_CROP_OVERRIDES.get(character_id, {}).get(index)
        crop_override = configured_override
        if configured_override is not None and (
            current.width < configured_override[2] and current.height < configured_override[3]
        ):
            crop_override = None
        if removed_pixels or crop_override is not None:
            candidate, candidate_box = trim_candidate(candidate, candidate_box, crop_override)
        metrics["removedKeyPixels"] = removed_pixels
        if metrics["restoredPixels"] <= 0 and removed_pixels <= 0 and crop_override is None:
            continue
        if images_equal(current, candidate):
            continue
        reasons = suspicious_candidate(current, candidate, metrics["restoredPixels"])
        entry = {
            "frame": index,
            "sourceBox": list(source_box),
            "candidateSourceBox": list(candidate_box),
            "oldSize": list(current.size),
            "newSize": list(candidate.size),
            **metrics,
        }
        if reasons and crop_override is None:
            changes.append({**entry, "action": "ambiguous", "reason": ",".join(reasons)})
            save_comparison(preview_dir / character_id / "ambiguous" / f"frame-{index:03d}.png", current, candidate)
            continue
        changes.append({**entry, "action": "repair", "verification": "automated-high-confidence"})
        save_comparison(preview_dir / character_id / "repair" / f"frame-{index:03d}.png", current, candidate)
        accepted.append((index, candidate, candidate_box))

    if apply and accepted:
        by_index = {int(frame["index"]): frame for frame in metadata.get("frames", [])}
        for index, provenance_frame in provenance_by_index.items():
            provenance_box = frame_box(provenance_frame)
            if index in by_index and provenance_box is not None:
                by_index[index].setdefault("sourceBox", list(provenance_box))
                by_index[index].setdefault("sourceName", source_name)
        for index, candidate, candidate_box in accepted:
            candidate.save(character_dir / "frames" / f"frame-{index:03d}.png")
            by_index[index]["sourceBox"] = list(candidate_box)
            by_index[index]["sourceName"] = source_name
        regenerate_animation_sheet(character_dir, character_id, metadata)
        write_json(frames_path, metadata)
        if any(index == 0 for index, _, _ in accepted):
            refresh_face_card(character_dir)

    return {
        "character": character_id,
        "status": "repaired" if apply and accepted else "candidates" if accepted else "clean-or-ambiguous",
        "source": str(source_path),
        "sourceResolution": resolution,
        "provenance": provenance,
        "acceptedFrames": [index for index, _, _ in accepted],
        "changes": changes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source-root", type=Path, default=Path("/Users/brandonhenry/Documents/Kore/Characters"))
    parser.add_argument("--character", action="append", default=[])
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Explicit alias for the default non-writing mode")
    parser.add_argument("--output", type=Path, default=Path("tmp/transparency-crop-repair/report.json"))
    parser.add_argument("--padding", type=int, default=3)
    parser.add_argument("--border-tolerance", type=int, default=24)
    parser.add_argument("--restore-distance", type=int, default=18)
    parser.add_argument("--preview-dir", type=Path, default=Path("tmp/transparency-crop-repair/previews"))
    parser.add_argument("--clear-known-keys-only", action="store_true")
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("--apply and --dry-run are mutually exclusive")
    repo = args.repo.resolve()
    source_root = args.source_root.resolve()
    source_index = index_source_files(source_root)
    detector = load_import_detector(repo)
    preview_dir = args.preview_dir if args.preview_dir.is_absolute() else repo / args.preview_dir
    reports = []
    for character_id in playable_character_ids(repo, args.character):
        report = (
            repair_known_key_colors(repo, character_id, args.apply, preview_dir)
            if args.clear_known_keys_only
            else repair_character(
                repo,
                character_id,
                source_index,
                detector,
                args.apply,
                args.padding,
                args.border_tolerance,
                args.restore_distance,
                preview_dir,
            )
        )
        reports.append(report)
        accepted = len(report.get("acceptedFrames", []))
        ambiguous = sum(change.get("action") == "ambiguous" for change in report.get("changes", []))
        print(f"{character_id}: {report['status']} accepted={accepted} ambiguous={ambiguous}")
    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "sourceRoot": str(source_root),
        "characters": len(reports),
        "acceptedFrames": sum(len(report.get("acceptedFrames", [])) for report in reports),
        "ambiguousFrames": sum(sum(change.get("action") == "ambiguous" for change in report.get("changes", [])) for report in reports),
        "reports": reports,
    }
    output = args.output if args.output.is_absolute() else repo / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    write_json(output, summary)
    print(json.dumps({key: value for key, value in summary.items() if key != "reports"}, indent=2))


if __name__ == "__main__":
    main()
