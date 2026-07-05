import {
  errorJson,
  expirePaidInvoice,
  getTournamentStore,
  json,
  PAID_BTC_TOURNAMENT_ID,
  processPaidInvoice,
  readTournament,
  writeTournament,
  confirmPaidInvoice
} from './_tournament-store.mjs';
import {
  classifyInvoiceEvent,
  getInvoice,
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
    assertInvoiceIdMatches(invoiceId, invoice);
    const tournamentId = invoice?.metadata?.tournamentId || payload?.metadata?.tournamentId || PAID_BTC_TOURNAMENT_ID;
    const store = getTournamentStore(event);
    const bracket = await readTournament(store, tournamentId);
    if (!bracket) return json(404, { error: 'tournament_not_found' });
    assertInvoiceMatchesBracket(bracket, invoiceId, invoice, payload);
    const eventClass = classifyInvoiceEvent(payload, invoice);

    if (eventClass === 'settled') {
      const result = confirmPaidInvoice(bracket, invoiceId, Date.now());
      await writeTournament(store, result.bracket);
      return json(200, { ok: true, paymentState: result.entry.paymentState, tournamentStatus: result.bracket.status });
    }

    if (eventClass === 'processing') {
      const result = processPaidInvoice(bracket, invoiceId, Date.now());
      await writeTournament(store, result.bracket);
      return json(200, { ok: true, paymentState: result.entry.paymentState, tournamentStatus: result.bracket.status });
    }

    if (eventClass === 'expired' || eventClass === 'invalid') {
      const result = expirePaidInvoice(bracket, invoiceId, eventClass, Date.now());
      await writeTournament(store, result.bracket);
      return json(200, { ok: true, paymentState: result.entry?.paymentState ?? 'unchanged', tournamentStatus: result.bracket.status });
    }

    return json(200, { ok: true, ignored: true });
  } catch (error) {
    return errorJson(error);
  }
}

function assertInvoiceIdMatches(invoiceId, invoice) {
  const returnedId = invoice?.id || invoice?.invoiceId;
  if (returnedId && returnedId !== invoiceId) {
    throw Object.assign(new Error('BTCPay invoice id mismatch'), {
      statusCode: 409,
      code: 'btcpay_invoice_id_mismatch'
    });
  }
}

function assertInvoiceMatchesBracket(bracket, invoiceId, invoice, payload) {
  const metadata = { ...(payload?.metadata || {}), ...(invoice?.metadata || {}) };
  if (metadata.tournamentId && metadata.tournamentId !== bracket.id) {
    throw Object.assign(new Error('BTCPay invoice tournament mismatch'), {
      statusCode: 409,
      code: 'btcpay_tournament_mismatch'
    });
  }
  const matchingEntry = metadata.entryId
    ? bracket.entries.find((entry) => entry.id === metadata.entryId)
    : bracket.entries.find((entry) => entry.paymentInvoiceId === invoiceId);
  if (!matchingEntry || matchingEntry.paymentInvoiceId !== invoiceId) {
    throw Object.assign(new Error('BTCPay invoice entry mismatch'), {
      statusCode: 409,
      code: 'btcpay_entry_mismatch'
    });
  }
}
