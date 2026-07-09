#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_move_set_sheets import (  # noqa: E402
    BLACK,
    DIM,
    GAP,
    LINE,
    MUTED,
    OUT_DIR,
    PAD,
    PANEL,
    REPO,
    SHEET_W,
    TILE_H,
    TILE_W,
    WHITE,
    draw_frame_tile,
    frame_name,
    iter_characters,
    load_fonts,
    resolve_configured_moves,
    text_width,
)

UNUSED_OUT_DIR = OUT_DIR / "unused-frames"
LABEL_W = 300
HEADER_H = 110
GROUP_GAP = 20


def main() -> None:
    UNUSED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows = []
    total_unused = 0
    characters = iter_characters()

    for character in characters:
        unused_frames = find_unused_move_frames(character)
        total_unused += len(unused_frames)
        output = UNUSED_OUT_DIR / f"{character['id']}-unused.png"
        if unused_frames:
            render_unused_sheet(character, unused_frames, output)
        rows.append(
            {
                "id": character["id"],
                "displayName": character["manifest"].get("displayName", character["id"]),
                "unused": len(unused_frames),
                "ranges": summarize_ranges(frame_number(frame) for frame in unused_frames),
                "output": f"unused-frames/{output.name}" if unused_frames else None,
            }
        )

    write_unused_index(rows, total_unused)
    print(
        json.dumps(
            {
                "ok": True,
                "characters": len(characters),
                "charactersWithUnusedFrames": sum(1 for row in rows if row["unused"]),
                "unusedFrames": total_unused,
                "outputDir": str(UNUSED_OUT_DIR),
                "index": str(OUT_DIR / "unused-frames.html"),
            },
            indent=2,
        )
    )


def find_unused_move_frames(character: dict[str, Any]) -> list[str]:
    all_frames = list_all_source_frames(character)
    used = {
        frame_name(frame)
        for move in resolve_configured_moves(character)
        for frame in move["frames"]
    }
    return [frame for frame in all_frames if frame_name(frame) not in used]


def list_all_source_frames(character: dict[str, Any]) -> list[str]:
    frames_dir = character["dir"] / "frames"
    frames = []
    for path in sorted(frames_dir.glob("frame-*.png"), key=lambda item: frame_number(item.name)):
        frames.append(f"/characters/{character['id']}/frames/{path.name}")
    return frames


def render_unused_sheet(character: dict[str, Any], frames: list[str], output: Path) -> None:
    fonts = load_fonts()
    frames_per_line = max(1, (SHEET_W - PAD * 2 - LABEL_W) // (TILE_W + GAP))
    line_count = max(1, math.ceil(len(frames) / frames_per_line))
    sheet_h = HEADER_H + PAD + line_count * (TILE_H + GAP) + PAD
    canvas = Image.new("RGB", (SHEET_W, sheet_h), BLACK)
    draw = ImageDraw.Draw(canvas)

    name = character["manifest"].get("displayName", character["id"])
    draw.text((PAD, 22), f"{name} unused move frames", fill=WHITE, font=fonts["title"])
    draw.text(
        (PAD, 62),
        f"{character['id']} / {len(frames)} frames not currently assigned to configured moves / ranges: {summarize_ranges(frame_number(frame) for frame in frames)}",
        fill=MUTED,
        font=fonts["small"],
    )

    y = HEADER_H
    draw.rectangle((PAD, y, SHEET_W - PAD, sheet_h - PAD), fill=PANEL, outline=LINE)
    for index, frame in enumerate(frames):
        line = index // frames_per_line
        col = index % frames_per_line
        x = PAD + 16 + col * (TILE_W + GAP)
        tile_y = y + 16 + line * (TILE_H + GAP)
        draw_frame_tile(canvas, draw, fonts, frame, x, tile_y)

    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def frame_number(value: str | Path) -> int:
    match = re.search(r"frame-(\d+)", str(value))
    return int(match.group(1)) if match else 10**9


def summarize_ranges(numbers: Any) -> str:
    values = sorted({int(number) for number in numbers if number is not None})
    if not values:
        return "-"
    ranges = []
    start = prev = values[0]
    for number in values[1:]:
        if number == prev + 1:
            prev = number
            continue
        ranges.append(format_range(start, prev))
        start = prev = number
    ranges.append(format_range(start, prev))
    return ", ".join(ranges)


def format_range(start: int, end: int) -> str:
    return f"{start:03d}" if start == end else f"{start:03d}-{end:03d}"


def write_unused_index(rows: list[dict[str, Any]], total_unused: int) -> None:
    items = []
    for row in rows:
        name = html.escape(str(row["displayName"]))
        cid = html.escape(str(row["id"]))
        ranges = html.escape(str(row["ranges"]))
        unused = int(row["unused"])
        if row["output"]:
            items.append(
                f'<li><a href="{html.escape(row["output"])}">{name}</a>'
                f"<span>{cid}</span><b>{unused} frames</b><small>{ranges}</small></li>"
            )
        else:
            items.append(f'<li class="empty"><em>{name}</em><span>{cid}</span><b>0 frames</b><small>-</small></li>')

    page = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unused playable move frames</title>
  <style>
    body {{ margin: 0; background: #050505; color: #f5f5f5; font: 14px system-ui, sans-serif; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 32px; }}
    h1 {{ margin: 0 0 8px; font-size: 32px; }}
    p {{ margin: 0 0 24px; color: #b9c2cf; }}
    ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }}
    li {{ display: grid; grid-template-columns: 1fr 260px 96px 420px; gap: 16px; align-items: center; border: 1px solid #25262b; background: #101113; padding: 10px 12px; }}
    a {{ color: #8ec8ff; text-decoration: none; }}
    a:hover {{ text-decoration: underline; }}
    span, small {{ color: #9ca3af; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
    b {{ color: #e5e7eb; text-align: right; }}
    .empty {{ opacity: .58; }}
  </style>
</head>
<body>
<main>
  <h1>Unused playable move frames</h1>
  <p>{len(rows)} playable characters, {sum(1 for row in rows if row["unused"])} with frames not currently assigned to configured moves, {total_unused} unused move frames total. <a href="unused-range-review.html">Open implementation review</a>.</p>
  <ul>
    {''.join(items)}
  </ul>
</main>
</body>
</html>
"""
    (OUT_DIR / "unused-frames.html").write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
