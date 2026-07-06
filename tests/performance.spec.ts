import { expect, test, type Page, type Response } from '@playwright/test';

const runPerfTests = process.env.KORE_RUN_PERF_TESTS === '1';
const runLivePerfTests = process.env.KORE_LIVE_PERF_TEST === '1';

type ResourceRecord = {
  url: string;
  status: number;
  contentType: string;
  cacheControl: string;
  contentLength: number;
};

type FrameStats = {
  frameCount: number;
  averageMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  over50ms: number;
  over100ms: number;
  longTaskCount: number;
  longTaskTotalMs: number;
  longestLongTaskMs: number;
};

test.skip(!runPerfTests, 'Set KORE_RUN_PERF_TESTS=1 to run browser performance budgets.');

const FIGHT_FRAME_BUDGET = {
  minFrames: 120,
  p95Ms: 50,
  p99Ms: 85,
  over100ms: 5,
  longTaskTotalMs: 1_000,
  longestLongTaskMs: 300
};

async function installLongTaskCollector(page: Page) {
  await page.addInitScript(() => {
    const perfWindow = window as typeof window & { __koreLongTasks?: number[] };
    perfWindow.__koreLongTasks = [];
    if (!('PerformanceObserver' in window)) return;
    try {
      const observer = new PerformanceObserver((list) => {
        perfWindow.__koreLongTasks?.push(...list.getEntries().map((entry) => entry.duration));
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      // The Long Task API is not available in every browser target.
    }
  });
}

async function openMenuAttract(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await expect(page.getByRole('button', { name: 'Arcade' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('menu-attract-canvas')).toBeVisible({ timeout: 30_000 });
}

async function enterMainMenu(page: Page) {
  const title = page.locator('.title-screen');
  const arcade = page.getByRole('button', { name: 'Arcade' });
  await expect(title.or(arcade).first()).toBeVisible({ timeout: 30_000 });
  if (await title.isVisible().catch(() => false)) {
    await title.focus();
    await page.keyboard.press('Enter');
  }
  await expect(arcade).toBeVisible({ timeout: 30_000 });
}

async function startLocalFight(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.getByRole('button', { name: 'Versus' }).click({ force: true });
  await page.locator('.versus-roster-tile:not(.versus-random-tile)').first().click();
  await page.locator('.versus-target-tabs button').nth(1).click();
  await page.locator('.versus-roster-tile:not(.versus-random-tile)').nth(1).click();
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first().click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  await expect(page.locator('.fight-versus-screen')).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 15_000 });
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 3_000 });
  await expect(page.getByTestId('fight-canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(4_200);
}

async function startOnlineBotFight(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('kore.online.profile', JSON.stringify({ playerId: 'perf-player', displayName: 'PERF' }));
  });
  await page.route('**/.netlify/functions/online-matchmake', async (route) => {
    const request = route.request();
    const payload = JSON.parse(request.postData() || '{}') as { peerId?: string; characterId?: string; stageId?: string };
    const hostCharacterId = payload.characterId || 'goku';
    const guestCharacterId = hostCharacterId === 'vegeta' ? 'goku' : 'vegeta';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        role: 'host',
        status: 'matched',
        roomId: 'perf-online-bot-room',
        ownerToken: 'perf-online-bot-owner',
        hostPeerId: payload.peerId || 'perf-peer',
        guestPeerId: 'bot-perf-lagcheck',
        hostCharacterId,
        guestCharacterId,
        stageId: payload.stageId || 'the-chamber',
        queue: 'casual',
        hostKp: 1200,
        guestKp: 1230,
        opponentKind: 'bot',
        botOpponent: {
          playerId: 'bot-perf-lagcheck',
          displayName: 'PERF BOT',
          characterId: guestCharacterId,
          kp: 1230,
          kr: {
            aggression: 52,
            defense: 48,
            combo: 51,
            punishment: 50,
            resource: 49,
            consistency: 53
          },
          cpuDifficulty: 3,
          isBot: true
        }
      })
    });
  });
  await page.route('**/.netlify/functions/online-leave', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.getByRole('button', { name: 'Online' }).click({ force: true });
  await page.locator('.versus-roster-tile:not(.versus-random-tile)').first().click();
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first().click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  await expect(page.locator('.fight-versus-screen')).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 15_000 });
  await expect(page.getByTestId('match-mode')).toHaveText('versusCpu', { timeout: 5_000 });
  const onlineStatus = page.locator('.online-status-pill');
  if (await onlineStatus.isVisible().catch(() => false)) {
    await expect(onlineStatus).toContainText(/HOST ONLINE|CONNECTED/, { timeout: 20_000 });
  }
  await expect(page.getByTestId('fight-canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(4_200);
}

async function resetLongTaskCollector(page: Page) {
  await page.evaluate(() => {
    const perfWindow = window as typeof window & { __koreLongTasks?: number[] };
    perfWindow.__koreLongTasks = [];
  });
}

async function touchPoint(page: Page, testId: string, id: number) {
  const target = page.getByTestId(testId);
  await expect(target).toBeVisible();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing touch target box for ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, id, radiusX: 8, radiusY: 8, force: 1 };
}

async function sampleFramePacing(page: Page, sampleMs: number): Promise<FrameStats> {
  return page.evaluate(async (durationMs) => {
    const perfWindow = window as typeof window & { __koreLongTasks?: number[] };
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
    const sum = gaps.reduce((total, gap) => total + gap, 0);
    const longTasks = perfWindow.__koreLongTasks ?? [];
    return {
      frameCount: gaps.length,
      averageMs: Number((sum / Math.max(1, gaps.length)).toFixed(2)),
      p95Ms: Number((gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.95))] ?? 0).toFixed(2)),
      p99Ms: Number((gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * 0.99))] ?? 0).toFixed(2)),
      maxMs: Number((gaps[gaps.length - 1] ?? 0).toFixed(2)),
      over50ms: gaps.filter((gap) => gap > 50).length,
      over100ms: gaps.filter((gap) => gap > 100).length,
      longTaskCount: longTasks.length,
      longTaskTotalMs: Number(longTasks.reduce((total, duration) => total + duration, 0).toFixed(2)),
      longestLongTaskMs: Number(Math.max(0, ...longTasks).toFixed(2))
    };
  }, sampleMs);
}

function expectSmoothFight(stats: FrameStats) {
  expect(stats.frameCount, JSON.stringify(stats)).toBeGreaterThanOrEqual(FIGHT_FRAME_BUDGET.minFrames);
  expect(stats.p95Ms, JSON.stringify(stats)).toBeLessThanOrEqual(FIGHT_FRAME_BUDGET.p95Ms);
  expect(stats.p99Ms, JSON.stringify(stats)).toBeLessThanOrEqual(FIGHT_FRAME_BUDGET.p99Ms);
  expect(stats.over100ms, JSON.stringify(stats)).toBeLessThanOrEqual(FIGHT_FRAME_BUDGET.over100ms);
  expect(stats.longTaskTotalMs, JSON.stringify(stats)).toBeLessThanOrEqual(FIGHT_FRAME_BUDGET.longTaskTotalMs);
  expect(stats.longestLongTaskMs, JSON.stringify(stats)).toBeLessThanOrEqual(FIGHT_FRAME_BUDGET.longestLongTaskMs);
}

function recordResponse(records: ResourceRecord[], response: Response) {
  const headers = response.headers();
  records.push({
    url: response.url(),
    status: response.status(),
    contentType: headers['content-type'] ?? '',
    cacheControl: headers['cache-control'] ?? '',
    contentLength: Number(headers['content-length'] ?? 0)
  });
}

test.describe('menu attract performance', () => {
  test('keeps the CPU-vs-CPU menu fight smooth after warmup', async ({ page }, testInfo) => {
    const responses: ResourceRecord[] = [];
    page.on('response', (response) => recordResponse(responses, response));
    await installLongTaskCollector(page);
    await openMenuAttract(page);
    await page.waitForTimeout(5_000);
    if (testInfo.project.name === 'mobile') await page.waitForTimeout(3_000);
    const loadedAttractAssets = responses
      .map((entry) => entry.url)
      .filter((url) => url.includes('/stages/') || url.includes('/voxels'));
    testInfo.attach('loaded-attract-assets.json', {
      body: JSON.stringify(loadedAttractAssets.slice(-80), null, 2),
      contentType: 'application/json'
    });
    expect(loadedAttractAssets.some((url) => url.includes('/stages/') && url.includes('.glb')), loadedAttractAssets.join('\n')).toBe(true);
    expect(loadedAttractAssets.filter((url) => url.includes('/voxels') && url.includes('.json')).length, loadedAttractAssets.join('\n')).toBeGreaterThan(0);
    await resetLongTaskCollector(page);
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });

    expect(stats.frameCount, JSON.stringify(stats)).toBeGreaterThanOrEqual(120);
    expect(stats.p95Ms, JSON.stringify(stats)).toBeLessThanOrEqual(50);
    expect(stats.p99Ms, JSON.stringify(stats)).toBeLessThanOrEqual(85);
    expect(stats.over100ms, JSON.stringify(stats)).toBeLessThanOrEqual(5);
    expect(stats.longTaskTotalMs, JSON.stringify(stats)).toBeLessThanOrEqual(1_000);
    expect(stats.longestLongTaskMs, JSON.stringify(stats)).toBeLessThanOrEqual(250);

    const postWarmupRequests = await page.evaluate(() =>
      performance.getEntriesByType('resource')
        .filter((entry) => entry.startTime > 5_000 && entry.name.startsWith(location.origin))
        .map((entry) => entry.name.replace(location.origin, ''))
    );
    testInfo.attach('post-warmup-resources.json', {
      body: JSON.stringify(postWarmupRequests.slice(0, 80), null, 2),
      contentType: 'application/json'
    });
    expect(postWarmupRequests.filter((url) => url.includes('/stage.json?v=')).length).toBe(0);
    expect(postWarmupRequests.filter((url) => url.endsWith('.wav')).length).toBeLessThanOrEqual(4);

    if (runLivePerfTests) {
      const sameOriginResponses = responses.filter((entry) => entry.url.startsWith('https://playkore.com/'));
      const stageCacheBusts = sameOriginResponses.filter((entry) => entry.url.includes('/stage.json?v=') || entry.url.includes('/stages/index.json?v='));
      const largeWavResponses = sameOriginResponses.filter((entry) => entry.url.endsWith('.wav') && entry.contentLength > 500_000);
      const duplicateLargeWavs = new Set(
        largeWavResponses
          .map((entry) => entry.url)
          .filter((url, index, urls) => urls.indexOf(url) !== index)
      );

      expect(stageCacheBusts.map((entry) => entry.url)).toEqual([]);
      expect([...duplicateLargeWavs]).toEqual([]);
    }
  });

  test('serves live production assets with cache headers that prevent repeated heavy downloads', async ({ request }) => {
    test.skip(!runLivePerfTests, 'Live cache header checks only run for playkore.com.');
    const htmlResponse = await request.get('https://playkore.com/');
    expect(htmlResponse.ok()).toBe(true);
    const html = await htmlResponse.text();
    const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]).filter(Boolean);
    expect(assetPaths.length).toBeGreaterThan(0);
    const urls = [
      ...assetPaths.map((path) => `https://playkore.com${path}`),
      'https://playkore.com/brand/kore-logo-generated.png',
      'https://playkore.com/characters/goku/character.json',
      'https://playkore.com/characters/goku/voxels-hd/frame-004.json',
      'https://playkore.com/stages/index.json',
      'https://playkore.com/stages/the-chamber/stage.json',
      'https://playkore.com/sounds/announcer/rounds/round-1.wav'
    ];

    for (const url of urls) {
      const response = await request.get(url);
      expect(response.ok(), url).toBe(true);
      const cacheControl = response.headers()['cache-control'] ?? '';
      expect(cacheControl, url).toMatch(/max-age=(300|86400|31536000)/);
      expect(cacheControl, url).not.toContain('max-age=0');
    }
  });
});

test.describe('in-game fight performance', () => {
  test('keeps local playable fights smooth after warmup', async ({ page }, testInfo) => {
    await installLongTaskCollector(page);
    await startLocalFight(page);
    await resetLongTaskCollector(page);
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('local-fight-frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });
    expectSmoothFight(stats);
  });

  test('keeps online bot fights smooth after matchmaking connects', async ({ page }, testInfo) => {
    await installLongTaskCollector(page);
    await startOnlineBotFight(page);
    await resetLongTaskCollector(page);
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('online-fight-frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });
    expectSmoothFight(stats);
  });

  test('keeps mobile touch-input fights smooth during sustained movement and attacks', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Requires the mobile browser project.');
    await installLongTaskCollector(page);
    await startLocalFight(page);
    await expect(page.locator('.touch-controls')).toBeVisible();
    await resetLongTaskCollector(page);

    let tapping = true;
    const movement = await touchPoint(page, 'touch-right', 41);
    const attack = await touchPoint(page, 'touch-jab', 42);
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movement] });
    const attackTaps = (async () => {
      while (tapping) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [movement, attack] });
        await page.waitForTimeout(120);
        await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [movement] });
        await page.waitForTimeout(420);
      }
    })();

    let stats: FrameStats;
    try {
      stats = await sampleFramePacing(page, 8_000);
    } finally {
      tapping = false;
      await attackTaps.catch(() => undefined);
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => undefined);
      await client.detach();
    }

    testInfo.attach('mobile-touch-fight-frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });
    expectSmoothFight(stats);
  });
});
