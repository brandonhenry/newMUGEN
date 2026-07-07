import {
  errorJson,
  getPaidTournamentStores,
  joinPaidTournamentRoom,
  json
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    return json(200, await joinPaidTournamentRoom(getPaidTournamentStores(event), {
      tournamentId: body.tournamentId,
      matchId: body.matchId,
      playerId: body.playerId,
      posthogDeviceId: body.posthogDeviceId,
      peerId: body.peerId
    }, Date.now()));
  } catch (error) {
    return errorJson(error);
  }
}
