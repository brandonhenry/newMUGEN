#!/usr/bin/env python3
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


TIMING_KEYS = ("startupFrames", "activeFrames", "recoveryFrames")
EXCLUDED_CHARACTER_IDS = {"kiro", "riven"}
BASE_INPUT_TO_ANIMATION_KEY = {
    "jab": "jableft",
    "heavy": "jabright",
    "kick": "kickleft",
    "special": "kickright",
}


def load_json(path):
    return json.loads(path.read_text())


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def character_paths(repo):
    root = repo / "public" / "characters"
    return sorted(root.glob("*/character.json"))


def command_input(key):
    digits = [ch for ch in key if ch in "1234"]
    button = digits[-1] if digits else "1"
    if button == "2":
        return "heavy"
    if button == "3":
        return "kick"
    if button == "4":
        return "special"
    return "jab"


def base_move_for_key(character, key, override):
    wanted_input = override.get("input") or command_input(key)
    moves = character.get("moves") or []
    for move in moves:
        if move.get("input") == wanted_input or move.get("id") == wanted_input:
            return move
    legacy_key = BASE_INPUT_TO_ANIMATION_KEY.get(wanted_input)
    for move in moves:
        if move.get("id") == legacy_key:
            return move
    return moves[0] if moves else {}


def current_timing(character, key, override):
    base = base_move_for_key(character, key, override)
    startup = override.get("startupFrames", base.get("startupFrames", 10))
    active = override.get("activeFrames", base.get("activeFrames", 2))
    recovery = override.get("recoveryFrames", base.get("recoveryFrames", 16))
    return int(round(startup)), int(round(active)), int(round(recovery))


def has_complete_timing(override):
    return all(isinstance(override.get(key), (int, float)) for key in TIMING_KEYS)


def frame_path(repo, frame_ref):
    ref = str(frame_ref)
    if ref.startswith("/characters/"):
        return repo / "public" / ref.lstrip("/")
    if ref.startswith("/"):
        return repo / ref.lstrip("/")
    return repo / ref


def alpha_bbox(image):
    if image.mode != "RGBA":
        image = image.convert("RGBA")
    alpha = image.getchannel("A")
    return alpha.getbbox()


def frame_metrics(repo, frame_refs):
    metrics = []
    for ref in frame_refs:
        path = frame_path(repo, ref)
        try:
            image = Image.open(path).convert("RGBA")
        except FileNotFoundError:
            metrics.append({"missing": True, "path": str(path)})
            continue
        bbox = alpha_bbox(image)
        if not bbox:
            metrics.append({"empty": True, "path": str(path), "image": image})
            continue
        left, top, right, bottom = bbox
        alpha = image.getchannel("A")
        nonzero = alpha.point(lambda p: 1 if p else 0)
        area = sum(nonzero.getdata())
        metrics.append(
            {
                "empty": False,
                "path": str(path),
                "image": image,
                "bbox": bbox,
                "left": left,
                "right": right,
                "top": top,
                "bottom": bottom,
                "width": right - left,
                "height": bottom - top,
                "area": area,
                "center_x": (left + right) / 2,
                "center_y": (top + bottom) / 2,
            }
        )
    return metrics


def infer_active_window(metrics, key, override):
    valid = [m for m in metrics if not m.get("missing") and not m.get("empty")]
    count = len(metrics)
    if count <= 1 or not valid:
        return 0, 0, "single-frame/default"

    widths = [m.get("width", 0) for m in metrics]
    areas = [m.get("area", 0) for m in metrics]
    rights = [m.get("right", 0) for m in metrics]
    lefts = [m.get("left", 0) for m in metrics]
    centers = [m.get("center_x", 0) for m in metrics]

    max_width = max(widths) or 1
    max_area = max(areas) or 1
    max_right = max(rights) or 1
    min_left = min(lefts)
    right_span = max(max_right - min(rights), 1)
    left_span = max(max(lefts) - min_left, 1)
    center_span = max(max(centers) - min(centers), 1)

    if max(rights) - min(rights) >= max(lefts) - min(lefts):
        extension = [(right - min(rights)) / right_span for right in rights]
        facing_note = "right-edge"
    else:
        extension = [(max(lefts) - left) / left_span for left in lefts]
        facing_note = "left-edge"

    scores = []
    for index in range(count):
        width_score = widths[index] / max_width
        area_score = areas[index] / max_area
        center_motion = abs(centers[index] - centers[index - 1]) / center_span if index else 0
        scores.append(0.45 * extension[index] + 0.3 * width_score + 0.2 * area_score + 0.05 * center_motion)

    peak = max(range(count), key=lambda i: (scores[i], areas[i], widths[i]))
    threshold = max(0.74, scores[peak] - 0.1)
    active = [i for i, score in enumerate(scores) if score >= threshold]

    if len(active) > max(1, math.ceil(count * 0.45)):
        ranked = sorted(active, key=lambda i: scores[i], reverse=True)[: max(1, math.ceil(count * 0.35))]
        active = sorted(ranked)

    first = min(active) if active else peak
    last = max(active) if active else peak

    # Keep quick checks crisp, matching Naruto/Sasuke reference jabs: contact on
    # the clearest extension frame, not the whole wind-up or recoil.
    is_quick_check = key in {"jableft", "jabright"} or override.get("damage", 99) <= 8
    if is_quick_check and count <= 6:
        first = peak
        last = peak

    # Multi-hit, throw, projectile, and big-effect moves can remain threatening
    # across held frames, especially when the visual mass/effect persists.
    sustained = (
        override.get("tornado")
        or override.get("throwCapture")
        or override.get("kiBurst")
        or override.get("usesKi")
        or "O+" in key
        or "qcf" in key
    )
    if sustained:
        near = [i for i, score in enumerate(scores) if score >= max(0.68, scores[peak] - 0.16)]
        if near:
            first = min(first, min(near))
            last = max(last, max(near))

    first = max(0, min(count - 1, first))
    last = max(first, min(count - 1, last))
    return first, last, f"{facing_note};peak={peak};scores={','.join(f'{s:.2f}' for s in scores)}"


def timing_from_window(first_active, last_active, sprite_count, total):
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
        reduce_startup = min(overflow, max(0, startup - 0))
        startup -= reduce_startup
        overflow -= reduce_startup
    if overflow > 0:
        recovery = max(0, recovery - overflow)
    return int(startup), int(active), int(recovery)


def targets(repo, include_complete=False, only_keys=None):
    result = []
    skipped_no_animation = []
    for manifest_path in character_paths(repo):
        character = load_json(manifest_path)
        char_id = character.get("id") or manifest_path.parent.name
        if char_id in EXCLUDED_CHARACTER_IDS:
            continue
        overrides = character.get("moveOverrides") or {}
        frames = character.get("animationFrames") or {}
        for key, override in overrides.items():
            sequence = frames.get(key)
            if not isinstance(sequence, list) or not sequence:
                skipped_no_animation.append({"character": char_id, "key": key})
                continue
            if only_keys is not None and (char_id, key) not in only_keys:
                continue
            if only_keys is not None or include_complete or not has_complete_timing(override):
                result.append(
                    {
                        "manifest": manifest_path,
                        "character": char_id,
                        "displayName": character.get("displayName", char_id),
                        "key": key,
                        "override": override,
                        "sequence": sequence,
                        "characterData": character,
                    }
                )
    return result, skipped_no_animation


def snapshot(repo, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for path in character_paths(repo):
        rel = path.relative_to(repo).as_posix()
        text = path.read_text()
        manifest[rel] = {
            "sha256": hashlib.sha256(text.encode()).hexdigest(),
            "json": json.loads(text),
        }
    write_json(out_dir / "baseline-manifests.json", manifest)
    print(f"snapshot: {len(manifest)} manifests")


def classify_sprite(index, first, last):
    if index < first:
        return "startup"
    if index <= last:
        return "active"
    return "recovery"


def render_strip(repo, target, timing, out_path, note):
    frames = target["sequence"]
    first, last, startup, active, recovery = timing
    metrics = frame_metrics(repo, frames)
    font = ImageFont.load_default()
    thumb_w = 108
    thumb_h = 108
    gap = 8
    label_h = 58
    header_h = 48
    width = max(520, len(frames) * (thumb_w + gap) + gap)
    height = header_h + thumb_h + label_h
    canvas = Image.new("RGB", (width, height), (24, 26, 28))
    draw = ImageDraw.Draw(canvas)
    title = f"{target['character']} | {target['key']} | {startup}/{active}/{recovery} | active sprites {first}-{last}"
    draw.text((10, 8), title, fill=(245, 245, 245), font=font)
    draw.text((10, 26), note[:160], fill=(185, 190, 198), font=font)
    colors = {
        "startup": (88, 116, 170),
        "active": (220, 70, 70),
        "recovery": (95, 145, 105),
    }
    for i, metric in enumerate(metrics):
        x = gap + i * (thumb_w + gap)
        y = header_h
        phase = classify_sprite(i, first, last)
        draw.rectangle((x - 2, y - 2, x + thumb_w + 1, y + thumb_h + 1), outline=colors[phase], width=4)
        if metric.get("missing"):
            draw.text((x + 8, y + 42), "missing", fill=(255, 180, 180), font=font)
        else:
            image = metric["image"]
            bbox = alpha_bbox(image) or (0, 0, image.width, image.height)
            cropped = image.crop(bbox)
            cropped.thumbnail((thumb_w - 12, thumb_h - 12), Image.Resampling.LANCZOS)
            px = x + (thumb_w - cropped.width) // 2
            py = y + (thumb_h - cropped.height) // 2
            checker = Image.new("RGB", (thumb_w, thumb_h), (38, 40, 43))
            canvas.paste(checker, (x, y))
            canvas.paste(cropped, (px, py), cropped)
        draw.text((x, header_h + thumb_h + 6), f"{i}: {phase}", fill=(230, 230, 230), font=font)
        basename = Path(str(frames[i])).name
        draw.text((x, header_h + thumb_h + 22), basename, fill=(170, 174, 180), font=font)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)


def render_audit(repo, out_dir, include_complete=False, suffix="before"):
    only_keys = None
    changes_path = out_dir / "changes.json"
    if suffix == "after" and changes_path.exists():
        changes = load_json(changes_path).get("changes", [])
        only_keys = {(change["character"], change["key"]) for change in changes}
    audit_targets, skipped = targets(repo, include_complete=include_complete, only_keys=only_keys)
    out_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for target in audit_targets:
        metrics = frame_metrics(repo, target["sequence"])
        first, last, note = infer_active_window(metrics, target["key"], target["override"])
        current = current_timing(target["characterData"], target["key"], target["override"])
        total = sum(current)
        proposed = timing_from_window(first, last, len(target["sequence"]), total)
        record = {
            "character": target["character"],
            "displayName": target["displayName"],
            "key": target["key"],
            "spriteCount": len(target["sequence"]),
            "firstActiveSpriteIndex": first,
            "lastActiveSpriteIndex": last,
            "currentTiming": {"startupFrames": current[0], "activeFrames": current[1], "recoveryFrames": current[2]},
            "proposedTiming": {"startupFrames": proposed[0], "activeFrames": proposed[1], "recoveryFrames": proposed[2]},
            "totalFrames": total,
            "note": note,
        }
        records.append(record)
        safe_key = target["key"].replace(":", "_").replace("/", "_").replace("+", "plus")
        png = out_dir / suffix / target["character"] / f"{safe_key}.png"
        render_strip(repo, target, (first, last, *proposed), png, note)

    write_json(out_dir / f"audit-{suffix}.json", {"targets": records, "skippedNoAnimation": skipped})
    make_index(out_dir, suffix, records)
    print(f"audit-{suffix}: {len(records)} rendered, {len(skipped)} skipped without animation")


def make_index(out_dir, suffix, records):
    lines = [
        "<!doctype html><meta charset='utf-8'><title>KORE frame timing audit</title>",
        "<style>body{font-family:system-ui,sans-serif;background:#111;color:#eee} img{max-width:100%;height:auto;border:1px solid #333;margin:8px 0 24px} a{color:#9cc7ff} .move{margin:18px 0}</style>",
        f"<h1>KORE frame timing audit: {suffix}</h1>",
    ]
    for record in records:
        safe_key = record["key"].replace(":", "_").replace("/", "_").replace("+", "plus")
        src = f"{suffix}/{record['character']}/{safe_key}.png"
        lines.append(
            f"<div class='move'><h2>{record['character']} | {record['key']}</h2>"
            f"<p>{record['currentTiming']} -> {record['proposedTiming']} | active sprites {record['firstActiveSpriteIndex']}-{record['lastActiveSpriteIndex']}</p>"
            f"<img src='{src}'></div>"
        )
    (out_dir / f"index-{suffix}.html").write_text("\n".join(lines) + "\n")


def apply(repo, out_dir):
    audit_targets, skipped = targets(repo, include_complete=False)
    changes = []
    by_manifest = {}
    for target in audit_targets:
        metrics = frame_metrics(repo, target["sequence"])
        first, last, note = infer_active_window(metrics, target["key"], target["override"])
        current = current_timing(target["characterData"], target["key"], target["override"])
        total = sum(current)
        proposed = timing_from_window(first, last, len(target["sequence"]), total)
        by_manifest.setdefault(target["manifest"], []).append((target, proposed, first, last, total, note))

    for manifest_path, entries in by_manifest.items():
        character = load_json(manifest_path)
        for target, proposed, first, last, total, note in entries:
            override = character["moveOverrides"][target["key"]]
            before = {key: override.get(key) for key in TIMING_KEYS}
            override["startupFrames"], override["activeFrames"], override["recoveryFrames"] = proposed
            changes.append(
                {
                    "character": target["character"],
                    "key": target["key"],
                    "before": before,
                    "after": {
                        "startupFrames": proposed[0],
                        "activeFrames": proposed[1],
                        "recoveryFrames": proposed[2],
                    },
                    "totalFrames": total,
                    "firstActiveSpriteIndex": first,
                    "lastActiveSpriteIndex": last,
                    "note": note,
                }
            )
        write_json(manifest_path, character)

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "changes.json", {"changes": changes, "skippedNoAnimation": skipped})
    print(f"apply: {len(changes)} timing entries written")


def strip_allowed_timing_delta(before, after, changed_keys):
    clean_before = copy.deepcopy(before)
    clean_after = copy.deepcopy(after)
    for char_key, before_entry in clean_before.items():
        after_entry = clean_after.get(char_key)
        if not after_entry:
            continue
        before_entry.pop("sha256", None)
        after_entry.pop("sha256", None)
        before_json = before_entry["json"]
        after_json = after_entry["json"]
        char_id = before_json.get("id") or Path(char_key).parent.name
        before_overrides = before_json.get("moveOverrides") or {}
        after_overrides = after_json.get("moveOverrides") or {}
        for key, after_override in after_overrides.items():
            before_override = before_overrides.get(key)
            if before_override is None:
                continue
            if (char_id, key) in changed_keys:
                for timing_key in TIMING_KEYS:
                    before_override.pop(timing_key, None)
                    after_override.pop(timing_key, None)
    return clean_before, clean_after


def verify(repo, out_dir):
    baseline_path = out_dir / "baseline-manifests.json"
    changes_path = out_dir / "changes.json"
    baseline = load_json(baseline_path)
    changes = load_json(changes_path)["changes"]
    changed_keys = {(change["character"], change["key"]) for change in changes}
    current = {}
    for path in character_paths(repo):
        rel = path.relative_to(repo).as_posix()
        text = path.read_text()
        current[rel] = {"sha256": hashlib.sha256(text.encode()).hexdigest(), "json": json.loads(text)}

    assert baseline["public/characters/kiro/character.json"]["sha256"] == current["public/characters/kiro/character.json"]["sha256"], "kiro changed"
    assert baseline["public/characters/riven/character.json"]["sha256"] == current["public/characters/riven/character.json"]["sha256"], "riven changed"

    clean_before, clean_after = strip_allowed_timing_delta(baseline, current, changed_keys)
    if clean_before != clean_after:
        raise AssertionError("manifest changes include fields beyond newly written timing keys")

    changed = {(c["character"], c["key"]): c for c in changes}
    for path in character_paths(repo):
        character = load_json(path)
        char_id = character.get("id") or path.parent.name
        frames = character.get("animationFrames") or {}
        for key in (character.get("moveOverrides") or {}).keys():
            if (char_id, key) in changed:
                assert isinstance(frames.get(key), list) and frames[key], f"changed key without animation: {char_id} {key}"
    for change in changes:
        after = change["after"]
        assert sum(after[key] for key in TIMING_KEYS) == change["totalFrames"], f"total changed: {change}"
        assert after["activeFrames"] >= 1, f"active < 1: {change}"
        assert after["recoveryFrames"] >= 1, f"recovery < 1: {change}"
    print(f"verify: {len(changes)} changes valid")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--out", type=Path, default=Path("tmp/frame-timing-audit"))
    parser.add_argument("command", choices=["snapshot", "audit-before", "audit-after", "apply", "verify"])
    parser.add_argument("--include-complete", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    out = (repo / args.out).resolve() if not args.out.is_absolute() else args.out
    if args.command == "snapshot":
        snapshot(repo, out)
    elif args.command == "audit-before":
        render_audit(repo, out, include_complete=args.include_complete, suffix="before")
    elif args.command == "audit-after":
        render_audit(repo, out, include_complete=False, suffix="after")
    elif args.command == "apply":
        apply(repo, out)
    elif args.command == "verify":
        verify(repo, out)


if __name__ == "__main__":
    main()
