import type { CombatPopupEvent, ImpactSparkEvent, MatchSnapshot } from '../types';
import type { AnalyticsEventName, AnalyticsProperties } from './analytics';

export type FightAnalyticsActorType = 'human' | 'cpu' | 'dummy' | 'remote_human';

type FightAnalyticsLifecycleEvent = Extract<AnalyticsEventName, 'round_started' | 'round_ended' | 'match_completed' | 'combo_route_completed' | 'performance_summary'>;
type FightAnalyticsCapture = (name: FightAnalyticsLifecycleEvent, properties: AnalyticsProperties) => void;

export type FightAnalyticsOptions = {
  actorTypesBySlot?: Partial<Record<1 | 2, FightAnalyticsActorType>>;
  captureComboRoutesForActorTypes?: FightAnalyticsActorType[];
  localSlot?: 1 | 2;
};

type ActiveComboRouteAnalytics = {
  slot: 1 | 2;
  routeKey: string;
  routeInputs: string;
  routeFamilies: string;
  routeVisualFamilies: string;
  comboHits: number;
  comboDamage: number;
  characterId: string;
  opponentCharacterId: string;
  actorType: FightAnalyticsActorType;
  round: number;
  includedLauncher: boolean;
  includedTornado: boolean;
  includedKiBurst: boolean;
};

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
  activeComboRoutes: [ActiveComboRouteAnalytics | null, ActiveComboRouteAnalytics | null];
  emittedComboRouteKeys: Set<string>;
  matchCompleted: boolean;
  lastSnapshotAt: number;
  frameDurationsMs: number[];
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
    activeComboRoutes: [null, null],
    emittedComboRouteKeys: new Set(),
    matchCompleted: false,
    lastSnapshotAt: now,
    frameDurationsMs: [],
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
  state.activeComboRoutes = [null, null];
  state.emittedComboRouteKeys.clear();
  state.matchCompleted = false;
  state.lastSnapshotAt = now;
  state.frameDurationsMs = [];
  state.counters = createEmptyFightAnalyticsCounters();
}

export function recordFightAnalyticsSnapshot(
  state: FightAnalyticsState,
  match: MatchSnapshot,
  commonProperties: AnalyticsProperties,
  capture: FightAnalyticsCapture,
  now = performance.now(),
  options: FightAnalyticsOptions = {}
) {
  const frameDuration = now - state.lastSnapshotAt;
  state.lastSnapshotAt = now;
  if (frameDuration > 0 && frameDuration < 1_000 && state.frameDurationsMs.length < 18_000) {
    state.frameDurationsMs.push(frameDuration);
  }
  addCombatEventsToCounters(state, match.combatEvents);
  addImpactEventsToCounters(state, match.impactEvents);
  recordComboRouteAnalytics(state, match, commonProperties, capture, options);

  if (!state.seenRoundStarts.has(match.round)) {
    state.seenRoundStarts.add(match.round);
    state.roundStartedAt = now;
    capture('round_started', {
      ...commonProperties,
      round: match.round
    });
  }

  if (match.phase === 'roundOver' && state.lastPhase !== 'roundOver') {
    flushActiveComboRoutes(state, commonProperties, capture, options);
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
    flushActiveComboRoutes(state, commonProperties, capture, options);
    state.matchCompleted = true;
    const loserSlot = match.winnerSlot === 1 ? 2 : 1;
    const durationSeconds = Number(((now - state.matchStartedAt) / 1000).toFixed(2));
    capture('match_completed', {
      ...commonProperties,
      winner_slot: match.winnerSlot,
      rounds_played: match.round,
      match_duration_seconds: durationSeconds,
      completion_reason: 'normal',
      winner_character_id: getFighterCharacterId(match.fighters[match.winnerSlot - 1]),
      loser_character_id: getFighterCharacterId(match.fighters[loserSlot - 1]),
      local_result: options.localSlot ? (options.localSlot === match.winnerSlot ? 'win' : 'loss') : 'not_applicable',
      hit_count: state.counters.hitCount,
      block_count: state.counters.blockCount,
      clash_count: state.counters.clashCount,
      total_damage_p1: Math.round(state.counters.totalDamageP1),
      total_damage_p2: Math.round(state.counters.totalDamageP2),
      max_combo_hits: state.counters.maxComboHits
    });
    const sortedFrameDurations = [...state.frameDurationsMs].sort((a, b) => a - b);
    const averageFrameMs = sortedFrameDurations.length > 0
      ? sortedFrameDurations.reduce((sum, value) => sum + value, 0) / sortedFrameDurations.length
      : 0;
    const p95Index = Math.max(0, Math.ceil(sortedFrameDurations.length * 0.95) - 1);
    capture('performance_summary', {
      ...commonProperties,
      activity_type: 'match',
      duration_seconds: durationSeconds,
      average_fps: averageFrameMs > 0 ? Number((1000 / averageFrameMs).toFixed(1)) : 0,
      p95_frame_ms: Number((sortedFrameDurations[p95Index] ?? 0).toFixed(1)),
      long_frame_count: sortedFrameDurations.filter((value) => value > 50).length,
      sample_count: sortedFrameDurations.length
    });
  }

  state.lastPhase = match.phase;
  state.previousRoundsWon = [match.fighters[0].roundsWon, match.fighters[1].roundsWon];
}

function recordComboRouteAnalytics(
  state: FightAnalyticsState,
  match: MatchSnapshot,
  commonProperties: AnalyticsProperties,
  capture: FightAnalyticsCapture,
  options: FightAnalyticsOptions
) {
  ([1, 2] as const).forEach((slot) => {
    const current = makeActiveComboRoute(match, slot, options);
    const previous = state.activeComboRoutes[slot - 1];

    if (!current) {
      if (previous) emitComboRoute(state, previous, commonProperties, capture, options);
      state.activeComboRoutes[slot - 1] = null;
      return;
    }

    const flags = collectComboRouteFlags(match, slot);
    current.includedLauncher = previous?.routeKey === current.routeKey
      ? previous.includedLauncher || flags.includedLauncher
      : flags.includedLauncher;
    current.includedTornado = previous?.routeKey === current.routeKey
      ? previous.includedTornado || flags.includedTornado
      : flags.includedTornado;
    current.includedKiBurst = previous?.routeKey === current.routeKey
      ? previous.includedKiBurst || flags.includedKiBurst
      : flags.includedKiBurst;

    if (previous && !isComboRouteContinuation(previous, current)) {
      emitComboRoute(state, previous, commonProperties, capture, options);
    } else if (previous) {
      current.includedLauncher = current.includedLauncher || previous.includedLauncher;
      current.includedTornado = current.includedTornado || previous.includedTornado;
      current.includedKiBurst = current.includedKiBurst || previous.includedKiBurst;
    }

    state.activeComboRoutes[slot - 1] = current;
  });
}

function makeActiveComboRoute(match: MatchSnapshot, slot: 1 | 2, options: FightAnalyticsOptions): ActiveComboRouteAnalytics | null {
  const fighter = match.fighters[slot - 1];
  const comboHits = fighter?.comboHits ?? 0;
  const comboIdentitySequence = fighter?.comboIdentitySequence ?? [];
  if (!fighter || comboHits < 2 || comboIdentitySequence.length < 2) return null;
  const opponent = match.fighters[slot === 1 ? 1 : 0];
  const routeKey = comboIdentitySequence.join('>');
  if (!routeKey) return null;
  const flags = collectComboRouteFlags(match, slot);
  return {
    slot,
    routeKey,
    routeInputs: (fighter.comboSequence ?? []).join('>'),
    routeFamilies: (fighter.comboFamilySequence ?? []).join('>'),
    routeVisualFamilies: (fighter.comboVisualFamilySequence ?? []).join('>'),
    comboHits: Math.max(0, Math.round(comboHits)),
    comboDamage: Math.max(0, Math.round(fighter.comboDamage)),
    characterId: getFighterCharacterId(fighter),
    opponentCharacterId: getFighterCharacterId(opponent),
    actorType: getFightAnalyticsActorType(slot, options),
    round: match.round,
    includedLauncher: flags.includedLauncher,
    includedTornado: flags.includedTornado,
    includedKiBurst: flags.includedKiBurst
  };
}

function collectComboRouteFlags(match: MatchSnapshot, slot: 1 | 2) {
  const impactEvents = match.impactEvents.filter((event) => event.attackerSlot === slot && (event.comboHits ?? 0) >= 1);
  const combatEvents = match.combatEvents.filter((event) => event.slot === slot && event.hits >= 1);
  return {
    includedLauncher: impactEvents.some((event) => Boolean(event.launched)) || combatEvents.some((event) => Boolean(event.launched)),
    includedTornado: impactEvents.some((event) => Boolean(event.tornado)) || combatEvents.some((event) => Boolean(event.tornado)),
    includedKiBurst: impactEvents.some((event) => Boolean(event.kiBurst)) || combatEvents.some((event) => Boolean(event.kiBurst))
  };
}

function isComboRouteContinuation(previous: ActiveComboRouteAnalytics, current: ActiveComboRouteAnalytics) {
  return previous.slot === current.slot && (
    current.routeKey === previous.routeKey ||
    current.routeKey.startsWith(`${previous.routeKey}>`)
  );
}

function flushActiveComboRoutes(
  state: FightAnalyticsState,
  commonProperties: AnalyticsProperties,
  capture: FightAnalyticsCapture,
  options: FightAnalyticsOptions
) {
  state.activeComboRoutes.forEach((route) => {
    if (route) emitComboRoute(state, route, commonProperties, capture, options);
  });
  state.activeComboRoutes = [null, null];
}

function emitComboRoute(
  state: FightAnalyticsState,
  route: ActiveComboRouteAnalytics,
  commonProperties: AnalyticsProperties,
  capture: FightAnalyticsCapture,
  options: FightAnalyticsOptions
) {
  if (route.comboHits < 2) return;
  if (!shouldCaptureComboRouteActor(route.actorType, options)) return;
  const emittedKey = `${route.round}:${route.slot}:${route.routeKey}:${route.comboHits}:${route.comboDamage}`;
  if (state.emittedComboRouteKeys.has(emittedKey)) return;
  state.emittedComboRouteKeys.add(emittedKey);
  capture('combo_route_completed', {
    ...commonProperties,
    character_id: route.characterId,
    opponent_character_id: route.opponentCharacterId,
    slot: route.slot,
    actor_type: route.actorType,
    route_key: route.routeKey,
    route_inputs: route.routeInputs,
    route_families: route.routeFamilies,
    route_visual_families: route.routeVisualFamilies,
    combo_hits: route.comboHits,
    combo_damage: route.comboDamage,
    round: route.round,
    included_launcher: route.includedLauncher,
    included_tornado: route.includedTornado,
    included_ki_burst: route.includedKiBurst
  });
}

function shouldCaptureComboRouteActor(actorType: FightAnalyticsActorType, options: FightAnalyticsOptions) {
  return (options.captureComboRoutesForActorTypes ?? ['human']).includes(actorType);
}

function getFightAnalyticsActorType(slot: 1 | 2, options: FightAnalyticsOptions): FightAnalyticsActorType {
  return options.actorTypesBySlot?.[slot] ?? 'human';
}

function getFighterCharacterId(fighter: MatchSnapshot['fighters'][number] | undefined) {
  return fighter?.baseCharacter?.id ?? fighter?.character?.id ?? '';
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
