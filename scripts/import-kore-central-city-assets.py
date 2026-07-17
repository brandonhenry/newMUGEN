#!/usr/bin/env python3
"""Import the CC0 Warped City 2 environment used by K.O.R.E. Central."""

from __future__ import annotations

import hashlib
import io
import json
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image


SOURCE_URL = "https://opengameart.org/sites/default/files/cyberpunk_city_2_files.zip"
SOURCE_PAGE = "https://opengameart.org/content/warped-city-2"
SOURCE_SHA256 = "f584233c8543e3048b6e51881ea576294987e431a18bbd00e9a433c96b89abac"
ROOT = Path("public/story/hub/warped-city-2")
PREFIX = "cyberpunk city 2 files/Environment/"
ASSETS = {
    "background/back.png": "city-back.png",
    "background/middle.png": "city-middle.png",
    "background/front.png": "city-front.png",
    "background/cyberpunk-city-2-back-preview.png": "city-preview.png",
    "props/banner-a/banner-a1.png": "banner-wide.png",
    "props/banner-b/banner-b1.png": "banner-tall.png",
    "props/banner-c/banner-c1.png": "banner-screen.png",
    "props/banner-d/banner-d1.png": "banner-small.png",
    "props/banner-e/banner-e1.png": "banner-pole.png",
    "props/lights/lights1.png": "street-light.png",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download() -> bytes:
    cached = Path("/tmp/kore-warped-city-2.zip")
    if cached.exists():
        data = cached.read_bytes()
        if sha256(data) == SOURCE_SHA256:
            return data
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
        data = response.read()
    if sha256(data) != SOURCE_SHA256:
        raise ValueError("Warped City 2 archive checksum did not match the reviewed CC0 source")
    cached.write_bytes(data)
    return data


def save_png(data: bytes, path: Path) -> None:
    image = Image.open(io.BytesIO(data)).convert("RGBA")
    image.save(path, optimize=True)


def build() -> None:
    archive = download()
    ROOT.mkdir(parents=True, exist_ok=True)
    outputs: list[dict[str, object]] = []
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        for source_name, output_name in ASSETS.items():
            data = bundle.read(PREFIX + source_name)
            output_path = ROOT / output_name
            save_png(data, output_path)
            image = Image.open(output_path)
            outputs.append({"file": output_name, "size": list(image.size), "sha256": sha256(output_path.read_bytes())})

        tileset = Image.open(io.BytesIO(bundle.read(PREFIX + "tileset.png"))).convert("RGBA")
        # The first 64 px are the pack's exact horizontal period. Cropping a
        # longer, partial period creates a visible jump every time WebGL wraps.
        platform = tileset.crop((0, 0, 64, 32))
        platform_path = ROOT / "ground-platform.png"
        platform.save(platform_path, optimize=True)
        outputs.append({"file": platform_path.name, "size": list(platform.size), "sha256": sha256(platform_path.read_bytes())})

        # Matching industrial wall panel from the same reviewed tileset. This
        # sits directly beneath the walkable cap so the world never falls away
        # into an untextured band below the player's feet.
        ground_fill = tileset.crop((480, 64, 544, 128))
        ground_fill_path = ROOT / "ground-fill.png"
        ground_fill.save(ground_fill_path, optimize=True)
        outputs.append({"file": ground_fill_path.name, "size": list(ground_fill.size), "sha256": sha256(ground_fill_path.read_bytes())})

    manifest = {
        "id": "warped-city-2",
        "author": "Ansimuz",
        "license": "CC0-1.0",
        "sourcePage": SOURCE_PAGE,
        "sourceArchive": SOURCE_URL,
        "sourceSha256": SOURCE_SHA256,
        "files": outputs,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (ROOT / "SOURCE.md").write_text(
        "# Warped City 2\n\n"
        "Environment artwork by Ansimuz, downloaded from OpenGameArt and released under CC0 1.0. "
        "Attribution is optional; it is retained here for provenance. Only background, platform, "
        "banner, and lighting artwork used by K.O.R.E. Central is committed.\n\n"
        f"- Source: {SOURCE_PAGE}\n"
        f"- Archive SHA-256: `{SOURCE_SHA256}`\n"
        "- License: https://creativecommons.org/publicdomain/zero/1.0/\n"
    )
    print(f"Imported {len(outputs)} CC0 K.O.R.E. Central environment assets into {ROOT}")


if __name__ == "__main__":
    build()
