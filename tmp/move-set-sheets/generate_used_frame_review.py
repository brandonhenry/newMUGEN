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

from generate_move_set_sheets import OUT_DIR, iter_characters, resolve_configured_moves  # noqa: E402

OUTPUT = OUT_DIR / "used-frame-review.html"


def main() -> None:
    characters = []
    total_moves = 0
    total_frames = 0

    for character in iter_characters():
        moves = []
        for move in resolve_configured_moves(character):
            frames = [
                {
                    "number": frame_number(frame),
                    "path": frame_path(character["id"], frame),
                }
                for frame in move["frames"]
            ]
            frames = [frame for frame in frames if frame["number"] is not None]
            if not frames:
                continue
            total_moves += 1
            total_frames += len(frames)
            moves.append(
                {
                    "id": f"{character['id']}::{move['key']}",
                    "key": move["key"],
                    "label": move["label"],
                    "notation": " ".join(move["notation"]) or "-",
                    "frameCount": len(frames),
                    "frames": frames,
                    "props": move_summary(move["move"]),
                }
            )
        characters.append(
            {
                "id": character["id"],
                "displayName": character["manifest"].get("displayName", character["id"]),
                "moves": moves,
            }
        )

    write_page(characters, total_moves, total_frames)
    print(
        json.dumps(
            {
                "ok": True,
                "characters": len(characters),
                "moves": total_moves,
                "frames": total_frames,
                "index": str(OUTPUT),
            },
            indent=2,
        )
    )


def frame_number(value: str | Path) -> int | None:
    match = re.search(r"frame-(\d+)", str(value))
    return int(match.group(1)) if match else None


def frame_path(character_id: str, frame: str) -> str:
    number = frame_number(frame)
    if number is None:
        return str(frame)
    return f"../../public/characters/{character_id}/frames/frame-{number:03d}.png"


def move_summary(move: dict[str, Any]) -> str:
    parts = []
    for key, label in (
        ("hitLevel", None),
        ("throwCapture", "throw"),
        ("throwSideSwap", "side-swap throw"),
        ("tornado", "tornado"),
        ("knockdown", "knockdown"),
        ("jumpBeforeMove", "jump"),
        ("endsInCrouch", "FC end"),
        ("usesKi", "ki"),
        ("kiBurst", "blast"),
    ):
        value = move.get(key)
        if value:
            parts.append(str(label or value))
    if float_or_zero(move.get("launchHeight")) > 0:
        parts.append("launcher")
    return ", ".join(dict.fromkeys(parts)) or "none"


def float_or_zero(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def write_page(characters: list[dict[str, Any]], total_moves: int, total_frames: int) -> None:
    data_json = json.dumps(characters, separators=(",", ":")).replace("</", "<\\/")
    page = """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Used frame delete review</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #050505; color: #f4f4f5; font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; z-index: 4; background: rgba(5, 5, 5, .96); border-bottom: 1px solid #242429; padding: 18px 28px; }
    h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.1; }
    header p { margin: 0; color: #b8c0cc; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; }
    button { appearance: none; border: 1px solid #3a3d45; background: #16181d; color: #f4f4f5; padding: 9px 12px; border-radius: 6px; cursor: pointer; }
    button:hover { border-color: #6aa8ff; }
    .count { color: #aeb8c6; }
    main { padding: 24px 28px 48px; }
    details.character { border: 1px solid #25262b; background: #0f1013; margin-bottom: 14px; }
    summary { cursor: pointer; padding: 14px 16px; font-weight: 700; font-size: 18px; }
    summary span { color: #9ca3af; font-weight: 500; margin-left: 8px; font-size: 13px; }
    .moves { display: grid; gap: 12px; padding: 0 14px 14px; }
    .move { display: grid; grid-template-columns: 238px minmax(0, 1fr); gap: 14px; border: 1px solid #2a2c33; background: #08090b; padding: 12px; }
    .info { border-right: 1px solid #24262e; padding-right: 12px; }
    .label { font-size: 17px; font-weight: 800; line-height: 1.15; color: #f4f4f5; overflow-wrap: anywhere; }
    .key { color: #8ec8ff; font-weight: 700; margin: 8px 0 4px; overflow-wrap: anywhere; }
    .meta, .props { color: #aeb8c6; line-height: 1.45; }
    textarea { width: 100%; min-height: 62px; margin-top: 10px; border: 1px solid #30323a; background: #111318; color: #f4f4f5; border-radius: 6px; padding: 8px; resize: vertical; font: inherit; }
    .strip { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 6px; }
    .frame { flex: 0 0 86px; border: 1px solid #2a2c32; background: #000; height: 142px; display: grid; grid-template-rows: 92px 22px 26px; align-items: end; justify-items: center; }
    .frame.deleted { opacity: .42; border-color: #7f2d2d; }
    .frame.deleted img { filter: grayscale(1); }
    .frame img { max-width: 82px; max-height: 88px; image-rendering: pixelated; object-fit: contain; }
    .frame span { width: 100%; text-align: center; color: #f4f4f5; background: #0b0c0f; font-size: 12px; line-height: 22px; }
    .delete-frame { width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; color: #ffb4b4; background: #120708; font-size: 11px; line-height: 26px; cursor: pointer; }
    input[type="checkbox"] { width: 16px; height: 16px; accent-color: #ff6b6b; cursor: pointer; }
    .empty { color: #858b97; padding: 0 16px 16px; }
    .copied { color: #75e098; }
  </style>
</head>
<body>
<header>
  <h1>Used Frame Delete Review</h1>
  <p>Every frame currently tied to a configured move is shown inside that move. Check <b>Delete</b> under frames you want removed from that specific move. Your review state autosaves in this browser.</p>
  <div class="toolbar">
    <button id="expand-all">Expand all</button>
    <button id="collapse-all">Collapse all</button>
    <button id="copy-selected">Copy delete JSON</button>
    <button id="clear-review">Clear saved deletes</button>
    <span class="count" id="status">__TOTAL_MOVES__ moves / __TOTAL_FRAMES__ frame uses</span>
  </div>
</header>
<main id="app"></main>
<script id="review-data" type="application/json">__DATA_JSON__</script>
<script>
const characters = JSON.parse(document.getElementById('review-data').textContent);
const storageKey = 'kore-used-frame-delete-review-v1';
let state = JSON.parse(localStorage.getItem(storageKey) || '{}');
const app = document.getElementById('app');
const status = document.getElementById('status');

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  updateStatus();
}

function moveState(id) {
  state[id] ||= { deleteFrames: [], notes: '' };
  state[id].deleteFrames ||= [];
  return state[id];
}

function render() {
  app.innerHTML = '';
  for (const character of characters) {
    const details = document.createElement('details');
    details.className = 'character';
    details.open = character.moves.length > 0 && character.moves.length <= 8;
    const summary = document.createElement('summary');
    const frameCount = character.moves.reduce((sum, move) => sum + move.frames.length, 0);
    summary.innerHTML = `${escapeHtml(character.displayName)} <span>${escapeHtml(character.id)} / ${character.moves.length} moves / ${frameCount} frame uses</span>`;
    details.appendChild(summary);
    if (!character.moves.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No configured move frames.';
      details.appendChild(empty);
    } else {
      const moves = document.createElement('div');
      moves.className = 'moves';
      for (const move of character.moves) moves.appendChild(renderMove(character, move));
      details.appendChild(moves);
    }
    app.appendChild(details);
  }
  updateStatus();
}

function renderMove(character, move) {
  const saved = moveState(move.id);
  const deleted = new Set((saved.deleteFrames || []).map(Number));
  const card = document.createElement('article');
  card.className = 'move';
  card.dataset.id = move.id;
  const framesHtml = move.frames.map(frame =>
    '<div class="frame' + (deleted.has(frame.number) ? ' deleted' : '') + '" data-frame="' + frame.number + '"><img loading="lazy" src="' + escapeAttr(frame.path) + '" alt="' + pad(frame.number) + '"><span>' + pad(frame.number) + '</span><label class="delete-frame"><input type="checkbox" data-delete-frame="' + frame.number + '"' + (deleted.has(frame.number) ? ' checked' : '') + '> Delete</label></div>'
  ).join('');
  card.innerHTML = `
    <section class="info">
      <div class="label">${escapeHtml(move.label)}</div>
      <div class="key">${escapeHtml(move.key)}</div>
      <div class="meta">notation: ${escapeHtml(move.notation)}<br>${move.frameCount} frame${move.frameCount === 1 ? '' : 's'}</div>
      <div class="props">${escapeHtml(move.props)}</div>
      <textarea placeholder="Delete notes">${escapeHtml(saved.notes || '')}</textarea>
    </section>
    <section class="strip">${framesHtml}</section>
  `;
  const notes = card.querySelector('textarea');
  notes.addEventListener('input', () => {
    const item = moveState(move.id);
    item.notes = notes.value;
    save();
  });
  for (const check of Array.from(card.querySelectorAll('[data-delete-frame]'))) {
    check.addEventListener('change', () => {
      const item = moveState(move.id);
      const number = Number(check.dataset.deleteFrame);
      const deleteFrames = new Set((item.deleteFrames || []).map(Number));
      if (check.checked) deleteFrames.add(number);
      else deleteFrames.delete(number);
      item.deleteFrames = Array.from(deleteFrames).sort((a, b) => a - b);
      check.closest('.frame')?.classList.toggle('deleted', check.checked);
      save();
    });
  }
  return card;
}

function selectedPayload() {
  const deletes = [];
  for (const character of characters) {
    for (const move of character.moves) {
      const saved = state[move.id];
      const deleteFrames = (saved?.deleteFrames || []).map(Number).sort((a, b) => a - b);
      if (!deleteFrames.length) continue;
      deletes.push({
        character: character.id,
        moveKey: move.key,
        label: move.label,
        deleteFrames,
        keepFrames: move.frames.map(frame => frame.number).filter(number => !deleteFrames.includes(number)),
        notes: saved.notes || ''
      });
    }
  }
  return { deletes };
}

function updateStatus() {
  let moveCount = 0;
  let frameCount = 0;
  for (const item of Object.values(state)) {
    const count = (item?.deleteFrames || []).length;
    if (count) moveCount += 1;
    frameCount += count;
  }
  status.textContent = `__TOTAL_MOVES__ moves / __TOTAL_FRAMES__ frame uses / ${moveCount} moves with deletes / ${frameCount} frames marked`;
}

document.getElementById('expand-all').addEventListener('click', () => document.querySelectorAll('details').forEach(item => item.open = true));
document.getElementById('collapse-all').addEventListener('click', () => document.querySelectorAll('details').forEach(item => item.open = false));
document.getElementById('clear-review').addEventListener('click', () => {
  if (!confirm('Clear all saved delete checks and notes for this page?')) return;
  state = {};
  localStorage.removeItem(storageKey);
  render();
});
document.getElementById('copy-selected').addEventListener('click', async event => {
  await navigator.clipboard.writeText(JSON.stringify(selectedPayload(), null, 2));
  event.target.classList.add('copied');
  event.target.textContent = 'Copied delete JSON';
  setTimeout(() => {
    event.target.classList.remove('copied');
    event.target.textContent = 'Copy delete JSON';
  }, 1400);
});

function pad(number) { return String(number).padStart(3, '0'); }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}
function escapeAttr(value) { return escapeHtml(value); }
render();
</script>
</body>
</html>
"""
    page = (
        page.replace("__DATA_JSON__", data_json)
        .replace("__TOTAL_MOVES__", str(total_moves))
        .replace("__TOTAL_FRAMES__", str(total_frames))
    )
    OUTPUT.write_text(page, encoding="utf-8")


if __name__ == "__main__":
    main()
