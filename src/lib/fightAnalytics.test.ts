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
    recordFightAnalyticsSnapshot(state, completed, common, capture, 7000, { localSlot: 1 });
    recordFightAnalyticsSnapshot(state, completed, common, capture, 7500);

    expect(captured.filter((event) => event.name === 'match_completed')).toHaveLength(1);
    expect(captured.find((event) => event.name === 'match_completed')?.properties).toMatchObject({
      winner_slot: 1,
      completion_reason: 'normal',
      winner_character_id: 'p1',
      loser_character_id: 'p2',
      local_result: 'win',
      rounds_played: 3,
      hit_count: 1,
      block_count: 1,
      total_damage_p1: 12,
      total_damage_p2: 3,
      max_combo_hits: 2
    });
    expect(captured.filter((event) => event.name === 'performance_summary')).toHaveLength(1);
    expect(captured.find((event) => event.name === 'performance_summary')?.properties).toMatchObject({
      activity_type: 'match',
      duration_seconds: 7,
      sample_count: 0
    });
  });
});

describe('fight analytics combo routes', () => {
  it('captures one completed two-hit human combo route when it resets', () => {
    const state = createFightAnalyticsState(0);
    const captured: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const capture = (name: string, properties: Record<string, unknown>) => captured.push({ name, properties });
    const common = { mode: 'local2p', stage_id: 'dojo', cpu_difficulty: 3 };

    recordFightAnalyticsSnapshot(state, makeMatch({
      phase: 'fighting',
      fighters: [
        makeComboFighter('naruto', 2, 34, ['jab:1', 'kick:2'], ['jab', 'kick'], ['punch', 'kick'], ['punch', 'kick']),
        { hp: 100, roundsWon: 0, character: { id: 'sasuke' } }
      ] as MatchSnapshot['fighters'],
      impactEvents: [
        { id: 1, kind: 'hit', attackerSlot: 1, defenderSlot: 2, damage: 14, comboHits: 2, moveLabel: 'Kick', moveInput: 'kick', launched: true }
      ] as MatchSnapshot['impactEvents']
    }), common, capture, 1000, { actorTypesBySlot: { 1: 'human', 2: 'human' } });

    recordFightAnalyticsSnapshot(state, makeMatch({
      phase: 'fighting',
      fighters: [
        makeComboFighter('naruto', 0, 0, [], [], [], []),
        { hp: 100, roundsWon: 0, character: { id: 'sasuke' } }
      ] as MatchSnapshot['fighters']
    }), common, capture, 1500, { actorTypesBySlot: { 1: 'human', 2: 'human' } });

    const route = captured.find((event) => event.name === 'combo_route_completed');
    expect(route?.properties).toMatchObject({
      character_id: 'naruto',
      opponent_character_id: 'sasuke',
      slot: 1,
      actor_type: 'human',
      route_key: 'jab:1>kick:2',
      route_inputs: 'jab>kick',
      route_families: 'punch>kick',
      route_visual_families: 'punch>kick',
      combo_hits: 2,
      combo_damage: 34,
      included_launcher: true
    });
    expect(captured.filter((event) => event.name === 'combo_route_completed')).toHaveLength(1);
  });

  it('does not capture single-hit routes', () => {
    const state = createFightAnalyticsState(0);
    const captured: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const capture = (name: string, properties: Record<string, unknown>) => captured.push({ name, properties });

    recordFightAnalyticsSnapshot(state, makeMatch({
      phase: 'fighting',
      fighters: [
        makeComboFighter('naruto', 1, 12, ['jab:1'], ['jab'], ['punch'], ['punch']),
        { hp: 100, roundsWon: 0, character: { id: 'sasuke' } }
      ] as MatchSnapshot['fighters']
    }), { mode: 'local2p' }, capture, 1000);
    recordFightAnalyticsSnapshot(state, makeMatch({ phase: 'fighting' }), { mode: 'local2p' }, capture, 1500);

    expect(captured.some((event) => event.name === 'combo_route_completed')).toBe(false);
  });

  it('dedupes completed combo route snapshots', () => {
    const state = createFightAnalyticsState(0);
    const captured: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const capture = (name: string, properties: Record<string, unknown>) => captured.push({ name, properties });
    const active = makeMatch({
      phase: 'fighting',
      fighters: [
        makeComboFighter('naruto', 2, 20, ['jab:1', 'kick:2'], ['jab', 'kick'], ['punch', 'kick'], ['punch', 'kick']),
        { hp: 100, roundsWon: 0, character: { id: 'sasuke' } }
      ] as MatchSnapshot['fighters']
    });
    const reset = makeMatch({ phase: 'fighting' });

    recordFightAnalyticsSnapshot(state, active, { mode: 'local2p' }, capture, 1000);
    recordFightAnalyticsSnapshot(state, reset, { mode: 'local2p' }, capture, 1500);
    recordFightAnalyticsSnapshot(state, reset, { mode: 'local2p' }, capture, 2000);

    expect(captured.filter((event) => event.name === 'combo_route_completed')).toHaveLength(1);
  });

  it('flushes an active combo route when the round ends', () => {
    const state = createFightAnalyticsState(0);
    const captured: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const capture = (name: string, properties: Record<string, unknown>) => captured.push({ name, properties });

    recordFightAnalyticsSnapshot(state, makeMatch({
      phase: 'fighting',
      fighters: [
        makeComboFighter('naruto', 3, 48, ['jab:1', 'kick:2', 'heavy:3'], ['jab', 'kick', 'heavy'], ['punch', 'kick', 'heavy'], ['punch', 'kick', 'heavy']),
        { hp: 100, roundsWon: 0, character: { id: 'sasuke' } }
      ] as MatchSnapshot['fighters']
    }), { mode: 'local2p' }, capture, 1000);
    recordFightAnalyticsSnapshot(state, makeMatch({
      phase: 'roundOver',
      fighters: [
        makeComboFighter('naruto', 3, 48, ['jab:1', 'kick:2', 'heavy:3'], ['jab', 'kick', 'heavy'], ['punch', 'kick', 'heavy'], ['punch', 'kick', 'heavy'], 1),
        { hp: 0, roundsWon: 0, character: { id: 'sasuke' } }
      ] as MatchSnapshot['fighters']
    }), { mode: 'local2p' }, capture, 2000);

    expect(captured.find((event) => event.name === 'combo_route_completed')?.properties).toMatchObject({
      route_key: 'jab:1>kick:2>heavy:3',
      combo_hits: 3
    });
  });

  it('excludes non-human combo routes by default', () => {
    const state = createFightAnalyticsState(0);
    const captured: Array<{ name: string; properties: Record<string, unknown> }> = [];
    const capture = (name: string, properties: Record<string, unknown>) => captured.push({ name, properties });

    recordFightAnalyticsSnapshot(state, makeMatch({
      phase: 'fighting',
      fighters: [
        { hp: 100, roundsWon: 0, character: { id: 'naruto' } },
        makeComboFighter('sasuke', 2, 28, ['jab:1', 'special:2'], ['jab', 'special'], ['punch', 'special'], ['punch', 'special'])
      ] as MatchSnapshot['fighters']
    }), { mode: 'cpu' }, capture, 1000, { actorTypesBySlot: { 1: 'human', 2: 'cpu' } });
    recordFightAnalyticsSnapshot(state, makeMatch({ phase: 'fighting' }), { mode: 'cpu' }, capture, 1500, { actorTypesBySlot: { 1: 'human', 2: 'cpu' } });

    expect(captured.some((event) => event.name === 'combo_route_completed')).toBe(false);
  });
});

function makeComboFighter(
  characterId: string,
  comboHits: number,
  comboDamage: number,
  comboIdentitySequence: string[],
  comboSequence: MatchSnapshot['fighters'][number]['comboSequence'],
  comboFamilySequence: string[],
  comboVisualFamilySequence: string[],
  roundsWon = 0
) {
  return {
    hp: 100,
    roundsWon,
    character: { id: characterId },
    baseCharacter: { id: characterId },
    comboHits,
    comboDamage,
    comboIdentitySequence,
    comboSequence,
    comboFamilySequence,
    comboVisualFamilySequence
  } as MatchSnapshot['fighters'][number];
}
