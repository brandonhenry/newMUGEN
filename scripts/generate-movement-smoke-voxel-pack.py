#!/usr/bin/env python3
"""Build the compact KORE movement-smoke voxel pack from Smoke FX Lite sheets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


STYLES = (
    ("speed-trail", "SmokeFX Lite SpriteSheet 1A-1.png", 64, 9),
    ("soft-puff", "SmokeFX Lite SpriteSheet 2A-1.png", 64, 6),
    ("burst-puff", "SmokeFX Lite SpriteSheet 3A-5.png", 64, 6),
    ("dust-ring", "SmokeFX Lite SpriteSheet 4A-1.png", 224, 18),
)


def build_style(source_dir: Path, style_id: str, filename: str, frame_width: int, frame_count: int) -> dict[str, object]:
    image = Image.open(source_dir / filename).convert("RGBA")
    if image.width != frame_width * frame_count:
        raise ValueError(f"{filename} width must be {frame_width * frame_count}, got {image.width}")

    palette: list[list[int]] = []
    palette_indices: dict[tuple[int, int, int, int], int] = {}
    frames: list[list[list[int]]] = []
    frame_bounds: list[list[int] | None] = []
    for frame_index in range(frame_count):
        frame: list[list[int]] = []
        x_offset = frame_index * frame_width
        for y in range(image.height):
            for x in range(frame_width):
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
        "id": style_id,
        "source": filename,
        "frameWidth": frame_width,
        "frameHeight": image.height,
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
        default=Path("src/assets/movement-smoke.voxels.json"),
    )
    args = parser.parse_args()
    payload = {
        "version": 2,
        "normalization": {
            "coordinateSpace": "full-frame",
            "pixelAspect": 1,
        },
        "styles": [build_style(args.source_dir, *style) for style in STYLES],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {args.output} ({args.output.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
