import { createRequire } from 'node:module';
import { access, chmod, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const { bundle } = require('@malept/flatpak-bundler');
const execFileAsync = promisify(execFile);

const appId = 'com.bggames.kore';
const appName = 'KORE';
const runtimeVersion = process.env.KORE_FLATPAK_RUNTIME_VERSION || '24.08';
const linuxUnpacked = resolve(process.env.KORE_LINUX_UNPACKED_DIR || 'release/desktop/linux-unpacked');
const bundlePath = resolve(process.env.KORE_FLATPAK_OUTPUT || 'release/desktop/KORE-SteamDeck.flatpak');
const workDir = resolve(process.env.KORE_FLATPAK_WORK_DIR || 'tmp/flatpak-kore');
const generatedDir = resolve('build/flatpak/generated');
const launcherPath = resolve(generatedDir, 'kore-flatpak-launcher');
const desktopPath = resolve(generatedDir, `${appId}.desktop`);
const metainfoPath = resolve(generatedDir, `${appId}.metainfo.xml`);
const iconSourcePath = resolve('public/brand/kore-favicon.png');
const iconPath = resolve(generatedDir, `${appId}.png`);
const iconThemeSize = '512x512';
const appVersionSource = await readFile('src/appVersion.ts', 'utf8').catch(() => '');
const packageSource = await readFile('package.json', 'utf8').catch(() => '{}');
const sourceVersion = appVersionSource.match(/KORE_APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
const packageVersion = JSON.parse(packageSource).version ?? '0.0.0';
const appVersion = sourceVersion || packageVersion;
const releaseDate = new Date().toISOString().slice(0, 10);

async function ensureCommand(name) {
  try {
    await execFileAsync(name, ['--version']);
  } catch {
    throw new Error(`${name} is required to build KORE-SteamDeck.flatpak. Run this on Linux with Flatpak tooling installed, or use .github/workflows/steamdeck-flatpak.yml.`);
  }
}

async function ensureLinuxUnpacked() {
  await access(resolve(linuxUnpacked, 'kore'), constants.X_OK).catch(() => {
    throw new Error(`Missing Electron Linux unpacked app at ${linuxUnpacked}. Run npm run desktop:dist:linux-dir first.`);
  });
}

async function writeBuildFiles() {
  await rm(generatedDir, { recursive: true, force: true });
  await mkdir(generatedDir, { recursive: true });
  if (!(await resizeIconWithImageMagick())) {
    await cp(iconSourcePath, iconPath);
  }
  await writeFile(launcherPath, `#!/usr/bin/env bash
set -euo pipefail
export KORE_DESKTOP_URL="\${KORE_DESKTOP_URL:-https://playkore.com}"
exec /app/kore/kore --no-sandbox "$@"
`);
  await chmod(launcherPath, 0o755);
  await writeFile(desktopPath, `[Desktop Entry]
Type=Application
Name=${appName}
Comment=Play KORE in a Chromium desktop shell
Exec=kore
Icon=${appId}
Categories=Game;
Terminal=false
StartupNotify=true
`);
  await writeFile(metainfoPath, `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>
  <metadata_license>MIT</metadata_license>
  <project_license>MIT</project_license>
  <name>${appName}</name>
  <summary>Play KORE in a fullscreen Chromium desktop shell</summary>
  <description>
    <p>KORE is a browser-powered 3D fighting game wrapped for Steam Deck Desktop Mode and Linux PCs.</p>
    <p>This Flatpak launches the live KORE site at playkore.com and keeps the game fullscreen by default.</p>
  </description>
  <launchable type="desktop-id">${appId}.desktop</launchable>
  <categories>
    <category>Game</category>
  </categories>
  <url type="homepage">https://playkore.com</url>
  <releases>
    <release version="${appVersion}" date="${releaseDate}" />
  </releases>
  <content_rating type="oars-1.1" />
</component>
`);
}

async function resizeIconWithImageMagick() {
  for (const command of ['magick', 'convert']) {
    try {
      await execFileAsync(command, [iconSourcePath, '-resize', iconThemeSize, iconPath]);
      return true;
    } catch {
      // Try the next ImageMagick command name, then fall back to copying the source icon.
    }
  }
  return false;
}

async function buildBundle() {
  const manifest = {
    appId,
    runtime: 'org.freedesktop.Platform',
    runtimeVersion,
    sdk: 'org.freedesktop.Sdk',
    command: 'kore',
    finishArgs: [
      '--share=network',
      '--share=ipc',
      '--socket=wayland',
      '--socket=fallback-x11',
      '--socket=pulseaudio',
      '--device=dri',
      '--device=all'
    ],
    modules: []
  };
  await rm(workDir, { recursive: true, force: true });
  await mkdir(dirname(bundlePath), { recursive: true });
  await bundle(manifest, {
    arch: 'x64',
    workingDir: workDir,
    bundlePath,
    extraFlatpakBuilderArgs: ['--disable-rofiles-fuse'],
    files: [
      [linuxUnpacked, 'kore/'],
      [launcherPath, 'bin/kore'],
      [desktopPath, `share/applications/${appId}.desktop`],
      [metainfoPath, `share/metainfo/${appId}.metainfo.xml`],
      [iconPath, `share/icons/hicolor/${iconThemeSize}/apps/${appId}.png`]
    ],
    extraExports: [
      `share/applications/${appId}.desktop`,
      `share/metainfo/${appId}.metainfo.xml`,
      `share/icons/hicolor/${iconThemeSize}/apps/${appId}.png`
    ]
  });
  const stats = await stat(bundlePath);
  console.log(`Built ${bundlePath} (${stats.size} bytes)`);
}

if (process.platform !== 'linux') {
  throw new Error('KORE-SteamDeck.flatpak must be built on Linux. Use the manual GitHub Actions workflow or a Linux builder.');
}

await ensureCommand('flatpak');
await ensureCommand('flatpak-builder');
await ensureLinuxUnpacked();
await writeBuildFiles();
await buildBundle();
