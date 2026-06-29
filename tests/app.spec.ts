import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function startFromSplash(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('.title-screen').click();
}

async function startFight(page: import('@playwright/test').Page, local2p = false) {
  await startFromSplash(page);
  await page.getByRole('button', { name: local2p ? 'Versus' : 'Arcade' }).click();
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  const versusSplash = page.locator('.fight-versus-screen');
  await expect(versusSplash).toBeVisible({ timeout: 3000 });
  await versusSplash.click();
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 7000 });
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 2000 });
  const fightScreen = page.locator('.fight-screen');
  await page.waitForTimeout(4200);
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

async function touchHold(page: Page, testId: string, duration: number) {
  const target = page.getByTestId(testId);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing touch target box for ${testId}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
  });
  await page.waitForTimeout(duration);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await client.detach();
}

function keyValue(code: string) {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  return code;
}

async function setKey(page: import('@playwright/test').Page, code: string, pressed: boolean) {
  await page.evaluate(
    ({ code, key, type }) => {
      const event = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
    },
    { code, key: keyValue(code), type: pressed ? 'keydown' : 'keyup' }
  );
}

async function keyDown(page: import('@playwright/test').Page, code: string) {
  await setKey(page, code, true);
}

async function keyUp(page: import('@playwright/test').Page, code: string) {
  await setKey(page, code, false);
}

test('starts a playable match from the menu', async ({ page }) => {
  await startFight(page);
  await expect(page.getByTestId('fight-canvas')).toBeVisible();
  await expect(page.locator('.fight-hud')).toBeVisible();
});

test('opens controls and character viewer', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(page.getByRole('button', { name: 'Controls' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Characters' }).click();
  await expect(page.getByTestId('character-viewer-canvas')).toBeVisible();
  await page.getByTestId('viewer-pose-jableft').click();
  await expect(page.getByTestId('viewer-pose-jableft')).toHaveClass(/active/);
  await page.getByRole('button', { name: 'Rotate' }).click();
  await page.getByTestId('viewer-zoom-in').click();
  await expect(page.getByTestId('viewer-zoom-slider')).toHaveValue('0.46');
  await page.getByTestId('viewer-zoom-out').click();
  await expect(page.getByTestId('viewer-zoom-slider')).toHaveValue('0.28');
});

test('moves player one forward and back with keyboard', async ({ page }) => {
  await startFight(page, true);
  const before = xFromPosition(await page.getByTestId('p1-position').innerText());
  await keyDown(page, 'KeyD');
  await expect.poll(async () => {
    await keyDown(page, 'KeyD');
    return xFromPosition(await page.getByTestId('p1-position').innerText());
  }, { timeout: 6000 }).toBeGreaterThan(before + 0.25);
  await keyUp(page, 'KeyD');
  const afterForward = xFromPosition(await page.getByTestId('p1-position').innerText());

  await keyDown(page, 'KeyA');
  await expect.poll(async () => {
    await keyDown(page, 'KeyA');
    return xFromPosition(await page.getByTestId('p1-position').innerText());
  }, { timeout: 6000 }).toBeLessThan(afterForward - 0.12);
  await keyUp(page, 'KeyA');
  const afterBack = xFromPosition(await page.getByTestId('p1-position').innerText());
  expect(afterBack).toBeLessThan(afterForward - 0.12);
});

test('lets player one close distance, hit, and continue without pausing', async ({ page }) => {
  await startFight(page, true);
  await keyDown(page, 'KeyD');
  await expect.poll(async () => {
    await keyDown(page, 'KeyD');
    return xFromPosition(await page.getByTestId('p1-position').innerText());
  }, { timeout: 6000 }).toBeGreaterThan(-0.2);
  await keyUp(page, 'KeyD');
  const hpBefore = Number(await page.getByTestId('p2-hp').innerText());
  let hpAfter = hpBefore;
  const attackKeys = ['KeyU', 'KeyI', 'KeyJ', 'KeyK'];
  for (let attempt = 0; attempt < 8 && hpAfter >= hpBefore; attempt += 1) {
    const attackKey = attackKeys[attempt % attackKeys.length];
    await keyDown(page, attackKey);
    await page.waitForTimeout(260);
    await keyUp(page, attackKey);
    await page.waitForTimeout(900);
    hpAfter = Number(await page.getByTestId('p2-hp').innerText());
  }
  expect(hpAfter).toBeLessThan(hpBefore);
  await expect(page.getByTestId('match-phase')).toHaveText('fighting');
});

test('uses single tap for jump/crouch and double tap for lane movement', async ({ page }) => {
  await startFight(page, true);
  const zBefore = zFromPosition(await page.getByTestId('p1-position').innerText());

  await keyDown(page, 'KeyW');
  await expect.poll(async () => {
    await keyDown(page, 'KeyW');
    return Number(await page.getByTestId('p1-height').innerText());
  }, { timeout: 3000 }).toBeGreaterThan(0.15);
  await expect(page.getByTestId('p1-state')).toHaveText('jump');
  await keyUp(page, 'KeyW');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 12000 }).toBeLessThan(0.04);

  const zBeforeCrouch = zFromPosition(await page.getByTestId('p1-position').innerText());
  await keyDown(page, 'KeyS');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('p1-state')).toHaveText('crouch');
  expect(zFromPosition(await page.getByTestId('p1-position').innerText())).toBeCloseTo(zBeforeCrouch, 1);
  await keyUp(page, 'KeyS');
  await expect(page.getByTestId('p1-state')).not.toHaveText('crouch', { timeout: 3000 });

  await keyDown(page, 'KeyW');
  await page.waitForTimeout(160);
  await keyUp(page, 'KeyW');
  await page.waitForTimeout(160);
  await keyDown(page, 'KeyW');
  await page.waitForTimeout(1000);
  await keyUp(page, 'KeyW');
  const afterDoubleTap = zFromPosition(await page.getByTestId('p1-position').innerText());
  expect(afterDoubleTap).toBeLessThan(zBefore - 0.35);

  const p2Before = zFromPosition(await page.getByTestId('p2-position').innerText());
  await keyDown(page, 'ArrowUp');
  await page.waitForTimeout(160);
  await keyUp(page, 'ArrowUp');
  await page.waitForTimeout(160);
  await keyDown(page, 'ArrowUp');
  await page.waitForTimeout(1000);
  await keyUp(page, 'ArrowUp');
  const p2After = zFromPosition(await page.getByTestId('p2-position').innerText());
  expect(Math.abs(p2After - p2Before)).toBeGreaterThan(0.45);
  expect(p2After).toBeGreaterThanOrEqual(-3.6);
});

test('mobile touch controls drive movement and attacks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Requires coarse pointer mobile viewport');
  await startFight(page, true);
  await expect(page.locator('.touch-controls')).toBeVisible();
  const before = xFromPosition(await page.getByTestId('p1-position').innerText());

  await touchHold(page, 'touch-right', 900);

  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 3000 }).toBeGreaterThan(before + 0.18);

  await touchHold(page, 'touch-jab', 220);
  await expect(page.getByTestId('last-input')).toHaveText('p1:jab');
});
