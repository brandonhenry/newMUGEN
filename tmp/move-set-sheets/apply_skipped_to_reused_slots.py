#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_move_set_sheets import REPO, iter_characters  # noqa: E402
from generate_unused_range_review import ELIGIBLE_BASE_KEYS  # noqa: E402

INPUT = SCRIPT_DIR / "applied-unused-range-review.json"
OUTPUT = SCRIPT_DIR / "reused-slot-fill-report.json"


def main() -> None:
    source = json.loads(INPUT.read_text(encoding="utf-8"))
    skipped = [
        item
        for item in source.get("skipped", [])
        if item.get("reason") == "no empty or duplicate target slot available" and item.get("finalFrames")
    ]
    skipped_by_character: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in skipped:
        skipped_by_character[item["character"]].append(item)

    characters = {character["id"]: character for character in iter_characters()}
    applied = []
    still_skipped = []
    for character_id, items in sorted(skipped_by_character.items()):
        character = characters.get(character_id)
        if not character:
            still_skipped.extend({**item, "reason": "manifest missing"} for item in items)
            continue
        manifest = character["manifest"]
        manifest_path = character["manifestPath"]
        reused_slots = find_reused_frame_slots(manifest)
        changed = False

        for item, slot in zip(items, reused_slots):
            manifest.setdefault("animationFrames", {})[slot] = [
                f"/characters/{character_id}/frames/frame-{number:03d}" + ".png"
                for number in item["finalFrames"]
            ]
            manifest.setdefault("animationFrameRates", {}).setdefault(slot, 9)
            applied.append({**item, "target": slot, "targetReason": "slot had reused individual frame numbers"})
            changed = True

        for item in items[len(reused_slots) :]:
            still_skipped.append({**item, "reason": "no reused-frame slot left"})

        if changed:
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    OUTPUT.write_text(
        json.dumps(
            {
                "source": str(INPUT),
                "applied": applied,
                "stillSkipped": still_skipped,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "applied": len(applied), "stillSkipped": len(still_skipped), "report": str(OUTPUT)}, indent=2))


def find_reused_frame_slots(manifest: dict[str, Any]) -> list[str]:
    animation_frames = manifest.get("animationFrames") or {}
    move_overrides = manifest.get("moveOverrides") or {}
    eligible = sorted(key for key in move_overrides if key in ELIGIBLE_BASE_KEYS or key.startswith("cmd:"))
    frame_users: dict[int, set[str]] = defaultdict(set)
    slot_reuse_count: dict[str, int] = defaultdict(int)

    for key in eligible:
        for frame in animation_frames.get(key) or []:
            number = frame_number(frame)
            if number is not None:
                frame_users[number].add(key)

    for users in frame_users.values():
        if len(users) < 2:
            continue
        for key in users:
            slot_reuse_count[key] += 1

    return sorted(slot_reuse_count, key=lambda key: (-slot_reuse_count[key], key))


def frame_number(value: str) -> int | None:
    match = re.search(r"frame-(\d+)", str(value))
    return int(match.group(1)) if match else None


if __name__ == "__main__":
    main()
