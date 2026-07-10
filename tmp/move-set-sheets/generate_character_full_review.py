#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from argparse import ArgumentParser
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from generate_move_set_sheets import OUT_DIR, frame_name, iter_characters, resolve_configured_moves  # noqa: E402
from generate_unused_range_review import candidate_slots, make_range_chunks  # noqa: E402

MIN_UNUSED_FRAME = 51


def main() -> None:
    parser = ArgumentParser()
    parser.add_argument("character", help="Character id, for example rock-lee")
    args = parser.parse_args()

    character = next((item for item in iter_characters() if item["id"] == args.character), None)
    if not character:
        raise SystemExit(f"Character not found: {args.character}")

    moves = used_moves(character)
    unused = unused_ranges(character)
    targets = candidate_slots(character)
    for index, item in enumerate(unused):
        item["target"] = targets[index] if index < len(targets) else None

    output = OUT_DIR / f"{character['id']}-full-review.html"
    write_page(character, moves, unused, output)
    print(
        json.dumps(
            {
                "ok": True,
                "character": character["id"],
                "moves": len(moves),
                "usedFrameUses": sum(len(move["frames"]) for move in moves),
                "unusedRanges": len(unused),
                "unusedFrames": sum(len(item["frames"]) for item in unused),
                "output": str(output),
            },
            indent=2,
        )
    )


def used_moves(character: dict[str, Any]) -> list[dict[str, Any]]:
    moves = []
    for move in resolve_configured_moves(character):
        frames = [{"number": frame_number(frame), "path": frame_path(character["id"], frame)} for frame in move["frames"]]
        frames = [frame for frame in frames if frame["number"] is not None]
        if not frames:
            continue
        moves.append(
            {
                "id": f"{character['id']}::{move['key']}",
                "key": move["key"],
                "label": move["label"],
                "notation": " ".join(move["notation"]) or "-",
                "props": move_summary(move["move"]),
                "frames": frames,
            }
        )
    return moves


def unused_ranges(character: dict[str, Any]) -> list[dict[str, Any]]:
    used = {frame_name(frame) for move in resolve_configured_moves(character) for frame in move["frames"]}
    numbers = []
    for path in sorted((character["dir"] / "frames").glob("frame-*.png"), key=frame_number):
        number = frame_number(path)
        if number is None or number < MIN_UNUSED_FRAME:
            continue
        if frame_name(path.name) not in used:
            numbers.append(number)

    ranges: list[dict[str, Any]] = []
    if not numbers:
        return ranges
    start = prev = numbers[0]
    for number in numbers[1:]:
        if number == prev + 1:
            prev = number
            continue
        ranges.extend(make_range_chunks(character["id"], start, prev))
        start = prev = number
    ranges.extend(make_range_chunks(character["id"], start, prev))
    return ranges


def frame_number(value: str | Path) -> int | None:
    match = re.search(r"frame-(\d+)", str(value))
    return int(match.group(1)) if match else None


def frame_path(character_id: str, frame: str | int | Path) -> str:
    number = frame if isinstance(frame, int) else frame_number(frame)
    if number is None:
        return str(frame)
    return f"../../public/characters/{character_id}/frames/frame-{number:03d}.png"


def move_summary(move: dict[str, Any]) -> str:
    parts = []
    if move.get("hitLevel"):
        parts.append(str(move["hitLevel"]))
    if move.get("throwCapture"):
        parts.append("throw")
    if move.get("throwSideSwap"):
        parts.append("side-swap throw")
    if float_or_zero(move.get("launchHeight")) > 0:
        parts.append("launcher")
    if move.get("tornado"):
        parts.append("tornado")
    if move.get("knockdown"):
        parts.append("knockdown")
    if move.get("kiBurst") or move.get("usesKi"):
        parts.append("blast")
    return ", ".join(dict.fromkeys(parts)) or "none"


def float_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def write_page(character: dict[str, Any], moves: list[dict[str, Any]], unused: list[dict[str, Any]], output: Path) -> None:
    data = {
        "character": {
            "id": character["id"],
            "displayName": character["manifest"].get("displayName", character["id"]),
        },
        "moves": moves,
        "unused": unused,
    }
    data_json = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    page = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>__TITLE__ full move review</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #050505; color: #f4f4f5; font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; z-index: 4; background: rgba(5,5,5,.96); border-bottom: 1px solid #242429; padding: 18px 28px; }
    h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.1; }
    header p { margin: 0; color: #b8c0cc; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; }
    button { appearance: none; border: 1px solid #3a3d45; background: #16181d; color: #f4f4f5; padding: 9px 12px; border-radius: 6px; cursor: pointer; }
    button:hover { border-color: #6aa8ff; }
    .count { color: #aeb8c6; }
    main { padding: 24px 28px 48px; }
    h2 { margin: 26px 0 12px; font-size: 22px; }
    .list { display: grid; gap: 12px; }
    .card { display: grid; grid-template-columns: 238px minmax(0, 1fr); gap: 14px; border: 1px solid #2a2c33; background: #08090b; padding: 12px; }
    .info { border-right: 1px solid #24262e; padding-right: 12px; }
    .label { font-size: 17px; font-weight: 800; line-height: 1.15; color: #f4f4f5; overflow-wrap: anywhere; }
    .key, .range-id { color: #8ec8ff; font-weight: 700; margin: 8px 0 4px; overflow-wrap: anywhere; }
    .meta, .props, .target { color: #aeb8c6; line-height: 1.45; }
    .checkline { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 800; margin-bottom: 10px; }
    .checkline input { width: 34px; height: 34px; accent-color: #55d67a; }
    select, textarea { width: 100%; margin-top: 8px; border: 1px solid #30323a; background: #111318; color: #f4f4f5; border-radius: 6px; }
    select { padding: 8px; }
    textarea { min-height: 58px; padding: 8px; resize: vertical; font: inherit; }
    .strip { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 6px; }
    .frame { flex: 0 0 86px; border: 1px solid #2a2c32; background: #000; height: 142px; display: grid; grid-template-rows: 92px 22px 26px; align-items: end; justify-items: center; }
    .frame.removed { opacity: .42; border-color: #7f2d2d; }
    .frame.removed img { filter: grayscale(1); }
    .frame img { max-width: 82px; max-height: 88px; image-rendering: pixelated; object-fit: contain; }
    .frame span { width: 100%; text-align: center; color: #f4f4f5; background: #0b0c0f; font-size: 12px; line-height: 22px; }
    .remove-frame { width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; color: #ffb4b4; background: #120708; font-size: 11px; line-height: 26px; cursor: pointer; }
    .remove-frame input { width: 16px; height: 16px; accent-color: #ff6b6b; }
    .empty { color: #858b97; border: 1px solid #25262b; background: #101113; padding: 16px; }
    .copied { color: #75e098; }
  </style>
</head>
<body>
<header>
  <h1>__TITLE__ Full Move Review</h1>
  <p>Used moves are shown first. Unused frame ranges are below with suggested target slots; check <b>Implement</b> and optionally remove individual frames. Review state autosaves in this browser.</p>
  <div class="toolbar">
    <button id="copy-selected">Copy selected JSON</button>
    <button id="clear-review">Clear saved review</button>
    <span class="count" id="status"></span>
  </div>
</header>
<main id="app"></main>
<script id="review-data" type="application/json">__DATA_JSON__</script>
<script>
const data = JSON.parse(document.getElementById('review-data').textContent);
const storageKey = `kore-character-full-review-${data.character.id}-v1`;
let state = JSON.parse(localStorage.getItem(storageKey) || '{}');
const app = document.getElementById('app');
const status = document.getElementById('status');

function save() { localStorage.setItem(storageKey, JSON.stringify(state)); updateStatus(); }
function rangeState(id, range) {
  state[id] ||= { implement: false, target: range.target?.key || '', removedFrames: [], notes: '' };
  state[id].removedFrames ||= [];
  return state[id];
}

function render() {
  app.innerHTML = '';
  app.appendChild(sectionTitle('Used Moves'));
  const usedList = document.createElement('section');
  usedList.className = 'list';
  for (const move of data.moves) usedList.appendChild(renderUsedMove(move));
  if (!data.moves.length) usedList.appendChild(empty('No used moves.'));
  app.appendChild(usedList);

  app.appendChild(sectionTitle('Unused Ranges'));
  const unusedList = document.createElement('section');
  unusedList.className = 'list';
  for (const range of data.unused) unusedList.appendChild(renderUnusedRange(range));
  if (!data.unused.length) unusedList.appendChild(empty('No unused frame ranges after 050.'));
  app.appendChild(unusedList);
  updateStatus();
}

function sectionTitle(text) {
  const heading = document.createElement('h2');
  heading.textContent = text;
  return heading;
}

function empty(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  return div;
}

function renderUsedMove(move) {
  const card = document.createElement('article');
  card.className = 'card';
  card.innerHTML = `
    <section class="info">
      <div class="label">${escapeHtml(move.label)}</div>
      <div class="key">${escapeHtml(move.key)}</div>
      <div class="meta">notation: ${escapeHtml(move.notation)}<br>${move.frames.length} frame${move.frames.length === 1 ? '' : 's'}</div>
      <div class="props">${escapeHtml(move.props)}</div>
    </section>
    <section class="strip">${move.frames.map(frame => frameTile(frame)).join('')}</section>
  `;
  return card;
}

function renderUnusedRange(range) {
  const saved = rangeState(range.id, range);
  const removed = new Set((saved.removedFrames || []).map(Number));
  const card = document.createElement('article');
  card.className = 'card';
  const targetText = range.target
    ? `<b>${escapeHtml(range.target.key)}</b><br>${escapeHtml(range.target.label)}<br>${range.target.kind === 'duplicate' ? 'duplicate of ' + escapeHtml(range.target.duplicateOf) : 'empty slot'}`
    : '<b>No suggested slot</b><br>All empty/duplicate candidates already consumed.';
  const optionHtml = range.target
    ? '<option value="' + escapeAttr(range.target.key) + '">' + escapeHtml(range.target.key) + ' - ' + escapeHtml(range.target.label) + ' (' + escapeHtml(range.target.kind) + ')</option>'
    : '<option value="">No target</option>';
  card.innerHTML = `
    <section class="info">
      <label class="checkline"><input type="checkbox" ${saved.implement ? 'checked' : ''}> Implement</label>
      <div class="range-id">${pad(range.start)}-${pad(range.end)}</div>
      <div class="meta">${range.frames.length} frame${range.frames.length === 1 ? '' : 's'}</div>
      <div class="target">${targetText}</div>
      <select aria-label="target slot">${optionHtml}</select>
      <textarea placeholder="Review notes">${escapeHtml(saved.notes || '')}</textarea>
    </section>
    <section class="strip">${range.frames.map(frame => frameTile(frame, removed)).join('')}</section>
  `;
  const implement = card.querySelector('.checkline input');
  const select = card.querySelector('select');
  const notes = card.querySelector('textarea');
  select.value = saved.target || '';
  implement.addEventListener('change', () => { const item = rangeState(range.id, range); item.implement = implement.checked; item.target = select.value; item.notes = notes.value; save(); });
  select.addEventListener('change', () => { const item = rangeState(range.id, range); item.target = select.value; save(); });
  notes.addEventListener('input', () => { const item = rangeState(range.id, range); item.notes = notes.value; save(); });
  for (const check of Array.from(card.querySelectorAll('[data-remove-frame]'))) {
    check.addEventListener('change', () => {
      const item = rangeState(range.id, range);
      const number = Number(check.dataset.removeFrame);
      const removedFrames = new Set((item.removedFrames || []).map(Number));
      if (check.checked) removedFrames.add(number);
      else removedFrames.delete(number);
      item.removedFrames = Array.from(removedFrames).sort((a, b) => a - b);
      check.closest('.frame')?.classList.toggle('removed', check.checked);
      save();
    });
  }
  return card;
}

function frameTile(frame, removed = null) {
  const removedSet = removed instanceof Set ? removed : new Set();
  const isRemoved = removedSet.has(frame.number);
  const removeHtml = removed instanceof Set
    ? `<label class="remove-frame"><input type="checkbox" data-remove-frame="${frame.number}" ${isRemoved ? 'checked' : ''}> Remove</label>`
    : '<span></span>';
  return `<div class="frame${isRemoved ? ' removed' : ''}" data-frame="${frame.number}"><img loading="lazy" src="${escapeAttr(frame.path)}" alt="${pad(frame.number)}"><span>${pad(frame.number)}</span>${removeHtml}</div>`;
}

function selectedPayload() {
  const selections = [];
  for (const range of data.unused) {
    const saved = state[range.id];
    if (!saved?.implement) continue;
    const removedFrames = (saved.removedFrames || []).map(Number).sort((a, b) => a - b);
    const finalFrames = range.frames.map(frame => frame.number).filter(number => !removedFrames.includes(number));
    selections.push({
      character: data.character.id,
      start: range.start,
      end: range.end,
      frames: range.frames.map(frame => frame.number),
      removedFrames,
      finalFrames,
      target: saved.target || range.target?.key || '',
      notes: saved.notes || ''
    });
  }
  return { selections };
}

function updateStatus() {
  const checked = selectedPayload().selections.length;
  status.textContent = `${data.moves.length} used moves / ${data.unused.length} unused ranges / ${checked} checked`;
}

document.getElementById('copy-selected').addEventListener('click', async event => {
  await navigator.clipboard.writeText(JSON.stringify(selectedPayload(), null, 2));
  event.target.classList.add('copied');
  event.target.textContent = 'Copied selected JSON';
  setTimeout(() => { event.target.classList.remove('copied'); event.target.textContent = 'Copy selected JSON'; }, 1400);
});
document.getElementById('clear-review').addEventListener('click', () => {
  if (!confirm('Clear saved review for this character?')) return;
  state = {};
  localStorage.removeItem(storageKey);
  render();
});

function pad(number) { return String(number).padStart(3, '0'); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
function escapeAttr(value) { return escapeHtml(value); }
render();
</script>
</body>
</html>
"""
    page = page.replace("__TITLE__", html_escape(str(data["character"]["displayName"]))).replace("__DATA_JSON__", data_json)
    output.write_text(page, encoding="utf-8")


def html_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


if __name__ == "__main__":
    main()
