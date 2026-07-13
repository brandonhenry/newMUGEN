import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../../data/characters';
import { stages } from '../../data/stages';
import { createMatch } from '../../engine/fightEngine';
import { emptyInputFrame } from '../../types';
import { compactMatchSnapshot, decodeInputFrame, encodeInputFrame, hydrateMatchSnapshot } from './codec';

describe('online codec', () => {
  it('round-trips compact input bitmasks', () => {
    const input = emptyInputFrame();
    input.right = true;
    input.dashForward = true;
    input.dashBack = true;
    input.jump = true;
    input.jab = true;
    input.block = true;
    input.charge = true;

    const decoded = decodeInputFrame(encodeInputFrame(input));

    expect(decoded).toEqual(input);
  });

  it('hydrates render-critical match state from a compact snapshot', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online', 3, { aiSeed: 9090, playIntro: true, roundsToWin: 5 });
    match.fighters[0].hp = 42;
    match.fighters[0].recoverableHp = 11;
    match.fighters[0].displayRecoverableHp = 7;
    match.fighters[0].recoverableRecoveryDelayFrames = 33;
    match.fighters[0].recoverableFlashFrames = 12;
    match.fighters[0].ki = 78;
    match.fighters[0].displayKi = 31;
    match.fighters[0].transformOvercharge = 44;
    match.fighters[0].displayTransformOvercharge = 12;
    match.fighters[0].position.x = 1.25;
    match.fighters[0].controlSideSign = -1;
    match.fighters[0].state = 'juggle';
    match.fighters[0].moveInstanceId = 12;
    match.fighters[0].comboHits = 2;
    match.fighters[0].comboContactHits = 7;
    match.fighters[0].dashForwardFrames = 11;
    match.fighters[0].dashForwardCooldownFrames = 7;
    match.fighters[0].backHopFrames = 6;
    match.fighters[0].backHopTotalFrames = 12;
    match.fighters[0].backHopCooldownFrames = 5;
    match.fighters[0].walkDirection = 1;
    match.fighters[0].idleFlourishFramesRemaining = 54;
    match.fighters[0].idleFlourishTotalFrames = 72;
    match.fighters[0].juggleDamage = 31;
    match.fighters[0].juggleSequenceDamage = 9;
    match.fighters[0].juggleTornadoCount = 2;
    match.fighters[0].tornadoReactionFrames = 18;
    match.fighters[0].throwOpponentSlot = 2;
    match.fighters[0].throwAnchorMove = match.fighters[0].character.moves[0];
    match.fighters[0].throwHoldFrames = 45;
    match.fighters[0].throwMaxHoldFrames = 240;
    match.fighters[0].throwJabActive = true;
    match.fighters[0].throwJabCooldownFrames = 9;
    match.fighters[0].throwJabHitConnected = true;
    match.fighters[0].visualHitstop = { framesRemaining: 4, animationKey: 'jableft', progress: 0.45 };
    match.fighters[1].state = 'throwHeld';
    match.fighters[1].throwCaptorSlot = 1;
    match.fighters[1].throwEscapeProgress = 3;
    match.fighters[1].throwEscapeGoal = 12;
    match.fighters[1].throwShakeFrames = 8;
    match.fighters[1].visualHitstop = { framesRemaining: 3, animationKey: 'hitLight', progress: 0 };
    match.fighters[1].idleFlourishFramesRemaining = 22;
    match.fighters[1].idleFlourishTotalFrames = 48;
    match.fighters[0].shadowClone = {
      phase: 'active',
      position: { x: 0.4, y: 0.2, z: -0.5 },
      velocityY: 1.2,
      facing: 1,
      facingYaw: Math.PI / 2,
      state: 'attack',
      currentMove: match.fighters[0].character.moves[0],
      moveInstanceId: 99,
      moveFrame: 6,
      actionFramesRemaining: 14,
      hitConnected: false,
      hitConfirmed: true,
      attackConsumed: true,
      vanishOnLanding: false,
      visualHitstop: { framesRemaining: 5, animationKey: 'jabright', progress: 0.38 },
      spawnSmokeFrames: 12,
      vanishSmokeFrames: 0
    };
    match.fighters[1].roundsWon = 1;
    match.idleQuietFrames = 1234;
    match.phase = 'roundFinisher';
    match.message = '';
    match.roundFinisher = {
      attackerSlot: 1,
      defenderSlot: 2,
      impactId: 14,
      impactPosition: [0.35, 1.2, -0.15],
      duration: 0.72,
      elapsed: 0.24,
      cameraZoomScale: 0.78
    };
    match.timeStop = { ownerSlot: 1, framesRemaining: 73, totalFrames: 120 };
    match.clashState = {
      id: 4,
      status: 'input',
      sequence: ['jab', 'heavy', 'special'],
      elapsedFrames: 33,
      introFrames: 45,
      inputFrames: 150,
      resultFrames: 54,
      winnerSlot: null,
      damage: 0,
      contactPoint: [0.2, 1.4, -0.1],
      p1: { progress: 1, inputs: ['jab'], completedFrame: null, failed: false, mistakes: 0, lastInput: 'jab' },
      p2: { progress: 0, inputs: [], completedFrame: null, failed: false, mistakes: 0, lastInput: null }
    };
    match.lastTrainingFrameEventId = 8;
    match.trainingFrameEvents = [{
      id: 8,
      kind: 'block',
      position: [0.42, 1.18, -0.08],
      attackerSlot: 1,
      defenderSlot: 2,
      moveInstanceId: 12,
      frames: -3
    }];

    const snapshot = compactMatchSnapshot(match, 7);
    const base = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online');
    const hydrated = hydrateMatchSnapshot(base, snapshot);

    expect(hydrated.phase).toBe('roundFinisher');
    expect(hydrated.message).toBe('');
    expect(hydrated.roundFinisher?.attackerSlot).toBe(1);
    expect(hydrated.roundFinisher?.defenderSlot).toBe(2);
    expect(hydrated.roundFinisher?.impactId).toBe(14);
    expect(hydrated.roundFinisher?.impactPosition).toEqual([0.35, 1.2, -0.15]);
    expect(hydrated.roundFinisher?.elapsed).toBe(0.24);
    expect(hydrated.roundFinisher?.cameraZoomScale).toBe(0.78);
    expect(hydrated.timeStop).toEqual({ ownerSlot: 1, framesRemaining: 73, totalFrames: 120 });
    expect(hydrated.fighters[0].hp).toBe(42);
    expect(hydrated.fighters[0].recoverableHp).toBe(11);
    expect(hydrated.fighters[0].displayRecoverableHp).toBe(7);
    expect(hydrated.fighters[0].recoverableRecoveryDelayFrames).toBe(33);
    expect(hydrated.fighters[0].recoverableFlashFrames).toBe(12);
    expect(hydrated.fighters[0].ki).toBe(78);
    expect(hydrated.fighters[0].displayKi).toBe(31);
    expect(hydrated.fighters[0].transformOvercharge).toBe(44);
    expect(hydrated.fighters[0].displayTransformOvercharge).toBe(12);
    expect(hydrated.fighters[0].position.x).toBe(1.25);
    expect(hydrated.fighters[0].controlSideSign).toBe(-1);
    expect(hydrated.fighters[0].moveInstanceId).toBe(12);
    expect(hydrated.fighters[0].comboHits).toBe(2);
    expect(hydrated.fighters[0].comboContactHits).toBe(7);
    expect(hydrated.fighters[0].dashForwardFrames).toBe(11);
    expect(hydrated.fighters[0].dashForwardCooldownFrames).toBe(7);
    expect(hydrated.fighters[0].backHopFrames).toBe(6);
    expect(hydrated.fighters[0].backHopTotalFrames).toBe(12);
    expect(hydrated.fighters[0].backHopCooldownFrames).toBe(5);
    expect(hydrated.fighters[0].walkDirection).toBe(1);
    expect(hydrated.fighters[0].idleFlourishFramesRemaining).toBe(54);
    expect(hydrated.fighters[0].idleFlourishTotalFrames).toBe(72);
    expect(hydrated.fighters[0].juggleDamage).toBe(31);
    expect(hydrated.fighters[0].juggleSequenceDamage).toBe(9);
    expect(hydrated.fighters[0].juggleTornadoCount).toBe(2);
    expect(hydrated.fighters[0].tornadoReactionFrames).toBe(18);
    expect(hydrated.fighters[0].throwOpponentSlot).toBe(2);
    expect(hydrated.fighters[0].throwAnchorMove?.input).toBe('jab');
    expect(hydrated.fighters[0].throwHoldFrames).toBe(45);
    expect(hydrated.fighters[0].throwJabActive).toBe(true);
    expect(hydrated.fighters[0].throwJabCooldownFrames).toBe(9);
    expect(hydrated.fighters[0].throwJabHitConnected).toBe(true);
    expect(hydrated.fighters[0].visualHitstop).toEqual({ framesRemaining: 4, animationKey: 'jableft', progress: 0.45 });
    expect(hydrated.fighters[0].shadowClone?.hitConfirmed).toBe(true);
    expect(hydrated.fighters[1].state).toBe('throwHeld');
    expect(hydrated.fighters[1].throwCaptorSlot).toBe(1);
    expect(hydrated.fighters[1].throwEscapeProgress).toBe(3);
    expect(hydrated.fighters[1].throwEscapeGoal).toBe(12);
    expect(hydrated.fighters[1].throwShakeFrames).toBe(8);
    expect(hydrated.fighters[1].visualHitstop).toEqual({ framesRemaining: 3, animationKey: 'hitLight', progress: 0 });
    expect(hydrated.fighters[1].idleFlourishFramesRemaining).toBe(22);
    expect(hydrated.fighters[1].idleFlourishTotalFrames).toBe(48);
    expect(hydrated.fighters[0].shadowClone?.position).toEqual({ x: 0.4, y: 0.2, z: -0.5 });
    expect(hydrated.fighters[0].shadowClone?.currentMove?.input).toBe('jab');
    expect(hydrated.fighters[0].shadowClone?.visualHitstop).toEqual({ framesRemaining: 5, animationKey: 'jabright', progress: 0.38 });
    expect(hydrated.fighters[1].roundsWon).toBe(1);
    expect(hydrated.roundsToWin).toBe(5);
    expect(hydrated.aiSeed).toBe(match.aiSeed);
    expect(hydrated.roundAiSeed).toBe(match.roundAiSeed);
    expect(hydrated.idleQuietFrames).toBe(1234);
    expect(hydrated.clashState.status).toBe('input');
    expect(hydrated.clashState.sequence).toEqual(['jab', 'heavy', 'special']);
    expect(hydrated.clashState.p1.progress).toBe(1);
    expect(hydrated.clashState.contactPoint).toEqual([0.2, 1.4, -0.1]);
    expect(hydrated.lastTrainingFrameEventId).toBe(8);
    expect(hydrated.trainingFrameEvents).toEqual(match.trainingFrameEvents);

    const legacySnapshot = { ...snapshot };
    delete (legacySnapshot as Partial<typeof snapshot>).roundsToWin;
    delete (legacySnapshot as Partial<typeof snapshot>).lastTrainingFrameEventId;
    delete (legacySnapshot as Partial<typeof snapshot>).trainingFrameEvents;
    expect(hydrateMatchSnapshot(base, legacySnapshot).roundsToWin).toBe(3);
    expect(hydrateMatchSnapshot(base, legacySnapshot).trainingFrameEvents).toEqual([]);
  });
});
