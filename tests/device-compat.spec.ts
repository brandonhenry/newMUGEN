import { expect, test, type Page } from '@playwright/test';

type KoreHealth = {
  ready: boolean;
  frameCount: number;
  canvasSize: { width: number; height: number; clientWidth: number; clientHeight: number };
  webglSupported: boolean;
  webgl2: boolean;
  vendor: string | null;
  renderer: string | null;
  maxTextureSize: number | null;
  contextLost: boolean;
  lastError: string | null;
  failedAssets: string[];
  matchPhase: string;
  playerCanMove: boolean;
  attackCanStart: boolean;
  activeFrameReached: boolean;
};

type FrameStats = {
  frameCount: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

const COMPAT_FRAME_BUDGET = {
  minFrames: 90,
  p95Ms: 70,
  p99Ms: 120
};

test('real fight stays healthy on this device profile', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedCoreAssets: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && isCoreAssetUrl(response.url())) failedCoreAssets.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (isCoreAssetUrl(request.url())) failedCoreAssets.push(`${request.failure()?.errorText ?? 'failed'} ${request.url()}`);
  });

  await startCompatFight(page);
  await expect(page.getByTestId('fight-canvas')).toBeVisible();

  await expect.poll(() => readHealth(page).then((health) => health?.ready ?? false), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => readHealth(page).then((health) => health?.frameCount ?? 0), { timeout: 10_000 }).toBeGreaterThan(20);
  let health = await requireHealth(page);

  expect(health.webglSupported, JSON.stringify(health)).toBe(true);
  expect(health.contextLost, JSON.stringify(health)).toBe(false);
  expect(health.canvasSize.width, JSON.stringify(health)).toBeGreaterThan(0);
  expect(health.canvasSize.height, JSON.stringify(health)).toBeGreaterThan(0);
  expect(health.maxTextureSize ?? 0, JSON.stringify(health)).toBeGreaterThan(0);
  expect(health.renderer || health.vendor, JSON.stringify(health)).toBeTruthy();

  const frameBeforeInput = health.frameCount;
  await holdMovementAndTapAttack(page);
  await expect.poll(() => readHealth(page).then((next) => next?.frameCount ?? 0), { timeout: 8_000 }).toBeGreaterThan(frameBeforeInput + 20);
  await expect.poll(() => readHealth(page).then((next) => next?.playerCanMove ?? false), { timeout: 5_000 }).toBe(true);
  await expect.poll(() => readHealth(page).then((next) => next?.attackCanStart ?? false), { timeout: 5_000 }).toBe(true);

  await resizePortraitLandscapeAndBack(page);
  health = await requireHealth(page);
  expect(health.canvasSize.width, JSON.stringify(health)).toBeGreaterThan(0);
  expect(health.canvasSize.height, JSON.stringify(health)).toBeGreaterThan(0);
  expect(health.contextLost, JSON.stringify(health)).toBe(false);

  const stats = await sampleFramePacing(page, 8_000);
  testInfo.attach('device-compat-frame-stats.json', {
    body: JSON.stringify({ project: testInfo.project.name, stats, health }, null, 2),
    contentType: 'application/json'
  });
  expect(stats.frameCount, JSON.stringify(stats)).toBeGreaterThanOrEqual(COMPAT_FRAME_BUDGET.minFrames);
  expect(stats.p95Ms, JSON.stringify(stats)).toBeLessThanOrEqual(COMPAT_FRAME_BUDGET.p95Ms);
  expect(stats.p99Ms, JSON.stringify(stats)).toBeLessThanOrEqual(COMPAT_FRAME_BUDGET.p99Ms);

  health = await requireHealth(page);
  expect(health.contextLost, JSON.stringify(health)).toBe(false);
  expect([...failedCoreAssets, ...health.failedAssets]).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((message) => !message.includes('favicon'))).toEqual([]);
});

async function startCompatFight(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await activateAnyInputScreen(page, '.title-screen');
  await expect(page.getByRole('button', { name: 'Arcade' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Versus' }).click({ force: true });
  await page.getByRole('button', { name: 'Stage' }).click({ force: true });
  await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first().click({ force: true });
  await page.getByRole('button', { name: 'Fight', exact: true }).click({ force: true });
  await expect(page.locator('.fight-versus-screen')).toBeVisible({ timeout: 5_000 });
  await activateAnyInputScreen(page, '.fight-versus-screen');
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 15_000 });
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 3_000 });
  await page.waitForTimeout(2_000);
}

async function activateAnyInputScreen(page: Page, selector: string) {
  const target = page.locator(selector);
  await expect(target).toBeVisible({ timeout: 10_000 });
  await target.dispatchEvent('pointerdown', {
    pointerId: 91,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true
  }).catch(() => undefined);
  await page.dispatchEvent('body', 'pointerup', {
    pointerId: 91,
    pointerType: 'touch',
    isPrimary: true,
    bubbles: true,
    cancelable: true
  }).catch(() => undefined);
}

async function holdMovementAndTapAttack(page: Page) {
  const movement = await touchPoint(page, 'touch-right', 1);
  const attack = await touchPoint(page, 'touch-jab', 2);
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movement] });
    await page.waitForTimeout(450);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movement, attack] });
    await page.waitForTimeout(160);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [movement] });
    await page.waitForTimeout(500);
  } finally {
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
    await client.detach();
  }
  await expect.poll(() => page.getByTestId('frame-input').innerText(), { timeout: 3_000 }).toBe('none');
}

async function touchPoint(page: Page, testId: string, id: number) {
  const target = page.getByTestId(testId);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing touch target box for ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, id, radiusX: 8, radiusY: 8, force: 1 };
}

async function resizePortraitLandscapeAndBack(page: Page) {
  const original = page.viewportSize() ?? { width: 390, height: 844 };
  const shortSide = Math.min(original.width, original.height);
  const longSide = Math.max(original.width, original.height);
  const before = await requireHealth(page);

  await page.setViewportSize({ width: shortSide, height: longSide });
  await page.waitForTimeout(700);
  await page.setViewportSize({ width: longSide, height: shortSide });
  await page.waitForTimeout(700);
  await page.setViewportSize(original);
  await page.waitForTimeout(700);

  await expect.poll(() => readHealth(page).then((health) => health?.frameCount ?? 0), { timeout: 5_000 }).toBeGreaterThan(before.frameCount + 10);
}

async function sampleFramePacing(page: Page, sampleMs: number): Promise<FrameStats> {
  return page.evaluate(async (durationMs) => {
    const gaps: number[] = [];
    await new Promise<void>((resolve) => {
      let last = performance.now();
      const stopAt = last + durationMs;
      const tick = (now: number) => {
        gaps.push(now - last);
        last = now;
        if (now >= stopAt) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    gaps.sort((a, b) => a - b);
    return {
      frameCount: gaps.length,
      p95Ms: Number((gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))] ?? 0).toFixed(2)),
      p99Ms: Number((gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.99))] ?? 0).toFixed(2)),
      maxMs: Number((gaps[gaps.length - 1] ?? 0).toFixed(2))
    };
  }, sampleMs);
}

async function readHealth(page: Page) {
  return page.evaluate(() => (window as typeof window & { __KORE_HEALTH__?: KoreHealth }).__KORE_HEALTH__ ?? null);
}

async function requireHealth(page: Page) {
  const health = await readHealth(page);
  if (!health) throw new Error('Missing __KORE_HEALTH__');
  return health;
}

function isCoreAssetUrl(url: string) {
  return (
    url.includes('/characters/') ||
    url.includes('/stages/') ||
    url.includes('/voxels') ||
    url.endsWith('.glb') ||
    url.endsWith('.gltf') ||
    url.endsWith('.bin')
  );
}
