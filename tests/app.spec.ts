import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function gotoTitle(page: Page) {
  await page.goto('/');
  await expect(page.locator('.title-screen')).toBeVisible({ timeout: 5000 });
}

async function startFromSplash(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('.title-screen').click();
}

async function expectMainMenu(page: Page) {
  await expect(page.getByRole('button', { name: 'Arcade' })).toBeVisible({ timeout: 5000 });
}

async function dispatchRawTouch(page: Page, selector: string) {
  await page.locator(selector).dispatchEvent('touchstart', { bubbles: true, cancelable: true });
  await page.dispatchEvent('body', 'touchend', { bubbles: true, cancelable: true });
}

async function dispatchTouchPointer(page: Page, selector: string) {
  await page.locator(selector).dispatchEvent('pointerdown', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true
  });
  await page.dispatchEvent('body', 'pointerup', {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true
  });
}

async function installMockGamepad(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => {
        const state = (window as unknown as { __koreMockGamepadPressed?: boolean }).__koreMockGamepadPressed;
        return state
          ? [{ connected: true, buttons: [{ pressed: true }], axes: [0, 0] }]
          : [];
      }
    });
  });
}

async function setMockGamepadPressed(page: Page, pressed: boolean) {
  await page.evaluate((nextPressed) => {
    (window as unknown as { __koreMockGamepadPressed?: boolean }).__koreMockGamepadPressed = nextPressed;
  }, pressed);
}

async function startFight(page: import('@playwright/test').Page, local2p = false) {
  await startFromSplash(page);
  await page.getByRole('button', { name: local2p ? 'Versus' : 'Arcade' }).click({ force: true });
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  const versusSplash = page.locator('.fight-versus-screen');
  await expect(versusSplash).toBeVisible({ timeout: 3000 });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 12000 });
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 2000 });
  const fightScreen = page.locator('.fight-screen');
  await page.waitForTimeout(4200);
  await fightScreen.click({ position: { x: 24, y: 24 } });
  await fightScreen.focus();
}

async function startTraining(page: import('@playwright/test').Page) {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Training' }).click({ force: true });
  await expect(page.locator('.training-select-screen')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Training mode' })).toContainText('Training');
  await page.getByRole('button', { name: 'Start Training' }).click();
  await expect(page.getByTestId('match-mode')).toHaveText('training', { timeout: 12000 });
  await page.waitForTimeout(4200);
  const fightScreen = page.locator('.fight-screen');
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

async function setKeys(page: import('@playwright/test').Page, codes: string[], pressed: boolean) {
  await page.evaluate(
    ({ codes, type }) => {
      for (const code of codes) {
        const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
        const event = new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        window.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
      }
    },
    { codes, type: pressed ? 'keydown' : 'keyup' }
  );
}

async function keyDown(page: import('@playwright/test').Page, code: string) {
  await setKey(page, code, true);
}

async function keyUp(page: import('@playwright/test').Page, code: string) {
  await setKey(page, code, false);
}

function keysForCounterHitTrialName(name: string) {
  const keyByButton: Record<string, string> = {
    '1': 'KeyU',
    '2': 'KeyI',
    '3': 'KeyJ',
    '4': 'KeyK'
  };
  const command = name.match(/(?:Lv\s+\d+\s+)?(.+?)\s+Counter Hit/i)?.[1]?.trim() ?? '1+2';
  const keys = new Set<string>();
  if (/\bf\+/.test(command) || command.includes('d/f')) keys.add('KeyD');
  if (/\bb\+/.test(command) || command.includes('d/b')) keys.add('KeyA');
  if (/\bd\+/.test(command) || command.includes('d/f') || command.includes('d/b')) keys.add('KeyS');
  for (const button of command.match(/[1-4]/g) ?? ['1', '2']) keys.add(keyByButton[button]);
  return [...keys].filter(Boolean);
}

test('title splash accepts click, touch pointer, and raw touch input', async ({ page }) => {
  const scenarios: Array<[string, () => Promise<void>]> = [
    ['click', async () => page.locator('.title-screen').click()],
    ['touch pointer', async () => dispatchTouchPointer(page, '.title-screen')],
    ['raw touchstart', async () => dispatchRawTouch(page, '.title-screen')]
  ];

  for (const [name, activate] of scenarios) {
    await test.step(name, async () => {
      await gotoTitle(page);
      await activate();
      await expectMainMenu(page);
    });
  }
});

test('title splash accepts keyboard input', async ({ page }) => {
  await gotoTitle(page);
  await page.locator('.title-screen').press('Enter');
  await expectMainMenu(page);
});

test('title splash accepts browser gamepad input', async ({ page }) => {
  await installMockGamepad(page);
  await gotoTitle(page);
  await setMockGamepadPressed(page, true);
  await expectMainMenu(page);
});

test('versus splash accepts touch input to skip into the fight', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Arcade' }).click({ force: true });
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  await expect(page.locator('.fight-versus-screen')).toBeVisible({ timeout: 3000 });

  await dispatchRawTouch(page, '.fight-versus-screen');

  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 12000 });
});

test('versus splash accepts browser gamepad input to skip into the fight', async ({ page }) => {
  await installMockGamepad(page);
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Arcade' }).click({ force: true });
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  await expect(page.locator('.fight-versus-screen')).toBeVisible({ timeout: 3000 });

  await setMockGamepadPressed(page, true);

  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 12000 });
});

test('starts a playable match from the menu', async ({ page }) => {
  await startFight(page);
  await expect(page.getByTestId('fight-canvas')).toBeVisible();
  await expect(page.locator('.fight-hud')).toBeVisible();
});

test('defaults character and stage select to random slots', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Versus' }).click();

  const randomCharacter = page.getByRole('button', { name: /Select random Player 1/i });
  await expect(randomCharacter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.versus-hero-left .versus-hero-name')).toHaveText('Random');

  const firstRealCharacter = page.locator('.versus-roster-tile:not(.versus-random-tile)').first();
  await firstRealCharacter.click();
  await expect(randomCharacter).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.versus-hero-left .versus-hero-name')).not.toHaveText('Random');

  await page.getByRole('button', { name: 'Stage' }).click();
  const randomStage = page.getByRole('button', { name: 'Select random stage' });
  await expect(randomStage).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.stage-hero-label strong')).toHaveText('Random');

  const firstRealStage = page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first();
  await firstRealStage.click();
  await expect(randomStage).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.stage-hero-label strong')).not.toHaveText('Random');

  const firstStageName = (await page.locator('.stage-hero-label strong').textContent())?.trim() ?? '';
  await page.getByRole('button', { name: 'Next stage' }).click();
  await expect(page.locator('.stage-hero-label strong')).not.toHaveText(firstStageName);
  const nextStageName = (await page.locator('.stage-hero-label strong').textContent())?.trim() ?? '';
  await expect(page.locator('.stage-thumbnail.is-selected strong')).toHaveText(nextStageName);

  await page.getByRole('button', { name: 'Previous stage' }).click();
  await expect(page.locator('.stage-hero-label strong')).toHaveText(firstStageName);

  await page.keyboard.press('p');
  await expect(page.locator('.stage-hero-label strong')).toHaveText(nextStageName);
  await page.keyboard.press('o');
  await expect(page.locator('.stage-hero-label strong')).toHaveText(firstStageName);
});

test('shows ranked mode and ranked profile card from character select', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('kore.online.profile', JSON.stringify({ playerId: 'ranked-test-player', displayName: 'RANKTEST' }));
  });
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Online' }).click({ force: true });
  await page.getByRole('button', { name: 'Next match mode' }).click();

  await expect(page.getByRole('group', { name: 'Match mode' })).toContainText('Ranked');
  await expect(page.getByRole('button', { name: 'Profile Card' })).toBeVisible();
  await page.getByRole('button', { name: 'Profile Card' }).click();
  await expect(page.getByRole('heading', { name: 'RANKTEST' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stats' })).toBeVisible();
  await expect(page.getByText(/1,200 KP - Unranked/)).toBeVisible();
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('No ranked matches yet.')).toBeVisible();
});

test('opens controls and character viewer', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(page.getByRole('button', { name: 'Controls' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Characters' }).click();
  await expect(page.getByTestId('character-viewer-canvas')).toBeVisible();
  await expect(page.getByTestId('generate-height-sheet')).toBeVisible();
  const heightSheetPopupPromise = page.waitForEvent('popup');
  await page.getByTestId('generate-height-sheet').click({ force: true });
  const heightSheetPopup = await heightSheetPopupPromise;
  await expect(heightSheetPopup.getByRole('heading', { name: 'Character Height Sheet' })).toBeVisible({ timeout: 30000 });
  await expect(heightSheetPopup.getByTestId('height-sheet-card').first()).toBeVisible();
  await expect(heightSheetPopup.getByTestId('height-sheet-dimensions').filter({ hasText: /px/ }).first()).toBeVisible({ timeout: 30000 });
  await expect(heightSheetPopup.getByTestId('height-sheet-voxel-dimensions').filter({ hasText: /w x .*h/ }).first()).toBeVisible({ timeout: 30000 });
  await heightSheetPopup.close();
  await expect(page.getByTestId('generate-height-sheet')).toBeEnabled();
  await expect(page.getByTestId('generate-frame-sheet')).toBeVisible();
  let manifestSaveCount = 0;
  await page.route('**/__kore/dev/save-character-manifest', async (route) => {
    manifestSaveCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, characterId: 'kiro', manifestPath: 'playwright-stub' })
    });
  });
  await expect(page.getByTestId('character-width-slider')).toBeVisible();
  await expect(page.getByTestId('character-height-slider')).toBeVisible();
  await expect(page.getByTestId('animation-width-slider')).toBeHidden();
  await expect(page.getByTestId('toggle-idle-ghost')).toBeVisible();
  await page.getByTestId('toggle-idle-ghost').click();
  await expect(page.getByTestId('toggle-idle-ghost')).toHaveClass(/active-tool/);
  await expect(page.getByTestId('toggle-idle-ghost-side-view')).toBeVisible();
  await page.getByTestId('toggle-idle-ghost-side-view').click();
  await expect(page.getByTestId('toggle-idle-ghost-side-view')).toHaveClass(/active-tool/);
  await expect(page.getByTestId('idle-ghost-side-view')).toBeVisible();
  await page.getByTestId('character-width-input').fill('1.25');
  await expect(page.getByTestId('idle-ghost-side-view')).toContainText('1.25w');
  await page.getByTestId('toggle-idle-ghost-side-view').click();
  await expect(page.getByTestId('toggle-idle-ghost-side-view')).not.toHaveClass(/active-tool/);
  await expect(page.getByTestId('character-width-slider')).toHaveValue('1.25');
  await page.getByTestId('toggle-animation-editor').click();
  const timingEditor = page.getByLabel('Animation timing editor');
  await expect(timingEditor).toBeVisible();
  await timingEditor.getByRole('spinbutton', { name: 'FPS' }).fill('12');
  await expect(page.getByTestId('animation-speed-input')).toHaveValue('12');
  await page.getByTestId('toggle-animation-editor').click();
  await page.getByTestId('viewer-pose-jableft').click();
  await expect(page.getByTestId('viewer-pose-jableft')).toHaveClass(/active/);
  await expect(page.getByTestId('toggle-idle-ghost')).toHaveClass(/active-tool/);
  await page.getByTestId('toggle-animation-editor').click();
  await expect(page.getByTestId('character-width-slider')).toBeHidden();
  await expect(page.getByTestId('animation-width-slider')).toBeVisible();
  await expect(page.getByTestId('animation-height-slider')).toBeVisible();
  await page.getByLabel('Frame mode').check();
  const ratioLock = page.getByTestId('animation-scale-ratio-lock');
  if (!(await ratioLock.isChecked())) {
    await page.getByTestId('animation-width-input').fill(await page.getByTestId('animation-height-input').inputValue());
  }
  await expect(ratioLock).toBeChecked();
  await page.getByTestId('animation-width-input').fill('1.17');
  await expect(page.getByTestId('animation-width-input')).toHaveValue('1.17');
  await expect(page.getByTestId('animation-height-input')).toHaveValue('1.17');
  const savesBeforeUnlock = manifestSaveCount;
  await ratioLock.uncheck();
  await expect(ratioLock).not.toBeChecked();
  await expect.poll(() => manifestSaveCount).toBeGreaterThan(savesBeforeUnlock);
  await expect(page.getByTestId('save-character-manifest')).toBeEnabled();
  await expect(ratioLock).not.toBeChecked();
  const unlockedHeight = await page.getByTestId('animation-height-input').inputValue();
  const unlockedWidth = unlockedHeight === '1.22' ? '1.31' : '1.22';
  await page.getByTestId('animation-width-input').fill(unlockedWidth);
  await expect(page.getByTestId('animation-width-input')).toHaveValue(unlockedWidth);
  await expect(page.getByTestId('animation-height-input')).toHaveValue(unlockedHeight);
  await page.getByTestId('toggle-animation-editor').click();
  await page.getByRole('button', { name: 'Rotate' }).click();
  await page.getByTestId('viewer-zoom-in').click();
  await expect(page.getByTestId('viewer-zoom-slider')).toHaveValue('0.46');
  await page.getByTestId('viewer-zoom-out').click();
  await expect(page.getByTestId('viewer-zoom-slider')).toHaveValue('0.28');
});

test('opens tournament mode above characters and shows paid beta disabled', async ({ page }) => {
  await startFromSplash(page);
  const tournamentButton = page.getByRole('button', { name: 'Tournament' });
  const charactersButton = page.getByRole('button', { name: 'Characters' });
  await expect(tournamentButton).toBeVisible();
  await expect(charactersButton).toBeVisible();
  expect((await tournamentButton.boundingBox())!.y).toBeLessThan((await charactersButton.boundingBox())!.y);

  await tournamentButton.click();
  await expect(page.locator('.tournament-select-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: /\$2 BTC/i })).toBeDisabled();
  await expect(page.getByText('Paid beta unavailable')).toBeVisible();
});

test('starts a free local tournament with bracket intro', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Tournament' }).click();
  await page.getByRole('button', { name: 'Start Free' }).click();
  await expect(page.locator('.tournament-bracket-intro')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Winner Advances')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-mode')).toHaveText('tournamentLocal', { timeout: 12000 });
});

test('enters a free online tournament lobby', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Tournament' }).click();
  await page.getByRole('button', { name: /^ONLINE/i }).click();
  await page.getByRole('button', { name: 'Enter Online' }).click();
  await expect(page.locator('.tournament-lobby-screen')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/entered|Choose a tournament|Tournament unavailable/i)).toBeVisible();
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

test('opens training modes, starts a basic trial, and previews combo routes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Keyboard training-trial route is covered by the desktop project');
  await startTraining(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Training Mode' })).toBeVisible();

  await page.getByRole('button', { name: /Basics/ }).click();
  await expect(page.getByRole('button', { name: /Walk In/ })).toBeVisible();
  await page.getByRole('button', { name: /Walk In/ }).click();
  await expect(page.locator('.zoro-trainer-callout')).toBeVisible();
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(page.locator('.training-trial-hud')).toContainText('Walk In');
  await page.waitForTimeout(230);
  await keyDown(page, 'KeyD');
  await page.waitForTimeout(150);
  await keyUp(page, 'KeyD');
  await expect(page.locator('.training-trial-hud')).toContainText('Walk In');

  await page.locator('.fight-screen').click({ position: { x: 24, y: 24 } });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Training Mode' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: /Combos/ }).click();
  await expect(page.locator('.combo-trial-list')).toContainText('Combos');
  const groundedLauncherTrial = page.getByRole('button', { name: /Grounded Launcher/i }).first();
  await expect(groundedLauncherTrial).toBeVisible();
  await groundedLauncherTrial.click();
  await expect(page.getByRole('button', { name: 'Preview' })).toBeEnabled();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.training-trial-hud')).toContainText('Preview');
  await expect(page.locator('.training-trial-hud')).not.toContainText('↑');
  await expect(page.locator('.training-trial-hud')).toBeHidden({ timeout: 12000 });
});

test('opens training combo trials and shows counter-hit progress', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Keyboard combo-trial route is covered by the desktop project');
  await startTraining(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await page.getByRole('button', { name: /Combos/ }).click();
  const counterHitTrial = page.getByRole('button', { name: /Counter Hit/i }).first();
  test.skip(await counterHitTrial.count() === 0, 'Selected training character has no counter-hit combo route');
  await expect(counterHitTrial).toBeVisible();
  const trialKeys = keysForCounterHitTrialName(await counterHitTrial.innerText());
  await counterHitTrial.click();
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(page.locator('.training-trial-hud')).toBeVisible();
  await setKeys(page, trialKeys, true);
  await page.waitForTimeout(260);
  await setKeys(page, trialKeys.reverse(), false);

  await expect(page.getByTestId('last-impact-kind')).toHaveText('counterHit', { timeout: 5000 });
  await expect(page.locator('.counter-hit-line')).toContainText('Counter Hit', { timeout: 5000 });
});
