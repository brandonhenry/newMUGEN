import {
  cleanId,
  errorJson,
  getFreeTournamentRoomStatus,
  getTournamentStore,
  PAID_LIGHTNING_TOURNAMENT_ID as LEGACY_PAID_LIGHTNING_TOURNAMENT_ID,
  json
} from './_tournament-store.mjs';
import {
  getPaidTournamentRoomStatus,
  getPaidTournamentStores,
  PAID_LIGHTNING_TOURNAMENT_ID
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    const params = event.queryStringParameters || {};
    const tournamentId = cleanId(params.tournamentId);
    const request = {
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      playerId: params.playerId,
      posthogDeviceId: params.posthogDeviceId
    };
    if (tournamentId === PAID_LIGHTNING_TOURNAMENT_ID || tournamentId === LEGACY_PAID_LIGHTNING_TOURNAMENT_ID || tournamentId.startsWith(`${PAID_LIGHTNING_TOURNAMENT_ID}-`)) {
      return json(200, await getPaidTournamentRoomStatus(getPaidTournamentStores(event), request, Date.now()));
    }
    return json(200, await getFreeTournamentRoomStatus(getTournamentStore(event), request, Date.now()));
  } catch (error) {
    return errorJson(error);
  }
}
