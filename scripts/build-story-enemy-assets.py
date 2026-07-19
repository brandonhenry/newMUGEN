#!/usr/bin/env python3
"""Build the user-supplied Play-mode enemy sheets into transparent runtime frames.

The source sheets share a flat neutral-gray matte and five labelled animation rows.
This importer keeps reviewed row/frame counts explicit, removes only the edge-connected
matte and disconnected neutral motion guides, normalizes every frame to a shared
baseline, and emits a deterministic runtime manifest plus visual contact sheets.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import shutil
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from story_sprite_alpha import clean_transparent_sprite


ROOT = Path("public/story/enemies/kore-enemies-v1")
RUNTIME_MANIFEST = Path("src/story/storyEnemyManifest.json")
ROSTER_REGISTRY = Path("src/story/storyRosterExpansion.json")
FRAME_SIZE = (192, 192)
BASELINE = 188
ROW_BANDS = ((18, 190), (195, 385), (390, 580), (585, 775), (780, 985))
CELL_LEFT = 195
CELL_WIDTH = 160

INCOMING = {
    1: "codex-clipboard-d306ddf1-817e-41d8-8109-d777db0d1f06.png",
    2: "codex-clipboard-966bdd8d-ec37-4cda-8f5f-e042a5f59ace.png",
    3: "codex-clipboard-0c10d437-7395-4574-ae79-4e1b6d2e7b3a.png",
    4: "codex-clipboard-f1df42f6-b755-40e3-9f24-20d861256f11.png",
    5: "codex-clipboard-97d178ec-33a3-4117-ab13-6c90eeb27b00.png",
    6: "codex-clipboard-386100ec-a4c2-4c1a-be4b-71235b773097.png",
    7: "codex-clipboard-6d74d0c7-37e3-4e90-8b92-46f2e2ba311c.png",
    8: "codex-clipboard-868a930c-866a-471c-9f67-6ae068b40f8e.png",
    9: "codex-clipboard-bd8254a6-2422-4459-8f30-7509620fe903.png",
    10: "codex-clipboard-d84b49ff-254b-4a5d-a495-2718969f5324.png",
    11: "codex-clipboard-5711c47b-ffb8-4970-b283-dfc3863508e7.png",
    12: "codex-clipboard-9271d166-dfba-49b2-aa82-74676363d171.png",
    13: "codex-clipboard-5c6cd23f-7990-4eb5-ba81-32c7370051ca.png",
    14: "codex-clipboard-facc29ab-43ff-4e47-be07-5ce653d6ef5c.png",
    15: "codex-clipboard-870474a1-17ae-4a5f-af61-693dcd2b2121.png",
    16: "codex-clipboard-9d826e06-bca0-4367-9565-dd592aa97cc6.png",
    17: "codex-clipboard-40fad858-6e25-4685-b309-d9c0d63a40e0.png",
    18: "codex-clipboard-2389b6ef-027f-4b4d-b81f-37a0514ffffb.png",
    19: "codex-clipboard-1fd88061-4d8f-4586-8199-06fefb939e10.png",
    20: "codex-clipboard-82f00a08-0c03-410d-af6d-d8e9a5b68326.png",
    21: "codex-clipboard-4e5c997d-ecc1-4bcc-9086-aeb5d44fabdd.png",
    22: "codex-clipboard-d959b086-56ef-4093-989b-ce8654e7e5c1.png",
    23: "codex-clipboard-02209fab-c5e1-4ac7-b12f-e29662c2e96a.png",
    24: "codex-clipboard-4bd4bfe9-74eb-4b12-a52d-efbbb13a7028.png",
    25: "codex-clipboard-27d3d3a7-5722-4ac6-b6a1-94b0667fa2e2.png",
    26: "codex-clipboard-0e471951-b0b5-4434-b9ad-cec526bd13cf.png",
    27: "codex-clipboard-5ac5fa6a-8c7d-44e3-8402-2483b7dc6d49.png",
    28: "codex-clipboard-79ff14fa-c688-4541-9102-ffa108f787e4.png",
    29: "codex-clipboard-0dd3db32-aef1-43ae-8eab-aa4da6631fe4.png",
}


def rows(*entries: tuple[str, int, int, int]) -> dict[str, tuple[int, int, int]]:
    return {name: (sheet, row, count) for name, sheet, row, count in entries}


ENEMIES: dict[str, dict[str, Any]] = {
    "ember-fist": {"label": "Ember Fist", "tier": "challenger", "sheets": [1, 2], "rows": rows(("idle",1,0,6),("walk",1,1,8),("run",1,2,8),("jump",1,3,8),("attack-1",1,4,4),("attack-2",2,0,3),("attack-3",2,1,4),("block",2,2,2),("hurt",2,3,3),("dead",2,4,3))},
    "dusk-ronin": {"label": "Dusk Ronin", "tier": "challenger", "sheets": [3, 4], "rows": rows(("idle",3,0,6),("walk",3,1,8),("run",3,2,8),("jump",3,3,8),("attack-1",3,4,6),("attack-2",4,0,4),("attack-3",4,1,3),("block",4,2,2),("hurt",4,3,2),("dead",4,4,3))},
    "crescent-rogue": {"label": "Crescent Rogue", "tier": "challenger", "sheets": [5, 6], "rows": rows(("idle",5,0,6),("walk",5,1,8),("run",5,2,8),("jump",5,3,8),("attack-1",5,4,5),("attack-2",6,0,3),("attack-3",6,1,4),("block",6,2,4),("hurt",6,3,2),("dead",6,4,4))},
    "chimera-android": {"label": "Chimera Android", "tier": "challenger", "sheets": [7, 8], "rows": rows(("idle",7,0,5),("walk",7,1,6),("run",7,2,6),("attack-1",7,3,5),("attack-2",7,4,4),("attack-3",8,0,2),("attack-4",8,1,4),("jump",8,2,6),("hurt",8,3,2),("dead",8,4,8))},
    "silver-duelist": {"label": "Silver Duelist", "tier": "challenger", "sheets": [9, 10], "rows": rows(("idle",9,0,5),("walk",9,1,7),("run",9,2,8),("attack-1",9,3,5),("attack-2",9,4,3),("attack-3",10,0,4),("block",10,1,2),("jump",10,2,7),("hurt",10,3,1),("dead",10,4,8))},
    "crimson-countess": {"label": "Crimson Countess", "tier": "challenger", "sheets": [11, 12], "rows": rows(("idle",11,0,5),("walk",11,1,6),("run",11,2,6),("attack-1",11,3,6),("attack-2",11,4,3),("attack-3",12,0,2),("attack-4",12,1,6),("jump",12,2,7),("hurt",12,3,2),("dead",12,4,8))},
    "laughing-oni": {"label": "Laughing Oni", "tier": "challenger", "sheets": [13, 14], "rows": rows(("idle",13,0,5),("walk",13,1,6),("run",13,2,7),("attack-1",13,3,4),("attack-2",13,4,4),("attack-3",14,0,4),("special",14,1,4),("jump",14,2,8),("hurt",14,3,3),("dead",14,4,5))},
    "hollow-bride": {"label": "Hollow Bride", "tier": "challenger", "sheets": [16, 17], "rows": rows(("idle",16,0,5),("walk",16,1,5),("run",16,2,5),("attack-1",16,3,4),("attack-2",16,4,4),("attack-3",17,0,7),("attack-4",17,1,7),("special",17,2,4),("hurt",17,3,3),("dead",17,4,4))},
    "veil-shade": {"label": "Veil Shade", "tier": "regular", "sheets": [15], "rows": rows(("idle",15,0,6),("walk",15,1,7),("run",15,2,7),("attack-1",15,3,5),("attack-2",15,4,4))},
    "cinder-wisp": {"label": "Cinder Wisp", "tier": "regular", "sheets": [18, 19], "rows": rows(("idle",18,0,6),("walk",18,1,7),("run",18,2,7),("attack-1",18,4,8),("attack-2",19,0,8),("special",19,2,8),("hurt",19,3,3),("dead",19,4,6))},
    "nightshade-bulb": {"label": "Nightshade Bulb", "tier": "regular", "sheets": [20, 21], "rows": rows(("idle",20,0,5),("walk",20,1,8),("attack-1",20,2,6),("attack-2",20,3,5),("attack-3",20,4,8),("special",21,0,8),("disguise",21,1,8),("hurt",21,3,3),("dead",21,4,2))},
    "graveblade": {"label": "Graveblade", "tier": "regular", "sheets": [22, 23], "rows": rows(("idle",22,0,7),("walk",22,1,8),("run",22,2,7),("jump",22,3,8),("attack-1",22,4,7),("attack-2",23,0,4),("attack-3",23,1,7),("special",23,2,5),("hurt",23,3,3),("dead",23,4,3))},
    "tide-slime": {"label": "Tide Slime", "tier": "regular", "sheets": [24, 25], "rows": rows(("idle",24,0,8),("walk",24,1,8),("run",24,2,7),("attack-1",24,3,8),("jump",24,4,8),("attack-2",25,0,4),("attack-3",25,1,4),("attack-4",25,2,5),("hurt",25,3,6),("dead",25,4,3))},
    "venom-slime": {"label": "Venom Slime", "tier": "regular", "sheets": [26], "derive": "tide-slime", "rows": rows(("idle",26,0,8),("walk",26,1,8),("run",26,2,7),("attack-1",26,3,8),("jump",26,4,8))},
    "volt-slime": {"label": "Volt Slime", "tier": "regular", "sheets": [27], "derive": "tide-slime", "rows": rows(("idle",27,0,8),("walk",27,1,8),("run",27,2,7),("attack-1",27,3,8),("jump",27,4,8))},
    "magma-slime": {"label": "Magma Slime", "tier": "regular", "sheets": [28, 29], "rows": rows(("idle",28,0,8),("walk",28,1,8),("run",28,2,7),("attack-1",28,3,8),("jump",28,4,8),("attack-2",29,0,4),("attack-3",29,1,4),("attack-4",29,2,5),("hurt",29,3,6),("dead",29,4,3))},
}

EXPANSION_REGISTRY = json.loads(ROSTER_REGISTRY.read_text())
for biome_id, biome in EXPANSION_REGISTRY["biomes"].items():
    for enemy in biome["enemies"]:
        enemy_id, label, tier, archetype, behavior, design, accent, metrics = enemy
        ENEMIES[enemy_id] = {
            "label": label,
            "tier": tier,
            "archetype": archetype,
            "behavior": behavior,
            "biomeId": biome_id,
            "design": design,
            "accent": accent,
            "metrics": metrics,
            "generated": True,
            "sheets": [1, 2],
            "rows": rows(
                ("idle", 1, 0, 6), ("walk", 1, 1, 8), ("run", 1, 2, 8),
                ("traverse", 1, 3, 6), ("attack-1", 1, 4, 6),
                ("attack-2", 2, 0, 6), ("special", 2, 1, 6),
                ("block", 2, 2, 4), ("hurt", 2, 3, 4), ("dead", 2, 4, 6),
            ),
            "chromaKey": biome["chromaKey"],
            "palette": biome["palette"],
        }


# Cells below were checked at full resolution. They select complete bodies only;
# rows with fewer real poses intentionally hold the final complete pose.
GENERATED_REVIEWED_CELLS: dict[str, dict[str, Any]] = {
    "buried-colossus": {
        "bounds": {1: (0, 258, 456, 623, 784, 1024), 2: (0, 252, 464, 638, 816, 1024)},
        "centers": {
            "idle": (164, 328, 496, 670, 846), "walk": (148, 316, 498, 670, 834, 993, 1151, 1305),
            "run": (117, 319, 504, 691, 876, 1071, 1260, 1438), "traverse": (189, 426, 662, 900, 1136),
            "attack-1": (185, 371, 536, 748, 982, 1174), "attack-2": (177, 397, 620, 850, 1074),
            "special": (158, 381, 602, 850, 1108, 1372), "block": (176, 393, 606),
            "hurt": (170, 386, 614, 850), "dead": (172, 402, 626, 856, 1108),
        },
    },
    "coalwing": {
        "bounds": {1: (0, 227, 430, 554, 762, 1024), 2: (0, 247, 444, 643, 816, 1024)},
        "centers": {
            "idle": (132, 290, 470, 644, 812), "walk": (130, 322, 509, 700, 890, 1072, 1250, 1419),
            "run": (124, 322, 527, 714, 888, 1060, 1236, 1401), "traverse": (141, 333, 572, 806, 1032, 1252),
            "attack-1": (147, 342, 580, 829, 1056, 1312), "attack-2": (214, 424, 634, 844, 1056, 1274),
            "special": (177, 440, 668, 890, 1107, 1355), "block": (218, 454, 678, 908),
            "hurt": (194, 426, 652, 888), "dead": (181, 421, 648, 870, 1090),
        },
    },
    "glasswater-seer": {
        "animationBounds": {"idle": (0, 247), "walk": (247, 465), "run": (465, 662), "traverse": (662, 837), "attack-1": (837, 1024), "attack-2": (0, 232), "special": (232, 422), "block": (422, 623), "hurt": (623, 823), "dead": (823, 1024)},
        "centers": {"idle": (194.5, 386.5, 582.5, 772.5, 960), "walk": (196, 354, 514.5, 688.5, 849.5, 1013.5, 1165, 1320), "run": (193.5, 409, 597.5, 792.5, 982.5, 1177, 1389), "traverse": (197, 389, 581.5, 778.5, 996), "attack-1": (221.5, 450.5, 679.5, 896.5, 1109.5), "attack-2": (221, 457.5, 709, 955.5, 1198.5), "special": (189.5, 440.5, 674, 914.5, 1125, 1322.5), "block": (164, 391.5, 622.5, 846.5), "hurt": (213.5, 415.5, 618, 820.5), "dead": (187, 384, 595, 840.5, 1091, 1331)},
    },
    "glasswing-vulture": {
        "animationBounds": {"idle": (0, 205), "walk": (205, 397), "run": (397, 529), "traverse": (529, 718), "attack-1": (718, 1024), "attack-2": (0, 219), "special": (219, 445), "block": (445, 575), "hurt": (575, 760), "dead": (760, 1024)},
        "centers": {"idle": (134, 317.5, 498, 677, 848.5), "walk": (144, 323, 504.5, 683, 872, 1068.5, 1230.5, 1404.5), "run": (151.5, 338.5, 555.5, 782.5, 1011, 1209.5, 1386.5), "traverse": (138.5, 342, 621, 900, 1120, 1340.5), "attack-1": (136.5, 368.5, 622.5, 829, 1043, 1277), "attack-2": (168, 356, 552.5, 748.5, 940), "special": (198.5, 435.5, 677.5, 918.5, 1133, 1356.5), "block": (215.5, 480.5, 718.5, 957), "hurt": (186, 475.5, 738.5, 976), "dead": (157, 396.5, 610.5, 836.5, 1069, 1331.5)},
    },
    "ossuary-knight": {
        "animationBounds": {"idle": (100, 305), "walk": (320, 530), "run": (535, 730), "traverse": (535, 730), "attack-1": (735, 910), "attack-2": (30, 235), "special": (235, 445), "block": (445, 635), "hurt": (635, 815), "dead": (815, 1000)},
        "centers": {"idle": (112.5, 279, 440, 646.5, 848.5, 1046.5), "walk": (158, 391, 630, 893, 1130.5, 1373), "run": (154, 382, 594, 786, 1031.5, 1290.5), "traverse": (154, 382, 594, 786, 1031.5, 1290.5), "attack-1": (231.5, 474, 693.5, 883, 1082, 1338.5), "attack-2": (160, 386, 614.5, 877, 1112, 1333.5), "special": (185, 379, 624.5, 865.5, 1084, 1305.5), "block": (180.5, 411.5, 640.5, 856.5), "hurt": (171, 400, 610, 824), "dead": (170.5, 404, 633, 866.5, 1075.5, 1314)},
    },
    "sanctum-architect": {
        "animationBounds": {"idle": (25, 215), "walk": (215, 400), "run": (400, 520), "traverse": (520, 682), "attack-1": (682, 815), "attack-2": (30, 250), "special": (250, 450), "block": (450, 620), "hurt": (620, 810), "dead": (810, 1000)},
        "centers": {"idle": (149, 340.5, 529.5, 719.5, 912.5), "walk": (138, 313.5, 486, 663, 838, 1022.5, 1193), "run": (213.5, 509, 782.5, 1043.5, 1274), "traverse": (163, 368.5, 567.5, 779, 1040.5, 1313.5), "attack-1": (151.5, 352.5, 541, 739, 941, 1134), "attack-2": (162, 368.5, 566.5, 760.5, 974.5, 1201.5), "special": (170, 369.5, 579.5, 794.5, 1043), "block": (178, 418, 660.5, 891), "hurt": (179.5, 431.5, 646.5, 862), "dead": (165, 371, 652.5, 895, 1097.5, 1316)},
    },
    "windspine-reaver": {
        "animationBounds": {"idle": (70, 300), "walk": (305, 520), "run": (525, 720), "traverse": (525, 720), "attack-1": (730, 920), "attack-2": (25, 225), "special": (230, 430), "block": (430, 610), "hurt": (610, 790), "dead": (790, 980)},
        "centers": {"idle": (121.5, 304, 481, 678.5, 870.5, 1058), "walk": (144.5, 393.5, 647, 892.5, 1139.5, 1393.5), "run": (163.5, 400.5, 613.5, 836, 1062.5, 1311), "traverse": (163.5, 400.5, 613.5, 836, 1062.5, 1311), "attack-1": (215, 459, 699, 896.5, 1101, 1339), "attack-2": (142.5, 342, 557.5, 783, 1007.5, 1224), "special": (138, 348, 573.5, 796, 1018.5, 1219.5), "block": (109, 321.5, 543.5, 748.5), "hurt": (134, 333.5, 543, 759), "dead": (127.5, 361.5, 581, 818.5, 1054, 1349.5)},
    },
    "millstorm-sage": {"animationBounds": {"special": (226, 437)}, "centers": {"special": (112.5, 329, 528.5)}},
    "lantern-bat": {"animationBounds": {"special": (212, 431)}, "centers": {"special": (206, 381, 561, 731.5)}},
    "heartwood-oracle": {"animationBounds": {"special": (220, 438)}, "centers": {"special": (119, 346.5, 562, 775.5, 988, 1291.5)}},
    "ore-spitter": {"animationBounds": {"special": (225, 421)}, "centers": {"special": (128.5, 339.5, 556, 820, 1029.5)}},
    "sunstone-artificer": {"animationBounds": {"special": (227, 423)}, "centers": {"special": (109, 390, 623, 820, 1050, 1300)}},
    "vent-imp": {"animationBounds": {"special": (217, 405)}, "centers": {"special": (203, 422.5, 662, 925, 1229.5)}},
    "iron-foreman": {"animationBounds": {"attack-1": (805, 1024), "dead": (900, 1024)}, "primaryOnly": {"hurt"}, "centers": {"attack-1": (105, 307.5, 500, 700, 925), "hurt": (105, 310, 490, 690), "dead": (107.5, 287.5, 488, 665.5, 852, 1109)}},
}


def source_path(number: int) -> Path:
    committed = ROOT / "sources" / f"image-{number:02d}.png"
    incoming = Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T") / INCOMING[number]
    path = incoming if incoming.exists() else committed
    if not path.exists():
        raise FileNotFoundError(f"Missing enemy source image {number}: {INCOMING[number]}")
    with Image.open(path) as image:
        if image.size != (1536, 1024):
            raise ValueError(f"Expected 1536x1024 image {number}, got {image.size}")
    return path


def remove_gray_matte(image: Image.Image) -> Image.Image:
    source = image.convert("RGB")
    pixels = source.load()
    width, height = source.size
    mask = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def neutral(x: int, y: int) -> bool:
        red, green, blue = pixels[x, y]
        return max(red, green, blue) - min(red, green, blue) <= 18 and 90 <= max(red, green, blue) <= 210

    def seed(x: int, y: int) -> None:
        key = y * width + x
        if not mask[key] and neutral(x, y):
            mask[key] = 1
            queue.append((x, y))

    for x in range(width):
        seed(x, 0); seed(x, height - 1)
    for y in range(height):
        seed(0, y); seed(width - 1, y)
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < width and 0 <= ny < height:
                seed(nx, ny)
    output = Image.new("RGBA", source.size)
    out = output.load()
    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            out[x, y] = (0, 0, 0, 0) if mask[y * width + x] else (red, green, blue, 255)
    return output


def components(image: Image.Image) -> list[list[tuple[int, int]]]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited = bytearray(image.width * image.height)
    found: list[list[tuple[int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            key = y * image.width + x
            if visited[key] or not pixels[x, y]:
                continue
            visited[key] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for ny in range(max(0, cy - 1), min(image.height, cy + 2)):
                    for nx in range(max(0, cx - 1), min(image.width, cx + 2)):
                        neighbor = ny * image.width + nx
                        if not visited[neighbor] and pixels[nx, ny]:
                            visited[neighbor] = 1
                            queue.append((nx, ny))
            found.append(component)
    return found


def clean_cell(cell: Image.Image) -> Image.Image:
    found = components(cell)
    if not found:
        raise ValueError("No sprite content found in reviewed enemy cell")
    primary = max(found, key=len)
    primary_bounds = (min(x for x, _ in primary), min(y for _, y in primary), max(x for x, _ in primary), max(y for _, y in primary))
    keep = set(primary)
    pixels = cell.load()
    for component in found:
        if component is primary:
            continue
        left, top = min(x for x, _ in component), min(y for _, y in component)
        right, bottom = max(x for x, _ in component), max(y for _, y in component)
        gap_x = max(0, primary_bounds[0] - right, left - primary_bounds[2])
        gap_y = max(0, primary_bounds[1] - bottom, top - primary_bounds[3])
        chroma = max((max(pixels[x, y][:3]) - min(pixels[x, y][:3]) for x, y in component), default=0)
        # Keep touching antialias fragments and deliberate colored effects, but drop
        # disconnected neutral ink arcs used as motion guides on the source sheets.
        if (gap_x <= 3 and gap_y <= 3) or (chroma >= 38 and len(component) >= 8):
            keep.update(component)
    output = Image.new("RGBA", cell.size)
    out = output.load()
    for x, y in keep:
        out[x, y] = pixels[x, y]
    bounds = output.getbbox()
    if not bounds:
        raise ValueError("Enemy cell became empty after guide cleanup")
    return output.crop(bounds)


def normalize(frame: Image.Image) -> tuple[Image.Image, list[int]]:
    scale = min(1.0, 184 / max(1, frame.width), 184 / max(1, frame.height))
    if scale < 1:
        frame = frame.resize((max(1, round(frame.width * scale)), max(1, round(frame.height * scale))), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", FRAME_SIZE)
    x = (FRAME_SIZE[0] - frame.width) // 2
    y = BASELINE - frame.height
    canvas.alpha_composite(frame, (x, y))
    return canvas, [x, y, x + frame.width, y + frame.height]


def generated_source_path(enemy_id: str, sheet: int, chroma: bool = False) -> Path:
    suffix = "-chroma" if chroma else ""
    path = ROOT / "generated" / f"{enemy_id}-sheet-{sheet}{suffix}.png"
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as image:
        if image.size != (1536, 1024):
            raise ValueError(f"Expected 1536x1024 generated sheet for {enemy_id}, got {image.size}")
    return path


def generated_centers(
    sheet: Image.Image,
    row: int,
    count: int,
    vertical_bounds: tuple[int, int] | None = None,
) -> list[float]:
    top, bottom = vertical_bounds or (
        round(row * sheet.height / 5),
        round((row + 1) * sheet.height / 5),
    )
    row_image = sheet.crop((0, top, sheet.width, bottom))
    candidates: list[tuple[int, float]] = []
    for component in components(row_image):
        left, right = min(x for x, _ in component), max(x for x, _ in component)
        component_top, component_bottom = min(y for _, y in component), max(y for _, y in component)
        if len(component) >= 50 and right - left >= 18 and component_bottom - component_top >= 24:
            candidates.append((len(component), (left + right) / 2))
    selected: list[tuple[int, float]] = []
    minimum_spacing = sheet.width / count * .45
    for candidate in sorted(candidates, reverse=True):
        if all(abs(candidate[1] - other[1]) >= minimum_spacing for other in selected):
            selected.append(candidate)
        if len(selected) == count:
            break
    centers = sorted(center for _area, center in selected)
    if not centers:
        centers = [(index + 0.5) * sheet.width / count for index in range(count)]
    return centers


def generated_frame(
    sheet: Image.Image,
    row: int,
    index: int,
    centers: list[float],
    vertical_bounds: tuple[int, int] | None = None,
) -> Image.Image:
    if len(centers) == 1:
        left, right = 0, sheet.width
    else:
        left = round(centers[0] - (centers[1] - centers[0]) / 2) if index == 0 else round((centers[index - 1] + centers[index]) / 2)
        right = round(centers[-1] + (centers[-1] - centers[-2]) / 2) if index == len(centers) - 1 else round((centers[index] + centers[index + 1]) / 2)
    if vertical_bounds:
        top, bottom = vertical_bounds
    else:
        top = round(row * sheet.height / 5)
        bottom = round((row + 1) * sheet.height / 5)
    cell = sheet.crop((max(0, left), top, min(sheet.width, right), bottom))
    found = components(cell)
    if found:
        primary = max(found, key=len)
        primary_left, primary_right = min(x for x, _ in primary), max(x for x, _ in primary)
        primary_top, primary_bottom = min(y for _, y in primary), max(y for _, y in primary)
        vertical_edge = max(3, round(cell.height * .08))
        horizontal_edge = max(3, round(cell.width * .06))
        keep: set[tuple[int, int]] = set()
        for component in found:
            left_c, right_c = min(x for x, _ in component), max(x for x, _ in component)
            top_c, bottom_c = min(y for _, y in component), max(y for _, y in component)
            clipped = (
                (left_c <= horizontal_edge and right_c < primary_left - 1)
                or (right_c >= cell.width - horizontal_edge and left_c > primary_right + 1)
                or (top_c <= vertical_edge and bottom_c < primary_top - 1)
                or (bottom_c >= cell.height - vertical_edge and top_c > primary_bottom + 1)
            )
            if component is primary or not clipped:
                keep.update(component)
        if len(keep) != sum(len(component) for component in found):
            cleaned = Image.new("RGBA", cell.size)
            source_pixels, cleaned_pixels = cell.load(), cleaned.load()
            for x, y in keep:
                cleaned_pixels[x, y] = source_pixels[x, y]
            cell = cleaned
    bounds = cell.getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
    if not bounds:
        raise ValueError("No generated sprite content found in cell")
    return cell.crop(bounds)


def primary_component_only(image: Image.Image) -> Image.Image:
    found = components(image)
    if not found:
        return image
    primary = max(found, key=len)
    cleaned = Image.new("RGBA", image.size)
    source, target = image.load(), cleaned.load()
    for x, y in primary:
        target[x, y] = source[x, y]
    bounds = cleaned.getchannel("A").getbbox()
    return cleaned.crop(bounds) if bounds else image


def dominant_hue(image: Image.Image) -> float:
    hues: list[float] = []
    for red, green, blue, alpha in image.get_flattened_data():
        if not alpha:
            continue
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if saturation > 0.45 and value > 0.25:
            hues.append(hue)
    return sorted(hues)[len(hues) // 2] if hues else 0


def shift_hue(image: Image.Image, amount: float) -> Image.Image:
    output = Image.new("RGBA", image.size)
    result = []
    for red, green, blue, alpha in image.get_flattened_data():
        if not alpha:
            result.append((0, 0, 0, 0)); continue
        hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        if saturation > 0.18:
            hue = (hue + amount) % 1
        nr, ng, nb = colorsys.hsv_to_rgb(hue, saturation, value)
        result.append((round(nr * 255), round(ng * 255), round(nb * 255), alpha))
    output.putdata(result)
    return output


def duration_for(animation: str) -> int:
    if animation == "idle" or animation in {"block", "disguise"}: return 170
    if animation == "walk": return 105
    if animation == "run": return 78
    if animation == "jump": return 92
    if animation == "hurt": return 110
    if animation == "dead": return 135
    return 88


def verify_manifest(existing_manifest_only: bool = False) -> None:
    manifest_path = ROOT / "manifest.json"
    payload = json.loads(manifest_path.read_text())
    if json.loads(RUNTIME_MANIFEST.read_text()) != payload:
        raise SystemExit("Runtime enemy manifest is missing or stale")
    expected = len(payload.get("enemies", [])) if existing_manifest_only else len(ENEMIES)
    if len(payload.get("enemies", [])) != expected:
        raise SystemExit(f"Expected {expected} enemies, found {len(payload.get('enemies', []))}")
    ids = [enemy["id"] for enemy in payload["enemies"]]
    if len(set(ids)) != len(ids):
        raise SystemExit("Enemy manifest contains duplicate IDs")
    for enemy in payload["enemies"]:
        animation_ids = {animation["id"] for animation in enemy["animations"]}
        if "idle" not in animation_ids:
            raise SystemExit(f"{enemy['id']} has no idle animation")
        for source in enemy["sources"]:
            path = Path("public") / source["path"].lstrip("/")
            if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
                raise SystemExit(f"Enemy source checksum mismatch: {path}")
            if source.get("kind") == "imagegen":
                chroma = Path("public") / source["chromaSourcePath"].lstrip("/")
                if hashlib.sha256(chroma.read_bytes()).hexdigest() != source["chromaSourceSha256"]:
                    raise SystemExit(f"Enemy chroma checksum mismatch: {chroma}")
                if not source.get("prompt") or not source.get("model") or not source.get("sourceReferences"):
                    raise SystemExit(f"Enemy generation provenance incomplete: {enemy['id']}")
        for animation in enemy["animations"]:
            if (animation["id"].startswith("attack") or animation["id"] == "special") and not animation.get("activeFrameRange"):
                raise SystemExit(f"Enemy attack range missing: {enemy['id']}/{animation['id']}")
            for frame in animation["frames"]:
                path = Path("public") / frame["path"].lstrip("/")
                image = Image.open(path)
                bounds = image.convert("RGBA").getchannel("A").point(lambda value: 255 if value > 16 else 0).getbbox()
                if image.mode != "RGBA" or image.size != FRAME_SIZE or not bounds or bounds[3] > BASELINE:
                    raise SystemExit(f"Enemy frame alpha/baseline mismatch: {path}")
                if set(image.convert("RGBA").getchannel("A").get_flattened_data()) - {0, 255}:
                    raise SystemExit(f"Enemy alpha is not binary: {path}")
    print(f"Verified {expected} enemy sprite manifests")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--existing-manifest-only", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify_manifest(existing_manifest_only=args.existing_manifest_only)
        return
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "sources").mkdir(exist_ok=True)
    loaded: dict[int, Image.Image] = {}
    source_meta: dict[int, dict[str, str]] = {}
    for number in INCOMING:
        path = source_path(number)
        committed = ROOT / "sources" / f"image-{number:02d}.png"
        if path.resolve() != committed.resolve():
            shutil.copyfile(path, committed)
        contents = committed.read_bytes()
        source_meta[number] = {"originalFile": INCOMING[number], "path": f"/story/enemies/kore-enemies-v1/sources/image-{number:02d}.png", "sha256": hashlib.sha256(contents).hexdigest()}
        loaded[number] = remove_gray_matte(Image.open(committed))

    built_frames: dict[str, dict[str, list[Image.Image]]] = {}
    generated_loaded: dict[tuple[str, int], Image.Image] = {}
    manifest: dict[str, Any] = {"version": 1, "style": "kore-enemies-v1", "frameSize": {"width": FRAME_SIZE[0], "height": FRAME_SIZE[1], "baseline": BASELINE}, "enemies": []}
    selected_enemies = ENEMIES
    if args.existing_manifest_only and RUNTIME_MANIFEST.is_file():
        existing_ids = {entry["id"] for entry in json.loads(RUNTIME_MANIFEST.read_text()).get("enemies", [])}
        selected_enemies = {enemy_id: definition for enemy_id, definition in ENEMIES.items() if enemy_id in existing_ids}
    for enemy_id, definition in selected_enemies.items():
        enemy_root = ROOT / "sets" / enemy_id
        if enemy_root.exists():
            shutil.rmtree(enemy_root)
        animation_entries = []
        built_frames[enemy_id] = {}
        for animation, (sheet, row, count) in definition["rows"].items():
            animation_root = enemy_root / "frames" / animation
            animation_root.mkdir(parents=True, exist_ok=True)
            images: list[Image.Image] = []
            frames = []
            if definition.get("generated"):
                key = (enemy_id, sheet)
                if key not in generated_loaded:
                    generated_loaded[key] = Image.open(generated_source_path(enemy_id, sheet)).convert("RGBA")
                generated_sheet = generated_loaded[key]
                reviewed = GENERATED_REVIEWED_CELLS.get(enemy_id, {})
                vertical_bounds = reviewed.get("animationBounds", {}).get(animation)
                if not vertical_bounds:
                    reviewed_boundaries = reviewed.get("bounds", {}).get(sheet)
                    vertical_bounds = (
                        (reviewed_boundaries[row], reviewed_boundaries[row + 1])
                        if reviewed_boundaries else None
                    )
                reviewed_centers = reviewed.get("centers", {}).get(animation)
                centers = list(reviewed_centers) if reviewed_centers else generated_centers(
                    generated_sheet, row, count, vertical_bounds
                )
            else:
                y0, y1 = ROW_BANDS[row]
            for index in range(count):
                try:
                    if definition.get("generated"):
                        cleaned = generated_frame(
                            generated_sheet,
                            row,
                            min(index, len(centers) - 1),
                            centers,
                            vertical_bounds,
                        )
                        if animation in reviewed.get("primaryOnly", set()):
                            cleaned = primary_component_only(cleaned)
                    else:
                        x0 = CELL_LEFT + index * CELL_WIDTH
                        cell = loaded[sheet].crop((x0, y0, min(1536, x0 + CELL_WIDTH), y1))
                        cleaned = clean_cell(cell)
                except ValueError as error:
                    if definition.get("generated") and animation == "walk":
                        raise ValueError(f"{enemy_id}/{animation} frame {index + 1} sheet {sheet} row {row}: {error}") from error
                    # Reviewed rows are left-packed. A missing trailing cell means
                    # the visible sequence ended one pose earlier than estimated.
                    if index > 0 and images:
                        cleaned = images[-1].crop(images[-1].getbbox())
                    else:
                        raise ValueError(f"{enemy_id}/{animation} frame {index + 1} sheet {sheet} row {row}: {error}") from error
                cleaned = clean_transparent_sprite(cleaned)
                normalized, bounds = normalize(cleaned)
                frame_path = animation_root / f"{index + 1:02d}.png"
                normalized.save(frame_path, optimize=True)
                images.append(normalized)
                frames.append({"id": f"{animation}-{index + 1:02d}", "path": f"/story/enemies/kore-enemies-v1/sets/{enemy_id}/frames/{animation}/{index + 1:02d}.png", "durationMs": duration_for(animation), "contentBounds": bounds, "sha256": hashlib.sha256(frame_path.read_bytes()).hexdigest()})
            if definition.get("generated") and animation == "walk" and len(centers) == count:
                pose_hashes = {hashlib.sha256(image.tobytes()).hexdigest() for image in images}
                if len(images) != 8 or len(pose_hashes) != 8:
                    raise ValueError(f"Generated walk row for {enemy_id} must contain eight distinct approved poses")
            built_frames[enemy_id][animation] = images
            count = len(frames)
            entry: dict[str, Any] = {"id": animation, "loop": animation in {"idle", "walk", "run", "block", "disguise"}, "frames": frames}
            if animation.startswith("attack") or animation == "special":
                entry["activeFrameRange"] = [max(0, count // 3), max(0, count - 2)]
            animation_entries.append(entry)

        derive = definition.get("derive")
        if derive:
            target_hue = dominant_hue(built_frames[enemy_id]["idle"][0])
            source_hue = dominant_hue(built_frames[derive]["idle"][0])
            for animation in ("attack-2", "attack-3", "attack-4", "hurt", "dead"):
                source_images = built_frames[derive][animation]
                animation_root = enemy_root / "frames" / animation
                animation_root.mkdir(parents=True, exist_ok=True)
                frames = []
                images = []
                for index, source_image in enumerate(source_images):
                    image = shift_hue(source_image, target_hue - source_hue)
                    frame_path = animation_root / f"{index + 1:02d}.png"
                    image.save(frame_path, optimize=True)
                    images.append(image)
                    bounds = list(image.getbbox() or (0, 0, 1, 1))
                    frames.append({"id": f"{animation}-{index + 1:02d}", "path": f"/story/enemies/kore-enemies-v1/sets/{enemy_id}/frames/{animation}/{index + 1:02d}.png", "durationMs": duration_for(animation), "contentBounds": bounds, "derivedFrom": f"{derive}/{animation}"})
                    frames[-1]["sha256"] = hashlib.sha256(frame_path.read_bytes()).hexdigest()
                built_frames[enemy_id][animation] = images
                entry = {"id": animation, "loop": False, "frames": frames}
                if animation.startswith("attack"):
                    entry["activeFrameRange"] = [max(0, len(frames) // 3), max(0, len(frames) - 2)]
                animation_entries.append(entry)

        if definition.get("generated"):
            prompt = (
                f"Original {definition['biomeId']} {definition['tier']} enemy {definition['label']}: {definition['design']}; "
                f"two 1536x1024 five-row right-facing anime pixel-art sheets on flat {definition['chromaKey']}; "
                "idle, walk/hover, run/dash, traversal/evade, three attacks including special, block, hurt and dead; "
                "for grounded actors, walk is four gait phases followed by the same four phases with the opposite leg or limb group leading; "
                "hard pixels, dark outlines, stable identity, one body per frame, no text, grid, opponent, or merged cells."
            )
            references = []
            for reference in (ROOT / "sources/image-01.png", Path("public/story/npcs/sources/mina-quill-reference.png")):
                references.append({"path": "/" + str(reference), "sha256": hashlib.sha256(reference.read_bytes()).hexdigest()})
            sources = []
            for number in definition["sheets"]:
                alpha = generated_source_path(enemy_id, number)
                chroma = generated_source_path(enemy_id, number, chroma=True)
                sources.append({
                    "kind": "imagegen",
                    "model": "OpenAI image_gen (session-default model)",
                    "prompt": prompt,
                    "path": f"/story/enemies/kore-enemies-v1/generated/{enemy_id}-sheet-{number}.png",
                    "sha256": hashlib.sha256(alpha.read_bytes()).hexdigest(),
                    "chromaKey": definition["chromaKey"],
                    "chromaSourcePath": f"/story/enemies/kore-enemies-v1/generated/{enemy_id}-sheet-{number}-chroma.png",
                    "chromaSourceSha256": hashlib.sha256(chroma.read_bytes()).hexdigest(),
                    "sourceReferences": references,
                    "registryPath": "/src/story/storyRosterExpansion.json",
                })
        else:
            sources = [{"kind": "user-supplied", **source_meta[number]} for number in definition["sheets"]]
        manifest["enemies"].append({"id": enemy_id, "label": definition["label"], "tier": definition["tier"], "facing": "right", "sources": sources, "animations": animation_entries})

    thumb = 72
    sheet = Image.new("RGBA", (thumb * 8, thumb * len(selected_enemies)), (12, 17, 27, 255))
    draw = ImageDraw.Draw(sheet)
    for row, (enemy_id, definition) in enumerate(selected_enemies.items()):
        animations = built_frames[enemy_id]
        sequence = ["idle", "walk", "run", "attack-1", "attack-2", "attack-3", "hurt", "dead"]
        for column, animation in enumerate(sequence):
            # New two-sheet contracts call their third attack `special`; older
            # supplied sheets generally call the equivalent row `attack-3`.
            frames = animations.get(animation)
            if animation == "attack-3":
                frames = frames or animations.get("special")
            frames = frames or animations.get("idle") or []
            if frames:
                preview = frames[min(len(frames) - 1, len(frames) // 2)].resize((thumb, thumb), Image.Resampling.NEAREST)
                sheet.alpha_composite(preview, (column * thumb, row * thumb))
        draw.text((4, row * thumb + 4), definition["label"], fill=(255, 224, 113, 255))
    contact_sheet_path = ROOT / "contact-sheet.png"
    sheet.save(contact_sheet_path, optimize=True)
    manifest["contactSheet"] = {"path": "/story/enemies/kore-enemies-v1/contact-sheet.png", "sha256": hashlib.sha256(contact_sheet_path.read_bytes()).hexdigest()}
    RUNTIME_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Built {len(selected_enemies)} Play-mode enemies and {sum(len(a['frames']) for e in manifest['enemies'] for a in e['animations'])} frames")


if __name__ == "__main__":
    main()
