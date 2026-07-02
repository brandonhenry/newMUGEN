#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path
from statistics import median

from PIL import Image, ImageDraw


SKIP_IDS = {"kiro", "riven"}
REFERENCE_IDS = ("kiro", "riven")
ATTACK_KEYS = ("startupFrames", "activeFrames", "recoveryFrames")


@dataclass
class FrameMetric:
    index: int
    source: str
    bbox: tuple[int, int, int, int]
    width: int
    height: int
    area: int
    center_x: float
    center_y: float
    low_mass_ratio: float
    edge_mass_ratio: float
    score: float = 0.0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--out", type=Path, default=Path("tmp/frame-timing-audit"))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    repo = args.repo.resolve()
    out_dir = (repo / args.out).resolve() if not args.out.is_absolute() else args.out.resolve()
    sheets_dir = out_dir / "sheets"
    sheets_dir.mkdir(parents=True, exist_ok=True)

    characters_dir = repo / "public" / "characters"
    reference_templates = build_reference_templates(characters_dir)
    rows: list[dict] = []
    skipped_rows: list[dict] = []
    reference_rows: list[dict] = []

    for character_dir in sorted(path for path in characters_dir.iterdir() if (path / "character.json").exists()):
        character_id = character_dir.name
        character = read_json(character_dir / "character.json")
        is_reference = character_id in REFERENCE_IDS
        if character_id in SKIP_IDS and not is_reference:
            continue

        source_rows = reference_rows if is_reference else rows
        move_overrides = character.get("moveOverrides") or {}
        animation_frames = character.get("animationFrames") or {}
        changed = False

        for move_key in sorted(move_overrides.keys()):
            override = move_overrides.get(move_key) or {}
            sequence = animation_frames.get(move_key) or []
            if not sequence:
                if not is_reference:
                    skipped_rows.append({
                        "character": character_id,
                        "moveKey": move_key,
                        "reason": "no animationFrames sequence",
                    })
                continue

            current = current_timing(override)
            if current is None:
                skipped_rows.append({
                    "character": character_id,
                    "moveKey": move_key,
                    "reason": "missing startup/active/recovery timing",
                })
                continue

            metrics = [measure_frame(repo, src) for src in sequence]
            if any(metric is None for metric in metrics):
                skipped_rows.append({
                    "character": character_id,
                    "moveKey": move_key,
                    "reason": "missing sprite frame image",
                })
                continue
            frame_metrics = [metric for metric in metrics if metric is not None]
            idle_metrics = [measure_frame(repo, src) for src in (animation_frames.get("idle") or [])]
            idle_metrics = [metric for metric in idle_metrics if metric is not None]
            template = choose_reference_template(reference_templates, move_key, override, len(frame_metrics))
            if template:
                new_timing = timing_from_reference(current, template)
                active_window = window_from_timing(new_timing, len(frame_metrics))
                timing_source = template["source"]
            else:
                active_window = choose_active_window(character, move_key, override, frame_metrics, idle_metrics)
            old_window = window_from_timing(current, len(frame_metrics))
            if not template:
                if old_window[0] <= active_window[0] and active_window[1] <= old_window[1]:
                    new_timing = current
                    active_window = old_window
                    timing_source = "visual-detector-kept"
                else:
                    new_timing = timing_from_window(current, len(frame_metrics), active_window)
                    timing_source = "visual-detector"

            sheet_path = sheets_dir / f"{character_id}__{safe_key(move_key)}.png"
            render_sheet(character_id, move_key, frame_metrics, current, new_timing, old_window, active_window, sheet_path)

            row = {
                "character": character_id,
                "displayName": character.get("displayName", character_id),
                "moveKey": move_key,
                "spriteCount": len(frame_metrics),
                "oldStartup": current[0],
                "oldActive": current[1],
                "oldRecovery": current[2],
                "oldTotal": sum(current),
                "oldFirstActiveSprite": old_window[0],
                "oldLastActiveSprite": old_window[1],
                "newStartup": new_timing[0],
                "newActive": new_timing[1],
                "newRecovery": new_timing[2],
                "newTotal": sum(new_timing),
                "firstActiveSprite": active_window[0],
                "lastActiveSprite": active_window[1],
                "changed": current != new_timing,
                "timingSource": timing_source,
                "sheet": str(sheet_path.relative_to(repo)),
            }
            source_rows.append(row)

            if args.apply and not is_reference and current != new_timing:
                override["startupFrames"] = new_timing[0]
                override["activeFrames"] = new_timing[1]
                override["recoveryFrames"] = new_timing[2]
                changed = True

        if args.apply and changed and character_id not in SKIP_IDS:
            write_json(character_dir / "character.json", character)

    write_csv(out_dir / "timing-audit.csv", rows)
    write_csv(out_dir / "reference-timing-audit.csv", reference_rows)
    write_csv(out_dir / "skipped-no-animation.csv", skipped_rows)
    write_summary(out_dir / "summary.json", rows, reference_rows, skipped_rows, args.apply)
    render_overview(out_dir / "overview-changed.png", repo, rows, only_changed=True)
    render_overview(out_dir / "overview-all.png", repo, rows, only_changed=False)
    print(json.dumps({
        "apply": args.apply,
        "references": len(reference_rows),
        "eligible": len(rows),
        "changed": sum(1 for row in rows if row["changed"]),
        "skipped": len(skipped_rows),
        "out": str(out_dir),
    }, indent=2))


def build_reference_templates(characters_dir: Path) -> dict[str, list[dict]]:
    templates: dict[str, list[dict]] = {}
    for character_id in REFERENCE_IDS:
        manifest_path = characters_dir / character_id / "character.json"
        if not manifest_path.exists():
            continue
        character = read_json(manifest_path)
        for move_key, override in (character.get("moveOverrides") or {}).items():
            sequence = (character.get("animationFrames") or {}).get(move_key) or []
            timing = current_timing(override or {})
            if not sequence or timing is None:
                continue
            total = sum(timing)
            templates.setdefault(move_key, []).append({
                "source": f"reference:{character_id}",
                "character": character_id,
                "spriteCount": len(sequence),
                "startupFraction": timing[0] / total,
                "activeFraction": timing[1] / total,
                "recoveryFraction": timing[2] / total,
                "timing": timing,
                "hitLevel": str((override or {}).get("hitLevel", "")).lower(),
                "launch": bool((override or {}).get("launchHeight")),
                "knockdown": bool((override or {}).get("knockdown")),
                "tornado": bool((override or {}).get("tornado")),
            })
    return templates


def choose_reference_template(templates: dict[str, list[dict]], move_key: str, override: dict, sprite_count: int) -> dict | None:
    candidates = templates.get(move_key) or []
    if not candidates:
        return None
    hit_level = str(override.get("hitLevel", "")).lower()
    launch = bool(override.get("launchHeight"))
    knockdown = bool(override.get("knockdown"))
    tornado = bool(override.get("tornado"))

    def score(candidate: dict) -> tuple[int, int, int, int]:
        property_score = 0
        if candidate["hitLevel"] and hit_level and candidate["hitLevel"] == hit_level:
            property_score += 2
        if candidate["launch"] == launch:
            property_score += 1
        if candidate["knockdown"] == knockdown:
            property_score += 1
        if candidate["tornado"] == tornado:
            property_score += 1
        count_distance = abs(candidate["spriteCount"] - sprite_count)
        # Prefer Sasuke on exact property ties for sharper/weapon-like moves; otherwise Naruto wins by order.
        sasuke_bonus = 1 if candidate["character"] == "riven" else 0
        return (property_score, -count_distance, sasuke_bonus, -REFERENCE_IDS.index(candidate["character"]))

    return max(candidates, key=score)


def current_timing(override: dict) -> tuple[int, int, int] | None:
    values = []
    for key in ATTACK_KEYS:
        value = override.get(key)
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            return None
        values.append(max(1, round(value)))
    return tuple(values)  # type: ignore[return-value]


def choose_active_window(character: dict, move_key: str, override: dict, metrics: list[FrameMetric], idle_metrics: list[FrameMetric]) -> tuple[int, int]:
    count = len(metrics)
    if count <= 1:
        return (0, 0)

    base_width = safe_median([m.width for m in idle_metrics]) or safe_median([m.width for m in metrics]) or 1
    base_area = safe_median([m.area for m in idle_metrics]) or safe_median([m.area for m in metrics]) or 1
    center = safe_median([m.center_x for m in idle_metrics]) or safe_median([m.center_x for m in metrics]) or 0
    max_distance = max(abs(m.center_x - center) + m.width * 0.5 for m in metrics) or 1

    key_lower = move_key.lower()
    hit_level = str(override.get("hitLevel", "")).lower()
    is_low = hit_level == "low" or "fc+" in key_lower or "+3" in key_lower or "+4" in key_lower
    is_power = bool(override.get("launchHeight")) or bool(override.get("knockdown")) or bool(override.get("tornado")) or "o+" in key_lower

    for i, metric in enumerate(metrics):
        width_score = metric.width / base_width
        area_score = metric.area / base_area
        reach_score = (abs(metric.center_x - center) + metric.width * 0.5) / max_distance
        low_score = metric.low_mass_ratio if is_low else 0
        edge_score = metric.edge_mass_ratio
        late_bias = i / max(1, count - 1)
        windup_penalty = 0.18 if i == 0 and count > 2 else 0
        metric.score = (
            width_score * 0.34
            + area_score * 0.14
            + reach_score * 0.34
            + edge_score * 0.10
            + low_score * 0.18
            + late_bias * (0.08 if is_power else 0.04)
            - windup_penalty
        )

    max_score = max(metric.score for metric in metrics)
    threshold = max_score * (0.90 if count <= 4 else 0.86)
    candidates = [i for i, metric in enumerate(metrics) if metric.score >= threshold]
    if not candidates:
        best = max(range(count), key=lambda i: metrics[i].score)
        return (best, best)

    # Prefer the strongest contiguous cluster, because active windows should not hop around.
    clusters: list[list[int]] = []
    current = [candidates[0]]
    for index in candidates[1:]:
        if index == current[-1] + 1:
            current.append(index)
        else:
            clusters.append(current)
            current = [index]
    clusters.append(current)

    def cluster_value(cluster: list[int]) -> tuple[float, int]:
        return (sum(metrics[i].score for i in cluster) / len(cluster), len(cluster))

    cluster = max(clusters, key=cluster_value)
    first, last = cluster[0], cluster[-1]

    # Very long active clusters tend to be animation hold/recovery poses; trim to the strongest middle.
    is_multi_hit = any(token in key_lower for token in ("1+2", "1+3", "2+3", "2+4", "3+4", "o+"))
    max_active_sprites = 2 if (is_power or is_multi_hit or count >= 8) else 1
    if last - first + 1 > max_active_sprites:
        ranked = sorted(cluster, key=lambda i: metrics[i].score, reverse=True)[:max_active_sprites]
        first, last = min(ranked), max(ranked)

    # Avoid frame 0 active unless the sequence is tiny or frame 0 is truly the visual peak.
    if first == 0 and count > 2 and metrics[0].score < max_score * 0.98:
        first = 1
        if last < first:
            last = first

    return (first, last)


def timing_from_reference(current: tuple[int, int, int], template: dict) -> tuple[int, int, int]:
    total = sum(current)
    startup = max(1, round(template["startupFraction"] * total))
    active = max(1, round(template["activeFraction"] * total))
    recovery = total - startup - active
    if recovery < 1:
        deficit = 1 - recovery
        active_reduce = min(deficit, max(0, active - 1))
        active -= active_reduce
        deficit -= active_reduce
        if deficit:
            startup = max(1, startup - deficit)
        recovery = total - startup - active
    return (startup, active, max(1, recovery))


def timing_from_window(current: tuple[int, int, int], sprite_count: int, window: tuple[int, int]) -> tuple[int, int, int]:
    total = sum(current)
    first, last = window
    startup = max(1, math.ceil(first * total / sprite_count))
    active_end = max(startup + 1, math.ceil((last + 1) * total / sprite_count))
    active = max(1, active_end - startup)
    recovery = max(1, total - startup - active)
    overflow = startup + active + recovery - total
    if overflow > 0:
        active_reduce = min(overflow, max(0, active - 1))
        active -= active_reduce
        overflow -= active_reduce
    if overflow > 0:
        startup = max(1, startup - overflow)
    recovery = max(1, total - startup - active)
    return (startup, active, recovery)


def window_from_timing(timing: tuple[int, int, int], sprite_count: int) -> tuple[int, int]:
    total = sum(timing)
    startup, active, _ = timing
    first = min(sprite_count - 1, max(0, math.floor(startup / total * sprite_count)))
    last = min(sprite_count - 1, max(first, math.floor((startup + active - 1) / total * sprite_count)))
    return (first, last)


def measure_frame(repo: Path, frame_source: str) -> FrameMetric | None:
    frame_path = repo / "public" / frame_source.lstrip("/")
    if not frame_path.exists():
        return None
    image = Image.open(frame_path).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return None
    pixels = alpha.load()
    min_x, min_y, max_x, max_y = bbox
    area = 0
    low_area = 0
    edge_area = 0
    width = max_x - min_x
    height = max_y - min_y
    low_start = min_y + height * 0.58
    edge_left = min_x + width * 0.18
    edge_right = max_x - width * 0.18
    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            if pixels[x, y] <= 24:
                continue
            area += 1
            if y >= low_start:
                low_area += 1
            if x <= edge_left or x >= edge_right:
                edge_area += 1
    index = int(Path(frame_source).stem.split("-")[-1])
    return FrameMetric(
        index=index,
        source=frame_source,
        bbox=bbox,
        width=width,
        height=height,
        area=max(1, area),
        center_x=(min_x + max_x) / 2,
        center_y=(min_y + max_y) / 2,
        low_mass_ratio=low_area / max(1, area),
        edge_mass_ratio=edge_area / max(1, area),
    )


def render_sheet(
    character_id: str,
    move_key: str,
    metrics: list[FrameMetric],
    old_timing: tuple[int, int, int],
    new_timing: tuple[int, int, int],
    old_window: tuple[int, int],
    new_window: tuple[int, int],
    output: Path,
) -> None:
    cell_w, cell_h = 116, 140
    header_h = 54
    width = max(520, cell_w * len(metrics))
    height = header_h + cell_h
    sheet = Image.new("RGBA", (width, height), "white")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 6), f"{character_id} / {move_key}", fill=(0, 0, 0))
    draw.text((8, 23), f"old {old_timing[0]}/{old_timing[1]}/{old_timing[2]} active sprites {old_window[0]}-{old_window[1]}   new {new_timing[0]}/{new_timing[1]}/{new_timing[2]} active sprites {new_window[0]}-{new_window[1]}", fill=(0, 0, 0))
    draw.text((8, 39), "green=new active, blue=old active, red=floor", fill=(40, 40, 40))
    for i, metric in enumerate(metrics):
        frame_path = output.parents[3] / "public" / metric.source.lstrip("/")
        image = Image.open(frame_path).convert("RGBA")
        bbox = metric.bbox
        crop = image.crop(bbox)
        scale = min(1.0, 96 / max(1, crop.width), 88 / max(1, crop.height))
        rendered = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.NEAREST)
        x = i * cell_w + (cell_w - rendered.width) // 2
        floor_y = header_h + 100
        y = floor_y - rendered.height
        sheet.alpha_composite(rendered, (x, y))
        draw.line((i * cell_w + 8, floor_y, (i + 1) * cell_w - 8, floor_y), fill=(210, 0, 0), width=2)
        color = None
        if new_window[0] <= i <= new_window[1]:
            color = (0, 150, 70)
        if old_window[0] <= i <= old_window[1]:
            color = (35, 80, 220) if color is None else (0, 120, 160)
        if color:
            draw.rectangle((i * cell_w + 3, header_h + 4, (i + 1) * cell_w - 4, header_h + cell_h - 4), outline=color, width=4)
        draw.text((i * cell_w + 8, floor_y + 5), f"f{metric.index} s={metric.score:.2f}", fill=(0, 0, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)


def render_overview(output: Path, repo: Path, rows: list[dict], only_changed: bool) -> None:
    selected = [row for row in rows if row["changed"] or not only_changed]
    selected = selected[:220]
    thumb_w, thumb_h = 220, 64
    cols = 4
    rows_count = max(1, math.ceil(len(selected) / cols))
    image = Image.new("RGBA", (cols * thumb_w, rows_count * thumb_h), "white")
    draw = ImageDraw.Draw(image)
    for idx, row in enumerate(selected):
        x = (idx % cols) * thumb_w
        y = (idx // cols) * thumb_h
        draw.rectangle((x, y, x + thumb_w - 1, y + thumb_h - 1), outline=(210, 210, 210))
        draw.text((x + 5, y + 4), f"{row['character']} {row['moveKey']}"[:34], fill=(0, 0, 0))
        draw.text((x + 5, y + 20), f"{row['oldStartup']}/{row['oldActive']}/{row['oldRecovery']} -> {row['newStartup']}/{row['newActive']}/{row['newRecovery']}", fill=(0, 80, 0) if row["changed"] else (70, 70, 70))
        draw.text((x + 5, y + 36), f"sprites {row['firstActiveSprite']}-{row['lastActiveSprite']} / {row['spriteCount']}", fill=(0, 0, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


def safe_median(values: list[float | int]) -> float | None:
    finite = [float(value) for value in values if math.isfinite(float(value))]
    return median(finite) if finite else None


def safe_key(key: str) -> str:
    return key.replace(":", "_").replace("/", "_").replace("+", "plus").replace(" ", "_")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    keys = sorted({key for row in rows for key in row.keys()})
    with path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)


def write_summary(path: Path, rows: list[dict], reference_rows: list[dict], skipped_rows: list[dict], apply: bool) -> None:
    changed = [row for row in rows if row["changed"]]
    summary = {
        "apply": apply,
        "eligible": len(rows),
        "changed": len(changed),
        "unchanged": len(rows) - len(changed),
        "referenceRows": len(reference_rows),
        "skipped": len(skipped_rows),
        "changedCharacters": len({row["character"] for row in changed}),
        "protectedReferences": list(REFERENCE_IDS),
        "skippedBaseCharacters": list(SKIP_IDS),
    }
    path.write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
