#!/usr/bin/env python3
"""Compare extracted frame alpha silhouettes with their original source crops."""

from __future__ import annotations

import argparse
from collections import Counter, deque
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


RGB = tuple[int, int, int]

EXACT_KEYS_BY_CHARACTER: dict[str, set[RGB]] = {
    "choji-akimichi": {(48, 200, 152)},
    "gaara": {(0, 0, 248), (0, 200, 120)},
    "ino-yamanaka": {(56, 192, 48)},
    "kiba-inuzuka": {(248, 0, 0), (0, 0, 248)},
    "kimimaro": {(32, 192, 32)},
    "sakon-curse-mark": {(0, 160, 0), (0, 255, 255)},
    "temari": {(72, 176, 56), (0, 128, 128)},
    "tsunade": {(0, 136, 0)},
}


def is_dark_outline(color: RGB) -> bool:
    maximum = max(color)
    minimum = min(color)
    return maximum <= 34 and maximum - minimum <= 18


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def index_sources(root: Path) -> dict[str, list[Path]]:
    result: dict[str, list[Path]] = {}
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".png", ".gif"}:
            result.setdefault(path.name, []).append(path)
    return result


def source_color_counts(image: Image.Image) -> Counter[RGB]:
    return Counter((red, green, blue) for red, green, blue, _ in image.convert("RGBA").getdata())


def current_palette(frame_paths: list[Path]) -> set[RGB]:
    colors: set[RGB] = set()
    for path in frame_paths:
        for red, green, blue, alpha in Image.open(path).convert("RGBA").getdata():
            if alpha > 16:
                colors.add((red, green, blue))
    return colors


def alpha_mask(image: Image.Image) -> bytearray:
    return bytearray(1 if alpha > 16 else 0 for alpha in image.convert("RGBA").getchannel("A").getdata())


def near_mask(mask: bytearray, width: int, height: int, x: int, y: int, radius: int = 2) -> bool:
    for ny in range(max(0, y - radius), min(height, y + radius + 1)):
        for nx in range(max(0, x - radius), min(width, x + radius + 1)):
            if mask[ny * width + nx]:
                return True
    return False


def exterior_transparency(mask: bytearray, width: int, height: int) -> bytearray:
    """Mark transparent pixels connected to the frame edge."""
    exterior = bytearray(width * height)
    queue: deque[int] = deque()
    for x in range(width):
        queue.extend((x, (height - 1) * width + x))
    for y in range(height):
        queue.extend((y * width, y * width + width - 1))
    while queue:
        key = queue.popleft()
        if exterior[key] or mask[key]:
            continue
        exterior[key] = 1
        x, y = key % width, key // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                queue.append(ny * width + nx)
    return exterior


def primary_alpha_component(mask: bytearray, width: int, height: int) -> bytearray:
    """Keep the largest solid opaque core, excluding thin strips and bridges."""
    erosion_radius = 0
    eroded = bytearray(width * height)
    for radius in (4, 3, 2, 1):
        trial = bytearray(width * height)
        for y in range(radius, height - radius):
            for x in range(radius, width - radius):
                if all(
                    mask[ny * width + nx]
                    for ny in range(y - radius, y + radius + 1)
                    for nx in range(x - radius, x + radius + 1)
                ):
                    trial[y * width + x] = 1
        if any(trial):
            erosion_radius = radius
            eroded = trial
            break
    working = eroded if any(eroded) else mask
    visited = bytearray(width * height)
    largest: list[int] = []
    for start in range(width * height):
        if visited[start] or not working[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        while queue:
            key = queue.popleft()
            component.append(key)
            x, y = key % width, key // width
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if not visited[neighbor] and working[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        if len(component) > len(largest):
            largest = component
    core = bytearray(width * height)
    for key in largest:
        core[key] = 1
    if erosion_radius == 0:
        return core
    primary = bytearray(width * height)
    for key, opaque in enumerate(mask):
        if opaque and near_mask(core, width, height, key % width, key // width, radius=erosion_radius):
            primary[key] = 1
    return primary


def inside_primary_span(mask: bytearray, width: int, height: int, x: int, y: int) -> bool:
    """Return true only inside a row or column spanned by the primary body."""
    horizontal = (
        any(mask[y * width + nx] for nx in range(0, x))
        and any(mask[y * width + nx] for nx in range(x + 1, width))
    )
    vertical = (
        any(mask[ny * width + x] for ny in range(0, y))
        and any(mask[ny * width + x] for ny in range(y + 1, height))
    )
    return horizontal or vertical


def color_components(image: Image.Image) -> list[tuple[RGB, list[int], bool]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    colors = [(red, green, blue) for red, green, blue, _ in rgba.getdata()]
    visited = bytearray(width * height)
    components: list[tuple[RGB, list[int], bool]] = []
    for start in range(width * height):
        if visited[start]:
            continue
        color = colors[start]
        queue = deque([start])
        visited[start] = 1
        pixels: list[int] = []
        touches_border = False
        while queue:
            key = queue.popleft()
            pixels.append(key)
            x, y = key % width, key // width
            touches_border = touches_border or x == 0 or y == 0 or x == width - 1 or y == height - 1
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                neighbor = ny * width + nx
                if not visited[neighbor] and colors[neighbor] == color:
                    visited[neighbor] = 1
                    queue.append(neighbor)
        components.append((color, pixels, touches_border))
    return components


def foreground_components(
    image: Image.Image,
    dominant_colors: set[RGB],
    authored_colors: set[RGB],
) -> list[tuple[list[int], bool]]:
    """Return spatial source-foreground components, independent of palette color.

    Eight-way connectivity keeps diagonal pixel-art outlines together. Globally
    dominant sheet colors are treated as matte and never become foreground.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    foreground = bytearray(
        1
        if (red, green, blue) in authored_colors
        and (red, green, blue) not in dominant_colors
        and alpha > 16
        else 0
        for red, green, blue, alpha in rgba.getdata()
    )
    visited = bytearray(width * height)
    components: list[tuple[list[int], bool]] = []
    for start in range(width * height):
        if visited[start] or not foreground[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        pixels: list[int] = []
        touches_border = False
        while queue:
            key = queue.popleft()
            pixels.append(key)
            x, y = key % width, key // width
            touches_border = touches_border or x == 0 or y == 0 or x == width - 1 or y == height - 1
            for ny in range(max(0, y - 1), min(height, y + 2)):
                for nx in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = ny * width + nx
                    if not visited[neighbor] and foreground[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        components.append((pixels, touches_border))
    return components


def align_current_to_source(source_crop: Image.Image, current: Image.Image, min_score: float) -> tuple[int, int, float, float] | None:
    source_rgba = source_crop.convert("RGBA")
    current_rgba = current.convert("RGBA")
    if current.width > source_crop.width or current.height > source_crop.height:
        return None
    source_by_color: dict[RGB, list[tuple[int, int]]] = {}
    source_pixels = source_rgba.load()
    for y in range(source_rgba.height):
        for x in range(source_rgba.width):
            red, green, blue, _ = source_pixels[x, y]
            source_by_color.setdefault((red, green, blue), []).append((x, y))
    opaque: list[tuple[int, int, RGB]] = []
    current_pixels = current_rgba.load()
    for y in range(current_rgba.height):
        for x in range(current_rgba.width):
            red, green, blue, alpha = current_pixels[x, y]
            if alpha > 16:
                opaque.append((x, y, (red, green, blue)))
    if not opaque:
        return None
    anchors = sorted(opaque, key=lambda item: len(source_by_color.get(item[2], [])))[:80]
    votes: Counter[tuple[int, int]] = Counter()
    max_x = source_crop.width - current.width
    max_y = source_crop.height - current.height
    for x, y, color in anchors:
        for source_x, source_y in source_by_color.get(color, []):
            offset = source_x - x, source_y - y
            if 0 <= offset[0] <= max_x and 0 <= offset[1] <= max_y:
                votes[offset] += 1
    scored: list[tuple[float, tuple[int, int]]] = []
    for offset, _ in votes.most_common(40):
        matches = sum(source_pixels[offset[0] + x, offset[1] + y][:3] == color for x, y, color in opaque)
        scored.append((matches / len(opaque), offset))
    if not scored:
        return None
    scored.sort(reverse=True)
    best_score, best = scored[0]
    second_score = scored[1][0] if len(scored) > 1 else 0.0
    # Repeated source poses can produce tied translations inside one saved cell.
    # Exact-color agreement is the safety gate; tied positions are still safe
    # because they reconstruct the same authored sprite pixels.
    if best_score < min_score:
        return None
    return best[0], best[1], best_score, second_score


def expected_silhouette(
    source_crop: Image.Image,
    current: Image.Image,
    authored_colors: set[RGB],
    dominant_colors: set[RGB],
    excluded_colors: set[RGB],
) -> tuple[Image.Image, bytearray, Counter[RGB], list[dict[str, Any]]]:
    width, height = current.size
    # This mask is deliberately immutable for the whole decision. Newly added
    # pixels must never become anchors that can walk into a neighboring sprite.
    existing = alpha_mask(current)
    anchor = primary_alpha_component(existing, width, height)
    expected = bytearray(existing)
    missing_colors: Counter[RGB] = Counter()
    decisions: list[dict[str, Any]] = []
    source_pixels = source_crop.convert("RGBA").load()
    if not any(anchor):
        return current.convert("RGBA").copy(), expected, missing_colors, decisions
    for color, component, touches_border in color_components(source_crop):
        dark_outline = is_dark_outline(color)
        if color in excluded_colors:
            continue
        # Dark outlines are often also the cell matte. They may still be
        # recovered through the conservative silhouette-span gate below.
        if color in dominant_colors and not (dark_outline and color in authored_colors):
            continue
        overlap = sum(anchor[key] for key in component)
        overlap_ratio = overlap / len(component)
        adjacent = any(near_mask(anchor, width, height, key % width, key // width) for key in component)
        authored = color in authored_colors
        keep = False
        confidence = ""
        if authored and overlap:
            keep = not touches_border or overlap_ratio >= 0.60 or (len(component) <= 16 and overlap_ratio >= 0.25)
            confidence = "authored-overlap"
        elif authored and adjacent and (not touches_border or dark_outline):
            keep = True
            # An authored outline color can be connected to a same-colored
            # sheet background when the sprite touches its source-cell edge.
            # The per-pixel primary-span gate below still limits restoration
            # to holes bracketed by the existing body silhouette, so accepting
            # the component here cannot grow into the surrounding matte.
            confidence = "authored-adjacent-silhouette"
        elif not authored and not touches_border and len(component) <= 24 and adjacent:
            keep = True
            confidence = "new-color-small-interior"
        if not keep:
            continue
        accepted: list[int] = []
        span_mask = existing if dark_outline else anchor
        for key in component:
            if existing[key]:
                continue
            x, y = key % width, key // width
            # Automatic repair is interior-only. Source-confirmed pixels must be
            # bracketed by the primary body on a row or column; outer-contour
            # expansion is review work because it can belong to the next cell.
            if not inside_primary_span(span_mask, width, height, x, y):
                continue
            accepted.append(key)
            missing_colors[color] += 1
        if accepted:
            for key in accepted:
                expected[key] = 1
            decisions.append({
                "color": list(color),
                "componentPixels": len(component),
                "missingPixels": len(accepted),
                "touchesBorder": touches_border,
                "overlapPixels": overlap,
                "confidence": confidence,
            })

    candidate = current.convert("RGBA").copy()
    candidate_pixels = candidate.load()
    for key, value in enumerate(expected):
        if value and not existing[key]:
            x, y = key % width, key // width
            red, green, blue, _ = source_pixels[x, y]
            candidate_pixels[x, y] = (red, green, blue, 255)
    return candidate, expected, missing_colors, decisions


def save_proof(path: Path, current: Image.Image, expected: bytearray) -> None:
    width, height = current.size
    scale = max(1, min(5, 160 // max(1, max(width, height))))
    current_mask = alpha_mask(current)
    panels = []
    for mode in ("current", "expected", "missing"):
        panel = Image.new("RGBA", (width, height), (24, 24, 24, 255))
        pixels = panel.load()
        for key in range(width * height):
            x, y = key % width, key // width
            if mode == "current" and current_mask[key]:
                pixels[x, y] = (255, 255, 255, 255)
            elif mode == "expected" and expected[key]:
                pixels[x, y] = (255, 255, 255, 255)
            elif mode == "missing" and expected[key] and not current_mask[key]:
                pixels[x, y] = (255, 40, 40, 255)
        panels.append(panel.resize((width * scale, height * scale), Image.Resampling.NEAREST))
    canvas = Image.new("RGBA", (sum(panel.width for panel in panels) + 16, max(panel.height for panel in panels) + 22), (8, 8, 8, 255))
    draw = ImageDraw.Draw(canvas)
    x = 4
    for label, panel in zip(("current", "source", "missing"), panels):
        draw.text((x, 3), label, fill="white")
        canvas.alpha_composite(panel, (x, 18))
        x += panel.width + 4
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.convert("RGBA").getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()


def rebuild_generated_crouch_blocks(character_dir: Path, metadata: dict[str, Any], changed: set[int]) -> list[int]:
    rebuilt: list[int] = []
    for entry in metadata.get("frames", []):
        sources = entry.get("generatedSources", {})
        crouch_path = sources.get("crouch") if isinstance(sources, dict) else None
        if entry.get("generatedCompositeRole") != "crouchBlock" or not isinstance(crouch_path, str):
            continue
        try:
            crouch_index = int(Path(crouch_path).stem.split("-")[-1])
        except ValueError:
            continue
        if crouch_index not in changed:
            continue
        crouch = Image.open(character_dir / "frames" / f"frame-{crouch_index:03d}.png").convert("RGBA")
        bounds = alpha_bounds(crouch)
        if bounds is not None:
            crouch = crouch.crop(bounds)
        scale = float(entry.get("generatedTransform", {}).get("widthScale", 0.96))
        output = crouch.resize((max(1, round(crouch.width * scale)), crouch.height), Image.Resampling.NEAREST)
        index = int(entry["index"])
        output.save(character_dir / "frames" / f"frame-{index:03d}.png")
        entry["replacementWidth"], entry["replacementHeight"] = output.size
        entry["width"], entry["height"] = output.size
        rebuilt.append(index)
    return rebuilt


def repack_atlas(character_dir: Path, character_id: str, metadata: dict[str, Any]) -> None:
    entries = sorted(metadata.get("frames", []), key=lambda entry: int(entry["index"]))
    images = [Image.open(character_dir / "frames" / f"frame-{int(entry['index']):03d}.png").convert("RGBA") for entry in entries]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width, cell_height = max_width + padding * 2, max_height + padding * 2
    sheet = Image.new("RGBA", (columns * cell_width, math.ceil(len(images) / columns) * cell_height), (0, 0, 0, 0))
    for position, (entry, image) in enumerate(zip(entries, images)):
        column, row = position % columns, position // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        entry["box"] = [x, y, x + image.width, y + image.height]
        entry["width"], entry["height"] = image.size
        entry["row"] = row
        entry["sheetId"] = "generated"
        entry["sheetPath"] = f"/characters/{character_id}/animation-sheet.png"
    sheet.save(character_dir / "animation-sheet.png")
    metadata["count"] = len(entries)
    metadata["sheets"] = [{
        "id": "generated",
        "name": "Generated Frame Atlas",
        "path": f"/characters/{character_id}/animation-sheet.png",
        "frameStart": 0,
        "frameCount": len(entries),
    }]


def audit_character(
    repo: Path,
    character_id: str,
    sources: dict[str, list[Path]],
    preview_root: Path,
    dominant_ratio: float,
    apply: bool,
    include_unaligned: bool,
    alignment_min_score: float,
    global_fallback: bool,
    approved_frames: set[int] | None = None,
    force_selected_frames: bool = False,
) -> dict[str, Any]:
    character_dir = repo / "public" / "characters" / character_id
    metadata = read_json(character_dir / "frames" / "frames.json")
    source_name = metadata.get("source")
    matches = sources.get(source_name, [])
    if len(matches) != 1:
        return {"character": character_id, "status": "missing-or-ambiguous-source"}
    source = Image.open(matches[0]).convert("RGBA")
    source_counts = source_color_counts(source)
    dominant = {color for color, count in source_counts.items() if count >= source.width * source.height * dominant_ratio}
    authored = current_palette(sorted((character_dir / "frames").glob("frame-*.png")))
    changes: list[dict[str, Any]] = []
    review_only: list[dict[str, Any]] = []
    unaligned: list[int] = []
    for entry in metadata.get("frames", []):
        index = int(entry["index"])
        if approved_frames is not None and index not in approved_frames:
            continue
        box = entry.get("sourceBox")
        if entry.get("sourceName") != source_name or not isinstance(box, list) or len(box) != 4:
            continue
        current = Image.open(character_dir / "frames" / f"frame-{index:03d}.png").convert("RGBA")
        crop = source.crop(tuple(int(value) for value in box)).convert("RGBA")
        candidate_source_box = [int(value) for value in box]
        alignment: dict[str, Any] | None = None
        proof_current = current
        if crop.size != current.size:
            if not include_unaligned:
                unaligned.append(index)
                continue
            current_bounds = alpha_bounds(current)
            current_visible = current.crop(current_bounds) if current_bounds is not None else current
            aligned = align_current_to_source(crop, current_visible, alignment_min_score)
            if aligned is None and global_fallback:
                global_alignment = align_current_to_source(source, current_visible, alignment_min_score)
                if global_alignment is not None:
                    global_x, global_y, score, second_score = global_alignment
                    padding = 6
                    left = max(0, global_x - padding)
                    top = max(0, global_y - padding)
                    right = min(source.width, global_x + current_visible.width + padding)
                    bottom = min(source.height, global_y + current_visible.height + padding)
                    crop = source.crop((left, top, right, bottom)).convert("RGBA")
                    box = [left, top, right, bottom]
                    aligned = global_x - left, global_y - top, score, second_score
            if aligned is None:
                unaligned.append(index)
                continue
            offset_x, offset_y, score, second_score = aligned
            canvas = Image.new("RGBA", crop.size, (0, 0, 0, 0))
            canvas.alpha_composite(current_visible, (offset_x, offset_y))
            proof_current = canvas
            candidate, expected, missing, decisions = expected_silhouette(
                crop,
                canvas,
                authored,
                dominant,
                EXACT_KEYS_BY_CHARACTER.get(character_id, set()),
            )
            bounds = alpha_bounds(candidate)
            if bounds is None:
                unaligned.append(index)
                continue
            candidate = candidate.crop(bounds)
            candidate_source_box = [
                int(box[0]) + bounds[0],
                int(box[1]) + bounds[1],
                int(box[0]) + bounds[2],
                int(box[1]) + bounds[3],
            ]
            alignment = {"offset": [offset_x, offset_y], "score": score, "secondScore": second_score}
        else:
            candidate, expected, missing, decisions = expected_silhouette(
                crop,
                current,
                authored,
                dominant,
                EXACT_KEYS_BY_CHARACTER.get(character_id, set()),
            )
        if not missing:
            continue
        missing_total = sum(missing.values())
        opaque_pixels = sum(alpha_mask(proof_current))
        alpha_coverage = opaque_pixels / (proof_current.width * proof_current.height)
        safety_limit = max(32, round(opaque_pixels * 0.05))
        record = {
            "frame": index,
            "missingPixels": missing_total,
            "safetyLimit": safety_limit,
            "alphaCoverage": alpha_coverage,
            "missingColors": [{"rgb": list(color), "pixels": count} for color, count in missing.most_common()],
            "decisions": decisions,
            "alignment": alignment,
            "candidateSourceBox": candidate_source_box,
        }
        if not force_selected_frames and (missing_total > safety_limit or alpha_coverage > 0.65):
            candidate_path = preview_root / character_id / "review-only" / "candidates" / f"frame-{index:03d}.png"
            proof_path = preview_root / character_id / "review-only" / "silhouettes" / f"frame-{index:03d}.png"
            candidate_path.parent.mkdir(parents=True, exist_ok=True)
            candidate.save(candidate_path)
            save_proof(proof_path, proof_current, expected)
            review_only.append(record)
            continue
        candidate_path = preview_root / character_id / "candidates" / f"frame-{index:03d}.png"
        proof_path = preview_root / character_id / "silhouettes" / f"frame-{index:03d}.png"
        candidate_path.parent.mkdir(parents=True, exist_ok=True)
        candidate.save(candidate_path)
        if apply:
            candidate.save(character_dir / "frames" / f"frame-{index:03d}.png")
            entry["sourceBox"] = candidate_source_box
        save_proof(proof_path, proof_current, expected)
        changes.append(record)
    generated: list[int] = []
    if apply and changes:
        changed = {change["frame"] for change in changes}
        generated = rebuild_generated_crouch_blocks(character_dir, metadata, changed)
        repack_atlas(character_dir, character_id, metadata)
        (character_dir / "frames" / "frames.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
    return {
        "character": character_id,
        "status": "candidates" if changes else ("review-only" if review_only else "clean-aligned-frames"),
        "source": str(matches[0]),
        "changedFrames": [change["frame"] for change in changes],
        "missingPixels": sum(change["missingPixels"] for change in changes),
        "reviewOnlyFrames": [change["frame"] for change in review_only],
        "reviewOnlyPixels": sum(change["missingPixels"] for change in review_only),
        "unalignedFrames": unaligned,
        "rebuiltGeneratedFrames": generated,
        "changes": changes,
        "reviewOnly": review_only,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source-root", type=Path, default=Path("/Users/brandonhenry/Documents/Kore/Characters"))
    parser.add_argument("--character", action="append", required=True)
    parser.add_argument("--preview-root", type=Path, default=Path("tmp/source-frame-silhouettes"))
    parser.add_argument("--output", type=Path, default=Path("tmp/source-frame-silhouettes/report.json"))
    parser.add_argument("--dominant-ratio", type=float, default=0.05)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--include-unaligned", action="store_true")
    parser.add_argument("--alignment-min-score", type=float, default=0.70)
    parser.add_argument("--global-fallback", action="store_true")
    parser.add_argument("--approve-review-from", type=Path)
    parser.add_argument("--only-unaligned-from", type=Path)
    args = parser.parse_args()
    repo = args.repo.resolve()
    preview_root = args.preview_root if args.preview_root.is_absolute() else repo / args.preview_root
    sources = index_sources(args.source_root.resolve())
    approved_by_character: dict[str, set[int]] = {}
    if args.approve_review_from:
        approval_report = read_json(args.approve_review_from)
        approved_by_character = {
            report["character"]: set(report.get("reviewOnlyFrames", []))
            for report in approval_report.get("reports", [])
            if report.get("reviewOnlyFrames")
        }
    selected_by_character = approved_by_character
    if args.only_unaligned_from:
        unaligned_report = read_json(args.only_unaligned_from)
        selected_by_character = {
            report["character"]: set(report.get("unalignedFrames", []))
            for report in unaligned_report.get("reports", [])
            if report.get("unalignedFrames")
        }
    reports = [
        audit_character(
            repo,
            character,
            sources,
            preview_root,
            args.dominant_ratio,
            args.apply,
            args.include_unaligned,
            args.alignment_min_score,
            args.global_fallback,
            selected_by_character.get(character, set()) if (args.approve_review_from or args.only_unaligned_from) else None,
            bool(args.approve_review_from),
        )
        for character in sorted(set(args.character))
    ]
    output = args.output if args.output.is_absolute() else repo / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"reports": reports}, indent=2) + "\n")
    print(json.dumps({
        "characters": len(reports),
        "candidateCharacters": sum(bool(report.get("changedFrames")) for report in reports),
        "candidateFrames": sum(len(report.get("changedFrames", [])) for report in reports),
        "missingPixels": sum(int(report.get("missingPixels", 0)) for report in reports),
        "reviewOnlyFrames": sum(len(report.get("reviewOnlyFrames", [])) for report in reports),
        "reviewOnlyPixels": sum(int(report.get("reviewOnlyPixels", 0)) for report in reports),
        "unalignedFrames": sum(len(report.get("unalignedFrames", [])) for report in reports),
    }, indent=2))


if __name__ == "__main__":
    main()
