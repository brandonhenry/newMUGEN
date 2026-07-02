#!/usr/bin/env python3
import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
CHAR_DIR = REPO / "public" / "characters"
OUT_DIR = REPO / "tmp" / "voxel-scale-all-states-audit" / "state-review"

EXCLUDED_IDS = {"near", "astra", "dax"}
GROUPS = {
    "defense-core": ["crouch", "block", "crouchBlock", "hitLight", "hitHeavy", "juggle"],
    "ground-recovery": ["knockdown", "getupStand", "getupRollUp", "lose"],
    "movement-core": [
        "walkForward",
        "walkBack",
        "sprint",
        "backflip",
        "sidestepLeft",
        "sidestepRight",
        "jump",
        "chargeKi",
        "win",
    ],
}

try:
    FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    FONT_BOLD = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 14)
    FONT_SMALL = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 10)
except Exception:
    FONT = FONT_BOLD = FONT_SMALL = ImageFont.load_default()


def median(values):
    values = sorted(v for v in values if v and math.isfinite(v))
    if not values:
        return 1.0
    mid = len(values) // 2
    if len(values) % 2:
        return values[mid]
    return (values[mid - 1] + values[mid]) / 2


def frame_index(frame_path):
    stem = Path(frame_path).stem
    try:
        return int(stem.split("-")[-1])
    except Exception:
        return -1


def resolve_frame(frame_path):
    return REPO / "public" / frame_path.lstrip("/")


def trim_image(path):
    image = Image.open(path).convert("RGBA")
    bbox = image.getbbox()
    if not bbox:
        return image.crop((0, 0, 1, 1)), (1, 1)
    cropped = image.crop(bbox)
    return cropped, cropped.size


def scale_for(character, key, index):
    base = (character.get("animationScales") or {}).get(key) or {}
    per = ((character.get("animationFrameScales") or {}).get(key) or {}).get(str(index)) or {}
    scale = per or base
    return float(scale.get("width", 1) or 1), float(scale.get("height", 1) or 1), float(scale.get("offsetX", 0) or 0)


def character_rows():
    rows = []
    for character_path in sorted(CHAR_DIR.glob("*/character.json")):
        character = json.loads(character_path.read_text())
        character_id = character_path.parent.name
        if character_id in EXCLUDED_IDS or character.get("unplayable"):
            continue
        idle = (character.get("animationFrames") or {}).get("idle") or []
        if not idle:
            continue
        idle_heights = []
        for frame in idle:
            path = resolve_frame(frame)
            if not path.exists():
                continue
            _, size = trim_image(path)
            idx = frame_index(frame)
            _, sy, _ = scale_for(character, "idle", idx)
            idle_heights.append(size[1] * sy)
        rows.append((character_id, character.get("name") or character_id, character, max(1.0, median(idle_heights))))
    return rows


def draw_group(group_name, keys, rows):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    card_w = 620
    key_label_w = 94
    frame_gap = 8
    row_gap = 18
    target_idle_h = 70
    max_frame_w = 86
    baseline_pad = 18
    header_h = 28
    cell_h = 108
    char_gap = 16

    cards = []
    for character_id, name, character, idle_h in rows:
        animation_frames = character.get("animationFrames") or {}
        present = [key for key in keys if animation_frames.get(key)]
        if not present:
            continue
        height = header_h + len(present) * cell_h + char_gap
        card = Image.new("RGB", (card_w, height), "white")
        draw = ImageDraw.Draw(card)
        draw.rectangle((0, 0, card_w - 1, height - 1), outline=(220, 220, 220))
        draw.rectangle((0, 0, card_w, header_h), fill=(245, 245, 245))
        draw.text((8, 6), f"{name} ({character_id})", fill=(24, 24, 24), font=FONT_BOLD)

        y = header_h + 8
        for key in present:
            frames = animation_frames[key]
            draw.text((8, y + 34), key, fill=(35, 35, 35), font=FONT)
            baseline = y + 78
            draw.line((key_label_w, baseline, card_w - 10, baseline), fill=(220, 0, 0), width=1)
            draw.rectangle(
                (key_label_w + 2, baseline - target_idle_h, key_label_w + 12, baseline),
                outline=(80, 150, 240),
                width=1,
            )
            x = key_label_w + 22
            for frame in frames:
                idx = frame_index(frame)
                path = resolve_frame(frame)
                if not path.exists():
                    continue
                cropped, (raw_w, raw_h) = trim_image(path)
                sx, sy, _ = scale_for(character, key, idx)
                rel_w = raw_w * sx / idle_h
                rel_h = raw_h * sy / idle_h
                draw_w = max(1, int(round(rel_w * target_idle_h)))
                draw_h = max(1, int(round(rel_h * target_idle_h)))
                if draw_w > max_frame_w:
                    factor = max_frame_w / draw_w
                    draw_w = max(1, int(draw_w * factor))
                    draw_h = max(1, int(draw_h * factor))
                rendered = cropped.resize((draw_w, draw_h), Image.Resampling.NEAREST)
                card.paste(rendered, (x, baseline - draw_h), rendered)
                draw.text((x, baseline + 4), f"{idx:03d}", fill=(95, 95, 95), font=FONT_SMALL)
                if abs(sx - 1) > 0.005 or abs(sy - 1) > 0.005:
                    draw.text((x, baseline + 17), f"{sx:.2f}", fill=(45, 105, 180), font=FONT_SMALL)
                x += max(draw_w, 26) + frame_gap
                if x > card_w - 34:
                    break
            y += cell_h
        cards.append(card)

    columns = 3
    page_w = columns * card_w
    col_heights = [0] * columns
    placements = []
    for card in cards:
        col = min(range(columns), key=lambda c: col_heights[c])
        placements.append((col, col_heights[col], card))
        col_heights[col] += card.height + row_gap
    page_h = max(col_heights) if col_heights else 1
    page = Image.new("RGB", (page_w, page_h), "white")
    for col, y, card in placements:
        page.paste(card, (col * card_w, y))
    out = OUT_DIR / f"{group_name}.png"
    page.save(out)
    return out


def main():
    rows = character_rows()
    manifest = {}
    for group_name, keys in GROUPS.items():
        out = draw_group(group_name, keys, rows)
        manifest[group_name] = str(out.relative_to(REPO))
        print(out)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
