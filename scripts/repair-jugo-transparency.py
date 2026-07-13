#!/usr/bin/env python3
"""Rebuild Jugo's frames from the intact sheet without fuzzy chroma keying.

Jugo's source uses exact magenta cell mattes on an exact green sheet matte.
The generic transparency repair cannot safely recover this character because a
generated atlas was once mistaken for the original sheet, leaving invalid
``sourceBox`` coordinates on part of the frame set.  Re-detect the source cells,
clear only the two exact matte colors, and preserve every other authored pixel.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys
from typing import Any

from PIL import Image


CHARACTER_ID = "jugo"
EXPECTED_SOURCE_CELLS = 149
AUTHORED_FRAME_COUNT = 145
PORTRAIT_SOURCE_CELL = 147
GENERATED_CROUCH_FRAME = 145
GENERATED_CROUCH_SOURCE = 35
MATTE_COLORS = {(248, 0, 248), (87, 136, 102)}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def load_detector(repo: Path):
    scripts = repo / "scripts"
    sys.path.insert(0, str(scripts))
    path = scripts / "batch-import-kore-characters.py"
    spec = importlib.util.spec_from_file_location("kore_batch_import", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def exact_matte_crop(source: Image.Image, box: tuple[int, int, int, int]) -> tuple[Image.Image, list[int]]:
    crop = source.crop(box).convert("RGBA")
    pixels = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 0 and (red, green, blue) in MATTE_COLORS:
                pixels[x, y] = (red, green, blue, 0)
    bounds = crop.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError(f"Jugo source cell {box} became empty after exact matte removal")
    left, top, right, bottom = bounds
    source_box = [box[0] + left, box[1] + top, box[0] + right, box[1] + bottom]
    return crop.crop(bounds), source_box


def build_frames(repo: Path, source_path: Path) -> tuple[list[Image.Image], list[list[int]], list[int]]:
    detector = load_detector(repo)
    source = detector.load_source_image(source_path)
    entries, excluded = detector.filtered_projection_boxes(source, CHARACTER_ID)
    if excluded:
        raise RuntimeError(f"Unexpected excluded Jugo source cells: {len(excluded)}")
    if len(entries) != EXPECTED_SOURCE_CELLS:
        raise RuntimeError(
            f"Expected {EXPECTED_SOURCE_CELLS} Jugo source cells, detected {len(entries)}; refusing a shifted rebuild"
        )

    frames: list[Image.Image] = []
    source_boxes: list[list[int]] = []
    rows: list[int] = []
    source_indices = [*range(AUTHORED_FRAME_COUNT - 1), PORTRAIT_SOURCE_CELL]
    for source_index in source_indices:
        entry = entries[source_index]
        image, source_box = exact_matte_crop(source, tuple(int(value) for value in entry["box"]))
        frames.append(image)
        source_boxes.append(source_box)
        rows.append(int(entry.get("row", 0)))

    crouch = frames[GENERATED_CROUCH_SOURCE]
    generated = crouch.resize((max(1, round(crouch.width * 0.96)), crouch.height), Image.Resampling.NEAREST)
    frames.append(generated)
    source_boxes.append([])
    rows.append(rows[-1])
    return frames, source_boxes, rows


def repack_atlas(character_dir: Path, frames: list[Image.Image], metadata: dict[str, Any]) -> None:
    max_width = max(image.width for image in frames)
    max_height = max(image.height for image in frames)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(frames)))))
    cell_width = max_width + padding * 2
    cell_height = max_height + padding * 2
    sheet = Image.new(
        "RGBA",
        (columns * cell_width, math.ceil(len(frames) / columns) * cell_height),
        (0, 0, 0, 0),
    )
    by_index = {int(frame["index"]): frame for frame in metadata["frames"]}
    for index, image in enumerate(frames):
        column, row = index % columns, index // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        frame = by_index[index]
        frame.update(
            {
                "path": f"/characters/{CHARACTER_ID}/frames/frame-{index:03d}.png",
                "sheetId": "generated",
                "sheetPath": f"/characters/{CHARACTER_ID}/animation-sheet.png",
                "box": [x, y, x + image.width, y + image.height],
                "width": image.width,
                "height": image.height,
            }
        )
    sheet.save(character_dir / "animation-sheet.png")
    metadata["count"] = len(frames)
    metadata["sheets"] = [
        {
            "id": "generated",
            "name": "Generated Frame Atlas",
            "path": f"/characters/{CHARACTER_ID}/animation-sheet.png",
            "frameStart": 0,
            "frameCount": len(frames),
        }
    ]


def refresh_face_card(character_dir: Path, first_frame: Image.Image) -> None:
    card = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    scale = min(210 / first_frame.width, 220 / first_frame.height, 4)
    scaled = first_frame.resize(
        (max(1, round(first_frame.width * scale)), max(1, round(first_frame.height * scale))),
        Image.Resampling.NEAREST,
    )
    card.alpha_composite(scaled, ((256 - scaled.width) // 2, max(8, 256 - scaled.height - 18)))
    card.save(character_dir / "face-card.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("/Users/brandonhenry/Documents/Kore/Characters/Naruto Universe/Jugo/Jugo.png"),
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    repo = args.repo.resolve()
    source_path = args.source.resolve()
    character_dir = repo / "public" / "characters" / CHARACTER_ID
    metadata_path = character_dir / "frames" / "frames.json"
    metadata = read_json(metadata_path)
    frames, source_boxes, rows = build_frames(repo, source_path)
    if len(frames) != len(metadata.get("frames", [])):
        raise RuntimeError(f"Generated {len(frames)} frames for metadata containing {len(metadata.get('frames', []))}")

    changed: list[int] = []
    opaque_before = 0
    opaque_after = 0
    for index, candidate in enumerate(frames):
        frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
        current = Image.open(frame_path).convert("RGBA")
        opaque_before += sum(alpha > 16 for alpha in current.getchannel("A").tobytes())
        opaque_after += sum(alpha > 16 for alpha in candidate.getchannel("A").tobytes())
        if current.size != candidate.size or current.tobytes() != candidate.tobytes():
            changed.append(index)

    print(
        json.dumps(
            {
                "mode": "apply" if args.apply else "dry-run",
                "sourceCells": EXPECTED_SOURCE_CELLS,
                "frames": len(frames),
                "changedFrames": len(changed),
                "changedFrameIndices": changed,
                "opaquePixelsBefore": opaque_before,
                "opaquePixelsAfter": opaque_after,
            },
            indent=2,
        )
    )
    if not args.apply:
        return

    by_index = {int(frame["index"]): frame for frame in metadata["frames"]}
    for index, image in enumerate(frames):
        image.save(character_dir / "frames" / f"frame-{index:03d}.png")
        frame = by_index[index]
        if index < AUTHORED_FRAME_COUNT:
            frame["sourceName"] = source_path.name
            frame["sourceBox"] = source_boxes[index]
            frame["row"] = rows[index]
        else:
            frame.pop("sourceBox", None)
    repack_atlas(character_dir, frames, metadata)
    write_json(metadata_path, metadata)
    refresh_face_card(character_dir, frames[0])


if __name__ == "__main__":
    main()
