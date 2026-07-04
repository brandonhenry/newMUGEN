import { getBlobStore } from './_blob-store.mjs';

export const TOURNAMENT_STORE_NAME = 'kore-tournaments';
export const FREE_ONLINE_TOURNAMENT_ID = 'free-online-daily';
export const PAID_BTC_TOURNAMENT_ID = 'paid-btc-daily';
export const FREE_ONLINE_CAPACITY = 8;
export const FREE_ONLINE_MIN_ENTRIES = 8;
export const PAID_BTC_CAPACITY = 32;
export const PAID_BTC_MIN_ENTRIES = 25;

export function getTournamentStore(event) {
  return getBlobStore(TOURNAMENT_STORE_NAME, event);
}

export function tournamentKey(id) {
  return `tournaments/${id}`;
}

export async function readTournament(store, id) {
  return store.get(tournamentKey(id), { type: 'json' }).catch(() => null);
}

export async function writeTournament(store, bracket) {
  await store.setJSON(tournamentKey(bracket.id), bracket);
  return bracket;
}

export async function getOrCreateFreeTournament(store, now = Date.now()) {
  const existing = await readTournament(store, FREE_ONLINE_TOURNAMENT_ID);
  if (existing?.id) return sanitizeBracket(existing);
  const bracket = makeOpenFreeTournament(now);
  await writeTournament(store, bracket);
  return bracket;
}

export async function getOrCreatePaidTournament(store, now = Date.now()) {
  const existing = await readTournament(store, PAID_BTC_TOURNAMENT_ID);
  if (existing?.id) return sanitizeBracket(existing);
  const bracket = makeOpenPaidTournament(now);
  await writeTournament(store, bracket);
  return bracket;
}

export function makeOpenFreeTournament(now = Date.now()) {
  return {
    id: FREE_ONLINE_TOURNAMENT_ID,
    kind: 'freeOnline',
    status: 'open',
    entries: [],
    matches: [],
    currentRound: 1,
    capacity: FREE_ONLINE_CAPACITY,
    minEntries: FREE_ONLINE_MIN_ENTRIES,
    paidEnabled: false,
    createdAt: now,
    updatedAt: now,
    reward: { kind: 'profilePoints', label: 'Tournament profile trophy', state: 'locked' }
  };
}

export function paidEnabled() {
  return Boolean(
    process.env.TOURNAMENT_PAID_ENABLED === 'true' &&
    process.env.TOURNAMENT_BTC_PROVIDER === 'btcpay' &&
    process.env.BTCPAY_INSTANCE_URL &&
    process.env.BTCPAY_STORE_ID &&
    process.env.BTCPAY_API_KEY &&
    process.env.BTCPAY_WEBHOOK_SECRET
  );
}

export function makeOpenPaidTournament(now = Date.now()) {
  return {
    id: PAID_BTC_TOURNAMENT_ID,
    kind: 'paidOnline',
    status: 'open',
    entries: [],
    matches: [],
    currentRound: 1,
    capacity: PAID_BTC_CAPACITY,
    minEntries: PAID_BTC_MIN_ENTRIES,
    paidEnabled: paidEnabled(),
    createdAt: now,
    updatedAt: now,
    reward: { kind: 'btcPending', label: '$15 / $10 / $5 BTC rewards', state: 'locked' }
  };
}

export function paidDisabledSummary() {
  return {
    id: PAID_BTC_TOURNAMENT_ID,
    kind: 'paidOnline',
    status: paidEnabled() ? 'open' : 'cancelled',
    entryFeeUsd: 2,
    entryFeeLabel: '$2 BTC',
    prizeLabel: '$15 / $10 / $5 BTC',
    entries: 0,
    minEntries: PAID_BTC_MIN_ENTRIES,
    capacity: PAID_BTC_CAPACITY,
    paidEnabled: paidEnabled(),
    startsLabel: paidEnabled() ? 'Paid beta provider configured' : 'Paid beta unavailable'
  };
}

export function toSummary(bracket) {
  const confirmedEntries = confirmedTournamentEntries(bracket);
  return {
    id: bracket.id,
    kind: bracket.kind,
    status: bracket.status,
    entryFeeUsd: bracket.kind === 'paidOnline' ? 2 : 0,
    entryFeeLabel: bracket.kind === 'paidOnline' ? '$2 BTC' : 'Free',
    prizeLabel: bracket.kind === 'paidOnline' ? '$15 / $10 / $5 BTC' : 'Profile trophy',
    entries: confirmedEntries.length,
    minEntries: bracket.minEntries,
    capacity: bracket.capacity,
    paidEnabled: Boolean(bracket.paidEnabled),
    startsLabel: bracket.status === 'open' ? 'Starts when full' : bracket.status === 'roundActive' ? 'Bracket active' : 'Completed'
  };
}

export function enterFreeTournament(bracket, entryRequest, now = Date.now()) {
  const existing = bracket.entries.find((entry) => entry.playerId === entryRequest.playerId);
  if (existing) {
    return { bracket, entry: existing };
  }
  if (bracket.status !== 'open') {
    throw Object.assign(new Error('Tournament is already locked'), { statusCode: 409, code: 'tournament_locked' });
  }
  if (bracket.entries.length >= bracket.capacity) {
    throw Object.assign(new Error('Tournament is full'), { statusCode: 409, code: 'tournament_full' });
  }
  const entry = {
    id: `entry-${entryRequest.playerId}`,
    playerId: entryRequest.playerId,
    displayName: cleanName(entryRequest.displayName),
    characterId: cleanId(entryRequest.characterId),
    seed: bracket.entries.length + 1,
    paymentState: 'notRequired',
    joinedAt: now
  };
  let next = {
    ...bracket,
    entries: [...bracket.entries, entry],
    updatedAt: now
  };
  if (confirmedTournamentEntries(next).length >= next.minEntries) {
    next = generateOnlineBracket(next, now);
  }
  return { bracket: next, entry };
}

export function createPendingPaidEntry(bracket, entryRequest, now = Date.now()) {
  if (!paidEnabled()) {
    throw Object.assign(new Error('Paid BTC tournaments are not enabled yet'), { statusCode: 409, code: 'paid_tournament_unavailable' });
  }
  if (bracket.status !== 'open') {
    throw Object.assign(new Error('Tournament is already locked'), { statusCode: 409, code: 'tournament_locked' });
  }
  if (confirmedTournamentEntries(bracket).length >= bracket.capacity) {
    throw Object.assign(new Error('Tournament is full'), { statusCode: 409, code: 'tournament_full' });
  }
  const existing = bracket.entries.find((entry) => entry.playerId === entryRequest.playerId && !['expired', 'invalid'].includes(entry.paymentState));
  if (existing) return { bracket, entry: existing, reused: true };
  const entry = {
    id: `paid-${entryRequest.playerId}-${now}`,
    playerId: entryRequest.playerId,
    displayName: cleanName(entryRequest.displayName),
    characterId: cleanId(entryRequest.characterId),
    seed: 0,
    paymentState: 'invoicePending',
    paymentProvider: 'btcpay',
    joinedAt: now
  };
  const next = {
    ...bracket,
    entries: [...bracket.entries, entry],
    updatedAt: now
  };
  return { bracket: next, entry, reused: false };
}

export function attachPaidInvoice(bracket, entryId, invoice, now = Date.now()) {
  let updatedEntry = null;
  const entries = bracket.entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    updatedEntry = {
      ...entry,
      paymentProvider: 'btcpay',
      paymentState: 'invoicePending',
      paymentInvoiceId: invoice.invoiceId,
      checkoutUrl: invoice.checkoutUrl
    };
    return updatedEntry;
  });
  if (!updatedEntry) throw Object.assign(new Error('Entry not found'), { statusCode: 404, code: 'entry_not_found' });
  return { bracket: { ...bracket, entries, updatedAt: now }, entry: updatedEntry };
}

export function confirmPaidInvoice(bracket, invoiceId, now = Date.now()) {
  let confirmedEntry = null;
  const alreadyConfirmedCount = confirmedTournamentEntries(bracket).length;
  const entries = bracket.entries.map((entry) => {
    if (entry.paymentInvoiceId !== invoiceId) return entry;
    if (entry.paymentState === 'paid' || entry.paymentState === 'entryLocked') {
      confirmedEntry = entry;
      return entry;
    }
    confirmedEntry = {
      ...entry,
      paymentState: 'paid',
      seed: alreadyConfirmedCount + 1,
      paidAt: now
    };
    return confirmedEntry;
  });
  if (!confirmedEntry) throw Object.assign(new Error('Invoice entry not found'), { statusCode: 404, code: 'invoice_entry_not_found' });
  let next = { ...bracket, entries, updatedAt: now };
  if (next.status === 'open' && confirmedTournamentEntries(next).length >= next.minEntries) {
    next = generateOnlineBracket(next, now);
  }
  return { bracket: next, entry: confirmedEntry };
}

export function expirePaidInvoice(bracket, invoiceId, state = 'expired', now = Date.now()) {
  let expiredEntry = null;
  const entries = bracket.entries.map((entry) => {
    if (entry.paymentInvoiceId !== invoiceId || entry.paymentState === 'paid' || entry.paymentState === 'entryLocked') return entry;
    expiredEntry = {
      ...entry,
      paymentState: state === 'invalid' ? 'invalid' : 'expired'
    };
    return expiredEntry;
  });
  if (!expiredEntry) return { bracket, entry: undefined };
  return { bracket: { ...bracket, entries, updatedAt: now }, entry: expiredEntry };
}

export function generateOnlineBracket(bracket, now = Date.now()) {
  const entries = confirmedTournamentEntries(bracket).slice(0, bracket.capacity);
  const bracketSize = nextPowerOfTwo(Math.max(2, bracket.capacity));
  const matches = resolveAutomaticByes(makeEliminationMatches(entries, bracketSize));
  return {
    ...bracket,
    status: 'roundActive',
    matches,
    currentRound: 1,
    updatedAt: now
  };
}

export function assignedMatch(bracket, playerId) {
  const entry = bracket.entries.find((candidate) => candidate.playerId === playerId || candidate.id === playerId);
  if (!entry) return { entry: undefined, match: undefined };
  const match = bracket.matches.find((candidate) =>
    candidate.status === 'ready' &&
    (candidate.entryAId === entry.id || candidate.entryBId === entry.id)
  );
  return { entry, match };
}

export function reportWinner(bracket, matchId, winnerEntryId, now = Date.now()) {
  const source = bracket.matches.find((match) => match.id === matchId);
  if (!source) throw Object.assign(new Error('Match not found'), { statusCode: 404, code: 'match_not_found' });
  if (source.status === 'completed') return bracket;
  if (source.entryAId !== winnerEntryId && source.entryBId !== winnerEntryId) {
    throw Object.assign(new Error('Winner is not in this match'), { statusCode: 400, code: 'invalid_winner' });
  }
  let matches = bracket.matches.map((match) =>
    match.id === matchId
      ? { ...match, winnerEntryId, status: 'completed', reportedAt: now }
      : match
  );
  matches = applyWinnerToNextRound(matches, source, winnerEntryId);
  const finalRound = Math.max(1, ...matches.map((match) => match.round));
  const final = matches.find((match) => match.round === finalRound && match.status === 'completed');
  const entries = final && bracket.kind === 'paidOnline'
    ? applyPaidRewardObligations(bracket.entries, matches, finalRound)
    : bracket.entries;
  return {
    ...bracket,
    matches,
    entries,
    status: final ? 'completed' : 'roundActive',
    reward: final ? { ...bracket.reward, state: bracket.kind === 'paidOnline' ? 'pending' : 'earned' } : bracket.reward,
    updatedAt: now
  };
}

export function statusText(bracket, match) {
  const entries = confirmedTournamentEntries(bracket);
  if (bracket.status === 'open') return `${entries.length} / ${bracket.minEntries} entered`;
  if (bracket.status === 'completed') return 'Tournament complete';
  if (match) return 'Match ready';
  return 'Waiting for next round';
}

export function sanitizeBracket(value) {
  return {
    ...value,
    entries: Array.isArray(value.entries) ? value.entries : [],
    matches: Array.isArray(value.matches) ? value.matches : [],
    capacity: Math.max(2, Math.round(Number(value.capacity) || FREE_ONLINE_CAPACITY)),
    minEntries: Math.max(2, Math.round(Number(value.minEntries) || FREE_ONLINE_MIN_ENTRIES)),
    paidEnabled: Boolean(value.paidEnabled)
  };
}

export function confirmedTournamentEntries(bracket) {
  if (bracket.kind !== 'paidOnline') return bracket.entries.filter((entry) => !['expired', 'invalid'].includes(entry.paymentState));
  return bracket.entries.filter((entry) => entry.paymentState === 'paid' || entry.paymentState === 'entryLocked');
}

export function paymentSummary(entry) {
  if (!entry) return undefined;
  return {
    state: entry.paymentState,
    checkoutUrl: entry.checkoutUrl,
    provider: entry.paymentProvider,
    invoiceId: entry.paymentInvoiceId,
    paidAt: entry.paidAt
  };
}

export function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

export function cleanToken(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 128);
}

export function cleanName(value) {
  if (typeof value !== 'string') return 'PLAYER';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12) || 'PLAYER';
}

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

export function errorJson(error) {
  return json(error.statusCode || 500, {
    error: error.code || 'tournament_error',
    message: error instanceof Error ? error.message : String(error)
  });
}

function makeEliminationMatches(entries, bracketSize) {
  const rounds = Math.ceil(Math.log2(bracketSize));
  const slots = Array.from({ length: bracketSize }, (_, index) => entries[index]);
  const matches = [];
  for (let index = 0; index < bracketSize / 2; index += 1) {
    const entryA = slots[index * 2];
    const entryB = slots[index * 2 + 1];
    matches.push({
      id: `r1m${index + 1}`,
      round: 1,
      index,
      entryAId: entryA?.id,
      entryBId: entryB?.id,
      status: entryA && entryB ? 'ready' : entryA || entryB ? 'completed' : 'pending',
      winnerEntryId: entryA && !entryB ? entryA.id : !entryA && entryB ? entryB.id : undefined
    });
  }
  for (let round = 2; round <= rounds; round += 1) {
    const roundMatches = bracketSize / 2 ** round;
    for (let index = 0; index < roundMatches; index += 1) {
      matches.push({ id: `r${round}m${index + 1}`, round, index, status: 'pending' });
    }
  }
  return matches;
}

function resolveAutomaticByes(matches) {
  let next = matches;
  let changed = true;
  while (changed) {
    changed = false;
    for (const match of next) {
      if (match.status === 'completed' && match.winnerEntryId && !match.reportedAt) {
        const updated = applyWinnerToNextRound(next, match, match.winnerEntryId);
        if (updated !== next) {
          next = updated;
          changed = true;
        }
      }
    }
  }
  return next;
}

function applyWinnerToNextRound(matches, source, winnerEntryId) {
  const finalRound = Math.max(1, ...matches.map((match) => match.round));
  if (source.round >= finalRound) return matches;
  const nextRound = source.round + 1;
  const nextIndex = Math.floor(source.index / 2);
  const targetSlot = source.index % 2 === 0 ? 'entryAId' : 'entryBId';
  let touched = false;
  const updated = matches.map((match) => {
    if (match.round !== nextRound || match.index !== nextIndex) return match;
    if (match[targetSlot] === winnerEntryId) return match;
    touched = true;
    const next = { ...match, [targetSlot]: winnerEntryId };
    return next.entryAId && next.entryBId ? { ...next, status: 'ready' } : next.entryAId || next.entryBId ? { ...next, status: 'completed', winnerEntryId: next.entryAId || next.entryBId } : next;
  });
  return touched ? updated : matches;
}

function applyPaidRewardObligations(entries, matches, finalRound) {
  const placements = paidPlacements(matches, finalRound);
  const awards = new Map([
    [placements.first, 15],
    [placements.second, 10],
    [placements.third, 5]
  ]);
  return entries.map((entry) => {
    const amount = awards.get(entry.id);
    return amount
      ? { ...entry, payoutState: 'rewardPending', payoutAmountUsd: amount }
      : entry;
  });
}

function paidPlacements(matches, finalRound) {
  const final = matches.find((match) => match.round === finalRound);
  const semifinals = matches.filter((match) => match.round === finalRound - 1);
  const first = final?.winnerEntryId;
  const second = final?.entryAId === first ? final?.entryBId : final?.entryAId;
  const third = semifinals
    .map((match) => match.entryAId === match.winnerEntryId ? match.entryBId : match.entryAId)
    .find((entryId) => entryId && entryId !== second);
  return { first, second, third };
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}
