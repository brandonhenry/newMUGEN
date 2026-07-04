import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOnlinePerformanceStats } from './performanceScoring';
import {
  applyRankedMatchReport,
  calculateRankedKpDelta,
  fetchRankedProfile,
  getRankedTier,
  makeDefaultRankedProfile,
  rankedKrKeys,
  submitRankedMatchReport,
  type RankedMatchReport
} from './ranked';

function installLocalRankedEnvironment() {
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

function stats(overrides = {}) {
  return {
    ...emptyOnlinePerformanceStats(),
    damageDealt: 92,
    damageTaken: 70,
    cleanHits: 8,
    attacksAttempted: 15,
    maxComboHits: 5,
    punishes: 1,
    specials: 2,
    roundsWon: 3,
    ...overrides
  };
}

function report(overrides: Partial<RankedMatchReport> = {}): RankedMatchReport {
  return {
    reportId: 'room-a:p1:p2',
    roomId: 'room-a',
    stageId: 'dojo',
    winnerPlayerId: 'p1',
    submittedAt: 1000,
    players: [
      { profile: { playerId: 'p1', displayName: 'ONE' }, characterId: 'astra', stats: stats(), roundsWon: 3 },
      { profile: { playerId: 'p2', displayName: 'TWO' }, characterId: 'dax', stats: stats({ damageDealt: 40, damageTaken: 92, cleanHits: 4, roundsWon: 1 }), roundsWon: 1 }
    ],
    ...overrides
  };
}

describe('ranked tiers', () => {
  it('maps KP boundaries to named ranks', () => {
    expect(getRankedTier(1299).name).toBe('Unranked');
    expect(getRankedTier(1300).name).toBe('Ember Fist');
    expect(getRankedTier(1400).name).toBe('Iron Surge');
    expect(getRankedTier(1500).name).toBe('Bronze Breaker');
    expect(getRankedTier(1600).name).toBe('Silver Vanguard');
    expect(getRankedTier(1700).name).toBe('Gold Sentinel');
    expect(getRankedTier(1800).name).toBe('Crimson Warlord');
    expect(getRankedTier(1900).name).toBe('Eclipse Master');
    expect(getRankedTier(2000).name).toBe('KORE Prime');
  });
});

describe('ranked scoring', () => {
  it('rewards beating a stronger opponent more than beating a weaker opponent', () => {
    const upset = calculateRankedKpDelta(1300, 1600, true, 0);
    const expected = calculateRankedKpDelta(1600, 1300, true, 0);

    expect(upset).toBeGreaterThan(expected);
    expect(upset).toBeGreaterThan(20);
  });

  it('softens a loss when mechanic performance is strong but still subtracts KP', () => {
    const weakLoss = calculateRankedKpDelta(1500, 1300, false, -40);
    const strongLoss = calculateRankedKpDelta(1500, 1300, false, 40);

    expect(strongLoss).toBeLessThan(0);
    expect(strongLoss).toBeGreaterThan(weakLoss);
  });

  it('updates KR scores and produces bounded deltas', () => {
    const p1 = makeDefaultRankedProfile({ playerId: 'p1', displayName: 'ONE' });
    const p2 = makeDefaultRankedProfile({ playerId: 'p2', displayName: 'TWO' });
    const result = applyRankedMatchReport([p1, p2], report());

    for (const key of rankedKrKeys) {
      expect(result.players[0].afterKr[key]).toBeGreaterThanOrEqual(0);
      expect(result.players[0].afterKr[key]).toBeLessThanOrEqual(100);
      expect(Number.isFinite(result.players[0].krDelta[key])).toBe(true);
    }
    expect(result.players[0].profile.history).toHaveLength(1);
  });
});

describe('ranked local fallback', () => {
  beforeEach(() => installLocalRankedEnvironment());

  afterEach(() => vi.unstubAllGlobals());

  it('creates a default profile at 1200 KP', async () => {
    const profile = await fetchRankedProfile({ playerId: 'p1', displayName: 'ONE' });

    expect(profile.kp).toBe(1200);
    expect(profile.rank.name).toBe('Unranked');
  });

  it('applies a match report once by idempotent room/winner/player key', async () => {
    const first = await submitRankedMatchReport(report());
    const second = await submitRankedMatchReport(report());
    const profile = await fetchRankedProfile({ playerId: 'p1', displayName: 'ONE' });

    expect(second.players[0].afterKp).toBe(first.players[0].afterKp);
    expect(profile.totals.matches).toBe(1);
  });
});
