#!/usr/bin/env python3
"""Import and verify the reviewed CC0 pixel-art packs used by play-mode worlds.

Only the PNG files referenced by the game are extracted. Source archives are
downloaded into a temporary/cache directory, pinned by SHA-256, and never
copied into public/. The generated manifest records provenance for every file.
"""

from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import io
import json
import re
import tempfile
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ADVENTURE_ROOT = ROOT / "public/story/adventure"
ADVENTURE_INTEGRITY = ADVENTURE_ROOT / "asset-integrity.json"
WORLD_ROOT = ROOT / "public/story/worlds"
WORLD_MANIFEST = WORLD_ROOT / "asset-manifest.json"
WORLD_INTEGRITY = WORLD_ROOT / "asset-integrity.json"


@dataclass(frozen=True)
class Pack:
    id: str
    author: str
    source: str
    archive: str
    sha256: str
    files: dict[str, str]
    license: str = "CC0-1.0"


PACKS = (
    Pack("warped-city", "Ansimuz", "https://opengameart.org/content/warped-city", "https://opengameart.org/sites/default/files/warped_city_files.zip", "cf0e69a203206f529adbaf1f82d4c5f165ca9cdb49d3995ec88d135b37e40e3e", {
        "skyline-a.png": "warped city files/ENVIRONMENT/background/skyline-a.png", "skyline-b.png": "warped city files/ENVIRONMENT/background/skyline-b.png",
        "buildings.png": "warped city files/ENVIRONMENT/background/buildings-bg.png", "near-buildings.png": "warped city files/ENVIRONMENT/background/near-buildings-bg.png",
        "monitor.png": "warped city files/ENVIRONMENT/props/monitorface/monitor-face-1.png", "neon-banner.png": "warped city files/ENVIRONMENT/props/banner-neon/banner-neon-1.png",
        "arrow.png": "warped city files/ENVIRONMENT/props/banner-arrow.png", "antenna.png": "warped city files/ENVIRONMENT/props/antenna.png", "tileset.png": "warped city files/ENVIRONMENT/tileset.png",
    }),
    Pack("stomper", "Ansimuz", "https://opengameart.org/content/stomper-platform-assets", "https://opengameart.org/sites/default/files/stomper_asset_files.zip", "3fa51d1b8fb1ef13216a32954d7cee71f10e3d5f4f64d3b38efa08ae5719de80", {
        "back.png": "Stomper Asset Files/environment/layers/back.png", "back-glow.png": "Stomper Asset Files/environment/Back animated/back-animated2.png",
        "plant.png": "Stomper Asset Files/environment/layers/plant.png", "brick.png": "Stomper Asset Files/environment/brick.png", "tileset.png": "Stomper Asset Files/environment/layers/tileset.png",
    }),
    Pack("zone-202", "Ansimuz", "https://opengameart.org/content/warped-zone-202", "https://opengameart.org/sites/default/files/Warped%20Zone%20202.zip", "98691e3480dc69c31e0b99bd3708881e1e02b5aa43d7e794fbb6dd759d44364e", {
        "back.png": "Warped Zone 202/back.png", "back-2.png": "Warped Zone 202/back-2.png", "tileset.png": "Warped Zone 202/tileset.png",
    }),
    Pack("sci-fi-lab", "Ansimuz", "https://opengameart.org/content/warped-sci-fi-lab", "https://opengameart.org/sites/default/files/scifi_lab_files.zip", "af2eb52debbafc46355726c44cc34b16cfb037d6f6e19fa19c4f020c05d1d85a", {
        "back.png": "Scifi lab Files/layers/back.png", "middle.png": "Scifi lab Files/layers/middle.png", "front.png": "Scifi lab Files/layers/front.png",
        "support.png": "Scifi lab Files/layers/Props/support.png", "tank-1.png": "Scifi lab Files/layers/Props/tank-1.png", "tank-2.png": "Scifi lab Files/layers/Props/tank-2.png", "tank-3.png": "Scifi lab Files/layers/Props/tank-3.png",
    }),
    Pack("gothic-town", "Ansimuz", "https://opengameart.org/content/gothicvania-town", "https://opengameart.org/sites/default/files/gothicvania-town-files.zip", "11c32d7416814e1832c502e76426623065792c3d95a8514be42e59fe6b0b0651", {
        "background.png": "GothicVania-town-files/PNG/environment/layers/background.png", "middleground.png": "GothicVania-town-files/PNG/environment/layers/middleground.png", "tileset.png": "GothicVania-town-files/PNG/environment/layers/tileset.png",
        "house-a.png": "GothicVania-town-files/PNG/environment/props-sliced/house-a.png", "house-b.png": "GothicVania-town-files/PNG/environment/props-sliced/house-b.png", "house-c.png": "GothicVania-town-files/PNG/environment/props-sliced/house-c.png",
        "well.png": "GothicVania-town-files/PNG/environment/props-sliced/well.png", "wagon.png": "GothicVania-town-files/PNG/environment/props-sliced/wagon.png", "street-lamp.png": "GothicVania-town-files/PNG/environment/props-sliced/street-lamp.png",
    }),
    Pack("tall-forest", "Ansimuz", "https://opengameart.org/content/sunnyland-tall-forest-environment", "https://opengameart.org/sites/default/files/tall_forest_files.zip", "4b301344afea3366ac8e5d5b066e8d33e2fd0df66a2acf728e79bbfedb3a1328", {
        "back.png": "Tall Forest Files/Layers/back.png", "far.png": "Tall Forest Files/Layers/far.png", "middle.png": "Tall Forest Files/Layers/middle.png", "tileset.png": "Tall Forest Files/Layers/tileset.png",
        "plant.png": "Tall Forest Files/Layers/Props/Plant.png", "rock.png": "Tall Forest Files/Layers/Props/Rock.png",
    }),
    Pack("forest-illusion", "Ansimuz", "https://opengameart.org/content/sunnyland-forest-of-illusion", "https://opengameart.org/sites/default/files/forest_of_illusion_files.zip", "d2e19d577bf538c9cabbd089c8fa1c402d90b23fe6d724c4f93c940ff6e8ab5a", {
        "back.png": "Forest of Illusion Files/Layers/back.png", "middle.png": "Forest of Illusion Files/Layers/middle.png", "tiles.png": "Forest of Illusion Files/Layers/tiles.png",
    }),
    Pack("warped-caves", "Ansimuz", "https://opengameart.org/content/warped-caves-pixel-art-pack", "https://opengameart.org/sites/default/files/warped-files_1.zip", "f0f7ad1a4b142c889a89899592db636c57943e0fa62fe5d5ee34677bd6c6a67e", {
        "background.png": "warped-files/PNG/environment/layers/background.png", "middleground.png": "warped-files/PNG/environment/layers/middleground.png", "walls.png": "warped-files/PNG/environment/layers/walls.png", "tileset.png": "warped-files/PNG/environment/layers/tilesets.png",
        "gate.png": "warped-files/PNG/environment/props/gate-01.png", "stalactite.png": "warped-files/PNG/environment/props/stalactite.png", "stone-head.png": "warped-files/PNG/environment/props/stone-head.png",
    }),
    Pack("gothic-cemetery", "Ansimuz", "https://opengameart.org/content/gothicvania-cemetery-pack", "https://opengameart.org/sites/default/files/gothicvania-cemetery-files_1.zip", "992f3792b49391da4d97c29da47c8f3d2f438ca10d7db03f9a3166d655600871", {
        "background.png": "gothicvania-cemetery-files/PNG/Environment/background.png", "mountains.png": "gothicvania-cemetery-files/PNG/Environment/mountains.png", "graveyard.png": "gothicvania-cemetery-files/PNG/Environment/graveyard.png", "tileset.png": "gothicvania-cemetery-files/PNG/Environment/tileset.png",
        "tree.png": "gothicvania-cemetery-files/PNG/Environment/sliced-objects/tree-2.png", "statue.png": "gothicvania-cemetery-files/PNG/Environment/sliced-objects/statue.png", "stone.png": "gothicvania-cemetery-files/PNG/Environment/sliced-objects/stone-3.png",
    }),
    Pack("gothic-church", "Ansimuz", "https://opengameart.org/content/gothicvania-church-pack", "https://opengameart.org/sites/default/files/gothicvania%20church%20files.zip", "c4c78b80905022d3325212b58271044bdd4b92d1f7724fe94aee0107ba3c8169", {
        "backgrounds.png": "gothicvania church files/ENVIRONMENT/backgrounds.png", "tileset.png": "gothicvania church files/ENVIRONMENT/tileset.png", "column.png": "gothicvania church files/ENVIRONMENT/column.png",
    }),
    Pack("fort-illusion", "Ansimuz", "https://opengameart.org/content/fort-of-illusion", "https://opengameart.org/sites/default/files/fort_of_illusion_files.zip", "350f2b572128c1104f0178291d44986f704d2e1bd08cdf81acc21f7173a7cba6", {
        "mountains.png": "Fort of Illusion Files/Layers/mountains.png", "back.png": "Fort of Illusion Files/Layers/back.png", "front.png": "Fort of Illusion Files/Layers/front.png", "tileset.png": "Fort of Illusion Files/Layers/tileset.png",
        "flag.png": "Fort of Illusion Files/Layers/Props/flag.png", "banner.png": "Fort of Illusion Files/Layers/Props/banner.png", "door.png": "Fort of Illusion Files/Layers/Props/door.png",
    }),
    Pack("magical-road", "Ansimuz", "https://opengameart.org/content/magical-road-pixel-art-environment", "https://opengameart.org/sites/default/files/magical_road_files.zip", "5f48880e66b251f556b8f985d7c17690ac73dcfd2c7ef9d3bb4e0bd8ea27b693", {
        "back.png": "Magical Road Files/Layers/back.png", "middle.png": "Magical Road Files/Layers/middle.png", "tree.png": "Magical Road Files/Layers/tree.png", "tileset.png": "Magical Road Files/Layers/tileset.png",
    }),
    Pack("magic-cliffs", "Ansimuz", "https://opengameart.org/content/magic-cliffs-environment", "https://opengameart.org/sites/default/files/Magic-Cliffs-Environment.zip", "40cdd806231c28246f54f60c3533d65ce085cf12106602a119933818e785287f", {
        "sky.png": "Magic-Cliffs-Environment/PNG/sky.png", "clouds.png": "Magic-Cliffs-Environment/PNG/clouds.png", "sea.png": "Magic-Cliffs-Environment/PNG/sea.png", "far-grounds.png": "Magic-Cliffs-Environment/PNG/far-grounds.png", "tileset.png": "Magic-Cliffs-Environment/PNG/tileset.png",
    }),
    Pack("rocky-pass", "Ansimuz", "https://opengameart.org/content/gothicvania-rocky-pass-environment", "https://opengameart.org/sites/default/files/rocky_pass_files.zip", "4cc3641d3d00f65feebb52b36f41664c5d1323c142a8116dfdcb82c2e1f48c6e", {
        "back.png": "Rocky Pass Files/PNG/back.png", "middle.png": "Rocky Pass Files/PNG/middle.png", "near.png": "Rocky Pass Files/PNG/near.png", "tileset.png": "Rocky Pass Files/PNG/tileset.png",
        "crystal-1.png": "Rocky Pass Files/PNG/Props/crystal-1.png", "crystal-2.png": "Rocky Pass Files/PNG/Props/crystal-2.png",
    }),
    Pack("ocean-view", "Ansimuz", "https://opengameart.org/content/warped-ocean-view", "https://opengameart.org/sites/default/files/ocean_view_files.zip", "48656c8f77213b1714c45b1cda0a65ac593c9cf83d81c397d4854beeb7ac7514", {
        "night-back.png": "Ocean View Files/Layers/Night/Back.png", "night-middle.png": "Ocean View Files/Layers/Night/Middle.png", "night-clouds.png": "Ocean View Files/Layers/Night/Clouds.png", "night-tower.png": "Ocean View Files/Layers/Night/props/tower.png", "night-dome.png": "Ocean View Files/Layers/Night/props/dome-1.png",
        "day-clouds.png": "Ocean View Files/Layers/Day/Clouds.png", "tile.png": "Ocean View Files/Layers/Night/Tile.png",
    }),
    Pack("desert-platformer", "KingCreator11", "https://opengameart.org/content/2d-desert-platformer-pack", "https://opengameart.org/sites/default/files/desert%20platformer%20pack.zip", "ef28eb76382bd7b52c1f11722f85655c3d1939ce22f9ca2fa2726df2a9740a73", {
        "back-1.png": "desert platformer pack/background/background1.png", "back-2.png": "desert platformer pack/background/background2.png", "back-3.png": "desert platformer pack/background/background3.png", "back-4.png": "desert platformer pack/background/background4.png", "back-5.png": "desert platformer pack/background/background5.png",
        "tile.png": "desert platformer pack/Tile/world2Tile1.png",
    }),
    Pack("space-background", "Ansimuz", "https://opengameart.org/content/space-background-3", "https://opengameart.org/sites/default/files/space_background_pack.zip", "e223101b6868efadaafe229b521dbe16844d64561bb5ae132bdd029e246f9c56", {
        "background.png": "space_background_pack/layers/parallax-space-backgound.png", "stars.png": "space_background_pack/layers/parallax-space-stars.png", "far-planets.png": "space_background_pack/layers/parallax-space-far-planets.png", "big-planet.png": "space_background_pack/layers/parallax-space-big-planet.png", "ring-planet.png": "space_background_pack/layers/parallax-space-ring-planet.png",
    }),
    Pack("city-parallax", "Gustavo Saraiva", "https://opengameart.org/content/city-parallax-pixel-art", "https://opengameart.org/sites/default/files/City.zip", "f4ca82cc5eda5074226454dd4208f9fb05d7393dbb0f57266787e299ec1abb23", {
        "background.png": "City/Background 1.png", "middle.png": "City/Middle.png", "foreground.png": "City/Foreground.png",
    }),
    Pack("seasonal", "GrafxKid", "https://grafxkid.itch.io/seasonal-tilesets", "itch://seasonal-tilesets/2495172", "44d1225eb7bc7e19bdab1b1476ade77367b1a6b3afe3987c62977adcca025d7d", {
        "grass-hills.png": "Seasonal Tilesets/1 - Grassland/Background parts/2 - Hills.png", "grass-foreground.png": "Seasonal Tilesets/1 - Grassland/Background parts/1 - Foreground_scenery.png", "grass-terrain.png": "Seasonal Tilesets/1 - Grassland/Terrain (16 x 16).png",
        "autumn-trees.png": "Seasonal Tilesets/2 - Autumn Forest/Background parts/2 - Trees.png", "autumn-distant.png": "Seasonal Tilesets/2 - Autumn Forest/Background parts/6 - Distant_trees.png", "autumn-leaves.png": "Seasonal Tilesets/2 - Autumn Forest/Background parts/1 - Leaf_top.png", "autumn-terrain.png": "Seasonal Tilesets/2 - Autumn Forest/Terrain (16 x 16).png",
        "snow-big-mountain.png": "Seasonal Tilesets/4 - Winter World/Background parts/3 - Big_mountain_BG.png", "snow-small-mountains.png": "Seasonal Tilesets/4 - Winter World/Background parts/2 - Smaller_mountains.png", "snow-foreground.png": "Seasonal Tilesets/4 - Winter World/Background parts/1 - Snowy_foreground_area.png", "snow-terrain.png": "Seasonal Tilesets/4 - Winter World/Terrain (16 x 16).png",
        "lava.png": "Seasonal Tilesets/5 - Misc. universal tiles/Lava_frames (16 x 32).png", "house.png": "Seasonal Tilesets/5 - Misc. universal tiles/House (112 x 96).png",
    }),
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def request(opener: urllib.request.OpenerDirector, url: str, data: dict[str, str] | None = None) -> bytes:
    encoded = urllib.parse.urlencode(data).encode() if data is not None else None
    headers = {"User-Agent": "KORE-asset-importer/1.0"}
    if data is not None:
        headers["X-Requested-With"] = "XMLHttpRequest"
    with opener.open(urllib.request.Request(url, data=encoded, headers=headers), timeout=60) as response:
        return response.read()


def download_seasonal() -> bytes:
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    page = request(opener, "https://grafxkid.itch.io/seasonal-tilesets").decode("utf-8")
    csrf = re.search(r'name="csrf_token" value="([^"]+)"', page)
    if not csrf:
        raise RuntimeError("Could not find itch.io CSRF token")
    download_page_json = json.loads(request(opener, "https://grafxkid.itch.io/seasonal-tilesets/download_url", {"csrf_token": csrf.group(1), "upload_id": "2495172"}))
    download_page = request(opener, download_page_json["url"]).decode("utf-8")
    csrf = re.search(r'name="csrf_token" value="([^"]+)"', download_page)
    if not csrf:
        raise RuntimeError("Could not find itch.io download CSRF token")
    file_json = json.loads(request(opener, "https://grafxkid.itch.io/seasonal-tilesets/file/2495172?source=game_download", {"csrf_token": csrf.group(1)}))
    return request(opener, file_json["url"])


def obtain_archive(pack: Pack, archive_dir: Path | None) -> bytes:
    candidates = [] if archive_dir is None else [archive_dir / f"{pack.id}.zip"]
    local_aliases = {
        "sci-fi-lab": "scifi-lab.zip",
        "gothic-cemetery": "cemetery.zip",
        "gothic-church": "church.zip",
        "desert-platformer": "desert.zip",
    }
    if archive_dir is not None and pack.id in local_aliases:
        candidates.append(archive_dir / local_aliases[pack.id])
    if pack.id == "seasonal" and archive_dir is not None:
        candidates = [archive_dir / "seasonal-real.zip", *candidates]
    for candidate in candidates:
        if candidate.is_file():
            data = candidate.read_bytes()
            break
    else:
        data = download_seasonal() if pack.archive.startswith("itch://") else urllib.request.urlopen(pack.archive, timeout=90).read()
    actual = sha256_bytes(data)
    if actual != pack.sha256:
        raise ValueError(f"Archive checksum mismatch for {pack.id}: {actual}")
    return data


def save_png(data: bytes, destination: Path) -> tuple[int, int]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.width > 1024:
            image.thumbnail((720, 450), Image.Resampling.NEAREST)
        image = image.convert("RGBA")
        image.save(destination, format="PNG", compress_level=9)
        return image.size


def palette_variant(source: Path, destination: Path, low: tuple[int, int, int], high: tuple[int, int, int]) -> tuple[int, int]:
    with Image.open(source).convert("RGBA") as image:
        pixels = []
        for red, green, blue, alpha in image.getdata():
            luminance = (red * 3 + green * 5 + blue * 2) / 10 / 255
            pixels.append(tuple(int(low[channel] + (high[channel] - low[channel]) * luminance) for channel in range(3)) + (alpha,))
        image.putdata(pixels)
        destination.parent.mkdir(parents=True, exist_ok=True)
        image.save(destination, format="PNG", optimize=True)
        return image.size


def import_world_packs(archive_dir: Path | None) -> None:
    packs_manifest = []
    integrity: dict[str, str] = {}
    for pack in PACKS:
        archive = obtain_archive(pack, archive_dir)
        assets = []
        with zipfile.ZipFile(io.BytesIO(archive)) as source:
            for output, archived in pack.files.items():
                destination = WORLD_ROOT / pack.id / output
                size = save_png(source.read(archived), destination)
                relative = destination.relative_to(WORLD_ROOT).as_posix()
                file_hash = sha256_path(destination)
                integrity[relative] = file_hash
                assets.append({"file": relative, "sourceFile": archived, "width": size[0], "height": size[1], "sha256": file_hash})
        packs_manifest.append({"id": pack.id, "author": pack.author, "source": pack.source, "archive": pack.archive, "archiveSha256": pack.sha256, "license": pack.license, "assets": assets})

    cave_pack = next(item for item in packs_manifest if item["id"] == "warped-caves")
    ember_assets = []
    for source_name in ("background.png", "middleground.png", "walls.png", "tileset.png", "gate.png", "stalactite.png", "stone-head.png"):
        destination = WORLD_ROOT / "emberdeep" / source_name
        size = palette_variant(WORLD_ROOT / "warped-caves" / source_name, destination, (42, 8, 15), (255, 100, 50))
        relative = destination.relative_to(WORLD_ROOT).as_posix()
        file_hash = sha256_path(destination)
        integrity[relative] = file_hash
        ember_assets.append({"file": relative, "sourceFile": f"CC0 palette derivative of warped-caves/{source_name}", "width": size[0], "height": size[1], "sha256": file_hash})
    packs_manifest.append({"id": "emberdeep", "author": "Ansimuz / K.O.R.E.", "source": next(pack.source for pack in PACKS if pack.id == "warped-caves"), "archive": "derived", "archiveSha256": next(pack.sha256 for pack in PACKS if pack.id == "warped-caves"), "license": "CC0-1.0", "derivedFrom": cave_pack["id"], "assets": ember_assets})

    for derived_id, source_id, source_names, low, high in (
        ("tournament-gold", "fort-illusion", ("mountains.png", "back.png", "front.png", "tileset.png", "flag.png", "banner.png", "door.png"), (30, 19, 18), (255, 224, 113)),
        ("sunscar-pixel", "rocky-pass", ("back.png", "middle.png", "near.png", "tileset.png", "crystal-1.png", "crystal-2.png"), (63, 30, 25), (255, 216, 132)),
        ("frostpeak-details", "seasonal", ("house.png",), (78, 122, 160), (238, 251, 255)),
        ("tournament-cathedral", "gothic-church", ("backgrounds.png", "column.png", "tileset.png"), (28, 20, 17), (255, 224, 113)),
        ("sunscar-settlement", "gothic-town", ("house-a.png", "house-b.png", "house-c.png", "wagon.png", "well.png", "street-lamp.png"), (67, 34, 25), (255, 211, 125)),
    ):
        assets = []
        for source_name in source_names:
            destination = WORLD_ROOT / derived_id / source_name
            size = palette_variant(WORLD_ROOT / source_id / source_name, destination, low, high)
            relative = destination.relative_to(WORLD_ROOT).as_posix()
            file_hash = sha256_path(destination)
            integrity[relative] = file_hash
            assets.append({"file": relative, "sourceFile": f"CC0 palette derivative of {source_id}/{source_name}", "width": size[0], "height": size[1], "sha256": file_hash})
        source_pack = next(pack for pack in PACKS if pack.id == source_id)
        packs_manifest.append({"id": derived_id, "author": f"{source_pack.author} / K.O.R.E.", "source": source_pack.source, "archive": "derived", "archiveSha256": source_pack.sha256, "license": "CC0-1.0", "derivedFrom": source_id, "assets": assets})

    WORLD_ROOT.mkdir(parents=True, exist_ok=True)
    WORLD_MANIFEST.write_text(json.dumps({"version": 1, "direction": "crisp authored pixel-art parallax", "packs": packs_manifest}, indent=2) + "\n")
    WORLD_INTEGRITY.write_text(json.dumps({"algorithm": "sha256", "files": dict(sorted(integrity.items()))}, indent=2) + "\n")
    credit_rows = ["# Play-mode world art", "", "Only reviewed CC0 assets are shipped. Source archives are checksum-pinned and excluded.", "", "| Pack | Author | License | Source |", "| --- | --- | --- | --- |"]
    credit_rows.extend(f"| {pack.id} | {pack.author} | {pack.license} | {pack.source} |" for pack in PACKS)
    credit_rows.append("| emberdeep | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of Warped Caves |")
    credit_rows.append("| tournament-gold | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of Fort of Illusion |")
    credit_rows.append("| sunscar-pixel | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of Rocky Pass |")
    credit_rows.append("| frostpeak-details | GrafxKid / K.O.R.E. | CC0-1.0 | Palette derivative of Seasonal Tilesets |")
    credit_rows.append("| tournament-cathedral | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of GothicVania Church |")
    credit_rows.append("| sunscar-settlement | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of GothicVania Town |")
    (WORLD_ROOT / "CREDITS.md").write_text("\n".join(credit_rows) + "\n")
    print(f"Imported {len(integrity)} reviewed world assets from {len(PACKS)} CC0 packs")


def verify_integrity(root: Path, manifest_path: Path, label: str) -> None:
    integrity = json.loads(manifest_path.read_text())
    if integrity.get("algorithm") != "sha256":
        raise ValueError(f"{label} integrity manifest must use sha256")
    for relative, expected in integrity["files"].items():
        path = root / relative
        if not path.is_file():
            raise FileNotFoundError(f"Missing reviewed {label} asset: {relative}")
        actual = sha256_path(path)
        if actual != expected:
            raise ValueError(f"Checksum changed for {relative}: {actual}")
    print(f"Verified {len(integrity['files'])} reviewed {label} assets")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Download and re-import every reviewed CC0 pack")
    parser.add_argument("--archive-dir", type=Path, help="Use checksum-pinned archives from this directory")
    args = parser.parse_args()
    if args.refresh or not WORLD_MANIFEST.is_file() or not WORLD_INTEGRITY.is_file():
        import_world_packs(args.archive_dir)
    verify_integrity(ADVENTURE_ROOT, ADVENTURE_INTEGRITY, "adventure")
    verify_integrity(WORLD_ROOT, WORLD_INTEGRITY, "world")


if __name__ == "__main__":
    main()
