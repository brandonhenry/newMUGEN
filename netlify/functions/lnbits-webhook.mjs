import {
  confirmPaidEntryByCheckingId,
  errorJson,
  getPaidTournamentStores,
  json
} from './_paid-tournament-store.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const token = event.queryStringParameters?.token || '';
    if (!process.env.LNBITS_WEBHOOK_SECRET || token !== process.env.LNBITS_WEBHOOK_SECRET) {
      return json(401, { error: 'invalid_webhook_token' });
    }
    const body = JSON.parse(event.body || '{}');
    const checkingId = cleanCheckingId(body.checking_id || body.checkingId || body.payment_hash || body.paymentHash);
    if (!checkingId) return json(400, { error: 'missing_checking_id' });
    const result = await confirmPaidEntryByCheckingId(getPaidTournamentStores(event), checkingId, Date.now());
    return json(200, {
      ok: true,
      paid: result.paid,
      paymentState: result.entry?.paymentState,
      tournamentStatus: result.bracket?.status
    });
  } catch (error) {
    return errorJson(error);
  }
}

function cleanCheckingId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}
