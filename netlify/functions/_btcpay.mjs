import crypto from 'node:crypto';

const ENTRY_FEE_USD = '2.00';

export function btcpayConfigured() {
  return Boolean(
    process.env.TOURNAMENT_PAID_ENABLED === 'true' &&
    process.env.TOURNAMENT_BTC_PROVIDER === 'btcpay' &&
    process.env.BTCPAY_INSTANCE_URL &&
    process.env.BTCPAY_STORE_ID &&
    process.env.BTCPAY_API_KEY
  );
}

export function btcpayConfig() {
  const instanceUrl = normalizeInstanceUrl(process.env.BTCPAY_INSTANCE_URL);
  const storeId = process.env.BTCPAY_STORE_ID;
  const apiKey = process.env.BTCPAY_API_KEY;
  if (!instanceUrl || !storeId || !apiKey) {
    throw Object.assign(new Error('BTCPay Server is not configured'), {
      statusCode: 500,
      code: 'btcpay_not_configured'
    });
  }
  return { instanceUrl, storeId, apiKey };
}

export async function createEntryInvoice({ tournamentId, entryId, playerId, displayName, characterId }) {
  const { instanceUrl, storeId, apiKey } = btcpayConfig();
  const orderId = `${tournamentId}:${entryId}`;
  const redirectBase = normalizeInstanceUrl(process.env.TOURNAMENT_PUBLIC_BASE_URL);
  const payload = {
    amount: ENTRY_FEE_USD,
    currency: 'USD',
    checkout: {
      redirectURL: redirectBase ? `${redirectBase}/?tournament=${encodeURIComponent(tournamentId)}` : undefined,
      redirectAutomatically: false
    },
    metadata: {
      orderId,
      itemDesc: 'KORE Paid BTC Tournament Entry',
      buyerName: displayName,
      tournamentId,
      entryId,
      playerId,
      characterId
    }
  };
  const invoice = await btcpayFetch(`/api/v1/stores/${encodeURIComponent(storeId)}/invoices`, {
    method: 'POST',
    body: JSON.stringify(stripUndefined(payload))
  }, { instanceUrl, apiKey });
  const invoiceId = cleanString(invoice.id || invoice.invoiceId);
  if (!invoiceId) {
    throw Object.assign(new Error('BTCPay invoice response did not include an id'), {
      statusCode: 502,
      code: 'btcpay_invoice_missing_id'
    });
  }
  return {
    invoiceId,
    checkoutUrl: cleanString(invoice.checkoutLink || invoice.invoiceUrl || invoice.url) || `${instanceUrl}/i/${invoiceId}`,
    raw: invoice
  };
}

export async function getInvoice(invoiceId) {
  const { instanceUrl, storeId, apiKey } = btcpayConfig();
  return btcpayFetch(`/api/v1/stores/${encodeURIComponent(storeId)}/invoices/${encodeURIComponent(invoiceId)}`, {
    method: 'GET'
  }, { instanceUrl, apiKey });
}

export function verifyBtcpayWebhook(rawBody, signatureHeader) {
  const secret = process.env.BTCPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw Object.assign(new Error('BTCPay webhook secret is not configured'), {
      statusCode: 500,
      code: 'btcpay_webhook_secret_missing'
    });
  }
  const checksum = Buffer.from(String(signatureHeader || ''), 'utf8');
  const digest = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody || '').digest('hex')}`, 'utf8');
  if (checksum.length !== digest.length || !crypto.timingSafeEqual(digest, checksum)) {
    throw Object.assign(new Error('Invalid BTCPay webhook signature'), {
      statusCode: 401,
      code: 'invalid_btcpay_signature'
    });
  }
  return true;
}

export function isPaidInvoiceEvent(payload, invoice) {
  const type = cleanString(payload?.type).toLowerCase();
  const status = cleanString(invoice?.status || payload?.status).toLowerCase();
  return (
    type.includes('settled') ||
    type.includes('processing') ||
    type.includes('paid') ||
    status === 'settled' ||
    status === 'processing'
  );
}

export function isExpiredInvoiceEvent(payload, invoice) {
  const type = cleanString(payload?.type).toLowerCase();
  const status = cleanString(invoice?.status || payload?.status).toLowerCase();
  return type.includes('expired') || type.includes('invalid') || status === 'expired' || status === 'invalid';
}

function btcpayFetch(path, init, { instanceUrl, apiKey }) {
  return fetch(`${instanceUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `token ${apiKey}`,
      ...(init.headers || {})
    }
  }).then(async (response) => {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw Object.assign(new Error(payload?.message || payload?.error || `BTCPay request failed: ${response.status}`), {
        statusCode: 502,
        code: 'btcpay_request_failed',
        btcpayStatus: response.status,
        payload
      });
    }
    return payload;
  });
}

function normalizeInstanceUrl(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\/+$/, '');
}

function cleanString(value) {
  return typeof value === 'string' ? value : '';
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
  );
}
