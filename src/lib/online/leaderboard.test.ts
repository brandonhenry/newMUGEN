import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLeaderboard, readOnlineProfile, sanitizeEmail, submitLeaderboardResult, writeOnlineProfile } from './leaderboard';

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
        { profile: { playerId: 'p1', displayName: 'Winner' }, characterId: 'astra', points: 87 },
        { profile: { playerId: 'p2', displayName: 'Loser' }, characterId: 'dax', points: 46 }
      ]
    });

    const result = await fetchLeaderboard();

    expect(result.entries).toEqual([
      expect.objectContaining({ playerId: 'p1', displayName: 'WINNER', characterId: 'astra', points: 87 }),
      expect.objectContaining({ playerId: 'p2', displayName: 'LOSER', characterId: 'dax', points: 46 })
    ]);
  });

  it('keeps separate rows per character for the same player and aggregates duplicate character awards', async () => {
    await submitLeaderboardResult({
      players: [
        { profile: { playerId: 'p1', displayName: 'Hero' }, characterId: 'naruto-uzumaki-nine-tails-kyubi', points: 40 },
        { profile: { playerId: 'p1', displayName: 'Hero' }, characterId: 'sasuke-curse-mark', points: 70 },
        { profile: { playerId: 'p1', displayName: 'Hero' }, characterId: 'sasuke-curse-mark', points: 30 }
      ]
    });

    const result = await fetchLeaderboard();

    expect(result.entries).toEqual([
      expect.objectContaining({ playerId: 'p1', characterId: 'sasuke-curse-mark', points: 100 }),
      expect.objectContaining({ playerId: 'p1', characterId: 'naruto-uzumaki-nine-tails-kyubi', points: 40 })
    ]);
  });

  it('clamps submitted point awards before storing them', async () => {
    await submitLeaderboardResult({
      players: [
        { profile: { playerId: 'p1', displayName: 'Cap' }, characterId: 'astra', points: 9999 },
        { profile: { playerId: 'p2', displayName: 'Zero' }, characterId: 'dax', points: -5 }
      ]
    });

    const result = await fetchLeaderboard();

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ playerId: 'p1', characterId: 'astra', points: 500 });
  });

  it('validates reminder emails with a local part, domain, and TLD', () => {
    expect(sanitizeEmail(' Player.Name+tag@Example.COM ')).toBe('player.name+tag@example.com');
    expect(sanitizeEmail('player@example')).toBe('');
    expect(sanitizeEmail('@example.com')).toBe('');
    expect(sanitizeEmail('player@')).toBe('');
    expect(sanitizeEmail('player..name@example.com')).toBe('');
  });

  it('migrates old profiles and preserves reminder fields during name saves', () => {
    window.localStorage.setItem('kore.online.profile', JSON.stringify({ playerId: 'player-1', displayName: 'Kiro' }));

    expect(readOnlineProfile()).toEqual({ playerId: 'player-1', displayName: 'KIRO' });

    const savedEmail = writeOnlineProfile({
      playerId: 'player-1',
      displayName: 'Kiro',
      email: 'hero@example.com',
      tournamentEmailReminders: true,
      emailUpdatedAt: 100,
      tournamentEmailReminderOptedAt: 200
    });
    expect(savedEmail).toMatchObject({
      playerId: 'player-1',
      displayName: 'KIRO',
      email: 'hero@example.com',
      tournamentEmailReminders: true,
      emailUpdatedAt: 100,
      tournamentEmailReminderOptedAt: 200
    });

    const renamed = writeOnlineProfile({ playerId: 'player-1', displayName: 'Riven' });
    expect(renamed).toMatchObject({
      playerId: 'player-1',
      displayName: 'RIVEN',
      email: 'hero@example.com',
      tournamentEmailReminders: true
    });

    const cleared = writeOnlineProfile({ playerId: 'player-1', displayName: 'Riven', email: '', tournamentEmailReminders: false });
    expect(cleared.email).toBeUndefined();
    expect(cleared.tournamentEmailReminders).toBeUndefined();
  });
});
