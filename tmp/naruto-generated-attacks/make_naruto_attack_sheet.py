from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageChops, ImageDraw, ImageEnhance


ROOT = Path(__file__).resolve().parents[2]
CHAR_DIR = ROOT / "public/characters/naruto-uzumaki-nine-tails-kyubi"
FRAME_DIR = CHAR_DIR / "frames"
OUT_DIR = ROOT / "tmp/naruto-generated-attacks"
OUT_FRAMES = OUT_DIR / "frames"
OUT_TIGHT_FRAMES = OUT_DIR / "frames-tight"

CELL_W = 192
CELL_H = 128
BASELINE = 108


@dataclass(frozen=True)
class AttackFrame:
    source: int
    x: int = 72
    y: int | None = None
    flip: bool = False
    scale: float = 1.0
    afterimage: bool = False
    clones: tuple[tuple[int, int, float], ...] = ()
    ball: tuple[int, int, int] | None = None
    slash: tuple[int, int, int, int, int] | None = None
    smoke: tuple[tuple[int, int, int], ...] = ()
    tint: tuple[int, int, int, float] | None = None


@dataclass(frozen=True)
class Attack:
    slug: str
    name: str
    frames: tuple[AttackFrame, ...]


def load_frame(index: int) -> Image.Image:
    return Image.open(FRAME_DIR / f"frame-{index:03d}.png").convert("RGBA")


def trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    return im.crop(bbox)


def tint_image(im: Image.Image, color: tuple[int, int, int], amount: float) -> Image.Image:
    src = im.convert("RGBA")
    overlay = Image.new("RGBA", src.size, (*color, 0))
    alpha = src.getchannel("A").point(lambda a: int(a * amount))
    overlay.putalpha(alpha)
    return Image.alpha_composite(src, overlay)


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
    return sprite.size


def draw_chakra_ball(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int):
    colors = [
        (255, 246, 135, 255),
        (255, 157, 32, 230),
        (255, 70, 25, 210),
        (207, 0, 30, 180),
    ]
    for i, color in enumerate(reversed(colors)):
        rr = r + (len(colors) - i - 1) * 3
        draw.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=color, width=2)
    for a in range(0, 360, 45):
        rad = math.radians(a)
        x1 = cx + math.cos(rad) * (r - 2)
        y1 = cy + math.sin(rad) * (r - 2)
        x2 = cx + math.cos(rad + 0.45) * (r + 10)
        y2 = cy + math.sin(rad + 0.45) * (r + 10)
        draw.line((x1, y1, x2, y2), fill=(255, 84, 20, 205), width=2)
    draw.ellipse((cx - max(2, r // 3), cy - max(2, r // 3), cx + max(2, r // 3), cy + max(2, r // 3)), fill=(255, 244, 185, 235))


def draw_slash(draw: ImageDraw.ImageDraw, x1: int, y1: int, x2: int, y2: int, width: int):
    palette = [
        ((207, 0, 30, 150), max(2, width + 2)),
        ((255, 137, 30, 205), max(2, width)),
        ((255, 237, 99, 235), max(1, width // 2)),
    ]
    for color, w in palette:
        draw.line((x1, y1, x2, y2), fill=color, width=w)
    angle = math.atan2(y2 - y1, x2 - x1)
    nx = math.cos(angle + math.pi / 2)
    ny = math.sin(angle + math.pi / 2)
    tip = [
        (x2, y2),
        (x2 - math.cos(angle) * 18 + nx * (width + 3), y2 - math.sin(angle) * 18 + ny * (width + 3)),
        (x2 - math.cos(angle) * 18 - nx * (width + 3), y2 - math.sin(angle) * 18 - ny * (width + 3)),
    ]
    draw.polygon(tip, fill=(255, 110, 26, 135))
    # broken pixel sparks along the slash
    steps = 12
    for i in range(steps):
        t = i / (steps - 1)
        x = round(x1 + (x2 - x1) * t)
        y = round(y1 + (y2 - y1) * t)
        if i % 2 == 0:
            draw.rectangle((x + 4, y - 3, x + 7, y), fill=(255, 220, 70, 255))
        else:
            draw.rectangle((x - 6, y + 3, x - 3, y + 6), fill=(221, 26, 24, 220))


def draw_smoke(draw: ImageDraw.ImageDraw, puffs: Iterable[tuple[int, int, int]]):
    for x, y, r in puffs:
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(224, 224, 210, 150))
        draw.ellipse((x - r + 2, y - r + 3, x + r - 4, y + r - 2), fill=(112, 112, 112, 90))


def draw_frame(spec: AttackFrame) -> Image.Image:
    canvas = Image.new("RGBA", (CELL_W, CELL_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)

    sprite = load_frame(spec.source)
    if spec.flip:
        sprite = ImageChops.mirror(sprite)
    if spec.tint:
        sprite = tint_image(sprite, spec.tint[:3], spec.tint[3])

    if spec.afterimage:
        ghost = ghost_image(sprite, (255, 56, 20), 0.24)
        paste_sprite(canvas, ghost, spec.x - 18, spec.y, spec.scale)
        ghost2 = ghost_image(sprite, (255, 190, 54), 0.16)
        paste_sprite(canvas, ghost2, spec.x - 32, spec.y, spec.scale)

    for dx, dy, opacity in spec.clones:
        clone = ghost_image(sprite, (230, 230, 225), opacity)
        paste_sprite(canvas, clone, spec.x + dx, (spec.y + dy) if spec.y is not None else None, spec.scale)

    if spec.slash:
        draw_slash(draw, *spec.slash)
    paste_sprite(canvas, sprite, spec.x, spec.y, spec.scale)

    if spec.ball:
        draw_chakra_ball(draw, *spec.ball)
    if spec.smoke:
        draw_smoke(draw, spec.smoke)

    return canvas


ATTACKS = (
    Attack(
        "shadow-clone-pincer",
        "Shadow Clone Pincer",
        (
            AttackFrame(105, x=70, smoke=((58, 101, 7),)),
            AttackFrame(106, x=70, clones=((-42, 0, 0.18), (42, 0, 0.18)), smoke=((50, 105, 6), (138, 105, 6))),
            AttackFrame(107, x=68, clones=((-48, 0, 0.28), (50, 0, 0.28))),
            AttackFrame(108, x=70, clones=((-54, 0, 0.34), (56, 0, 0.34)), slash=(32, 74, 159, 50, 5)),
            AttackFrame(109, x=72, clones=((-44, 0, 0.26), (50, 0, 0.26)), slash=(44, 82, 162, 38, 6)),
            AttackFrame(110, x=75, afterimage=True, slash=(60, 86, 170, 60, 4)),
            AttackFrame(111, x=76, afterimage=True),
            AttackFrame(105, x=72, smoke=((48, 104, 5), (135, 104, 5))),
        ),
    ),
    Attack(
        "kyubi-rasengan-lunge",
        "Kyubi Rasengan Lunge",
        (
            AttackFrame(127, x=72, ball=(125, 68, 10)),
            AttackFrame(128, x=73, ball=(131, 66, 13)),
            AttackFrame(129, x=76, afterimage=True, ball=(137, 64, 15)),
            AttackFrame(130, x=82, afterimage=True, ball=(148, 58, 18), slash=(96, 72, 171, 50, 4)),
            AttackFrame(131, x=88, afterimage=True, ball=(157, 55, 20), slash=(103, 80, 181, 44, 6)),
            AttackFrame(132, x=94, afterimage=True, ball=(162, 57, 16), slash=(110, 82, 183, 61, 5)),
            AttackFrame(133, x=92, ball=(151, 62, 11), smoke=((55, 106, 5),)),
            AttackFrame(134, x=79, smoke=((62, 107, 6), (92, 108, 4))),
        ),
    ),
    Attack(
        "tail-claw-barrage",
        "Tail Claw Barrage",
        (
            AttackFrame(120, x=72),
            AttackFrame(121, x=70, slash=(63, 65, 148, 42, 3)),
            AttackFrame(122, x=70, slash=(52, 50, 156, 75, 4)),
            AttackFrame(123, x=72, slash=(57, 82, 161, 47, 4)),
            AttackFrame(124, x=74, slash=(72, 42, 164, 84, 4)),
            AttackFrame(125, x=75, afterimage=True, slash=(49, 66, 160, 66, 4)),
            AttackFrame(126, x=72, afterimage=True, slash=(63, 88, 151, 42, 3)),
            AttackFrame(127, x=70, smoke=((130, 105, 5), (144, 103, 4))),
        ),
    ),
)


def make_sheet():
    OUT_FRAMES.mkdir(parents=True, exist_ok=True)
    OUT_TIGHT_FRAMES.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (CELL_W * 8, CELL_H * len(ATTACKS)), (0, 0, 0, 0))
    preview = Image.new("RGBA", (sheet.width, sheet.height), (18, 18, 18, 255))
    draw_preview = ImageDraw.Draw(preview)
    metadata = {"cell": [CELL_W, CELL_H], "attacks": []}

    for row, attack in enumerate(ATTACKS):
        attack_files = []
        for col, frame_spec in enumerate(attack.frames):
            frame = draw_frame(frame_spec)
            name = f"{attack.slug}-{col:02d}.png"
            frame.save(OUT_FRAMES / name)
            bbox = frame.getbbox()
            tight = frame.crop(bbox) if bbox else frame
            tight.save(OUT_TIGHT_FRAMES / name)
            x = col * CELL_W
            y = row * CELL_H
            sheet.alpha_composite(frame, (x, y))
            preview.alpha_composite(frame, (x, y))
            draw_preview.rectangle((x, y, x + CELL_W - 1, y + CELL_H - 1), outline=(72, 72, 72, 255))
            draw_preview.text((x + 6, y + 5), f"{attack.slug} {col + 1}", fill=(245, 245, 245, 255))
            attack_files.append(f"frames/{name}")
        metadata["attacks"].append(
            {
                "slug": attack.slug,
                "name": attack.name,
                "fps": 10,
                "frames": attack_files,
                "tightFrames": [f"frames-tight/{Path(f).name}" for f in attack_files],
                "sourceFrames": [f.source for f in attack.frames],
            }
        )

    sheet.save(OUT_DIR / "naruto-generated-attacks-sheet.png")
    preview.save(OUT_DIR / "naruto-generated-attacks-preview.png")
    (OUT_DIR / "naruto-generated-attacks.json").write_text(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    make_sheet()
