#!/usr/bin/env python3
"""Preview or apply full-body ImageGen walk-cycle leg corrections.

Each edit target is a complete eight-frame strip. ImageGen sees the complete
character and animation and is instructed to change only the legs in frames
5-8. The importer accepts complete generated frames, avoiding the waist seams
and clipped garments caused by geometric lower-body masks.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
from collections import deque
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
STAGING = ROOT / "tmp/walk-imagegen"
PREVIEW = STAGING / "candidate-review"
REGISTRY_PATH = ROOT / "src/story/storyRosterExpansion.json"
NPC_MANIFEST_PATH = ROOT / "src/story/storyNpcManifest.json"
ENEMY_MANIFEST_PATH = ROOT / "src/story/storyEnemyManifest.json"
PUBLIC_NPC_MANIFEST_PATH = PUBLIC / "story/npcs/manifest.json"
PUBLIC_ENEMY_MANIFEST_PATH = PUBLIC / "story/enemies/kore-enemies-v1/manifest.json"
REVIEW_PATH = ROOT / "src/story/storyWalkImagegenReview.json"
EVIDENCE = PUBLIC / "story/walk-repairs/imagegen"
FRAME_SIZE = 192
BASELINE = 188

PROMPT_VERSION = "full-body-opposite-lead-v1"
PROMPT = (
    "Keep the complete character visible in every panel. Leave frames 1-4 visually identical. "
    "In frames 5-8, change only the character's lower limbs below the pelvis so the opposite leg "
    "or opposite grounded limb group takes the forward/leading position. Preserve every pixel "
    "above the pelvis, identity, equipment, palette, scale, baseline, and right-facing direction."
)

ENEMY_LOCOMOTION: dict[str, str] = {
    "haywire-mite": "multileg", "harvest-warden": "biped", "millstorm-sage": "biped",
    "briar-maw": "quadruped", "sporecap-stalker": "biped", "rootbound-huntress": "biped", "heartwood-oracle": "biped",
    "rail-jaw": "quadruped", "ore-spitter": "multileg", "iron-foreman": "biped", "sunstone-artificer": "biped",
    "crypt-hound": "quadruped", "ossuary-knight": "biped", "violet-bellkeeper": "biped",
    "slag-beetle": "multileg", "vent-imp": "biped", "caldera-titan": "biped", "forge-seer": "biped",
    "ice-tusk": "quadruped", "windspine-reaver": "biped", "dune-claw": "multileg",
    "buried-colossus": "biped", "glasswater-seer": "biped", "prism-sentinel": "quadruped", "orbit-blade": "biped",
}
NPC_EXEMPT: dict[str, str] = {
    "aero-wispkin": "hovering spirit has no grounded lead legs",
    "corvus-arch": "robe-hidden hovering gait has no visible lead feet",
    "oss-whisper": "hovering spirit has no grounded lead legs",
    "sol-ashling": "legless ash spirit",
    "vell-wraithkin": "legless hovering wraith",
}

FULL_FRAME_REPAIR = {"glint-shardling", "nuri-sandling"}

ENEMY_EXEMPT: dict[str, str] = {
    "aurora-herald": "hovering enemy", "bellwing-moth": "flying enemy",
    "chime-orb": "hovering orb", "coalwing": "flying enemy",
    "dirge-moth": "flying enemy", "gale-owl": "flying enemy",
    "glasswing-vulture": "flying enemy", "lantern-bat": "flying enemy",
    "marrow-caster": "hovering caster", "mirage-cobra": "legless enemy",
    "rift-ray": "flying enemy", "sanctum-architect": "hovering enemy",
    "shard-caller": "hovering enemy", "sluice-sprite": "hovering spirit",
    "spark-drone": "flying drone",
    "forge-seer": "robe-hidden hovering gait has no visible lead feet",
    "orbit-blade": "hovering bladed caster has no grounded lead feet",
    "ossuary-knight": "robe-hidden hovering gait has no visible lead feet",
    "violet-bellkeeper": "robe-hidden gait has no independently visible lead feet",
}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def chroma_mask(image: Image.Image) -> Image.Image:
    red, green, blue = image.convert("RGB").split()
    high_red = red.point(lambda value: 255 if value > 175 else 0)
    high_blue = blue.point(lambda value: 255 if value > 175 else 0)
    low_green = green.point(lambda value: 255 if value < 100 else 0)
    close_rb = ImageChops.difference(red, blue).point(lambda value: 255 if value < 100 else 0)
    return ImageChops.multiply(ImageChops.multiply(high_red, high_blue), ImageChops.multiply(low_green, close_rb))


def remove_connected_magenta(image: Image.Image) -> Image.Image:
    """Remove only magenta that is connected to the panel background.

    ImageGen keeps the requested key color, but its resampling can leave a thin
    purple fringe. Flooding from the panel edge avoids deleting legitimate
    purple costume pixels inside the character.
    """
    output = image.convert("RGBA")
    pixels = output.load()
    width, height = output.size
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def key_like(x: int, y: int) -> bool:
        red, green, blue, _alpha = pixels[x, y]
        return red > 140 and blue > 125 and green < 45 and abs(red - blue) < 85

    for x in range(width):
        if key_like(x, 0):
            queue.append((x, 0))
        if key_like(x, height - 1):
            queue.append((x, height - 1))
    for y in range(height):
        if key_like(0, y):
            queue.append((0, y))
        if key_like(width - 1, y):
            queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        key = y * width + x
        if visited[key] or not key_like(x, y):
            continue
        visited[key] = 1
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and not visited[ny * width + nx]:
                queue.append((nx, ny))

    for y in range(height):
        for x in range(width):
            if visited[y * width + x]:
                red, green, blue, _alpha = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0)

    strict = chroma_mask(output).load()
    for y in range(height):
        for x in range(width):
            if strict[x, y]:
                red, green, blue, _alpha = pixels[x, y]
                pixels[x, y] = (red, green, blue, 0)

    return output


def generated_frames(path: Path) -> list[Image.Image]:
    with Image.open(path) as opened:
        source = opened.convert("RGBA")
    mask = chroma_mask(source)
    chroma_bounds = mask.getbbox()
    if not chroma_bounds:
        raise ValueError(f"No uniform chroma strip found in {path}")
    top, bottom = chroma_bounds[1], chroma_bounds[3]
    band = hard_alpha(remove_connected_magenta(source.crop((0, top, source.width, bottom))))
    bodies = sorted(components(band), key=len, reverse=True)[:8]
    if len(bodies) != 8:
        raise ValueError(f"Expected eight complete generated bodies in {path}; found {len(bodies)}")
    centers = sorted(round((min(x for x, _y in body) + max(x for x, _y in body) + 1) / 2) for body in bodies)
    spacings = sorted(right - left for left, right in zip(centers, centers[1:]))
    cell_width = spacings[len(spacings) // 2]
    frames: list[Image.Image] = []
    for center in centers:
        left = max(0, min(band.width - cell_width, round(center - cell_width / 2)))
        frame = band.crop((left, 0, left + cell_width, band.height)).resize((FRAME_SIZE, FRAME_SIZE), Image.Resampling.NEAREST)
        frames.append(hard_alpha(frame))
    return frames


def components(image: Image.Image) -> list[list[tuple[int, int]]]:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    visited = bytearray(image.width * image.height)
    found: list[list[tuple[int, int]]] = []
    for y in range(image.height):
        for x in range(image.width):
            key = y * image.width + x
            if visited[key] or pixels[x, y] <= 16:
                continue
            visited[key] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for ny in range(max(0, cy - 1), min(image.height, cy + 2)):
                    for nx in range(max(0, cx - 1), min(image.width, cx + 2)):
                        neighbor = ny * image.width + nx
                        if not visited[neighbor] and pixels[nx, ny] > 16:
                            visited[neighbor] = 1
                            queue.append((nx, ny))
            found.append(component)
    return found


def primary_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    found = components(image)
    if not found:
        raise ValueError("Empty walk frame")
    body = max(found, key=len)
    return min(x for x, _ in body), min(y for _, y in body), max(x for x, _ in body) + 1, max(y for _, y in body) + 1


def align_generated(original: Image.Image, generated: Image.Image) -> Image.Image:
    ob = primary_bounds(original)
    gb = primary_bounds(generated)
    original_center = round((ob[0] + ob[2]) / 2)
    generated_center = round((gb[0] + gb[2]) / 2)
    dx = original_center - generated_center
    dy = ob[3] - gb[3]
    aligned = Image.new("RGBA", original.size)
    aligned.alpha_composite(generated, (dx, dy))
    return aligned


def actor_center(image: Image.Image, bounds: tuple[int, int, int, int]) -> int:
    left, top, right, bottom = bounds
    height = bottom - top
    y0 = round(top + height * 0.32)
    y1 = round(top + height * 0.57)
    alpha = image.getchannel("A")
    xs = [x for y in range(y0, y1) for x in range(left, right) if alpha.getpixel((x, y)) > 16]
    if not xs:
        return round((left + right) / 2)
    xs.sort()
    return xs[len(xs) // 2]


def hard_alpha(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A").point(lambda value: 255 if value > 16 else 0)
    output = image.copy()
    output.putalpha(alpha)
    return output


def enforce_runtime_baseline(image: Image.Image, place_primary: bool = False) -> Image.Image:
    output = hard_alpha(image)
    if place_primary:
        bounds = primary_bounds(output)
        dy = BASELINE - bounds[3]
        placed = Image.new("RGBA", output.size)
        placed.alpha_composite(output, (0, dy))
        output = placed
    # The main body has already been aligned by its primary component. Any
    # remaining pixels below the runtime baseline are detached ImageGen fringe
    # or ground debris, not feet, and must not move the body upward.
    output.paste((0, 0, 0, 0), (0, BASELINE, output.width, output.height))
    return output


def reference_frames(path: Path) -> list[Image.Image]:
    with Image.open(path) as opened:
        strip = opened.convert("RGBA")
    if strip.size != (8 * FRAME_SIZE, FRAME_SIZE):
        raise ValueError(f"Expected a complete 1536x192 full-body walk strip: {path}")
    frames: list[Image.Image] = []
    for index in range(8):
        frame = strip.crop((index * FRAME_SIZE, 0, (index + 1) * FRAME_SIZE, FRAME_SIZE))
        frames.append(hard_alpha(remove_connected_magenta(frame)))
    return frames


def candidate_frames(input_path: Path, generated_path: Path, actor_id: str) -> list[Image.Image]:
    originals = reference_frames(input_path)
    generated = generated_frames(generated_path)
    if actor_id in FULL_FRAME_REPAIR:
        return [enforce_runtime_baseline(frame, place_primary=True) for frame in generated]
    result = [frame.copy() for frame in originals]
    for index in range(4, 8):
        result[index] = enforce_runtime_baseline(align_generated(originals[index], generated[index]))
    return result


def registry_maps() -> tuple[dict[str, tuple[str, str]], dict[str, tuple[str, str]]]:
    registry = json.loads(REGISTRY_PATH.read_text())
    npcs: dict[str, tuple[str, str]] = {}
    enemies: dict[str, tuple[str, str]] = {}
    for biome_id, biome in registry["biomes"].items():
        npcs.update({row[0]: (biome_id, biome["chromaKey"]) for row in biome["npcs"]})
        enemies.update({row[0]: (biome_id, biome["chromaKey"]) for row in biome["enemies"]})
    return npcs, enemies


def jobs() -> list[dict[str, Any]]:
    npc_biomes, enemy_biomes = registry_maps()
    npc_manifest = json.loads(NPC_MANIFEST_PATH.read_text())
    enemy_manifest = json.loads(ENEMY_MANIFEST_PATH.read_text())
    npc_by_id = {entry["id"]: entry for entry in npc_manifest["npcs"]}
    enemy_by_id = {entry["id"]: entry for entry in enemy_manifest["enemies"]}
    result: list[dict[str, Any]] = []
    for actor_id, (biome_id, chroma_key) in npc_biomes.items():
        if actor_id in NPC_EXEMPT:
            continue
        result.append({"kind": "npc", "id": actor_id, "biomeId": biome_id, "chromaKey": chroma_key, "locomotion": "biped", "paths": npc_by_id[actor_id]["actions"]["walk"]["frames"]})
    for actor_id, (biome_id, chroma_key) in enemy_biomes.items():
        if actor_id in ENEMY_EXEMPT:
            continue
        locomotion = ENEMY_LOCOMOTION.get(actor_id)
        if locomotion is None:
            continue
        walk = next(animation for animation in enemy_by_id[actor_id]["animations"] if animation["id"] == "walk")
        result.append({"kind": "enemy", "id": actor_id, "biomeId": biome_id, "chromaKey": chroma_key, "locomotion": locomotion, "paths": [frame["path"] for frame in walk["frames"]]})
    return result


def compose_strip(frames: list[Image.Image], scale: int = 1) -> Image.Image:
    strip = Image.new("RGBA", (8 * FRAME_SIZE * scale, FRAME_SIZE * scale), (13, 17, 27, 255))
    for index, frame in enumerate(frames):
        if scale != 1:
            frame = frame.resize((FRAME_SIZE * scale, FRAME_SIZE * scale), Image.Resampling.NEAREST)
        strip.alpha_composite(frame, (index * FRAME_SIZE * scale, 0))
    return strip


def npc_contact_sheet(entry: dict[str, Any]) -> None:
    cells: list[tuple[str, Image.Image]] = []
    for action, definition in entry["actions"].items():
        for index, path in enumerate(definition["frames"]):
            cells.append((f"{action} {index + 1}", Image.open(PUBLIC / path.lstrip("/")).convert("RGBA")))
    rows = (len(cells) + 7) // 8
    sheet = Image.new("RGB", (8 * FRAME_SIZE, rows * 216), "#11151b")
    draw = ImageDraw.Draw(sheet)
    for index, (label, frame) in enumerate(cells):
        x, y = index % 8 * FRAME_SIZE, index // 8 * 216
        sheet.paste(frame, (x, y), frame)
        draw.text((x + 6, y + 196), label, fill="#e8edf2")
    sheet.save(PUBLIC / entry["contactSheetPath"].lstrip("/"), optimize=True)
    for _label, frame in cells:
        frame.close()
    sheet.close()
    gc.collect()


def enemy_contact_sheet(manifest: dict[str, Any]) -> None:
    thumb = 72
    columns = ("idle", "walk", "run", "attack-1", "attack-2", "attack-3", "hurt", "dead")
    sheet = Image.new("RGBA", (thumb * len(columns), thumb * len(manifest["enemies"])), (12, 17, 27, 255))
    draw = ImageDraw.Draw(sheet)
    for row, enemy in enumerate(manifest["enemies"]):
        animations = {animation["id"]: animation for animation in enemy["animations"]}
        for column, animation_id in enumerate(columns):
            animation = animations.get(animation_id) or (animations.get("special") if animation_id == "attack-3" else None)
            if not animation:
                continue
            ordered = animation["frames"][len(animation["frames"]) // 2:] + animation["frames"][:len(animation["frames"]) // 2]
            frame = next((candidate for candidate in ordered if (PUBLIC / candidate["path"].lstrip("/")).is_file()), None)
            if frame is None:
                continue
            with Image.open(PUBLIC / frame["path"].lstrip("/")) as opened:
                preview = opened.convert("RGBA").resize((thumb, thumb), Image.Resampling.NEAREST)
            sheet.alpha_composite(preview, (column * thumb, row * thumb))
            preview.close()
        draw.text((4, row * thumb + 4), enemy["label"], fill=(255, 224, 113, 255))
    path = PUBLIC / "story/enemies/kore-enemies-v1/contact-sheet.png"
    sheet.save(path, optimize=True)
    sheet.close()
    manifest["contactSheet"] = {"path": "/story/enemies/kore-enemies-v1/contact-sheet.png", "sha256": digest(path)}


def preview() -> None:
    PREVIEW.mkdir(parents=True, exist_ok=True)
    rows: dict[str, list[tuple[str, Image.Image]]] = {}
    for job in jobs():
        generated_path = STAGING / f"{job['kind']}-{job['id']}-generated.png"
        if not generated_path.is_file():
            raise FileNotFoundError(generated_path)
        input_path = STAGING / f"{job['kind']}-{job['id']}-input.png"
        frames = candidate_frames(input_path, generated_path, job["id"])
        strip = compose_strip(frames)
        strip.save(PREVIEW / f"{job['kind']}-{job['id']}.png", optimize=True)
        rows.setdefault(job["biomeId"], []).append((f"{job['kind']} {job['id']}", strip))
    for biome_id, biome_rows in rows.items():
        thumb_height = 112
        sheet = Image.new("RGB", (768, len(biome_rows) * thumb_height), (12, 16, 24))
        draw = ImageDraw.Draw(sheet)
        for index, (label, strip) in enumerate(biome_rows):
            sheet.paste(strip.convert("RGB").resize((768, 96), Image.Resampling.NEAREST), (0, index * thumb_height))
            draw.text((6, index * thumb_height + 97), label, fill="white")
        sheet.save(PREVIEW / f"{biome_id}-review.jpg", quality=94)
    print(f"Built ImageGen candidate strips for {sum(len(value) for value in rows.values())} grounded actors")


def write_source_row(job: dict[str, Any], frames: list[Image.Image]) -> tuple[Path, Path]:
    actor_id = job["id"]
    if job["kind"] == "npc":
        alpha_path = PUBLIC / f"story/npcs/generated/{actor_id}-sheet.png"
        chroma_path = PUBLIC / f"story/npcs/generated/{actor_id}-sheet-chroma.png"
        row = 2
    else:
        alpha_path = PUBLIC / f"story/enemies/kore-enemies-v1/generated/{actor_id}-sheet-1.png"
        chroma_path = PUBLIC / f"story/enemies/kore-enemies-v1/generated/{actor_id}-sheet-1-chroma.png"
        row = 1
    alpha_sheet = Image.open(alpha_path).convert("RGBA")
    chroma_sheet = Image.open(chroma_path).convert("RGBA")
    top = round(row * alpha_sheet.height / 5)
    bottom = round((row + 1) * alpha_sheet.height / 5)
    alpha_sheet.paste(Image.new("RGBA", (alpha_sheet.width, bottom - top)), (0, top))
    key = job["chromaKey"].lstrip("#")
    key_color = tuple(int(key[index:index + 2], 16) for index in (0, 2, 4)) + (255,)
    chroma_sheet.paste(Image.new("RGBA", (chroma_sheet.width, bottom - top), key_color), (0, top))
    for index, frame in enumerate(frames):
        alpha_sheet.alpha_composite(frame, (index * FRAME_SIZE, top))
        chroma_sheet.alpha_composite(frame, (index * FRAME_SIZE, top))
    alpha_sheet.save(alpha_path, optimize=True)
    chroma_sheet.save(chroma_path, optimize=True)
    alpha_sheet.close()
    chroma_sheet.close()
    return alpha_path, chroma_path


def apply(offset: int = 0, limit: int | None = None) -> None:
    npc_manifest = json.loads(NPC_MANIFEST_PATH.read_text())
    enemy_manifest = json.loads(ENEMY_MANIFEST_PATH.read_text())
    npc_by_id = {entry["id"]: entry for entry in npc_manifest["npcs"]}
    enemy_by_id = {entry["id"]: entry for entry in enemy_manifest["enemies"]}
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    all_jobs = jobs()[offset:None if limit is None else offset + limit]
    current_keys = {(job["kind"], job["id"]) for job in all_jobs}
    if REVIEW_PATH.is_file():
        existing = json.loads(REVIEW_PATH.read_text()).get("actors", [])
        review = [
            actor for actor in existing
            if (actor["kind"], actor["id"]) not in current_keys and actor.get("status") != "exempt"
        ]
    else:
        review = []
    prepared: dict[tuple[str, str], list[Image.Image]] = {}
    for job in all_jobs:
        input_path = STAGING / f"{job['kind']}-{job['id']}-input.png"
        generated_path = STAGING / f"{job['kind']}-{job['id']}-generated.png"
        frames = candidate_frames(input_path, generated_path, job["id"])
        pixel_hashes = [hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames]
        if len(set(pixel_hashes)) != 8:
            raise ValueError(f"Walk still contains duplicate poses: {job['kind']} {job['id']}")
        for frame in frames:
            bounds = frame.getchannel("A").getbbox()
            valid_bottom = bool(bounds and (186 <= bounds[3] <= BASELINE if job["kind"] == "npc" else bounds[3] <= BASELINE))
            if not valid_bottom:
                raise ValueError(f"Walk violates runtime baseline: {job['kind']} {job['id']} {bounds}")
            if set(frame.getchannel("A").get_flattened_data()) - {0, 255}:
                raise ValueError(f"Walk alpha is not binary: {job['kind']} {job['id']}")
        prepared[(job["kind"], job["id"])] = frames
    for job in all_jobs:
        input_path = STAGING / f"{job['kind']}-{job['id']}-input.png"
        generated_path = STAGING / f"{job['kind']}-{job['id']}-generated.png"
        frames = prepared.pop((job["kind"], job["id"]))
        for index, (public_path, frame) in enumerate(zip(job["paths"], frames)):
            output = PUBLIC / public_path.lstrip("/")
            frame.save(output, optimize=True)
            if job["kind"] == "enemy":
                walk = next(animation for animation in enemy_by_id[job["id"]]["animations"] if animation["id"] == "walk")
                with Image.open(output) as written:
                    actual = written.convert("RGBA")
                walk["frames"][index]["contentBounds"] = list(actual.getchannel("A").getbbox() or (0, 0, 0, 0))
                actual.close()
                walk["frames"][index]["sha256"] = digest(output)
        alpha_path, chroma_path = write_source_row(job, frames)
        if job["kind"] == "npc":
            entry = npc_by_id[job["id"]]
            entry["source"]["sha256"] = digest(alpha_path)
            entry["source"]["chromaSourceSha256"] = digest(chroma_path)
            entry["source"]["walkRepairPrompt"] = PROMPT
            npc_contact_sheet(entry)
        else:
            entry = enemy_by_id[job["id"]]
            source = entry["sources"][0]
            source["sha256"] = digest(alpha_path)
            source["chromaSourceSha256"] = digest(chroma_path)
            source["walkRepairPrompt"] = PROMPT
        review_strip = EVIDENCE / f"{job['kind']}-{job['id']}.png"
        compose_strip(frames).save(review_strip, optimize=True)
        review.append({
            "kind": job["kind"], "id": job["id"], "biomeId": job["biomeId"], "locomotion": job["locomotion"],
            "status": "corrected-crop-and-gait" if job["id"] in FULL_FRAME_REPAIR else "corrected",
            "promptVersion": PROMPT_VERSION, "prompt": PROMPT,
            "inputStripSha256": digest(input_path),
            "imagegenOutputSha256": digest(generated_path),
            "sourceAlphaSha256": digest(alpha_path), "sourceChromaSha256": digest(chroma_path),
            "reviewStripPath": "/" + str(review_strip.relative_to(PUBLIC)),
            "reviewStripSha256": digest(review_strip),
            "approvedFrameSha256": [digest(PUBLIC / path.lstrip("/")) for path in job["paths"]],
        })
        for frame in frames:
            frame.close()
        del frames
        gc.collect()
    npc_biomes, enemy_biomes = registry_maps()
    for actor_id, (biome_id, _key) in npc_biomes.items():
        if actor_id in NPC_EXEMPT:
            paths = npc_by_id[actor_id]["actions"]["walk"]["frames"]
            review.append({
                "kind": "npc", "id": actor_id, "biomeId": biome_id, "locomotion": "non-walking",
                "status": "exempt", "exemptionReason": NPC_EXEMPT[actor_id],
                "approvedFrameSha256": [digest(PUBLIC / path.lstrip("/")) for path in paths],
            })
    for actor_id, (biome_id, _key) in enemy_biomes.items():
        if actor_id in ENEMY_EXEMPT:
            walk = next(animation for animation in enemy_by_id[actor_id]["animations"] if animation["id"] == "walk")
            paths = [frame["path"] for frame in walk["frames"]]
            review.append({
                "kind": "enemy", "id": actor_id, "biomeId": biome_id, "locomotion": "non-walking",
                "status": "exempt", "exemptionReason": ENEMY_EXEMPT[actor_id],
                "approvedFrameSha256": [digest(PUBLIC / path.lstrip("/")) for path in paths],
            })
    if offset + len(all_jobs) >= len(jobs()):
        enemy_contact_sheet(enemy_manifest)
    NPC_MANIFEST_PATH.write_text(json.dumps(npc_manifest, indent=2) + "\n")
    PUBLIC_NPC_MANIFEST_PATH.write_text(json.dumps(npc_manifest, indent=2) + "\n")
    ENEMY_MANIFEST_PATH.write_text(json.dumps(enemy_manifest, indent=2) + "\n")
    PUBLIC_ENEMY_MANIFEST_PATH.write_text(json.dumps(enemy_manifest, indent=2) + "\n")
    REVIEW_PATH.write_text(json.dumps({"version": 1, "workflow": "full-body-imagegen-leg-edit", "prompt": PROMPT, "actors": review}, indent=2) + "\n")
    if all_jobs:
        print(f"Applied actors {offset + 1}-{offset + len(all_jobs)}; review now has {len(review)} records")
    else:
        print(f"Refreshed exemption records; review has {len(review)} records")


def verify() -> None:
    review = json.loads(REVIEW_PATH.read_text())
    npc_manifest = json.loads(NPC_MANIFEST_PATH.read_text())
    enemy_manifest = json.loads(ENEMY_MANIFEST_PATH.read_text())
    npc_by_id = {entry["id"]: entry for entry in npc_manifest["npcs"]}
    enemy_by_id = {entry["id"]: entry for entry in enemy_manifest["enemies"]}
    npc_biomes, enemy_biomes = registry_maps()
    expected = {("npc", actor_id) for actor_id in npc_biomes} | {("enemy", actor_id) for actor_id in enemy_biomes}
    actual = {(actor["kind"], actor["id"]) for actor in review["actors"]}
    if actual != expected or len(review["actors"]) != 112:
        raise ValueError("Walk review manifest does not cover all 112 expansion actors exactly once")
    for actor in review["actors"]:
        enemy_frames: list[dict[str, Any]] | None = None
        if actor["kind"] == "npc":
            action = npc_by_id[actor["id"]]["actions"]["walk"]
            paths = action["frames"]
            if action["durationMs"] != 110:
                raise ValueError(f"NPC walk timing changed: {actor['id']}")
        else:
            action = next(animation for animation in enemy_by_id[actor["id"]]["animations"] if animation["id"] == "walk")
            enemy_frames = action["frames"]
            paths = [frame["path"] for frame in enemy_frames]
            if any(frame["durationMs"] != 105 for frame in enemy_frames):
                raise ValueError(f"Enemy walk timing changed: {actor['id']}")
        if len(paths) != 8:
            raise ValueError(f"Walk frame count changed: {actor['id']}")
        hashes = [digest(PUBLIC / path.lstrip("/")) for path in paths]
        if hashes != actor["approvedFrameSha256"] or (actor["status"] != "exempt" and len(set(hashes)) != 8):
            raise ValueError(f"Unapproved or duplicate walk frames: {actor['id']}")
        if enemy_frames is not None:
            for frame, frame_hash in zip(enemy_frames, hashes):
                if frame.get("sha256") != frame_hash:
                    raise ValueError(f"Enemy manifest frame hash is stale: {actor['id']} {frame['id']}")
        for path in paths:
            frame = Image.open(PUBLIC / path.lstrip("/")).convert("RGBA")
            if frame.size != (FRAME_SIZE, FRAME_SIZE):
                raise ValueError(f"Wrong walk dimensions: {path}")
            if set(frame.getchannel("A").get_flattened_data()) - {0, 255}:
                raise ValueError(f"Non-binary alpha: {path}")
            if any(frame.getpixel(corner)[3] for corner in ((0, 0), (191, 0), (0, 191), (191, 191))):
                raise ValueError(f"Opaque corner: {path}")
        if actor["status"] == "exempt" and not actor.get("exemptionReason"):
            raise ValueError(f"Missing exemption reason: {actor['kind']} {actor['id']}")
        if actor["status"] != "exempt":
            review_strip = PUBLIC / actor["reviewStripPath"].lstrip("/")
            if digest(review_strip) != actor["reviewStripSha256"]:
                raise ValueError(f"Walk review strip changed: {actor['kind']} {actor['id']}")
    print(f"Verified {len(review['actors'])} expansion walk reviews")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if sum((args.preview, args.apply, args.verify)) != 1:
        raise SystemExit("Choose exactly one of --preview, --apply, or --verify")
    preview() if args.preview else (apply(args.offset, args.limit) if args.apply else verify())


if __name__ == "__main__":
    main()
