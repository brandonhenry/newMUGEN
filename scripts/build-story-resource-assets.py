#!/usr/bin/env python3
"""Build deterministic Adventure resource sprites and manifests from generated masters."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "story" / "resources"
GENERATED = PUBLIC / "generated"
NODE_STATES = ("intact", "damaged", "depleted")
BIOMES = ("greenhollow", "thornwood", "ironroot", "bonevault", "emberdeep", "frostpeak", "sunscar", "skyglass")
NODE_IDS = {
    "universal": ("routewood", "wildberry", "medicinal-herb", "fieldstone"),
    "greenhollow": ("greenbark", "brook-berry", "copperleaf", "gale-seed"),
    "thornwood": ("ironbark", "thornberry", "glowcap", "heartwood-amber"),
    "ironroot": ("coal", "iron-ore", "silver-ore", "sunstone"),
    "bonevault": ("gravebone", "grave-moss", "soul-salt", "violet-core"),
    "emberdeep": ("basalt", "obsidian", "fire-blossom", "emberheart"),
    "frostpeak": ("frost-pine", "iceberry", "glacial-crystal", "everfrost"),
    "sunscar": ("palmwood", "cactus-fruit", "glass-sand", "sunscar-opal"),
    "skyglass": ("cloud-reed", "charged-ore", "prism-bloom", "skyglass-prism"),
}
ICON_IDS = {
    "universal": (
        "routewood", "wildberry", "medicinal-herb", "fieldstone",
        "berry-tonic", "herbal-draught", "stoneguard-tonic", "gatherers-tea",
        "wildheart-elixir", "titan-elixir", "tempered-elixir", "pathfinder-elixir",
    ),
    "greenhollow": ("greenbark", "brook-berry", "copperleaf", "gale-seed", "greenhollow-head", "greenhollow-coat", "greenhollow-boots", "gale-tonic", "field-pouch"),
    "thornwood": ("ironbark", "thornberry", "glowcap", "heartwood-amber", "thornwood-head", "thornwood-coat", "thornwood-boots", "briar-brew", "felling-wrap"),
    "ironroot": ("coal", "iron-ore", "silver-ore", "sunstone", "ironroot-head", "ironroot-coat", "ironroot-boots", "miners-focus", "prospector-kit"),
    "bonevault": ("gravebone", "grave-moss", "soul-salt", "violet-core", "bonevault-head", "bonevault-coat", "bonevault-boots", "spirit-ward", "soul-sieve"),
    "emberdeep": ("basalt", "obsidian", "fire-blossom", "emberheart", "emberdeep-head", "emberdeep-coat", "emberdeep-boots", "fireguard", "basalt-flask"),
    "frostpeak": ("frost-pine", "iceberry", "glacial-crystal", "everfrost", "frostpeak-head", "frostpeak-coat", "frostpeak-boots", "rimeguard", "thermal-lining"),
    "sunscar": ("palmwood", "cactus-fruit", "glass-sand", "sunscar-opal", "sunscar-head", "sunscar-coat", "sunscar-boots", "sandstep", "sand-cleats"),
    "skyglass": ("cloud-reed", "charged-ore", "prism-bloom", "skyglass-prism", "skyglass-head", "skyglass-coat", "skyglass-boots", "windward", "wind-sail"),
}
REFERENCES = (
    ROOT / "public/story/npcs/characters/mina-quill/contact-sheet.png",
    ROOT / "public/story/npcs/characters/sura-forge/contact-sheet.png",
    ROOT / "public/story/npcs/characters/edda-veil/contact-sheet.png",
    ROOT / "public/story/npcs/characters/kael-cinder/contact-sheet.png",
    ROOT / "public/story/npcs/characters/ylva-snow/contact-sheet.png",
    ROOT / "public/story/npcs/characters/sahir-dune/contact-sheet.png",
    ROOT / "public/story/npcs/characters/aeri-prism/contact-sheet.png",
    ROOT / "public/story/enemies/kore-enemies-v1/contact-sheet.png",
    ROOT / "public/story/worlds/thornwood/sky.png",
    ROOT / "public/story/worlds/gothic-town/background.png",
    ROOT / "public/story/worlds/warped-caves/middleground.png",
    ROOT / "public/story/worlds/gothic-cemetery/graveyard.png",
    ROOT / "public/story/worlds/emberdeep/background.png",
    ROOT / "public/story/worlds/sunnyland-winter/mountains.png",
    ROOT / "public/story/worlds/yeehaw/parallax-b.png",
    ROOT / "public/story/worlds/skyglass/middle.png",
    ROOT / "public/story/worlds/magical-road/middle.png",
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def output_metadata(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    alpha_bounds = image.getchannel("A").getbbox()
    return {
        "path": str(path.relative_to(ROOT)),
        "dimensions": list(image.size),
        "alphaBounds": list(alpha_bounds) if alpha_bounds else None,
        "sha256": sha256(path),
    }


def bounds(index: int, count: int, length: int) -> tuple[int, int]:
    return round(index * length / count), round((index + 1) * length / count)


def cell(image: Image.Image, column: int, row: int, columns: int, rows: int) -> Image.Image:
    left, right = bounds(column, columns, image.width)
    top, bottom = bounds(row, rows, image.height)
    frame = image.crop((left, top, right, bottom))
    inset_x = max(2, round(frame.width * 0.05))
    inset_y = max(2, round(frame.height * 0.09))
    return frame.crop((inset_x, inset_y, frame.width - inset_x, frame.height - inset_y))


def node_row_edges(image: Image.Image) -> tuple[int, int, int, int, int]:
    alpha = image.getchannel("A")
    coverage = [sum(alpha.crop((0, y, image.width, y + 1)).histogram()[25:]) for y in range(image.height)]
    ranges = ((0.18, 0.42, 0.30), (0.38, 0.67, 0.52), (0.60, 0.88, 0.76))
    separators: list[int] = []
    for start_ratio, end_ratio, target_ratio in ranges:
        start, end = round(start_ratio * image.height), round(end_ratio * image.height)
        quiet = [coverage[y] <= image.width * 0.012 for y in range(start, end)]
        runs: list[tuple[int, int]] = []
        cursor = 0
        while cursor < len(quiet):
            if not quiet[cursor]:
                cursor += 1
                continue
            finish = cursor
            while finish + 1 < len(quiet) and quiet[finish + 1]:
                finish += 1
            if finish - cursor >= 4:
                runs.append((start + cursor, start + finish))
            cursor = finish + 1
        if runs:
            target = target_ratio * image.height
            chosen = min(runs, key=lambda run: abs((run[0] + run[1]) / 2 - target))
            separators.append(round((chosen[0] + chosen[1]) / 2))
        else:
            separators.append(min(range(start, end), key=lambda y: sum(coverage[max(start, y - 3):min(end, y + 4)])))
    return (0, *separators, image.height)


def node_cell(image: Image.Image, column: int, row: int, row_edges: tuple[int, int, int, int, int]) -> Image.Image:
    left, right = bounds(column, 3, image.width)
    top = row_edges[row]
    bottom = row_edges[row + 1]
    frame = image.crop((left, top, right, bottom))
    inset_x = max(2, round(frame.width * 0.025))
    inset_y = max(2, round(frame.height * 0.02))
    return frame.crop((inset_x, inset_y, frame.width - inset_x, frame.height - inset_y))


def alpha_crop(image: Image.Image) -> Image.Image:
    box = image.getchannel("A").getbbox()
    return image.crop(box) if box else Image.new("RGBA", (1, 1))


def normalize_group(images: list[Image.Image], output_size: int = 256, padding: int = 14) -> list[Image.Image]:
    cropped = [alpha_crop(image) for image in images]
    width = max(image.width for image in cropped) + padding * 2
    height = max(image.height for image in cropped) + padding * 2
    side = max(width, height)
    normalized: list[Image.Image] = []
    for image in cropped:
        canvas = Image.new("RGBA", (side, side))
        canvas.alpha_composite(image, ((side - image.width) // 2, side - image.height - padding))
        normalized.append(canvas.resize((output_size, output_size), Image.Resampling.NEAREST))
    return normalized


def normalize_icon(image: Image.Image, output_size: int = 256, visible_size: int = 210) -> Image.Image:
    cropped = alpha_crop(image)
    scale = min(visible_size / cropped.width, visible_size / cropped.height)
    resized = cropped.resize((max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (output_size, output_size))
    canvas.alpha_composite(resized, ((output_size - resized.width) // 2, (output_size - resized.height) // 2))
    return canvas


def save_contact_sheet(paths: list[Path], output: Path, columns: int) -> None:
    tile = 128
    rows = (len(paths) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * tile, rows * tile), (8, 13, 25, 255))
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(paths):
        image = Image.open(path).convert("RGBA").resize((tile - 8, tile - 8), Image.Resampling.NEAREST)
        x = index % columns * tile + 4
        y = index // columns * tile + 4
        sheet.alpha_composite(image, (x, y))
        draw.rectangle((x, y, x + tile - 9, y + tile - 9), outline=(255, 255, 255, 24))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, optimize=True)


def build_nodes(outputs: list[Path], sources: list[dict[str, object]]) -> None:
    for atlas, resource_ids in NODE_IDS.items():
        source = GENERATED / f"{atlas}-nodes-transparent.png"
        master = Image.open(source).convert("RGBA")
        row_edges = node_row_edges(master)
        atlas_outputs: list[Path] = []
        for row, resource_id in enumerate(resource_ids):
            frames = [node_cell(master, column, row, row_edges) for column in range(3)]
            for state, frame in zip(NODE_STATES, normalize_group(frames)):
                output = PUBLIC / "nodes" / atlas / f"{resource_id}-{state}.png"
                output.parent.mkdir(parents=True, exist_ok=True)
                frame.save(output, optimize=True)
                outputs.append(output)
                atlas_outputs.append(output)
        save_contact_sheet(atlas_outputs, PUBLIC / "contact-sheets" / f"{atlas}-nodes.png", 3)
        sources.append({"kind": "node-atlas", "atlas": atlas, "path": str(source.relative_to(ROOT)), "dimensions": list(master.size), "sha256": sha256(source), "prompt": "Four resources by intact, damaged, and depleted states; side-view K.O.R.E. pixel art on chroma key."})


def biome_icon_cell(master: Image.Image, atlas: str, index: int) -> Image.Image:
    panel_column = 0 if atlas in ("greenhollow", "ironroot", "emberdeep", "sunscar") else 3
    panel_row = 0 if atlas in ("greenhollow", "thornwood", "emberdeep", "frostpeak") else 3
    return cell(master, panel_column + index % 3, panel_row + index // 3, 6, 6)


def build_icons(outputs: list[Path], sources: list[dict[str, object]]) -> None:
    universal_source = GENERATED / "universal-icons-transparent.png"
    universal = Image.open(universal_source).convert("RGBA")
    icon_masters = {
        "a": Image.open(GENERATED / "biomes-a-icons-transparent.png").convert("RGBA"),
        "b": Image.open(GENERATED / "biomes-b-icons-transparent.png").convert("RGBA"),
    }
    for atlas, icon_ids in ICON_IDS.items():
        atlas_outputs: list[Path] = []
        for index, icon_id in enumerate(icon_ids):
            raw = cell(universal, index % 4, index // 4, 4, 3) if atlas == "universal" else biome_icon_cell(icon_masters["a" if atlas in BIOMES[:4] else "b"], atlas, index)
            output = PUBLIC / "icons" / atlas / f"{icon_id}.png"
            output.parent.mkdir(parents=True, exist_ok=True)
            normalize_icon(raw).save(output, optimize=True)
            outputs.append(output)
            atlas_outputs.append(output)
        save_contact_sheet(atlas_outputs, PUBLIC / "contact-sheets" / f"{atlas}-icons.png", 4 if atlas == "universal" else 3)
    for name in ("universal", "biomes-a", "biomes-b"):
        source = GENERATED / f"{name}-icons-transparent.png"
        image = Image.open(source)
        sources.append({"kind": "icon-atlas", "atlas": name, "path": str(source.relative_to(ROOT)), "dimensions": list(image.size), "sha256": sha256(source), "prompt": "Materials, armor, consumables, elixirs, and utilities as centered K.O.R.E. pixel icons on chroma key."})


def build_workbench(outputs: list[Path], sources: list[dict[str, object]]) -> None:
    source = GENERATED / "workbench-transparent.png"
    image = normalize_icon(Image.open(source).convert("RGBA"), 512, 468)
    output = PUBLIC / "workbench.png"
    image.save(output, optimize=True)
    outputs.append(output)
    sources.append({"kind": "prop", "atlas": "workbench", "path": str(source.relative_to(ROOT)), "dimensions": list(Image.open(source).size), "sha256": sha256(source), "prompt": "Side-view Central Route traveler workbench with forge, potion, plans, material bins, cyan crystal, and lantern."})


def main() -> None:
    outputs: list[Path] = []
    sources: list[dict[str, object]] = []
    build_nodes(outputs, sources)
    build_icons(outputs, sources)
    build_workbench(outputs, sources)
    manifest = {
        "version": 1,
        "builder": "scripts/build-story-resource-assets.py",
        "toolMode": "OpenAI built-in imagegen with chroma-key cleanup",
        "model": "Built-in OpenAI image generation (model identifier not exposed by tool)",
        "normalization": {"filter": "nearest-neighbor", "nodeFrame": [256, 256], "iconFrame": [256, 256], "workbench": [512, 512]},
        "references": [{"path": str(path.relative_to(ROOT)), "sha256": sha256(path)} for path in REFERENCES],
        "sources": sources,
        "outputs": [output_metadata(path) for path in sorted(outputs)],
    }
    (PUBLIC / "asset-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(outputs)} runtime assets and {len(NODE_IDS) * 2} contact sheets.")


if __name__ == "__main__":
    main()
