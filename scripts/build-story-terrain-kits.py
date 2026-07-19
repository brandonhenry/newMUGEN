#!/usr/bin/env python3
"""Build normalized, deterministic KORE terrain kits from licensed source atlases."""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WORLD_ROOT = ROOT / "public" / "story" / "worlds"
OUTPUT_ROOT = WORLD_ROOT / "terrain-kits"
MASTER_ROOT = OUTPUT_ROOT / "source-masters"
SOURCE_MANIFEST = WORLD_ROOT / "asset-manifest.json"
RUNTIME_MANIFEST = ROOT / "src" / "story" / "storyTerrainKitManifest.json"

TILE = 32
ATLAS_COLUMNS = 8
VARIANTS = 3
ROLES = [
    "fill", "top", "neutral-top", "neutral-top-left", "neutral-top-right", "underside", "left-wall", "right-wall",
    "outer-top-left", "outer-top-right", "outer-bottom-left", "outer-bottom-right",
    "inner-top-left", "inner-top-right", "inner-bottom-left", "inner-bottom-right",
    "connector-lip", "background-rock", "sky-window-edge", "secret-overlay", "damage-overlay",
]

WALKABLE_CAP_ROLES = {"top", "outer-top-left", "outer-top-right", "connector-lip"}
CAVITY_ROLES = {"background-rock", "sky-window-edge"}
OVERLAY_ROLES = {"secret-overlay", "damage-overlay"}
EXPOSED_TOP_ROLES = {"top", "neutral-top", "neutral-top-left", "neutral-top-right", "outer-top-left", "outer-top-right", "connector-lip"}
EXPOSED_BOTTOM_ROLES = {"underside", "outer-bottom-left", "outer-bottom-right"}
EXPOSED_LEFT_ROLES = {"left-wall", "neutral-top-left", "outer-top-left", "outer-bottom-left"}
EXPOSED_RIGHT_ROLES = {"right-wall", "neutral-top-right", "outer-top-right", "outer-bottom-right"}

KIT_SPECS = {
    "village": ("greenhollow", "gothic-town", "gothic-town/tileset.png", "rooftops-town-walls"),
    "forest": ("thornwood", "magic-cliffs", "magic-cliffs/tileset.png", "canopy-roots-overhangs"),
    "mine": ("ironroot", "warped-caves", "warped-caves/tileset.png", "reinforced-mine-shafts"),
    "crypt": ("bonevault", "gothic-cemetery", "gothic-cemetery/tileset.png", "crypt-arches-ossuary"),
    "underworld": ("emberdeep", "emberdeep", "emberdeep/tileset.png", "basalt-forge-caverns"),
    "snow": ("frostpeak", "seasonal-snow", "seasonal/snow-terrain.png", "ice-cliffs-shelters"),
    "desert": ("sunscar", "sunscar", "sunscar-pixel/tileset.png", "sandstone-buried-architecture"),
    "ruins": ("skyglass", "rocky-pass-glass", "rocky-pass/tileset.png", "glass-arches-sanctums"),
}

MASTER_PROMPTS = {
    "village": "Original Greenhollow gothic-town terrain master: separate neutral masonry, walkable caps, walls, undersides, corners, cavity interiors, structures, and detail cells.",
    "forest": "Original Thornwood magic-cliff terrain master: separate neutral earth and roots, moss walkable caps, walls, undersides, corners, cavity rock, timber structures, and detail cells.",
    "mine": "Original Ironroot warped-mine terrain master: separate neutral violet rock, mineral walkable caps, reinforced walls, undersides, corners, deep-mine cavities, structures, and detail cells.",
    "crypt": "Original Bonevault gothic-cemetery terrain master: separate neutral crypt material, grave walkable caps, tomb walls, undersides, corners, catacomb cavities, structures, and detail cells.",
    "underworld": "Original Emberdeep basalt-forge terrain master: separate neutral basalt, heated walkable rims, furnace walls, undersides, corners, cavern interiors, structures, and detail cells.",
    "snow": "Original Frostpeak alpine terrain master: separate neutral ice-rock, snow walkable caps, vertical walls, undersides, corners, ice-cavern interiors, structures, and detail cells.",
    "desert": "Original Sunscar sandstone terrain master: separate neutral sandstone, pale walkable lips, cliff walls, undersides, corners, buried interiors, structures, and detail cells.",
    "ruins": "Original Skyglass glass-ruin terrain master: separate neutral ruin stone, cyan walkable rims, glass walls, undersides, corners, sanctum interiors, structures, and detail cells.",
}

# Each generated material master is an 8x8 art-direction sheet. Runtime frames
# are still cropped and normalized deterministically; image generation never
# controls collision, role selection, transforms, or atlas coordinates.
MASTER_ROLE_CELLS = {
    "fill": (0, (0, 2, 5)),
    "top": (1, (0, 3, 6)),
    "neutral-top": (0, (1, 4, 7)),
    "neutral-top-left": (2, (0, 1, 2)),
    "neutral-top-right": (2, (7, 6, 5)),
    "underside": (3, (0, 3, 7)),
    "left-wall": (2, (0, 1, 2)),
    "right-wall": (2, (7, 6, 5)),
    "outer-top-left": (4, (0, 1, 2)),
    "outer-top-right": (4, (7, 6, 5)),
    "outer-bottom-left": (3, (0, 1, 2)),
    "outer-bottom-right": (3, (7, 6, 5)),
    "inner-top-left": (2, (0, 1, 2)),
    "inner-top-right": (2, (7, 6, 5)),
    "inner-bottom-left": (3, (0, 1, 2)),
    "inner-bottom-right": (3, (7, 6, 5)),
    "connector-lip": (1, (2, 4, 7)),
    "background-rock": (5, (0, 3, 6)),
    "secret-overlay": (7, (4, 4, 4)),
    "damage-overlay": (7, (5, 5, 5)),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_metadata(relative: str) -> dict:
    manifest = json.loads(SOURCE_MANIFEST.read_text())
    for pack in manifest["packs"]:
        for asset in pack["assets"]:
            if asset["file"] == relative:
                return {
                    "sourcePack": pack["id"],
                    "license": pack["license"],
                    "sourceUrl": pack["source"],
                    "sourceFile": relative,
                    "sourceHash": asset["sha256"],
                }
    raise RuntimeError(f"No provenance for {relative}")


def generated_master_cells(path: Path) -> list[list[Image.Image]]:
    """Split an imagegen 8x8 review sheet using its magenta guide grid."""
    source = Image.open(path).convert("RGBA")

    def divider_runs(vertical: bool) -> list[tuple[int, int]]:
        extent = source.width if vertical else source.height
        cross = source.height if vertical else source.width
        matches: list[int] = []
        for coordinate in range(extent):
            magenta = 0
            for offset in range(cross):
                pixel = source.getpixel((coordinate, offset) if vertical else (offset, coordinate))
                if pixel[0] > 175 and pixel[2] > 115 and pixel[1] < 90:
                    magenta += 1
            if magenta / cross > 0.65:
                matches.append(coordinate)
        runs: list[list[int]] = []
        for coordinate in matches:
            if not runs or coordinate > runs[-1][-1] + 1:
                runs.append([coordinate])
            else:
                runs[-1].append(coordinate)
        return [(run[0], run[-1]) for run in runs]

    vertical = divider_runs(True)
    horizontal = divider_runs(False)
    if len(vertical) != 9 or len(horizontal) != 9:
        raise RuntimeError(f"Expected an 8x8 magenta master grid in {path}, got {len(vertical) - 1}x{len(horizontal) - 1}")
    cells: list[list[Image.Image]] = []
    for row in range(8):
        row_cells = []
        top, bottom = horizontal[row][1] + 1, horizontal[row + 1][0]
        for column in range(8):
            left, right = vertical[column][1] + 1, vertical[column + 1][0]
            crop = source.crop((left, top, right, bottom))
            side = min(crop.size)
            x = (crop.width - side) // 2
            y = (crop.height - side) // 2
            row_cells.append(crop.crop((x, y, x + side, y + side)))
        cells.append(row_cells)
    return cells


def clear_connected_dark_background(tile: Image.Image) -> Image.Image:
    """Remove the imagegen cell matte and magenta guide halo from the outside in."""
    rgba = tile.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    pending = [(x, 0) for x in range(width)] + [(x, height - 1) for x in range(width)]
    pending += [(0, y) for y in range(height)] + [(width - 1, y) for y in range(height)]
    visited: set[tuple[int, int]] = set()
    while pending:
        x, y = pending.pop()
        if (x, y) in visited:
            continue
        visited.add((x, y))
        red, green, blue, alpha = pixels[x, y]
        dark_matte = max(red, green, blue) <= 52 and red + green + blue <= 112
        magenta_halo = red >= 14 and blue >= 14 and green * 4 < min(red, blue) and abs(red - blue) < 90
        if alpha == 0 or dark_matte or magenta_halo:
            pixels[x, y] = (0, 0, 0, 0)
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= neighbor[0] < width and 0 <= neighbor[1] < height and neighbor not in visited:
                    pending.append(neighbor)
    return rgba


def inset_master_cell(cell: Image.Image) -> Image.Image:
    """Discard anti-aliased guide pixels immediately inside the detected grid."""
    inset = max(4, round(min(cell.size) * 0.045))
    return cell.crop((inset, inset, cell.width - inset, cell.height - inset))


def extend_pixel_art_to_frame(tile: Image.Image) -> Image.Image:
    """Fill residual alpha with the nearest artwork pixel, never a flat matte color."""
    rgba = tile.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    queue: list[tuple[int, int]] = []
    owner: dict[tuple[int, int], tuple[int, int]] = {}
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > 0:
                queue.append((x, y))
                owner[(x, y)] = (x, y)
    if not queue:
        raise RuntimeError("Generated master cell contains no artwork after matte removal")
    head = 0
    while head < len(queue):
        x, y = queue[head]
        head += 1
        origin = owner[(x, y)]
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= neighbor[0] < width and 0 <= neighbor[1] < height and neighbor not in owner:
                owner[neighbor] = origin
                queue.append(neighbor)
    for (x, y), origin in owner.items():
        if pixels[x, y][3] == 0:
            red, green, blue, _ = pixels[origin[0], origin[1]]
            pixels[x, y] = (red, green, blue, 255)
    return rgba


def normalized_master_cell(cell: Image.Image, *, overlay: bool) -> Image.Image:
    keyed = clear_connected_dark_background(inset_master_cell(cell))
    bounds = keyed.getbbox()
    if not bounds:
        return Image.new("RGBA", (TILE, TILE))
    cropped = keyed.crop(bounds).resize((TILE, TILE), Image.Resampling.NEAREST)
    return cropped if overlay else extend_pixel_art_to_frame(cropped)


def alpha_bounds(tile: Image.Image) -> list[int]:
    bounds = tile.getchannel("A").getbbox()
    if not bounds:
        return [0, 0, 0, 0]
    left, top, right, bottom = bounds
    return [left, top, right - left, bottom - top]


def seal_runtime_edges(cells: list[list[Image.Image]], role: str, tile: Image.Image) -> Image.Image:
    """Make adjoining frames share exact border pixels without erasing exposed faces."""
    result = extend_pixel_art_to_frame(tile)
    base = normalized_master_cell(cells[0][MASTER_ROLE_CELLS["fill"][1][0]], overlay=False)
    cavity = inset_master_cell(cells[5][0]).resize((TILE, TILE), Image.Resampling.NEAREST)
    if role in CAVITY_ROLES:
        vertical = [cavity.getpixel((TILE // 2, y)) for y in range(TILE)]
        horizontal = [cavity.getpixel((x, TILE // 2)) for x in range(TILE)]
        for x in range(TILE):
            result.putpixel((x, 0), horizontal[x])
            result.putpixel((x, TILE - 1), horizontal[x])
        for y in range(TILE):
            result.putpixel((0, y), vertical[y])
            result.putpixel((TILE - 1, y), vertical[y])
        return result

    exposed_top = role in EXPOSED_TOP_ROLES
    exposed_bottom = role in EXPOSED_BOTTOM_ROLES
    exposed_left = role in EXPOSED_LEFT_ROLES
    exposed_right = role in EXPOSED_RIGHT_ROLES
    vertical = [base.getpixel((TILE // 2, y)) for y in range(TILE)]
    horizontal = [base.getpixel((x, TILE // 2)) for x in range(TILE)]
    if not exposed_top:
        for x in range(TILE):
            result.putpixel((x, 0), horizontal[x])
    if not exposed_bottom:
        for x in range(TILE):
            result.putpixel((x, TILE - 1), horizontal[x])
    if not exposed_left:
        for y in range(TILE):
            result.putpixel((0, y), vertical[y])
    if not exposed_right:
        for y in range(TILE):
            result.putpixel((TILE - 1, y), vertical[y])
    return result


def generated_role_tile(cells: list[list[Image.Image]], role: str, variant: int, theme: str) -> Image.Image:
    if role == "sky-window-edge":
        cavity = inset_master_cell(cells[5][(1, 4, 7)[variant]]).resize((TILE, TILE), Image.Resampling.NEAREST)
        tint = Image.new("RGBA", (TILE, TILE), (84, 150, 184, 88))
        cavity = Image.alpha_composite(cavity, tint)
        dark, _, light = colors(cavity)
        edge(ImageDraw.Draw(cavity), "top", dark, light, 3)
        return seal_runtime_edges(cells, role, cavity)
    row, variants = MASTER_ROLE_CELLS[role]
    cell = cells[row][variants[variant]]
    if role in {"background-rock", "secret-overlay", "damage-overlay"}:
        return seal_runtime_edges(cells, role, inset_master_cell(cell).resize((TILE, TILE), Image.Resampling.NEAREST))
    if role == "fill":
        return seal_runtime_edges(cells, role, normalized_master_cell(cell, overlay=False))
    tile = normalized_master_cell(cell, overlay=True)
    if role == "neutral-top":
        # A shallow cavity has an exposed face but not enough avatar clearance
        # to advertise a decorative walkable cap.
        dark, middle, _ = colors(normalized_master_cell(cells[0][variants[variant]], overlay=False))
        tile = Image.new("RGBA", (TILE, TILE))
        edge(ImageDraw.Draw(tile), "top", dark, middle, 3)
    if theme == "forest" and role not in WALKABLE_CAP_ROLES:
        cleaned = []
        for pixel in tile.getdata():
            cleaned.append((0, 0, 0, 0) if pixel[3] and forest_foliage(pixel) else pixel)
        tile.putdata(cleaned)
    # Runtime terrain cells are never sparse sprites. Generated edge/corner art
    # is composited onto a complete neutral material cell so adjacent 32px
    # frames meet directly with no alpha holes or raw cavity showing through.
    fill_columns = MASTER_ROLE_CELLS["fill"][1]
    base = normalized_master_cell(cells[0][fill_columns[variant]], overlay=False)
    base.alpha_composite(tile)
    return seal_runtime_edges(cells, role, base)


def opaque_score(tile: Image.Image) -> tuple[float, float]:
    rgba = tile.convert("RGBA")
    alpha = rgba.getchannel("A")
    coverage = sum(alpha.getdata()) / (255 * TILE * TILE)
    colors = len(rgba.convert("RGB").getcolors(TILE * TILE) or [])
    return coverage, colors / (TILE * TILE)


def material_tiles(source: Image.Image) -> list[Image.Image]:
    padded = Image.new("RGBA", (max(TILE, source.width), max(TILE, source.height)))
    padded.alpha_composite(source)
    candidates: list[tuple[tuple[float, float], Image.Image]] = []
    for y in range(0, max(1, padded.height - TILE + 1), 16):
        for x in range(0, max(1, padded.width - TILE + 1), 16):
            crop = padded.crop((x, y, x + TILE, y + TILE))
            candidates.append((opaque_score(crop), crop))
    candidates.sort(key=lambda entry: (entry[0][0] >= 0.94, entry[0][0], entry[0][1]), reverse=True)
    selected: list[Image.Image] = []
    for _, candidate in candidates:
        if any(Image.blend(candidate, prior, 0.5).tobytes() == candidate.tobytes() for prior in selected):
            continue
        selected.append(candidate)
        if len(selected) == VARIANTS:
            break
    while len(selected) < VARIANTS:
        selected.append(selected[-1].transpose(Image.Transpose.FLIP_LEFT_RIGHT) if selected else Image.new("RGBA", (TILE, TILE), "#52667a"))
    return [flatten_alpha(tile) for tile in selected]


def flatten_alpha(tile: Image.Image) -> Image.Image:
    rgba = tile.convert("RGBA")
    pixels = list(rgba.getdata())
    opaque = [pixel[:3] for pixel in pixels if pixel[3] > 200]
    fallback = tuple(sum(channel) // max(1, len(opaque)) for channel in zip(*opaque)) if opaque else (82, 102, 122)
    background = Image.new("RGBA", rgba.size, (*fallback, 255))
    background.alpha_composite(rgba)
    return background


def colors(tile: Image.Image) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int], tuple[int, int, int, int]]:
    palette = tile.convert("RGB").quantize(colors=8).getpalette()
    counts = sorted(tile.convert("RGB").quantize(colors=8).getcolors() or [], reverse=True)
    picked = []
    for _, index in counts[:5]:
        picked.append(tuple(palette[index * 3:index * 3 + 3]) + (255,))
    picked = picked or [(82, 102, 122, 255)]
    darkest = min(picked, key=lambda value: sum(value[:3]))
    lightest = max(picked, key=lambda value: sum(value[:3]))
    middle = picked[len(picked) // 2]
    return darkest, middle, lightest


def forest_foliage(pixel) -> bool:
    hue, saturation, value = colorsys.rgb_to_hsv(pixel[0] / 255, pixel[1] / 255, pixel[2] / 255)
    # Thornwood's cap is a high-saturation yellow-green. Earth highlights are
    # warmer, darker browns and must not be misclassified as grass.
    return 0.125 <= hue <= 0.24 and saturation >= 0.58 and value >= 0.52


def neutral_material(tile: Image.Image, theme: str) -> Image.Image:
    """Remove a source tile's baked top cap while retaining its material family."""
    source = tile.convert("RGBA")
    neutral = Image.new("RGBA", source.size)
    # Source packs consistently place snow/grass/sand lip pixels at the top.
    # Repeat only the lower material field so wall/fill/ceiling frames cannot
    # accidentally advertise a walkable surface.
    for y in range(TILE):
        source_y = 9 + (y % (TILE - 9))
        neutral.paste(source.crop((0, source_y, TILE, source_y + 1)), (0, y))
    if theme == "forest":
        pixels = list(neutral.getdata())
        earth = [pixel for pixel in pixels if not forest_foliage(pixel)]
        earth = earth or [(75, 52, 38, 255)]
        earth.sort(key=lambda pixel: sum(pixel[:3]))
        output = []
        for pixel in pixels:
            if not forest_foliage(pixel):
                output.append(pixel)
                continue
            target_luma = sum(pixel[:3])
            replacement = min(earth, key=lambda candidate: abs(sum(candidate[:3]) - target_luma))
            output.append(replacement)
        neutral.putdata(output)
    return neutral


def edge(draw: ImageDraw.ImageDraw, side: str, dark, light, thickness: int = 5) -> None:
    if side == "top":
        draw.rectangle((0, 0, TILE - 1, thickness - 1), fill=light)
        draw.line((0, thickness, TILE - 1, thickness), fill=dark, width=2)
    elif side == "bottom":
        draw.rectangle((0, TILE - thickness, TILE - 1, TILE - 1), fill=dark)
        draw.line((0, TILE - thickness - 1, TILE - 1, TILE - thickness - 1), fill=light, width=2)
    elif side == "left":
        draw.rectangle((0, 0, thickness - 1, TILE - 1), fill=light)
        draw.line((thickness, 0, thickness, TILE - 1), fill=dark, width=2)
    else:
        draw.rectangle((TILE - thickness, 0, TILE - 1, TILE - 1), fill=dark)
        draw.line((TILE - thickness - 1, 0, TILE - thickness - 1, TILE - 1), fill=light, width=2)


def make_role(base: Image.Image, role: str, variant: int, sky_tint: tuple[int, int, int], theme: str) -> Image.Image:
    source = base.copy()
    tile = neutral_material(base, theme)
    dark, middle, light = colors(tile)
    if role == "background-rock":
        shadow = tuple(max(4, channel // 7) for channel in dark[:3]) + (255,)
        detail = tuple(max(9, channel // 6) for channel in middle[:3]) + (255,)
        tile = Image.new("RGBA", tile.size, shadow)
        draw = ImageDraw.Draw(tile)
        for index in range(5):
            x = (variant * 11 + index * 7) % TILE
            y = (variant * 5 + index * 13) % TILE
            draw.rectangle((x, y, min(TILE - 1, x + 2 + index % 3), min(TILE - 1, y + 1 + index % 2)), fill=detail)
    elif role == "sky-window-edge":
        tile = Image.new("RGBA", (TILE, TILE), (*sky_tint, 255))
        draw = ImageDraw.Draw(tile)
        for y in range(0, TILE, 4):
            shade = tuple(min(255, channel + y // 4 * 2) for channel in sky_tint)
            draw.rectangle((0, y, TILE - 1, min(TILE - 1, y + 3)), fill=(*shade, 255))
        edge(draw, "top", dark, light, 3)
    else:
        draw = ImageDraw.Draw(tile)
        sides = {
            "top": (), "neutral-top": ("top",), "neutral-top-left": ("top", "left"), "neutral-top-right": ("top", "right"),
            "underside": ("bottom",), "left-wall": ("left",), "right-wall": ("right",),
            "outer-top-left": ("left",), "outer-top-right": ("right",),
            "outer-bottom-left": ("bottom", "left"), "outer-bottom-right": ("bottom", "right"),
            "inner-top-left": ("bottom", "right"), "inner-top-right": ("bottom", "left"),
            "inner-bottom-left": ("top", "right"), "inner-bottom-right": ("top", "left"),
            "connector-lip": ("left", "right"),
        }.get(role, ())
        if role in WALKABLE_CAP_ROLES:
            cap_height = 7 + variant % 2
            tile.paste(source.crop((0, 0, TILE, cap_height)), (0, 0))
            draw = ImageDraw.Draw(tile)
            draw.line((0, cap_height, TILE - 1, cap_height), fill=dark, width=2)
        for side in sides:
            edge(draw, side, dark, middle, 4 + variant % 2)
        if role == "secret-overlay":
            draw.rectangle((8, 8, 23, 23), outline=light, width=2)
            draw.ellipse((14, 14, 17, 17), fill=light)
        elif role == "damage-overlay":
            draw.line((5, 2, 14, 12, 10, 20, 22, 29), fill=light, width=2)
            draw.line((14, 12, 24, 9), fill=dark, width=2)
    if variant == 1:
        tile = ImageEnhance.Brightness(tile).enhance(0.94)
    elif variant == 2:
        tile = ImageEnhance.Contrast(tile).enhance(1.08)
    return tile


def sky_color(source: Image.Image) -> tuple[int, int, int]:
    thumb = source.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return tuple(max(24, min(190, int(channel * 0.72 + bias))) for channel, bias in zip(thumb, (18, 26, 38)))


def apply_family_treatment(theme: str, tiles: list[Image.Image]) -> list[Image.Image]:
    if theme != "ruins":
        return tiles
    treated: list[Image.Image] = []
    for tile in tiles:
        result = Image.new("RGBA", tile.size)
        output = []
        for red, green, blue, alpha in tile.getdata():
            luminance = (red * 3 + green * 4 + blue) // 8
            output.append((min(255, 34 + luminance // 2), min(255, 58 + luminance * 3 // 4), min(255, 96 + luminance), alpha))
        result.putdata(output)
        treated.append(result)
    return treated


def build_kit(theme: str, biome: str, family: str, relative: str, enclosure: str) -> dict:
    source_path = WORLD_ROOT / relative
    source = Image.open(source_path).convert("RGBA")
    master_path = MASTER_ROOT / f"{theme}.png"
    if not master_path.exists():
        raise RuntimeError(f"Missing reviewed generated terrain master: {master_path}")
    master_cells = generated_master_cells(master_path)
    frame_count = len(ROLES) * VARIANTS
    rows = (frame_count + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * TILE, rows * TILE), (0, 0, 0, 0))
    frames = []
    for role_index, role in enumerate(ROLES):
        for variant in range(VARIANTS):
            ordinal = role_index * VARIANTS + variant
            x = ordinal % ATLAS_COLUMNS * TILE
            y = ordinal // ATLAS_COLUMNS * TILE
            tile = generated_role_tile(master_cells, role, variant, theme)
            atlas.alpha_composite(tile, (x, y))
            frames.append({
                "id": f"{theme}-{role}-{variant + 1}", "role": role, "variant": variant,
                "frame": [x, y, TILE, TILE], "alphaBounds": alpha_bounds(tile), "anchor": [0.5, 0.5],
                "compatibleSurfaces": ["solid", "cavity", "connector"], "rotations": [0], "mirroring": False,
                "generatedStatus": "generated", "generationMethod": "imagegen-material-master-plus-deterministic-role-extraction",
                "promptProvenance": MASTER_PROMPTS[theme], "reviewStatus": "generated-awaiting-human-review",
                "sourcePack": "kore-imagegen-terrain-masters-v1", "license": "project-owned-generated-asset",
                "sourceUrl": "local:imagegen", "sourceFile": f"terrain-kits/source-masters/{theme}.png",
                "sourceHash": sha256(master_path), "referenceInputs": [relative, "user-supplied-readable-room-and-tileset-reference"],
                "surfaceClass": "walkable-cap" if role in WALKABLE_CAP_ROLES else "cavity" if role in CAVITY_ROLES else "overlay" if role in OVERLAY_ROLES else "neutral-solid",
            })
    kit_path = OUTPUT_ROOT / f"{theme}.png"
    atlas.save(kit_path, optimize=True)
    contact = Image.new("RGBA", (ATLAS_COLUMNS * 100, rows * 70), (7, 14, 24, 255))
    draw = ImageDraw.Draw(contact)
    font = ImageFont.load_default()
    for ordinal, frame in enumerate(frames):
        x = ordinal % ATLAS_COLUMNS * 100
        y = ordinal // ATLAS_COLUMNS * 70
        frame_x, frame_y, frame_width, frame_height = frame["frame"]
        crop = atlas.crop((frame_x, frame_y, frame_x + frame_width, frame_y + frame_height))
        if frame["role"] not in {"fill", "background-rock", "sky-window-edge", "secret-overlay", "damage-overlay"}:
            base = next(candidate for candidate in frames if candidate["role"] == "fill" and candidate["variant"] == frame["variant"])
            base_x, base_y, base_width, base_height = base["frame"]
            base_crop = atlas.crop((base_x, base_y, base_x + base_width, base_y + base_height))
            base_crop.alpha_composite(crop)
            crop = base_crop
        crop = crop.resize((64, 64), Image.Resampling.NEAREST)
        contact.alpha_composite(crop, (x, y))
        draw.text((66 + x, y + 4), frame["role"].replace("-", "\n"), fill=(230, 244, 255, 255), font=font)
        draw.text((66 + x, y + 50), f"v{frame['variant'] + 1}", fill=(112, 214, 255, 255), font=font)
    contact_path = OUTPUT_ROOT / "contact-sheets" / f"{theme}.png"
    contact_path.parent.mkdir(parents=True, exist_ok=True)
    contact.save(contact_path, optimize=True)
    return {
        "id": f"{theme}-enclosed-terrain-v3", "theme": theme, "biome": biome, "primaryFamily": family,
        "enclosureStyle": enclosure, "tilePixels": TILE, "runtimeScale": 2,
        "asset": f"world:terrain-kits/{theme}.png", "atlasSize": list(atlas.size),
        "atlasHash": sha256(kit_path), "contactSheet": f"world:terrain-kits/contact-sheets/{theme}.png",
        "materialMaster": f"world:terrain-kits/source-masters/{theme}.png", "materialMasterHash": sha256(master_path),
        "materialMasterLayout": {"columns": 8, "rows": 8, "roles": ["neutral-fill", "walkable-cap", "walls", "undersides", "corners", "cavity", "structures", "details"]},
        "frames": frames,
    }


def verify(manifest: dict) -> list[str]:
    failures: list[str] = []
    for kit in manifest["kits"]:
        atlas_path = WORLD_ROOT / kit["asset"].removeprefix("world:")
        if not atlas_path.exists() or sha256(atlas_path) != kit["atlasHash"]:
            failures.append(f"atlas-hash:{kit['id']}")
        master_path = WORLD_ROOT / kit.get("materialMaster", "world:missing").removeprefix("world:")
        if not master_path.exists() or sha256(master_path) != kit.get("materialMasterHash"):
            failures.append(f"material-master-hash:{kit['id']}")
        frame_keys = {(frame["role"], frame["variant"]) for frame in kit["frames"]}
        atlas = Image.open(atlas_path).convert("RGBA")
        def frame_image(role: str, variant: int) -> Image.Image:
            definition = next(frame for frame in kit["frames"] if frame["role"] == role and frame["variant"] == variant)
            x, y, width, height = definition["frame"]
            return atlas.crop((x, y, x + width, y + height))
        solid_seam = frame_image("fill", 0)
        cavity_seam = frame_image("background-rock", 0)
        for role in ROLES:
            for variant in range(VARIANTS):
                if (role, variant) not in frame_keys:
                    failures.append(f"missing-frame:{kit['id']}:{role}:{variant}")
        for frame in kit["frames"]:
            expected_class = "walkable-cap" if frame["role"] in WALKABLE_CAP_ROLES else "cavity" if frame["role"] in CAVITY_ROLES else "overlay" if frame["role"] in OVERLAY_ROLES else "neutral-solid"
            if frame.get("surfaceClass") != expected_class:
                failures.append(f"surface-class:{kit['id']}:{frame['id']}")
            if frame.get("generatedStatus") != "generated" or not frame.get("promptProvenance"):
                failures.append(f"generated-provenance:{kit['id']}:{frame['id']}")
            if frame.get("alphaBounds") != [0, 0, TILE, TILE]:
                failures.append(f"incomplete-runtime-frame:{kit['id']}:{frame['id']}")
            x, y, width, height = frame["frame"]
            runtime_tile = atlas.crop((x, y, x + width, y + height))
            alpha = runtime_tile.getchannel("A")
            if min(alpha.getdata()) != 255:
                failures.append(f"transparent-runtime-pixel:{kit['id']}:{frame['id']}")
            reference = cavity_seam if frame["role"] in CAVITY_ROLES else solid_seam
            comparisons = (
                ("top", frame["role"] not in EXPOSED_TOP_ROLES, [runtime_tile.getpixel((column, 0)) for column in range(1, TILE - 1)], [reference.getpixel((column, 0)) for column in range(1, TILE - 1)]),
                ("bottom", frame["role"] not in EXPOSED_BOTTOM_ROLES, [runtime_tile.getpixel((column, TILE - 1)) for column in range(1, TILE - 1)], [reference.getpixel((column, TILE - 1)) for column in range(1, TILE - 1)]),
                ("left", frame["role"] not in EXPOSED_LEFT_ROLES, [runtime_tile.getpixel((0, row)) for row in range(1, TILE - 1)], [reference.getpixel((0, row)) for row in range(1, TILE - 1)]),
                ("right", frame["role"] not in EXPOSED_RIGHT_ROLES, [runtime_tile.getpixel((TILE - 1, row)) for row in range(1, TILE - 1)], [reference.getpixel((TILE - 1, row)) for row in range(1, TILE - 1)]),
            )
            for side, required, actual, expected in comparisons:
                if required and actual != expected:
                    failures.append(f"unsealed-runtime-edge:{kit['id']}:{frame['id']}:{side}")
            if kit["theme"] == "forest" and frame["surfaceClass"] in {"walkable-cap", "neutral-solid"}:
                x, y, width, height = frame["frame"]
                pixels = list(Image.open(atlas_path).convert("RGBA").crop((x, y, x + width, y + height)).getdata())
                foliage_pixels = sum(1 for pixel in pixels if forest_foliage(pixel))
                if frame["surfaceClass"] == "neutral-solid" and foliage_pixels:
                    failures.append(f"foliage-on-neutral:{kit['id']}:{frame['id']}")
                minimum_cap_pixels = width if frame["role"] in {"top", "connector-lip"} else 4
                if frame["surfaceClass"] == "walkable-cap" and foliage_pixels < minimum_cap_pixels:
                    failures.append(f"missing-walkable-cap:{kit['id']}:{frame['id']}")
    return failures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        manifest = json.loads(RUNTIME_MANIFEST.read_text())
        failures = verify(manifest)
        print(json.dumps({"valid": not failures, "failures": failures}, indent=2))
        raise SystemExit(1 if failures else 0)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    kits = [build_kit(theme, *spec) for theme, spec in KIT_SPECS.items()]
    manifest = {"version": 2, "tilePixels": TILE, "runtimeScale": 2, "roles": ROLES, "kits": kits}
    RUNTIME_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"kits": len(kits), "frames": sum(len(kit["frames"]) for kit in kits), "manifest": str(RUNTIME_MANIFEST)}, indent=2))


if __name__ == "__main__":
    main()
