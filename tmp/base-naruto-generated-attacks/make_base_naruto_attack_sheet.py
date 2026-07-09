from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
CHAR_DIR = ROOT / "public/characters/kiro"
FRAME_DIR = CHAR_DIR / "frames"
OUT_DIR = ROOT / "tmp/base-naruto-generated-attacks"
OUT_FRAMES = OUT_DIR / "frames"
OUT_TIGHT_FRAMES = OUT_DIR / "frames-tight"

CELL_W = 192
CELL_H = 144
BASELINE = 128
MAX_SOURCE_FRAME = 50


@dataclass(frozen=True)
class AttackFrame:
    source: int
    x: int = 72
    y: int | None = None
    flip: bool = False
    scale: float = 1.0
    afterimage: bool = False
    clones: tuple[tuple[int, int, float], ...] = ()
    rasengan: tuple[int, int, int] | None = None
    impact: tuple[int, int, int] | None = None
    slash: tuple[int, int, int, int, int] | None = None
    smoke: tuple[tuple[int, int, int], ...] = ()


@dataclass(frozen=True)
class Attack:
    slug: str
    name: str
    frames: tuple[AttackFrame, ...]


def load_frame(index: int) -> Image.Image:
    if index > MAX_SOURCE_FRAME:
        raise ValueError(f"source frame {index} is past the allowed cap of {MAX_SOURCE_FRAME}")
    return Image.open(FRAME_DIR / f"frame-{index:03d}.png").convert("RGBA")


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def ghost_image(im: Image.Image, color: tuple[int, int, int], opacity: float) -> Image.Image:
    src = im.convert("RGBA")
    solid = Image.new("RGBA", src.size, (*color, 0))
    solid.putalpha(src.getchannel("A").point(lambda a: int(a * opacity)))
    return solid


def paste_sprite(canvas: Image.Image, sprite: Image.Image, x: int, y: int | None, scale: float = 1.0):
    sprite = trim(sprite)
    if scale != 1.0:
        sprite = sprite.resize(
            (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
            Image.Resampling.NEAREST,
        )
    top = y if y is not None else BASELINE - sprite.height
    canvas.alpha_composite(sprite, (x, top))


def draw_rasengan(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int):
    for rr, color, width in [
        (r + 8, (75, 190, 255, 110), 2),
        (r + 4, (88, 216, 255, 180), 2),
        (r, (210, 252, 255, 235), 2),
    ]:
        draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=color, width=width)
    for a in range(0, 360, 60):
        rad = math.radians(a)
        x1 = cx + math.cos(rad) * (r - 2)
        y1 = cy + math.sin(rad) * (r - 2)
        x2 = cx + math.cos(rad + 0.55) * (r + 9)
        y2 = cy + math.sin(rad + 0.55) * (r + 9)
        draw.line((x1, y1, x2, y2), fill=(102, 225, 255, 205), width=2)
    draw.ellipse((cx - max(2, r // 3), cy - max(2, r // 3), cx + max(2, r // 3), cy + max(2, r // 3)), fill=(238, 255, 255, 235))


def draw_impact(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int):
    points = []
    for i in range(16):
        rad = math.radians(i * 22.5)
        rr = r if i % 2 == 0 else r // 2
        points.append((cx + math.cos(rad) * rr, cy + math.sin(rad) * rr))
    draw.polygon(points, fill=(255, 229, 89, 235))
    for i in range(8):
        rad = math.radians(i * 45 + 12)
        draw.line(
            (cx, cy, cx + math.cos(rad) * (r + 11), cy + math.sin(rad) * (r + 11)),
            fill=(255, 128, 36, 210),
            width=2,
        )


def draw_slash(draw: ImageDraw.ImageDraw, x1: int, y1: int, x2: int, y2: int, width: int):
    for color, w in [
        ((255, 130, 32, 130), width + 3),
        ((255, 228, 80, 210), width),
        ((255, 255, 214, 235), max(1, width // 2)),
    ]:
        draw.line((x1, y1, x2, y2), fill=color, width=w)
    angle = math.atan2(y2 - y1, x2 - x1)
    nx = math.cos(angle + math.pi / 2)
    ny = math.sin(angle + math.pi / 2)
    tip = [
        (x2, y2),
        (x2 - math.cos(angle) * 14 + nx * (width + 2), y2 - math.sin(angle) * 14 + ny * (width + 2)),
        (x2 - math.cos(angle) * 14 - nx * (width + 2), y2 - math.sin(angle) * 14 - ny * (width + 2)),
    ]
    draw.polygon(tip, fill=(255, 207, 75, 150))


def draw_smoke(draw: ImageDraw.ImageDraw, puffs: Iterable[tuple[int, int, int]]):
    for x, y, r in puffs:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(220, 220, 204, 135))
        draw.ellipse((x - r + 2, y - r + 3, x + r - 4, y + r - 2), fill=(92, 92, 92, 70))


def draw_frame(spec: AttackFrame) -> Image.Image:
    canvas = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    sprite = load_frame(spec.source)
    if spec.flip:
        sprite = ImageChops.mirror(sprite)

    if spec.afterimage:
        paste_sprite(canvas, ghost_image(sprite, (80, 190, 255), 0.18), spec.x - 17, spec.y, spec.scale)
        paste_sprite(canvas, ghost_image(sprite, (255, 210, 78), 0.15), spec.x - 31, spec.y, spec.scale)

    for dx, dy, opacity in spec.clones:
        clone = ghost_image(sprite, (226, 226, 214), opacity)
        paste_sprite(canvas, clone, spec.x + dx, (spec.y + dy) if spec.y is not None else None, spec.scale)

    if spec.slash:
        draw_slash(draw, *spec.slash)
    if spec.smoke:
        draw_smoke(draw, spec.smoke)
    paste_sprite(canvas, sprite, spec.x, spec.y, spec.scale)
    if spec.rasengan:
        draw_rasengan(draw, *spec.rasengan)
    if spec.impact:
        draw_impact(draw, *spec.impact)
    return canvas


ATTACKS = (
    Attack(
        "dash-clone-strike",
        "Dash Clone Strike",
        (
            AttackFrame(1, x=70, smoke=((53, 123, 5),)),
            AttackFrame(4, x=78, afterimage=True, clones=((-43, 0, 0.16),), smoke=((47, 124, 4),)),
            AttackFrame(5, x=86, afterimage=True, clones=((-53, 0, 0.2),), slash=(68, 86, 154, 69, 3)),
            AttackFrame(6, x=94, afterimage=True, clones=((-58, 0, 0.22),), slash=(75, 83, 165, 62, 4)),
            AttackFrame(8, x=101, afterimage=True, slash=(83, 92, 173, 64, 4)),
            AttackFrame(13, x=106, impact=(166, 74, 13)),
            AttackFrame(14, x=102, impact=(158, 76, 11), smoke=((141, 124, 5),)),
            AttackFrame(15, x=75),
        ),
    ),
    Attack(
        "chakra-palm-burst",
        "Chakra Palm Burst",
        (
            AttackFrame(21, x=73, rasengan=(117, 78, 8)),
            AttackFrame(23, x=78, rasengan=(126, 77, 11)),
            AttackFrame(25, x=84, afterimage=True, rasengan=(137, 75, 14)),
            AttackFrame(26, x=89, afterimage=True, rasengan=(148, 74, 17)),
            AttackFrame(28, x=92, afterimage=True, rasengan=(156, 73, 18), impact=(168, 72, 10)),
            AttackFrame(29, x=92, impact=(158, 72, 16)),
            AttackFrame(27, x=80, smoke=((136, 123, 6), (151, 124, 4))),
            AttackFrame(21, x=73),
        ),
    ),
    Attack(
        "aerial-flame-crash",
        "Aerial Flame Crash",
        (
            AttackFrame(30, x=88, y=54, afterimage=True, slash=(62, 86, 147, 49, 4)),
            AttackFrame(31, x=88, y=65, afterimage=True, slash=(69, 99, 158, 57, 4)),
            AttackFrame(32, x=86, y=70, afterimage=True, slash=(73, 103, 164, 71, 4)),
            AttackFrame(33, x=92, y=80, impact=(159, 85, 13)),
            AttackFrame(34, x=92, y=62, afterimage=True, impact=(160, 75, 16)),
            AttackFrame(36, x=92, y=80, slash=(78, 94, 171, 84, 3)),
            AttackFrame(38, x=90, y=82, impact=(158, 84, 12), smoke=((142, 124, 5),)),
            AttackFrame(39, x=88, y=83, smoke=((132, 124, 6), (150, 124, 4))),
        ),
    ),
    Attack(
        "flip-low-sweep",
        "Flip Low Sweep",
        (
            AttackFrame(40, x=74, smoke=((63, 124, 5),)),
            AttackFrame(41, x=78, afterimage=True, slash=(70, 102, 154, 91, 3)),
            AttackFrame(42, x=83, afterimage=True, slash=(77, 99, 164, 75, 4)),
            AttackFrame(43, x=84, impact=(153, 82, 11)),
            AttackFrame(44, x=88, y=80, afterimage=True, slash=(75, 98, 169, 63, 4)),
            AttackFrame(45, x=88, y=78, impact=(160, 72, 13)),
            AttackFrame(46, x=86, y=78, slash=(79, 79, 164, 87, 3)),
            AttackFrame(47, x=78, smoke=((137, 124, 5), (151, 124, 4))),
        ),
    ),
    Attack(
        "uzumaki-barrage",
        "Naruto Uzumaki Barrage",
        (
            AttackFrame(1, x=72, clones=((-46, 0, 0.18), (45, 0, 0.18)), smoke=((48, 124, 5), (145, 124, 5))),
            AttackFrame(4, x=84, afterimage=True, clones=((-52, 0, 0.24),), slash=(63, 86, 153, 67, 3)),
            AttackFrame(13, x=99, afterimage=True, clones=((-58, 0, 0.22),), impact=(156, 76, 11)),
            AttackFrame(14, x=103, afterimage=True, clones=((-62, 0, 0.18), (34, 0, 0.14)), impact=(166, 70, 14)),
            AttackFrame(44, x=88, y=74, afterimage=True, slash=(65, 103, 166, 57, 4)),
            AttackFrame(34, x=92, y=58, afterimage=True, impact=(160, 72, 16)),
            AttackFrame(38, x=90, y=82, impact=(159, 87, 15), smoke=((137, 124, 7), (154, 124, 5))),
            AttackFrame(21, x=74, smoke=((126, 124, 5), (146, 124, 4))),
        ),
    ),
)


def make_sheet():
    OUT_FRAMES.mkdir(parents=True, exist_ok=True)
    OUT_TIGHT_FRAMES.mkdir(parents=True, exist_ok=True)
    for folder in (OUT_FRAMES, OUT_TIGHT_FRAMES):
        for old_frame in folder.glob("*.png"):
            old_frame.unlink()
    sheet = Image.new("RGBA", (CELL_W * 8, CELL_H * len(ATTACKS)), (0, 0, 0, 0))
    preview = Image.new("RGBA", sheet.size, (18, 18, 18, 255))
    draw_preview = ImageDraw.Draw(preview)
    metadata = {"cell": [CELL_W, CELL_H], "character": "kiro", "displayName": "Naruto", "attacks": []}

    for row, attack in enumerate(ATTACKS):
        frame_files = []
        for col, frame_spec in enumerate(attack.frames):
            frame = draw_frame(frame_spec)
            name = f"{attack.slug}-{col:02d}.png"
            frame.save(OUT_FRAMES / name)
            bbox = frame.getbbox()
            (frame.crop(bbox) if bbox else frame).save(OUT_TIGHT_FRAMES / name)
            x = col * CELL_W
            y = row * CELL_H
            sheet.alpha_composite(frame, (x, y))
            preview.alpha_composite(frame, (x, y))
            draw_preview.rectangle((x, y, x + CELL_W - 1, y + CELL_H - 1), outline=(72, 72, 72, 255))
            draw_preview.text((x + 6, y + 5), f"{attack.slug} {col + 1}", fill=(245, 245, 245, 255))
            frame_files.append(f"frames/{name}")
        metadata["attacks"].append(
            {
                "slug": attack.slug,
                "name": attack.name,
                "fps": 10,
                "frames": frame_files,
                "tightFrames": [f"frames-tight/{Path(f).name}" for f in frame_files],
                "sourceFrames": [f.source for f in attack.frames],
            }
        )

    sheet.save(OUT_DIR / "base-naruto-generated-attacks-sheet.png")
    preview.save(OUT_DIR / "base-naruto-generated-attacks-preview.png")
    (OUT_DIR / "base-naruto-generated-attacks.json").write_text(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    make_sheet()
