import {
  cleanId,
  errorJson,
  getTournamentStore,
  joinFreeTournamentRoom,
  PAID_LIGHTNING_TOURNAMENT_ID as LEGACY_PAID_LIGHTNING_TOURNAMENT_ID,
  json
} from './_tournament-store.mjs';
import {
  getPaidTournamentStores,
  joinPaidTournamentRoom,
  PAID_LIGHTNING_TOURNAMENT_ID
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const tournamentId = cleanId(body.tournamentId);
    const request = {
      tournamentId: body.tournamentId,
      matchId: body.matchId,
      playerId: body.playerId,
      posthogDeviceId: body.posthogDeviceId,
      peerId: body.peerId
    };
    if (tournamentId === PAID_LIGHTNING_TOURNAMENT_ID || tournamentId === LEGACY_PAID_LIGHTNING_TOURNAMENT_ID || tournamentId.startsWith(`${PAID_LIGHTNING_TOURNAMENT_ID}-`)) {
      return json(200, await joinPaidTournamentRoom(getPaidTournamentStores(event), request, Date.now()));
    }
    return json(200, await joinFreeTournamentRoom(getTournamentStore(event), request, Date.now()));
  } catch (error) {
    return errorJson(error);
  }
}
