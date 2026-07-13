import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { normalizeCharacter, normalizeMove } from '../lib/characterLoader';
import { emptyInputFrame, type CharacterDefinition, type InputFrameWithMetadata, type MatchSnapshot, type ProjectileRuntime } from '../types';
import { checksumMatch } from '../lib/online/rollback';
import { cloneMatchSnapshot, createMatch, stepMatch } from './fightEngine';

const utilityMove = normalizeMove({
  ...starterCharacters[0].moves[2],
  id: 'star-platinum-the-world',
  label: 'Star Platinum: The World',
  input: 'kick',
  command: 'O+3',
  animationKey: 'cmd:O+3',
  startupFrames: 36,
  activeFrames: 1,
  recoveryFrames: 18,
  damage: 0,
  blockDamage: 0,
  range: 0.1,
  pushback: 0,
  blockPushback: 0,
  usesKi: true,
  kiCost: 100,
  timeStopFrames: 120,
  hitbox: { offset: [0, 1, 0], size: [0.1, 0.1, 0.1] }
});

function makeTimeStopCharacter(id: string): CharacterDefinition {
  const base = starterCharacters[0];
  return normalizeCharacter({
    ...base,
    id,
    displayName: id,
    animationFrames: {
      ...(base.animationFrames ?? {}),
      'cmd:O+3': ['/test-time-stop-1.png', '/test-time-stop-2.png']
    },
    moveOverrides: {
      ...(base.moveOverrides ?? {}),
      'cmd:O+3': {
        ...utilityMove,
        id: undefined,
        input: undefined,
        hitbox: utilityMove.hitbox
      }
    }
  });
}

function timeStopInput() {
  const input = emptyInputFrame() as InputFrameWithMetadata;
  input.charge = true;
  input.kick = true;
  input.__pressedActions = ['kick'];
  return input;
}

function startUtility(match: MatchSnapshot, slot: 1 | 2 = 1) {
  const input = timeStopInput();
  return stepMatch(match, slot === 1 ? input : emptyInputFrame(), slot === 2 ? input : emptyInputFrame(), 1 / 60);
}

function activateTimeStop(match: MatchSnapshot, slot: 1 | 2 = 1) {
  let next = startUtility(match, slot);
  for (let frame = 0; frame < 45 && !next.timeStop; frame += 1) {
    next = stepMatch(next, emptyInputFrame(), emptyInputFrame(), 1 / 60);
  }
  expect(next.timeStop?.ownerSlot).toBe(slot);
  return next;
}

function makeProjectile(match: MatchSnapshot): ProjectileRuntime {
  const move = match.fighters[1].character.moves[0];
  return {
    id: 9001,
    ownerSlot: 2,
    projectileId: 'frozen-test-shot',
    kind: 'projectile',
    instanceId: 'frozen-test-shot',
    moveInstanceId: 4,
    move,
    position: { x: 3, y: 1, z: 0 },
    previousPosition: { x: 3, y: 1, z: 0 },
    velocity: { x: -4, y: 0, z: 0 },
    facing: -1,
    phase: 'active',
    ageFrames: 8,
    startupFrames: 0,
    activeFrames: 120,
    recoveryFrames: 1,
    lifetimeFrames: 180,
    homingMode: 'none',
    homingStrength: 0,
    homingTurnRate: 0,
    nearMissRadius: 0,
    hitbox: move.hitbox,
    damageScale: 1,
    blockDamageScale: 1,
    pushbackScale: 1,
    blockPushbackScale: 1,
    mirrorWithFacing: true,
    pierce: false,
    clash: false,
    hitConnected: false,
    expired: false,
    trailSeed: 12
  };
}

describe('match time stop', () => {
  it('requires and consumes 100 Ki before its interruptible 36-frame startup', () => {
    const jotaro = makeTimeStopCharacter('time-stop-jotaro');
    let insufficient = createMatch(jotaro, starterCharacters[1], stages[0], 'local2p', 3, { trainingInfiniteHealth: false });
    insufficient.fighters[0].ki = 99;
    insufficient = startUtility(insufficient);
    expect(insufficient.timeStop).toBeNull();
    expect(insufficient.fighters[0].currentMove?.timeStopFrames).toBeUndefined();
    expect(insufficient.fighters[0].ki).toBe(99);

    let interrupted = createMatch(jotaro, starterCharacters[1], stages[0], 'local2p', 3, { trainingInfiniteHealth: false });
    interrupted.fighters[0].ki = 100;
    interrupted = startUtility(interrupted);
    expect(interrupted.fighters[0].currentMove?.timeStopFrames).toBe(120);
    expect(interrupted.fighters[0].ki).toBe(0);
    for (let frame = 0; frame < 10; frame += 1) interrupted = stepMatch(interrupted, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    interrupted.fighters[0].state = 'hit';
    interrupted.fighters[0].currentMove = null;
    interrupted.fighters[0].actionFramesRemaining = 12;
    interrupted = stepMatch(interrupted, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(interrupted.timeStop).toBeNull();
    expect(interrupted.fighters[0].ki).toBe(0);
  });

  it('freezes defender simulation, clock, and existing projectiles while the owner moves', () => {
    const jotaro = makeTimeStopCharacter('freeze-jotaro');
    let match = createMatch(jotaro, starterCharacters[1], stages[0], 'local2p', 3, { trainingInfiniteHealth: false });
    match.fighters[0].ki = 100;
    match = activateTimeStop(match);
    match.fighters[0].position = { x: 0, y: 0, z: 0 };
    match.fighters[1].position = { x: 1, y: 0, z: 0 };
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = match.fighters[1].character.moves[0];
    match.fighters[1].moveFrame = 4;
    match.fighters[1].actionFramesRemaining = 20;
    match.projectiles = [makeProjectile(match)];
    const frozen = {
      position: { ...match.fighters[1].position },
      moveFrame: match.fighters[1].moveFrame,
      actionFrames: match.fighters[1].actionFramesRemaining,
      timer: match.timer,
      projectile: { ...match.projectiles[0].position },
      projectileAge: match.projectiles[0].ageFrames
    };
    const move = emptyInputFrame();
    move.right = true;
    const ownerX = match.fighters[0].position.x;
    match = stepMatch(match, move, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].position.x).toBeGreaterThan(ownerX);
    expect(match.fighters[1].position).toEqual(frozen.position);
    expect(match.fighters[1].moveFrame).toBe(frozen.moveFrame);
    expect(match.fighters[1].actionFramesRemaining).toBe(frozen.actionFrames);
    expect(match.timer).toBe(frozen.timer);
    expect(match.projectiles[0].position).toEqual(frozen.projectile);
    expect(match.projectiles[0].ageFrames).toBe(frozen.projectileAge);
    expect(Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    )).toBeGreaterThanOrEqual(0.72 - 0.0001);
  });

  it('lasts exactly 120 owner-action frames and applies owner attacks immediately', () => {
    const jotaro = makeTimeStopCharacter('duration-jotaro');
    let durationMatch = createMatch(jotaro, starterCharacters[1], stages[0], 'local2p', 3, { trainingInfiniteHealth: false });
    durationMatch.fighters[0].ki = 100;
    durationMatch = activateTimeStop(durationMatch);
    expect(durationMatch.timeStop?.framesRemaining).toBe(120);
    for (let frame = 0; frame < 119; frame += 1) durationMatch = stepMatch(durationMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(durationMatch.timeStop?.framesRemaining).toBe(1);
    durationMatch = stepMatch(durationMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(durationMatch.timeStop).toBeNull();

    let hitMatch = createMatch(jotaro, starterCharacters[1], stages[0], 'local2p', 3, { trainingInfiniteHealth: false });
    hitMatch.fighters[0].ki = 100;
    hitMatch = activateTimeStop(hitMatch);
    hitMatch.fighters[0].position = { x: 0, y: 0, z: 0 };
    hitMatch.fighters[1].position = { x: 0.9, y: 0, z: 0 };
    const hp = hitMatch.fighters[1].hp;
    const jab = emptyInputFrame();
    jab.jab = true;
    hitMatch = stepMatch(hitMatch, jab, emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 20 && hitMatch.fighters[1].hp === hp; frame += 1) {
      hitMatch = stepMatch(hitMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(hitMatch.fighters[1].hp).toBeLessThan(hp);
    expect(hitMatch.fighters[1].state).toMatch(/hit|juggle|knockdown/);
  });

  it('cancels simultaneous activation while retaining both Ki costs', () => {
    const p1 = makeTimeStopCharacter('simultaneous-p1');
    const p2 = makeTimeStopCharacter('simultaneous-p2');
    let match = createMatch(p1, p2, stages[0], 'local2p', 3, { trainingInfiniteHealth: false });
    match.fighters.forEach((fighter) => {
      fighter.ki = 0;
      fighter.state = 'attack';
      fighter.currentMove = utilityMove;
      fighter.moveFrame = 35;
      fighter.actionFramesRemaining = 20;
      fighter.actionTimer = 20 / 60;
    });
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.timeStop).toBeNull();
    expect(match.fighters.map((fighter) => fighter.ki)).toEqual([0, 0]);
    expect(match.fighters.map((fighter) => fighter.state)).toEqual(['idle', 'idle']);
  });

  it('remains checksum-deterministic through attacks and expiration after a rollback clone', () => {
    const jotaro = makeTimeStopCharacter('rollback-jotaro');
    let uninterrupted = createMatch(jotaro, starterCharacters[1], stages[0], 'online', 3, { trainingInfiniteHealth: false });
    uninterrupted.fighters[0].ki = 100;
    uninterrupted = activateTimeStop(uninterrupted);
    uninterrupted.fighters[0].position = { x: 0, y: 0, z: 0 };
    uninterrupted.fighters[1].position = { x: 0.9, y: 0, z: 0 };
    let replayed = cloneMatchSnapshot(uninterrupted);
    for (let frame = 0; frame < 125; frame += 1) {
      const input = emptyInputFrame();
      if (frame === 4 || frame === 42) input.jab = true;
      uninterrupted = stepMatch(uninterrupted, input, emptyInputFrame(), 1 / 60);
      replayed = stepMatch(replayed, input, emptyInputFrame(), 1 / 60);
      expect(checksumMatch(replayed), `frame ${frame}`).toBe(checksumMatch(uninterrupted));
      if (frame === 61) replayed = cloneMatchSnapshot(replayed);
    }
    expect(uninterrupted.timeStop).toBeNull();
    expect(replayed.timeStop).toBeNull();
  });
});
