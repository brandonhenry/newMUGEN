#!/usr/bin/env python3
"""Restore source palette colors erased by over-broad frame transparency keying.

This intentionally handles only frames whose saved source box has the same size
as the extracted PNG. Large source cells and generated frames remain manual
review items because they require character-specific cropping decisions.
"""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
from typing import Any

from PIL import Image


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def source_index(root: Path) -> dict[str, list[Path]]:
    result: dict[str, list[Path]] = {}
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in {".png", ".gif"}:
            result.setdefault(path.name, []).append(path)
    return result


def opaque_palette(frame_paths: list[Path]) -> set[tuple[int, int, int]]:
    colors: set[tuple[int, int, int]] = set()
    for path in frame_paths:
        for red, green, blue, alpha in Image.open(path).convert("RGBA").getdata():
            if alpha > 16:
                colors.add((red, green, blue))
    return colors


def dominant_source_colors(source: Image.Image, ratio: float) -> set[tuple[int, int, int]]:
    counts = Counter((red, green, blue) for red, green, blue, _ in source.convert("RGBA").getdata())
    threshold = source.width * source.height * ratio
    return {color for color, count in counts.items() if count >= threshold}


def repair_character(
    repo: Path,
    character_id: str,
    sources: dict[str, list[Path]],
    preview_root: Path,
    apply: bool,
    dominant_ratio: float,
    interior_only: bool,
) -> dict[str, Any]:
    character_dir = repo / "public" / "characters" / character_id
    metadata = load_json(character_dir / "frames" / "frames.json")
    source_name = metadata.get("source")
    matches = sources.get(source_name, [])
    if len(matches) != 1:
        return {"character": character_id, "status": "missing-or-ambiguous-source", "matches": [str(path) for path in matches]}
    source = Image.open(matches[0]).convert("RGBA")
    frame_paths = sorted((character_dir / "frames").glob("frame-*.png"))
    authored = opaque_palette(frame_paths)
    dominant = dominant_source_colors(source, dominant_ratio)
    changes: list[dict[str, Any]] = []

    for entry in metadata.get("frames", []):
        index = int(entry["index"])
        source_box = entry.get("sourceBox")
        if entry.get("sourceName") != source_name or not isinstance(source_box, list) or len(source_box) != 4:
            continue
        frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
        if not frame_path.exists():
            continue
        current = Image.open(frame_path).convert("RGBA")
        crop = source.crop(tuple(int(value) for value in source_box)).convert("RGBA")
        if crop.size != current.size:
            continue
        candidate = current.copy()
        candidate_pixels = candidate.load()
        current_pixels = current.load()
        crop_pixels = crop.load()
        restored = Counter()
        for y in range(current.height):
            for x in range(current.width):
                if current_pixels[x, y][3] > 16:
                    continue
                red, green, blue, _ = crop_pixels[x, y]
                color = (red, green, blue)
                bracketed = (
                    any(x - distance >= 0 and current_pixels[x - distance, y][3] > 16 for distance in range(1, 4))
                    and any(x + distance < current.width and current_pixels[x + distance, y][3] > 16 for distance in range(1, 4))
                ) or (
                    any(y - distance >= 0 and current_pixels[x, y - distance][3] > 16 for distance in range(1, 4))
                    and any(y + distance < current.height and current_pixels[x, y + distance][3] > 16 for distance in range(1, 4))
                )
                if color in authored and color not in dominant and (not interior_only or bracketed):
                    candidate_pixels[x, y] = (red, green, blue, 255)
                    restored[color] += 1
        if not restored:
            continue
        output = preview_root / character_id / f"frame-{index:03d}.png"
        output.parent.mkdir(parents=True, exist_ok=True)
        candidate.save(output)
        if apply:
            candidate.save(frame_path)
        changes.append({
            "frame": index,
            "restoredPixels": sum(restored.values()),
            "colors": [{"rgb": list(color), "pixels": count} for color, count in restored.most_common()],
        })
    return {
        "character": character_id,
        "status": "repaired" if apply and changes else "candidates" if changes else "clean",
        "source": str(matches[0]),
        "dominantExcludedColors": [list(color) for color in sorted(dominant)],
        "changedFrames": [change["frame"] for change in changes],
        "restoredPixels": sum(change["restoredPixels"] for change in changes),
        "changes": changes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source-root", type=Path, default=Path("/Users/brandonhenry/Documents/Kore/Characters"))
    parser.add_argument("--character", action="append", required=True)
    parser.add_argument("--preview-root", type=Path, default=Path("tmp/source-frame-palette-loss/previews"))
    parser.add_argument("--output", type=Path, default=Path("tmp/source-frame-palette-loss/report.json"))
    parser.add_argument("--dominant-ratio", type=float, default=0.05)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--interior-only", action="store_true")
    args = parser.parse_args()

    repo = args.repo.resolve()
    preview_root = args.preview_root if args.preview_root.is_absolute() else repo / args.preview_root
    sources = source_index(args.source_root.resolve())
    reports = [
        repair_character(repo, character_id, sources, preview_root, args.apply, args.dominant_ratio, args.interior_only)
        for character_id in sorted(set(args.character))
    ]
    output = args.output if args.output.is_absolute() else repo / args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"mode": "apply" if args.apply else "preview", "reports": reports}, indent=2) + "\n")
    print(json.dumps({
        "mode": "apply" if args.apply else "preview",
        "characters": len(reports),
        "candidateCharacters": sum(bool(report.get("changedFrames")) for report in reports),
        "changedFrames": sum(len(report.get("changedFrames", [])) for report in reports),
        "restoredPixels": sum(int(report.get("restoredPixels", 0)) for report in reports),
    }, indent=2))


if __name__ == "__main__":
    main()
