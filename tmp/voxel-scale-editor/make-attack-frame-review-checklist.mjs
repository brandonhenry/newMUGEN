import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const outRoot = path.join(repoRoot, 'tmp/voxel-scale-editor/family-ghost-sheets');
const outFile = path.join(outRoot, 'attack-frame-review-checklist.md');

const nonAttackKeys = new Set([
  'idle',
  'crouch',
  'block',
  'crouchBlock',
  'walkForward',
  'walkBack',
  'sprint',
  'sidestepLeft',
  'sidestepRight',
  'chargeKi',
  'jump',
  'backflip',
  'juggle',
  'knockdown',
  'getupStand',
  'getupRollUp',
  'getupRollDown',
  'getupRollBack',
  'lose',
  'hitLight',
  'hitHeavy',
  'win'
]);

function frameIndexFromPath(framePath) {
  const match = /frame-(\d+)\.png$/i.exec(framePath);
  return match ? Number(match[1]) : NaN;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function collectRows() {
  const entries = await fs.readdir(charactersRoot, { withFileTypes: true });
  const characters = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const manifestPath = path.join(charactersRoot, id, 'character.json');
    if (!fsSync.existsSync(manifestPath)) continue;
    const character = await readJson(manifestPath);
    if (character.unplayable || id === 'near' || !character.animationFrames?.idle?.length) continue;
    characters.push({
      id,
      displayName: character.displayName ?? id,
      character
    });
  }
  characters.sort((a, b) => a.displayName.localeCompare(b.displayName));

  const rows = [];
  for (const entry of characters) {
    const attackKeys = Object.keys(entry.character.animationFrames ?? {})
      .filter((key) => entry.character.animationFrames?.[key]?.length && !nonAttackKeys.has(key))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const key of attackKeys) {
      const frames = entry.character.animationFrames[key].map(frameIndexFromPath);
      rows.push({ entry, key, frames });
    }
  }
  return rows;
}

const rows = await collectRows();
const rowsPerPage = 22;
const lines = [];
lines.push('# Attack Frame Visual Review Checklist');
lines.push('');
lines.push('Status legend: `[ ]` pending visual review, `[x]` confirmed or fixed, `[protected]` base reference character reviewed but not edited.');
lines.push('');
for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i];
  const page = Math.floor(i / rowsPerPage) + 1;
  const protectedBase = row.entry.id === 'kiro' || row.entry.id === 'riven';
  const status = protectedBase ? '[protected]' : '[ ]';
  lines.push(`- ${status} page ${String(page).padStart(2, '0')} | ${row.entry.displayName} | ${row.entry.id} | ${row.key} | frames: ${row.frames.map((frame) => String(frame).padStart(3, '0')).join(', ')}`);
}
lines.push('');
lines.push(`Total rows: ${rows.length}`);
lines.push(`Total frame references: ${rows.reduce((sum, row) => sum + row.frames.length, 0)}`);

await fs.mkdir(outRoot, { recursive: true });
await fs.writeFile(outFile, `${lines.join('\n')}\n`);
console.log(outFile);
