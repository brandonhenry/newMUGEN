#!/usr/bin/env python3
"""Import the reviewed door animation and CC0 arcade cabinet for story worlds."""

from __future__ import annotations

import hashlib
import io
import json
import urllib.request
from collections import deque
from pathlib import Path

from PIL import Image


DOOR_SOURCE = Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T/codex-clipboard-59c765d6-cedd-47a2-82eb-8a8f90c24f31.png")
DOOR_SHA256 = "cd274b50d7744ca9bdfc132ddf51bdfa7a9bef0562bef3c9a857bc4543e25975"
DOOR_ROOT = Path("public/story/hub/door-transitions")
DOOR_CROPS = [
    (798, 62, 903, 207),
    (907, 62, 1012, 207),
    (1016, 62, 1121, 207),
    (1125, 62, 1230, 207),
    (1235, 62, 1340, 207),
    (1343, 62, 1448, 207),
]

ARCADE_URL = "https://opengameart.org/sites/default/files/sRedArcade_strip16.png"
ARCADE_PAGE = "https://opengameart.org/content/animated-red-arcade-cabinet"
ARCADE_SHA256 = "c852cbdda33034824ede24357fc9296e9a840ae0d70e33f59446ce1e406192d3"
ARCADE_ROOT = Path("public/story/hub/arcade-machines")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def transparent_edge_background(image: Image.Image, tolerance: int = 22) -> Image.Image:
    """Remove only source-background pixels connected to the crop edge.

    Keeping the operation edge-connected protects black doorway interiors and
    all enclosed highlights while removing compression-colored gray halos.
    """
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    background = image.convert("RGB").getpixel((0, 0))
    queue: deque[tuple[int, int]] = deque()
    visited: set[tuple[int, int]] = set()
    for x in range(width):
        queue.extend(((x, 0), (x, height - 1)))
    for y in range(height):
        queue.extend(((0, y), (width - 1, y)))
    while queue:
        x, y = queue.popleft()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        red, green, blue, _ = pixels[x, y]
        if max(abs(red - background[0]), abs(green - background[1]), abs(blue - background[2])) > tolerance:
            continue
        pixels[x, y] = (red, green, blue, 0)
        if x > 0:
            queue.append((x - 1, y))
        if x + 1 < width:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y + 1 < height:
            queue.append((x, y + 1))
    return rgba


def import_doors() -> dict[str, object]:
    data = DOOR_SOURCE.read_bytes()
    if sha256(data) != DOOR_SHA256:
        raise ValueError("Supplied mode-world door sheet checksum changed")
    source = Image.open(io.BytesIO(data)).convert("RGBA")
    DOOR_ROOT.mkdir(parents=True, exist_ok=True)
    files: list[dict[str, object]] = []
    for index, crop in enumerate(DOOR_CROPS):
        frame = transparent_edge_background(source.crop(crop))
        output = DOOR_ROOT / f"frame-{index}.png"
        frame.save(output, optimize=True)
        files.append({"file": output.name, "size": list(frame.size), "sha256": sha256(output.read_bytes())})
    manifest = {
        "id": "kore-mode-door-v1",
        "license": "project-input",
        "sourceFile": DOOR_SOURCE.name,
        "sourceSha256": DOOR_SHA256,
        "frameOrder": "closed-to-open",
        "files": files,
    }
    (DOOR_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (DOOR_ROOT / "SOURCE.md").write_text(
        "# K.O.R.E. Mode Door\n\n"
        "Six-frame futuristic door animation imported from the user-supplied reference sheet. "
        "The source gray is removed only when edge-connected, preserving all enclosed doorway pixels.\n\n"
        f"- Source SHA-256: `{DOOR_SHA256}`\n"
    )
    return manifest


def arcade_source() -> bytes:
    cached = Path("/tmp/kore-red-arcade.png")
    if cached.exists() and sha256(cached.read_bytes()) == ARCADE_SHA256:
        return cached.read_bytes()
    with urllib.request.urlopen(ARCADE_URL, timeout=60) as response:
        data = response.read()
    if sha256(data) != ARCADE_SHA256:
        raise ValueError("Reviewed CC0 arcade cabinet checksum changed")
    cached.write_bytes(data)
    return data


def import_arcade() -> dict[str, object]:
    source_data = arcade_source()
    strip = Image.open(io.BytesIO(source_data)).convert("RGBA")
    if strip.size != (512, 32):
        raise ValueError(f"Unexpected cabinet strip size: {strip.size}")
    ARCADE_ROOT.mkdir(parents=True, exist_ok=True)
    files: list[dict[str, object]] = []
    for index in range(16):
        frame = strip.crop((index * 32, 0, (index + 1) * 32, 32))
        output = ARCADE_ROOT / f"red-{index:02d}.png"
        frame.save(output, optimize=True)
        files.append({"file": output.name, "size": [32, 32], "sha256": sha256(output.read_bytes())})
    manifest = {
        "id": "animated-red-arcade-cabinet",
        "author": "XenosNS",
        "license": "CC0-1.0",
        "sourcePage": ARCADE_PAGE,
        "sourceFile": ARCADE_URL,
        "sourceSha256": ARCADE_SHA256,
        "files": files,
    }
    (ARCADE_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (ARCADE_ROOT / "SOURCE.md").write_text(
        "# Animated Red Arcade Cabinet\n\n"
        "Animated 32 px cabinet by XenosNS, downloaded from OpenGameArt and released under CC0 1.0.\n\n"
        f"- Source: {ARCADE_PAGE}\n"
        f"- Source SHA-256: `{ARCADE_SHA256}`\n"
        "- License: https://creativecommons.org/publicdomain/zero/1.0/\n"
    )
    return manifest


if __name__ == "__main__":
    doors = import_doors()
    arcade = import_arcade()
    print(f"Imported {len(doors['files'])} door frames and {len(arcade['files'])} arcade frames")
