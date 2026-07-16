import {
  errorJson,
  json
} from './_tournament-store.mjs';
import {
  getPaidTournamentStores,
  readPaidTournament
} from './_paid-tournament-store.mjs';
import { notifyTournamentAdminReview } from './_tournament-email.mjs';
import { getOfficialTournamentStore, getOrCreateOfficialTournament } from './_official-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    assertAdmin(event);
    const paid = await listPaidReviews(getPaidTournamentStores(event));
    const official = await listOfficialReviews(getOfficialTournamentStore(event));
    return json(200, { reviews: [...official, ...paid] });
  } catch (error) {
    return errorJson(error);
  }
}

async function listOfficialReviews(store) {
  const bracket = await getOrCreateOfficialTournament(store, Date.now());
  return (bracket.matches || [])
    .filter((match) => match.roomStatus === 'review' || match.reportState === 'conflict')
    .map((match) => ({
      tournamentId: bracket.id,
      kind: bracket.kind,
      matchId: match.id,
      reportState: match.reportState,
      roomStatus: match.roomStatus,
      entryA: bracket.entries.find((entry) => entry.id === match.entryAId) || null,
      entryB: bracket.entries.find((entry) => entry.id === match.entryBId) || null
    }));
}

async function listPaidReviews(stores) {
  const listed = await stores.tournaments.list({ prefix: '' }).catch(() => ({ blobs: [] }));
  const ids = [...new Set((listed.blobs || [])
    .map((blob) => String(blob.key || '').replace(/\.json$/, ''))
    .filter((id) => id && id !== 'active'))];
  const brackets = await Promise.all(ids.map((id) => readPaidTournament(stores, id).catch(() => null)));
  const reviews = [];
  for (const bracket of brackets) {
    if (bracket?.kind !== 'paidOnline') continue;
    const rows = reviewRows(bracket);
    reviews.push(...rows);
    await Promise.all(rows.map((row) => {
      const match = bracket.matches.find((candidate) => candidate.id === row.matchId);
      const reason = row.reportState === 'conflict' ? 'conflicting_result_reports' : 'room_expired_no_arrivals';
      return notifyTournamentAdminReview(stores.email, bracket, match, reason).catch((error) => {
        console.warn('Paid tournament admin review email retry failed', error);
      });
    }));
  }
  return reviews;
}

function reviewRows(bracket) {
  return (bracket.matches || [])
    .filter((match) => match.roomStatus === 'review' || match.reportState === 'conflict')
    .map((match) => {
      const entryA = bracket.entries.find((entry) => entry.id === match.entryAId);
      const entryB = bracket.entries.find((entry) => entry.id === match.entryBId);
      return {
        tournamentId: bracket.id,
        kind: bracket.kind,
        matchId: match.id,
        reportState: match.reportState,
        roomStatus: match.roomStatus,
        entryA: entryA ? { id: entryA.id, displayName: entryA.displayName } : null,
        entryB: entryB ? { id: entryB.id, displayName: entryB.displayName } : null
      };
    });
}

function assertAdmin(event) {
  const required = process.env.TOURNAMENT_ADMIN_TOKEN;
  if (!required && process.env.NODE_ENV !== 'production') return;
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '');
  if (required && token === required) return;
  throw Object.assign(new Error('Admin token required'), { statusCode: 401, code: 'admin_required' });
}
