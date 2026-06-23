import { expect, test } from '@playwright/test';

async function startFight(page: import('@playwright/test').Page, local2p = false) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Fight Character select, stage select, then match.' }).click();
  if (local2p) {
    await page.getByRole('button', { name: 'Local 2P' }).click();
  }
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Fight' }).click();
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 5000 });
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 2000 });
}

function xFromPosition(value: string) {
  return Number(value.split(',')[0]);
}

function zFromPosition(value: string) {
  return Number(value.split(',')[1]);
}

test('starts a playable match from the menu', async ({ page }) => {
  await startFight(page);
  await expect(page.getByTestId('fight-canvas')).toBeVisible();
  await expect(page.locator('.fight-hud')).toBeVisible();
});

test('opens controls and character viewer', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Controls Keyboard, gamepad, mobile, and match mode.' }).click();
  await expect(page.getByRole('heading', { name: 'Player 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Character Viewer Inspect roster manifests and loader warnings.' }).click();
  await expect(page.getByText('No manifest warnings.')).toBeVisible();
});

test('moves player one with keyboard and arrow keys in 1P mode', async ({ page }) => {
  await startFight(page);
  const before = xFromPosition(await page.getByTestId('p1-position').innerText());
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(360);
  await page.keyboard.up('ArrowRight');
  const afterArrow = xFromPosition(await page.getByTestId('p1-position').innerText());
  expect(afterArrow).toBeGreaterThan(before + 0.25);

  await page.keyboard.down('KeyA');
  await page.waitForTimeout(260);
  await page.keyboard.up('KeyA');
  const afterWasd = xFromPosition(await page.getByTestId('p1-position').innerText());
  expect(afterWasd).toBeLessThan(afterArrow - 0.16);
});

test('lets player one close distance, hit, and continue without pausing', async ({ page }) => {
  await startFight(page, true);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 2500 }).toBeGreaterThan(-0.1);
  await page.keyboard.up('KeyD');
  const hpBefore = Number(await page.getByTestId('p2-hp').innerText());
  const zBefore = zFromPosition(await page.getByTestId('p2-position').innerText());
  await page.keyboard.press('KeyJ');
  await expect.poll(async () => Number(await page.getByTestId('p2-hp').innerText()), { timeout: 1200 }).toBeLessThan(hpBefore);
  await expect(page.getByTestId('match-phase')).toHaveText('fighting');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(260);
  await page.keyboard.up('ArrowUp');
  const zAfter = zFromPosition(await page.getByTestId('p2-position').innerText());
  expect(zAfter).toBeLessThan(zBefore - 0.15);
});
