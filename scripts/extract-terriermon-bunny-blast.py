#!/usr/bin/env python3
"""Split Terriermon's embedded Bunny Blast art from its firing poses."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image


REPO = Path(__file__).resolve().parents[1]
CHARACTER = REPO / "public" / "characters" / "terriermon"
SHEET = CHARACTER / "animation-sheet.png"
FRAMES_METADATA = CHARACTER / "frames" / "frames.json"
PROJECTILE_ID = "bunny-blast-projectile"
SOURCE_FRAME_INDICES = [220, 222, 224, 226]
ALPHA_THRESHOLD = 24


def alpha_components(image: Image.Image) -> list[list[tuple[int, int]]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    alpha = rgba.getchannel("A")
    visited: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if (x, y) in visited or alpha.getpixel((x, y)) <= ALPHA_THRESHOLD:
                continue
            queue = deque([(x, y)])
            visited.add((x, y))
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for offset_y in (-1, 0, 1):
                    for offset_x in (-1, 0, 1):
                        if offset_x == 0 and offset_y == 0:
                            continue
                        next_x = current_x + offset_x
                        next_y = current_y + offset_y
                        key = (next_x, next_y)
                        if not (0 <= next_x < width and 0 <= next_y < height) or key in visited:
                            continue
                        if alpha.getpixel(key) <= ALPHA_THRESHOLD:
                            continue
                        visited.add(key)
                        queue.append(key)
            components.append(component)
    return sorted(components, key=len, reverse=True)


def isolate(image: Image.Image, pixels: set[tuple[int, int]], padding: int = 0) -> Image.Image:
    rgba = image.convert("RGBA")
    output = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    source_pixels = rgba.load()
    output_pixels = output.load()
    for x, y in pixels:
        output_pixels[x, y] = source_pixels[x, y]
    bounds = output.getbbox()
    if bounds is None:
        raise RuntimeError("Component extraction produced an empty image")
    left, top, right, bottom = bounds
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(output.width, right + padding)
    bottom = min(output.height, bottom + padding)
    return output.crop((left, top, right, bottom))


def main() -> None:
    metadata = json.loads(FRAMES_METADATA.read_text())
    by_index = {int(entry["index"]): entry for entry in metadata.get("frames", [])}
    sheet = Image.open(SHEET).convert("RGBA")
    projectile_root = CHARACTER / "projectiles" / PROJECTILE_ID
    projectile_frames = projectile_root / "frames"
    projectile_source = projectile_root / "source"
    projectile_frames.mkdir(parents=True, exist_ok=True)
    projectile_source.mkdir(parents=True, exist_ok=True)

    source_entries: list[dict[str, object]] = []
    for output_index, frame_index in enumerate(SOURCE_FRAME_INDICES):
        entry = by_index.get(frame_index)
        if not entry or not isinstance(entry.get("box"), list) or len(entry["box"]) != 4:
            raise RuntimeError(f"Missing source box for Terriermon frame {frame_index}")
        left, top, right, bottom = (int(value) for value in entry["box"])
        combined = sheet.crop((left, top, right, bottom))
        components = alpha_components(combined)
        if len(components) < 2:
            raise RuntimeError(f"Terriermon frame {frame_index} has no detachable projectile components")

        body_pixels = set(components[0])
        projectile_pixels = {pixel for component in components[1:] for pixel in component}
        body = isolate(combined, body_pixels)
        projectile = isolate(combined, projectile_pixels, padding=1)
        body_path = CHARACTER / "frames" / f"frame-{frame_index:03d}.png"
        projectile_path = projectile_frames / f"frame-{output_index:03d}.png"
        body.save(body_path, optimize=True)
        projectile.save(projectile_path, optimize=True)
        source_entries.append({
            "index": frame_index,
            "path": f"/characters/terriermon/frames/frame-{frame_index:03d}.png",
            "sourceBox": [left, top, right, bottom],
            "bodyPixels": len(components[0]),
            "projectileComponents": len(components) - 1,
            "projectilePixels": sum(len(component) for component in components[1:]),
            "projectileOutput": f"/characters/terriermon/projectiles/{PROJECTILE_ID}/frames/frame-{output_index:03d}.png",
        })

    source_metadata = {
        "characterId": "terriermon",
        "assetId": PROJECTILE_ID,
        "classification": "projectile",
        "source": "Terriermon original sprite sheet",
        "sourceSheetPath": "/characters/terriermon/animation-sheet.png",
        "extraction": "largest alpha component retained as fighter; detached alpha components extracted as Bunny Blast",
        "sourceFrames": source_entries,
        "matchedMoves": ["kickleft"],
    }
    (projectile_source / "source.json").write_text(json.dumps(source_metadata, indent=2) + "\n")
    print(f"split={len(SOURCE_FRAME_INDICES)} projectile={PROJECTILE_ID}")


if __name__ == "__main__":
    main()
