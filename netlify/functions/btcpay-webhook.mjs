import {
  errorJson,
  expirePaidInvoice,
  getTournamentStore,
  json,
  PAID_BTC_TOURNAMENT_ID,
  readTournament,
  writeTournament,
  confirmPaidInvoice
} from './_tournament-store.mjs';
import {
  getInvoice,
  isExpiredInvoiceEvent,
  isPaidInvoiceEvent,
  verifyBtcpayWebhook
} from './_btcpay.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : Buffer.from(event.body || '', 'utf8');
    verifyBtcpayWebhook(rawBody, event.headers?.['btcpay-sig'] || event.headers?.['BTCPay-Sig'] || event.headers?.['BTCPAY-SIG']);
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const invoiceId = payload.invoiceId || payload.id;
    if (!invoiceId) return json(400, { error: 'missing_invoice_id' });
    const invoice = await getInvoice(invoiceId);
    const tournamentId = invoice?.metadata?.tournamentId || payload?.metadata?.tournamentId || PAID_BTC_TOURNAMENT_ID;
    const store = getTournamentStore(event);
    const bracket = await readTournament(store, tournamentId);
    if (!bracket) return json(404, { error: 'tournament_not_found' });

    if (isPaidInvoiceEvent(payload, invoice)) {
      const result = confirmPaidInvoice(bracket, invoiceId, Date.now());
      await writeTournament(store, result.bracket);
      return json(200, { ok: true, paymentState: result.entry.paymentState, tournamentStatus: result.bracket.status });
    }

    if (isExpiredInvoiceEvent(payload, invoice)) {
      const result = expirePaidInvoice(bracket, invoiceId, String(invoice?.status || payload?.type).toLowerCase().includes('invalid') ? 'invalid' : 'expired', Date.now());
      await writeTournament(store, result.bracket);
      return json(200, { ok: true, paymentState: result.entry?.paymentState ?? 'unchanged', tournamentStatus: result.bracket.status });
    }

    return json(200, { ok: true, ignored: true });
  } catch (error) {
    return errorJson(error);
  }
}
