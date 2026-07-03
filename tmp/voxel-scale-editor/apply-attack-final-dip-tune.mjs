import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const charactersRoot = path.join(repoRoot, 'public/characters');
const logPath = path.join(repoRoot, 'tmp/voxel-scale-editor/family-passes/attack-final-dip-tune.json');

const fixes = [
  { id: 'franky', key: 'cmd:1+2', frames: [101, 102, 103], scale: 1.03 },
  { id: 'fuusuke', key: 'cmd:3+4', frames: [106], scale: 1.03 },
  { id: 'goku-super-saiyan', key: 'cmd:1+2', frames: [89], scale: 1.03 },
  { id: 'kiro', key: 'jabright', frames: [92], scale: 1.03 },
  { id: 'monkey-d-luffy-2nd-gear', key: 'cmd:3+4', frames: [104], scale: 1.03 },
  { id: 'nami', key: 'cmd:1+2', frames: [79, 80, 81], scale: 1.03 },
  { id: 'nami-perfect-clima-tact', key: 'jabright', frames: [69], scale: 1.03 },
  { id: 'nico-robin', key: 'cmd:2+4', frames: [171], scale: 1.03 },
  { id: 'pegasus-seiya', key: 'jableft', frames: [83], scale: 1.03 },
  { id: 'sakura-haruno', key: 'cmd:d+3+4', frames: [110], scale: 1.03 },
  { id: 'vegeta', key: 'cmd:1+3', frames: [130], scale: 1.03 },
  { id: 'vegeta', key: 'cmd:2+4', frames: [71], scale: 1.03 },
  { id: 'vegito', key: 'cmd:3+4', frames: [101], scale: 1.03 },
  { id: 'vegito', key: 'kickright', frames: [101], scale: 1.03 },
  { id: 'yusuke-urameshi', key: 'cmd:1+2+3', frames: [87], scale: 1.03 }
];

const changes = [];
for (const fix of fixes) {
  const manifestPath = path.join(charactersRoot, fix.id, 'character.json');
  const character = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  character.animationFrameScales ??= {};
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
    changes.push({ ...fix, frame, before, after: character.animationFrameScales[fix.key][String(frame)] });
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
}

await fs.mkdir(path.dirname(logPath), { recursive: true });
await fs.writeFile(logPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), changes }, null, 2)}\n`);
console.log(`attack final dip tune changes: ${changes.length}`);
