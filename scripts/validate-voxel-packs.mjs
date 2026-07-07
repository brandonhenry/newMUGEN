import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const roots = [];
if (args.has('--public') || (!args.has('--dist') && !args.has('--public'))) roots.push('public');
if (args.has('--dist') || (!args.has('--dist') && !args.has('--public') && existsSync('dist'))) roots.push('dist');

if (roots.length === 0) {
  throw new Error('No voxel pack root selected. Use --public, --dist, or run after build.');
}

let checked = 0;
const failures = [];

for (const root of roots) {
  const charactersRoot = join(root, 'characters');
  if (!existsSync(charactersRoot)) {
    failures.push(`${root}: missing characters directory`);
    continue;
  }
  const characterIds = readdirSync(charactersRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const characterId of characterIds) {
    const voxelDir = join(charactersRoot, characterId, 'voxels-hd');
    if (!existsSync(voxelDir)) continue;
    const jsonPath = join(voxelDir, 'voxel-pack-v1.json');
    const binPath = join(voxelDir, 'voxel-pack-v1.bin');
    if (!existsSync(jsonPath)) {
      failures.push(`${root}/${characterId}: missing voxel-pack-v1.json`);
      continue;
    }
    if (!existsSync(binPath)) {
      failures.push(`${root}/${characterId}: missing voxel-pack-v1.bin`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const binSize = statSync(binPath).size;
    if (manifest.format !== 'kore-voxel-pack-v1') failures.push(`${root}/${characterId}: invalid pack format`);
    if (manifest.binary !== 'voxel-pack-v1.bin') failures.push(`${root}/${characterId}: invalid binary path`);
    if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) failures.push(`${root}/${characterId}: empty frame index`);
    if (binSize <= 0) failures.push(`${root}/${characterId}: empty voxel-pack-v1.bin`);
    checked += 1;
  }
}

if (failures.length > 0) {
  throw new Error(`Voxel pack validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}

console.log(`[voxel-pack] validated ${checked} HD character packs in ${roots.join(', ')}`);
