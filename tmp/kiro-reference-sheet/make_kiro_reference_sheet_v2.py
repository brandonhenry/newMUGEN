from __future__ import annotations

import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SRC = Path("/var/folders/y3/ngggszjx48b3jxjh6ydxdmvm0000gn/T/codex-clipboard-275d6ad5-203c-4e75-9180-c638b9bc7156.png")
KIRO_FRAMES = ROOT / "public/characters/kiro/frames"
OUT_DIR = ROOT / "tmp/kiro-reference-sheet"
PUBLIC_DIR = ROOT / "public/characters/kiro/generated-sheets"

SOURCE_BG = (144, 176, 216, 255)
KIRO_BG = (128, 128, 255, 255)
MATCH_SIZE = 40
MATCH_THRESHOLD = 0.70
MAX_REFERENCE_FRAME = 100


def strip_source_background(im: Image.Image) -> Image.Image:
    src = im.convert("RGBA")
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    in_px = src.load()
    out_px = out.load()
    width, height = src.size
    for y in range(height):
        for x in range(width):
            rgba = in_px[x, y]
            if rgba == SOURCE_BG:
                continue
            if x >= 246 and y >= 1690:
                continue
            out_px[x, y] = rgba
    return out


def connected_components(mask: Image.Image) -> list[dict]:
    width, height = mask.size
    px = mask.load()
    seen = bytearray(width * height)
    components = []
    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if seen[idx] or px[x, y] == 0:
                continue
            q = deque([(x, y)])
            seen[idx] = 1
            pts = []
            while q:
                cx, cy = q.popleft()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height:
                        ni = ny * width + nx
                        if not seen[ni] and px[nx, ny] != 0:
                            seen[ni] = 1
                            q.append((nx, ny))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            components.append(
                {
                    "size": len(pts),
                    "bbox": (min(xs), min(ys), max(xs), max(ys)),
                    "pts": pts,
                }
            )
    return components


def mask_signature(mask: Image.Image) -> Image.Image:
    bbox = mask.getbbox()
    if not bbox:
        return Image.new("1", (MATCH_SIZE, MATCH_SIZE), 0)
    crop = mask.crop(bbox).resize((MATCH_SIZE, MATCH_SIZE), Image.Resampling.NEAREST)
    return crop.point(lambda a: 255 if a else 0).convert("1")


def iou(a: Image.Image, b: Image.Image) -> float:
    a_l = a.convert("1")
    b_l = b.convert("1")
    inter_img = ImageChops.logical_and(a_l, b_l)
    union_img = ImageChops.logical_or(a_l, b_l)
    inter = inter_img.getbbox()
    union = union_img.getbbox()
    if not union:
        return 0.0
    inter_count = sum(1 for v in inter_img.getdata() if v)
    union_count = sum(1 for v in union_img.getdata() if v)
    return inter_count / union_count if union_count else 0.0


def load_kiro_candidates() -> list[dict]:
    candidates = []
    for frame_path in sorted(KIRO_FRAMES.glob("frame-*.png")):
        frame_id = int(frame_path.stem.split("-")[1])
        if frame_id > MAX_REFERENCE_FRAME:
            continue
        im = Image.open(frame_path).convert("RGBA")
        bbox = im.getbbox()
        if not bbox:
            continue
        crop = im.crop(bbox)
        bw = bbox[2] - bbox[0]
        bh = bbox[3] - bbox[1]
        if bh < 18 or bw < 8:
            continue
        mask = crop.getchannel("A").point(lambda a: 255 if a else 0).convert("L")
        candidates.append(
            {
                "id": frame_id,
                "path": frame_path,
                "crop": crop,
                "bbox": bbox,
                "w": bw,
                "h": bh,
                "area": sum(1 for a in mask.getdata() if a),
                "sig": mask_signature(mask),
            }
        )
    return candidates


def recolor_fallback(src: Image.Image) -> Image.Image:
    # Stronger local transformation: old Kiro-style dark upper body, orange lower body.
    components = connected_components(src.getchannel("A"))
    component_by_pixel = {}
    for idx, comp in enumerate(components):
        for px, py in comp["pts"]:
            component_by_pixel[(px, py)] = idx

    palette_sets = {
        "orange": {
            (184, 80, 24),
            (248, 112, 16),
            (240, 104, 16),
            (248, 168, 16),
            (160, 96, 24),
            (152, 72, 32),
            (136, 64, 64),
            (176, 16, 56),
        },
        "skin": {
            (200, 128, 104),
            (208, 128, 80),
            (248, 152, 88),
            (248, 176, 136),
            (216, 128, 152),
            (248, 208, 176),
            (248, 224, 176),
        },
        "hair": {(248, 248, 24), (248, 232, 0), (248, 248, 160), (240, 248, 184)},
        "blue": {(24, 48, 192), (40, 80, 248), (48, 152, 32)},
        "black": {(0, 0, 0), (8, 0, 0), (32, 32, 48)},
        "gray": {
            (96, 96, 128),
            (103, 119, 119),
            (135, 144, 144),
            (168, 179, 208),
            (176, 176, 152),
            (177, 176, 150),
            (136, 136, 120),
            (133, 133, 117),
            (183, 215, 183),
            (224, 224, 224),
        },
        "white": {(248, 248, 248), (240, 240, 240), (248, 248, 224), (248, 240, 232), (236, 233, 216)},
        "smoke": {
            (224, 192, 136),
            (248, 208, 128),
            (248, 192, 96),
            (248, 240, 200),
            (248, 246, 200),
            (248, 248, 200),
            (248, 248, 208),
            (224, 216, 168),
        },
    }

    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    in_px = src.load()
    out_px = out.load()
    comp_bboxes = [c["bbox"] for c in components]
    width, height = src.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = in_px[x, y]
            if a == 0:
                continue
            rgb = (r, g, b)
            comp_id = component_by_pixel.get((x, y))
            x0, y0, x1, y1 = comp_bboxes[comp_id] if comp_id is not None else (x, y, x, y)
            bh = max(1, y1 - y0 + 1)
            rel_y = (y - y0) / bh
            if rgb in palette_sets["black"]:
                nrgb = (8, 8, 8)
            elif rgb in palette_sets["blue"]:
                nrgb = (33, 33, 222) if rgb == (40, 80, 248) else (0, 0, 99)
            elif rgb in palette_sets["hair"]:
                nrgb = (255, 247, 24) if r >= 248 else (189, 165, 0)
            elif rgb in palette_sets["skin"]:
                nrgb = (255, 222, 156) if r >= 248 and g >= 208 else (255, 156, 90) if r >= 240 else (198, 115, 57)
            elif rgb in palette_sets["orange"]:
                if rel_y < 0.58 and bh >= 25:
                    nrgb = (31, 31, 36) if r < 200 else (82, 82, 82)
                else:
                    nrgb = (156, 66, 0) if r < 200 else (255, 140, 0)
            elif rgb in palette_sets["gray"]:
                nrgb = (165, 165, 189) if rel_y < 0.62 else (82, 82, 82)
            elif rgb in palette_sets["white"]:
                nrgb = (255, 255, 255)
            elif rgb in palette_sets["smoke"]:
                nrgb = (255, 255, 255) if r >= 248 and g >= 240 else (255, 222, 156)
            else:
                nrgb = rgb
            out_px[x, y] = (*nrgb, a)
    return out


def candidate_source_components(src: Image.Image) -> list[dict]:
    comps = connected_components(src.getchannel("A"))
    usable = []
    for idx, comp in enumerate(comps):
        x0, y0, x1, y1 = comp["bbox"]
        bw = x1 - x0 + 1
        bh = y1 - y0 + 1
        size = comp["size"]
        # Body-sized components only. Effects, text fragments, and the large summon are kept from fallback.
        if not (80 <= size <= 2800 and 10 <= bw <= 95 and 20 <= bh <= 95):
            continue
        if y0 >= 1660 and x0 >= 230:
            continue
        mask = Image.new("L", (bw, bh), 0)
        mask_px = mask.load()
        for px, py in comp["pts"]:
            mask_px[px - x0, py - y0] = 255
        usable.append({**comp, "index": idx, "w": bw, "h": bh, "sig": mask_signature(mask)})
    return usable


def best_match(component: dict, candidates: list[dict]) -> tuple[dict | None, float]:
    best = None
    best_score = 0.0
    bw = component["w"]
    bh = component["h"]
    area = component["size"]
    for cand in candidates:
        ratio_penalty = min(bw / cand["w"], cand["w"] / bw, bh / cand["h"], cand["h"] / bh)
        if ratio_penalty < 0.72:
            continue
        area_penalty = min(area / cand["area"], cand["area"] / area)
        if area_penalty < 0.55:
            continue
        shape = iou(component["sig"], cand["sig"])
        score = shape * 0.55 + ratio_penalty * 0.30 + area_penalty * 0.15
        if score > best_score:
            best = cand
            best_score = score
    return best, best_score


def clear_component(canvas: Image.Image, component: dict, padding: int = 1):
    px = canvas.load()
    width, height = canvas.size
    pts = set(component["pts"])
    for x, y in component["pts"]:
        for dx in range(-padding, padding + 1):
            for dy in range(-padding, padding + 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and (dx == 0 and dy == 0 or (x, y) in pts):
                    px[nx, ny] = (0, 0, 0, 0)


def stamp_match(canvas: Image.Image, component: dict, cand: dict):
    x0, y0, x1, y1 = component["bbox"]
    bw = x1 - x0 + 1
    bh = y1 - y0 + 1
    crop = cand["crop"]
    scale = min(bw / crop.width, bh / crop.height)
    # Preserve the source pose footprint; Kiro frames are already pixel art, so use nearest.
    new_size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(new_size, Image.Resampling.NEAREST)
    cx = (x0 + x1) // 2
    cy = (y0 + y1) // 2
    paste_x = round(cx - crop.width / 2)
    paste_y = round(cy - crop.height / 2)
    canvas.alpha_composite(crop, (paste_x, paste_y))


def make_sheet():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    source_alpha = strip_source_background(Image.open(SRC))
    fallback = recolor_fallback(source_alpha)
    output = fallback.copy()

    candidates = load_kiro_candidates()
    source_components = candidate_source_components(source_alpha)
    report = []
    matched = 0
    for comp in source_components:
        cand, score = best_match(comp, candidates)
        if cand and score >= MATCH_THRESHOLD:
            clear_component(output, comp)
            stamp_match(output, comp, cand)
            matched += 1
            report.append(
                {
                    "source_bbox": comp["bbox"],
                    "source_size": comp["size"],
                    "kiro_frame": cand["id"],
                    "score": round(score, 4),
                }
            )

    preview = Image.new("RGBA", output.size, KIRO_BG)
    preview.alpha_composite(output)

    transparent_path = PUBLIC_DIR / "naruto-reference-sheet-kiro-reference-v2-transparent.png"
    preview_path = PUBLIC_DIR / "naruto-reference-sheet-kiro-reference-v2-preview.png"
    tmp_transparent_path = OUT_DIR / transparent_path.name
    tmp_preview_path = OUT_DIR / preview_path.name
    output.save(transparent_path)
    preview.save(preview_path)
    output.save(tmp_transparent_path)
    preview.save(tmp_preview_path)
    (OUT_DIR / "naruto-reference-sheet-kiro-reference-v2-report.json").write_text(
        json.dumps(
            {
                "source": str(SRC),
                "kiroReference": str(ROOT / "public/characters/kiro/animation-sheet.png"),
                "candidateFrames": len(candidates),
                "sourceComponentsConsidered": len(source_components),
                "matchedComponents": matched,
                "matchThreshold": MATCH_THRESHOLD,
                "matches": report,
            },
            indent=2,
        )
    )
    print(f"matched {matched}/{len(source_components)} body-sized source components")
    print(transparent_path)
    print(preview_path)


if __name__ == "__main__":
    make_sheet()
