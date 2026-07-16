import {
  assignedMatch,
  cleanId,
  errorJson,
  FREE_ONLINE_TOURNAMENT_ID,
  getOrCreateFreeTournament,
  getTournamentStore,
  json,
  paymentSummary,
  readTournament,
  resolveExpiredFreeAssignedRoom,
  statusText,
  writeTournament
} from './_tournament-store.mjs';
import { readTournamentMatchRoom } from './_tournament-rooms.mjs';
import {
  getPaidTournamentStatus,
  getPaidTournamentStores,
  PAID_LIGHTNING_TOURNAMENT_ID
} from './_paid-tournament-store.mjs';
import {
  getOfficialTournamentStatus,
  getOfficialTournamentStore,
  isOfficialTournamentId
} from './_official-tournament-store.mjs';
import { getTournamentEmailStore, notifyTournamentReady } from './_tournament-email.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    const params = event.queryStringParameters || {};
    const tournamentId = cleanId(params.tournamentId);
    const playerId = cleanId(params.playerId);
    if (!tournamentId) return json(400, { error: 'missing_tournament_id' });
    if (isOfficialTournamentId(tournamentId)) {
      const status = await getOfficialTournamentStatus(getOfficialTournamentStore(event), tournamentId, playerId, params.posthogDeviceId, Date.now());
      if (status.bracket.status === 'roundActive') await notifyTournamentReady(getTournamentEmailStore(event), status.bracket, Date.now()).catch((error) => console.warn('Official tournament ready email failed', error));
      return json(200, status);
    }
    if (tournamentId === PAID_LIGHTNING_TOURNAMENT_ID || tournamentId.startsWith(`${PAID_LIGHTNING_TOURNAMENT_ID}-`)) {
      return json(200, await getPaidTournamentStatus(getPaidTournamentStores(event), playerId, params.posthogDeviceId));
    }
    const store = getTournamentStore(event);
    let bracket = tournamentId === FREE_ONLINE_TOURNAMENT_ID
      ? await resolveFreeTournamentStatusBracket(store, playerId)
      : await readTournament(store, tournamentId);
    if (!bracket) return json(404, { error: 'tournament_not_found' });
    const resolved = playerId ? await resolveExpiredFreeAssignedRoom(store, bracket, playerId, Date.now()) : bracket;
    if (resolved !== bracket) bracket = await writeTournament(store, resolved);
    const assignment = playerId ? assignedMatch(bracket, playerId) : { entry: undefined, match: undefined };
    const matchRoom = assignment.match && assignment.entry ? await readTournamentMatchRoom(store, bracket, assignment.match, assignment.entry) : undefined;
    return json(200, {
      bracket,
      entry: assignment.entry,
      assignedMatch: assignment.match,
      matchRoom,
      payment: paymentSummary(assignment.entry),
      resumeNotice: freeResumeNotice(bracket, assignment.entry, assignment.match, matchRoom),
      statusText: statusText(bracket, assignment.match)
    });
  } catch (error) {
    return errorJson(error);
  }
}

function freeResumeNotice(bracket, entry, match, matchRoom) {
  if (entry && bracket.matches?.some((candidate) => candidate.winnerEntryId === entry.id && candidate.roomStatus === 'forfeit' && candidate.reportState === 'forfeit')) return 'forfeit_win';
  return undefined;
}

async function resolveFreeTournamentStatusBracket(store, playerId) {
  const legacy = await readTournament(store, FREE_ONLINE_TOURNAMENT_ID);
  if (legacy?.id) {
    const hasPlayer = playerId && legacy.entries?.some((entry) => entry.playerId === playerId || entry.id === playerId);
    if (hasPlayer || legacy.status !== 'open') return legacy;
  }
  return getOrCreateFreeTournament(store);
}
