import { mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const outputDir = 'public/steam-art';
const logoPath = 'public/brand/kore-logo.png';
const iconPath = 'public/brand/kore-favicon.png';

async function findImageMagick() {
  for (const command of ['magick', 'convert']) {
    try {
      await execFileAsync(command, ['--version']);
      return command;
    } catch {
      // Try the next ImageMagick command name.
    }
  }
  throw new Error('ImageMagick is required to generate Steam artwork. Install magick or convert.');
}

async function run(command, args) {
  await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
}

async function makeArt(command, { size, logoSize, output, format = 'png', icon = false }) {
  const source = icon ? iconPath : logoPath;
  const background = format === 'jpg' ? '#07111f' : 'none';
  const args = [
    '-size',
    size,
    'xc:#07111f',
    '(',
    source,
    '-resize',
    logoSize,
    ')',
    '-gravity',
    'center',
    '-composite',
    '-strip',
    '-background',
    background,
    '-alpha',
    format === 'jpg' ? 'remove' : 'on',
    `${outputDir}/${output}`
  ];
  await run(command, args);
}

await mkdir(outputDir, { recursive: true });
const command = await findImageMagick();

await makeArt(command, { size: '460x215', logoSize: '330x130', output: 'kore_capsule_460x215.png' });
await makeArt(command, { size: '460x215', logoSize: '330x130', output: 'kore_capsule_460x215.jpg', format: 'jpg' });
await makeArt(command, { size: '600x900', logoSize: '460x260', output: 'kore_library_600x900.png' });
await makeArt(command, { size: '600x900', logoSize: '460x260', output: 'kore_library_600x900.jpg', format: 'jpg' });
await makeArt(command, { size: '3840x1240', logoSize: '1550x520', output: 'kore_hero_3840x1240.png' });
await makeArt(command, { size: '3840x1240', logoSize: '1550x520', output: 'kore_hero_3840x1240.jpg', format: 'jpg' });
await makeArt(command, { size: '1280x720', logoSize: '1000x420', output: 'kore_logo.png' });
await makeArt(command, { size: '256x256', logoSize: '220x220', output: 'kore_icon_256.png', icon: true });
await makeArt(command, { size: '256x256', logoSize: '220x220', output: 'kore_icon_256.jpg', format: 'jpg', icon: true });

console.log(`Generated Steam artwork in ${outputDir}`);
