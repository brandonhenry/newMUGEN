#!/usr/bin/env python3
"""Re-extract Ino's source-backed frames without palette-destructive keying."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

from PIL import Image


SOURCE_NAME = "Ino Yamanaka.png"
TEAL_MATTE = (0, 128, 128)
STANDARD_MATTE = (56, 192, 48)
SPECIAL_MATTE = (0, 240, 0)
FINAL_MATTE = (0, 160, 0)


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    return image.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()


def rebuild_frame(source: Image.Image, box: list[int], index: int, current: Image.Image) -> Image.Image:
    crop = source.crop(tuple(box)).convert("RGBA")
    pixels = crop.load()
    current_pixels = current.convert("RGBA").load()

    if index <= 131:
        matte_colors = {STANDARD_MATTE, TEAL_MATTE}
    elif index <= 142:
        matte_colors = {SPECIAL_MATTE, TEAL_MATTE}
    else:
        matte_colors = {FINAL_MATTE, TEAL_MATTE}

    for y in range(crop.height):
        for x in range(crop.width):
            red, green, blue, _ = pixels[x, y]
            color = (red, green, blue)
            alpha = 255
            if color in matte_colors:
                alpha = 0
            elif index <= 131 and color == (0, 0, 0):
                # The tight source boxes sometimes include a black row divider.
                # Keep black sprite outlines exactly where the prior mask proves
                # they are authored, while dropping divider pixels.
                alpha = current_pixels[x, y][3]
            pixels[x, y] = (red, green, blue, alpha)

    bounds = alpha_bounds(crop)
    if bounds is None:
        raise RuntimeError(f"frame {index:03d} became empty")
    return crop.crop(bounds)


def repack(character_dir: Path, metadata: dict) -> None:
    frames = sorted(metadata["frames"], key=lambda entry: int(entry["index"]))
    images = [Image.open(character_dir / "frames" / f"frame-{int(entry['index']):03d}.png").convert("RGBA") for entry in frames]
    max_width = max(image.width for image in images)
    max_height = max(image.height for image in images)
    padding = 4
    columns = min(12, max(1, math.ceil(math.sqrt(len(images)))))
    cell_width = max_width + padding * 2
    cell_height = max_height + padding * 2
    sheet = Image.new("RGBA", (columns * cell_width, math.ceil(len(images) / columns) * cell_height), (0, 0, 0, 0))
    for position, (entry, image) in enumerate(zip(frames, images)):
        column, row = position % columns, position // columns
        x = column * cell_width + padding + (max_width - image.width) // 2
        y = row * cell_height + padding + max_height - image.height
        sheet.alpha_composite(image, (x, y))
        entry["box"] = [x, y, x + image.width, y + image.height]
        entry["width"], entry["height"] = image.size
        entry["row"] = row
        entry["sheetId"] = "generated"
        entry["sheetPath"] = "/characters/ino-yamanaka/animation-sheet.png"
    sheet.save(character_dir / "animation-sheet.png")
    metadata["count"] = len(frames)
    metadata["sheets"] = [{
        "id": "generated",
        "name": "Generated Frame Atlas",
        "path": "/characters/ino-yamanaka/animation-sheet.png",
        "frameStart": 0,
        "frameCount": len(frames),
    }]


def rebuild_generated_crouch_block(character_dir: Path, metadata: dict) -> int | None:
    entry = next(
        (
            item
            for item in metadata["frames"]
            if item.get("generatedCompositeRole") == "crouchBlock"
            and item.get("generatedSources", {}).get("crouch")
        ),
        None,
    )
    if entry is None:
        return None
    crouch_index = int(Path(entry["generatedSources"]["crouch"]).stem.split("-")[-1])
    crouch = Image.open(character_dir / "frames" / f"frame-{crouch_index:03d}.png").convert("RGBA")
    bounds = alpha_bounds(crouch)
    if bounds is not None:
        crouch = crouch.crop(bounds)
    width_scale = float(entry.get("generatedTransform", {}).get("widthScale", 0.96))
    width = max(1, round(crouch.width * width_scale))
    output = crouch.resize((width, crouch.height), Image.Resampling.NEAREST)
    index = int(entry["index"])
    output.save(character_dir / "frames" / f"frame-{index:03d}.png")
    entry["replacementWidth"], entry["replacementHeight"] = output.size
    entry["width"], entry["height"] = output.size
    return index


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--preview", type=Path, default=Path("tmp/ino-source-frame-repair"))
    args = parser.parse_args()

    repo = args.repo.resolve()
    character_dir = repo / "public" / "characters" / "ino-yamanaka"
    metadata_path = character_dir / "frames" / "frames.json"
    metadata = json.loads(metadata_path.read_text())
    source = Image.open(args.source).convert("RGBA")
    preview_dir = args.preview if args.preview.is_absolute() else repo / args.preview
    preview_dir.mkdir(parents=True, exist_ok=True)
    changed: list[int] = []

    for entry in metadata["frames"]:
        index = int(entry["index"])
        if entry.get("sourceName") != SOURCE_NAME or not isinstance(entry.get("sourceBox"), list):
            continue
        current_path = character_dir / "frames" / f"frame-{index:03d}.png"
        current = Image.open(current_path).convert("RGBA")
        candidate = rebuild_frame(source, entry["sourceBox"], index, current)
        if current.size == candidate.size and current.tobytes() == candidate.tobytes():
            continue
        candidate.save(preview_dir / f"frame-{index:03d}.png")
        changed.append(index)
        if args.apply:
            candidate.save(current_path)

    if args.apply and changed:
        generated_index = rebuild_generated_crouch_block(character_dir, metadata)
        if generated_index is not None:
            changed.append(generated_index)
        repack(character_dir, metadata)
        metadata_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")

    print(json.dumps({"mode": "apply" if args.apply else "preview", "changedFrames": changed, "count": len(changed)}, indent=2))


if __name__ == "__main__":
    main()
