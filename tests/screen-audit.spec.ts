import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STARTER_GUIDE_DISMISSED_KEY = 'kore.starterGuide.dismissed.v1';

type AuditScreen =
  | 'title'
  | 'menu'
  | 'select'
  | 'stage'
  | 'versus'
  | 'fight'
  | 'fightPause'
  | 'fightResult'
  | 'training'
  | 'leaderboard'
  | 'friends'
  | 'matchHistory'
  | 'privateRooms'
  | 'customRooms'
  | 'settings'
  | 'viewer'
  | 'stageEditor'
  | 'arcadeTransition'
  | 'miniGame'
  | 'miniGameResult'
  | 'arcadeGameOver'
  | 'unlockReveal'
  | 'assetWarmup'
  | 'tournament'
  | 'tournamentLobbyLocal'
  | 'tournamentLobbyFreeOnline'
  | 'tournamentLobbyPrizepool'
  | 'tournamentLobbyPrizepoolCheckout'
  | 'tournamentLobbyPrizepoolClaim'
  | 'tournamentLobbyPrizepoolReview'
  | 'tournamentLobbyPaidRecovery'
  | 'tournamentBracketLocal'
  | 'tournamentBracketOnline'
  | 'tournamentFightResult';

type AuditViewport = {
  name: string;
  width: number;
  height: number;
  mobile?: boolean;
};

type AuditRow = {
  screen: AuditScreen;
  viewport: string;
  status: 'good' | 'bad';
  screenshot: string;
  issues: string[];
};

const auditViewports: AuditViewport[] = [
  { name: 'steam-deck', width: 1280, height: 800 },
  { name: 'mobile-portrait', width: 390, height: 844, mobile: true },
  { name: 'mobile-landscape', width: 844, height: 390, mobile: true }
];

const auditScreens: AuditScreen[] = [
  'title',
  'menu',
  'select',
  'stage',
  'versus',
  'fight',
  'fightPause',
  'fightResult',
  'training',
  'leaderboard',
  'friends',
  'matchHistory',
  'privateRooms',
  'customRooms',
  'settings',
  'viewer',
  'stageEditor',
  'arcadeTransition',
  'miniGame',
  'miniGameResult',
  'arcadeGameOver',
  'unlockReveal',
  'assetWarmup',
  'tournament',
  'tournamentLobbyLocal',
  'tournamentLobbyFreeOnline',
  'tournamentLobbyPrizepool',
  'tournamentLobbyPrizepoolCheckout',
  'tournamentLobbyPrizepoolClaim',
  'tournamentLobbyPrizepoolReview',
  'tournamentLobbyPaidRecovery',
  'tournamentBracketLocal',
  'tournamentBracketOnline',
  'tournamentFightResult'
];

test.describe('mobile and Steam Deck screen audit', () => {
  test('captures and reviews app screens', async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    const reportDir = path.resolve(process.cwd(), 'test-results-screen-audit', testInfo.project.name);
    mkdirSync(reportDir, { recursive: true });
    const rows: AuditRow[] = [];
    const viewports = testInfo.project.name === 'mobile'
      ? auditViewports.filter((viewport) => viewport.mobile)
      : auditViewports;

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await bootstrapAuditApp(page);

      for (const screen of auditScreens) {
        await openAuditScreen(page, screen);
        await settleScreen(page, screen);
        const screenshotName = `${viewport.name}-${screen}.png`;
        const screenshotPath = path.join(reportDir, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        const issues = await collectLayoutIssues(page, screen);
        rows.push({
          screen,
          viewport: viewport.name,
          status: issues.length > 0 ? 'bad' : 'good',
          screenshot: path.relative(process.cwd(), screenshotPath),
          issues
        });
      }
    }

    const reportPath = path.join(reportDir, 'report.json');
    writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
    await testInfo.attach('screen-audit-report', {
      path: reportPath,
      contentType: 'application/json'
    });

    const badRows = rows.filter((row) => row.status === 'bad');
    expect(badRows, JSON.stringify(badRows, null, 2)).toEqual([]);
  });
});

async function bootstrapAuditApp(page: Page) {
  await page.goto('/');
  await page.evaluate((key) => window.localStorage.setItem(key, '1'), STARTER_GUIDE_DISMISSED_KEY);
  await expect(page.locator('.title-screen')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => typeof (window as typeof window & { __koreE2EOpenAuditScreen?: unknown }).__koreE2EOpenAuditScreen === 'function', null, { timeout: 30_000 });
}

async function openAuditScreen(page: Page, screen: AuditScreen) {
  if (screen === 'fightPause' || screen === 'fightResult') {
    await openAuditScreen(page, 'fight');
    if (screen === 'fightPause') {
      await page.keyboard.press('Escape');
      await expect(page.locator('.pause-overlay')).toBeVisible({ timeout: 10_000 });
      return;
    }
    if (await page.locator('.pause-overlay').isVisible().catch(() => false)) {
      await page.getByRole('button', { name: 'Resume' }).click();
      await expect(page.locator('.pause-overlay')).toHaveCount(0, { timeout: 10_000 });
    }
    await page.evaluate(() => {
      const testWindow = window as typeof window & { __koreE2EForceMatchOver?: (winnerSlot?: 1 | 2) => void };
      testWindow.__koreE2EForceMatchOver?.(1);
    });
    await expect(page.locator('.results-overlay')).toBeVisible({ timeout: 10_000 });
    return;
  }
  if (screen === 'tournamentFightResult') {
    await page.evaluate((targetScreen) => {
      const testWindow = window as typeof window & { __koreE2EOpenAuditScreen?: (screen: string) => void };
      if (!testWindow.__koreE2EOpenAuditScreen) throw new Error('Missing KORE screen audit hook');
      testWindow.__koreE2EOpenAuditScreen(targetScreen);
    }, screen);
    await page.waitForFunction(() => typeof (window as typeof window & { __koreE2EForceMatchOver?: unknown }).__koreE2EForceMatchOver === 'function', null, { timeout: 10_000 });
    await page.evaluate(() => {
      const testWindow = window as typeof window & { __koreE2EForceMatchOver?: (winnerSlot?: 1 | 2) => void };
      testWindow.__koreE2EForceMatchOver?.(1);
    });
    await expect(page.locator('.results-overlay')).toBeVisible({ timeout: 10_000 });
    return;
  }
  await page.evaluate((targetScreen) => {
    const testWindow = window as typeof window & { __koreE2EOpenAuditScreen?: (screen: string) => void };
    if (!testWindow.__koreE2EOpenAuditScreen) throw new Error('Missing KORE screen audit hook');
    testWindow.__koreE2EOpenAuditScreen(targetScreen);
  }, screen);
  if (screen === 'fight') {
    await page.waitForFunction(() => typeof (window as typeof window & { __koreE2EForceMatchOver?: unknown }).__koreE2EForceMatchOver === 'function', null, { timeout: 10_000 });
  }
}

async function settleScreen(page: Page, screen: AuditScreen) {
  const selector = screenSelector(screen);
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(screen === 'unlockReveal' || screen === 'arcadeTransition' ? 900 : 350);
}

function screenSelector(screen: AuditScreen) {
  if (screen === 'fightPause') return '.pause-overlay';
  if (screen === 'fightResult') return '.results-overlay';
  if (screen === 'tournamentFightResult') return '.results-overlay';
  if (screen.startsWith('tournamentLobby')) return '.tournament-lobby-screen';
  if (screen.startsWith('tournamentBracket')) return '.tournament-bracket-intro';
  const selectors: Record<Exclude<AuditScreen, 'fightPause' | 'fightResult' | 'tournamentFightResult' | `tournamentLobby${string}` | `tournamentBracket${string}`>, string> = {
    title: '.title-screen',
    menu: '.menu-screen',
    select: '.select-screen',
    stage: '.stage-screen',
    versus: '.fight-versus-screen',
    fight: '.fight-screen',
    training: '.training-select-screen',
    leaderboard: '.leaderboard-screen',
    friends: '.friend-list-screen',
    matchHistory: '.match-history-screen',
    privateRooms: '.private-rooms-screen',
    customRooms: '.custom-entry-screen',
    settings: '.settings-screen',
    viewer: '.viewer-screen',
    stageEditor: '.stage-editor-screen',
    arcadeTransition: '.arcade-transition-screen',
    miniGame: '.mini-game-screen',
    miniGameResult: '.mini-game-result-screen',
    arcadeGameOver: '.arcade-game-over-screen',
    unlockReveal: '.unlock-reveal-screen',
    assetWarmup: '[data-testid="asset-warmup-screen"]',
    tournament: '.tournament-select-screen'
  };
  return selectors[screen];
}

async function collectLayoutIssues(page: Page, screen: AuditScreen): Promise<string[]> {
  return page.evaluate((rootSelector) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const issues: string[] = [];
    const horizontalOverflow = Math.ceil(document.documentElement.scrollWidth - viewportWidth);
    if (horizontalOverflow > 2) issues.push(`document horizontal overflow ${horizontalOverflow}px`);
    const root = document.querySelector<HTMLElement>(rootSelector) ?? document.body;

    const candidateSelector = 'button, a, input, textarea, select, h1, h2, h3, p, span, strong, small, label, .primary-button, .secondary-button';
    const assetWarmupSelector = [
      '.arcade-transition-copy button',
      '.arcade-transition-copy a',
      '.arcade-transition-copy h1',
      '.arcade-transition-copy h2',
      '.arcade-transition-copy h3',
      '.arcade-transition-copy p',
      '.arcade-transition-copy span',
      '.arcade-transition-copy strong',
      '.arcade-transition-copy small',
      '.arcade-transition-footer span'
    ].join(', ');
    const candidates = [...root.querySelectorAll<HTMLElement>(root.matches('[data-testid="asset-warmup-screen"]') ? assetWarmupSelector : candidateSelector)];
    const scrollCarouselSelector = '.stage-thumbnail-grid, .loader-bar, .versus-roster-scroll, .tournament-bracket-board';
    const intentionallyClippedSelector = [
      '.stage-preview',
      '.stage-thumbnail-preview-art',
      '.versus-hero',
      '.versus-roster-tile',
      '.versus-random-tile',
      '.fight-versus-stage strong',
      '.fight-versus-name strong',
      '.tournament-stat strong',
      '.tournament-entrant-row strong',
      '.tournament-intro-card strong',
      '[aria-hidden="true"]'
    ].join(', ');
    for (const element of candidates) {
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
      if (element.closest('[aria-hidden="true"]')) continue;
      if (element.closest('.asset-warmup-hidden-scene')) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.right < -2 || rect.left > viewportWidth + 2 || rect.bottom < -2 || rect.top > viewportHeight + 2) continue;
      const name = (element.getAttribute('aria-label') || element.textContent || element.className || element.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 64);
      const scrollCarousel = element.closest<HTMLElement>(scrollCarouselSelector);
      const carouselCanScroll = scrollCarousel && scrollCarousel.scrollWidth - scrollCarousel.clientWidth > 2;
      if (!carouselCanScroll && (rect.left < -2 || rect.right > viewportWidth + 2)) issues.push(`${element.tagName.toLowerCase()} "${name}" escapes viewport horizontally`);
      if (element.matches('button, a, input, textarea, select, .primary-button, .secondary-button') && rect.width < 40 && rect.height < 40) {
        issues.push(`${element.tagName.toLowerCase()} "${name}" hit area below 40px`);
      }
      const clipsX = element.scrollWidth - element.clientWidth > 2 && !['visible', 'clip'].includes(style.overflowX);
      const clipsY = element.scrollHeight - element.clientHeight > 2 && !['visible', 'clip'].includes(style.overflowY);
      if ((clipsX || clipsY) && !element.matches(intentionallyClippedSelector)) issues.push(`${element.tagName.toLowerCase()} "${name}" clips content`);
      if (rect.bottom > viewportHeight + 8 && style.position === 'fixed') issues.push(`${element.tagName.toLowerCase()} "${name}" fixed element below viewport`);
    }
    return [...new Set(issues)].slice(0, 20);
  }, screenSelector(screen));
}
