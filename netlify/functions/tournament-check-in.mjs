import { errorJson, json } from './_tournament-store.mjs';
import { checkInOfficialTournament, getOfficialTournamentStore } from './_official-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    return json(200, await checkInOfficialTournament(getOfficialTournamentStore(event), body, Date.now()));
  } catch (error) {
    return errorJson(error);
  }
}
