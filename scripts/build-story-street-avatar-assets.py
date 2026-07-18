#!/usr/bin/env python3
"""Import the user-supplied full-frame story avatar sheets.

Every authored character is kept as a complete sprite. This builder removes the
flat gray sheet background, strips its neutral antialias halo, normalizes every
frame to one transparent canvas/baseline, and writes a combined runtime manifest.
It never recolors, redraws, or procedurally modifies character artwork.
"""

from __future__ import annotations

import gc
import hashlib
import json
import shutil
from collections import Counter, deque
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


ROOT = Path("public/story/avatars/kore-street-v1")
RUNTIME_MANIFEST = Path("src/story/storyStreetAvatarManifest.json")
FRAME_SIZE = (320, 192)
BASELINE = 182
PROJECTILE_FRAME_SIZE = (192, 96)
PROJECTILE_FRAME_COUNT = 6

SHEETS: dict[str, dict[str, Any]] = {
    "solar-runner": {
        "label": "Solar Runner",
        "incoming": Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T/codex-clipboard-aa54433e-69e8-40bb-a38e-59bd72e8dd3c.png"),
        "bounds": {
            "idle": [(275,60,374,204),(464,61,566,205),(659,61,760,205),(851,59,950,205),(1044,56,1144,205),(1236,56,1336,205),(1429,59,1528,205),(1619,61,1720,205)],
            "walk": [(267,274,354,424),(465,272,551,424),(656,272,742,424),(848,273,935,424),(1040,274,1126,424),(1229,274,1316,424),(1421,274,1508,424),(1615,276,1701,424)],
            "sprint": [(281,511,368,655),(475,514,562,656),(669,515,756,656),(859,513,947,656),(1051,512,1138,656),(1243,513,1331,656),(1434,514,1522,656),(1627,513,1715,656)],
            "jump": [(278,730,365,868),(468,730,554,868),(670,717,758,866),(853,700,955,849),(1043,712,1136,855),(1244,717,1347,864),(1436,724,1536,868),(1625,730,1712,869)],
            # Frame five includes the detached authored slash trail between it
            # and the recovery pose. Keep both components in one runtime frame.
            "attack": [(272,929,360,1080),(464,930,551,1080),(656,928,743,1080),(842,930,929,1080),(1040,933,1211,1080),(1230,934,1317,1080)],
        },
    },
    "street-shadow": {
        "label": "Street Shadow",
        "incoming": Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T/codex-clipboard-aa6c97ef-31d3-4c9e-b9b4-bef823d8c365.png"),
        "legacy": ROOT / "source" / "reference-sheet.png",
        "bounds": {
            "idle": [(274,56,368,206),(465,54,559,205),(660,51,754,205),(853,52,947,204),(1044,51,1138,205),(1237,53,1332,204)],
            "walk": [(264,273,354,424),(457,272,545,424),(649,272,738,424),(841,274,930,424),(1033,272,1121,424),(1225,272,1313,424),(1416,273,1506,424)],
            "sprint": [(279,512,367,656),(472,512,560,656),(662,514,752,656),(849,514,943,656),(1048,512,1136,656),(1241,512,1329,656),(1431,513,1522,656),(1617,514,1711,656)],
            "jump": [(274,724,362,869),(476,707,564,859),(673,699,762,846),(867,699,956,841),(1059,702,1148,841),(1250,710,1337,847),(1446,714,1538,854),(1641,730,1730,868)],
            # The final two energy bursts are detached from their bodies in the
            # source sheet. Their wider bounds retain those projectile pixels.
            "attack": [(257,928,346,1080),(455,928,543,1080),(652,928,740,1080),(847,928,935,1080),(1041,928,1130,1080),(1229,925,1325,1079),(1414,926,1595,1079),(1610,925,1798,1079)],
        },
    },
    "crimson-ranger": {
        "label": "Crimson Ranger",
        "incoming": Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T/codex-clipboard-df0cbf64-5835-4d1f-82a7-247c91d23791.png"),
        "bounds": {
            "idle": [(249,58,378,204),(441,56,570,204),(633,56,762,204),(825,56,954,204),(1017,56,1147,204),(1209,58,1339,204)],
            "walk": [(249,278,379,424),(448,276,576,424),(635,274,763,424),(825,275,955,424),(1029,278,1157,424),(1230,275,1360,424),(1419,274,1547,424),(1596,276,1724,424)],
            "sprint": [(269,512,398,656),(463,513,591,656),(656,516,784,656),(848,513,977,656),(1037,512,1166,656),(1229,513,1359,655),(1422,515,1551,655),(1614,514,1743,656)],
            "jump": [(269,728,398,868),(462,730,591,868),(656,720,784,866),(852,706,981,848),(1039,705,1167,842),(1233,716,1361,850),(1416,724,1544,869),(1603,722,1732,869)],
            "attack": [(267,938,371,1080),(458,938,560,1080),(648,937,751,1080),(837,938,976,1080),(1029,938,1190,1080),(1221,937,1372,1080),(1408,938,1535,1080),(1605,938,1716,1080)],
        },
    },
    "rose-blade": {
        "label": "Rose Blade",
        "incoming": Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T/codex-clipboard-81ce300d-ba20-4d59-a7b0-2eb565f8e2c4.png"),
        "jumpAlias": "sprint",
        "bounds": {
            "idle": [(264,72,406,204),(456,68,598,205),(648,67,791,205),(840,67,983,205),(1032,67,1175,204),(1224,68,1366,205)],
            "walk": [(257,286,361,424),(448,283,552,424),(641,286,741,424),(833,288,937,424),(1025,286,1129,424),(1216,283,1324,424),(1409,286,1517,424)],
            "sprint": [(267,524,359,656),(458,528,551,656),(652,526,744,656),(844,524,936,656),(1035,524,1127,656),(1227,523,1320,656),(1419,520,1511,656)],
            "attack": [(243,732,371,868),(438,734,563,868),(652,734,746,868),(858,734,990,868),(1050,732,1180,868),(264,945,412,1080),(453,944,577,1080)],
        },
    },
    "neon-courier": {
        "label": "Neon Courier",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-b82ab623-6849-448f-ac7a-9d7704082509.png"),
        "generated": True,
    },
    "ember-scout": {
        "label": "Ember Scout",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-08055999-2e07-4d0b-9b09-4b91a744cf10.png"),
        "generated": True,
    },
    "synth-drifter": {
        "label": "Synth Drifter",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-9e1247fb-8a6b-4c6e-a4d4-6a56802d6834.png"),
        "generated": True,
    },
    "forest-warden": {
        "label": "Forest Warden",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-4ac7a917-bd53-41c6-96f8-bb41ce3c1a29.png"),
        "generated": True,
    },
    "solar-brawler": {
        "label": "Solar Brawler",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-b81c5e6f-7733-43d1-bb29-49c2f3e993f7.png"),
        "generated": True,
    },
    "void-operative": {
        "label": "Void Operative",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-56085baf-ae4e-478a-aecb-b35ee0a3759b.png"),
        "generated": True,
    },
    "circuit-mage": {
        "label": "Circuit Mage",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-b5d9ddcf-99fd-4517-b117-4813db451e52.png"),
        "generated": True,
    },
    "street-medic": {
        "label": "Street Medic",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-2d30193d-2637-4312-8f5e-59f49e0e7940.png"),
        "generated": True,
    },
    "arena-rebel": {
        "label": "Arena Rebel",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-e429f7f0-f4a2-452b-a180-b50312f9dacf.png"),
        "generated": True,
    },
    "tech-nomad": {
        "label": "Tech Nomad",
        "incoming": Path("/Users/brandonhenry/.codex/generated_images/019f6c90-9f84-7ea0-838a-fa658bf84aec/exec-d4356088-f5cd-4c74-b5c1-b66090315dd9.png"),
        "generated": True,
    },
}

TIMINGS = {
    "idle": 180,
    "walk": 92,
    "sprint": 72,
    "jump": 86,
    "attack": 82,
    "attack-heavy": 110,
    "attack-kick": 82,
    "attack-special": 125,
}

ATTACK_ACTIVE_FRAME_RANGES: dict[str, tuple[int, int]] = {
    "arena-rebel": (3, 6),
    "circuit-mage": (1, 4),
    "crimson-ranger": (3, 6),
    "ember-scout": (3, 6),
    "forest-warden": (3, 6),
    "neon-courier": (3, 5),
    "rose-blade": (3, 5),
    "solar-brawler": (2, 5),
    "solar-runner": (3, 4),
    "street-medic": (2, 6),
    "street-shadow": (5, 7),
    "synth-drifter": (0, 5),
    "tech-nomad": (0, 5),
    "void-operative": (1, 5),
}

SUPPLEMENTAL_ATTACK_RANGES = {
    "attack-heavy": (3, 5),
    "attack-kick": (2, 4),
    "attack-special": (3, 6),
}

PROJECTILES: dict[str, dict[str, Any]] = {
    "solar-runner": {"speed": 10.0, "lifetimeMs": 800, "worldSize": (1.85, 1.05), "hitboxSize": (1.2, 0.8)},
    "crimson-ranger": {"speed": 14.0, "lifetimeMs": 800, "worldSize": (1.8, 0.7), "hitboxSize": (1.4, 0.35)},
    "neon-courier": {"speed": 11.0, "lifetimeMs": 800, "worldSize": (1.45, 0.9), "hitboxSize": (0.8, 0.6)},
    "synth-drifter": {"speed": 13.0, "lifetimeMs": 800, "worldSize": (2.0, 0.65), "hitboxSize": (1.4, 0.4)},
    "solar-brawler": {"speed": 8.0, "lifetimeMs": 800, "worldSize": (1.25, 1.0), "hitboxSize": (0.75, 0.75)},
    "void-operative": {"speed": 8.5, "lifetimeMs": 800, "worldSize": (1.3, 0.95), "hitboxSize": (0.8, 0.7)},
    "circuit-mage": {"speed": 13.5, "lifetimeMs": 800, "worldSize": (2.0, 0.65), "hitboxSize": (1.4, 0.4)},
    "tech-nomad": {"speed": 12.0, "lifetimeMs": 800, "worldSize": (1.5, 0.75), "hitboxSize": (0.9, 0.55)},
}


def load_sources() -> dict[str, Path]:
    loaded = {}
    for set_id, definition in SHEETS.items():
        committed = ROOT / "sets" / set_id / "source.png"
        candidates = (definition.get("incoming"), committed, definition.get("legacy"))
        source_path = next((path for path in candidates if path and path.exists()), None)
        if not source_path:
            raise FileNotFoundError(f"Missing source sheet for {set_id}")
        with Image.open(source_path) as image:
            image_size = image.size
        expected_size = (1536, 1024) if definition.get("generated") else (1800, 1200)
        if image_size != expected_size:
            raise ValueError(f"Expected {expected_size[0]}x{expected_size[1]} {set_id} sheet, got {image_size}")
        loaded[set_id] = source_path
    return loaded


def load_attack_sources() -> dict[str, bytes]:
    loaded = {}
    for set_id in SHEETS:
        source_path = ROOT / "sets" / set_id / "attacks-v2-source.png"
        if not source_path.exists():
            raise FileNotFoundError(f"Missing supplemental attack sheet for {set_id}")
        source_bytes = source_path.read_bytes()
        with Image.open(BytesIO(source_bytes)) as image:
            if image.size != (1536, 1024):
                raise ValueError(f"Expected 1536x1024 supplemental {set_id} sheet, got {image.size}")
        loaded[set_id] = source_bytes
    return loaded


def load_projectile_sources() -> dict[str, bytes]:
    loaded = {}
    for set_id in PROJECTILES:
        source_path = ROOT / "sets" / set_id / "projectile-special-source.png"
        if not source_path.exists():
            raise FileNotFoundError(f"Missing projectile source sheet for {set_id}")
        source_bytes = source_path.read_bytes()
        with Image.open(BytesIO(source_bytes)) as image:
            if image.width < PROJECTILE_FRAME_COUNT or image.height < 1 or image.mode != "RGBA":
                raise ValueError(f"Invalid transparent projectile source for {set_id}: {image.size} {image.mode}")
            if image.getpixel((0, 0))[3] != 0:
                raise ValueError(f"Projectile source for {set_id} must have a transparent matte")
        loaded[set_id] = source_bytes
    return loaded


def has_transparent_neighbor(image: Image.Image, x: int, y: int) -> bool:
    pixels = image.load()
    for neighbor_y in range(max(0, y - 1), min(image.height, y + 2)):
        for neighbor_x in range(max(0, x - 1), min(image.width, x + 2)):
            if pixels[neighbor_x, neighbor_y][3] == 0:
                return True
    return False


def remove_gray_background(crop: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    source = crop.convert("RGB")
    result = Image.new("RGBA", source.size)
    source_pixels = source.load()
    result_pixels = result.load()
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue = source_pixels[x, y]
            distance = max(abs(red - background[0]), abs(green - background[1]), abs(blue - background[2]))
            result_pixels[x, y] = (0, 0, 0, 0) if distance <= 34 else (red, green, blue, 255)

    # The source sheets contain a neutral antialias fringe blended with gray.
    # Peel only neutral boundary pixels; colored artwork, dark outlines and
    # intentional bright whites remain fully opaque.
    for _ in range(6):
        remove: list[tuple[int, int]] = []
        pixels = result.load()
        for y in range(result.height):
            for x in range(result.width):
                red, green, blue, alpha = pixels[x, y]
                if not alpha or not has_transparent_neighbor(result, x, y):
                    continue
                value = max(red, green, blue)
                chroma = value - min(red, green, blue)
                if 58 <= value <= 190 and chroma <= 32:
                    remove.append((x, y))
        if not remove:
            break
        for x, y in remove:
            pixels[x, y] = (0, 0, 0, 0)
    return result


def alpha_mask(image: Image.Image) -> bytearray:
    return bytearray(1 if alpha else 0 for alpha in image.convert("RGBA").getchannel("A").get_flattened_data())


def near_mask(mask: bytearray, width: int, height: int, x: int, y: int, radius: int = 2) -> bool:
    return any(
        mask[neighbor_y * width + neighbor_x]
        for neighbor_y in range(max(0, y - radius), min(height, y + radius + 1))
        for neighbor_x in range(max(0, x - radius), min(width, x + radius + 1))
    )


def primary_alpha_component(mask: bytearray, width: int, height: int) -> bytearray:
    """Return the largest opaque body component, matching the roster silhouette audit."""
    visited = bytearray(width * height)
    largest: list[int] = []
    for start in range(width * height):
        if visited[start] or not mask[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        component: list[int] = []
        while queue:
            key = queue.popleft()
            component.append(key)
            x, y = key % width, key // width
            for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                    neighbor = neighbor_y * width + neighbor_x
                    if not visited[neighbor] and mask[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        if len(component) > len(largest):
            largest = component
    primary = bytearray(width * height)
    for key in largest:
        primary[key] = 1
    return primary


def attack_body_anchor_x(image: Image.Image) -> int:
    """Locate the character independently from right-side attack effects.

    The upper portion of the largest opaque component is dominated by the
    chibi's head and hair. Anchoring that mass prevents detached or connected
    projectiles from pushing the character backward as their reach grows.
    """
    width, height = image.size
    primary = primary_alpha_component(alpha_mask(image), width, height)
    points = [(key % width, key // width) for key, opaque in enumerate(primary) if opaque]
    if not points:
        return width // 2
    top = min(y for _, y in points)
    bottom = max(y for _, y in points) + 1
    upper_limit = top + max(1, (bottom - top) * 55 // 100)
    upper_x = sorted(x for x, y in points if y < upper_limit)
    if not upper_x:
        upper_x = sorted(x for x, _ in points)
    return upper_x[len(upper_x) // 2]


def fit_attack_crop(image: Image.Image) -> Image.Image:
    """Uniformly fit authored attack reach around the fixed x=160 body anchor."""
    anchor = attack_body_anchor_x(image)
    right_extent = max(1, image.width - anchor)
    half_width = FRAME_SIZE[0] / 2 - 2
    scale = min(1.0, half_width / max(1, anchor), half_width / right_extent, FRAME_SIZE[1] / image.height)
    if scale >= 1:
        return image
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.NEAREST)


def inside_primary_span(mask: bytearray, width: int, height: int, x: int, y: int) -> bool:
    """Only restore pixels bracketed by the existing body on a row or column."""
    return (
        any(mask[y * width + neighbor_x] for neighbor_x in range(x))
        and any(mask[y * width + neighbor_x] for neighbor_x in range(x + 1, width))
    ) or (
        any(mask[neighbor_y * width + x] for neighbor_y in range(y))
        and any(mask[neighbor_y * width + x] for neighbor_y in range(y + 1, height))
    )


def color_components(image: Image.Image) -> list[tuple[tuple[int, int, int], list[int], bool]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    colors = [(red, green, blue) for red, green, blue, _ in rgba.get_flattened_data()]
    visited = bytearray(width * height)
    components: list[tuple[tuple[int, int, int], list[int], bool]] = []
    for start in range(width * height):
        if visited[start]:
            continue
        color = colors[start]
        visited[start] = 1
        queue = deque([start])
        pixels: list[int] = []
        touches_border = False
        while queue:
            key = queue.popleft()
            pixels.append(key)
            x, y = key % width, key // width
            touches_border = touches_border or x == 0 or y == 0 or x == width - 1 or y == height - 1
            for neighbor_x, neighbor_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if not 0 <= neighbor_x < width or not 0 <= neighbor_y < height:
                    continue
                neighbor = neighbor_y * width + neighbor_x
                if not visited[neighbor] and colors[neighbor] == color:
                    visited[neighbor] = 1
                    queue.append(neighbor)
        components.append((color, pixels, touches_border))
    return components


def restore_source_silhouette(
    source_crop: Image.Image,
    current: Image.Image,
    authored_colors: set[tuple[int, int, int]],
    matte_colors: set[tuple[int, int, int]],
) -> Image.Image:
    """Restore source pixels only inside the existing character silhouette.

    This is the same conservative source/silhouette rule used by
    audit-source-frame-silhouettes.py: a source color must already belong to the
    authored sprite (or be a tiny adjacent interior component), and every
    restored pixel must be bracketed by the primary body. Exterior matte can
    therefore never grow back into the exported frame.
    """
    result = current.convert("RGBA").copy()
    width, height = result.size
    existing = alpha_mask(result)
    primary = primary_alpha_component(existing, width, height)
    source_pixels = source_crop.convert("RGBA").load()
    if not any(primary):
        return result

    for color, component, touches_border in color_components(source_crop):
        if color in matte_colors:
            continue
        overlap = any(primary[key] for key in component)
        adjacent = any(near_mask(primary, width, height, key % width, key // width) for key in component)
        authored = color in authored_colors
        if not ((authored and (overlap or adjacent)) or (not authored and not touches_border and len(component) <= 24 and adjacent)):
            continue
        for key in component:
            if existing[key]:
                continue
            x, y = key % width, key // width
            if not inside_primary_span(primary, width, height, x, y):
                continue
            red, green, blue, _ = source_pixels[x, y]
            result.putpixel((x, y), (red, green, blue, 255))
    return result


def fill_small_silhouette_holes(source_crop: Image.Image, current: Image.Image, max_pixels: int = 24) -> Image.Image:
    """Fill enclosed alpha pinholes without closing real limb/weapon gaps."""
    result = current.convert("RGBA").copy()
    width, height = result.size
    existing = alpha_mask(result)
    visited = bytearray(width * height)
    source_pixels = source_crop.convert("RGBA").load()
    for start in range(width * height):
        if visited[start] or existing[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        component: list[int] = []
        touches_border = False
        while queue:
            key = queue.popleft()
            component.append(key)
            x, y = key % width, key // width
            touches_border = touches_border or x == 0 or y == 0 or x == width - 1 or y == height - 1
            for neighbor_x, neighbor_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if not 0 <= neighbor_x < width or not 0 <= neighbor_y < height:
                    continue
                neighbor = neighbor_y * width + neighbor_x
                if not visited[neighbor] and not existing[neighbor]:
                    visited[neighbor] = 1
                    queue.append(neighbor)
        if touches_border or len(component) > max_pixels:
            continue
        if not all(inside_primary_span(existing, width, height, key % width, key // width) for key in component):
            continue
        for key in component:
            x, y = key % width, key // width
            red, green, blue, _ = source_pixels[x, y]
            result.putpixel((x, y), (red, green, blue, 255))
    return result


def fill_single_alpha_pinholes(current: Image.Image) -> Image.Image:
    """Close only one-pixel four-way holes introduced by generated matte removal."""
    result = current.convert("RGBA").copy()
    pixels = result.load()
    repairs: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for y in range(1, result.height - 1):
        for x in range(1, result.width - 1):
            if pixels[x, y][3]:
                continue
            neighbors = (pixels[x - 1, y], pixels[x + 1, y], pixels[x, y - 1], pixels[x, y + 1])
            if all(pixel[3] for pixel in neighbors):
                repairs.append((x, y, neighbors[0]))
    for x, y, color in repairs:
        pixels[x, y] = color
    return result


GENERATED_ROW_BANDS = {
    "idle": (20, 205),
    "walk": (205, 405),
    "sprint": (405, 590),
    "jump": (590, 785),
    "attack": (785, 1005),
}

SUPPLEMENTAL_ATTACK_ROW_BANDS = {
    "attack-heavy": (70, 345),
    "attack-kick": (360, 655),
    "attack-special": (650, 945),
}


def remove_generated_gray_matte(source: Image.Image) -> Image.Image:
    """Remove only the edge-connected neutral background from an Image API sheet."""
    source = source.convert("RGB")
    width, height = source.size
    pixels = source.load()
    background = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def is_background_candidate(x: int, y: int) -> bool:
        red, green, blue = pixels[x, y]
        value = max(red, green, blue)
        return value - min(red, green, blue) <= 14 and 40 <= value <= 215

    def seed(x: int, y: int) -> None:
        index = y * width + x
        if not background[index] and is_background_candidate(x, y):
            background[index] = 1
            queue.append((x, y))

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(height):
        seed(0, y)
        seed(width - 1, y)

    while queue:
        x, y = queue.popleft()
        for neighbor_x, neighbor_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= neighbor_x < width and 0 <= neighbor_y < height:
                seed(neighbor_x, neighbor_y)

    result = Image.new("RGBA", source.size)
    result_pixels = result.load()
    for y in range(height):
        for x in range(width):
            if background[y * width + x]:
                result_pixels[x, y] = (0, 0, 0, 0)
            else:
                red, green, blue = pixels[x, y]
                result_pixels[x, y] = (red, green, blue, 255)
    return result


def occupied_column_spans(image: Image.Image, y_start: int, y_end: int) -> list[tuple[int, int]]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    columns = [
        x for x in range(image.width)
        if sum(1 for y in range(y_start, y_end) if pixels[x, y]) >= 3
    ]
    spans: list[list[int]] = []
    for x in columns:
        if not spans or x - spans[-1][1] > 45:
            spans.append([x, x])
        else:
            spans[-1][1] = x
    return [(left, right + 1) for left, right in spans if right - left > 20]


def crop_opaque_region(image: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
    region = image.crop(bounds)
    content_bounds = region.getbbox()
    if not content_bounds:
        raise ValueError(f"No sprite content inside generated cell {bounds}")
    region = region.crop(content_bounds)

    # Generated attack effects occasionally extend into the following grid cell.
    # Remove only disconnected components that enter through that cell's left
    # edge; the largest component is always the authored character and all
    # right-side effects remain untouched.
    alpha = region.getchannel("A")
    alpha_pixels = alpha.load()
    visited = bytearray(region.width * region.height)
    components: list[list[tuple[int, int]]] = []
    for y in range(region.height):
        for x in range(region.width):
            index = y * region.width + x
            if visited[index] or not alpha_pixels[x, y]:
                continue
            visited[index] = 1
            queue: deque[tuple[int, int]] = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for neighbor_y in range(max(0, current_y - 1), min(region.height, current_y + 2)):
                    for neighbor_x in range(max(0, current_x - 1), min(region.width, current_x + 2)):
                        neighbor_index = neighbor_y * region.width + neighbor_x
                        if visited[neighbor_index] or not alpha_pixels[neighbor_x, neighbor_y]:
                            continue
                        visited[neighbor_index] = 1
                        queue.append((neighbor_x, neighbor_y))
            components.append(component)

    if components:
        character = max(components, key=len)
        pixels = region.load()
        for component in components:
            if component is character or not any(x == 0 for x, _ in component):
                continue
            for x, y in component:
                pixels[x, y] = (0, 0, 0, 0)
        cleaned_bounds = region.getbbox()
        if cleaned_bounds:
            region = region.crop(cleaned_bounds)
    return region


def opaque_pixel_count(image: Image.Image) -> int:
    return sum(1 for alpha in image.getchannel("A").get_flattened_data() if alpha)


def largest_component_pixel_count(image: Image.Image) -> int:
    mask = alpha_mask(image)
    return sum(primary_alpha_component(mask, image.width, image.height))


def keep_primary_body_components(image: Image.Image) -> Image.Image:
    """Remove detached projectile cells while retaining the connected avatar body."""
    result = image.convert("RGBA").copy()
    alpha_pixels = result.getchannel("A").load()
    visited = bytearray(result.width * result.height)
    components: list[list[tuple[int, int]]] = []
    for y in range(result.height):
        for x in range(result.width):
            index = y * result.width + x
            if visited[index] or not alpha_pixels[x, y]:
                continue
            visited[index] = 1
            queue: deque[tuple[int, int]] = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append((current_x, current_y))
                for neighbor_y in range(max(0, current_y - 1), min(result.height, current_y + 2)):
                    for neighbor_x in range(max(0, current_x - 1), min(result.width, current_x + 2)):
                        neighbor_index = neighbor_y * result.width + neighbor_x
                        if visited[neighbor_index] or not alpha_pixels[neighbor_x, neighbor_y]:
                            continue
                        visited[neighbor_index] = 1
                        queue.append((neighbor_x, neighbor_y))
            components.append(component)
    if not components:
        return result
    body = max(components, key=len)
    body_left = min(x for x, _ in body)
    body_top = min(y for _, y in body)
    body_right = max(x for x, _ in body) + 1
    body_bottom = max(y for _, y in body) + 1
    pixels = result.load()
    for component in components:
        if component is body:
            continue
        center_x = sum(x for x, _ in component) / len(component)
        center_y = sum(y for _, y in component) / len(component)
        if body_left - 2 <= center_x <= body_right + 2 and body_top - 2 <= center_y <= body_bottom + 2:
            continue
        for x, y in component:
            pixels[x, y] = (0, 0, 0, 0)
    content_bounds = result.getbbox()
    return result.crop(content_bounds) if content_bounds else result


def extract_generated_animations(source: Image.Image, set_id: str) -> dict[str, list[Image.Image]]:
    transparent = remove_generated_gray_matte(source)
    walk_y_start, walk_y_end = GENERATED_ROW_BANDS["walk"]
    walk_spans = occupied_column_spans(transparent, walk_y_start, walk_y_end)
    if len(walk_spans) != 8:
        raise ValueError(f"Expected 8 detected walk cells for {set_id}, got {len(walk_spans)}")
    centers = [(left + right) // 2 for left, right in walk_spans]
    boundaries = [0]
    alpha = transparent.getchannel("A")
    alpha_pixels = alpha.load()
    for left_center, right_center in zip(centers, centers[1:]):
        search_left = left_center + 28
        search_right = right_center - 28
        boundary = min(
            range(search_left, search_right + 1),
            key=lambda x: sum(1 for y in range(transparent.height) if alpha_pixels[x, y]),
        )
        boundaries.append(boundary)
    boundaries.append(transparent.width)

    animations: dict[str, list[Image.Image]] = {}
    for animation_id, (y_start, y_end) in GENERATED_ROW_BANDS.items():
        if animation_id == "idle":
            spans = occupied_column_spans(transparent, y_start, y_end)
            if not 5 <= len(spans) <= 7:
                raise ValueError(f"Expected 5-7 detected idle cells for {set_id}, got {len(spans)}")
            crops = [crop_opaque_region(transparent, (left, y_start, right, y_end)) for left, right in spans]
            if len(crops) == 5:
                crops.append(crops[3].copy())
            elif len(crops) == 7:
                crops = [crops[index] for index in (0, 1, 2, 3, 5, 6)]
            animations[animation_id] = crops
            continue
        crops = [
            crop_opaque_region(transparent, (boundaries[index], y_start, boundaries[index + 1], y_end))
            for index in range(8)
        ]
        if animation_id == "attack":
            # A detached projectile can cross the inferred cell boundary after
            # the final body pose. It is part of that pose, not a standalone
            # frame. Detect a trailing effect-only cell and stitch the original
            # source region back together before normalization.
            body_counts = [opaque_pixel_count(crop) for crop in crops[:-1]]
            typical_body_count = sorted(body_counts)[len(body_counts) // 2]
            if opaque_pixel_count(crops[-1]) < typical_body_count * 0.4:
                crops[-2] = crop_opaque_region(
                    transparent,
                    (boundaries[-3], y_start, boundaries[-1], y_end),
                )
                crops.pop()
        animations[animation_id] = crops
    return animations


def extract_supplemental_attacks(source: Image.Image, set_id: str) -> dict[str, list[Image.Image]]:
    """Extract each visual row around its body poses and fold detached effects into them."""
    transparent = remove_generated_gray_matte(source)
    rgba_pixels = transparent.load()
    alpha_pixels = transparent.getchannel("A").load()
    animations: dict[str, list[Image.Image]] = {}
    for animation_id, (y_start, y_end) in SUPPLEMENTAL_ATTACK_ROW_BANDS.items():
        dark_scores = []
        for x in range(transparent.width):
            dark_scores.append(sum(
                1 for y in range(y_start, y_end)
                if alpha_pixels[x, y]
                and max(rgba_pixels[x, y][:3]) < 110
                and max(rgba_pixels[x, y][:3]) - min(rgba_pixels[x, y][:3]) > 4
            ))
        smoothed = [
            sum(dark_scores[max(0, x - 14):min(transparent.width, x + 15)])
            for x in range(transparent.width)
        ]
        peak = max(smoothed)
        centers: list[int] = []
        for x in sorted(range(30, transparent.width - 30), key=lambda candidate: smoothed[candidate], reverse=True):
            if smoothed[x] < peak * 0.18:
                break
            if all(abs(x - center) >= 120 for center in centers):
                centers.append(x)
            if len(centers) == 8:
                break
        centers.sort()
        if len(centers) < 6:
            raise ValueError(f"Expected at least 6 body poses in {set_id}/{animation_id}, got {len(centers)}")
        boundaries = [0]
        for left_center, right_center in zip(centers, centers[1:]):
            search_left = min(right_center - 1, left_center + 36)
            search_right = max(search_left, right_center - 36)
            boundary = min(
                range(search_left, search_right + 1),
                key=lambda x: sum(1 for y in range(y_start, y_end) if alpha_pixels[x, y]),
            )
            boundaries.append(boundary)
        boundaries.append(transparent.width)
        crops = [
            crop_opaque_region(transparent, (boundaries[index], y_start, boundaries[index + 1], y_end))
            for index in range(len(centers))
        ]
        while len(crops) < 8:
            crops.insert(len(crops) - 1, crops[-1].copy())
        if animation_id == "attack-special" and set_id in PROJECTILES:
            crops = [keep_primary_body_components(crop) for crop in crops]
            # A projectile-only source cell is not an avatar pose. Generated
            # arrows, pulses, and discs are often much shorter than the human
            # silhouette; keep them exclusively in the projectile strip and
            # hold the nearest real body/recovery pose in the avatar track.
            heights = [crop.getbbox()[3] - crop.getbbox()[1] for crop in crops]
            typical_height = sorted(heights)[len(heights) // 2]
            body_indices = [index for index, height in enumerate(heights) if height >= typical_height * 0.8]
            if not body_indices:
                raise ValueError(f"No human body poses detected in {set_id}/{animation_id}")
            for index, height in enumerate(heights):
                if height >= typical_height * 0.8:
                    continue
                nearest_body = min(body_indices, key=lambda candidate: (abs(candidate - index), candidate < index))
                crops[index] = crops[nearest_body].copy()
        animations[animation_id] = crops
    return animations


def extract_projectile_frames(source: Image.Image, set_id: str) -> list[Image.Image]:
    """Split one projectile-only strip into six transparent, body-free runtime PNGs."""
    source = source.convert("RGBA")
    frames: list[Image.Image] = []
    for index in range(PROJECTILE_FRAME_COUNT):
        left = round(source.width * index / PROJECTILE_FRAME_COUNT)
        right = round(source.width * (index + 1) / PROJECTILE_FRAME_COUNT)
        crop = source.crop((left, 0, right, source.height))
        content_bounds = crop.getbbox()
        if not content_bounds:
            raise ValueError(f"Empty projectile frame {set_id}/{index}")
        crop = crop.crop(content_bounds)
        crop.thumbnail((PROJECTILE_FRAME_SIZE[0] - 4, PROJECTILE_FRAME_SIZE[1] - 4), Image.Resampling.NEAREST)
        frame = Image.new("RGBA", PROJECTILE_FRAME_SIZE)
        frame.alpha_composite(crop, ((PROJECTILE_FRAME_SIZE[0] - crop.width) // 2, (PROJECTILE_FRAME_SIZE[1] - crop.height) // 2))
        frames.append(frame)
    return frames


def checkerboard_contact_sheet(sets: list[tuple[str, str, list[tuple[str, Path]]]], path: Path) -> None:
    columns = 8
    cell_width = FRAME_SIZE[0] + 16
    cell_height = 221
    frames = [(set_id, label, frame_id, frame_path) for set_id, label, set_frames in sets for frame_id, frame_path in set_frames]
    rows = (len(frames) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), "#101722")
    draw = ImageDraw.Draw(sheet)
    for index, (set_id, label, frame_id, frame_path) in enumerate(frames):
        cell_x = index % columns * cell_width
        cell_y = index // columns * cell_height
        for y in range(4, 196, 8):
            for x in range(8, cell_width - 8, 8):
                fill = "#3d4654" if ((x // 8) + (y // 8)) % 2 else "#252d39"
                draw.rectangle((cell_x + x, cell_y + y, cell_x + x + 7, cell_y + y + 7), fill=fill)
        with Image.open(frame_path) as frame:
            sheet.alpha_composite(frame.convert("RGBA"), (cell_x + 8, cell_y + 4))
        draw.text((cell_x + 8, cell_y + 200), f"{label} · {frame_id}", fill="#edf3ff")
    sheet.save(path, optimize=True)


def build() -> None:
    sources = load_sources()
    attack_sources = load_attack_sources()
    projectile_sources = load_projectile_sources()
    build_root = ROOT.with_name(f".{ROOT.name}-building")
    if build_root.exists():
        shutil.rmtree(build_root)
    build_root.mkdir(parents=True)
    manifest_sets = []
    contact_sets = []
    attack_contact_sets = []
    special_body_contact_sets = []
    projectile_contact_sets = []
    total_unique_frames = 0

    for set_id, definition in SHEETS.items():
        print(f"building {set_id}", flush=True)
        source_path = sources[set_id]
        source_bytes = source_path.read_bytes()
        with Image.open(BytesIO(source_bytes)) as source_image:
            source = source_image.convert("RGB").copy()
        set_root = build_root / "sets" / set_id
        frames_root = set_root / "frames"
        frames_root.mkdir(parents=True)
        source.save(set_root / "source.png", optimize=True)
        attack_source_bytes = attack_sources[set_id]
        (set_root / "attacks-v2-source.png").write_bytes(attack_source_bytes)
        with Image.open(BytesIO(attack_source_bytes)) as attack_source_image:
            supplemental_crops = extract_supplemental_attacks(attack_source_image.convert("RGB"), set_id)
        background = source.getpixel((0, 0))
        animations = []
        contact_frames: list[tuple[str, Path]] = []
        animation_paths: dict[str, list[dict[str, Any]]] = {}

        if definition.get("generated"):
            source_crops = extract_generated_animations(source, set_id)
        else:
            original_crops = {
                animation_id: [source.crop(bounds) for bounds in bounds_list]
                for animation_id, bounds_list in definition["bounds"].items()
            }
            initial_crops = {
                animation_id: [remove_gray_background(crop, background) for crop in crops]
                for animation_id, crops in original_crops.items()
            }
            authored_colors = {
                (red, green, blue)
                for crops in initial_crops.values()
                for crop in crops
                for red, green, blue, alpha in crop.get_flattened_data()
                if alpha
            }
            source_color_counts = Counter(source.get_flattened_data())
            matte_colors = {
                color for color, count in source_color_counts.items()
                if count >= 256
                and max(abs(color[channel] - background[channel]) for channel in range(3)) <= 12
                and max(color) - min(color) <= 12
            }
            matte_colors.add(background)
            source_crops = {
                animation_id: [
                    fill_small_silhouette_holes(
                        original,
                        restore_source_silhouette(original, current, authored_colors, matte_colors),
                    )
                    for original, current in zip(original_crops[animation_id], initial_crops[animation_id])
                ]
                for animation_id in original_crops
            }

        source_crops.update(supplemental_crops)

        for animation_id, crops in source_crops.items():
            animation_root = frames_root / animation_id
            animation_root.mkdir()
            runtime_frames = []
            for index, crop in enumerate(crops):
                content_bounds = crop.getbbox()
                if not content_bounds:
                    raise ValueError(f"Empty frame {set_id}/{animation_id}/{index}")
                crop = crop.crop(content_bounds)
                if animation_id.startswith("attack"):
                    crop = fit_attack_crop(crop)
                    crop = fill_single_alpha_pinholes(crop)
                if crop.width > FRAME_SIZE[0] or crop.height > FRAME_SIZE[1]:
                    raise ValueError(f"Frame {set_id}/{animation_id}/{index} is {crop.width}x{crop.height}, exceeding {FRAME_SIZE[0]}x{FRAME_SIZE[1]}")
                frame = Image.new("RGBA", FRAME_SIZE)
                is_attack = animation_id.startswith("attack")
                body_anchor_x = attack_body_anchor_x(crop) if is_attack else crop.width // 2
                x = FRAME_SIZE[0] // 2 - body_anchor_x if is_attack else (FRAME_SIZE[0] - crop.width) // 2
                y = BASELINE - crop.height
                if x < 0 or x + crop.width > FRAME_SIZE[0]:
                    raise ValueError(f"Frame {set_id}/{animation_id}/{index} clips horizontally at x={x} on the {FRAME_SIZE[0]}px canvas")
                frame.alpha_composite(crop, (x, y))
                frame_id = f"{animation_id}-{index:02d}"
                frame_path = animation_root / f"{index:02d}.png"
                frame.save(frame_path, optimize=True)
                contact_frames.append((frame_id, frame_path))
                runtime_frames.append({
                    "id": frame_id,
                    "path": f"/story/avatars/kore-street-v1/sets/{set_id}/frames/{animation_id}/{index:02d}.png",
                    "durationMs": TIMINGS[animation_id],
                    "contentBounds": list(frame.getbbox() or (0, 0, 0, 0)),
                    "bodyAnchorX": x + body_anchor_x,
                })
            animation_paths[animation_id] = runtime_frames
            animation = {"id": animation_id, "loop": animation_id not in {"jump", "attack", "attack-heavy", "attack-kick", "attack-special"}, "frames": runtime_frames}
            if animation_id == "attack":
                animation["activeFrameRange"] = list(ATTACK_ACTIVE_FRAME_RANGES[set_id])
            elif animation_id in SUPPLEMENTAL_ATTACK_RANGES:
                animation["activeFrameRange"] = list(SUPPLEMENTAL_ATTACK_RANGES[animation_id])
            animations.append(animation)

        if definition.get("jumpAlias"):
            alias = definition["jumpAlias"]
            alias_frames = [{**frame, "id": frame["id"].replace(f"{alias}-", "jump-"), "durationMs": TIMINGS["jump"]} for frame in animation_paths[alias]]
            insert_at = next((index for index, animation in enumerate(animations) if animation["id"] == "attack"), len(animations))
            animations.insert(insert_at, {"id": "jump", "loop": False, "frames": alias_frames})

        projectile_manifest = None
        if set_id in PROJECTILES:
            projectile_source_bytes = projectile_sources[set_id]
            (set_root / "projectile-special-source.png").write_bytes(projectile_source_bytes)
            projectile_root = set_root / "projectiles" / "special"
            projectile_root.mkdir(parents=True)
            with Image.open(BytesIO(projectile_source_bytes)) as projectile_source_image:
                projectile_frames = extract_projectile_frames(projectile_source_image, set_id)
            projectile_runtime_frames = []
            projectile_contact_frames = []
            for index, projectile_frame in enumerate(projectile_frames):
                frame_id = f"projectile-special-{index:02d}"
                frame_path = projectile_root / f"{index:02d}.png"
                projectile_frame.save(frame_path, optimize=True)
                projectile_contact_frames.append((frame_id, frame_path))
                projectile_runtime_frames.append({
                    "id": frame_id,
                    "path": f"/story/avatars/kore-street-v1/sets/{set_id}/projectiles/special/{index:02d}.png",
                    "durationMs": 72,
                    "contentBounds": list(projectile_frame.getbbox() or (0, 0, 0, 0)),
                })
            projectile_config = PROJECTILES[set_id]
            projectile_manifest = {
                "id": "special",
                "source": {
                    "kind": "openai-image-generation-projectile-strip",
                    "sha256": hashlib.sha256(projectile_source_bytes).hexdigest(),
                    "originalFile": "projectile-special-source.png",
                },
                "frameSize": {"width": PROJECTILE_FRAME_SIZE[0], "height": PROJECTILE_FRAME_SIZE[1]},
                "frames": projectile_runtime_frames,
                "releaseDelayMs": 375,
                "speed": projectile_config["speed"],
                "lifetimeMs": projectile_config["lifetimeMs"],
                "spawnOffset": [1.05, 0.8],
                "worldSize": list(projectile_config["worldSize"]),
                "hitboxSize": list(projectile_config["hitboxSize"]),
            }
            projectile_contact_sets.append((set_id, definition["label"], projectile_contact_frames))

        unique_count = sum(len(crops) for crops in source_crops.values())
        total_unique_frames += unique_count
        source_kind = "openai-image-generation-reference-sheet" if definition.get("generated") else "user-supplied-reference-sheet"
        source_name = f"{set_id}-imagegen-v1.png" if definition.get("generated") else source_path.name
        manifest_set = {
            "id": set_id,
            "label": definition["label"],
            "frameCount": unique_count,
            "source": {"kind": source_kind, "sha256": hashlib.sha256(source_bytes).hexdigest(), "originalFile": source_name},
            "attackSource": {
                "kind": "openai-image-generation-supplemental-attack-sheet",
                "sha256": hashlib.sha256(attack_source_bytes).hexdigest(),
                "originalFile": "attacks-v2-source.png",
            },
            "animations": animations,
        }
        if projectile_manifest:
            manifest_set["projectile"] = projectile_manifest
        manifest_sets.append(manifest_set)
        contact_sets.append((set_id, definition["label"], contact_frames))
        attack_contact_sets.append((set_id, definition["label"], [frame for frame in contact_frames if frame[0].startswith("attack")]))
        special_body_contact_sets.append((set_id, definition["label"], [frame for frame in contact_frames if frame[0].startswith("attack-special")]))
        del source_crops, supplemental_crops, source, source_bytes, attack_source_bytes, frame, crop, crops
        gc.collect()

    checkerboard_contact_sheet(contact_sets, build_root / "contact-sheet.png")
    checkerboard_contact_sheet(attack_contact_sets, build_root / "attack-contact-sheet.png")
    checkerboard_contact_sheet(special_body_contact_sets, build_root / "special-body-contact-sheet.png")
    checkerboard_contact_sheet(projectile_contact_sets, build_root / "projectile-contact-sheet.png")
    manifest = {
        "version": 3,
        "avatarStyle": "kore-street-v1",
        "defaultSet": "street-shadow",
        "frameSize": {"width": FRAME_SIZE[0], "height": FRAME_SIZE[1], "baseline": BASELINE},
        "facing": "right",
        "frameCount": total_unique_frames,
        "sets": manifest_sets,
    }
    serialized = json.dumps(manifest, indent=2) + "\n"
    (build_root / "manifest.json").write_text(serialized)
    RUNTIME_MANIFEST.write_text(serialized)
    (build_root / "SOURCE.md").write_text(
        "# K.O.R.E. Street Avatar Sources\n\n"
        "Four animation sheets supplied by the project owner and ten original Image API-generated K.O.R.E. presets "
        "are imported without runtime recoloring or redraws. Each preset also carries an identity-referenced "
        "Image API supplemental sheet containing heavy, kick, and signature attack rows. "
        "Eight signature moves also include a separate projectile-only PNG strip and six transparent runtime frames; "
        "the character body is never reused as projectile art. "
        "Frames use an exterior-only transparent matte, conservative source-silhouette restoration, "
        "a shared 320×192 canvas with body-anchored attack effects, and baseline 182.\n"
    )
    if ROOT.exists():
        shutil.rmtree(ROOT)
    build_root.rename(ROOT)
    print(f"built {len(manifest_sets)} avatar sets with {total_unique_frames} unique transparent frames")


if __name__ == "__main__":
    build()
