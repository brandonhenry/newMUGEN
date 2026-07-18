#!/usr/bin/env python3
"""Import the authorized Stimmerman Adventure soundtrack from chaptered YouTube videos.

Requires yt-dlp and ffmpeg/ffprobe on PATH. The importer is deterministic, records
source/chapter provenance, normalizes each chapter, and can verify a completed import.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / "public/story/audio/stimmerman"
MANIFEST_PATH = OUTPUT_ROOT / "manifest.json"
RUNTIME_MANIFEST_PATH = ROOT / "src/story/stimmermanAdventureManifest.json"
CREDITS_PATH = OUTPUT_ROOT / "CREDITS.md"


@dataclass(frozen=True)
class Collection:
    id: str
    title: str
    video_id: str
    expected_chapters: int
    biomes: tuple[str, ...]
    phases: tuple[str, ...]

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/watch?v={self.video_id}"


COLLECTIONS = (
    Collection("queen-of-the-kingdom", "Queen of the Kingdom", "u4Mi_N04SSQ", 16,
               ("world-route", "greenhollow", "thornwood", "bonevault"), ("social", "explore", "victory")),
    Collection("pensive-pieces-for-orchestra", "Pensive Pieces for Orchestra", "LxgA7WQ0QDU", 13,
               ("greenhollow", "frostpeak", "sunscar", "skyglass"), ("safe", "sanctuary", "explore")),
    Collection("modern-metroidvania", "Modern Metroidvania", "__PGzYkQe_0", 10,
               ("ironroot", "bonevault", "emberdeep", "skyglass"), ("mystery", "tension", "explore")),
    Collection("indie-rock-ambience", "Indie Rock Ambience", "8nrJiYNGOP4", 14,
               ("greenhollow", "frostpeak", "sunscar"), ("explore", "safe")),
    Collection("high-energy-dnb", "High Energy DnB", "7X3yKTdsZX8", 5,
               ("ironroot", "emberdeep", "skyglass"), ("race", "elite", "tension")),
    Collection("cozy-island-vol-1", "Cozy Island Vol. 1", "sE_2IbJDmz8", 15,
               ("world-route", "greenhollow", "thornwood", "sunscar"), ("social", "safe", "explore")),
    Collection("toe-tappin-boss-battles", "Toe-Tappin' Boss Battles", "KQn7KK8aKg4", 13,
               ("greenhollow", "thornwood", "ironroot", "bonevault", "emberdeep", "frostpeak", "sunscar", "skyglass"), ("elite", "tension")),
    Collection("dark-n-cozy", "Dark N Cozy", "h_gedKXZfck", 12,
               ("thornwood", "bonevault", "frostpeak"), ("safe", "mystery", "sanctuary")),
    Collection("electric-ambience", "Electric Ambience", "g9vOWxWYSUA", 10,
               ("ironroot", "bonevault", "skyglass"), ("mystery", "explore", "tension")),
    Collection("8-bit-extravaganza", "8-Bit Extravaganza", "gtcRs1C1za4", 9,
               ("greenhollow", "thornwood", "ironroot", "bonevault", "emberdeep", "frostpeak", "sunscar", "skyglass"), ("mystery", "victory", "race")),
)


def run(command: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(command, check=True, text=True, stdout=subprocess.PIPE if capture else None,
                            stderr=subprocess.PIPE if capture else None)
    return result.stdout if capture else ""


def slug(value: str) -> str:
    normalized = value.lower().replace("’", "").replace("'", "")
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", normalized)) or "track"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def ffprobe_duration(path: Path) -> float:
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)], capture=True).strip())


def loudnorm_measure(source: Path, start: float, duration: float) -> dict[str, Any]:
    command = [
        "ffmpeg", "-hide_banner", "-nostats", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(source),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"
    ]
    result = subprocess.run(command, check=True, text=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    match = re.search(r"\{\s*\"input_i\".*?\}", result.stderr, re.DOTALL)
    if not match:
        raise RuntimeError(f"Unable to measure loudness for {source.name} at {start}")
    return json.loads(match.group(0))


def encode_chapter(source: Path, destination: Path, start: float, duration: float) -> None:
    measurement = loudnorm_measure(source, start, duration)
    fade_out = max(0.0, duration - 0.035)
    loudnorm = (
        "loudnorm=I=-16:TP=-1.5:LRA=11:linear=true:"
        f"measured_I={measurement['input_i']}:measured_TP={measurement['input_tp']}:"
        f"measured_LRA={measurement['input_lra']}:measured_thresh={measurement['input_thresh']}:"
        f"offset={measurement['target_offset']},afade=t=in:st=0:d=0.035,afade=t=out:st={fade_out:.3f}:d=0.035"
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}",
        "-i", str(source), "-vn", "-af", loudnorm, "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", str(destination)
    ])


def fetch_metadata(collection: Collection) -> dict[str, Any]:
    return json.loads(run(["yt-dlp", "--skip-download", "--no-warnings", "--dump-single-json", collection.url], capture=True))


def download_source(collection: Collection, directory: Path) -> Path:
    template = directory / f"{collection.id}.%(ext)s"
    commands = [
        # YouTube occasionally returns 403 for the Opus DASH URL while its AAC-LC
        # counterpart remains available (and vice versa). Try concrete formats so
        # a transport failure falls through instead of repeating one signed URL.
        ["yt-dlp", "--no-warnings", "--force-ipv4", "--retries", "10", "-f", "140", "-o", str(template), collection.url],
        ["yt-dlp", "--no-warnings", "--force-ipv4", "--retries", "10", "-f", "251", "-o", str(template), collection.url],
        ["yt-dlp", "--no-warnings", "--force-ipv4", "--retries", "10", "-f", "18/bestaudio", "-o", str(template), collection.url],
        ["yt-dlp", "--no-warnings", "--force-ipv4", "--retries", "10", "--extractor-args", "youtube:player_client=web_safari,android", "-f", "bestaudio", "-o", str(template), collection.url],
    ]
    last_error: subprocess.CalledProcessError | None = None
    for command in commands:
        try:
            run(command)
            last_error = None
            break
        except subprocess.CalledProcessError as error:
            last_error = error
    if last_error:
        raise last_error
    matches = [path for path in directory.glob(f"{collection.id}.*") if path.is_file()]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one source for {collection.id}, found {matches}")
    return matches[0]


def import_collection(collection: Collection, directory: Path, existing: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    metadata = fetch_metadata(collection)
    chapters = metadata.get("chapters") or []
    if len(chapters) != collection.expected_chapters:
        raise RuntimeError(f"{collection.title}: expected {collection.expected_chapters} chapters, found {len(chapters)}")
    source: Path | None = None
    entries: list[dict[str, Any]] = []
    for index, chapter in enumerate(chapters, start=1):
        title = str(chapter["title"])
        start = float(chapter["start_time"])
        end = float(chapter["end_time"])
        duration = end - start
        track_id = f"{collection.id}:{index:02d}:{slug(title)}"
        relative = Path(collection.id) / f"{index:02d}-{slug(title)}.m4a"
        destination = OUTPUT_ROOT / relative
        previous = existing.get(track_id)
        valid_existing = destination.is_file() and abs(ffprobe_duration(destination) - duration) <= 1.0
        if valid_existing and previous and previous.get("sha256") != sha256(destination):
            valid_existing = False
        if not valid_existing:
            source = source or download_source(collection, directory)
            encode_chapter(source, destination, start, duration)
        encoded_duration = ffprobe_duration(destination)
        entries.append({
            "id": track_id,
            "artist": "Stimmerman",
            "collectionId": collection.id,
            "collectionTitle": collection.title,
            "title": title,
            "sourceUrl": collection.url,
            "sourceVideoId": collection.video_id,
            "chapterIndex": index,
            "sourceStartSeconds": start,
            "sourceEndSeconds": end,
            "durationSeconds": round(encoded_duration, 3),
            "path": f"/story/audio/stimmerman/{relative.as_posix()}",
            "biomes": list(collection.biomes),
            "phases": list(collection.phases),
            "bytes": destination.stat().st_size,
            "sha256": sha256(destination),
        })
    return entries


def write_manifest(tracks: list[dict[str, Any]]) -> None:
    payload = {
        "version": 1,
        "artist": "Stimmerman",
        "credit": "Original music composed and produced by Stimmerman. Used with permission.",
        "encoding": {"container": "m4a", "codec": "AAC-LC", "sampleRateHz": 48000, "bitrateKbps": 128, "integratedLufs": -16, "truePeakDb": -1.5},
        "trackCount": len(tracks),
        "collectionCount": len(COLLECTIONS),
        "tracks": tracks,
    }
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    MANIFEST_PATH.write_text(serialized, encoding="utf-8")
    RUNTIME_MANIFEST_PATH.write_text(serialized, encoding="utf-8")
    links = "\n".join(f"- [{item.title}]({item.url})" for item in COLLECTIONS)
    CREDITS_PATH.write_text(
        "# Adventure Mode Music\n\nOriginal music composed and produced by **Stimmerman**. Used with permission.\n\n" + links + "\n",
        encoding="utf-8",
    )


def verify() -> None:
    payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if not RUNTIME_MANIFEST_PATH.is_file() or json.loads(RUNTIME_MANIFEST_PATH.read_text(encoding="utf-8")) != payload:
        raise RuntimeError("Runtime soundtrack manifest is missing or stale")
    tracks = payload.get("tracks", [])
    expected = sum(item.expected_chapters for item in COLLECTIONS)
    if payload.get("artist") != "Stimmerman" or len(tracks) != expected:
        raise RuntimeError(f"Manifest expected {expected} Stimmerman tracks, found {len(tracks)}")
    ids: set[str] = set()
    paths: set[str] = set()
    for track in tracks:
        if track["id"] in ids or track["path"] in paths:
            raise RuntimeError(f"Duplicate soundtrack entry: {track['id']}")
        ids.add(track["id"]); paths.add(track["path"])
        path = ROOT / "public" / track["path"].lstrip("/")
        if not path.is_file() or sha256(path) != track["sha256"]:
            raise RuntimeError(f"Missing or changed soundtrack file: {path}")
        if not track.get("biomes") or not track.get("phases"):
            raise RuntimeError(f"Unassigned soundtrack track: {track['id']}")
    print(f"Verified {len(tracks)} Stimmerman tracks across {len(COLLECTIONS)} collections")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    for executable in ("yt-dlp", "ffmpeg", "ffprobe"):
        if not shutil.which(executable):
            raise SystemExit(f"Missing required executable: {executable}")
    if args.verify:
        verify(); return
    existing_payload = json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) if MANIFEST_PATH.exists() else {"tracks": []}
    existing = {track["id"]: track for track in existing_payload.get("tracks", [])}
    tracks: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="kore-stimmerman-") as temp:
        directory = Path(temp)
        for collection in COLLECTIONS:
            print(f"Importing {collection.title}…", flush=True)
            tracks.extend(import_collection(collection, directory, existing))
            write_manifest(tracks)
    write_manifest(tracks)
    verify()


if __name__ == "__main__":
    main()
