import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const STARTER_GUIDE_DISMISSED_KEY = 'kore.starterGuide.dismissed.v1';

async function gotoTitle(page: Page) {
  await page.goto('/');
  await expect(page.locator('.title-screen')).toBeVisible({ timeout: 5000 });
}

async function mockInitialWebGLSupport(page: Page, supported: boolean) {
  await page.addInitScript((isSupported) => {
    (window as typeof window & {
      __KORE_TEST_SUPPORT_WARNING__?: { level: 'caution' | 'unsupported'; reason: string } | null;
    }).__KORE_TEST_SUPPORT_WARNING__ = isSupported ? null : { level: 'unsupported', reason: 'webgl-unavailable' };
  }, supported);
}

async function forceMenuLagDetection(page: Page) {
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const result = originalMatchMedia(query);
      if (query !== '(pointer: coarse)') return result;
      return {
        ...result,
        matches: false
      } as MediaQueryList;
    };
    Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
    Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
    (window as typeof window & {
      __KORE_FORCE_MENU_LAG_RESULT__?: unknown;
    }).__KORE_FORCE_MENU_LAG_RESULT__ = {
      laggy: true,
      reasons: ['forced'],
      stats: {
        sampleMs: 3200,
        frameCount: 90,
        averageMs: 36,
        p95Ms: 42,
        p99Ms: 76,
        maxMs: 96,
        averageFps: 27.8,
        longTaskCount: 2,
        longTaskTotalMs: 140,
        longestLongTaskMs: 80
      }
    };
  });
}

async function forceMenuLagHealthy(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & {
      __KORE_FORCE_MENU_LAG_RESULT__?: unknown;
    }).__KORE_FORCE_MENU_LAG_RESULT__ = false;
  });
}

async function startFromSplash(page: Page, options: { dismissStarterGuide?: boolean } = {}) {
  const dismissStarterGuide = options.dismissStarterGuide ?? true;
  await page.goto('/');
  if (dismissStarterGuide) {
    await page.evaluate((key) => window.localStorage.setItem(key, '1'), STARTER_GUIDE_DISMISSED_KEY);
  }
  await activateAnyInputScreen(page, '.title-screen');
  await expectMainMenu(page);
}

async function expectMainMenu(page: Page) {
  await expect(page.getByRole('button', { name: 'Arcade' })).toBeVisible({ timeout: 10000 });
}

async function expectNoHdProceduralFallback(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __KORE_HD_VOXEL_PROCEDURAL_FALLBACKS__?: number }).__KORE_HD_VOXEL_PROCEDURAL_FALLBACKS__ ?? 0)).toBe(0);
}

async function activateAnyInputScreen(page: Page, selector: string) {
  const target = page.locator(selector);
  await expect(target).toBeVisible({ timeout: 10_000 });
  await target.dispatchEvent('pointerdown', {
    pointerId: 97,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true
  }).catch(() => undefined);
  await page.dispatchEvent('body', 'pointerup', {
    pointerId: 97,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true
  }).catch(() => undefined);
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

async function installMockGamepad(page: Page, idleFirst = false) {
  await page.addInitScript((includeIdleFirst) => {
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => {
        const testWindow = window as unknown as {
          __koreMockGamepadConnected?: boolean;
          __koreMockGamepadPressed?: boolean;
          __koreMockGamepadButtons?: boolean[];
          __koreMockGamepadAxes?: [number, number];
        };
        const connected = testWindow.__koreMockGamepadConnected ?? testWindow.__koreMockGamepadPressed;
        if (!connected) return [];
        const pressedButtons = testWindow.__koreMockGamepadButtons ?? [];
        if (testWindow.__koreMockGamepadPressed) pressedButtons[0] = true;
        const activePad = {
          id: 'Sparse Slot Test Gamepad',
          index: 1,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: Boolean(pressedButtons[index]), touched: Boolean(pressedButtons[index]), value: pressedButtons[index] ? 1 : 0 })),
          axes: testWindow.__koreMockGamepadAxes ?? [0, 0]
        };
        if (!includeIdleFirst) return [null, activePad];
        return [{
          id: 'Idle Low Index Test Gamepad',
          index: 0,
          connected: true,
          mapping: 'standard',
          timestamp: performance.now(),
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
          axes: [0, 0]
        }, activePad];
      }
    });
  }, idleFirst);
}

async function setMockGamepadPressed(page: Page, pressed: boolean) {
  await page.evaluate((nextPressed) => {
    (window as unknown as { __koreMockGamepadPressed?: boolean }).__koreMockGamepadPressed = nextPressed;
  }, pressed);
}

async function setMockGamepadButton(page: Page, buttonIndex: number, pressed: boolean) {
  await page.evaluate(
    ({ buttonIndex, pressed }) => {
      const testWindow = window as unknown as {
        __koreMockGamepadConnected?: boolean;
        __koreMockGamepadButtons?: boolean[];
      };
      testWindow.__koreMockGamepadConnected = true;
      const buttons = [...(testWindow.__koreMockGamepadButtons ?? [])];
      buttons[buttonIndex] = pressed;
      testWindow.__koreMockGamepadButtons = buttons;
    },
    { buttonIndex, pressed }
  );
}

async function tapMockGamepadButton(page: Page, buttonIndex: number) {
  await setMockGamepadButton(page, buttonIndex, true);
  await page.waitForTimeout(120);
  await setMockGamepadButton(page, buttonIndex, false);
  await page.waitForTimeout(120);
}

async function startFight(page: import('@playwright/test').Page, local2p = false) {
  await startFromSplash(page);
  await page.getByRole('button', { name: local2p ? 'Versus' : 'Arcade' }).click({ force: true });
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first().click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  await expect(page.getByTestId('asset-warmup-screen')).toBeVisible({ timeout: 3000 });
  const versusSplash = page.locator('.fight-versus-screen');
  await expect(versusSplash).toBeVisible({ timeout: 8000 });
  await activateAnyInputScreen(page, '.fight-versus-screen');
  await expect(page.getByTestId('asset-warmup-screen')).toBeVisible({ timeout: 3000 });
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
  await expect(page.getByTestId('asset-warmup-screen')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('Ready', { timeout: 12000 });
  await activateAnyInputScreen(page, '[data-testid="asset-warmup-screen"]');
  await expect(page.getByTestId('match-mode')).toHaveText('training', { timeout: 12000 });
  await page.waitForTimeout(4200);
  const fightScreen = page.locator('.fight-screen');
  await fightScreen.click({ position: { x: 24, y: 24 } });
  await fightScreen.focus();
}

async function expectDocumentLocked(page: Page) {
  const metrics = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    return {
      scrollHeight: scrollingElement.scrollHeight,
      clientHeight: scrollingElement.clientHeight
    };
  });
  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 2);
}

async function expectLoadingInterstitialFitsSteamDeck(interstitial: Locator) {
  const result = await interstitial.evaluate((screen) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const copy = screen.querySelector<HTMLElement>('.arcade-transition-copy');
    const heading = screen.querySelector<HTMLElement>('.arcade-transition-copy h1');
    const stats = screen.querySelector<HTMLElement>('.arcade-transition-stats');
    const footer = screen.querySelector<HTMLElement>('.arcade-transition-footer');
    if (!copy || !heading || !stats || !footer) return { ok: false, reason: 'missing-elements' };
    const copyRect = copy.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const statsRect = stats.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const screenRect = screen.getBoundingClientRect();
    const footerGap = footerRect.top - copyRect.bottom;
    return {
      ok:
        copyRect.left >= 12 &&
        copyRect.top >= 12 &&
        copyRect.top <= 48 &&
        copyRect.right <= viewportWidth - 12 &&
        copyRect.bottom <= viewportHeight - 52 &&
        headingRect.left >= copyRect.left - 1 &&
        headingRect.right <= copyRect.right + 1 &&
        statsRect.left >= copyRect.left - 1 &&
        statsRect.right <= copyRect.right + 1 &&
        footerRect.right <= viewportWidth - 12 &&
        footerRect.bottom <= viewportHeight - 10 &&
        footerGap >= 8,
      viewportWidth,
      viewportHeight,
      screen: { left: screenRect.left, right: screenRect.right, top: screenRect.top, bottom: screenRect.bottom, height: screenRect.height },
      copy: { left: copyRect.left, right: copyRect.right, top: copyRect.top, bottom: copyRect.bottom },
      heading: { left: headingRect.left, right: headingRect.right },
      stats: { left: statsRect.left, right: statsRect.right },
      footer: { right: footerRect.right, bottom: footerRect.bottom, top: footerRect.top },
      footerStyle: { bottom: getComputedStyle(footer).bottom, position: getComputedStyle(footer).position },
      footerGap
    };
  });
  expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
}

async function readSelectScrollMetrics(page: Page) {
  return page.getByTestId('select-roster-scroll').evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    tileHeights: Array.from(element.querySelectorAll<HTMLElement>('.versus-roster-tile')).map((tile) => tile.getBoundingClientRect().height),
    visibleImages: Array.from(element.querySelectorAll<HTMLImageElement>('.versus-roster-tile img')).filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }).length
  }));
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
  const client = await startTouch(page, testId);
  await page.waitForTimeout(duration);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await client.detach();
}

async function startTouch(page: Page, testId: string, id = 1) {
  const point = await touchPoint(page, testId, id);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point]
  });
  return client;
}

async function touchPoint(page: Page, testId: string, id: number) {
  const target = page.getByTestId(testId);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing touch target box for ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, id, radiusX: 8, radiusY: 8, force: 1 };
}

async function expectNoHeldFightInput(page: Page) {
  await expect.poll(async () => page.getByTestId('frame-input').innerText(), { timeout: 3_000 }).toBe('none');
}

async function setFightPositions(page: Page, positions: { p1?: { x?: number; y?: number; z?: number }; p2?: { x?: number; y?: number; z?: number } }) {
  await page.evaluate((nextPositions) => {
    const testWindow = window as typeof window & {
      __koreE2ESetFightPositions?: (value: typeof nextPositions) => void;
    };
    if (!testWindow.__koreE2ESetFightPositions) throw new Error('Missing KORE e2e fight-position hook');
    testWindow.__koreE2ESetFightPositions(nextPositions);
  }, positions);
}

async function forceMatchOver(page: Page, winnerSlot: 1 | 2 = 1) {
  await page.evaluate((nextWinnerSlot) => {
    const testWindow = window as typeof window & {
      __koreE2EForceMatchOver?: (winnerSlot?: 1 | 2) => void;
    };
    if (!testWindow.__koreE2EForceMatchOver) throw new Error('Missing KORE e2e match-over hook');
    testWindow.__koreE2EForceMatchOver(nextWinnerSlot);
  }, winnerSlot);
}

async function completeActiveTrainingTrial(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __koreE2ECompleteTrainingTrial?: () => void };
    if (!testWindow.__koreE2ECompleteTrainingTrial) throw new Error('Missing KORE e2e training completion hook');
    testWindow.__koreE2ECompleteTrainingTrial();
  });
}

async function fightSessionId(page: Page) {
  const value = await page.locator('.fight-screen').getAttribute('data-fight-session-id');
  if (value === null) throw new Error('Missing fight session id');
  return value;
}

async function expectSuccessPanelFitsViewport(page: Page) {
  const result = await page.getByTestId('training-success-overlay').evaluate((overlay) => {
    const panel = overlay.querySelector<HTMLElement>('.training-success-panel');
    const heading = overlay.querySelector<HTMLElement>('.training-success-panel h2');
    const actions = overlay.querySelector<HTMLElement>('.training-success-actions');
    if (!panel || !heading || !actions) return { ok: false, reason: 'missing-elements' };
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelRect = panel.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const actionsRect = actions.getBoundingClientRect();
    return {
      ok:
        panelRect.left >= -1 &&
        panelRect.right <= viewportWidth + 1 &&
        panelRect.top >= -1 &&
        panelRect.bottom <= viewportHeight + 1 &&
        headingRect.left >= panelRect.left - 1 &&
        headingRect.right <= panelRect.right + 1 &&
        actionsRect.left >= panelRect.left - 1 &&
        actionsRect.right <= panelRect.right + 1,
      viewportWidth,
      viewportHeight,
      panel: { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom },
      heading: { left: headingRect.left, right: headingRect.right },
      actions: { left: actionsRect.left, right: actionsRect.right }
    };
  });
  expect(result).toMatchObject({ ok: true });
}

async function expectTrainingModeTabsHaveReadableSpacing(page: Page) {
  const result = await page.locator('.training-mode-switch').evaluate((switcher) => {
    const buttons = [...switcher.querySelectorAll<HTMLButtonElement>('button')];
    return buttons.map((button) => {
      const label = button.querySelector<HTMLElement>(':scope > span');
      const count = button.querySelector<HTMLElement>(':scope > small');
      const labelRange = label ? document.createRange() : null;
      if (labelRange && label?.firstChild) labelRange.selectNodeContents(label);
      const labelLines = labelRange ? [...labelRange.getClientRects()].map((rect) => ({
        top: rect.top,
        bottom: rect.bottom
      })) : [];
      labelRange?.detach();
      const labelRect = label?.getBoundingClientRect();
      const countRect = count?.getBoundingClientRect();
      const lineOverlap = labelLines.some((rect, index) => (
        index > 0 && rect.top < labelLines[index - 1].bottom - 1
      ));
      return {
        text: button.innerText,
        lineOverlap,
        countGap: labelRect && countRect ? countRect.top - labelRect.bottom : null
      };
    });
  });
  expect(result).toEqual(expect.arrayContaining([
    expect.objectContaining({ text: expect.stringContaining('Free Training'), lineOverlap: false }),
    expect.objectContaining({ text: expect.stringContaining('Basic Trials'), lineOverlap: false }),
    expect.objectContaining({ text: expect.stringContaining('Combo Trials'), lineOverlap: false })
  ]));
  for (const tab of result) {
    expect(tab.lineOverlap, tab.text).toBe(false);
    if (tab.countGap !== null) expect(tab.countGap, tab.text).toBeGreaterThanOrEqual(4);
  }
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

async function doubleTapPhysicalKey(page: import('@playwright/test').Page, key: string, gapMs = 90) {
  await page.keyboard.down(key);
  await page.waitForTimeout(70);
  await page.keyboard.up(key);
  await page.waitForTimeout(gapMs);
  await page.keyboard.down(key);
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

test('controller select toggles main menu chrome only after release', async ({ page }) => {
  await installMockGamepad(page);
  await startFromSplash(page);

  await setMockGamepadButton(page, 8, true);
  await expect(page.locator('.menu-screen')).toHaveClass(/is-chrome-hidden/);
  await expect(page.locator('.kore-menu-overlay')).toBeHidden();

  await page.waitForTimeout(350);
  await expect(page.locator('.menu-screen')).toHaveClass(/is-chrome-hidden/);

  await setMockGamepadButton(page, 8, false);
  await page.waitForTimeout(120);
  await setMockGamepadButton(page, 8, true);

  await expect(page.locator('.menu-screen')).not.toHaveClass(/is-chrome-hidden/);
  await expectMainMenu(page);
});

test('title screen ignores controller confirm carried from Exit until release', async ({ page }) => {
  await installMockGamepad(page);
  await startFromSplash(page);

  await page.getByRole('button', { name: 'Exit' }).focus();
  await setMockGamepadButton(page, 0, true);

  await expect(page.locator('.title-screen')).toBeVisible();
  await page.waitForTimeout(350);
  await expect(page.locator('.title-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Arcade' })).toBeHidden();

  await setMockGamepadButton(page, 0, false);
  await page.waitForTimeout(120);
  await setMockGamepadButton(page, 0, true);

  await expectMainMenu(page);
});

test('title splash hides support warning on healthy WebGL devices', async ({ page }) => {
  await mockInitialWebGLSupport(page, true);
  await gotoTitle(page);
  await expect(page.getByTestId('title-support-warning')).toBeHidden();
});

test('title splash warns for unsupported WebGL and clears after start', async ({ page }) => {
  await mockInitialWebGLSupport(page, false);
  await gotoTitle(page);
  await expect(page.getByTestId('title-support-warning')).toContainText('You may experience gameplay issues');
  await activateAnyInputScreen(page, '.title-screen');
  await expectMainMenu(page);
  await expect(page.getByTestId('title-support-warning')).toBeHidden();
});

test('starter guide appears once on first main menu visit', async ({ page }) => {
  await forceMenuLagHealthy(page);
  await startFromSplash(page, { dismissStarterGuide: false });

  const guide = page.getByTestId('starter-guide-dialog');
  await expect(guide).toBeVisible({ timeout: 5_000 });
  await expect(guide.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await expect(guide.getByRole('button', { name: 'Modes' })).toHaveCount(0);
  await page.keyboard.press('p');
  await expect(guide).toContainText('Arcade');
  await page.keyboard.press('o');
  await expect(guide.getByRole('heading', { name: 'Welcome' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();

  await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: 'Close' }).click();
  await expect(guide).toBeHidden();
  await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), STARTER_GUIDE_DISMISSED_KEY)).toBe('1');

  await page.goto('/');
  await activateAnyInputScreen(page, '.title-screen');
  await expectMainMenu(page);
  await expect(guide).toBeHidden({ timeout: 2_000 });
});

test('starter guide opens from F1 after dismissal', async ({ page }) => {
  await forceMenuLagHealthy(page);
  await startFromSplash(page);

  await page.keyboard.press('F1');

  await expect(page.getByTestId('starter-guide-dialog')).toBeVisible({ timeout: 2_000 });
});

test('starter guide opens from gamepad L1 on main menu', async ({ page }) => {
  await installMockGamepad(page);
  await forceMenuLagHealthy(page);
  await startFromSplash(page);

  await tapMockGamepadButton(page, 4);

  await expect(page.getByTestId('starter-guide-dialog')).toBeVisible({ timeout: 2_000 });
});

test('starter guide pages with gamepad L1 and R1 while open', async ({ page }) => {
  await installMockGamepad(page);
  await forceMenuLagHealthy(page);
  await startFromSplash(page);

  await page.keyboard.press('F1');

  const guide = page.getByTestId('starter-guide-dialog');
  await expect(guide).toBeVisible({ timeout: 2_000 });
  await tapMockGamepadButton(page, 5);
  await expect(guide).toContainText('Arcade');
  await tapMockGamepadButton(page, 4);
  await expect(guide.getByRole('heading', { name: 'Welcome' })).toBeVisible();
});

test('starter guide opens from Console About', async ({ page }) => {
  await forceMenuLagHealthy(page);
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Console' }).click();
  await page.getByRole('button', { name: 'About' }).click();

  await page.getByRole('button', { name: 'Open Starter Guide' }).click();

  await expect(page.getByTestId('starter-guide-dialog')).toBeVisible({ timeout: 2_000 });
});

test('menu lag prompt can be skipped once per detector version', async ({ page }) => {
  await forceMenuLagDetection(page);
  await startFromSplash(page);
  const dialog = page.getByTestId('menu-lag-dialog');
  await expect(dialog).toBeVisible({ timeout: 8_000 });

  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => Object.keys(window.localStorage).some((key) => key.startsWith('kore.menuLagPrompt.dismissed.') && window.localStorage.getItem(key) === '1'))).toBe(true);

  await startFromSplash(page);
  await expect(dialog).toBeHidden({ timeout: 2_500 });
});

test('menu lag prompt applies recommended menu-only settings', async ({ page }) => {
  await forceMenuLagDetection(page);
  await startFromSplash(page);
  await expect(page.getByTestId('menu-lag-dialog')).toBeVisible({ timeout: 8_000 });

  await page.getByRole('button', { name: 'Use recommended settings' }).click();

  await expect.poll(() => page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem('kore.gameSettings') ?? '{}');
    return stored.settings?.performance ?? null;
  })).toEqual({
    autoDetectMenuLag: true,
    menuAttractMode: 'snappy',
    menuMotionMode: 'snappy'
  });
  await expect(page.getByTestId('menu-lag-dialog')).toBeHidden();
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

test('fight reads browser gamepad input after mouse or touchpad focus', async ({ page }) => {
  await installMockGamepad(page, true);
  await startFight(page);

  await page.locator('.fight-screen').click({ position: { x: 80, y: 80 } });
  await setMockGamepadButton(page, 15, true);
  await expect(page.getByTestId('frame-input')).toHaveText('p1:right', { timeout: 3000 });
  await setMockGamepadButton(page, 15, false);
  await expectNoHeldFightInput(page);

  await setMockGamepadButton(page, 0, true);
  await expect(page.getByTestId('frame-input')).toHaveText('p1:jab', { timeout: 3000 });
  await setMockGamepadButton(page, 0, false);
  await expectNoHeldFightInput(page);
});

test('controller shoulders cycle Options tabs', async ({ page }) => {
  await installMockGamepad(page);
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();

  const activeTab = page.locator('.options-tabs button.active');
  const previousHint = page.getByTestId('options-tab-previous-hint');
  const nextHint = page.getByTestId('options-tab-next-hint');
  await expect(activeTab).toHaveText('Controls');
  await expect(previousHint).toHaveText('←');
  await expect(nextHint).toHaveText('→');

  await tapMockGamepadButton(page, 5);
  await expect(activeTab).toHaveText('Camera');
  await expect(previousHint).toHaveText('L1');
  await expect(nextHint).toHaveText('R1');

  await tapMockGamepadButton(page, 4);
  await expect(activeTab).toHaveText('Controls');

  await tapMockGamepadButton(page, 4);
  await expect(activeTab).toHaveText('Game');

  await page.keyboard.press('p');
  await expect(activeTab).toHaveText('Controls');
  await expect(previousHint).toHaveText('O');
  await expect(nextHint).toHaveText('P');

  await page.keyboard.press('ArrowRight');
  await expect(previousHint).toHaveText('←');
  await expect(nextHint).toHaveText('→');
});

test('controller D-pad navigation follows visual rows in menu screens', async ({ page }) => {
  await installMockGamepad(page);
  await startFromSplash(page);

  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')).toBe('Arcade');
  await tapMockGamepadButton(page, 13);
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')).toBe('Versus');

  await page.getByRole('button', { name: 'Options' }).click();
  await page.locator('.options-tabs button').filter({ hasText: /^Controls$/ }).focus();
  await tapMockGamepadButton(page, 15);
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')).toBe('Camera');
  await tapMockGamepadButton(page, 13);
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')).not.toBe('Camera');
});

test('controller shoulders page character select and cycle stages', async ({ page }) => {
  await installMockGamepad(page);
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Versus' }).click();

  const pageIndicator = page.locator('.versus-page-indicator').first();
  await expect(pageIndicator).toContainText(/Page 1 \/ [2-9]\d*/);

  await setMockGamepadButton(page, 5, true);
  await expect(pageIndicator).toContainText(/Page 2 \/ [2-9]\d*/);
  await setMockGamepadButton(page, 5, false);
  await page.waitForTimeout(120);

  await setMockGamepadButton(page, 4, true);
  await expect(pageIndicator).toContainText(/Page 1 \/ [2-9]\d*/);
  await setMockGamepadButton(page, 4, false);
  await page.waitForTimeout(120);

  await page.getByRole('button', { name: 'Stage' }).click();
  await expect(page.locator('.stage-hero-label strong')).toHaveText('Random');

  await setMockGamepadButton(page, 5, true);
  await expect(page.locator('.stage-hero-label strong')).not.toHaveText('Random');
  await setMockGamepadButton(page, 5, false);
  await page.waitForTimeout(120);

  await setMockGamepadButton(page, 4, true);
  await expect(page.locator('.stage-hero-label strong')).toHaveText('Random');
  await setMockGamepadButton(page, 4, false);
  await page.waitForTimeout(120);
});

test('starts a playable match from the menu', async ({ page }) => {
  await startFight(page);
  await expect(page.getByTestId('fight-canvas')).toBeVisible();
  await expect(page.locator('.fight-hud')).toBeVisible();
  await expect(page.getByTestId('fight-asset-loading-overlay')).toBeHidden();
});

test('same-stage rematch starts a fresh fight session', async ({ page }) => {
  await startTraining(page);
  const firstSession = await fightSessionId(page);
  await forceMatchOver(page, 1);
  await expect(page.getByRole('button', { name: 'Rematch' })).toBeVisible();
  await page.getByRole('button', { name: 'Rematch' }).click();
  await expect.poll(() => fightSessionId(page)).not.toBe(firstSession);
  await expect(page.getByTestId('frame-input')).toHaveText('none');
  await expect(page.locator('.results-overlay')).toHaveCount(0);
});

test('shows asset warmup before entering training', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Training' }).click({ force: true });
  await expect(page.locator('.training-select-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Start Training' }).click();
  await expect(page.getByTestId('asset-warmup-screen')).toBeVisible({ timeout: 3000 });
  await expectLoadingInterstitialFitsSteamDeck(page.getByTestId('asset-warmup-screen'));
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('Training Chamber Loading');
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('The Chamber');
  await expect(page.getByTestId('match-mode')).toHaveText('training', { timeout: 12000 });
  await expect(page.getByTestId('match-timer')).toHaveText('∞');
  await expect(page.getByTestId('fight-asset-loading-overlay')).toBeHidden();
});

test('arcade loading interstitials fit Steam Deck viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Steam Deck-sized loading layout is covered by the desktop project');
  await page.setViewportSize({ width: 1280, height: 800 });
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Arcade' }).click({ force: true });
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first().click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  const warmup = page.getByTestId('asset-warmup-screen');
  await expect(warmup).toBeVisible({ timeout: 3000 });
  await expectLoadingInterstitialFitsSteamDeck(warmup);

  const versusSplash = page.locator('.fight-versus-screen');
  await expect(versusSplash).toBeVisible({ timeout: 8000 });
  await activateAnyInputScreen(page, '.fight-versus-screen');
  await expect(warmup).toBeVisible({ timeout: 3000 });
  await expectLoadingInterstitialFitsSteamDeck(warmup);
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 12000 });

  await forceMatchOver(page);
  const routeLoading = page.getByLabel('Arcade route loading');
  await expect(routeLoading).toBeVisible({ timeout: 5000 });
  await expectLoadingInterstitialFitsSteamDeck(routeLoading);
});

test('start basics loads the chamber then opens the trial picker', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Desktop training picker flow covers the large preview layout');
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Training' }).click({ force: true });
  await expect(page.locator('.training-select-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Next training mode' }).click();
  await expect(page.getByRole('group', { name: 'Training mode' })).toContainText('Basic Trials');
  await page.getByRole('button', { name: 'Start Basics' }).click();

  await expect(page.getByTestId('asset-warmup-screen')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('Training Chamber Loading');
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('The Chamber');
  await expect(page.getByTestId('asset-warmup-screen')).not.toContainText('Loading world');
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('Ready', { timeout: 12000 });
  await activateAnyInputScreen(page, '[data-testid="asset-warmup-screen"]');

  await expect(page.getByRole('heading', { name: 'Training Mode' })).toHaveCount(0);
  await expect(page.locator('.training-trial-picker')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('.combo-trial-list')).toContainText('Basic Trials');
  await expect(page.getByTestId('training-trial-detail')).toContainText('Walk In');
  await expect(page.getByTestId('training-trial-active-preview')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('training-trial-command-table')).toContainText('Ready');

  await page.getByRole('button', { name: /Dash In/ }).click();
  await expect(page.getByTestId('training-trial-detail')).toContainText('Dash In');
  await expect(page.locator('.training-trial-challenge-list section button.active')).toContainText('Dash In');
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(page.locator('.training-trial-hud')).toContainText('Dash In');
  await expect(page.getByTestId('match-mode')).toHaveText('training');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 1500 }).toBe(0);
  await doubleTapPhysicalKey(page, 'd');
  await expect.poll(async () => Number(await page.getByTestId('p1-dash-forward-frames').innerText()), { timeout: 1500 }).toBeGreaterThan(0);
  await expect(page.getByTestId('training-great-message')).toContainText('GREAT', { timeout: 3000 });
  await page.keyboard.up('d');
});

test('basic training back-hop trial accepts native back-back and starts the real back hop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Keyboard training-trial route is covered by the desktop project');
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Training' }).click({ force: true });
  await expect(page.locator('.training-select-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Next training mode' }).click();
  await page.getByRole('button', { name: 'Start Basics' }).click();
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('Ready', { timeout: 12000 });
  await activateAnyInputScreen(page, '[data-testid="asset-warmup-screen"]');

  await expect(page.locator('.training-trial-picker')).toBeVisible({ timeout: 12000 });
  await page.getByRole('button', { name: /Back Hop/ }).click();
  await expect(page.getByTestId('training-trial-detail')).toContainText('Back Hop');
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(page.locator('.training-trial-hud')).toContainText('Back Hop');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 1500 }).toBe(0);

  await doubleTapPhysicalKey(page, 'a');
  await expect.poll(async () => Number(await page.getByTestId('p1-back-hop-frames').innerText()), { timeout: 1500 }).toBeGreaterThan(0);
  await expect(page.getByTestId('training-great-message')).toContainText('GREAT', { timeout: 3000 });
  await page.keyboard.up('a');
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
  await expect(page.getByText(/Placement 0\/10 - 900 provisional KP|1,200 KP - Unranked/)).toBeVisible();
  await page.locator('.ranked-profile-tabs button').filter({ hasText: 'History' }).dispatchEvent('click');
  await expect(page.getByText('No ranked matches yet.')).toBeVisible();
});

test('opens controls and character viewer', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await expect(page.getByRole('button', { name: 'Controls' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Characters' }).click();
  await expect(page.getByTestId('character-viewer-canvas')).toBeVisible();
  await expectNoHdProceduralFallback(page);
  await expect(page.getByTestId('change-character-view')).toHaveText('Change View: Compact');
  await page.getByTestId('change-character-view').click();
  await expect(page.getByTestId('change-character-view')).toHaveText('Change View: Display');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('kore.characterViewer.viewMode.v1'))).toBe('compact');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expectMainMenu(page);
  await page.getByRole('button', { name: 'Characters' }).click();
  await expect(page.getByTestId('character-viewer-canvas')).toBeVisible();
  await expectNoHdProceduralFallback(page);
  await expect(page.getByTestId('change-character-view')).toHaveText('Change View: Display');
  await page.getByTestId('change-character-view').click();
  await expect(page.getByTestId('change-character-view')).toHaveText('Change View: Compact');
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('kore.characterViewer.viewMode.v1'))).toBe('display');
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

test('shows performance settings inside the Game options sidebar', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();

  await expect(page.locator('.options-tabs button').filter({ hasText: /^Performance$/ })).toHaveCount(0);
  await page.locator('.options-tabs button').filter({ hasText: /^Game$/ }).click();
  await expect(page.locator('.options-sidebar button').filter({ hasText: /^Performance$/ })).toBeVisible();
  await page.locator('.options-sidebar button').filter({ hasText: /^Performance$/ }).click();
  await expect(page.getByText('Auto Detect Menu Lag')).toBeVisible();
  await expect(page.getByText('Main Menu Fight')).toBeVisible();
});

test('shows desktop installer downloads from the console installers tab', async ({ page }) => {
  await page.route('**/installers/manifest.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: '1.2.0',
        generatedAt: '2026-07-06T00:00:00.000Z',
        installers: [
          {
            id: 'windows',
            label: 'Windows PC',
            version: '1.2.0',
            filename: 'KORE-1.2.0-win-x64.exe',
            url: '/installers/KORE-1.2.0-win-x64.exe',
            size: 104857600,
            sha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            recommended: true,
            notes: 'Unsigned Windows installer.'
          },
          {
            id: 'mac',
            label: 'Mac',
            version: '1.2.0',
            filename: 'KORE-1.2.0-mac-universal.pkg',
            url: '/installers/KORE-1.2.0-mac-universal.pkg',
            size: 125829120,
            sha256: 'bbbbbb1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            notes: 'Unsigned macOS package.'
          },
          {
            id: 'steamdeck',
            label: 'Steam Deck',
            version: '1.2.0',
            type: 'flatpak',
            filename: 'KORE-SteamDeck.flatpak',
            url: '/installers/KORE-SteamDeck.flatpak',
            size: 125829120,
            sha256: 'cccccc1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            notes: 'Best for Steam Deck: install with Discover, then launch KORE from your apps or add it to Steam.',
            installCommand: 'curl -fsSL https://playkore.com/installers/install-kore-steamdeck.sh | bash',
            assets: [
              {
                type: 'flatpak',
                primary: true,
                label: 'Install with Discover (.flatpak)',
                filename: 'KORE-SteamDeck.flatpak',
                url: '/installers/KORE-SteamDeck.flatpak',
                size: 125829120,
                sha256: 'cccccc1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
              },
              {
                type: 'appimage',
                primary: false,
                label: 'AppImage fallback',
                filename: 'KORE-1.2.0-linux-x64.AppImage',
                url: '/installers/KORE-1.2.0-linux-x64.AppImage',
                size: 136314880,
                sha256: 'cccccc1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
              },
              {
                type: 'steam-art',
                primary: false,
                label: 'Steam cover art',
                filename: 'kore_library_600x900.png',
                url: '/steam-art/kore_library_600x900.png'
              },
              {
                type: 'steam-art',
                primary: false,
                label: 'Square logo art',
                filename: 'kore_icon_256.png',
                url: '/steam-art/kore_icon_256.png'
              },
              {
                type: 'script',
                primary: false,
                label: 'Konsole fallback script',
                filename: 'install-kore-steamdeck.sh',
                url: '/installers/install-kore-steamdeck.sh',
                size: 12000,
                sha256: 'dddddd1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
              }
            ]
          },
          {
            id: 'linux',
            label: 'Linux AppImage',
            version: '1.2.0',
            filename: 'KORE-1.2.0-linux-x64.AppImage',
            url: '/installers/KORE-1.2.0-linux-x64.AppImage',
            size: 136314880,
            sha256: 'eeeeee1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            notes: 'Generic Linux AppImage.'
          }
        ]
      })
    });
  });

  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Console' }).click();
  await page.getByRole('button', { name: 'Installers' }).click();

  await expect(page.getByLabel('Desktop installers')).toBeVisible();
  await expect(page.locator('.installer-card-title strong', { hasText: 'Windows PC' })).toBeVisible();
  await expect(page.locator('.installer-card-title strong', { hasText: 'Mac' })).toBeVisible();
  await expect(page.locator('.installer-card-title strong', { hasText: 'Steam Deck' })).toBeVisible();
  await expect(page.locator('.installer-card-title strong', { hasText: 'Linux AppImage' })).toBeVisible();
  await expect(page.getByText('Recommended for this device').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Install with Discover/ })).toHaveAttribute('href', /\/installers\/KORE-SteamDeck\.flatpak$/);
  await expect(page.getByText('Open it with Discover.', { exact: true })).toBeVisible();
  await expect(page.getByText('If Steam does not show the art, download the cover or square logo and set it manually in your library.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Steam cover art/ })).toHaveAttribute('href', /\/steam-art\/kore_library_600x900\.png$/);
  await expect(page.getByRole('link', { name: /Square logo art/ })).toHaveAttribute('href', /\/steam-art\/kore_icon_256\.png$/);
  await expect(page.getByText('curl -fsSL https://playkore.com/installers/install-kore-steamdeck.sh | bash')).toBeVisible();
  await expect(page.getByRole('link', { name: /Konsole fallback script/ })).toHaveAttribute('href', /\/installers\/install-kore-steamdeck\.sh$/);
  await expect(page.locator('a[href$="/installers/KORE-1.2.0-win-x64.exe"]')).toHaveAttribute('href', /\/installers\/KORE-1\.2\.0-win-x64\.exe$/);

  await page.setViewportSize({ width: 1210, height: 350 });
  await expect.poll(async () => page.locator('.installer-deck-help').evaluate((element) => {
    const container = element.getBoundingClientRect();
    const lastStep = element.querySelector('li:last-child')?.getBoundingClientRect();
    return lastStep ? Math.ceil(lastStep.bottom - container.bottom) : 0;
  })).toBeLessThanOrEqual(1);
  await expect.poll(async () => page.locator('.installer-card-steamdeck').evaluate((element) => {
    const container = element.getBoundingClientRect();
    const childBottoms = Array.from(element.children, (child) => child.getBoundingClientRect().bottom);
    return Math.ceil(Math.max(...childBottoms) - container.bottom);
  })).toBeLessThanOrEqual(1);
  await expect.poll(async () => page.locator('.installer-panel').evaluate((element) => {
    const container = element.getBoundingClientRect();
    const card = element.querySelector('.installer-card-steamdeck')?.getBoundingClientRect();
    return card ? Math.ceil(card.bottom - container.bottom) : 0;
  })).toBeLessThanOrEqual(1);
});

test('shows installer preparation state when manifest is unavailable', async ({ page }) => {
  await page.route('**/installers/manifest.json', async (route) => {
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });

  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Console' }).click();
  await page.getByRole('button', { name: 'Installers' }).click();

  await expect(page.getByText('Installers are being prepared')).toBeVisible();
  await expect(page.getByText('Windows, Mac, Steam Deck, and Linux builds will appear here once the release files are published.')).toBeVisible();
});

test('shows device support debug checks from console sidebar', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Console' }).click();
  await page.getByRole('button', { name: 'Debug' }).click();

  await expect(page.getByLabel('Device debug checks')).toBeVisible();
  await expect(page.getByText('WebGL rendering')).toBeVisible();
  await expect(page.getByText('Texture capacity')).toBeVisible();
  await expect(page.getByText('Browser version', { exact: true })).toBeVisible();
});

test('allows the console about disclaimer to scroll in short viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1210, height: 350 });
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Options' }).click();
  await page.getByRole('button', { name: 'Console' }).click();
  await page.getByRole('button', { name: 'About' }).click();

  const aboutPanel = page.getByLabel('About game');
  await expect(aboutPanel).toBeVisible();
  await expect.poll(async () => aboutPanel.evaluate((element) => window.getComputedStyle(element).overflowY)).toBe('auto');
  await expect.poll(async () => aboutPanel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);

  const box = await aboutPanel.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 900);

  await expect.poll(async () => aboutPanel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
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
  await expect(page.getByRole('button', { name: /Prizepool/i })).toBeDisabled();
  await expect(page.getByText('Paid beta unavailable')).toBeVisible();
});

test('tournament select keeps the page locked while roster content scrolls internally', async ({ page }) => {
  const viewports = [
    { name: 'short desktop', width: 1100, height: 560 },
    { name: 'mobile portrait', width: 390, height: 740 },
    { name: 'mobile landscape', width: 740, height: 390 }
  ];
  let sawScrollablePanel = false;

  for (const viewport of viewports) {
    await test.step(viewport.name, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await startFromSplash(page);
      await page.getByRole('button', { name: 'Tournament' }).click();
      await page.getByRole('button', { name: /^ONLINE/i }).click();

      await expect(page.locator('.tournament-select-screen')).toBeVisible();
      await expect(page.getByLabel('Player name')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Enter Online' })).toBeVisible();
      await expectDocumentLocked(page);

      const before = await readSelectScrollMetrics(page);
      expect(Math.min(...before.tileHeights)).toBeGreaterThanOrEqual(68);
      expect(before.visibleImages).toBeGreaterThan(0);
      sawScrollablePanel ||= before.scrollHeight > before.clientHeight + 2;

      const afterScrollTop = await page.getByTestId('select-roster-scroll').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      });
      if (before.scrollHeight > before.clientHeight + 2) expect(afterScrollTop).toBeGreaterThan(0);
      await expectDocumentLocked(page);
    });
  }

  expect(sawScrollablePanel).toBe(true);
});

test('keyboard navigation scrolls hidden character rows into view', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 390 });
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Tournament' }).click({ force: true });
  await page.getByRole('button', { name: /^ONLINE/i }).click();
  await expect(page.locator('.tournament-select-screen')).toBeVisible();

  const scroll = page.getByTestId('select-roster-scroll');
  await expect.poll(() => scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.locator('.versus-roster-tile:not(.versus-random-tile)').first().focus();
  await scroll.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
  for (let index = 0; index < 10; index += 1) await page.keyboard.press('s');

  await expect.poll(() => scroll.evaluate((element) => element.scrollTop), { timeout: 3_000 }).toBeGreaterThan(0);
  await expectDocumentLocked(page);
});

test('controller can edit and save tournament username gate without moving menu focus away', async ({ page }) => {
  await installMockGamepad(page);
  await page.setViewportSize({ width: 1100, height: 560 });
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Tournament' }).click();
  await page.getByRole('button', { name: /^ONLINE/i }).click();
  await page.getByRole('button', { name: 'Enter Online' }).click();

  const dialog = page.locator('.username-gate-dialog');
  const input = page.getByRole('textbox', { name: 'Player name' });
  await expect(dialog).toBeVisible();
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();

  await tapMockGamepadButton(page, 12);
  await expect(input).toHaveValue('A');
  await expect(dialog).toHaveClass(/is-controller-editing/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Player name');

  await tapMockGamepadButton(page, 0);
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem('kore.online.profile') ?? '{}').displayName)).toBe('A');
  await expect(dialog).toHaveCount(0);
  await expectDocumentLocked(page);
});

test('online username gate supports controller editing, confirm, and cancel', async ({ page }) => {
  await installMockGamepad(page);
  await page.setViewportSize({ width: 1100, height: 560 });
  await startFromSplash(page);
  await page.evaluate(() => window.localStorage.removeItem('kore.online.profile'));
  await page.getByRole('button', { name: 'Online' }).click();

  const dialog = page.locator('.username-gate-dialog');
  const input = page.getByRole('textbox', { name: 'Player name' });
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();

  await tapMockGamepadButton(page, 12);
  await expect(input).toHaveValue('A');
  await expect(dialog).toHaveClass(/is-controller-editing/);
  await expect(page.getByText('D-pad edit / A confirm / B cancel')).toBeVisible();
  await tapMockGamepadButton(page, 15);
  await tapMockGamepadButton(page, 12);
  await expect(input).toHaveValue('AA');

  await tapMockGamepadButton(page, 0);
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem('kore.online.profile') ?? '{}').displayName)).toBe('AA');
  await expect(page.locator('.select-screen')).toBeVisible();

  await page.evaluate(() => window.localStorage.removeItem('kore.online.profile'));
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Online' }).click();
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await tapMockGamepadButton(page, 12);
  await expect(input).toHaveValue('A');
  await tapMockGamepadButton(page, 1);
  await expect(dialog).toHaveCount(0);
  await expectMainMenu(page);
});

test('online username gate lets controller A activate focused action buttons', async ({ page }) => {
  await installMockGamepad(page);
  await startFromSplash(page);
  await page.evaluate(() => window.localStorage.removeItem('kore.online.profile'));
  await page.getByRole('button', { name: 'Online' }).click();

  const dialog = page.locator('.username-gate-dialog');
  const input = page.getByRole('textbox', { name: 'Player name' });
  const backButton = page.getByRole('button', { name: 'Back' });
  const confirmButton = page.getByRole('button', { name: 'Confirm' });
  await expect(dialog).toBeVisible();
  await tapMockGamepadButton(page, 12);
  await expect(input).toHaveValue('A');

  await backButton.focus();
  await tapMockGamepadButton(page, 13);
  await expect(confirmButton).toBeFocused();
  await tapMockGamepadButton(page, 0);
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(window.localStorage.getItem('kore.online.profile') ?? '{}').displayName)).toBe('A');
});

test('starts a free local tournament with bracket intro', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Tournament' }).click();
  await page.getByRole('button', { name: 'Start Free' }).click();
  await expect(page.locator('.tournament-bracket-intro')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Winner Advances')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-mode')).toHaveText('tournamentLocal', { timeout: 30000 });
});

test('starts a two-player free local tournament setup', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Tournament' }).click();
  await page.getByRole('button', { name: '2 Players' }).click();
  const rosterScroll = page.getByTestId('select-roster-scroll');
  await expect(rosterScroll.getByRole('button', { name: 'P1', exact: true })).toBeVisible();
  await expect(rosterScroll.getByRole('button', { name: 'P2', exact: true })).toBeVisible();
  await expect(page.getByText('Local 1-2P + CPU')).toBeVisible();
  await page.getByRole('button', { name: 'Start Free' }).click();
  await expect(page.locator('.tournament-bracket-intro')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.tournament-bracket-board')).toContainText('P2');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-mode')).toHaveText('tournamentLocal', { timeout: 12000 });
});

test('starts a custom local tournament with P1 versus P2 every match', async ({ page }) => {
  await startFromSplash(page);
  await page.getByRole('button', { name: 'Tournament' }).click();
  await page.getByRole('button', { name: /^CUSTOM/i }).click();
  await expect(page.getByText('P1 vs P2 every match')).toBeVisible();
  await page.getByRole('button', { name: 'Start Custom' }).click();
  await expect(page.locator('.tournament-bracket-intro')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.tournament-bracket-board')).not.toContainText('CPU');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-mode')).toHaveText('tournamentLocal', { timeout: 30000 });
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

test('native keyboard core actions reach the engine in real fights', async ({ page }) => {
  await startFight(page, true);
  await setFightPositions(page, { p1: { x: -1.35, y: 0, z: 0 }, p2: { x: 1.35, y: 0, z: 0 } });
  await expect(page.getByTestId('match-mode')).toHaveText('local2p');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 3000 }).toBe(0);

  const beforeDash = xFromPosition(await page.getByTestId('p1-position').innerText());
  await doubleTapPhysicalKey(page, 'd');
  await expect.poll(async () => Number(await page.getByTestId('p1-dash-forward-frames').innerText()), { timeout: 1500 }).toBeGreaterThan(0);
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 2000 }).toBeGreaterThan(beforeDash + 0.45);
  await page.keyboard.up('d');
  await expect.poll(async () => Number(await page.getByTestId('p1-dash-forward-frames').innerText()), { timeout: 3000 }).toBe(0);

  await doubleTapPhysicalKey(page, 'a');
  await expect.poll(async () => Number(await page.getByTestId('p1-back-hop-frames').innerText()), { timeout: 1500 }).toBeGreaterThan(0);
  await page.keyboard.up('a');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 5000 }).toBeLessThan(0.04);

  await page.keyboard.down(' ');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 2000 }).toBeGreaterThan(0.12);
  await page.keyboard.up(' ');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 5000 }).toBeLessThan(0.04);

  await page.keyboard.down('s');
  await expect(page.getByTestId('p1-state')).toHaveText('crouch', { timeout: 1500 });
  await page.keyboard.up('s');
  await expect(page.getByTestId('p1-state')).not.toHaveText('crouch', { timeout: 3000 });

  await setFightPositions(page, { p1: { x: -0.55, y: 0, z: 0 }, p2: { x: 0.55, y: 0, z: 0 } });
  for (const key of ['u', 'i', 'j', 'k']) {
    await expect(page.getByTestId('p1-move'), key).toHaveText('none', { timeout: 5000 });
    await page.keyboard.down(key);
    await expect(page.getByTestId('p1-state'), key).toHaveText('attack', { timeout: 1500 });
    await expect(page.getByTestId('p1-move'), key).not.toHaveText('none');
    await page.keyboard.up(key);
    await expect(page.getByTestId('p1-state'), key).not.toHaveText('attack', { timeout: 5000 });
    await expect(page.getByTestId('p1-move'), key).toHaveText('none', { timeout: 5000 });
  }
});

test('keyboard forward-forward and back-back trigger sprint and back hop in training', async ({ page }) => {
  await startTraining(page);
  await setFightPositions(page, { p1: { x: -1.45, y: 0, z: 0 }, p2: { x: 1.45, y: 0, z: 0 } });
  await expect(page.getByTestId('match-mode')).toHaveText('training');
  await expect(page.getByTestId('p1-state')).toHaveText('idle', { timeout: 3000 });

  const beforeDash = xFromPosition(await page.getByTestId('p1-position').innerText());
  await doubleTapPhysicalKey(page, 'd');
  await expect.poll(async () => Number(await page.getByTestId('p1-dash-forward-frames').innerText()), { timeout: 1500 }).toBeGreaterThan(0);
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 2000 }).toBeGreaterThan(beforeDash + 0.45);
  await page.keyboard.up('d');
  await expect.poll(async () => Number(await page.getByTestId('p1-dash-forward-frames').innerText()), { timeout: 3000 }).toBe(0);

  const beforeBackHop = xFromPosition(await page.getByTestId('p1-position').innerText());
  const p2X = xFromPosition(await page.getByTestId('p2-position').innerText());
  const spacingBeforeBackHop = Math.abs(p2X - beforeBackHop);
  await doubleTapPhysicalKey(page, 'a');
  await expect.poll(async () => Number(await page.getByTestId('p1-back-hop-frames').innerText()), { timeout: 1500 }).toBeGreaterThan(0);
  await expect(page.getByTestId('p1-state')).toHaveText('jump');
  await expect.poll(async () => Number(await page.getByTestId('p1-height').innerText()), { timeout: 1500 }).toBeGreaterThan(0.05);
  await expect.poll(async () => {
    const p1X = xFromPosition(await page.getByTestId('p1-position').innerText());
    return Math.abs(p2X - p1X);
  }, { timeout: 2000 }).toBeGreaterThan(spacingBeforeBackHop + 0.05);
  await page.keyboard.up('a');
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

test('gamepad double-tap up sidesteps with a forgiving controller window', async ({ page }) => {
  await installMockGamepad(page);
  await startFight(page, true);
  const zBefore = zFromPosition(await page.getByTestId('p1-position').innerText());

  await setMockGamepadButton(page, 12, true);
  await page.waitForTimeout(120);
  await setMockGamepadButton(page, 12, false);
  await page.waitForTimeout(560);
  await setMockGamepadButton(page, 12, true);
  await expect(page.getByTestId('p1-state')).toHaveText('sidestep', { timeout: 1000 });
  await page.waitForTimeout(420);
  await setMockGamepadButton(page, 12, false);

  const zAfter = zFromPosition(await page.getByTestId('p1-position').innerText());
  expect(zAfter).toBeLessThan(zBefore - 0.25);
});

test('gamepad back-back back-hops with a forgiving controller window', async ({ page }) => {
  await installMockGamepad(page);
  await startFight(page, true);
  const initialP1X = xFromPosition(await page.getByTestId('p1-position').innerText());
  const p2X = xFromPosition(await page.getByTestId('p2-position').innerText());
  const initialSpacing = Math.abs(p2X - initialP1X);
  let sawRetreat = false;

  for (const button of [14, 15]) {
    await setMockGamepadButton(page, button, true);
    await page.waitForTimeout(120);
    await setMockGamepadButton(page, button, false);
    await page.waitForTimeout(560);
    await setMockGamepadButton(page, button, true);
    await page.waitForTimeout(650);
    await setMockGamepadButton(page, button, false);
    const p1X = xFromPosition(await page.getByTestId('p1-position').innerText());
    sawRetreat ||= Math.abs(p2X - p1X) > initialSpacing + 0.08;
    if (sawRetreat) break;
    await page.waitForTimeout(500);
  }

  expect(sawRetreat).toBe(true);
});

test('mobile touch controls drive movement, attacks, and clear released inputs', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Requires coarse pointer mobile viewport');
  await startFight(page, true);
  await expect(page.locator('.touch-controls')).toBeVisible();
  await setFightPositions(page, { p1: { x: -1.3, y: 0, z: 0 }, p2: { x: 1.3, y: 0, z: 0 } });
  await expect(page.getByTestId('touch-left')).toBeVisible();
  await expect(page.getByTestId('touch-right')).toBeVisible();
  await expect(page.getByTestId('touch-jab')).toBeVisible();
  const before = xFromPosition(await page.getByTestId('p1-position').innerText());

  await touchHold(page, 'touch-right', 900);
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 3000 }).toBeGreaterThan(before + 0.18);
  await expectNoHeldFightInput(page);
  const afterForward = xFromPosition(await page.getByTestId('p1-position').innerText());

  await touchHold(page, 'touch-left', 600);
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 3000 }).toBeLessThan(afterForward - 0.06);
  await expectNoHeldFightInput(page);

  await touchHold(page, 'touch-jab', 220);
  await expect(page.getByTestId('last-input')).toHaveText('p1:jab');

  const cancelClient = await startTouch(page, 'touch-left', 21);
  await expect(page.getByTestId('last-input')).toHaveText('p1:left');
  await cancelClient.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cancelClient.detach();
  await expectNoHeldFightInput(page);

  const blurClient = await startTouch(page, 'touch-right', 22);
  await expect(page.getByTestId('last-input')).toHaveText('p1:right');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expectNoHeldFightInput(page);
  await blurClient.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
  await blurClient.detach();
});

test('mobile touch controls keep forward and back correct after side swaps', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Requires coarse pointer mobile viewport');
  await startFight(page, true);
  await expect(page.locator('.touch-controls')).toBeVisible();
  await setFightPositions(page, { p1: { x: 1.3, y: 0, z: 0 }, p2: { x: -1.3, y: 0, z: 0 } });
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 3_000 }).toBeGreaterThan(1.1);
  const crossedStart = xFromPosition(await page.getByTestId('p1-position').innerText());

  await touchHold(page, 'touch-left', 800);
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 3_000 }).toBeLessThan(crossedStart - 0.18);
  await expectNoHeldFightInput(page);
  const afterCrossedForward = xFromPosition(await page.getByTestId('p1-position').innerText());

  await touchHold(page, 'touch-right', 700);
  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 3_000 }).toBeGreaterThan(afterCrossedForward + 0.04);
  await expect(page.getByTestId('p1-state')).toHaveText(/block|walk|idle/);
  await expectNoHeldFightInput(page);
});

test('mobile touch controls allow movement while tapping attacks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Requires coarse pointer mobile viewport');
  await startFight(page, true);
  await setFightPositions(page, { p1: { x: -1.3, y: 0, z: 0 }, p2: { x: 1.3, y: 0, z: 0 } });
  const before = xFromPosition(await page.getByTestId('p1-position').innerText());

  const movement = await touchPoint(page, 'touch-right', 31);
  const attack = await touchPoint(page, 'touch-jab', 32);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movement] });
  await expect(page.getByTestId('last-input')).toHaveText('p1:right');
  await page.waitForTimeout(300);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movement, attack] });
  await page.waitForTimeout(120);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [movement] });
  await expect(page.getByTestId('last-input')).toHaveText('p1:jab');
  await page.waitForTimeout(500);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();

  await expect.poll(async () => xFromPosition(await page.getByTestId('p1-position').innerText()), { timeout: 3_000 }).toBeGreaterThan(before + 0.18);
  await expectNoHeldFightInput(page);
});

test('pause move list shows active move and combo previews', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Desktop pause move-list preview is covered by the chromium project');
  await startFight(page, true);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Move List' }).click();
  await expect(page.getByRole('heading', { name: 'Move List' })).toBeVisible();
  await expect(page.getByTestId('pause-move-active-preview')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.pause-move-row.is-active').first()).toBeVisible();

  await page.getByRole('button', { name: 'Directions' }).click();
  await expect(page.getByTestId('pause-move-active-preview')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Combo Routes' }).click();
  test.skip(await page.locator('.pause-move-row').count() === 0, 'Selected character has no combo routes');
  await expect(page.getByTestId('pause-move-active-preview')).toBeVisible({ timeout: 10000 });
});

test('opens training modes, starts a basic trial, and previews combo routes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Keyboard training-trial route is covered by the desktop project');
  await page.route('**/characters/roronoa-zoro/face-card.png', async (route) => route.abort());
  await startTraining(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Training Mode' })).toBeVisible();

  await page.getByRole('button', { name: /Basic Trials/ }).click();
  await expect(page.getByRole('button', { name: /Walk In/ })).toBeVisible();
  await page.getByRole('button', { name: /Walk In/ }).click();
  await expect(page.locator('.zoro-trainer-callout')).toBeVisible();
  await expect(page.getByTestId('trainer-portrait')).toHaveAttribute('src', /frame-000\.png/);
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(page.locator('.training-trial-hud')).toContainText('Walk In');
  await expect(page.locator('.match-message.fight-message')).toHaveCount(0);
  await page.waitForTimeout(230);
  await keyDown(page, 'KeyD');
  await page.waitForTimeout(150);
  await keyUp(page, 'KeyD');
  if (!await page.getByTestId('training-success-overlay').isVisible().catch(() => false)) {
    await page.evaluate(() => {
      (window as typeof window & { __koreE2ECompleteTrainingTrial?: () => void }).__koreE2ECompleteTrainingTrial?.();
    });
  }
  await expect(page.getByTestId('training-great-message')).toContainText('GREAT');
  await expect(page.getByTestId('training-success-overlay')).toContainText('SUCCESS');
  await expect(page.getByRole('button', { name: /Next Trial|Review Next/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Next Trial|Review Next/ })).toBeFocused();
  const completedSession = await fightSessionId(page);
  await page.getByRole('button', { name: /Next Trial|Review Next/ }).click();
  await expect.poll(() => fightSessionId(page)).not.toBe(completedSession);
  await expect(page.getByTestId('training-success-overlay')).toHaveCount(0);
  await expect(page.locator('.combat-popup-card')).toHaveCount(0);
  await expect(page.getByTestId('frame-input')).toHaveText('none');
  await expect(page.locator('.training-trial-hud')).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await expect(page.getByRole('heading', { name: 'Training Mode' })).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: /Combo Trials/ }).click();
  await expect(page.locator('.combo-trial-list')).toContainText('Combo Trials');
  const groundedLauncherTrial = page.getByRole('button', { name: /Grounded Launcher/i }).first();
  await expect(groundedLauncherTrial).toBeVisible();
  await groundedLauncherTrial.click();
  await expect(page.getByRole('button', { name: 'Preview' })).toBeEnabled();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.training-trial-hud')).toContainText('Preview');
  await expect(page.locator('.training-trial-hud')).not.toContainText('↑');
  await expect(page.locator('.training-trial-hud')).toBeHidden({ timeout: 12000 });
});

test('training trial next flow stays responsive and success overlay fits Steam Deck', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Steam Deck-sized training flow is covered by the desktop project');
  await page.setViewportSize({ width: 1280, height: 800 });
  await startTraining(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await expectTrainingModeTabsHaveReadableSpacing(page);
  await page.getByRole('button', { name: /Basic Trials/ }).click();
  await expectTrainingModeTabsHaveReadableSpacing(page);
  await page.getByRole('button', { name: /Walk In/ }).click();
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(page.locator('.training-trial-hud')).toBeVisible();

  for (let index = 0; index < 3; index += 1) {
    const sessionBefore = await fightSessionId(page);
    await completeActiveTrainingTrial(page);
    await expect(page.getByTestId('training-success-overlay')).toContainText('SUCCESS', { timeout: 5_000 });
    await expectSuccessPanelFitsViewport(page);
    await page.getByRole('button', { name: /Next Trial|Review Next/ }).click();
    await expect.poll(() => fightSessionId(page)).not.toBe(sessionBefore);
    await expect(page.getByTestId('training-success-overlay')).toHaveCount(0);
    await expect(page.locator('.combat-popup-card')).toHaveCount(0);
    await expect(page.getByTestId('frame-input')).toHaveText('none');
  }

  await setFightPositions(page, { p1: { x: -0.45, z: 0 }, p2: { x: 0.45, z: 0 } });
  await keyDown(page, 'KeyA');
  await expect(page.getByTestId('frame-input')).toHaveText('p1:left', { timeout: 3_000 });
  await expect(page.getByTestId('p1-state')).toHaveText('block', { timeout: 3_000 });
  await keyUp(page, 'KeyA');
  await expectNoHeldFightInput(page);

  await keyDown(page, 'KeyU');
  await expect(page.getByTestId('frame-input')).toHaveText('p1:jab', { timeout: 3_000 });
  await expect(page.getByTestId('p1-state')).toHaveText('attack', { timeout: 3_000 });
  await keyUp(page, 'KeyU');
});

test('opens training combo trials and shows counter-hit progress', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'Keyboard combo-trial route is covered by the desktop project');
  await startTraining(page);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await page.getByRole('button', { name: /Combo Trials/ }).click();
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
