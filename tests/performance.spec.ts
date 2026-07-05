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
  await expect(page.locator('.title-screen')).toBeVisible({ timeout: 15_000 });
  await page.locator('.title-screen').click();
  await expect(page.getByRole('button', { name: 'Arcade' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('menu-attract-canvas')).toBeVisible({ timeout: 30_000 });
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
    await page.evaluate(() => {
      const perfWindow = window as typeof window & { __koreLongTasks?: number[] };
      perfWindow.__koreLongTasks = [];
    });
    const stats = await sampleFramePacing(page, 8_000);
    testInfo.attach('frame-stats.json', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json'
    });

    expect(stats.frameCount, JSON.stringify(stats)).toBeGreaterThanOrEqual(120);
    expect(stats.p95Ms, JSON.stringify(stats)).toBeLessThanOrEqual(50);
    expect(stats.p99Ms, JSON.stringify(stats)).toBeLessThanOrEqual(85);
    expect(stats.over100ms, JSON.stringify(stats)).toBeLessThanOrEqual(5);
    expect(stats.longTaskTotalMs, JSON.stringify(stats)).toBeLessThanOrEqual(500);
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
