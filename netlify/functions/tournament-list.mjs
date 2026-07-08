import {
  freeTournamentActivitySummary,
  getOrCreateFreeTournament,
  getTournamentStore,
  json,
  toSummary
} from './_tournament-store.mjs';
import {
  getPaidTournamentStores,
  paidDisabledSummary,
  paidEnabled,
  paidSummaryWithStores
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    const store = getTournamentStore(event);
    const free = await getOrCreateFreeTournament(store);
    const freeActivity = await freeTournamentActivitySummary(store, free);
    const paid = paidEnabled() ? await paidSummaryWithStores(getPaidTournamentStores(event)) : paidDisabledSummary();
    return json(200, { tournaments: [{ ...toSummary(free), ...freeActivity }, paid] });
  } catch (error) {
    return json(500, { error: 'tournament_list_failed', message: error instanceof Error ? error.message : String(error) });
  }
}
