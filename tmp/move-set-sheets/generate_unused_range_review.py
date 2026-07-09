#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_move_set_sheets import (  # noqa: E402
    OUT_DIR,
    REPO,
    frame_name,
    iter_characters,
    resolve_configured_moves,
)

OUTPUT = OUT_DIR / "unused-range-review.html"
MIN_FRAME = 51
MAX_RANGE_FRAMES = 15
ELIGIBLE_BASE_KEYS = {"jableft", "jabright", "kickleft", "kickright"}


def main() -> None:
    characters = []
    total_ranges = 0
    total_frames = 0
    total_assignable = 0

    for character in iter_characters():
        ranges = unused_ranges(character)
        candidates = candidate_slots(character)
        cards = []
        for index, item in enumerate(ranges):
            target = candidates[index] if index < len(candidates) else None
            if target:
                total_assignable += 1
            cards.append({**item, "target": target})
        total_ranges += len(cards)
        total_frames += sum(len(card["frames"]) for card in cards)
        characters.append(
            {
                "id": character["id"],
                "displayName": character["manifest"].get("displayName", character["id"]),
                "ranges": cards,
                "candidateCount": len(candidates),
            }
        )

    write_page(characters, total_ranges, total_frames, total_assignable)
    print(
        json.dumps(
            {
                "ok": True,
                "characters": len(characters),
                "ranges": total_ranges,
                "framesAfter050": total_frames,
                "rangesWithSuggestedSlots": total_assignable,
                "index": str(OUTPUT),
            },
            indent=2,
        )
    )


def unused_ranges(character: dict[str, Any]) -> list[dict[str, Any]]:
    used = {
        frame_name(frame)
        for move in resolve_configured_moves(character)
        for frame in move["frames"]
    }
    all_numbers = []
    for path in sorted((character["dir"] / "frames").glob("frame-*.png"), key=frame_number):
        number = frame_number(path)
        if number < MIN_FRAME:
            continue
        if frame_name(path.name) not in used:
            all_numbers.append(number)

    ranges = []
    if not all_numbers:
        return ranges
    start = prev = all_numbers[0]
    for number in all_numbers[1:]:
        if number == prev + 1:
            prev = number
            continue
        ranges.extend(make_range_chunks(character["id"], start, prev))
        start = prev = number
    ranges.extend(make_range_chunks(character["id"], start, prev))
    return ranges


def candidate_slots(character: dict[str, Any]) -> list[dict[str, Any]]:
    manifest = character["manifest"]
    animation_frames = manifest.get("animationFrames") or {}
    move_overrides = manifest.get("moveOverrides") or {}
    eligible = sorted(
        key
        for key in move_overrides
        if key in ELIGIBLE_BASE_KEYS or key.startswith("cmd:")
    )

    candidates = []
    for key in eligible:
        frames = animation_frames.get(key)
        if not isinstance(frames, list) or not frames:
            candidates.append(slot_payload(manifest, key, "empty", None))

    signatures: dict[str, list[str]] = {}
    for key in eligible:
        frames = animation_frames.get(key)
        if not isinstance(frames, list) or not frames:
            continue
        signature = "|".join(str(frame) for frame in frames)
        signatures.setdefault(signature, []).append(key)

    for keys in signatures.values():
        if len(keys) < 2:
            continue
        keeper = keys[0]
        for key in keys[1:]:
            candidates.append(slot_payload(manifest, key, "duplicate", keeper))

    return candidates


def slot_payload(manifest: dict[str, Any], key: str, kind: str, duplicate_of: str | None) -> dict[str, Any]:
    override = (manifest.get("moveOverrides") or {}).get(key) or {}
    return {
        "key": key,
        "label": override.get("label") or key,
        "kind": kind,
        "duplicateOf": duplicate_of,
    }


def make_range(character_id: str, start: int, end: int) -> dict[str, Any]:
    frames = [
        {
            "number": number,
            "path": f"../../public/characters/{character_id}/frames/frame-{number:03d}.png",
        }
        for number in range(start, end + 1)
    ]
    return {
        "id": f"{character_id}:{start:03d}-{end:03d}",
        "start": start,
        "end": end,
        "count": end - start + 1,
        "frames": frames,
    }


def make_range_chunks(character_id: str, start: int, end: int) -> list[dict[str, Any]]:
    chunks = []
    chunk_start = start
    while chunk_start <= end:
        chunk_end = min(end, chunk_start + MAX_RANGE_FRAMES - 1)
        chunks.append(make_range(character_id, chunk_start, chunk_end))
        chunk_start = chunk_end + 1
    return chunks


def frame_number(value: str | Path) -> int:
    match = re.search(r"frame-(\d+)", str(value))
    return int(match.group(1)) if match else 10**9


def write_page(characters: list[dict[str, Any]], total_ranges: int, total_frames: int, total_assignable: int) -> None:
    data_json = json.dumps(characters, separators=(",", ":"))
    safe_data_json = data_json.replace("</", "<\\/")
    page = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unused range implementation review</title>
  <style>
    :root {{ color-scheme: dark; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: #050505; color: #f4f4f5; font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    header {{ position: sticky; top: 0; z-index: 3; background: rgba(5, 5, 5, .96); border-bottom: 1px solid #242429; padding: 18px 28px; }}
    h1 {{ margin: 0 0 6px; font-size: 28px; line-height: 1.1; }}
    header p {{ margin: 0; color: #b8c0cc; }}
    .toolbar {{ display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; }}
    button {{ appearance: none; border: 1px solid #3a3d45; background: #16181d; color: #f4f4f5; padding: 9px 12px; border-radius: 6px; cursor: pointer; }}
    button:hover {{ border-color: #6aa8ff; }}
    .count {{ color: #aeb8c6; }}
    main {{ padding: 24px 28px 48px; }}
    details.character {{ border: 1px solid #25262b; background: #0f1013; margin-bottom: 14px; }}
    summary {{ cursor: pointer; padding: 14px 16px; font-weight: 700; font-size: 18px; }}
    summary span {{ color: #9ca3af; font-weight: 500; margin-left: 8px; font-size: 13px; }}
    .ranges {{ display: grid; gap: 12px; padding: 0 14px 14px; }}
    .card {{ display: grid; grid-template-columns: 154px minmax(0, 1fr); gap: 14px; border: 1px solid #2a2c33; background: #08090b; padding: 12px; }}
    .decision {{ border-right: 1px solid #24262e; padding-right: 12px; }}
    .checkline {{ display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; }}
    input[type="checkbox"] {{ width: 34px; height: 34px; accent-color: #55d67a; cursor: pointer; }}
    .remove-frame input[type="checkbox"] {{ width: 16px; height: 16px; accent-color: #ff6b6b; }}
    .range-id {{ color: #8ec8ff; font-weight: 700; margin: 10px 0 6px; }}
    .meta, .target {{ color: #aeb8c6; line-height: 1.45; }}
    .target b {{ color: #e6edf7; }}
    select, textarea {{ width: 100%; margin-top: 8px; border: 1px solid #30323a; background: #111318; color: #f4f4f5; border-radius: 6px; }}
    select {{ padding: 8px; }}
    textarea {{ min-height: 58px; padding: 8px; resize: vertical; font: inherit; }}
    .strip {{ display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 6px; }}
    .frame {{ flex: 0 0 86px; border: 1px solid #2a2c32; background: #000; height: 142px; display: grid; grid-template-rows: 92px 22px 26px; align-items: end; justify-items: center; }}
    .frame.removed {{ opacity: .42; border-color: #7f2d2d; }}
    .frame.removed img {{ filter: grayscale(1); }}
    .frame img {{ max-width: 82px; max-height: 88px; image-rendering: pixelated; object-fit: contain; }}
    .frame span {{ width: 100%; text-align: center; color: #f4f4f5; background: #0b0c0f; font-size: 12px; line-height: 22px; }}
    .remove-frame {{ width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; color: #ffb4b4; background: #120708; font-size: 11px; line-height: 26px; cursor: pointer; }}
    .empty {{ color: #858b97; padding: 0 16px 16px; }}
    .copied {{ color: #75e098; }}
  </style>
</head>
<body>
<header>
  <h1>Unused Range Implementation Review</h1>
  <p>Frames before 051 are skipped. Ranges are capped at 15 frames. Check <b>Implement</b> for ranges you want moved into the suggested slot, and check <b>Remove</b> under individual frames you want excluded. Your review state autosaves in this browser.</p>
  <div class="toolbar">
    <button id="expand-all">Expand all</button>
    <button id="collapse-all">Collapse all</button>
    <button id="copy-selected">Copy selected JSON</button>
    <button id="clear-review">Clear saved review</button>
    <span class="count" id="status">__TOTAL_RANGES__ ranges / __TOTAL_FRAMES__ frames / __TOTAL_ASSIGNABLE__ suggested slots</span>
  </div>
</header>
<main id="app"></main>
<script id="review-data" type="application/json">__DATA_JSON__</script>
<script>
const characters = JSON.parse(document.getElementById('review-data').textContent);
const visibleRangeIds = new Set(characters.flatMap(character => character.ranges.map(range => range.id)));
const storageKey = 'kore-unused-range-review-v1';
let state = JSON.parse(localStorage.getItem(storageKey) || '{{}}');
const app = document.getElementById('app');
const status = document.getElementById('status');

function save() {{
  localStorage.setItem(storageKey, JSON.stringify(state));
  updateStatus();
}}

function cardState(id, range = null) {{
  state[id] ||= migrateLegacyState(id, range) || {{ implement: false, target: '', notes: '' }};
  state[id].removedFrames ||= [];
  return state[id];
}}

function migrateLegacyState(id, range) {{
  if (!range) return null;
  const current = parseRangeId(id);
  if (!current) return null;
  for (const [legacyId, legacy] of Object.entries(state)) {{
    if (legacyId === id) continue;
    const candidate = parseRangeId(legacyId);
    if (!candidate || candidate.character !== current.character) continue;
    if (candidate.start > current.start || candidate.end < current.end) continue;
    return {{
      implement: Boolean(legacy.implement),
      target: legacy.target || range.target?.key || '',
      notes: legacy.notes || '',
      removedFrames: (legacy.removedFrames || []).map(Number).filter(number => number >= range.start && number <= range.end)
    }};
  }}
  return null;
}}

function parseRangeId(id) {{
  const match = String(id).match(/^(.+):(\\d+)-(\\d+)$/);
  if (!match) return null;
  return {{ character: match[1], start: Number(match[2]), end: Number(match[3]) }};
}}

function updateStatus() {{
  const selected = Object.entries(state).filter(([id, item]) => visibleRangeIds.has(id) && item.implement).length;
  status.textContent = `__TOTAL_RANGES__ ranges / __TOTAL_FRAMES__ frames / __TOTAL_ASSIGNABLE__ suggested slots / ${{selected}} checked`;
}}

function render() {{
  app.innerHTML = '';
  for (const character of characters) {{
    const details = document.createElement('details');
    details.className = 'character';
    details.open = character.ranges.length > 0 && character.ranges.length <= 8;
    const summary = document.createElement('summary');
    summary.innerHTML = `${{escapeHtml(character.displayName)}} <span>${{escapeHtml(character.id)}} / ${{character.ranges.length}} ranges / ${{character.candidateCount}} candidate slots</span>`;
    details.appendChild(summary);
    if (!character.ranges.length) {{
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No unused frames after 050.';
      details.appendChild(empty);
    }} else {{
      const ranges = document.createElement('div');
      ranges.className = 'ranges';
      for (const range of character.ranges) ranges.appendChild(renderCard(character, range));
      details.appendChild(ranges);
    }}
    app.appendChild(details);
  }}
  updateStatus();
}}

function renderCard(character, range) {{
  const saved = cardState(range.id, range);
  if (!saved.target && range.target) saved.target = range.target.key;
  const removedFrames = new Set((saved.removedFrames || []).map(Number));
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = range.id;
  const targetText = range.target
    ? `<b>${{escapeHtml(range.target.key)}}</b><br>${{escapeHtml(range.target.label)}}<br>${{range.target.kind === 'duplicate' ? 'duplicate of ' + escapeHtml(range.target.duplicateOf) : 'empty slot'}}`
    : '<b>No suggested slot</b><br>All empty/duplicate candidates already consumed.';
  const optionHtml = range.target
    ? '<option value="' + escapeAttr(range.target.key) + '">' + escapeHtml(range.target.key) + ' - ' + escapeHtml(range.target.label) + ' (' + escapeHtml(range.target.kind) + ')</option>'
    : '<option value="">No target</option>';
  const framesHtml = range.frames.map(frame =>
    '<div class="frame' + (removedFrames.has(frame.number) ? ' removed' : '') + '" data-frame="' + frame.number + '"><img loading="lazy" src="' + escapeAttr(frame.path) + '" alt="' + pad(frame.number) + '"><span>' + pad(frame.number) + '</span><label class="remove-frame"><input type="checkbox" data-remove-frame="' + frame.number + '"' + (removedFrames.has(frame.number) ? ' checked' : '') + '> Remove</label></div>'
  ).join('');
  card.innerHTML = `
    <section class="decision">
      <label class="checkline"><input type="checkbox" ${{saved.implement ? 'checked' : ''}> Implement</label>
      <div class="range-id">${{escapeHtml(character.id)}} ${{pad(range.start)}}-${{pad(range.end)}}</div>
      <div class="meta">${{range.count}} frame${{range.count === 1 ? '' : 's'}}</div>
      <div class="target">${{targetText}}</div>
      <select aria-label="target slot">
        ${{optionHtml}}
      </select>
      <textarea placeholder="Review notes">${{escapeHtml(saved.notes || '')}}</textarea>
    </section>
    <section class="strip">
      ${{framesHtml}}
    </section>
  `;
  const checkbox = card.querySelector('input[type="checkbox"]');
  const select = card.querySelector('select');
  const notes = card.querySelector('textarea');
  const removeChecks = Array.from(card.querySelectorAll('[data-remove-frame]'));
  select.value = saved.target || '';
  checkbox.addEventListener('change', () => {{
    const item = cardState(range.id);
    item.implement = checkbox.checked;
    item.target = select.value;
    item.notes = notes.value;
    save();
  }});
  select.addEventListener('change', () => {{
    const item = cardState(range.id);
    item.target = select.value;
    save();
  }});
  notes.addEventListener('input', () => {{
    const item = cardState(range.id);
    item.notes = notes.value;
    save();
  }});
  for (const removeCheck of removeChecks) {{
    removeCheck.addEventListener('change', () => {{
      const item = cardState(range.id);
      const number = Number(removeCheck.dataset.removeFrame);
      const removed = new Set((item.removedFrames || []).map(Number));
      if (removeCheck.checked) removed.add(number);
      else removed.delete(number);
      item.removedFrames = Array.from(removed).sort((a, b) => a - b);
      removeCheck.closest('.frame')?.classList.toggle('removed', removeCheck.checked);
      save();
    }});
  }}
  return card;
}}

function selectedPayload() {{
  const selections = [];
  for (const character of characters) {{
    for (const range of character.ranges) {{
      const saved = state[range.id];
      if (!saved?.implement) continue;
      const removedFrames = (saved.removedFrames || []).map(Number).sort((a, b) => a - b);
      const finalFrames = range.frames.map(frame => frame.number).filter(number => !removedFrames.includes(number));
      selections.push({{
        character: character.id,
        start: range.start,
        end: range.end,
        frames: range.frames.map(frame => frame.number),
        removedFrames,
        finalFrames,
        target: saved.target || range.target?.key || '',
        notes: saved.notes || ''
      }});
    }}
  }}
  return {{ selections }};
}}

document.getElementById('expand-all').addEventListener('click', () => document.querySelectorAll('details').forEach(item => item.open = true));
document.getElementById('collapse-all').addEventListener('click', () => document.querySelectorAll('details').forEach(item => item.open = false));
document.getElementById('clear-review').addEventListener('click', () => {{
  if (!confirm('Clear all saved Implement checks, removed frames, and notes for this page?')) return;
  state = {{}};
  localStorage.removeItem(storageKey);
  render();
}});
document.getElementById('copy-selected').addEventListener('click', async event => {{
  const text = JSON.stringify(selectedPayload(), null, 2);
  await navigator.clipboard.writeText(text);
  event.target.classList.add('copied');
  event.target.textContent = 'Copied selected JSON';
  setTimeout(() => {{
    event.target.classList.remove('copied');
    event.target.textContent = 'Copy selected JSON';
  }}, 1400);
}});

function pad(number) {{ return String(number).padStart(3, '0'); }}
function escapeHtml(value) {{
  return String(value).replace(/[&<>"']/g, char => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[char]));
}}
function escapeAttr(value) {{ return escapeHtml(value); }}
render();
</script>
</body>
</html>
"""
    page = page.replace("{{", "{").replace("}}", "}")
    page = (
        page.replace("__DATA_JSON__", safe_data_json)
        .replace("__TOTAL_RANGES__", str(total_ranges))
        .replace("__TOTAL_FRAMES__", str(total_frames))
        .replace("__TOTAL_ASSIGNABLE__", str(total_assignable))
    )
    OUTPUT.write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
