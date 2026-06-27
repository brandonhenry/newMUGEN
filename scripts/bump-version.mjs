import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bumpType = process.argv[2];
const allowed = new Set(['patch', 'minor', 'major']);

if (!allowed.has(bumpType)) {
  console.error('Usage: node scripts/bump-version.mjs <patch|minor|major>');
  process.exit(1);
}

const versionFile = resolve(process.cwd(), 'src', 'appVersion.ts');
const source = await readFile(versionFile, 'utf8');
const match = source.match(/KORE_APP_VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);

if (!match) {
  console.error('Could not find KORE_APP_VERSION in src/appVersion.ts');
  process.exit(1);
}

let major = Number(match[1]);
let minor = Number(match[2]);
let patch = Number(match[3]);

if (bumpType === 'major') {
  major += 1;
  minor = 0;
  patch = 0;
} else if (bumpType === 'minor') {
  minor += 1;
  patch = 0;
} else {
  patch += 1;
}

const nextVersion = `${major}.${minor}.${patch}`;
const nextSource = source.replace(/KORE_APP_VERSION\s*=\s*'\d+\.\d+\.\d+'/, `KORE_APP_VERSION = '${nextVersion}'`);
await writeFile(versionFile, nextSource, 'utf8');

console.log(`KORE app version bumped to ${nextVersion}`);
