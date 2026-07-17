#!/usr/bin/env python3
"""Import and assemble distinct CC0 storefront silhouettes for K.O.R.E. Central."""

from __future__ import annotations

import hashlib
import io
import json
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image


SOURCE_URL = "https://opengameart.org/sites/default/files/warped_city_files.zip"
SOURCE_PAGE = "https://opengameart.org/content/warped-city"
SOURCE_SHA256 = "cf0e69a203206f529adbaf1f82d4c5f165ca9cdb49d3995ec88d135b37e40e3e"
ROOT = Path("public/story/hub/warped-city-portals")
PREFIX = "warped city files/ENVIRONMENT/"
CANVAS_SIZE = (112, 112)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download() -> bytes:
    cached = Path("/tmp/kore-warped-city-1.zip")
    if cached.exists():
        data = cached.read_bytes()
        if sha256(data) == SOURCE_SHA256:
            return data
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
        data = response.read()
    if sha256(data) != SOURCE_SHA256:
        raise ValueError("Warped City archive checksum did not match the reviewed CC0 source")
    cached.write_bytes(data)
    return data


def compose(parts: list[tuple[Image.Image, tuple[int, int]]]) -> Image.Image:
    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    for part, position in parts:
        canvas.alpha_composite(part, position)
    return canvas


def build() -> None:
    archive = download()
    ROOT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        def image(name: str) -> Image.Image:
            return Image.open(io.BytesIO(bundle.read(PREFIX + name))).convert("RGBA")

        tileset = image("tileset.png")
        doors = {
            "green": tileset.crop((48, 16, 96, 80)),
            "blue": tileset.crop((144, 16, 176, 80)),
            "shutter": tileset.crop((224, 16, 272, 80)),
            "split": tileset.crop((288, 16, 320, 80)),
            "terminal": tileset.crop((224, 96, 272, 160)),
            "glow": tileset.crop((224, 176, 272, 240)),
        }
        props = {
            "antenna": image("props/antenna.png"),
            "arrow": image("props/banner-arrow.png"),
            "big": image("props/banner-big/banner-big-1.png"),
            "coke": image("props/banner-coke/banner-coke-1.png"),
            "neon": image("props/banner-neon/banner-neon-1.png"),
            "open": image("props/banner-open.png"),
            "side": image("props/banner-side/banner-side-1.png"),
            "sushi": image("props/banner-sushi/banner-sushi-1.png"),
            "hotel": image("props/hotel-sign.png"),
            "monitor": image("props/monitorface/monitor-face-1.png"),
            "box1": image("props/control-box-1.png"),
            "box2": image("props/control-box-2.png"),
            "box3": image("props/control-box-3.png"),
        }

        storefronts = {
            "friends.png": [(doors["green"], (36, 40)), (props["coke"], (5, 24))],
            "online.png": [(doors["split"], (48, 40)), (props["antenna"], (12, 8)), (props["box3"], (44, 74))],
            "characters.png": [(doors["shutter"], (32, 40)), (props["monitor"], (45, 12)), (props["box2"], (87, 66))],
            "avatar-studio.png": [(doors["blue"], (38, 40)), (props["neon"], (76, 30)), (props["box1"], (4, 74))],
            "story.png": [(doors["glow"], (38, 40)), (props["big"], (2, 10)), (props["antenna"], (86, 8))],
            "arcade.png": [(doors["terminal"], (34, 40)), (props["sushi"], (78, 34)), (props["arrow"], (8, 54))],
            "versus.png": [(doors["split"], (38, 40)), (props["side"], (76, 24)), (props["arrow"], (8, 50))],
            "training.png": [(doors["blue"], (40, 40)), (props["box3"], (2, 76)), (props["box2"], (86, 48))],
            "tournament.png": [(doors["shutter"], (32, 40)), (props["hotel"], (22, 5)), (props["big"], (75, 20))],
            "options.png": [(doors["terminal"], (38, 40)), (props["box1"], (5, 76)), (props["monitor"], (78, 18))],
            "exit.png": [(doors["blue"], (38, 40)), (props["open"], (76, 26)), (props["arrow"], (9, 54))],
        }

    outputs: list[dict[str, object]] = []
    for output_name, parts in storefronts.items():
        output = compose(parts)
        output_path = ROOT / output_name
        output.save(output_path, optimize=True)
        outputs.append({"file": output_name, "size": list(output.size), "sha256": sha256(output_path.read_bytes())})

    manifest = {
        "id": "warped-city-portals",
        "author": "Ansimuz",
        "license": "CC0-1.0",
        "sourcePage": SOURCE_PAGE,
        "sourceArchive": SOURCE_URL,
        "sourceSha256": SOURCE_SHA256,
        "files": outputs,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (ROOT / "SOURCE.md").write_text(
        "# Warped City storefront compositions\n\n"
        "Door, sign, terminal, antenna, and control-box artwork by Ansimuz, downloaded from "
        "OpenGameArt and released under CC0 1.0. K.O.R.E. combines the original transparent "
        "parts into eleven destination-specific storefront silhouettes without redrawing them.\n\n"
        f"- Source: {SOURCE_PAGE}\n"
        f"- Archive SHA-256: `{SOURCE_SHA256}`\n"
        "- License: https://creativecommons.org/publicdomain/zero/1.0/\n"
    )
    print(f"Imported {len(outputs)} distinct CC0 portal silhouettes into {ROOT}")


if __name__ == "__main__":
    build()
