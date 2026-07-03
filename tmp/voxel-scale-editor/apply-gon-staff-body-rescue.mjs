import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const characterId = 'gon-freecss';
const manifestPath = path.join(repoRoot, 'public/characters', characterId, 'character.json');
const logPath = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/gon-staff-body-rescue.json');

const fixes = [
  { key: 'cmd:2+3', frames: [129, 130, 131], scale: 1.15 },
  { key: 'jableft', frames: [129, 130, 131], scale: 1.15 },
  { key: 'cmd:2+4', frames: [134, 135, 139, 142], scale: 1.12 },
  { key: 'jabright', frames: [102, 103, 104, 105, 106, 108, 109, 110, 113, 115], scale: 1.1 }
];

const character = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
character.animationFrameScales ??= {};
const changes = [];

for (const fix of fixes) {
  character.animationFrameScales[fix.key] ??= {};
  for (const frame of fix.frames) {
    const framePath = `frame-${String(frame).padStart(3, '0')}.png`;
    if (!character.animationFrames?.[fix.key]?.some((item) => item.endsWith(framePath))) continue;
    const before = character.animationFrameScales[fix.key][String(frame)] ?? character.animationScales?.[fix.key] ?? {};
    character.animationFrameScales[fix.key][String(frame)] = {
      width: fix.scale,
      height: fix.scale,
      offsetX: before.offsetX ?? character.animationScales?.[fix.key]?.offsetX ?? 0
    };
    changes.push({ characterId, key: fix.key, frame, before, after: character.animationFrameScales[fix.key][String(frame)] });
  }
}

await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
await fs.mkdir(path.dirname(logPath), { recursive: true });
await fs.writeFile(logPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), changes }, null, 2)}\n`);
console.log(`gon staff/body rescue changes: ${changes.length}`);
