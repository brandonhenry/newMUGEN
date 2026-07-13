import { expect, test, type Page, type Response } from '@playwright/test';
import { makeDefaultRankedProfile } from '../src/lib/online/ranked';

const runPerfTests = process.env.KORE_RUN_PERF_TESTS === '1';
const runLivePerfTests = process.env.KORE_LIVE_PERF_TEST === '1';

type ResourceRecord = {
  url: string;
  status: number;
  contentType: string;
  cacheControl: string;
  contentLength: number;
  requestHeaders: Record<string, string>;
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

async function forceKiroRivenMenuAttract(page: Page) {
  await page.addInitScript(() => {
    (window as typeof window & { __KORE_FORCE_MENU_ATTRACT_IDS__?: [string, string] }).__KORE_FORCE_MENU_ATTRACT_IDS__ = ['kiro', 'riven'];
  });
}

async function forceSnappyMenuPerformance(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('kore.gameSettings', JSON.stringify({
      version: 7,
      settings: {
        performance: {
          autoDetectMenuLag: false,
          menuAttractMode: 'snappy',
          menuMotionMode: 'snappy'
        }
      }
    }));
  });
}

async function expectNoHdProceduralFallback(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __KORE_HD_VOXEL_PROCEDURAL_FALLBACKS__?: number }).__KORE_HD_VOXEL_PROCEDURAL_FALLBACKS__ ?? 0)).toBe(0);
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

async function startLocalFight(page: Page, stageName?: string) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.getByRole('button', { name: 'Versus' }).click({ force: true });
  await page.locator('.versus-roster-tile:not(.versus-random-tile)').first().click();
  await page.locator('.versus-target-tabs button').nth(1).click();
  await page.locator('.versus-roster-tile:not(.versus-random-tile)').nth(1).click();
  await page.getByRole('button', { name: 'Stage' }).click();
  if (stageName) {
    await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').filter({ hasText: stageName }).click();
  } else {
    await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first().click();
  }
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  const versusScreen = page.locator('.fight-versus-screen');
  await expect(versusScreen).toBeVisible({ timeout: 5_000 });
  await versusScreen.press('Enter');
  const assetWarmup = page.getByTestId('asset-warmup-screen');
  await page.waitForTimeout(600);
  if (await assetWarmup.isVisible().catch(() => false)) {
    await expect(assetWarmup).toContainText('Entering stage', { timeout: 15_000 });
    await assetWarmup.press('Enter');
  }
  await expect(page.getByTestId('match-phase')).toHaveText('fighting', { timeout: 15_000 });
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 3_000 });
  await expect(page.getByTestId('fight-canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(4_200);
}

async function startBasicTrainingTrial(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.getByRole('button', { name: 'Training' }).click({ force: true });
  await expect(page.locator('.training-select-screen')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Start Training' }).click();
  await expect(page.getByTestId('asset-warmup-screen')).toContainText('Ready', { timeout: 15_000 });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('match-mode')).toHaveText('training', { timeout: 15_000 });
  await page.waitForTimeout(4_200);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Training Mode' }).click();
  await page.getByRole('button', { name: /Basic Trials/ }).click();
  await page.getByRole('button', { name: /Walk In/ }).click();
  await page.getByRole('button', { name: 'Try', exact: true }).click();
  await expect(page.locator('.training-trial-hud')).toBeVisible({ timeout: 5_000 });
}

async function completeTrainingTrialAndContinue(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __koreE2ECompleteTrainingTrial?: () => void };
    if (!testWindow.__koreE2ECompleteTrainingTrial) throw new Error('Missing KORE e2e training completion hook');
    testWindow.__koreE2ECompleteTrainingTrial();
  });
  await expect(page.getByTestId('training-success-overlay')).toContainText('SUCCESS', { timeout: 5_000 });
  await page.getByRole('button', { name: /Next Trial|Review Next/ }).click();
  await expect(page.getByTestId('training-success-overlay')).toHaveCount(0);
  await expect(page.getByTestId('frame-input')).toHaveText('none', { timeout: 3_000 });
}

type OnlineBotPerfMode = 'online' | 'ranked';

async function startOnlineBotFight(page: Page, perfMode: OnlineBotPerfMode = 'online') {
  const rankedProfile = makeDefaultRankedProfile({ playerId: 'perf-player', displayName: 'PERF' });
  rankedProfile.placement = {
    ...rankedProfile.placement,
    complete: true,
    matchesPlayed: rankedProfile.placement.requiredMatches,
    ratingEstimate: rankedProfile.kp,
    nextBotKp: 1230
  };
  await page.addInitScript(() => {
    window.localStorage.setItem('kore.starterGuide.dismissed.v1', '1');
    window.localStorage.setItem('kore.online.profile', JSON.stringify({ playerId: 'perf-player', displayName: 'PERF' }));
    (window as any).__KORE_E2E_PEER_FACTORY__ = async (options: any) => {
      window.setTimeout(() => options.onOpen?.('perf-peer'), 0);
      return {
        peer: { id: 'perf-peer', open: true, destroy() {} },
        peerId: 'perf-peer',
        connection: null,
        connect() {
          throw new Error('Perf bot match should not open peer connections');
        },
        send() {},
        close() {}
      };
    };
  });
  await page.route('**/.netlify/functions/online-matchmake', async (route) => {
    const request = route.request();
    const payload = JSON.parse(request.postData() || '{}') as { peerId?: string; characterId?: string; stageId?: string; queue?: string };
    const hostCharacterId = payload.characterId || 'goku';
    const guestCharacterId = hostCharacterId === 'vegeta' ? 'goku' : 'vegeta';
    const queue = payload.queue === 'ranked' ? 'ranked' : 'casual';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        role: 'host',
        status: 'matched',
        roomId: `perf-${queue}-bot-room`,
        ownerToken: `perf-${queue}-bot-owner`,
        hostPeerId: payload.peerId || 'perf-peer',
        guestPeerId: `bot-perf-${queue}-lagcheck`,
        hostCharacterId,
        guestCharacterId,
        stageId: payload.stageId || 'the-chamber',
        queue,
        hostKp: 1200,
        guestKp: 1230,
        opponentKind: 'bot',
        botOpponent: {
          playerId: `bot-perf-${queue}-lagcheck`,
          displayName: queue === 'ranked' ? 'RANKED PERF BOT' : 'PERF BOT',
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
  await page.route('**/.netlify/functions/online-ranked-profile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rankedProfile)
    });
  });
  await page.route('**/.netlify/functions/online-ranked-submit', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reportId: 'perf-ranked-report', players: [] })
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await enterMainMenu(page);
  await page.getByRole('button', { name: 'Online' }).click({ force: true });
  if (perfMode === 'ranked') {
    await page.getByRole('button', { name: 'Next match mode' }).click();
    await expect(page.locator('.mode-carousel-current')).toContainText('Ranked', { timeout: 5_000 });
  }
  await page.locator('.versus-roster-tile:not(.versus-random-tile)').first().click();
  await page.getByRole('button', { name: 'Stage' }).click();
  await page.locator('.stage-thumbnail:not(.stage-random-thumbnail)').first().click();
  await page.getByRole('button', { name: 'Fight', exact: true }).click();
  const versusScreen = page.locator('.fight-versus-screen');
  await expect(versusScreen).toBeVisible({ timeout: 5_000 });
  await versusScreen.press('Enter');
  await expect(page.getByTestId('match-phase')).toHaveText(/intro|fighting/, { timeout: 30_000 });
  await expect(page.getByTestId('match-mode')).toHaveText('versusCpu', { timeout: 5_000 });
  const onlineStatus = page.locator('.online-status-pill');
  if (await onlineStatus.isVisible().catch(() => false)) {
    await expect(onlineStatus).toContainText(/HOST ONLINE|CONNECTED|RANKED|LOOKING FOR RANKED MATCH/, { timeout: 20_000 });
  }
  await expect(page.getByTestId('fight-canvas')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(8_000);
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

async function getWebglRendererInfo(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { vendor: 'unavailable', renderer: 'unavailable' };
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      return {
        vendor: String(gl.getParameter(gl.VENDOR)),
        renderer: String(gl.getParameter(gl.RENDERER))
      };
    }
    return {
      vendor: String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
    };
  });
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
    contentLength: Number(headers['content-length'] ?? 0),
    requestHeaders: response.request().headers()
  });
}

function expectVoxelBinsRequestedWithRange(records: ResourceRecord[]) {
  const binRequests = records.filter((entry) => entry.url.includes('/voxels-hd/voxel-pack-v1.bin'));
  expect(binRequests.length, records.map((entry) => entry.url).join('\n')).toBeGreaterThan(0);
  expect(binRequests.every((entry) => Boolean(entry.requestHeaders.range)), JSON.stringify(binRequests, null, 2)).toBe(true);
}

test.describe('menu attract performance', () => {
  test('keeps Chamber stage and packed HD voxel assets with recommended menu performance settings', async ({ page }, testInfo) => {
    const responses: ResourceRecord[] = [];
    page.on('response', (response) => recordResponse(responses, response));
    await forceKiroRivenMenuAttract(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('kore.gameSettings', JSON.stringify({
        version: 7,
        settings: {
          performance: {
            autoDetectMenuLag: true,
            menuAttractMode: 'snappy',
            menuMotionMode: 'snappy'
          }
        }
      }));
    });

    await openMenuAttract(page);
    await page.waitForTimeout(5_000);
    const loadedAttractAssets = responses
      .map((entry) => entry.url)
      .filter((url) => url.includes('/stages/') || url.includes('/voxels'));
    testInfo.attach('recommended-menu-assets.json', {
      body: JSON.stringify(loadedAttractAssets.slice(-80), null, 2),
      contentType: 'application/json'
    });
    expect(loadedAttractAssets.some((url) => url.includes('/stages/the-chamber/stage.json') || url.includes('/stages/chamber/')), loadedAttractAssets.join('\n')).toBe(true);
    expect(loadedAttractAssets.some((url) => url.includes('/voxels-hd/voxel-pack-v1.json')), loadedAttractAssets.join('\n')).toBe(true);
    expect(loadedAttractAssets.some((url) => url.includes('/voxels-hd/voxel-pack-v1.bin')), loadedAttractAssets.join('\n')).toBe(true);
    expectVoxelBinsRequestedWithRange(responses);
    await expectNoHdProceduralFallback(page);
  });

  test('keeps the CPU-vs-CPU menu fight smooth after warmup', async ({ page }, testInfo) => {
    const responses: ResourceRecord[] = [];
    page.on('response', (response) => recordResponse(responses, response));
    await forceKiroRivenMenuAttract(page);
    await forceSnappyMenuPerformance(page);
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
    expect(loadedAttractAssets.some((url) => url.includes('/stages/chamber/') || (url.includes('/stages/') && url.includes('.glb'))), loadedAttractAssets.join('\n')).toBe(true);
    expect(loadedAttractAssets.some((url) => url.includes('/voxels-hd/voxel-pack-v1.json')), loadedAttractAssets.join('\n')).toBe(true);
    expect(loadedAttractAssets.some((url) => url.includes('/voxels-hd/voxel-pack-v1.bin')), loadedAttractAssets.join('\n')).toBe(true);
    expectVoxelBinsRequestedWithRange(responses);
    await expectNoHdProceduralFallback(page);
    await resetLongTaskCollector(page);
    const stats = await sampleFramePacing(page, 8_000);
    const renderer = await getWebglRendererInfo(page);
    testInfo.attach('frame-stats.json', {
      body: JSON.stringify({ renderer, stats }, null, 2),
      contentType: 'application/json'
    });
    const softwareRenderer = /swiftshader|software|llvmpipe/i.test(`${renderer.vendor} ${renderer.renderer}`);

    expect(stats.frameCount, JSON.stringify({ renderer, stats })).toBeGreaterThanOrEqual(softwareRenderer ? 240 : 470);
    expect(stats.averageMs, JSON.stringify({ renderer, stats })).toBeLessThanOrEqual(softwareRenderer ? 35 : 17.5);
    expect(stats.p95Ms, JSON.stringify({ renderer, stats })).toBeLessThanOrEqual(softwareRenderer ? 50 : 20);
    expect(stats.p99Ms, JSON.stringify({ renderer, stats })).toBeLessThanOrEqual(softwareRenderer ? 85 : 34);
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
    expect(postWarmupRequests.filter((url) => /\/voxels-hd\/frame-\d+\.json/.test(url)).length).toBe(0);
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
      'https://playkore.com/characters/goku/voxels-hd/voxel-pack-v1.json',
      'https://playkore.com/characters/goku/voxels-hd/voxel-pack-v1.bin',
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
    const responses: ResourceRecord[] = [];
    page.on('response', (response) => recordResponse(responses, response));
    await forceSnappyMenuPerformance(page);
    await page.addInitScript(() => window.localStorage.setItem('kore.starterGuide.dismissed.v1', '1'));
    await installLongTaskCollector(page);
    await startLocalFight(page);
    const loadedFightAssets = responses
      .map((entry) => entry.url)
      .filter((url) => url.includes('/voxels'));
    testInfo.attach('local-fight-voxel-assets.json', {
      body: JSON.stringify(loadedFightAssets.slice(-80), null, 2),
      contentType: 'application/json'
    });
    expect(loadedFightAssets.some((url) => url.includes('/voxels-hd/voxel-pack-v1.json')), loadedFightAssets.join('\n')).toBe(true);
    expect(loadedFightAssets.some((url) => url.includes('/voxels-hd/voxel-pack-v1.bin')), loadedFightAssets.join('\n')).toBe(true);
    expectVoxelBinsRequestedWithRange(responses);
    await expectNoHdProceduralFallback(page);
    await resetLongTaskCollector(page);
    await page.evaluate(() => performance.clearResourceTimings());
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('local-fight-frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });
    expectSmoothFight(stats);
    const postWarmupRequests = await page.evaluate(() =>
      performance.getEntriesByType('resource')
        .filter((entry) => entry.name.startsWith(location.origin))
        .map((entry) => entry.name.replace(location.origin, ''))
    );
    testInfo.attach('local-fight-post-warmup-resources.json', {
      body: JSON.stringify(postWarmupRequests.slice(0, 80), null, 2),
      contentType: 'application/json'
    });
    expect(postWarmupRequests.filter((url) => /\/voxels-hd\/frame-\d+\.json/.test(url)).length).toBe(0);
  });

  test('keeps batched natural-stage tree borders smooth after warmup', async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await forceSnappyMenuPerformance(page);
    await page.addInitScript(() => window.localStorage.setItem('kore.starterGuide.dismissed.v1', '1'));
    const stages = process.env.KORE_PERF_TREE_STAGES?.split(',').map((name) => name.trim()).filter(Boolean)
      ?? ['Grasslands', 'Fog Marsh'];
    for (const stageName of stages) {
      const responses: ResourceRecord[] = [];
      page.on('response', (response) => recordResponse(responses, response));
      await installLongTaskCollector(page);
      await startLocalFight(page, stageName);
      expect(responses.some((entry) => entry.url.includes('/stage-props/tree-pack-1.1/tree-pack.glb')), `${stageName}\n${responses.map((entry) => entry.url).join('\n')}`).toBe(true);
      await resetLongTaskCollector(page);
      const stats = await sampleFramePacing(page, 6_000);
      testInfo.attach(`${stageName.toLowerCase().replace(/\s+/g, '-')}-tree-border-frame-stats.json`, {
        body: JSON.stringify(stats, null, 2),
        contentType: 'application/json'
      });
      expectSmoothFight(stats);
      page.removeAllListeners('response');
    }
  });

  test('keeps training trials smooth after repeated success transitions', async ({ page }, testInfo) => {
    await installLongTaskCollector(page);
    await startBasicTrainingTrial(page);
    for (let index = 0; index < 3; index += 1) {
      await completeTrainingTrialAndContinue(page);
    }
    await resetLongTaskCollector(page);
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('training-trial-frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });
    expectSmoothFight(stats);
  });

  test('keeps casual online bot fights smooth after matchmaking connects', async ({ page }, testInfo) => {
    await installLongTaskCollector(page);
    await startOnlineBotFight(page, 'online');
    await resetLongTaskCollector(page);
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('online-casual-fight-frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });
    expectSmoothFight(stats);
  });

  test('keeps ranked online bot fights smooth after matchmaking connects', async ({ page }, testInfo) => {
    await installLongTaskCollector(page);
    await startOnlineBotFight(page, 'ranked');
    await resetLongTaskCollector(page);
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('online-ranked-fight-frame-stats.json', {
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
