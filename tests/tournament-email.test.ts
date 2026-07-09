import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
});

describe('tournament email reminders', () => {
  it('stores opt-ins without requiring a Resend key in local/dev', async () => {
    const store = makeStore();
    const { saveTournamentEmailSubscription } = await import('../netlify/functions/_tournament-email.mjs');

    const result = await saveTournamentEmailSubscription(store, {
      playerId: 'player-1',
      displayName: 'Kiro',
      email: 'Kiro@Example.com',
      tournamentId: 'free-online-1',
      entryId: 'entry-1',
      kind: 'freeOnline'
    }, 1000);

    expect(result).toMatchObject({ ok: true, email: 'kiro@example.com', emailSent: false });
    expect(store.data.get('subscriptions/player-1.json')).toMatchObject({
      playerId: 'player-1',
      displayName: 'KIRO',
      email: 'kiro@example.com',
      remindersEnabled: true,
      updatedAt: 1000
    });
  });

  it('calls Resend when the API key exists', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'email-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();
    const { saveTournamentEmailSubscription } = await import('../netlify/functions/_tournament-email.mjs');

    const result = await saveTournamentEmailSubscription(store, {
      playerId: 'player-2',
      displayName: 'Riven',
      email: 'riven@example.com',
      tournamentId: 'paid-online-1',
      entryId: 'entry-2',
      kind: 'paidOnline'
    }, 2000);

    expect(result.emailSent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer test-resend-key' });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      from: 'KORE <hello@playkore.com>',
      to: ['riven@example.com'],
      subject: "You're signed up for KORE tournament reminders"
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).html).toContain('Use the same device you entered with');
  });

  it('deduplicates tournament ready emails per player and tournament', async () => {
    process.env.RESEND_API_KEY = 'test-resend-key';
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'email-1' }));
    vi.stubGlobal('fetch', fetchMock);
    const store = makeStore();
    const { notifyTournamentReady, saveTournamentEmailSubscription } = await import('../netlify/functions/_tournament-email.mjs');
    await saveTournamentEmailSubscription(store, {
      playerId: 'player-3',
      displayName: 'Mina',
      email: 'mina@example.com',
      tournamentId: 'free-online-2',
      entryId: 'entry-3',
      kind: 'freeOnline'
    }, 3000);
    fetchMock.mockClear();

    const bracket = {
      id: 'free-online-2',
      kind: 'freeOnline',
      status: 'roundActive',
      entries: [{ id: 'entry-3', playerId: 'player-3', displayName: 'Mina', characterId: 'kiro' }]
    };

    expect(await notifyTournamentReady(store, bracket, 4000)).toEqual({ sent: 1, skipped: 0 });
    expect(await notifyTournamentReady(store, bracket, 5000)).toEqual({ sent: 0, skipped: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).html).toContain('same device you used to enter');
    expect(store.data.get('notifications/ready/free-online-2/player-3.json')).toMatchObject({
      tournamentId: 'free-online-2',
      playerId: 'player-3',
      email: 'mina@example.com',
      emailSent: true,
      attemptedAt: 4000,
      sentAt: 4000
    });
  });
});
