#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from argparse import ArgumentParser
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_move_set_sheets import REPO, iter_characters  # noqa: E402
from generate_unused_range_review import candidate_slots, unused_ranges  # noqa: E402

STORAGE_KEY = "kore-unused-range-review-v1"
SNAPSHOT = SCRIPT_DIR / "applied-unused-range-review.json"


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("--state", type=Path, help="Review localStorage JSON state exported from the browser.")
    args = parser.parse_args()

    if args.state:
        state = json.loads(args.state.read_text(encoding="utf-8"))
        source = args.state
    else:
        state, source = find_saved_state()
    if not state:
        raise SystemExit("No saved unused-range review state found.")

    selections, skipped = collect_selections(state)
    applied, skipped_apply = apply_selections(selections)
    skipped.extend(skipped_apply)

    SNAPSHOT.write_text(
        json.dumps(
            {
                "storageSource": str(source),
                "savedCheckedCards": sum(1 for item in state.values() if isinstance(item, dict) and item.get("implement")),
                "applied": applied,
                "skipped": skipped,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "ok": True,
                "storageSource": str(source),
                "applied": len(applied),
                "skipped": len(skipped),
                "snapshot": str(SNAPSHOT),
            },
            indent=2,
        )
    )


def find_saved_state() -> tuple[dict[str, Any], Path | None]:
    roots = [
        Path.home() / "Library/Application Support/Codex/Default/Local Storage/leveldb",
        Path.home() / "Library/Application Support/Codex/Default/Partitions/codex-browser-app/Local Storage/leveldb",
        Path.home() / "Library/Application Support/Codex/Local Storage/leveldb",
        Path.home() / "Library/Application Support/Codex/Partitions/codex-browser-app/Local Storage/leveldb",
    ]
    candidates: list[tuple[float, int, int, Path, dict[str, Any]]] = []
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.glob("*")):
            if not path.is_file():
                continue
            try:
                data = path.read_bytes()
                mtime = path.stat().st_mtime
            except OSError:
                continue
            for text in decode_variants(data):
                for offset, obj in extract_json_objects(text, STORAGE_KEY):
                    checked = sum(1 for item in obj.values() if isinstance(item, dict) and item.get("implement"))
                    if checked:
                        candidates.append((mtime, offset, checked, path, obj))
            for offset, obj in extract_from_strings(path, STORAGE_KEY):
                checked = sum(1 for item in obj.values() if isinstance(item, dict) and item.get("implement"))
                if checked:
                    candidates.append((mtime, offset, checked, path, obj))
    if not candidates:
        return {}, None
    candidates.sort(key=lambda item: (item[0], item[1], item[2]))
    _, _, _, path, obj = candidates[-1]
    return obj, path


def decode_variants(data: bytes) -> list[str]:
    variants = []
    for encoding in ("utf-8", "utf-16le"):
        try:
            variants.append(data.decode(encoding, "ignore"))
        except UnicodeDecodeError:
            pass
    return variants


def extract_from_strings(path: Path, marker: str) -> list[tuple[int, dict[str, Any]]]:
    try:
        result = subprocess.run(["strings", "-a", str(path)], check=False, capture_output=True, text=True)
    except OSError:
        return []
    if result.returncode not in (0, 1):
        return []
    lines = result.stdout.splitlines()
    found = []
    for index, line in enumerate(lines):
        texts = []
        if marker in line:
            texts.append(line[line.find(marker) :])
            if index + 1 < len(lines):
                texts.append(lines[index + 1])
            stitched = []
            for next_line in lines[index + 1 :]:
                if next_line.startswith("META:") or marker in next_line:
                    break
                stitched.append(next_line)
            if stitched:
                texts.append("".join(stitched))
        for text in texts:
            start = text.find("{")
            if start == -1:
                continue
            raw = balanced_json_at(text, start)
            if raw:
                try:
                    obj = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict):
                    found.append((index, obj))
    return found


def extract_json_objects(text: str, marker: str) -> list[tuple[int, dict[str, Any]]]:
    found = []
    pos = 0
    while True:
        marker_at = text.find(marker, pos)
        if marker_at == -1:
            break
        start = text.find("{", marker_at)
        if start == -1:
            pos = marker_at + 1
            continue
        raw = balanced_json_at(text, start)
        if raw:
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                obj = None
            if isinstance(obj, dict):
                found.append((marker_at, obj))
        pos = marker_at + 1
    return found


def balanced_json_at(text: str, start: int) -> str | None:
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return None


def collect_selections(state: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    characters = iter_characters()
    selections = []
    skipped = []

    for character in characters:
        ranges = unused_ranges(character)
        candidates = candidate_slots(character)
        available_targets = [candidate["key"] for candidate in candidates]
        available_target_set = set(available_targets)
        used_targets = set()
        pending: list[dict[str, Any]] = []
        for index, range_item in enumerate(ranges):
            target = candidates[index] if index < len(candidates) else None
            saved = state.get(range_item["id"])
            source = "exact"
            if not isinstance(saved, dict):
                saved = legacy_state_for(state, character["id"], range_item, target)
                source = "legacy"
            if not isinstance(saved, dict) or not saved.get("implement"):
                continue

            removed = sorted(
                {
                    int(number)
                    for number in saved.get("removedFrames", [])
                    if range_item["start"] <= int(number) <= range_item["end"]
                }
            )
            removed_set = set(removed)
            final_frames = [frame["number"] for frame in range_item["frames"] if frame["number"] not in removed_set]
            selected_target = str(saved.get("target") or (target or {}).get("key") or "")
            if selected_target not in available_target_set:
                selected_target = ""
            pending.append(
                {
                    "character": character["id"],
                    "rangeId": range_item["id"],
                    "start": range_item["start"],
                    "end": range_item["end"],
                    "target": selected_target,
                    "frames": [frame["number"] for frame in range_item["frames"]],
                    "removedFrames": removed,
                    "finalFrames": final_frames,
                    "source": source,
                    "notes": saved.get("notes", ""),
                }
            )

        for payload in pending:
            if not payload["finalFrames"]:
                skipped.append({**payload, "reason": "all frames removed"})
                continue
            if payload["target"] and payload["target"] not in used_targets:
                used_targets.add(payload["target"])
                selections.append(payload)
                continue
            if payload["target"] in used_targets:
                payload = {**payload, "target": ""}

            allocated = next((target for target in available_targets if target not in used_targets), "")
            payload = {**payload, "target": allocated, "targetAllocated": bool(allocated)}
            if allocated:
                used_targets.add(allocated)
                selections.append(payload)
                continue

            skipped.append({**payload, "reason": "no empty or duplicate target slot available"})

    return selections, skipped


def legacy_state_for(
    state: dict[str, Any],
    character_id: str,
    range_item: dict[str, Any],
    target: dict[str, Any] | None,
) -> dict[str, Any] | None:
    for legacy_id, legacy in state.items():
        if not isinstance(legacy, dict):
            continue
        parsed = parse_range_id(legacy_id)
        if not parsed or parsed["character"] != character_id:
            continue
        if parsed["start"] > range_item["start"] or parsed["end"] < range_item["end"]:
            continue
        return {
            "implement": bool(legacy.get("implement")),
            "target": legacy.get("target") or (target or {}).get("key") or "",
            "notes": legacy.get("notes", ""),
            "removedFrames": [
                int(number)
                for number in legacy.get("removedFrames", [])
                if range_item["start"] <= int(number) <= range_item["end"]
            ],
        }
    return None


def parse_range_id(value: str) -> dict[str, Any] | None:
    match = re.match(r"^(.+):(\d+)-(\d+)$", str(value))
    if not match:
        return None
    return {"character": match.group(1), "start": int(match.group(2)), "end": int(match.group(3))}


def apply_selections(selections: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_character: dict[str, list[dict[str, Any]]] = {}
    for selection in selections:
        by_character.setdefault(selection["character"], []).append(selection)

    applied = []
    skipped = []
    for character_id, items in sorted(by_character.items()):
        manifest_path = REPO / "public" / "characters" / character_id / "character.json"
        if not manifest_path.exists():
            skipped.extend({**item, "reason": "manifest missing"} for item in items)
            continue
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        animation_frames = manifest.setdefault("animationFrames", {})
        animation_rates = manifest.setdefault("animationFrameRates", {})
        move_overrides = manifest.get("moveOverrides") or {}
        used_targets = set()
        changed = False

        for item in items:
            target = item["target"]
            if target in used_targets:
                skipped.append({**item, "reason": "target already filled by another selected range"})
                continue
            if target not in move_overrides:
                skipped.append({**item, "reason": "target slot not found in moveOverrides"})
                continue
            used_targets.add(target)
            animation_frames[target] = [
                f"/characters/{character_id}/frames/frame-{number:03d}.png" for number in item["finalFrames"]
            ]
            animation_rates.setdefault(target, 9)
            applied.append(item)
            changed = True

        if changed:
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    return applied, skipped


if __name__ == "__main__":
    main()
