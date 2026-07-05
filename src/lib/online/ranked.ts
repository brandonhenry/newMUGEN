import type { OnlinePlayerProfile } from './leaderboard';
import type { OnlinePerformanceStats } from './performanceScoring';

export const RANKED_STARTING_KP = 1200;
const LOCAL_RANKED_STORAGE_KEY = 'kore.online.rankedProfile';
const HISTORY_LIMIT = 25;

export type RankedKrKey = 'aggression' | 'defense' | 'combo' | 'punishment' | 'resource' | 'consistency';

export type RankedKrScores = Record<RankedKrKey, number>;

export type RankedTier = {
  id: string;
  name: string;
  badgeId: string;
  minKp: number;
  maxKp?: number;
};

export type RankedProfile = OnlinePlayerProfile & {
  kp: number;
  rank: RankedTier;
  badgeId: string;
  totals: {
    matches: number;
    wins: number;
    losses: number;
    damageDealt: number;
    damageTaken: number;
    cleanHits: number;
    attacksAttempted: number;
    blocks: number;
    maxComboHits: number;
  };
  kr: RankedKrScores;
  history: RankedMatchHistoryEntry[];
  updatedAt: number;
};

export type RankedMatchPlayerReport = {
  profile: OnlinePlayerProfile;
  characterId: string;
  stats: OnlinePerformanceStats;
  roundsWon: number;
  isBot?: boolean;
  botKp?: number;
  botKr?: Partial<RankedKrScores>;
};

export type RankedMatchReport = {
  reportId: string;
  roomId: string;
  stageId: string;
  winnerPlayerId: string;
  submittedAt: number;
  players: [RankedMatchPlayerReport, RankedMatchPlayerReport];
};

export type RankedMatchHistoryEntry = {
  id: string;
  playedAt: number;
  stageId: string;
  result: 'win' | 'loss';
  kpDelta: number;
  beforeKp: number;
  afterKp: number;
  beforeRankName: string;
  afterRankName: string;
  left: {
    playerId: string;
    displayName: string;
    characterId: string;
    kp: number;
    rankName: string;
    roundsWon: number;
  };
  right: {
    playerId: string;
    displayName: string;
    characterId: string;
    kp: number;
    rankName: string;
    roundsWon: number;
  };
};

export type RankedPlayerResult = {
  playerId: string;
  displayName: string;
  didWin: boolean;
  beforeKp: number;
  afterKp: number;
  kpDelta: number;
  beforeRank: RankedTier;
  afterRank: RankedTier;
  beforeKr: RankedKrScores;
  afterKr: RankedKrScores;
  krDelta: RankedKrScores;
  promoted: boolean;
  demoted: boolean;
  historyEntry: RankedMatchHistoryEntry;
  profile: RankedProfile;
};

export type RankedSubmitResult = {
  reportId: string;
  players: [RankedPlayerResult, RankedPlayerResult];
};

type RankedLocalStore = {
  profiles: Record<string, RankedProfile>;
  reports: Record<string, RankedSubmitResult>;
};

export const RANKED_TIERS: RankedTier[] = [
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

export const rankedKrLabels: Record<RankedKrKey, string> = {
  aggression: 'Aggression',
  defense: 'Defense',
  combo: 'Combo',
  punishment: 'Punishment',
  resource: 'Resource',
  consistency: 'Consistency'
};

export const rankedKrKeys = Object.keys(rankedKrLabels) as RankedKrKey[];

export function getRankedTier(kp: number): RankedTier {
  const normalized = normalizeKp(kp);
  return [...RANKED_TIERS].reverse().find((tier) => normalized >= tier.minKp) ?? RANKED_TIERS[0];
}

export function emptyRankedKrScores(value = 50): RankedKrScores {
  return {
    aggression: value,
    defense: value,
    combo: value,
    punishment: value,
    resource: value,
    consistency: value
  };
}

export function makeDefaultRankedProfile(profile: OnlinePlayerProfile, now = Date.now()): RankedProfile {
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
    history: [],
    updatedAt: now
  };
}

export async function fetchRankedProfile(profile: OnlinePlayerProfile): Promise<RankedProfile> {
  return postJson<RankedProfile>('/.netlify/functions/online-ranked-profile', { profile }).catch((error) => {
    if (isLocalFallbackAllowed()) return localFetchRankedProfile(profile);
    throw error;
  });
}

export async function submitRankedMatchReport(report: RankedMatchReport): Promise<RankedSubmitResult> {
  return postJson<RankedSubmitResult>('/.netlify/functions/online-ranked-submit', report).catch((error) => {
    if (isLocalFallbackAllowed()) return localSubmitRankedMatchReport(report);
    throw error;
  });
}

export function applyRankedMatchReport(
  sourceProfiles: [RankedProfile, RankedProfile],
  report: RankedMatchReport,
  now = Date.now()
): RankedSubmitResult {
  const reportId = normalizeReportId(report);
  const beforeProfiles = sourceProfiles.map((profile, index) => normalizeRankedProfile({
    ...profile,
    ...report.players[index].profile,
    displayName: report.players[index].profile.displayName
  }, now)) as [RankedProfile, RankedProfile];
  const perfScores = report.players.map((player, index) => calculateMechanicScores(player.stats, player.profile.playerId === report.winnerPlayerId, report.players[index].roundsWon));
  const deltas = report.players.map((player, index) => {
    const opponent = beforeProfiles[index === 0 ? 1 : 0];
    const didWin = player.profile.playerId === report.winnerPlayerId;
    const mechanicEdge = averageKr(perfScores[index]) - averageKr(perfScores[index === 0 ? 1 : 0]);
    const rawDelta = calculateRankedKpDelta(beforeProfiles[index].kp, opponent.kp, didWin, mechanicEdge);
    return report.players[index === 0 ? 1 : 0].isBot ? reduceBotKpDelta(rawDelta, didWin) : rawDelta;
  }) as [number, number];

  const results = beforeProfiles.map((before, index) => {
    const playerReport = report.players[index];
    const opponentBefore = beforeProfiles[index === 0 ? 1 : 0];
    const opponentReport = report.players[index === 0 ? 1 : 0];
    const didWin = playerReport.profile.playerId === report.winnerPlayerId;
    const afterKp = Math.max(0, before.kp + deltas[index]);
    const beforeRank = getRankedTier(before.kp);
    const afterRank = getRankedTier(afterKp);
    const afterKr = rollKrScores(before.kr, perfScores[index], Boolean(opponentReport.isBot));
    const krDelta = diffKrScores(before.kr, afterKr);
    const historyEntry: RankedMatchHistoryEntry = {
      id: reportId,
      playedAt: report.submittedAt || now,
      stageId: report.stageId,
      result: didWin ? 'win' : 'loss',
      kpDelta: deltas[index],
      beforeKp: before.kp,
      afterKp,
      beforeRankName: beforeRank.name,
      afterRankName: afterRank.name,
      left: {
        playerId: before.playerId,
        displayName: before.displayName,
        characterId: playerReport.characterId,
        kp: afterKp,
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
    const profile: RankedProfile = {
      ...before,
      displayName: playerReport.profile.displayName,
      kp: afterKp,
      rank: afterRank,
      badgeId: afterRank.badgeId,
      totals: {
        matches: before.totals.matches + 1,
        wins: before.totals.wins + (didWin ? 1 : 0),
        losses: before.totals.losses + (didWin ? 0 : 1),
        damageDealt: before.totals.damageDealt + Math.max(0, playerReport.stats.damageDealt),
        damageTaken: before.totals.damageTaken + Math.max(0, playerReport.stats.damageTaken),
        cleanHits: before.totals.cleanHits + Math.max(0, playerReport.stats.cleanHits),
        attacksAttempted: before.totals.attacksAttempted + Math.max(0, playerReport.stats.attacksAttempted),
        blocks: before.totals.blocks + Math.max(0, playerReport.stats.blocks + playerReport.stats.blockedHits),
        maxComboHits: Math.max(before.totals.maxComboHits, playerReport.stats.maxComboHits)
      },
      kr: afterKr,
      history: [historyEntry, ...before.history.filter((item) => item.id !== historyEntry.id)].slice(0, HISTORY_LIMIT),
      updatedAt: now
    };
    return {
      playerId: before.playerId,
      displayName: profile.displayName,
      didWin,
      beforeKp: before.kp,
      afterKp,
      kpDelta: deltas[index],
      beforeRank,
      afterRank,
      beforeKr: before.kr,
      afterKr,
      krDelta,
      promoted: tierIndex(afterRank) > tierIndex(beforeRank),
      demoted: tierIndex(afterRank) < tierIndex(beforeRank),
      historyEntry,
      profile
    };
  }) as [RankedPlayerResult, RankedPlayerResult];

  return { reportId, players: results };
}

export function calculateRankedKpDelta(playerKp: number, opponentKp: number, didWin: boolean, mechanicEdge: number): number {
  const expected = 1 / (1 + Math.pow(10, (normalizeKp(opponentKp) - normalizeKp(playerKp)) / 400));
  const outcome = didWin ? 1 : 0;
  const mechanicModifier = clampNumber(mechanicEdge * 0.28, -8, 8);
  const raw = Math.round(32 * (outcome - expected) + mechanicModifier);
  if (didWin) return clampNumber(Math.max(6, raw), 6, 45);
  return clampNumber(Math.min(-4, raw), -38, -4);
}

export function calculateMechanicScores(stats: OnlinePerformanceStats, didWin: boolean, roundsWon: number): RankedKrScores {
  const hitRate = stats.attacksAttempted > 0 ? stats.cleanHits / stats.attacksAttempted : 0;
  const damageSafety = 1 - Math.min(1, stats.damageTaken / 240);
  const comboScore = stats.maxComboHits * 11 + stats.launchers * 8 + stats.juggleHits * 4 + stats.tornadoes * 10;
  const punishScore = stats.punishes * 18 + stats.whiffPunishes * 22;
  const resourceScore = stats.specials * 8 + stats.kiBursts * 14 + stats.roundsWon * 5;
  return {
    aggression: clampRankedScore(stats.damageDealt * 0.34 + stats.cleanHits * 4 + stats.forwardPressureFrames / 18 + stats.attacksAttempted * 1.2),
    defense: clampRankedScore(damageSafety * 42 + stats.blocks * 8 + stats.blockedHits * 3 + Math.max(0, roundsWon) * 4),
    combo: clampRankedScore(comboScore),
    punishment: clampRankedScore(punishScore),
    resource: clampRankedScore(resourceScore),
    consistency: clampRankedScore(hitRate * 55 + Math.min(30, stats.damageDealt / 6) + (didWin ? 12 : 0) + roundsWon * 4)
  };
}

export function normalizeRankedProfile(value: Partial<RankedProfile> & OnlinePlayerProfile, now = Date.now()): RankedProfile {
  const base = makeDefaultRankedProfile(value, now);
  const kp = normalizeKp(value.kp ?? base.kp);
  const tier = getRankedTier(kp);
  return {
    ...base,
    ...value,
    playerId: value.playerId,
    displayName: value.displayName,
    kp,
    rank: tier,
    badgeId: tier.badgeId,
    totals: {
      ...base.totals,
      ...value.totals,
      matches: normalizeCount(value.totals?.matches),
      wins: normalizeCount(value.totals?.wins),
      losses: normalizeCount(value.totals?.losses),
      damageDealt: normalizeCount(value.totals?.damageDealt),
      damageTaken: normalizeCount(value.totals?.damageTaken),
      cleanHits: normalizeCount(value.totals?.cleanHits),
      attacksAttempted: normalizeCount(value.totals?.attacksAttempted),
      blocks: normalizeCount(value.totals?.blocks),
      maxComboHits: normalizeCount(value.totals?.maxComboHits)
    },
    kr: normalizeKrScores(value.kr),
    history: Array.isArray(value.history) ? value.history.slice(0, HISTORY_LIMIT) : [],
    updatedAt: normalizeCount(value.updatedAt || now)
  };
}

function rollKrScores(current: RankedKrScores, matchScores: RankedKrScores, reduced = false): RankedKrScores {
  return rankedKrKeys.reduce((next, key) => {
    const blended = reduced
      ? current[key] * 0.92 + matchScores[key] * 0.08
      : current[key] * 0.82 + matchScores[key] * 0.18;
    const capped = reduced
      ? current[key] + clampNumber(blended - current[key], -4, 4)
      : blended;
    next[key] = clampRankedScore(capped);
    return next;
  }, {} as RankedKrScores);
}

function reduceBotKpDelta(delta: number, didWin: boolean) {
  const scaled = Math.round(delta * 0.5);
  return didWin
    ? clampNumber(Math.max(3, scaled), 3, 12)
    : clampNumber(Math.min(-2, scaled), -10, -2);
}

function diffKrScores(before: RankedKrScores, after: RankedKrScores): RankedKrScores {
  return rankedKrKeys.reduce((next, key) => {
    next[key] = Math.round(after[key] - before[key]);
    return next;
  }, {} as RankedKrScores);
}

function normalizeKrScores(value: Partial<RankedKrScores> | undefined): RankedKrScores {
  const base = emptyRankedKrScores();
  return rankedKrKeys.reduce((next, key) => {
    next[key] = clampRankedScore(value?.[key] ?? base[key]);
    return next;
  }, {} as RankedKrScores);
}

function averageKr(scores: RankedKrScores) {
  return rankedKrKeys.reduce((sum, key) => sum + scores[key], 0) / rankedKrKeys.length;
}

function tierIndex(tier: RankedTier) {
  return RANKED_TIERS.findIndex((item) => item.id === tier.id);
}

function normalizeReportId(report: RankedMatchReport) {
  return [report.roomId, report.winnerPlayerId, ...report.players.map((player) => player.profile.playerId).sort()].join(':');
}

async function postJson<T = unknown>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Ranked request failed: ${response.status}`);
  return (await response.json()) as T;
}

function isLocalFallbackAllowed() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function localFetchRankedProfile(profile: OnlinePlayerProfile): RankedProfile {
  const store = readLocalRankedStore();
  const existing = store.profiles[profile.playerId];
  const next = normalizeRankedProfile(existing ? { ...existing, displayName: profile.displayName } : makeDefaultRankedProfile(profile));
  store.profiles[profile.playerId] = next;
  writeLocalRankedStore(store);
  return next;
}

function localSubmitRankedMatchReport(report: RankedMatchReport): RankedSubmitResult {
  const store = readLocalRankedStore();
  const reportId = normalizeReportId(report);
  if (store.reports[reportId]) return store.reports[reportId];
  const profiles = report.players.map((player) => (
    player.isBot
      ? normalizeRankedProfile({
        ...makeDefaultRankedProfile(player.profile),
        kp: player.botKp,
        kr: normalizeKrScores(player.botKr)
      })
      :
    store.profiles[player.profile.playerId]
      ? normalizeRankedProfile({ ...store.profiles[player.profile.playerId], displayName: player.profile.displayName })
      : makeDefaultRankedProfile(player.profile)
  )) as [RankedProfile, RankedProfile];
  const result = applyRankedMatchReport(profiles, report);
  result.players.forEach((player, index) => {
    if (!report.players[index].isBot) store.profiles[player.playerId] = player.profile;
  });
  store.reports[reportId] = result;
  writeLocalRankedStore(store);
  return result;
}

function readLocalRankedStore(): RankedLocalStore {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_RANKED_STORAGE_KEY) ?? '{}') as Partial<RankedLocalStore>;
    return {
      profiles: parsed.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
      reports: parsed.reports && typeof parsed.reports === 'object' ? parsed.reports : {}
    };
  } catch {
    return { profiles: {}, reports: {} };
  }
}

function writeLocalRankedStore(store: RankedLocalStore) {
  window.localStorage.setItem(LOCAL_RANKED_STORAGE_KEY, JSON.stringify(store));
}

function normalizeKp(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function normalizeCount(value: unknown) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function clampRankedScore(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
