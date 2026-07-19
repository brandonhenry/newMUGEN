#!/usr/bin/env python3
"""Import and verify the reviewed free pixel-art packs used by play-mode worlds.

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

from story_sprite_alpha import fill_dense_interior_gaps, fill_single_pinholes, fill_small_enclosed_holes, remove_exterior_matte


ROOT = Path(__file__).resolve().parents[1]
ADVENTURE_ROOT = ROOT / "public/story/adventure"
ADVENTURE_INTEGRITY = ADVENTURE_ROOT / "asset-integrity.json"
WORLD_ROOT = ROOT / "public/story/worlds"
WORLD_MANIFEST = WORLD_ROOT / "asset-manifest.json"
WORLD_INTEGRITY = WORLD_ROOT / "asset-integrity.json"
EXPLORATION_ROOT = ROOT / "public/story/exploration"
EXPLORATION_MANIFEST = EXPLORATION_ROOT / "asset-manifest.json"
EXPLORATION_ACTOR_FILES = {
    "mounts/horse-idle.png",
    "mounts/horse-run.png",
    "mounts/wolf-jump.png",
    "mounts/wolf-run.png",
    "wildlife/Bear_Run.png",
    "wildlife/Deer_Idle.png",
    "wildlife/Deer_Run.png",
    "wildlife/Wolf_Run.png",
}


@dataclass(frozen=True)
class Pack:
    id: str
    author: str
    source: str
    archive: str
    sha256: str
    files: dict[str, str]
    license: str = "CC0-1.0"
    scale: int = 1
    container: str = "zip"


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
    Pack("sunnyland-winter", "Ansimuz", "https://ansimuz.itch.io/sunnyland-winter-forest", "itch://ansimuz.itch.io/sunnyland-winter-forest/16443364", "63adce10f83d31d5ed05ddf0cb94ba8936ea2782c386a8b9f9707783164a0616", {
        "sky.png": "sunnyland winter forest files/ENVIRONMENT/sky.png", "mountains.png": "sunnyland winter forest files/ENVIRONMENT/mountains.png",
        "mid-layer-a.png": "sunnyland winter forest files/ENVIRONMENT/mid-layer-a.png", "mid-layer-b.png": "sunnyland winter forest files/ENVIRONMENT/mid-layer-b.png",
        "tileset.png": "sunnyland winter forest files/ENVIRONMENT/tileset.png", "house.png": "sunnyland winter forest files/ENVIRONMENT/props-sliced/house.png",
        "pine.png": "sunnyland winter forest files/ENVIRONMENT/props-sliced/pine.gif", "pine-snow.png": "sunnyland winter forest files/ENVIRONMENT/props-sliced/pine-snow.gif",
        "tall-tree.png": "sunnyland winter forest files/ENVIRONMENT/props-sliced/tall-tree.gif", "fence.png": "sunnyland winter forest files/ENVIRONMENT/props-sliced/fence-snow.gif",
    }, license="Free commercial use and modification; attribution not required"),
    Pack("yeehaw", "CURSED OFFERINGS", "https://cursed-offerings.itch.io/yeehaw", "itch://cursed-offerings.itch.io/yeehaw/12917777", "edd18deb839130954db9c5e7e6cc58e838e05df38136faa5afcf4dd485ad77de", {
        "tileset.png": "Yeehaw/yeehaw_tileset_standard.png", "parallax-a.png": "Yeehaw/yeehaw_parallax_layerA_standard.png",
        "parallax-b.png": "Yeehaw/yeehaw_parallax_layerB_standard.png", "parallax-c.png": "Yeehaw/yeehaw_parallax_layerC_standard.png",
        "sun.png": "Yeehaw/yeehaw_env_sun_sprite.png", "bottle.png": "Yeehaw/yeehaw_obj_bottle_sprite.png",
        "tin-can.png": "Yeehaw/yeehaw_obj_tincan_sprite.png", "wanted-poster.png": "Yeehaw/yeehaw_obj_wantedposter_sprite.png",
    }, license="Free commercial and non-commercial use and modification", scale=2),
    Pack("moten-lava", "TheConceptofChris", "https://theconceptofchris.itch.io/moten-lava-32-x-32-tile-set", "itch://theconceptofchris.itch.io/moten-lava-32-x-32-tile-set/3732832", "b4fa67634658af7ece05087dde1e135cf2c69f34e3748509f4fc2308b5effcdc", {
        "lava-tiles.png": "LavaTile set.png",
    }, license="No copyright; free to use", container="raw"),
)


# License-reviewed alternate biome stack. These are imported incrementally so
# adding procedural visual diversity never requires re-downloading the primary
# production stack.
BACKUP_PACKS = (
    Pack("kings-pigs", "Pixel Frog", "https://pixelfrog-assets.itch.io/kings-and-pigs", "itch://pixelfrog-assets.itch.io/kings-and-pigs/1715479", "4d61a9c48d5eb1ec5ef5585359d3800205349af813af67030a719bfd6371d373", {
        "terrain.png": "Sprites/14-TileSets/Terrain (32x32).png", "decorations.png": "Sprites/14-TileSets/Decorations (32x32).png",
        "door.png": "Sprites/11-Door/Idle.png", "cannon.png": "Sprites/10-Cannon/Idle.png", "box.png": "Sprites/08-Box/Idle.png",
    }),
    Pack("pixel-adventure", "Pixel Frog", "https://pixelfrog-assets.itch.io/pixel-adventure-1", "itch://pixelfrog-assets.itch.io/pixel-adventure-1/2012517", "efafdfc8ed44f2b0ade27c0246e11a2474ce3a793b4f8e16dbe7403824f6e77b", {
        "terrain.png": "Free/Terrain/Terrain (16x16).png", "background-purple.png": "Free/Background/Purple.png", "background-yellow.png": "Free/Background/Yellow.png",
        "box-1.png": "Free/Items/Boxes/Box1/Idle.png", "box-2.png": "Free/Items/Boxes/Box2/Idle.png", "box-3.png": "Free/Items/Boxes/Box3/Idle.png",
    }),
    Pack("grafx-cave", "GrafxKid", "https://grafxkid.itch.io/cave-tileset", "itch://grafxkid.itch.io/cave-tileset/2936187", "71d5b339b0b01f4a24bddc9d5c82ad78d3a250d744c954fd4cfa77032c7c09b2", {
        "background.png": "Cave Tileset/_Complete_static_BG_(288 x 208).png", "gray-terrain.png": "Cave Tileset/Gray_Tile_Terrain (16 x 16).png",
        "brown-terrain.png": "Cave Tileset/Brown_Tile_Terrain (16 x 16).png", "scaffolding.png": "Cave Tileset/Scaffolding_and_BG_Parts (16 x 16).png",
    }),
    Pack("moon-graveyard", "Anokolisa", "https://anokolisa.itch.io/moon-graveyard", "itch://anokolisa.itch.io/moon-graveyard/1683927", "4efad04eb0363cbfad2cc249569ae178819ca48250a5c722ff5a3faeb350af46", {
        "background-0.png": "Final/Background_0.png", "background-1.png": "Final/Background_1.png", "grass-1.png": "Final/Grass_background_1.png",
        "grass-2.png": "Final/Grass_background_2.png", "brush.png": "Final/brush.png", "statue.png": "Final/Salt.png", "tiles.png": "Final/Tiles.png",
    }, license="Free commercial use for related environments; modification permitted"),
    Pack("space-cave", "M039", "https://m039.itch.io/blue-space-cave-tileset", "itch://m039.itch.io/blue-space-cave-tileset/1348049", "8d636b7e875727449dc4ebc0110b064f3aa378ead34e759fb9de9b4b24efcb7d", {
        "tileset.png": "space-cave.png",
    }, container="raw"),
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


def download_itch_upload(pack: Pack) -> bytes:
    host_and_slug, upload_id = pack.archive.removeprefix("itch://").rsplit("/", 1)
    page_url = f"https://{host_and_slug}"
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    page = request(opener, page_url).decode("utf-8")
    csrf = re.search(r'name="csrf_token" value="([^"]+)"', page)
    if not csrf:
        raise RuntimeError(f"Could not find itch.io CSRF token for {pack.id}")
    download_page_json = json.loads(request(opener, f"{page_url}/download_url", {"csrf_token": csrf.group(1)}))
    download_page = request(opener, download_page_json["url"]).decode("utf-8")
    csrf = re.search(r'name="csrf_token" value="([^"]+)"', download_page)
    if not csrf:
        raise RuntimeError(f"Could not find itch.io download CSRF token for {pack.id}")
    file_json = json.loads(request(opener, f"{page_url}/file/{upload_id}?source=game_download", {"csrf_token": csrf.group(1)}))
    return request(opener, file_json["url"])


def obtain_archive(pack: Pack, archive_dir: Path | None) -> bytes:
    candidates = [] if archive_dir is None else [archive_dir / f"{pack.id}.{'zip' if pack.container == 'zip' else 'png'}"]
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
        if pack.id == "seasonal":
            data = download_seasonal()
        elif pack.archive.startswith("itch://"):
            data = download_itch_upload(pack)
        else:
            data = urllib.request.urlopen(pack.archive, timeout=90).read()
    actual = sha256_bytes(data)
    if actual != pack.sha256:
        raise ValueError(f"Archive checksum mismatch for {pack.id}: {actual}")
    return data


def save_png(data: bytes, destination: Path, scale: int = 1) -> tuple[int, int]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.width > 1024:
            image.thumbnail((720, 450), Image.Resampling.NEAREST)
        image = image.convert("RGBA")
        if scale != 1:
            image = image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
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


def crop_variant(source: Path, destination: Path, box: tuple[int, int, int, int]) -> tuple[int, int]:
    with Image.open(source).convert("RGBA") as image:
        cropped = image.crop(box)
        destination.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(destination, format="PNG", optimize=True)
        return cropped.size


def import_world_packs(archive_dir: Path | None) -> None:
    packs_manifest = []
    integrity: dict[str, str] = {}
    for pack in PACKS:
        archive = obtain_archive(pack, archive_dir)
        assets = []
        source = zipfile.ZipFile(io.BytesIO(archive)) if pack.container == "zip" else None
        try:
            for output, archived in pack.files.items():
                destination = WORLD_ROOT / pack.id / output
                data = source.read(archived) if source else archive
                size = save_png(data, destination, pack.scale)
                relative = destination.relative_to(WORLD_ROOT).as_posix()
                file_hash = sha256_path(destination)
                integrity[relative] = file_hash
                assets.append({"file": relative, "sourceFile": archived, "width": size[0], "height": size[1], "sha256": file_hash})
        finally:
            if source:
                source.close()
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
        ("thornwood", "magic-cliffs", ("sky.png", "clouds.png", "sea.png", "far-grounds.png", "tileset.png"), (18, 19, 28), (171, 222, 121)),
        ("tournament-gold", "fort-illusion", ("mountains.png", "back.png", "front.png", "tileset.png", "flag.png", "banner.png", "door.png"), (30, 19, 18), (255, 224, 113)),
        ("tournament-cathedral", "gothic-church", ("backgrounds.png", "column.png", "tileset.png"), (28, 20, 17), (255, 224, 113)),
        ("skyglass", "rocky-pass", ("back.png", "middle.png", "near.png", "tileset.png", "crystal-1.png", "crystal-2.png"), (26, 31, 71), (126, 255, 244)),
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

    for pack_id, source_name, output_name, box in (
        ("moten-lava", "lava-tiles.png", "lava-surface.png", (0, 0, 32, 32)),
        ("yeehaw", "tileset.png", "cactus.png", (112, 16, 160, 80)),
        ("yeehaw", "tileset.png", "frontier-facade.png", (0, 80, 192, 256)),
    ):
        pack_manifest = next(item for item in packs_manifest if item["id"] == pack_id)
        destination = WORLD_ROOT / pack_id / output_name
        size = crop_variant(WORLD_ROOT / pack_id / source_name, destination, box)
        relative = destination.relative_to(WORLD_ROOT).as_posix()
        file_hash = sha256_path(destination)
        integrity[relative] = file_hash
        pack_manifest["assets"].append({"file": relative, "sourceFile": f"runtime crop {box} of {pack_id}/{source_name}", "width": size[0], "height": size[1], "sha256": file_hash})

    WORLD_ROOT.mkdir(parents=True, exist_ok=True)
    WORLD_MANIFEST.write_text(json.dumps({"version": 1, "direction": "crisp authored pixel-art parallax", "packs": packs_manifest}, indent=2) + "\n")
    WORLD_INTEGRITY.write_text(json.dumps({"algorithm": "sha256", "files": dict(sorted(integrity.items()))}, indent=2) + "\n")
    credit_rows = ["# Play-mode world art", "", "Only reviewed free-use assets are shipped. Source archives are checksum-pinned and excluded.", "", "| Pack | Author | License | Source |", "| --- | --- | --- | --- |"]
    credit_rows.extend(f"| {pack.id} | {pack.author} | {pack.license} | {pack.source} |" for pack in PACKS)
    credit_rows.append("| emberdeep | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of Warped Caves |")
    credit_rows.append("| tournament-gold | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of Fort of Illusion |")
    credit_rows.append("| tournament-cathedral | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of GothicVania Church |")
    credit_rows.append("| thornwood | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of Magic Cliffs |")
    credit_rows.append("| skyglass | Ansimuz / K.O.R.E. | CC0-1.0 | Palette derivative of Rocky Pass |")
    (WORLD_ROOT / "CREDITS.md").write_text("\n".join(credit_rows) + "\n")
    print(f"Imported {len(integrity)} reviewed world assets from {len(PACKS)} free-use packs")


def add_backup_biome_stack(archive_dir: Path | None) -> None:
    """Import the alternate procedural-biome families without touching primaries."""
    manifest = json.loads(WORLD_MANIFEST.read_text())
    integrity = json.loads(WORLD_INTEGRITY.read_text())
    backup_ids = {pack.id for pack in BACKUP_PACKS}
    derived_ids = {"pixel-thornwood", "pixel-sunscar", "grafx-ember", "space-skyglass"}
    removed = [pack for pack in manifest["packs"] if pack["id"] in backup_ids | derived_ids]
    for relative in {asset["file"] for pack in removed for asset in pack["assets"]}:
        integrity["files"].pop(relative, None)
    manifest["packs"] = [pack for pack in manifest["packs"] if pack["id"] not in backup_ids | derived_ids]

    for pack in BACKUP_PACKS:
        archive = obtain_archive(pack, archive_dir)
        source = zipfile.ZipFile(io.BytesIO(archive)) if pack.container == "zip" else None
        assets = []
        try:
            for output, archived in pack.files.items():
                destination = WORLD_ROOT / pack.id / output
                data = source.read(archived) if source else archive
                size = save_png(data, destination, pack.scale)
                relative = destination.relative_to(WORLD_ROOT).as_posix()
                file_hash = sha256_path(destination)
                integrity["files"][relative] = file_hash
                assets.append({"file": relative, "sourceFile": archived, "width": size[0], "height": size[1], "sha256": file_hash})
        finally:
            if source:
                source.close()
        manifest["packs"].append({"id": pack.id, "author": pack.author, "source": pack.source, "archive": pack.archive, "archiveSha256": pack.sha256, "license": pack.license, "assets": assets})

    for derived_id, source_id, source_names, low, high in (
        ("pixel-thornwood", "pixel-adventure", ("terrain.png", "background-purple.png", "box-1.png", "box-2.png", "box-3.png"), (8, 18, 22), (116, 232, 148)),
        ("pixel-sunscar", "pixel-adventure", ("terrain.png", "background-yellow.png", "box-1.png", "box-2.png", "box-3.png"), (74, 24, 18), (255, 190, 68)),
        ("grafx-ember", "grafx-cave", ("background.png", "gray-terrain.png", "brown-terrain.png", "scaffolding.png"), (38, 5, 12), (255, 105, 44)),
        ("space-skyglass", "space-cave", ("tileset.png",), (24, 13, 69), (113, 244, 255)),
    ):
        source_pack = next(pack for pack in BACKUP_PACKS if pack.id == source_id)
        assets = []
        for source_name in source_names:
            destination = WORLD_ROOT / derived_id / source_name
            size = palette_variant(WORLD_ROOT / source_id / source_name, destination, low, high)
            relative = destination.relative_to(WORLD_ROOT).as_posix()
            file_hash = sha256_path(destination)
            integrity["files"][relative] = file_hash
            assets.append({"file": relative, "sourceFile": f"palette derivative of {source_id}/{source_name}", "width": size[0], "height": size[1], "sha256": file_hash})
        manifest["packs"].append({"id": derived_id, "author": f"{source_pack.author} / K.O.R.E.", "source": source_pack.source, "archive": "derived", "archiveSha256": source_pack.sha256, "license": source_pack.license, "derivedFrom": source_id, "assets": assets})

    crop_specs = (
        ("grafx-cave", "scaffolding.png", "support.png", (16, 48, 48, 96)),
        ("grafx-cave", "scaffolding.png", "door.png", (192, 112, 240, 144)),
        ("grafx-cave", "scaffolding.png", "lantern.png", (320, 112, 336, 144)),
        ("grafx-ember", "scaffolding.png", "support.png", (16, 48, 48, 96)),
        ("grafx-ember", "scaffolding.png", "door.png", (192, 112, 240, 144)),
        ("grafx-ember", "scaffolding.png", "lantern.png", (320, 112, 336, 144)),
        ("space-skyglass", "tileset.png", "spire.png", (128, 48, 144, 96)),
        ("space-skyglass", "tileset.png", "crystal-a.png", (80, 96, 96, 112)),
        ("space-skyglass", "tileset.png", "crystal-b.png", (128, 96, 144, 112)),
        ("moon-graveyard", "brush.png", "brush-a.png", (0, 0, 112, 96)),
        ("moon-graveyard", "brush.png", "brush-b.png", (112, 96, 224, 192)),
        ("seasonal", "snow-terrain.png", "snow-bank.png", (48, 16, 96, 48)),
        ("seasonal", "snow-terrain.png", "snow-rock.png", (48, 48, 96, 80)),
        ("seasonal", "lava.png", "lava-vent.png", (0, 0, 16, 32)),
        ("seasonal", "house.png", "house-single.png", (0, 0, 56, 96)),
    )
    for pack_id, source_name, output_name, box in crop_specs:
        pack = next(item for item in manifest["packs"] if item["id"] == pack_id)
        destination = WORLD_ROOT / pack_id / output_name
        size = crop_variant(WORLD_ROOT / pack_id / source_name, destination, box)
        relative = destination.relative_to(WORLD_ROOT).as_posix()
        file_hash = sha256_path(destination)
        integrity["files"][relative] = file_hash
        pack["assets"] = [asset for asset in pack["assets"] if asset["file"] != relative]
        pack["assets"].append({"file": relative, "sourceFile": f"runtime crop {box} of {pack_id}/{source_name}", "width": size[0], "height": size[1], "sha256": file_hash})

    manifest["packs"] = sorted(manifest["packs"], key=lambda pack: pack["id"])
    integrity["files"] = dict(sorted(integrity["files"].items()))
    WORLD_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    WORLD_INTEGRITY.write_text(json.dumps(integrity, indent=2) + "\n")
    credit_rows = ["# Play-mode world art", "", "Only reviewed free-use assets are shipped. Source archives are checksum-pinned and excluded.", "", "| Pack | Author | License | Source |", "| --- | --- | --- | --- |"]
    credit_rows.extend(f"| {pack['id']} | {pack['author']} | {pack['license']} | {pack['source']} |" for pack in manifest["packs"])
    (WORLD_ROOT / "CREDITS.md").write_text("\n".join(credit_rows) + "\n")
    print(f"Added {len(BACKUP_PACKS)} alternate biome packs; world manifest now has {len(manifest['packs'])} packs")


def finalize_biome_stack() -> None:
    """Prune superseded biome derivatives and register deterministic runtime crops."""
    manifest = json.loads(WORLD_MANIFEST.read_text())
    integrity = json.loads(WORLD_INTEGRITY.read_text())
    retired = {"sunscar-pixel", "frostpeak-details", "sunscar-settlement"}
    retired_files = {
        asset["file"]
        for pack in manifest["packs"]
        if pack["id"] in retired
        for asset in pack["assets"]
    }
    manifest["packs"] = [pack for pack in manifest["packs"] if pack["id"] not in retired]
    for relative in retired_files:
        integrity["files"].pop(relative, None)
    crop_specs = (
        ("moten-lava", "lava-tiles.png", "lava-surface.png", (0, 0, 32, 32)),
        ("yeehaw", "tileset.png", "cactus.png", (112, 16, 160, 80)),
        ("yeehaw", "tileset.png", "frontier-facade.png", (0, 80, 192, 256)),
    )
    for pack_id, source_name, output_name, box in crop_specs:
        pack = next(item for item in manifest["packs"] if item["id"] == pack_id)
        destination = WORLD_ROOT / pack_id / output_name
        size = crop_variant(WORLD_ROOT / pack_id / source_name, destination, box)
        relative = destination.relative_to(WORLD_ROOT).as_posix()
        file_hash = sha256_path(destination)
        integrity["files"][relative] = file_hash
        pack["assets"] = [asset for asset in pack["assets"] if asset["file"] != relative]
        pack["assets"].append({"file": relative, "sourceFile": f"runtime crop {box} of {pack_id}/{source_name}", "width": size[0], "height": size[1], "sha256": file_hash})
    integrity["files"] = dict(sorted(integrity["files"].items()))
    WORLD_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    WORLD_INTEGRITY.write_text(json.dumps(integrity, indent=2) + "\n")
    credit_rows = ["# Play-mode world art", "", "Only reviewed free-use assets are shipped. Source archives are checksum-pinned and excluded.", "", "| Pack | Author | License | Source |", "| --- | --- | --- | --- |"]
    credit_rows.extend(f"| {pack['id']} | {pack['author']} | {pack['license']} | {pack['source']} |" for pack in manifest["packs"])
    (WORLD_ROOT / "CREDITS.md").write_text("\n".join(credit_rows) + "\n")
    print(f"Finalized {len(manifest['packs'])} world packs and {len(integrity['files'])} assets")


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


def download_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "KORE-asset-importer/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def verify_exploration_assets() -> None:
    """Verify the mount, wildlife, cave, and underwater intake manifest.

    Actor atlases are deterministic transparent derivatives of the pinned
    source bytes; other selected assets retain their original PNG bytes.
    """
    manifest = json.loads(EXPLORATION_MANIFEST.read_text())
    if manifest.get("version") != 1 or not manifest.get("packs"):
        raise ValueError("Exploration asset manifest is missing or unsupported")
    seen_files: set[str] = set()
    for pack in manifest["packs"]:
        if not all(pack.get(field) for field in ("id", "author", "source", "license", "archiveUrls", "archiveSha256", "runtimeReferences", "assets")):
            raise ValueError(f"Incomplete exploration pack provenance: {pack.get('id', '<unknown>')}")
        if not str(pack["source"]).startswith("https://") or pack["license"] not in ("CC0-1.0", "CC-BY-3.0", "CC-BY-4.0"):
            raise ValueError(f"Unapproved exploration pack source or license: {pack['id']}")
        if len(pack["archiveUrls"]) != len(pack["archiveSha256"]):
            raise ValueError(f"Archive URL/checksum count differs for {pack['id']}")
        for checksum in pack["archiveSha256"]:
            if not re.fullmatch(r"[a-f0-9]{64}", checksum):
                raise ValueError(f"Invalid archive checksum for {pack['id']}")
        for asset in pack["assets"]:
            relative = asset["file"]
            if relative in seen_files:
                raise ValueError(f"Duplicate exploration output: {relative}")
            seen_files.add(relative)
            path = EXPLORATION_ROOT / relative
            if not path.is_file():
                raise FileNotFoundError(f"Missing exploration asset: {relative}")
            with Image.open(path) as image:
                if image.size != (asset["width"], asset["height"]):
                    raise ValueError(f"Dimension changed for {relative}: {image.size}")
            actual = sha256_path(path)
            if actual != asset["sha256"]:
                raise ValueError(f"Checksum changed for {relative}: {actual}")
    archives = list(EXPLORATION_ROOT.rglob("*.zip"))
    if archives:
        raise ValueError(f"Source archives must not ship in public/: {archives[0]}")
    print(f"Verified {len(seen_files)} reviewed exploration assets from {len(manifest['packs'])} packs")


def clean_exploration_actor_assets() -> None:
    """Apply the Story actor transparency and missing-pixel passes to atlases."""
    manifest = json.loads(EXPLORATION_MANIFEST.read_text())
    cleaned_count = 0
    for pack in manifest["packs"]:
        for asset in pack["assets"]:
            relative = asset["file"]
            if relative not in EXPLORATION_ACTOR_FILES:
                continue
            path = EXPLORATION_ROOT / relative
            source = Image.open(path).convert("RGBA")
            cleaned = source
            if relative.startswith("mounts/") and source.getpixel((0, 0))[3] > 16:
                cleaned = remove_exterior_matte(source, source.getpixel((0, 0))[:3])
            cleaned = fill_small_enclosed_holes(source, cleaned)
            cleaned = fill_dense_interior_gaps(source, cleaned)
            cleaned = fill_single_pinholes(source, cleaned)
            cleaned.save(path, format="PNG", optimize=True)
            asset["sha256"] = sha256_path(path)
            asset["processing"] = "binary-alpha exterior matte cleanup plus conservative interior gap fill"
            cleaned_count += 1
    EXPLORATION_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Cleaned {cleaned_count} exploration actor atlases")


def import_exploration_assets() -> None:
    manifest = json.loads(EXPLORATION_MANIFEST.read_text())
    with tempfile.TemporaryDirectory(prefix="kore-exploration-assets-"):
        for pack in manifest["packs"]:
            urls = pack["archiveUrls"]
            checksums = pack["archiveSha256"]
            if len(urls) == 1 and urls[0].lower().endswith(".zip"):
                archive = download_bytes(urls[0])
                if sha256_bytes(archive) != checksums[0]:
                    raise ValueError(f"Archive checksum mismatch for {pack['id']}")
                with zipfile.ZipFile(io.BytesIO(archive)) as source:
                    for asset in pack["assets"]:
                        data = source.read(asset["sourceFile"])
                        destination = EXPLORATION_ROOT / asset["file"]
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        destination.write_bytes(data)
            else:
                if len(urls) != len(pack["assets"]):
                    raise ValueError(f"Direct-file pack must map one URL per selected file: {pack['id']}")
                for url, expected, asset in zip(urls, checksums, pack["assets"], strict=True):
                    data = download_bytes(url)
                    if sha256_bytes(data) != expected:
                        raise ValueError(f"Direct-file checksum mismatch for {pack['id']} / {asset['sourceFile']}")
                    destination = EXPLORATION_ROOT / asset["file"]
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    destination.write_bytes(data)
    clean_exploration_actor_assets()
    verify_exploration_assets()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="Download and re-import every reviewed CC0 pack")
    parser.add_argument("--refresh-exploration", action="store_true", help="Download only the checksum-pinned exploration packs")
    parser.add_argument("--clean-exploration-actors", action="store_true", help="Re-run alpha cleanup for mount and wildlife atlases")
    parser.add_argument("--finalize-biome-stack", action="store_true", help="Prune superseded biome derivatives and register runtime crops")
    parser.add_argument("--add-backup-biome-stack", action="store_true", help="Import the coherent alternate procedural-biome families")
    parser.add_argument("--archive-dir", type=Path, help="Use checksum-pinned archives from this directory")
    args = parser.parse_args()
    if args.add_backup_biome_stack:
        add_backup_biome_stack(args.archive_dir)
    elif args.finalize_biome_stack:
        finalize_biome_stack()
    elif args.refresh or not WORLD_MANIFEST.is_file() or not WORLD_INTEGRITY.is_file():
        import_world_packs(args.archive_dir)
    if args.refresh or args.refresh_exploration:
        import_exploration_assets()
    elif args.clean_exploration_actors:
        clean_exploration_actor_assets()
    verify_integrity(ADVENTURE_ROOT, ADVENTURE_INTEGRITY, "adventure")
    verify_integrity(WORLD_ROOT, WORLD_INTEGRITY, "world")
    verify_exploration_assets()


if __name__ == "__main__":
    main()
