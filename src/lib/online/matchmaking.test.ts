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

  it('matches a waiting casual room with a human before bot fallback', async () => {
    const host = await matchmakeOnline({ peerId: 'host', characterId: 'astra', stageId: 'dojo', queue: 'casual' });
    vi.setSystemTime(8_500);
    const guest = await matchmakeOnline({ peerId: 'guest', characterId: 'dax', stageId: 'dojo', queue: 'casual' });

    expect(host.status).toBe('waiting');
    expect(guest.role).toBe('guest');
    expect(guest.opponentKind).toBe('human');
    expect(guest.guestPeerId).toBe('guest');
    expect(guest.botOpponent).toBeUndefined();
  });

  it('fills a casual room with a bot after the fallback wait', async () => {
    const host = await matchmakeOnline({
      peerId: 'host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      availableCharacterIds: ['astra', 'dax']
    });
    vi.setSystemTime(9_001);
    const filled = await matchmakeOnline({
      peerId: 'host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'casual',
      roomId: host.roomId,
      ownerToken: host.ownerToken,
      availableCharacterIds: ['astra', 'dax']
    });

    expect(filled.role).toBe('host');
    expect(filled.status).toBe('matched');
    expect(filled.opponentKind).toBe('bot');
    expect(filled.botOpponent?.displayName).toBeTruthy();
    expect(filled.guestPeerId).toBe(filled.botOpponent?.playerId);
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

  it('fills ranked with a close bot only after the ranked fallback wait', async () => {
    const host = await matchmakeOnline({
      peerId: 'ranked-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1500,
      kr: { aggression: 70, defense: 60, combo: 55, punishment: 50, resource: 65, consistency: 58 },
      availableCharacterIds: ['astra', 'kiro', 'dax']
    });

    vi.setSystemTime(48_500);
    const tooSoon = await matchmakeOnline({
      peerId: 'ranked-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1500,
      roomId: host.roomId,
      ownerToken: host.ownerToken,
      availableCharacterIds: ['astra', 'kiro', 'dax']
    });
    vi.setSystemTime(49_001);
    const filled = await matchmakeOnline({
      peerId: 'ranked-host',
      characterId: 'astra',
      stageId: 'dojo',
      queue: 'ranked',
      kp: 1500,
      roomId: host.roomId,
      ownerToken: host.ownerToken,
      availableCharacterIds: ['astra', 'kiro', 'dax']
    });

    expect(tooSoon.status).toBe('waiting');
    expect(tooSoon.botOpponent).toBeUndefined();
    expect(filled.opponentKind).toBe('bot');
    expect(Math.abs((filled.botOpponent?.kp ?? 0) - 1500)).toBeLessThanOrEqual(120);
  });
});
