import {
  errorJson,
  getTournamentStore,
  json,
  readTournament
} from './_tournament-store.mjs';
import {
  getPaidTournamentStores,
  readPaidTournament
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    assertAdmin(event);
    const free = await listFreeReviews(getTournamentStore(event));
    const paid = await listPaidReviews(getPaidTournamentStores(event));
    return json(200, { reviews: [...free, ...paid] });
  } catch (error) {
    return errorJson(error);
  }
}

async function listFreeReviews(store) {
  const listed = await store.list({ prefix: 'tournaments/' }).catch(() => ({ blobs: [] }));
  const ids = [...new Set((listed.blobs || [])
    .map((blob) => String(blob.key || '').replace(/^tournaments\//, ''))
    .filter((id) => id && id !== 'free-online-active.json'))];
  const brackets = await Promise.all(ids.map((id) => readTournament(store, id).catch(() => null)));
  return brackets.flatMap((bracket) => bracket?.kind === 'freeOnline' ? reviewRows(bracket) : []);
}

async function listPaidReviews(stores) {
  const listed = await stores.tournaments.list({ prefix: '' }).catch(() => ({ blobs: [] }));
  const ids = [...new Set((listed.blobs || [])
    .map((blob) => String(blob.key || '').replace(/\.json$/, ''))
    .filter((id) => id && id !== 'active'))];
  const brackets = await Promise.all(ids.map((id) => readPaidTournament(stores, id).catch(() => null)));
  return brackets.flatMap((bracket) => bracket?.kind === 'paidOnline' ? reviewRows(bracket) : []);
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
