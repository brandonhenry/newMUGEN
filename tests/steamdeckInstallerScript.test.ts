import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('Steam Deck fallback installer script', () => {
  it('dry-runs without assuming a local Downloads path or prompting for Steam VDF edits', async () => {
    const { stdout } = await execFileAsync('bash', ['public/installers/install-kore-steamdeck.sh', '--dry-run'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: '/home/deck'
      }
    });

    expect(stdout).toContain('Install path: /home/deck/Games/KORE/KORE.AppImage');
    expect(stdout).toContain('Desktop shortcut: /home/deck/Desktop/KORE.desktop');
    expect(stdout).toContain('Steam Library integration skipped.');
    expect(stdout).toContain('Advanced automatic Steam shortcut option: rerun with --add-steam-shortcut.');
    expect(stdout).not.toContain('/home/deck/Download');
    expect(stdout).not.toContain('Try advanced automatic Steam Library integration now?');
  });

  it('dry-runs Flatpak Steam shortcut and artwork installation without writing files', async () => {
    const { stdout } = await execFileAsync('bash', [
      'public/installers/install-kore-steamdeck.sh',
      '--dry-run',
      '--add-steam-shortcut',
      '--steam-target=flatpak'
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: '/home/deck'
      }
    });

    expect(stdout).toContain('Steam target: /usr/bin/flatpak run com.bggames.kore');
    expect(stdout).toContain('/home/deck/.local/share/Steam/userdata/0/config/shortcuts.vdf');
    expect(stdout).toContain('/home/deck/.local/share/Steam/userdata/0/config/grid/');
    expect(stdout).toContain('/home/deck/.local/share/Steam/appcache/librarycache/');
    expect(stdout).toContain('Steam shortcut appid:');
    expect(stdout).toContain('would install Steam artwork from /home/deck/Games/KORE/steam-art');
  });
});

describe('Steam Deck Flatpak bundle permissions', () => {
  it('exposes graphics, X11, and controller device data to the Electron shell', async () => {
    const script = await readFile('scripts/build-steamdeck-flatpak.mjs', 'utf8');

    expect(script).toContain("'--device=dri'");
    expect(script).toContain("'--device=all'");
    expect(script).toContain("'--filesystem=/run/udev:ro'");
    expect(script).toContain("'--socket=x11'");
    expect(script).not.toContain("'--device=input'");
  });

  it('uses player-facing metadata instead of technical wrapper copy', async () => {
    const flatpakBuilder = await readFile('scripts/build-steamdeck-flatpak.mjs', 'utf8');
    const fallbackScript = await readFile('public/installers/install-kore-steamdeck.sh', 'utf8');
    const publisher = await readFile('scripts/publish-installers.mjs', 'utf8');
    const combined = `${flatpakBuilder}\n${fallbackScript}\n${publisher}`;

    expect(combined).toContain('A free 3D fighter with arcade, training, ranked online, custom fighters, and wild stages.');
    expect(combined).toContain('K.O.R.E. blends the anything-goes spirit of M.U.G.E.N with modern 3D arena fighting.');
    expect(combined).not.toMatch(/Chromium desktop shell|browser-powered|browser wrapper|wrapped for Steam Deck/i);
  });

  it('pins Linux desktop packaging to Electron 26 for Steam Input compatibility', async () => {
    const packageJson = await readFile('package.json', 'utf8');

    expect(packageJson).toContain('desktop:dist:linux');
    expect(packageJson).toContain('-c.electronVersion=26.6.10');
  });
});
