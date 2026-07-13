#!/usr/bin/env python3
"""Replace Killua's source sheet and animation bindings without deleting authored data."""

from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CHARACTER_ID = "killua-zoldyck"
DEFAULT_SOURCE = Path("/Users/brandonhenry/Downloads/new-killua.png")


# The source is laid out as animation rows, but disconnected lightning, yo-yo,
# and orb fragments are also detected as individual regions. Runtime bindings
# deliberately include only complete Killua poses (with attached effects where
# present); standalone effect fragments remain available in the frame catalog.
ANIMATION_INDEXES: dict[str, list[int]] = {
    "idle": [184, 185, 186, 185],
    "walkForward": [0, 1, 2, 3, 4, 5, 6, 7],
    "walkBack": [7, 6, 5, 4, 3, 2, 1, 0],
    "sprint": [8, 9, 10, 11, 12, 13, 14, 15],
    "backHop": [220, 221, 222, 223, 224, 225],
    "sidestepLeft": [127, 128, 129, 130, 131, 132, 133],
    "sidestepRight": [133, 132, 131, 130, 129, 128, 127],
    "jump": [122, 123, 124, 125, 126],
    "crouch": [71],
    "crouchBlock": [71],
    "block": [77, 78, 79, 80],
    "chargeKi": [240, 241, 242, 243, 244, 245, 246, 247, 248, 249],
    "jableft": [73, 74, 75, 76, 77, 78, 79, 80, 81],
    "jabright": [110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121],
    "kickleft": [127, 128, 129, 130, 131, 132, 133],
    "kickright": [157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172],
    "hitLight": [187],
    "hitHeavy": [188, 189],
    "juggle": [220, 221, 222, 223, 224, 225],
    "knockdown": [187, 188, 189, 190, 191],
    "getupStand": [191, 190, 189, 188, 187, 186],
    "getupRollUp": [220, 221, 222, 223, 224, 225, 186],
    "win": [204, 205, 206, 207, 208, 209, 210, 211],
    "lose": [190, 191],
    "cmd:f+1": [16, 17, 18, 19],
    "cmd:d/f+2": [20, 21, 22, 23],
    "cmd:qcf+4": [258, 259, 260, 262, 263, 264, 265, 267, 269, 271],
    "cmd:WS+4": [122, 123, 124, 125, 126],
    "cmd:FC+1": [200, 201, 202, 203],
    "cmd:FC+2": [195, 196, 197, 198, 199],
    "cmd:1+2": [226, 227, 228, 230, 232, 233, 234, 235, 236, 237],
    "cmd:1+3": [173, 174, 175, 176, 177, 178, 179],
    "cmd:2+3": [195, 196, 197, 198, 199],
    "cmd:2+4": [200, 201, 202, 203],
    "cmd:3+4": [250, 252, 254, 255, 256, 257],
    "cmd:O+2": [238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249],
    "cmd:1+4": [285, 286, 287, 289, 290, 292],
    "cmd:f+2": [134, 135, 136, 137, 138],
    "cmd:d+1": [71, 68, 69, 70],
    "cmd:qcf+1": [293, 294, 295, 296, 298, 300, 302, 304, 305, 306, 307],
    "cmd:WS+2": [195, 196, 197, 198, 199],
    "cmd:O+1": [216, 217, 218, 219],
}


FRAME_RATES = {
    "idle": 6.5,
    "walkForward": 10.5,
    "walkBack": 9,
    "sprint": 12,
    "backHop": 10,
    "sidestepLeft": 10,
    "sidestepRight": 10,
    "jump": 8,
    "crouch": 5,
    "crouchBlock": 6,
    "block": 6,
    "chargeKi": 8,
    "win": 7,
    "lose": 5,
}


def load_importer():
    sys.path.insert(0, str(ROOT / "scripts"))
    module_path = ROOT / "scripts" / "batch-import-kore-characters.py"
    spec = importlib.util.spec_from_file_location("batch_import_kore_characters", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def frame_path(index: int) -> str:
    return f"/characters/{CHARACTER_ID}/frames/frame-{index:03d}.png"


def repair_source_alpha(character_dir: Path, source: Path) -> int:
    """Restore source-authored RGBA without changing Killua's manifest bindings."""
    metadata_path = character_dir / "frames" / "frames.json"
    metadata = json.loads(metadata_path.read_text())
    source_image = Image.open(source).convert("RGBA")
    repaired = 0
    for entry in metadata.get("frames", []):
        box = entry.get("box")
        if not isinstance(box, list) or len(box) != 4:
            continue
        index = int(entry["index"])
        frame_file = character_dir / "frames" / f"frame-{index:03d}.png"
        restored = source_image.crop(tuple(int(value) for value in box))
        current = Image.open(frame_file).convert("RGBA")
        if current.size == restored.size and current.tobytes() == restored.tobytes():
            continue
        restored.save(frame_file)
        entry["width"], entry["height"] = restored.size
        repaired += 1
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
    shutil.copyfile(source, character_dir / "animation-sheet.png")
    return repaired


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--repo", type=Path, default=ROOT)
    parser.add_argument(
        "--repair-alpha-only",
        action="store_true",
        help="Restore source RGBA frames without replacing animation bindings.",
    )
    args = parser.parse_args()

    repo = args.repo.resolve()
    source = args.source.expanduser().resolve()
    character_dir = repo / "public" / "characters" / CHARACTER_ID
    manifest_path = character_dir / "character.json"
    if not source.is_file():
        raise FileNotFoundError(source)
    if not manifest_path.is_file():
        raise FileNotFoundError(manifest_path)

    if args.repair_alpha_only:
        repaired = repair_source_alpha(character_dir, source)
        print(json.dumps({
            "character": CHARACTER_ID,
            "source": str(source),
            "repairedFrames": repaired,
            "preservedManifest": True,
        }, indent=2))
        return

    importer = load_importer()
    image = importer.load_source_image(source)
    entries, excluded = importer.filtered_projection_boxes(image, CHARACTER_ID)
    if len(entries) != 308:
        raise RuntimeError(f"Expected 308 detected regions, found {len(entries)}")
    backgrounds = importer.dominant_border_backgrounds(image, importer.sample_backgrounds(image))
    source_has_transparency = (
        "A" in image.getbands()
        and image.getchannel("A").getextrema()[0] < 255
    )

    manifest = json.loads(manifest_path.read_text())
    frames_dir = character_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    for stale in frames_dir.glob("frame-*.png"):
        stale.unlink()

    frames: list[dict[str, object]] = []
    crops = []
    for index, entry in enumerate(entries):
        box = tuple(int(value) for value in entry["box"])
        if source_has_transparency:
            crop = image.crop(box).convert("RGBA")
        else:
            crop = (
                importer.transparent_cell_crop(image, box)
                if entry.get("source") == "teal-cell"
                else importer.transparent_crop(image, box, backgrounds)
            )
        crop.save(frames_dir / f"frame-{index:03d}.png")
        crops.append(crop)
        frames.append({
            "index": index,
            "path": frame_path(index),
            "sheetId": "main",
            "sheetPath": f"/characters/{CHARACTER_ID}/animation-sheet.png",
            "sourceName": source.name,
            "box": list(box),
            "width": crop.width,
            "height": crop.height,
            "row": int(entry["row"]),
        })

    shutil.copyfile(source, character_dir / "animation-sheet.png")
    importer.make_face_card(crops[184]).save(character_dir / "face-card.png")
    frames_json = {
        "source": source.name,
        "count": len(frames),
        "excluded": [
            {
                "sourceName": source.name,
                "box": list(entry["box"]),
                "row": int(entry["row"]),
                "reason": entry.get("excludeReason", "excluded"),
            }
            for entry in excluded
        ],
        "sheets": [{
            "id": "main",
            "name": "Main Sheet",
            "path": f"/characters/{CHARACTER_ID}/animation-sheet.png",
            "frameStart": 0,
            "frameCount": len(frames),
        }],
        "frames": frames,
    }
    (frames_dir / "frames.json").write_text(json.dumps(frames_json, indent=2) + "\n")

    animation_frames = {
        key: [frame_path(index) for index in indexes]
        for key, indexes in ANIMATION_INDEXES.items()
    }
    missing_keys = set(manifest.get("animationFrames", {})) - set(animation_frames)
    if missing_keys:
        raise RuntimeError(f"Missing replacement bindings: {sorted(missing_keys)}")
    manifest["animationFrames"] = animation_frames
    manifest["spriteFrameCount"] = len(frames)
    manifest["spriteSheetPath"] = f"/characters/{CHARACTER_ID}/animation-sheet.png"
    manifest["spriteSheets"] = frames_json["sheets"]
    manifest["animationFrameScales"] = {}
    rates = dict(manifest.get("animationFrameRates", {}))
    rates.update(FRAME_RATES)
    manifest["animationFrameRates"] = {key: rates.get(key, 8) for key in animation_frames}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    voxels_dir = character_dir / "voxels-hd"
    if voxels_dir.exists():
        shutil.rmtree(voxels_dir)
    voxels_dir.mkdir(parents=True, exist_ok=True)

    print(json.dumps({
        "character": CHARACTER_ID,
        "source": str(source),
        "frames": len(frames),
        "animations": len(animation_frames),
        "preservedSounds": len(list((character_dir / "sounds").rglob("*.*"))),
    }, indent=2))


if __name__ == "__main__":
    main()
