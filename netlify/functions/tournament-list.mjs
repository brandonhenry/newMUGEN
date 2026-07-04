import {
  getOrCreateFreeTournament,
  getTournamentStore,
  json,
  paidDisabledSummary,
  toSummary
} from './_tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    const store = getTournamentStore(event);
    const free = await getOrCreateFreeTournament(store);
    return json(200, { tournaments: [toSummary(free), paidDisabledSummary()] });
  } catch (error) {
    return json(500, { error: 'tournament_list_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
