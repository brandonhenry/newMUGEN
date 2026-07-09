import { errorJson, json } from './_tournament-store.mjs';
import { confirmPaidTournamentRecovery, getPaidTournamentStores } from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    return json(200, await confirmPaidTournamentRecovery(getPaidTournamentStores(event), body, Date.now()));
  } catch (error) {
    return errorJson(error);
  }
}
