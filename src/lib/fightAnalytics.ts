import type { CombatPopupEvent, ImpactSparkEvent, MatchSnapshot } from '../types';
import type { AnalyticsEventName, AnalyticsProperties } from './analytics';

type FightAnalyticsLifecycleEvent = Extract<AnalyticsEventName, 'round_started' | 'round_ended' | 'match_completed'>;
type FightAnalyticsCapture = (name: FightAnalyticsLifecycleEvent, properties: AnalyticsProperties) => void;

export type FightAnalyticsCounters = {
  hitCount: number;
  blockCount: number;
  clashCount: number;
  totalDamageP1: number;
  totalDamageP2: number;
  maxComboHits: number;
};

export type FightAnalyticsState = {
  matchStartedAt: number;
  roundStartedAt: number;
  lastPhase: MatchSnapshot['phase'] | null;
  previousRoundsWon: [number, number];
  seenRoundStarts: Set<number>;
  seenRoundEnds: Set<string>;
  seenCombatEventIds: Set<number>;
  seenImpactEventIds: Set<number>;
  matchCompleted: boolean;
  counters: FightAnalyticsCounters;
};

export function createEmptyFightAnalyticsCounters(): FightAnalyticsCounters {
  return {
    hitCount: 0,
    blockCount: 0,
    clashCount: 0,
    totalDamageP1: 0,
    totalDamageP2: 0,
    maxComboHits: 0
  };
}

export function createFightAnalyticsState(now = performance.now()): FightAnalyticsState {
  return {
    matchStartedAt: now,
    roundStartedAt: now,
    lastPhase: null,
    previousRoundsWon: [0, 0],
    seenRoundStarts: new Set(),
    seenRoundEnds: new Set(),
    seenCombatEventIds: new Set(),
    seenImpactEventIds: new Set(),
    matchCompleted: false,
    counters: createEmptyFightAnalyticsCounters()
  };
}

export function resetFightAnalyticsState(state: FightAnalyticsState, now = performance.now()) {
  state.matchStartedAt = now;
  state.roundStartedAt = now;
  state.lastPhase = null;
  state.previousRoundsWon = [0, 0];
  state.seenRoundStarts.clear();
  state.seenRoundEnds.clear();
  state.seenCombatEventIds.clear();
  state.seenImpactEventIds.clear();
  state.matchCompleted = false;
  state.counters = createEmptyFightAnalyticsCounters();
}

export function recordFightAnalyticsSnapshot(
  state: FightAnalyticsState,
  match: MatchSnapshot,
  commonProperties: AnalyticsProperties,
  capture: FightAnalyticsCapture,
  now = performance.now()
) {
  addCombatEventsToCounters(state, match.combatEvents);
  addImpactEventsToCounters(state, match.impactEvents);

  if (!state.seenRoundStarts.has(match.round)) {
    state.seenRoundStarts.add(match.round);
    state.roundStartedAt = now;
    capture('round_started', {
      ...commonProperties,
      round: match.round
    });
  }

  if (match.phase === 'roundOver' && state.lastPhase !== 'roundOver') {
    const winnerSlot = getRoundWinnerSlot(match, state.previousRoundsWon);
    const roundEndKey = `${match.round}:${match.fighters[0].roundsWon}:${match.fighters[1].roundsWon}`;
    if (!state.seenRoundEnds.has(roundEndKey)) {
      state.seenRoundEnds.add(roundEndKey);
      capture('round_ended', {
        ...commonProperties,
        round: match.round,
        winner_slot: winnerSlot,
        timer_remaining: Number(match.timer.toFixed(2)),
        p1_hp: Math.round(match.fighters[0].hp),
        p2_hp: Math.round(match.fighters[1].hp),
        p1_rounds_won: match.fighters[0].roundsWon,
        p2_rounds_won: match.fighters[1].roundsWon,
        duration_seconds: Number(((now - state.roundStartedAt) / 1000).toFixed(2))
      });
    }
  }

  if (match.phase === 'matchOver' && match.winnerSlot && !state.matchCompleted) {
    state.matchCompleted = true;
    capture('match_completed', {
      ...commonProperties,
      winner_slot: match.winnerSlot,
      rounds_played: match.round,
      match_duration_seconds: Number(((now - state.matchStartedAt) / 1000).toFixed(2)),
      hit_count: state.counters.hitCount,
      block_count: state.counters.blockCount,
      clash_count: state.counters.clashCount,
      total_damage_p1: Math.round(state.counters.totalDamageP1),
      total_damage_p2: Math.round(state.counters.totalDamageP2),
      max_combo_hits: state.counters.maxComboHits
    });
  }

  state.lastPhase = match.phase;
  state.previousRoundsWon = [match.fighters[0].roundsWon, match.fighters[1].roundsWon];
}

function addCombatEventsToCounters(state: FightAnalyticsState, events: CombatPopupEvent[]) {
  events.forEach((event) => {
    if (state.seenCombatEventIds.has(event.id)) return;
    state.seenCombatEventIds.add(event.id);
    state.counters.maxComboHits = Math.max(state.counters.maxComboHits, event.hits);
    if (event.kind === 'clashWin' || event.kind === 'clashDraw' || event.kind === 'clashPerfect') {
      state.counters.clashCount += 1;
    }
  });
}

function addImpactEventsToCounters(state: FightAnalyticsState, events: ImpactSparkEvent[]) {
  events.forEach((event) => {
    if (state.seenImpactEventIds.has(event.id)) return;
    state.seenImpactEventIds.add(event.id);
    if (event.kind === 'block') {
      state.counters.blockCount += 1;
    } else if (event.kind !== 'clash') {
      state.counters.hitCount += 1;
    }
    if (event.attackerSlot === 1) state.counters.totalDamageP1 += event.damage;
    if (event.attackerSlot === 2) state.counters.totalDamageP2 += event.damage;
    state.counters.maxComboHits = Math.max(state.counters.maxComboHits, event.comboHits ?? 0);
  });
}

function getRoundWinnerSlot(match: MatchSnapshot, previousRoundsWon: [number, number]) {
  const p1Delta = match.fighters[0].roundsWon - previousRoundsWon[0];
  const p2Delta = match.fighters[1].roundsWon - previousRoundsWon[1];
  if (p1Delta > p2Delta) return 1;
  if (p2Delta > p1Delta) return 2;
  return null;
}
