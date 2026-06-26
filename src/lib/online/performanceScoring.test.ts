import { describe, expect, it } from 'vitest';
import type { CombatPopupEvent, ImpactSparkEvent } from '../../types';
import { addCombatPopupEventToOnlineStats, addImpactEventToOnlineStats, calculateOnlinePerformancePoints, emptyOnlinePerformanceStats } from './performanceScoring';

function hitEvent(overrides: Partial<ImpactSparkEvent> = {}): ImpactSparkEvent {
  return {
    id: 1,
    kind: 'hit',
    position: [0, 1, 0],
    attackerSlot: 1,
    defenderSlot: 2,
    hitLevel: 'mid',
    damage: 10,
    moveLabel: 'Test Hit',
    moveInput: 'jab',
    ...overrides
  };
}

function popupEvent(overrides: Partial<CombatPopupEvent> = {}): CombatPopupEvent {
  return {
    id: 1,
    slot: 1,
    kind: 'combo',
    hits: 2,
    damage: 18,
    moveLabel: 'Test Combo',
    ...overrides
  };
}

describe('online performance scoring', () => {
  it('awards points for specials, launchers, juggles, tornadoes, and combo length', () => {
    let stats = emptyOnlinePerformanceStats();
    stats = addImpactEventToOnlineStats(stats, hitEvent({ damage: 18, moveInput: 'special', launched: true }), 1);
    stats = addImpactEventToOnlineStats(stats, hitEvent({ id: 2, damage: 8, juggled: true, tornado: true }), 1);
    stats = addCombatPopupEventToOnlineStats(stats, popupEvent({ hits: 5, damage: 44 }),);

    const points = calculateOnlinePerformancePoints(stats, 1, false);

    expect(stats.damageDealt).toBe(26);
    expect(stats.specials).toBe(1);
    expect(stats.launchers).toBe(1);
    expect(stats.juggleHits).toBe(1);
    expect(stats.tornadoes).toBe(1);
    expect(stats.maxComboHits).toBe(5);
    expect(points).toBeGreaterThan(80);
  });

  it('lets a losing player earn points from performance', () => {
    let stats = emptyOnlinePerformanceStats();
    stats = addImpactEventToOnlineStats(stats, hitEvent({ kind: 'whiffPunish', damage: 20 }), 1);
    stats = addImpactEventToOnlineStats(stats, hitEvent({ id: 2, kind: 'block', attackerSlot: 2, defenderSlot: 1, damage: 0 }), 1);

    const points = calculateOnlinePerformancePoints(stats, 0, false);

    expect(stats.whiffPunishes).toBe(1);
    expect(stats.blockedHits).toBe(1);
    expect(points).toBeGreaterThan(25);
  });

  it('keeps match scores inside a reasonable anti-farming cap', () => {
    const stats = {
      ...emptyOnlinePerformanceStats(),
      damageDealt: 999,
      cleanHits: 80,
      blockedHits: 50,
      maxComboHits: 20,
      punishes: 20,
      whiffPunishes: 20,
      specials: 20,
      launchers: 20,
      juggleHits: 80,
      tornadoes: 10,
      kiBursts: 10
    };

    expect(calculateOnlinePerformancePoints(stats, 3, true)).toBe(260);
  });
});
