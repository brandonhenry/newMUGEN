const DEFAULT_ENTRY_USD = 2;
const DEFAULT_PRIZES_USD = { 1: 15, 2: 10, 3: 5 };

export function lnbitsConfigured() {
  return Boolean(
    process.env.TOURNAMENT_PAID_ENABLED === 'true' &&
    process.env.TOURNAMENT_LIGHTNING_PROVIDER === 'lnbits' &&
    process.env.TOURNAMENT_PUBLIC_BASE_URL &&
    process.env.LNBITS_URL &&
    process.env.LNBITS_INVOICE_KEY &&
    process.env.LNBITS_ADMIN_KEY &&
    process.env.LNBITS_WEBHOOK_SECRET
  );
}

export function lnbitsConfig() {
  const url = normalizeUrl(process.env.LNBITS_URL);
  const invoiceKey = cleanString(process.env.LNBITS_INVOICE_KEY);
  const adminKey = cleanString(process.env.LNBITS_ADMIN_KEY);
  const webhookSecret = cleanString(process.env.LNBITS_WEBHOOK_SECRET);
  const publicBaseUrl = normalizeUrl(process.env.TOURNAMENT_PUBLIC_BASE_URL);
  if (!url || !invoiceKey || !adminKey || !webhookSecret || !publicBaseUrl) {
    throw Object.assign(new Error('LNbits is not configured'), {
      statusCode: 500,
      code: 'lnbits_not_configured'
    });
  }
  return { url, invoiceKey, adminKey, webhookSecret, publicBaseUrl };
}

export function paidTournamentConfig() {
  return {
    entryUsd: cleanMoney(process.env.ENTRY_USD, DEFAULT_ENTRY_USD),
    prizeUsd: {
      1: cleanMoney(process.env.PRIZE_1_USD, DEFAULT_PRIZES_USD[1]),
      2: cleanMoney(process.env.PRIZE_2_USD, DEFAULT_PRIZES_USD[2]),
      3: cleanMoney(process.env.PRIZE_3_USD, DEFAULT_PRIZES_USD[3])
    },
    maxPlayers: Math.max(2, Math.round(Number(process.env.PAID_TOURNAMENT_MAX_PLAYERS) || 25)),
    maxAutoPayoutSats: Math.max(0, Math.round(Number(process.env.MAX_AUTO_PAYOUT_SATS) || 50_000))
  };
}

export async function usdToSats(usd) {
  const { url, invoiceKey } = lnbitsConfig();
  const lnbitsAttempts = [
    { from: 'USD', to: 'sat', amount: usd },
    { from: 'USD', to: 'sats', amount: usd }
  ];
  for (const body of lnbitsAttempts) {
    const payload = await lnbitsFetch('/api/v1/conversion', {
      method: 'POST',
      headers: { 'x-api-key': invoiceKey },
      body: JSON.stringify(body)
    }, { url, tolerateError: true });
    const sats = satsFromConversionPayload(payload);
    if (sats > 0) return sats;
  }

  const btcUsd = await fetchBtcUsdRate();
  const sats = Math.floor((Number(usd) / btcUsd) * 100_000_000);
  if (!Number.isFinite(sats) || sats <= 0) {
    throw Object.assign(new Error('Could not convert USD entry fee to sats'), {
      statusCode: 502,
      code: 'lnbits_conversion_failed',
      btcUsd
    });
  }
  return sats;
}

export async function createEntryInvoice({ tournamentId, entryId, playerId, amountSats }) {
  const { url, invoiceKey, webhookSecret, publicBaseUrl } = lnbitsConfig();
  const webhook = `${publicBaseUrl}/.netlify/functions/lnbits-webhook?token=${encodeURIComponent(webhookSecret)}`;
  const payload = await lnbitsFetch('/api/v1/payments', {
    method: 'POST',
    headers: { 'x-api-key': invoiceKey },
    body: JSON.stringify({
      out: false,
      amount: amountSats,
      memo: `KORE Lightning tournament entry ${tournamentId}`,
      webhook,
      expiry: 900,
      extra: {
        type: 'kore_tournament_entry',
        tournamentId,
        entryId,
        playerId
      }
    })
  }, { url });
  const checkingId = cleanString(payload.checking_id || payload.checkingId || payload.payment_hash);
  const paymentRequest = cleanString(payload.payment_request || payload.bolt11);
  if (!checkingId || !paymentRequest) {
    throw Object.assign(new Error('LNbits invoice response was missing checking id or payment request'), {
      statusCode: 502,
      code: 'lnbits_invoice_incomplete',
      payload
    });
  }
  return {
    checkingId,
    paymentHash: cleanString(payload.payment_hash),
    paymentRequest,
    lightningUrl: `lightning:${paymentRequest}`,
    raw: payload
  };
}

export async function checkPayment(checkingId) {
  const { url, invoiceKey } = lnbitsConfig();
  return lnbitsFetch(`/api/v1/payments/${encodeURIComponent(checkingId)}`, {
    method: 'GET',
    headers: { 'x-api-key': invoiceKey }
  }, { url });
}

export async function payWinnerInvoice(bolt11) {
  const { url, adminKey } = lnbitsConfig();
  const payload = await lnbitsFetch('/api/v1/payments', {
    method: 'POST',
    headers: { 'x-api-key': adminKey },
    body: JSON.stringify({ out: true, bolt11 })
  }, { url });
  return {
    checkingId: cleanString(payload.checking_id || payload.checkingId || payload.payment_hash),
    paymentHash: cleanString(payload.payment_hash),
    raw: payload
  };
}

export function paymentIsPaid(payload) {
  if (payload?.paid === true) return true;
  const status = cleanString(payload?.details?.status || payload?.status).toLowerCase();
  return status === 'success' || status === 'paid' || status === 'complete' || status === 'completed';
}

async function lnbitsFetch(path, init, { url, tolerateError = false }) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    if (tolerateError) return { __lnbitsError: true, status: response.status, payload };
    throw Object.assign(new Error(payload?.message || payload?.detail || payload?.error || `LNbits request failed: ${response.status}`), {
      statusCode: 502,
      code: 'lnbits_request_failed',
      lnbitsStatus: response.status,
      payload
    });
  }
  return payload;
}

function satsFromConversionPayload(payload) {
  if (!payload || payload.__lnbitsError) return 0;
  const raw = payload.result ?? payload.sats ?? payload.sat ?? payload.amount;
  const sats = Math.floor(Number(raw));
  return Number.isFinite(sats) && sats > 0 ? sats : 0;
}

async function fetchBtcUsdRate() {
  const configured = Number(process.env.BTC_USD_RATE);
  if (Number.isFinite(configured) && configured > 0) return configured;

  const providers = [
    async () => {
      const payload = await fetchJson('https://mempool.space/api/v1/prices');
      return Number(payload?.USD);
    },
    async () => {
      const payload = await fetchJson('https://api.coinbase.com/v2/exchange-rates?currency=BTC');
      return Number(payload?.data?.rates?.USD);
    }
  ];
  const errors = [];
  for (const provider of providers) {
    try {
      const rate = await provider();
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw Object.assign(new Error('Could not fetch BTC/USD rate for Lightning invoice'), {
    statusCode: 502,
    code: 'btc_usd_rate_unavailable',
    errors
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { method: 'GET' });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `Rate request failed: ${response.status}`);
  }
  return payload;
}

function cleanMoney(value, fallback) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function normalizeUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}
