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
import {
  assertTournamentEntryAssignedToMatch,
  attachTournamentRoomToMatch,
  attachTournamentRoomsToReadyMatches,
  readTournamentMatchRoom,
  upsertTournamentMatchRoom
} from './_tournament-rooms.mjs';
import { getTournamentEmailStore, notifyTournamentReady } from './_tournament-email.mjs';

export const PAID_LIGHTNING_TOURNAMENT_ID = 'paid-lightning-beta';
const TOURNAMENT_STORE_NAME = 'kore-paid-tournaments';
const ENTRY_STORE_NAME = 'kore-paid-entries';
const CHECKING_STORE_NAME = 'kore-paid-checking-ids';
const PAYOUT_STORE_NAME = 'kore-paid-payouts';
const LEDGER_STORE_NAME = 'kore-paid-ledger-events';
const ROOM_STORE_NAME = 'kore-paid-match-rooms';
const ACTIVE_KEY = 'active.json';
const PAID_SERIES_ID = 'paid-lightning';
const PAID_TOURNAMENT_STAGE_POOL = ['the-chamber', 'the-chamber-green', 'metro-ring', 'forge-yard'];

export function getPaidTournamentStores(event) {
  return {
    tournaments: getBlobStore(TOURNAMENT_STORE_NAME, event),
    entries: getBlobStore(ENTRY_STORE_NAME, event),
    checking: getBlobStore(CHECKING_STORE_NAME, event),
    payouts: getBlobStore(PAYOUT_STORE_NAME, event),
    rooms: getBlobStore(ROOM_STORE_NAME, event),
    ledger: getBlobStore(LEDGER_STORE_NAME, event),
    email: getTournamentEmailStore(event)
  };
}

export function paidEnabled() {
  return lnbitsConfigured();
}

export function paidDisabledSummary() {
  const config = paidTournamentConfig();
  const timing = paidTimingSummary({ entries: [], minEntries: config.maxPlayers });
  return {
    id: PAID_LIGHTNING_TOURNAMENT_ID,
    kind: 'paidOnline',
    status: paidEnabled() ? 'open' : 'cancelled',
    entryFeeUsd: config.entryUsd,
    entryFeeLabel: `$${formatUsd(config.entryUsd)} Via Cash App`,
    prizeLabel: `$${formatUsd(config.prizeUsd[1])} / $${formatUsd(config.prizeUsd[2])} / $${formatUsd(config.prizeUsd[3])} Lightning`,
    entries: 0,
    confirmedEntries: timing.confirmedEntries,
    entriesNeeded: timing.entriesNeeded,
    minEntries: config.maxPlayers,
    capacity: config.maxPlayers,
    paidEnabled: paidEnabled(),
    estimatedStartLabel: timing.estimatedStartLabel,
    startsWhenFullLabel: timing.startsWhenFullLabel,
    startsLabel: paidEnabled() ? 'Lightning beta configured' : 'Lightning beta unavailable'
  };
}

export async function paidSummaryWithStores(stores) {
  const bracket = await getOrCreatePaidTournament(stores);
  const activity = await paidTournamentActivitySummary(stores, bracket);
  return { ...paidSummary(bracket), ...activity };
}

export function paidSummary(bracket) {
  const confirmed = confirmedPaidEntries(bracket);
  const timing = paidTimingSummary(bracket);
  return {
    id: bracket.id,
    kind: 'paidOnline',
    status: bracket.status,
    entryFeeUsd: bracket.entryUsd,
    entryFeeLabel: `$${formatUsd(bracket.entryUsd)} Via Cash App`,
    prizeLabel: `$${formatUsd(bracket.prizeUsd?.[1] ?? 15)} / $${formatUsd(bracket.prizeUsd?.[2] ?? 10)} / $${formatUsd(bracket.prizeUsd?.[3] ?? 5)} Lightning`,
    entries: confirmed.length,
    confirmedEntries: timing.confirmedEntries,
    entriesNeeded: timing.entriesNeeded,
    minEntries: bracket.minEntries,
    capacity: bracket.capacity,
    paidEnabled: Boolean(bracket.paidEnabled),
    formingEntries: bracket.status === 'open' ? confirmed.length : 0,
    liveBracketId: bracket.status !== 'open' ? bracket.id : undefined,
    nextBracketId: bracket.status === 'open' ? bracket.id : undefined,
    estimatedStartLabel: timing.estimatedStartLabel,
    startsWhenFullLabel: timing.startsWhenFullLabel,
    startsLabel: bracket.status === 'open' ? 'Starts when full' : bracket.status === 'roundActive' ? 'Bracket active' : 'Completed'
  };
}

export async function paidTournamentActivitySummary(stores, currentBracket) {
  const listed = await stores.tournaments.list({ prefix: 'tournaments/' }).catch(() => ({ blobs: [] }));
  const ids = new Set(
    (listed.blobs || [])
      .map((blob) => String(blob.key || '').replace(/^tournaments\//, ''))
      .filter(Boolean)
  );
  if (currentBracket?.id) ids.add(currentBracket.id);
  const brackets = await Promise.all([...ids].map((id) => readPaidTournament(stores, id).catch(() => null)));
  const paidBrackets = brackets.filter((bracket) => bracket?.kind === 'paidOnline');
  return {
    liveTournamentCount: paidBrackets.filter((bracket) => bracket.status === 'roundActive' || bracket.status === 'bracketGenerated' || bracket.status === 'locked').length,
    formingTournamentCount: paidBrackets.filter((bracket) => bracket.status === 'open').length
  };
}

export async function getOrCreatePaidTournament(stores, now = Date.now()) {
  const active = await stores.tournaments.get(ACTIVE_KEY, { type: 'json' }).catch(() => null);
  if (active?.id) {
    const bracket = await stores.tournaments.get(tournamentKey(active.id), { type: 'json' }).catch(() => null);
    if (bracket?.id) {
      const sanitized = sanitizePaidBracket(bracket);
      if (sanitized.status === 'open' && confirmedPaidEntries(sanitized).length < sanitized.capacity) return sanitized;
    }
  }
  const bracket = makeOpenPaidTournament(now);
  await writePaidTournament(stores, bracket);
  return bracket;
}

export function makeOpenPaidTournament(now = Date.now()) {
  const config = paidTournamentConfig();
  return {
    id: `${PAID_LIGHTNING_TOURNAMENT_ID}-${now}`,
    seriesId: PAID_SERIES_ID,
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
  const registeredDeviceId = cleanDeviceId(entryRequest.posthogDeviceId);
  if (!playerId || !registeredDeviceId) {
    throw Object.assign(new Error('PostHog device id is required for paid tournament entry'), { statusCode: 400, code: 'device_id_required' });
  }
  const existing = await findEntryForDevice(stores, playerId, registeredDeviceId);
  if (existing && !['expired', 'invalid'].includes(existing.paymentState)) {
    const existingBracket = await readPaidTournament(stores, existing.tournamentId || bracket.id) || bracket;
    return { bracket: existingBracket, entry: existing, reused: true };
  }
  const activePlayerEntry = await readEntry(stores, bracket.id, playerId);
  if (activePlayerEntry && activePlayerEntry.registeredDeviceId !== registeredDeviceId && !['expired', 'invalid'].includes(activePlayerEntry.paymentState)) {
    throw Object.assign(new Error('This paid tournament entry is registered to a different device'), { statusCode: 403, code: 'device_mismatch' });
  }
  const amountSats = await usdToSats(bracket.entryUsd);
  const entry = {
    id: `paid-${playerId}-${now}`,
    tournamentId: bracket.id,
    playerId,
    registeredDeviceId,
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
  const paymentIndex = { tournamentId: nextBracket.id, playerId, entryId: invoicedEntry.id, checkingId: invoice.checkingId, paymentHash: invoice.paymentHash, createdAt: now };
  await stores.checking.setJSON(checkingKey(invoice.checkingId), paymentIndex);
  if (invoice.paymentHash && invoice.paymentHash !== invoice.checkingId) {
    await stores.checking.setJSON(checkingKey(invoice.paymentHash), paymentIndex);
  }
  await writeLedgerEvent(stores, 'entry_invoice_created', { tournamentId: nextBracket.id, playerId, entryId: invoicedEntry.id, checkingId: invoice.checkingId, amountSats }, now);
  await writeDeviceEntryIndex(stores, invoicedEntry);
  await writePaidTournament(stores, nextBracket);
  return { bracket: nextBracket, entry: invoicedEntry, reused: false };
}

export async function confirmPaidEntryByCheckingId(stores, checkingId, now = Date.now()) {
  const index = await stores.checking.get(checkingKey(checkingId), { type: 'json' }).catch(() => null);
  if (!index?.tournamentId || !index?.playerId) {
    throw Object.assign(new Error('Paid entry not found for LNbits checking id'), { statusCode: 404, code: 'paid_entry_not_found' });
  }
  const canonicalCheckingId = index.checkingId || checkingId;
  const payment = await checkPayment(canonicalCheckingId);
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
  if (stores.email && bracket.status !== 'open') {
    await notifyTournamentReady(stores.email, bracket, now).catch((error) => {
      console.warn('Paid tournament ready email notification failed', error);
    });
  }
  return { bracket, entry, paid: true };
}

export async function readPaidTournament(stores, tournamentId = PAID_LIGHTNING_TOURNAMENT_ID) {
  const bracket = await stores.tournaments.get(tournamentKey(tournamentId), { type: 'json' }).catch(() => null);
  return bracket?.id ? sanitizePaidBracket(bracket) : null;
}

export async function getPaidTournamentStatus(stores, playerId, posthogDeviceId) {
  const cleanPlayerId = cleanId(playerId);
  const deviceId = cleanDeviceId(posthogDeviceId);
  const deviceEntry = cleanPlayerId && deviceId ? await findEntryForDevice(stores, cleanPlayerId, deviceId) : null;
  const bracket = deviceEntry
    ? await readPaidTournament(stores, deviceEntry.tournamentId)
    : await getOrCreatePaidTournament(stores);
  const assignment = cleanPlayerId ? assignedMatch(bracket, cleanPlayerId) : { entry: undefined, match: undefined };
  const entry = assignment.entry || deviceEntry || (cleanPlayerId ? await readEntry(stores, bracket.id, cleanPlayerId) : undefined);
  if (entry) assertEntryDevice(entry, deviceId);
  const matchRoom = assignment.match && entry ? await readTournamentMatchRoom(stores.rooms, bracket, assignment.match, entry) : undefined;
  const timing = paidTimingSummary(bracket);
  return {
    bracket,
    entry,
    assignedMatch: assignment.match,
    matchRoom,
    payment: paidPaymentSummary(entry),
    confirmedEntries: timing.confirmedEntries,
    entriesNeeded: timing.entriesNeeded,
    estimatedStartLabel: timing.estimatedStartLabel,
    startsWhenFullLabel: timing.startsWhenFullLabel,
    statusText: paidStatusText(bracket, assignment.match)
  };
}

export async function reportPaidTournamentWinner(stores, matchId, reporterPlayerId, winnerEntryId, posthogDeviceId, roomId, now = Date.now()) {
  const cleanReporterId = cleanId(reporterPlayerId);
  const deviceId = cleanDeviceId(posthogDeviceId);
  const reporterEntry = await findEntryForDevice(stores, cleanReporterId, deviceId);
  if (!reporterEntry) {
    throw Object.assign(new Error('Paid tournament device mismatch'), { statusCode: 403, code: 'device_mismatch' });
  }
  let bracket = await readPaidTournament(stores, reporterEntry.tournamentId);
  if (!bracket) throw Object.assign(new Error('Paid tournament not found'), { statusCode: 404, code: 'tournament_not_found' });
  const match = bracket.matches.find((candidate) => candidate.id === matchId);
  if (!match || (match.entryAId !== reporterEntry.id && match.entryBId !== reporterEntry.id)) {
    throw Object.assign(new Error('Reporter is not assigned to this match'), { statusCode: 403, code: 'match_not_assigned' });
  }
  if (match.roomId && cleanId(roomId) !== match.roomId) {
    throw Object.assign(new Error('Match room is required to report this result'), { statusCode: 403, code: 'room_required' });
  }
  const cleanWinnerEntryId = cleanId(winnerEntryId);
  if (match.entryAId !== cleanWinnerEntryId && match.entryBId !== cleanWinnerEntryId) {
    throw Object.assign(new Error('Winner is not assigned to this match'), { statusCode: 400, code: 'invalid_winner' });
  }
  const reports = { ...(match.resultReports || {}), [reporterEntry.id]: cleanWinnerEntryId };
  const reportedWinnerIds = Object.values(reports);
  const uniqueWinners = [...new Set(reportedWinnerIds)];
  if (reportedWinnerIds.length < 2) {
    bracket = {
      ...bracket,
      matches: bracket.matches.map((candidate) => candidate.id === matchId ? { ...candidate, resultReports: reports, reportState: 'single', reportedAt: now } : candidate),
      updatedAt: now
    };
  } else if (uniqueWinners.length > 1) {
    bracket = {
      ...bracket,
      matches: bracket.matches.map((candidate) => candidate.id === matchId ? { ...candidate, resultReports: reports, reportState: 'conflict', roomStatus: 'review', reportedAt: now } : candidate),
      updatedAt: now
    };
  } else {
    bracket = attachTournamentRoomsToReadyMatches(reportWinner(bracket, matchId, cleanWinnerEntryId, now), now, PAID_TOURNAMENT_STAGE_POOL);
    bracket = {
      ...bracket,
      matches: bracket.matches.map((candidate) => candidate.id === matchId ? { ...candidate, resultReports: reports, reportState: 'agreed' } : candidate)
    };
    if (bracket.status === 'completed') {
      bracket = await applyLockedPrizeSats(stores, bracket, now);
    }
  }
  await writePaidTournament(stores, bracket);
  const assignment = assignedMatch(bracket, cleanReporterId);
  const nextMatch = assignment.match || bracket.matches.find((candidate) => candidate.id === matchId);
  const matchRoom = nextMatch && assignment.entry ? await readTournamentMatchRoom(stores.rooms, bracket, nextMatch, assignment.entry, now) : undefined;
  const timing = paidTimingSummary(bracket);
  return {
    bracket,
    entry: assignment.entry,
    assignedMatch: assignment.match,
    matchRoom,
    payment: paidPaymentSummary(assignment.entry),
    confirmedEntries: timing.confirmedEntries,
    entriesNeeded: timing.entriesNeeded,
    estimatedStartLabel: timing.estimatedStartLabel,
    startsWhenFullLabel: timing.startsWhenFullLabel,
    statusText: uniqueWinners.length > 1 ? 'Result conflict needs review' : reportedWinnerIds.length < 2 ? 'Waiting for opponent result confirmation' : paidStatusText(bracket, assignment.match)
  };
}

export async function claimPaidPrize(stores, { tournamentId, playerId, posthogDeviceId, bolt11 }, now = Date.now()) {
  const cleanPlayerId = cleanId(playerId);
  const deviceId = cleanDeviceId(posthogDeviceId);
  const invoice = cleanBolt11(bolt11);
  if (!tournamentId || !cleanPlayerId || !deviceId || !invoice) {
    throw Object.assign(new Error('Missing playerId or Lightning invoice'), { statusCode: 400, code: 'missing_fields' });
  }
  let bracket = await readPaidTournament(stores, tournamentId);
  if (!bracket || bracket.status !== 'completed') {
    throw Object.assign(new Error('Tournament is not complete'), { statusCode: 409, code: 'tournament_not_complete' });
  }
  const entry = bracket.entries.find((candidate) => candidate.playerId === cleanPlayerId || candidate.id === cleanPlayerId);
  assertEntryDevice(entry, deviceId);
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

export async function joinPaidTournamentRoom(stores, { tournamentId, matchId, playerId, posthogDeviceId, peerId }, now = Date.now()) {
  const bracket = await readPaidTournament(stores, tournamentId);
  if (!bracket) throw Object.assign(new Error('Paid tournament not found'), { statusCode: 404, code: 'tournament_not_found' });
  const deviceId = cleanDeviceId(posthogDeviceId);
  const cleanPeerId = cleanId(peerId);
  if (!deviceId || !cleanPeerId) throw Object.assign(new Error('Device id and peer id are required'), { statusCode: 400, code: 'missing_fields' });
  const entry = findEntryByPlayer(bracket, playerId);
  assertEntryDevice(entry, deviceId);
  const match = bracket.matches.find((candidate) => candidate.id === matchId);
  assertTournamentEntryAssignedToMatch(entry, match);
  const room = await upsertTournamentMatchRoom(stores.rooms, bracket, match, entry, cleanPeerId, now);
  const assignment = assignedMatch(bracket, entry.playerId);
  const timing = paidTimingSummary(bracket);
  return {
    bracket,
    entry,
    assignedMatch: assignment.match,
    matchRoom: room,
    payment: paidPaymentSummary(entry),
    confirmedEntries: timing.confirmedEntries,
    entriesNeeded: timing.entriesNeeded,
    estimatedStartLabel: timing.estimatedStartLabel,
    startsWhenFullLabel: timing.startsWhenFullLabel,
    statusText: room.status === 'ready' ? 'Match room ready' : 'Waiting for opponent'
  };
}

export async function getPaidTournamentRoomStatus(stores, { tournamentId, matchId, playerId, posthogDeviceId }, now = Date.now()) {
  const bracket = await readPaidTournament(stores, tournamentId);
  if (!bracket) throw Object.assign(new Error('Paid tournament not found'), { statusCode: 404, code: 'tournament_not_found' });
  const entry = findEntryByPlayer(bracket, playerId);
  assertEntryDevice(entry, cleanDeviceId(posthogDeviceId));
  const match = bracket.matches.find((candidate) => candidate.id === matchId);
  assertTournamentEntryAssignedToMatch(entry, match);
  const room = await readTournamentMatchRoom(stores.rooms, bracket, match, entry, now);
  const timing = paidTimingSummary(bracket);
  return {
    bracket,
    entry,
    assignedMatch: match,
    matchRoom: room,
    payment: paidPaymentSummary(entry),
    confirmedEntries: timing.confirmedEntries,
    entriesNeeded: timing.entriesNeeded,
    estimatedStartLabel: timing.estimatedStartLabel,
    startsWhenFullLabel: timing.startsWhenFullLabel,
    statusText: room?.status === 'ready' ? 'Match room ready' : 'Waiting for opponent'
  };
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
  const generated = generateOnlineBracket({
    ...bracket,
    entries: confirmedPaidEntries(bracket).slice(0, bracket.capacity),
    prizeSats,
    lockedAt: now,
    updatedAt: now
  }, now);
  return {
    ...generated,
    matches: generated.matches.map((match) => attachTournamentRoomToMatch(generated, match, now, PAID_TOURNAMENT_STAGE_POOL))
  };
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

function paidTimingSummary(bracket) {
  const confirmed = confirmedPaidEntries(bracket);
  const minEntries = Math.max(2, Math.round(Number(bracket.minEntries) || paidTournamentConfig().maxPlayers));
  const entriesNeeded = Math.max(0, minEntries - confirmed.length);
  const startsWhenFullLabel = `Tournament starts once ${minEntries} entries enter`;
  return {
    confirmedEntries: confirmed.length,
    entriesNeeded,
    estimatedStartLabel: estimateStartLabel(confirmed, entriesNeeded, startsWhenFullLabel),
    startsWhenFullLabel
  };
}

function estimateStartLabel(confirmed, entriesNeeded, fallback) {
  if (entriesNeeded <= 0) return 'Tournament ready';
  const paidTimes = confirmed
    .map((entry) => Number(entry.paidAt || entry.joinedAt))
    .filter((time) => Number.isFinite(time) && time > 0)
    .sort((a, b) => a - b);
  if (paidTimes.length < 2) return fallback;
  const intervals = [];
  for (let index = 1; index < paidTimes.length; index += 1) {
    const interval = paidTimes[index] - paidTimes[index - 1];
    if (interval > 0) intervals.push(interval);
  }
  if (!intervals.length) return fallback;
  const averageMs = intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
  const estimatedMs = averageMs * entriesNeeded;
  if (!Number.isFinite(estimatedMs) || estimatedMs <= 0) return fallback;
  return `~${formatDuration(estimatedMs)}`;
}

function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function writePaidTournament(stores, bracket) {
  await stores.tournaments.setJSON(tournamentKey(bracket.id), bracket);
  if (bracket.status === 'open') await stores.tournaments.setJSON(ACTIVE_KEY, { id: bracket.id, updatedAt: bracket.updatedAt });
  return bracket;
}

async function readEntry(stores, tournamentId, playerId) {
  return stores.entries.get(entryKey(tournamentId, playerId), { type: 'json' }).catch(() => null);
}

async function writeEntry(stores, tournamentId, entry) {
  await stores.entries.setJSON(entryKey(tournamentId, entry.playerId), entry);
  return entry;
}

async function writeDeviceEntryIndex(stores, entry) {
  await stores.entries.setJSON(deviceEntryKey(entry.playerId, entry.registeredDeviceId), {
    tournamentId: entry.tournamentId,
    playerId: entry.playerId,
    entryId: entry.id,
    registeredDeviceId: entry.registeredDeviceId,
    updatedAt: Date.now()
  });
}

async function findEntryForDevice(stores, playerId, posthogDeviceId) {
  const cleanPlayerId = cleanId(playerId);
  const deviceId = cleanDeviceId(posthogDeviceId);
  if (!cleanPlayerId || !deviceId) return null;
  const index = await stores.entries.get(deviceEntryKey(cleanPlayerId, deviceId), { type: 'json' }).catch(() => null);
  if (!index?.tournamentId) return null;
  const entry = await readEntry(stores, index.tournamentId, cleanPlayerId);
  return entry && entry.registeredDeviceId === deviceId ? entry : null;
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

function findEntryByPlayer(bracket, playerId) {
  const cleanPlayerId = cleanId(playerId);
  return bracket.entries.find((candidate) => candidate.playerId === cleanPlayerId || candidate.id === cleanPlayerId);
}

function assertEntryDevice(entry, posthogDeviceId) {
  if (!entry) throw Object.assign(new Error('Paid tournament entry not found'), { statusCode: 404, code: 'paid_entry_not_found' });
  const deviceId = cleanDeviceId(posthogDeviceId);
  if (!deviceId || entry.registeredDeviceId !== deviceId) {
    throw Object.assign(new Error('Paid tournament device mismatch'), { statusCode: 403, code: 'device_mismatch' });
  }
}

function paidStatusText(bracket, match) {
  if (bracket.status === 'open') return `${confirmedPaidEntries(bracket).length} / ${bracket.minEntries} entries`;
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

function deviceEntryKey(playerId, posthogDeviceId) {
  return `devices/${cleanDeviceId(posthogDeviceId)}/${cleanId(playerId)}.json`;
}

function checkingKey(checkingId) {
  return `${checkingId}.json`;
}

function payoutKey(tournamentId, playerId) {
  return `${tournamentId}/${playerId}.json`;
}

function cleanDeviceId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_.-]/g, '').slice(0, 160);
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
