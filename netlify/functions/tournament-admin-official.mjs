import { errorJson, json } from './_tournament-store.mjs';
import { getOfficialTournamentStore, getOrCreateOfficialTournament, officialSummary, updateOfficialEventAdmin } from './_official-tournament-store.mjs';

export async function handler(event) {
  try {
    assertAdmin(event);
    const store = getOfficialTournamentStore(event);
    if (event.httpMethod === 'GET') {
      const tournament = await getOrCreateOfficialTournament(store, Date.now());
      return json(200, { tournament, summary: officialSummary(tournament) });
    }
    if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
    const body = JSON.parse(event.body || '{}');
    const tournament = await updateOfficialEventAdmin(store, String(body.action || ''), body, Date.now());
    return json(200, { tournament, summary: officialSummary(tournament) });
  } catch (error) {
    return errorJson(error);
  }
}

function assertAdmin(event) {
  const required = process.env.TOURNAMENT_ADMIN_TOKEN;
  if (!required && process.env.NODE_ENV !== 'production') return;
  const header = event.headers?.authorization || event.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '');
  if (required && token === required) return;
  throw Object.assign(new Error('Admin token required'), { statusCode: 401, code: 'admin_required' });
}
