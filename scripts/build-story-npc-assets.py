#!/usr/bin/env python3
"""Normalize supplied/generated NPC sheets into runtime frames and contact sheets."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

from story_sprite_alpha import clean_transparent_sprite


ROOT = Path(__file__).resolve().parents[1]
ROSTER_REGISTRY_PATH = ROOT / "src/story/storyRosterExpansion.json"
NPC_ROOT = ROOT / "public/story/npcs"
GENERATED_ROOT = NPC_ROOT / "generated"
OUTPUT_ROOT = NPC_ROOT / "characters"
MANIFEST_PATH = NPC_ROOT / "manifest.json"
RUNTIME_MANIFEST_PATH = ROOT / "src/story/storyNpcManifest.json"
ACTIONS = (("idle", 6, True, 180), ("dialogue", 6, True, 150), ("walk", 8, True, 110), ("protect", 4, False, 115), ("counter", 8, False, 90))
STYLE_REFERENCE_IDS = ("mina-quill", "hana-rook", "tamsin-reed")
IMAGEGEN_MODEL = "OpenAI image_gen (session-default model)"
IMAGEGEN_PROMPT_CONTRACT = (
    "One production sprite sheet for {identity}; side-view anime pixel art matching all three canonical starter references, "
    "compact proportions, clean dark outlines, hard nearest-neighbor pixels, restrained biome palette, stable identity, "
    "flat #ff00ff background; rows idle 6, dialogue 6, walk-right 8, protect 4, defensive counter 6-8; "
    "the walk row is four gait phases followed by the same four phases with the opposite leg leading; "
    "no opponent, extra limbs, identity drift, scale drift, labels, grid, or broken held prop."
)


def load_expansion_npcs() -> dict[str, dict]:
    registry = json.loads(ROSTER_REGISTRY_PATH.read_text())
    entries: dict[str, dict] = {}
    for biome_id, biome in registry["biomes"].items():
        for npc in biome["npcs"]:
            npc_id, display_name, map_role, role, species, design, bark, warning_bark = npc
            entries[npc_id] = {
                "displayName": display_name,
                "biomeId": biome_id,
                "mapRole": map_role,
                "role": role,
                "species": species,
                "design": design,
                "bark": bark,
                "warningBark": warning_bark,
                "chromaKey": biome["chromaKey"],
                "palette": biome["palette"],
            }
    return entries


EXPANSION_NPCS = load_expansion_npcs()


@dataclass(frozen=True)
class NpcAsset:
    id: str
    source_kind: str
    custom_counts: tuple[int, int, int, int, int] | None = None


ASSETS = (
    NpcAsset("mina-quill", "user-supplied", (8, 8, 8, 4, 6)),
    NpcAsset("hana-rook", "user-supplied", (7, 6, 8, 2, 8)),
    NpcAsset("tamsin-reed", "user-supplied", (6, 5, 8, 3, 6)),
    *tuple(NpcAsset(item, "imagegen", (6, 6, 8, 4, 6)) for item in (
        "elio-fen", "pippa-brook", "bram-appleby", "syl-veyra", "moss-bell", "nera-thorne",
        "orin-pike", "della-gear", "jax-flint", "mara-bell", "ivo-ossin", "edda-veil",
        "kael-cinder", "sura-forge", "ren-ash", "ylva-snow", "corin-gale", "mika-hearth",
        "sahir-dune", "amara-wells", "nilo-glass", "aeri-prism", "tovan-chime", "lumi-cloud",
    )),
    *tuple(NpcAsset(item, "imagegen", (6, 6, 8, 4, 6)) for item in EXPANSION_NPCS),
)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def source_path(asset: NpcAsset) -> Path:
    if asset.source_kind == "user-supplied":
        return GENERATED_ROOT / f"{asset.id}-sheet.png"
    return GENERATED_ROOT / f"{asset.id}-sheet.png"


def alpha_runs(sheet: Image.Image, row: int, character_band: bool = False) -> list[tuple[int, int]]:
    width, height = sheet.size
    top = round(row * height / 5)
    bottom = round((row + 1) * height / 5)
    # The lower portion of an action row contains the character's torso/legs but
    # excludes most projectiles, speech gestures, and counter trails.  Using it
    # to locate cells prevents a long effect from merging adjacent characters.
    band_top = top + round((bottom - top) * 0.34) if character_band else top
    band = sheet.getchannel("A").crop((0, band_top, width, bottom)).point(lambda pixel: 255 if pixel > 20 else 0)
    projection = band.getprojection()[0]
    columns = [index for index, value in enumerate(projection) if value and index > width * 0.08]
    runs: list[tuple[int, int]] = []
    if not columns:
        return runs
    start = previous = columns[0]
    for column in columns[1:]:
        if column - previous > 25:
            runs.append((start, previous))
            start = column
        previous = column
    runs.append((start, previous))
    return [run for run in runs if run[1] - run[0] >= 20]


def upper_character_runs(sheet: Image.Image, row: int) -> list[tuple[int, int]]:
    """Find action cells from heads/shoulders, above most counter trails."""
    width, height = sheet.size
    top = round(row * height / 5)
    bottom = round((row + 1) * height / 5)
    band = sheet.getchannel("A").crop((0, top, width, top + round((bottom - top) * 0.32))).point(
        lambda pixel: 255 if pixel > 20 else 0
    )
    projection = band.getprojection()[0]
    columns = [index for index, value in enumerate(projection) if value and index > width * 0.08]
    runs: list[tuple[int, int]] = []
    if not columns:
        return runs
    start = previous = columns[0]
    for column in columns[1:]:
        if column - previous > 18:
            runs.append((start, previous))
            start = column
        previous = column
    runs.append((start, previous))
    return [run for run in runs if run[1] - run[0] >= 15]


def walk_centers(sheet: Image.Image) -> list[float]:
    runs = alpha_runs(sheet, 2, character_band=True)
    if len(runs) < 8:
        raise RuntimeError(f"Walk row must contain eight coherent character cells; found {len(runs)}")
    if len(runs) > 8:
        runs = sorted(sorted(runs, key=lambda run: run[1] - run[0], reverse=True)[:8])
    return [(left + right) / 2 for left, right in runs]


def action_centers(sheet: Image.Image, row: int, count: int, walking: list[float], source_kind: str) -> list[float]:
    if row == 2:
        return walking
    runs = alpha_runs(sheet, row, character_band=True)
    if source_kind == "user-supplied" and runs and runs[0][0] < sheet.width * 0.15:
        runs = runs[1:]  # remove the left-side action label
    if source_kind == "imagegen" and row == 4:
        upper = upper_character_runs(sheet, row)
        if len(upper) >= count:
            raw = [(left + right) / 2 for left, right in upper[:count]]
            gaps = sorted(raw[index] - raw[index - 1] for index in range(1, len(raw)))
            spacing = gaps[len(gaps) // 2]
            # Counter effects distort individual alpha bounds. A uniform grid
            # anchored to the first complete character keeps every body intact.
            return [raw[0] + spacing * index for index in range(count)]
    if len(runs) >= count:
        # Character-band runs are already spatially ordered. Extra islands at
        # the far right are detached effects, never replacement character cells.
        character_runs = runs[:count]
        return [(left + right) / 2 for left, right in character_runs]
    # Counter effects often connect neighboring cells into one alpha island. The
    # character baselines still follow the full-width walk grid, so resample that
    # span instead of allowing the effect island to drag a crop through a body.
    if row == 4 and len(runs) >= 2:
        # A generated counter may intentionally provide 6–8 frames. Preserve
        # every detected complete body and let the build loop hold the final
        # coherent pose for any requested padding frames.
        return [(left + right) / 2 for left, right in runs]
    if source_kind == "imagegen" and len(runs) >= 2:
        # A generated band may contain fewer distinct poses than the runtime
        # contract. The build loop deliberately holds the last reviewed pose;
        # never extrapolate crops beyond the 1536px source canvas.
        return [(left + right) / 2 for left, right in runs]
    if len(runs) >= 2:
        centers = [(left + right) / 2 for left, right in runs]
        gaps = sorted(centers[index] - centers[index - 1] for index in range(1, len(centers)))
        spacing = gaps[len(gaps) // 2]
        while len(centers) < count:
            centers.append(centers[-1] + spacing)
        return centers
    return walking


def cell_bounds(centers: list[float], index: int, width: int) -> tuple[int, int]:
    if len(centers) == 1:
        return max(0, round(centers[0] - width * 0.1)), min(width, round(centers[0] + width * 0.1))
    left = round(centers[0] - (centers[1] - centers[0]) / 2) if index == 0 else round((centers[index - 1] + centers[index]) / 2)
    right = round(centers[-1] + (centers[-1] - centers[-2]) / 2) if index == len(centers) - 1 else round((centers[index] + centers[index + 1]) / 2)
    return max(0, left), min(width, right)


def normalized_frame(sheet: Image.Image, centers: list[float], row: int, index: int) -> Image.Image:
    width, height = sheet.size
    left, right = cell_bounds(centers, index, width)
    top = round(row * height / 5)
    bottom = round((row + 1) * height / 5)
    frame = clean_transparent_sprite(sheet.crop((left, top, right, bottom)))
    box = frame.getchannel("A").point(lambda pixel: 255 if pixel > 16 else 0).getbbox()
    if not box:
        raise RuntimeError(f"Empty frame row={row} index={index}")
    frame = frame.crop(box)
    max_width, max_height = 184, 184
    scale = min(1.0, max_height / frame.height)
    if scale < 1:
        frame = frame.resize((max(1, round(frame.width * scale)), max(1, round(frame.height * scale))), Image.Resampling.NEAREST)
    if frame.width > max_width:
        horizontal = frame.getchannel("A").point(lambda pixel: 255 if pixel > 20 else 0).getprojection()[0]
        peak = max(horizontal)
        body_columns = [index for index, value in enumerate(horizontal) if value >= peak * 0.35]
        body_center = (body_columns[0] + body_columns[-1]) / 2 if body_columns else frame.width / 2
        crop_left = max(0, min(frame.width - max_width, round(body_center - max_width / 2)))
        frame = frame.crop((crop_left, 0, crop_left + max_width, frame.height))
    canvas = Image.new("RGBA", (192, 192))
    canvas.alpha_composite(frame, ((192 - frame.width) // 2, 188 - frame.height))
    return canvas


def opaque_area(frame: Image.Image) -> int:
    return sum(1 for pixel in frame.getchannel("A").getdata() if pixel > 16)


def coherent_character_frame(frame: Image.Image, reference_area: int) -> bool:
    box = frame.getchannel("A").point(lambda pixel: 255 if pixel > 16 else 0).getbbox()
    return bool(box and 186 <= box[3] <= 188 and box[3] - box[1] >= 58 and opaque_area(frame) >= reference_area * 0.70)


def build_asset(asset: NpcAsset) -> dict:
    sheet_path = source_path(asset)
    if not sheet_path.exists():
        raise FileNotFoundError(sheet_path)
    sheet = Image.open(sheet_path).convert("RGBA")
    walking = walk_centers(sheet)
    destination = OUTPUT_ROOT / asset.id
    action_entries: dict[str, dict] = {}
    contact_frames: list[tuple[str, Image.Image]] = []
    counts = asset.custom_counts or tuple(item[1] for item in ACTIONS)
    identity_area = 0
    identity_frame: Image.Image | None = None
    for row, ((action, _default_count, loop, duration), count) in enumerate(zip(ACTIONS, counts)):
        # Canonical starter sheets label ATTACK before PROTECT; generated sheets
        # use the runtime order requested by the image contract.
        source_row = ({3: 4, 4: 3}.get(row, row) if asset.source_kind == "user-supplied" else row)
        centers = action_centers(sheet, source_row, count, walking, asset.source_kind)
        frames: list[str] = []
        action_dir = destination / action
        action_dir.mkdir(parents=True, exist_ok=True)
        for stale_frame in action_dir.glob("*.png"):
            stale_frame.unlink()
        previous_frame: Image.Image | None = None
        pose_hashes: list[str] = []
        strict_generated_walk = asset.source_kind == "imagegen" and action == "walk"
        for index in range(count):
            try:
                frame = normalized_frame(sheet, centers, source_row, min(index, len(centers) - 1))
                if identity_area and not coherent_character_frame(frame, identity_area):
                    if strict_generated_walk:
                        raise RuntimeError("Generated walk frame is not a coherent full-body pose")
                    if previous_frame is None and identity_frame is None:
                        raise RuntimeError("No coherent identity fallback")
                    frame = (previous_frame or identity_frame).copy()
            except RuntimeError:
                if strict_generated_walk:
                    raise
                if previous_frame is None and identity_frame is None:
                    raise
                frame = (previous_frame or identity_frame).copy()
            if identity_frame is None:
                identity_frame = frame.copy()
                identity_area = opaque_area(frame)
            previous_frame = frame
            pose_hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
            frame_path = action_dir / f"{index + 1:02d}.png"
            frame.save(frame_path, optimize=True)
            public_path = f"/story/npcs/characters/{asset.id}/{action}/{index + 1:02d}.png"
            frames.append(public_path)
            contact_frames.append((f"{action} {index + 1}", frame))
        if strict_generated_walk and (len(pose_hashes) != 8 or len(set(pose_hashes)) != 8):
            raise RuntimeError(f"Generated walk row for {asset.id} must contain eight distinct approved poses")
        action_entries[action] = {"frames": frames, "durationMs": duration, "loop": loop}
    columns = 8
    rows = (len(contact_frames) + columns - 1) // columns
    contact = Image.new("RGB", (columns * 192, rows * 216), "#11151b")
    draw = ImageDraw.Draw(contact)
    for index, (label, frame) in enumerate(contact_frames):
        x = index % columns * 192
        y = index // columns * 216
        contact.paste(frame, (x, y), frame)
        draw.text((x + 6, y + 196), label, fill="#e8edf2")
    contact_path = destination / "contact-sheet.png"
    contact.save(contact_path, optimize=True)
    reference_box = identity_frame.getchannel("A").point(lambda pixel: 255 if pixel > 16 else 0).getbbox() if identity_frame else None
    if not reference_box:
        raise RuntimeError(f"Missing reference content bounds for {asset.id}")
    source = {"kind": asset.source_kind, "sha256": digest(sheet_path)}
    if asset.source_kind == "imagegen":
        references = []
        for reference_id in STYLE_REFERENCE_IDS:
            reference = NPC_ROOT / "sources" / f"{reference_id}-reference.png"
            references.append({"path": f"/story/npcs/sources/{reference.name}", "sha256": digest(reference)})
        metadata = EXPANSION_NPCS.get(asset.id)
        prompt = IMAGEGEN_PROMPT_CONTRACT.format(identity=asset.id)
        if metadata:
            prompt = (
                f"Original {metadata['species']} NPC {metadata['displayName']} for {metadata['biomeId']}: "
                f"{metadata['design']}; palette {metadata['palette']}; one 1536x1024 five-row sheet on flat "
                f"{metadata['chromaKey']}; rows idle 6, dialogue 6, walk-right 8, protect 4, defensive counter 6; "
                "the walk row is four gait phases followed by the same four phases with the opposite leg leading; "
                "right-facing anime pixel art, hard pixels, dark outlines, one stable full-body identity per frame, "
                "no text, grid, opponent, extra bodies, merged cells, transparency, or identity drift."
            )
        source.update({
            "model": IMAGEGEN_MODEL,
            "prompt": prompt,
            "sourceReferences": references,
        })
        if metadata:
            chroma = GENERATED_ROOT / f"{asset.id}-sheet-chroma.png"
            if not chroma.is_file():
                raise FileNotFoundError(chroma)
            source.update({
                "chromaKey": metadata["chromaKey"],
                "chromaSourcePath": f"/story/npcs/generated/{asset.id}-sheet-chroma.png",
                "chromaSourceSha256": digest(chroma),
                "registryPath": "/src/story/storyRosterExpansion.json",
            })
    return {
        "id": asset.id,
        "sheetPath": f"/story/npcs/generated/{asset.id}-sheet.png",
        "previewPath": action_entries["idle"]["frames"][0],
        "contactSheetPath": f"/story/npcs/characters/{asset.id}/contact-sheet.png",
        "facing": "right",
        "frameSize": {"width": 192, "height": 192, "baseline": 188},
        "referenceContentBounds": list(reference_box),
        "actions": action_entries,
        "source": source,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--allow-partial", action="store_true")
    parser.add_argument("--existing-manifest-only", action="store_true")
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        payload = json.loads(MANIFEST_PATH.read_text())
        if not RUNTIME_MANIFEST_PATH.is_file() or json.loads(RUNTIME_MANIFEST_PATH.read_text()) != payload:
            raise SystemExit("Runtime NPC manifest is missing or stale")
        expected = len(payload.get("npcs", [])) if args.existing_manifest_only else len(ASSETS)
        if len(payload.get("npcs", [])) != expected:
            raise SystemExit(f"Expected {expected} NPC manifests, found {len(payload.get('npcs', []))}")
        for entry in payload["npcs"]:
            asset = next(item for item in ASSETS if item.id == entry["id"])
            expected_counts = asset.custom_counts or tuple(item[1] for item in ACTIONS)
            sheet = ROOT / "public" / entry["sheetPath"].lstrip("/")
            if digest(sheet) != entry["source"]["sha256"]:
                raise SystemExit(f"NPC source checksum mismatch: {entry['id']}")
            for action_index, (action_name, action) in enumerate(entry["actions"].items()):
                expected_count = expected_counts[action_index]
                if len(action["frames"]) != expected_count:
                    raise SystemExit(f"NPC action count mismatch: {entry['id']} {action_name}")
                for public_path in action["frames"]:
                    frame_path = ROOT / "public" / public_path.lstrip("/")
                    if not frame_path.is_file():
                        raise SystemExit(f"Missing NPC frame: {public_path}")
                    frame = Image.open(frame_path).convert("RGBA")
                    alpha_box = frame.getchannel("A").point(lambda pixel: 255 if pixel > 16 else 0).getbbox()
                    if frame.size != (192, 192) or not alpha_box or not 186 <= alpha_box[3] <= 188:
                        raise SystemExit(f"NPC alpha/baseline mismatch: {public_path}")
                    if set(frame.getchannel("A").get_flattened_data()) - {0, 255}:
                        raise SystemExit(f"NPC alpha is not binary: {public_path}")
            bounds = entry.get("referenceContentBounds")
            if not isinstance(bounds, list) or len(bounds) != 4 or bounds[2] <= bounds[0] or bounds[3] <= bounds[1]:
                raise SystemExit(f"NPC reference bounds missing: {entry['id']}")
            if entry["source"]["kind"] == "imagegen" and (not entry["source"].get("prompt") or len(entry["source"].get("sourceReferences", [])) != 3):
                raise SystemExit(f"NPC generation provenance incomplete: {entry['id']}")
            if entry["id"] in EXPANSION_NPCS and not entry["source"].get("chromaSourceSha256"):
                raise SystemExit(f"NPC chroma provenance incomplete: {entry['id']}")
        print(f"Verified {expected} NPC sprite manifests")
        return
    entries = []
    missing = []
    selected_assets = ASSETS
    if args.existing_manifest_only and RUNTIME_MANIFEST_PATH.is_file():
        existing_ids = {entry["id"] for entry in json.loads(RUNTIME_MANIFEST_PATH.read_text()).get("npcs", [])}
        selected_assets = tuple(asset for asset in ASSETS if asset.id in existing_ids)
    for asset in selected_assets:
        try:
            print(f"Building NPC {asset.id}", flush=True)
            entries.append(build_asset(asset))
            gc.collect()
        except FileNotFoundError:
            missing.append(asset.id)
    if missing and not args.allow_partial:
        raise SystemExit(f"Missing generated sheets: {', '.join(missing)}")
    serialized = json.dumps({"version": 1, "style": "kore-adventure-npc-v1", "npcs": entries}, indent=2) + "\n"
    MANIFEST_PATH.write_text(serialized)
    RUNTIME_MANIFEST_PATH.write_text(serialized)
    print(f"Built {len(entries)} NPC sprite manifests" + (f"; pending {len(missing)}" if missing else ""))


if __name__ == "__main__":
    main()
