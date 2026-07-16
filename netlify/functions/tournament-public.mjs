import { cleanId, errorJson, getTournamentStore, json, readTournament } from './_tournament-store.mjs';
import { getPaidTournamentStores, readPaidTournament } from './_paid-tournament-store.mjs';
import { deriveTournamentSlug, sanitizePublicTournament } from './_tournament-public.mjs';
import {
  getOfficialTournamentStore,
  isOfficialTournamentId,
  officialPublicView,
  readOfficialTournament
} from './_official-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });
  try {
    const slug = cleanId(event.queryStringParameters?.slug);
    if (!slug) return json(400, { error: 'missing_tournament_slug' });
    if (isOfficialTournamentId(slug)) {
      const official = await readOfficialTournament(getOfficialTournamentStore(event), slug);
      if (!official) return json(404, { error: 'tournament_not_found' });
      return json(200, { tournament: officialPublicView(official) });
    }
    const freeStore = getTournamentStore(event);
    const paidStores = getPaidTournamentStores(event);
    const bracket = await findTournament(freeStore, paidStores, slug);
    if (!bracket) return json(404, { error: 'tournament_not_found' });
    return json(200, { tournament: sanitizePublicTournament(bracket) });
  } catch (error) {
    return errorJson(error);
  }
}

async function findTournament(freeStore, paidStores, slug) {
  const directFree = await readTournament(freeStore, slug);
  if (directFree) return directFree;
  const directPaid = await readPaidTournament(paidStores, slug);
  if (directPaid) return directPaid;
  const [freeList, paidList] = await Promise.all([
    freeStore.list({ prefix: 'tournaments/' }).catch(() => ({ blobs: [] })),
    paidStores.tournaments.list({ prefix: 'tournaments/' }).catch(() => ({ blobs: [] }))
  ]);
  const ids = [...freeList.blobs.map((blob) => String(blob.key).replace(/^tournaments\//, '')), ...paidList.blobs.map((blob) => String(blob.key).replace(/^tournaments\//, ''))]
    .filter((id) => id && id.endsWith('.json') === false);
  for (const id of [...new Set(ids)].slice(-200).reverse()) {
    const bracket = await readTournament(freeStore, id) || await readPaidTournament(paidStores, id);
    if (bracket && deriveTournamentSlug(bracket) === slug) return bracket;
  }
  return null;
}
