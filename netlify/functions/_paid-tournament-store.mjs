import { getBlobStore } from './_blob-store.mjs';
import {
  assignedMatch,
  cleanId,
  cleanName,
  errorJson,
  generateOnlineBracket,
  json,
  reportWinner
} from './_tournament-store.mjs';
import {
  checkPayment,
  createEntryInvoice,
  lnbitsConfigured,
  paidTournamentConfig,
  payWinnerInvoice,
  paymentIsPaid,
  usdToSats
} from './_lnbits.mjs';

export const PAID_LIGHTNING_TOURNAMENT_ID = 'paid-lightning-beta';
const TOURNAMENT_STORE_NAME = 'kore-paid-tournaments';
const ENTRY_STORE_NAME = 'kore-paid-entries';
const CHECKING_STORE_NAME = 'kore-paid-checking-ids';
const PAYOUT_STORE_NAME = 'kore-paid-payouts';
const LEDGER_STORE_NAME = 'kore-paid-ledger-events';
const ACTIVE_KEY = 'active.json';

export function getPaidTournamentStores(event) {
  return {
    tournaments: getBlobStore(TOURNAMENT_STORE_NAME, event),
    entries: getBlobStore(ENTRY_STORE_NAME, event),
    checking: getBlobStore(CHECKING_STORE_NAME, event),
    payouts: getBlobStore(PAYOUT_STORE_NAME, event),
    ledger: getBlobStore(LEDGER_STORE_NAME, event)
  };
}

export function paidEnabled() {
  return lnbitsConfigured();
}

export function paidDisabledSummary() {
  const config = paidTournamentConfig();
  return {
    id: PAID_LIGHTNING_TOURNAMENT_ID,
    kind: 'paidOnline',
    status: paidEnabled() ? 'open' : 'cancelled',
    entryFeeUsd: config.entryUsd,
    entryFeeLabel: `$${formatUsd(config.entryUsd)} Lightning`,
    prizeLabel: `$${formatUsd(config.prizeUsd[1])} / $${formatUsd(config.prizeUsd[2])} / $${formatUsd(config.prizeUsd[3])} Lightning`,
    entries: 0,
    minEntries: config.maxPlayers,
    capacity: config.maxPlayers,
    paidEnabled: paidEnabled(),
    startsLabel: paidEnabled() ? 'Lightning beta configured' : 'Lightning beta unavailable'
  };
}

export function paidSummary(bracket) {
  const confirmed = confirmedPaidEntries(bracket);
  return {
    id: bracket.id,
    kind: 'paidOnline',
    status: bracket.status,
    entryFeeUsd: bracket.entryUsd,
    entryFeeLabel: `$${formatUsd(bracket.entryUsd)} Lightning`,
    prizeLabel: `$${formatUsd(bracket.prizeUsd?.[1] ?? 15)} / $${formatUsd(bracket.prizeUsd?.[2] ?? 10)} / $${formatUsd(bracket.prizeUsd?.[3] ?? 5)} Lightning`,
    entries: confirmed.length,
    minEntries: bracket.minEntries,
    capacity: bracket.capacity,
    paidEnabled: Boolean(bracket.paidEnabled),
    startsLabel: bracket.status === 'open' ? 'Starts when full' : bracket.status === 'roundActive' ? 'Bracket active' : 'Completed'
  };
}

export async function getOrCreatePaidTournament(stores, now = Date.now()) {
  const active = await stores.tournaments.get(ACTIVE_KEY, { type: 'json' }).catch(() => null);
  if (active?.id) {
    const bracket = await stores.tournaments.get(tournamentKey(active.id), { type: 'json' }).catch(() => null);
    if (bracket?.id) return sanitizePaidBracket(bracket);
  }
  const bracket = makeOpenPaidTournament(now);
  await writePaidTournament(stores, bracket);
  return bracket;
}

export function makeOpenPaidTournament(now = Date.now()) {
  const config = paidTournamentConfig();
  return {
    id: PAID_LIGHTNING_TOURNAMENT_ID,
    kind: 'paidOnline',
    status: 'open',
    entries: [],
    matches: [],
    currentRound: 1,
    capacity: config.maxPlayers,
    minEntries: config.maxPlayers,
    paidEnabled: paidEnabled(),
    entryUsd: config.entryUsd,
    prizeUsd: config.prizeUsd,
    prizeSats: {},
    createdAt: now,
    updatedAt: now,
    reward: { kind: 'lightningPending', label: `$${formatUsd(config.prizeUsd[1])} / $${formatUsd(config.prizeUsd[2])} / $${formatUsd(config.prizeUsd[3])} Lightning rewards`, state: 'locked' }
  };
}

export async function enterPaidTournament(stores, entryRequest, now = Date.now()) {
  if (!paidEnabled()) {
    throw Object.assign(new Error('Paid Lightning tournaments are not enabled yet'), { statusCode: 409, code: 'paid_tournament_unavailable' });
  }
  const bracket = await getOrCreatePaidTournament(stores, now);
  if (bracket.status !== 'open') {
    throw Object.assign(new Error('Tournament is already locked'), { statusCode: 409, code: 'tournament_locked' });
  }
  if (confirmedPaidEntries(bracket).length >= bracket.capacity) {
    throw Object.assign(new Error('Tournament is full'), { statusCode: 409, code: 'tournament_full' });
  }
  const playerId = cleanId(entryRequest.playerId);
  const existing = await readEntry(stores, bracket.id, playerId);
  if (existing && !['expired', 'invalid'].includes(existing.paymentState)) {
    return { bracket, entry: existing, reused: true };
  }
  const amountSats = await usdToSats(bracket.entryUsd);
  const entry = {
    id: `paid-${playerId}-${now}`,
    playerId,
    displayName: cleanName(entryRequest.displayName),
    characterId: cleanId(entryRequest.characterId),
    seed: 0,
    paymentState: 'invoicePending',
    paymentProvider: 'lnbits',
    amountSats,
    joinedAt: now
  };
  const invoice = await createEntryInvoice({
    tournamentId: bracket.id,
    entryId: entry.id,
    playerId,
    amountSats
  });
  const invoicedEntry = {
    ...entry,
    checkingId: invoice.checkingId,
    paymentInvoiceId: invoice.checkingId,
    paymentHash: invoice.paymentHash,
    paymentRequest: invoice.paymentRequest,
    lightningUrl: invoice.lightningUrl
  };
  const nextBracket = {
    ...bracket,
    entries: [...bracket.entries.filter((candidate) => candidate.playerId !== playerId), invoicedEntry],
    updatedAt: now
  };
  await writeEntry(stores, nextBracket.id, invoicedEntry);
  await stores.checking.setJSON(checkingKey(invoice.checkingId), { tournamentId: nextBracket.id, playerId, entryId: invoicedEntry.id, createdAt: now });
  await writeLedgerEvent(stores, 'entry_invoice_created', { tournamentId: nextBracket.id, playerId, entryId: invoicedEntry.id, checkingId: invoice.checkingId, amountSats }, now);
  await writePaidTournament(stores, nextBracket);
  return { bracket: nextBracket, entry: invoicedEntry, reused: false };
}

export async function confirmPaidEntryByCheckingId(stores, checkingId, now = Date.now()) {
  const index = await stores.checking.get(checkingKey(checkingId), { type: 'json' }).catch(() => null);
  if (!index?.tournamentId || !index?.playerId) {
    throw Object.assign(new Error('Paid entry not found for LNbits checking id'), { statusCode: 404, code: 'paid_entry_not_found' });
  }
  const payment = await checkPayment(checkingId);
  await writeLedgerEvent(stores, 'lnbits_webhook_checked', { checkingId, paid: paymentIsPaid(payment), raw: payment }, now);
  if (!paymentIsPaid(payment)) {
    const bracket = await readPaidTournament(stores, index.tournamentId);
    const entry = await readEntry(stores, index.tournamentId, index.playerId);
    return { bracket, entry, paid: false };
  }
  let bracket = await readPaidTournament(stores, index.tournamentId);
  let entry = await readEntry(stores, index.tournamentId, index.playerId);
  if (!bracket || !entry) throw Object.assign(new Error('Paid tournament entry not found'), { statusCode: 404, code: 'paid_entry_not_found' });
  if (entry.paymentState !== 'paid' && entry.paymentState !== 'entryLocked') {
    const seed = confirmedPaidEntries(bracket).length + 1;
    entry = { ...entry, paymentState: 'paid', seed, paidAt: now };
    bracket = {
      ...bracket,
      entries: bracket.entries.map((candidate) => candidate.id === entry.id ? entry : candidate),
      updatedAt: now
    };
  }
  if (bracket.status === 'open' && confirmedPaidEntries(bracket).length >= bracket.minEntries) {
    bracket = await lockPaidTournament(bracket, now);
  }
  await writeEntry(stores, bracket.id, entry);
  await writePaidTournament(stores, bracket);
  return { bracket, entry, paid: true };
}

export async function readPaidTournament(stores, tournamentId = PAID_LIGHTNING_TOURNAMENT_ID) {
  const bracket = await stores.tournaments.get(tournamentKey(tournamentId), { type: 'json' }).catch(() => null);
  return bracket?.id ? sanitizePaidBracket(bracket) : null;
}

export async function getPaidTournamentStatus(stores, playerId) {
  const bracket = await getOrCreatePaidTournament(stores);
  const assignment = playerId ? assignedMatch(bracket, playerId) : { entry: undefined, match: undefined };
  const entry = assignment.entry || (playerId ? await readEntry(stores, bracket.id, playerId) : undefined);
  return {
    bracket,
    entry,
    assignedMatch: assignment.match,
    payment: paidPaymentSummary(entry),
    statusText: paidStatusText(bracket, assignment.match)
  };
}

export async function reportPaidTournamentWinner(stores, matchId, reporterPlayerId, winnerEntryId, now = Date.now()) {
  let bracket = await getOrCreatePaidTournament(stores, now);
  bracket = reportWinner(bracket, matchId, winnerEntryId, now);
  if (bracket.status === 'completed') {
    bracket = await applyLockedPrizeSats(stores, bracket, now);
  }
  await writePaidTournament(stores, bracket);
  const assignment = assignedMatch(bracket, reporterPlayerId);
  return {
    bracket,
    entry: assignment.entry,
    assignedMatch: assignment.match,
    payment: paidPaymentSummary(assignment.entry),
    statusText: paidStatusText(bracket, assignment.match)
  };
}

export async function claimPaidPrize(stores, { tournamentId, playerId, bolt11 }, now = Date.now()) {
  const cleanPlayerId = cleanId(playerId);
  const invoice = cleanBolt11(bolt11);
  if (!tournamentId || !cleanPlayerId || !invoice) {
    throw Object.assign(new Error('Missing playerId or Lightning invoice'), { statusCode: 400, code: 'missing_fields' });
  }
  let bracket = await readPaidTournament(stores, tournamentId);
  if (!bracket || bracket.status !== 'completed') {
    throw Object.assign(new Error('Tournament is not complete'), { statusCode: 409, code: 'tournament_not_complete' });
  }
  const entry = bracket.entries.find((candidate) => candidate.playerId === cleanPlayerId || candidate.id === cleanPlayerId);
  if (!entry?.payoutAmountSats || entry.payoutState !== 'rewardPending') {
    throw Object.assign(new Error('No claimable prize for this player'), { statusCode: 403, code: 'prize_not_claimable' });
  }
  const existing = await stores.payouts.get(payoutKey(bracket.id, entry.playerId), { type: 'json' }).catch(() => null);
  if (existing?.status === 'paid') return { bracket, entry, payout: existing };
  const config = paidTournamentConfig();
  if (entry.payoutAmountSats > config.maxAutoPayoutSats) {
    const payout = { tournamentId: bracket.id, playerId: entry.playerId, amountSats: entry.payoutAmountSats, winnerBolt11: invoice, status: 'blocked', createdAt: now };
    await stores.payouts.setJSON(payoutKey(bracket.id, entry.playerId), payout);
    throw Object.assign(new Error('Prize requires manual review'), { statusCode: 409, code: 'payout_blocked' });
  }
  const invoiceSats = decodeBolt11AmountSats(invoice);
  if (!Number.isFinite(invoiceSats) || invoiceSats !== entry.payoutAmountSats) {
    throw Object.assign(new Error(`Submit a Lightning invoice for exactly ${entry.payoutAmountSats} sats`), { statusCode: 400, code: 'invalid_prize_invoice_amount' });
  }
  const pendingPayout = { tournamentId: bracket.id, playerId: entry.playerId, amountSats: entry.payoutAmountSats, winnerBolt11: invoice, status: 'pending', createdAt: now };
  await stores.payouts.setJSON(payoutKey(bracket.id, entry.playerId), pendingPayout);
  const paid = await payWinnerInvoice(invoice);
  const payout = { ...pendingPayout, status: 'paid', checkingId: paid.checkingId, payoutHash: paid.paymentHash, paidAt: now };
  await stores.payouts.setJSON(payoutKey(bracket.id, entry.playerId), payout);
  const updatedEntry = { ...entry, payoutState: 'rewardSent', payoutId: paid.checkingId, payoutInvoice: invoice };
  bracket = { ...bracket, entries: bracket.entries.map((candidate) => candidate.id === entry.id ? updatedEntry : candidate), updatedAt: now };
  await writePaidTournament(stores, bracket);
  await writeLedgerEvent(stores, 'payout_sent', { tournamentId: bracket.id, playerId: entry.playerId, amountSats: entry.payoutAmountSats, checkingId: paid.checkingId }, now);
  return { bracket, entry: updatedEntry, payout };
}

export function paidPaymentSummary(entry) {
  if (!entry) return undefined;
  return {
    state: entry.paymentState,
    provider: entry.paymentProvider,
    invoiceId: entry.paymentInvoiceId,
    checkingId: entry.checkingId,
    amountSats: entry.amountSats,
    paymentRequest: entry.paymentRequest,
    lightningUrl: entry.lightningUrl,
    paidAt: entry.paidAt
  };
}

export { json, errorJson };

async function lockPaidTournament(bracket, now) {
  const prizeSats = {
    1: await usdToSats(bracket.prizeUsd?.[1] ?? 15),
    2: await usdToSats(bracket.prizeUsd?.[2] ?? 10),
    3: await usdToSats(bracket.prizeUsd?.[3] ?? 5)
  };
  return generateOnlineBracket({
    ...bracket,
    entries: confirmedPaidEntries(bracket).slice(0, bracket.capacity),
    prizeSats,
    lockedAt: now,
    updatedAt: now
  }, now);
}

async function applyLockedPrizeSats(stores, bracket, now) {
  const entries = bracket.entries.map((entry) => {
    if (entry.payoutAmountUsd === 15) return { ...entry, payoutAmountSats: bracket.prizeSats?.[1], payoutState: 'rewardPending' };
    if (entry.payoutAmountUsd === 10) return { ...entry, payoutAmountSats: bracket.prizeSats?.[2], payoutState: 'rewardPending' };
    if (entry.payoutAmountUsd === 5) return { ...entry, payoutAmountSats: bracket.prizeSats?.[3], payoutState: 'rewardPending' };
    return entry;
  });
  const next = { ...bracket, entries, updatedAt: now };
  for (const entry of entries.filter((candidate) => candidate.payoutState === 'rewardPending' && candidate.payoutAmountSats)) {
    await writeEntry(stores, next.id, entry);
    await stores.payouts.setJSON(payoutKey(next.id, entry.playerId), {
      tournamentId: next.id,
      playerId: entry.playerId,
      entryId: entry.id,
      amountSats: entry.payoutAmountSats,
      amountUsd: entry.payoutAmountUsd,
      status: 'pending',
      createdAt: now
    });
  }
  return next;
}

function confirmedPaidEntries(bracket) {
  return (bracket.entries || []).filter((entry) => entry.paymentState === 'paid' || entry.paymentState === 'entryLocked');
}

async function writePaidTournament(stores, bracket) {
  await stores.tournaments.setJSON(tournamentKey(bracket.id), bracket);
  await stores.tournaments.setJSON(ACTIVE_KEY, { id: bracket.id, updatedAt: bracket.updatedAt });
  return bracket;
}

async function readEntry(stores, tournamentId, playerId) {
  return stores.entries.get(entryKey(tournamentId, playerId), { type: 'json' }).catch(() => null);
}

async function writeEntry(stores, tournamentId, entry) {
  await stores.entries.setJSON(entryKey(tournamentId, entry.playerId), entry);
  return entry;
}

async function writeLedgerEvent(stores, type, payload, now = Date.now()) {
  const key = `${now}-${type}-${Math.random().toString(36).slice(2)}.json`;
  await stores.ledger.setJSON(key, { type, ...payload, createdAt: now });
}

function sanitizePaidBracket(value) {
  const config = paidTournamentConfig();
  return {
    ...value,
    kind: 'paidOnline',
    entries: Array.isArray(value.entries) ? value.entries : [],
    matches: Array.isArray(value.matches) ? value.matches : [],
    capacity: Math.max(2, Math.round(Number(value.capacity) || config.maxPlayers)),
    minEntries: Math.max(2, Math.round(Number(value.minEntries) || config.maxPlayers)),
    paidEnabled: paidEnabled(),
    entryUsd: Number(value.entryUsd) || config.entryUsd,
    prizeUsd: value.prizeUsd || config.prizeUsd,
    prizeSats: value.prizeSats || {}
  };
}

function paidStatusText(bracket, match) {
  if (bracket.status === 'open') return `${confirmedPaidEntries(bracket).length} / ${bracket.minEntries} paid players`;
  if (bracket.status === 'completed') return 'Tournament complete';
  if (match) return 'Match ready';
  return 'Waiting for next round';
}

function tournamentKey(id) {
  return `${id}.json`;
}

function entryKey(tournamentId, playerId) {
  return `${tournamentId}/${playerId}.json`;
}

function checkingKey(checkingId) {
  return `${checkingId}.json`;
}

function payoutKey(tournamentId, playerId) {
  return `${tournamentId}/${playerId}.json`;
}

function cleanBolt11(value) {
  if (typeof value !== 'string') return '';
  const invoice = value.trim();
  return /^ln(bc|tb|bcrt)[a-z0-9]+$/i.test(invoice) ? invoice : '';
}

function decodeBolt11AmountSats(invoice) {
  const match = invoice.toLowerCase().match(/^ln(?:bc|tb|bcrt)(\d+)([munp])?1/);
  if (!match) return NaN;
  const amount = Number(match[1]);
  const multiplier = match[2] || '';
  if (!Number.isFinite(amount)) return NaN;
  if (multiplier === 'm') return amount * 100000;
  if (multiplier === 'u') return amount * 100;
  if (multiplier === 'n') return amount / 10;
  if (multiplier === 'p') return amount / 10000;
  return amount * 100000000;
}

function formatUsd(value) {
  return Number(value).toFixed(Number(value) % 1 === 0 ? 0 : 2);
}
