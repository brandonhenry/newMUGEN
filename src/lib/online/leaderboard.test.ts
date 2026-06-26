import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLeaderboard, submitLeaderboardResult } from './leaderboard';

function installLocalLeaderboardEnvironment() {
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
}

describe('online leaderboard', () => {
  beforeEach(() => {
    installLocalLeaderboardEnvironment();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds performance points for both players instead of a flat win-only score', async () => {
    await submitLeaderboardResult({
      players: [
        { profile: { playerId: 'p1', displayName: 'Winner' }, points: 87 },
        { profile: { playerId: 'p2', displayName: 'Loser' }, points: 46 }
      ]
    });

    const result = await fetchLeaderboard();

    expect(result.entries).toEqual([
      expect.objectContaining({ playerId: 'p1', displayName: 'WINNER', points: 87 }),
      expect.objectContaining({ playerId: 'p2', displayName: 'LOSER', points: 46 })
    ]);
  });

  it('clamps submitted point awards before storing them', async () => {
    await submitLeaderboardResult({
      players: [
        { profile: { playerId: 'p1', displayName: 'Cap' }, points: 9999 },
        { profile: { playerId: 'p2', displayName: 'Zero' }, points: -5 }
      ]
    });

    const result = await fetchLeaderboard();

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ playerId: 'p1', points: 500 });
  });
});
