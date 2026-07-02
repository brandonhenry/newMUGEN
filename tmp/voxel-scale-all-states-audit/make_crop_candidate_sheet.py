#!/usr/bin/env python3
import json
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
CHAR_DIR = REPO / "public" / "characters"
OUT_DIR = REPO / "tmp" / "voxel-scale-all-states-audit" / "crop-review"

EXCLUDED_IDS = {"near", "astra", "dax"}
ALPHA = 12

try:
    FONT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 12)
    FONT_BOLD = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 13)
    FONT_SMALL = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 10)
except Exception:
    FONT = FONT_BOLD = FONT_SMALL = ImageFont.load_default()


def frame_index(frame_path):
    return int(Path(frame_path).stem.split("-")[-1])


def resolve_public(public_path):
    return REPO / "public" / public_path.lstrip("/")


def bbox_for(image):
    width, height = image.size
    pixels = image.load()
    min_x, min_y = width, height
    max_x, max_y = -1, -1
    count = 0
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] > ALPHA:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
                count += 1
    if count == 0:
        return None, 0
    return (min_x, min_y, max_x, max_y), count


def components(image, bbox):
    width, height = image.size
    pixels = image.load()
    seen = bytearray(width * height)
    comps = []
    min_x, min_y, max_x, max_y = bbox
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            key = y * width + x
            if seen[key] or pixels[x, y][3] <= ALPHA:
                continue
            seen[key] = 1
            queue = deque([(x, y)])
            bx0 = bx1 = x
            by0 = by1 = y
            area = 0
            while queue:
                cx, cy = queue.popleft()
                area += 1
                bx0 = min(bx0, cx)
                bx1 = max(bx1, cx)
                by0 = min(by0, cy)
                by1 = max(by1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < min_x or ny < min_y or nx > max_x or ny > max_y:
                        continue
                    nkey = ny * width + nx
                    if seen[nkey] or pixels[nx, ny][3] <= ALPHA:
                        continue
                    seen[nkey] = 1
                    queue.append((nx, ny))
            comps.append({"bbox": (bx0, by0, bx1, by1), "area": area})
    comps.sort(key=lambda comp: comp["area"], reverse=True)
    return comps


def used_frames(character):
    used = {}
    for key, frames in (character.get("animationFrames") or {}).items():
        if not isinstance(frames, list):
            continue
        for frame in frames:
            used.setdefault(frame, set()).add(key)
    return used


def candidate_rows():
    rows = []
    seen_paths = set()
    for character_path in sorted(CHAR_DIR.glob("*/character.json")):
        character_id = character_path.parent.name
        character = json.loads(character_path.read_text())
        if character_id in EXCLUDED_IDS or character.get("unplayable"):
            continue
        if not (character.get("animationFrames") or {}).get("idle"):
            continue
        for public_path, keys in used_frames(character).items():
            if (character_id, public_path) in seen_paths:
                continue
            seen_paths.add((character_id, public_path))
            frame_path = resolve_public(public_path)
            if not frame_path.exists():
                continue
            image = Image.open(frame_path).convert("RGBA")
            bbox, ink = bbox_for(image)
            if not bbox:
                rows.append((character_id, character.get("name") or character_id, public_path, sorted(keys), ["empty"], image, bbox, []))
                continue
            x0, y0, x1, y1 = bbox
            width, height = image.size
            bw = x1 - x0 + 1
            bh = y1 - y0 + 1
            density = ink / max(1, bw * bh)
            comps = components(image, bbox)
            big_components = [c for c in comps if c["area"] >= max(12, ink * 0.08)]
            reasons = []
            if x0 <= 0 or y0 <= 0 or x1 >= width - 1 or y1 >= height - 1:
                reasons.append("touches-edge")
            if len(big_components) >= 3:
                reasons.append(f"{len(big_components)}-components")
            if len(big_components) == 2:
                a, b = big_components[:2]
                ax0, ay0, ax1, ay1 = a["bbox"]
                bx0, by0, bx1, by1 = b["bbox"]
                separated = bx0 > ax1 + 10 or ax0 > bx1 + 10 or by0 > ay1 + 10 or ay0 > by1 + 10
                if separated and b["area"] >= a["area"] * 0.22:
                    reasons.append("split-cells")
            if bw >= 150 and bh <= 28:
                reasons.append("wide-sliver")
            if bh >= 150 and bw <= 28:
                reasons.append("tall-sliver")
            if density < 0.075 and (bw > 80 or bh > 80):
                reasons.append("low-density")
            if reasons:
                rows.append((character_id, character.get("name") or character_id, public_path, sorted(keys), reasons, image, bbox, big_components))
    return rows


def draw_sheet(rows):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    card_w, card_h = 360, 172
    cols = 4
    rows_per_page = 40
    pages = []
    for start in range(0, len(rows), rows_per_page):
        chunk = rows[start : start + rows_per_page]
        page_rows = (len(chunk) + cols - 1) // cols
        page = Image.new("RGB", (card_w * cols, card_h * page_rows), "white")
        draw = ImageDraw.Draw(page)
        for i, (character_id, name, public_path, keys, reasons, image, bbox, comps) in enumerate(chunk):
            col = i % cols
            row = i // cols
            ox, oy = col * card_w, row * card_h
            draw.rectangle((ox, oy, ox + card_w - 1, oy + card_h - 1), outline=(215, 215, 215))
            idx = frame_index(public_path)
            draw.text((ox + 8, oy + 6), f"{name} {idx:03d}", fill=(25, 25, 25), font=FONT_BOLD)
            draw.text((ox + 8, oy + 23), character_id, fill=(75, 75, 75), font=FONT_SMALL)
            draw.text((ox + 8, oy + 37), ", ".join(reasons), fill=(170, 40, 40), font=FONT_SMALL)
            draw.text((ox + 8, oy + 51), ", ".join(keys[:4]), fill=(50, 80, 120), font=FONT_SMALL)
            preview = image.copy()
            if bbox:
                px = ImageDraw.Draw(preview)
                px.rectangle(bbox, outline=(255, 0, 0), width=1)
                for comp in comps[:4]:
                    px.rectangle(comp["bbox"], outline=(50, 140, 255), width=1)
            preview.thumbnail((card_w - 24, 94), Image.Resampling.NEAREST)
            px = ox + (card_w - preview.width) // 2
            py = oy + 72 + (94 - preview.height) // 2
            checker = Image.new("RGB", preview.size, (248, 248, 248))
            checker.paste(preview, (0, 0), preview)
            page.paste(checker, (px, py))
        pages.append(page)
    paths = []
    for i, page in enumerate(pages, 1):
        out = OUT_DIR / f"crop-candidates-{i:02d}.png"
        page.save(out)
        paths.append(out)
    return paths


def main():
    rows = candidate_rows()
    rows.sort(key=lambda row: (row[0], frame_index(row[2]), ",".join(row[4])))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with (OUT_DIR / "crop-candidates.csv").open("w") as handle:
        handle.write("character,name,frame,path,reasons,keys\n")
        for character_id, name, public_path, keys, reasons, *_ in rows:
            handle.write(f"{character_id},{name},{frame_index(public_path)},{public_path},{'|'.join(reasons)},{'|'.join(keys)}\n")
    paths = draw_sheet(rows)
    print(json.dumps({"candidates": len(rows), "sheets": [str(p.relative_to(REPO)) for p in paths]}, indent=2))


if __name__ == "__main__":
    main()
