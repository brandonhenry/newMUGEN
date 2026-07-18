#!/usr/bin/env python3
"""Build combined review sheets for the eight generated Adventure cohorts."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
OUTPUT = PUBLIC / "story/roster-contact-sheets"
REGISTRY = json.loads((ROOT / "src/story/storyRosterExpansion.json").read_text())
NPC_MANIFEST = json.loads((ROOT / "src/story/storyNpcManifest.json").read_text())
ENEMY_MANIFEST = json.loads((ROOT / "src/story/storyEnemyManifest.json").read_text())
BIOME_ORDER = tuple(REGISTRY["biomes"])
THUMB = 128
LABEL = 28
CELL = THUMB + LABEL


def load_public(path: str) -> Image.Image:
    return Image.open(PUBLIC / path.lstrip("/")).convert("RGBA")


def cell(label: str, image: Image.Image, accent: str) -> Image.Image:
    canvas = Image.new("RGBA", (THUMB, CELL), (13, 17, 27, 255))
    preview = image.resize((THUMB, THUMB), Image.Resampling.NEAREST)
    canvas.alpha_composite(preview)
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, THUMB, THUMB, CELL), fill=(18, 24, 37, 255))
    draw.rectangle((0, THUMB, 4, CELL), fill=accent)
    draw.text((8, THUMB + 7), label[:19], fill=(235, 240, 248, 255))
    return canvas


def cohort_cells(biome_id: str) -> list[Image.Image]:
    biome = REGISTRY["biomes"][biome_id]
    npc_by_id = {entry["id"]: entry for entry in NPC_MANIFEST["npcs"]}
    enemy_by_id = {entry["id"]: entry for entry in ENEMY_MANIFEST["enemies"]}
    result: list[Image.Image] = []
    for npc_id, display_name, *_rest in biome["npcs"]:
        entry = npc_by_id[npc_id]
        result.append(cell(display_name, load_public(entry["previewPath"]), "#65d690"))
    for enemy_id, display_name, tier, *_rest in biome["enemies"]:
        entry = enemy_by_id[enemy_id]
        idle = next(animation for animation in entry["animations"] if animation["id"] == "idle")
        accent = "#ef6778" if tier == "challenger" else "#f0b552"
        result.append(cell(display_name, load_public(idle["frames"][0]["path"]), accent))
    return result


def compose(title: str, cells: list[Image.Image], columns: int) -> Image.Image:
    rows = (len(cells) + columns - 1) // columns
    header = 44
    sheet = Image.new("RGBA", (columns * THUMB, header + rows * CELL), (9, 13, 22, 255))
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 14), title, fill=(255, 226, 132, 255))
    for index, preview in enumerate(cells):
        sheet.alpha_composite(preview, ((index % columns) * THUMB, header + (index // columns) * CELL))
    return sheet


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    all_cells: list[Image.Image] = []
    for biome_id in BIOME_ORDER:
        cells = cohort_cells(biome_id)
        all_cells.extend(cells)
        compose(f"{biome_id.title()} generated cohort — 9 NPCs, 3 regulars, 2 challengers", cells, 7).save(
            OUTPUT / f"{biome_id}-cohort.png", optimize=True
        )
    compose("Adventure Mode generated roster expansion — 112 characters", all_cells, 14).save(
        OUTPUT / "expansion-roster.png", optimize=True
    )
    print(f"Built {len(BIOME_ORDER)} biome cohort sheets and one {len(all_cells)}-character roster sheet")


if __name__ == "__main__":
    main()
