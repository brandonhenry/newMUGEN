import { describe, expect, it } from 'vitest';
import type { MatchSnapshot } from '../types';
import { createFightAnalyticsState, recordFightAnalyticsSnapshot } from './fightAnalytics';

function makeMatch(overrides: Partial<MatchSnapshot> = {}): MatchSnapshot {
  const base = {
    fighters: [
      { hp: 100, roundsWon: 0, character: { id: 'p1' } },
      { hp: 100, roundsWon: 0, character: { id: 'p2' } }
    ],
    roster: [],
    stage: { id: 'dojo' },
    mode: 'local2p',
    cpuDifficulty: 3,
    aiSeed: 1,
    roundAiSeed: 2,
    roundTime: 60,
    trainingInfiniteHealth: false,
    introEnabled: true,
    timer: 60,
    round: 1,
    countdown: 0,
    winnerSlot: null,
    phase: 'intro',
    message: '',
    lastHitId: 0,
    combatEvents: [],
    impactEvents: [],
    clashState: { status: 'none' },
    visualTimeScale: 1,
    cameraShake: 0
  };
  return { ...base, ...overrides } as MatchSnapshot;
}

describe('fight analytics lifecycle', () => {
  it('dedupes round starts and round ends', () => {
    const state = createFightAnalyticsState(0);
    const captured: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const capture = (name: string, properties: Record<string, unknown>) => captured.push({ name, properties });

    const fighting = makeMatch({ phase: 'fighting' });
    recordFightAnalyticsSnapshot(state, fighting, { mode: 'local2p' }, capture, 1000);
    recordFightAnalyticsSnapshot(state, fighting, { mode: 'local2p' }, capture, 1500);

    const roundOver = makeMatch({
      phase: 'roundOver',
      timer: 42.4,
      fighters: [
        { hp: 68, roundsWon: 1, character: { id: 'p1' } },
        { hp: 0, roundsWon: 0, character: { id: 'p2' } }
      ] as MatchSnapshot['fighters']
    });
    recordFightAnalyticsSnapshot(state, roundOver, { mode: 'local2p' }, capture, 5000);
    recordFightAnalyticsSnapshot(state, roundOver, { mode: 'local2p' }, capture, 5500);

    expect(captured.map((event) => event.name)).toEqual(['round_started', 'round_ended']);
    expect(captured[1].properties).toMatchObject({
      winner_slot: 1,
      timer_remaining: 42.4,
      p1_rounds_won: 1,
      p2_rounds_won: 0
    });
  });

  it('captures match completion with aggregate counters once', () => {
    const state = createFightAnalyticsState(0);
    const captured: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const capture = (name: string, properties: Record<string, unknown>) => captured.push({ name, properties });
    const common = { mode: 'local2p', stage_id: 'dojo' };

    recordFightAnalyticsSnapshot(state, makeMatch({
      phase: 'fighting',
      impactEvents: [
        { id: 1, kind: 'hit', attackerSlot: 1, defenderSlot: 2, damage: 12, comboHits: 2 },
        { id: 2, kind: 'block', attackerSlot: 2, defenderSlot: 1, damage: 3 }
      ] as MatchSnapshot['impactEvents'],
      combatEvents: [
        { id: 3, kind: 'combo', slot: 1, hits: 2, damage: 12, moveLabel: 'Jab' }
      ] as MatchSnapshot['combatEvents']
    }), common, capture, 1000);

    const completed = makeMatch({
      phase: 'matchOver',
      round: 3,
      winnerSlot: 1,
      fighters: [
        { hp: 50, roundsWon: 3, character: { id: 'p1' } },
        { hp: 0, roundsWon: 1, character: { id: 'p2' } }
      ] as MatchSnapshot['fighters']
    });
    recordFightAnalyticsSnapshot(state, completed, common, capture, 7000);
    recordFightAnalyticsSnapshot(state, completed, common, capture, 7500);

    expect(captured.filter((event) => event.name === 'match_completed')).toHaveLength(1);
    expect(captured.find((event) => event.name === 'match_completed')?.properties).toMatchObject({
      winner_slot: 1,
      rounds_played: 3,
      hit_count: 1,
      block_count: 1,
      total_damage_p1: 12,
      total_damage_p2: 3,
      max_combo_hits: 2
    });
  });
});
