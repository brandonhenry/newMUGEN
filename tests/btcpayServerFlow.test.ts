import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.TOURNAMENT_PAID_ENABLED = 'true';
  process.env.TOURNAMENT_BTC_PROVIDER = 'btcpay';
  process.env.BTCPAY_INSTANCE_URL = 'https://btcpay.example';
  process.env.BTCPAY_STORE_ID = 'store-1';
  process.env.BTCPAY_API_KEY = 'api-key';
  process.env.BTCPAY_WEBHOOK_SECRET = 'test-webhook-secret';
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock('../netlify/functions/_blob-store.mjs');
});

describe('BTCPay paid tournament flow', () => {
  it('keeps invoice-pending paid entries out of confirmed tournament counts', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    const bracket = store.makeOpenPaidTournament(1000);
    const pending = store.createPendingPaidEntry(bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001);

    expect(store.toSummary(pending.bracket).entries).toBe(0);
    expect(pending.entry.paymentState).toBe('invoicePending');

    const invoiced = store.attachPaidInvoice(pending.bracket, pending.entry.id, {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002);
    const confirmed = store.confirmPaidInvoice(invoiced.bracket, 'invoice-1', 1003);

    expect(store.toSummary(confirmed.bracket).entries).toBe(1);
    expect(confirmed.entry.paymentState).toBe('paid');
    expect(confirmed.entry.seed).toBe(1);
  });

  it('marks InvoiceProcessing without counting the paid entry as confirmed', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    const bracket = store.makeOpenPaidTournament(1000);
    const pending = store.createPendingPaidEntry(bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001);
    const invoiced = store.attachPaidInvoice(pending.bracket, pending.entry.id, {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002);
    const processing = store.processPaidInvoice(invoiced.bracket, 'invoice-1', 1003);

    expect(processing.entry.paymentState).toBe('invoiceProcessing');
    expect(processing.entry.seed).toBe(0);
    expect(store.toSummary(processing.bracket).entries).toBe(0);
  });

  it('reuses a duplicate pending paid invoice entry for the same player', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    const bracket = store.makeOpenPaidTournament(1000);
    const pending = store.createPendingPaidEntry(bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001);
    const invoiced = store.attachPaidInvoice(pending.bracket, pending.entry.id, {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002);
    const duplicate = store.createPendingPaidEntry(invoiced.bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1003);

    expect(duplicate.reused).toBe(true);
    expect(duplicate.entry.id).toBe(pending.entry.id);
    expect(duplicate.entry.checkoutUrl).toBe('https://btcpay.example/i/invoice-1');
    expect(duplicate.bracket.entries).toHaveLength(1);
  });

  it('starts a paid bracket only after 25 webhook-confirmed paid entries', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    let bracket = store.makeOpenPaidTournament(1000);

    for (let index = 1; index <= 24; index += 1) {
      const pending = store.createPendingPaidEntry(bracket, {
        playerId: `player-${index}`,
        displayName: `P${index}`,
        characterId: `fighter-${index}`
      }, 1000 + index);
      const invoiced = store.attachPaidInvoice(pending.bracket, pending.entry.id, {
        invoiceId: `invoice-${index}`,
        checkoutUrl: `https://btcpay.example/i/invoice-${index}`
      }, 2000 + index);
      bracket = store.confirmPaidInvoice(invoiced.bracket, `invoice-${index}`, 3000 + index).bracket;
    }

    expect(bracket.status).toBe('open');

    const pending = store.createPendingPaidEntry(bracket, {
      playerId: 'player-25',
      displayName: 'P25',
      characterId: 'fighter-25'
    }, 1025);
    const invoiced = store.attachPaidInvoice(pending.bracket, pending.entry.id, {
      invoiceId: 'invoice-25',
      checkoutUrl: 'https://btcpay.example/i/invoice-25'
    }, 2025);
    bracket = store.confirmPaidInvoice(invoiced.bracket, 'invoice-25', 3025).bracket;

    expect(bracket.status).toBe('roundActive');
    expect(store.toSummary(bracket).entries).toBe(25);
    expect(Math.max(...bracket.matches.map((match: { round: number }) => match.round))).toBe(5);
  });

  it('expires invoice entries without locking paid seats', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    const bracket = store.makeOpenPaidTournament(1000);
    const pending = store.createPendingPaidEntry(bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001);
    const invoiced = store.attachPaidInvoice(pending.bracket, pending.entry.id, {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002);
    const expired = store.expirePaidInvoice(invoiced.bracket, 'invoice-1', 'expired', 1003);

    expect(expired.entry.paymentState).toBe('expired');
    expect(store.toSummary(expired.bracket).entries).toBe(0);
  });

  it('keeps settled webhook confirmation idempotent', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    const bracket = store.makeOpenPaidTournament(1000);
    const pending = store.createPendingPaidEntry(bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001);
    const invoiced = store.attachPaidInvoice(pending.bracket, pending.entry.id, {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002);
    const confirmed = store.confirmPaidInvoice(invoiced.bracket, 'invoice-1', 1003);
    const duplicate = store.confirmPaidInvoice(confirmed.bracket, 'invoice-1', 1004);

    expect(duplicate.entry.paymentState).toBe('paid');
    expect(duplicate.entry.seed).toBe(1);
    expect(store.toSummary(duplicate.bracket).entries).toBe(1);
  });

  it('records manual BTC reward obligations for the top three after a paid final', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    const entries = ['p1', 'p2', 'p3', 'p4'].map((id, index) => ({
      id,
      playerId: id,
      displayName: id.toUpperCase(),
      characterId: `fighter-${index + 1}`,
      seed: index + 1,
      paymentState: 'paid',
      paymentProvider: 'btcpay',
      joinedAt: 1000 + index
    }));
    let bracket = store.generateOnlineBracket({
      ...store.makeOpenPaidTournament(1000),
      capacity: 4,
      minEntries: 4,
      entries
    }, 1100);

    bracket = store.reportWinner(bracket, 'r1m1', 'p1', 1200);
    bracket = store.reportWinner(bracket, 'r1m2', 'p3', 1300);
    bracket = store.reportWinner(bracket, 'r2m1', 'p1', 1400);

    const payouts = new Map(bracket.entries.map((entry: { id: string; payoutAmountUsd?: number }) => [entry.id, entry.payoutAmountUsd]));
    expect(bracket.status).toBe('completed');
    expect(bracket.reward.state).toBe('pending');
    expect(payouts.get('p1')).toBe(15);
    expect(payouts.get('p3')).toBe(10);
    expect(payouts.get('p2')).toBe(5);
  });
});

describe('free online tournament bot fill', () => {
  it('does not fill free online brackets before the bot wait expires', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    let bracket = store.makeOpenFreeTournament(1000);
    bracket = store.enterFreeTournament(bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro',
      kp: 1500,
      kr: { aggression: 60, defense: 55, combo: 50, punishment: 50, resource: 58, consistency: 54 },
      availableCharacterIds: ['kiro', 'riven']
    }, 1000).bracket;
    bracket = store.enterFreeTournament(bracket, {
      playerId: 'player-2',
      displayName: 'P2',
      characterId: 'riven',
      availableCharacterIds: ['kiro', 'riven']
    }, 60_500).bracket;

    expect(bracket.status).toBe('open');
    expect(bracket.entries).toHaveLength(2);
    expect(bracket.entries.some((entry: { isBot?: boolean }) => entry.isBot)).toBe(false);
  });

  it('fills free online brackets with bots after the wait and resolves bot-only matches', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    let bracket = store.makeOpenFreeTournament(1000);
    bracket = store.enterFreeTournament(bracket, {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro',
      kp: 1500,
      kr: { aggression: 60, defense: 55, combo: 50, punishment: 50, resource: 58, consistency: 54 },
      availableCharacterIds: ['kiro', 'riven']
    }, 1000).bracket;
    bracket = store.enterFreeTournament(bracket, {
      playerId: 'player-2',
      displayName: 'P2',
      characterId: 'riven',
      availableCharacterIds: ['kiro', 'riven']
    }, 61_001).bracket;

    const botEntries = bracket.entries.filter((entry: { isBot?: boolean }) => entry.isBot);
    const botOnlyReady = bracket.matches.filter((match: { status: string; entryAId?: string; entryBId?: string }) => {
      const entryA = bracket.entries.find((entry: { id: string }) => entry.id === match.entryAId);
      const entryB = bracket.entries.find((entry: { id: string }) => entry.id === match.entryBId);
      return match.status === 'ready' && entryA?.isBot && entryB?.isBot;
    });

    expect(bracket.status).toBe('roundActive');
    expect(bracket.entries).toHaveLength(8);
    expect(botEntries).toHaveLength(6);
    expect(botEntries.every((entry: { displayName?: string; botKp?: number; botKr?: object }) => entry.displayName && entry.botKp && entry.botKr)).toBe(true);
    expect(botOnlyReady).toHaveLength(0);
  });
});

describe('BTCPay webhook verification', () => {
  it('creates a Voltage-compatible invoice and returns BTCPay checkoutLink', async () => {
    const { createEntryInvoice } = await import('../netlify/functions/_btcpay.mjs');
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      text: async () => JSON.stringify({
        id: 'invoice-1',
        checkoutLink: 'https://btcpay.example/i/invoice-1'
      }),
      status: 200
    }));
    vi.stubGlobal('fetch', fetchMock);

    const invoice = await createEntryInvoice({
      tournamentId: 'paid-btc-daily',
      entryId: 'entry-1',
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));

    expect(invoice.checkoutUrl).toBe('https://btcpay.example/i/invoice-1');
    expect(fetchMock.mock.calls[0][0]).toBe('https://btcpay.example/api/v1/stores/store-1/invoices');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ authorization: 'token api-key' });
    expect(body.amount).toBe('2.00');
    expect(body.currency).toBe('USD');
    expect(body.metadata).toMatchObject({
      tournamentId: 'paid-btc-daily',
      entryId: 'entry-1',
      playerId: 'player-1',
      characterId: 'kiro'
    });
  });

  it('classifies BTCPay invoice events without treating processing as settled', async () => {
    const { classifyInvoiceEvent } = await import('../netlify/functions/_btcpay.mjs');

    expect(classifyInvoiceEvent({ type: 'InvoiceProcessing' }, { status: 'Processing' })).toBe('processing');
    expect(classifyInvoiceEvent({ type: 'InvoiceSettled' }, { status: 'Settled' })).toBe('settled');
    expect(classifyInvoiceEvent({ type: 'InvoiceExpired' }, { status: 'Expired' })).toBe('expired');
    expect(classifyInvoiceEvent({ type: 'InvoiceInvalid' }, { status: 'Invalid' })).toBe('invalid');
  });

  it('accepts a valid BTCPay-SIG and rejects an invalid one', async () => {
    const { verifyBtcpayWebhook } = await import('../netlify/functions/_btcpay.mjs');
    const rawBody = JSON.stringify({ type: 'InvoiceSettled', invoiceId: 'invoice-1' });
    const signature = `sha256=${crypto.createHmac('sha256', 'test-webhook-secret').update(rawBody).digest('hex')}`;

    expect(verifyBtcpayWebhook(rawBody, signature)).toBe(true);
    expect(() => verifyBtcpayWebhook(rawBody, 'sha256=bad')).toThrow(/Invalid BTCPay webhook signature/);
  });

  it('rejects webhook handler calls with a bad BTCPay-SIG before reading invoice state', async () => {
    const { handler } = await import('../netlify/functions/btcpay-webhook.mjs');
    const response = await handler({
      httpMethod: 'POST',
      headers: { 'btcpay-sig': 'sha256=bad' },
      body: JSON.stringify({ type: 'InvoiceSettled', invoiceId: 'invoice-1' }),
      isBase64Encoded: false
    });

    expect(response.statusCode).toBe(401);
  });

  it('handles processing then settled webhook states with a mocked tournament store', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    let stored = store.attachPaidInvoice(store.createPendingPaidEntry(store.makeOpenPaidTournament(1000), {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001).bracket, 'paid-player-1-1001', {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002).bracket;
    vi.resetModules();
    vi.doMock('../netlify/functions/_blob-store.mjs', () => ({
      getBlobStore: () => ({
        get: async () => stored,
        setJSON: async (_key: string, value: unknown) => {
          stored = value;
        }
      })
    }));
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        id: 'invoice-1',
        status: 'Processing',
        metadata: { tournamentId: 'paid-btc-daily', entryId: 'paid-player-1-1001' }
      }),
      status: 200
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { handler } = await import('../netlify/functions/btcpay-webhook.mjs');

    const processingResponse = await handler(makeSignedWebhookEvent({ type: 'InvoiceProcessing', invoiceId: 'invoice-1' }));
    expect(processingResponse.statusCode).toBe(200);
    expect(stored.entries[0].paymentState).toBe('invoiceProcessing');
    expect(store.toSummary(stored).entries).toBe(0);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({
        id: 'invoice-1',
        status: 'Settled',
        metadata: { tournamentId: 'paid-btc-daily', entryId: 'paid-player-1-1001' }
      }),
      status: 200
    });
    const settledResponse = await handler(makeSignedWebhookEvent({ type: 'InvoiceSettled', invoiceId: 'invoice-1' }));

    expect(settledResponse.statusCode).toBe(200);
    expect(stored.entries[0].paymentState).toBe('paid');
    expect(stored.entries[0].seed).toBe(1);
    expect(store.toSummary(stored).entries).toBe(1);
  });

  it('handles expired and invalid webhooks without locking seats', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    let stored = store.attachPaidInvoice(store.createPendingPaidEntry(store.makeOpenPaidTournament(1000), {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001).bracket, 'paid-player-1-1001', {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002).bracket;
    vi.resetModules();
    vi.doMock('../netlify/functions/_blob-store.mjs', () => ({
      getBlobStore: () => ({
        get: async () => stored,
        setJSON: async (_key: string, value: unknown) => {
          stored = value;
        }
      })
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        id: 'invoice-1',
        status: 'Invalid',
        metadata: { tournamentId: 'paid-btc-daily', entryId: 'paid-player-1-1001' }
      }),
      status: 200
    })));
    const { handler } = await import('../netlify/functions/btcpay-webhook.mjs');

    const response = await handler(makeSignedWebhookEvent({ type: 'InvoiceInvalid', invoiceId: 'invoice-1' }));

    expect(response.statusCode).toBe(200);
    expect(stored.entries[0].paymentState).toBe('invalid');
    expect(store.toSummary(stored).entries).toBe(0);
  });

  it('rejects webhook invoices whose metadata does not match the stored entry', async () => {
    const store = await import('../netlify/functions/_tournament-store.mjs');
    let stored = store.attachPaidInvoice(store.createPendingPaidEntry(store.makeOpenPaidTournament(1000), {
      playerId: 'player-1',
      displayName: 'P1',
      characterId: 'kiro'
    }, 1001).bracket, 'paid-player-1-1001', {
      invoiceId: 'invoice-1',
      checkoutUrl: 'https://btcpay.example/i/invoice-1'
    }, 1002).bracket;
    vi.resetModules();
    vi.doMock('../netlify/functions/_blob-store.mjs', () => ({
      getBlobStore: () => ({
        get: async () => stored,
        setJSON: async (_key: string, value: unknown) => {
          stored = value;
        }
      })
    }));
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        id: 'invoice-1',
        status: 'Settled',
        metadata: { tournamentId: 'paid-btc-daily', entryId: 'wrong-entry' }
      }),
      status: 200
    })));
    const { handler } = await import('../netlify/functions/btcpay-webhook.mjs');

    const response = await handler(makeSignedWebhookEvent({ type: 'InvoiceSettled', invoiceId: 'invoice-1' }));

    expect(response.statusCode).toBe(409);
    expect(stored.entries[0].paymentState).toBe('invoicePending');
  });
});

function makeSignedWebhookEvent(payload: object) {
  const body = JSON.stringify(payload);
  return {
    httpMethod: 'POST',
    headers: {
      'btcpay-sig': `sha256=${crypto.createHmac('sha256', 'test-webhook-secret').update(body).digest('hex')}`
    },
    body,
    isBase64Encoded: false
  };
}
