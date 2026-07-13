#!/usr/bin/env python3
"""Build and validate normalized HD voxel assets for every KORE projectile frame."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import shutil
import struct
from typing import Any

from PIL import Image


PARTS = ["head", "torso", "leadArm", "rearArm", "leadLeg", "rearLeg"]
RECORD_FIELDS = 9
DEFAULT_TARGET_ROWS = 64
DEFAULT_DEPTH = 0.14
DEFAULT_ALPHA_THRESHOLD = 24
DEFAULT_PALETTE_SNAP = 8


def round_voxel(value: float) -> float:
    return round(value, 5)


def clamp(value: int | float, minimum: int | float, maximum: int | float):
    return min(maximum, max(minimum, value))


def fidelity_settings(target_rows: int, depth: float, alpha_threshold: int, palette_snap: int) -> dict[str, Any]:
    return {
        "resolutionScale": 1,
        "maxRows": target_rows,
        "depth": depth,
        "alphaThreshold": alpha_threshold,
        "paletteSnap": palette_snap,
        "mergeRuns": True,
    }


def foreground_bounds(image: Image.Image, alpha_threshold: int) -> tuple[int, int, int, int] | None:
    alpha = image.convert("RGBA").getchannel("A")
    mask = alpha.point(lambda value: 255 if value > alpha_threshold else 0)
    return mask.getbbox()


def resize_premultiplied(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Resize RGBA without allowing transparent RGB values to create dark fringes."""
    premultiplied = image.convert("RGBA").convert("RGBa")
    return premultiplied.resize(size, Image.Resampling.LANCZOS).convert("RGBA")


def quantize_channel(value: int, palette_snap: int) -> int:
    if palette_snap <= 1:
        return value
    return int(clamp(round(value / palette_snap) * palette_snap, 0, 255))


def color_hex(red: int, green: int, blue: int, palette_snap: int) -> str:
    return "#{:02x}{:02x}{:02x}".format(
        quantize_channel(red, palette_snap),
        quantize_channel(green, palette_snap),
        quantize_channel(blue, palette_snap),
    )


def side_color_hex(red: int, green: int, blue: int, palette_snap: int) -> str:
    return color_hex(round(red * 0.82), round(green * 0.82), round(blue * 0.82), palette_snap)


def palette_index(color: str, palette: list[str], indexes: dict[str, int]) -> int:
    existing = indexes.get(color)
    if existing is not None:
        return existing
    index = len(palette)
    palette.append(color)
    indexes[color] = index
    return index


def merge_row_runs(cells: list[dict[str, Any]], cell_width: float) -> list[dict[str, Any]]:
    if not cells:
        return []
    merged: list[dict[str, Any]] = []
    current = dict(cells[0])
    run_start = int(current.pop("column"))
    run_end = run_start
    for cell in cells[1:]:
        column = int(cell["column"])
        if column == run_end + 1 and cell["c"] == current["c"] and cell["s"] == current["s"]:
            run_end = column
            continue
        current["x"] = round_voxel(current["x"] + (run_end - run_start) * cell_width / 2)
        current["w"] = round_voxel(cell_width * (run_end - run_start + 1) * 0.98)
        merged.append(current)
        current = dict(cell)
        run_start = int(current.pop("column"))
        run_end = run_start
    current["x"] = round_voxel(current["x"] + (run_end - run_start) * cell_width / 2)
    current["w"] = round_voxel(cell_width * (run_end - run_start + 1) * 0.98)
    merged.append(current)
    return merged


def build_payload(
    frame_path: Path,
    public_frame_path: str,
    target_rows: int = DEFAULT_TARGET_ROWS,
    depth: float = DEFAULT_DEPTH,
    alpha_threshold: int = DEFAULT_ALPHA_THRESHOLD,
    palette_snap: int = DEFAULT_PALETTE_SNAP,
    merge_runs: bool = True,
) -> dict[str, Any]:
    image = Image.open(frame_path).convert("RGBA")
    bounds = foreground_bounds(image, alpha_threshold)
    if not bounds:
        return {
            "format": "kore-hd-voxels-v1",
            "palette": [],
            "voxels": [],
            "source": {
                "frame": public_frame_path,
                "width": image.width,
                "height": image.height,
                "effectiveRows": 0,
                "targetRows": target_rows,
            },
        }

    crop = image.crop(bounds)
    foreground_width, foreground_height = crop.size
    columns = max(1, round(target_rows * foreground_width / max(1, foreground_height)))
    normalized = resize_premultiplied(crop, (columns, target_rows))
    aspect = foreground_width / max(1, foreground_height)
    max_model_width = 2.65
    model_height = min(2.05, max_model_width / max(0.0001, aspect))
    model_width = model_height * aspect
    cell_width = model_width / columns
    cell_height = model_height / target_rows
    palette: list[str] = []
    palette_indexes: dict[str, int] = {}
    voxels: list[dict[str, Any]] = []
    occupied_rows: set[int] = set()
    pixels = normalized.load()

    for row in range(target_rows):
        row_cells: list[dict[str, Any]] = []
        for column in range(columns):
            red, green, blue, alpha = pixels[column, row]
            if alpha <= alpha_threshold:
                continue
            occupied_rows.add(row)
            color = color_hex(red, green, blue, palette_snap)
            side_color = side_color_hex(red, green, blue, palette_snap)
            color_index = palette_index(color, palette, palette_indexes)
            side_color_index = palette_index(side_color, palette, palette_indexes)
            brightness = red * 0.2126 + green * 0.7152 + blue * 0.0722
            row_cells.append({
                "column": column,
                "part": "torso",
                "x": round_voxel(((column + 0.5) / columns) * model_width - model_width / 2),
                "y": round_voxel(model_height - (row + 0.5) * cell_height + 0.02),
                "z": 0.018 if brightness > 150 else -0.012,
                "w": round_voxel(cell_width * 0.98),
                "h": round_voxel(cell_height * 0.98),
                "d": round_voxel(depth * (0.78 + (alpha / 255) * 0.22)),
                "c": color_index,
                "s": side_color_index,
            })
        if merge_runs:
            voxels.extend(merge_row_runs(row_cells, cell_width))
        else:
            for cell in row_cells:
                cell.pop("column", None)
                voxels.append(cell)

    return {
        "format": "kore-hd-voxels-v1",
        "palette": palette,
        "voxels": voxels,
        "source": {
            "frame": public_frame_path,
            "width": image.width,
            "height": image.height,
            "crop": list(bounds),
            "foregroundWidth": foreground_width,
            "foregroundHeight": foreground_height,
            "targetRows": target_rows,
            "effectiveRows": target_rows,
            "occupiedRows": len(occupied_rows),
            "columns": columns,
            "modelHeight": round_voxel(model_height),
            "modelWidth": round_voxel(model_width),
            "alphaThreshold": alpha_threshold,
            "paletteSnap": palette_snap,
            "premultipliedResample": "lanczos",
        },
    }


def projectile_assets(repo: Path) -> list[tuple[str, str, Path, list[Path]]]:
    assets: list[tuple[str, str, Path, list[Path]]] = []
    characters_root = repo / "public" / "characters"
    for frames_dir in sorted(characters_root.glob("*/projectiles/*/frames")):
        frames = sorted(path for path in frames_dir.glob("frame-*.png") if path.is_file())
        if not frames:
            continue
        projectile_dir = frames_dir.parent
        character_id = projectile_dir.parent.parent.name
        assets.append((character_id, projectile_dir.name, projectile_dir, frames))
    return assets


def manifest_frame_paths(definition: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for value in definition.get("frames", []):
        if isinstance(value, str) and value not in paths:
            paths.append(value)
    animation_frames = definition.get("animationFrames", {})
    if isinstance(animation_frames, dict):
        for values in animation_frames.values():
            if not isinstance(values, list):
                continue
            for value in values:
                if isinstance(value, str) and value not in paths:
                    paths.append(value)
    return paths


def scan_manifests(
    repo: Path,
    settings: dict[str, Any],
    apply: bool,
) -> tuple[int, set[str], list[str], list[str]]:
    upgraded = 0
    referenced: set[str] = set()
    missing: list[str] = []
    validation_errors: list[str] = []
    for manifest_path in sorted((repo / "public" / "characters").glob("*/character.json")):
        character = json.loads(manifest_path.read_text())
        changed = False
        for definition in character.get("projectiles", []):
            paths = manifest_frame_paths(definition)
            referenced.update(paths)
            for public_path in paths:
                if not (repo / "public" / public_path.lstrip("/")).exists():
                    missing.append(public_path)
            existing_projectile_frames = [
                public_path for public_path in paths
                if "/projectiles/" in public_path and (repo / "public" / public_path.lstrip("/")).exists()
            ]
            if definition.get("kind", "projectile") == "blast" or not existing_projectile_frames:
                continue
            upgraded += 1
            if definition.get("voxelProfile") != "hd-image-source":
                validation_errors.append(f"{character.get('id', manifest_path.parent.name)}/{definition.get('id')}: voxelProfile is not hd-image-source")
            if definition.get("voxelFidelity") != settings:
                validation_errors.append(f"{character.get('id', manifest_path.parent.name)}/{definition.get('id')}: voxelFidelity is not standardized")
            if apply:
                definition["voxelProfile"] = "hd-image-source"
                definition["voxelFidelity"] = settings
                changed = True
        if apply and changed:
            manifest_path.write_text(json.dumps(character, indent=2, ensure_ascii=False) + "\n")
    return upgraded, referenced, sorted(set(missing)), validation_errors


def write_payload(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n")


def validate_pack(projectile_dir: Path, payloads: dict[str, dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    voxels_dir = projectile_dir / "voxels-hd"
    manifest_path = voxels_dir / "voxel-pack-v1.json"
    binary_path = voxels_dir / "voxel-pack-v1.bin"
    label = str(projectile_dir)
    if not manifest_path.exists() or not binary_path.exists():
        return [f"{label}: missing voxel pack"]
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("format") != "kore-voxel-pack-v1" or manifest.get("recordFields") != RECORD_FIELDS:
        return [f"{label}: invalid voxel pack manifest"]
    entries = manifest.get("frames", [])
    if [entry.get("frame") for entry in entries] != sorted(payloads):
        errors.append(f"{label}: pack frame list does not match HD JSON")
        return errors
    records = binary_path.read_bytes()
    expected_records = sum(len(payloads[name].get("voxels", [])) for name in sorted(payloads))
    if len(records) != expected_records * RECORD_FIELDS * 8:
        errors.append(f"{label}: packed binary byte length mismatch")
        return errors
    for entry in entries:
        frame_name = entry["frame"]
        payload = payloads[frame_name]
        voxels = payload.get("voxels", [])
        if entry.get("count") != len(voxels):
            errors.append(f"{label}/{frame_name}: packed voxel count mismatch")
            continue
        for index, voxel in enumerate(voxels):
            base = (int(entry["offset"]) + index) * RECORD_FIELDS * 8
            record = struct.unpack_from("<9d", records, base)
            packed_part = manifest["parts"][round(record[0])]
            packed_color = manifest["palette"][round(record[1])]
            packed_side = manifest["palette"][round(record[2])]
            expected_color = payload["palette"][voxel["c"]]
            expected_side = payload["palette"][voxel.get("s", voxel["c"])]
            expected = [voxel[key] for key in ["x", "y", "z", "w", "h", "d"]]
            if packed_part != voxel["part"] or packed_color != expected_color or packed_side != expected_side or list(record[3:]) != expected:
                errors.append(f"{label}/{frame_name}: packed voxel {index} differs from JSON")
                break
    return errors


def run(args: argparse.Namespace) -> dict[str, Any]:
    repo = args.repo.resolve()
    settings = fidelity_settings(args.target_rows, args.depth, args.alpha_threshold, args.palette_snap)
    assets = projectile_assets(repo)
    frames_built = 0
    transparent_frames: list[str] = []
    validation_errors: list[str] = []
    effective_rows: list[int] = []
    filesystem_frames: set[str] = set()

    for character_id, projectile_id, projectile_dir, frames in assets:
        voxels_dir = projectile_dir / "voxels-hd"
        if args.apply:
            shutil.rmtree(voxels_dir, ignore_errors=True)
            voxels_dir.mkdir(parents=True, exist_ok=True)
        payloads: dict[str, dict[str, Any]] = {}
        for frame_path in frames:
            public_path = "/" + frame_path.relative_to(repo / "public").as_posix()
            filesystem_frames.add(public_path)
            expected = build_payload(
                frame_path,
                public_path,
                target_rows=args.target_rows,
                depth=args.depth,
                alpha_threshold=args.alpha_threshold,
                palette_snap=args.palette_snap,
                merge_runs=True,
            )
            payloads[frame_path.stem] = expected
            rows = int(expected.get("source", {}).get("effectiveRows", 0))
            effective_rows.append(rows)
            if not expected.get("voxels"):
                transparent_frames.append(public_path)
            output_path = voxels_dir / f"{frame_path.stem}.json"
            if args.apply:
                write_payload(output_path, expected)
                frames_built += 1
            if args.validate:
                if not output_path.exists():
                    validation_errors.append(f"{public_path}: missing HD voxel JSON")
                else:
                    actual = json.loads(output_path.read_text())
                    if actual != expected:
                        validation_errors.append(f"{public_path}: HD voxel JSON is stale or non-deterministic")
                    if rows != args.target_rows:
                        validation_errors.append(f"{public_path}: effective rows {rows}, expected {args.target_rows}")
        if args.apply:
            shutil.rmtree(projectile_dir / "voxels", ignore_errors=True)
        if args.validate:
            validation_errors.extend(validate_pack(projectile_dir, payloads))

    upgraded, referenced, missing, manifest_errors = scan_manifests(repo, settings, args.apply)
    if args.validate:
        validation_errors.extend(manifest_errors)
    orphan_frames = sorted(filesystem_frames - referenced)
    report = {
        "mode": "apply" if args.apply else "validate" if args.validate else "audit",
        "targetRows": args.target_rows,
        "assetsScanned": len(assets),
        "framesScanned": len(filesystem_frames),
        "framesBuilt": frames_built,
        "definitionsUpgraded": upgraded,
        "effectiveRows": {
            "minimum": min(effective_rows, default=0),
            "maximum": max(effective_rows, default=0),
        },
        "missingFrames": missing,
        "orphanFrames": orphan_frames,
        "transparentFrames": sorted(transparent_frames),
        "validationErrors": sorted(set(validation_errors)),
    }
    report_dir = repo / "tmp" / "projectile-hd-audit"
    report_dir.mkdir(parents=True, exist_ok=True)
    (report_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--validate", action="store_true")
    parser.add_argument("--target-rows", type=int, default=DEFAULT_TARGET_ROWS)
    parser.add_argument("--depth", type=float, default=DEFAULT_DEPTH)
    parser.add_argument("--alpha-threshold", type=int, default=DEFAULT_ALPHA_THRESHOLD)
    parser.add_argument("--palette-snap", type=int, default=DEFAULT_PALETTE_SNAP)
    args = parser.parse_args()
    args.target_rows = int(clamp(args.target_rows, 24, 128))
    args.depth = float(clamp(args.depth, 0.04, 0.5))
    args.alpha_threshold = int(clamp(args.alpha_threshold, 0, 254))
    args.palette_snap = int(clamp(args.palette_snap, 1, 64))
    report = run(args)
    if args.validate and report["validationErrors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
