import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const root = path.join(repoRoot, 'tmp/voxel-scale-editor/family-ghost-sheets');
const families = ['crouchBlock', 'movement', 'airborne', 'proneRecovery', 'reactions', 'attacks'];

const pagesByFamily = {};
for (const family of families) {
  const entries = (await fs.readdir(root))
    .filter((name) => name.startsWith(`${family}-page-`) && name.endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  pagesByFamily[family] = entries;
}

const sections = families.map((family) => {
  const pages = pagesByFamily[family] ?? [];
  const nav = pages.map((page, index) => `<a href="#${family}-${index + 1}">${index + 1}</a>`).join('');
  const images = pages.map((page, index) => `
    <figure id="${family}-${index + 1}">
      <figcaption>${family} page ${index + 1} / ${pages.length}</figcaption>
      <img src="${page}?t=${Date.now()}" alt="${family} page ${index + 1}">
    </figure>
  `).join('');
  return `<section id="${family}">
    <h2>${family}</h2>
    <nav class="pageNav">${nav}</nav>
    ${images}
  </section>`;
}).join('\n');

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>KORE Ghost Scale Proof</title>
  <style>
    :root { color-scheme: light; font-family: Inter, Arial, sans-serif; background: #0f1117; color: #f8fafc; }
    body { margin: 0; }
    header { position: sticky; top: 0; z-index: 10; background: rgba(15,17,23,0.96); border-bottom: 1px solid #2f3542; padding: 14px 18px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    h2 { margin: 26px 18px 10px; font-size: 20px; }
    p { margin: 0; color: #cbd5e1; line-height: 1.45; }
    .familyNav, .pageNav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    a { color: #071217; background: #31d8ef; text-decoration: none; border-radius: 6px; padding: 6px 9px; font-weight: 800; }
    .pageNav { margin: 0 18px 14px; }
    .pageNav a { background: #e2e8f0; color: #111827; font-size: 12px; padding: 4px 7px; }
    figure { margin: 0 18px 24px; background: #f8fafc; color: #111827; border: 1px solid #cbd5e1; }
    figcaption { padding: 8px 10px; font-weight: 800; background: #e2e8f0; border-bottom: 1px solid #cbd5e1; }
    img { display: block; width: 100%; height: auto; }
  </style>
</head>
<body>
  <header>
    <h1>KORE Ghost Scale Proof</h1>
    <p>Each frame is rendered with the same current game scale values over that character's idle ghost. Red is the ground baseline; blue is the idle height reference. Wide/prone poses can differ from idle shape, but body volume should read consistently through the sequence.</p>
    <nav class="familyNav">${families.map((family) => `<a href="#${family}">${family} (${pagesByFamily[family]?.length ?? 0})</a>`).join('')}</nav>
  </header>
  ${sections}
</body>
</html>`;

const outFile = path.join(root, 'proof-all.html');
await fs.writeFile(outFile, html);
if (!fsSync.existsSync(outFile)) throw new Error('Failed to write proof index');
console.log(path.relative(repoRoot, outFile));
