#!/usr/bin/env python3
import csv
import json
from collections import defaultdict, deque
from pathlib import Path
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
CSV_PATH = REPO / "tmp" / "voxel-scale-all-states-audit" / "crop-review" / "crop-candidates.csv"
REPORT_PATH = REPO / "tmp" / "voxel-scale-all-states-audit" / "crop-review" / "stacked-crop-repairs.json"
ALPHA = 12


def components(image):
    width, height = image.size
    pixels = image.load()
    seen = bytearray(width * height)
    result = []
    for y in range(height):
        for x in range(width):
            key = y * width + x
            if seen[key] or pixels[x, y][3] <= ALPHA:
                continue
            seen[key] = 1
            queue = deque([(x, y)])
            x0 = x1 = x
            y0 = y1 = y
            area = 0
            while queue:
                cx, cy = queue.popleft()
                area += 1
                x0 = min(x0, cx)
                x1 = max(x1, cx)
                y0 = min(y0, cy)
                y1 = max(y1, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nkey = ny * width + nx
                    if seen[nkey] or pixels[nx, ny][3] <= ALPHA:
                        continue
                    seen[nkey] = 1
                    queue.append((nx, ny))
            result.append({
                "bbox": (x0, y0, x1, y1),
                "area": area,
                "w": x1 - x0 + 1,
                "h": y1 - y0 + 1,
                "cx": (x0 + x1) / 2,
                "cy": (y0 + y1) / 2,
            })
    result.sort(key=lambda comp: comp["area"], reverse=True)
    return result


def stacked_crop_box(image):
    comps = components(image)
    ink = sum(comp["area"] for comp in comps)
    big = [
        comp for comp in comps
        if comp["area"] >= max(12, ink * 0.08) and comp["h"] >= 14 and comp["w"] >= 8
    ]
    if len(big) < 2:
        return None
    by_y = sorted(big, key=lambda comp: comp["cy"])
    gaps = [(by_y[i + 1]["cy"] - by_y[i]["cy"], i) for i in range(len(by_y) - 1)]
    gap, split_index = max(gaps)
    max_height = max(comp["h"] for comp in big)
    if gap < max(28, max_height * 0.65):
        return None

    x_centers = [comp["cx"] for comp in big]
    if max(x_centers) - min(x_centers) > 90 and gap < max_height * 1.1:
        return None

    keep = by_y[:split_index + 1]
    x0 = max(0, min(comp["bbox"][0] for comp in keep) - 1)
    y0 = max(0, min(comp["bbox"][1] for comp in keep) - 1)
    x1 = min(image.size[0], max(comp["bbox"][2] for comp in keep) + 2)
    y1 = min(image.size[1], max(comp["bbox"][3] for comp in keep) + 2)
    return (x0, y0, x1, y1)


def repair_rows():
    rows = []
    with CSV_PATH.open() as handle:
        for row in csv.DictReader(handle):
            reasons = row["reasons"].split("|")
            if "split-cells" not in reasons and not any("components" in reason for reason in reasons):
                continue
            frame_path = REPO / "public" / row["path"].lstrip("/")
            image = Image.open(frame_path).convert("RGBA")
            box = stacked_crop_box(image)
            if not box:
                continue
            rows.append({**row, "framePath": frame_path, "cropBox": box})
    return rows


def main():
    rows = repair_rows()
    by_character = defaultdict(list)
    for row in rows:
        by_character[row["character"]].append(row)

    report = []
    for character_id, character_rows in sorted(by_character.items()):
        metadata_path = REPO / "public" / "characters" / character_id / "frames" / "frames.json"
        metadata = json.loads(metadata_path.read_text())
        frames_by_index = {int(frame["index"]): frame for frame in metadata.get("frames", [])}
        for row in character_rows:
            frame_index = int(row["frame"])
            image = Image.open(row["framePath"]).convert("RGBA")
            x0, y0, x1, y1 = row["cropBox"]
            cropped = image.crop((x0, y0, x1, y1))
            cropped.save(row["framePath"])

            frame_meta = frames_by_index.get(frame_index)
            if frame_meta:
                old_box = frame_meta["box"]
                frame_meta["box"] = [
                    old_box[0] + x0,
                    old_box[1] + y0,
                    old_box[0] + x1,
                    old_box[1] + y1,
                ]
                frame_meta["width"] = x1 - x0
                frame_meta["height"] = y1 - y0

            report.append({
                "character": character_id,
                "frame": frame_index,
                "keys": row["keys"].split("|"),
                "cropBox": [x0, y0, x1, y1],
                "newSize": [x1 - x0, y1 - y0],
            })
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")

    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({
        "repairedFrames": len(report),
        "characters": sorted(by_character.keys()),
        "report": str(REPORT_PATH.relative_to(REPO)),
    }, indent=2))


if __name__ == "__main__":
    main()
