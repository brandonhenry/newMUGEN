import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const characterId = 'nami-perfect-clima-tact';
const manifestPath = path.join(repoRoot, 'public/characters', characterId, 'character.json');
const logPath = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/nami-attack-fan-hand-tune.json');

const tunedScales = {
  73: 0.98,
  74: 1.0,
  75: 1.0,
  76: 1.0,
  77: 1.0,
  78: 1.02,
  79: 1.02,
  80: 1.0,
  81: 0.98
};

const keys = ['jableft', 'cmd:1+3'];

const character = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const changes = [];
character.animationFrameScales ??= {};

for (const key of keys) {
  character.animationFrameScales[key] ??= {};
  for (const [frame, scale] of Object.entries(tunedScales)) {
    if (!character.animationFrames?.[key]?.some((framePath) => framePath.includes(`frame-${String(frame).padStart(3, '0')}.png`))) {
      continue;
    }
    const before = character.animationFrameScales[key][frame] ?? character.animationScales?.[key] ?? {};
    character.animationFrameScales[key][frame] = {
      width: scale,
      height: scale,
      offsetX: before.offsetX ?? character.animationScales?.[key]?.offsetX ?? 0
    };
    changes.push({ characterId, key, frame: Number(frame), before, after: character.animationFrameScales[key][frame] });
  }
}

await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
await fs.mkdir(path.dirname(logPath), { recursive: true });
await fs.writeFile(logPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), changes }, null, 2)}\n`);
console.log(`nami fan/staff attack tune changes: ${changes.length}`);
