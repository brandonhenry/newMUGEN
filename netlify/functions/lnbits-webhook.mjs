import {
  confirmPaidEntryByCheckingId,
  errorJson,
  getPaidTournamentStores,
  json
} from './_paid-tournament-store.mjs';
import { captureServerAnalytics, captureTournamentOperationFailure } from './_posthog-analytics.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  let analyticsBody = {};
  try {
    const token = event.queryStringParameters?.token || '';
    if (!process.env.LNBITS_WEBHOOK_SECRET || token !== process.env.LNBITS_WEBHOOK_SECRET) {
      return json(401, { error: 'invalid_webhook_token' });
    }
    const body = parseWebhookBody(event);
    analyticsBody = body;
    const checkingId = cleanCheckingId(
      findWebhookIdentifier(body) ||
      event.queryStringParameters?.checking_id ||
      event.queryStringParameters?.checkingId ||
      event.queryStringParameters?.payment_hash ||
      event.queryStringParameters?.paymentHash
    );
    if (!checkingId) return json(400, { error: 'missing_checking_id' });
    const result = await confirmPaidEntryByCheckingId(getPaidTournamentStores(event), checkingId, Date.now());
    if (result.paid && result.entry && result.bracket) {
      await captureServerAnalytics('tournament_payment_confirmed', {
        eventId: `tournament-payment:${result.bracket.id}:${result.entry.id}`,
        distinctId: result.entry.playerId,
        properties: {
          tournament_id: result.bracket.id,
          entry_id: result.entry.id,
          payment_state: result.entry.paymentState,
          confirmed: true
        }
      });
    }
    return json(200, {
      ok: true,
      paid: result.paid,
      paymentState: result.entry?.paymentState,
      tournamentStatus: result.bracket?.status
    });
  } catch (error) {
    await captureTournamentOperationFailure('payment_confirmation', analyticsBody, error);
    return errorJson(error);
  }
}

function parseWebhookBody(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function findWebhookIdentifier(value, depth = 0) {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') {
    const exact = cleanCheckingId(value);
    if (exact && /^[a-f0-9]{32,}$/i.test(exact)) return exact;
    return value.match(/[a-f0-9]{32,}/i)?.[0] || '';
  }
  if (typeof value !== 'object') return '';
  const directKeys = ['checking_id', 'checkingId', 'payment_hash', 'paymentHash'];
  for (const key of directKeys) {
    const found = findWebhookIdentifier(value[key], depth + 1);
    if (found) return found;
  }
  for (const key of ['details', 'payment', 'data', 'payload', 'event', 'extra']) {
    const found = findWebhookIdentifier(value[key], depth + 1);
    if (found) return found;
  }
  for (const nested of Object.values(value)) {
    const found = findWebhookIdentifier(nested, depth + 1);
    if (found) return found;
  }
  return '';
}

function cleanCheckingId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 160) : '';
}
