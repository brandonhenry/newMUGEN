import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    ledger: makeStore()
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

    const first = await enterPaidTournament(stores, { playerId: 'player-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    const duplicate = await enterPaidTournament(stores, { playerId: 'player-1', displayName: 'P1', characterId: 'riven' }, 1001);

    expect(duplicate.reused).toBe(true);
    expect(duplicate.entry.id).toBe(first.entry.id);
    expect(duplicate.entry.paymentRequest).toBe(first.entry.paymentRequest);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/v1/payments')).length).toBe(1);
  });

  it('does not count unpaid webhook checks as paid entries', async () => {
    installLnbitsFetch();
    const stores = makeStores();
    const { confirmPaidEntryByCheckingId, enterPaidTournament } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const entered = await enterPaidTournament(stores, { playerId: 'player-1', displayName: 'P1', characterId: 'kiro' }, 1000);
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
      }
    }
  });

  it('confirms paid entries from LNbits payment hash webhook payloads', async () => {
    const paidChecks = new Set<string>();
    installLnbitsFetch(paidChecks);
    const stores = makeStores();
    const { confirmPaidEntryByCheckingId, enterPaidTournament } = await import('../netlify/functions/_paid-tournament-store.mjs');

    const entered = await enterPaidTournament(stores, { playerId: 'player-1', displayName: 'P1', characterId: 'kiro' }, 1000);
    paidChecks.add(entered.entry.checkingId);
    const confirmed = await confirmPaidEntryByCheckingId(stores, entered.entry.paymentHash, 1002);

    expect(confirmed.paid).toBe(true);
    expect(confirmed.entry.paymentState).toBe('paid');
    expect(confirmed.entry.seed).toBe(1);
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
    const status = await getPaidTournamentStatus(stores, 'player-1');

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
      bolt11: 'lnbc150u1winnerinvoice'
    }, 3000)).rejects.toMatchObject({ code: 'prize_not_claimable' });

    await expect(claimPaidPrize(stores, {
      tournamentId: PAID_ID,
      playerId: 'player-1',
      bolt11: 'lnbc160u1winnerinvoice'
    }, 3000)).rejects.toMatchObject({ code: 'invalid_prize_invoice_amount' });

    const claimed = await claimPaidPrize(stores, {
      tournamentId: PAID_ID,
      playerId: 'player-1',
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
