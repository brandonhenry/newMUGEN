import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioRoot = path.resolve(process.env.KORE_NEW_COLLECTION_AUDIO_ROOT ?? '/Users/brandonhenry/Documents/Kore/Audio/New Collection');
const characterRoot = path.join(repoRoot, 'public', 'characters');
const reviewRoot = path.join(repoRoot, 'public', 'audio-review', 'character-voices');
const reviewAssetRoot = path.join(reviewRoot, 'new-collection-assets');
const selectionsPath = path.join(reviewRoot, 'new-collection-selections.json');
const audioExtensions = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm']);
const voiceCategories = ['hit', 'attackLand', 'launcher', 'tornado', 'win'];
const categoryLabels = {
  hit: 'Hit',
  attackLand: 'Attack land',
  launcher: 'Launcher',
  tornado: 'Tornado',
  win: 'Win'
};

const sourceByCharacterId = {
  'anna-kyoyama': 'Anna Kyoyama',
  'arale-norimaki': 'Arale-Norimaki',
  'dr-mashirito': 'Dr-Mashirito',
  franky: '028_Franky',
  'gintoki-sakata': 'Gintoki',
  gotenks: 'Gotenks',
  'gotenks-super-saiyan': 'Gotenks',
  'nico-robin': '030_Robin',
  raoh: 'Raoh',
  vegito: 'Vegito',
  'yoh-asakura': 'Yoh Asakura',
  'yoh-asakura-power-sword': 'Yoh Asakura'
};

function main() {
  if (!existsSync(audioRoot)) throw new Error(`New Collection audio root does not exist: ${audioRoot}`);
  mkdirSync(reviewRoot, { recursive: true });
  mkdirSync(reviewAssetRoot, { recursive: true });
  const missingCharacters = loadMissingPlayableCharacters();
  const rows = [];
  for (const character of missingCharacters) {
    const sourceFolder = sourceByCharacterId[character.id];
    if (!sourceFolder) continue;
    const sourceDir = path.join(audioRoot, sourceFolder);
    if (!directoryHasAudio(sourceDir)) continue;
    const files = findAudioFiles(sourceDir).filter((file) => !isJunkPath(file));
    const voiceFiles = preferVoiceFiles(files);
    const candidates = {};
    for (const category of voiceCategories) {
      const picks = pickCategoryCandidates(voiceFiles, category);
      candidates[category] = picks.map((file, index) => copyReviewCandidate(character.id, category, file, index));
    }
    rows.push({
      character,
      sourceFolder,
      sourceDir,
      candidates
    });
  }
  writeReviewPage(rows);
  writeSeedSelections(rows);
  console.log(`Generated New Collection audio review for ${rows.length} characters.`);
  console.log(`Review page: ${path.join(reviewRoot, 'new-collection.html')}`);
  console.log(`Selections: ${selectionsPath}`);
}

function loadMissingPlayableCharacters() {
  return readdirSync(characterRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = path.join(characterRoot, entry.name, 'character.json');
      if (!existsSync(manifestPath)) return null;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.unplayable) return null;
      const hasVoice = voiceCategories.every((category) => Array.isArray(manifest.voice?.[category]) && manifest.voice[category].length > 0);
      if (hasVoice) return null;
      return {
        id: entry.name,
        displayName: manifest.displayName ?? entry.name,
        manifestPath
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function writeReviewPage(rows) {
  rmSync(reviewAssetRoot, { recursive: true, force: true });
  mkdirSync(reviewAssetRoot, { recursive: true });
  for (const row of rows) {
    for (const category of voiceCategories) {
      for (const [index, candidate] of row.candidates[category].entries()) {
        const source = candidate.sourcePath;
        const ext = path.extname(source).toLowerCase() || '.wav';
        const destinationDir = path.join(reviewAssetRoot, row.character.id);
        mkdirSync(destinationDir, { recursive: true });
        const destination = path.join(destinationDir, `${category}-candidate-${String(index + 1).padStart(2, '0')}${ext}`);
        copyFileSync(source, destination);
        candidate.path = `/audio-review/character-voices/new-collection-assets/${row.character.id}/${path.basename(destination)}`;
      }
    }
  }
  writeFileSync(path.join(reviewRoot, 'new-collection.html'), renderReviewHtml(rows));
}

function writeSeedSelections(rows) {
  if (existsSync(selectionsPath)) return;
  const selections = {};
  for (const row of rows) {
    selections[row.character.id] = {};
    for (const category of voiceCategories) {
      const clip = row.candidates[category]?.[0];
      if (!clip) continue;
      selections[row.character.id][category] = {
        category,
        selectedIndex: 0,
        reviewPath: clip.path,
        sourcePath: clip.sourcePath
      };
    }
  }
  writeFileSync(selectionsPath, `${JSON.stringify({ updatedAt: new Date().toISOString(), selections }, null, 2)}\n`);
}

function renderReviewHtml(rows) {
  const seedSelections = buildSeedSelections(rows);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KORE New Collection Voice Review</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111318; color: #f3f3f4; }
    body { margin: 0; background: #111318; }
    header { position: sticky; top: 0; z-index: 2; padding: 16px 22px; background: rgba(17, 19, 24, 0.94); border-bottom: 1px solid #2b2f38; backdrop-filter: blur(12px); }
    .header-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1 { margin: 0 0 6px; font-size: 22px; letter-spacing: 0; }
    header p { margin: 0; color: #b8bdc7; font-size: 13px; }
    .save-status { border: 1px solid #454c57; border-radius: 999px; padding: 6px 10px; color: #d8dce4; font-size: 12px; white-space: nowrap; }
    .save-status.is-saved { border-color: #5ea878; color: #9ce6b6; }
    .save-status.is-saving { border-color: #c9a24e; color: #ffd977; }
    .save-status.is-error { border-color: #a55d67; color: #ff9caa; }
    main { display: grid; gap: 12px; padding: 18px; }
    section { border: 1px solid #2d333d; border-radius: 8px; background: #181b22; overflow: hidden; }
    summary { cursor: pointer; padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    summary strong { font-size: 17px; }
    .badge { border: 1px solid #454c57; border-radius: 999px; padding: 2px 8px; color: #d8dce4; font-size: 12px; }
    .source { flex-basis: 100%; color: #99a1af; font-size: 12px; word-break: break-all; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; padding: 0 16px 16px; }
    article { border: 1px solid #2a303a; border-radius: 7px; padding: 10px; background: #12151b; }
    h2 { margin: 0 0 8px; font-size: 13px; color: #f5d36b; letter-spacing: 0; }
    .clip { display: grid; grid-template-columns: 54px minmax(0, 1fr); gap: 5px 10px; align-items: center; margin-top: 8px; border: 1px solid #242a33; border-radius: 7px; padding: 8px; }
    .clip.is-selected { border-color: #68d58e; background: #17231d; }
    .pick { grid-row: span 3; width: 46px; height: 46px; display: grid; place-items: center; border: 2px solid #5a626f; border-radius: 8px; background: #0f1218; cursor: pointer; }
    .pick input { width: 32px; height: 32px; accent-color: #68d58e; cursor: pointer; }
    .clip.is-selected .pick { border-color: #68d58e; box-shadow: 0 0 0 2px rgba(104, 213, 142, 0.16); }
    audio { width: 100%; height: 32px; }
    code { color: #aeb8c8; font-size: 11px; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div>
        <h1>KORE New Collection Voice Review</h1>
        <p>${rows.length} missing characters matched from New Collection. Check the big square for the clip you want. Picks autosave separately.</p>
      </div>
      <span id="save-status" class="save-status">Loading picks</span>
    </div>
  </header>
  <main>
    ${rows.map(renderReviewSection).join('\n')}
  </main>
  <script id="selection-seed" type="application/json">${safeScriptJson(seedSelections)}</script>
  <script>
    (() => {
      const storageKey = 'kore.characterVoiceNewCollectionSelections.v1';
      const saveUrl = 'http://127.0.0.1:5176/selections';
      const status = document.getElementById('save-status');
      const seed = JSON.parse(document.getElementById('selection-seed').textContent || '{}');
      let selections = loadSelections();
      let saveTimer = 0;

      function setStatus(text, kind) {
        status.textContent = text;
        status.className = 'save-status' + (kind ? ' is-' + kind : '');
      }

      function loadSelections() {
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
          if (stored && stored.selections) return stored.selections;
        } catch {}
        return seed.selections || {};
      }

      function selectedFor(input) {
        return selections[input.dataset.character]?.[input.dataset.category]?.reviewPath === input.dataset.reviewPath;
      }

      function refreshUi() {
        document.querySelectorAll('.clip-pick').forEach((input) => {
          input.checked = selectedFor(input);
          input.closest('.clip')?.classList.toggle('is-selected', input.checked);
        });
      }

      function saveNow() {
        const payload = { updatedAt: new Date().toISOString(), selections };
        localStorage.setItem(storageKey, JSON.stringify(payload));
        setStatus('Saving...', 'saving');
        fetch(saveUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then((response) => {
            if (!response.ok) throw new Error('save failed');
            setStatus('Autosaved', 'saved');
          })
          .catch(() => setStatus('Saved in browser only', 'error'));
      }

      function queueSave() {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveNow, 120);
      }

      document.querySelectorAll('.clip-pick').forEach((input) => {
        input.addEventListener('change', () => {
          if (!input.checked) {
            input.checked = true;
            return;
          }
          const character = input.dataset.character;
          const category = input.dataset.category;
          selections[character] = selections[character] || {};
          selections[character][category] = {
            category,
            selectedIndex: Number(input.dataset.index || 0),
            reviewPath: input.dataset.reviewPath,
            sourcePath: input.dataset.sourcePath
          };
          refreshUi();
          queueSave();
        });
      });

      fetch(saveUrl)
        .then((response) => response.ok ? response.json() : null)
        .then((saved) => {
          if (saved?.selections) selections = saved.selections;
          refreshUi();
          setStatus('Autosaved', 'saved');
        })
        .catch(() => {
          refreshUi();
          setStatus('Browser autosave ready', 'saved');
        });
    })();
  </script>
</body>
</html>
`;
}

function renderReviewSection(row) {
  return `<section>
  <details open>
    <summary>
      <strong>${escapeHtml(row.character.displayName)}</strong>
      <span class="badge">${escapeHtml(row.character.id)}</span>
      <span class="badge">New Collection</span>
      <span class="source">${escapeHtml(path.relative(audioRoot, row.sourceDir))}</span>
    </summary>
    <div class="grid">
      ${voiceCategories.map((category) => renderReviewCategory(row, category)).join('\n')}
    </div>
  </details>
</section>`;
}

function renderReviewCategory(row, category) {
  const clips = row.candidates[category] ?? [];
  return `<article>
  <h2>${categoryLabels[category]}</h2>
  ${clips.map((clip, index) => `<div class="clip${index === 0 ? ' is-selected' : ''}">
    <label class="pick" title="Use this ${escapeAttribute(categoryLabels[category])} clip">
      <input class="clip-pick" type="checkbox" ${index === 0 ? 'checked' : ''} data-character="${escapeAttribute(row.character.id)}" data-category="${escapeAttribute(category)}" data-index="${index}" data-review-path="${escapeAttribute(clip.path)}" data-source-path="${escapeAttribute(clip.sourcePath)}">
    </label>
    <audio controls preload="none" src="${escapeAttribute(clip.path)}"></audio>
    <code>${index === 0 ? 'Default' : 'Alt'}: ${escapeHtml(clip.path)}</code>
    <code>${escapeHtml(clip.sourcePath)}</code>
  </div>`).join('\n')}
</article>`;
}

function buildSeedSelections(rows) {
  const selections = {};
  for (const row of rows) {
    selections[row.character.id] = {};
    for (const category of voiceCategories) {
      const clip = row.candidates[category]?.[0];
      if (!clip) continue;
      selections[row.character.id][category] = {
        category,
        selectedIndex: 0,
        reviewPath: clip.path,
        sourcePath: clip.sourcePath
      };
    }
  }
  return { updatedAt: new Date().toISOString(), selections };
}

function copyReviewCandidate(characterId, category, sourceFile, index) {
  const ext = path.extname(sourceFile).toLowerCase() || '.wav';
  const destinationDir = path.join(reviewAssetRoot, characterId);
  mkdirSync(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, `${category}-candidate-${String(index + 1).padStart(2, '0')}${ext}`);
  copyFileSync(sourceFile, destination);
  return {
    path: `/audio-review/character-voices/new-collection-assets/${characterId}/${path.basename(destination)}`,
    sourcePath: sourceFile
  };
}

function pickCategoryCandidates(files, category) {
  const categorized = files.filter((file) => categoryScore(file, category) > 0)
    .sort((left, right) => categoryScore(right, category) - categoryScore(left, category) || naturalKey(left).localeCompare(naturalKey(right), undefined, { numeric: true }));
  const pool = categorized.length >= 6 ? categorized : files;
  const picks = [];
  for (const file of pool) {
    if (picks.length >= 12) break;
    if (!picks.includes(file)) picks.push(file);
  }
  const offsets = [0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.88, 0.96];
  for (const offset of offsets) {
    if (picks.length >= 12) break;
    const file = files[Math.min(files.length - 1, Math.max(0, Math.floor(files.length * offset)))];
    if (file && !picks.includes(file)) picks.push(file);
  }
  return picks;
}

function categoryScore(file, category) {
  const text = normalizeText(file);
  const base = normalizeText(path.basename(file));
  let score = 0;
  if (text.includes('voice')) score += 5;
  if (text.includes('sfx') || text.includes(' d se ')) score -= 10;
  if (category === 'hit') {
    if (base.includes('damage') || base.includes('dmg') || base.includes('hurt')) score += 80;
    if (base.includes('bt 02') || base.includes('bt 04')) score += 25;
    if (base.includes('bdb')) score += 15;
  }
  if (category === 'attackLand') {
    if (base.includes('attack') || base.includes('rensa') || base.includes('bt 07') || base.includes('bt 09')) score += 80;
    if (base.includes('bdb')) score += 25;
  }
  if (category === 'launcher') {
    if (base.includes('skill') || base.includes('special') || base.includes('bt 10') || base.includes('bt 13')) score += 85;
    if (base.includes('bdq')) score += 20;
  }
  if (category === 'tornado') {
    if (base.includes('finish') || base.includes('chance') || base.includes('quote') || base.includes('bt 14') || base.includes('bt 20')) score += 85;
    if (base.includes('bdq')) score += 25;
  }
  if (category === 'win') {
    if (base.includes('finish') || base.includes('questclear') || base.includes('zenkeshi') || base.includes('quote') || base.includes('bt 33') || base.includes('bt 34')) score += 90;
    if (base.includes('defeat') || base.includes('lose')) score -= 60;
    if (base.includes('bdq')) score += 35;
  }
  return score;
}

function preferVoiceFiles(files) {
  const voiceFiles = files.filter((file) => {
    const text = normalizeText(file);
    return text.includes('voice') || text.includes('bdq') || text.includes('bdb') || text.includes('cab') || text.includes('rensa') || text.includes('damage') || text.includes('attack') || text.includes('quote');
  });
  return sortAudioFiles(voiceFiles.length > 0 ? voiceFiles : files);
}

function findAudioFiles(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (isJunkPath(fullPath)) continue;
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && audioExtensions.has(path.extname(fullPath).toLowerCase())) results.push(fullPath);
    }
  }
  return results;
}

function directoryHasAudio(dir) {
  if (!existsSync(dir)) return false;
  try {
    return statSync(dir).isDirectory() && findAudioFiles(dir).length > 0;
  } catch {
    return false;
  }
}

function sortAudioFiles(files) {
  return [...files].sort((left, right) => naturalKey(left).localeCompare(naturalKey(right), undefined, { numeric: true }));
}

function naturalKey(file) {
  return normalizeText(path.relative(audioRoot, file));
}

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_#'’().:[\],-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isJunkPath(file) {
  const parts = file.split(path.sep);
  return parts.some((part) => part === '__MACOSX' || part === '.DS_Store' || part.startsWith('._'));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

main();
