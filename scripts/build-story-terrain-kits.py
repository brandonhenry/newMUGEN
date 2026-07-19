#!/usr/bin/env python3
"""Build KORE terrain grammar directly from the selected free source packs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WORLD_ROOT = ROOT / "public" / "story" / "worlds"
OUTPUT_ROOT = WORLD_ROOT / "terrain-kits"
SOURCE_MANIFEST = WORLD_ROOT / "asset-manifest.json"
RUNTIME_MANIFEST = ROOT / "src" / "story" / "storyTerrainKitManifest.json"
SOURCE_MAPPING_MANIFEST = OUTPUT_ROOT / "source-mapping.json"

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
    "forest": ("thornwood", "thornwood", "thornwood/tileset.png", "canopy-roots-overhangs"),
    "mine": ("ironroot", "warped-caves", "warped-caves/tileset.png", "reinforced-mine-shafts"),
    "crypt": ("bonevault", "gothic-cemetery", "gothic-cemetery/tileset.png", "crypt-arches-ossuary"),
    "underworld": ("emberdeep", "emberdeep", "emberdeep/tileset.png", "basalt-forge-caverns"),
    "snow": ("frostpeak", "sunnyland-winter", "sunnyland-winter/tileset.png", "ice-cliffs-shelters"),
    "desert": ("sunscar", "yeehaw", "yeehaw/tileset.png", "sandstone-frontier-architecture"),
    "ruins": ("skyglass", "skyglass", "skyglass/tileset.png", "glass-arches-sanctums"),
}

# Manually reviewed 16px source cells. Every runtime role records the exact
# source frame and treatment in the generated manifest/contact sheet.
SOURCE_TILE_MAPPINGS = {
    "village": {
        "fill": [(3, 2), (4, 2), (6, 2)], "top": [(3, 10), (4, 10), (5, 10)],
        "left": [(1, 2), (1, 3), (1, 4)], "right": [(8, 2), (8, 3), (8, 4)],
        "top-left": [(1, 10)] * 3, "top-right": [(5, 10)] * 3,
        "bottom": [(3, 4), (4, 4), (6, 4)], "bottom-left": [(1, 4)] * 3, "bottom-right": [(9, 4)] * 3,
    },
    "forest": {
        "fill": [(4, 4), (5, 4), (6, 4)], "top": [(4, 2), (5, 2), (6, 2)],
        "left": [(3, 3), (3, 4), (3, 3)], "right": [(8, 2)] * 3,
        "top-left": [(3, 2)] * 3, "top-right": [(8, 2)] * 3,
        "bottom": [(4, 5), (5, 5), (6, 5)], "bottom-left": [(4, 5)] * 3, "bottom-right": [(6, 5)] * 3,
    },
    "mine": {
        "fill": [(3, 4), (5, 4), (3, 4)], "top": [(3, 3), (5, 3), (3, 3)],
        "left": [(2, 4)] * 3, "right": [(6, 4)] * 3, "top-left": [(2, 3)] * 3, "top-right": [(6, 3)] * 3,
        "bottom": [(3, 4), (5, 4), (3, 4)], "bottom-left": [(2, 4)] * 3, "bottom-right": [(6, 4)] * 3,
    },
    "crypt": {
        "fill": [(20, 6), (21, 6), (23, 6)], "top": [(20, 5), (21, 5), (23, 5)],
        "left": [(18, 6)] * 3, "right": [(24, 6)] * 3, "top-left": [(18, 5)] * 3, "top-right": [(24, 5)] * 3,
        "bottom": [(20, 7), (21, 7), (23, 7)], "bottom-left": [(18, 7)] * 3, "bottom-right": [(24, 7)] * 3,
    },
    "underworld": {
        "fill": [(3, 4), (5, 4), (3, 4)], "top": [(3, 3), (5, 3), (3, 3)],
        "left": [(2, 4)] * 3, "right": [(6, 4)] * 3, "top-left": [(2, 3)] * 3, "top-right": [(6, 3)] * 3,
        "bottom": [(3, 4), (5, 4), (3, 4)], "bottom-left": [(2, 4)] * 3, "bottom-right": [(6, 4)] * 3,
    },
    "snow": {
        "fill": [(2, 2), (3, 2), (7, 2)], "top": [(2, 1), (3, 1), (7, 1)],
        "left": [(1, 2)] * 3, "right": [(4, 2)] * 3, "top-left": [(1, 1)] * 3, "top-right": [(4, 1)] * 3,
        "bottom": [(2, 3), (3, 3), (7, 3)], "bottom-left": [(1, 3)] * 3, "bottom-right": [(4, 3)] * 3,
    },
    "desert": {
        "fill": [(1, 5), (2, 5), (3, 5)], "top": [(1, 4), (2, 4), (3, 4)],
        "left": [(0, 5)] * 3, "right": [(4, 5)] * 3, "top-left": [(0, 4)] * 3, "top-right": [(4, 4)] * 3,
        "bottom": [(1, 6), (2, 6), (3, 6)], "bottom-left": [(0, 6)] * 3, "bottom-right": [(4, 6)] * 3,
    },
    "ruins": {
        "fill": [(3, 3), (4, 3), (3, 4)], "top": [(3, 1), (4, 1), (3, 1)],
        "left": [(1, 2), (1, 3), (1, 4)], "right": [(6, 2), (6, 3), (6, 4)],
        "top-left": [(1, 1)] * 3, "top-right": [(6, 1)] * 3,
        "bottom": [(3, 4), (4, 4), (3, 4)], "bottom-left": [(1, 5)] * 3, "bottom-right": [(6, 5)] * 3,
    },
}

ROLE_SOURCE_KEYS = {
    "fill": "fill", "top": "top", "neutral-top": "fill", "neutral-top-left": "left", "neutral-top-right": "right",
    "underside": "bottom", "left-wall": "left", "right-wall": "right",
    "outer-top-left": "top-left", "outer-top-right": "top-right", "outer-bottom-left": "bottom-left", "outer-bottom-right": "bottom-right",
    "inner-top-left": "fill", "inner-top-right": "fill", "inner-bottom-left": "fill", "inner-bottom-right": "fill",
    "connector-lip": "top", "background-rock": "fill", "sky-window-edge": "fill", "secret-overlay": "fill", "damage-overlay": "fill",
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
                    "sourcePack": pack["id"], "license": pack["license"], "sourceUrl": pack["source"],
                    "sourceFile": relative, "sourceHash": asset["sha256"],
                }
    raise RuntimeError(f"No provenance for {relative}")


def flatten_alpha(tile: Image.Image) -> Image.Image:
    rgba = tile.convert("RGBA")
    pixels = list(rgba.getdata())
    opaque = [pixel[:3] for pixel in pixels if pixel[3] > 200]
    fallback = tuple(sum(channel) // max(1, len(opaque)) for channel in zip(*opaque)) if opaque else (82, 102, 122)
    background = Image.new("RGBA", rgba.size, (*fallback, 255))
    background.alpha_composite(rgba)
    return background


def colors(tile: Image.Image):
    quantized = tile.convert("RGB").quantize(colors=8)
    palette = quantized.getpalette()
    counts = sorted(quantized.getcolors() or [], reverse=True)
    picked = [tuple(palette[index * 3:index * 3 + 3]) + (255,) for _, index in counts[:5]] or [(82, 102, 122, 255)]
    return min(picked, key=lambda value: sum(value[:3])), picked[len(picked) // 2], max(picked, key=lambda value: sum(value[:3]))


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


def source_cell(source: Image.Image, cell: tuple[int, int]) -> Image.Image:
    """Return one manually mapped 16px source cell at the 32px runtime size."""
    column, row = cell
    left, top = column * 16, row * 16
    if left < 0 or top < 0 or left + 16 > source.width or top + 16 > source.height:
        raise RuntimeError(f"Source cell {cell} is outside {source.size}")
    return source.crop((left, top, left + 16, top + 16)).resize((TILE, TILE), Image.Resampling.NEAREST)


def role_sides(role: str) -> tuple[str, ...]:
    return {
        "neutral-top": ("top",), "neutral-top-left": ("top", "left"), "neutral-top-right": ("top", "right"),
        "inner-top-left": ("bottom", "right"), "inner-top-right": ("bottom", "left"),
        "inner-bottom-left": ("top", "right"), "inner-bottom-right": ("top", "left"),
        "connector-lip": ("left", "right"),
    }.get(role, ())


def mapped_role_tile(
    source: Image.Image,
    theme: str,
    role: str,
    variant: int,
    sky_tint: tuple[int, int, int],
) -> tuple[Image.Image, tuple[int, int], str, str]:
    """Build a runtime role from an explicit atlas cell, never a heuristic window."""
    mapping = SOURCE_TILE_MAPPINGS[theme]
    source_key = ROLE_SOURCE_KEYS[role]
    cell = mapping[source_key][variant]
    fill = flatten_alpha(source_cell(source, mapping["fill"][variant]))
    mapped = source_cell(source, cell)
    tile = fill.copy()
    if source_key != "fill":
        tile.alpha_composite(mapped)
    dark, middle, light = colors(tile)
    if role == "background-rock":
        tile = ImageEnhance.Brightness(fill).enhance(0.22)
        draw = ImageDraw.Draw(tile)
        for index in range(5):
            x, y = (variant * 11 + index * 7) % TILE, (variant * 5 + index * 13) % TILE
            draw.rectangle(
                (x, y, min(TILE - 1, x + 2 + index % 3), min(TILE - 1, y + 1 + index % 2)),
                fill=tuple(max(9, channel // 3) for channel in middle[:3]) + (255,),
            )
        treatment = "mapped-fill-darkened-for-cavity"
    elif role == "sky-window-edge":
        tile = Image.new("RGBA", (TILE, TILE), (*sky_tint, 255))
        draw = ImageDraw.Draw(tile)
        for y in range(0, TILE, 4):
            shade = tuple(min(255, channel + y // 4 * 2) for channel in sky_tint)
            draw.rectangle((0, y, TILE - 1, min(TILE - 1, y + 3)), fill=(*shade, 255))
        edge(draw, "top", dark, light, 3)
        treatment = "mapped-fill-replaced-by-biome-sky-window"
    else:
        draw = ImageDraw.Draw(tile)
        sides = role_sides(role)
        for side in sides:
            edge(draw, side, dark, middle, 4 + variant % 2)
        if role == "secret-overlay":
            draw.rectangle((8, 8, 23, 23), outline=light, width=2)
            draw.ellipse((14, 14, 17, 17), fill=light)
            treatment = "mapped-fill-plus-secret-marker"
        elif role == "damage-overlay":
            draw.line((5, 2, 14, 12, 10, 20, 22, 29), fill=light, width=2)
            draw.line((14, 12, 24, 9), fill=dark, width=2)
            treatment = "mapped-fill-plus-damage-crack"
        elif sides:
            treatment = f"mapped-{source_key}-plus-inferred-{'-'.join(sides)}-seam"
        else:
            treatment = f"mapped-{source_key}-source-cell"
    return tile, cell, source_key, treatment


def seal_runtime_edges(tile: Image.Image, reference: Image.Image, role: str) -> Image.Image:
    """Copy hidden borders from the same source material so cells join cleanly."""
    result = tile.copy()
    if role not in EXPOSED_TOP_ROLES:
        for x in range(TILE): result.putpixel((x, 0), reference.getpixel((x, 0)))
    if role not in EXPOSED_BOTTOM_ROLES:
        for x in range(TILE): result.putpixel((x, TILE - 1), reference.getpixel((x, TILE - 1)))
    if role not in EXPOSED_LEFT_ROLES:
        for y in range(TILE): result.putpixel((0, y), reference.getpixel((0, y)))
    if role not in EXPOSED_RIGHT_ROLES:
        for y in range(TILE): result.putpixel((TILE - 1, y), reference.getpixel((TILE - 1, y)))
    return result


def alpha_bounds(tile: Image.Image) -> list[int]:
    bounds = tile.getchannel("A").getbbox()
    if not bounds:
        return [0, 0, 0, 0]
    left, top, right, bottom = bounds
    return [left, top, right - left, bottom - top]


def sky_color(source: Image.Image) -> tuple[int, int, int]:
    thumb = source.convert("RGB").resize((1, 1), Image.Resampling.BOX).getpixel((0, 0))
    return tuple(max(24, min(190, int(channel * 0.72 + bias))) for channel, bias in zip(thumb, (18, 26, 38)))


def build_kit(theme: str, biome: str, family: str, relative: str, enclosure: str) -> dict:
    source_path = WORLD_ROOT / relative
    source = Image.open(source_path).convert("RGBA")
    metadata = source_metadata(relative)
    sky_tint = sky_color(source)
    mapped = {
        (role, variant): mapped_role_tile(source, theme, role, variant, sky_tint)
        for role in ROLES for variant in range(VARIANTS)
    }
    raw = {key: value[0] for key, value in mapped.items()}
    frame_count = len(ROLES) * VARIANTS
    rows = (frame_count + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * TILE, rows * TILE), (0, 0, 0, 0))
    frames = []
    for role_index, role in enumerate(ROLES):
        for variant in range(VARIANTS):
            ordinal = role_index * VARIANTS + variant
            x, y = ordinal % ATLAS_COLUMNS * TILE, ordinal // ATLAS_COLUMNS * TILE
            reference_role = "background-rock" if role in CAVITY_ROLES else "fill"
            tile = seal_runtime_edges(raw[(role, variant)], raw[(reference_role, variant)], role)
            _, source_cell_coordinate, source_key, mapping_treatment = mapped[(role, variant)]
            source_column, source_row = source_cell_coordinate
            atlas.alpha_composite(tile, (x, y))
            frames.append({
                "id": f"{theme}-{role}-{variant + 1}", "role": role, "variant": variant,
                "frame": [x, y, TILE, TILE], "alphaBounds": alpha_bounds(tile), "anchor": [0.5, 0.5],
                "compatibleSurfaces": ["solid", "cavity", "connector"], "rotations": [0], "mirroring": False,
                "generatedStatus": "deterministic-source-derived", "generationMethod": "manual-source-cell-map-plus-seam-normalization",
                "promptProvenance": None, "reviewStatus": "manual-source-cell-map-reviewed", **metadata,
                "sourceCell": [source_column, source_row],
                "sourceFrame": [source_column * 16, source_row * 16, 16, 16],
                "sourceSemantic": source_key,
                "mappingTreatment": f"{mapping_treatment}+sealed-hidden-edges",
                "surfaceClass": "walkable-cap" if role in WALKABLE_CAP_ROLES else "cavity" if role in CAVITY_ROLES else "overlay" if role in OVERLAY_ROLES else "neutral-solid",
            })
    kit_path = OUTPUT_ROOT / f"{theme}.png"
    atlas.save(kit_path, optimize=True)
    contact_cell_width, contact_cell_height = 128, 76
    contact = Image.new("RGBA", (ATLAS_COLUMNS * contact_cell_width, rows * contact_cell_height), (7, 14, 24, 255))
    draw = ImageDraw.Draw(contact)
    font = ImageFont.load_default()
    for ordinal, frame in enumerate(frames):
        x, y = ordinal % ATLAS_COLUMNS * contact_cell_width, ordinal // ATLAS_COLUMNS * contact_cell_height
        frame_x, frame_y, frame_width, frame_height = frame["frame"]
        crop = atlas.crop((frame_x, frame_y, frame_x + frame_width, frame_y + frame_height)).resize((64, 64), Image.Resampling.NEAREST)
        contact.alpha_composite(crop, (x, y))
        draw.text((66 + x, y + 5), frame["role"][:18], fill=(230, 244, 255, 255), font=font)
        draw.text((66 + x, y + 25), f"v{frame['variant'] + 1}", fill=(112, 214, 255, 255), font=font)
        draw.text((66 + x, y + 43), f"src {frame['sourceCell'][0]},{frame['sourceCell'][1]}", fill=(255, 206, 107, 255), font=font)
        draw.text((66 + x, y + 59), frame["sourceSemantic"], fill=(161, 178, 194, 255), font=font)
    contact_path = OUTPUT_ROOT / "contact-sheets" / f"{theme}.png"
    contact_path.parent.mkdir(parents=True, exist_ok=True)
    contact.save(contact_path, optimize=True)
    return {
        "id": f"{theme}-source-terrain-v2", "theme": theme, "biome": biome, "primaryFamily": family,
        "enclosureStyle": enclosure, "tilePixels": TILE, "runtimeScale": 2,
        "asset": f"world:terrain-kits/{theme}.png", "atlasSize": list(atlas.size), "atlasHash": sha256(kit_path),
        "contactSheet": f"world:terrain-kits/contact-sheets/{theme}.png",
        "sourceAsset": f"world:{relative}", "sourceAssetHash": sha256(source_path), "frames": frames,
    }


def verify(manifest: dict) -> list[str]:
    failures: list[str] = []
    for kit in manifest["kits"]:
        atlas_path = WORLD_ROOT / kit["asset"].removeprefix("world:")
        source_path = WORLD_ROOT / kit.get("sourceAsset", "world:missing").removeprefix("world:")
        if not atlas_path.exists() or sha256(atlas_path) != kit["atlasHash"]:
            failures.append(f"atlas-hash:{kit['id']}")
        if not source_path.exists() or sha256(source_path) != kit.get("sourceAssetHash"):
            failures.append(f"source-hash:{kit['id']}")
        atlas = Image.open(atlas_path).convert("RGBA")
        source = Image.open(source_path).convert("RGBA") if source_path.exists() else None
        frame_keys = {(frame["role"], frame["variant"]) for frame in kit["frames"]}
        for role in ROLES:
            for variant in range(VARIANTS):
                if (role, variant) not in frame_keys:
                    failures.append(f"missing-frame:{kit['id']}:{role}:{variant}")
        for frame in kit["frames"]:
            expected_class = "walkable-cap" if frame["role"] in WALKABLE_CAP_ROLES else "cavity" if frame["role"] in CAVITY_ROLES else "overlay" if frame["role"] in OVERLAY_ROLES else "neutral-solid"
            if frame.get("surfaceClass") != expected_class:
                failures.append(f"surface-class:{kit['id']}:{frame['id']}")
            if frame.get("generatedStatus") != "deterministic-source-derived" or frame.get("promptProvenance") is not None:
                failures.append(f"source-provenance:{kit['id']}:{frame['id']}")
            if not all(frame.get(field) for field in ("sourcePack", "sourceUrl", "sourceFile", "sourceHash", "license", "generationMethod")):
                failures.append(f"incomplete-provenance:{kit['id']}:{frame['id']}")
            if not all(field in frame for field in ("sourceCell", "sourceFrame", "sourceSemantic", "mappingTreatment")):
                failures.append(f"incomplete-source-map:{kit['id']}:{frame['id']}")
            else:
                source_x, source_y, source_width, source_height = frame["sourceFrame"]
                source_cell_coordinate = frame["sourceCell"]
                if source_cell_coordinate != [source_x // 16, source_y // 16] or [source_width, source_height] != [16, 16]:
                    failures.append(f"source-cell-contract:{kit['id']}:{frame['id']}")
                if source is None or source_x < 0 or source_y < 0 or source_x + 16 > source.width or source_y + 16 > source.height:
                    failures.append(f"source-cell-bounds:{kit['id']}:{frame['id']}")
                elif source.crop((source_x, source_y, source_x + 16, source_y + 16)).getchannel("A").getbbox() is None:
                    failures.append(f"empty-source-cell:{kit['id']}:{frame['id']}")
            if frame.get("alphaBounds") != [0, 0, TILE, TILE]:
                failures.append(f"incomplete-runtime-frame:{kit['id']}:{frame['id']}")
            x, y, width, height = frame["frame"]
            runtime_tile = atlas.crop((x, y, x + width, y + height))
            if min(runtime_tile.getchannel("A").getdata()) != 255:
                failures.append(f"transparent-runtime-pixel:{kit['id']}:{frame['id']}")
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
    expanded_mapping = {
        theme: {
            role: [list(SOURCE_TILE_MAPPINGS[theme][ROLE_SOURCE_KEYS[role]][variant]) for variant in range(VARIANTS)]
            for role in ROLES
        }
        for theme in KIT_SPECS
    }
    SOURCE_MAPPING_MANIFEST.write_text(json.dumps({
        "version": 1,
        "sourceCellPixels": 16,
        "runtimeTilePixels": TILE,
        "coordinateFormat": "[column,row], zero-based",
        "roles": expanded_mapping,
    }, indent=2) + "\n")
    manifest = {
        "version": 3, "tilePixels": TILE, "runtimeScale": 2, "roles": ROLES,
        "sourceMapping": "world:terrain-kits/source-mapping.json", "kits": kits,
    }
    RUNTIME_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    (OUTPUT_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"kits": len(kits), "frames": sum(len(kit["frames"]) for kit in kits), "manifest": str(RUNTIME_MANIFEST)}, indent=2))


if __name__ == "__main__":
    main()
