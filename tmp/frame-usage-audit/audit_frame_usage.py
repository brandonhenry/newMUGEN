#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from statistics import mean

from PIL import Image, ImageDraw


NON_ATTACK_KEYS = {
    "idle",
    "walkForward",
    "walkBack",
    "sprint",
    "backflip",
    "sidestepLeft",
    "sidestepRight",
    "jump",
    "crouch",
    "crouchBlock",
    "block",
    "chargeKi",
    "hitLight",
    "hitHeavy",
    "juggle",
    "knockdown",
    "getupStand",
    "getupRollUp",
    "getupRollDown",
    "getupRollBack",
    "win",
    "lose",
    "transform",
}

BASE_ATTACK_KEYS = {"jableft", "jabright", "kickleft", "kickright", "jab", "heavy", "kick", "special"}
FRAME_RE = re.compile(r"frame-(\d+)\.png")


def main() -> None:
    repo = Path.cwd()
    out = repo / "tmp" / "frame-usage-audit"
    out.mkdir(parents=True, exist_ok=True)
    sheets = out / "unused-sheets"
    sheets.mkdir(parents=True, exist_ok=True)

    rows = []
    range_rows = []
    key_rows = []
    empty_key_rows = []
    top_sheet_candidates = []

    for character_dir in sorted((repo / "public" / "characters").iterdir()):
        manifest_path = character_dir / "character.json"
        frames_json_path = character_dir / "frames" / "frames.json"
        if not manifest_path.exists():
            continue
        character = read_json(manifest_path)
        character_id = character_dir.name
        animation_frames = character.get("animationFrames") or {}
        move_overrides = character.get("moveOverrides") or {}

        for key, sequence in sorted(animation_frames.items()):
            frame_indices = [frame_index(src) for src in sequence]
            frame_indices = [index for index in frame_indices if index is not None]
            category = classify_key(key, move_overrides)
            key_rows.append({
                "character": character_id,
                "displayName": character.get("displayName", character_id),
                "animationKey": key,
                "category": category,
                "frameRefs": len(sequence),
                "uniqueFrames": len(set(frame_indices)),
                "firstFrame": min(frame_indices) if frame_indices else "",
                "lastFrame": max(frame_indices) if frame_indices else "",
                "hasMoveOverride": key in move_overrides,
            })
            if len(sequence) == 0:
                empty_key_rows.append({
                    "character": character_id,
                    "displayName": character.get("displayName", character_id),
                    "animationKey": key,
                    "category": category,
                    "hasMoveOverride": key in move_overrides,
                    "reason": "animationFrames key exists but has no frame refs",
                })

        if not frames_json_path.exists():
            rows.append(summary_row(character_id, character, 0, 0, 0, 0, 0, 0, 0, "missing frames.json"))
            continue

        frames_data = read_json(frames_json_path)
        frame_meta = {
            int(frame["index"]): frame
            for frame in frames_data.get("frames", [])
            if isinstance(frame, dict) and "index" in frame
        }
        all_indices = sorted(frame_meta)
        used_by: dict[int, set[str]] = defaultdict(set)
        attack_used = set()
        non_attack_used = set()

        for key, sequence in animation_frames.items():
            category = classify_key(key, move_overrides)
            for src in sequence:
                index = frame_index(src)
                if index is None:
                    continue
                used_by[index].add(key)
                if category == "attack":
                    attack_used.add(index)
                else:
                    non_attack_used.add(index)

        used = set(used_by)
        unused = [index for index in all_indices if index not in used]
        attack_only = attack_used - non_attack_used
        non_attack_only = non_attack_used - attack_used
        shared = attack_used & non_attack_used

        runs = contiguous_runs(unused, frame_meta)
        for run in runs:
            metas = [frame_meta[index] for index in run]
            first = run[0]
            last = run[-1]
            row_values = sorted({meta.get("row", "") for meta in metas})
            sheet_ids = sorted({meta.get("sheetId", "") for meta in metas})
            avg_width = round(mean([number(meta.get("width")) for meta in metas]), 2)
            avg_height = round(mean([number(meta.get("height")) for meta in metas]), 2)
            range_row = {
                "character": character_id,
                "displayName": character.get("displayName", character_id),
                "start": first,
                "end": last,
                "count": len(run),
                "rows": " ".join(map(str, row_values)),
                "sheetIds": " ".join(map(str, sheet_ids)),
                "avgWidth": avg_width,
                "avgHeight": avg_height,
                "preview": "",
            }
            range_rows.append(range_row)
            if len(run) >= 3:
                top_sheet_candidates.append((len(run), character_id, character.get("displayName", character_id), run, range_row))

        rows.append(summary_row(
            character_id,
            character,
            len(all_indices),
            len(used),
            len(unused),
            len(attack_used),
            len(non_attack_used),
            len(attack_only),
            len(shared),
            "",
        ))

    top_sheet_candidates.sort(reverse=True, key=lambda item: item[0])
    for _, character_id, display_name, run, range_row in top_sheet_candidates[:160]:
        preview = render_unused_sheet(repo, sheets, character_id, display_name, run)
        range_row["preview"] = str(preview.relative_to(repo))

    write_csv(out / "character-frame-usage.csv", rows)
    write_csv(out / "unused-frame-ranges.csv", range_rows)
    write_csv(out / "animation-key-usage.csv", key_rows)
    write_csv(out / "empty-animation-keys.csv", empty_key_rows)
    write_markdown(out / "FRAME_USAGE_REPORT.md", rows, range_rows, key_rows, empty_key_rows)
    write_json(out / "frame-usage-summary.json", summarize(rows, range_rows, key_rows, empty_key_rows))
    print(json.dumps(summarize(rows, range_rows, key_rows, empty_key_rows), indent=2))


def classify_key(key: str, move_overrides: dict) -> str:
    if key in NON_ATTACK_KEYS:
        return "non-attack"
    if key in move_overrides or key in BASE_ATTACK_KEYS or key.startswith("cmd:") or key.startswith("neutral:"):
        return "attack"
    return "other"


def contiguous_runs(indices: list[int], frame_meta: dict[int, dict]) -> list[list[int]]:
    if not indices:
        return []
    runs = []
    current = [indices[0]]
    for index in indices[1:]:
        previous = current[-1]
        same_sheet = frame_meta[index].get("sheetId") == frame_meta[previous].get("sheetId")
        same_row = frame_meta[index].get("row") == frame_meta[previous].get("row")
        if index == previous + 1 and same_sheet and same_row:
            current.append(index)
        else:
            runs.append(current)
            current = [index]
    runs.append(current)
    return runs


def render_unused_sheet(repo: Path, sheets: Path, character_id: str, display_name: str, run: list[int]) -> Path:
    frame_paths = [repo / "public" / "characters" / character_id / "frames" / f"frame-{index:03d}.png" for index in run]
    thumbs = []
    for frame_path in frame_paths:
        if not frame_path.exists():
            thumbs.append(None)
            continue
        image = Image.open(frame_path).convert("RGBA")
        bbox = image.getchannel("A").getbbox() or (0, 0, image.width, image.height)
        crop = image.crop(bbox)
        scale = min(1.0, 72 / max(1, crop.width), 72 / max(1, crop.height))
        thumbs.append(crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.NEAREST))

    cell_w, cell_h = 92, 112
    cols = min(8, max(1, len(thumbs)))
    rows = math.ceil(len(thumbs) / cols)
    header_h = 36
    sheet = Image.new("RGBA", (cols * cell_w, header_h + rows * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((6, 5), f"{display_name} unused {run[0]}-{run[-1]} ({len(run)} frames)", fill=(0, 0, 0))
    for i, thumb in enumerate(thumbs):
        x = (i % cols) * cell_w
        y = header_h + (i // cols) * cell_h
        floor_y = y + 78
        if thumb is not None:
            sheet.alpha_composite(thumb, (x + (cell_w - thumb.width) // 2, floor_y - thumb.height))
        else:
            draw.rectangle((x + 22, floor_y - 48, x + cell_w - 22, floor_y - 8), outline=(160, 160, 160))
            draw.text((x + 25, floor_y - 34), "missing", fill=(90, 90, 90))
        draw.line((x + 8, floor_y, x + cell_w - 8, floor_y), fill=(210, 0, 0), width=2)
        draw.text((x + 8, floor_y + 5), f"f{run[i]}", fill=(0, 0, 0))
    out = sheets / f"{character_id}__{run[0]:03d}-{run[-1]:03d}.png"
    sheet.save(out)
    return out


def summary_row(character_id, character, total, used, unused, attack_used, non_attack_used, attack_only, shared, note):
    return {
        "character": character_id,
        "displayName": character.get("displayName", character_id),
        "totalFrames": total,
        "usedFrames": used,
        "unusedFrames": unused,
        "usedPercent": round(used / total * 100, 2) if total else 0,
        "attackUsedFrames": attack_used,
        "nonAttackUsedFrames": non_attack_used,
        "attackOnlyFrames": attack_only,
        "sharedAttackNonAttackFrames": shared,
        "note": note,
    }


def write_markdown(path: Path, rows: list[dict], ranges: list[dict], key_rows: list[dict], empty_keys: list[dict]) -> None:
    top_unused = sorted(rows, key=lambda row: int(row["unusedFrames"]), reverse=True)[:25]
    top_ranges = sorted(ranges, key=lambda row: int(row["count"]), reverse=True)[:40]
    missing_attacks = [row for row in empty_keys if row["category"] == "attack" or row["hasMoveOverride"]]

    lines = [
        "# KORE Frame Usage Audit",
        "",
        "## Summary",
        "",
        f"- Characters audited: {len(rows)}",
        f"- Imported frames: {sum(int(row['totalFrames']) for row in rows)}",
        f"- Unique frames currently used by animations: {sum(int(row['usedFrames']) for row in rows)}",
        f"- Unique frames not referenced by any animation: {sum(int(row['unusedFrames']) for row in rows)}",
        f"- Empty attack/move animation keys: {len(missing_attacks)}",
        "",
        "## Characters With Most Unused Frames",
        "",
        "| Character | Used / Total | Unused | Used % |",
        "| --- | ---: | ---: | ---: |",
    ]
    for row in top_unused:
        lines.append(f"| {row['displayName']} (`{row['character']}`) | {row['usedFrames']} / {row['totalFrames']} | {row['unusedFrames']} | {row['usedPercent']} |")
    lines.extend([
        "",
        "## Largest Unused Contiguous Ranges",
        "",
        "| Character | Range | Count | Source rows | Preview |",
        "| --- | ---: | ---: | --- | --- |",
    ])
    for row in top_ranges:
        preview = row.get("preview") or ""
        preview_link = f"[png]({preview})" if preview else ""
        lines.append(f"| {row['displayName']} (`{row['character']}`) | {row['start']}-{row['end']} | {row['count']} | {row['rows']} | {preview_link} |")
    lines.extend([
        "",
        "## Empty Attack / Move Animation Keys",
        "",
        "| Character | Key | Has move override |",
        "| --- | --- | ---: |",
    ])
    for row in missing_attacks[:200]:
        lines.append(f"| {row['displayName']} (`{row['character']}`) | `{row['animationKey']}` | {row['hasMoveOverride']} |")
    if len(missing_attacks) > 200:
        lines.append(f"| ... | {len(missing_attacks) - 200} more rows in `empty-animation-keys.csv` | ... |")
    path.write_text("\n".join(lines) + "\n")


def summarize(rows, ranges, key_rows, empty_keys):
    return {
        "characters": len(rows),
        "totalFrames": sum(int(row["totalFrames"]) for row in rows),
        "usedFrames": sum(int(row["usedFrames"]) for row in rows),
        "unusedFrames": sum(int(row["unusedFrames"]) for row in rows),
        "attackUsedFrames": sum(int(row["attackUsedFrames"]) for row in rows),
        "unusedRanges": len(ranges),
        "unusedRangesWithPreviewSheets": sum(1 for row in ranges if row.get("preview")),
        "animationKeys": len(key_rows),
        "emptyAnimationKeys": len(empty_keys),
        "emptyAttackOrMoveKeys": sum(1 for row in empty_keys if row["category"] == "attack" or row["hasMoveOverride"]),
    }


def read_json(path: Path):
    return json.loads(path.read_text())


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2) + "\n")


def write_csv(path: Path, rows: list[dict]) -> None:
    keys = sorted({key for row in rows for key in row})
    with path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)


def frame_index(src: str):
    match = FRAME_RE.search(str(src))
    return int(match.group(1)) if match else None


def number(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


if __name__ == "__main__":
    main()
