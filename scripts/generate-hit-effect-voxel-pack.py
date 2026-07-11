#!/usr/bin/env python3
"""Build the compact KORE voxel hit-effect pack from the supplied sprite sheets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


FRAME_SIZE = 48
FRAME_COUNT = 7
VARIANTS = (
    ("orange", "Hit Effect 01 1.png"),
    ("blue", "Hit Effect 01 2.png"),
    ("green", "Hit Effect 01 3.png"),
)


def build_variant(source_dir: Path, variant_id: str, filename: str) -> dict[str, object]:
    image = Image.open(source_dir / filename).convert("RGBA")
    expected_size = (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE)
    if image.size != expected_size:
        raise ValueError(f"{filename} must be {expected_size[0]}x{expected_size[1]}, got {image.size[0]}x{image.size[1]}")

    palette: list[list[int]] = []
    palette_indices: dict[tuple[int, int, int, int], int] = {}
    frames: list[list[list[int]]] = []
    frame_bounds: list[list[int] | None] = []
    for frame_index in range(FRAME_COUNT):
        frame: list[list[int]] = []
        x_offset = frame_index * FRAME_SIZE
        for y in range(FRAME_SIZE):
            for x in range(FRAME_SIZE):
                color = image.getpixel((x_offset + x, y))
                if color[3] <= 8:
                    continue
                palette_index = palette_indices.get(color)
                if palette_index is None:
                    palette_index = len(palette)
                    palette_indices[color] = palette_index
                    palette.append(list(color))
                frame.append([x, y, palette_index])
        frames.append(frame)
        frame_bounds.append(
            [
                min(pixel[0] for pixel in frame),
                min(pixel[1] for pixel in frame),
                max(pixel[0] for pixel in frame),
                max(pixel[1] for pixel in frame),
            ]
            if frame
            else None
        )

    return {
        "id": variant_id,
        "source": filename,
        "palette": palette,
        "frames": frames,
        "frameBounds": frame_bounds,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_dir", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/assets/hit-effect-01.voxels.json"),
    )
    args = parser.parse_args()

    payload = {
        "version": 2,
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "fps": 30,
        "normalization": {
            "coordinateSpace": "full-frame",
            "pixelAspect": 1,
            "maxFrameSpan": FRAME_SIZE,
        },
        "variants": [build_variant(args.source_dir, *variant) for variant in VARIANTS],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
