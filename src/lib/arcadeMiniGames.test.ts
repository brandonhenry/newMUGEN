import { afterEach, describe, expect, it, vi } from 'vitest';
import { stages } from '../data/stages';
import { starterCharacters } from '../data/characters';
import { emptyInputFrame, type StageDefinition } from '../types';
import {
  BREAK_TARGET_GAME_ID,
  BREAK_TARGET_HIGH_SCORE_STORAGE_KEY,
  createBreakTargetMiniGame,
  generateBreakTargets,
  makeBreakTargetMiniGameResult,
  miniGameHighScoreStorageKey,
  readMiniGameHighScore,
  resolveMiniGameStageBounds,
  shouldStartArcadeMiniGame,
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
});

function summarizeTarget(target: ReturnType<typeof generateBreakTargets>[number]) {
  return {
    tier: target.tier,
    x: Number(target.position.x.toFixed(3)),
    y: Number(target.position.y.toFixed(3)),
    z: Number(target.position.z.toFixed(3))
  };
}
