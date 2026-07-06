import { afterEach, describe, expect, it, vi } from 'vitest';
import { stages } from '../data/stages';
import { starterCharacters } from '../data/characters';
import { emptyInputFrame, type StageDefinition } from '../types';
import {
  BREAK_TARGET_GAME_ID,
  BREAK_TARGET_HIGH_SCORE_STORAGE_KEY,
  createEnemyRushMiniGame,
  createBreakTargetMiniGame,
  generateEnemyRushEnemies,
  generateBreakTargets,
  makeEnemyRushMiniGameResult,
  makeBreakTargetMiniGameResult,
  miniGameHighScoreStorageKey,
  readMiniGameHighScore,
  resolveMiniGameStageBounds,
  shouldStartArcadeMiniGame,
  stepEnemyRushMiniGame,
  stepBreakTargetMiniGame,
  worldToMiniGameBoundsLocal,
  writeMiniGameHighScore
} from './arcadeMiniGames';

const character = starterCharacters[0];
const stage = stages[0];

describe('arcade mini games', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('generates break targets deterministically for a seed', () => {
    const first = generateBreakTargets(stage, 1234);
    const second = generateBreakTargets(stage, 1234);
    expect(second.map(summarizeTarget)).toEqual(first.map(summarizeTarget));
  });

  it('keeps generated targets inside box stage bounds with spacing', () => {
    const targets = generateBreakTargets(stage, 99);
    const bounds = resolveMiniGameStageBounds(stage, 0.75);
    for (const target of targets) {
      const local = worldToMiniGameBoundsLocal(target.position, bounds);
      expect(Math.abs(local.x)).toBeLessThanOrEqual(bounds.halfWidth + 0.001);
      expect(Math.abs(local.z)).toBeLessThanOrEqual(bounds.halfDepth + 0.001);
    }
    for (let index = 0; index < targets.length; index += 1) {
      for (let other = index + 1; other < targets.length; other += 1) {
        expect(Math.hypot(targets[index].position.x - targets[other].position.x, targets[index].position.z - targets[other].position.z)).toBeGreaterThanOrEqual(1.55);
      }
    }
  });

  it('keeps generated targets inside ellipse stage bounds', () => {
    const ellipseStage: StageDefinition = {
      ...stage,
      id: 'ellipse-test',
      fightPlane: { center: [3, 0, -2], width: 10, depth: 7, y: 0, rotationY: Math.PI / 6 },
      playableBounds: { shape: 'ellipse', width: 10, depth: 7 }
    };
    const bounds = resolveMiniGameStageBounds(ellipseStage, 0.75);
    for (const target of generateBreakTargets(ellipseStage, 303)) {
      const local = worldToMiniGameBoundsLocal(target.position, bounds);
      const normalized = (local.x * local.x) / (bounds.halfWidth * bounds.halfWidth) + (local.z * local.z) / (bounds.halfDepth * bounds.halfDepth);
      expect(normalized).toBeLessThanOrEqual(1.001);
    }
  });

  it('allows free left and right movement while ignoring block', () => {
    let snapshot = createBreakTargetMiniGame(character, stage, 11);
    const startX = snapshot.player.position.x;
    const right = emptyInputFrame();
    right.right = true;
    right.block = true;
    snapshot = stepBreakTargetMiniGame(snapshot, right, 1 / 6);
    expect(snapshot.player.position.x).toBeGreaterThan(startX);
    expect(snapshot.player.state).not.toBe('block');
    const afterRight = snapshot.player.position.x;
    const left = emptyInputFrame();
    left.left = true;
    left.block = true;
    snapshot = stepBreakTargetMiniGame(snapshot, left, 1 / 6);
    expect(snapshot.player.position.x).toBeLessThan(afterRight);
    expect(snapshot.player.state).not.toBe('block');
  });

  it('destroys a target with authored move damage and adds points', () => {
    const snapshot = createBreakTargetMiniGame(character, stage, 22);
    const move = character.moves.find((candidate) => candidate.input === 'jab') ?? character.moves[0];
    snapshot.targets = [{
      ...snapshot.targets[0],
      hp: 1,
      maxHp: 1,
      position: {
        x: snapshot.player.position.x + snapshot.player.facing * move.hitbox.offset[2],
        y: snapshot.player.position.y + move.hitbox.offset[1],
        z: snapshot.player.position.z + move.hitbox.offset[0]
      }
    }];
    snapshot.player.state = 'attack';
    snapshot.player.currentMove = move;
    snapshot.player.moveFrame = move.startupFrames;
    snapshot.player.actionFramesRemaining = move.activeFrames + move.recoveryFrames;
    const next = stepBreakTargetMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(next.targets[0].destroyed).toBe(true);
    expect(next.score).toBeGreaterThanOrEqual(next.targets[0].points);
    expect(next.explosions.length).toBe(1);
  });

  it('completes on timer expiry and builds result payloads', () => {
    const snapshot = createBreakTargetMiniGame(character, stage, 33);
    const next = stepBreakTargetMiniGame(snapshot, emptyInputFrame(), snapshot.timer + 1);
    expect(next.phase).toBe('complete');
    expect(next.completedReason).toBe('time-up');
    const result = makeBreakTargetMiniGameResult(next, 250);
    expect(result.highScore).toBe(Math.max(result.score, 250));
    expect(result.stageId).toBe(stage.id);
  });

  it('stores high scores per mini game and stage', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        }
      }
    });
    const key = { gameId: BREAK_TARGET_GAME_ID, stageId: 'the-chamber' };
    expect(writeMiniGameHighScore(key, 100)).toBe(100);
    expect(writeMiniGameHighScore(key, 80)).toBe(100);
    expect(readMiniGameHighScore(key)).toBe(100);
    expect(JSON.parse(store[BREAK_TARGET_HIGH_SCORE_STORAGE_KEY])[miniGameHighScoreStorageKey(key)]).toBe(100);
  });

  it('supports deterministic arcade mini-game test hooks', () => {
    vi.stubGlobal('window', {
      location: { search: '?forceArcadeMiniGame=1' },
      localStorage: { getItem: () => null }
    });
    expect(shouldStartArcadeMiniGame(0.99)).toBe(true);
  });

  it('generates enemy rush spawns deterministically inside stage bounds with spacing', () => {
    const first = generateEnemyRushEnemies(stage, 404, 3);
    const second = generateEnemyRushEnemies(stage, 404, 3);
    expect(second.map(summarizeEnemy)).toEqual(first.map(summarizeEnemy));
    const bounds = resolveMiniGameStageBounds(stage, 0.8);
    for (const enemy of first) {
      const local = worldToMiniGameBoundsLocal(enemy.position, bounds);
      expect(Math.abs(local.x)).toBeLessThanOrEqual(bounds.halfWidth + 0.001);
      expect(Math.abs(local.z)).toBeLessThanOrEqual(bounds.halfDepth + 0.001);
    }
    for (let index = 0; index < first.length; index += 1) {
      for (let other = index + 1; other < first.length; other += 1) {
        expect(Math.hypot(first[index].position.x - first[other].position.x, first[index].position.z - first[other].position.z)).toBeGreaterThanOrEqual(first[index].radius + first[other].radius + 0.7);
      }
    }
  });

  it('enemy rush all-clear awards clear bonus and high score payload', () => {
    const snapshot = createEnemyRushMiniGame(character, stage, 505, 2);
    snapshot.enemies.forEach((enemy) => {
      enemy.defeated = true;
    });
    const next = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(next.phase).toBe('complete');
    expect(next.completedReason).toBe('all-clear');
    expect(next.score).toBeGreaterThanOrEqual(1000);
    const result = makeEnemyRushMiniGameResult(next, 100);
    expect(result.highScore).toBe(result.score);
    expect(result.cleared).toBe(true);
  });

  it('enemy rush player death completes as player-death', () => {
    const snapshot = createEnemyRushMiniGame(character, stage, 606, 1);
    snapshot.player.hp = 0;
    const next = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(next.phase).toBe('complete');
    expect(next.completedReason).toBe('player-death');
    const result = makeEnemyRushMiniGameResult(next);
    expect(result.completedReason).toBe('player-death');
    expect(result.cleared).toBe(false);
  });

  it('enemy rush supports lock toggle and depth cycling', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 707, 3);
    const lockInput = emptyInputFrame();
    lockInput.lockTarget = true;
    (lockInput as typeof lockInput & { __pressedActions?: string[] }).__pressedActions = ['lockTarget'];
    snapshot = stepEnemyRushMiniGame(snapshot, lockInput, 1 / 60);
    expect(snapshot.lockedEnemyId).toBeTruthy();
    const firstLock = snapshot.lockedEnemyId;
    const cycleInput = emptyInputFrame();
    cycleInput.cycleTargetDown = true;
    (cycleInput as typeof cycleInput & { __pressedActions?: string[] }).__pressedActions = ['cycleTargetDown'];
    snapshot = stepEnemyRushMiniGame(snapshot, cycleInput, 1 / 60);
    expect(snapshot.lockedEnemyId).toBeTruthy();
    expect(snapshot.lockedEnemyId).not.toBe(firstLock);
    const unlockInput = emptyInputFrame();
    unlockInput.lockTarget = true;
    (unlockInput as typeof unlockInput & { __pressedActions?: string[] }).__pressedActions = ['lockTarget'];
    snapshot = stepEnemyRushMiniGame(snapshot, unlockInput, 1 / 60);
    expect(snapshot.lockedEnemyId).toBeNull();
  });

  it('enemy rush level pool includes varied behavior and stronger enemies', () => {
    const low = generateEnemyRushEnemies(stage, 808, 1);
    const high = generateEnemyRushEnemies(stage, 808, 4);
    expect(new Set(low.map((enemy) => enemy.behavior)).size).toBeGreaterThan(1);
    expect(high.some((enemy) => enemy.elite || enemy.projectileKind)).toBe(true);
    expect(Math.max(...high.map((enemy) => enemy.maxHp))).toBeGreaterThan(Math.max(...low.map((enemy) => enemy.maxHp)));
  });
});

function summarizeTarget(target: ReturnType<typeof generateBreakTargets>[number]) {
  return {
    tier: target.tier,
    x: Number(target.position.x.toFixed(3)),
    y: Number(target.position.y.toFixed(3)),
    z: Number(target.position.z.toFixed(3))
  };
}

function summarizeEnemy(enemy: ReturnType<typeof generateEnemyRushEnemies>[number]) {
  return {
    kind: enemy.kind,
    hp: enemy.hp,
    x: Number(enemy.position.x.toFixed(3)),
    z: Number(enemy.position.z.toFixed(3))
  };
}
