#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


FRAME_RE = re.compile(r"frame-(\d+)\.png")
BASE_BUTTONS = {"jableft", "jabright", "kickleft", "kickright"}


SPLITS: list[dict[str, Any]] = [
    {
        "id": "kazuki-spear-slash",
        "character": "kazuki-muto",
        "sourceFrame": 288,
        "reason": "collapsed 2x3 spear slash grid; split into six readable attack cells",
        "boxes": [
            [0, 0, 76, 49],
            [76, 0, 153, 49],
            [153, 0, 230, 49],
            [0, 49, 76, 99],
            [76, 49, 153, 99],
            [153, 49, 230, 99],
        ],
    },
]


ASSIGNMENTS: list[dict[str, Any]] = [
    {"character": "monkey-d-luffy", "key": "cmd:f+1", "frames": [118, 120, 122, 124, 126, 128, 130, 131, 133, 135], "firstActive": 1, "lastActive": 7, "reason": "clear stretching punch rush; starts as hand attack"},
    {"character": "eve", "key": "cmd:qcf+4", "frames": list(range(193, 204)), "firstActive": 1, "lastActive": 9, "jumpBeforeMove": True, "reason": "clear airborne projectile/special sequence"},
    {"character": "majin-buu", "key": "cmd:qcf+4", "frames": list(range(179, 193)), "firstActive": 1, "lastActive": 11, "reason": "clear long stretching special attack"},
    {"character": "train-heartnet", "key": "cmd:qcf+4", "frames": list(range(183, 194)), "firstActive": 3, "lastActive": 9, "reason": "clear gun/projectile attack"},
    {"character": "piccolo", "key": "cmd:f+1", "frames": list(range(151, 162)), "firstActive": 2, "lastActive": 8, "reason": "clear forward rush attack"},
    {"character": "franky", "key": "cmd:f+1", "frames": list(range(233, 244)), "firstActive": 2, "lastActive": 8, "reason": "clear forward body rush/strike"},
    {"character": "yoh-asakura-power-sword", "key": "cmd:qcf+4", "frames": list(range(152, 163)), "firstActive": 1, "lastActive": 8, "reason": "clear oversized sword special slash"},
    {"character": "ichigo-kurosaki", "key": "cmd:qcf+4", "frames": list(range(160, 171)), "firstActive": 3, "lastActive": 10, "jumpBeforeMove": True, "reason": "clear aerial sword special"},
    {"character": "bobobo-bo-bo-bobo", "key": "cmd:qcf+4", "frames": list(range(393, 404)), "firstActive": 1, "lastActive": 9, "reason": "clear large special/beam attack"},
    {"character": "vegeta-super-saiyan", "key": "cmd:qcf+4", "frames": list(range(174, 185)), "firstActive": 3, "lastActive": 9, "reason": "clear energy attack wind-up/release"},
    {"character": "arale-norimaki", "key": "cmd:qcf+4", "frames": list(range(173, 184)), "firstActive": 2, "lastActive": 8, "reason": "clear sliding/extended special attack"},
    {"character": "goku-super-saiyan", "key": "cmd:qcf+4", "frames": list(range(181, 191)), "firstActive": 2, "lastActive": 8, "reason": "clear ki/special attack"},
    {"character": "ryotsu-kankichi", "key": "cmd:f+1", "frames": [166] + list(range(168, 186)), "firstActive": 2, "lastActive": 17, "reason": "clear unused attack/pose sequence; collapsed motorcycle strip was left unused because it does not split cleanly"},
    {"character": "naruto-uzumaki-nine-tails-kyubi", "key": "cmd:qcf+4", "frames": list(range(140, 150)), "firstActive": 1, "lastActive": 8, "reason": "clear red chakra rush/special"},
    {"character": "anna-kyoyama", "key": "cmd:f+1", "frames": list(range(100, 110)), "firstActive": 2, "lastActive": 8, "reason": "clear melee rush sequence"},
    {"character": "dr-mashirito", "key": "cmd:qcf+4", "frames": list(range(169, 179)), "firstActive": 1, "lastActive": 8, "reason": "clear vehicle/special attack"},
    {"character": "goku", "key": "cmd:f+1", "frames": list(range(150, 161)), "firstActive": 1, "lastActive": 8, "reason": "clear melee rush sequence"},
    {"character": "vegito", "key": "cmd:f+1", "frames": list(range(166, 176)), "firstActive": 2, "lastActive": 8, "reason": "clear forward rush attack"},
    {"character": "majin-buu", "key": "cmd:O+2", "frames": list(range(146, 157)), "firstActive": 1, "lastActive": 9, "reason": "second clear stretching special attack"},
    {"character": "yoh-asakura", "key": "cmd:qcf+4", "frames": list(range(181, 191)), "firstActive": 1, "lastActive": 8, "reason": "clear spirit/sword special"},
    {"character": "killua-zoldyck", "key": "cmd:f+1", "frames": list(range(221, 231)), "firstActive": 2, "lastActive": 8, "reason": "clear forward claw/electric rush"},
    {"character": "kazuki-muto", "key": "cmd:qcf+4", "split": "kazuki-spear-slash", "firstActive": 1, "lastActive": 5, "reason": "split spear slash special"},
    {"character": "gon-freecss", "key": "cmd:f+1", "frames": list(range(192, 202)), "firstActive": 1, "lastActive": 8, "reason": "clear forward punch rush"},
    {"character": "renji-abarai", "key": "cmd:qcf+4", "frames": list(range(140, 150)), "firstActive": 1, "lastActive": 8, "reason": "clear extending sword special"},
    {"character": "lenalee-lee", "key": "cmd:WS+4", "frames": list(range(235, 245)), "firstActive": 2, "lastActive": 8, "jumpBeforeMove": True, "reason": "clear airborne kick/rising sequence"},
    {"character": "kakashi-hatake", "key": "cmd:f+1", "frames": list(range(318, 328)), "firstActive": 2, "lastActive": 8, "reason": "clear forward rush/strike"},
    {"character": "kenshiro", "key": "cmd:f+1", "frames": list(range(170, 180)), "firstActive": 2, "lastActive": 8, "reason": "clear forward strike sequence"},
    {"character": "jaguar-junichi", "key": "cmd:qcf+4", "frames": list(range(184, 194)), "firstActive": 2, "lastActive": 8, "reason": "clear special attack sequence"},
    {"character": "neuro-nogami", "key": "cmd:f+1", "frames": list(range(180, 189)), "firstActive": 2, "lastActive": 7, "reason": "clear transformation/strike attack sequence"},
    {"character": "monkey-d-luffy-2nd-gear", "key": "cmd:f+1", "frames": list(range(190, 200)), "firstActive": 1, "lastActive": 8, "reason": "clear rapid punch rush"},
    {"character": "kenshin-himura", "key": "cmd:f+1", "frames": list(range(363, 373)), "firstActive": 1, "lastActive": 8, "reason": "clear sword rush sequence"},
    {"character": "momotaro-tsurugi", "key": "cmd:f+1", "frames": list(range(196, 206)), "firstActive": 2, "lastActive": 8, "reason": "clear forward weapon rush"},
    {"character": "gotenks", "key": "cmd:qcf+4", "frames": list(range(200, 209)), "firstActive": 2, "lastActive": 7, "reason": "clear special/rush attack"},
    {"character": "kinnikuman", "key": "cmd:f+1", "frames": list(range(271, 281)), "firstActive": 1, "lastActive": 8, "reason": "clear wrestling rush"},
    {"character": "heihachi-edajima", "key": "cmd:f+1", "frames": list(range(140, 150)), "firstActive": 1, "lastActive": 8, "reason": "clear forward strike/weapon sequence"},
    {"character": "allen-walker", "key": "cmd:qcf+4", "frames": list(range(80, 90)), "firstActive": 1, "lastActive": 8, "reason": "clear weapon slash/special"},
    {"character": "allen-walker", "key": "cmd:f+1", "frames": list(range(251, 261)), "firstActive": 2, "lastActive": 8, "reason": "clear follow-up slash rush"},
    {"character": "bobobo-bo-bo-bobo", "key": "cmd:f+1", "frames": list(range(313, 323)), "firstActive": 1, "lastActive": 8, "reason": "clear forward special rush"},
    {"character": "ichigo-kurosaki", "key": "cmd:f+1", "frames": list(range(409, 419)), "firstActive": 1, "lastActive": 8, "reason": "clear forward sword dash"},
    {"character": "kenshin-himura", "key": "cmd:qcf+4", "frames": list(range(170, 180)), "firstActive": 1, "lastActive": 8, "reason": "clear blue-effect sword special"},
    {"character": "naruto-uzumaki-nine-tails-kyubi", "key": "cmd:f+1", "frames": list(range(130, 140)), "firstActive": 1, "lastActive": 8, "reason": "clear red chakra rush"},
    {"character": "anna-kyoyama", "key": "cmd:qcf+4", "frames": list(range(157, 167)), "firstActive": 1, "lastActive": 8, "reason": "clear projectile/wave attack"},
    {"character": "dr-mashirito", "key": "cmd:f+1", "frames": list(range(223, 233)), "firstActive": 1, "lastActive": 8, "reason": "clear robot rush attack"},
    {"character": "bobobo-bo-bo-bobo", "key": "cmd:O+2", "frames": list(range(161, 171)), "firstActive": 1, "lastActive": 8, "reason": "clear rolling special attack"},
    {"character": "ichigo-kurosaki", "key": "cmd:d/f+2", "frames": list(range(311, 321)), "firstActive": 1, "lastActive": 8, "reason": "clear upward/large sword launcher-style slash"},
    {"character": "kazuki-muto", "key": "cmd:f+1", "frames": list(range(120, 130)), "firstActive": 1, "lastActive": 8, "reason": "clear spear slash rush"},
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    repo = args.repo
    out = repo / "tmp" / "frame-usage-audit" / "attack-fill-pass"
    sheets_dir = out / "sheets"
    out.mkdir(parents=True, exist_ok=True)
    sheets_dir.mkdir(parents=True, exist_ok=True)

    split_outputs: dict[str, list[int]] = {}
    filled: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    protected_before = snapshot_nonempty_animations(repo)

    for split in SPLITS:
        result = apply_split(repo, split, args.write)
        split_outputs[split["id"]] = result["indices"]
        skipped.extend(result["skipped"])

    touched: set[str] = set()
    for assignment in ASSIGNMENTS:
        result = apply_assignment(repo, assignment, split_outputs, args.write)
        if result.get("status") == "filled":
            filled.append(result)
            touched.add(result["character"])
            render_assignment_sheet(repo, sheets_dir, result)
        else:
            skipped.append(result)

    protected_after = snapshot_nonempty_animations(repo)
    violations = []
    for (character, key), before in protected_before.items():
        after = protected_after.get((character, key))
        if after != before:
            violations.append({"character": character, "key": key, "reason": "previous non-empty animation changed"})

    remaining = collect_remaining_empty_direct_slots(repo)
    unused = collect_unused_ranges(repo)

    write_csv(out / "filled-attacks.csv", filled)
    write_csv(out / "skipped-assignments.csv", skipped)
    write_csv(out / "remaining-empty-direct-attack-slots.csv", remaining)
    write_csv(out / "remaining-unused-ranges.csv", unused)
    write_json(out / "summary.json", {
        "write": args.write,
        "filled": len(filled),
        "skipped": len(skipped),
        "protectedAnimationViolations": len(violations),
        "remainingEmptyDirectAttackSlots": len(remaining),
        "remainingUnusedRanges": len(unused),
        "touchedCharacters": sorted(touched),
    })
    write_markdown(out / "ATTACK_FILL_REPORT.md", filled, skipped, remaining, unused, violations)

    if violations:
        raise SystemExit(f"Refusing to finish: {len(violations)} protected animation changes detected")
    print(json.dumps(json.loads((out / "summary.json").read_text()), indent=2))


def direct_attack_key(key: str) -> bool:
    return key in BASE_BUTTONS or key.startswith("cmd:")


def frame_index(src: str | None) -> int | None:
    match = FRAME_RE.search(src or "")
    return int(match.group(1)) if match else None


def public_frame(character: str, index: int) -> str:
    return f"/characters/{character}/frames/frame-{index:03d}.png"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def snapshot_nonempty_animations(repo: Path) -> dict[tuple[str, str], list[str]]:
    snapshot: dict[tuple[str, str], list[str]] = {}
    for manifest_path in (repo / "public" / "characters").glob("*/character.json"):
        character = manifest_path.parent.name
        manifest = read_json(manifest_path)
        for key, sequence in (manifest.get("animationFrames") or {}).items():
            if isinstance(sequence, list) and sequence:
                snapshot[(character, key)] = list(sequence)
    return snapshot


def apply_split(repo: Path, split: dict[str, Any], write: bool) -> dict[str, Any]:
    character = split["character"]
    character_dir = repo / "public" / "characters" / character
    frames_json_path = character_dir / "frames" / "frames.json"
    frames_data = read_json(frames_json_path)
    frames = frames_data.get("frames") or []
    source_index = int(split["sourceFrame"])
    source_meta = next((frame for frame in frames if int(frame.get("index", -1)) == source_index), None)
    if not source_meta:
        return {"indices": [], "skipped": [{"character": character, "key": split["id"], "status": "skipped", "reason": "missing split source metadata"}]}
    source_path = repo / "public" / source_meta["path"].lstrip("/")
    if not source_path.exists():
        return {"indices": [], "skipped": [{"character": character, "key": split["id"], "status": "skipped", "reason": "missing split source png"}]}

    existing = [
        frame for frame in frames
        if isinstance(frame, dict)
        and frame.get("sourceSplit") == split["id"]
    ]
    if existing:
        return {"indices": [int(frame["index"]) for frame in existing], "skipped": []}

    next_index = max(int(frame["index"]) for frame in frames if "index" in frame) + 1
    image = Image.open(source_path).convert("RGBA")
    new_indices: list[int] = []
    for offset, box in enumerate(split["boxes"]):
        x1, y1, x2, y2 = [int(value) for value in box]
        crop = image.crop((x1, y1, x2, y2))
        bbox = crop.getchannel("A").getbbox()
        if bbox:
            crop = crop.crop(bbox)
            x1 += bbox[0]
            y1 += bbox[1]
            x2 = x1 + crop.width
            y2 = y1 + crop.height
        index = next_index + offset
        frame_path = character_dir / "frames" / f"frame-{index:03d}.png"
        public_path = public_frame(character, index)
        new_indices.append(index)
        if write:
            crop.save(frame_path)
            frames.append({
                "index": index,
                "path": public_path,
                "sourceMode": "split",
                "sourceSplit": split["id"],
                "sourceFrame": source_index,
                "sourcePath": source_meta.get("path"),
                "sourceName": f"{source_meta.get('sourceName', 'frame')} split",
                "sheetId": source_meta.get("sheetId"),
                "sheetPath": source_meta.get("sheetPath"),
                "box": [x1, y1, x2, y2],
                "width": crop.width,
                "height": crop.height,
                "row": source_meta.get("row"),
            })
    if write:
        frames_data["frames"] = frames
        frames_data["count"] = len(frames)
        write_json(frames_json_path, frames_data)
    return {"indices": new_indices, "skipped": []}


def apply_assignment(repo: Path, assignment: dict[str, Any], split_outputs: dict[str, list[int]], write: bool) -> dict[str, Any]:
    character = assignment["character"]
    key = assignment["key"]
    manifest_path = repo / "public" / "characters" / character / "character.json"
    if not manifest_path.exists():
        return row(assignment, "skipped", "missing manifest")
    manifest = read_json(manifest_path)
    animation_frames = manifest.setdefault("animationFrames", {})
    move_overrides = manifest.get("moveOverrides") or {}
    if key not in move_overrides:
        return row(assignment, "skipped", "target key has no moveOverride")
    if not direct_attack_key(key):
        return row(assignment, "skipped", "target key is not a direct attack")
    indices = split_outputs.get(assignment["split"], []) if "split" in assignment else list(assignment["frames"])
    if not indices:
        return row(assignment, "skipped", "no source frames")
    frame_paths = [repo / "public" / public_frame(character, index).lstrip("/") for index in indices]
    missing = [str(path) for path in frame_paths if not path.exists()]
    if missing:
        return row(assignment, "skipped", f"missing frame pngs: {', '.join(missing[:3])}")

    sequence = [public_frame(character, index) for index in indices]
    move = move_overrides[key]
    current_sequence = animation_frames.get(key)
    if isinstance(current_sequence, list) and len(current_sequence) > 0:
        if current_sequence == sequence:
            result = row(assignment, "filled", assignment["reason"])
            result.update({
                "displayName": manifest.get("displayName", character),
                "frameStart": indices[0],
                "frameEnd": indices[-1],
                "frameCount": len(indices),
                "startupFrames": int(move.get("startupFrames", 0) or 0),
                "activeFrames": int(move.get("activeFrames", 0) or 0),
                "recoveryFrames": int(move.get("recoveryFrames", 0) or 0),
                "jumpBeforeMove": bool(move.get("jumpBeforeMove")),
                "endsInCrouch": bool(move.get("endsInCrouch")),
                "sequence": " ".join(sequence),
            })
            return result
        return row(assignment, "skipped", "target already has different animation frames")

    total = int(move.get("startupFrames", 0) or 0) + int(move.get("activeFrames", 0) or 0) + int(move.get("recoveryFrames", 0) or 0)
    if total <= 0:
        total = max(18, len(indices) * 4)
    startup, active, recovery = redistribute_timing(
        total,
        len(indices),
        int(assignment.get("firstActive", max(0, len(indices) // 3))),
        int(assignment.get("lastActive", max(0, len(indices) - 2))),
    )
    if write:
        animation_frames[key] = sequence
        move["startupFrames"] = startup
        move["activeFrames"] = active
        move["recoveryFrames"] = recovery
        if assignment.get("jumpBeforeMove"):
            move["jumpBeforeMove"] = True
        if assignment.get("endsInCrouch"):
            move["endsInCrouch"] = True
        if assignment.get("tracking"):
            move["tracking"] = assignment["tracking"]
        write_json(manifest_path, manifest)

    result = row(assignment, "filled", assignment["reason"])
    result.update({
        "displayName": manifest.get("displayName", character),
        "frameStart": indices[0],
        "frameEnd": indices[-1],
        "frameCount": len(indices),
        "startupFrames": startup,
        "activeFrames": active,
        "recoveryFrames": recovery,
        "jumpBeforeMove": bool(assignment.get("jumpBeforeMove")),
        "endsInCrouch": bool(assignment.get("endsInCrouch")),
        "sequence": " ".join(sequence),
    })
    return result


def redistribute_timing(total: int, sprite_count: int, first_active: int, last_active: int) -> tuple[int, int, int]:
    first_active = max(0, min(first_active, sprite_count - 1))
    last_active = max(first_active, min(last_active, sprite_count - 1))
    startup = math.ceil(first_active * total / sprite_count)
    active_end = math.ceil((last_active + 1) * total / sprite_count)
    active = max(1, active_end - startup)
    recovery = max(1, total - startup - active)
    overflow = startup + active + recovery - total
    if overflow > 0:
        reduce_active = min(overflow, max(0, active - 1))
        active -= reduce_active
        overflow -= reduce_active
    if overflow > 0:
        startup = max(0, startup - overflow)
    return startup, active, recovery


def row(assignment: dict[str, Any], status: str, reason: str) -> dict[str, Any]:
    return {
        "status": status,
        "character": assignment.get("character", ""),
        "key": assignment.get("key", assignment.get("id", "")),
        "source": assignment.get("split", f"{assignment.get('frames', [''])[0]}-{assignment.get('frames', [''])[-1]}" if assignment.get("frames") else ""),
        "reason": reason,
    }


def render_assignment_sheet(repo: Path, out: Path, result: dict[str, Any]) -> None:
    frames = result["sequence"].split()
    thumbs = []
    for src in frames:
        path = repo / "public" / src.lstrip("/")
        image = Image.open(path).convert("RGBA")
        bbox = image.getchannel("A").getbbox() or (0, 0, image.width, image.height)
        crop = image.crop(bbox)
        scale = min(1.0, 78 / max(1, crop.width), 78 / max(1, crop.height))
        thumbs.append(crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.NEAREST))

    cell_w, cell_h = 98, 122
    cols = min(8, max(1, len(thumbs)))
    rows = math.ceil(len(thumbs) / cols)
    header_h = 42
    sheet = Image.new("RGBA", (cols * cell_w, header_h + rows * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((6, 5), f"{result['displayName']} {result['key']} f{result['frameStart']}-{result['frameEnd']}", fill=(0, 0, 0))
    draw.text((6, 20), f"startup {result['startupFrames']} active {result['activeFrames']} recovery {result['recoveryFrames']}", fill=(0, 0, 0))
    for i, thumb in enumerate(thumbs):
        x = (i % cols) * cell_w
        y = header_h + (i // cols) * cell_h
        floor_y = y + 86
        sheet.alpha_composite(thumb, (x + (cell_w - thumb.width) // 2, floor_y - thumb.height))
        draw.line((x + 8, floor_y, x + cell_w - 8, floor_y), fill=(210, 0, 0), width=2)
        frame_no = frame_index(frames[i]) or 0
        draw.text((x + 8, floor_y + 5), f"f{frame_no}", fill=(0, 0, 0))
    safe = f"{result['character']}__{result['key'].replace(':', '_').replace('/', '-')}.png"
    sheet.save(out / safe)


def collect_remaining_empty_direct_slots(repo: Path) -> list[dict[str, Any]]:
    rows = []
    for manifest_path in sorted((repo / "public" / "characters").glob("*/character.json")):
        character = manifest_path.parent.name
        manifest = read_json(manifest_path)
        frames = manifest.get("animationFrames") or {}
        for key in sorted((manifest.get("moveOverrides") or {})):
            if not direct_attack_key(key):
                continue
            sequence = frames.get(key)
            if not isinstance(sequence, list) or len(sequence) == 0:
                rows.append({"character": character, "displayName": manifest.get("displayName", character), "key": key})
    return rows


def collect_unused_ranges(repo: Path) -> list[dict[str, Any]]:
    rows = []
    for character_dir in sorted((repo / "public" / "characters").glob("*")):
        manifest_path = character_dir / "character.json"
        frames_json_path = character_dir / "frames" / "frames.json"
        if not manifest_path.exists() or not frames_json_path.exists():
            continue
        manifest = read_json(manifest_path)
        frames_data = read_json(frames_json_path)
        meta = {int(frame["index"]): frame for frame in frames_data.get("frames", []) if "index" in frame}
        used = {
            index
            for sequence in (manifest.get("animationFrames") or {}).values()
            if isinstance(sequence, list)
            for index in [*(frame_index(src) for src in sequence)]
            if index is not None
        }
        unused = [index for index in sorted(meta) if index not in used]
        for run in contiguous_runs(unused, meta):
            rows.append({
                "character": character_dir.name,
                "displayName": manifest.get("displayName", character_dir.name),
                "start": run[0],
                "end": run[-1],
                "count": len(run),
                "hidden": any(meta[index].get("hidden") for index in run),
                "pngsExist": all((repo / "public" / str(meta[index].get("path", "")).lstrip("/")).exists() for index in run),
            })
    return rows


def contiguous_runs(indices: list[int], meta: dict[int, dict[str, Any]]) -> list[list[int]]:
    if not indices:
        return []
    runs = []
    current = [indices[0]]
    for index in indices[1:]:
        previous = current[-1]
        if (
            index == previous + 1
            and meta[index].get("row") == meta[previous].get("row")
            and meta[index].get("sheetId") == meta[previous].get("sheetId")
        ):
            current.append(index)
        else:
            runs.append(current)
            current = [index]
    runs.append(current)
    return runs


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields: list[str] = []
    for row_data in rows:
        for key in row_data:
            if key not in fields:
                fields.append(key)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields or ["empty"])
        writer.writeheader()
        for row_data in rows:
            writer.writerow(row_data)


def write_markdown(path: Path, filled: list[dict[str, Any]], skipped: list[dict[str, Any]], remaining: list[dict[str, Any]], unused: list[dict[str, Any]], violations: list[dict[str, Any]]) -> None:
    lines = [
        "# KORE Unused Attack Fill Pass",
        "",
        "## Summary",
        "",
        f"- Filled attacks: {len(filled)}",
        f"- Skipped assignment candidates: {len(skipped)}",
        f"- Protected animation violations: {len(violations)}",
        f"- Remaining empty direct attack slots: {len(remaining)}",
        f"- Remaining unused frame ranges: {len(unused)}",
        "",
        "## Filled Attacks",
        "",
        "| Character | Key | Frames | Timing | Flags | Reason |",
        "| --- | --- | ---: | --- | --- | --- |",
    ]
    for item in filled:
        flags = " ".join(flag for flag in ["jumpBeforeMove", "endsInCrouch"] if item.get(flag)) or ""
        lines.append(
            f"| {item['displayName']} (`{item['character']}`) | `{item['key']}` | {item['frameStart']}-{item['frameEnd']} ({item['frameCount']}) | "
            f"{item['startupFrames']}/{item['activeFrames']}/{item['recoveryFrames']} | {flags} | {item['reason']} |"
        )
    lines.extend([
        "",
        "## Skipped",
        "",
        "| Character | Key | Source | Reason |",
        "| --- | --- | --- | --- |",
    ])
    for item in skipped[:120]:
        lines.append(f"| `{item.get('character', '')}` | `{item.get('key', '')}` | {item.get('source', '')} | {item.get('reason', '')} |")
    lines.extend([
        "",
        "## Remaining Empty Direct Attack Slots",
        "",
        "| Character | Key |",
        "| --- | --- |",
    ])
    for item in remaining[:240]:
        lines.append(f"| {item['displayName']} (`{item['character']}`) | `{item['key']}` |")
    if len(remaining) > 240:
        lines.append(f"| ... | {len(remaining) - 240} more rows in CSV |")
    path.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
