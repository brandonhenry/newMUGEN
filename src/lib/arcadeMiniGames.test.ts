import { afterEach, describe, expect, it, vi } from 'vitest';
import { stages } from '../data/stages';
import { starterCharacters } from '../data/characters';
import { emptyInputFrame, type MiniGameHighScoreKey, type StageDefinition } from '../types';
import {
  BREAK_TARGET_GAME_ID,
  BREAK_TARGET_HIGH_SCORE_STORAGE_KEY,
  createEnemyRushMiniGame,
  createBreakTargetMiniGame,
  createFighterRushMiniGame,
  createTagMiniGame,
  FIGHTER_RUSH_GAME_ID,
  TAG_GAME_ID,
  generateEnemyRushEnemies,
  generateFighterRushEnemies,
  generateBreakTargets,
  makeEnemyRushMiniGameResult,
  makeBreakTargetMiniGameResult,
  makeTagMiniGameResult,
  miniGameHighScoreStorageKey,
  readMiniGameHighScore,
  resolveEnemyRushLaneLayout,
  resolveMiniGameStageBounds,
  pickArcadeMiniGameKind,
  pickTagOpponent,
  pickTagRole,
  shouldStartArcadeMiniGame,
  stepEnemyRushMiniGame,
  stepBreakTargetMiniGame,
  stepTagMiniGame,
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

  it('uses dedicated jump instead of up for mini-game jumping', () => {
    let snapshot = createBreakTargetMiniGame(character, stage, 12);
    const up = emptyInputFrame();
    up.up = true;
    snapshot = stepBreakTargetMiniGame(snapshot, up, 1 / 60);
    expect(snapshot.player.state).not.toBe('jump');
    expect(snapshot.player.velocityY).toBe(0);

    const jump = emptyInputFrame();
    jump.jump = true;
    snapshot = stepBreakTargetMiniGame(snapshot, jump, 1 / 60);
    expect(snapshot.player.state).toBe('jump');
    expect(snapshot.player.velocityY).toBeGreaterThan(0);
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
    const key: MiniGameHighScoreKey = { gameId: BREAK_TARGET_GAME_ID, stageId: 'the-chamber' };
    expect(writeMiniGameHighScore(key, 100)).toBe(100);
    expect(writeMiniGameHighScore(key, 80)).toBe(100);
    expect(readMiniGameHighScore(key)).toBe(100);
    expect(JSON.parse(store[BREAK_TARGET_HIGH_SCORE_STORAGE_KEY])[miniGameHighScoreStorageKey(key)]).toBe(100);
    const runnerKey: MiniGameHighScoreKey = { gameId: TAG_GAME_ID, stageId: 'the-chamber', tagRole: 'cpu-it' };
    const taggerKey: MiniGameHighScoreKey = { gameId: TAG_GAME_ID, stageId: 'the-chamber', tagRole: 'player-it' };
    expect(writeMiniGameHighScore(runnerKey, 800)).toBe(800);
    expect(readMiniGameHighScore(taggerKey)).toBe(0);
    expect(writeMiniGameHighScore(taggerKey, 1200)).toBe(1200);
    expect(readMiniGameHighScore(runnerKey)).toBe(800);
  });

  it('supports deterministic arcade mini-game test hooks', () => {
    vi.stubGlobal('window', {
      location: { search: '?forceArcadeMiniGame=1' },
      localStorage: { getItem: () => null }
    });
    expect(shouldStartArcadeMiniGame(0.99)).toBe(true);
  });

  it('supports forced fighter rush and level-gates random fighter rush picks', () => {
    vi.stubGlobal('window', {
      location: { search: `?forceMiniGameKind=${FIGHTER_RUSH_GAME_ID}` },
      localStorage: { getItem: () => null }
    });
    expect(pickArcadeMiniGameKind(1, 0.99)).toBe(FIGHTER_RUSH_GAME_ID);
    vi.unstubAllGlobals();
    expect(pickArcadeMiniGameKind(1, 0)).toBe(TAG_GAME_ID);
    expect(pickArcadeMiniGameKind(1, 0.249)).toBe(TAG_GAME_ID);
    expect(pickArcadeMiniGameKind(2, 0.25)).toBe(FIGHTER_RUSH_GAME_ID);
  });

  it('chooses Tag roles deterministically with both roles represented', () => {
    expect(pickTagRole(12345)).toBe(pickTagRole(12345));
    expect(new Set(Array.from({ length: 30 }, (_, index) => pickTagRole(index + 1)))).toEqual(new Set(['player-it', 'cpu-it']));
  });

  it('prefers a locked Tag opponent and falls back after all unlocks', () => {
    const player = starterCharacters[0];
    const unlockedOpponent = { ...starterCharacters[1], locked: false };
    const lockedOpponent = { ...starterCharacters[2], locked: true };
    expect(pickTagOpponent([player, unlockedOpponent, lockedOpponent], player.id, new Set(), 44)?.id).toBe(lockedOpponent.id);
    expect([unlockedOpponent.id, lockedOpponent.id]).toContain(pickTagOpponent([player, unlockedOpponent, lockedOpponent], player.id, new Set([lockedOpponent.id]), 44)?.id);
  });

  it('scores Tag survival to 3000 and cleanly completes at 60 seconds', () => {
    const snapshot = createTagMiniGame(character, starterCharacters[1], stage, 77, 1, 'cpu-it');
    snapshot.phase = 'playing';
    snapshot.elapsed = 59.99;
    snapshot.timer = 0.01;
    snapshot.match.fighters[0].position.x = -40;
    snapshot.match.fighters[1].position.x = 40;
    const next = stepTagMiniGame(snapshot, emptyInputFrame(), 0.02);
    expect(next.completedReason).toBe('survived');
    expect(next.score).toBe(3000);
    next.phase = 'complete';
    expect(makeTagMiniGameResult(next).cleared).toBe(true);
  });

  it('requires a clean Tag hit and ignores blocked contact', () => {
    const snapshot = createTagMiniGame(character, starterCharacters[1], stage, 88, 2, 'player-it');
    snapshot.phase = 'playing';
    snapshot.elapsed = 10;
    snapshot.timer = 50;
    const baseImpact = {
      id: 1,
      position: [0, 1, 0] as [number, number, number],
      attackerSlot: 1 as const,
      defenderSlot: 2 as const,
      hitLevel: 'mid' as const,
      damage: 10,
      moveLabel: 'Test hit'
    };
    snapshot.match.impactEvents = [{ ...baseImpact, kind: 'block' }];
    const blocked = stepTagMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(blocked.phase).toBe('playing');
    blocked.match.impactEvents = [{ ...baseImpact, id: 2, kind: 'hit' }];
    const tagged = stepTagMiniGame(blocked, emptyInputFrame(), 1 / 60);
    expect(tagged.completedReason).toBe('tagged-cpu');
    expect(tagged.phase).toBe('tagged');
    expect(tagged.score).toBeGreaterThan(2400);
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

  it('enemy rush starts in the middle lane and double taps clamp lane changes', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 909, 1);
    const lanes = resolveEnemyRushLaneLayout(stage);
    expect(snapshot.laneIndex).toBe(2);
    expect(snapshot.player.position.z).toBeCloseTo(lanes.laneZ[2], 5);

    const up = emptyInputFrame();
    up.sidestepUp = true;
    snapshot = stepEnemyRushMiniGame(snapshot, up, 1 / 60);
    expect(snapshot.laneTargetIndex).toBe(1);
    snapshot = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 0.25);
    expect(snapshot.laneIndex).toBe(1);
    expect(snapshot.player.position.z).toBeCloseTo(lanes.laneZ[1], 5);

    snapshot = stepEnemyRushMiniGame(snapshot, up, 1 / 60);
    snapshot = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 0.25);
    snapshot = stepEnemyRushMiniGame(snapshot, up, 1 / 60);
    expect(snapshot.laneTargetIndex).toBe(0);
  });

  it('enemy rush does not skip multiple lanes from one held sidestep pulse', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 910, 1);
    const input = emptyInputFrame();
    input.sidestepUp = true;
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 60);
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 60);
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 60);
    expect(snapshot.laneTargetIndex).toBe(1);
  });

  it('enemy rush queues one intentional lane tap during an active transition', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 911, 1);
    const input = emptyInputFrame();
    input.sidestepUp = true;
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 60);
    expect(snapshot.laneTargetIndex).toBe(1);
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 60);
    expect(snapshot.queuedLaneStep).toBe(-1);
    snapshot = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 0.25);
    expect(snapshot.laneTargetIndex).toBe(0);
  });

  it('enemy rush ignores held vertical movement while keeping left and right movement', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 1001, 1);
    const startX = snapshot.player.position.x;
    const startZ = snapshot.player.position.z;
    const input = emptyInputFrame();
    input.up = true;
    input.sidewalkUp = true;
    input.right = true;
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 6);
    expect(snapshot.player.position.x).toBeGreaterThan(startX);
    expect(snapshot.player.position.z).toBeCloseTo(startZ, 5);
    expect(snapshot.laneIndex).toBe(2);
  });

  it('enemy rush runs left with forward movement instead of back/block posture', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 1002, 1);
    const startX = snapshot.player.position.x;
    const input = emptyInputFrame();
    input.left = true;
    input.block = true;
    input.back = true;
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 6);
    expect(snapshot.player.position.x).toBeLessThan(startX);
    expect(snapshot.player.facing).toBe(-1);
    expect(snapshot.player.state).toBe('walk');
    expect(snapshot.player.walkDirection).toBe(1);
    expect(snapshot.player.state).not.toBe('block');
  });

  it('enemy rush attacks hit only enemies on the active lane', () => {
    const snapshot = createEnemyRushMiniGame(character, stage, 1102, 1);
    const lanes = resolveEnemyRushLaneLayout(stage);
    const move = character.moves.find((candidate) => candidate.input === 'jab') ?? character.moves[0];
    snapshot.enemies = [
      {
        ...snapshot.enemies[0],
        id: 'same-lane',
        hp: 1,
        maxHp: 1,
        laneIndex: snapshot.laneIndex,
        position: {
          x: snapshot.player.position.x + snapshot.player.facing * move.hitbox.offset[2],
          y: 0,
          z: lanes.laneZ[snapshot.laneIndex]
        }
      },
      {
        ...snapshot.enemies[1],
        id: 'other-lane',
        hp: 1,
        maxHp: 1,
        laneIndex: 0,
        position: {
          x: snapshot.player.position.x + snapshot.player.facing * move.hitbox.offset[2],
          y: 0,
          z: lanes.laneZ[0]
        }
      }
    ];
    snapshot.player.state = 'attack';
    snapshot.player.currentMove = move;
    snapshot.player.moveFrame = move.startupFrames;
    snapshot.player.actionFramesRemaining = move.activeFrames + move.recoveryFrames;
    const next = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(next.enemies.find((enemy) => enemy.id === 'same-lane')?.defeated).toBe(true);
    expect(next.enemies.find((enemy) => enemy.id === 'other-lane')?.defeated).toBe(false);
  });

  it('enemy rush buffers attack buttons pressed during recovery', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 1103, 1);
    const jab = character.moves.find((candidate) => candidate.input === 'jab') ?? character.moves[0];
    const special = character.moves.find((candidate) => candidate.input === 'special') ?? character.moves.find((candidate) => candidate.input !== 'jab') ?? character.moves[0];
    snapshot.player.state = 'attack';
    snapshot.player.currentMove = jab;
    snapshot.player.moveFrame = Math.max(1, jab.startupFrames + jab.activeFrames);
    snapshot.player.actionFramesRemaining = 2;
    const input = emptyInputFrame();
    input.special = true;
    snapshot = stepEnemyRushMiniGame(snapshot, input, 1 / 60);
    expect(snapshot.player.bufferedMoveInput).toBe('special');
    snapshot = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(snapshot.player.currentMove?.id).toBe(special.id);
  });

  it('enemy rush spawns enemies only on valid deterministic lanes', () => {
    const first = generateEnemyRushEnemies(stage, 1203, 3);
    const second = generateEnemyRushEnemies(stage, 1203, 3);
    expect(second.map((enemy) => enemy.laneIndex)).toEqual(first.map((enemy) => enemy.laneIndex));
    expect(first.every((enemy) => [0, 1, 2, 3, 4].includes(enemy.laneIndex))).toBe(true);
  });

  it('enemy rush projectiles collide only with the player lane', () => {
    let snapshot = createEnemyRushMiniGame(character, stage, 1304, 1);
    const lanes = resolveEnemyRushLaneLayout(stage);
    snapshot.projectiles = [{
      id: 'lane-shot',
      ownerId: 'test',
      kind: 'test',
      damage: 5,
      laneIndex: 0,
      position: { x: snapshot.player.position.x, y: 0.85, z: lanes.laneZ[0] },
      velocity: { x: 0, z: 0 },
      radius: 0.3,
      age: 0
    }];
    const hp = snapshot.player.hp;
    snapshot = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(snapshot.player.hp).toBe(hp);
    snapshot.projectiles = [{
      ...snapshot.projectiles[0],
      id: 'middle-shot',
      laneIndex: snapshot.laneIndex,
      position: { x: snapshot.player.position.x, y: 0.85, z: lanes.laneZ[snapshot.laneIndex] }
    }];
    snapshot = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    expect(snapshot.player.hp).toBeLessThan(hp);
  });

  it('enemy rush level pool includes varied behavior and stronger enemies', () => {
    const low = generateEnemyRushEnemies(stage, 808, 1);
    const high = generateEnemyRushEnemies(stage, 808, 4);
    expect(new Set(low.map((enemy) => enemy.behavior)).size).toBeGreaterThan(1);
    expect(high.some((enemy) => enemy.elite || enemy.projectileKind)).toBe(true);
    expect(Math.max(...high.map((enemy) => enemy.maxHp))).toBeGreaterThan(Math.max(...low.map((enemy) => enemy.maxHp)));
  });

  it('fighter rush generates deterministic weak roster fighters', () => {
    const rosterPool = starterCharacters.slice(0, 4);
    const first = generateFighterRushEnemies(stage, 1404, 3, rosterPool, character);
    const second = generateFighterRushEnemies(stage, 1404, 3, rosterPool, character);
    expect(second.map(summarizeFighterRushEnemy)).toEqual(first.map(summarizeFighterRushEnemy));
    expect(first.length).toBe(10);
    expect(first.every((enemy) => enemy.rosterCharacter && enemy.rosterCharacter.id !== character.id)).toBe(true);
    expect(Math.max(...first.map((enemy) => enemy.maxHp))).toBeLessThanOrEqual(18);
    expect(Math.max(...first.map((enemy) => enemy.damage))).toBeLessThanOrEqual(7);
    expect(Math.max(...first.map((enemy) => enemy.maxHp))).toBeLessThan(Math.max(...generateEnemyRushEnemies(stage, 1404, 3).map((enemy) => enemy.maxHp)));
  });

  it('fighter rush keeps enemies on valid lanes inside bounds and caps count', () => {
    const low = generateFighterRushEnemies(stage, 1505, 1, starterCharacters, character);
    const high = generateFighterRushEnemies(stage, 1505, 9, starterCharacters, character);
    const bounds = resolveMiniGameStageBounds(stage, 0.8);
    expect(low.length).toBeLessThan(high.length);
    expect(high.length).toBe(16);
    for (const enemy of high) {
      const local = worldToMiniGameBoundsLocal(enemy.position, bounds);
      expect(Math.abs(local.x)).toBeLessThanOrEqual(bounds.halfWidth + 0.001);
      expect(Math.abs(local.z)).toBeLessThanOrEqual(bounds.halfDepth + 0.001);
      expect([0, 1, 2, 3, 4]).toContain(enemy.laneIndex);
    }
  });

  it('fighter rush snapshot scores under a separate game id', () => {
    const snapshot = createFighterRushMiniGame(character, stage, 1606, 2, starterCharacters);
    expect(snapshot.kind).toBe(FIGHTER_RUSH_GAME_ID);
    expect(snapshot.gameId).toBe(FIGHTER_RUSH_GAME_ID);
    snapshot.enemies.forEach((enemy) => {
      enemy.defeated = true;
    });
    const next = stepEnemyRushMiniGame(snapshot, emptyInputFrame(), 1 / 60);
    const result = makeEnemyRushMiniGameResult(next);
    expect(result.gameId).toBe(FIGHTER_RUSH_GAME_ID);
    expect(result.cleared).toBe(true);
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

function summarizeFighterRushEnemy(enemy: ReturnType<typeof generateFighterRushEnemies>[number]) {
  return {
    characterId: enemy.rosterCharacter?.id,
    hp: enemy.hp,
    damage: enemy.damage,
    laneIndex: enemy.laneIndex,
    x: Number(enemy.position.x.toFixed(3)),
    z: Number(enemy.position.z.toFixed(3))
  };
}
