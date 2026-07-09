import { getBlobStore } from './_blob-store.mjs';

export const TOURNAMENT_EMAIL_STORE_NAME = 'kore-tournament-email-reminders';
const RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'KORE <hello@playkore.com>';
const DEFAULT_ADMIN_REVIEW_EMAIL = 'thetekkentrainer@gmail.com';
const ADMIN_REVIEW_EMAIL_MAX_ATTEMPTS = 3;

export function getTournamentEmailStore(event) {
  return getBlobStore(TOURNAMENT_EMAIL_STORE_NAME, event);
}

export function cleanEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase().replace(/\s+/g, '').slice(0, 254);
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email)) return '';
  if (email.includes('..')) return '';
  return email;
}

export async function saveTournamentEmailSubscription(store, request, now = Date.now()) {
  const playerId = cleanId(request.playerId);
  const displayName = cleanName(request.displayName);
  const email = cleanEmail(request.email);
  const tournamentId = cleanId(request.tournamentId);
  const entryId = cleanId(request.entryId);
  const kind = request.kind === 'paidOnline' ? 'paidOnline' : 'freeOnline';
  if (!playerId || !displayName || !email || !tournamentId || !entryId) {
    throw Object.assign(new Error('Invalid tournament reminder email'), { statusCode: 400, code: 'invalid_email_subscription' });
  }
  const subscription = {
    playerId,
    displayName,
    email,
    tournamentId,
    entryId,
    kind,
    remindersEnabled: true,
    updatedAt: now
  };
  await store.setJSON(subscriptionKey(playerId), subscription);
  await store.setJSON(emailIndexKey(email, playerId), { playerId, email, updatedAt: now });
  const emailSent = await sendTournamentEmail({
    to: email,
    subject: "You're signed up for KORE tournament reminders",
    html: confirmationHtml(displayName)
  });
  return { ok: true, email, emailSent, subscription };
}

export async function readTournamentEmailSubscription(store, playerId) {
  const cleanPlayerId = cleanId(playerId);
  if (!cleanPlayerId) return null;
  const subscription = await store.get(subscriptionKey(cleanPlayerId), { type: 'json' }).catch(() => null);
  const email = cleanEmail(subscription?.email);
  return subscription?.remindersEnabled && email ? { ...subscription, email } : null;
}

export async function notifyTournamentReady(store, bracket, now = Date.now()) {
  if (!bracket || bracket.status === 'open') return { sent: 0, skipped: 0 };
  let sent = 0;
  let skipped = 0;
  for (const entry of bracket.entries || []) {
    const playerId = cleanId(entry.playerId);
    if (!playerId || entry.isBot || entry.isCpu) {
      skipped += 1;
      continue;
    }
    const subscription = await store.get(subscriptionKey(playerId), { type: 'json' }).catch(() => null);
    const email = cleanEmail(subscription?.email);
    if (!subscription?.remindersEnabled || !email) {
      skipped += 1;
      continue;
    }
    const notificationKey = readyNotificationKey(bracket.id, playerId);
    const existing = await store.get(notificationKey, { type: 'json' }).catch(() => null);
    if (existing?.sentAt || existing?.attemptedAt) {
      skipped += 1;
      continue;
    }
    const emailSent = await sendTournamentEmail({
      to: email,
      subject: 'Your KORE tournament is ready',
      html: readyHtml(subscription.displayName || entry.displayName || 'Player', bracket)
    });
    await store.setJSON(notificationKey, {
      tournamentId: bracket.id,
      playerId,
      email,
      emailSent,
      attemptedAt: now,
      sentAt: emailSent ? now : undefined
    });
    if (emailSent) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}

export async function notifyTournamentAdminReview(store, bracket, match, reason = 'manual_review_needed', now = Date.now()) {
  if (!store || bracket?.kind !== 'paidOnline' || !match?.id) return { emailSent: false, skipped: true };
  const adminEmail = cleanEmail(process.env.TOURNAMENT_ADMIN_REVIEW_EMAIL || DEFAULT_ADMIN_REVIEW_EMAIL);
  if (!adminEmail) return { emailSent: false, skipped: true };
  const notificationKey = adminReviewNotificationKey(bracket.id, match.id, reason);
  const existing = await store.get(notificationKey, { type: 'json' }).catch(() => null);
  if (existing?.state === 'sent' || existing?.sentAt) return { emailSent: false, skipped: true };
  const attempts = Number(existing?.attempts || 0);
  if (attempts >= ADMIN_REVIEW_EMAIL_MAX_ATTEMPTS) return { emailSent: false, skipped: true, attempts };
  await store.setJSON(notificationKey, {
    ...(existing || {}),
    tournamentId: bracket.id,
    matchId: match.id,
    reason,
    email: adminEmail,
    state: 'pending',
    attempts,
    updatedAt: now
  });
  const emailSent = await sendTournamentEmail({
    to: adminEmail,
    subject: 'KORE prizepool tournament needs review',
    html: adminReviewHtml(bracket, match, reason)
  }).catch((error) => {
    console.warn('Prizepool admin review email send failed', error);
    return false;
  });
  await store.setJSON(notificationKey, {
    ...(existing || {}),
    tournamentId: bracket.id,
    matchId: match.id,
    reason,
    email: adminEmail,
    state: emailSent ? 'sent' : 'failed',
    attempts: attempts + 1,
    emailSent,
    attemptedAt: now,
    lastAttemptAt: now,
    sentAt: emailSent ? now : undefined
  });
  return { emailSent, skipped: false, attempts: attempts + 1 };
}

export async function sendTournamentEmail({ to, subject, html }) {
  const apiKey = cleanString(process.env.RESEND_API_KEY);
  const email = cleanEmail(to);
  if (!apiKey || !email) return false;
  const response = await fetch(RESEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [email],
      subject,
      html
    })
  });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw Object.assign(new Error(message || `Resend failed: ${response.status}`), { statusCode: 502, code: 'email_send_failed' });
  }
  return true;
}

function confirmationHtml(displayName) {
  return `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#101114"><h1>KORE tournament reminders are on</h1><p>${escapeHtml(displayName)}, we'll email you when tournament entries or your bracket need attention.</p><p>Use the same device you entered with when you return. Tournament rooms are tied to that device for security.</p><p>See you in the arena.</p></div>`;
}

function readyHtml(displayName, bracket) {
  const label = bracket.kind === 'paidOnline' ? 'Prizepool tournament' : 'Online tournament';
  return `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#101114"><h1>Your KORE tournament is ready</h1><p>${escapeHtml(displayName)}, your ${escapeHtml(label)} bracket is live.</p><p>Open KORE on the same device you used to enter, then head to Tournament to play your match. If you use a different device, you may not be able to enter your assigned room.</p></div>`;
}

function adminReviewHtml(bracket, match, reason) {
  const entryA = (bracket.entries || []).find((entry) => entry.id === match.entryAId);
  const entryB = (bracket.entries || []).find((entry) => entry.id === match.entryBId);
  const reportRows = Object.entries(match.resultReports || {})
    .map(([reporterEntryId, winnerEntryId]) => `<li>${escapeHtml(reporterEntryId)} reported ${escapeHtml(String(winnerEntryId))}</li>`)
    .join('');
  return `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#101114"><h1>KORE prizepool review needed</h1><p>A prizepool tournament match needs admin review.</p><ul><li>Tournament: ${escapeHtml(bracket.id)}</li><li>Match: ${escapeHtml(match.id)}</li><li>Reason: ${escapeHtml(reason)}</li><li>Room: ${escapeHtml(match.roomId || 'none')}</li><li>${escapeHtml(entryA?.displayName || match.entryAId || 'Entry A')} vs ${escapeHtml(entryB?.displayName || match.entryBId || 'Entry B')}</li></ul>${reportRows ? `<p>Reports:</p><ul>${reportRows}</ul>` : ''}<p>Open the KORE admin review panel and resolve the winner before prize payout.</p></div>`;
}

function subscriptionKey(playerId) {
  return `subscriptions/${cleanId(playerId)}.json`;
}

function emailIndexKey(email, playerId) {
  return `emails/${cleanEmail(email)}/${cleanId(playerId)}.json`;
}

function readyNotificationKey(tournamentId, playerId) {
  return `notifications/ready/${cleanId(tournamentId)}/${cleanId(playerId)}.json`;
}

function adminReviewNotificationKey(tournamentId, matchId, reason) {
  return `notifications/admin-review/${cleanId(tournamentId)}/${cleanId(matchId)}/${cleanId(reason) || 'review'}.json`;
}

function cleanId(value) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128) : '';
}

function cleanName(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) : '';
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}
