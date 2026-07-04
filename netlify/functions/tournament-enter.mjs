import {
  FREE_ONLINE_TOURNAMENT_ID,
  PAID_BTC_TOURNAMENT_ID,
  cleanId,
  cleanName,
  enterFreeTournament,
  errorJson,
  getOrCreateFreeTournament,
  getTournamentStore,
  json,
  paidEnabled,
  readTournament,
  writeTournament
} from './_tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const kind = body.kind === 'paidOnline' ? 'paidOnline' : body.kind === 'freeOnline' ? 'freeOnline' : '';
    const playerId = cleanId(body.playerId);
    const characterId = cleanId(body.characterId);
    const displayName = cleanName(body.displayName);
    if (!kind || !playerId || !characterId) return json(400, { error: 'missing_fields' });

    if (kind === 'paidOnline' || body.tournamentId === PAID_BTC_TOURNAMENT_ID) {
      if (!paidEnabled()) {
        return json(409, {
          error: 'paid_tournament_unavailable',
          message: 'Paid BTC tournaments are not enabled yet.'
        });
      }
      return json(501, { error: 'paid_provider_not_implemented', message: 'Paid provider flow is not implemented.' });
    }

    const store = getTournamentStore(event);
    const current = await getOrCreateFreeTournament(store);
    const latest = await readTournament(store, FREE_ONLINE_TOURNAMENT_ID).then((value) => value || current);
    const result = enterFreeTournament(latest, { playerId, displayName, characterId }, Date.now());
    await writeTournament(store, result.bracket);
    return json(200, result);
  } catch (error) {
    return errorJson(error);
  }
}
