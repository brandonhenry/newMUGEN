import {
  assignedMatch,
  cleanId,
  errorJson,
  getTournamentStore,
  json,
  readTournament,
  reportWinner,
  statusText,
  writeTournament
} from './_tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const tournamentId = cleanId(body.tournamentId);
    const matchId = cleanId(body.matchId);
    const reporterPlayerId = cleanId(body.reporterPlayerId);
    const winnerEntryId = cleanId(body.winnerEntryId);
    if (!tournamentId || !matchId || !reporterPlayerId || !winnerEntryId) return json(400, { error: 'missing_fields' });
    const store = getTournamentStore(event);
    const bracket = await readTournament(store, tournamentId);
    if (!bracket) return json(404, { error: 'tournament_not_found' });
    const reported = reportWinner(bracket, matchId, winnerEntryId, Date.now());
    await writeTournament(store, reported);
    const assignment = assignedMatch(reported, reporterPlayerId);
    return json(200, {
      bracket: reported,
      entry: assignment.entry,
      assignedMatch: assignment.match,
      statusText: statusText(reported, assignment.match)
    });
  } catch (error) {
    return errorJson(error);
  }
}
