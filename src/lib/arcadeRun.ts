import type { ArcadeRunState, MiniGameResult } from '../types';
import { LEGACY_SCORE_CHARACTER_ID, sanitizeCharacterId, sanitizeDisplayName, sanitizePlayerId, type OnlinePlayerProfile } from './online/leaderboard';

export const ARCADE_RUN_HIGH_SCORE_STORAGE_KEY = 'kore.arcadeRunHighScores.v1';
export const ARCADE_RUN_STARTING_LIVES = 3;
export const ARCADE_LEVEL_SCORE_STEP = 2500;

export type ArcadeRunHighScoreEntry = {
  playerId: string;
  displayName: string;
  characterId: string;
  score: number;
  updatedAt: number;
};

export type ArcadeRunLeaderboardResult = {
  entries: ArcadeRunHighScoreEntry[];
};

export function createArcadeRunState(now = Date.now()): ArcadeRunState {
  return {
    score: 0,
    livesRemaining: ARCADE_RUN_STARTING_LIVES,
    wins: 0,
    level: 1,
    status: 'running',
    startedAt: now,
    lastAward: 0,
    unlockedThisRun: [],
    miniGameTotals: {
      'break-target': 0,
      'enemy-rush': 0,
      'fighter-rush': 0,
      tag: 0
    }
  };
}

export function arcadeLevelForScore(score: number) {
  return Math.max(1, Math.floor(Math.max(0, score) / ARCADE_LEVEL_SCORE_STEP) + 1);
}

export function applyArcadeFightWin(run: ArcadeRunState, playerHealth: number, playerMaxHealth: number): ArcadeRunState {
  const healthRatio = playerMaxHealth > 0 ? Math.max(0, Math.min(1, playerHealth / playerMaxHealth)) : 0;
  const healthBonus = Math.round(healthRatio * 300);
  return awardArcadePoints(run, 500 + run.level * 100 + healthBonus, { wins: run.wins + 1 });
}

export function applyArcadeLifeLoss(run: ArcadeRunState): ArcadeRunState {
  const livesRemaining = Math.max(0, run.livesRemaining - 1);
  return {
    ...run,
    livesRemaining,
    status: livesRemaining <= 0 ? 'game-over' : run.status,
    lastAward: 0
  };
}

export function applyArcadeMiniGameResult(run: ArcadeRunState, result: MiniGameResult): ArcadeRunState {
  const next = awardArcadePoints(run, Math.max(0, Math.round(result.score)), {
    miniGameTotals: {
      ...run.miniGameTotals,
      [result.gameId]: (run.miniGameTotals[result.gameId] ?? 0) + Math.max(0, Math.round(result.score))
    }
  });
  const lostLife =
    ((result.gameId === 'enemy-rush' || result.gameId === 'fighter-rush') && result.completedReason === 'player-death') ||
    (result.gameId === 'tag' && (result.completedReason === 'tagged-player' || result.completedReason === 'escaped'));
  if (lostLife) return applyArcadeLifeLoss(next);
  return next;
}

export function addArcadeUnlock(run: ArcadeRunState, characterId: string): ArcadeRunState {
  if (!characterId || run.unlockedThisRun.includes(characterId)) return run;
  return { ...run, unlockedThisRun: [...run.unlockedThisRun, characterId] };
}

export function awardArcadePoints(run: ArcadeRunState, points: number, patch: Partial<ArcadeRunState> = {}): ArcadeRunState {
  const award = Math.max(0, Math.round(points));
  const score = Math.max(0, run.score + award);
  return {
    ...run,
    ...patch,
    score,
    level: arcadeLevelForScore(score),
    lastAward: award
  };
}

export function readLocalArcadeRunHighScore(profile?: OnlinePlayerProfile | null, characterId?: string) {
  if (typeof window === 'undefined') return 0;
  const key = scoreKey(profile?.playerId || 'local-player', normalizeCharacterId(characterId));
  return readLocalArcadeRunEntries().find((entry) => scoreKey(entry.playerId, entry.characterId) === key)?.score
    ?? 0;
}

export function writeLocalArcadeRunHighScore(profile: OnlinePlayerProfile | null | undefined, characterId: string | undefined, score: number) {
  if (typeof window === 'undefined') return 0;
  const playerId = profile?.playerId || 'local-player';
  const displayName = sanitizeDisplayName(profile?.displayName) || 'PLAYER';
  const safeCharacterId = normalizeCharacterId(characterId);
  const key = scoreKey(playerId, safeCharacterId);
  const byId = new Map(readLocalArcadeRunEntries().map((entry) => [scoreKey(entry.playerId, entry.characterId), entry]));
  const current = byId.get(key);
  const nextScore = Math.max(Math.round(score), current?.score ?? 0, 0);
  byId.set(key, { playerId, displayName, characterId: safeCharacterId, score: nextScore, updatedAt: Date.now() });
  const entries = sortArcadeRunEntries([...byId.values()]).slice(0, 100);
  window.localStorage.setItem(ARCADE_RUN_HIGH_SCORE_STORAGE_KEY, JSON.stringify(entries));
  return nextScore;
}

export async function fetchArcadeRunLeaderboard(): Promise<ArcadeRunLeaderboardResult> {
  return getJson<ArcadeRunLeaderboardResult>('/.netlify/functions/arcade-leaderboard').catch((error) => {
    if (isLocalFallbackAllowed()) return { entries: readLocalArcadeRunEntries() };
    throw error;
  });
}

export async function submitArcadeRunScore(profile: OnlinePlayerProfile | null | undefined, characterId: string | undefined, score: number): Promise<ArcadeRunLeaderboardResult> {
  const safeProfile = profile ?? { playerId: 'local-player', displayName: 'PLAYER' };
  const safeCharacterId = normalizeCharacterId(characterId);
  writeLocalArcadeRunHighScore(safeProfile, safeCharacterId, score);
  return postJson<ArcadeRunLeaderboardResult>('/.netlify/functions/arcade-leaderboard-submit', {
    profile: safeProfile,
    characterId: safeCharacterId,
    score: Math.max(0, Math.round(score))
  }).catch((error) => {
    if (isLocalFallbackAllowed()) return { entries: readLocalArcadeRunEntries() };
    throw error;
  });
}

function readLocalArcadeRunEntries(): ArcadeRunHighScoreEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ARCADE_RUN_HIGH_SCORE_STORAGE_KEY) ?? '[]') as ArcadeRunHighScoreEntry[];
    return sortArcadeRunEntries(Array.isArray(parsed) ? parsed.map(normalizeArcadeRunEntry).filter(Boolean) as ArcadeRunHighScoreEntry[] : []);
  } catch {
    return [];
  }
}

function normalizeArcadeRunEntry(entry: Partial<ArcadeRunHighScoreEntry>): ArcadeRunHighScoreEntry | null {
  const playerId = sanitizePlayerId(entry.playerId);
  const displayName = sanitizeDisplayName(entry.displayName);
  const characterId = normalizeCharacterId(entry.characterId);
  const score = Math.max(0, Math.round(Number(entry.score) || 0));
  if (!playerId || !displayName || score <= 0) return null;
  return { playerId, displayName, characterId, score, updatedAt: Math.max(0, Math.round(Number(entry.updatedAt) || 0)) };
}

function sortArcadeRunEntries(entries: ArcadeRunHighScoreEntry[]) {
  return [...entries].sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName) || a.characterId.localeCompare(b.characterId));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Arcade leaderboard request failed: ${response.status}`);
  return (await response.json()) as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Arcade leaderboard request failed: ${response.status}`);
  return (await response.json()) as T;
}

function isLocalFallbackAllowed() {
  return typeof window !== 'undefined' && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function normalizeCharacterId(value: unknown) {
  return sanitizeCharacterId(value) || LEGACY_SCORE_CHARACTER_ID;
}

function scoreKey(playerId: string, characterId: string) {
  return `${sanitizePlayerId(playerId) || 'local-player'}:${normalizeCharacterId(characterId)}`;
}
