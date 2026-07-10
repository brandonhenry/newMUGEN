#!/usr/bin/env python3
"""Batch-import KORE sprite-sheet characters into public/characters.

The source sheets are Jump-style sprite sheets with one PNG per folder. This
script crops detected frames, writes image-source character manifests, and keeps
the existing hand-authored Naruto/Sasuke manifests untouched.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import unicodedata
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image

from synthesize_crouch_composites import synthesize_character


SOURCE_ROOT = Path("/Users/brandonhenry/Documents/Kore/Characters/sprite-sheets")
PROTECTED_IDS = {"kiro", "riven"}
SKIP_EXACT = {
    "Naruto Uzumaki",
    "Sasuke Uchiha",
    "Koma Man (Green)",
    "Koma Man (Red)",
    "Koma Man (Yellow)",
    "Phoenix Ikki",
    "Ryotsu Kankichi (2)",
    "Yukime",
}
SKIP_CONTAINS = ("Intro", "Komas", "Protagonists")
SKIP_NAMES = {"Help Komas", "Info Screen"}
VARIANT_OF = {
    "goku-super-saiyan": "goku",
    "vegeta-super-saiyan": "vegeta",
    "gotenks-super-saiyan": "gotenks",
    "monkey-d-luffy-2nd-gear": "monkey-d-luffy",
    "nami-perfect-clima-tact": "nami",
    "yoh-asakura-power-sword": "yoh-asakura",
    "naruto-uzumaki-nine-tails-kyubi": "kiro",
    "gohan-super-saiyan-2": "gohan-super-saiyan",
}

BASE_ANIMATION_KEYS = [
    "idle",
    "walkForward",
    "walkBack",
    "sprint",
    "backHop",
    "sidestepLeft",
    "sidestepRight",
    "jump",
    "crouch",
    "crouchBlock",
    "block",
    "chargeKi",
    "jableft",
    "jabright",
    "kickleft",
    "kickright",
    "hitLight",
    "hitHeavy",
    "juggle",
    "knockdown",
    "getupStand",
    "getupRollUp",
    "win",
    "lose",
]

COMMAND_KEYS = [
    "cmd:f+1",
    "cmd:d/f+2",
    "cmd:qcf+4",
    "cmd:WS+4",
    "cmd:FC+1",
    "cmd:FC+2",
    "cmd:1+2",
    "cmd:1+3",
    "cmd:2+3",
    "cmd:2+4",
    "cmd:3+4",
    "cmd:O+2",
]

NEUTRAL_ROUTE_KEYS = [
    "neutral:jab-jab",
    "neutral:jab-jab-heavy",
    "neutral:jab-jab-kick",
    "neutral:jab-jab-special",
    "neutral:jab-heavy",
    "neutral:jab-heavy-kick",
    "neutral:jab-heavy-special",
    "neutral:jab-kick",
    "neutral:jab-kick-heavy",
    "neutral:jab-kick-special",
    "neutral:jab-special",
    "neutral:jab-special-heavy",
    "neutral:heavy-jab",
    "neutral:heavy-jab-heavy",
    "neutral:heavy-jab-special",
    "neutral:heavy-kick",
    "neutral:heavy-kick-special",
    "neutral:heavy-special",
    "neutral:heavy-special-kick",
    "neutral:kick-jab",
    "neutral:kick-jab-special",
    "neutral:kick-heavy",
    "neutral:kick-heavy-special",
    "neutral:kick-special",
    "neutral:kick-special-heavy",
    "neutral:special-jab",
    "neutral:special-jab-heavy",
    "neutral:special-heavy",
    "neutral:special-kick",
]

ANIMATION_RATES = {
    "idle": 5,
    "walkForward": 10,
    "walkBack": 8,
    "sprint": 12,
    "backHop": 10,
    "sidestepLeft": 10,
    "sidestepRight": 10,
    "crouch": 5,
    "crouchBlock": 5,
    "jump": 8,
    "block": 5,
    "chargeKi": 6,
    "jableft": 10,
    "jabright": 10,
    "kickleft": 9,
    "kickright": 9,
    "hitLight": 8,
    "hitHeavy": 8,
    "juggle": 8,
    "knockdown": 8,
    "getupStand": 7,
    "getupRollUp": 7,
    "win": 5,
    "lose": 4,
    "cmd:f+1": 10,
    "cmd:d/f+2": 9,
    "cmd:qcf+4": 9,
    "cmd:WS+4": 9,
    "cmd:FC+1": 8,
    "cmd:FC+2": 8,
    "cmd:1+2": 8,
    "cmd:1+3": 8,
    "cmd:2+3": 8,
    "cmd:2+4": 8,
    "cmd:3+4": 8,
    "cmd:O+2": 8,
}

ANIMATION_NAMES = {
    "idle": "idle",
    "walkForward": "walkForward",
    "walkBack": "walkBack",
    "sprint": "sprint",
    "backHop": "backHop",
    "sidestepLeft": "sidestepLeft",
    "sidestepRight": "sidestepRight",
    "crouch": "crouch",
    "crouchBlock": "crouchBlock",
    "jump": "jump",
    "block": "block",
    "chargeKi": "chargeKi",
    "jab": "jableft",
    "heavy": "jabright",
    "kick": "kickleft",
    "special": "kickright",
    "jableft": "jableft",
    "jabright": "jabright",
    "kickleft": "kickleft",
    "kickright": "kickright",
    "hitLight": "hitLight",
    "hitHeavy": "hitHeavy",
    "juggle": "juggle",
    "knockdown": "knockdown",
    "getupStand": "getupStand",
    "getupRollUp": "getupRollUp",
    "win": "win",
    "lose": "lose",
}

MOVE_LABEL_STEMS = (
    "Rush",
    "Burst",
    "Launcher",
    "Counter",
    "Sweep",
    "Rising Strike",
    "Twin Assault",
    "Cross Break",
    "Low Feint",
    "Driving Kick",
    "Power Crush",
    "Aura Drive",
)

NEUTRAL_LABELS = (
    "Second Beat",
    "Body Blow",
    "Low Changeup",
    "Pressure Feint",
    "Drive",
    "Barrage",
    "Finisher",
    "Step Kick",
    "Palm String",
    "Rising Chain",
    "Special Setup",
    "Break Art",
    "Check Hook",
    "Heavy Break",
    "Charged Follow",
    "Drop Kick",
    "Arc Finisher",
    "Focus Stance",
    "Mode Shift",
    "Heel Feint",
    "Summon Strike",
    "Guard Snare",
    "Armor Break",
    "Power Setup",
    "Switch Strike",
    "Spark Jab",
    "Binding Blow",
    "Heavy Draw",
    "Kick Ender",
)


Box = tuple[int, int, int, int]
TEAL_CELL_COLOR = (0, 152, 128)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    out: list[str] = []
    last_dash = False
    for char in ascii_value.lower():
        if char.isalnum():
            out.append(char)
            last_dash = False
        elif not last_dash:
            out.append("-")
            last_dash = True
    return "".join(out).strip("-") or "imported-fighter"


def should_skip_folder(name: str) -> bool:
    return name in SKIP_EXACT or name in SKIP_NAMES or any(part in name for part in SKIP_CONTAINS)


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return math.sqrt(sum((a[index] - b[index]) ** 2 for index in range(3)))


def sample_backgrounds(image: Image.Image) -> list[tuple[int, int, int]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    samples: dict[tuple[int, int, int], int] = {}
    points: list[tuple[int, int]] = []
    step_x = max(1, width // 32)
    step_y = max(1, height // 32)
    for x in range(0, width, step_x):
        points.append((x, 0))
        points.append((x, height - 1))
    for y in range(0, height, step_y):
        points.append((0, y))
        points.append((width - 1, y))
    corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
    points.extend(corners)
    for x, y in points:
        red, green, blue, alpha = pixels[x, y]
        if alpha <= 16:
            continue
        key = (red // 8 * 8, green // 8 * 8, blue // 8 * 8)
        samples[key] = samples.get(key, 0) + 1
    ranked = sorted(samples.items(), key=lambda entry: entry[1], reverse=True)
    backgrounds = [color for color, _ in ranked[:6]]
    return backgrounds or [(255, 255, 255), (0, 0, 0)]


def is_background_pixel(pixel: tuple[int, int, int, int], backgrounds: list[tuple[int, int, int]], tolerance: float = 82) -> bool:
    red, green, blue, alpha = pixel
    if alpha <= 16:
        return True
    return any(color_distance((red, green, blue), bg) <= tolerance for bg in backgrounds)


def build_border_background_mask(image: Image.Image, backgrounds: list[tuple[int, int, int]]) -> bytearray:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    mask = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        if x < 0 or y < 0 or x >= width or y >= height:
            return
        key = y * width + x
        if mask[key] or not is_background_pixel(pixels[x, y], backgrounds):
            return
        mask[key] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(1, height - 1):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        enqueue(x - 1, y)
        enqueue(x + 1, y)
        enqueue(x, y - 1)
        enqueue(x, y + 1)
    return mask


def dominant_border_backgrounds(image: Image.Image, backgrounds: list[tuple[int, int, int]], max_colors: int = 16) -> list[tuple[int, int, int]]:
    return backgrounds[:1] or [(255, 255, 255)]


def group_boolean_runs(values: list[bool], gap_tolerance: int, min_length: int) -> list[tuple[int, int]]:
    groups: list[tuple[int, int]] = []
    start = -1
    last = -1
    gap = 0
    for index, value in enumerate(values):
        if value:
            if start < 0:
                start = index
            last = index
            gap = 0
        elif start >= 0:
            gap += 1
            if gap > gap_tolerance:
                if last - start + 1 >= min_length:
                    groups.append((start, last))
                start = -1
                last = -1
                gap = 0
    if start >= 0 and last - start + 1 >= min_length:
        groups.append((start, last))
    return groups


def trim_box(ink: bytearray, width: int, height: int, left: int, top: int, right: int, bottom: int) -> Box | None:
    min_x = right
    min_y = bottom
    max_x = left
    max_y = top
    found = False
    for y in range(max(0, top), min(height, bottom + 1)):
        row = y * width
        for x in range(max(0, left), min(width, right + 1)):
            if not ink[row + x]:
                continue
            found = True
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
    if not found:
        return None
    return max(0, min_x - 1), max(0, min_y - 1), min(width, max_x + 2), min(height, max_y + 2)


def boxes_overlap_with_padding(a: Box, b: Box, padding: int) -> bool:
    return a[0] - padding <= b[2] and a[2] + padding >= b[0] and a[1] - padding <= b[3] and a[3] + padding >= b[1]


def merge_nearby_boxes(boxes: list[Box], width: int, height: int, padding: int) -> list[Box]:
    merged = list(boxes)
    changed = True
    while changed:
        changed = False
        for index in range(len(merged)):
            for other in range(index + 1, len(merged)):
                if not boxes_overlap_with_padding(merged[index], merged[other], padding):
                    continue
                merged[index] = (
                    max(0, min(merged[index][0], merged[other][0])),
                    max(0, min(merged[index][1], merged[other][1])),
                    min(width, max(merged[index][2], merged[other][2])),
                    min(height, max(merged[index][3], merged[other][3])),
                )
                merged.pop(other)
                changed = True
                break
            if changed:
                break
    return merged


def detect_connected_boxes(ink: bytearray, width: int, height: int, merge_padding: int | None = 2) -> list[dict[str, Any]]:
    visited = bytearray(width * height)
    raw: list[Box] = []
    minimum_area = max(8, round(width * height * 0.000006))
    for start in range(width * height):
        if visited[start]:
            continue
        visited[start] = 1
        if not ink[start]:
            continue
        queue: deque[int] = deque([start])
        area = 0
        min_x = width
        min_y = height
        max_x = -1
        max_y = -1
        while queue:
            key = queue.popleft()
            x = key % width
            y = key // width
            area += 1
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            for ny in range(y - 1, y + 2):
                for nx in range(x - 1, x + 2):
                    if nx == x and ny == y:
                        continue
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    next_key = ny * width + nx
                    if visited[next_key]:
                        continue
                    visited[next_key] = 1
                    if ink[next_key]:
                        queue.append(next_key)
        box_width = max_x - min_x + 1
        box_height = max_y - min_y + 1
        if area >= minimum_area and box_width >= 3 and box_height >= 3:
            raw.append((max(0, min_x - 1), max(0, min_y - 1), min(width, max_x + 2), min(height, max_y + 2)))

    # A small padding glues limbs/weapons that are separated by antialias gaps while
    # still keeping adjacent sprites split on compact sprite sheets. Some packed
    # sheets have frames close enough that this creates one chain across a row; the
    # caller can disable merging for that fallback.
    merged = raw if merge_padding is None else merge_nearby_boxes(raw, width, height, padding=merge_padding)
    merged = [box for box in merged if box[2] - box[0] >= 4 and box[3] - box[1] >= 4]
    merged.sort(key=lambda box: (box[1], box[0]))
    row = -1
    current_bottom = -10_000
    entries: list[dict[str, Any]] = []
    for box in merged:
        if box[1] > current_bottom + 8:
            row += 1
            current_bottom = box[3]
        else:
            current_bottom = max(current_bottom, box[3])
        entries.append({"box": box, "row": max(0, row)})
    return entries


def transparent_cell_crop(image: Image.Image, box: Box) -> Image.Image:
    crop = image.convert("RGBA").crop(box)
    pixels = crop.load()
    width, height = crop.size
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha <= 16 or (red, green, blue) == TEAL_CELL_COLOR:
                pixels[x, y] = (red, green, blue, 0)
    return crop


def has_character_body_pixels(crop: Image.Image) -> bool:
    raw = crop.convert("RGBA").tobytes()
    pixels = [
        (raw[index], raw[index + 1], raw[index + 2], raw[index + 3])
        for index in range(0, len(raw), 4)
        if raw[index + 3] > 16
    ]
    if not pixels:
        return False
    body_like = 0
    red_effect = 0
    for red, green, blue, _ in pixels:
        skin = red >= 180 and green >= 120 and blue >= 70
        orange_gi = red >= 180 and 70 <= green <= 140 and blue <= 80
        dark_hair_or_line = red <= 45 and green <= 45 and blue <= 45
        if skin or orange_gi or dark_hair_or_line:
            body_like += 1
        if red >= 130 and green <= 90 and blue <= 90:
            red_effect += 1
    if red_effect / max(1, len(pixels)) > 0.55 and body_like < max(35, len(pixels) * 0.18):
        return False
    return body_like >= 20 or len(pixels) >= 120


def detect_teal_cell_boxes(image: Image.Image) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    mask = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 16 and (red, green, blue) == TEAL_CELL_COLOR:
                mask[row + x] = 1

    visited = bytearray(width * height)
    raw: list[Box] = []
    for start in range(width * height):
        if visited[start] or not mask[start]:
            continue
        queue: deque[int] = deque([start])
        visited[start] = 1
        area = 0
        min_x = width
        min_y = height
        max_x = -1
        max_y = -1
        while queue:
            key = queue.popleft()
            x = key % width
            y = key // width
            area += 1
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                next_key = ny * width + nx
                if visited[next_key] or not mask[next_key]:
                    continue
                visited[next_key] = 1
                queue.append(next_key)
        box_width = max_x - min_x + 1
        box_height = max_y - min_y + 1
        if area >= 120 and box_width >= 12 and box_height >= 14:
            raw.append((min_x, min_y, max_x + 1, max_y + 1))

    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    rows: list[dict[str, Any]] = []
    for box in sorted(raw, key=lambda candidate: (candidate[1], candidate[0])):
        left, top, right, bottom = box
        reason = ""
        if left >= width * 0.66:
            reason = "right-side-credit-or-palette"
        elif not has_character_body_pixels(transparent_cell_crop(rgba, box)):
            reason = "effect-only-or-empty-cell"

        center_y = (top + bottom) / 2
        row_height = bottom - top
        if not rows or center_y > rows[-1]["centerY"] + max(18, rows[-1]["height"] * 0.72):
            rows.append({"centerY": center_y, "height": row_height})
        else:
            row = rows[-1]
            row["centerY"] = (row["centerY"] + center_y) / 2
            row["height"] = max(row["height"], row_height)
        entry = {"box": box, "row": len(rows) - 1, "source": "teal-cell"}
        if reason:
            excluded.append({**entry, "excludeReason": reason})
        else:
            included.append(entry)
    return included, excluded


def filter_dense_connected_sprite_boxes(entries: list[dict[str, Any]], width: int, height: int) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    for entry in entries:
        left, top, right, bottom = entry["box"]
        box_width = right - left
        box_height = bottom - top
        if box_width < 12 or box_height < 16:
            continue
        if box_width > width * 0.12 and box_height > height * 0.12:
            continue
        if top >= height * 0.88 and left >= width * 0.48:
            continue
        filtered.append(dict(entry))
    if not filtered:
        return filtered
    ordered = sorted(
        filtered,
        key=lambda entry: (
            (entry["box"][1] + entry["box"][3]) / 2,
            entry["box"][0],
        ),
    )
    rows: list[dict[str, Any]] = []
    for entry in ordered:
        left, top, right, bottom = entry["box"]
        center_y = (top + bottom) / 2
        box_height = bottom - top
        if not rows or center_y > rows[-1]["centerY"] + max(18, rows[-1]["height"] * 0.72):
            rows.append({"centerY": center_y, "height": box_height, "entries": [entry]})
            continue
        row = rows[-1]
        row["entries"].append(entry)
        count = len(row["entries"])
        row["centerY"] = (row["centerY"] * (count - 1) + center_y) / count
        row["height"] = max(row["height"], box_height)
    rerowed: list[dict[str, Any]] = []
    for row_index, row in enumerate(rows):
        for entry in sorted(row["entries"], key=lambda candidate: (candidate["box"][0], candidate["box"][1])):
            entry["row"] = row_index
            rerowed.append(entry)
    return rerowed


def detect_dense_projection_boxes(ink: bytearray, width: int, height: int) -> list[dict[str, Any]]:
    row_counts = [0] * height
    for y in range(height):
        offset = y * width
        row_counts[y] = sum(1 for x in range(width) if ink[offset + x])
    row_threshold = max(4, min(32, int(width * 0.035)))
    row_groups = group_boolean_runs([count >= row_threshold for count in row_counts], gap_tolerance=3, min_length=6)
    boxes: list[dict[str, Any]] = []
    for row_index, (row_start, row_end) in enumerate(row_groups):
        row_height = row_end - row_start + 1
        column_counts = [0] * width
        for y in range(row_start, row_end + 1):
            offset = y * width
            for x in range(width):
                if ink[offset + x]:
                    column_counts[x] += 1
        column_threshold = max(3, min(24, int(row_height * 0.1)))
        column_groups = group_boolean_runs([count >= column_threshold for count in column_counts], gap_tolerance=3, min_length=4)
        for column_start, column_end in column_groups:
            box = trim_box(ink, width, height, column_start, row_start, column_end, row_end)
            if not box:
                continue
            box_width = box[2] - box[0]
            box_height = box[3] - box[1]
            if box_width >= 8 and box_height >= 8:
                boxes.append({"box": box, "row": row_index})
    return boxes


def detect_projection_boxes(image: Image.Image) -> list[dict[str, Any]]:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    backgrounds = sample_backgrounds(rgba)
    background_mask = build_border_background_mask(rgba, backgrounds)
    ink = bytearray(width * height)
    row_has_ink = [False] * height
    column_has_ink = [False] * width

    for y in range(height):
        row = y * width
        for x in range(width):
            key = row + x
            if background_mask[key]:
                continue
            if is_background_pixel(pixels[x, y], backgrounds, tolerance=38):
                continue
            ink[key] = 1
            row_has_ink[y] = True
            column_has_ink[x] = True

    row_groups = group_boolean_runs(row_has_ink, gap_tolerance=6, min_length=6)
    boxes: list[dict[str, Any]] = []
    for row_index, (row_start, row_end) in enumerate(row_groups):
        columns = [False] * width
        for y in range(row_start, row_end + 1):
            row = y * width
            for x in range(width):
                if ink[row + x]:
                    columns[x] = True
        for column_start, column_end in group_boolean_runs(columns, gap_tolerance=6, min_length=5):
            box = trim_box(ink, width, height, column_start, row_start, column_end, row_end)
            if not box:
                continue
            box_width = box[2] - box[0]
            box_height = box[3] - box[1]
            if box_width >= 8 and box_height >= 8:
                boxes.append({"box": box, "row": row_index})

    dense_boxes = detect_dense_projection_boxes(ink, width, height)
    connected_boxes = detect_connected_boxes(ink, width, height)
    dense_connected_boxes = filter_dense_connected_sprite_boxes(detect_connected_boxes(ink, width, height, merge_padding=None), width, height)
    projection_area = sum((entry["box"][2] - entry["box"][0]) * (entry["box"][3] - entry["box"][1]) for entry in boxes)
    dense_area = sum((entry["box"][2] - entry["box"][0]) * (entry["box"][3] - entry["box"][1]) for entry in dense_boxes)
    connected_area = sum((entry["box"][2] - entry["box"][0]) * (entry["box"][3] - entry["box"][1]) for entry in connected_boxes)
    projection_aspects = [
        (entry["box"][2] - entry["box"][0]) / max(1, entry["box"][3] - entry["box"][1])
        for entry in boxes
    ]
    max_projection_aspect = max(projection_aspects) if projection_aspects else 0
    if dense_boxes and (
        len(boxes) <= 1
        or (len(boxes) < 32 and len(dense_boxes) > len(boxes))
        or projection_area > dense_area * 1.8
        or max_projection_aspect > 4.5
    ):
        boxes = dense_boxes
        projection_area = dense_area
        projection_aspects = [
            (entry["box"][2] - entry["box"][0]) / max(1, entry["box"][3] - entry["box"][1])
            for entry in boxes
        ]
        max_projection_aspect = max(projection_aspects) if projection_aspects else 0

    if connected_boxes and (
        len(boxes) <= 1
        or (len(boxes) < 32 and len(connected_boxes) > len(boxes))
        or projection_area > connected_area * 1.8
        or max_projection_aspect > 4.5
    ):
        boxes = connected_boxes

    if len(boxes) <= 2 and len(dense_connected_boxes) >= 32:
        boxes = dense_connected_boxes

    if len(boxes) <= 1:
        fallback = trim_box(ink, width, height, 0, 0, width - 1, height - 1)
        if fallback:
            boxes = [{"box": fallback, "row": 0}]

    boxes.sort(key=lambda entry: (entry["row"], entry["box"][0], entry["box"][1]))
    return boxes


def transparent_crop(image: Image.Image, box: Box, backgrounds: list[tuple[int, int, int]]) -> Image.Image:
    crop = image.convert("RGBA").crop(box)
    width, height = crop.size
    pixels = crop.load()
    background_mask = build_border_background_mask(crop, backgrounds)
    for y in range(height):
        row = y * width
        for x in range(width):
            pixel = pixels[x, y]
            if background_mask[row + x] or is_background_pixel(pixel, backgrounds, tolerance=34):
                red, green, blue, _ = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0)
    return crop


ROCK_LEE_CROP_REPAIRS: dict[int, Box] = {
    27: (0, 0, 34, 56),
    31: (17, 2, 62, 56),
    37: (0, 0, 43, 56),
    50: (0, 18, 46, 74),
    51: (0, 2, 42, 50),
    54: (0, 2, 64, 38),
    81: (10, 0, 60, 44),
    83: (5, 1, 36, 61),
    96: (0, 74, 50, 118),
    102: (0, 0, 33, 82),
    126: (5, 1, 35, 56),
    127: (4, 4, 35, 61),
    129: (8, 0, 40, 70),
    130: (26, 88, 61, 119),
    131: (31, 46, 62, 101),
}


def repair_known_character_crop(character_id: str, index: int, image: Image.Image) -> Image.Image:
    if character_id != "rock-lee":
        return image
    repair = ROCK_LEE_CROP_REPAIRS.get(index)
    if repair is None:
        return image
    left, top, right, bottom = repair
    right = min(image.width, right)
    bottom = min(image.height, bottom)
    return image.crop((max(0, left), max(0, top), right, bottom))


def load_source_image(source_path: Path) -> Image.Image:
    image = Image.open(source_path)
    try:
        image.seek(0)
    except EOFError:
        pass
    return image.convert("RGBA")


def is_footer_text_entry(entry: dict[str, Any], image: Image.Image) -> bool:
    left, top, right, bottom = (int(value) for value in entry["box"])
    width = right - left
    height = bottom - top
    return top >= image.height * 0.955 and width >= image.width * 0.25 and height <= image.height * 0.06


def filtered_projection_boxes(image: Image.Image) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    teal_included, teal_excluded = detect_teal_cell_boxes(image)
    if len(teal_included) >= 32:
        return teal_included, teal_excluded

    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for entry in detect_projection_boxes(image):
        if is_footer_text_entry(entry, image):
            excluded.append({**entry, "excludeReason": "footer-text"})
        else:
            included.append(entry)
    return included, excluded


def make_face_card(frame: Image.Image) -> Image.Image:
    card = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    working = frame.convert("RGBA")
    width, height = working.size
    scale = min(210 / max(1, width), 220 / max(1, height), 4)
    scaled = working.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.Resampling.NEAREST)
    x = (256 - scaled.size[0]) // 2
    y = 256 - scaled.size[1] - 18
    card.alpha_composite(scaled, (x, max(8, y)))
    return card


def select_frames(row_groups: list[list[int]], frame_count: int, slot_index: int, max_frames: int = 8) -> list[int]:
    fallback = [0] if frame_count else []
    if row_groups:
        group = row_groups[slot_index % len(row_groups)]
        if group:
            if len(group) <= max_frames:
                return group
            step = max(1, len(group) / max_frames)
            return sorted({group[min(len(group) - 1, int(index * step))] for index in range(max_frames)})
    return fallback


def animation_frame_map(character_id: str, frames: list[dict[str, Any]]) -> tuple[dict[str, list[str]], dict[str, float]]:
    if character_id == "rock-lee":
        return rock_lee_animation_frame_map(character_id, len(frames))
    if character_id == "kid-goku":
        return kid_goku_animation_frame_map(character_id, len(frames))
    frame_count = len(frames)
    rows: dict[int, list[int]] = {}
    for index, frame in enumerate(frames):
        rows.setdefault(int(frame["row"]), []).append(index)
    row_groups = [indexes for _, indexes in sorted(rows.items())]
    all_keys = BASE_ANIMATION_KEYS + COMMAND_KEYS
    result: dict[str, list[str]] = {}
    rates: dict[str, float] = {}
    for slot_index, key in enumerate(all_keys):
        max_frames = 10 if key in {"idle", "walkForward", "walkBack", "sprint"} else 8
        indexes = select_frames(row_groups, frame_count, slot_index, max_frames=max_frames)
        if key == "walkBack":
            indexes = list(reversed(indexes))
        result[key] = [frame_path(character_id, index) for index in indexes]
        rates[key] = ANIMATION_RATES.get(key, 8)
    result["hitHeavy"] = result.get("hitHeavy") or result.get("hitLight", [])
    result["juggle"] = result.get("juggle") or result.get("hitHeavy", [])
    return result, rates


def frame_path(character_id: str, index: int) -> str:
    return f"/characters/{character_id}/frames/frame-{index:03d}.png"


def frame_paths(character_id: str, indexes: list[int], frame_count: int) -> list[str]:
    return [frame_path(character_id, index) for index in indexes if 0 <= index < frame_count]


def rock_lee_animation_frame_map(character_id: str, frame_count: int) -> tuple[dict[str, list[str]], dict[str, float]]:
    def paths(indexes: list[int]) -> list[str]:
        return frame_paths(character_id, indexes, frame_count)

    result = {
        "idle": paths([0, 1, 2, 3, 4, 5]),
        "walkForward": paths([6, 7, 8, 9, 10, 11]),
        "walkBack": paths([11, 10, 9, 8, 7, 6]),
        "sprint": paths([12, 13, 14, 15, 16, 17]),
        "backHop": paths([18]),
        "sidestepLeft": paths([36, 37, 38]),
        "sidestepRight": paths([38, 37, 36]),
        "jump": paths([53, 54]),
        "crouch": paths([21, 22, 23]),
        "crouchBlock": paths([21]),
        "block": paths([40, 41]),
        "chargeKi": paths([102, 103, 104, 105, 106, 107]),
        "jableft": paths([38, 39, 40, 41, 42, 43]),
        "jabright": paths([44, 45, 46, 47, 48, 49]),
        "kickleft": paths([26, 28, 29, 30]),
        "kickright": paths([70, 71, 72, 73, 74, 75]),
        "hitLight": paths([146, 147, 148, 149]),
        "hitHeavy": paths([140, 141, 142, 143, 144, 145, 146]),
        "juggle": paths([54]),
        "knockdown": paths([55, 56, 57, 58, 59, 60]),
        "getupStand": paths([59, 58, 57, 19, 0]),
        "getupRollUp": paths([108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121]),
        "win": paths([84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95]),
        "lose": paths([98, 99]),
        "cmd:f+1": paths([38, 39, 40, 41, 42, 43]),
        "cmd:f+3": paths([12, 13, 14, 15, 16, 17]),
        "cmd:d+3": paths([26, 28, 29, 30]),
        "cmd:d/f+2": paths([44, 45, 46, 47, 48, 49]),
        "cmd:d/f+3": paths([32, 33, 34, 35, 36]),
        "cmd:qcf+3": paths([70, 71, 72, 73, 74, 75]),
        "cmd:qcf+4": paths([70, 71, 72, 73, 74, 75]),
        "cmd:WS+4": paths([42, 43, 44, 45, 46, 47, 48, 49]),
        "cmd:FC+1": paths([21, 22, 23, 24, 25]),
        "cmd:FC+2": paths([44, 45, 46, 47, 48, 49]),
        "cmd:1+2": paths([32, 33, 34, 35, 36]),
        "cmd:1+3": paths([108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121]),
        "cmd:2+3": paths([26, 28, 29, 30]),
        "cmd:2+4": paths([32, 33, 34, 35, 36]),
        "cmd:3+4": paths([108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121]),
        "cmd:SS+3": paths([42, 43, 44, 45, 46, 47, 48, 49]),
        "cmd:O+1": paths([102, 103, 104, 105, 106, 107]),
        "cmd:O+2": paths([134, 135, 136, 137, 138, 139]),
    }
    rates = {
        "idle": 7,
        "walkForward": 12,
        "walkBack": 10,
        "sprint": 15,
        "backHop": 10,
        "sidestepLeft": 12,
        "sidestepRight": 12,
        "jump": 8,
        "crouch": 7,
        "crouchBlock": 5,
        "block": 6,
        "chargeKi": 8,
        "jableft": 13,
        "jabright": 12,
        "kickleft": 12,
        "kickright": 11,
        "hitLight": 8,
        "hitHeavy": 8,
        "juggle": 8,
        "knockdown": 8,
        "getupStand": 7,
        "getupRollUp": 9,
        "win": 7,
        "lose": 5,
    }
    for key in result:
        rates.setdefault(key, 10 if key.startswith("cmd:") else ANIMATION_RATES.get(key, 8))
    return result, rates


def kid_goku_animation_frame_map(character_id: str, frame_count: int) -> tuple[dict[str, list[str]], dict[str, float]]:
    def paths(indexes: list[int]) -> list[str]:
        return frame_paths(character_id, indexes, frame_count)

    result = {
        "idle": paths([0, 1, 2, 3, 4, 5, 6, 7]),
        "walkForward": paths([16, 17, 18, 19, 20, 21, 22, 23]),
        "walkBack": paths([23, 22, 21, 20, 19, 18, 17, 16]),
        "sprint": paths([96, 97, 98, 99, 100, 101, 102, 103]),
        "backHop": paths([54, 55, 56, 57]),
        "sidestepLeft": paths([42, 43]),
        "sidestepRight": paths([43, 42]),
        "jump": paths([72, 73, 74, 75, 76, 77, 78]),
        "crouch": paths([316, 317, 318, 319]),
        "crouchBlock": paths([316, 317]),
        "block": paths([36, 37, 38, 39]),
        "chargeKi": paths([226, 227, 228, 229, 230, 231, 232, 233]),
        "jableft": paths([44, 45, 46, 47, 48, 49]),
        "jabright": paths([50, 51, 52, 53]),
        "kickleft": paths([54, 55, 56, 57, 58, 59, 60, 61]),
        "kickright": paths([64, 65, 66, 67, 68, 69, 70, 71]),
        "hitLight": paths([83, 84, 85, 86, 87]),
        "hitHeavy": paths([88, 89, 90, 91, 92, 93, 94]),
        "juggle": paths([72, 73, 74]),
        "knockdown": paths([212, 213, 214, 215, 216, 217, 218, 219]),
        "getupStand": paths([219, 218, 217, 216, 0]),
        "getupRollUp": paths([243, 244, 245, 246, 247, 248, 249]),
        "win": paths([114, 115, 116, 117, 118]),
        "lose": paths([220, 221]),
        "cmd:f+1": paths([100, 101, 102, 103, 104, 105, 106, 107]),
        "cmd:f+3": paths([96, 97, 98, 99, 100, 101, 102, 103]),
        "cmd:d+3": paths([199, 200, 201, 202, 203, 204, 205, 206]),
        "cmd:d/f+2": paths([83, 84, 85, 86, 87, 88, 89, 90]),
        "cmd:d/f+3": paths([132, 133, 134, 135, 136, 137, 138, 139]),
        "cmd:qcf+3": paths([152, 153, 154, 155, 156, 157, 158, 159]),
        "cmd:qcf+4": paths([152, 153, 154, 155, 156, 157, 158, 159]),
        "cmd:WS+4": paths([132, 133, 134, 135, 136, 137, 138, 139]),
        "cmd:FC+1": paths([316, 317, 318, 319, 320, 321, 322, 323]),
        "cmd:FC+2": paths([243, 244, 245, 246, 247, 248]),
        "cmd:1+2": paths([145, 146, 147, 148, 149, 150, 151]),
        "cmd:1+3": paths([170, 171, 172, 173, 174, 175]),
        "cmd:2+3": paths([167, 168, 169]),
        "cmd:2+4": paths([199, 200, 201, 202, 203, 204, 205, 206]),
        "cmd:3+4": paths([295, 296, 297, 298]),
        "cmd:SS+3": paths([140, 141, 142, 143, 144]),
        "cmd:O+1": paths([226, 227, 228, 229, 230, 231, 232, 233]),
        "cmd:O+2": paths([362, 363, 364, 365, 366, 367, 368, 369]),
    }
    rates = {
        "idle": 7,
        "walkForward": 12,
        "walkBack": 10,
        "sprint": 14,
        "backHop": 10,
        "sidestepLeft": 10,
        "sidestepRight": 10,
        "jump": 9,
        "crouch": 7,
        "crouchBlock": 5,
        "block": 6,
        "chargeKi": 8,
        "jableft": 12,
        "jabright": 12,
        "kickleft": 11,
        "kickright": 11,
        "hitLight": 8,
        "hitHeavy": 8,
        "juggle": 8,
        "knockdown": 8,
        "getupStand": 7,
        "getupRollUp": 9,
        "win": 7,
        "lose": 5,
    }
    for key in result:
        rates.setdefault(key, 10 if key.startswith("cmd:") else ANIMATION_RATES.get(key, 8))
    return result, rates


def stable_unit(value: str, salt: str) -> float:
    digest = hashlib.sha256(f"{value}:{salt}".encode("utf8")).digest()
    return int.from_bytes(digest[:4], "big") / 0xFFFFFFFF


def color_for(value: str, salt: str) -> str:
    hue = stable_unit(value, salt)
    saturation = 0.58 + stable_unit(value, salt + "-s") * 0.24
    lightness = 0.44 + stable_unit(value, salt + "-l") * 0.16
    return hsl_to_hex(hue, saturation, lightness)


def hsl_to_hex(hue: float, saturation: float, lightness: float) -> str:
    def channel(offset: float) -> int:
        k = (offset + hue * 12) % 12
        a = saturation * min(lightness, 1 - lightness)
        value = lightness - a * max(-1, min(k - 3, 9 - k, 1))
        return round(max(0, min(1, value)) * 255)

    return f"#{channel(0):02x}{channel(8):02x}{channel(4):02x}"


def base_move(label_stem: str, move_id: str, input_name: str, timing: tuple[int, int, int], damage: int, hit_level: str, range_value: float) -> dict[str, Any]:
    startup, active, recovery = timing
    is_low = hit_level == "low"
    return {
        "id": move_id,
        "label": label_stem,
        "input": input_name,
        "startupFrames": startup,
        "activeFrames": active,
        "recoveryFrames": recovery,
        "damage": damage,
        "blockDamage": 0,
        "hitLevel": hit_level,
        "onBlockFrames": -11 if is_low else (-2 if startup <= 10 else -7),
        "onHitFrames": 5 if is_low else (8 if startup <= 10 else 7),
        "onCounterHitFrames": 8 if is_low else (11 if startup <= 10 else 12),
        "whiffRecoveryFrames": 5 if startup <= 10 else 7,
        "range": range_value,
        "pushback": round(0.72 + range_value * 0.15, 2),
        "blockPushback": round(0.34 + range_value * 0.06, 2),
        "tracking": "medium",
        "knockdown": False,
        "hitbox": {
            "offset": [0, 0.86 if is_low else 1.12, 0.66 + range_value * 0.08],
            "size": [0.72, 0.42 if is_low else 0.5, 0.58 + range_value * 0.08],
        },
    }


def move_overrides(display_name: str, frame_lengths: dict[str, int]) -> dict[str, dict[str, Any]]:
    if display_name == "Rock Lee":
        return rock_lee_move_overrides()
    if display_name == "Kid Goku":
        return kid_goku_move_overrides()

    def duration(key: str, fallback: int) -> int:
        return max(1, frame_lengths.get(key, fallback))

    overrides: dict[str, dict[str, Any]] = {
        "jableft": {
            "label": f"{display_name} Left Check",
            "startupFrames": max(9, min(11, duration("jableft", 3) + 7)),
            "activeFrames": 2,
            "recoveryFrames": 13,
            "damage": 6,
            "hitLevel": "high",
            "onBlockFrames": -2,
            "onHitFrames": 8,
            "onCounterHitFrames": 11,
            "range": 1.42,
            "whiffRecoveryFrames": 4,
        },
        "jabright": {
            "label": f"{display_name} Right Check",
            "startupFrames": max(11, min(13, duration("jabright", 4) + 8)),
            "activeFrames": 2,
            "recoveryFrames": 16,
            "damage": 8,
            "hitLevel": "mid",
            "onBlockFrames": -5,
            "onHitFrames": 6,
            "onCounterHitFrames": 9,
            "range": 1.5,
            "whiffRecoveryFrames": 5,
        },
        "kickleft": {
            "label": f"{display_name} Left Kick",
            "startupFrames": max(14, min(18, duration("kickleft", 5) + 10)),
            "activeFrames": 3,
            "recoveryFrames": 20,
            "damage": 10,
            "hitLevel": "low",
            "onBlockFrames": -12,
            "onHitFrames": 4,
            "onCounterHitFrames": 8,
            "range": 1.62,
            "whiffRecoveryFrames": 7,
        },
        "kickright": {
            "label": f"{display_name} Right Kick",
            "startupFrames": max(15, min(19, duration("kickright", 5) + 11)),
            "activeFrames": 3,
            "recoveryFrames": 21,
            "damage": 12,
            "hitLevel": "mid",
            "onBlockFrames": -7,
            "onHitFrames": 8,
            "onCounterHitFrames": 13,
            "range": 1.7,
            "whiffRecoveryFrames": 7,
        },
        "cmd:f+1": {
            "label": f"{display_name} {MOVE_LABEL_STEMS[0]}",
            "startupFrames": max(14, duration("cmd:f+1", 5) + 11),
            "activeFrames": 3,
            "recoveryFrames": 22,
            "damage": 11,
            "hitLevel": "mid",
            "onBlockFrames": -6,
            "onHitFrames": 7,
            "onCounterHitFrames": 11,
            "range": 1.72,
            "forwardForce": 0.6,
            "whiffRecoveryFrames": 8,
        },
        "cmd:d/f+2": {
            "label": f"{display_name} {MOVE_LABEL_STEMS[2]}",
            "startupFrames": max(16, duration("cmd:d/f+2", 5) + 12),
            "activeFrames": 3,
            "recoveryFrames": 25,
            "damage": 15,
            "hitLevel": "mid",
            "onBlockFrames": -13,
            "onHitFrames": 25,
            "onCounterHitFrames": 31,
            "launchHeight": 2.1,
            "launchVelocity": 5.9,
            "juggleRefloatVelocity": 4.25,
            "juggleGravityScale": 0.54,
            "range": 1.68,
            "whiffRecoveryFrames": 12,
        },
        "cmd:qcf+4": {
            "label": f"{display_name} {MOVE_LABEL_STEMS[1]}",
            "startupFrames": max(19, duration("cmd:qcf+4", 5) + 14),
            "activeFrames": 4,
            "recoveryFrames": 27,
            "damage": 17,
            "hitLevel": "mid",
            "onBlockFrames": -9,
            "onHitFrames": 18,
            "onCounterHitFrames": 26,
            "knockdown": True,
            "range": 2.05,
            "whiffRecoveryFrames": 13,
        },
        "cmd:WS+4": {
            "label": f"{display_name} {MOVE_LABEL_STEMS[5]}",
            "startupFrames": max(13, duration("cmd:WS+4", 4) + 9),
            "activeFrames": 3,
            "recoveryFrames": 22,
            "damage": 12,
            "hitLevel": "mid",
            "onBlockFrames": -10,
            "onHitFrames": 18,
            "onCounterHitFrames": 25,
            "range": 1.62,
            "whiffRecoveryFrames": 8,
        },
        "cmd:FC+1": {
            "label": f"{display_name} Crouch Jab",
            "startupFrames": 12,
            "activeFrames": 2,
            "recoveryFrames": 15,
            "damage": 7,
            "hitLevel": "mid",
            "onBlockFrames": -4,
            "onHitFrames": 6,
            "onCounterHitFrames": 9,
            "range": 1.34,
            "whiffRecoveryFrames": 5,
        },
        "cmd:FC+2": {
            "label": f"{display_name} Crouch Launcher",
            "startupFrames": 17,
            "activeFrames": 3,
            "recoveryFrames": 25,
            "damage": 13,
            "hitLevel": "mid",
            "onBlockFrames": -13,
            "onHitFrames": 24,
            "onCounterHitFrames": 30,
            "launchHeight": 2,
            "range": 1.48,
            "whiffRecoveryFrames": 12,
        },
        "cmd:1+2": {
            "label": f"{display_name} Twin Assault",
            "startupFrames": 18,
            "activeFrames": 3,
            "recoveryFrames": 24,
            "damage": 14,
            "hitLevel": "mid",
            "onBlockFrames": -8,
            "onHitFrames": 10,
            "onCounterHitFrames": 16,
            "range": 1.72,
            "whiffRecoveryFrames": 9,
        },
        "cmd:1+3": {
            "label": f"{display_name} Cross Launcher",
            "startupFrames": 18,
            "activeFrames": 3,
            "recoveryFrames": 26,
            "damage": 15,
            "hitLevel": "mid",
            "onBlockFrames": -14,
            "onHitFrames": 24,
            "onCounterHitFrames": 31,
            "launchHeight": 2.2,
            "range": 1.65,
            "whiffRecoveryFrames": 13,
        },
        "cmd:2+3": {
            "label": f"{display_name} Low Feint",
            "startupFrames": 18,
            "activeFrames": 3,
            "recoveryFrames": 22,
            "damage": 10,
            "hitLevel": "low",
            "onBlockFrames": -12,
            "onHitFrames": 4,
            "onCounterHitFrames": 8,
            "range": 1.58,
            "whiffRecoveryFrames": 8,
        },
        "cmd:2+4": {
            "label": f"{display_name} Driving Kick",
            "startupFrames": 20,
            "activeFrames": 3,
            "recoveryFrames": 25,
            "damage": 15,
            "hitLevel": "low",
            "onBlockFrames": -16,
            "onHitFrames": 8,
            "onCounterHitFrames": 14,
            "knockdown": True,
            "range": 1.74,
            "whiffRecoveryFrames": 12,
        },
        "cmd:3+4": {
            "label": f"{display_name} Power Crush",
            "startupFrames": 22,
            "activeFrames": 4,
            "recoveryFrames": 28,
            "damage": 18,
            "hitLevel": "mid",
            "onBlockFrames": -10,
            "onHitFrames": 18,
            "onCounterHitFrames": 26,
            "knockdown": True,
            "range": 1.9,
            "whiffRecoveryFrames": 13,
        },
        "cmd:O+2": {
            "label": f"{display_name} Aura Drive",
            "startupFrames": 24,
            "activeFrames": 4,
            "recoveryFrames": 30,
            "damage": 22,
            "hitLevel": "special",
            "onBlockFrames": -12,
            "onHitFrames": 22,
            "onCounterHitFrames": 32,
            "knockdown": True,
            "usesKi": True,
            "kiCost": 35,
            "range": 2.1,
            "whiffRecoveryFrames": 15,
        },
    }
    for key, label in zip(NEUTRAL_ROUTE_KEYS, NEUTRAL_LABELS):
        overrides[key] = {"label": f"{display_name} {label}"}
    return overrides


def kid_goku_move(
    label: str,
    startup: int,
    active: int,
    recovery: int,
    damage: int,
    hit_level: str,
    on_block: int,
    on_hit: int,
    on_counter_hit: int,
    range_value: float,
    description: str,
    **extra: Any,
) -> dict[str, Any]:
    is_low = hit_level == "low"
    move = {
        "label": label,
        "description": description,
        "startupFrames": startup,
        "activeFrames": active,
        "recoveryFrames": recovery,
        "damage": damage,
        "blockDamage": 1 if damage >= 12 else 0,
        "hitLevel": hit_level,
        "onBlockFrames": on_block,
        "onHitFrames": on_hit,
        "onCounterHitFrames": on_counter_hit,
        "onComboHitFrames": max(6, on_hit - 2),
        "onJuggleHitFrames": max(5, min(on_counter_hit, on_hit + 2)),
        "comboRepeatPenaltyFrames": 5,
        "juggleRepeatPenaltyFrames": 8,
        "whiffRecoveryFrames": max(4, recovery // 3),
        "range": range_value,
        "pushback": round(0.74 + range_value * 0.13, 2),
        "blockPushback": round(0.34 + range_value * 0.06, 2),
        "tracking": "medium",
        "knockdown": False,
        "hitbox": {
            "offset": [0, 0.84 if is_low else 1.1, 0.66 + range_value * 0.08],
            "size": [0.74, 0.42 if is_low else 0.5, 0.58 + range_value * 0.08],
        },
    }
    move.update(extra)
    return move


def kid_goku_base_moves() -> list[dict[str, Any]]:
    jab = kid_goku_move(
        "Quick Turtle Jab",
        9,
        2,
        13,
        6,
        "high",
        -1,
        9,
        13,
        1.42,
        "Fast high jab with short reach that starts Kid Goku's close pressure.",
    )
    jab.update({"id": "jab", "input": "jab"})
    kick = kid_goku_move(
        "Low Tail Trip",
        15,
        3,
        21,
        10,
        "low",
        -12,
        7,
        12,
        1.62,
        "Quick low tail trip that ducks under highs and leaves Kid Goku near crouch range.",
        endsInCrouch=True,
    )
    kick.update({"id": "kick", "input": "kick"})
    heavy = kid_goku_move(
        "Power Pole Poke",
        12,
        3,
        18,
        9,
        "mid",
        -5,
        12,
        17,
        1.72,
        "Quick mid staff poke with better reach than his bare-handed checks.",
    )
    heavy.update({"id": "heavy", "input": "heavy"})
    special = kid_goku_move(
        "Power Pole Sweep",
        17,
        4,
        25,
        13,
        "mid",
        -8,
        15,
        22,
        1.86,
        "Forward staff swing that works as a reliable mid combo ender.",
        forwardForce=1.05,
        forwardForceStartFrame=9,
        forwardForceEndFrame=20,
    )
    special.update({"id": "special", "input": "special"})
    return [jab, kick, heavy, special]


def kid_goku_move_overrides() -> dict[str, dict[str, Any]]:
    overrides: dict[str, dict[str, Any]] = {
        "jableft": kid_goku_move("Quick Turtle Jab", 9, 2, 13, 6, "high", -1, 9, 13, 1.42, "Fast high jab with short reach that checks close pressure."),
        "jabright": kid_goku_move("Turtle School Body Blow", 11, 2, 16, 8, "mid", -4, 11, 16, 1.5, "Quick mid punch that keeps Kid Goku close enough to continue strings."),
        "kickleft": kid_goku_move("Low Tail Trip", 15, 3, 21, 10, "low", -12, 7, 12, 1.62, "Quick low tail trip that clips stand guard and recovers crouched.", endsInCrouch=True),
        "kickright": kid_goku_move("Power Pole Poke", 14, 3, 20, 11, "mid", -6, 12, 18, 1.82, "Steady mid staff poke with enough reach to punish small whiffs."),
        "cmd:f+1": kid_goku_move("Turtle Dash Punch", 14, 3, 22, 12, "mid", -6, 13, 18, 1.78, "Forward-moving mid punch that carries Kid Goku into pressure.", forwardForce=1.25, forwardForceStartFrame=8, forwardForceEndFrame=17),
        "cmd:f+3": kid_goku_move("Running Power Pole", 17, 3, 25, 13, "mid", -8, 12, 24, 1.92, "Committed running staff check that wins timing wars on counter hit.", counterHit=True, counterHitStunBonusFrames=8, forwardForce=1.35, forwardForceStartFrame=9, forwardForceEndFrame=18),
        "cmd:d+3": kid_goku_move("Low Monkey Sweep", 16, 3, 23, 11, "low", -13, 8, 13, 1.68, "Low sliding sweep that stays compact and threatens crouch routes.", endsInCrouch=True),
        "cmd:d/f+2": kid_goku_move("Rising Tail Pop", 18, 3, 31, 14, "mid", -14, 28, 34, 1.66, "Unsafe rising pop-up that starts Kid Goku's juggle routes.", launchHeight=2.15, launchVelocity=6.0, juggleRefloatVelocity=4.35, juggleGravityScale=0.52, forwardForce=0.85, forwardForceStartFrame=10, forwardForceEndFrame=17),
        "cmd:d/f+3": kid_goku_move("Leaping Staff Kick", 19, 4, 27, 13, "mid", -9, 17, 24, 1.78, "Leaping mid kick that lifts slightly and keeps juggle pressure moving.", launchHeight=1.35, launchVelocity=5.35, juggleRefloatVelocity=4.0, juggleGravityScale=0.58, jumpBeforeMove=True, moveJumpForce=7.8, moveJumpGravity=22),
        "cmd:qcf+3": kid_goku_move("Power Pole Rush", 20, 4, 28, 14, "mid", -9, 18, 25, 1.95, "Long-reaching staff rush that carries forward and catches retreat.", forwardForce=1.55, forwardForceStartFrame=10, forwardForceEndFrame=24),
        "cmd:qcf+4": kid_goku_move("Power Pole Rush", 20, 4, 28, 14, "mid", -9, 18, 25, 1.95, "Long-reaching staff rush that carries forward and catches retreat.", forwardForce=1.55, forwardForceStartFrame=10, forwardForceEndFrame=24),
        "cmd:WS+4": kid_goku_move("Rising Monkey Kick", 15, 3, 25, 12, "mid", -9, 17, 24, 1.7, "While-standing mid kick that lifts opponents after crouch pressure.", launchHeight=1.6, launchVelocity=5.55, juggleRefloatVelocity=4.05, juggleGravityScale=0.56),
        "cmd:FC+1": kid_goku_move("Crouching Staff Check", 12, 2, 16, 7, "mid", -3, 9, 13, 1.44, "Quick crouching staff poke for interrupting from low stance.", endsInCrouch=True),
        "cmd:FC+2": kid_goku_move("Monkey Roll Launcher", 18, 3, 30, 13, "mid", -14, 26, 32, 1.54, "Rolling mid launcher that rewards a hard read from full crouch.", launchHeight=2.0, launchVelocity=5.8, juggleRefloatVelocity=4.2, juggleGravityScale=0.54, endsInCrouch=True),
        "cmd:1+2": kid_goku_move("Power Pole Barrage", 18, 4, 25, 15, "mid", -7, 15, 21, 1.92, "Mid staff barrage that keeps Kid Goku close for route extensions.", forwardForce=1.25, forwardForceStartFrame=10, forwardForceEndFrame=22),
        "cmd:1+3": kid_goku_move("Monkey Wheel Lift", 21, 4, 34, 17, "mid", -15, 29, 36, 1.72, "Spinning lift starter that launches but is very punishable on block.", launchHeight=2.2, launchVelocity=5.95, juggleRefloatVelocity=4.4, juggleGravityScale=0.5, tornado=True),
        "cmd:2+3": kid_goku_move("Tail Feint Sweep", 19, 3, 24, 10, "low", -12, 8, 15, 1.58, "Low tail feint that slips under highs and sets up crouch pressure.", endsInCrouch=True, counterHit=True, counterHitStunBonusFrames=5),
        "cmd:2+4": kid_goku_move("Sliding Monkey Trip", 21, 4, 30, 14, "low", -16, 13, 19, 1.78, "Risky low slide that knocks down when Kid Goku commits to the full sweep.", knockdown=True, endsInCrouch=True),
        "cmd:3+4": kid_goku_move("Tail Cyclone", 24, 5, 35, 17, "mid", -12, 20, 29, 1.9, "Spinning mid tail attack that works as a tornado extender in juggles.", tornado=True, knockdown=True, tracking="strong", homingSpeed=9),
        "cmd:SS+3": kid_goku_move("Side Staff Swing", 17, 4, 27, 13, "mid", -8, 14, 22, 1.84, "Sidestep staff swing that covers lateral movement and keeps him mobile.", tracking="strong", homingSpeed=10),
        "cmd:O+1": kid_goku_move("Turtle Spirit Burst", 27, 5, 38, 18, "special", -10, 20, 28, 1.8, "Ki-cost aura burst that armors through light checks before Kid Goku drives forward.", usesKi=True, kiCost=30, armorStartFrame=8, armorEndFrame=18, knockdown=True, forwardForce=1.3, forwardForceStartFrame=14, forwardForceEndFrame=30),
        "cmd:O+2": kid_goku_move("Afterimage Power Pole", 30, 6, 42, 24, "special", -16, 25, 36, 2.08, "Expensive afterimage staff finisher with high juggle reward and real block risk.", usesKi=True, kiCost=45, knockdown=True, tornado=True, jumpBeforeMove=True, moveJumpForce=8.8, moveJumpGravity=24, forwardForce=1.9, forwardForceStartFrame=15, forwardForceEndFrame=36, whiffRecoveryFrames=18),
    }
    neutral_labels = {
        "neutral:jab-jab": "Turtle Combo Second Beat",
        "neutral:jab-jab-heavy": "Turtle Body Route",
        "neutral:jab-jab-kick": "Tail Trip Changeup",
        "neutral:jab-jab-special": "Power Pole Ender",
        "neutral:jab-heavy": "Turtle Drive",
        "neutral:jab-heavy-kick": "Staff Barrage",
        "neutral:jab-heavy-special": "Dash Pole Ender",
        "neutral:jab-kick": "Tail Trip Link",
        "neutral:jab-kick-heavy": "Tail to Staff",
        "neutral:jab-kick-special": "Tail Pole Route",
        "neutral:jab-special": "Power Pole Setup",
        "neutral:jab-special-heavy": "Pole Crush",
        "neutral:heavy-jab": "Staff Jab Reset",
        "neutral:heavy-jab-heavy": "Power Pole Loop",
        "neutral:heavy-jab-special": "Pole Rush Ender",
        "neutral:heavy-kick": "Staff Low Mix",
        "neutral:heavy-kick-special": "Pole Sweep Route",
        "neutral:heavy-special": "Staff Drive",
        "neutral:heavy-special-kick": "Pole Low Reset",
        "neutral:kick-jab": "Tail Jab Reset",
        "neutral:kick-jab-special": "Tail Pole Setup",
        "neutral:kick-heavy": "Tail Staff Link",
        "neutral:kick-heavy-special": "Tail Rush Ender",
        "neutral:kick-special": "Tail Cyclone",
        "neutral:kick-special-heavy": "Cyclone Staff Route",
        "neutral:special-jab": "Pole Jab Reset",
        "neutral:special-jab-heavy": "Pole Body Route",
        "neutral:special-heavy": "Power Pole Drive",
        "neutral:special-kick": "Power Pole Trip",
    }
    for key, label in neutral_labels.items():
        overrides[key] = {
            "label": label,
            "description": "Auto-generated Kid Goku string route built from quick Turtle School checks and staff links.",
        }
    return overrides


def rock_lee_move(
    label: str,
    startup: int,
    active: int,
    recovery: int,
    damage: int,
    hit_level: str,
    on_block: int,
    on_hit: int,
    on_counter_hit: int,
    range_value: float,
    description: str,
    **extra: Any,
) -> dict[str, Any]:
    is_low = hit_level == "low"
    move = {
        "label": label,
        "description": description,
        "startupFrames": startup,
        "activeFrames": active,
        "recoveryFrames": recovery,
        "damage": damage,
        "blockDamage": 1 if damage >= 10 else 0,
        "hitLevel": hit_level,
        "onBlockFrames": on_block,
        "onHitFrames": on_hit,
        "onCounterHitFrames": on_counter_hit,
        "onComboHitFrames": max(6, on_hit - 2),
        "onJuggleHitFrames": max(5, min(on_counter_hit, on_hit + 2)),
        "comboRepeatPenaltyFrames": 5,
        "juggleRepeatPenaltyFrames": 8,
        "whiffRecoveryFrames": max(4, recovery // 3),
        "range": range_value,
        "pushback": round(0.75 + range_value * 0.13, 2),
        "blockPushback": round(0.34 + range_value * 0.06, 2),
        "tracking": "medium",
        "knockdown": False,
        "hitbox": {
            "offset": [0, 0.84 if is_low else 1.08, 0.66 + range_value * 0.08],
            "size": [0.74, 0.42 if is_low else 0.5, 0.58 + range_value * 0.08],
        },
    }
    move.update(extra)
    return move


def rock_lee_base_moves() -> list[dict[str, Any]]:
    jab = rock_lee_move(
        "Leaf Intercept Jab",
        9,
        2,
        13,
        6,
        "high",
        -1,
        9,
        13,
        1.42,
        "Fast high taijutsu check that starts Rock Lee's close-range pressure.",
    )
    jab.update({"id": "jab", "input": "jab"})
    kick = rock_lee_move(
        "Leaf Gale",
        15,
        3,
        21,
        10,
        "low",
        -12,
        7,
        12,
        1.62,
        "Low sweeping kick that clips stand guard and leaves Lee crouched on contact.",
        endsInCrouch=True,
    )
    kick.update({"id": "kick", "input": "kick"})
    heavy = rock_lee_move(
        "Dynamic Entry",
        12,
        3,
        18,
        9,
        "mid",
        -5,
        12,
        17,
        1.58,
        "Quick mid body blow with forward momentum for punishing small whiffs.",
        forwardForce=0.9,
        forwardForceStartFrame=8,
        forwardForceEndFrame=15,
    )
    heavy.update({"id": "heavy", "input": "heavy"})
    special = rock_lee_move(
        "Leaf Whirlwind",
        16,
        4,
        24,
        12,
        "mid",
        -8,
        14,
        20,
        1.78,
        "Spinning mid kick that carries Lee forward and works as a simple combo finisher.",
        forwardForce=1.15,
        forwardForceStartFrame=10,
        forwardForceEndFrame=20,
    )
    special.update({"id": "special", "input": "special"})
    return [jab, kick, heavy, special]


def rock_lee_move_overrides() -> dict[str, dict[str, Any]]:
    overrides: dict[str, dict[str, Any]] = {
        "jableft": rock_lee_move("Leaf Intercept Jab", 9, 2, 13, 7, "high", -1, 9, 13, 1.42, "Fast high jab for checking movement and starting pressure."),
        "jabright": rock_lee_move("Strong Fist Body Blow", 11, 3, 16, 9, "mid", -4, 12, 17, 1.55, "Compact mid punch that links after Lee's quickest checks."),
        "kickleft": rock_lee_move("Leaf Gale", 15, 3, 21, 10, "low", -12, 7, 12, 1.62, "Low taijutsu sweep that ducks under highs and ends in crouch.", endsInCrouch=True),
        "kickright": rock_lee_move("Leaf Whirlwind", 16, 4, 24, 12, "mid", -8, 14, 20, 1.78, "Forward-spinning mid kick with enough hit advantage to continue pressure.", forwardForce=1.15, forwardForceStartFrame=10, forwardForceEndFrame=20),
        "cmd:f+1": rock_lee_move("Dynamic Entry", 14, 3, 22, 12, "mid", -6, 13, 18, 1.82, "Leaping forward strike that reaches farther than Lee's standing checks.", forwardForce=1.35, forwardForceStartFrame=8, forwardForceEndFrame=17),
        "cmd:f+3": rock_lee_move("Youthful Counter Kick", 17, 3, 25, 13, "mid", -8, 12, 24, 1.76, "Committed mid kick that turns counter hits into a real follow-up.", counterHit=True, counterHitStunBonusFrames=8, forwardForce=1.25, forwardForceStartFrame=9, forwardForceEndFrame=18),
        "cmd:d+3": rock_lee_move("Leaf Gale Sweep", 16, 3, 23, 11, "low", -13, 8, 13, 1.68, "Low spinning sweep that keeps Lee low and threatens crouch routes.", endsInCrouch=True),
        "cmd:d/f+2": rock_lee_move("Rising Lotus Launcher", 18, 3, 31, 14, "mid", -14, 28, 34, 1.66, "Unsafe rising mid that launches for Lee's aerial lotus routes.", launchHeight=2.15, launchVelocity=6.0, juggleRefloatVelocity=4.35, juggleGravityScale=0.52, forwardForce=0.85, forwardForceStartFrame=10, forwardForceEndFrame=17),
        "cmd:d/f+3": rock_lee_move("Leaf Hurricane Low", 19, 4, 27, 12, "low", -15, 10, 16, 1.72, "Low hurricane kick that knocks down when Lee catches the opponent stepping.", knockdown=True, endsInCrouch=True, forwardForce=0.95, forwardForceStartFrame=10, forwardForceEndFrame=22),
        "cmd:qcf+3": rock_lee_move("Leaf Rising Wind", 20, 4, 28, 14, "mid", -9, 18, 25, 1.86, "Rising spin kick that lifts grounded hits into Lee's juggle plan.", launchHeight=1.35, launchVelocity=5.45, juggleRefloatVelocity=4.1, juggleGravityScale=0.58, forwardForce=1.3, forwardForceStartFrame=11, forwardForceEndFrame=24),
        "cmd:qcf+4": rock_lee_move("Front Lotus Spiral", 24, 6, 36, 16, "mid", -13, 20, 28, 2.02, "High-commitment lotus spin that causes tornado in juggles and cashes out launch routes.", tornado=True, knockdown=True, jumpBeforeMove=True, moveJumpForce=8.6, moveJumpGravity=23, forwardForce=1.85, forwardForceStartFrame=12, forwardForceEndFrame=31),
        "cmd:WS+4": rock_lee_move("Rising Leaf Whirlwind", 15, 3, 25, 12, "mid", -9, 17, 24, 1.7, "While-standing mid kick that lifts opponents after crouch pressure.", launchHeight=1.65, launchVelocity=5.65, juggleRefloatVelocity=4.1, juggleGravityScale=0.56),
        "cmd:FC+1": rock_lee_move("Crouching Strong Fist", 12, 2, 16, 7, "mid", -3, 9, 13, 1.34, "Quick crouching body shot for interrupting after Leaf Gale."),
        "cmd:FC+2": rock_lee_move("Crouch Lotus Launcher", 18, 3, 30, 13, "mid", -14, 26, 32, 1.5, "Crouch-starting launcher that rewards a hard read from full crouch.", launchHeight=2.0, launchVelocity=5.8, juggleRefloatVelocity=4.2, juggleGravityScale=0.54),
        "cmd:1+2": rock_lee_move("Strong Fist Barrage", 18, 4, 25, 15, "mid", -7, 15, 21, 1.78, "Two-hand taijutsu rush that keeps Lee close for route extensions.", forwardForce=1.35, forwardForceStartFrame=10, forwardForceEndFrame=22),
        "cmd:1+3": rock_lee_move("Primary Lotus Lift", 21, 4, 34, 17, "mid", -15, 29, 36, 1.72, "Primary Lotus starter that launches but leaves Lee punishable on block.", launchHeight=2.25, launchVelocity=6.05, juggleRefloatVelocity=4.45, juggleGravityScale=0.5, jumpBeforeMove=True, moveJumpForce=8.4, moveJumpGravity=22),
        "cmd:2+3": rock_lee_move("Drunken Feint Sweep", 19, 3, 24, 10, "low", -12, 8, 15, 1.58, "Low feint sweep that slips into crouch and frustrates stand blocking.", endsInCrouch=True, counterHit=True, counterHitStunBonusFrames=5),
        "cmd:2+4": rock_lee_move("Leaf Gale Knockdown", 21, 4, 30, 14, "low", -16, 13, 19, 1.78, "Risky low sweep that knocks down when Lee commits to the full arc.", knockdown=True, endsInCrouch=True),
        "cmd:3+4": rock_lee_move("Front Lotus", 25, 6, 37, 18, "mid", -14, 20, 29, 1.96, "Spinning lotus kick that creates tornado routes after a launcher.", tornado=True, knockdown=True, jumpBeforeMove=True, moveJumpForce=8.8, moveJumpGravity=23, forwardForce=1.7, forwardForceStartFrame=13, forwardForceEndFrame=32),
        "cmd:SS+3": rock_lee_move("Side Step Leaf Cyclone", 17, 4, 27, 13, "mid", -8, 14, 22, 1.8, "Sidestep kick that catches linear retaliation and keeps Lee mobile.", tracking="strong", homingSpeed=10),
        "cmd:O+1": rock_lee_move("Eight Gates Release", 28, 5, 38, 18, "special", -10, 20, 28, 1.78, "Ki-cost gate burst that armors through light checks before Lee drives forward.", usesKi=True, kiCost=30, armorStartFrame=8, armorEndFrame=18, knockdown=True, forwardForce=1.4, forwardForceStartFrame=14, forwardForceEndFrame=30),
        "cmd:O+2": rock_lee_move("Hidden Lotus", 31, 6, 44, 24, "special", -17, 25, 36, 2.08, "Expensive Hidden Lotus finisher with huge reward after launch but real block risk.", usesKi=True, kiCost=45, knockdown=True, tornado=True, jumpBeforeMove=True, moveJumpForce=9.2, moveJumpGravity=24, forwardForce=2.1, forwardForceStartFrame=16, forwardForceEndFrame=38, whiffRecoveryFrames=18),
    }
    neutral_labels = {
        "neutral:jab-jab": "Leaf Combo Second Beat",
        "neutral:jab-jab-heavy": "Strong Fist Body Route",
        "neutral:jab-jab-kick": "Leaf Gale Changeup",
        "neutral:jab-jab-special": "Whirlwind Ender",
        "neutral:jab-heavy": "Youth Drive",
        "neutral:jab-heavy-kick": "Strong Fist Barrage",
        "neutral:jab-heavy-special": "Dynamic Entry Ender",
        "neutral:jab-kick": "Low Gale Link",
        "neutral:jab-kick-heavy": "Low to Body Blow",
        "neutral:jab-kick-special": "Low Whirlwind Route",
        "neutral:jab-special": "Leaf Whirlwind Setup",
        "neutral:jab-special-heavy": "Whirlwind Crush",
        "neutral:heavy-jab": "Body Blow Check",
        "neutral:heavy-jab-heavy": "Strong Fist Loop",
        "neutral:heavy-jab-special": "Entry to Whirlwind",
        "neutral:heavy-kick": "Body Blow Low",
        "neutral:heavy-kick-special": "Gale Cyclone",
        "neutral:heavy-special": "Dynamic Whirlwind",
        "neutral:heavy-special-kick": "Whirlwind Low Reset",
        "neutral:kick-jab": "Gale Jab Reset",
        "neutral:kick-jab-special": "Gale Whirlwind",
        "neutral:kick-heavy": "Gale Body Blow",
        "neutral:kick-heavy-special": "Gale Entry Ender",
        "neutral:kick-special": "Gale Cyclone",
        "neutral:kick-special-heavy": "Cyclone Body Route",
        "neutral:special-jab": "Whirlwind Jab Reset",
        "neutral:special-jab-heavy": "Whirlwind Strong Fist",
        "neutral:special-heavy": "Whirlwind Drive",
        "neutral:special-kick": "Whirlwind Gale",
    }
    for key, label in neutral_labels.items():
        overrides[key] = {
            "label": label,
            "description": "Auto-generated Rock Lee string route built from his fast taijutsu links."
        }
    return overrides


def manifest_for(character_id: str, display_name: str, frame_count: int, animation_frames: dict[str, list[str]], animation_rates: dict[str, float]) -> dict[str, Any]:
    variant_of = VARIANT_OF.get(character_id)
    frame_lengths = {key: len(value) for key, value in animation_frames.items()}
    primary = color_for(character_id, "primary")
    secondary = color_for(character_id, "secondary")
    accent = color_for(character_id, "accent")
    speed = round(4.9 + stable_unit(character_id, "speed") * 0.55, 2)
    health = round(96 + stable_unit(character_id, "health") * 10)
    jump_force = round(7.8 + stable_unit(character_id, "jump") * 0.55, 2)
    if character_id == "rock-lee":
        moves = rock_lee_base_moves()
    elif character_id == "kid-goku":
        moves = kid_goku_base_moves()
    else:
        moves = [
        base_move(f"{display_name} Left Check", "jab", "jab", (10, 2, 14), 6, "high", 1.42),
        base_move(f"{display_name} Left Kick", "kick", "kick", (14, 3, 20), 10, "low", 1.62),
        base_move(f"{display_name} Right Check", "heavy", "heavy", (12, 2, 17), 8, "mid", 1.5),
        base_move(f"{display_name} Right Kick", "special", "special", (16, 3, 22), 12, "mid", 1.72),
        ]
    stats = {
        "health": 94 if character_id == "rock-lee" else (92 if character_id == "kid-goku" else health),
        "speed": 5.55 if character_id == "rock-lee" else (5.42 if character_id == "kid-goku" else speed),
        "sidestepSpeed": 4.86 if character_id == "rock-lee" else (4.78 if character_id == "kid-goku" else round(max(4.05, speed - 0.62), 2)),
        "dashDistance": 1.02 if character_id == "rock-lee" else (1.08 if character_id == "kid-goku" else None),
        "jumpForce": 8.75 if character_id == "rock-lee" else (8.62 if character_id == "kid-goku" else jump_force),
        "gravity": 18,
    }
    return {
        "id": character_id,
        "displayName": display_name,
        "locked": True,
        "variant": bool(variant_of),
        "variantOf": variant_of if variant_of else None,
        "faceCardPath": f"/characters/{character_id}/face-card.png",
        "renderMode": "spriteVoxel",
        "modelPath": f"spritevoxel://{character_id}",
        "spriteSheetPath": f"/characters/{character_id}/animation-sheet.png",
        "spriteSheets": [
            {
                "id": "main",
                "name": "Main Sheet",
                "path": f"/characters/{character_id}/animation-sheet.png",
                "frameStart": 0,
                "frameCount": frame_count,
            }
        ],
        "spriteFrameCount": frame_count,
        "voxelProfile": "hd-image-source",
        "voxelFidelity": {
            "resolutionScale": 2,
            "maxRows": 64,
            "depth": 0.24,
            "alphaThreshold": 24,
            "paletteSnap": 1,
            "mergeRuns": True,
            "lod": {"mobileStep": 2, "farStep": 2},
        },
        "animationFrames": animation_frames,
        "animationFrameRates": animation_rates,
        "animationFps": 6,
        "scale": 1.08,
        "cameraOffset": [0, 1.22, 0],
        "stats": stats,
        "animations": ANIMATION_NAMES,
        "moves": moves,
        "hurtboxes": [{"offset": [0, 1, 0], "size": [0.86, 1.9, 0.58]}],
        "inputMap": {"jab": "J", "kick": "K", "heavy": "L", "special": "U", "block": "I"},
        "colors": {"primary": primary, "secondary": secondary, "accent": accent},
        "moveOverrides": move_overrides(display_name, frame_lengths),
        "effects": [],
        "moveEffects": {},
        "spriteFrameEdits": {},
        "aiProfile": {
            "aggression": round(0.58 + stable_unit(character_id, "aggression") * 0.2, 2),
            "guard": round(0.32 + stable_unit(character_id, "guard") * 0.18, 2),
            "spacing": round(1.32 + stable_unit(character_id, "spacing") * 0.28, 2),
            "specialChance": round(0.18 + stable_unit(character_id, "special") * 0.14, 2),
        },
    }


def remove_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: remove_none(child) for key, child in value.items() if child is not None}
    if isinstance(value, list):
        return [remove_none(child) for child in value]
    return value


def import_character(
    repo: Path,
    source_dir: Path,
    character_id: str,
    display_name: str | None = None,
    source_file: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    if source_file is None:
        pngs = sorted(source_dir.glob("*.png"))
        if not pngs:
            raise RuntimeError(f"No PNG found in {source_dir}")
        source_path = pngs[0]
    else:
        source_path = source_file
    display_name = display_name or source_dir.name
    image = load_source_image(source_path)
    boxes, excluded_boxes = filtered_projection_boxes(image)
    backgrounds = dominant_border_backgrounds(image, sample_backgrounds(image))
    character_dir = repo / "public" / "characters" / character_id
    if character_id in PROTECTED_IDS:
        raise RuntimeError(f"Refusing to overwrite protected character id {character_id}")
    if dry_run:
        return {
            "id": character_id,
            "name": display_name,
            "frames": len(boxes),
            "excluded": len(excluded_boxes),
            "source": str(source_path),
            "dryRun": True,
        }
    if character_dir.exists():
        shutil.rmtree(character_dir)
    frames_dir = character_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    image.save(character_dir / "animation-sheet.png")
    frames: list[dict[str, Any]] = []
    first_frame: Image.Image | None = None
    for index, entry in enumerate(boxes):
        box = tuple(int(value) for value in entry["box"])
        cropped = transparent_cell_crop(image, box) if entry.get("source") == "teal-cell" else transparent_crop(image, box, backgrounds)
        cropped = repair_known_character_crop(character_id, index, cropped)
        if first_frame is None:
            first_frame = cropped
        frame_file = frames_dir / f"frame-{index:03d}.png"
        cropped.save(frame_file)
        frames.append(
            {
                "index": index,
                "path": frame_path(character_id, index),
                "sheetId": "main",
                "sheetPath": f"/characters/{character_id}/animation-sheet.png",
                "sourceName": source_path.name,
                "box": list(box),
                "width": cropped.size[0],
                "height": cropped.size[1],
                "row": int(entry["row"]),
            }
        )

    if not frames:
        raise RuntimeError(f"No frames detected in {source_png}")

    make_face_card(first_frame or image).save(character_dir / "face-card.png")
    frames_json = {
        "source": source_path.name,
        "count": len(frames),
        "excluded": [
            {
                "sourceName": source_path.name,
                "box": list(entry["box"]),
                "row": int(entry["row"]),
                "reason": entry.get("excludeReason", "excluded"),
            }
            for entry in excluded_boxes
        ],
        "sheets": [
            {
                "id": "main",
                "name": "Main Sheet",
                "path": f"/characters/{character_id}/animation-sheet.png",
                "frameStart": 0,
                "frameCount": len(frames),
            }
        ],
        "frames": frames,
    }
    (frames_dir / "frames.json").write_text(json.dumps(frames_json, indent=2, ensure_ascii=False) + "\n")
    animation_frames, animation_rates = animation_frame_map(character_id, frames)
    manifest = manifest_for(character_id, display_name, len(frames), animation_frames, animation_rates)
    (character_dir / "character.json").write_text(json.dumps(remove_none(manifest), indent=2, ensure_ascii=False) + "\n")
    synthesize_character(repo, character_id, apply=True)
    return {
        "id": character_id,
        "name": display_name,
        "frames": len(frames),
        "excluded": len(excluded_boxes),
        "source": str(source_path),
    }


def discover_sources(source_root: Path) -> list[tuple[Path, str]]:
    raw_dirs = sorted(path for path in source_root.iterdir() if path.is_dir())
    used_ids: set[str] = set(PROTECTED_IDS)
    selected: list[tuple[Path, str]] = []
    for source_dir in raw_dirs:
        if should_skip_folder(source_dir.name):
            continue
        base_id = slugify(source_dir.name)
        character_id = base_id
        suffix = 2
        while character_id in used_ids:
            character_id = f"{base_id}-{suffix}"
            suffix += 1
        used_ids.add(character_id)
        selected.append((source_dir, character_id))
    return selected


def append_character_index(repo: Path, character_id: str) -> None:
    index_path = repo / "public" / "characters" / "index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {"characters": []}
    characters = index.setdefault("characters", [])
    if character_id not in characters:
        characters.append(character_id)
        index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--source-file", type=Path)
    parser.add_argument("--character-id")
    parser.add_argument("--display-name")
    parser.add_argument("--append-index", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    repo = args.repo.expanduser().resolve()
    source_root = args.source_root.expanduser().resolve()

    if args.source_file:
        source_file = args.source_file.expanduser().resolve()
        if not source_file.exists():
            raise SystemExit(f"Source file does not exist: {source_file}")
        character_id = args.character_id or slugify(args.display_name or source_file.parent.name)
        display_name = args.display_name or source_file.parent.name
        result = import_character(repo, source_file.parent, character_id, display_name, source_file, args.dry_run)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        if args.append_index and not args.dry_run:
            append_character_index(repo, character_id)
            print(f"appended {character_id} to {repo / 'public' / 'characters' / 'index.json'}")
        return

    if not source_root.exists():
        raise SystemExit(f"Source root does not exist: {source_root}")

    selected = discover_sources(source_root)
    imported: list[dict[str, Any]] = []
    for source_dir, character_id in selected:
        result = import_character(repo, source_dir, character_id)
        imported.append(result)
        print(f"imported {result['id']}: {result['frames']} frames from {source_dir.name}")

    index_path = repo / "public" / "characters" / "index.json"
    index = {"characters": ["kiro", "riven", *[entry["id"] for entry in imported]]}
    index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {index_path} with {len(index['characters'])} characters")


if __name__ == "__main__":
    main()
