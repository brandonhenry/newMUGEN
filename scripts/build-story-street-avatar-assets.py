#!/usr/bin/env python3
"""Import the user-supplied full-frame story avatar sheets.

Every authored character is kept as a complete sprite. This builder removes the
flat gray sheet background, strips its neutral antialias halo, normalizes every
frame to one transparent canvas/baseline, and writes a combined runtime manifest.
It never recolors, redraws, or procedurally modifies character artwork.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from collections import Counter, deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


ROOT = Path("public/story/avatars/kore-street-v1")
RUNTIME_MANIFEST = Path("src/story/storyStreetAvatarManifest.json")
FRAME_SIZE = (224, 192)
BASELINE = 182

SHEETS: dict[str, dict[str, Any]] = {
    "solar-runner": {
        "label": "Solar Runner",
        "incoming": Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T/codex-clipboard-aa54433e-69e8-40bb-a38e-59bd72e8dd3c.png"),
        "bounds": {
            "idle": [(275,60,374,204),(464,61,566,205),(659,61,760,205),(851,59,950,205),(1044,56,1144,205),(1236,56,1336,205),(1429,59,1528,205),(1619,61,1720,205)],
            "walk": [(267,274,354,424),(465,272,551,424),(656,272,742,424),(848,273,935,424),(1040,274,1126,424),(1229,274,1316,424),(1421,274,1508,424),(1615,276,1701,424)],
            "sprint": [(281,511,368,655),(475,514,562,656),(669,515,756,656),(859,513,947,656),(1051,512,1138,656),(1243,513,1331,656),(1434,514,1522,656),(1627,513,1715,656)],
            "jump": [(278,730,365,868),(468,730,554,868),(670,717,758,866),(853,700,955,849),(1043,712,1136,855),(1244,717,1347,864),(1436,724,1536,868),(1625,730,1712,869)],
            "attack": [(272,929,360,1080),(464,930,551,1080),(656,928,743,1080),(842,930,929,1080),(1040,933,1127,1080),(1230,934,1317,1080)],
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
            "attack": [(257,928,346,1080),(455,928,543,1080),(652,928,740,1080),(847,928,935,1080),(1041,928,1130,1080),(1229,925,1325,1079),(1414,926,1502,1079),(1610,925,1699,1079)],
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

TIMINGS = {"idle": 180, "walk": 92, "sprint": 72, "jump": 86, "attack": 82}


def load_sources() -> dict[str, tuple[Image.Image, bytes, Path]]:
    loaded = {}
    for set_id, definition in SHEETS.items():
        committed = ROOT / "sets" / set_id / "source.png"
        candidates = (definition.get("incoming"), committed, definition.get("legacy"))
        source_path = next((path for path in candidates if path and path.exists()), None)
        if not source_path:
            raise FileNotFoundError(f"Missing source sheet for {set_id}")
        data = source_path.read_bytes()
        image = Image.open(source_path).convert("RGB").copy()
        expected_size = (1536, 1024) if definition.get("generated") else (1800, 1200)
        if image.size != expected_size:
            raise ValueError(f"Expected {expected_size[0]}x{expected_size[1]} {set_id} sheet, got {image.size}")
        loaded[set_id] = (image, data, source_path)
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


GENERATED_ROW_BANDS = {
    "idle": (20, 205),
    "walk": (205, 405),
    "sprint": (405, 590),
    "jump": (590, 785),
    "attack": (785, 1005),
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
        animations[animation_id] = crops
    return animations


def checkerboard_contact_sheet(sets: list[tuple[str, str, list[tuple[str, Image.Image]]]], path: Path) -> None:
    columns = 8
    cell_width = 240
    cell_height = 221
    frames = [(set_id, label, frame_id, frame) for set_id, label, set_frames in sets for frame_id, frame in set_frames]
    rows = (len(frames) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * cell_width, rows * cell_height), "#101722")
    draw = ImageDraw.Draw(sheet)
    for index, (set_id, label, frame_id, frame) in enumerate(frames):
        cell_x = index % columns * cell_width
        cell_y = index // columns * cell_height
        for y in range(4, 196, 8):
            for x in range(8, 232, 8):
                fill = "#3d4654" if ((x // 8) + (y // 8)) % 2 else "#252d39"
                draw.rectangle((cell_x + x, cell_y + y, cell_x + x + 7, cell_y + y + 7), fill=fill)
        sheet.alpha_composite(frame, (cell_x + 8, cell_y + 4))
        draw.text((cell_x + 8, cell_y + 200), f"{label} · {frame_id}", fill="#edf3ff")
    sheet.save(path, optimize=True)


def build() -> None:
    sources = load_sources()
    if ROOT.exists():
        shutil.rmtree(ROOT)
    ROOT.mkdir(parents=True)
    manifest_sets = []
    contact_sets = []
    total_unique_frames = 0

    for set_id, definition in SHEETS.items():
        source, source_bytes, source_path = sources[set_id]
        set_root = ROOT / "sets" / set_id
        frames_root = set_root / "frames"
        frames_root.mkdir(parents=True)
        source.save(set_root / "source.png", optimize=True)
        background = source.getpixel((0, 0))
        animations = []
        contact_frames: list[tuple[str, Image.Image]] = []
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

        for animation_id, crops in source_crops.items():
            animation_root = frames_root / animation_id
            animation_root.mkdir()
            runtime_frames = []
            for index, crop in enumerate(crops):
                content_bounds = crop.getbbox()
                if not content_bounds:
                    raise ValueError(f"Empty frame {set_id}/{animation_id}/{index}")
                crop = crop.crop(content_bounds)
                if crop.width > FRAME_SIZE[0] or crop.height > FRAME_SIZE[1]:
                    raise ValueError(f"Frame {set_id}/{animation_id}/{index} is {crop.width}x{crop.height}, exceeding {FRAME_SIZE[0]}x{FRAME_SIZE[1]}")
                frame = Image.new("RGBA", FRAME_SIZE)
                x = (FRAME_SIZE[0] - crop.width) // 2
                y = BASELINE - crop.height
                frame.alpha_composite(crop, (x, y))
                frame_id = f"{animation_id}-{index:02d}"
                frame_path = animation_root / f"{index:02d}.png"
                frame.save(frame_path, optimize=True)
                contact_frames.append((frame_id, frame))
                runtime_frames.append({
                    "id": frame_id,
                    "path": f"/story/avatars/kore-street-v1/sets/{set_id}/frames/{animation_id}/{index:02d}.png",
                    "durationMs": TIMINGS[animation_id],
                    "contentBounds": list(frame.getbbox() or (0, 0, 0, 0)),
                })
            animation_paths[animation_id] = runtime_frames
            animations.append({"id": animation_id, "loop": animation_id not in {"jump", "attack"}, "frames": runtime_frames})

        if definition.get("jumpAlias"):
            alias = definition["jumpAlias"]
            alias_frames = [{**frame, "id": frame["id"].replace(f"{alias}-", "jump-"), "durationMs": TIMINGS["jump"]} for frame in animation_paths[alias]]
            insert_at = next((index for index, animation in enumerate(animations) if animation["id"] == "attack"), len(animations))
            animations.insert(insert_at, {"id": "jump", "loop": False, "frames": alias_frames})

        unique_count = sum(len(crops) for crops in source_crops.values())
        total_unique_frames += unique_count
        source_kind = "openai-image-generation-reference-sheet" if definition.get("generated") else "user-supplied-reference-sheet"
        source_name = f"{set_id}-imagegen-v1.png" if definition.get("generated") else source_path.name
        manifest_sets.append({
            "id": set_id,
            "label": definition["label"],
            "frameCount": unique_count,
            "source": {"kind": source_kind, "sha256": hashlib.sha256(source_bytes).hexdigest(), "originalFile": source_name},
            "animations": animations,
        })
        contact_sets.append((set_id, definition["label"], contact_frames))

    checkerboard_contact_sheet(contact_sets, ROOT / "contact-sheet.png")
    manifest = {
        "version": 2,
        "avatarStyle": "kore-street-v1",
        "defaultSet": "street-shadow",
        "frameSize": {"width": FRAME_SIZE[0], "height": FRAME_SIZE[1], "baseline": BASELINE},
        "facing": "right",
        "frameCount": total_unique_frames,
        "sets": manifest_sets,
    }
    serialized = json.dumps(manifest, indent=2) + "\n"
    (ROOT / "manifest.json").write_text(serialized)
    RUNTIME_MANIFEST.write_text(serialized)
    (ROOT / "SOURCE.md").write_text(
        "# K.O.R.E. Street Avatar Sources\n\n"
        "Four animation sheets supplied by the project owner and ten original Image API-generated K.O.R.E. presets "
        "are imported without runtime recoloring or redraws. "
        "Frames use an exterior-only transparent matte, conservative source-silhouette restoration, "
        "a shared 224×192 canvas, and baseline 182.\n"
    )
    print(f"built {len(manifest_sets)} avatar sets with {total_unique_frames} unique transparent frames")


if __name__ == "__main__":
    build()
