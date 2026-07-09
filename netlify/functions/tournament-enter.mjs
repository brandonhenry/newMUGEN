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
  if (requestedHasPlayer) return requested;
  const existing = await findActiveFreeTournamentForPlayer(store, playerId);
  if (existing) return existing;
  if (requested?.status === 'open') return requested;
  return getOrCreateFreeTournament(store);
}

export async function findActiveFreeTournamentForPlayer(store, playerId) {
  const cleanPlayerId = cleanId(playerId);
  if (!cleanPlayerId) return null;
  const listed = await store.list({ prefix: 'tournaments/' }).catch(() => ({ blobs: [] }));
  const ids = [...new Set(
    (listed.blobs || [])
      .map((blob) => String(blob.key || '').replace(/^tournaments\//, ''))
      .filter((id) => id && id !== 'free-online-active.json')
  )];
  const brackets = await Promise.all(ids.map((id) => readTournament(store, id).catch(() => null)));
  return brackets
    .filter((bracket) =>
      bracket?.kind === 'freeOnline' &&
      bracket.status !== 'completed' &&
      bracket.status !== 'cancelled' &&
      bracket.entries?.some((entry) => entry.playerId === cleanPlayerId || entry.id === cleanPlayerId)
    )
    .sort((a, b) => freeTournamentReusePriority(b) - freeTournamentReusePriority(a) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0] ?? null;
}

function freeTournamentReusePriority(bracket) {
  if (bracket.status === 'roundActive' || bracket.status === 'bracketGenerated' || bracket.status === 'locked') return 3;
  if (bracket.status === 'open') return 2;
  return 1;
}
