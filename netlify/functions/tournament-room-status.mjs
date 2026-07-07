import {
  errorJson,
  getPaidTournamentRoomStatus,
  getPaidTournamentStores,
  json
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    const params = event.queryStringParameters || {};
    return json(200, await getPaidTournamentRoomStatus(getPaidTournamentStores(event), {
      tournamentId: params.tournamentId,
      matchId: params.matchId,
      playerId: params.playerId,
      posthogDeviceId: params.posthogDeviceId
    }, Date.now()));
  } catch (error) {
    return errorJson(error);
  }
}
