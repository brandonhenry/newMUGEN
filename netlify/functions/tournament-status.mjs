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
  statusText
} from './_tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    const params = event.queryStringParameters || {};
    const tournamentId = cleanId(params.tournamentId);
    const playerId = cleanId(params.playerId);
    if (!tournamentId) return json(400, { error: 'missing_tournament_id' });
    const store = getTournamentStore(event);
    const bracket = tournamentId === FREE_ONLINE_TOURNAMENT_ID
      ? await getOrCreateFreeTournament(store)
      : await readTournament(store, tournamentId);
    if (!bracket) return json(404, { error: 'tournament_not_found' });
    const assignment = playerId ? assignedMatch(bracket, playerId) : { entry: undefined, match: undefined };
    return json(200, {
      bracket,
      entry: assignment.entry,
      assignedMatch: assignment.match,
      payment: paymentSummary(assignment.entry),
      statusText: statusText(bracket, assignment.match)
    });
  } catch (error) {
    return errorJson(error);
  }
}
