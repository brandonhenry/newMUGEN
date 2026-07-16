import { getBlobStore } from './_blob-store.mjs';
import { createHash, randomInt } from 'node:crypto';
import { cleanId, cleanName } from './_tournament-store.mjs';
import { lnbitsConfigured, paidTournamentConfig, payWinnerInvoice, usdToSats } from './_lnbits.mjs';
import { withTournamentPublicMetadata } from './_tournament-public.mjs';
import { sendTournamentEmail } from './_tournament-email.mjs';

export const OFFICIAL_TOURNAMENT_ID = 'kore-open-beta-cup-1';
export const OFFICIAL_TOURNAMENT_PREFIX = 'kore-official-';
export const OFFICIAL_RULES_VERSION = '2026-07-16';
export const OFFICIAL_CAPACITY = 32;
export const OFFICIAL_REGISTRATION_OPENS_AT = Date.parse('2026-07-20T05:00:00.000Z');
export const OFFICIAL_CHECK_IN_OPENS_AT = Date.parse('2026-08-01T23:30:00.000Z');
export const OFFICIAL_STARTS_AT = Date.parse('2026-08-02T00:00:00.000Z');
export const OFFICIAL_NO_SHOW_MS = 10 * 60 * 1000;

const STORE_NAME = 'kore-official-tournaments';
const ACTIVE_KEY = 'active.json';
const STAGE_POOL = ['the-chamber', 'the-chamber-green', 'metro-ring', 'forge-yard'];

export function isOfficialTournamentId(id) {
  const value = cleanId(id);
  return value === OFFICIAL_TOURNAMENT_ID || value.startsWith(OFFICIAL_TOURNAMENT_PREFIX);
}

export function getOfficialTournamentStore(event) {
  return getBlobStore(STORE_NAME, event);
}

export async function getOrCreateOfficialTournament(store, now = Date.now()) {
  const active = await store.get(ACTIVE_KEY, { type: 'json' }).catch(() => null);
  const activeEvent = active?.id ? await readOfficialTournament(store, active.id) : null;
  if (activeEvent?.id) return reconcileOfficialLifecycle(store, activeEvent, now);
  const event = makeLaunchOfficialTournament(now);
  await writeOfficialTournament(store, event);
  await store.setJSON(ACTIVE_KEY, { id: event.id, updatedAt: now });
  return reconcileOfficialLifecycle(store, event, now);
}

export function makeLaunchOfficialTournament(now = Date.now()) {
  return withTournamentPublicMetadata({
    id: OFFICIAL_TOURNAMENT_ID,
    seriesId: 'kore-official',
    name: 'K.O.R.E. Open Beta Cup #1',
    slug: OFFICIAL_TOURNAMENT_ID,
    kind: 'officialOnline',
    status: 'announced',
    published: true,
    entries: [],
    matches: [],
    currentRound: 0,
    capacity: OFFICIAL_CAPACITY,
    minEntries: OFFICIAL_CAPACITY,
    paidEnabled: false,
    registrationOpensAt: OFFICIAL_REGISTRATION_OPENS_AT,
    checkInOpensAt: OFFICIAL_CHECK_IN_OPENS_AT,
    checkInClosesAt: OFFICIAL_STARTS_AT,
    startsAt: OFFICIAL_STARTS_AT,
    timezone: 'America/Chicago',
    rulesVersion: OFFICIAL_RULES_VERSION,
    format: {
      elimination: 'double',
      gamesToWin: 2,
      finalsGamesToWin: 3,
      roundsToWin: 3,
      roundTimerSeconds: 60,
      fighterSelection: 'freeHiddenLock',
      grandFinalReset: true,
      noShowMinutes: 10
    },
    prizesUsd: { 1: 60, 2: 25, 3: 15 },
    prizeFundingConfirmedAt: undefined,
    legalApprovedAt: undefined,
    emailDeliveryConfirmedAt: undefined,
    placements: {},
    createdAt: now,
    updatedAt: now,
    reward: { kind: 'lightningPrize', label: '$60 / $25 / $15 Lightning prizes', state: 'locked' }
  });
}

export async function readOfficialTournament(store, id) {
  return store.get(eventKey(id), { type: 'json' }).catch(() => null);
}

export async function writeOfficialTournament(store, event) {
  await store.setJSON(eventKey(event.id), event);
  return event;
}

export async function reconcileOfficialLifecycle(store, event, now = Date.now()) {
  let next = event;
  if (event.status === 'announced' && now >= event.registrationOpensAt) next = { ...event, status: 'registrationOpen', updatedAt: now };
  if (['announced', 'registrationOpen'].includes(next.status) && now >= next.checkInOpensAt) next = { ...next, status: 'checkIn', updatedAt: now };
  if (next.status === 'checkIn' && now >= next.checkInClosesAt) {
    next = officialLaunchReady(next)
      ? finalizeOfficialCheckIn(next, now)
      : { ...next, status: 'postponed', postponedAt: now, postponementReason: 'launch_gate_incomplete', updatedAt: now };
  }
  if (['roundActive', 'bracketGenerated'].includes(next.status)) next = resolveOfficialNoShows(next, now);
  if (next !== event) await writeOfficialTournament(store, next);
  return next;
}

export function officialSummary(event, now = Date.now()) {
  const primary = primaryEntries(event);
  const waitlist = waitlistEntries(event);
  const checkedIn = activeEntries(event).filter((entry) => entry.checkedInAt).length;
  return {
    id: event.id,
    kind: 'officialOnline',
    status: event.status,
    entryFeeUsd: 0,
    entryFeeLabel: 'Free',
    prizeLabel: '$60 / $25 / $15 Lightning',
    entries: primary.length,
    confirmedEntries: primary.length,
    entriesNeeded: Math.max(0, event.capacity - primary.length),
    checkedInEntries: checkedIn,
    waitlistEntries: waitlist.length,
    minEntries: event.minEntries,
    capacity: event.capacity,
    paidEnabled: false,
    registrationOpensAt: event.registrationOpensAt,
    checkInOpensAt: event.checkInOpensAt,
    checkInClosesAt: event.checkInClosesAt,
    startsAt: event.startsAt,
    startsLabel: officialStartsLabel(event, now),
    estimatedStartLabel: formatCentralDate(event.startsAt),
    startsWhenFullLabel: 'Starts only with 32 checked-in players',
    rulesVersion: event.rulesVersion
  };
}

export async function enterOfficialTournament(store, request, now = Date.now()) {
  let event = await getOrCreateOfficialTournament(store, now);
  if (event.status === 'announced' || now < event.registrationOpensAt) throw officialError('Registration opens July 20, 2026', 409, 'registration_not_open');
  if (!['registrationOpen', 'checkIn', 'postponed'].includes(event.status)) throw officialError('Registration is closed', 409, 'registration_closed');
  const playerId = cleanId(request.playerId);
  const registeredDeviceId = cleanDeviceId(request.posthogDeviceId);
  const email = cleanEmail(request.email);
  if (!playerId || !registeredDeviceId || !email || request.eligibilityAccepted !== true || request.rulesAccepted !== true) {
    throw officialError('Profile, email, Global 18+ eligibility, and rules acceptance are required', 400, 'official_entry_requirements');
  }
  const existing = event.entries.find((entry) => entry.playerId === playerId);
  if (existing) {
    if (existing.registeredDeviceId !== registeredDeviceId) throw officialError('This entry is registered to a different device', 403, 'device_mismatch');
    return { bracket: event, entry: existing, statusText: officialEntryStatus(existing), reused: true };
  }
  const confirmedCount = primaryEntries(event).length;
  const waitlistCount = waitlistEntries(event).length;
  const registrationState = confirmedCount < event.capacity ? 'confirmed' : 'waitlisted';
  const entry = {
    id: `official-${playerId}-${now}`,
    playerId,
    registeredDeviceId,
    displayName: cleanName(request.displayName),
    email,
    characterId: cleanId(request.characterId),
    seed: registrationState === 'confirmed' ? confirmedCount + 1 : 0,
    registrationState,
    waitlistPosition: registrationState === 'waitlisted' ? waitlistCount + 1 : undefined,
    checkedInAt: undefined,
    eligibilityAcceptedAt: now,
    rulesAcceptedAt: now,
    rulesVersion: event.rulesVersion,
    paymentState: 'notRequired',
    joinedAt: now
  };
  event = { ...event, entries: [...event.entries, entry], updatedAt: now };
  await writeOfficialTournament(store, event);
  return { bracket: event, entry, statusText: officialEntryStatus(entry), reused: false };
}

export async function checkInOfficialTournament(store, request, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(request.tournamentId));
  if (!event) throw officialError('Tournament not found', 404, 'tournament_not_found');
  event = await reconcileOfficialLifecycle(store, event, now);
  if (event.status !== 'checkIn' || now < event.checkInOpensAt || now >= event.checkInClosesAt) throw officialError('Check-in is not open', 409, 'check_in_closed');
  const entry = assertOfficialPlayer(event, request.playerId, request.posthogDeviceId);
  const entries = event.entries.map((candidate) => candidate.id === entry.id ? { ...candidate, checkedInAt: candidate.checkedInAt || now } : candidate);
  const next = { ...event, entries, updatedAt: now };
  await writeOfficialTournament(store, next);
  return officialStatus(next, request.playerId, request.posthogDeviceId, now);
}

export function finalizeOfficialCheckIn(event, now = Date.now()) {
  const checkedPrimary = primaryEntries(event).filter((entry) => entry.checkedInAt);
  const checkedWaitlist = waitlistEntries(event).filter((entry) => entry.checkedInAt).sort((a, b) => a.joinedAt - b.joinedAt);
  const promoted = checkedWaitlist.slice(0, Math.max(0, event.capacity - checkedPrimary.length));
  const activeIds = new Set([...checkedPrimary, ...promoted].map((entry) => entry.id));
  const entries = event.entries.map((entry) => {
    if (activeIds.has(entry.id)) return { ...entry, registrationState: 'confirmed', waitlistPosition: undefined };
    if (entry.registrationState === 'confirmed' && !entry.checkedInAt) return { ...entry, registrationState: 'missedCheckIn', seed: 0 };
    return entry.registrationState === 'waitlisted' ? { ...entry, registrationState: 'waitlisted' } : entry;
  });
  const active = entries.filter((entry) => activeIds.has(entry.id));
  if (active.length !== event.capacity) {
    return { ...event, entries, status: 'postponed', postponedAt: now, updatedAt: now };
  }
  const seeded = active.sort((a, b) => (a.seed || 999) - (b.seed || 999) || a.joinedAt - b.joinedAt).map((entry, index) => ({ ...entry, seed: index + 1 }));
  const seededById = new Map(seeded.map((entry) => [entry.id, entry]));
  const mergedEntries = entries.map((entry) => seededById.get(entry.id) || entry);
  return generateOfficialBracket({ ...event, entries: mergedEntries }, now);
}

export function generateOfficialBracket(event, now = Date.now()) {
  const entrants = activeEntries(event).sort((a, b) => a.seed - b.seed);
  if (entrants.length !== event.capacity || !isPowerOfTwo(event.capacity)) throw officialError(`Exactly ${event.capacity} checked-in players are required`, 409, 'official_capacity_required');
  const matches = makeDoubleEliminationMatches(event.capacity);
  const firstRound = matches.filter((match) => match.bracketSide === 'winners' && match.bracketRound === 1);
  const seededIds = seedOrder(entrants.map((entry) => entry.id));
  firstRound.forEach((match, index) => {
    match.entryAId = seededIds[index * 2];
    match.entryBId = seededIds[index * 2 + 1];
    Object.assign(match, readyOfficialMatch(match, now));
  });
  return {
    ...event,
    status: 'roundActive',
    matches,
    currentRound: 1,
    bracketGeneratedAt: now,
    updatedAt: now
  };
}

export function makeDoubleEliminationMatches(size) {
  if (size < 4 || !isPowerOfTwo(size)) throw new Error('Double-elimination size must be a power of two of at least four');
  const winnersRounds = Math.log2(size);
  const matches = [];
  for (let round = 1; round <= winnersRounds; round += 1) {
    const count = size / 2 ** round;
    for (let index = 0; index < count; index += 1) {
      matches.push(makeMatch(`w${round}m${index + 1}`, 'winners', round, index, round === winnersRounds ? 3 : 2));
    }
  }
  for (let round = 1; round <= (winnersRounds - 1) * 2; round += 1) {
    const pair = Math.ceil(round / 2);
    const count = size / 2 ** (pair + 1);
    for (let index = 0; index < count; index += 1) {
      const isLosersFinal = round === (winnersRounds - 1) * 2;
      matches.push(makeMatch(`l${round}m${index + 1}`, 'losers', round, index, isLosersFinal ? 3 : 2));
    }
  }
  matches.push(makeMatch('gf1', 'grandFinal', 1, 0, 3));
  matches.push({ ...makeMatch('gf-reset', 'grandFinalReset', 2, 0, 3), resetRequired: false });

  const byId = new Map(matches.map((match) => [match.id, match]));
  for (let round = 1; round <= winnersRounds; round += 1) {
    const current = matches.filter((match) => match.bracketSide === 'winners' && match.bracketRound === round);
    current.forEach((match, index) => {
      if (round < winnersRounds) match.winnerNext = route(`w${round + 1}m${Math.floor(index / 2) + 1}`, index % 2 === 0 ? 'A' : 'B');
      else match.winnerNext = route('gf1', 'A');
      if (round === 1) match.loserNext = route(`l1m${Math.floor(index / 2) + 1}`, index % 2 === 0 ? 'A' : 'B');
      else match.loserNext = route(`l${round * 2 - 2}m${index + 1}`, 'B');
    });
  }
  const loserRounds = (winnersRounds - 1) * 2;
  for (let round = 1; round <= loserRounds; round += 1) {
    const current = matches.filter((match) => match.bracketSide === 'losers' && match.bracketRound === round);
    current.forEach((match, index) => {
      if (round === loserRounds) match.winnerNext = route('gf1', 'B');
      else if (round % 2 === 1) match.winnerNext = route(`l${round + 1}m${index + 1}`, 'A');
      else match.winnerNext = route(`l${round + 1}m${Math.floor(index / 2) + 1}`, index % 2 === 0 ? 'A' : 'B');
    });
  }
  byId.get('gf1').winnerNext = route('gf-reset', 'A');
  return matches;
}

export async function lockOfficialGameFighter(store, request, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(request.tournamentId));
  if (!event) throw officialError('Tournament not found', 404, 'tournament_not_found');
  const entry = assertOfficialPlayer(event, request.playerId, request.posthogDeviceId);
  const match = event.matches.find((candidate) => candidate.id === cleanId(request.matchId));
  assertAssignedReadyMatch(match, entry);
  const characterId = cleanId(request.characterId);
  if (!characterId) throw officialError('Fighter is required', 400, 'character_required');
  const gameNumber = match.games.length + 1;
  const fighterLocks = { ...(match.fighterLocks || {}), [entry.id]: characterId };
  const bothLocked = Boolean(fighterLocks[match.entryAId] && fighterLocks[match.entryBId]);
  const stageId = bothLocked ? deterministicStage(event.id, match.id, gameNumber) : match.stageId;
  const matches = event.matches.map((candidate) => candidate.id === match.id ? { ...candidate, fighterLocks, stageId, gameNumber } : candidate);
  event = { ...event, matches, updatedAt: now };
  await writeOfficialTournament(store, event);
  return officialStatus(event, request.playerId, request.posthogDeviceId, now);
}

export async function reportOfficialGame(store, request, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(request.tournamentId));
  if (!event) throw officialError('Tournament not found', 404, 'tournament_not_found');
  const reporter = assertOfficialPlayer(event, request.reporterPlayerId, request.posthogDeviceId);
  const match = event.matches.find((candidate) => candidate.id === cleanId(request.matchId));
  if (!match || ![match.entryAId, match.entryBId].includes(reporter.id)) throw officialError('Entry is not assigned to this set', 403, 'match_not_assigned');
  const requestedGameNumber = Math.max(1, Math.round(Number(request.gameNumber) || match.games.length + 1));
  const completedGame = match.games.find((game) => game.number === requestedGameNumber);
  if (completedGame) {
    if (completedGame.winnerEntryId !== cleanId(request.winnerEntryId)) throw officialError('This game already has a different confirmed winner', 409, 'game_already_reported');
    return officialStatus(event, request.reporterPlayerId, request.posthogDeviceId, now);
  }
  assertAssignedReadyMatch(match, reporter);
  if (requestedGameNumber !== match.games.length + 1) throw officialError('Game report is out of sequence', 409, 'game_report_out_of_sequence');
  if (match.roomId && cleanId(request.roomId) !== match.roomId) throw officialError('Official match room is required to report this game', 403, 'room_required');
  if (!match.fighterLocks?.[match.entryAId] || !match.fighterLocks?.[match.entryBId]) throw officialError('Both fighters must be locked before reporting', 409, 'fighters_not_locked');
  const winnerEntryId = cleanId(request.winnerEntryId);
  if (![match.entryAId, match.entryBId].includes(winnerEntryId)) throw officialError('Winner is not assigned to this set', 400, 'invalid_winner');
  const gameNumber = requestedGameNumber;
  const reports = { ...(match.pendingGameReports || {}), [reporter.id]: winnerEntryId };
  const opponentId = reporter.id === match.entryAId ? match.entryBId : match.entryAId;
  let updatedMatch = { ...match, pendingGameReports: reports, reportState: reports[opponentId] ? 'agreed' : 'single' };
  if (reports[opponentId] && reports[opponentId] !== winnerEntryId) {
    updatedMatch = { ...updatedMatch, reportState: 'conflict', roomStatus: 'review' };
  } else if (reports[opponentId] === winnerEntryId) {
    const game = {
      number: gameNumber,
      winnerEntryId,
      characterAId: match.fighterLocks?.[match.entryAId],
      characterBId: match.fighterLocks?.[match.entryBId],
      stageId: match.stageId,
      completedAt: now
    };
    const setScore = { ...(match.setScore || {}), [winnerEntryId]: (match.setScore?.[winnerEntryId] || 0) + 1 };
    const setWon = setScore[winnerEntryId] >= match.targetWins;
    updatedMatch = {
      ...match,
      games: [...match.games, game],
      setScore,
      fighterLocks: {},
      pendingGameReports: {},
      reportState: 'agreed',
      status: setWon ? 'completed' : 'ready',
      winnerEntryId: setWon ? winnerEntryId : undefined,
      reportedAt: setWon ? now : match.reportedAt
    };
  }
  event = { ...event, matches: event.matches.map((candidate) => candidate.id === match.id ? updatedMatch : candidate), updatedAt: now };
  if (updatedMatch.status === 'completed') event = advanceOfficialSet(event, updatedMatch, now);
  await writeOfficialTournament(store, event);
  return officialStatus(event, request.reporterPlayerId, request.posthogDeviceId, now);
}

export function advanceOfficialSet(event, completedMatch, now = Date.now()) {
  const loserEntryId = completedMatch.entryAId === completedMatch.winnerEntryId ? completedMatch.entryBId : completedMatch.entryAId;
  let matches = [...event.matches];
  if (completedMatch.bracketSide === 'grandFinal') {
    if (completedMatch.winnerEntryId === completedMatch.entryAId) return completeOfficialTournament({ ...event, matches }, completedMatch.winnerEntryId, loserEntryId, now);
    const reset = matches.find((match) => match.id === 'gf-reset');
    const activated = readyOfficialMatch({ ...reset, resetRequired: true, entryAId: completedMatch.entryAId, entryBId: completedMatch.entryBId }, now);
    matches = matches.map((match) => match.id === reset.id ? activated : match);
    return { ...event, matches, updatedAt: now };
  }
  if (completedMatch.bracketSide === 'grandFinalReset') return completeOfficialTournament({ ...event, matches }, completedMatch.winnerEntryId, loserEntryId, now);
  matches = applyRoute(matches, completedMatch.winnerNext, completedMatch.winnerEntryId, now);
  matches = applyRoute(matches, completedMatch.loserNext, loserEntryId, now);
  const placements = completedMatch.bracketSide === 'losers' && !completedMatch.winnerNext?.matchId.startsWith('l')
    ? { ...(event.placements || {}), 3: loserEntryId }
    : event.placements;
  return { ...event, matches, placements, currentRound: event.currentRound + 1, updatedAt: now };
}

export async function joinOfficialTournamentRoom(store, request, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(request.tournamentId));
  if (!event) throw officialError('Tournament not found', 404, 'tournament_not_found');
  event = resolveOfficialNoShows(event, now);
  const entry = assertOfficialPlayer(event, request.playerId, request.posthogDeviceId);
  const match = event.matches.find((candidate) => candidate.id === cleanId(request.matchId));
  assertAssignedReadyMatch(match, entry);
  if (now > match.arrivalDeadlineAt) throw officialError('The 10-minute match check-in window closed', 409, 'match_no_show_window_closed');
  const peerId = cleanPeerId(request.peerId);
  if (!peerId) throw officialError('Peer id is required', 400, 'peer_id_required');
  const arrivals = { ...(match.arrivals || {}), [entry.id]: { peerId, joinedAt: now } };
  const roomStatus = arrivals[match.entryAId] && arrivals[match.entryBId] ? 'ready' : 'waiting';
  const matches = event.matches.map((candidate) => candidate.id === match.id ? { ...candidate, arrivals, roomStatus } : candidate);
  event = { ...event, matches, updatedAt: now };
  await writeOfficialTournament(store, event);
  return officialStatus(event, request.playerId, request.posthogDeviceId, now);
}

export async function getOfficialTournamentStatus(store, tournamentId, playerId, posthogDeviceId, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(tournamentId));
  if (!event && cleanId(tournamentId) === OFFICIAL_TOURNAMENT_ID) event = await getOrCreateOfficialTournament(store, now);
  if (!event) throw officialError('Tournament not found', 404, 'tournament_not_found');
  event = await reconcileOfficialLifecycle(store, event, now);
  return officialStatus(event, playerId, posthogDeviceId, now);
}

export async function claimOfficialPrize(store, request, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(request.tournamentId));
  if (!event || event.status !== 'completed') throw officialError('Tournament prize is not available', 409, 'prize_unavailable');
  const entry = assertOfficialPlayer(event, request.playerId, request.posthogDeviceId);
  if (entry.payoutState === 'rewardSent') {
    const payout = await store.get(payoutKey(event.id, entry.id), { type: 'json' }).catch(() => null);
    return { bracket: event, entry, payout: payout || { status: 'paid', amountSats: entry.payoutAmountSats, paidAt: entry.paidAt } };
  }
  if (entry.payoutState !== 'rewardPending' || !entry.payoutAmountUsd) throw officialError('No prize is assigned to this entry', 403, 'prize_not_assigned');
  const bolt11 = cleanBolt11(request.bolt11);
  if (!bolt11) throw officialError('A Lightning invoice is required', 400, 'invoice_required');
  const quotedAmountSats = await usdToSats(entry.payoutAmountUsd);
  const invoiceSats = decodeBolt11AmountSats(bolt11);
  const quoteTolerance = Math.max(1, Math.round(quotedAmountSats * 0.03));
  if (!Number.isFinite(invoiceSats) || Math.abs(invoiceSats - quotedAmountSats) > quoteTolerance) throw officialError(`Submit a Lightning invoice for approximately $${entry.payoutAmountUsd}`, 400, 'invalid_prize_invoice_amount');
  const amountSats = invoiceSats;
  if (amountSats > paidTournamentConfig().maxAutoPayoutSats) {
    const blocked = { status: 'blocked', amountUsd: entry.payoutAmountUsd, amountSats, winnerBolt11: bolt11, createdAt: now };
    await store.setJSON(payoutKey(event.id, entry.id), blocked);
    throw officialError('Prize requires manual review', 409, 'payout_blocked');
  }
  const paid = await payWinnerInvoice(bolt11);
  const payout = { status: 'paid', amountUsd: entry.payoutAmountUsd, amountSats, checkingId: paid.checkingId, payoutHash: paid.paymentHash, paidAt: now };
  const entries = event.entries.map((candidate) => candidate.id === entry.id ? { ...candidate, payoutState: 'rewardSent', payoutAmountSats: amountSats, payoutId: paid.checkingId, paidAt: now } : candidate);
  event = { ...event, entries, updatedAt: now };
  await store.setJSON(payoutKey(event.id, entry.id), payout);
  await writeOfficialTournament(store, event);
  return { bracket: event, entry: entries.find((candidate) => candidate.id === entry.id), payout };
}

export async function updateOfficialEventAdmin(store, action, payload, now = Date.now()) {
  let event = payload.id ? await readOfficialTournament(store, cleanId(payload.id)) : await getOrCreateOfficialTournament(store, now);
  if (!event && action !== 'create') throw officialError('Tournament not found', 404, 'tournament_not_found');
  if (action === 'create') {
    const id = cleanId(payload.id) || `${OFFICIAL_TOURNAMENT_PREFIX}${now}`;
    const base = makeLaunchOfficialTournament(now);
    const startsAt = cleanTimestamp(payload.startsAt) || base.startsAt;
    const registrationOpensAt = cleanTimestamp(payload.registrationOpensAt) || Math.max(now, startsAt - 12 * 86_400_000);
    event = { ...base, id, slug: id, name: cleanEventName(payload.name) || 'K.O.R.E. Official Tournament', published: false, status: 'draft', entries: [], matches: [], registrationOpensAt, checkInOpensAt: startsAt - 30 * 60 * 1000, checkInClosesAt: startsAt, startsAt };
  } else if (action === 'publish') {
    if (!event.prizeFundingConfirmedAt || !event.legalApprovedAt || !event.emailDeliveryConfirmedAt || !lnbitsConfigured()) {
      throw officialError('Funding, legal approval, email delivery, and Lightning configuration are required before publishing', 409, 'official_publish_gate');
    }
    event = { ...event, published: true, status: now >= event.registrationOpensAt ? 'registrationOpen' : 'announced', updatedAt: now };
  } else if (action === 'postpone') {
    event = { ...event, status: 'postponed', postponedAt: now, updatedAt: now };
  } else if (action === 'reschedule') {
    const startsAt = cleanTimestamp(payload.startsAt);
    const registrationOpensAt = cleanTimestamp(payload.registrationOpensAt) || event.registrationOpensAt;
    if (!startsAt) throw officialError('A valid start date is required', 400, 'invalid_start_date');
    const entries = requeueOfficialRegistrations(event.entries, event.capacity);
    event = { ...event, entries, status: now >= registrationOpensAt ? 'registrationOpen' : 'announced', registrationOpensAt, checkInOpensAt: startsAt - 30 * 60 * 1000, checkInClosesAt: startsAt, startsAt, postponedAt: undefined, updatedAt: now };
  } else if (action === 'confirmFunding') {
    event = { ...event, prizeFundingConfirmedAt: now, updatedAt: now };
  } else if (action === 'confirmLegal') {
    event = { ...event, legalApprovedAt: now, updatedAt: now };
  } else if (action === 'confirmEmail') {
    event = { ...event, emailDeliveryConfirmedAt: now, updatedAt: now };
  } else if (action === 'seed') {
    const orderedIds = Array.isArray(payload.entryIds) ? payload.entryIds.map(cleanId) : [];
    const order = new Map(orderedIds.map((id, index) => [id, index + 1]));
    event = { ...event, entries: event.entries.map((entry) => order.has(entry.id) ? { ...entry, seed: order.get(entry.id) } : entry), updatedAt: now };
  } else if (action === 'start') {
    if (!event.prizeFundingConfirmedAt || !event.legalApprovedAt || !event.emailDeliveryConfirmedAt || !lnbitsConfigured()) throw officialError('Funding, approved rules, email delivery, and Lightning configuration are required before starting', 409, 'official_start_gate');
    event = finalizeOfficialCheckIn({ ...event, status: 'checkIn' }, now);
    if (event.status === 'postponed') throw officialError('Exactly 32 checked-in players are required', 409, 'official_capacity_required');
  } else if (action === 'update') {
    event = { ...event, name: cleanEventName(payload.name) || event.name, updatedAt: now };
  }
  await writeOfficialTournament(store, event);
  await store.setJSON(ACTIVE_KEY, { id: event.id, updatedAt: now });
  return event;
}

export async function resolveOfficialMatchAdmin(store, tournamentId, matchId, winnerEntryId, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(tournamentId));
  if (!event) throw officialError('Tournament not found', 404, 'tournament_not_found');
  const match = event.matches.find((candidate) => candidate.id === cleanId(matchId));
  const winner = cleanId(winnerEntryId);
  if (!match || ![match.entryAId, match.entryBId].includes(winner)) throw officialError('A valid reviewed winner is required', 400, 'invalid_winner');
  const resolved = { ...match, status: 'completed', winnerEntryId: winner, roomStatus: 'closed', reportState: 'agreed', pendingGameReports: {}, reportedAt: now };
  event = { ...event, matches: event.matches.map((candidate) => candidate.id === match.id ? resolved : candidate), updatedAt: now };
  event = advanceOfficialSet(event, resolved, now);
  await writeOfficialTournament(store, event);
  return officialStatus(event, '', '', now);
}

export async function requestOfficialTournamentRecovery(store, request, now = Date.now()) {
  const event = await readOfficialTournament(store, cleanId(request.tournamentId));
  const playerId = cleanId(request.playerId);
  const email = cleanEmail(request.email);
  const entry = event?.entries.find((candidate) => candidate.playerId === playerId);
  if (!event || !entry || !email || entry.email !== email) throw officialError('Official tournament entry email does not match', 404, 'entry_not_found');
  const key = recoveryKey(event.id, playerId);
  const existing = await store.get(key, { type: 'json' }).catch(() => null);
  if (existing && now - Number(existing.windowStartedAt || 0) < 15 * 60 * 1000 && Number(existing.requestCount || 0) >= 3) throw officialError('Too many recovery requests. Try again later.', 429, 'recovery_throttled');
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const sameWindow = existing && now - Number(existing.windowStartedAt || 0) < 15 * 60 * 1000;
  const recovery = {
    tournamentId: event.id,
    playerId,
    email,
    codeHash: hashRecoveryCode(code, event.id, playerId),
    expiresAt: now + 15 * 60 * 1000,
    attempts: 0,
    requestCount: sameWindow ? Number(existing.requestCount || 0) + 1 : 1,
    windowStartedAt: sameWindow ? existing.windowStartedAt : now,
    createdAt: now
  };
  await store.setJSON(key, recovery);
  const emailSent = await sendTournamentEmail({
    to: email,
    subject: 'Your K.O.R.E. official tournament recovery code',
    html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#101114"><h1>Official tournament recovery</h1><p>Your one-time code is <strong style="font-size:24px;letter-spacing:4px">${code}</strong>.</p><p>It expires in 15 minutes. Only enter it inside K.O.R.E.</p></div>`
  });
  return { ok: true, email, emailSent, expiresAt: recovery.expiresAt };
}

export async function confirmOfficialTournamentRecovery(store, request, now = Date.now()) {
  let event = await readOfficialTournament(store, cleanId(request.tournamentId));
  const playerId = cleanId(request.playerId);
  const code = String(request.code || '').replace(/\D/g, '').slice(0, 6);
  const deviceId = cleanDeviceId(request.posthogDeviceId);
  const key = recoveryKey(event?.id, playerId);
  const recovery = event ? await store.get(key, { type: 'json' }).catch(() => null) : null;
  if (!event || !recovery || recovery.usedAt || recovery.expiresAt < now || !deviceId || code.length !== 6) throw officialError('Recovery code is invalid or expired', 403, 'invalid_recovery_code');
  if (Number(recovery.attempts || 0) >= 5) throw officialError('Too many recovery attempts', 429, 'recovery_attempts_exceeded');
  if (recovery.codeHash !== hashRecoveryCode(code, event.id, playerId)) {
    await store.setJSON(key, { ...recovery, attempts: Number(recovery.attempts || 0) + 1 });
    throw officialError('Recovery code is invalid', 403, 'invalid_recovery_code');
  }
  event = { ...event, entries: event.entries.map((entry) => entry.playerId === playerId ? { ...entry, registeredDeviceId: deviceId, recoveredAt: now } : entry), updatedAt: now };
  await writeOfficialTournament(store, event);
  await store.setJSON(key, { ...recovery, usedAt: now, recoveredDeviceId: deviceId });
  return officialStatus(event, playerId, deviceId, now);
}

export function officialStatus(event, playerId, posthogDeviceId, now = Date.now()) {
  const entry = event.entries.find((candidate) => candidate.playerId === cleanId(playerId));
  if (entry && posthogDeviceId && entry.registeredDeviceId !== cleanDeviceId(posthogDeviceId)) throw officialError('This entry is registered to a different device', 403, 'device_mismatch');
  const rawAssignedMatch = entry ? event.matches.find((match) => match.status === 'ready' && [match.entryAId, match.entryBId].includes(entry.id)) : undefined;
  const matchRoom = rawAssignedMatch && entry ? officialRoomView(event, rawAssignedMatch, entry, now) : undefined;
  const bracket = sanitizeOfficialStatusBracket(event, entry);
  const assignedMatch = rawAssignedMatch ? bracket.matches.find((match) => match.id === rawAssignedMatch.id) : undefined;
  return {
    bracket,
    entry,
    assignedMatch,
    matchRoom,
    confirmedEntries: primaryEntries(event).length,
    checkedInEntries: activeEntries(event).filter((candidate) => candidate.checkedInAt).length,
    entriesNeeded: Math.max(0, event.capacity - primaryEntries(event).length),
    registrationOpensAt: event.registrationOpensAt,
    checkInOpensAt: event.checkInOpensAt,
    checkInClosesAt: event.checkInClosesAt,
    startsAt: event.startsAt,
    statusText: entry ? officialEntryStatus(entry) : officialStartsLabel(event, now)
  };
}

function sanitizeOfficialStatusBracket(event, localEntry) {
  return {
    ...event,
    entries: event.entries.map(({ email, registeredDeviceId, ...entry }) => entry),
    matches: event.matches.map((match) => {
      const bothLocked = Boolean(match.entryAId && match.entryBId && match.fighterLocks?.[match.entryAId] && match.fighterLocks?.[match.entryBId]);
      const fighterLocks = bothLocked ? match.fighterLocks : localEntry && match.fighterLocks?.[localEntry.id] ? { [localEntry.id]: match.fighterLocks[localEntry.id] } : {};
      const { arrivals: _arrivals, pendingGameReports: _reports, ...safe } = match;
      return { ...safe, fighterLocks };
    })
  };
}

export function officialPublicView(event) {
  return {
    id: event.id,
    slug: event.slug || event.id,
    name: event.name,
    kind: event.kind,
    status: event.status,
    entries: activeEntries(event).map(({ id, displayName, characterId, seed }) => ({ id, displayName, characterId, seed })),
    matches: event.matches.map(({ fighterLocks, arrivals, pendingGameReports, ...match }) => match),
    currentRound: event.currentRound,
    capacity: event.capacity,
    minEntries: event.minEntries,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    rewardLabel: event.reward?.label,
    registrationOpensAt: event.registrationOpensAt,
    checkInOpensAt: event.checkInOpensAt,
    checkInClosesAt: event.checkInClosesAt,
    startsAt: event.startsAt,
    rulesVersion: event.rulesVersion,
    format: event.format,
    prizesUsd: event.prizesUsd,
    placements: event.placements
  };
}

function makeMatch(id, bracketSide, bracketRound, index, targetWins) {
  return { id, round: bracketRound, bracketRound, bracketSide, index, targetWins, setScore: {}, games: [], fighterLocks: {}, pendingGameReports: {}, status: 'pending', reportState: 'none' };
}

function route(matchId, slot) {
  return { matchId, slot };
}

function applyRoute(matches, target, entryId, now) {
  if (!target?.matchId || !entryId) return matches;
  return matches.map((match) => {
    if (match.id !== target.matchId) return match;
    const next = { ...match, [target.slot === 'A' ? 'entryAId' : 'entryBId']: entryId };
    return next.entryAId && next.entryBId ? readyOfficialMatch(next, now) : next;
  });
}

function readyOfficialMatch(match, now) {
  return {
    ...match,
    status: 'ready',
    roomId: match.roomId || `official:${match.id}:${now}`,
    roomStatus: 'pending',
    slotStartsAt: now,
    slotEndsAt: now + 2 * 60 * 60 * 1000,
    arrivalDeadlineAt: now + OFFICIAL_NO_SHOW_MS,
    arrivals: match.arrivals || {},
    reportState: 'none'
  };
}

function resolveOfficialNoShows(event, now) {
  let next = event;
  for (const match of next.matches) {
    if (match.status !== 'ready' || !match.arrivalDeadlineAt || now < match.arrivalDeadlineAt) continue;
    const arrived = [match.entryAId, match.entryBId].filter((entryId) => match.arrivals?.[entryId]);
    if (arrived.length === 2) continue;
    if (arrived.length === 0) {
      next = { ...next, matches: next.matches.map((candidate) => candidate.id === match.id ? { ...candidate, roomStatus: 'review', reportState: 'conflict' } : candidate), updatedAt: now };
      continue;
    }
    const forfeit = { ...match, status: 'completed', winnerEntryId: arrived[0], roomStatus: 'forfeit', reportState: 'forfeit', reportedAt: now };
    next = { ...next, matches: next.matches.map((candidate) => candidate.id === match.id ? forfeit : candidate), updatedAt: now };
    next = advanceOfficialSet(next, forfeit, now);
  }
  return next;
}

function completeOfficialTournament(event, first, second, now) {
  const placements = { ...(event.placements || {}), 1: first, 2: second };
  const awardByEntry = new Map([[first, 60], [second, 25], [placements[3], 15]]);
  const entries = event.entries.map((entry) => {
    const payoutAmountUsd = awardByEntry.get(entry.id);
    return payoutAmountUsd ? { ...entry, payoutState: 'rewardPending', payoutAmountUsd } : entry;
  });
  return { ...event, entries, placements, status: 'completed', completedAt: now, updatedAt: now, reward: { ...event.reward, state: 'pending' } };
}

function officialRoomView(event, match, entry, now) {
  const hostEntryId = match.entryAId;
  const guestEntryId = match.entryBId;
  const bothLocked = Boolean(match.fighterLocks?.[hostEntryId] && match.fighterLocks?.[guestEntryId]);
  return {
    tournamentId: event.id,
    matchId: match.id,
    roomId: match.roomId,
    slotStartsAt: match.slotStartsAt,
    slotEndsAt: match.slotEndsAt,
    arrivalDeadlineAt: match.arrivalDeadlineAt,
    status: match.roomStatus || (now > match.arrivalDeadlineAt ? 'closed' : 'waiting'),
    hostEntryId,
    guestEntryId,
    hostPeerId: match.arrivals?.[hostEntryId]?.peerId,
    guestPeerId: match.arrivals?.[guestEntryId]?.peerId,
    localRole: entry.id === hostEntryId ? 'host' : 'guest',
    fighterLocked: Boolean(match.fighterLocks?.[entry.id]),
    fightersRevealed: bothLocked,
    fighterLocks: bothLocked ? match.fighterLocks : { [entry.id]: match.fighterLocks?.[entry.id] },
    gameNumber: match.games.length + 1,
    setScore: match.setScore,
    targetWins: match.targetWins,
    stageId: bothLocked ? match.stageId : undefined
  };
}

function assertOfficialPlayer(event, playerId, posthogDeviceId) {
  const entry = event.entries.find((candidate) => candidate.playerId === cleanId(playerId));
  if (!entry) throw officialError('Official tournament entry not found', 404, 'entry_not_found');
  if (!posthogDeviceId || entry.registeredDeviceId !== cleanDeviceId(posthogDeviceId)) throw officialError('This entry is registered to a different device', 403, 'device_mismatch');
  return entry;
}

function assertAssignedReadyMatch(match, entry) {
  if (!match || match.status !== 'ready') throw officialError('Set is not ready', 409, 'match_not_ready');
  if (![match.entryAId, match.entryBId].includes(entry.id)) throw officialError('Entry is not assigned to this set', 403, 'match_not_assigned');
}

function primaryEntries(event) {
  return event.entries.filter((entry) => entry.registrationState === 'confirmed');
}

function waitlistEntries(event) {
  return event.entries.filter((entry) => entry.registrationState === 'waitlisted');
}

function activeEntries(event) {
  return event.entries.filter((entry) => ['confirmed', 'active'].includes(entry.registrationState));
}

function officialEntryStatus(entry) {
  if (entry.registrationState === 'waitlisted') return `Waitlist position ${entry.waitlistPosition}`;
  if (entry.registrationState === 'missedCheckIn') return 'Check-in missed; registration retained for rescheduling';
  if (entry.checkedInAt) return 'Checked in for K.O.R.E. Open Beta Cup #1';
  return 'Registered for K.O.R.E. Open Beta Cup #1';
}

function officialStartsLabel(event, now) {
  if (event.status === 'draft') return 'Draft event';
  if (event.status === 'postponed') return 'Postponed — new date coming';
  if (event.status === 'completed') return 'Tournament complete';
  if (event.status === 'roundActive') return 'Official bracket live';
  if (now < event.registrationOpensAt) return countdownLabel('Registration opens', event.registrationOpensAt - now);
  if (now < event.checkInOpensAt) return `Registration open · Check-in ${formatCentralDate(event.checkInOpensAt)}`;
  if (now < event.checkInClosesAt) return countdownLabel('Check-in closes', event.checkInClosesAt - now);
  return 'Waiting for official start';
}

function countdownLabel(prefix, remainingMs) {
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${prefix} in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.ceil(remainingMs / (60 * 60 * 1000));
  if (hours >= 1) return `${prefix} in ${hours} hour${hours === 1 ? '' : 's'}`;
  const minutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
  return `${prefix} in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function formatCentralDate(timestamp) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(timestamp);
}

function seedOrder(ids) {
  const ordered = [];
  for (let index = 0; index < ids.length / 2; index += 1) ordered.push(ids[index], ids[ids.length - 1 - index]);
  return ordered;
}

function deterministicStage(tournamentId, matchId, gameNumber) {
  const value = `${tournamentId}:${matchId}:${gameNumber}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return STAGE_POOL[hash % STAGE_POOL.length];
}

function eventKey(id) {
  return `events/${cleanId(id)}.json`;
}

function payoutKey(eventId, entryId) {
  return `payouts/${cleanId(eventId)}/${cleanId(entryId)}.json`;
}

function recoveryKey(eventId, playerId) {
  return `recovery/${cleanId(eventId)}/${cleanId(playerId)}.json`;
}

function hashRecoveryCode(code, tournamentId, playerId) {
  const secret = process.env.TOURNAMENT_RECOVERY_SECRET || process.env.TOURNAMENT_ADMIN_TOKEN || process.env.RESEND_API_KEY || 'kore-local-recovery';
  return createHash('sha256').update(`${secret}:${cleanId(tournamentId)}:${cleanId(playerId)}:${code}`).digest('hex');
}

function cleanDeviceId(value) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 160) : '';
}

function cleanPeerId(value) {
  return typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 180) : '';
}

function cleanEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanBolt11(value) {
  const invoice = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^ln(bc|tb|bcrt)[a-z0-9]+$/.test(invoice) ? invoice : '';
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

function requeueOfficialRegistrations(entries, capacity) {
  return [...entries]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((entry, index) => index < capacity
      ? { ...entry, registrationState: 'confirmed', seed: index + 1, waitlistPosition: undefined, checkedInAt: undefined }
      : { ...entry, registrationState: 'waitlisted', seed: 0, waitlistPosition: index - capacity + 1, checkedInAt: undefined });
}

function cleanTimestamp(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) return Math.round(number);
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanEventName(value) {
  return typeof value === 'string' ? value.replace(/[^\w .:'&()-]/g, '').trim().slice(0, 80) : '';
}

function isPowerOfTwo(value) {
  return value > 0 && (value & (value - 1)) === 0;
}

function officialLaunchReady(event) {
  return Boolean(event.prizeFundingConfirmedAt && event.legalApprovedAt && event.emailDeliveryConfirmedAt && lnbitsConfigured());
}

function officialError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}
