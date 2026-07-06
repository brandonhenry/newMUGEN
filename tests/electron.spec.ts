import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

test.skip(process.env.KORE_RUN_ELECTRON_SMOKE !== '1', 'Set KORE_RUN_ELECTRON_SMOKE=1 to run the Electron desktop smoke test.');

test('loads KORE in the Electron desktop shell', async () => {
  const app = await electron.launch({
    args: ['electron/main.cjs', '--windowed'],
    env: {
      ...process.env,
      KORE_DESKTOP_URL: process.env.KORE_DESKTOP_URL || 'http://127.0.0.1:4177'
    }
  });

  try {
    const page = await app.firstWindow();
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  } finally {
    await app.close();
  }
});
