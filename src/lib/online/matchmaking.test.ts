import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchmakeOnline } from './matchmaking';

function installLocalMatchmakingEnvironment() {
  const storage = new Map<string, string>();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('No local functions'))));
  vi.stubGlobal('window', {
    location: { hostname: '127.0.0.1' },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn()
      .mockReturnValueOnce('room-1')
      .mockReturnValueOnce('owner-1')
      .mockReturnValueOnce('room-2')
      .mockReturnValueOnce('owner-2')
  });
}

describe('online matchmaking', () => {
  beforeEach(() => {
    installLocalMatchmakingEnvironment();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps ranked and casual queues separate', async () => {
    const ranked = await matchmakeOnline({ peerId: 'ranked-host', characterId: 'astra', stageId: 'dojo', queue: 'ranked', kp: 1200 });
    const casual = await matchmakeOnline({ peerId: 'casual-guest', characterId: 'dax', stageId: 'dojo', queue: 'casual' });

    expect(ranked.status).toBe('waiting');
    expect(casual.role).toBe('host');
    expect(casual.status).toBe('waiting');
  });

  it('widens ranked KP matching over time', async () => {
    const host = await matchmakeOnline({ peerId: 'host', characterId: 'astra', stageId: 'dojo', queue: 'ranked', kp: 1200 });
    const tooSoon = await matchmakeOnline({ peerId: 'guest-a', characterId: 'dax', stageId: 'dojo', queue: 'ranked', kp: 1600 });
    vi.setSystemTime(49_000);
    const widened = await matchmakeOnline({
      peerId: 'guest-b',
      characterId: 'kiro',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1600
    });

    expect(host.status).toBe('waiting');
    expect(tooSoon.role).toBe('host');
    expect(widened.role).toBe('guest');
    expect(widened.hostPeerId).toBe('host');
  });
});
