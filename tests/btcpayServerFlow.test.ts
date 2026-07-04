import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

describe('BTCPay webhook verification', () => {
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
});
