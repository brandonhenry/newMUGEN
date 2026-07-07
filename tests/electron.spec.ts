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

test('closes the Electron desktop shell process cleanly', async () => {
  const app = await electron.launch({
    args: ['electron/main.cjs', '--windowed', '--steamdeck'],
    env: {
      ...process.env,
      KORE_DESKTOP_URL: process.env.KORE_DESKTOP_URL || 'http://127.0.0.1:4177',
      KORE_STEAM_DECK: '1'
    }
  });

  const page = await app.firstWindow();
  await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  await page.close();
  await expect.poll(async () => app.process()?.exitCode(), { timeout: 10000 }).not.toBeNull();
});

test('second launch relaunches fresh instead of focusing the existing process', async () => {
  test.skip(process.env.KORE_RUN_ELECTRON_SECOND_INSTANCE !== '1', 'Set KORE_RUN_ELECTRON_SECOND_INSTANCE=1 for manual second-instance recovery checks.');

  const env = {
    ...process.env,
    KORE_DESKTOP_URL: process.env.KORE_DESKTOP_URL || 'http://127.0.0.1:4177',
    KORE_STEAM_DECK: '1'
  };
  const first = await electron.launch({ args: ['electron/main.cjs', '--windowed', '--steamdeck'], env });

  try {
    await expect((await first.firstWindow()).locator('body')).toBeVisible({ timeout: 15000 });
    const second = await electron.launch({ args: ['electron/main.cjs', '--windowed', '--steamdeck'], env });
    await second.close().catch(() => undefined);
    await expect.poll(async () => first.process()?.exitCode(), { timeout: 10000 }).not.toBeNull();
  } finally {
    await first.close().catch(() => undefined);
  }
});
