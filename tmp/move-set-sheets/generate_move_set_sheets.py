#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import math
import re
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


REPO = Path(__file__).resolve().parents[2]
OUT_DIR = REPO / "tmp" / "move-set-sheets"

BASE_INPUT_TO_ANIMATION = {
    "jab": "jableft",
    "heavy": "jabright",
    "kick": "kickleft",
    "special": "kickright",
}
BUTTON_TO_INPUT = {"1": "jab", "2": "heavy", "3": "kick", "4": "special"}
RAW_BUTTON_TO_BASE_KEY = {"1": "jableft", "2": "jabright", "3": "kickleft", "4": "kickright"}

SHEET_W = 2200
LABEL_W = 420
TILE_W = 118
TILE_H = 144
GAP = 10
PAD = 28
HEADER_H = 96
MOVE_GAP = 18
BLACK = (0, 0, 0)
PANEL = (8, 8, 8)
LINE = (44, 44, 48)
WHITE = (242, 242, 244)
MUTED = (174, 183, 194)
DIM = (116, 124, 136)
ACCENT = (106, 180, 255)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    characters = iter_characters()
    rows = []
    total_moves = 0
    total_unique_frames = 0
    for character in characters:
        moves = resolve_configured_moves(character)
        annotate_unique_frames(moves)
        total_moves += len(moves)
        unique_frames = sum(len(move["uniqueFrames"]) for move in moves)
        total_unique_frames += unique_frames
        output = OUT_DIR / f"{character['id']}.png"
        if moves:
            render_character_sheet(character, moves, output)
        rows.append(
            {
                "id": character["id"],
                "displayName": character["manifest"].get("displayName", character["id"]),
                "moves": len(moves),
                "uniqueFrames": unique_frames,
                "output": output.name if moves else None,
            }
        )
    write_index(rows, total_moves, total_unique_frames)
    print(
        json.dumps(
            {
                "ok": True,
                "characters": len(characters),
                "charactersWithMoves": sum(1 for row in rows if row["moves"]),
                "configuredMoves": total_moves,
                "uniqueFramesRendered": total_unique_frames,
                "outputDir": str(OUT_DIR),
                "index": str(OUT_DIR / "index.html"),
            },
            indent=2,
        )
    )


def iter_characters() -> list[dict[str, Any]]:
    root = REPO / "public" / "characters"
    characters: list[dict[str, Any]] = []
    for manifest_path in sorted(root.glob("*/character.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("unplayable") is True:
            continue
        cid = str(manifest.get("id") or manifest_path.parent.name)
        characters.append({"id": cid, "dir": manifest_path.parent, "manifestPath": manifest_path, "manifest": manifest})
    return characters


def resolve_configured_moves(character: dict[str, Any]) -> list[dict[str, Any]]:
    manifest = character["manifest"]
    moves: list[dict[str, Any]] = []
    seen = set()
    base_moves = manifest.get("moves") or []

    for base in base_moves:
        input_name = str(base.get("input") or "jab")
        animation_key = str(base.get("animationKey") or BASE_INPUT_TO_ANIMATION.get(input_name, input_name))
        if not has_frames(manifest, animation_key):
            continue
        resolved = apply_overrides(manifest, base, [base.get("id"), input_name, animation_key])
        add_move(moves, seen, character, animation_key, input_name, None, [button_for_input(input_name)], resolved, "base")

    animation_frames = manifest.get("animationFrames") or {}
    command_keys = sorted(key for key, frames in animation_frames.items() if key.startswith("cmd:") and isinstance(frames, list) and frames)
    for key in command_keys:
        command = key[4:]
        input_name = command_input(command)
        base = next((move for move in base_moves if move.get("input") == input_name), base_moves[0] if base_moves else {})
        base_key = RAW_BUTTON_TO_BASE_KEY.get(command) or BASE_INPUT_TO_ANIMATION.get(input_name)
        resolved = apply_overrides(manifest, base, [base_key, base.get("id"), base.get("input"), command, f"cmd:{command}", key])
        resolved = {**resolved, "command": command, "notation": resolved.get("notation") or command, "animationKey": key}
        add_move(moves, seen, character, key, input_name, command, parse_notation(command), resolved, "command")

    return moves


def add_move(
    moves: list[dict[str, Any]],
    seen: set[str],
    character: dict[str, Any],
    key: str,
    input_name: str,
    command: str | None,
    notation: list[str],
    move: dict[str, Any],
    source: str,
) -> None:
    if key in seen:
        return
    seen.add(key)
    frames = character["manifest"].get("animationFrames", {}).get(key, [])
    moves.append(
        {
            "key": key,
            "source": source,
            "input": input_name,
            "command": command,
            "notation": notation,
            "label": move.get("label") or key,
            "move": move,
            "frames": frames,
            "frameCount": len(frames),
        }
    )


def has_frames(manifest: dict[str, Any], key: str) -> bool:
    frames = manifest.get("animationFrames", {}).get(key)
    return isinstance(frames, list) and bool(frames)


def apply_overrides(manifest: dict[str, Any], base: dict[str, Any], keys: list[Any]) -> dict[str, Any]:
    move = dict(base)
    overrides = manifest.get("moveOverrides") or {}
    for key in keys:
        if not key:
            continue
        override = overrides.get(str(key))
        if isinstance(override, dict):
            move.update(override)
            if isinstance(override.get("hitbox"), dict) and isinstance(base.get("hitbox"), dict):
                hitbox = dict(base["hitbox"])
                hitbox.update(override["hitbox"])
                move["hitbox"] = hitbox
    return move


def command_input(command: str) -> str:
    buttons = re.findall(r"[1-4]", command)
    return BUTTON_TO_INPUT.get(buttons[-1], "jab") if buttons else "jab"


def button_for_input(input_name: str) -> str:
    for button, value in BUTTON_TO_INPUT.items():
        if value == input_name:
            return button
    return "1"


def parse_notation(command: str) -> list[str]:
    return [part for part in command.replace("H.", "H.+").replace("R.", "R.+").split("+") if part]


def annotate_unique_frames(moves: list[dict[str, Any]]) -> None:
    seen: dict[str, str] = {}
    for move in moves:
        unique_frames = []
        reused_frames = []
        for frame in move["frames"]:
            frame_id = frame_name(frame)
            if frame_id in seen:
                reused_frames.append({"frame": frame, "frameId": frame_id, "firstMove": seen[frame_id]})
                continue
            seen[frame_id] = move["key"]
            unique_frames.append(frame)
        move["uniqueFrames"] = unique_frames
        move["reusedFrames"] = reused_frames


def render_character_sheet(character: dict[str, Any], moves: list[dict[str, Any]], output: Path) -> None:
    fonts = load_fonts()
    frames_per_line = max(1, (SHEET_W - PAD * 2 - LABEL_W) // (TILE_W + GAP))
    move_heights = [move_height(move, frames_per_line) for move in moves]
    sheet_h = HEADER_H + PAD + sum(move_heights) + MOVE_GAP * max(0, len(moves) - 1) + PAD
    canvas = Image.new("RGB", (SHEET_W, sheet_h), BLACK)
    draw = ImageDraw.Draw(canvas)

    title = f"{character['manifest'].get('displayName', character['id'])} move set"
    draw.text((PAD, 22), title, fill=WHITE, font=fonts["title"])
    draw.text(
        (PAD, 60),
        f"{character['id']} / {len(moves)} configured moves / {sum(len(move['uniqueFrames']) for move in moves)} unique source frames rendered once",
        fill=MUTED,
        font=fonts["small"],
    )

    y = HEADER_H
    for move in moves:
        draw_move(canvas, draw, fonts, character, move, y, frames_per_line)
        y += move_height(move, frames_per_line) + MOVE_GAP

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def move_height(move: dict[str, Any], frames_per_line: int) -> int:
    lines = max(1, math.ceil(len(move["uniqueFrames"]) / frames_per_line))
    return max(174, 34 + lines * (TILE_H + GAP) + 10)


def draw_move(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    fonts: dict[str, ImageFont.ImageFont],
    character: dict[str, Any],
    move: dict[str, Any],
    y: int,
    frames_per_line: int,
) -> None:
    h = move_height(move, frames_per_line)
    draw.rectangle((PAD, y, SHEET_W - PAD, y + h), fill=PANEL, outline=LINE)
    label_x = PAD + 16
    label_y = y + 16
    data = move["move"]
    draw.text((label_x, label_y), truncate(str(move["label"]), 32), fill=WHITE, font=fonts["move"])
    draw.text((label_x, label_y + 28), truncate(move["key"], 38), fill=ACCENT, font=fonts["small"])
    notation = " ".join(move["notation"]) or "-"
    draw.text((label_x, label_y + 48), f"notation: {notation}", fill=MUTED, font=fonts["small"])
    timing = f"i{data.get('startupFrames', '?')} / a{data.get('activeFrames', '?')} / r{data.get('recoveryFrames', '?')}"
    draw.text((label_x, label_y + 68), timing, fill=MUTED, font=fonts["small"])
    props = property_summary(data) or "none"
    draw.text((label_x, label_y + 88), truncate(props, 44), fill=DIM, font=fonts["small"])
    unique_count = len(move["uniqueFrames"])
    reused_count = len(move["reusedFrames"])
    draw.text((label_x, label_y + 112), f"{unique_count} new / {reused_count} reused", fill=DIM, font=fonts["small"])
    if reused_count:
        draw.text((label_x, label_y + 132), truncate(reused_summary(move["reusedFrames"]), 48), fill=DIM, font=fonts["small"])

    start_x = PAD + LABEL_W
    if not move["uniqueFrames"]:
        draw.text((start_x, y + 62), "all frames already shown above", fill=DIM, font=fonts["small"])
    for index, frame in enumerate(move["uniqueFrames"]):
        line = index // frames_per_line
        col = index % frames_per_line
        x = start_x + col * (TILE_W + GAP)
        tile_y = y + 16 + line * (TILE_H + GAP)
        draw_frame_tile(canvas, draw, fonts, frame, x, tile_y)


def draw_frame_tile(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    fonts: dict[str, ImageFont.ImageFont],
    frame: str,
    x: int,
    y: int,
) -> None:
    draw.rectangle((x, y, x + TILE_W, y + TILE_H), fill=BLACK, outline=(32, 32, 36))
    path = resolve_frame_path(frame)
    frame_label = frame_name(frame)
    if path.exists():
        sprite = Image.open(path).convert("RGBA")
        sprite.thumbnail((TILE_W - 12, TILE_H - 34), Image.Resampling.NEAREST)
        px = x + (TILE_W - sprite.width) // 2
        py = y + TILE_H - 30 - sprite.height
        canvas.paste(sprite.convert("RGB"), (px, py), sprite)
    else:
        draw.text((x + 8, y + 54), "missing", fill=(255, 112, 112), font=fonts["small"])
    tw = text_width(draw, frame_label, fonts["small"])
    draw.rectangle((x, y + TILE_H - 24, x + TILE_W, y + TILE_H), fill=(10, 10, 12))
    draw.text((x + (TILE_W - tw) / 2, y + TILE_H - 20), frame_label, fill=WHITE, font=fonts["small"])


def resolve_frame_path(frame: str) -> Path:
    text = str(frame)
    if text.startswith("/"):
        return REPO / "public" / text.lstrip("/")
    return REPO / "public" / text


def frame_name(frame: str) -> str:
    match = re.search(r"frame-(\d+)\.png", str(frame))
    return match.group(1) if match else Path(str(frame)).name


def reused_summary(reused_frames: list[dict[str, str]]) -> str:
    by_move: dict[str, int] = {}
    for item in reused_frames:
        by_move[item["firstMove"]] = by_move.get(item["firstMove"], 0) + 1
    parts = [f"{count} from {move}" for move, count in by_move.items()]
    return "reuses " + ", ".join(parts)


def property_summary(move: dict[str, Any]) -> str:
    parts = []
    if move.get("hitLevel"):
        parts.append(str(move["hitLevel"]))
    if move.get("throwCapture"):
        parts.append("throw")
    if float_or_zero(move.get("launchHeight")) > 0:
        parts.append("launcher")
    if move.get("tornado"):
        parts.append("tornado")
    if move.get("knockdown"):
        parts.append("knockdown")
    if move.get("endsInCrouch"):
        parts.append("FC end")
    if move.get("jumpBeforeMove"):
        parts.append("jump")
    if move.get("counterHit"):
        parts.append("counter hit")
    if move.get("usesKi") or move.get("kiBurst"):
        parts.append("ki")
    tracking = move.get("tracking")
    if tracking and tracking != "none":
        parts.append(f"tracking:{tracking}")
    return ", ".join(dict.fromkeys(parts))


def float_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def load_fonts() -> dict[str, ImageFont.ImageFont]:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    font_path = next((path for path in candidates if Path(path).exists()), None)
    if font_path:
        return {
            "title": ImageFont.truetype(font_path, 30),
            "move": ImageFont.truetype(font_path, 21),
            "small": ImageFont.truetype(font_path, 14),
        }
    return {"title": ImageFont.load_default(), "move": ImageFont.load_default(), "small": ImageFont.load_default()}


def text_width(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    left, _, right, _ = draw.textbbox((0, 0), text, font=font)
    return right - left


def truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def write_index(rows: list[dict[str, Any]], total_moves: int, total_unique_frames: int) -> None:
    links = []
    for row in rows:
        name = html.escape(str(row["displayName"]))
        cid = html.escape(str(row["id"]))
        moves = row["moves"]
        unique_frames = row["uniqueFrames"]
        if row["output"]:
            links.append(f'<li><a href="{html.escape(row["output"])}">{name}</a><span>{cid}</span><b>{moves} moves</b><b>{unique_frames} frames</b></li>')
        else:
            links.append(f'<li class="empty"><em>{name}</em><span>{cid}</span><b>0 moves</b><b>0 frames</b></li>')
    page = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Playable move set sheets</title>
  <style>
    body {{ margin: 0; background: #050505; color: #f5f5f5; font: 14px system-ui, sans-serif; }}
    main {{ max-width: 980px; margin: 0 auto; padding: 32px; }}
    h1 {{ margin: 0 0 8px; font-size: 32px; }}
    p {{ margin: 0 0 24px; color: #b9c2cf; }}
    ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }}
    li {{ display: grid; grid-template-columns: 1fr 280px 90px 96px; gap: 16px; align-items: center; border: 1px solid #25262b; background: #101113; padding: 10px 12px; }}
    a {{ color: #8ec8ff; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    span {{ color: #9ca3af; }}
    b {{ color: #e5e7eb; text-align: right; }}
    .empty {{ opacity: .65; }}
  </style>
</head>
<body>
<main>
  <h1>Playable move set sheets</h1>
  <p>{len(rows)} playable characters, {sum(1 for row in rows if row["moves"])} with configured moves, {total_moves} configured moves total, {total_unique_frames} unique source frames rendered once per character.</p>
  <ul>
    {''.join(links)}
  </ul>
</main>
</body>
</html>
"""
    (OUT_DIR / "index.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
