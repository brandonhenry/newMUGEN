import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const sourceDir = process.env.KORE_INSTALLER_SOURCE_DIR || 'release/desktop';
const outputDir = process.env.KORE_INSTALLER_PUBLIC_DIR || 'public/installers';
const publicBase = '/installers';
const appVersionSource = await readFile('src/appVersion.ts', 'utf8').catch(() => '');
const packageSource = await readFile('package.json', 'utf8').catch(() => '{}');
const sourceVersion = appVersionSource.match(/KORE_APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const packageVersion = JSON.parse(packageSource).version ?? '0.0.0';
const appVersion = sourceVersion || packageVersion;
const deckNotes = 'Best for Steam Deck: install with Discover, then launch KORE from your apps or add it to Steam.';

const platforms = [
  {
    id: 'windows',
    label: 'Windows PC',
    match: (name) => /\.exe$/i.test(name),
    type: 'installer',
    notes: 'Unsigned Windows installer. Creates desktop and Start Menu shortcuts.'
  },
  {
    id: 'mac',
    label: 'Mac',
    match: (name) => /\.pkg$/i.test(name),
    type: 'installer',
    notes: 'Unsigned macOS package. Installs KORE and adds a desktop launcher for the active user.'
  },
  {
    id: 'steamdeck',
    label: 'Steam Deck',
    match: (name) => /KORE-SteamDeck\.flatpak$/i.test(name),
    type: 'flatpak',
    notes: deckNotes
  },
  {
    id: 'linux',
    label: 'Linux AppImage',
    match: (name) => /\.AppImage$/i.test(name),
    type: 'appimage',
    notes: 'Generic Linux AppImage for desktop distributions.'
  }
];

async function fileSha256(path) {
  const { createReadStream } = await import('node:fs');
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

async function findArtifacts() {
  const entries = await readdir(sourceDir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.endsWith('.blockmap') || name.endsWith('.yml') || name.endsWith('.yaml')) continue;
    if (!['.exe', '.pkg', '.AppImage', '.flatpak'].includes(extname(name))) continue;
    files.push(join(sourceDir, name));
  }
  return files;
}

await mkdir(outputDir, { recursive: true });

const artifactPaths = await findArtifacts();
const copied = [];

for (const artifactPath of artifactPaths) {
  const filename = basename(artifactPath);
  const target = join(outputDir, filename);
  await copyFile(artifactPath, target);
  const stats = await stat(target);
  copied.push({
    type: filename.endsWith('.flatpak') ? 'flatpak' : filename.endsWith('.AppImage') ? 'appimage' : 'installer',
    filename,
    url: `${publicBase}/${filename}`,
    size: stats.size,
    sha256: await fileSha256(target)
  });
}

const installerEntries = [];
for (const platform of platforms) {
  const artifact = copied.find((item) => platform.match(item.filename));
  if (!artifact) continue;
  const entry = {
    id: platform.id,
    label: platform.label,
    version: appVersion,
    type: platform.type,
    filename: artifact.filename,
    url: artifact.url,
    size: artifact.size,
    sha256: artifact.sha256,
    recommended: false,
    notes: platform.notes
  };
  if (platform.id === 'steamdeck') {
    const appImageAsset = copied.find((item) => /\.AppImage$/i.test(item.filename));
    const scriptPath = join(outputDir, 'install-kore-steamdeck.sh');
    const scriptStats = await stat(scriptPath).catch(() => null);
    const scriptAsset = scriptStats
      ? {
          type: 'script',
          primary: false,
          label: 'Konsole fallback script',
          filename: 'install-kore-steamdeck.sh',
          url: `${publicBase}/install-kore-steamdeck.sh`,
          size: scriptStats.size,
          sha256: await fileSha256(scriptPath)
        }
      : null;
    entry.assets = [
      {
        ...artifact,
        type: 'flatpak',
        primary: true,
        label: 'Install with Discover (.flatpak)'
      },
      appImageAsset
        ? {
            ...appImageAsset,
            type: 'appimage',
            primary: false,
            label: 'AppImage fallback'
          }
        : null,
      scriptAsset
    ].filter(Boolean);
    entry.installCommand = 'curl -fsSL https://playkore.com/installers/install-kore-steamdeck.sh | bash';
  }
  installerEntries.push(entry);
}

const manifest = {
  version: appVersion,
  generatedAt: new Date().toISOString(),
  installers: installerEntries
};

await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Published ${installerEntries.length} installer entries to ${outputDir}/manifest.json`);
