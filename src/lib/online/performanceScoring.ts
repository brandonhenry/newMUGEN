import type { CombatPopupEvent, ImpactSparkEvent } from '../../types';

export type OnlinePerformanceStats = {
  damageDealt: number;
  damageTaken: number;
  cleanHits: number;
  blockedHits: number;
  attacksAttempted: number;
  whiffs: number;
  blocks: number;
  maxComboHits: number;
  punishes: number;
  whiffPunishes: number;
  specials: number;
  launchers: number;
  juggleHits: number;
  tornadoes: number;
  kiBursts: number;
  forwardPressureFrames: number;
  matchDurationFrames: number;
  roundsWon: number;
};

export function emptyOnlinePerformanceStats(): OnlinePerformanceStats {
  return {
    damageDealt: 0,
    damageTaken: 0,
    cleanHits: 0,
    blockedHits: 0,
    attacksAttempted: 0,
    whiffs: 0,
    blocks: 0,
    maxComboHits: 0,
    punishes: 0,
    whiffPunishes: 0,
    specials: 0,
    launchers: 0,
    juggleHits: 0,
    tornadoes: 0,
    kiBursts: 0,
    forwardPressureFrames: 0,
    matchDurationFrames: 0,
    roundsWon: 0
  };
}

export function emptyOnlinePerformancePair(): [OnlinePerformanceStats, OnlinePerformanceStats] {
  return [emptyOnlinePerformanceStats(), emptyOnlinePerformanceStats()];
}

export function addImpactEventToOnlineStats(stats: OnlinePerformanceStats, event: ImpactSparkEvent, perspectiveSlot: 1 | 2): OnlinePerformanceStats {
  if (event.kind === 'block') {
    if (event.defenderSlot === perspectiveSlot) return { ...stats, blockedHits: stats.blockedHits + 1, blocks: stats.blocks + 1 };
    if (event.attackerSlot === perspectiveSlot) return { ...stats, attacksAttempted: stats.attacksAttempted + 1 };
    return stats;
  }
  if (event.defenderSlot === perspectiveSlot) {
    return {
      ...stats,
      damageTaken: stats.damageTaken + Math.max(0, event.damage)
    };
  }
  if (event.attackerSlot !== perspectiveSlot) return stats;
  return {
    ...stats,
    damageDealt: stats.damageDealt + Math.max(0, event.damage),
    cleanHits: stats.cleanHits + 1,
    attacksAttempted: stats.attacksAttempted + 1,
    punishes: stats.punishes + (event.kind === 'punish' ? 1 : 0),
    whiffPunishes: stats.whiffPunishes + (event.kind === 'whiffPunish' ? 1 : 0),
    specials: stats.specials + (event.moveInput === 'special' ? 1 : 0),
    launchers: stats.launchers + (event.launched ? 1 : 0),
    juggleHits: stats.juggleHits + (event.juggled ? 1 : 0),
    tornadoes: stats.tornadoes + (event.tornado ? 1 : 0),
    kiBursts: stats.kiBursts + (event.kiBurst ? 1 : 0)
  };
}

export function addCombatPopupEventToOnlineStats(stats: OnlinePerformanceStats, event: CombatPopupEvent): OnlinePerformanceStats {
  return {
    ...stats,
    maxComboHits: Math.max(stats.maxComboHits, Math.max(0, event.hits))
  };
}

export function addFramePressureToOnlineStats(stats: OnlinePerformanceStats, frames = 1): OnlinePerformanceStats {
  return {
    ...stats,
    forwardPressureFrames: stats.forwardPressureFrames + Math.max(0, Math.round(frames))
  };
}

export function addMatchDurationToOnlineStats(stats: OnlinePerformanceStats, frames = 1): OnlinePerformanceStats {
  return {
    ...stats,
    matchDurationFrames: stats.matchDurationFrames + Math.max(0, Math.round(frames))
  };
}

export function addAttackAttemptToOnlineStats(stats: OnlinePerformanceStats): OnlinePerformanceStats {
  return {
    ...stats,
    attacksAttempted: stats.attacksAttempted + 1
  };
}

export function addWhiffToOnlineStats(stats: OnlinePerformanceStats): OnlinePerformanceStats {
  return {
    ...stats,
    whiffs: stats.whiffs + 1
  };
}

export function setOnlinePerformanceRoundsWon(stats: OnlinePerformanceStats, roundsWon: number): OnlinePerformanceStats {
  return {
    ...stats,
    roundsWon: Math.max(0, Math.round(roundsWon))
  };
}

export function calculateOnlinePerformancePoints(stats: OnlinePerformanceStats, roundsWon: number, didWin: boolean): number {
  const comboBonus = Math.max(0, stats.maxComboHits - 1) * 4 + (stats.maxComboHits >= 4 ? 10 : 0) + (stats.maxComboHits >= 6 ? 14 : 0);
  const raw =
    8 +
    Math.floor(Math.min(160, stats.damageDealt) * 0.45) +
    Math.min(18, stats.cleanHits * 2) +
    Math.min(16, stats.blockedHits * 2) +
    stats.punishes * 12 +
    stats.whiffPunishes * 18 +
    stats.specials * 8 +
    stats.launchers * 15 +
    stats.juggleHits * 6 +
    stats.tornadoes * 14 +
    stats.kiBursts * 10 +
    comboBonus +
    Math.max(0, roundsWon) * 9 +
    (didWin ? 22 : 0);

  return clampScore(raw);
}

function clampScore(value: number) {
  return Math.max(5, Math.min(260, Math.round(value)));
}
