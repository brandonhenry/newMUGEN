import {
  cleanId,
  cleanName,
  enterFreeTournament,
  errorJson,
  getOrCreateFreeTournament,
  getTournamentStore,
  json,
  readTournament,
  writeTournament
} from './_tournament-store.mjs';
import {
  PAID_LIGHTNING_TOURNAMENT_ID,
  enterPaidTournament,
  getPaidTournamentStores
} from './_paid-tournament-store.mjs';
import { getTournamentEmailStore, notifyTournamentReady } from './_tournament-email.mjs';

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
    const current = await resolveFreeTournamentForEntry(store, playerId, cleanId(body.tournamentId));
    const result = enterFreeTournament(current, { playerId, displayName, characterId }, Date.now());
    await writeTournament(store, result.bracket);
    if (result.bracket.status !== 'open') {
      await notifyTournamentReady(getTournamentEmailStore(event), result.bracket, Date.now()).catch((error) => {
        console.warn('Tournament ready email notification failed', error);
      });
    }
    return json(200, result);
  } catch (error) {
    return errorJson(error);
  }
}

export async function resolveFreeTournamentForEntry(store, playerId, requestedTournamentId) {
  const requested = requestedTournamentId ? await readTournament(store, requestedTournamentId) : null;
  const requestedHasPlayer = requested?.entries?.some((entry) => entry.playerId === playerId || entry.id === playerId);
  if (requested?.status === 'open' || requestedHasPlayer) return requested;
  return getOrCreateFreeTournament(store);
}
