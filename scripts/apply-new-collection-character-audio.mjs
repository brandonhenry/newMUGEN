import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const characterRoot = path.join(repoRoot, 'public', 'characters');
const selectionsPath = path.join(repoRoot, 'public', 'audio-review', 'character-voices', 'new-collection-selections.json');
const audioExtensions = new Set(['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm']);
const voiceCategories = ['hit', 'attackLand', 'launcher', 'tornado', 'win'];
const finalNames = {
  hit: 'hit-01',
  attackLand: 'attack-land-01',
  launcher: 'launcher-01',
  tornado: 'tornado-01',
  win: 'win-01'
};

function main() {
  if (!existsSync(selectionsPath)) throw new Error(`New Collection selections do not exist: ${selectionsPath}`);
  const selections = JSON.parse(readFileSync(selectionsPath, 'utf8'))?.selections ?? {};
  let appliedCharacters = 0;
  let appliedClips = 0;

  for (const [characterId, categorySelections] of Object.entries(selections)) {
    const manifestPath = path.join(characterRoot, characterId, 'character.json');
    if (!existsSync(manifestPath)) {
      console.warn(`Skipping ${characterId}: no manifest`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.unplayable) {
      console.warn(`Skipping ${characterId}: unplayable`);
      continue;
    }

    const voice = { ...(manifest.voice ?? {}) };
    let characterClipCount = 0;
    for (const category of voiceCategories) {
      const sourcePath = categorySelections?.[category]?.sourcePath;
      if (typeof sourcePath !== 'string' || !existsSync(sourcePath)) {
        console.warn(`Skipping ${characterId}.${category}: missing source ${sourcePath ?? '(none)'}`);
        continue;
      }
      const finalPath = copyFinalClip(characterId, category, sourcePath);
      if (!finalPath) continue;
      voice[category] = [finalPath];
      appliedClips += 1;
      characterClipCount += 1;
    }
    if (voice.win?.length) voice.stageIntro = voice.win;
    if (characterClipCount > 0) {
      const current = readFileSync(manifestPath, 'utf8');
      writeFileSync(manifestPath, updateTopLevelJsonProperty(current, 'voice', voice));
      appliedCharacters += 1;
    }
  }

  console.log(`Applied New Collection voice selections for ${appliedCharacters} characters.`);
  console.log(`Copied ${appliedClips} selected clips.`);
}

function copyFinalClip(characterId, category, sourceFile) {
  const baseName = finalNames[category];
  if (!baseName) return null;
  const ext = path.extname(sourceFile).toLowerCase() || '.wav';
  const destinationDir = path.join(characterRoot, characterId, 'sounds', 'voices');
  mkdirSync(destinationDir, { recursive: true });
  for (const oldExt of audioExtensions) {
    rmSync(path.join(destinationDir, `${baseName}${oldExt}`), { force: true });
  }
  const destination = path.join(destinationDir, `${baseName}${ext}`);
  copyFileSync(sourceFile, destination);
  return `/characters/${characterId}/sounds/voices/${path.basename(destination)}`;
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
        const end = findStringEnd(text, index);
        const key = JSON.parse(text.slice(index, end + 1));
        if (key === property) {
          const propertyStart = findPropertyStart(text, index);
          const propertyEnd = findPropertyEnd(text, end + 1);
          return { start: propertyStart, end: propertyEnd };
        }
        index = end;
      } else {
        inString = true;
      }
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
  }
  return null;
}

function findStringEnd(text, start) {
  let escape = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escape) escape = false;
    else if (char === '\\') escape = true;
    else if (char === '"') return index;
  }
  throw new Error('Unterminated JSON string');
}

function findPropertyStart(text, keyStart) {
  let index = keyStart;
  while (index > 0 && /\s/.test(text[index - 1])) index -= 1;
  if (text[index - 1] === ',') {
    index -= 1;
    while (index > 0 && /[ \t]/.test(text[index - 1])) index -= 1;
  }
  return index;
}

function findPropertyEnd(text, afterKey) {
  let index = afterKey;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  if (text[index] !== ':') throw new Error('Malformed JSON property');
  index += 1;
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
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      if (depth === 0) break;
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      return index + 1;
    }
  }
  return index;
}

function findTopLevelObjectClose(text) {
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
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('Could not find top-level object close');
}

main();
