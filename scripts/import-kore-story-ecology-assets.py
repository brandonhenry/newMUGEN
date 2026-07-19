#!/usr/bin/env python3
"""Build the v9 Story ecology atlases from checksum-pinned free downloads.

Source archives stay outside the repository. Only normalized runtime PNG strips,
an integrity index, and provenance are written to public/story/ecology.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/story/ecology"

SOURCES = {
    "minifolks": ("MinifolksForestAnimals.7z", "e1ee9f5a1a7f5ea41d39b8d318dc59e885d6344768278d388fc71ecf7492d18f", "MiniFolks Forest Animals", "LyaSeeK", "CC BY 4.0", "https://lyaseek.itch.io/miniffanimals"),
    "street": ("street.zip", "e2f5a0e92c76a4641768680b7cbac14c643c4daaac15793466307639ab979f79", "Free Street Animal Pixel Art", "Free Game Assets", "free commercial use with attribution", "https://free-game-assets.itch.io/free-street-animal-pixel-art-asset-pack"),
    "froglet": ("froglet.zip", "88d788a496f363b48d71dcd48ba68fb030d7908228503f9a6dd87f5881a9c09d", "Froglet", "Phewcumber", "CC0", "https://phewcumber.itch.io/froglet"),
    "bat": ("bat.rar", "acc9afa2fac318fbbbc6a39999911a6bcc6a49bc4786018ac95d6cf17c822d4b", "Bat", "Kimbulworks", "CC0", "https://kimbulworks.itch.io/bat"),
    "birds": ("birds.zip", "96a64bda1c822e8878ee13121c69fa8d951a1f14184362c04095e1cf58b0fdbd", "Free Bird Sprites", "Carysaurus", "free animation tier; attribution required", "https://carysaurus.itch.io/bird-sprites"),
    "rats": ("rats.zip", "dff5d314341492b10ed49c88b62e1dc1972fdcbf60cd3cabf3ceece014d37052", "Free Rat Sprites", "Carysaurus", "free animation tier; attribution required", "https://carysaurus.itch.io/rat-sprites"),
    "snakes": ("snakes.zip", "295749702d07949a6e106c7b1248c3cb984a0fa23237c2e5be115a6100bafa64", "Free Snake Sprites", "Carysaurus", "free animation tier; attribution required", "https://carysaurus.itch.io/snake-sprites"),
    "deepdive": ("deepdive.zip", "f71cf31b4f18fca572af343d720888b3789511c3d566affdf5d409e0bf7b57b1", "Animal Asset Pack free basic tier", "DeepDiveGameStudio", "free basic tier", "https://deepdivegamestudio.itch.io/animal-asset-pack"),
    "tinyheroes": ("tinyheroes.zip", "e6a11aeba2a1c86e8927bac709ab4afd97d1997a9427e9100d5f4671c080bfdb", "Tiny, Tiny Heroes Animals", "Thkaspar", "CC BY 4.0", "https://thkaspar.itch.io/tth-animals"),
    "greatdoc": ("greatdoc.png", "ac928a44326d5c7b674ffb70acc0c84a52a3bc5246453cdd835a9e90b4b03910", "Coins, Gems, Chests & More", "GreatDocBrown", "free use; attribution requested", "https://greatdocbrown.itch.io/coins-gems-etc"),
    "fantasy": ("fantasy.png", "fe87d2889bb6e62e6276588c75c6d7ff4c2906cde53f601d7204dbd73ee28e59", "Fantasy Collectables", "SoulGATE Studios", "CC0", "https://soulgatestudios.itch.io/2d-fantasy-sprite-collectables"),
    "lared": ("lared.zip", "5903e06b9a7be1c7f4452fae18bed3403645b37b53d24e2ff08007df2c6718da", "Gems/Coins Free", "LaRed Games", "free commercial use", "https://laredgames.itch.io/gems-coins-free"),
    "svor": ("svor.zip", "136ae7d6c3831146afdd1cab1ee9e921c3f57c64ff0b7074014788f7bb3c73c5", "16x16 Item Pack", "Svor", "CC0", "https://svor.itch.io/16x16itempack"),
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def slug(value: str) -> str:
    return value.lower().replace(" ", "-").replace("_", "-").replace("'", "").replace("--", "-")


def save_strip(source: Path, target: Path, frame: int, count: int, row: int = 0) -> None:
    image = Image.open(source).convert("RGBA")
    strip = image.crop((0, row * frame, min(image.width, count * frame), (row + 1) * frame))
    target.parent.mkdir(parents=True, exist_ok=True)
    strip.save(target, optimize=True)


def copy_png(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    Image.open(source).convert("RGBA").save(target, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive_dir", type=Path)
    args = parser.parse_args()
    for _, (filename, expected, *_rest) in SOURCES.items():
        path = args.archive_dir / filename
        if not path.is_file() or digest(path) != expected:
            raise SystemExit(f"Missing or changed free-tier source: {filename}")

    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    manifest: list[dict] = []
    with tempfile.TemporaryDirectory(prefix="kore-ecology-") as temp_name:
        temp = Path(temp_name)
        extracted: dict[str, Path] = {}
        for key, (filename, *_rest) in SOURCES.items():
            source = args.archive_dir / filename
            if source.suffix.lower() == ".png":
                extracted[key] = source
            else:
                destination = temp / key
                destination.mkdir()
                subprocess.run(["bsdtar", "-xf", str(source), "-C", str(destination)], check=True)
                extracted[key] = destination

        def add(key: str, ident: str, source: Path, frame: int, count: int, role: str, row: int = 0) -> None:
            target = OUTPUT / "atlases" / key / f"{ident}.png"
            save_strip(source, target, frame, count, row)
            manifest.append({"id": ident, "packId": key, "path": "/" + str(target.relative_to(ROOT / "public")), "frameSize": [frame, frame], "frames": min(count, Image.open(source).width // frame), "role": role})

        mini_root = next(extracted["minifolks"].rglob("Outline"))
        for source in sorted(mini_root.glob("*.png")):
            frame = 16 if source.stem == "MiniBird" else 32
            add("minifolks", slug(source.stem), source, frame, 4, "world-wildlife,bestiary")
        street_root = extracted["street"]
        for source in sorted(street_root.rglob("Idle.png")):
            species = slug(source.parent.name.lstrip("1234567890 "))
            frame = Image.open(source).height
            add("street", species, source, frame, 6, "world-wildlife,bestiary")
        for source in sorted(extracted["froglet"].rglob("*_sheet_idle.png")):
            color = source.parents[1].name
            add("froglet", slug(color + "-frog"), source, 16, 8, "world-wildlife,bestiary")
        bat_idle = next(extracted["bat"].rglob("*Idle*.png"))
        add("bat", "kimbul-bat", bat_idle, Image.open(bat_idle).height, 15, "world-wildlife,bestiary")
        for key, pattern, frame in (("birds", "*.png", 32), ("rats", "*.png", 32), ("snakes", "*.png", 32)):
            for source in sorted(extracted[key].rglob(pattern)):
                add(key, slug(source.stem.replace("-Walk", "").replace("-Idle", "")), source, frame, 12, "ambient-wildlife,bestiary")
        for source in sorted(extracted["deepdive"].rglob("Basic Animal Animations/*/*.png")):
            add("deepdive", slug(source.parent.name), source, 16, 4, "tiny-wildlife,bestiary")

        tiny_source = next(extracted["tinyheroes"].rglob("spritesheet.png"))
        tiny_target = OUTPUT / "atlases/tinyheroes/tiny-animals.png"
        copy_png(tiny_source, tiny_target)
        manifest.append({"id": "tiny-animals-catalog", "packId": "tinyheroes", "path": "/story/ecology/atlases/tinyheroes/tiny-animals.png", "frameSize": [16, 16], "frames": (256 // 16) * (480 // 16), "role": "tiny-wildlife,bestiary"})
        for key in ("greatdoc", "fantasy"):
            target = OUTPUT / "atlases/collectibles" / f"{key}.png"
            copy_png(extracted[key], target)
            manifest.append({"id": f"{key}-collectibles", "packId": key, "path": "/" + str(target.relative_to(ROOT / "public")), "frameSize": [16, 16], "frames": 1, "role": "world-pickup,market-icon,collection"})
        fantasy_strip = Image.open(extracted["fantasy"]).convert("RGBA").crop((0, 0, 192, 16))
        fantasy_path = OUTPUT / "atlases/collectibles/fantasy-orb.png"
        fantasy_strip.save(fantasy_path, optimize=True)
        manifest.append({"id": "fantasy-orb", "packId": "fantasy", "path": "/story/ecology/atlases/collectibles/fantasy-orb.png", "frameSize": [16, 16], "frames": 12, "role": "world-pickup,collection"})
        greatdoc_strip = Image.open(extracted["greatdoc"]).convert("RGBA").crop((14, 14, 14 + 128, 30))
        greatdoc_path = OUTPUT / "atlases/collectibles/greatdoc-coin.png"
        greatdoc_strip.save(greatdoc_path, optimize=True)
        manifest.append({"id": "greatdoc-coin", "packId": "greatdoc", "path": "/story/ecology/atlases/collectibles/greatdoc-coin.png", "frameSize": [16, 16], "frames": 8, "role": "world-pickup,collection"})
        for source in sorted(extracted["lared"].rglob("*.png")):
            add("lared", slug(source.stem), source, 16, 8, "world-pickup,collection")
        svor_root = extracted["svor"]
        for folder in sorted({source.parent for source in svor_root.rglob("*.png")}):
            frames = sorted(folder.glob("*.png"))
            if not frames:
                continue
            canvas = Image.new("RGBA", (16 * len(frames), 16))
            for index, source in enumerate(frames):
                canvas.alpha_composite(Image.open(source).convert("RGBA").resize((16, 16)), (index * 16, 0))
            target = OUTPUT / "atlases/svor" / f"{slug(folder.name)}.png"
            target.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(target, optimize=True)
            manifest.append({"id": slug(folder.name), "packId": "svor", "path": "/" + str(target.relative_to(ROOT / "public")), "frameSize": [16, 16], "frames": len(frames), "role": "world-pickup,market-icon,collection"})
            icon_target = OUTPUT / "icons/svor" / f"{slug(folder.name)}.png"
            icon_target.parent.mkdir(parents=True, exist_ok=True)
            Image.open(frames[0]).convert("RGBA").resize((16, 16)).save(icon_target, optimize=True)
            manifest.append({"id": f"{slug(folder.name)}-icon", "packId": "svor", "path": "/" + str(icon_target.relative_to(ROOT / "public")), "frameSize": [16, 16], "frames": 1, "role": "market-icon,collection"})

    files = {"/" + str(path.relative_to(ROOT / "public")): digest(path) for path in sorted(OUTPUT.rglob("*.png"))}
    provenance = {key: {"archive": values[0], "archiveSha256": values[1], "title": values[2], "author": values[3], "license": values[4], "url": values[5], "tier": "free"} for key, values in SOURCES.items()}
    (OUTPUT / "asset-manifest.json").write_text(json.dumps({"version": 1, "assets": manifest, "sources": provenance}, indent=2) + "\n")
    (OUTPUT / "asset-integrity.json").write_text(json.dumps({"version": 1, "files": files}, indent=2) + "\n")
    credits = ["# Story Ecology Asset Credits", "", "Only checksum-pinned free-tier downloads were used. Source archives and editable source files are not committed.", ""]
    credits += [f"- [{data[2]}]({data[5]}) — {data[3]}; {data[4]}. Archive SHA-256 `{data[1]}`." for data in SOURCES.values()]
    (OUTPUT / "CREDITS.md").write_text("\n".join(credits) + "\n")
    if not manifest or any(not asset.get("role") for asset in manifest):
        raise SystemExit("Every imported asset must have a semantic role")
    print(f"Imported {len(manifest)} registered runtime assets ({len(files)} PNGs).")


if __name__ == "__main__":
    main()
