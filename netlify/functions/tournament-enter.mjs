import {
  FREE_ONLINE_TOURNAMENT_ID,
  PAID_BTC_TOURNAMENT_ID,
  attachPaidInvoice,
  cleanId,
  cleanName,
  createPendingPaidEntry,
  enterFreeTournament,
  errorJson,
  getOrCreateFreeTournament,
  getOrCreatePaidTournament,
  getTournamentStore,
  json,
  readTournament,
  writeTournament
} from './_tournament-store.mjs';
import { createEntryInvoice } from './_btcpay.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const kind = body.kind === 'paidOnline' ? 'paidOnline' : body.kind === 'freeOnline' ? 'freeOnline' : '';
    const playerId = cleanId(body.playerId);
    const characterId = cleanId(body.characterId);
    const displayName = cleanName(body.displayName);
    if (!kind || !playerId || !characterId) return json(400, { error: 'missing_fields' });

    const store = getTournamentStore(event);
    if (kind === 'paidOnline' || body.tournamentId === PAID_BTC_TOURNAMENT_ID) {
      const current = await getOrCreatePaidTournament(store);
      const latest = await readTournament(store, PAID_BTC_TOURNAMENT_ID).then((value) => value || current);
      const pending = createPendingPaidEntry(latest, { playerId, displayName, characterId }, Date.now());
      if (pending.entry.paymentState === 'paid' || pending.entry.paymentState === 'entryLocked') {
        await writeTournament(store, pending.bracket);
        return json(200, { bracket: pending.bracket, entry: pending.entry });
      }
      if (pending.entry.checkoutUrl && pending.entry.paymentInvoiceId) {
        await writeTournament(store, pending.bracket);
        return json(200, { bracket: pending.bracket, entry: pending.entry, checkoutUrl: pending.entry.checkoutUrl });
      }
      const invoice = await createEntryInvoice({
        tournamentId: pending.bracket.id,
        entryId: pending.entry.id,
        playerId,
        displayName,
        characterId
      });
      const invoiced = attachPaidInvoice(pending.bracket, pending.entry.id, invoice, Date.now());
      await writeTournament(store, invoiced.bracket);
      return json(200, { bracket: invoiced.bracket, entry: invoiced.entry, checkoutUrl: invoice.checkoutUrl });
    }

    const current = await getOrCreateFreeTournament(store);
    const latest = await readTournament(store, FREE_ONLINE_TOURNAMENT_ID).then((value) => value || current);
    const result = enterFreeTournament(latest, { playerId, displayName, characterId }, Date.now());
    await writeTournament(store, result.bracket);
    return json(200, result);
  } catch (error) {
    return errorJson(error);
  }
}
