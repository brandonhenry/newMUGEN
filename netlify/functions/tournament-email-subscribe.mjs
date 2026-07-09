import { errorJson, json } from './_tournament-store.mjs';
import { getTournamentEmailStore, saveTournamentEmailSubscription } from './_tournament-email.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const result = await saveTournamentEmailSubscription(getTournamentEmailStore(event), body, Date.now());
    return json(200, {
      ok: true,
      email: result.email,
      emailSent: result.emailSent
    });
  } catch (error) {
    return errorJson(error);
  }
}
