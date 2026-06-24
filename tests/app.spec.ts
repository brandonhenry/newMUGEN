import { expect, test } from '@playwright/test';

async function startFight(page: import('@playwright/test').Page, local2p = false) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('button', { name: 'Fight Character select, stage select, then match.' }).click();
  if (local2p) {
    await page.getByRole('button', { name: 'Local 2P' }).click();
  }
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 5000 });
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 2000 });
  const fightScreen = page.locator('.fight-screen');
  await page.waitForTimeout(2200);
  await fightScreen.click({ position: { x: 24, y: 24 } });
  await fightScreen.focus();
}

function xFromPosition(value: string) {
  return Number(value.split(',')[0]);
}

function zFromPosition(value: string) {
  return Number(value.split(',')[1]);
}

async function virtualPress(page: import('@playwright/test').Page, label: string, duration: number) {
  const target = page.getByLabel(label);
  await target.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true });
  await page.waitForTimeout(duration);
  await target.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true });
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
  await expect(page.getByTestId('character-viewer-canvas')).toBeVisible();
  await page.getByTestId('viewer-pose-jab').click();
  await expect(page.getByTestId('viewer-pose-jab')).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Rotate' }).click();
  await page.getByTestId('viewer-zoom-in').click();
  await expect(page.getByTestId('viewer-zoom-slider')).toHaveValue('0.46');
  await page.getByTestId('viewer-zoom-out').click();
  await expect(page.getByTestId('viewer-zoom-slider')).toHaveValue('0.28');
  await expect(page.getByText('No manifest warnings.')).toBeVisible();
});

test('moves player one forward and back with keyboard', async ({ page }) => {
  await startFight(page, true);
  const before = xFromPosition(await page.getByTestId('p1-position').innerText());
  await page.keyboard.down('KeyD');
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 6000 }).toBeGreaterThan(before + 0.25);
  await page.keyboard.up('KeyD');
  const afterForward = xFromPosition(await page.getByTestId('p1-position').innerText());

  await page.keyboard.down('KeyA');
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 6000 }).toBeLessThan(afterForward - 0.12);
  await page.keyboard.up('KeyA');
  const afterBack = xFromPosition(await page.getByTestId('p1-position').innerText());
  expect(afterBack).toBeLessThan(afterForward - 0.12);
});

test('lets player one close distance, hit, and continue without pausing', async ({ page }) => {
  await startFight(page, true);
  await page.keyboard.down('KeyD');
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 6000 }).toBeGreaterThan(-0.55);
  await page.keyboard.up('KeyD');
  const hpBefore = Number(await page.getByTestId('p2-hp').innerText());
  let hpAfter = hpBefore;
  for (let attempt = 0; attempt < 3 && hpAfter >= hpBefore; attempt += 1) {
    await page.keyboard.down('KeyU');
    await page.waitForTimeout(260);
    await page.keyboard.up('KeyU');
    await page.waitForTimeout(900);
    hpAfter = Number(await page.getByTestId('p2-hp').innerText());
  }
  expect(hpAfter).toBeLessThan(hpBefore);
  await expect(page.getByTestId('match-phase')).toHaveText('fighting');
});

test('uses single tap for jump/crouch and double tap for lane movement', async ({ page }) => {
  await startFight(page, true);
  const zBefore = zFromPosition(await page.getByTestId('p1-position').innerText());

  for (let attempt = 0; attempt < 3 && (await page.getByTestId('p1-state').innerText()) !== 'jump'; attempt += 1) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(500);
    if ((await page.getByTestId('p1-state').innerText()) !== 'jump') {
      await page.keyboard.up('KeyW');
      await page.waitForTimeout(250);
    }
  }
  await expect(page.getByTestId('p1-state')).toHaveText('jump');
  expect(Number(await page.getByTestId('p1-height').innerText())).toBeGreaterThan(0.15);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(1250);

  const zBeforeCrouch = zFromPosition(await page.getByTestId('p1-position').innerText());
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('p1-state')).toHaveText('crouch');
  expect(zFromPosition(await page.getByTestId('p1-position').innerText())).toBeCloseTo(zBeforeCrouch, 1);
  await page.keyboard.up('KeyS');

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(160);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(160);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  const afterDoubleTap = zFromPosition(await page.getByTestId('p1-position').innerText());
  expect(afterDoubleTap).toBeLessThan(zBefore - 0.35);

  const p2Before = zFromPosition(await page.getByTestId('p2-position').innerText());
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(160);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(160);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowUp');
  const p2After = zFromPosition(await page.getByTestId('p2-position').innerText());
  expect(Math.abs(p2After - p2Before)).toBeGreaterThan(0.45);
  expect(p2After).toBeGreaterThanOrEqual(-2.1);
});
