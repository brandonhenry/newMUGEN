import {
  cleanId,
  errorJson,
  getTournamentStore,
  json,
  readTournament,
  resolveReviewedTournamentMatch,
  writeTournament
} from './_tournament-store.mjs';
import {
  getPaidTournamentStores,
  PAID_LIGHTNING_TOURNAMENT_ID,
  resolvePaidTournamentReview
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    assertAdmin(event, body);
    const tournamentId = cleanId(body.tournamentId);
    const matchId = cleanId(body.matchId);
    const winnerEntryId = cleanId(body.winnerEntryId);
    const resolver = cleanAdminString(body.resolver || 'admin');
    const reason = cleanAdminString(body.reason || 'manual_review');
    if (!tournamentId || !matchId || !winnerEntryId) return json(400, { error: 'missing_fields' });
    const now = Date.now();
    if (tournamentId === PAID_LIGHTNING_TOURNAMENT_ID || tournamentId.startsWith(`${PAID_LIGHTNING_TOURNAMENT_ID}-`)) {
      return json(200, await resolvePaidTournamentReview(getPaidTournamentStores(event), tournamentId, matchId, winnerEntryId, resolver, reason, now));
    }
    const store = getTournamentStore(event);
    const bracket = await readTournament(store, tournamentId);
    if (!bracket) return json(404, { error: 'tournament_not_found' });
    const resolved = resolveReviewedTournamentMatch(bracket, matchId, winnerEntryId, now);
    await writeTournament(store, resolved);
    await store.setJSON(`adminReviews/${tournamentId}/${matchId}/${now}.json`, {
      tournamentId,
      matchId,
      winnerEntryId,
      resolver,
      reason,
      resolvedAt: now
    });
    return json(200, { bracket: resolved });
  } catch (error) {
    return errorJson(error);
  }
}

function assertAdmin(event, body) {
  const required = process.env.TOURNAMENT_ADMIN_TOKEN;
  if (!required && process.env.NODE_ENV !== 'production') return;
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '') || body.adminToken;
  if (required && token === required) return;
  throw Object.assign(new Error('Admin token required'), { statusCode: 401, code: 'admin_required' });
}

function cleanAdminString(value) {
  return typeof value === 'string' ? value.replace(/[^\w .:@-]/g, '').trim().slice(0, 160) : '';
}
