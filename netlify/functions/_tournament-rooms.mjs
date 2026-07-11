export const TOURNAMENT_ROOM_SLOT_MS = 60 * 60 * 1000;

const DEFAULT_TOURNAMENT_STAGE_POOL = [
  'the-chamber',
  'the-chamber-green',
  'grasslands',
  'dust-arena',
  'footstep-grid',
  'petal-courtyard',
  'snowfield',
  'rain-puddles',
  'ripple-basin',
  'energy-floor',
  'fog-marsh',
  'heat-haze',
  'wind-plain',
  'cherry-burst-stage',
  'shimmer-tiles',
  'bleach-bleach-soul-reaper-karakura-town-intersection',
  'bleach-soul-society-courtyard-battle-scene',
  'bleach-urahara-secret-training-ground',
  'dbz-galactic-arena-stage',
  'dbz-hell-stage',
  'dbz-other-world-tournament',
  'dbz-planet-namek',
  'dbz-tournament-of-power-damaged',
  'dbz-wasteland-stage',
  'dbz-world-tournament-stage',
  'dbz-zeno-expo-arena-stage',
  'one-punch-man-opmje-combat-experimentation-room-2'
];

export function attachTournamentRoomsToReadyMatches(bracket, now = Date.now(), stagePool = DEFAULT_TOURNAMENT_STAGE_POOL) {
  return {
    ...bracket,
    matches: bracket.matches.map((match) => attachTournamentRoomToMatch(bracket, match, now, stagePool))
  };
}

export function attachTournamentRoomToMatch(bracket, match, now = Date.now(), stagePool = DEFAULT_TOURNAMENT_STAGE_POOL) {
  if (match.status !== 'ready' || !match.entryAId || !match.entryBId) return match;
  const roomId = match.roomId || `${bracket.id}:${match.id}`;
  const slotStartsAt = match.slotStartsAt || now;
  return {
    ...match,
    stageId: match.stageId || deterministicStageId(bracket.id, match.id, stagePool),
    roomId,
    slotStartsAt,
    slotEndsAt: match.slotEndsAt || slotStartsAt + TOURNAMENT_ROOM_SLOT_MS,
    roomStatus: match.roomStatus || 'pending',
    reportState: match.reportState || 'none'
  };
}

export async function readTournamentMatchRoom(roomStore, bracket, match, entry, now = Date.now()) {
  if (!match?.roomId) return undefined;
  const stored = await readTournamentMatchRoomRecord(roomStore, bracket.id, match.id);
  if (!stored) {
    return {
      tournamentId: bracket.id,
      matchId: match.id,
      roomId: match.roomId,
      slotStartsAt: match.slotStartsAt,
      slotEndsAt: match.slotEndsAt,
      status: now > match.slotEndsAt ? 'closed' : 'waiting',
      localRole: undefined
    };
  }
  const localRole = stored.hostEntryId === entry?.id ? 'host' : stored.guestEntryId === entry?.id ? 'guest' : undefined;
  const status = now > stored.slotEndsAt && stored.status !== 'forfeit' && stored.status !== 'review' ? 'closed' : stored.status;
  return { ...stored, status, localRole };
}

export async function readTournamentMatchRoomRecord(roomStore, tournamentId, matchId) {
  return roomStore.get(tournamentRoomKey(tournamentId, matchId), { type: 'json' }).catch(() => null);
}

export async function writeTournamentMatchRoomRecord(roomStore, tournamentId, matchId, room) {
  await roomStore.setJSON(tournamentRoomKey(tournamentId, matchId), room);
  return room;
}

export async function upsertTournamentMatchRoom(roomStore, bracket, match, entry, peerId, now = Date.now()) {
  const base = await readTournamentMatchRoom(roomStore, bracket, match, entry, now);
  if (!base) throw Object.assign(new Error('Match room not found'), { statusCode: 404, code: 'room_not_found' });
  if (now > base.slotEndsAt) {
    const closed = { ...base, status: 'closed' };
    await roomStore.setJSON(tournamentRoomKey(bracket.id, match.id), closed);
    return closed;
  }
  let next = { ...base };
  if (!next.hostEntryId || next.hostEntryId === entry.id) {
    next = { ...next, hostEntryId: entry.id, hostPeerId: peerId, status: next.guestEntryId ? 'ready' : 'waiting', localRole: 'host' };
  } else if (!next.guestEntryId || next.guestEntryId === entry.id) {
    next = { ...next, guestEntryId: entry.id, guestPeerId: peerId, status: 'ready', localRole: 'guest' };
  } else {
    throw Object.assign(new Error('Match room is full'), { statusCode: 409, code: 'room_full' });
  }
  await roomStore.setJSON(tournamentRoomKey(bracket.id, match.id), next);
  return next;
}

export function assertTournamentEntryAssignedToMatch(entry, match) {
  if (!match || match.status !== 'ready') throw Object.assign(new Error('Match is not ready'), { statusCode: 409, code: 'match_not_ready' });
  if (match.entryAId !== entry.id && match.entryBId !== entry.id) {
    throw Object.assign(new Error('Entry is not assigned to this match'), { statusCode: 403, code: 'match_not_assigned' });
  }
}

function tournamentRoomKey(tournamentId, matchId) {
  return `${tournamentId}/${matchId}.json`;
}

function deterministicStageId(tournamentId, matchId, stagePool = DEFAULT_TOURNAMENT_STAGE_POOL) {
  const pool = Array.isArray(stagePool) && stagePool.length > 0 ? stagePool : DEFAULT_TOURNAMENT_STAGE_POOL;
  const seed = `${tournamentId}:${matchId}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return pool[hash % pool.length];
}
