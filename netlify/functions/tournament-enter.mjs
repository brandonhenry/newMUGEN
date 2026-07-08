import {
  cleanId,
  cleanName,
  enterFreeTournament,
  errorJson,
  getOrCreateFreeTournament,
  getTournamentStore,
  json,
  writeTournament
} from './_tournament-store.mjs';
import {
  PAID_LIGHTNING_TOURNAMENT_ID,
  enterPaidTournament,
  getPaidTournamentStores
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const kind = body.kind === 'paidOnline' ? 'paidOnline' : body.kind === 'freeOnline' ? 'freeOnline' : '';
    const playerId = cleanId(body.playerId);
    const characterId = cleanId(body.characterId);
    const displayName = cleanName(body.displayName);
    if (!kind || !playerId || !characterId) return json(400, { error: 'missing_fields' });

    if (kind === 'paidOnline' || body.tournamentId === PAID_LIGHTNING_TOURNAMENT_ID) {
      const result = await enterPaidTournament(getPaidTournamentStores(event), { playerId, displayName, characterId, posthogDeviceId: body.posthogDeviceId }, Date.now());
      return json(200, {
        bracket: result.bracket,
        entry: result.entry,
        amountSats: result.entry.amountSats,
        paymentRequest: result.entry.paymentRequest,
        checkingId: result.entry.checkingId,
        lightningUrl: result.entry.lightningUrl
      });
    }

    const store = getTournamentStore(event);
    const current = await getOrCreateFreeTournament(store);
    const result = enterFreeTournament(current, { playerId, displayName, characterId }, Date.now());
    await writeTournament(store, result.bracket);
    return json(200, result);
  } catch (error) {
    return errorJson(error);
  }
}
