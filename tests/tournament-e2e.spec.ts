import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import type { TournamentBracket, TournamentEntry, TournamentStatusResult } from '../src/lib/tournament/types';

const STARTER_GUIDE_DISMISSED_KEY = 'kore.starterGuide.dismissed.v1';

test.describe('tournament end-to-end simulations', () => {
  test.setTimeout(90_000);

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    await attachScreenshot(page, testInfo, 'tournament-failure');
  });

  test('completes a local tournament and returns to the tournament page', async ({ page }) => {
    await startFromSplash(page);
    await page.getByRole('button', { name: 'Tournament' }).click();
    await page.getByRole('button', { name: 'Start Free' }).click();

    for (let round = 0; round < 4; round += 1) {
      await enterCurrentTournamentFight(page, 'tournamentLocal');
      await forceMatchOver(page, 1);
      await page.waitForTimeout(1900);
      if (await page.locator('.tournament-lobby-screen').isVisible().catch(() => false)) break;
    }

    await expect(page.locator('.tournament-lobby-screen')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.tournament-lobby-screen')).toContainText(/won the tournament|Winner:/i);
    await expect(page.locator('.tournament-lobby-screen')).toContainText(/Local tournament crown|Reward/i);
  });

  test('completes a free online human tournament match with Add Friend and Next Round', async ({ page }) => {
    const seeded = makeOnlineTournamentStatus('freeOnline');
    let reportCount = 0;
    await page.route('**/.netlify/functions/tournament-report', async (route) => {
      reportCount += 1;
      const request = route.request().postDataJSON() as { winnerEntryId?: string };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(completeTournamentStatus(seeded, request.winnerEntryId ?? seeded.entry!.id))
      });
    });

    await startFromSplash(page);
    await seedOnlineTournament(page, seeded);
    await expect(page.locator('.tournament-lobby-screen')).toContainText('Match room ready');
    await page.getByRole('button', { name: 'Start Match' }).click();
    await enterCurrentTournamentFight(page, 'online');
    await forceMatchOver(page, 1);

    await expect(page.getByRole('button', { name: 'Add Friend' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Next Round' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Friend' }).click();
    await expect(page.getByRole('button', { name: 'Added' })).toBeVisible();
    await page.getByRole('button', { name: 'Next Round' }).click();

    await expect(page.locator('.tournament-lobby-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.tournament-lobby-screen')).toContainText('Winner: E2E Player');
    expect(reportCount).toBe(1);
  });

  test('submits a saved tournament result once after returning to the lobby', async ({ page }) => {
    const seeded = makeOnlineTournamentStatus('freeOnline');
    let reportCount = 0;
    await page.route('**/.netlify/functions/tournament-report', async (route) => {
      reportCount += 1;
      const request = route.request().postDataJSON() as { winnerEntryId?: string };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(completeTournamentStatus(seeded, request.winnerEntryId ?? seeded.entry!.id))
      });
    });

    await startFromSplash(page);
    await seedOnlineTournament(page, seeded);
    await page.getByRole('button', { name: 'Start Match' }).click();
    await enterCurrentTournamentFight(page, 'online');
    await forceMatchOver(page, 1);
    await expect(page.getByRole('button', { name: 'Next Round' })).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await startFromSplash(page);
    await seedOnlineTournament(page, seeded);

    await expect(page.locator('.tournament-lobby-screen')).toContainText('Submitting saved tournament result', { timeout: 10_000 });
    await expect(page.locator('.tournament-lobby-screen')).toContainText('Winner: E2E Player', { timeout: 10_000 });
    expect(reportCount).toBe(1);
  });

  test('completes a prizepool tournament and claims the winner reward', async ({ page }) => {
    const seeded = makeOnlineTournamentStatus('paidOnline');
    let reportCount = 0;
    let claimCount = 0;
    await page.route('**/.netlify/functions/tournament-report', async (route) => {
      reportCount += 1;
      const request = route.request().postDataJSON() as { winnerEntryId?: string };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(completeTournamentStatus(seeded, request.winnerEntryId ?? seeded.entry!.id, { payoutPending: true }))
      });
    });
    await page.route('**/.netlify/functions/tournament-claim-prize', async (route) => {
      claimCount += 1;
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          bracket: completeTournamentStatus(seeded, seeded.entry!.id, { payoutSent: true }).bracket,
          entry: { ...seeded.entry, payoutState: 'rewardSent', payoutAmountSats: 1500, payoutInvoice: 'lnbc1500e2e' },
          payout: { status: 'paid', amountSats: 1500, checkingId: 'e2e-prize-check', paidAt: Date.now() }
        })
      });
    });

    await startFromSplash(page);
    await seedOnlineTournament(page, seeded);
    await expect(page.locator('.tournament-lobby-screen')).toContainText('Match room ready');
    await page.getByRole('button', { name: 'Join Match Room' }).click();
    await enterCurrentTournamentFight(page, 'online');
    await forceMatchOver(page, 1);

    await expect(page.getByRole('button', { name: 'Add Friend' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Next Round' }).click();
    await expect(page.locator('.tournament-lobby-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.tournament-claim-form')).toContainText('Prize ready');
    await expect(page.locator('.tournament-claim-form')).toContainText('1,500 sats');

    await page.locator('.tournament-claim-form input').fill('lnbc1500n1pje2etestinvoiceforplaywrightrewardclaim000');
    await page.getByRole('button', { name: 'Claim' }).click();
    await expect(page.locator('.tournament-lobby-screen')).toContainText('Prize sent', { timeout: 10_000 });
    await expect(page.locator('.tournament-lobby-screen')).toBeVisible();
    expect(reportCount).toBe(1);
    expect(claimCount).toBe(1);
  });

  test('does not show Add Friend for bot tournament opponents', async ({ page }) => {
    const seeded = makeOnlineTournamentStatus('freeOnline', { botOpponent: true });
    await page.route('**/.netlify/functions/tournament-report', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(completeTournamentStatus(seeded, seeded.entry!.id))
      });
    });

    await startFromSplash(page);
    await seedOnlineTournament(page, seeded);
    await page.getByRole('button', { name: 'Start Match' }).click();
    await enterCurrentTournamentFight(page, 'online');
    await forceMatchOver(page, 1);

    await expect(page.getByRole('button', { name: 'Next Round' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Add Friend' })).toHaveCount(0);
  });

  test('blocks reviewed tournament rooms from starting a match', async ({ page }) => {
    const seeded = makeOnlineTournamentStatus('freeOnline');
    const reviewed: TournamentStatusResult = {
      ...seeded,
      assignedMatch: {
        ...seeded.assignedMatch!,
        roomStatus: 'review',
        reportState: 'conflict'
      },
      matchRoom: {
        ...seeded.matchRoom!,
        status: 'review'
      },
      statusText: 'Result conflict needs review'
    };

    await startFromSplash(page);
    await seedOnlineTournament(page, reviewed);

    await expect(page.locator('.tournament-lobby-screen')).toContainText('Match needs review');
    await expect(page.getByRole('button', { name: 'Start Match' })).toBeDisabled();
  });

  test('recovers a paid tournament entry by email code after device mismatch', async ({ page }) => {
    const recovered = makeOnlineTournamentStatus('paidOnline');
    await page.route('**/.netlify/functions/tournament-paid-recovery-request', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, email: 'e2***@example.com', emailSent: true, expiresAt: Date.now() + 600000 })
      });
    });
    await page.route('**/.netlify/functions/tournament-paid-recovery-confirm', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(recovered)
      });
    });

    await startFromSplash(page);
    await seedPaidRecoveryPrompt(page);
    await expect(page.locator('.tournament-recovery-form')).toContainText('Paid Entry Recovery');

    await page.getByRole('button', { name: 'Send Code' }).click();
    await expect(page.locator('.tournament-recovery-form')).toContainText('Recovery code sent');
    await page.getByRole('textbox', { name: 'Recovery code' }).fill('123456');
    await page.getByRole('button', { name: 'Recover Entry' }).click();

    await expect(page.locator('.tournament-lobby-screen')).toContainText('Match room ready', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Join Match Room' })).toBeEnabled();
  });

  test('shows a usable paid recovery throttle message', async ({ page }) => {
    await page.route('**/.netlify/functions/tournament-paid-recovery-request', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'recovery_request_limited', message: 'Too many recovery code requests. Try again in a few minutes.' })
      });
    });

    await startFromSplash(page);
    await seedPaidRecoveryPrompt(page);
    await page.getByRole('button', { name: 'Send Code' }).click();

    await expect(page.locator('.tournament-recovery-form')).toContainText('Too many recovery code requests', { timeout: 10_000 });
    await expect(page.locator('.tournament-recovery-form')).toBeVisible();
  });
});

async function startFromSplash(page: Page) {
  await page.goto('/');
  await page.evaluate((key) => window.localStorage.setItem(key, '1'), STARTER_GUIDE_DISMISSED_KEY);
  await activateAnyInputScreen(page, '.title-screen');
  await expect(page.getByRole('button', { name: 'Arcade' })).toBeVisible({ timeout: 10_000 });
}

async function activateAnyInputScreen(page: Page, selector: string) {
  const target = page.locator(selector);
  await expect(target).toBeVisible({ timeout: 15_000 });
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

async function enterCurrentTournamentFight(page: Page, expectedMode: 'tournamentLocal' | 'online') {
  if (await page.locator('.tournament-bracket-intro').isVisible().catch(() => false)) {
    await activateAnyInputScreen(page, '.tournament-bracket-intro');
  }
  if (await page.getByTestId('asset-warmup-screen').isVisible({ timeout: 1000 }).catch(() => false)) {
    await expect(page.getByTestId('asset-warmup-screen')).toContainText('Ready', { timeout: 20_000 });
    await activateAnyInputScreen(page, '[data-testid="asset-warmup-screen"]');
  }
  if (await page.locator('.fight-versus-screen').isVisible({ timeout: 1000 }).catch(() => false)) {
    await activateAnyInputScreen(page, '.fight-versus-screen');
  }
  if (await page.getByTestId('asset-warmup-screen').isVisible({ timeout: 1000 }).catch(() => false)) {
    await expect(page.getByTestId('asset-warmup-screen')).toContainText('Ready', { timeout: 20_000 });
    await activateAnyInputScreen(page, '[data-testid="asset-warmup-screen"]');
  }
  await expect(page.getByTestId('match-mode').filter({ hasText: expectedMode }).first()).toBeVisible({ timeout: 30_000 });
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

async function seedOnlineTournament(page: Page, status: TournamentStatusResult) {
  await page.evaluate((nextStatus) => {
    const testWindow = window as typeof window & {
      __koreE2ESeedOnlineTournament?: (status: TournamentStatusResult) => void;
    };
    if (!testWindow.__koreE2ESeedOnlineTournament) throw new Error('Missing KORE e2e tournament seed hook');
    testWindow.__koreE2ESeedOnlineTournament(nextStatus);
  }, status);
}

async function seedPaidRecoveryPrompt(page: Page) {
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __koreE2ESeedPaidRecoveryPrompt?: (profile: { playerId: string; displayName: string; email?: string; tournamentEmailReminders?: boolean }, message?: string) => void;
    };
    if (!testWindow.__koreE2ESeedPaidRecoveryPrompt) throw new Error('Missing KORE e2e recovery hook');
    testWindow.__koreE2ESeedPaidRecoveryPrompt({
      playerId: 'player-e2e',
      displayName: 'E2E Player',
      email: 'e2e@example.com',
      tournamentEmailReminders: true
    }, 'Paid tournament device mismatch');
  });
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png'
  }).catch(() => undefined);
}

function makeOnlineTournamentStatus(
  kind: 'freeOnline' | 'paidOnline',
  options: { botOpponent?: boolean } = {}
): TournamentStatusResult {
  const now = Date.now();
  const localEntry = makeEntry('entry-local', 'player-e2e', 'E2E Player', 'astra', 1, kind);
  const opponentEntry = {
    ...makeEntry('entry-opponent', options.botOpponent ? 'bot-rival' : 'player-rival', options.botOpponent ? 'CPU Rival' : 'Bracket Rival', 'dax', 2, kind),
    isBot: options.botOpponent || undefined,
    botKp: options.botOpponent ? 1200 : undefined
  };
  const bracket: TournamentBracket = {
    id: kind === 'paidOnline' ? 'paid-e2e-final' : 'free-e2e-final',
    kind,
    status: 'roundActive',
    entries: [localEntry, opponentEntry],
    matches: [{
      id: 'r3m1',
      round: 3,
      index: 0,
      entryAId: localEntry.id,
      entryBId: opponentEntry.id,
      status: 'ready',
      stageId: 'the-chamber',
      roomId: 'room-e2e-final',
      slotStartsAt: now - 1000,
      slotEndsAt: now + 60 * 60 * 1000,
      hostEntryId: localEntry.id,
      guestEntryId: opponentEntry.id,
      roomStatus: 'ready',
      reportState: 'none'
    }],
    currentRound: 3,
    capacity: kind === 'paidOnline' ? 25 : 8,
    minEntries: kind === 'paidOnline' ? 25 : 8,
    paidEnabled: kind === 'paidOnline',
    createdAt: now - 5000,
    updatedAt: now,
    reward: {
      kind: kind === 'paidOnline' ? 'lightningPending' : 'profilePoints',
      label: kind === 'paidOnline' ? '$15 Lightning reward' : 'Tournament profile trophy',
      state: kind === 'paidOnline' ? 'pending' : 'locked'
    }
  };
  return {
    bracket,
    entry: localEntry,
    assignedMatch: bracket.matches[0],
    matchRoom: {
      tournamentId: bracket.id,
      matchId: 'r3m1',
      roomId: 'room-e2e-final',
      slotStartsAt: now - 1000,
      slotEndsAt: now + 60 * 60 * 1000,
      status: 'ready',
      hostEntryId: localEntry.id,
      guestEntryId: opponentEntry.id,
      hostPeerId: 'e2e-local-peer',
      guestPeerId: options.botOpponent ? 'bot-rival' : 'e2e-rival-peer',
      localRole: 'host'
    },
    payment: kind === 'paidOnline'
      ? {
        state: 'paid',
        provider: 'lnbits',
        checkingId: 'e2e-paid-check',
        amountSats: 200,
        paymentRequest: 'lnbc200n1pje2eentry',
        lightningUrl: 'lightning:lnbc200n1pje2eentry',
        paidAt: now - 2000
      }
      : undefined,
    confirmedEntries: bracket.entries.length,
    entriesNeeded: 0,
    estimatedStartLabel: 'Tournament ready',
    startsWhenFullLabel: `Tournament starts once ${bracket.minEntries} entries enter`,
    statusText: 'Match ready'
  };
}

function makeEntry(
  id: string,
  playerId: string,
  displayName: string,
  characterId: string,
  seed: number,
  kind: 'freeOnline' | 'paidOnline'
): TournamentEntry {
  const paid = kind === 'paidOnline';
  return {
    id,
    playerId,
    displayName,
    characterId,
    seed,
    paymentState: paid ? 'paid' : 'notRequired',
    registeredDeviceId: paid ? 'e2e-device' : undefined,
    paidAt: paid ? Date.now() - 2000 : undefined,
    joinedAt: Date.now() - 3000
  };
}

function completeTournamentStatus(
  seeded: TournamentStatusResult,
  winnerEntryId: string,
  options: { payoutPending?: boolean; payoutSent?: boolean } = {}
): TournamentStatusResult {
  const entry = {
    ...seeded.entry!,
    payoutState: options.payoutSent ? 'rewardSent' as const : options.payoutPending ? 'rewardPending' as const : seeded.entry!.payoutState,
    payoutAmountSats: options.payoutPending || options.payoutSent ? 1500 : seeded.entry!.payoutAmountSats
  };
  const bracket: TournamentBracket = {
    ...seeded.bracket,
    status: 'completed',
    matches: seeded.bracket.matches.map((match) => match.id === seeded.assignedMatch?.id
      ? {
        ...match,
        status: 'completed' as const,
        winnerEntryId,
        roomStatus: 'closed' as const,
        reportState: 'agreed' as const,
        reportedAt: Date.now()
      }
      : match
    ),
    entries: seeded.bracket.entries.map((candidate) => candidate.id === entry.id ? entry : candidate),
    reward: {
      ...(seeded.bracket.reward ?? { kind: 'profilePoints' as const, label: 'Tournament reward', state: 'locked' as const }),
      state: options.payoutPending ? 'pending' : 'earned'
    },
    updatedAt: Date.now()
  };
  return {
    ...seeded,
    bracket,
    entry,
    assignedMatch: undefined,
    matchRoom: undefined,
    statusText: options.payoutPending ? 'Prize ready' : options.payoutSent ? 'Prize sent' : 'Tournament complete'
  };
}
