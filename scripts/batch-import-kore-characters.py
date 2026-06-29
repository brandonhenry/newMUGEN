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


SOURCE_ROOT = Path("/Users/brandonhenry/Documents/Kore/Characters/sprite-sheets")
PROTECTED_IDS = {"kiro", "riven"}
SKIP_EXACT = {
    "Naruto Uzumaki",
    "Sasuke Uchiha",
    "Koma Man (Green)",
    "Koma Man (Red)",
    "Koma Man (Yellow)",
    "Near",
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
    "backflip",
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
    "backflip": 10,
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
    "backflip": "backflip",
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


def detect_connected_boxes(ink: bytearray, width: int, height: int) -> list[dict[str, Any]]:
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
    # still keeping adjacent sprites split on compact sprite sheets.
    merged = merge_nearby_boxes(raw, width, height, padding=2)
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


def manifest_for(character_id: str, display_name: str, frame_count: int, animation_frames: dict[str, list[str]], animation_rates: dict[str, float]) -> dict[str, Any]:
    variant_of = VARIANT_OF.get(character_id)
    frame_lengths = {key: len(value) for key, value in animation_frames.items()}
    primary = color_for(character_id, "primary")
    secondary = color_for(character_id, "secondary")
    accent = color_for(character_id, "accent")
    speed = round(4.9 + stable_unit(character_id, "speed") * 0.55, 2)
    health = round(96 + stable_unit(character_id, "health") * 10)
    jump_force = round(7.8 + stable_unit(character_id, "jump") * 0.55, 2)
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
        "stats": {
            "health": health,
            "speed": speed,
            "sidestepSpeed": round(max(4.05, speed - 0.62), 2),
            "jumpForce": jump_force,
            "gravity": 18,
        },
        "animations": ANIMATION_NAMES,
        "moves": [
            base_move(f"{display_name} Left Check", "jab", "jab", (10, 2, 14), 6, "high", 1.42),
            base_move(f"{display_name} Left Kick", "kick", "kick", (14, 3, 20), 10, "low", 1.62),
            base_move(f"{display_name} Right Check", "heavy", "heavy", (12, 2, 17), 8, "mid", 1.5),
            base_move(f"{display_name} Right Kick", "special", "special", (16, 3, 22), 12, "mid", 1.72),
        ],
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


def import_character(repo: Path, source_dir: Path, character_id: str) -> dict[str, Any]:
    pngs = sorted(source_dir.glob("*.png"))
    if not pngs:
        raise RuntimeError(f"No PNG found in {source_dir}")
    source_png = pngs[0]
    image = Image.open(source_png).convert("RGBA")
    boxes = detect_projection_boxes(image)
    backgrounds = dominant_border_backgrounds(image, sample_backgrounds(image))
    character_dir = repo / "public" / "characters" / character_id
    if character_id in PROTECTED_IDS:
        raise RuntimeError(f"Refusing to overwrite protected character id {character_id}")
    if character_dir.exists():
        shutil.rmtree(character_dir)
    frames_dir = character_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy2(source_png, character_dir / "animation-sheet.png")
    frames: list[dict[str, Any]] = []
    first_frame: Image.Image | None = None
    for index, entry in enumerate(boxes):
        box = tuple(int(value) for value in entry["box"])
        cropped = transparent_crop(image, box, backgrounds)
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
                "sourceName": source_png.name,
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
        "source": source_png.name,
        "count": len(frames),
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
    manifest = manifest_for(character_id, source_dir.name, len(frames), animation_frames, animation_rates)
    (character_dir / "character.json").write_text(json.dumps(remove_none(manifest), indent=2, ensure_ascii=False) + "\n")
    return {"id": character_id, "name": source_dir.name, "frames": len(frames), "source": str(source_png)}


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--source-root", type=Path, default=SOURCE_ROOT)
    args = parser.parse_args()
    repo = args.repo.expanduser().resolve()
    source_root = args.source_root.expanduser().resolve()
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
