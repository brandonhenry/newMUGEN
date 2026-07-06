import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioRoot = path.resolve(process.env.KORE_AUDIO_ROOT ?? '/Users/brandonhenry/Documents/Kore/Audio');
const characterRoot = path.join(repoRoot, 'public', 'characters');
const reviewRoot = path.join(repoRoot, 'public', 'audio-review', 'character-voices');
const reviewAssetRoot = path.join(reviewRoot, 'assets');
const selectionsPath = path.join(reviewRoot, 'selections.json');
const audioExtensions = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm']);
const voiceCategories = ['hit', 'attackLand', 'launcher', 'tornado', 'win'];
const finalNames = {
  hit: 'hit-01',
  attackLand: 'attack-land-01',
  launcher: 'launcher-01',
  tornado: 'tornado-01',
  win: 'win-01'
};
const categoryLabels = {
  hit: 'Hit',
  attackLand: 'Attack land',
  launcher: 'Launcher',
  tornado: 'Tornado',
  win: 'Win'
};
const reviewedHitFileNumberTargets = [23, 40, 55, 63, 67, 77, 82, 105, 130, 153, 159, 189];
const manualCandidateSlots = {
  hiei: {
    hit: {
      12: '/Users/brandonhenry/Documents/Kore/Audio/Collection/sound-resource-assets-part-008/_ _ _Characters (Yu Yu Hakusho)_/Hiei/PC _ Computer - Jump Force - Characters (Yu Yu Hakusho) - Hiei/Hiei_ActVoice/Hiei_ActVoice#159.wav'
    }
  },
  'kakashi-hatake': {
    hit: {
      12: '/Users/brandonhenry/Documents/Kore/Audio/Collection/sound-resource-assets-part-005/_ _ _Characters (Naruto)_/Kakashi Hatake/PC _ Computer - Jump Force - Characters (Naruto) - Kakashi Hatake/Kakashi_ActVoice/Kakashi_ActVoice#189.wav'
    }
  },
  'kenshin-himura': {
    hit: {
      12: '/Users/brandonhenry/Documents/Kore/Audio/Jump Force/sound-resource-assets-part-007/_ _ _Characters (Rurouni Kenshin)_/Himura Kenshin/PC _ Computer - Jump Force - Characters (Rurouni Kenshin) - Himura Kenshin/Kenshin_ActVoice/Kenshin_ActVoice#153.wav'
    }
  },
  nami: {
    hit: {
      12: '/Users/brandonhenry/Documents/Kore/Audio/Collection/sound-resource-assets-part-002 (1)/_ _ _Character Voices (One Piece)_/Nami/GameCube - Battle Stadium D.O.N - Character Voices (One Piece) - Nami/Nami/char_nami_27.wav'
    }
  },
  'nami-perfect-clima-tact': {
    hit: {
      12: '/Users/brandonhenry/Documents/Kore/Audio/Collection/sound-resource-assets-part-002 (1)/_ _ _Character Voices (One Piece)_/Nami/GameCube - Battle Stadium D.O.N - Character Voices (One Piece) - Nami/Nami/char_nami_27.wav'
    }
  }
};

const characterAliases = {
  kiro: ['Naruto Uzumaki', 'Naruto'],
  'naruto-uzumaki-nine-tails-kyubi': ['Naruto Uzumaki', 'Naruto'],
  riven: ['Sasuke Uchiha', 'Sasuke'],
  'kakashi-hatake': ['Kakashi Hatake', 'Kakashi'],
  'sakura-haruno': ['Sakura Haruno', 'Sakura'],
  goku: ['Son Goku', 'Goku'],
  'goku-super-saiyan': ['Son Goku', 'Goku'],
  'gohan-super-saiyan': ['Gohan'],
  'gohan-super-saiyan-2': ['Gohan'],
  vegeta: ['Vegeta'],
  'vegeta-super-saiyan': ['Vegeta'],
  piccolo: ['Piccolo'],
  frieza: ['Frieza'],
  'majin-buu': ['Majin Buu', 'Buu'],
  'monkey-d-luffy': ['Monkey D. Luffy', 'Luffy'],
  'monkey-d-luffy-2nd-gear': ['Monkey D. Luffy', 'Luffy'],
  'roronoa-zoro': ['Roronoa Zoro', 'Zoro'],
  'sanji-vinsmoke': ['Sanji'],
  'kenshin-himura': ['Himura Kenshin', 'Kenshin Himura'],
  'dragon-shiryu': ['Dragon Shiryu'],
  'pegasus-seiya': ['Pegasus Seiya'],
  nami: ['Nami'],
  'nami-perfect-clima-tact': ['Nami'],
  'gon-freecss': ['Gon Freecss'],
  'killua-zoldyck': ['Killua Zoldyck', 'Killua'],
  hiei: ['Hiei'],
  'yusuke-urameshi': ['Yusuke Urameshi', 'Yusuke'],
  dio: ['DIO'],
  'jotaro-kujo': ['Jotaro Kujo'],
  'rukia-kuchiki': ['Rukia Kuchiki'],
  'toshiro-hitsugaya': ['Toshiro Hitsugaya', 'Hitsugaya'],
  kenshiro: ['Kenshiro'],
  'seto-kaiba': ['Seto Kaiba'],
  'yugi-mutou': ['Yami Yugi', 'Yugi']
};

function main() {
  if (!existsSync(audioRoot)) {
    throw new Error(`Audio root does not exist: ${audioRoot}`);
  }
  mkdirSync(reviewAssetRoot, { recursive: true });
  extractArchivesRecursively(audioRoot);
  const characters = loadCharacters();
  const sources = buildAudioSources(audioRoot);
  if (sources.length === 0) throw new Error(`No audio files found under ${audioRoot}`);
  const existingSelections = loadSavedSelections();

  const sourceMatchesByCharacter = new Map();
  for (const character of characters) {
    sourceMatchesByCharacter.set(character.id, findBestSources(character, sources));
  }

  const reviewRows = [];
  let skippedFallbacks = 0;
  let skippedUnplayable = 0;
  for (const character of characters) {
    if (character.manifest.unplayable) {
      removeCharacterVoice(character);
      removeGeneratedVoiceClips(character.id);
      skippedUnplayable += 1;
      continue;
    }
    const selection = selectCharacterAudio(character, sources, sourceMatchesByCharacter, existingSelections);
    if (shouldIncludeSelection(selection, existingSelections)) {
      writeCharacterVoice(character, selection);
      reviewRows.push(selection);
    } else {
      removeCharacterVoice(character);
      removeGeneratedVoiceClips(character.id);
      skippedFallbacks += 1;
    }
  }
  writeReviewPage(reviewRows);
  pruneSavedSelections(reviewRows);
  console.log(`Imported character audio for ${reviewRows.length} characters.`);
  if (skippedUnplayable > 0) console.log(`Skipped ${skippedUnplayable} unplayable characters.`);
  if (skippedFallbacks > 0) console.log(`Skipped ${skippedFallbacks} fallback-only characters with no reviewed pick.`);
  console.log(`Review page: ${path.join(reviewRoot, 'index.html')}`);
}

function extractArchivesRecursively(root) {
  const seen = new Set();
  for (let pass = 0; pass < 4; pass += 1) {
    const archives = findFiles(root, (file) => file.toLowerCase().endsWith('.zip'));
    let extractedThisPass = 0;
    for (const archive of archives) {
      if (seen.has(archive)) continue;
      seen.add(archive);
      const destination = path.join(path.dirname(archive), stripExtension(path.basename(archive)));
      if (directoryHasUsefulFiles(destination)) continue;
      rmSync(destination, { recursive: true, force: true });
      mkdirSync(destination, { recursive: true });
      try {
        execFileSync('unzip', ['-q', '-n', archive, '-d', destination], { stdio: 'ignore' });
        extractedThisPass += 1;
      } catch (error) {
        const tarExtracted = tryBsdtarExtract(archive, destination);
        if (!tarExtracted) console.warn(`Could not unzip ${archive}: ${error.message}`);
        if (directoryHasUsefulFiles(destination)) extractedThisPass += 1;
      }
    }
    if (extractedThisPass === 0) return;
  }
}

function tryBsdtarExtract(archive, destination) {
  try {
    execFileSync('bsdtar', ['-xf', archive, '-C', destination], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function loadCharacters() {
  return readdirSync(characterRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const manifestPath = path.join(characterRoot, entry.name, 'character.json');
      if (!existsSync(manifestPath)) return null;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return {
        id: entry.name,
        displayName: manifest.displayName ?? entry.name,
        manifest,
        manifestPath
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function buildAudioSources(root) {
  const extractedArchiveDirs = findFiles(root, (file) => file.toLowerCase().endsWith('.zip'))
    .map((archive) => path.join(path.dirname(archive), stripExtension(path.basename(archive))))
    .filter(directoryHasUsefulFiles);
  const looseAudioDirs = collectLooseAudioDirs(root);
  const uniqueDirs = [...new Set([...extractedArchiveDirs, ...looseAudioDirs])];
  return uniqueDirs
    .map((dir) => {
      const files = findFiles(dir, (file) => audioExtensions.has(path.extname(file).toLowerCase()))
        .filter((file) => !isJunkPath(file));
      if (files.length === 0) return null;
      const source = { dir, label: makeSourceLabel(dir), normalized: normalizeText(dir), files: sortAudioFiles(files) };
      return isCharacterAudioSource(source) ? source : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function collectLooseAudioDirs(root) {
  const dirs = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const files = findFiles(dir, (file) => audioExtensions.has(path.extname(file).toLowerCase())).filter((file) => !isJunkPath(file));
    if (files.length > 0 && files.length < 800) dirs.push(dir);
  }
  return dirs;
}

function isCharacterAudioSource(source) {
  const normalized = source.normalized;
  if (normalized.includes('miscellaneous') && !normalized.includes('character voices')) return false;
  if (normalized.includes('stage') || normalized.includes('menu') || normalized.includes('narrator') || normalized.includes('slot machine')) return false;
  if (normalized.includes('battle sound effects') || normalized.includes('s1ps3sfx')) return false;
  if (normalized.includes('character voices') || normalized.includes('characters')) return true;
  return source.files.some((file) => {
    const text = normalizeText(file);
    return text.includes('actvoice') || text.includes('character voices') || /char[_ -]/i.test(path.basename(file));
  });
}

function findBestSources(character, sources) {
  const aliases = getAliases(character);
  return sources
    .map((source) => ({ source, score: scoreSource(source, aliases) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.source.files.length - right.source.files.length)
    .map((entry) => entry.source);
}

function selectCharacterAudio(character, sources, sourceMatchesByCharacter, existingSelections) {
  const exactSources = sourceMatchesByCharacter.get(character.id) ?? [];
  const fallbackSources = pickFallbackSources(character, sources, sourceMatchesByCharacter);
  const selectedSource = exactSources[0] ?? fallbackSources[0] ?? sources[0];
  const confidence = exactSources[0] ? 'exact' : 'fallback';
  const candidateFiles = preferVoiceFiles(selectedSource.files);
  const candidates = {};
  const finalVoice = {};
  for (const category of voiceCategories) {
    const savedCategorySelection = existingSelections?.[character.id]?.[category];
    const picks = applyReviewedHitSlot(
      category,
      savedCategorySelection,
      applyManualCandidateSlots(character.id, category, pickCategoryCandidates(candidateFiles, category))
    );
    const finalSourceFile = getSavedCategorySourceFile(savedCategorySelection) ?? picks[0];
    const publicCandidates = picks.map((file, index) => copyReviewCandidate(character.id, category, file, index));
    const finalPath = copyFinalClip(character.id, category, finalSourceFile);
    finalVoice[category] = finalPath ? [finalPath] : [];
    candidates[category] = publicCandidates.map((candidate, index) => ({
      ...candidate,
      finalPath: candidate.sourcePath === finalSourceFile ? finalPath : null
    }));
  }
  finalVoice.stageIntro = finalVoice.win;
  const existingShadowClone = `/characters/${character.id}/sounds/voices/S2.wav`;
  if (character.id === 'kiro' && existsSync(path.join(characterRoot, character.id, 'sounds', 'voices', 'S2.wav'))) {
    finalVoice.shadowClone = [existingShadowClone];
  }
  return {
    character,
    source: selectedSource,
    confidence,
    finalVoice,
    candidates
  };
}

function writeCharacterVoice(character, selection) {
  const voice = {};
  for (const key of [...voiceCategories, 'stageIntro', 'shadowClone']) {
    const clips = selection.finalVoice[key] ?? [];
    if (clips.length > 0) voice[key] = clips;
  }
  const current = readFileSync(character.manifestPath, 'utf8');
  writeFileSync(character.manifestPath, updateTopLevelJsonProperty(current, 'voice', voice));
}

function removeCharacterVoice(character) {
  const current = readFileSync(character.manifestPath, 'utf8');
  const next = removeTopLevelJsonProperty(current, 'voice').replace(/\s*$/, '\n');
  if (next !== current) writeFileSync(character.manifestPath, next);
}

function removeGeneratedVoiceClips(characterId) {
  const destinationDir = path.join(characterRoot, characterId, 'sounds', 'voices');
  for (const baseName of Object.values(finalNames)) {
    for (const ext of audioExtensions) {
      rmSync(path.join(destinationDir, `${baseName}${ext}`), { force: true });
    }
  }
}

function shouldIncludeSelection(selection, existingSelections) {
  if (selection.confidence !== 'fallback') return true;
  return hasReviewedFallbackSelection(existingSelections?.[selection.character.id]);
}

function hasReviewedFallbackSelection(savedSelection) {
  if (!savedSelection || typeof savedSelection !== 'object') return false;
  return voiceCategories.some((category) => Number(savedSelection[category]?.selectedIndex ?? 0) > 0);
}

function loadSavedSelections() {
  if (!existsSync(selectionsPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(selectionsPath, 'utf8'));
    return parsed?.selections && typeof parsed.selections === 'object' ? parsed.selections : {};
  } catch {
    return {};
  }
}

function pruneSavedSelections(rows) {
  if (!existsSync(selectionsPath)) return;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(selectionsPath, 'utf8'));
  } catch {
    return;
  }
  if (!parsed?.selections || typeof parsed.selections !== 'object') return;
  const includedIds = new Set(rows.map((row) => row.character.id));
  const nextSelections = {};
  for (const id of includedIds) {
    if (parsed.selections[id]) nextSelections[id] = parsed.selections[id];
  }
  writeFileSync(selectionsPath, `${JSON.stringify({ ...parsed, selections: nextSelections }, null, 2)}\n`);
}

function copyFinalClip(characterId, category, sourceFile) {
  if (!sourceFile) return null;
  const ext = path.extname(sourceFile).toLowerCase() || '.wav';
  const destinationDir = path.join(characterRoot, characterId, 'sounds', 'voices');
  mkdirSync(destinationDir, { recursive: true });
  removeFinalClip(characterId, category);
  const destination = path.join(destinationDir, `${finalNames[category]}${ext}`);
  copyFileSync(sourceFile, destination);
  return `/characters/${characterId}/sounds/voices/${path.basename(destination)}`;
}

function removeFinalClip(characterId, category) {
  const destinationDir = path.join(characterRoot, characterId, 'sounds', 'voices');
  const baseName = finalNames[category];
  if (!baseName) return;
  for (const ext of audioExtensions) {
    rmSync(path.join(destinationDir, `${baseName}${ext}`), { force: true });
  }
}

function copyReviewCandidate(characterId, category, sourceFile, index) {
  const ext = path.extname(sourceFile).toLowerCase() || '.wav';
  const destinationDir = path.join(reviewAssetRoot, characterId);
  mkdirSync(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, `${category}-candidate-${String(index + 1).padStart(2, '0')}${ext}`);
  copyFileSync(sourceFile, destination);
  return {
    path: `/audio-review/character-voices/assets/${characterId}/${path.basename(destination)}`,
    sourcePath: sourceFile
  };
}

function pickCategoryCandidates(files, category) {
  if (files.length === 0) return [];
  if (category === 'hit') return pickHitCandidates(files);
  const offsets = {
    attackLand: [0.22, 0.28, 0.34, 0.4, 0.46, 0.52, 0.18, 0.26, 0.32, 0.38, 0.44, 0.5],
    launcher: [0.42, 0.48, 0.54, 0.6, 0.66, 0.72, 0.36, 0.44, 0.5, 0.56, 0.62, 0.68],
    tornado: [0.62, 0.68, 0.74, 0.8, 0.86, 0.92, 0.56, 0.64, 0.7, 0.76, 0.82, 0.88],
    win: [0.84, 0.9, 0.94, 0.72, 0.58, 0.44, 0.78, 0.86, 0.92, 0.96, 0.66, 0.52]
  }[category];
  const picks = [];
  for (const offset of offsets) {
    const file = files[Math.min(files.length - 1, Math.max(0, Math.floor(files.length * offset)))];
    if (file && !picks.includes(file)) picks.push(file);
  }
  if (picks.length === 1 && files.length > 1) {
    picks.push(files[(files.indexOf(picks[0]) + 1) % files.length]);
  }
  return picks;
}

function pickHitCandidates(files) {
  const numberedFiles = files
    .map((file) => ({ file, number: getAudioFileNumber(file) }))
    .filter((entry) => Number.isFinite(entry.number));
  if (numberedFiles.length > 0) {
    const picks = [];
    for (const target of reviewedHitFileNumberTargets) {
      const closest = findClosestNumberedFile(numberedFiles, target);
      if (closest && !picks.includes(closest)) picks.push(closest);
    }
    if (picks.length >= Math.min(4, files.length)) return picks;
  }

  const offsets = [0.2, 0.28, 0.34, 0.4, 0.46, 0.52, 0.6, 0.68, 0.76, 0.84, 0.9, 0.96];
  const picks = [];
  for (const offset of offsets) {
    const file = files[Math.min(files.length - 1, Math.max(0, Math.floor(files.length * offset)))];
    if (file && !picks.includes(file)) picks.push(file);
  }
  if (picks.length === 1 && files.length > 1) {
    picks.push(files[(files.indexOf(picks[0]) + 1) % files.length]);
  }
  return picks;
}

function findClosestNumberedFile(numberedFiles, target) {
  let best = null;
  for (const entry of numberedFiles) {
    const distance = Math.abs(entry.number - target);
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && entry.number > best.number)
    ) {
      best = { ...entry, distance };
    }
  }
  return best?.file ?? null;
}

function applyManualCandidateSlots(characterId, category, picks) {
  const overrides = manualCandidateSlots[characterId]?.[category];
  if (!overrides) return picks;
  const next = [...picks];
  for (const [slot, file] of Object.entries(overrides)) {
    if (!existsSync(file)) continue;
    const index = Math.max(0, Number(slot) - 1);
    next[index] = file;
  }
  return next.filter(Boolean);
}

function applyReviewedHitSlot(category, savedSelection, picks) {
  if (category !== 'hit') return picks;
  const index = Number(savedSelection?.selectedIndex ?? 0);
  const sourcePath = savedSelection?.sourcePath;
  if (!Number.isInteger(index) || index <= 0 || !sourcePath || !existsSync(sourcePath)) return picks;
  const next = [...picks];
  next[index] = sourcePath;
  return next.filter(Boolean);
}

function getSavedCategorySourceFile(savedSelection) {
  const sourcePath = savedSelection?.sourcePath;
  return typeof sourcePath === 'string' && existsSync(sourcePath) ? sourcePath : null;
}

function preferVoiceFiles(files) {
  const voiceFiles = files.filter((file) => {
    const normalized = normalizeText(file);
    return normalized.includes('voice') || normalized.includes('actvoice') || normalized.includes('character voices') || /char[_ -]/i.test(path.basename(file));
  });
  return sortAudioFiles(voiceFiles.length > 0 ? voiceFiles : files);
}

function getAliases(character) {
  const baseAliases = characterAliases[character.id] ?? [character.displayName, character.id.replace(/-/g, ' ')];
  return [...new Set(baseAliases.map((alias) => normalizeText(alias)).filter(Boolean))];
}

function pickFallbackSources(character, sources, sourceMatchesByCharacter) {
  const exactPool = [...sourceMatchesByCharacter.values()].flat().filter(Boolean);
  const pool = exactPool.length > 0 ? [...new Set(exactPool)] : sources;
  const index = stableHash(character.id) % pool.length;
  return [pool[index], ...pool.slice(0, 4)].filter(Boolean);
}

function scoreSource(source, aliases) {
  let score = 0;
  for (const alias of aliases) {
    if (!alias) continue;
    const tokens = alias.split(' ').filter(Boolean);
    const allTokens = tokens.length > 0 && tokens.every((token) => source.normalized.includes(token));
    if (source.normalized.includes(alias)) score = Math.max(score, 100 + alias.length);
    else if (allTokens && tokens.length > 1) score = Math.max(score, 60 + tokens.join('').length);
    else if (tokens.length === 1 && hasWord(source.normalized, tokens[0])) score = Math.max(score, 35 + tokens[0].length);
  }
  if (score > 0 && source.normalized.includes('jump force')) score += 8;
  if (score > 0 && source.normalized.includes('character voices')) score += 5;
  if (score > 0 && source.normalized.includes('miscellaneous')) score -= 25;
  return score;
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
        candidate.path = `/audio-review/character-voices/assets/${row.character.id}/${path.basename(destination)}`;
      }
    }
  }
  writeFileSync(path.join(reviewRoot, 'index.html'), renderReviewHtml(rows));
}

function renderReviewHtml(rows) {
  const seedSelections = buildSeedSelections(rows);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KORE Character Voice Review</title>
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
    .exact { border-color: #5ea878; color: #9ce6b6; }
    .family { border-color: #c9a24e; color: #ffd977; }
    .fallback { border-color: #a55d67; color: #ff9caa; }
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
    .final { color: #9ce6b6; }
  </style>
</head>
<body>
  <header>
    <div class="header-row">
      <div>
        <h1>KORE Character Voice Review</h1>
        <p>${rows.length} characters. Check the big square for the clip you want. Picks autosave instantly.</p>
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
      const storageKey = 'kore.characterVoiceSelections.v1';
      const saveUrl = 'http://127.0.0.1:5174/selections';
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
            sourcePath: input.dataset.sourcePath,
            finalPath: input.dataset.finalPath
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
      <span class="badge ${row.confidence}">${row.confidence}</span>
      <span class="source">${escapeHtml(row.source.label)}</span>
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
      <input class="clip-pick" type="checkbox" ${index === 0 ? 'checked' : ''} data-character="${escapeAttribute(row.character.id)}" data-category="${escapeAttribute(category)}" data-index="${index}" data-review-path="${escapeAttribute(clip.path)}" data-source-path="${escapeAttribute(clip.sourcePath)}" data-final-path="${escapeAttribute(clip.finalPath ?? row.finalVoice[category]?.[0] ?? '')}">
    </label>
    <audio controls preload="none" src="${escapeAttribute(clip.path)}"></audio>
    <code class="${index === 0 ? 'final' : ''}">${index === 0 ? `Final: ${escapeHtml(clip.finalPath ?? clip.path)}` : `Alt: ${escapeHtml(clip.path)}`}</code>
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
        sourcePath: clip.sourcePath,
        finalPath: clip.finalPath ?? row.finalVoice[category]?.[0] ?? null
      };
    }
  }
  return { updatedAt: new Date().toISOString(), selections };
}

function findFiles(dir, predicate) {
  if (!existsSync(dir)) return [];
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
      else if (entry.isFile() && predicate(fullPath)) results.push(fullPath);
    }
  }
  return results;
}

function directoryHasUsefulFiles(dir) {
  if (!existsSync(dir)) return false;
  try {
    return statSync(dir).isDirectory() && findFiles(dir, (file) => !isJunkPath(file)).length > 0;
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

function getAudioFileNumber(file) {
  const basename = path.basename(file);
  const hashNumber = basename.match(/#(\d+)(?=\.[^.]+$)/);
  if (hashNumber) return Number(hashNumber[1]);
  const trailingNumber = basename.match(/(?:^|[_ -])(\d+)(?=\.[^.]+$)/);
  if (trailingNumber) return Number(trailingNumber[1]);
  return null;
}

function makeSourceLabel(dir) {
  return path.relative(audioRoot, dir) || path.basename(dir);
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, '');
}

function normalizeText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_#'’().:[\]-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasWord(haystack, word) {
  return new RegExp(`(?:^| )${escapeRegExp(word)}(?: |$)`).test(haystack);
}

function stableHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateTopLevelJsonProperty(text, property, value) {
  const withoutExisting = removeTopLevelJsonProperty(text, property).replace(/\s*$/, '\n');
  const insertAt = findTopLevelObjectClose(withoutExisting);
  const beforeClose = withoutExisting.slice(0, insertAt).replace(/\s*$/, '');
  const afterClose = withoutExisting.slice(insertAt);
  const needsComma = beforeClose.trim().length > 1 && !beforeClose.trimEnd().endsWith('{');
  const valueText = JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');
  return `${beforeClose}${needsComma ? ',' : ''}\n  "${property}": ${valueText}\n${afterClose.replace(/^\s*/, '')}`;
}

function removeTopLevelJsonProperty(text, property) {
  const range = findTopLevelJsonPropertyRange(text, property);
  if (!range) return text;
  return `${text.slice(0, range.start)}${text.slice(range.end)}`;
}

function findTopLevelJsonPropertyRange(text, property) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      if (depth === 1) {
        const parsed = parseJsonStringAt(text, index);
        if (parsed?.value === property) return propertyRemovalRange(text, index, parsed.end);
      }
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
  }
  return null;
}

function propertyRemovalRange(text, keyStart, keyEnd) {
  let colon = keyEnd;
  while (colon < text.length && /\s/.test(text[colon])) colon += 1;
  if (text[colon] !== ':') return null;
  let index = colon + 1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      if (depth === 0) break;
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      index += 1;
      while (index < text.length && /[ \t]/.test(text[index])) index += 1;
      if (text[index] === '\n') index += 1;
      return { start: lineStartBefore(text, keyStart), end: index };
    }
  }
  const previousComma = findPreviousTopLevelComma(text, keyStart);
  if (previousComma >= 0) {
    let start = previousComma;
    if (text[start - 1] === '\n') start -= 1;
    return { start, end: index };
  }
  return { start: lineStartBefore(text, keyStart), end: index };
}

function findPreviousTopLevelComma(text, before) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = before - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '}' || char === ']') depth += 1;
    else if (char === '{' || char === '[') {
      if (depth === 0) return -1;
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      return index;
    }
  }
  return -1;
}

function lineStartBefore(text, index) {
  const start = text.lastIndexOf('\n', index);
  return start < 0 ? 0 : start + 1;
}

function findTopLevelObjectClose(text) {
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastClose = text.length - 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) lastClose = index;
    }
  }
  return lastClose;
}

function parseJsonStringAt(text, start) {
  let value = '';
  let escape = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escape) {
      value += char;
      escape = false;
    } else if (char === '\\') {
      escape = true;
    } else if (char === '"') {
      return { value, end: index + 1 };
    } else {
      value += char;
    }
  }
  return null;
}

main();
