#!/usr/bin/env python3
"""Render black idle-vs-attack height proofs for every Adventure avatar set."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = ROOT / "public"
MANIFEST_PATH = ROOT / "src/story/storyStreetAvatarManifest.json"
OUTPUT_ROOT = ROOT / "tmp/story-avatar-height-review/after"
CELL_WIDTH = 400
ROW_HEIGHT = 260
LABEL_WIDTH = 210
BASELINE_Y = 218
ATTACK_IDS = ("attack", "attack-heavy", "attack-kick", "attack-special")


def load_frame(public_path: str) -> Image.Image:
    return Image.open(PUBLIC_ROOT / public_path.removeprefix("/")).convert("RGBA")


def place_scaled(
    canvas: Image.Image,
    frame: Image.Image,
    cell_left: int,
    baseline_y: int,
    body_anchor_x: int,
    visual_scale: float,
    opacity: float = 1.0,
) -> None:
    width = max(1, round(frame.width * visual_scale))
    height = max(1, round(frame.height * visual_scale))
    rendered = frame.resize((width, height), Image.Resampling.NEAREST)
    if opacity < 1:
        alpha = rendered.getchannel("A").point(lambda value: round(value * opacity))
        rendered.putalpha(alpha)
    left = round(cell_left + CELL_WIDTH / 2 - body_anchor_x * visual_scale)
    top = round(baseline_y - 182 * visual_scale)
    canvas.alpha_composite(rendered, (left, top))


def render_set(set_definition: dict) -> dict:
    idle_animation = next(animation for animation in set_definition["animations"] if animation["id"] == "idle")
    idle_frame_definition = idle_animation["frames"][0]
    idle_frame = load_frame(idle_frame_definition["path"])
    idle_top = idle_frame_definition["contentBounds"][1]
    attacks = [
        next(animation for animation in set_definition["animations"] if animation["id"] == animation_id)
        for animation_id in ATTACK_IDS
    ]
    maximum_frames = max(len(animation["frames"]) for animation in attacks)
    width = LABEL_WIDTH + (maximum_frames + 1) * CELL_WIDTH
    height = len(attacks) * ROW_HEIGHT
    sheet = Image.new("RGBA", (width, height), "#06080d")
    draw = ImageDraw.Draw(sheet)
    summary = {"id": set_definition["id"], "label": set_definition["label"], "animations": []}

    for row_index, animation in enumerate(attacks):
        row_top = row_index * ROW_HEIGHT
        row_baseline = row_top + BASELINE_Y
        idle_head_y = row_baseline - (182 - idle_top)
        draw.text((12, row_top + 18), set_definition["label"], fill="#f8fafc")
        draw.text((12, row_top + 42), animation["id"], fill="#93c5fd")
        draw.line((LABEL_WIDTH, row_baseline, width - 8, row_baseline), fill="#475569", width=2)
        draw.line((LABEL_WIDTH, idle_head_y, width - 8, idle_head_y), fill="#f59e0b", width=2)
        draw.text((12, idle_head_y - 7), "idle top", fill="#f59e0b")

        idle_cell_left = LABEL_WIDTH
        place_scaled(sheet, idle_frame, idle_cell_left, row_baseline, idle_frame_definition["bodyAnchorX"], 1)
        draw.text((idle_cell_left + 8, row_baseline + 18), "idle ref", fill="#fbbf24")

        scales = []
        for frame_index, frame_definition in enumerate(animation["frames"]):
            cell_left = LABEL_WIDTH + (frame_index + 1) * CELL_WIDTH
            frame = load_frame(frame_definition["path"])
            visual_scale = float(frame_definition.get("visualScale", 1))
            place_scaled(sheet, idle_frame, cell_left, row_baseline, idle_frame_definition["bodyAnchorX"], 1, opacity=0.18)
            place_scaled(sheet, frame, cell_left, row_baseline, frame_definition["bodyAnchorX"], visual_scale)
            draw.text(
                (cell_left + 8, row_baseline + 18),
                f"{frame_definition['id']}  {visual_scale:.3f}x",
                fill="#cbd5e1",
            )
            scales.append(visual_scale)

        draw.line((0, row_top + ROW_HEIGHT - 2, width, row_top + ROW_HEIGHT - 2), fill="#1e293b", width=2)
        summary["animations"].append({
            "id": animation["id"],
            "frameCount": len(animation["frames"]),
            "minimumVisualScale": min(scales),
            "maximumVisualScale": max(scales),
            "scales": scales,
        })

    output_path = OUTPUT_ROOT / f"{set_definition['id']}.png"
    sheet.save(output_path, optimize=True)
    summary["proof"] = str(output_path)
    return summary


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text())
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    summaries = [render_set(set_definition) for set_definition in manifest["sets"]]
    (OUTPUT_ROOT / "summary.json").write_text(json.dumps({"sets": summaries}, indent=2) + "\n")
    print(f"rendered {len(summaries)} Adventure avatar attack-height sheets in {OUTPUT_ROOT}")


if __name__ == "__main__":
    main()
