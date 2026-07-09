import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const PAID_ID = 'paid-lightning-beta';

type MemoryStore = {
  data: Map<string, unknown>;
  get: (key: string, options?: { type?: string }) => Promise<unknown>;
  setJSON: (key: string, value: unknown) => Promise<void>;
};

function makeStore(): MemoryStore {
  return {
    data: new Map(),
    async get(key: string) {
      return this.data.get(key) ?? null;
    },
    async setJSON(key: string, value: unknown) {
      this.data.set(key, JSON.parse(JSON.stringify(value)));
    }
  };
}

function makeStores() {
  return {
    tournaments: makeStore(),
    entries: makeStore(),
    checking: makeStore(),
    payouts: makeStore(),
    rooms: makeStore(),
    ledger: makeStore(),
    email: makeStore(),
    recovery: makeStore()
  };
}

function setLightningEnv(extra: Record<string, string> = {}) {
  process.env.TOURNAMENT_PAID_ENABLED = 'true';
  process.env.TOURNAMENT_LIGHTNING_PROVIDER = 'lnbits';
  process.env.TOURNAMENT_PUBLIC_BASE_URL = 'https://game.example';
  process.env.LNBITS_URL = 'https://lnbits.example';
  process.env.LNBITS_INVOICE_KEY = 'invoice-key';
  process.env.LNBITS_ADMIN_KEY = 'admin-key';
  process.env.LNBITS_WEBHOOK_SECRET = 'webhook-secret';
  process.env.ENTRY_USD = '2';
  process.env.PRIZE_1_USD = '15';
  process.env.PRIZE_2_USD = '10';
  process.env.PRIZE_3_USD = '5';
  process.env.PAID_TOURNAMENT_MAX_PLAYERS = '25';
  process.env.MAX_AUTO_PAYOUT_SATS = '50000';
  process.env.TOURNAMENT_RECOVERY_SECRET = 'test-recovery-secret';
  Object.assign(process.env, extra);
}

function installLnbitsFetch(paidChecks = new Set<string>()) {
  let invoiceCount = 0;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.endsWith('/api/v1/conversion')) {
      return jsonResponse({ result: Math.round(Number(body.amount) * 1000) });
    }
    if (url.endsWith('/api/v1/payments') && body.out === false) {
      invoiceCount += 1;
      return jsonResponse({
        checking_id: `check-${invoiceCount}`,
        payment_hash: `hash-${invoiceCount}`,
        payment_request: `lnbc20u1entry${invoiceCount}`
      });
    }
    if (url.includes('/api/v1/payments/check-')) {
      const checkingId = decodeURIComponent(url.split('/').pop() || '');
      return jsonResponse({ paid: paidChecks.has(checkingId), checking_id: checkingId });
    }
    if (url.endsWith('/api/v1/payments') && body.out === true) {
      return jsonResponse({ checking_id: 'payout-check-1', payment_hash: 'payout-hash-1' });
    }
    return jsonResponse({ error: 'unexpected request', url, body }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  } as Response;
}

function findRecoveryCode(hash: string, tournamentId: string, playerId: string) {
  for (let value = 100000; value < 1000000; value += 1) {
    const code = String(value);
    const candidate = createHash('sha256').update(`test-recovery-secret:${tournamentId}:${playerId}:${code}`).digest('hex');
    if (candidate === hash) return code;
  }
  throw new Error('Recovery code not found');
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  setLightningEnv();
});

describe('LNbits paid tournament flow', () => {
  it('creates LNbits entry invoices with webhook metadata', async () => {
    const fetchMock = installLnbitsFetch();
    const { createEntryInvoice } = await import('../netlify/functions/_lnbits.mjs');

    const invoice = await createEntryInvoice({
      tournamentId: PAID_ID,
      entryId: 'entry-1',
      playerId: 'player-1',
      amountSats: 2000
    });

    expect(invoice.checkingId).toBe('check-1');
    expect(invoice.lightningUrl).toBe('lightning:lnbc20u1entry1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://lnbits.example/api/v1/payments');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ 'x-api-key': 'invoice-key' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      out: false,
      amount: 2000,
      webhook: 'https://game.example/.netlify/functions/lnbits-webhook?token=webhook-secret',
      extra: { tournamentId: PAID_ID, entryId: 'entry-1', playerId: 'player-1' }
    });
  });

  it('reuses duplicate pending Lightning entries without creating a second invoice', async () => {
    const fetchMock = installLnbitsFetch();
    const stores = makeStores();
    const { enterPaidTournament } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const first = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    const duplicate = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'riven' }, 1001);

    expect(duplicate.reused).toBe(true);
    expect(duplicate.entry.id).toBe(first.entry.id);
    expect(duplicate.entry.paymentRequest).toBe(first.entry.paymentRequest);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/v1/payments')).length).toBe(1);
  });

  it('rejects paid entry reuse from a different PostHog device id', async () => {
    installLnbitsFetch();
    const stores = makeStores();
    const { enterPaidTournament } = await import('../netlify/functions/_paid-tournament-store.mjs');

    await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'kiro' }, 1000);

    await expect(enterPaidTournament(stores, {
      playerId: 'player-1',
      posthogDeviceId: 'device-2',
      displayName: 'P1',
      characterId: 'riven'
    }, 1001)).rejects.toMatchObject({ code: 'device_mismatch' });
  });

  it('does not count unpaid webhook checks as paid entries', async () => {
    installLnbitsFetch();
    const stores = makeStores();
    const { confirmPaidEntryByCheckingId, enterPaidTournament } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const entered = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    const checked = await confirmPaidEntryByCheckingId(stores, entered.entry.checkingId, 1002);

    expect(checked.paid).toBe(false);
    expect(checked.entry.paymentState).toBe('invoicePending');
    expect(checked.bracket.entries.filter((entry: any) => entry.paymentState === 'paid')).toHaveLength(0);
  });

  it('marks paid entries only after LNbits confirms paid:true and locks at 25 players', async () => {
    const paidChecks = new Set<string>();
    installLnbitsFetch(paidChecks);
    const stores = makeStores();
    const { confirmPaidEntryByCheckingId, enterPaidTournament } = await import('../netlify/functions/_paid-tournament-store.mjs');

    let last: any = null;
    for (let index = 1; index <= 25; index += 1) {
      last = await enterPaidTournament(stores, {
        playerId: `player-${index}`,
        posthogDeviceId: `device-${index}`,
        displayName: `P${index}`,
        characterId: index % 2 ? 'kiro' : 'riven'
      }, 2000 + index);
      paidChecks.add(last.entry.checkingId);
      const confirmed = await confirmPaidEntryByCheckingId(stores, last.entry.checkingId, 3000 + index);
      if (index < 25) {
        expect(confirmed.bracket.status).toBe('open');
      } else {
        expect(confirmed.bracket.status).toBe('roundActive');
        expect(confirmed.bracket.entries).toHaveLength(25);
        expect(confirmed.bracket.prizeSats).toEqual({ 1: 15000, 2: 10000, 3: 5000 });
        expect(confirmed.bracket.matches.filter((match: any) => match.status === 'ready').every((match: any) => match.roomId && match.stageId && match.slotEndsAt > match.slotStartsAt)).toBe(true);
      }
    }

    const next = await enterPaidTournament(stores, {
      playerId: 'player-26',
      posthogDeviceId: 'device-26',
      displayName: 'P26',
      characterId: 'kiro'
    }, 5000);
    expect(next.bracket.status).toBe('open');
    expect(next.bracket.id).not.toBe(last.bracket.id);
    expect(next.bracket.entries).toHaveLength(1);
  });

  it('confirms paid entries from LNbits payment hash webhook payloads', async () => {
    const paidChecks = new Set<string>();
    installLnbitsFetch(paidChecks);
    const stores = makeStores();
    const { confirmPaidEntryByCheckingId, enterPaidTournament } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const entered = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    paidChecks.add(entered.entry.checkingId);
    const confirmed = await confirmPaidEntryByCheckingId(stores, entered.entry.paymentHash, 1002);

    expect(confirmed.paid).toBe(true);
    expect(confirmed.entry.paymentState).toBe('paid');
    expect(confirmed.entry.seed).toBe(1);
  });

  it('creates first-arrival paid match rooms with host and guest roles', async () => {
    setLightningEnv({ PAID_TOURNAMENT_MAX_PLAYERS: '2' });
    const paidChecks = new Set<string>();
    installLnbitsFetch(paidChecks);
    const stores = makeStores();
    const { confirmPaidEntryByCheckingId, enterPaidTournament, joinPaidTournamentRoom } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const p1 = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    paidChecks.add(p1.entry.checkingId);
    await confirmPaidEntryByCheckingId(stores, p1.entry.checkingId, 1100);
    const p2 = await enterPaidTournament(stores, { playerId: 'player-2', posthogDeviceId: 'device-2', displayName: 'P2', characterId: 'riven' }, 1200);
    paidChecks.add(p2.entry.checkingId);
    const locked = await confirmPaidEntryByCheckingId(stores, p2.entry.checkingId, 1300);
    const match = locked.bracket.matches.find((candidate: any) => candidate.status === 'ready');
    expect(match).toBeTruthy();
    const matchId = match?.id ?? '';

    const host = await joinPaidTournamentRoom(stores, {
      tournamentId: locked.bracket.id,
      matchId,
      playerId: 'player-2',
      posthogDeviceId: 'device-2',
      peerId: 'peer-host'
    }, 1400);
    const guest = await joinPaidTournamentRoom(stores, {
      tournamentId: locked.bracket.id,
      matchId,
      playerId: 'player-1',
      posthogDeviceId: 'device-1',
      peerId: 'peer-guest'
    }, 1500);

    expect(host.matchRoom).toMatchObject({ localRole: 'host', status: 'waiting', hostPeerId: 'peer-host' });
    expect(guest.matchRoom).toMatchObject({ localRole: 'guest', status: 'ready', hostPeerId: 'peer-host', guestPeerId: 'peer-guest' });
  });

  it('awards a paid forfeit when exactly one player joined before room expiry', async () => {
    setLightningEnv({ PAID_TOURNAMENT_MAX_PLAYERS: '2' });
    const paidChecks = new Set<string>();
    installLnbitsFetch(paidChecks);
    const stores = makeStores();
    const { confirmPaidEntryByCheckingId, enterPaidTournament, getPaidTournamentRoomStatus, joinPaidTournamentRoom } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const p1 = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    paidChecks.add(p1.entry.checkingId);
    await confirmPaidEntryByCheckingId(stores, p1.entry.checkingId, 1100);
    const p2 = await enterPaidTournament(stores, { playerId: 'player-2', posthogDeviceId: 'device-2', displayName: 'P2', characterId: 'riven' }, 1200);
    paidChecks.add(p2.entry.checkingId);
    const locked = await confirmPaidEntryByCheckingId(stores, p2.entry.checkingId, 1300);
    const match = locked.bracket.matches.find((candidate: any) => candidate.status === 'ready') as any;

    await joinPaidTournamentRoom(stores, {
      tournamentId: locked.bracket.id,
      matchId: match.id,
      playerId: 'player-1',
      posthogDeviceId: 'device-1',
      peerId: 'peer-host'
    }, match.slotStartsAt + 100);

    const resolved = await getPaidTournamentRoomStatus(stores, {
      tournamentId: locked.bracket.id,
      matchId: match.id,
      playerId: 'player-1',
      posthogDeviceId: 'device-1'
    }, match.slotEndsAt + 1);
    const completed = resolved.bracket.matches.find((candidate: any) => candidate.id === match.id);

    expect(resolved.matchRoom).toMatchObject({ status: 'forfeit', winnerEntryId: p1.entry.id });
    expect(completed).toMatchObject({ status: 'completed', winnerEntryId: p1.entry.id, reportState: 'forfeit' });
  });

  it('recovers a paid entry to a new device with a saved email code', async () => {
    installLnbitsFetch();
    const stores = makeStores();
    const { enterPaidTournament, confirmPaidTournamentRecovery, requestPaidTournamentRecovery } = await import('../netlify/functions/_paid-tournament-store.mjs');
    const { saveTournamentEmailSubscription } = await import('../netlify/functions/_tournament-email.mjs');

    const entered = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-old', displayName: 'P1', characterId: 'kiro' }, 1000);
    await saveTournamentEmailSubscription(stores.email, {
      playerId: 'player-1',
      displayName: 'P1',
      email: 'player@example.com',
      tournamentId: entered.bracket.id,
      entryId: entered.entry.id,
      kind: 'paidOnline'
    }, 1001);

    const requested = await requestPaidTournamentRecovery(stores, {
      tournamentId: entered.bracket.id,
      playerId: 'player-1',
      email: 'player@example.com'
    }, 2000);
    const recovery = stores.recovery.data.get(`${entered.bracket.id}/player-1.json`) as any;
    const code = findRecoveryCode(recovery.codeHash, entered.bracket.id, 'player-1');

    expect(requested).toMatchObject({ ok: true, email: 'pl***@example.com', emailSent: false });
    expect(recovery.code).toBeUndefined();

    await expect(confirmPaidTournamentRecovery(stores, {
      tournamentId: entered.bracket.id,
      playerId: 'player-1',
      code: '000000',
      posthogDeviceId: 'device-new'
    }, 2100)).rejects.toMatchObject({ code: 'invalid_recovery_code' });

    const recovered = await confirmPaidTournamentRecovery(stores, {
      tournamentId: entered.bracket.id,
      playerId: 'player-1',
      code,
      posthogDeviceId: 'device-new'
    }, 2200);

    expect(recovered.entry.registeredDeviceId).toBe('device-new');
    await expect(confirmPaidTournamentRecovery(stores, {
      tournamentId: entered.bracket.id,
      playerId: 'player-1',
      code,
      posthogDeviceId: 'device-newer'
    }, 2300)).rejects.toMatchObject({ code: 'recovery_expired' });
  });

  it('freezes conflicting paid reports for review and lets admin resolve the match', async () => {
    setLightningEnv({ PAID_TOURNAMENT_MAX_PLAYERS: '2' });
    const paidChecks = new Set<string>();
    installLnbitsFetch(paidChecks);
    const stores = makeStores();
    const {
      confirmPaidEntryByCheckingId,
      enterPaidTournament,
      reportPaidTournamentWinner,
      resolvePaidTournamentReview
    } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const p1 = await enterPaidTournament(stores, { playerId: 'player-1', posthogDeviceId: 'device-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    paidChecks.add(p1.entry.checkingId);
    await confirmPaidEntryByCheckingId(stores, p1.entry.checkingId, 1100);
    const p2 = await enterPaidTournament(stores, { playerId: 'player-2', posthogDeviceId: 'device-2', displayName: 'P2', characterId: 'riven' }, 1200);
    paidChecks.add(p2.entry.checkingId);
    const locked = await confirmPaidEntryByCheckingId(stores, p2.entry.checkingId, 1300);
    const match = locked.bracket.matches.find((candidate: any) => candidate.status === 'ready') as any;

    await reportPaidTournamentWinner(stores, match.id, 'player-1', p1.entry.id, 'device-1', match.roomId, 1400);
    const conflict = await reportPaidTournamentWinner(stores, match.id, 'player-2', p2.entry.id, 'device-2', match.roomId, 1500);
    const conflictedMatch = conflict.bracket.matches.find((candidate: any) => candidate.id === match.id);
    expect(conflictedMatch).toMatchObject({ status: 'ready', reportState: 'conflict', roomStatus: 'review' });
    expect(conflict.bracket.status).toBe('roundActive');

    const resolved = await resolvePaidTournamentReview(stores, locked.bracket.id, match.id, p1.entry.id, 'test-admin', 'unit-test', 1600);
    const resolvedMatch = resolved.bracket.matches.find((candidate: any) => candidate.id === match.id);
    expect(resolvedMatch).toMatchObject({ status: 'completed', winnerEntryId: p1.entry.id, reportState: 'agreed' });
    expect(resolved.bracket.status).toBe('completed');
  });

  it('returns Cash App labels and estimated start metadata for paid tournament status', async () => {
    installLnbitsFetch();
    const stores = makeStores();
    const { getPaidTournamentStatus, paidSummary } = await import('../netlify/functions/_paid-tournament-store.mjs');
    const bracket = {
      id: PAID_ID,
      kind: 'paidOnline',
      status: 'open',
      entries: [
        {
          id: 'entry-player-1',
          playerId: 'player-1',
          registeredDeviceId: 'device-1',
          displayName: 'P1',
          characterId: 'kiro',
          seed: 1,
          paymentState: 'paid',
          paidAt: 1_000,
          joinedAt: 1_000
        },
        {
          id: 'entry-player-2',
          playerId: 'player-2',
          registeredDeviceId: 'device-2',
          displayName: 'P2',
          characterId: 'riven',
          seed: 2,
          paymentState: 'entryLocked',
          paidAt: 601_000,
          joinedAt: 601_000
        },
        {
          id: 'entry-player-3',
          playerId: 'player-3',
          displayName: 'P3',
          characterId: 'kiro',
          seed: 0,
          paymentState: 'invoicePending',
          joinedAt: 700_000
        }
      ],
      matches: [],
      currentRound: 1,
      capacity: 5,
      minEntries: 5,
      paidEnabled: true,
      entryUsd: 2,
      prizeUsd: { 1: 15, 2: 10, 3: 5 },
      prizeSats: {},
      createdAt: 1_000,
      updatedAt: 700_000,
      reward: { kind: 'lightningPending', label: 'Lightning rewards', state: 'locked' }
    };
    await stores.tournaments.setJSON(`${PAID_ID}.json`, bracket);
    await stores.tournaments.setJSON('active.json', { id: PAID_ID, updatedAt: 700_000 });

    const summary = paidSummary(bracket);
    const status = await getPaidTournamentStatus(stores, 'player-1', 'device-1');

    expect(summary.entryFeeLabel).toBe('$2 Via Cash App');
    expect(summary.confirmedEntries).toBe(2);
    expect(summary.entriesNeeded).toBe(3);
    expect(summary.estimatedStartLabel).toBe('~30m');
    expect(status.statusText).toBe('2 / 5 entries');
    expect(status.startsWhenFullLabel).toBe('Tournament starts once 5 entries enter');
  });

  it('rejects bad LNbits webhook tokens before checking payment state', async () => {
    const fetchMock = installLnbitsFetch();
    const { handler } = await import('../netlify/functions/lnbits-webhook.mjs');

    const response = await handler({
      httpMethod: 'POST',
      queryStringParameters: { token: 'wrong' },
      body: JSON.stringify({ checking_id: 'check-1' })
    } as any);

    expect(response.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('claims exact-amount winner invoices and records payout results', async () => {
    installLnbitsFetch();
    const stores = makeStores();
    const { claimPaidPrize } = await import('../netlify/functions/_paid-tournament-store.mjs');
    const bracket = {
      id: PAID_ID,
      kind: 'paidOnline',
      status: 'completed',
      entries: [
        {
          id: 'entry-player-1',
          playerId: 'player-1',
          registeredDeviceId: 'device-1',
          displayName: 'P1',
          characterId: 'kiro',
          seed: 1,
          paymentState: 'paid',
          payoutState: 'rewardPending',
          payoutAmountUsd: 15,
          payoutAmountSats: 15000,
          joinedAt: 1000
        }
      ],
      matches: [],
      currentRound: 1,
      capacity: 25,
      minEntries: 25,
      paidEnabled: true,
      entryUsd: 2,
      prizeUsd: { 1: 15, 2: 10, 3: 5 },
      prizeSats: { 1: 15000, 2: 10000, 3: 5000 },
      createdAt: 1000,
      updatedAt: 2000,
      reward: { kind: 'lightningPending', label: 'Lightning rewards', state: 'pending' }
    };
    await stores.tournaments.setJSON(`${PAID_ID}.json`, bracket);
    await stores.tournaments.setJSON('active.json', { id: PAID_ID, updatedAt: 2000 });

    await expect(claimPaidPrize(stores, {
      tournamentId: PAID_ID,
      playerId: 'player-2',
      posthogDeviceId: 'device-2',
      bolt11: 'lnbc150u1winnerinvoice'
    }, 3000)).rejects.toMatchObject({ code: 'paid_entry_not_found' });

    await expect(claimPaidPrize(stores, {
      tournamentId: PAID_ID,
      playerId: 'player-1',
      posthogDeviceId: 'device-1',
      bolt11: 'lnbc160u1winnerinvoice'
    }, 3000)).rejects.toMatchObject({ code: 'invalid_prize_invoice_amount' });

    const claimed = await claimPaidPrize(stores, {
      tournamentId: PAID_ID,
      playerId: 'player-1',
      posthogDeviceId: 'device-1',
      bolt11: 'lnbc150u1winnerinvoice'
    }, 3001);

    expect(claimed.payout).toMatchObject({
      status: 'paid',
      amountSats: 15000,
      checkingId: 'payout-check-1',
      payoutHash: 'payout-hash-1'
    });
    expect(claimed.entry.payoutState).toBe('rewardSent');
  });
});
