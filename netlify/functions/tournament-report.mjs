import {
  assignedMatch,
  cleanId,
  errorJson,
  getTournamentStore,
  json,
  paymentSummary,
  readTournament,
  resolveExpiredFreeAssignedRoom,
  reportWinner,
  statusText,
  writeTournament
} from './_tournament-store.mjs';
import {
  getPaidTournamentStores,
  PAID_LIGHTNING_TOURNAMENT_ID,
  reportPaidTournamentWinner
} from './_paid-tournament-store.mjs';
import {
  getOfficialTournamentStore,
  isOfficialTournamentId,
  reportOfficialGame
} from './_official-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const tournamentId = cleanId(body.tournamentId);
    const matchId = cleanId(body.matchId);
    const reporterPlayerId = cleanId(body.reporterPlayerId);
    const winnerEntryId = cleanId(body.winnerEntryId);
    if (!tournamentId || !matchId || !reporterPlayerId || !winnerEntryId) return json(400, { error: 'missing_fields' });
    if (isOfficialTournamentId(tournamentId)) {
      return json(200, await reportOfficialGame(getOfficialTournamentStore(event), {
        tournamentId,
        matchId,
        reporterPlayerId,
        winnerEntryId,
        posthogDeviceId: body.posthogDeviceId,
        roomId: body.roomId,
        gameNumber: body.gameNumber
      }, Date.now()));
    }
    if (tournamentId === PAID_LIGHTNING_TOURNAMENT_ID || tournamentId.startsWith(`${PAID_LIGHTNING_TOURNAMENT_ID}-`)) {
      return json(200, await reportPaidTournamentWinner(getPaidTournamentStores(event), matchId, reporterPlayerId, winnerEntryId, body.posthogDeviceId, body.roomId, Date.now()));
    }
    const store = getTournamentStore(event);
    let bracket = await readTournament(store, tournamentId);
    if (!bracket) return json(404, { error: 'tournament_not_found' });
    const originalBracket = bracket;
    const resolved = await resolveExpiredFreeAssignedRoom(store, bracket, reporterPlayerId, Date.now());
    if (resolved !== originalBracket) {
      bracket = await writeTournament(store, resolved);
    }
    const currentAssignment = assignedMatch(bracket, reporterPlayerId);
    if (resolved !== originalBracket && (!currentAssignment.match || currentAssignment.match.id !== matchId)) {
      return json(200, {
        bracket,
        entry: currentAssignment.entry,
        assignedMatch: currentAssignment.match,
        payment: paymentSummary(currentAssignment.entry),
        statusText: statusText(bracket, currentAssignment.match)
      });
    }
    if (!currentAssignment.match || currentAssignment.match.id !== matchId) {
      return json(403, { error: 'match_not_assigned', message: 'Reporter is not assigned to this match' });
    }
    if (currentAssignment.match.roomId && cleanId(body.roomId) !== currentAssignment.match.roomId) {
      return json(403, { error: 'room_required', message: 'Match room is required to report this result' });
    }
    if (currentAssignment.match.status === 'completed' && currentAssignment.match.winnerEntryId === winnerEntryId) {
      return json(200, {
        bracket,
        entry: currentAssignment.entry,
        assignedMatch: currentAssignment.match,
        payment: paymentSummary(currentAssignment.entry),
        statusText: statusText(bracket, currentAssignment.match)
      });
    }
    const reported = reportWinner(bracket, matchId, winnerEntryId, Date.now());
    await writeTournament(store, reported);
    const assignment = assignedMatch(reported, reporterPlayerId);
    return json(200, {
      bracket: reported,
      entry: assignment.entry,
      assignedMatch: assignment.match,
      payment: paymentSummary(assignment.entry),
      statusText: statusText(reported, assignment.match)
    });
  } catch (error) {
    return errorJson(error);
  }
}
