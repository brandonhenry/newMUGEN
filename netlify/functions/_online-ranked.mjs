export const RANKED_STARTING_KP = 1200;
export const RANKED_PLACEMENT_MATCHES = 10;
export const RANKED_PLACEMENT_START_ESTIMATE = 900;
export const RANKED_PLACEMENT_START_BOT_KP = 650;
const HISTORY_LIMIT = 25;
const RANKED_PLACEMENT_MIN_KP = 650;
const RANKED_PLACEMENT_MAX_KP = 2200;

export const RANKED_TIERS = [
  { id: 'unranked', name: 'Unranked', badgeId: 'badge-unranked', minKp: 0, maxKp: 1299 },
  { id: 'ember-fist', name: 'Ember Fist', badgeId: 'badge-ember-fist', minKp: 1300, maxKp: 1399 },
  { id: 'iron-surge', name: 'Iron Surge', badgeId: 'badge-iron-surge', minKp: 1400, maxKp: 1499 },
  { id: 'bronze-breaker', name: 'Bronze Breaker', badgeId: 'badge-bronze-breaker', minKp: 1500, maxKp: 1599 },
  { id: 'silver-vanguard', name: 'Silver Vanguard', badgeId: 'badge-silver-vanguard', minKp: 1600, maxKp: 1699 },
  { id: 'gold-sentinel', name: 'Gold Sentinel', badgeId: 'badge-gold-sentinel', minKp: 1700, maxKp: 1799 },
  { id: 'crimson-warlord', name: 'Crimson Warlord', badgeId: 'badge-crimson-warlord', minKp: 1800, maxKp: 1899 },
  { id: 'eclipse-master', name: 'Eclipse Master', badgeId: 'badge-eclipse-master', minKp: 1900, maxKp: 1999 },
  { id: 'kore-prime', name: 'KORE Prime', badgeId: 'badge-kore-prime', minKp: 2000 }
];

export const rankedKrKeys = ['aggression', 'defense', 'combo', 'punishment', 'resource', 'consistency'];

export function cleanProfile(value) {
  const playerId = cleanId(value?.playerId);
  const displayName = cleanName(value?.displayName);
  return playerId && displayName ? { playerId, displayName } : null;
}

export function getRankedTier(kp) {
  const normalized = cleanKp(kp);
  return [...RANKED_TIERS].reverse().find((tier) => normalized >= tier.minKp) || RANKED_TIERS[0];
}

export function makeDefaultRankedProfile(profile, now = Date.now()) {
  const tier = getRankedTier(RANKED_STARTING_KP);
  return {
    playerId: profile.playerId,
    displayName: profile.displayName,
    kp: RANKED_STARTING_KP,
    rank: tier,
    badgeId: tier.badgeId,
    totals: {
      matches: 0,
      wins: 0,
      losses: 0,
      damageDealt: 0,
      damageTaken: 0,
      cleanHits: 0,
      attacksAttempted: 0,
      blocks: 0,
      maxComboHits: 0
    },
    kr: emptyRankedKrScores(),
    placement: makeDefaultRankedPlacement(),
    history: [],
    updatedAt: now
  };
}

export function makeDefaultRankedPlacement() {
  return {
    requiredMatches: RANKED_PLACEMENT_MATCHES,
    matchesPlayed: 0,
    complete: false,
    ratingEstimate: RANKED_PLACEMENT_START_ESTIMATE,
    nextBotKp: RANKED_PLACEMENT_START_BOT_KP
  };
}

export function normalizeRankedProfile(value, now = Date.now()) {
  const profile = cleanProfile(value);
  if (!profile) return null;
  const base = makeDefaultRankedProfile(profile, now);
  const kp = cleanKp(value?.kp || base.kp);
  const tier = getRankedTier(kp);
  const totals = {
    ...base.totals,
    ...value?.totals,
    matches: cleanCount(value?.totals?.matches),
    wins: cleanCount(value?.totals?.wins),
    losses: cleanCount(value?.totals?.losses),
    damageDealt: cleanCount(value?.totals?.damageDealt),
    damageTaken: cleanCount(value?.totals?.damageTaken),
    cleanHits: cleanCount(value?.totals?.cleanHits),
    attacksAttempted: cleanCount(value?.totals?.attacksAttempted),
    blocks: cleanCount(value?.totals?.blocks),
    maxComboHits: cleanCount(value?.totals?.maxComboHits)
  };
  const history = Array.isArray(value?.history) ? value.history.slice(0, HISTORY_LIMIT) : [];
  return {
    ...base,
    ...value,
    ...profile,
    kp,
    rank: tier,
    badgeId: tier.badgeId,
    totals,
    kr: normalizeKrScores(value?.kr),
    placement: normalizePlacementState(value?.placement, kp, totals.matches, history.length),
    history,
    updatedAt: cleanCount(value?.updatedAt || now)
  };
}

export function applyRankedMatchReport(sourceProfiles, report, now = Date.now()) {
  const reportId = normalizeReportId(report);
  const beforeProfiles = sourceProfiles.map((profile, index) => normalizeRankedProfile({
    ...profile,
    ...report.players[index].profile,
    displayName: report.players[index].profile.displayName
  }, now));
  const perfScores = report.players.map((player, index) => calculateMechanicScores(player.stats, player.profile.playerId === report.winnerPlayerId, report.players[index].roundsWon));
  const deltas = report.players.map((player, index) => {
    const opponent = beforeProfiles[index === 0 ? 1 : 0];
    const opponentReport = report.players[index === 0 ? 1 : 0];
    const didWin = player.profile.playerId === report.winnerPlayerId;
    const mechanicEdge = averageKr(perfScores[index]) - averageKr(perfScores[index === 0 ? 1 : 0]);
    if (isPlacementReportForPlayer(report, player.profile.playerId, opponentReport)) {
      return calculatePlacementKpDelta(beforeProfiles[index].placement.ratingEstimate, opponent.kp, didWin, mechanicEdge, player.roundsWon - opponentReport.roundsWon);
    }
    const rawDelta = calculateRankedKpDelta(beforeProfiles[index].kp, opponent.kp, didWin, mechanicEdge);
    return opponentReport.isBot ? reduceBotKpDelta(rawDelta, didWin) : rawDelta;
  });
  const players = beforeProfiles.map((before, index) => {
    const playerReport = report.players[index];
    const opponentBefore = beforeProfiles[index === 0 ? 1 : 0];
    const opponentReport = report.players[index === 0 ? 1 : 0];
    const didWin = playerReport.profile.playerId === report.winnerPlayerId;
    const placementResult = makePlacementResult(before.placement, report, playerReport, opponentReport, perfScores[index], perfScores[index === 0 ? 1 : 0], didWin);
    const beforeDisplayKp = placementResult ? placementResult.beforeRatingEstimate : before.kp;
    const afterDisplayKp = placementResult ? placementResult.afterRatingEstimate : Math.max(0, before.kp + deltas[index]);
    const profileKp = placementResult ? (placementResult.complete ? placementResult.afterRatingEstimate : before.kp) : afterDisplayKp;
    const beforeRank = getRankedTier(beforeDisplayKp);
    const afterRank = getRankedTier(afterDisplayKp);
    const profileRank = getRankedTier(profileKp);
    const afterKr = rollKrScores(before.kr, perfScores[index], Boolean(opponentReport.isBot));
    const krDelta = diffKrScores(before.kr, afterKr);
    const historyEntry = {
      id: reportId,
      playedAt: report.submittedAt || now,
      stageId: report.stageId,
      result: didWin ? 'win' : 'loss',
      kpDelta: deltas[index],
      beforeKp: beforeDisplayKp,
      afterKp: afterDisplayKp,
      beforeRankName: beforeRank.name,
      afterRankName: afterRank.name,
      left: {
        playerId: before.playerId,
        displayName: before.displayName,
        characterId: playerReport.characterId,
        kp: afterDisplayKp,
        rankName: afterRank.name,
        roundsWon: playerReport.roundsWon
      },
      right: {
        playerId: opponentBefore.playerId,
        displayName: opponentBefore.displayName,
        characterId: opponentReport.characterId,
        kp: opponentBefore.kp,
        rankName: getRankedTier(opponentBefore.kp).name,
        roundsWon: opponentReport.roundsWon
      }
    };
    const profile = {
      ...before,
      displayName: playerReport.profile.displayName,
      kp: profileKp,
      rank: profileRank,
      badgeId: profileRank.badgeId,
      totals: {
        matches: before.totals.matches + 1,
        wins: before.totals.wins + (didWin ? 1 : 0),
        losses: before.totals.losses + (didWin ? 0 : 1),
        damageDealt: before.totals.damageDealt + cleanCount(playerReport.stats.damageDealt),
        damageTaken: before.totals.damageTaken + cleanCount(playerReport.stats.damageTaken),
        cleanHits: before.totals.cleanHits + cleanCount(playerReport.stats.cleanHits),
        attacksAttempted: before.totals.attacksAttempted + cleanCount(playerReport.stats.attacksAttempted),
        blocks: before.totals.blocks + cleanCount((playerReport.stats.blocks || 0) + (playerReport.stats.blockedHits || 0)),
        maxComboHits: Math.max(before.totals.maxComboHits, cleanCount(playerReport.stats.maxComboHits))
      },
      kr: afterKr,
      placement: placementResult
        ? {
          requiredMatches: placementResult.requiredMatches,
          matchesPlayed: placementResult.afterMatchesPlayed,
          complete: placementResult.complete,
          ratingEstimate: placementResult.afterRatingEstimate,
          nextBotKp: placementResult.nextBotKp
        }
        : before.placement,
      history: [historyEntry, ...before.history.filter((item) => item.id !== historyEntry.id)].slice(0, HISTORY_LIMIT),
      updatedAt: now
    };
    return {
      playerId: before.playerId,
      displayName: profile.displayName,
      didWin,
      beforeKp: beforeDisplayKp,
      afterKp: afterDisplayKp,
      kpDelta: deltas[index],
      beforeRank,
      afterRank,
      beforeKr: before.kr,
      afterKr,
      krDelta,
      promoted: placementResult?.complete ? tierIndex(afterRank) > tierIndex(beforeRank) : !placementResult && tierIndex(afterRank) > tierIndex(beforeRank),
      demoted: placementResult?.complete ? tierIndex(afterRank) < tierIndex(beforeRank) : !placementResult && tierIndex(afterRank) < tierIndex(beforeRank),
      placement: placementResult,
      historyEntry,
      profile
    };
  });
  return { reportId, players };
}

export function cleanRankedReport(value) {
  const players = Array.isArray(value?.players) ? value.players.map(cleanPlayerReport).filter(Boolean) : [];
  const winnerPlayerId = cleanId(value?.winnerPlayerId);
  const roomId = cleanId(value?.roomId);
  const stageId = cleanId(value?.stageId);
  if (players.length !== 2 || !winnerPlayerId || !roomId || !stageId || !players.some((player) => player.profile.playerId === winnerPlayerId)) return null;
  const placement = cleanPlacementReport(value?.placement, players);
  if (value?.placement && !placement) return null;
  return {
    reportId: cleanId(value?.reportId) || [roomId, winnerPlayerId, ...players.map((player) => player.profile.playerId).sort()].join(':'),
    roomId,
    stageId,
    winnerPlayerId,
    submittedAt: cleanCount(value?.submittedAt || Date.now()),
    placement,
    players
  };
}

function cleanPlacementReport(value, players) {
  if (!value) return undefined;
  const playerId = cleanId(value?.playerId);
  const playerIndex = players.findIndex((player) => player.profile.playerId === playerId);
  const opponent = playerIndex >= 0 ? players[playerIndex === 0 ? 1 : 0] : null;
  if (!playerId || !opponent?.isBot) return null;
  return {
    playerId,
    matchNumber: cleanCount(value?.matchNumber),
    requiredMatches: cleanCount(value?.requiredMatches || RANKED_PLACEMENT_MATCHES),
    botKp: cleanKp(value?.botKp),
    ratingEstimate: cleanKp(value?.ratingEstimate)
  };
}

function cleanPlayerReport(value) {
  const profile = cleanProfile(value?.profile);
  const characterId = cleanId(value?.characterId);
  if (!profile || !characterId) return null;
  return {
    profile,
    characterId,
    isBot: Boolean(value?.isBot),
    botKp: cleanKp(value?.botKp),
    botKr: normalizeKrScores(value?.botKr),
    roundsWon: cleanCount(value?.roundsWon),
    stats: cleanStats(value?.stats)
  };
}

function cleanStats(value) {
  return {
    damageDealt: cleanCount(value?.damageDealt),
    damageTaken: cleanCount(value?.damageTaken),
    cleanHits: cleanCount(value?.cleanHits),
    blockedHits: cleanCount(value?.blockedHits),
    attacksAttempted: cleanCount(value?.attacksAttempted),
    whiffs: cleanCount(value?.whiffs),
    blocks: cleanCount(value?.blocks),
    maxComboHits: cleanCount(value?.maxComboHits),
    punishes: cleanCount(value?.punishes),
    whiffPunishes: cleanCount(value?.whiffPunishes),
    specials: cleanCount(value?.specials),
    launchers: cleanCount(value?.launchers),
    juggleHits: cleanCount(value?.juggleHits),
    tornadoes: cleanCount(value?.tornadoes),
    kiBursts: cleanCount(value?.kiBursts),
    forwardPressureFrames: cleanCount(value?.forwardPressureFrames),
    matchDurationFrames: cleanCount(value?.matchDurationFrames),
    roundsWon: cleanCount(value?.roundsWon)
  };
}

function calculateRankedKpDelta(playerKp, opponentKp, didWin, mechanicEdge) {
  const expected = 1 / (1 + Math.pow(10, (cleanKp(opponentKp) - cleanKp(playerKp)) / 400));
  const raw = Math.round(32 * ((didWin ? 1 : 0) - expected) + clampNumber(mechanicEdge * 0.28, -8, 8));
  if (didWin) return clampNumber(Math.max(6, raw), 6, 45);
  return clampNumber(Math.min(-4, raw), -38, -4);
}

function calculateMechanicScores(stats, didWin, roundsWon) {
  const hitRate = stats.attacksAttempted > 0 ? stats.cleanHits / stats.attacksAttempted : 0;
  const damageSafety = 1 - Math.min(1, stats.damageTaken / 240);
  return {
    aggression: clampScore(stats.damageDealt * 0.34 + stats.cleanHits * 4 + stats.forwardPressureFrames / 18 + stats.attacksAttempted * 1.2),
    defense: clampScore(damageSafety * 42 + stats.blocks * 8 + stats.blockedHits * 3 + Math.max(0, roundsWon) * 4),
    combo: clampScore(stats.maxComboHits * 11 + stats.launchers * 8 + stats.juggleHits * 4 + stats.tornadoes * 10),
    punishment: clampScore(stats.punishes * 18 + stats.whiffPunishes * 22),
    resource: clampScore(stats.specials * 8 + stats.kiBursts * 14 + stats.roundsWon * 5),
    consistency: clampScore(hitRate * 55 + Math.min(30, stats.damageDealt / 6) + (didWin ? 12 : 0) + roundsWon * 4)
  };
}

function emptyRankedKrScores(value = 50) {
  return Object.fromEntries(rankedKrKeys.map((key) => [key, value]));
}

function normalizeKrScores(value) {
  const base = emptyRankedKrScores();
  return Object.fromEntries(rankedKrKeys.map((key) => [key, clampScore(value?.[key] ?? base[key])]));
}

function rollKrScores(current, matchScores, reduced = false) {
  return Object.fromEntries(rankedKrKeys.map((key) => {
    const blended = reduced
      ? current[key] * 0.92 + matchScores[key] * 0.08
      : current[key] * 0.82 + matchScores[key] * 0.18;
    const capped = reduced ? current[key] + clampNumber(blended - current[key], -4, 4) : blended;
    return [key, clampScore(capped)];
  }));
}

function makePlacementResult(before, report, playerReport, opponentReport, playerScores, opponentScores, didWin) {
  if (!isPlacementReportForPlayer(report, playerReport.profile.playerId, opponentReport)) return undefined;
  const beforeRatingEstimate = before.ratingEstimate;
  const mechanicEdge = averageKr(playerScores) - averageKr(opponentScores);
  const roundEdge = playerReport.roundsWon - opponentReport.roundsWon;
  const delta = calculatePlacementKpDelta(beforeRatingEstimate, cleanKp(opponentReport.botKp), didWin, mechanicEdge, roundEdge);
  const afterRatingEstimate = clampNumber(beforeRatingEstimate + delta, RANKED_PLACEMENT_MIN_KP, RANKED_PLACEMENT_MAX_KP);
  const requiredMatches = Math.max(1, before.requiredMatches || RANKED_PLACEMENT_MATCHES);
  const afterMatchesPlayed = Math.min(requiredMatches, before.matchesPlayed + 1);
  const complete = afterMatchesPlayed >= requiredMatches;
  return {
    requiredMatches,
    beforeMatchesPlayed: before.matchesPlayed,
    afterMatchesPlayed,
    complete,
    beforeRatingEstimate,
    afterRatingEstimate,
    nextBotKp: complete
      ? afterRatingEstimate
      : calculateNextPlacementBotKp(afterRatingEstimate, didWin, mechanicEdge, roundEdge)
  };
}

function isPlacementReportForPlayer(report, playerId, opponentReport) {
  return Boolean(report.placement && report.placement.playerId === playerId && opponentReport.isBot);
}

function calculatePlacementKpDelta(playerKp, opponentKp, didWin, mechanicEdge, roundEdge) {
  const expected = 1 / (1 + Math.pow(10, (cleanKp(opponentKp) - cleanKp(playerKp)) / 400));
  const mechanicModifier = clampNumber(mechanicEdge * 0.55, -22, 22);
  const roundModifier = clampNumber(roundEdge * 14, -28, 28);
  return clampNumber(Math.round(110 * ((didWin ? 1 : 0) - expected) + mechanicModifier + roundModifier), -95, 155);
}

function calculateNextPlacementBotKp(ratingEstimate, didWin, mechanicEdge, roundEdge) {
  const directionalStep = didWin ? 110 : -90;
  const performanceStep = clampNumber(mechanicEdge * 1.1 + roundEdge * 24, -90, 90);
  return clampNumber(ratingEstimate + directionalStep + performanceStep, RANKED_PLACEMENT_MIN_KP, RANKED_PLACEMENT_MAX_KP);
}

function normalizePlacementState(value, kp, matches, historyLength) {
  const base = makeDefaultRankedPlacement();
  if (!value) {
    const legacyComplete = matches > 0 || historyLength > 0;
    return legacyComplete
      ? {
        requiredMatches: RANKED_PLACEMENT_MATCHES,
        matchesPlayed: RANKED_PLACEMENT_MATCHES,
        complete: true,
        ratingEstimate: kp,
        nextBotKp: kp
      }
      : base;
  }
  const requiredMatches = Math.max(1, cleanCount(value.requiredMatches || RANKED_PLACEMENT_MATCHES));
  const matchesPlayed = Math.min(requiredMatches, cleanCount(value.matchesPlayed));
  const complete = Boolean(value.complete) || matchesPlayed >= requiredMatches;
  const ratingEstimate = clampNumber(cleanKp(value.ratingEstimate ?? (complete ? kp : base.ratingEstimate)), RANKED_PLACEMENT_MIN_KP, RANKED_PLACEMENT_MAX_KP);
  return {
    requiredMatches,
    matchesPlayed,
    complete,
    ratingEstimate,
    nextBotKp: complete
      ? ratingEstimate
      : clampNumber(cleanKp(value.nextBotKp ?? base.nextBotKp), RANKED_PLACEMENT_MIN_KP, RANKED_PLACEMENT_MAX_KP)
  };
}

function reduceBotKpDelta(delta, didWin) {
  const scaled = Math.round(delta * 0.5);
  return didWin
    ? clampNumber(Math.max(3, scaled), 3, 12)
    : clampNumber(Math.min(-2, scaled), -10, -2);
}

function diffKrScores(before, after) {
  return Object.fromEntries(rankedKrKeys.map((key) => [key, Math.round(after[key] - before[key])]));
}

function averageKr(scores) {
  return rankedKrKeys.reduce((sum, key) => sum + scores[key], 0) / rankedKrKeys.length;
}

function tierIndex(tier) {
  return RANKED_TIERS.findIndex((item) => item.id === tier.id);
}

function normalizeReportId(report) {
  return [report.roomId, report.winnerPlayerId, ...report.players.map((player) => player.profile.playerId).sort()].join(':');
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 128);
}

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

function cleanKp(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function cleanCount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
