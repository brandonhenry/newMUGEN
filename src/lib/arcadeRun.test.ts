import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MiniGameResult } from '../types';
import {
  ARCADE_RUN_HIGH_SCORE_STORAGE_KEY,
  applyArcadeFightWin,
  applyArcadeLifeLoss,
  applyArcadeMiniGameResult,
  arcadeLevelForScore,
  createArcadeRunState,
  readLocalArcadeRunHighScore,
  writeLocalArcadeRunHighScore
} from './arcadeRun';

describe('arcade run scoring', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts at zero score with three lives and level one', () => {
    const run = createArcadeRunState(100);
    expect(run).toMatchObject({
      score: 0,
      livesRemaining: 3,
      wins: 0,
      level: 1,
      status: 'running',
      startedAt: 100
    });
    expect(arcadeLevelForScore(0)).toBe(1);
    expect(arcadeLevelForScore(2500)).toBe(2);
  });

  it('awards fight wins using level and health bonus', () => {
    const run = applyArcadeFightWin(createArcadeRunState(), 75, 100);
    expect(run.score).toBe(825);
    expect(run.wins).toBe(1);
    expect(run.lastAward).toBe(825);
  });

  it('triggers game over after the third life loss', () => {
    let run = createArcadeRunState();
    run = applyArcadeLifeLoss(run);
    expect(run).toMatchObject({ livesRemaining: 2, status: 'running' });
    run = applyArcadeLifeLoss(run);
    run = applyArcadeLifeLoss(run);
    expect(run).toMatchObject({ livesRemaining: 0, status: 'game-over' });
  });

  it('adds break target score without costing a life', () => {
    const run = applyArcadeMiniGameResult(createArcadeRunState(), miniGameResult('break-target', 1200, 'time-up'));
    expect(run.score).toBe(1200);
    expect(run.livesRemaining).toBe(3);
    expect(run.miniGameTotals['break-target']).toBe(1200);
  });

  it('enemy rush death adds score and costs one life', () => {
    const run = applyArcadeMiniGameResult(createArcadeRunState(), miniGameResult('enemy-rush', 700, 'player-death'));
    expect(run.score).toBe(700);
    expect(run.livesRemaining).toBe(2);
    expect(run.miniGameTotals['enemy-rush']).toBe(700);
  });

  it('fighter rush death tracks separate score and costs one life', () => {
    const run = applyArcadeMiniGameResult(createArcadeRunState(), miniGameResult('fighter-rush', 900, 'player-death'));
    expect(run.score).toBe(900);
    expect(run.livesRemaining).toBe(2);
    expect(run.miniGameTotals['fighter-rush']).toBe(900);
    expect(run.miniGameTotals['enemy-rush']).toBe(0);
  });

  it('stores local best arcade run scores', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        }
      }
    });
    const profile = { playerId: 'p1', displayName: 'Astra' };
    expect(writeLocalArcadeRunHighScore(profile, 'astra', 1000)).toBe(1000);
    expect(writeLocalArcadeRunHighScore(profile, 'astra', 800)).toBe(1000);
    expect(readLocalArcadeRunHighScore(profile, 'dax')).toBe(0);
    expect(writeLocalArcadeRunHighScore(profile, 'dax', 1200)).toBe(1200);
    expect(readLocalArcadeRunHighScore(profile, 'astra')).toBe(1000);
    expect(readLocalArcadeRunHighScore(profile, 'dax')).toBe(1200);
    expect(JSON.parse(store[ARCADE_RUN_HIGH_SCORE_STORAGE_KEY])).toEqual([
      expect.objectContaining({ playerId: 'p1', displayName: 'ASTRA', characterId: 'dax', score: 1200 }),
      expect.objectContaining({ playerId: 'p1', displayName: 'ASTRA', characterId: 'astra', score: 1000 })
    ]);
  });
});

function miniGameResult(gameId: MiniGameResult['gameId'], score: number, completedReason: MiniGameResult['completedReason']): MiniGameResult {
  return {
    kind: gameId,
    gameId,
    stageId: 'dojo',
    stageName: 'Dojo',
    score,
    previousHighScore: 0,
    highScore: score,
    newHighScore: true,
    cleared: completedReason === 'all-clear',
    targetsDestroyed: 0,
    totalTargets: 1,
    timeRemaining: 0,
    allClear: completedReason === 'all-clear',
    completedReason
  };
}
