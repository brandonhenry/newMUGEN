import { execFile } from 'node:child_process';
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
});
