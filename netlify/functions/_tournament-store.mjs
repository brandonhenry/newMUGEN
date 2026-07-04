import { getBlobStore } from './_blob-store.mjs';

export const TOURNAMENT_STORE_NAME = 'kore-tournaments';
export const FREE_ONLINE_TOURNAMENT_ID = 'free-online-daily';
export const PAID_BTC_TOURNAMENT_ID = 'paid-btc-disabled';
export const FREE_ONLINE_CAPACITY = 8;
export const FREE_ONLINE_MIN_ENTRIES = 8;

export function getTournamentStore(event) {
  return getBlobStore(TOURNAMENT_STORE_NAME, event);
}

export function tournamentKey(id) {
  return `tournaments/${id}`;
}

export async function readTournament(store, id) {
  return store.get(tournamentKey(id), { type: 'json' }).catch(() => null);
}

export async function writeTournament(store, bracket) {
  await store.setJSON(tournamentKey(bracket.id), bracket);
  return bracket;
}

export async function getOrCreateFreeTournament(store, now = Date.now()) {
  const existing = await readTournament(store, FREE_ONLINE_TOURNAMENT_ID);
  if (existing?.id) return sanitizeBracket(existing);
  const bracket = makeOpenFreeTournament(now);
  await writeTournament(store, bracket);
  return bracket;
}

export function makeOpenFreeTournament(now = Date.now()) {
  return {
    id: FREE_ONLINE_TOURNAMENT_ID,
    kind: 'freeOnline',
    status: 'open',
    entries: [],
    matches: [],
    currentRound: 1,
    capacity: FREE_ONLINE_CAPACITY,
    minEntries: FREE_ONLINE_MIN_ENTRIES,
    paidEnabled: false,
    createdAt: now,
    updatedAt: now,
    reward: { kind: 'profilePoints', label: 'Tournament profile trophy', state: 'locked' }
  };
}

export function paidEnabled() {
  return process.env.TOURNAMENT_PAID_ENABLED === 'true' && Boolean(process.env.TOURNAMENT_BTC_PROVIDER);
}

export function paidDisabledSummary() {
  return {
    id: PAID_BTC_TOURNAMENT_ID,
    kind: 'paidOnline',
    status: 'cancelled',
    entryFeeUsd: 2,
    entryFeeLabel: '$2 BTC',
    prizeLabel: '$15 / $10 / $5 BTC',
    entries: 0,
    minEntries: 25,
    capacity: 32,
    paidEnabled: paidEnabled(),
    startsLabel: paidEnabled() ? 'Paid beta provider configured' : 'Paid beta unavailable'
  };
}

export function toSummary(bracket) {
  return {
    id: bracket.id,
    kind: bracket.kind,
    status: bracket.status,
    entryFeeUsd: bracket.kind === 'paidOnline' ? 2 : 0,
    entryFeeLabel: bracket.kind === 'paidOnline' ? '$2 BTC' : 'Free',
    prizeLabel: bracket.kind === 'paidOnline' ? '$15 / $10 / $5 BTC' : 'Profile trophy',
    entries: bracket.entries.length,
    minEntries: bracket.minEntries,
    capacity: bracket.capacity,
    paidEnabled: Boolean(bracket.paidEnabled),
    startsLabel: bracket.status === 'open' ? 'Starts when full' : bracket.status === 'roundActive' ? 'Bracket active' : 'Completed'
  };
}

export function enterFreeTournament(bracket, entryRequest, now = Date.now()) {
  const existing = bracket.entries.find((entry) => entry.playerId === entryRequest.playerId);
  if (existing) {
    return { bracket, entry: existing };
  }
  if (bracket.status !== 'open') {
    throw Object.assign(new Error('Tournament is already locked'), { statusCode: 409, code: 'tournament_locked' });
  }
  if (bracket.entries.length >= bracket.capacity) {
    throw Object.assign(new Error('Tournament is full'), { statusCode: 409, code: 'tournament_full' });
  }
  const entry = {
    id: `entry-${entryRequest.playerId}`,
    playerId: entryRequest.playerId,
    displayName: cleanName(entryRequest.displayName),
    characterId: cleanId(entryRequest.characterId),
    seed: bracket.entries.length + 1,
    paymentState: 'notRequired',
    joinedAt: now
  };
  let next = {
    ...bracket,
    entries: [...bracket.entries, entry],
    updatedAt: now
  };
  if (next.entries.length >= next.minEntries) {
    next = generateOnlineBracket(next, now);
  }
  return { bracket: next, entry };
}

export function generateOnlineBracket(bracket, now = Date.now()) {
  const entries = bracket.entries.slice(0, bracket.capacity);
  const matches = [
    ...[
      [entries[0], entries[7]],
      [entries[3], entries[4]],
      [entries[1], entries[6]],
      [entries[2], entries[5]]
    ].map(([entryA, entryB], index) => ({
      id: `r1m${index + 1}`,
      round: 1,
      index,
      entryAId: entryA?.id,
      entryBId: entryB?.id,
      status: entryA && entryB ? 'ready' : 'pending'
    })),
    { id: 'r2m1', round: 2, index: 0, status: 'pending' },
    { id: 'r2m2', round: 2, index: 1, status: 'pending' },
    { id: 'r3m1', round: 3, index: 0, status: 'pending' }
  ];
  return {
    ...bracket,
    status: 'roundActive',
    matches,
    currentRound: 1,
    updatedAt: now
  };
}

export function assignedMatch(bracket, playerId) {
  const entry = bracket.entries.find((candidate) => candidate.playerId === playerId || candidate.id === playerId);
  if (!entry) return { entry: undefined, match: undefined };
  const match = bracket.matches.find((candidate) =>
    candidate.status === 'ready' &&
    (candidate.entryAId === entry.id || candidate.entryBId === entry.id)
  );
  return { entry, match };
}

export function reportWinner(bracket, matchId, winnerEntryId, now = Date.now()) {
  const source = bracket.matches.find((match) => match.id === matchId);
  if (!source) throw Object.assign(new Error('Match not found'), { statusCode: 404, code: 'match_not_found' });
  if (source.status === 'completed') return bracket;
  if (source.entryAId !== winnerEntryId && source.entryBId !== winnerEntryId) {
    throw Object.assign(new Error('Winner is not in this match'), { statusCode: 400, code: 'invalid_winner' });
  }
  let matches = bracket.matches.map((match) =>
    match.id === matchId
      ? { ...match, winnerEntryId, status: 'completed', reportedAt: now }
      : match
  );
  if (source.round < 3) {
    const nextRound = source.round + 1;
    const nextIndex = Math.floor(source.index / 2);
    const targetSlot = source.index % 2 === 0 ? 'entryAId' : 'entryBId';
    matches = matches.map((match) => {
      if (match.round !== nextRound || match.index !== nextIndex) return match;
      const updated = { ...match, [targetSlot]: winnerEntryId };
      return updated.entryAId && updated.entryBId ? { ...updated, status: 'ready' } : updated;
    });
  }
  const final = matches.find((match) => match.round === 3 && match.status === 'completed');
  return {
    ...bracket,
    matches,
    status: final ? 'completed' : 'roundActive',
    reward: final ? { ...bracket.reward, state: 'earned' } : bracket.reward,
    updatedAt: now
  };
}

export function statusText(bracket, match) {
  if (bracket.status === 'open') return `${bracket.entries.length} / ${bracket.minEntries} entered`;
  if (bracket.status === 'completed') return 'Tournament complete';
  if (match) return 'Match ready';
  return 'Waiting for next round';
}

export function sanitizeBracket(value) {
  return {
    ...value,
    entries: Array.isArray(value.entries) ? value.entries : [],
    matches: Array.isArray(value.matches) ? value.matches : [],
    capacity: Math.max(2, Math.round(Number(value.capacity) || FREE_ONLINE_CAPACITY)),
    minEntries: Math.max(2, Math.round(Number(value.minEntries) || FREE_ONLINE_MIN_ENTRIES)),
    paidEnabled: Boolean(value.paidEnabled)
  };
}

export function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

export function cleanToken(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128);
}

export function cleanName(value) {
  if (typeof value !== 'string') return 'PLAYER';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) || 'PLAYER';
}

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

export function errorJson(error) {
  return json(error.statusCode || 500, {
    error: error.code || 'tournament_error',
    message: error instanceof Error ? error.message : String(error)
  });
}
