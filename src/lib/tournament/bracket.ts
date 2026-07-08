import type { TournamentBracket, TournamentEntry, TournamentKind, TournamentMatch, TournamentPaymentState, TournamentReward } from './types';
import { createOnlineBotOpponent } from '../online/bots';

export type TournamentCharacterSeed = {
  id: string;
  displayName: string;
};

export type TournamentLocalPlayerSeed = {
  entryId: string;
  displayName: string;
  character: TournamentCharacterSeed;
};

const LOCAL_TOURNAMENT_CAPACITY = 8;

export function createLocalTournamentBracket(
  player: TournamentCharacterSeed | TournamentLocalPlayerSeed[],
  opponents: TournamentCharacterSeed[],
  now = Date.now()
): TournamentBracket {
  const localPlayers = (Array.isArray(player)
    ? player
    : [{ entryId: 'local-player-1', displayName: 'P1', character: player }]
  ).slice(0, 2);
  const seedText = localPlayers.map((localPlayer) => localPlayer.character.id).join(':') || opponents[0]?.id || 'local';
  const opponentPool = deterministicShuffle(
    opponents.filter((opponent) => !localPlayers.some((localPlayer) => localPlayer.character.id === opponent.id)),
    seedText
  ).slice(0, LOCAL_TOURNAMENT_CAPACITY - localPlayers.length);
  const fallbackOpponents = opponentPool.length > 0
    ? opponentPool
    : localPlayers.map((localPlayer) => localPlayer.character);
  const filledOpponents = Array.from({ length: LOCAL_TOURNAMENT_CAPACITY - localPlayers.length }, (_, index) => {
    return fallbackOpponents[index % fallbackOpponents.length] ?? localPlayers[0]?.character ?? opponents[0];
  });
  const entries: TournamentEntry[] = [
    ...localPlayers.map((localPlayer, index) =>
      makeEntry(localPlayer.entryId, localPlayer.displayName, localPlayer.character.id, index + 1, false, true, now)
    ),
    ...filledOpponents.map((opponent, index) =>
      makeEntry(`cpu-${index + 1}`, opponent.displayName, opponent.id, localPlayers.length + index + 1, true, false, now)
    )
  ];
  const matches = makeEightPlayerMatches(entries);

  return {
    id: `local-${now}`,
    kind: 'freeLocal',
    status: 'roundActive',
    entries,
    matches,
    currentRound: 1,
    capacity: LOCAL_TOURNAMENT_CAPACITY,
    minEntries: LOCAL_TOURNAMENT_CAPACITY,
    paidEnabled: false,
    createdAt: now,
    updatedAt: now,
    reward: makeDefaultReward('freeLocal')
  };
}

export function createCustomLocalTournamentBracket(
  fighters: TournamentCharacterSeed[],
  now = Date.now()
): TournamentBracket {
  const fallback = fighters[0] ?? { id: 'astra', displayName: 'Astra' };
  const pool = deterministicShuffle(fighters.length > 0 ? fighters : [fallback], `custom-${now}`);
  const filledFighters = Array.from({ length: LOCAL_TOURNAMENT_CAPACITY }, (_, index) => {
    return pool[index % pool.length] ?? fallback;
  });
  const entries: TournamentEntry[] = filledFighters.map((fighter, index) =>
    makeEntry(`custom-${index + 1}`, fighter.displayName, fighter.id, index + 1, false, true, now)
  );
  const matches = makeEightPlayerMatches(entries);

  return {
    id: `custom-${now}`,
    kind: 'freeLocal',
    status: 'roundActive',
    entries,
    matches,
    currentRound: 1,
    capacity: LOCAL_TOURNAMENT_CAPACITY,
    minEntries: LOCAL_TOURNAMENT_CAPACITY,
    paidEnabled: false,
    createdAt: now,
    updatedAt: now,
    reward: { ...makeDefaultReward('freeLocal'), label: 'Custom character tournament crown' }
  };
}

export function createInfiniteTournamentBracket(
  fighters: TournamentCharacterSeed[],
  now = Date.now()
): TournamentBracket {
  const characterIds = fighters.map((fighter) => fighter.id).filter(Boolean);
  const fallback = fighters[0] ?? { id: 'astra', displayName: 'Astra' };
  const entries: TournamentEntry[] = Array.from({ length: LOCAL_TOURNAMENT_CAPACITY }, (_, index) => {
    const bot = createOnlineBotOpponent({
      seed: `infinite-${now}-${index + 1}`,
      queue: 'tournament',
      availableCharacterIds: characterIds,
      fallbackCharacterId: fallback.id
    });
    return {
      id: `cpu-${index + 1}`,
      playerId: bot.playerId,
      displayName: bot.displayName,
      characterId: bot.characterId,
      seed: index + 1,
      isCpu: true,
      isBot: true,
      botKp: bot.kp,
      botKr: bot.kr,
      paymentState: 'notRequired',
      joinedAt: now
    };
  });
  const matches = makeEightPlayerMatches(entries);

  return {
    id: `infinite-${now}`,
    kind: 'freeLocal',
    status: 'roundActive',
    entries,
    matches,
    currentRound: 1,
    capacity: LOCAL_TOURNAMENT_CAPACITY,
    minEntries: LOCAL_TOURNAMENT_CAPACITY,
    paidEnabled: false,
    createdAt: now,
    updatedAt: now,
    reward: { ...makeDefaultReward('freeLocal'), label: 'Infinite tournament crown' }
  };
}

export function getTournamentEntry(bracket: TournamentBracket | null, entryId: string | undefined) {
  if (!bracket || !entryId) return undefined;
  return bracket.entries.find((entry) => entry.id === entryId);
}

export function getNextReadyTournamentMatch(bracket: TournamentBracket | null) {
  if (!bracket) return undefined;
  return bracket.matches
    .filter((match) => match.status === 'ready' && match.entryAId && match.entryBId)
    .sort((left, right) => left.round - right.round || left.index - right.index)[0];
}

export function getAssignedTournamentMatch(bracket: TournamentBracket | null, entryId: string | undefined) {
  if (!bracket || !entryId) return undefined;
  return bracket.matches.find((match) =>
    match.status === 'ready' &&
    (match.entryAId === entryId || match.entryBId === entryId)
  );
}

export function getLocalTournamentPlayerEntryIds(bracket: TournamentBracket | null | undefined) {
  return bracket?.entries.filter((entry) => entry.isLocalPlayer).map((entry) => entry.id) ?? [];
}

export function getNextPlayableLocalTournamentMatch(bracket: TournamentBracket | null | undefined) {
  const localEntryIds = new Set(getLocalTournamentPlayerEntryIds(bracket));
  if (!bracket || localEntryIds.size === 0) return undefined;
  return bracket.matches
    .filter((match) => (
      match.status === 'ready' &&
      match.entryAId &&
      match.entryBId &&
      (localEntryIds.has(match.entryAId) || localEntryIds.has(match.entryBId))
    ))
    .sort((left, right) => left.round - right.round || left.index - right.index)[0];
}

export function getTournamentOpponentEntry(bracket: TournamentBracket | null, match: TournamentMatch | undefined, entryId: string | undefined) {
  if (!bracket || !match || !entryId) return undefined;
  const opponentId = match.entryAId === entryId ? match.entryBId : match.entryAId;
  return getTournamentEntry(bracket, opponentId);
}

export function advanceTournamentBracket(
  bracket: TournamentBracket,
  matchId: string,
  winnerEntryId: string,
  now = Date.now()
): TournamentBracket {
  const matches = bracket.matches.map((match) =>
    match.id === matchId
      ? { ...match, winnerEntryId, status: 'completed' as const, reportedAt: now }
      : match
  );
  const completed = applyWinnerToNextRound(matches, matchId, winnerEntryId);
  const final = completed.find((match) => match.round === 3 && match.status === 'completed');
  const status = final ? 'completed' : 'roundActive';
  const currentRound = final ? 3 : Math.min(3, Math.max(1, ...completed.filter((match) => match.status === 'ready').map((match) => match.round)));
  const finalWinner = getTournamentEntry({ ...bracket, matches: completed }, final?.winnerEntryId);
  const reward = finalWinner?.isLocalPlayer || bracket.kind === 'freeOnline'
    ? { ...(bracket.reward ?? makeDefaultReward(bracket.kind)), state: final ? 'earned' as const : bracket.reward?.state ?? 'locked' as const }
    : bracket.reward;

  return {
    ...bracket,
    matches: completed,
    status,
    currentRound,
    reward,
    updatedAt: now
  };
}

export function simulateCpuTournamentMatches(bracket: TournamentBracket, protectedEntryIds: string | string[] = getLocalTournamentPlayerEntryIds(bracket), now = Date.now()) {
  const protectedIds = new Set(Array.isArray(protectedEntryIds) ? protectedEntryIds : [protectedEntryIds]);
  let next = bracket;
  let changed = true;
  while (changed && next.status !== 'completed') {
    changed = false;
    const cpuReady = next.matches.find((match) => {
      if (match.status !== 'ready' || !match.entryAId || !match.entryBId) return false;
      if (protectedIds.has(match.entryAId) || protectedIds.has(match.entryBId)) return false;
      return true;
    });
    if (cpuReady?.entryAId && cpuReady.entryBId) {
      const winner = pickCpuWinner(next, cpuReady.entryAId, cpuReady.entryBId);
      next = advanceTournamentBracket(next, cpuReady.id, winner, now);
      changed = true;
    }
  }
  return next;
}

export function makeDefaultReward(kind: TournamentKind): TournamentReward {
  if (kind === 'paidOnline') return { kind: 'lightningPending', label: 'Lightning prize pending provider setup', state: 'blocked' };
  if (kind === 'freeOnline') return { kind: 'profilePoints', label: 'Tournament profile trophy', state: 'locked' };
  return { kind: 'localTrophy', label: 'Local tournament crown', state: 'locked' };
}

export function makePaidDisabledSummary(): TournamentBracket {
  const now = Date.now();
  return {
    id: 'paid-lightning-disabled',
    kind: 'paidOnline',
    status: 'cancelled',
    entries: [],
    matches: [],
    currentRound: 1,
    capacity: 32,
    minEntries: 25,
    paidEnabled: false,
    createdAt: now,
    updatedAt: now,
    reward: makeDefaultReward('paidOnline')
  };
}

function makeEntry(
  id: string,
  displayName: string,
  characterId: string,
  seed: number,
  isCpu: boolean,
  isLocalPlayer: boolean,
  joinedAt: number,
  paymentState: TournamentPaymentState = 'notRequired'
): TournamentEntry {
  return {
    id,
    playerId: id,
    displayName,
    characterId,
    seed,
    isCpu,
    isLocalPlayer,
    paymentState,
    joinedAt
  };
}

function makeEightPlayerMatches(entries: TournamentEntry[]): TournamentMatch[] {
  const pairings = [
    [entries[0], entries[7]],
    [entries[3], entries[4]],
    [entries[1], entries[6]],
    [entries[2], entries[5]]
  ];
  return [
    ...pairings.map(([entryA, entryB], index) => ({
      id: `r1m${index + 1}`,
      round: 1,
      index,
      entryAId: entryA?.id,
      entryBId: entryB?.id,
      status: 'ready' as const
    })),
    { id: 'r2m1', round: 2, index: 0, status: 'pending' as const },
    { id: 'r2m2', round: 2, index: 1, status: 'pending' as const },
    { id: 'r3m1', round: 3, index: 0, status: 'pending' as const }
  ];
}

function applyWinnerToNextRound(matches: TournamentMatch[], matchId: string, winnerEntryId: string) {
  const source = matches.find((match) => match.id === matchId);
  if (!source || source.round >= 3) return matches;
  const nextRound = source.round + 1;
  const nextIndex = Math.floor(source.index / 2);
  const targetSlot = source.index % 2 === 0 ? 'entryAId' : 'entryBId';
  return matches.map((match) => {
    if (match.round !== nextRound || match.index !== nextIndex) return match;
    const updated = { ...match, [targetSlot]: winnerEntryId };
    return updated.entryAId && updated.entryBId ? { ...updated, status: 'ready' as const } : updated;
  });
}

function pickCpuWinner(bracket: TournamentBracket, entryAId: string, entryBId: string) {
  const entryA = getTournamentEntry(bracket, entryAId);
  const entryB = getTournamentEntry(bracket, entryBId);
  if (!entryA || !entryB) return entryAId;
  return entryA.seed < entryB.seed ? entryAId : entryBId;
}

function deterministicShuffle<T>(items: T[], seed: string) {
  const next = [...items];
  let state = Math.max(1, [...seed].reduce((total, char) => total + char.charCodeAt(0), 0));
  for (let index = next.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}
