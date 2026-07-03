import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const charactersRoot = path.join(repoRoot, 'public/characters');
const sheetsRoot = path.join(repoRoot, 'tmp/voxel-visual-proof/sheets');
const defaultPort = Number(process.env.PORT || 4199);
const execFileAsync = promisify(execFile);
let proofGeneration = null;

const stanceOrder = [
  'idle',
  'walkForward',
  'walkBack',
  'sprint',
  'backflip',
  'sidestepLeft',
  'sidestepRight',
  'jump',
  'crouch',
  'block',
  'crouchBlock',
  'chargeKi',
  'jableft',
  'jabright',
  'kickleft',
  'kickright',
  'hitLight',
  'hitHeavy',
  'juggle',
  'knockdown',
  'getupStand',
  'win',
  'lose'
];

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, status, text, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store'
  });
  response.end(text);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function median(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[middle] : (nums[middle - 1] + nums[middle]) / 2;
}

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

async function voxelBounds(characterId, frameIndex) {
  const file = path.join(charactersRoot, characterId, 'voxels-hd', `frame-${String(frameIndex).padStart(3, '0')}.json`);
  try {
    const payload = await readJson(file);
    const voxels = Array.isArray(payload) ? payload : payload.voxels;
    if (!Array.isArray(voxels) || voxels.length === 0) return { width: 1, height: 1 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const voxel of voxels) {
      minX = Math.min(minX, Number(voxel.x) - Number(voxel.w) / 2);
      maxX = Math.max(maxX, Number(voxel.x) + Number(voxel.w) / 2);
      minY = Math.min(minY, Number(voxel.y) - Number(voxel.h) / 2);
      maxY = Math.max(maxY, Number(voxel.y) + Number(voxel.h) / 2);
    }
    return { width: Math.max(0.01, maxX - minX), height: Math.max(0.01, maxY - minY) };
  } catch {
    return { width: 1, height: 1 };
  }
}

function keySort(a, b) {
  const ai = stanceOrder.indexOf(a);
  const bi = stanceOrder.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b, undefined, { numeric: true });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function globalScale(character) {
  const legacy = clamp(character.scale ?? 1, 0.25, 2.5);
  return {
    width: clamp(character.modelScale?.width ?? legacy, 0.25, 2.5),
    height: clamp(character.modelScale?.height ?? legacy, 0.25, 2.5)
  };
}

function animationScaleFor(character, key, frameIndex) {
  const frameScale = character.animationFrameScales?.[key]?.[String(frameIndex)];
  const animationScale = character.animationScales?.[key];
  const selected = frameScale ?? animationScale ?? {};
  const global = globalScale(character);
  const width = clamp(selected.width ?? 1, 0.25, 2.5);
  const height = clamp(selected.height ?? 1, 0.25, 2.5);
  const offsetX = clamp(selected.offsetX ?? animationScale?.offsetX ?? 0, -6, 6);
  return {
    width,
    height,
    globalWidth: global.width,
    globalHeight: global.height,
    effectiveWidth: width * global.width,
    effectiveHeight: height * global.height,
    offsetX,
    source: frameScale ? 'frame' : animationScale ? 'animation' : 'default'
  };
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(root, normalized);
  if (!file.startsWith(root)) return null;
  return file;
}

async function collectCharacters() {
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  const characters = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!fsSync.existsSync(manifestPath)) continue;
    const character = await readJson(manifestPath);
    if (character.unplayable || id === 'near' || !character.animationFrames?.idle?.length) continue;
    const animationKeys = Object.keys(character.animationFrames ?? {})
      .filter((key) => character.animationFrames[key]?.length)
      .sort(keySort);
    const idleMetrics = [];
    for (const framePath of character.animationFrames.idle ?? []) {
      const frameIndex = frameIndexFromPath(framePath);
      if (!Number.isFinite(frameIndex)) continue;
      const bounds = await voxelBounds(id, frameIndex);
      const scale = animationScaleFor(character, 'idle', frameIndex);
      idleMetrics.push({
        width: bounds.width * scale.effectiveWidth,
        height: bounds.height * scale.effectiveHeight
      });
    }
    const idleWidth = median(idleMetrics.map((metric) => metric.width)) || 1;
    const idleHeight = median(idleMetrics.map((metric) => metric.height)) || 1;
    const animations = {};
    for (const key of animationKeys) {
      animations[key] = character.animationFrames[key]
        .map(async (framePath) => {
          const frameIndex = frameIndexFromPath(framePath);
          const scale = animationScaleFor(character, key, frameIndex);
          const bounds = await voxelBounds(id, frameIndex);
          return {
            frameIndex,
            src: `/characters/${id}/frames/frame-${String(frameIndex).padStart(3, '0')}.png`,
            cropSrc: `/crop/characters/${id}/frames/frame-${String(frameIndex).padStart(3, '0')}.png`,
            rawWidth: bounds.width,
            rawHeight: bounds.height,
            renderWidth: bounds.width * scale.effectiveWidth,
            renderHeight: bounds.height * scale.effectiveHeight,
            ...scale
          };
        })
      animations[key] = (await Promise.all(animations[key])).filter((frame) => Number.isFinite(frame.frameIndex));
    }
    characters.push({
      id,
      displayName: character.displayName ?? id,
      sheet: `/sheets/${id}.png`,
      idleWidth,
      idleHeight,
      animations
    });
  }
  characters.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { numeric: true }));
  return characters;
}

async function saveScale(payload) {
  const { characterId, animationKey, frameIndex } = payload ?? {};
  const width = Number(payload?.width ?? payload?.scale);
  const height = Number(payload?.height ?? payload?.scale);
  if (!characterId || !animationKey || !Number.isFinite(Number(frameIndex)) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, error: 'Missing characterId, animationKey, frameIndex, width, or height.' };
  }
  if (width < 0.25 || width > 2.5 || height < 0.25 || height > 2.5) {
    return { ok: false, error: 'Width and height must be between 0.25 and 2.5, matching the in-game clamp.' };
  }
  const manifestPath = path.join(charactersRoot, characterId, 'character.json');
  if (!fsSync.existsSync(manifestPath)) return { ok: false, error: `Character not found: ${characterId}` };
  const character = await readJson(manifestPath);
  const frames = character.animationFrames?.[animationKey];
  if (!frames?.length) return { ok: false, error: `Animation not found: ${animationKey}` };
  const frameNumber = Number(frameIndex);
  const used = frames.some((framePath) => frameIndexFromPath(framePath) === frameNumber);
  if (!used) return { ok: false, error: `Frame ${frameNumber} is not used by ${animationKey}.` };
  character.animationFrameScales ??= {};
  character.animationFrameScales[animationKey] ??= {};
  const existing = character.animationFrameScales[animationKey][String(frameNumber)];
  const animationScale = character.animationScales?.[animationKey];
  const offsetX = Number(payload.offsetX ?? existing?.offsetX ?? animationScale?.offsetX ?? 0);
  const roundedWidth = Math.round(width * 1000) / 1000;
  const roundedHeight = Math.round(height * 1000) / 1000;
  character.animationFrameScales[animationKey][String(frameNumber)] = {
    width: roundedWidth,
    height: roundedHeight,
    offsetX: clamp(offsetX, -6, 6)
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
  const saved = animationScaleFor(character, animationKey, frameNumber);
  return { ok: true, ...saved };
}

async function resetScale(payload) {
  const { characterId, animationKey, frameIndex } = payload ?? {};
  const manifestPath = path.join(charactersRoot, characterId ?? '', 'character.json');
  if (!characterId || !animationKey || !Number.isFinite(Number(frameIndex)) || !fsSync.existsSync(manifestPath)) {
    return { ok: false, error: 'Missing character, animation, or frame.' };
  }
  const character = await readJson(manifestPath);
  delete character.animationFrameScales?.[animationKey]?.[String(Number(frameIndex))];
  if (character.animationFrameScales?.[animationKey] && Object.keys(character.animationFrameScales[animationKey]).length === 0) {
    delete character.animationFrameScales[animationKey];
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
  return { ok: true };
}

async function regenerateProof() {
  if (!proofGeneration) {
    proofGeneration = execFileAsync('node', [path.join(repoRoot, 'tmp/voxel-visual-proof/generate-static-proof.mjs')], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 10
    }).finally(() => {
      proofGeneration = null;
    });
  }
  const result = await proofGeneration;
  return { ok: true, stdout: result.stdout.trim().split('\n').slice(-8).join('\n') };
}

async function sendCroppedFrame(response, file) {
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const output = maxX >= minX && maxY >= minY
    ? await sharp(file).extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer()
    : await fs.readFile(file);
  response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
  response.end(output);
}

function html() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KORE Frame Scale Editor</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, Arial, sans-serif; background: #101115; color: #f5f5f5; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; overflow: hidden; }
    button, input, select { font: inherit; }
    .app { display: grid; grid-template-columns: 330px 1fr 360px; height: 100vh; }
    .panel { background: #171920; border-right: 1px solid #2b2f3a; min-height: 0; overflow: auto; }
    .right { border-left: 1px solid #2b2f3a; border-right: 0; padding: 16px; }
    .main { min-width: 0; min-height: 0; overflow: auto; background: #f8f8f8; color: #111; }
    header { position: sticky; top: 0; z-index: 5; background: #171920; padding: 14px; border-bottom: 1px solid #2b2f3a; }
    h1 { font-size: 18px; margin: 0 0 10px; }
    h2 { font-size: 15px; margin: 18px 0 8px; }
    .search { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid #3a4050; background: #101218; color: #fff; }
    .roster { padding: 10px; display: grid; gap: 6px; }
    .char { width: 100%; border: 1px solid #2f3542; background: #20242d; color: #f5f5f5; border-radius: 7px; padding: 9px 10px; text-align: left; cursor: pointer; }
    .char.active { background: #31d8ef; color: #071217; border-color: #74ecff; font-weight: 800; }
    .sheetBar { position: sticky; top: 0; z-index: 2; background: #eef0f4; border-bottom: 1px solid #cbd0d8; padding: 10px 12px; display: flex; align-items: center; gap: 12px; }
    .sheetBar strong { font-size: 16px; }
    .sheetWrap { padding: 12px; }
    .sheetWrap img { display: block; width: 100%; height: auto; image-rendering: auto; background: #fff; }
    .moveList { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .move { border: 1px solid #384050; background: #232832; color: #f4f7fa; border-radius: 7px; padding: 8px 9px; cursor: pointer; }
    .move.active { background: #31d8ef; color: #071217; border-color: #77edff; font-weight: 800; }
    .frames { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 9px; }
    .frame { border: 1px solid #3a4050; border-radius: 8px; background: #101218; color: #fff; padding: 8px; cursor: pointer; min-height: 94px; display: flex; flex-direction: column; align-items: center; justify-content: end; }
    .frame.active { outline: 2px solid #31d8ef; }
    .frameStage { width: 64px; height: 58px; display: grid; place-items: end center; border-bottom: 2px solid #ff415d; margin-bottom: 5px; }
    .frameStage img { max-width: 64px; max-height: 58px; image-rendering: pixelated; transform-origin: bottom center; }
    .frame small { color: #aeb6c8; }
    .previewBox { height: 220px; background: #f9f9f9; border-radius: 8px; border: 1px solid #343b49; display: grid; place-items: end center; padding: 12px; margin: 10px 0; position: relative; overflow: hidden; }
    .previewBox:before { content: ""; position: absolute; left: 0; right: 0; top: 42px; border-top: 2px dashed #75a7ff; }
    .previewBox:after { content: ""; position: absolute; left: 0; right: 0; bottom: 34px; border-top: 3px solid #ff3153; }
    .previewBox img { image-rendering: pixelated; transform-origin: bottom center; }
    .previewBox .idleGhost { opacity: 0.24; filter: grayscale(1) contrast(1.2) brightness(0.75); z-index: 1; pointer-events: none; }
    .previewBox .selectedFrame { z-index: 2; }
    .row { display: flex; gap: 8px; align-items: center; margin: 10px 0; }
    .row label { min-width: 76px; color: #d7deea; font-weight: 700; }
    .row input[type=number] { width: 110px; padding: 9px; border: 1px solid #3a4050; border-radius: 7px; background: #101218; color: #fff; }
    .row input[type=range] { flex: 1; }
    .checkRow { align-items: center; justify-content: space-between; border: 1px solid #323947; border-radius: 8px; padding: 9px 10px; background: #101218; }
    .checkRow label { min-width: 0; display: flex; align-items: center; gap: 8px; color: #f5f7fb; }
    .checkRow input { width: 18px; height: 18px; accent-color: #31d8ef; }
    .cmd { border: 1px solid #3a4050; background: #242a35; color: #fff; border-radius: 7px; padding: 9px 11px; cursor: pointer; }
    .cmd.primary { background: #31d8ef; color: #071217; border-color: #76edff; font-weight: 800; }
    .cmd.warn { background: #4c2630; border-color: #834253; }
    .status { color: #b9c2d4; min-height: 22px; font-size: 13px; }
    .hint { color: #9ba5b8; font-size: 13px; line-height: 1.45; }
    .pill { color: #071217; background: #31d8ef; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 800; }
  </style>
</head>
<body>
  <div class="app">
    <aside class="panel">
      <header>
        <h1>Frame Scale Editor</h1>
        <input id="search" class="search" placeholder="Search character" />
      </header>
      <div id="roster" class="roster"></div>
    </aside>
    <main class="main">
      <div class="sheetBar">
        <strong id="sheetTitle">Loading...</strong>
        <span class="pill" id="countPill"></span>
      </div>
      <div class="sheetWrap">
        <img id="sheet" alt="Proof sheet" />
      </div>
    </main>
    <aside class="panel right">
      <h2>Move</h2>
      <div id="moves" class="moveList"></div>
      <h2>Frames</h2>
      <div id="frames" class="frames"></div>
      <h2>Selected</h2>
      <div class="previewBox"><img id="idleGhost" class="idleGhost" alt="Idle reference frame" /><img id="preview" class="selectedFrame" alt="Selected frame" /></div>
      <div class="row checkRow"><label><input id="keepAspect" type="checkbox" checked /> Keep aspect ratio</label><span id="effectiveLabel" class="hint"></span></div>
      <div class="row"><label for="widthNumber">Width</label><input id="widthNumber" type="number" min="0.25" max="2.5" step="0.01" /><button class="cmd" id="minusWidth">-</button><button class="cmd" id="plusWidth">+</button></div>
      <div class="row"><input id="widthRange" type="range" min="0.25" max="2.5" step="0.01" /></div>
      <div class="row"><label for="heightNumber">Height</label><input id="heightNumber" type="number" min="0.25" max="2.5" step="0.01" /><button class="cmd" id="minusHeight">-</button><button class="cmd" id="plusHeight">+</button></div>
      <div class="row"><input id="heightRange" type="range" min="0.25" max="2.5" step="0.01" /></div>
      <div class="row"><button class="cmd primary" id="save">Save Frame</button><button class="cmd warn" id="reset">Reset Frame</button></div>
      <div class="row"><button class="cmd" id="regen">Regenerate Proof Sheets</button></div>
      <div class="status" id="status"></div>
      <p class="hint">The preview and thumbnails apply the same animation and per-frame width/height values used by the game. The center sheet updates after regenerating proof sheets.</p>
    </aside>
  </div>
  <script>
    const state = { characters: [], character: null, move: null, frame: null };
    const rosterEl = document.getElementById('roster');
    const movesEl = document.getElementById('moves');
    const framesEl = document.getElementById('frames');
    const sheet = document.getElementById('sheet');
    const sheetTitle = document.getElementById('sheetTitle');
    const countPill = document.getElementById('countPill');
    const idleGhost = document.getElementById('idleGhost');
    const preview = document.getElementById('preview');
    const keepAspect = document.getElementById('keepAspect');
    const widthNumber = document.getElementById('widthNumber');
    const widthRange = document.getElementById('widthRange');
    const heightNumber = document.getElementById('heightNumber');
    const heightRange = document.getElementById('heightRange');
    const effectiveLabel = document.getElementById('effectiveLabel');
    const statusEl = document.getElementById('status');

    const fmt = (value) => Number(value || 1).toFixed(2);
    const clampScale = (value) => Math.max(0.25, Math.min(2.5, Number(value) || 1));
    const rounded = (value) => Math.round(clampScale(value) * 1000) / 1000;
    const thumbPx = () => Math.max(10, Math.min(58 / Math.max(0.01, state.character?.idleHeight || 1), 56 / Math.max(0.01, state.character?.idleWidth || 1)));
    const previewPx = () => Math.max(18, Math.min(150 / Math.max(0.01, state.character?.idleHeight || 1), 160 / Math.max(0.01, state.character?.idleWidth || 1)));
    const imageStyle = (frame, pxPerWorld) => {
      const width = Math.max(1, Math.round(Number(frame.renderWidth || 1) * pxPerWorld));
      const height = Math.max(1, Math.round(Number(frame.renderHeight || 1) * pxPerWorld));
      return 'width:' + width + 'px;height:' + height + 'px;max-width:none;max-height:none;transform:translateX(' + Number(frame.offsetX || 0) * 6 + 'px)';
    };
    const previewImageStyle = (frame, pxPerWorld) => {
      const width = Math.max(1, Math.round(Number(frame.renderWidth || 1) * pxPerWorld));
      const height = Math.max(1, Math.round(Number(frame.renderHeight || 1) * pxPerWorld));
      return 'position:absolute;left:50%;bottom:34px;width:' + width + 'px;height:' + height + 'px;max-width:none;max-height:none;transform:translateX(-50%) translateX(' + Number(frame.offsetX || 0) * 6 + 'px)';
    };

    async function load() {
      const response = await fetch('/api/characters');
      state.characters = await response.json();
      renderRoster();
      selectCharacter(state.characters[0]);
    }

    function renderRoster() {
      const q = document.getElementById('search').value.trim().toLowerCase();
      rosterEl.innerHTML = '';
      state.characters
        .filter((character) => !q || character.displayName.toLowerCase().includes(q) || character.id.includes(q))
        .forEach((character) => {
          const button = document.createElement('button');
          button.className = 'char' + (state.character?.id === character.id ? ' active' : '');
          button.textContent = character.displayName;
          button.onclick = () => selectCharacter(character);
          rosterEl.appendChild(button);
        });
    }

    function selectCharacter(character) {
      state.character = character;
      state.move = Object.keys(character.animations)[0];
      state.frame = character.animations[state.move][0];
      sheet.src = character.sheet + '?t=' + Date.now();
      sheetTitle.textContent = character.displayName + ' (' + character.id + ')';
      countPill.textContent = Object.keys(character.animations).length + ' moves';
      renderRoster();
      renderMoves();
      renderFrames();
      renderSelected();
    }

    function renderMoves() {
      movesEl.innerHTML = '';
      Object.keys(state.character.animations).forEach((key) => {
        const button = document.createElement('button');
        button.className = 'move' + (state.move === key ? ' active' : '');
        button.textContent = key;
        button.onclick = () => {
          state.move = key;
          state.frame = state.character.animations[key][0];
          renderMoves();
          renderFrames();
          renderSelected();
        };
        movesEl.appendChild(button);
      });
    }

    function renderFrames() {
      framesEl.innerHTML = '';
      state.character.animations[state.move].forEach((frame) => {
        const button = document.createElement('button');
        button.className = 'frame' + (state.frame?.frameIndex === frame.frameIndex ? ' active' : '');
        button.innerHTML = '<div class="frameStage"><img src="' + frame.cropSrc + '" style="' + imageStyle(frame, thumbPx()) + '"></div><strong>' + String(frame.frameIndex).padStart(3, '0') + '</strong><small>' + fmt(frame.width) + 'w ' + fmt(frame.height) + 'h</small><small>' + frame.source + '</small>';
        button.onclick = () => {
          state.frame = frame;
          renderFrames();
          renderSelected();
        };
        framesEl.appendChild(button);
      });
    }

    function renderSelected() {
      if (!state.frame) return;
      const idleReference = state.character.animations.idle?.[0];
      if (idleReference) {
        idleGhost.hidden = false;
        idleGhost.src = idleReference.cropSrc;
        idleGhost.setAttribute('style', previewImageStyle(idleReference, previewPx()));
      } else {
        idleGhost.hidden = true;
      }
      preview.src = state.frame.cropSrc;
      preview.setAttribute('style', previewImageStyle(state.frame, previewPx()));
      widthNumber.value = state.frame.width;
      widthRange.value = state.frame.width;
      heightNumber.value = state.frame.height;
      heightRange.value = state.frame.height;
      effectiveLabel.textContent = fmt(state.frame.effectiveWidth) + 'w ' + fmt(state.frame.effectiveHeight) + 'h';
      statusEl.textContent = state.move + ' / frame ' + String(state.frame.frameIndex).padStart(3, '0') + ' / source: ' + state.frame.source + ' / effective: ' + fmt(state.frame.effectiveWidth) + 'w ' + fmt(state.frame.effectiveHeight) + 'h';
    }

    function setScale(axis, value) {
      const next = rounded(value);
      if (axis === 'width') {
        state.frame.width = next;
        if (keepAspect.checked) state.frame.height = next;
      } else {
        state.frame.height = next;
        if (keepAspect.checked) state.frame.width = next;
      }
      state.frame.effectiveWidth = state.frame.width * Number(state.frame.globalWidth || 1);
      state.frame.effectiveHeight = state.frame.height * Number(state.frame.globalHeight || 1);
      state.frame.renderWidth = Number(state.frame.rawWidth || 1) * state.frame.effectiveWidth;
      state.frame.renderHeight = Number(state.frame.rawHeight || 1) * state.frame.effectiveHeight;
      state.frame.source = 'unsaved';
      renderSelected();
      renderFrames();
    }

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      return data;
    }

    async function save() {
      const payload = {
        characterId: state.character.id,
        animationKey: state.move,
        frameIndex: state.frame.frameIndex,
        width: Number(state.frame.width),
        height: Number(state.frame.height),
        offsetX: Number(state.frame.offsetX || 0)
      };
      const data = await postJson('/api/save-scale', payload);
      state.frame.width = data.width;
      state.frame.height = data.height;
      state.frame.globalWidth = data.globalWidth;
      state.frame.globalHeight = data.globalHeight;
      state.frame.effectiveWidth = data.effectiveWidth;
      state.frame.effectiveHeight = data.effectiveHeight;
      state.frame.renderWidth = Number(state.frame.rawWidth || 1) * state.frame.effectiveWidth;
      state.frame.renderHeight = Number(state.frame.rawHeight || 1) * state.frame.effectiveHeight;
      state.frame.offsetX = data.offsetX;
      state.frame.source = 'frame';
      statusEl.textContent = 'Saved ' + state.move + ' frame ' + state.frame.frameIndex + ' at ' + fmt(data.width) + 'w ' + fmt(data.height) + 'h';
      renderFrames();
      renderSelected();
    }

    async function reset() {
      await postJson('/api/reset-scale', {
        characterId: state.character.id,
        animationKey: state.move,
        frameIndex: state.frame.frameIndex
      });
      statusEl.textContent = 'Reset saved scale. Reloading character data...';
      const id = state.character.id;
      const response = await fetch('/api/characters?t=' + Date.now());
      state.characters = await response.json();
      selectCharacter(state.characters.find((character) => character.id === id) || state.characters[0]);
    }

    async function regenerateSheets() {
      statusEl.textContent = 'Regenerating proof sheets...';
      await postJson('/api/regenerate-proof', {});
      const id = state.character.id;
      const move = state.move;
      const frameIndex = state.frame?.frameIndex;
      const response = await fetch('/api/characters?t=' + Date.now());
      state.characters = await response.json();
      const character = state.characters.find((candidate) => candidate.id === id) || state.characters[0];
      selectCharacter(character);
      if (character.animations[move]) {
        state.move = move;
        state.frame = character.animations[move].find((frame) => frame.frameIndex === frameIndex) || character.animations[move][0];
        renderMoves();
        renderFrames();
        renderSelected();
      }
      sheet.src = character.sheet + '?t=' + Date.now();
      statusEl.textContent = 'Proof sheets regenerated.';
    }

    document.getElementById('search').oninput = renderRoster;
    widthNumber.oninput = () => setScale('width', widthNumber.value);
    widthRange.oninput = () => setScale('width', widthRange.value);
    heightNumber.oninput = () => setScale('height', heightNumber.value);
    heightRange.oninput = () => setScale('height', heightRange.value);
    keepAspect.onchange = () => {
      if (keepAspect.checked && state.frame) setScale('height', state.frame.width);
      else renderSelected();
    };
    document.getElementById('minusWidth').onclick = () => setScale('width', Number(state.frame.width) - 0.05);
    document.getElementById('plusWidth').onclick = () => setScale('width', Number(state.frame.width) + 0.05);
    document.getElementById('minusHeight').onclick = () => setScale('height', Number(state.frame.height) - 0.05);
    document.getElementById('plusHeight').onclick = () => setScale('height', Number(state.frame.height) + 0.05);
    document.getElementById('save').onclick = () => save().catch((error) => statusEl.textContent = error.message);
    document.getElementById('reset').onclick = () => reset().catch((error) => statusEl.textContent = error.message);
    document.getElementById('regen').onclick = () => regenerateSheets().catch((error) => statusEl.textContent = error.message);
    window.addEventListener('keydown', (event) => {
      if (!state.frame) return;
      if (event.key === '[') setScale('width', Number(state.frame.width) - 0.01);
      if (event.key === ']') setScale('width', Number(state.frame.width) + 0.01);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save().catch((error) => statusEl.textContent = error.message);
      }
    });
    load().catch((error) => {
      sheetTitle.textContent = 'Failed to load editor';
      statusEl.textContent = error.message;
    });
  </script>
</body>
</html>`;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function handler(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/') return sendText(response, 200, html(), 'text/html; charset=utf-8');
    if (request.method === 'GET' && url.pathname === '/api/characters') return sendJson(response, 200, await collectCharacters());
    if (request.method === 'POST' && url.pathname === '/api/save-scale') return sendJson(response, 200, await saveScale(await readBody(request)));
    if (request.method === 'POST' && url.pathname === '/api/reset-scale') return sendJson(response, 200, await resetScale(await readBody(request)));
    if (request.method === 'POST' && url.pathname === '/api/regenerate-proof') return sendJson(response, 200, await regenerateProof());
    if (request.method === 'GET' && url.pathname.startsWith('/crop/characters/')) {
      const file = safeJoin(path.join(repoRoot, 'public'), url.pathname.replace(/^\/crop\//, ''));
      if (!file || !fsSync.existsSync(file)) return sendText(response, 404, 'Not found');
      return sendCroppedFrame(response, file);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/characters/')) {
      const file = safeJoin(path.join(repoRoot, 'public'), url.pathname.slice(1));
      if (!file || !fsSync.existsSync(file)) return sendText(response, 404, 'Not found');
      response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      return fsSync.createReadStream(file).pipe(response);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/sheets/')) {
      const file = safeJoin(sheetsRoot, url.pathname.replace(/^\/sheets\//, ''));
      if (!file || !fsSync.existsSync(file)) return sendText(response, 404, 'Not found');
      response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
      return fsSync.createReadStream(file).pipe(response);
    }
    return sendText(response, 404, 'Not found');
  } catch (error) {
    return sendJson(response, 500, { ok: false, error: error.message });
  }
}

function listen(port) {
  const server = http.createServer(handler);
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') listen(port + 1);
    else throw error;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`KORE frame scale editor: http://127.0.0.1:${port}/`);
  });
}

listen(defaultPort);
