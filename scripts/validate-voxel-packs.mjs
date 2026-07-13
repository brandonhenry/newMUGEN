import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = new Set(process.argv.slice(2));
const roots = [];
if (args.has('--public') || (!args.has('--dist') && !args.has('--public'))) roots.push('public');
if (args.has('--dist') || (!args.has('--dist') && !args.has('--public') && existsSync('dist'))) roots.push('dist');

if (roots.length === 0) {
  throw new Error('No voxel pack root selected. Use --public, --dist, or run after build.');
}

let checked = 0;
const failures = [];

function findVoxelDirs(directory) {
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = join(directory, entry.name);
    if (entry.name === 'voxels-hd') matches.push(child);
    else matches.push(...findVoxelDirs(child));
  }
  return matches;
}

for (const root of roots) {
  const charactersRoot = join(root, 'characters');
  if (!existsSync(charactersRoot)) {
    failures.push(`${root}: missing characters directory`);
    continue;
  }
  for (const voxelDir of findVoxelDirs(charactersRoot).sort()) {
    const assetId = relative(charactersRoot, voxelDir).replace(/\/voxels-hd$/, '');
    const jsonPath = join(voxelDir, 'voxel-pack-v1.json');
    const binPath = join(voxelDir, 'voxel-pack-v1.bin');
    if (!existsSync(jsonPath)) {
      failures.push(`${root}/${assetId}: missing voxel-pack-v1.json`);
      continue;
    }
    if (!existsSync(binPath)) {
      failures.push(`${root}/${assetId}: missing voxel-pack-v1.bin`);
      continue;
    }
    const manifest = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const binSize = statSync(binPath).size;
    if (manifest.format !== 'kore-voxel-pack-v1') failures.push(`${root}/${assetId}: invalid pack format`);
    if (manifest.binary !== 'voxel-pack-v1.bin') failures.push(`${root}/${assetId}: invalid binary path`);
    if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) failures.push(`${root}/${assetId}: empty frame index`);
    if (binSize <= 0) failures.push(`${root}/${assetId}: empty voxel-pack-v1.bin`);
    checked += 1;
  }
}

if (failures.length > 0) {
  throw new Error(`Voxel pack validation failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
}

console.log(`[voxel-pack] validated ${checked} HD asset packs in ${roots.join(', ')}`);
