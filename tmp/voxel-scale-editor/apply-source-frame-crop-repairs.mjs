import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const repoRoot = process.cwd();
const alphaThreshold = 16;

const repairs = [
  { characterId: 'jaguar-junichi', frameIndex: 185, keep: 'top', reason: 'remove lower stray character cell' },
  { characterId: 'jaguar-junichi', frameIndex: 190, keep: 'top', reason: 'remove lower stray character cell' },
  { characterId: 'dr-mashirito', frameIndex: 174, keep: 'bottom', reason: 'remove upper duplicate character cell' },
  { characterId: 'ichigo-kurosaki', frameIndex: 409, keep: 'bottom', reason: 'remove upper duplicate character cell' },
  { characterId: 'kinnikuman', frameIndex: 271, keep: 'bottom', reason: 'remove upper duplicate character cell' },
  { characterId: 'piccolo', frameIndex: 154, keep: 'bottom', reason: 'remove upper duplicate character cell' },
  { characterId: 'taizo-momote', frameIndex: 6, keep: 'left', reason: 'remove adjacent stray character cell' },
  { characterId: 'taizo-momote', frameIndex: 9, keep: 'left', reason: 'remove adjacent stray character cell' },
  { characterId: 'taizo-momote', frameIndex: 14, keep: 'right', reason: 'remove adjacent stray character cell' },
  { characterId: 'taizo-momote', frameIndex: 17, keep: 'left', reason: 'remove adjacent stray character cell' }
];

function pad3(value) {
  return String(value).padStart(3, '0');
}

function findComponents(data, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];
  const components = [];
  const dirs = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (visited[start] || data[start * 4 + 3] <= alphaThreshold) continue;
      visited[start] = 1;
      queue.length = 0;
      queue.push(start);
      let qi = 0;
      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      const pixels = [];

      while (qi < queue.length) {
        const index = queue[qi++];
        pixels.push(index);
        const cx = index % width;
        const cy = Math.floor(index / width);
        area += 1;
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (visited[next] || data[next * 4 + 3] <= alphaThreshold) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }

      components.push({
        area,
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        pixels
      });
    }
  }

  return components
    .filter((component) => component.area >= 24 && component.width >= 5 && component.height >= 5)
    .sort((a, b) => b.area - a.area);
}

function chooseComponent(components, keep) {
  if (components.length < 2) {
    throw new Error(`Expected at least two components, found ${components.length}`);
  }
  if (keep === 'top') return components.toSorted((a, b) => a.minY - b.minY || b.area - a.area)[0];
  if (keep === 'bottom') return components.toSorted((a, b) => b.maxY - a.maxY || b.area - a.area)[0];
  if (keep === 'left') return components.toSorted((a, b) => a.minX - b.minX || b.area - a.area)[0];
  if (keep === 'right') return components.toSorted((a, b) => b.maxX - a.maxX || b.area - a.area)[0];
  throw new Error(`Unknown keep mode ${keep}`);
}

async function repairFrame(repair) {
  const file = path.join(repoRoot, 'public/characters', repair.characterId, 'frames', `frame-${pad3(repair.frameIndex)}.png`);
  const image = sharp(file).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const components = findComponents(data, info.width, info.height);
  const component = chooseComponent(components, repair.keep);
  const pad = 2;
  const left = Math.max(0, component.minX - pad);
  const top = Math.max(0, component.minY - pad);
  const right = Math.min(info.width - 1, component.maxX + pad);
  const bottom = Math.min(info.height - 1, component.maxY + pad);
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const out = await sharp(file).extract(crop).png().toBuffer();
  await fs.writeFile(file, out);
  return {
    ...repair,
    file: path.relative(repoRoot, file),
    crop,
    keptBounds: {
      minX: component.minX,
      minY: component.minY,
      maxX: component.maxX,
      maxY: component.maxY,
      width: component.width,
      height: component.height,
      area: component.area
    },
    originalSize: { width: info.width, height: info.height }
  };
}

const results = [];
for (const repair of repairs) {
  results.push(await repairFrame(repair));
}

const outFile = path.join(repoRoot, 'tmp/voxel-scale-editor/two-character-crop-review/applied-crop-repairs.json');
await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
