import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { normalizeMove, validateCharacter } from '../lib/characterLoader';
import { emptyInputFrame, type CharacterDefinition, type MoveDefinition } from '../types';
import { createMatch, stepMatch } from './fightEngine';

describe('character manifests', () => {
  it('ships starter characters without loader warnings', () => {
    expect(starterCharacters.map((character) => [character.id, validateCharacter(character)])).toEqual([
      ['kiro', []],
      ['riven', []]
    ]);
  });

  it('converts legacy second timing to frame timing', () => {
    const legacy = normalizeMove({
      ...starterCharacters[0].moves[0],
      startupFrames: undefined as unknown as number,
      activeFrames: undefined as unknown as number,
      recoveryFrames: undefined as unknown as number,
      startup: 0.1,
      active: 0.12,
      recovery: 0.23,
      push: 0.72,
      hitstun: 0.32
    });

    expect(legacy.startupFrames).toBe(6);
    expect(legacy.activeFrames).toBe(7);
    expect(legacy.recoveryFrames).toBe(14);
    expect(legacy.hitLevel).toBe('high');
  });
});

describe('fight engine', () => {
  it('moves fighters toward each other with right input', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1 = emptyInputFrame();
    p1.right = true;
    const next = stepMatch(match, p1, emptyInputFrame(), 1 / 60);
    expect(next.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);
  });

  it('drives both fighters from AI in CPU vs CPU mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1StartX = match.fighters[0].position.x;
    const p2StartX = match.fighters[1].position.x;

    for (let i = 0; i < 6; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].position.x).toBeGreaterThan(p1StartX);
    expect(match.fighters[1].position.x).toBeLessThan(p2StartX);
  });

  it('keeps the opponent dummy passive in training mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;
    const p2Attack = emptyInputFrame();
    p2Attack.left = true;
    p2Attack.jab = true;
    p2Attack.heavy = true;

    for (let i = 0; i < 120; i += 1) {
      match = stepMatch(match, emptyInputFrame(), p2Attack, 1 / 60);
      expect(match.fighters[1].state).not.toBe('attack');
      expect(match.fighters[1].currentMove).toBeNull();
    }

    expect(match.fighters[0].hp).toBe(starterCharacters[0].stats.health);
  });

  it('keeps CPU fighters attacking during an extended exchange', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');
    match.phase = 'fighting';
    match.countdown = 0;
    let attackFrames = 0;
    let movingFrames = 0;

    for (let i = 0; i < 420; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters.some((fighter) => fighter.state === 'attack')) attackFrames += 1;
      if (match.fighters.some((fighter) => fighter.state === 'walk' || fighter.state === 'sidestep')) movingFrames += 1;
      if (match.phase !== 'fighting') break;
    }

    expect(attackFrames).toBeGreaterThan(80);
    expect(movingFrames).toBeGreaterThan(20);
  });

  it('keeps CPU fighters from attacking until their selected move is in range', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -7;
    match.fighters[1].position.x = 7;
    const startDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    let outOfRangeAttackFrames = 0;
    let walkFrames = 0;

    for (let i = 0; i < 75; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const currentDistance = Math.hypot(
        match.fighters[1].position.x - match.fighters[0].position.x,
        match.fighters[1].position.z - match.fighters[0].position.z
      );
      if (currentDistance > 2.8 && match.fighters.some((fighter) => fighter.state === 'attack')) outOfRangeAttackFrames += 1;
      if (match.fighters.some((fighter) => fighter.state === 'walk')) walkFrames += 1;
    }

    const endDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    expect(outOfRangeAttackFrames).toBe(0);
    expect(endDistance).toBeLessThan(startDistance);
    expect(walkFrames).toBeGreaterThan(0);
  });

  it('backs CPU fighters up when they are crowded instead of always swinging', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 3);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.25;
    match.fighters[1].position.x = 0.25;
    const startDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    let attackFrames = 0;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters.some((fighter) => fighter.state === 'attack')) attackFrames += 1;
    }

    const endDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    expect(attackFrames).toBe(0);
    expect(endDistance).toBeGreaterThan(startDistance);
  });

  it('scales CPU attack frequency and route complexity by difficulty', () => {
    const simulate = (difficulty: 1 | 5) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', difficulty);
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      const seenMoveKeys = new Set<string>();
      let attackStarts = 0;
      let complexFrames = 0;
      let maxComboStep = 0;

      for (let i = 0; i < 540; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        for (const fighter of match.fighters) {
          if (fighter.state !== 'attack' || !fighter.currentMove) continue;
          if (fighter.moveFrame === 0) attackStarts += 1;
          maxComboStep = Math.max(maxComboStep, fighter.comboStep);
          if (fighter.currentMove.route && fighter.currentMove.route !== 'neutral') complexFrames += 1;
          seenMoveKeys.add(fighter.currentMove.comboKey ?? fighter.currentMove.command ?? fighter.currentMove.id);
        }
        if (match.phase !== 'fighting') break;
      }

      return { attackStarts, complexFrames, maxComboStep, uniqueMoves: seenMoveKeys.size };
    };

    const easy = simulate(1);
    const kore = simulate(5);

    expect(kore.attackStarts).toBeGreaterThan(easy.attackStarts);
    expect(kore.complexFrames).toBeGreaterThan(easy.complexFrames);
    expect(kore.maxComboStep).toBeGreaterThanOrEqual(3);
    expect(kore.uniqueMoves).toBeGreaterThan(easy.uniqueMoves);
  });

  it('makes CPU fighters block incoming close attacks', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = starterCharacters[0].moves[0];
    match.fighters[0].actionTimer = 0.35;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('block');
  });

  it('keeps movement directions correct after fighters swap sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 1.3;
    match.fighters[1].position.x = -1.3;

    const toward = emptyInputFrame();
    toward.left = true;
    const towardResult = stepMatch(match, toward, emptyInputFrame(), 1 / 60);
    expect(towardResult.fighters[0].position.x).toBeLessThan(match.fighters[0].position.x);

    const away = emptyInputFrame();
    away.right = true;
    const awayResult = stepMatch(match, away, emptyInputFrame(), 1 / 60);
    expect(awayResult.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);
    expect(awayResult.fighters[0].state).toBe('block');

    const laneUp = emptyInputFrame();
    laneUp.sidewalkUp = true;
    const laneUpResult = stepMatch(match, laneUp, emptyInputFrame(), 10 / 60);
    expect(laneUpResult.fighters[0].position.z).toBeLessThan(match.fighters[0].position.z - 0.35);

    const laneDown = emptyInputFrame();
    laneDown.sidewalkDown = true;
    const laneDownResult = stepMatch(match, laneDown, emptyInputFrame(), 10 / 60);
    expect(laneDownResult.fighters[0].position.z).toBeGreaterThan(match.fighters[0].position.z + 0.35);
  });

  it('uses up for jump, down for crouch, and lane inputs for 3D movement', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jump = emptyInputFrame();
    jump.up = true;
    match = stepMatch(match, jump, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('jump');
    expect(match.fighters[0].velocityY).toBeGreaterThan(0);
    expect(match.fighters[0].position.z).toBe(0);

    for (let i = 0; i < 80; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const crouch = emptyInputFrame();
    crouch.down = true;
    match = stepMatch(match, crouch, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].position.z).toBe(0);

    const laneWalk = emptyInputFrame();
    laneWalk.sidewalkDown = true;
    const radiusBefore = Math.hypot(
      match.fighters[0].position.x - match.fighters[1].position.x,
      match.fighters[0].position.z - match.fighters[1].position.z
    );
    const xBeforeWalk = match.fighters[0].position.x;
    const beforeWalk = match.fighters[0].position.z;
    match = stepMatch(match, laneWalk, emptyInputFrame(), 10 / 60);
    const radiusAfter = Math.hypot(
      match.fighters[0].position.x - match.fighters[1].position.x,
      match.fighters[0].position.z - match.fighters[1].position.z
    );
    expect(match.fighters[0].position.z).toBeGreaterThan(beforeWalk + 0.35);
    expect(match.fighters[0].position.x).not.toBeCloseTo(xBeforeWalk, 3);
    expect(radiusAfter).toBeCloseTo(radiusBefore, 1);
  });

  it('applies block chip instead of full damage', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - 1);
  });

  it('only resolves a hit during active frames', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;

    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < starterCharacters[0].moves[0].startupFrames; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - starterCharacters[0].moves[0].damage);
  });

  it('does not let knocked down fighters get hit', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    match.fighters[1].state = 'knockdown';
    match.fighters[1].actionFramesRemaining = 80;
    match.fighters[1].actionTimer = 80 / 60;
    match.fighters[1].stunFramesRemaining = 80;
    match.fighters[1].stunTimer = 80 / 60;
    const hpBefore = match.fighters[1].hp;

    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].state).toBe('knockdown');
    expect(match.fighters[1].hp).toBe(hpBefore);
  });

  it('lets knocked down fighters roll during recovery as an invulnerable dodge', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    match.fighters[1].state = 'knockdown';
    match.fighters[1].actionFramesRemaining = 12;
    match.fighters[1].actionTimer = 12 / 60;
    match.fighters[1].stunFramesRemaining = 12;
    match.fighters[1].stunTimer = 12 / 60;
    const zBefore = match.fighters[1].position.z;
    const hpBefore = match.fighters[1].hp;
    const roll = emptyInputFrame();
    roll.sidewalkUp = true;

    match = stepMatch(match, emptyInputFrame(), roll, 1 / 60);
    expect(match.fighters[1].getupStarted).toBe(true);
    expect(match.fighters[1].getupInvulnerableFrames).toBeGreaterThan(0);

    const forcedHit = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 8,
      range: 2.5
    };
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = forcedHit;
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].moveFrame = 0;
    match.fighters[0].hitConnected = false;

    for (let i = 0; i < 4; i += 1) {
      match = stepMatch(match, emptyInputFrame(), roll, 1 / 60);
    }

    expect(match.fighters[1].hp).toBe(hpBefore);
    expect(match.fighters[1].position.z).toBeLessThan(zBefore);
  });

  it('creates punish windows from block advantage', () => {
    const attacker: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        jab: {
          startupFrames: 1,
          activeFrames: 1,
          recoveryFrames: 20,
          onBlockFrames: -10
        }
      }
    };
    let match = createMatch(attacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;

    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 5; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].actionFramesRemaining - match.fighters[1].blockstunFramesRemaining).toBe(10);
  });

  it('blocks while holding away from the opponent on either side', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const p1Back = emptyInputFrame();
    p1Back.left = true;
    match = stepMatch(match, p1Back, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('block');

    match.fighters[0].position.x = 1.3;
    match.fighters[1].position.x = -1.3;
    const p1BackAfterSwap = emptyInputFrame();
    p1BackAfterSwap.right = true;
    match = stepMatch(match, p1BackAfterSwap, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('block');
  });

  it('builds combo routes from repeated limbs and directions', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(1);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab');

    for (let i = 0; i < 10; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const oneAgain = emptyInputFrame();
    oneAgain.jab = true;
    match = stepMatch(match, oneAgain, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab-jab');
    expect(match.fighters[0].currentMove?.damage).toBeGreaterThan(starterCharacters[0].moves[0].damage);

    for (let i = 0; i < 10; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const downForwardFour = emptyInputFrame();
    downForwardFour.down = true;
    downForwardFour.right = true;
    downForwardFour.special = true;
    match = stepMatch(match, downForwardFour, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.route).toBe('down-forward');
    expect(match.fighters[0].currentMove?.comboKey).toContain('special');
  });

  it('uses configured Tekken-style command moves when their frame slot exists', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const forwardOne = emptyInputFrame();
    forwardOne.right = true;
    forwardOne.jab = true;
    match = stepMatch(match, forwardOne, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.command).toBe('f+1');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:f+1');
    expect(match.fighters[0].currentMove?.comboKey).toBe('f+1:jab');
  });

  it('applies frame data overrides for configured command moves', () => {
    const tunedCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        'cmd:f+1': {
          startupFrames: 3,
          activeFrames: 2,
          recoveryFrames: 9,
          damage: 99,
          onBlockFrames: 4,
          onHitFrames: 12,
          onCounterHitFrames: 14
        }
      }
    };
    let match = createMatch(tunedCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const forwardOne = emptyInputFrame();
    forwardOne.right = true;
    forwardOne.jab = true;
    match = stepMatch(match, forwardOne, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.startupFrames).toBe(3);
    expect(match.fighters[0].currentMove?.damage).toBe(99);
    expect(match.fighters[0].currentMove?.onBlockFrames).toBe(4);
  });

  it('keeps whiffed moves in recovery until total frames complete', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;
    const attack = emptyInputFrame();
    attack.heavy = true;
    match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
    attack.heavy = false;
    const total = starterCharacters[0].moves[2].startupFrames + starterCharacters[0].moves[2].activeFrames + starterCharacters[0].moves[2].recoveryFrames;

    for (let i = 0; i < total - 1; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('attack');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('idle');
  });

  it('finishes a round when health reaches zero', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.fighters[1].hp = 1;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    const attack = emptyInputFrame();
    attack.heavy = true;
    for (let i = 0; i < 40; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.heavy = false;
    }
    expect(match.phase).toBe('roundOver');
    expect(match.fighters[0].roundsWon).toBe(1);
  });

  it('keeps the fight phase active without hit-stop and accepts movement after hitstun', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }
    expect(match.cameraShake).toBe(0);
    expect(match.lastHitId).toBe(0);
    expect(match.fighters[1].hitFlash).toBe(0);
    expect(match.fighters[1].state).toBe('hit');
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].actionFramesRemaining).toBeGreaterThan(0);
    const zBefore = match.fighters[1].position.z;
    const xBefore = match.fighters[1].position.x;
    for (let i = 0; i < 32; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const moveAfterHit = emptyInputFrame();
    moveAfterHit.sidewalkUp = true;
    match = stepMatch(match, emptyInputFrame(), moveAfterHit, 1 / 60);
    expect(match.phase).toBe('fighting');
    expect(Math.abs(match.fighters[1].position.z - zBefore) + Math.abs(match.fighters[1].position.x - xBefore)).toBeGreaterThan(0.01);
  });

  it('launches into juggle float instead of immediate knockdown for non-knockdown launcher routes', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    const launcher = emptyInputFrame();
    launcher.up = true;
    launcher.jab = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, launcher, emptyInputFrame(), 1 / 60);
      launcher.jab = false;
    }

    expect(match.fighters[1].state).toBe('hit');
    expect(match.fighters[1].position.y).toBeGreaterThan(0);
    expect(match.fighters[1].juggleDamage).toBeGreaterThan(0);
  });

  it('forces knockdown after enough juggle damage', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.7;
    match.fighters[1].position.x = 0.7;
    match.fighters[1].position.y = 0.5;
    match.fighters[1].velocityY = 0.2;
    match.fighters[1].state = 'hit';
    match.fighters[1].juggleDamage = 42;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      knockdown: false,
      launchHeight: undefined,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].moveFrame = 0;
    match.fighters[0].hitConnected = false;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('knockdown');
    expect(match.fighters[1].juggleDamage).toBe(0);
  });
});
