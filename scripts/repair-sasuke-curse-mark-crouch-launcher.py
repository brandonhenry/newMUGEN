#!/usr/bin/env python3
"""Restore full-body frames in Sasuke Curse Mark's crouch launcher."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image


CHARACTER_ID = "sasuke-curse-mark"
MATTE = (32, 168, 48)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text())


def alpha_crop(image: Image.Image) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("reconstructed frame is empty")
    return image.crop(bounds)


def extract_delta(source: Image.Image, box: list[int]) -> Image.Image:
    delta = source.crop(tuple(box)).convert("RGBA")
    pixels = delta.load()
    for y in range(delta.height):
        for x in range(delta.width):
            red, green, blue, _ = pixels[x, y]
            pixels[x, y] = (red, green, blue, 0 if (red, green, blue) == MATTE else 255)
    return delta


def repack(character_dir: Path, metadata: dict) -> None:
    entries = sorted(metadata["frames"], key=lambda entry: int(entry["index"]))
    images = [
        Image.open(character_dir / "frames" / f"frame-{int(entry['index']):03d}.png").convert("RGBA")
        for entry in entries
    ]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width = max_width + padding * 2
    cell_height = max_height + padding * 2
    sheet = Image.new(
        "RGBA",
        (columns * cell_width, math.ceil(len(images) / columns) * cell_height),
        (0, 0, 0, 0),
    )
    for position, (entry, image) in enumerate(zip(entries, images)):
        column, row = position % columns, position // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        entry["box"] = [x, y, x + image.width, y + image.height]
        entry["width"], entry["height"] = image.size
        entry["row"] = row
        entry["sheetId"] = "generated"
        entry["sheetPath"] = f"/characters/{CHARACTER_ID}/animation-sheet.png"
    sheet.save(character_dir / "animation-sheet.png")


def mark_reconstructed(entry: dict, sources: dict[str, object]) -> None:
    entry.pop("sourceName", None)
    entry.pop("sourceBox", None)
    entry["generatedCompositeRole"] = "source-delta-full-body-recovery"
    entry["generatedSources"] = sources


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--preview", type=Path, default=Path("tmp/sasuke-crouch-launcher-repair"))
    args = parser.parse_args()

    repo = args.repo.resolve()
    character_dir = repo / "public" / "characters" / CHARACTER_ID
    frames_dir = character_dir / "frames"
    metadata_path = frames_dir / "frames.json"
    metadata = load_json(metadata_path)
    entries = {int(entry["index"]): entry for entry in metadata["frames"]}
    source = Image.open(args.source).convert("RGBA")
    preview = args.preview if args.preview.is_absolute() else repo / args.preview
    preview.mkdir(parents=True, exist_ok=True)

    full_startup = Image.open(frames_dir / "frame-167.png").convert("RGBA")
    reconstructed = {index: full_startup.copy() for index in (168, 169, 170)}

    stored_delta_box = entries[171].get("sourceBox") or entries[171].get("generatedSources", {}).get("deltaSourceBox")
    if not isinstance(stored_delta_box, list) or len(stored_delta_box) != 4:
        raise RuntimeError("frame 171 is missing its original delta source box")
    delta_box = [int(value) for value in stored_delta_box]
    delta = extract_delta(source, delta_box)
    curled_base = Image.open(frames_dir / "frame-172.png").convert("RGBA")
    transition = Image.new("RGBA", (48, 50), (0, 0, 0, 0))
    transition.alpha_composite(curled_base, (0, 0))
    transition.alpha_composite(delta, (3, 3))
    reconstructed[171] = alpha_crop(transition)

    for index, image in reconstructed.items():
        image.save(preview / f"frame-{index:03d}.png")
        if args.apply:
            image.save(frames_dir / f"frame-{index:03d}.png")

    if args.apply:
        for index in (168, 169, 170):
            mark_reconstructed(
                entries[index],
                {"base": f"/characters/{CHARACTER_ID}/frames/frame-167.png"},
            )
        mark_reconstructed(
            entries[171],
            {
                "base": f"/characters/{CHARACTER_ID}/frames/frame-172.png",
                "deltaSource": args.source.name,
                "deltaSourceBox": delta_box,
                "deltaOffset": [3, 3],
            },
        )
        repack(character_dir, metadata)
        metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")

    print(json.dumps({"mode": "apply" if args.apply else "preview", "frames": sorted(reconstructed)}, indent=2))


if __name__ == "__main__":
    main()
