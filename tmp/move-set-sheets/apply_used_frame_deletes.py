#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from argparse import ArgumentParser
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_move_set_sheets import REPO, iter_characters  # noqa: E402

REPORT = SCRIPT_DIR / "applied-used-frame-deletes.json"


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--state", type=Path, default=SCRIPT_DIR / "used-delete-state.json")
    args = parser.parse_args()

    state = json.loads(args.state.read_text(encoding="utf-8"))
    characters = {character["id"]: character for character in iter_characters()}
    applied = []
    skipped = []

    by_character: dict[str, list[tuple[str, dict[str, Any]]]] = {}
    for move_id, item in state.items():
        if not isinstance(item, dict) or not item.get("deleteFrames"):
            continue
        character_id, move_key = parse_move_id(move_id)
        if not character_id or not move_key:
            skipped.append({"moveId": move_id, "reason": "invalid move id"})
            continue
        by_character.setdefault(character_id, []).append((move_key, item))

    for character_id, items in sorted(by_character.items()):
        character = characters.get(character_id)
        if not character:
            skipped.extend({"character": character_id, "moveKey": key, "reason": "character missing"} for key, _ in items)
            continue
        manifest = character["manifest"]
        animation_frames = manifest.setdefault("animationFrames", {})
        changed = False
        for move_key, item in items:
            frames = animation_frames.get(move_key)
            if not isinstance(frames, list) or not frames:
                skipped.append({"character": character_id, "moveKey": move_key, "reason": "move has no frames"})
                continue
            delete_numbers = sorted({int(number) for number in item.get("deleteFrames", [])})
            delete_set = set(delete_numbers)
            before_numbers = [frame_number(frame) for frame in frames]
            kept = [frame for frame in frames if frame_number(frame) not in delete_set]
            removed = [number for number in before_numbers if number in delete_set]
            if not removed:
                skipped.append({"character": character_id, "moveKey": move_key, "deleteFrames": delete_numbers, "reason": "no matching frames"})
                continue
            if not kept:
                skipped.append(
                    {
                        "character": character_id,
                        "moveKey": move_key,
                        "deleteFrames": delete_numbers,
                        "reason": "would remove every frame from move",
                    }
                )
                continue
            animation_frames[move_key] = kept
            applied.append(
                {
                    "character": character_id,
                    "moveKey": move_key,
                    "deleteFrames": delete_numbers,
                    "removedFrames": sorted(set(removed)),
                    "keptFrames": [frame_number(frame) for frame in kept],
                    "notes": item.get("notes", ""),
                }
            )
            changed = True
        if changed:
            character["manifestPath"].write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    REPORT.write_text(
        json.dumps({"state": str(args.state), "applied": applied, "skipped": skipped}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "applied": len(applied), "skipped": len(skipped), "report": str(REPORT)}, indent=2))


def parse_move_id(move_id: str) -> tuple[str | None, str | None]:
    if "::" not in move_id:
        return None, None
    character_id, move_key = move_id.split("::", 1)
    return character_id, move_key


def frame_number(value: str) -> int | None:
    match = re.search(r"frame-(\d+)", str(value))
    return int(match.group(1)) if match else None


if __name__ == "__main__":
    main()
