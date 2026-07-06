import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOnlinePerformanceStats } from './performanceScoring';
import {
  RANKED_PLACEMENT_MATCHES,
  applyRankedMatchReport,
  calculateRankedKpDelta,
  fetchRankedProfile,
  getRankedTier,
  makeDefaultRankedProfile,
  normalizeRankedProfile,
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
  return storage;
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
    expect(profile.placement.complete).toBe(false);
    expect(profile.placement.matchesPlayed).toBe(0);
    expect(profile.placement.nextBotKp).toBe(650);
  });

  it('treats legacy profiles with prior matches as placement complete', () => {
    const profile = normalizeRankedProfile({
      playerId: 'p1',
      displayName: 'ONE',
      kp: 1460,
      totals: {
        matches: 3,
        wins: 2,
        losses: 1,
        damageDealt: 0,
        damageTaken: 0,
        cleanHits: 0,
        attacksAttempted: 0,
        blocks: 0,
        maxComboHits: 0
      }
    });

    expect(profile.placement.complete).toBe(true);
    expect(profile.placement.matchesPlayed).toBe(RANKED_PLACEMENT_MATCHES);
    expect(profile.placement.ratingEstimate).toBe(1460);
  });

  it('applies a match report once by idempotent room/winner/player key', async () => {
    const first = await submitRankedMatchReport(report());
    const second = await submitRankedMatchReport(report());
    const profile = await fetchRankedProfile({ playerId: 'p1', displayName: 'ONE' });

    expect(second.players[0].afterKp).toBe(first.players[0].afterKp);
    expect(profile.totals.matches).toBe(1);
  });

  it('caps ranked rewards against bots and does not persist bot profiles', async () => {
    const storage = installLocalRankedEnvironment();
    const result = await submitRankedMatchReport(report({
      reportId: 'room-b:p1:bot',
      roomId: 'room-b',
      players: [
        { profile: { playerId: 'p1', displayName: 'ONE' }, characterId: 'astra', stats: stats(), roundsWon: 3 },
        {
          profile: { playerId: 'bot-rival', displayName: 'MIRA KANE' },
          characterId: 'dax',
          stats: stats({ damageDealt: 38, damageTaken: 100, cleanHits: 3, roundsWon: 0 }),
          roundsWon: 0,
          isBot: true,
          botKp: 1700,
          botKr: { aggression: 60, defense: 60, combo: 60, punishment: 60, resource: 60, consistency: 60 }
        }
      ]
    }));
    const playerResult = result.players.find((player) => player.playerId === 'p1');
    const saved = JSON.parse(storage.get('kore.online.rankedProfile') ?? '{}');

    expect(playerResult?.kpDelta).toBeLessThanOrEqual(12);
    expect(playerResult?.profile.history[0].right.displayName).toBe('MIRA KANE');
    expect(saved.profiles['p1']).toBeTruthy();
    expect(saved.profiles['bot-rival']).toBeUndefined();
  });

  it('advances placement against bots with provisional KP before final assignment', async () => {
    const result = await submitRankedMatchReport(report({
      reportId: 'placement-room:p1:bot',
      roomId: 'placement-room',
      placement: {
        playerId: 'p1',
        matchNumber: 1,
        requiredMatches: RANKED_PLACEMENT_MATCHES,
        botKp: 650,
        ratingEstimate: 900
      },
      players: [
        { profile: { playerId: 'p1', displayName: 'ONE' }, characterId: 'astra', stats: stats({ damageDealt: 120, roundsWon: 3 }), roundsWon: 3 },
        {
          profile: { playerId: 'bot-placement', displayName: 'ACE VEGA' },
          characterId: 'dax',
          stats: stats({ damageDealt: 30, damageTaken: 120, cleanHits: 2, roundsWon: 0 }),
          roundsWon: 0,
          isBot: true,
          botKp: 650,
          botKr: { aggression: 40, defense: 40, combo: 40, punishment: 40, resource: 40, consistency: 40 }
        }
      ]
    }));
    const player = result.players[0];
    const saved = await fetchRankedProfile({ playerId: 'p1', displayName: 'ONE' });

    expect(player.placement?.afterMatchesPlayed).toBe(1);
    expect(player.placement?.complete).toBe(false);
    expect(player.afterKp).toBeGreaterThan(player.beforeKp);
    expect(player.profile.kp).toBe(1200);
    expect(saved.placement.matchesPlayed).toBe(1);
    expect(saved.placement.nextBotKp).toBeGreaterThan(650);
  });

  it('completes placement on the tenth bot match and assigns final KP', async () => {
    const seededProfile = normalizeRankedProfile({
      ...makeDefaultRankedProfile({ playerId: 'p1', displayName: 'ONE' }),
      placement: {
        requiredMatches: RANKED_PLACEMENT_MATCHES,
        matchesPlayed: 9,
        complete: false,
        ratingEstimate: 1375,
        nextBotKp: 1450
      }
    });
    const result = applyRankedMatchReport([
      seededProfile,
      normalizeRankedProfile({
        ...makeDefaultRankedProfile({ playerId: 'bot-placement', displayName: 'ACE VEGA' }),
        kp: 1450,
        placement: {
          requiredMatches: RANKED_PLACEMENT_MATCHES,
          matchesPlayed: RANKED_PLACEMENT_MATCHES,
          complete: true,
          ratingEstimate: 1450,
          nextBotKp: 1450
        }
      })
    ], report({
      reportId: 'placement-room-10:p1:bot',
      roomId: 'placement-room-10',
      placement: {
        playerId: 'p1',
        matchNumber: 10,
        requiredMatches: RANKED_PLACEMENT_MATCHES,
        botKp: 1450,
        ratingEstimate: 1375
      },
      players: [
        { profile: { playerId: 'p1', displayName: 'ONE' }, characterId: 'astra', stats: stats({ damageDealt: 110, roundsWon: 3 }), roundsWon: 3 },
        {
          profile: { playerId: 'bot-placement', displayName: 'ACE VEGA' },
          characterId: 'dax',
          stats: stats({ damageDealt: 50, damageTaken: 110, roundsWon: 1 }),
          roundsWon: 1,
          isBot: true,
          botKp: 1450,
          botKr: { aggression: 55, defense: 55, combo: 55, punishment: 55, resource: 55, consistency: 55 }
        }
      ]
    }));

    expect(result.players[0].placement?.complete).toBe(true);
    expect(result.players[0].profile.placement.complete).toBe(true);
    expect(result.players[0].profile.kp).toBe(result.players[0].afterKp);
    expect(result.players[0].profile.rank.name).toBe(getRankedTier(result.players[0].afterKp).name);
  });

  it('rejects placement reports without a bot opponent', async () => {
    await expect(submitRankedMatchReport(report({
      reportId: 'placement-human:p1:p2',
      roomId: 'placement-human',
      placement: {
        playerId: 'p1',
        matchNumber: 1,
        requiredMatches: RANKED_PLACEMENT_MATCHES,
        botKp: 650,
        ratingEstimate: 900
      }
    }))).rejects.toThrow(/bot opponent/i);
  });
});
