import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { stages } from '../data/stages';
import { normalizeCharacter, normalizeMove, validateCharacter } from '../lib/characterLoader';
import { cloneSettings, defaultGameSettings, sanitizeGameSettings } from '../lib/gameSettings';
import {
  applyHorizontalTap,
  applyQueuedPressesToInputs,
  applyVerticalTap,
  consumeVerticalTapAfterRead,
  consumeHorizontalTapAfterRead,
  createHorizontalTapState,
  createVerticalTapState,
  enqueueInputPress,
  getKeyboardBindingsForEvent,
  prepareVerticalTapForRead
} from '../hooks/useControls';
import { compactMatchSnapshot, hydrateMatchSnapshot } from '../lib/online/codec';
import { emptyInputFrame, type ActionName, type CharacterDefinition, type InputFrameWithMetadata, type MatchSnapshot, type MoveDefinition, type MoveInput, type MoveProjectileInstance, type StageDefinition } from '../types';
import { activeMoveProgress, createMatch, getAuthoredNeutralStringDamageCeiling, getAuthoredNeutralStringRouteCount, getFighterAnimationFrameSource, stepMatch } from './fightEngine';

function unwrappedAngleDelta(next: number, previous: number) {
  let delta = next - previous;
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function fighterOrbitAngle(match: MatchSnapshot, fighterIndex: 0 | 1) {
  const fighter = match.fighters[fighterIndex];
  const opponent = match.fighters[fighterIndex === 0 ? 1 : 0];
  return Math.atan2(fighter.position.z - opponent.position.z, fighter.position.x - opponent.position.x);
}

const visualFamilyByInput: Record<MoveInput, string> = {
  jab: 'visual:jableft',
  heavy: 'visual:jabright',
  kick: 'visual:kickleft',
  special: 'visual:kickright'
};

function makeBeginnerSchemeCharacter(options: { includeFinisherCommands?: boolean } = {}): CharacterDefinition {
  const includeFinisherCommands = options.includeFinisherCommands ?? true;
  const base = starterCharacters[0];
  return {
    ...base,
    id: `${base.id}-beginner-scheme-test${includeFinisherCommands ? '' : '-fallback'}`,
    displayName: 'Beginner Scheme Test',
    animationFrames: {
      ...(base.animationFrames ?? {}),
      jableft: ['/test-jableft.png'],
      jabright: ['/test-jabright.png'],
      kickleft: ['/test-kickleft.png'],
      kickright: ['/test-kickright.png'],
      ...(includeFinisherCommands
        ? {
            'cmd:qcf+4': ['/test-qcf4.png'],
            'cmd:1+2': ['/test-12.png'],
            'cmd:2+3': ['/test-23.png'],
            'cmd:O+4': ['/test-o4.png']
          }
        : {
            'cmd:qcf+4': [],
            'cmd:1+2': [],
            'cmd:2+3': [],
            'cmd:O+4': []
          })
    },
    moveOverrides: {
      jableft: { damage: 10, blockDamage: 5 },
      jabright: { damage: 20, blockDamage: 5 },
      kickleft: { damage: 30, blockDamage: 5 },
      kickright: { damage: 40, blockDamage: 5 },
      ...(includeFinisherCommands
        ? {
            'cmd:qcf+4': { damage: 18, blockDamage: 5, label: 'Test qcf+4' },
            'cmd:1+2': { damage: 19, blockDamage: 5, label: 'Test 1+2' },
            'cmd:2+3': { damage: 20, blockDamage: 5, label: 'Test 2+3' },
            'cmd:O+4': { damage: 24, blockDamage: 5, label: 'Test O+4', usesKi: true, kiCost: 35 }
          }
        : {})
    }
  };
}

function makeInput(...actions: ActionName[]) {
  const input = emptyInputFrame();
  actions.forEach((action) => {
    input[action] = true;
  });
  return input;
}

function makeProjectileCharacter(id: string, options: Partial<MoveDefinition> = {}, projectileOptions: Partial<MoveProjectileInstance> = {}): CharacterDefinition {
  const base = normalizeCharacter(starterCharacters[0]);
  const jab = normalizeMove({
    ...base.moves.find((move) => move.input === 'jab')!,
    id: `${id}-shot`,
    label: 'Test Shot',
    input: 'jab',
    animationKey: 'jableft',
    startupFrames: 2,
    activeFrames: 1,
    recoveryFrames: 4,
    damage: 10,
    blockDamage: 2,
    range: 0.1,
    hitbox: { offset: [0, 1, 0.2], size: [0.1, 0.1, 0.1] },
    ...options
  });
  return normalizeCharacter({
    ...base,
    id,
    displayName: id,
    animationFrames: {
      ...(base.animationFrames ?? {}),
      jableft: ['/test-jab.png']
    },
    moves: [jab, ...base.moves.filter((move) => move.input !== 'jab')],
    projectiles: [{
      id: 'test-bullet',
      name: 'Test Bullet',
      frames: ['/characters/test/projectiles/test-bullet/frames/frame-000.png'],
      animationFrames: { active: ['/characters/test/projectiles/test-bullet/frames/frame-000.png'] },
      fps: 12,
      loop: true,
      billboard: false,
      blendMode: 'additive',
      voxelProfile: 'image-source',
      defaultScale: [0.35, 0.35, 0.35],
      defaultRotation: [0, 0, 0]
    }],
    moveProjectiles: {
      jableft: [{
        id: 'jab-shot',
        projectileId: 'test-bullet',
        label: 'Test Shot',
        spawnFrame: 2,
        spawnOffset: [0, 1, 0.7],
        startupFrames: 0,
        activeFrames: 90,
        recoveryFrames: 4,
        lifetimeFrames: 94,
        speed: 12,
        forwardVelocity: 12,
        homingMode: 'limited',
        homingStrength: 3,
        homingTurnRate: 4,
        nearMissRadius: 0.52,
        hitbox: { offset: [0, 0, 0], size: [0.42, 0.42, 0.5] },
        damageScale: 1,
        blockDamageScale: 1,
        pushbackScale: 1,
        blockPushbackScale: 1,
        mirrorWithFacing: true,
        ...projectileOptions
      }]
    }
  });
}

function stepFrames(match: MatchSnapshot, frames: number, p1 = emptyInputFrame(), p2 = emptyInputFrame()) {
  let next = match;
  for (let frame = 0; frame < frames; frame += 1) next = stepMatch(next, p1, p2, 1 / 60);
  return next;
}

function readyForBeginnerAutoComboLink(match: MatchSnapshot) {
  match.fighters[0].state = 'idle';
  match.fighters[0].currentMove = null;
  match.fighters[0].actionFramesRemaining = 0;
  match.fighters[0].actionTimer = 0;
  match.fighters[0].hitConfirmed = true;
  match.fighters[0].comboTimer = 0.5;
  match.fighters[0].comboHits = 1;
  match.fighters[0].previousAttackInputs.special = false;
  match.fighters[1].stunFramesRemaining = 30;
  match.fighters[1].stunTimer = 0.5;
}

function boundsLocalPosition(stage: StageDefinition, position: { x: number; z: number }) {
  const center = stage.fightPlane?.center ?? [0, 0, 0];
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  const dx = position.x - center[0];
  const dz = position.z - center[2];
  return {
    x: dx * Math.cos(rotationY) - dz * Math.sin(rotationY),
    z: dx * Math.sin(rotationY) + dz * Math.cos(rotationY)
  };
}

function boundsWorldPosition(stage: StageDefinition, local: { x: number; z: number }) {
  const center = stage.fightPlane?.center ?? [0, 0, 0];
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  return {
    x: center[0] + local.x * Math.cos(rotationY) + local.z * Math.sin(rotationY),
    z: center[2] - local.x * Math.sin(rotationY) + local.z * Math.cos(rotationY)
  };
}

function stageSideDelta(stage: StageDefinition, fighter: { position: { x: number; z: number } }, opponent: { position: { x: number; z: number } }) {
  return boundsLocalPosition(stage, opponent.position).x - boundsLocalPosition(stage, fighter.position).x;
}

function makeKiClashCharacter(character: CharacterDefinition, kiBurst = true): CharacterDefinition {
  return {
    ...character,
    moves: character.moves.map((move) =>
      move.input === 'jab'
        ? {
            ...move,
            kiBurst,
            kiCost: 0,
            startupFrames: 1,
            activeFrames: 24,
            recoveryFrames: 10,
            damage: 12,
            range: 2.4,
            hitbox: {
              offset: [0, 1.1, 0.72],
              size: [1.35, 1.35, 1.65]
            }
          }
        : move
    )
  };
}

function makeCancelableCharacter(character: CharacterDefinition, inputs?: MoveInput[]): CharacterDefinition {
  const allowed = inputs ? new Set(inputs) : null;
  return {
    ...character,
    moves: character.moves.map((move) => (allowed && !allowed.has(move.input) ? move : { ...move, cancelable: true }))
  };
}

function makeAntiAirCharacter(character: CharacterDefinition): CharacterDefinition {
  return {
    ...character,
    moves: character.moves
      .filter((move) => move.input === 'jab' || move.input === 'special')
      .map((move) =>
        move.input === 'special'
          ? {
              ...move,
              label: 'Counter Upper',
              startupFrames: 5,
              activeFrames: 7,
              recoveryFrames: 16,
              damage: 14,
              range: 1.72,
              hitLevel: 'mid' as const,
              launchHeight: 1.1,
              counterHit: true,
              counterHitStunBonusFrames: 6,
              hitbox: { offset: [0.6, 1.42, 0], size: [1.0, 1.3, 0.68] }
            }
          : {
              ...move,
              startupFrames: 4,
              activeFrames: 4,
              recoveryFrames: 14,
              damage: 6,
              range: 1.2,
              hitLevel: 'mid' as const,
              launchHeight: undefined,
              counterHit: false,
              hitbox: { offset: [0.48, 0.82, 0], size: [0.9, 0.55, 0.56] }
            }
      )
  };
}

function stepUntilFighterActionable(match: MatchSnapshot, fighterIndex: 0 | 1, maxFrames = 90): MatchSnapshot {
  let next = match;
  for (let i = 0; i < maxFrames && (next.fighters[fighterIndex].actionFramesRemaining > 0 || next.fighters[fighterIndex].actionTimer > 0); i += 1) {
    next = stepMatch(next, emptyInputFrame(), emptyInputFrame(), 1 / 60);
  }
  return next;
}

function startKiClashMatch() {
  let match = createPreparedClashMatch();
  return stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
}

function stepQuiet(match: MatchSnapshot, frames: number) {
  let next = match;
  for (let frame = 0; frame < frames; frame += 1) {
    next = stepMatch(next, emptyInputFrame(), emptyInputFrame(), 1 / 60);
  }
  return next;
}

function primeAirborneAttack(match: MatchSnapshot, fighterIndex: 0 | 1) {
  const fighter = match.fighters[fighterIndex];
  const move: MoveDefinition = {
    ...fighter.character.moves[0],
    startupFrames: 1,
    activeFrames: 28,
    recoveryFrames: 16,
    damage: 8,
    range: 0.72,
    hitbox: { offset: [0.42, 1.05, 0], size: [0.74, 0.7, 0.54] }
  };
  fighter.state = 'attack';
  fighter.currentMove = move;
  fighter.moveFrame = 1;
  fighter.position.y = 0.86;
  fighter.velocityY = -0.2;
  fighter.actionFramesRemaining = 36;
  fighter.actionTimer = 36 / 60;
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
}

function createPreparedClashMatch(p1KiBurst = true, p2KiBurst = true) {
  const match = createMatch(makeKiClashCharacter(starterCharacters[0], p1KiBurst), makeKiClashCharacter(starterCharacters[1], p2KiBurst), stages[0], 'local2p');
  match.phase = 'fighting';
  match.countdown = 0;
  match.fighters[0].position.x = -0.7;
  match.fighters[1].position.x = 0.7;
  match.fighters.forEach((fighter) => {
    const move = fighter.character.moves.find((candidate) => candidate.input === 'jab');
    if (!move) throw new Error('missing jab');
    fighter.state = 'attack';
    fighter.currentMove = move;
    fighter.moveFrame = 1;
    fighter.actionFramesRemaining = 28;
    fighter.actionTimer = 28 / 60;
    fighter.hitConnected = false;
    fighter.hitConfirmed = false;
  });
  return match;
}

function clashWrongButton(button: MoveInput | undefined): MoveInput {
  const order: MoveInput[] = ['jab', 'heavy', 'kick', 'special'];
  const index = order.indexOf(button ?? 'jab');
  return order[(index + 1) % order.length] ?? 'heavy';
}

function makeTransformRoster() {
  const base: CharacterDefinition = {
    ...starterCharacters[0],
    id: 'transform-base',
    displayName: 'Transform Base',
    hasTransform: true,
    transformCharacterId: 'transform-form',
    stats: { ...starterCharacters[0].stats, health: 120 }
  };
  const form: CharacterDefinition = {
    ...starterCharacters[1],
    id: 'transform-form',
    displayName: 'Transform Form',
    hasTransform: true,
    transformCharacterId: 'transform-final',
    stats: { ...starterCharacters[1].stats, health: 240 }
  };
  const final: CharacterDefinition = {
    ...starterCharacters[0],
    id: 'transform-final',
    displayName: 'Transform Final',
    hasTransform: false,
    transformCharacterId: undefined,
    stats: { ...starterCharacters[0].stats, health: 180 }
  };
  const opponent: CharacterDefinition = {
    ...starterCharacters[1],
    id: 'transform-opponent',
    displayName: 'Transform Opponent'
  };
  return { base, form, final, opponent, roster: [base, form, final, opponent] };
}

function allLimbsInput() {
  return {
    ...emptyInputFrame(),
    jab: true,
    heavy: true,
    kick: true,
    special: true
  };
}

function chargeUntilTransformReady(match: ReturnType<typeof createMatch>, slot: 0 | 1 = 0) {
  let next = match;
  for (let frame = 0; frame < 560 && next.fighters[slot].transformReadyTimer <= 0; frame += 1) {
    const charge = { ...emptyInputFrame(), charge: true };
    next = slot === 0
      ? stepMatch(next, charge, emptyInputFrame(), 1 / 60)
      : stepMatch(next, emptyInputFrame(), charge, 1 / 60);
  }
  return next;
}

function makeThrowCaptureMove(overrides: Partial<MoveDefinition> = {}): MoveDefinition {
  return {
    ...starterCharacters[0].moves[0],
    id: 'test-throw-capture',
    label: 'Test Throw Capture',
    input: 'jab',
    animationKey: 'jableft',
    startupFrames: 1,
    activeFrames: 6,
    recoveryFrames: 12,
    damage: 10,
    blockDamage: 0,
    hitLevel: 'throw',
    onBlockFrames: -4,
    onHitFrames: 12,
    onCounterHitFrames: 16,
    range: 2.4,
    pushback: 0.4,
    blockPushback: 0.2,
    launchHeight: undefined,
    tornado: false,
    knockdown: false,
    throwCapture: true,
    hitbox: {
      offset: [0, 1.1, 0.74],
      size: [1.2, 1.2, 1.4]
    },
    ...overrides
  };
}

function makeHeldJabCharacter(): CharacterDefinition {
  return {
    ...starterCharacters[0],
    moves: starterCharacters[0].moves.map((move) =>
      move.input === 'jab'
        ? {
            ...move,
            id: 'held-left-jab',
            label: 'Held Left Jab',
            input: 'jab',
            animationKey: 'jableft',
            startupFrames: 1,
            activeFrames: 2,
            recoveryFrames: 5,
            damage: 7,
            blockDamage: 0,
            hitLevel: 'high',
            onHitFrames: -3,
            onCounterHitFrames: 0,
            range: 1.2,
            pushback: 0,
            blockPushback: 0,
            launchHeight: 0,
            tornado: false,
            knockdown: false,
            throwCapture: false
          }
        : move
    )
  };
}

function startActiveThrowHit(match: ReturnType<typeof createMatch>, attackerIndex: 0 | 1 = 0, move: MoveDefinition = makeThrowCaptureMove()) {
  const attacker = match.fighters[attackerIndex];
  const defender = match.fighters[attackerIndex === 0 ? 1 : 0];
  attacker.position.x = attackerIndex === 0 ? -0.45 : 0.45;
  defender.position.x = attackerIndex === 0 ? 0.45 : -0.45;
  attacker.position.z = 0;
  defender.position.z = 0;
  attacker.facing = attackerIndex === 0 ? 1 : -1;
  defender.facing = attackerIndex === 0 ? -1 : 1;
  attacker.facingYaw = attacker.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  defender.facingYaw = defender.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  attacker.state = 'attack';
  attacker.currentMove = move;
  attacker.actionFramesRemaining = 18;
  attacker.actionTimer = 18 / 60;
  attacker.moveFrame = Math.max(1, move.startupFrames);
  attacker.hitConnected = false;
  attacker.hitConfirmed = false;
}

function stepWithMash(match: ReturnType<typeof createMatch>, defenderSlot: 1 | 2, button: MoveInput = 'jab') {
  const press = { ...emptyInputFrame(), [button]: true };
  const release = emptyInputFrame();
  const pressed = stepMatch(match, defenderSlot === 1 ? press : release, defenderSlot === 2 ? press : release, 1 / 60);
  return stepMatch(pressed, release, release, 1 / 60);
}

describe('character manifests', () => {
  it('ships starter characters without loader warnings', () => {
    expect(starterCharacters.map((character) => [character.id, validateCharacter(character)])).toEqual([
      ['kiro', []],
      ['riven', []]
    ]);
  });

  it('ships starter launchers disabled by default so Characters controls the toggle', () => {
    for (const character of starterCharacters) {
      const baseLaunchers = character.moves.filter((move) => (move.launchHeight ?? 0) > 0);
      const overrideLaunchers = Object.values(character.moveOverrides ?? {}).filter((move) => (move.launchHeight ?? 0) > 0);
      const launchers = [...baseLaunchers, ...overrideLaunchers];

      expect(launchers.length, `${character.displayName} default launcher count`).toBe(0);
    }
  });

  it('ships starter tornado moves disabled by default so Characters controls the toggle', () => {
    for (const character of starterCharacters) {
      const baseTornadoes = character.moves.filter((move) => move.tornado);
      const overrideTornadoes = Object.values(character.moveOverrides ?? {}).filter((move) => move.tornado);

      expect([...baseTornadoes, ...overrideTornadoes].length, `${character.displayName} default tornado count`).toBe(0);
    }
  });

  it('ships starter block damage disabled by default so Characters controls chip damage', () => {
    for (const character of starterCharacters) {
      const baseChipMoves = character.moves.filter((move) => move.blockDamage > 0);
      const overrideChipMoves = Object.values(character.moveOverrides ?? {}).filter((move) => (move.blockDamage ?? 0) > 0);

      expect([...baseChipMoves, ...overrideChipMoves].length, `${character.displayName} default chip count`).toBe(0);
    }
  });

  it('keeps starter and shared string damage inside the v1 balance budget', () => {
    for (const character of starterCharacters) {
      const authoredMoves = [
        ...character.moves.map((move) => ({ key: move.id, damage: move.damage })),
        ...Object.entries(character.moveOverrides ?? {})
          .filter(([, move]) => move.damage != null)
          .map(([key, move]) => ({ key, damage: move.damage ?? 0 }))
      ];

      for (const move of authoredMoves) {
        expect(move.damage, `${character.displayName} ${move.key}`).toBeLessThanOrEqual(16);
      }
    }

    expect(getAuthoredNeutralStringDamageCeiling()).toBeLessThanOrEqual(15);
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

  it('normalizes authored tornado move data as an explicit boolean', () => {
    const move = normalizeMove({
      ...starterCharacters[0].moves[0],
      tornado: true,
      throwCapture: true,
      usesKi: true,
      kiCost: 35,
      forwardForce: 0.75,
      forwardForceStartFrame: 2,
      forwardForceEndFrame: 8,
      jumpBeforeMove: true,
      moveJumpForce: 9.25,
      moveJumpGravity: 24,
      homingSpeed: 10,
      healsHp: true,
      healAmount: 9
    });

    expect(move.tornado).toBe(true);
    expect(move.throwCapture).toBe(true);
    expect(move.usesKi).toBe(true);
    expect(move.kiCost).toBe(35);
    expect(move.forwardForce).toBe(0.75);
    expect(move.forwardForceStartFrame).toBe(2);
    expect(move.forwardForceEndFrame).toBe(8);
    expect(move.jumpBeforeMove).toBe(true);
    expect(move.moveJumpForce).toBe(9.25);
    expect(move.moveJumpGravity).toBe(24);
    expect(move.homingSpeed).toBe(10);
    expect(move.healsHp).toBe(true);
    expect(move.healAmount).toBe(9);
  });

  it('normalizes character dash distance with a default for older manifests', () => {
    const normalizedDefault = normalizeCharacter({
      ...starterCharacters[0],
      stats: { ...starterCharacters[0].stats, dashDistance: undefined }
    });
    const normalizedCustom = normalizeCharacter({
      ...starterCharacters[0],
      stats: { ...starterCharacters[0].stats, dashDistance: 1.15 }
    });

    expect(normalizedDefault.stats.dashDistance).toBe(0.78);
    expect(normalizedCustom.stats.dashDistance).toBe(1.15);
  });

  it('keeps starter characters from shipping with healing moves enabled by default', () => {
    for (const character of starterCharacters) {
      const healingBaseMoves = character.moves.filter((move) => move.healsHp);
      const healingOverrides = Object.values(character.moveOverrides ?? {}).filter((move) => move.healsHp);

      expect([...healingBaseMoves, ...healingOverrides].length, `${character.displayName} healing move count`).toBe(0);
    }
  });

  it('normalizes transform metadata without enabling it by default', () => {
    const normalized = normalizeCharacter({
      ...starterCharacters[0],
      hasTransform: true,
      transformCharacterId: starterCharacters[1].id
    });

    expect(normalized.hasTransform).toBe(true);
    expect(normalized.transformCharacterId).toBe(starterCharacters[1].id);
    expect(normalizeCharacter(starterCharacters[0]).hasTransform).toBe(false);
  });

  it('migrates legacy base button animation data to left/right limb keys', () => {
    const normalized = normalizeCharacter({
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:3': ['/legacy-command.png'],
        kick: ['/legacy-kick.png']
      },
      animationFrameRates: {
        ...(starterCharacters[0].animationFrameRates ?? {}),
        'cmd:3': 3,
        kick: 7
      },
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        'cmd:3': { damage: 3 },
        kick: { damage: 4 },
        kickleft: { damage: 8 }
      }
    });

    expect(normalized.animationFrames?.kickleft).toEqual(['/legacy-kick.png']);
    expect(normalized.animationFrames?.kick).toBeUndefined();
    expect(normalized.animationFrames?.['cmd:3']).toBeUndefined();
    expect(normalized.animationFrameRates?.kickleft).toBe(7);
    expect(normalized.moveOverrides?.kickleft?.damage).toBe(8);
    expect(normalized.moveOverrides?.kick).toBeUndefined();
    expect(normalized.moveOverrides?.['cmd:3']).toBeUndefined();
  });

  it('migrates legacy backflip animation data to canonical backHop keys', () => {
    const normalized = normalizeCharacter({
      ...starterCharacters[0],
      animationFrames: {
        backflip: ['/legacy-backflip.png']
      },
      animationFrameRates: {
        backflip: 10
      },
      animationScales: {
        backflip: { width: 1.1, height: 1.2, offsetX: 0.1 }
      },
      animationFrameScales: {
        backflip: {
          0: { width: 1.05, height: 1.05, offsetX: 0 }
        }
      },
      animations: {
        ...starterCharacters[0].animations,
        backflip: 'backflip'
      }
    });

    expect(normalized.animationFrames?.backHop).toEqual(['/legacy-backflip.png']);
    expect(normalized.animationFrames?.backflip).toBeUndefined();
    expect(normalized.animationFrameRates?.backHop).toBe(10);
    expect(normalized.animationFrameRates?.backflip).toBeUndefined();
    expect(normalized.animationScales?.backHop?.width).toBe(1.1);
    expect(normalized.animationScales?.backflip).toBeUndefined();
    expect(normalized.animationFrameScales?.backHop?.[0]?.width).toBe(1.05);
    expect(normalized.animationFrameScales?.backflip).toBeUndefined();
    expect(normalized.animations.backHop).toBe('backHop');
    expect(normalized.animations.backflip).toBeUndefined();
  });

  it('drives attack animation progress from startup active and recovery frames', () => {
    const frameDataCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 4,
              activeFrames: 6,
              recoveryFrames: 8,
              range: 0.1
            }
          : move
      )
    };
    let match = createMatch(frameDataCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.startupFrames).toBe(4);
    expect(match.fighters[0].currentMove?.activeFrames).toBe(6);
    expect(match.fighters[0].currentMove?.recoveryFrames).toBe(8);
    expect(match.fighters[0].actionFramesRemaining).toBe(18);
    expect(activeMoveProgress(match.fighters[0])).toBe(0);

    for (let frame = 0; frame < 6; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].moveFrame).toBe(6);
    expect(activeMoveProgress(match.fighters[0])).toBeCloseTo(6 / 18, 4);
    expect(match.fighters[0].state).toBe('attack');
  });

  it('applies authored move forward force while an attack is whiffing', () => {
    const lungeCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 2,
              activeFrames: 2,
              recoveryFrames: 2,
              range: 0.1,
              forwardForce: 0.6,
              forwardForceStartFrame: 1,
              forwardForceEndFrame: 6
            }
          : move
      )
    };
    let match = createMatch(lungeCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -3;
    match.fighters[1].position.x = 3;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
    const startX = match.fighters[0].position.x;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].position.x).toBeGreaterThan(startX);
    expect(match.fighters[0].hitConnected).toBe(false);
  });

  it('moves high-force attacks farther than low-force attacks over the same window', () => {
    const makeForceCharacter = (forwardForce: number): CharacterDefinition => ({
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 3,
              recoveryFrames: 3,
              range: 0.1,
              forwardForce,
              forwardForceStartFrame: 1,
              forwardForceEndFrame: 9
            }
          : move
      )
    });
    const runWhiff = (forwardForce: number) => {
      let match = createMatch(makeForceCharacter(forwardForce), starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -3;
      match.fighters[1].position.x = 3;
      const jab = emptyInputFrame();
      jab.jab = true;
      match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
      const startX = match.fighters[0].position.x;
      for (let frame = 0; frame < 9; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
      return match.fighters[0].position.x - startX;
    };

    expect(runWhiff(2.4)).toBeGreaterThan(runWhiff(0.35) * 4);
  });

  it('starts jump-enabled moves with the authored hop arc', () => {
    const jumpAttackCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              jumpBeforeMove: true,
              moveJumpForce: 10.5,
              moveJumpGravity: 30,
              startupFrames: 4,
              activeFrames: 4,
              recoveryFrames: 12
            }
          : move
      )
    };
    let match = createMatch(jumpAttackCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].position.y).toBeGreaterThan(0);
    expect(match.fighters[0].velocityY).toBeGreaterThan(9.5);
    expect(match.fighters[0].currentMove?.jumpBeforeMove).toBe(true);
    expect(match.fighters[0].currentMove?.moveJumpGravity).toBe(30);
  });

  it('propels airborne homing moves toward the opponent', () => {
    const homingCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'special'
          ? {
              ...move,
              startupFrames: 2,
              activeFrames: 8,
              recoveryFrames: 12,
              range: 0.2,
              tracking: 'homing',
              homingSpeed: 12,
              forwardForce: 0,
              forwardForceStartFrame: 1,
              forwardForceEndFrame: 10
            }
          : move
      )
    };
    let match = createMatch(homingCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -4;
    match.fighters[0].position.y = 1.4;
    match.fighters[0].velocityY = 0.1;
    match.fighters[0].state = 'jump';
    match.fighters[1].position.x = 0;
    match.fighters[1].position.z = 0.9;

    const special = emptyInputFrame();
    special.special = true;
    match = stepMatch(match, special, emptyInputFrame(), 1 / 60);
    const startDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.y + 0.12 - match.fighters[0].position.y,
      match.fighters[1].position.z - match.fighters[0].position.z
    );
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    const nextDistance = Math.hypot(
      match.fighters[1].position.x - match.fighters[0].position.x,
      match.fighters[1].position.y + 0.12 - match.fighters[0].position.y,
      match.fighters[1].position.z - match.fighters[0].position.z
    );

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.tracking).toBe('homing');
    expect(nextDistance).toBeLessThan(startDistance);
  });

  it('routes immediate down attacks to authored d-button commands before full-crouch commands', () => {
    const commandCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:d+3': ['/down-kick.png'],
        'cmd:FC+3': ['/full-crouch-kick.png']
      },
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        'cmd:d+3': { label: 'Immediate Low Kick', hitLevel: 'low' },
        'cmd:FC+3': { label: 'Full Crouch Low Kick', hitLevel: 'low' }
      }
    };
    let match = createMatch(commandCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const input = emptyInputFrame();
    input.down = true;
    input.kick = true;
    match = stepMatch(match, input, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.command).toBe('d+3');
    expect(match.fighters[0].currentMove?.label).toBe('Immediate Low Kick');
    expect(match.fighters[0].currentMove?.hitLevel).toBe('low');
  });

  it('keeps KORE move damage unchanged', () => {
    const character = makeBeginnerSchemeCharacter();
    let match = createMatch(character, starterCharacters[1], stages[0], 'local2p');

    match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);

    expect(match.controlScheme).toBe('kore');
    expect(match.fighters[0].currentMove?.input).toBe('special');
    expect(match.fighters[0].currentMove?.animationKey).toBe('kickright');
    expect(match.fighters[0].currentMove?.damage).toBe(40);
    expect(match.fighters[0].currentMove?.blockDamage).toBe(5);
  });

  it('scales Beginner simple attack damage', () => {
    const character = makeBeginnerSchemeCharacter();
    let match = createMatch(character, starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'beginner' });

    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);

    expect(match.controlScheme).toBe('beginner');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].currentMove?.damage).toBe(6);
    expect(match.fighters[0].currentMove?.blockDamage).toBe(3);
  });

  it('lets actual KORE qcf inputs keep full damage in Beginner', () => {
    const character = makeBeginnerSchemeCharacter();
    let match = createMatch(character, starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'beginner' });
    match.fighters[0].commandHistory = [
      { token: 'd', age: 0.05 },
      { token: 'd/f', age: 0.03 },
      { token: 'f', age: 0.01 }
    ];

    match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.command).toBe('qcf+4');
    expect(match.fighters[0].currentMove?.damage).toBe(18);
  });

  it('makes Beginner button 4 advance a scaled auto-combo into an authored finisher', () => {
    const character = makeBeginnerSchemeCharacter();
    let match = createMatch(character, starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'beginner' });

    match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].currentMove?.damage).toBe(6);

    readyForBeginnerAutoComboLink(match);
    match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('heavy');
    expect(match.fighters[0].currentMove?.damage).toBe(12);

    readyForBeginnerAutoComboLink(match);
    match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('kick');
    expect(match.fighters[0].currentMove?.damage).toBe(18);

    readyForBeginnerAutoComboLink(match);
    match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('special');
    expect(match.fighters[0].currentMove?.command).toBe('qcf+4');
    expect(match.fighters[0].currentMove?.damage).toBe(11);
  });

  it('uses a route-aware character finisher for Beginner auto-combo step four', () => {
    const character: CharacterDefinition = {
      ...makeBeginnerSchemeCharacter(),
      id: 'beginner-route-aware-finisher-test',
      animationFrames: {
        ...(makeBeginnerSchemeCharacter().animationFrames ?? {}),
        'cmd:1+4': ['/test-14.png']
      },
      moveOverrides: {
        ...(makeBeginnerSchemeCharacter().moveOverrides ?? {}),
        'cmd:qcf+4': { damage: 18, blockDamage: 5, label: 'qcf+4 Frame Link' },
        'cmd:1+4': { damage: 18, blockDamage: 5, label: 'Character-Specific Ender' }
      }
    };
    let match = createMatch(character, starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'beginner' });

    for (let step = 0; step < 4; step += 1) {
      if (step > 0) readyForBeginnerAutoComboLink(match);
      match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove?.input).toBe('special');
    expect(match.fighters[0].currentMove?.command).toBe('1+4');
    expect(match.fighters[0].currentMove?.label).toBe('Character-Specific Ender');
    expect(match.fighters[0].currentMove?.damage).toBe(11);
  });

  it('falls Beginner auto-combo finishers back to base special when preferred commands are missing', () => {
    const character = makeBeginnerSchemeCharacter({ includeFinisherCommands: false });
    let match = createMatch(character, starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'beginner' });

    for (let step = 0; step < 4; step += 1) {
      if (step > 0) readyForBeginnerAutoComboLink(match);
      match = stepMatch(match, makeInput('special'), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove?.input).toBe('special');
    expect(match.fighters[0].currentMove?.command).toBeUndefined();
    expect(match.fighters[0].currentMove?.animationKey).toBe('kickright');
    expect(match.fighters[0].currentMove?.damage).toBe(24);
  });

  it('lets low attacks catch foot-space that the same high attack box would miss', () => {
    const makeFootCheckMove = (hitLevel: MoveDefinition['hitLevel']): MoveDefinition => ({
      ...starterCharacters[0].moves.find((move) => move.input === 'kick')!,
      id: `foot-check-${hitLevel}`,
      label: `${hitLevel} foot check`,
      startupFrames: 1,
      activeFrames: 3,
      recoveryFrames: 8,
      damage: 7,
      hitLevel,
      range: 1.7,
      hitbox: {
        offset: [0, 0.58, 0.72],
        size: [0.76, 0.42, 0.68]
      }
    });
    const runActiveMove = (move: MoveDefinition) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.79;
      match.fighters[1].position.x = 0.79;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = move;
      match.fighters[0].moveFrame = move.startupFrames;
      match.fighters[0].actionFramesRemaining = move.activeFrames + move.recoveryFrames;
      match.fighters[0].actionTimer = match.fighters[0].actionFramesRemaining / 60;
      return stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0);
    };

    const highResult = runActiveMove(makeFootCheckMove('high'));
    const lowResult = runActiveMove(makeFootCheckMove('low'));

    expect(highResult.fighters[1].hp).toBe(starterCharacters[1].stats.health);
    expect(lowResult.fighters[1].hp).toBe(starterCharacters[1].stats.health - 7);
  });

  it('starts a clash when two active kiBurst hitboxes overlap', () => {
    let match = createPreparedClashMatch();
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.clashState.status).toBe('intro');
    expect(match.clashState.sequence).toHaveLength(3);
    expect(match.fighters[0].hp).toBe(match.fighters[0].character.stats.health);
    expect(match.fighters[1].hp).toBe(match.fighters[1].character.stats.health);
  });

  it('does not start a clash for non-ki active hitboxes', () => {
    let match = createPreparedClashMatch(false, true);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.clashState.status).toBe('none');
  });

  it('freezes timer and attack frames during clash input', () => {
    let match = startKiClashMatch();
    for (let frame = 0; frame < 45; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.clashState.status).toBe('input');
    const timer = match.timer;
    const p1MoveFrame = match.fighters[0].moveFrame;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.timer).toBe(timer);
    expect(match.fighters[0].moveFrame).toBe(p1MoveFrame);
  });

  it('resolves a clash win when one player completes the sequence and the other fails', () => {
    let match = startKiClashMatch();
    for (let frame = 0; frame < 45; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const sequence = match.clashState.sequence;
    const wrong = clashWrongButton(sequence[0]);
    const p2Wrong = emptyInputFrame();
    p2Wrong[wrong] = true;
    match = stepMatch(match, emptyInputFrame(), p2Wrong, 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    for (const button of sequence) {
      const input = emptyInputFrame();
      input[button] = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.clashState.status).toBe('result');
    expect(match.clashState.winnerSlot).toBe(1);
    expect(match.fighters[1].hp).toBeLessThan(match.fighters[1].character.stats.health);
    expect(match.combatEvents[match.combatEvents.length - 1]?.kind).toMatch(/clash/);
  });

  it('starts a round finisher when a clash win is lethal', () => {
    let match = startKiClashMatch();
    match.fighters[1].hp = 1;
    for (let frame = 0; frame < 45; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const sequence = match.clashState.sequence;
    const wrong = clashWrongButton(sequence[0]);
    const p2Wrong = emptyInputFrame();
    p2Wrong[wrong] = true;
    match = stepMatch(match, emptyInputFrame(), p2Wrong, 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    for (const button of sequence) {
      const input = emptyInputFrame();
      input[button] = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.phase).toBe('roundFinisher');
    expect(match.message).toBe('');
    expect(match.roundFinisher?.attackerSlot).toBe(1);
    expect(match.roundFinisher?.defenderSlot).toBe(2);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBe(5);
    expect(match.fighters[1].visualHitstop.framesRemaining).toBe(5);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.8);
    expect(match.phase).toBe('roundOver');
    expect(match.message).toBe('PERFECT');
    expect(match.fighters[0].roundsWon).toBe(1);
  });

  it('resolves a clash draw when both players complete on the same frame', () => {
    let match = startKiClashMatch();
    for (let frame = 0; frame < 45; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    for (const button of match.clashState.sequence) {
      const input = emptyInputFrame();
      input[button] = true;
      match = stepMatch(match, input, input, 1 / 60);
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.clashState.status).toBe('result');
    expect(match.clashState.winnerSlot).toBeNull();
    expect(match.message).toBe('CLASH DRAW');
  });

  it('sanitizes partial settings and fills defaults', () => {
    const settings = sanitizeGameSettings({
      game: { roundTimer: 75 },
      controls: {
        keyboard: [{ jab: ['KeyP'] }],
        keyboardCombos: [{ '1+2': ['KeyL'], 'f+1': ['KeyBad'] }],
        gamepadCombos: [{ '1+2': [7, 11, 17] }]
      },
      display: { touchControls: 'on', impactSparks: { shape: 'ring', hitColor: '#12ABef', size: 9, intensity: -2 } },
      audio: { bgmTrackIndex: 300, hitSfx: 5 }
    });

    expect(settings.game.roundTimer).toBe(75);
    expect(settings.game.controlScheme).toBe('kore');
    expect(settings.controls.keyboard[0].jab).toEqual(['KeyP']);
    expect(settings.controls.keyboard[0].up).toEqual(defaultGameSettings.controls.keyboard[0].up);
    expect(settings.controls.keyboard[1].right).toEqual(defaultGameSettings.controls.keyboard[1].right);
    expect(settings.controls.keyboardCombos[0]['1+2']).toEqual(['KeyL']);
    expect(settings.controls.keyboardCombos[0]['1+3']).toBeUndefined();
    expect(settings.controls.gamepadCombos[0]['1+2']).toEqual([7, 11]);
    expect(settings.display.touchControls).toBe('on');
    expect(settings.display.impactSparks.shape).toBe('ring');
    expect(settings.display.impactSparks.hitColor).toBe('#12ABef');
    expect(settings.display.impactSparks.blockColor).toBe(defaultGameSettings.display.impactSparks.blockColor);
    expect(settings.display.impactSparks.size).toBe(1.8);
    expect(settings.display.impactSparks.intensity).toBe(0.35);
    expect(settings.camera.distance).toBe(defaultGameSettings.camera.distance);
    expect(settings.audio.bgmTrackIndex).toBe(99);
    expect(settings.audio.hitSfx).toBe(2);
  });

  it('sanitizes control scheme settings', () => {
    expect(sanitizeGameSettings({ game: { controlScheme: 'beginner' } }).game.controlScheme).toBe('beginner');
    expect(sanitizeGameSettings({ game: { controlScheme: 'expert' } }).game.controlScheme).toBe('kore');
    expect(cloneSettings(defaultGameSettings).game.controlScheme).toBe('kore');
  });

  it('keeps infinite round timer settings as a real option', () => {
    const settings = sanitizeGameSettings({
      game: { roundTimer: 0 }
    });

    expect(settings.game.roundTimer).toBe(0);
  });

  it('migrates saved keyboard settings so Space jumps instead of confirming for player two', () => {
    const settings = sanitizeGameSettings({
      version: 4,
      settings: {
        controls: {
          keyboard: [
            { up: ['KeyW'] },
            { up: ['ArrowUp'], confirm: ['Space'] }
          ]
        }
      }
    });

    expect(settings.controls.keyboard[0].up).toEqual(['KeyW', 'Space']);
    expect(settings.controls.keyboard[1].confirm).toEqual([]);
  });

  it('resolves remapped keyboard bindings', () => {
    const settings = cloneSettings(defaultGameSettings);
    settings.controls.keyboard[0].jab = ['KeyP'];
    const event = new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' });

    expect(getKeyboardBindingsForEvent(event, 'local2p', settings.controls)).toEqual([{ player: 1, action: 'jab' }]);
  });

  it('resolves keyboard button combo hotkeys without direction macros', () => {
    const settings = cloneSettings(defaultGameSettings);
    settings.controls.keyboardCombos[0]['1+2'] = ['KeyL'];
    const event = new KeyboardEvent('keydown', { code: 'KeyL', key: 'l' });

    expect(getKeyboardBindingsForEvent(event, 'local2p', settings.controls)).toEqual([
      { player: 1, action: 'jab' },
      { player: 1, action: 'heavy' }
    ]);
  });

  it('routes arrow movement to player one in one-player CPU modes', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' });

    expect(getKeyboardBindingsForEvent(event, 'ai', defaultGameSettings.controls)).toEqual([
      { player: 1, action: 'right' },
      { player: 2, action: 'right' }
    ]);
    expect(getKeyboardBindingsForEvent(event, 'versusCpu', defaultGameSettings.controls)).toEqual([
      { player: 1, action: 'right' },
      { player: 2, action: 'right' }
    ]);
  });

  it('resolves Space as player one jump input', () => {
    const event = new KeyboardEvent('keydown', { code: 'Space', key: ' ' });

    expect(getKeyboardBindingsForEvent(event, 'local2p', defaultGameSettings.controls)).toEqual([{ player: 1, action: 'up' }]);
  });

  it('turns single up and down holds into jump and crouch without firing on tap', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    prepareVerticalTapForRead(input, state, 'keyboard', 180);
    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(false);
    expect(input.sidewalkUp).toBe(false);
    prepareVerticalTapForRead(input, state, 'keyboard', 295);
    expect(input.up).toBe(true);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 315);
    expect(input.up).toBe(false);

    applyVerticalTap(input, state, 'down', true, 'keyboard', 520);
    prepareVerticalTapForRead(input, state, 'keyboard', 600);
    expect(input.down).toBe(false);
    prepareVerticalTapForRead(input, state, 'keyboard', 710);
    expect(input.down).toBe(true);
    expect(input.sidestepDown).toBe(false);
    expect(input.sidewalkDown).toBe(false);
  });

  it('uses release timing and a forgiving window for vertical double taps', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 165);
    applyVerticalTap(input, state, 'up', true, 'keyboard', 570);
    prepareVerticalTapForRead(input, state, 'keyboard', 571);

    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(true);
    expect(input.sidewalkUp).toBe(false);
  });

  it('does not turn a completed jump hold into the first tap of a lane step', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    prepareVerticalTapForRead(input, state, 'keyboard', 300);
    expect(input.up).toBe(true);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 315);

    applyVerticalTap(input, state, 'up', true, 'keyboard', 330);
    prepareVerticalTapForRead(input, state, 'keyboard', 331);
    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(false);
    expect(input.sidewalkUp).toBe(false);
  });

  it('turns double tap up or down into one lane step', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'up', true, 'keyboard', 100);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 130);
    applyVerticalTap(input, state, 'up', true, 'keyboard', 210);
    prepareVerticalTapForRead(input, state, 'keyboard', 211);
    expect(input.up).toBe(false);
    expect(input.sidestepUp).toBe(true);
    expect(input.sidewalkUp).toBe(false);

    consumeVerticalTapAfterRead(input, state, 'keyboard');
    prepareVerticalTapForRead(input, state, 'keyboard', 240);
    expect(input.sidestepUp).toBe(false);
    expect(input.sidewalkUp).toBe(false);
    applyVerticalTap(input, state, 'up', false, 'keyboard', 250);

    applyVerticalTap(input, state, 'down', true, 'keyboard', 500);
    applyVerticalTap(input, state, 'down', false, 'keyboard', 530);
    applyVerticalTap(input, state, 'down', true, 'keyboard', 610);
    prepareVerticalTapForRead(input, state, 'keyboard', 611);
    expect(input.down).toBe(false);
    expect(input.sidestepDown).toBe(true);
    expect(input.sidewalkDown).toBe(false);
  });

  it('turns double tap left or right into one-frame physical dash metadata while preserving hold movement', () => {
    const input = emptyInputFrame();
    const state = createHorizontalTapState();

    applyHorizontalTap(input, state, 'right', true, 'keyboard', 100);
    expect(input.right).toBe(true);
    expect(input.dashForward).toBe(false);
    expect(input.dashBack).toBe(false);
    expect((input as InputFrameWithMetadata).__horizontalDashDirection).toBeUndefined();
    applyHorizontalTap(input, state, 'right', false, 'keyboard', 130);

    applyHorizontalTap(input, state, 'right', true, 'keyboard', 210);
    expect(input.right).toBe(true);
    expect(input.dashForward).toBe(false);
    expect(input.dashBack).toBe(false);
    expect((input as InputFrameWithMetadata).__horizontalDashDirection).toBe('right');
    consumeHorizontalTapAfterRead(input, state, 'keyboard');
    expect(input.right).toBe(true);
    expect(input.dashForward).toBe(false);
    expect(input.dashBack).toBe(false);
    expect((input as InputFrameWithMetadata).__horizontalDashDirection).toBeUndefined();

    applyHorizontalTap(input, state, 'right', false, 'keyboard', 240);
    applyHorizontalTap(input, state, 'left', true, 'keyboard', 330);
    applyHorizontalTap(input, state, 'left', false, 'keyboard', 350);
    applyHorizontalTap(input, state, 'left', true, 'keyboard', 410);
    expect(input.left).toBe(true);
    expect(input.right).toBe(false);
    expect(input.dashForward).toBe(false);
    expect(input.dashBack).toBe(false);
    expect((input as InputFrameWithMetadata).__horizontalDashDirection).toBe('left');
  });

  it('preserves a press-and-release between simulation reads for exactly one step', () => {
    const queue: Parameters<typeof applyQueuedPressesToInputs>[1] = [];
    const sequenceRef = { current: 0 };
    enqueueInputPress(queue, sequenceRef, 0, 'jab', 100);

    const inputs: [ReturnType<typeof emptyInputFrame>, ReturnType<typeof emptyInputFrame>] = [emptyInputFrame(), emptyInputFrame()];
    applyQueuedPressesToInputs(inputs, queue, true);

    expect(inputs[0].jab).toBe(true);
    expect((inputs[0] as { __pressedActions?: unknown }).__pressedActions).toEqual(['jab']);
    expect(queue).toHaveLength(0);

    const nextInputs: [ReturnType<typeof emptyInputFrame>, ReturnType<typeof emptyInputFrame>] = [emptyInputFrame(), emptyInputFrame()];
    applyQueuedPressesToInputs(nextInputs, queue, true);
    expect(nextInputs[0].jab).toBe(false);
  });

  it('does not queue continuous movement presses as latched pulses', () => {
    const queue: Parameters<typeof applyQueuedPressesToInputs>[1] = [];
    const sequenceRef = { current: 0 };
    enqueueInputPress(queue, sequenceRef, 0, 'right', 100);
    enqueueInputPress(queue, sequenceRef, 0, 'left', 101);

    const inputs: [ReturnType<typeof emptyInputFrame>, ReturnType<typeof emptyInputFrame>] = [emptyInputFrame(), emptyInputFrame()];
    applyQueuedPressesToInputs(inputs, queue, true);

    expect(queue).toHaveLength(0);
    expect(inputs[0].right).toBe(false);
    expect(inputs[0].left).toBe(false);
  });

  it('does not consume queued gameplay presses during a non-consuming peek', () => {
    const queue: Parameters<typeof applyQueuedPressesToInputs>[1] = [];
    const sequenceRef = { current: 0 };
    enqueueInputPress(queue, sequenceRef, 0, 'heavy', 100);

    const peekInputs: [ReturnType<typeof emptyInputFrame>, ReturnType<typeof emptyInputFrame>] = [emptyInputFrame(), emptyInputFrame()];
    applyQueuedPressesToInputs(peekInputs, queue, false);
    expect(peekInputs[0].heavy).toBe(true);
    expect(queue).toHaveLength(1);

    const stepInputs: [ReturnType<typeof emptyInputFrame>, ReturnType<typeof emptyInputFrame>] = [emptyInputFrame(), emptyInputFrame()];
    applyQueuedPressesToInputs(stepInputs, queue, true);
    expect(stepInputs[0].heavy).toBe(true);
    expect(queue).toHaveLength(0);
  });

  it('keeps vertical tap gestures isolated from horizontal holds and double taps', () => {
    const input = emptyInputFrame();
    const verticalState = createVerticalTapState();
    const horizontalState = createHorizontalTapState();

    applyVerticalTap(input, verticalState, 'up', true, 'keyboard', 100);
    applyVerticalTap(input, verticalState, 'up', false, 'keyboard', 130);
    applyVerticalTap(input, verticalState, 'up', true, 'keyboard', 210);
    prepareVerticalTapForRead(input, verticalState, 'keyboard', 211);
    expect(input.sidestepUp).toBe(true);

    applyHorizontalTap(input, horizontalState, 'right', true, 'keyboard', 220);
    expect(input.right).toBe(true);
    expect(input.left).toBe(false);
    expect(input.sidestepUp).toBe(true);

    consumeVerticalTapAfterRead(input, verticalState, 'keyboard');
    consumeHorizontalTapAfterRead(input, horizontalState, 'keyboard');
    expect(input.right).toBe(true);
    expect(input.dashForward).toBe(false);
    expect(input.dashBack).toBe(false);

    applyHorizontalTap(input, horizontalState, 'right', false, 'keyboard', 250);
    applyHorizontalTap(input, horizontalState, 'right', true, 'keyboard', 310);
    expect(input.right).toBe(true);
    expect(input.dashForward).toBe(false);
    expect(input.dashBack).toBe(false);
    expect((input as InputFrameWithMetadata).__horizontalDashDirection).toBe('right');
  });

  it('does not promote the held second vertical tap into continuous lane walking', () => {
    const input = emptyInputFrame();
    const state = createVerticalTapState();

    applyVerticalTap(input, state, 'down', true, 'keyboard', 100);
    applyVerticalTap(input, state, 'down', false, 'keyboard', 125);
    applyVerticalTap(input, state, 'down', true, 'keyboard', 200);
    prepareVerticalTapForRead(input, state, 'keyboard', 201);
    consumeVerticalTapAfterRead(input, state, 'keyboard');

    prepareVerticalTapForRead(input, state, 'keyboard', 360);
    expect(input.sidestepDown).toBe(false);
    expect(input.sidewalkDown).toBe(false);

    applyVerticalTap(input, state, 'down', false, 'keyboard', 390);
    expect(input.sidewalkDown).toBe(false);

    applyVerticalTap(input, state, 'down', true, 'keyboard', 930);
    prepareVerticalTapForRead(input, state, 'keyboard', 1010);
    expect(input.down).toBe(false);
    prepareVerticalTapForRead(input, state, 'keyboard', 1120);
    expect(input.down).toBe(true);
    expect(input.sidestepDown).toBe(false);
    expect(input.sidewalkDown).toBe(false);
  });
});

describe('fight engine', () => {
  it('starts fight-created matches in an entry intro when enabled', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });

    expect(match.phase).toBe('intro');
    expect(match.message).toBe('ROUND 1');
    expect(match.fighters[0].state).toBe('entry');
    expect(match.fighters[1].state).toBe('entry');
  });

  it('keeps default/menu-style matches immediate when intro is not enabled', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu');

    expect(match.phase).toBe('fighting');
    expect(match.introEnabled).toBe(false);
  });

  it('starts round callouts with the entry intro', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });

    expect(match.message).toBe('ROUND 1');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1.25);
    expect(match.phase).toBe('intro');
    expect(match.message).toBe('ROUND 1');
    expect(match.fighters[0].state).toBe('idle');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1);
    expect(match.phase).toBe('intro');
    expect(match.message).toBe('ROUND 1');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1.5);
    expect(match.phase).toBe('intro');
    expect(match.message).toBe('FIGHT');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.35);
    expect(match.phase).toBe('fighting');
    expect(match.message).toBe('');
  });

  it('ignores movement and attacks during round intro', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });
    const startX = match.fighters[0].position.x;
    const attack = emptyInputFrame();
    attack.right = true;
    attack.jab = true;

    match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('intro');
    expect(match.fighters[0].position.x).toBe(startX);
    expect(match.fighters[0].currentMove).toBeNull();
  });

  it('does not trigger the idle flourish before forty five quiet seconds', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');

    match = stepQuiet(match, 45 * 60 - 6);

    expect(match.idleQuietFrames).toBe(45 * 60 - 6);
    expect(match.fighters[0].idleFlourishFramesRemaining).toBe(0);
    expect(match.fighters[1].idleFlourishFramesRemaining).toBe(0);
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].state).toBe('idle');
  });

  it('starts a one-shot win flourish after forty five quiet idle seconds', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');

    match = stepQuiet(match, 45 * 60);

    expect(match.idleQuietFrames).toBe(0);
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].state).toBe('idle');
    expect(match.fighters[0].idleFlourishFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].idleFlourishFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[0].idleFlourishTotalFrames).toBe(match.fighters[0].idleFlourishFramesRemaining);
    expect(match.fighters[1].idleFlourishTotalFrames).toBe(match.fighters[1].idleFlourishFramesRemaining);
  });

  it('resets the idle quiet timer when either player inputs an action', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    const move = emptyInputFrame();
    move.right = true;

    match = stepQuiet(match, 30 * 60);
    expect(match.idleQuietFrames).toBe(30 * 60);

    match = stepMatch(match, move, emptyInputFrame(), 1 / 60);

    expect(match.idleQuietFrames).toBe(0);
    expect(match.fighters[0].idleFlourishFramesRemaining).toBe(0);
    expect(match.fighters[1].idleFlourishFramesRemaining).toBe(0);
  });

  it('does not advance the idle quiet timer while a fighter is not idle', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.fighters[0].state = 'hit';
    match.fighters[0].stunFramesRemaining = 45 * 60 + 10;
    match.fighters[0].actionFramesRemaining = 45 * 60 + 10;
    match.fighters[0].stunTimer = (45 * 60 + 10) / 60;
    match.fighters[0].actionTimer = (45 * 60 + 10) / 60;

    match = stepQuiet(match, 45 * 60);

    expect(match.idleQuietFrames).toBe(0);
    expect(match.fighters[0].idleFlourishFramesRemaining).toBe(0);
    expect(match.fighters[1].idleFlourishFramesRemaining).toBe(0);
  });

  it('returns to idle after the flourish and requires a fresh quiet window before retriggering', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { roundTime: 0 });

    match = stepQuiet(match, 45 * 60);
    const firstDuration = Math.max(match.fighters[0].idleFlourishFramesRemaining, match.fighters[1].idleFlourishFramesRemaining);
    expect(firstDuration).toBeGreaterThan(0);

    match = stepQuiet(match, firstDuration);
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].state).toBe('idle');
    expect(match.fighters[0].idleFlourishFramesRemaining).toBe(0);
    expect(match.fighters[1].idleFlourishFramesRemaining).toBe(0);
    expect(match.idleQuietFrames).toBe(0);

    match = stepQuiet(match, 10);
    expect(match.fighters[0].idleFlourishFramesRemaining).toBe(0);

    let retriggered = false;
    for (let frame = 0; frame < 45 * 60 + 120 && !retriggered; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      retriggered = match.fighters.some((fighter) => fighter.idleFlourishFramesRemaining > 0);
    }
    expect(retriggered).toBe(true);
  });

  it('tracks idle quiet time in training and online modes', () => {
    let training = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training');
    let online = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online');

    training = stepQuiet(training, 45 * 60);
    online = stepQuiet(online, 45 * 60);

    expect(training.fighters[0].idleFlourishFramesRemaining).toBeGreaterThan(0);
    expect(training.fighters[1].idleFlourishFramesRemaining).toBeGreaterThan(0);
    expect(online.fighters[0].idleFlourishFramesRemaining).toBeGreaterThan(0);
    expect(online.fighters[1].idleFlourishFramesRemaining).toBeGreaterThan(0);
  });

  it('starts round two with intro while preserving round wins', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });
    match.phase = 'roundOver';
    match.countdown = 0.01;
    match.message = 'K.O.';
    match.fighters[0].roundsWon = 1;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('intro');
    expect(match.round).toBe(2);
    expect(match.fighters[0].roundsWon).toBe(1);
    expect(match.fighters[1].roundsWon).toBe(0);
    expect(match.fighters[0].state).toBe('entry');
  });

  it('requires three round wins to win a match', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { playIntro: true });
    match.phase = 'roundOver';
    match.countdown = 0.01;
    match.message = 'K.O.';
    match.fighters[0].roundsWon = 2;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('intro');
    expect(match.round).toBe(2);
    expect(match.fighters[0].roundsWon).toBe(2);

    match.phase = 'roundOver';
    match.countdown = 0.01;
    match.message = 'K.O.';
    match.fighters[0].roundsWon = 3;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('matchOver');
    expect(match.winnerSlot).toBe(1);
  });

  it('moves fighters toward each other with right input', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1 = emptyInputFrame();
    p1.right = true;
    const next = stepMatch(match, p1, emptyInputFrame(), 1 / 60);
    expect(next.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);
  });

  it('keeps fighters inside the authored stage world bounds', () => {
    const boundedStage = { ...stages[0], world: { width: 20, depth: 12, floorY: -0.045, backgroundColor: '#101114' } };
    let match = createMatch(starterCharacters[0], starterCharacters[1], boundedStage, 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -99;
    match.fighters[0].position.z = 99;
    match.fighters[1].position.x = 99;
    match.fighters[1].position.z = -99;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    for (const fighter of match.fighters) {
      expect(fighter.position.x).toBeGreaterThan(-10);
      expect(fighter.position.x).toBeLessThan(10);
      expect(fighter.position.z).toBeGreaterThan(-6);
      expect(fighter.position.z).toBeLessThan(6);
    }
  });

  it('prevents active movement from walking through the invisible wall', () => {
    const boundedStage = { ...stages[0], world: { width: 20, depth: 12, floorY: -0.045, backgroundColor: '#101114' } };
    let match = createMatch(starterCharacters[0], starterCharacters[1], boundedStage, 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -9.7;
    match.fighters[0].position.z = 5.7;
    const p1 = emptyInputFrame();
    p1.left = true;
    p1.sidewalkDown = true;

    for (let i = 0; i < 90; i += 1) {
      match = stepMatch(match, p1, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].position.x).toBeGreaterThan(-10);
    expect(match.fighters[0].position.z).toBeLessThan(6);
  });

  it('keeps authored box playable bounds aligned to the center lane', () => {
    const boundedStage: StageDefinition = {
      ...stages[0],
      world: { width: 80, depth: 80, floorY: -0.045, backgroundColor: '#101114' },
      fightPlane: { center: [10, 0, 5], width: 14, depth: 8, y: 0, rotationY: Math.PI / 2 },
      playableBounds: { shape: 'box', width: 8, depth: 4 }
    };
    let match = createMatch(starterCharacters[0], starterCharacters[1], boundedStage, 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const outside = boundsWorldPosition(boundedStage, { x: 12, z: 0.5 });
    match.fighters[0].position.x = outside.x;
    match.fighters[0].position.z = outside.z;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    const local = boundsLocalPosition(boundedStage, match.fighters[0].position);
    expect(local.x).toBeLessThanOrEqual(4);
    expect(local.x).toBeGreaterThanOrEqual(-4);
    expect(local.z).toBeLessThanOrEqual(2);
    expect(local.z).toBeGreaterThanOrEqual(-2);
  });

  it('projects fighters back inside ellipse playable bounds from cardinal and diagonal edges', () => {
    const boundedStage: StageDefinition = {
      ...stages[0],
      world: { width: 80, depth: 80, floorY: -0.045, backgroundColor: '#101114' },
      fightPlane: { center: [2, 0, -3], width: 14, depth: 8, y: 0, rotationY: Math.PI / 5 },
      playableBounds: { shape: 'ellipse', width: 8, depth: 4 }
    };
    const outsidePoints = [
      { x: 14, z: 0 },
      { x: 0, z: -9 },
      { x: 9, z: 5 }
    ];

    for (const outsideLocal of outsidePoints) {
      let match = createMatch(starterCharacters[0], starterCharacters[1], boundedStage, 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      const outside = boundsWorldPosition(boundedStage, outsideLocal);
      match.fighters[0].position.x = outside.x;
      match.fighters[0].position.z = outside.z;

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

      const local = boundsLocalPosition(boundedStage, match.fighters[0].position);
      const ellipseDistance = (local.x * local.x) / (4 * 4) + (local.z * local.z) / (2 * 2);
      expect(ellipseDistance).toBeLessThanOrEqual(1);
    }
  });

  it('keeps shadow clones inside authored playable bounds', () => {
    const boundedStage: StageDefinition = {
      ...stages[0],
      world: { width: 80, depth: 80, floorY: -0.045, backgroundColor: '#101114' },
      fightPlane: { center: [0, 0, 0], width: 14, depth: 8, y: 0, rotationY: 0 },
      playableBounds: { shape: 'ellipse', width: 8, depth: 4 }
    };
    let match = createMatch(starterCharacters[0], starterCharacters[1], boundedStage, 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 0;
    match.fighters[0].position.z = 0;
    match.fighters[0].shadowClone = {
      phase: 'active',
      position: { x: 99, y: 0, z: 0 },
      velocityY: 0,
      facing: 1,
      facingYaw: 0,
      state: 'attack',
      currentMove: null,
      moveInstanceId: 0,
      moveFrame: 0,
      actionFramesRemaining: 0,
      hitConnected: false,
      attackConsumed: true,
      vanishOnLanding: false,
      visualHitstop: { framesRemaining: 0, animationKey: null, progress: 0 },
      spawnSmokeFrames: 0,
      vanishSmokeFrames: 0
    };

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    const clone = match.fighters[0].shadowClone;
    expect(clone).not.toBeNull();
    const local = boundsLocalPosition(boundedStage, clone?.position ?? { x: 99, z: 99 });
    const ellipseDistance = (local.x * local.x) / (4 * 4) + (local.z * local.z) / (2 * 2);
    expect(ellipseDistance).toBeLessThanOrEqual(1);
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

  it('drives both fighters from AI in CPU arcade mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpuArcade');
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

  it('drives both fighters from AI in infinite tournament mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'tournamentInfinite');
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

  it('drives only the selected opponent from AI in 1P vs CPU mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'versusCpu');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1StartX = match.fighters[0].position.x;
    const p2StartX = match.fighters[1].position.x;
    const p1Input = emptyInputFrame();
    p1Input.right = true;
    const ignoredP2Input = emptyInputFrame();
    ignoredP2Input.right = true;

    for (let i = 0; i < 6; i += 1) {
      match = stepMatch(match, p1Input, ignoredP2Input, 1 / 60);
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

  it('uses human p2 input in training online sparring', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'trainingOnline', 5, { roundTime: 0 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;
    const p2Attack = emptyInputFrame();
    p2Attack.jab = true;

    match = stepMatch(match, emptyInputFrame(), p2Attack, 1 / 60);

    expect(match.fighters[1].state).toBe('attack');
    expect(match.fighters[1].currentMove).not.toBeNull();
  });

  it('does not clear player attacks every frame in training mode', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;

    const p1Attack = emptyInputFrame();
    p1Attack.jab = true;
    match = stepMatch(match, p1Attack, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove).not.toBeNull();

    p1Attack.jab = false;
    for (let i = 0; i < 3; i += 1) {
      match = stepMatch(match, p1Attack, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].moveFrame).toBeGreaterThan(0);
  });

  it('makes the training dummy get up after knockdown while staying passive', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'knockdown';
    match.fighters[1].actionFramesRemaining = 2;
    match.fighters[1].actionTimer = 2 / 60;
    match.fighters[1].stunFramesRemaining = 2;
    match.fighters[1].stunTimer = 2 / 60;

    for (let i = 0; i < 8; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].state).toBe('getup');
    expect(match.fighters[1].getupStarted).toBe(true);
    expect(match.fighters[1].getupAction).toBe('stand');
    expect(match.fighters[1].currentMove).toBeNull();
  });

  it('uses configured recovery frames for getup options', () => {
    const customGetupCharacter: CharacterDefinition = {
      ...starterCharacters[1],
      getupFrameOverrides: {
        rollBack: 47
      }
    };
    let match = createMatch(starterCharacters[0], customGetupCharacter, stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'knockdown';
    match.fighters[1].actionFramesRemaining = 0;
    match.fighters[1].actionTimer = 0;
    match.fighters[1].stunFramesRemaining = 0;
    match.fighters[1].stunTimer = 0;

    const rollBack = emptyInputFrame();
    rollBack.right = true;
    match = stepMatch(match, emptyInputFrame(), rollBack, 1 / 60);

    expect(match.fighters[1].state).toBe('getup');
    expect(match.fighters[1].getupAction).toBe('rollBack');
    expect(match.fighters[1].getupTotalFrames).toBe(47);
    expect(match.fighters[1].actionFramesRemaining).toBe(47);
  });

  it('keeps getup lane rolls on the starting side until they recover to idle', () => {
    const runRoll = (fighterIndex: 0 | 1, rollInput: ReturnType<typeof emptyInputFrame>) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = fighterIndex === 0 ? -0.06 : 0;
      match.fighters[1].position.x = fighterIndex === 0 ? 0 : 0.06;
      match.fighters[0].position.z = 0;
      match.fighters[1].position.z = 0;
      const opponentIndex = fighterIndex === 0 ? 1 : 0;
      match.fighters[fighterIndex].state = 'knockdown';
      match.fighters[fighterIndex].actionFramesRemaining = 0;
      match.fighters[fighterIndex].actionTimer = 0;
      match.fighters[fighterIndex].stunFramesRemaining = 0;
      match.fighters[fighterIndex].stunTimer = 0;
      const sideBefore = match.fighters[fighterIndex].controlSideSign;
      const facingBefore = match.fighters[fighterIndex].facing;
      const zBefore = match.fighters[fighterIndex].position.z;

      for (let frame = 0; frame < 42; frame += 1) {
        const p1Input = fighterIndex === 0 && frame === 0 ? rollInput : emptyInputFrame();
        const p2Input = fighterIndex === 1 && frame === 0 ? rollInput : emptyInputFrame();
        match = stepMatch(match, p1Input, p2Input, 1 / 60);
        const fighter = match.fighters[fighterIndex];
        const opponent = match.fighters[opponentIndex];
        expect(fighter.controlSideSign).toBe(sideBefore);
        expect(fighter.facing).toBe(facingBefore);
        expect(stageSideDelta(match.stage, fighter, opponent) * sideBefore).toBeGreaterThan(0.001);
        if (fighter.state === 'getup') {
          const targetYaw = Math.atan2(opponent.position.x - fighter.position.x, opponent.position.z - fighter.position.z);
          expect(Math.abs(unwrappedAngleDelta(fighter.facingYaw, targetYaw))).toBeLessThan(0.000001);
          expect(Math.abs(Math.abs(unwrappedAngleDelta(fighter.facingYaw, opponent.facingYaw)) - Math.PI)).toBeLessThan(0.000001);
        }
      }

      expect(match.fighters[fighterIndex].state).toBe('idle');
      expect(match.fighters[fighterIndex].getupAction).toBe('none');
      expect(Math.abs(match.fighters[fighterIndex].position.z - zBefore)).toBeGreaterThan(0.25);
    };

    runRoll(0, { ...emptyInputFrame(), sidewalkUp: true });
    runRoll(1, { ...emptyInputFrame(), sidewalkDown: true });
  });

  it('keeps recovering fighters visually squared to the opponent without changing control sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.08;
    match.fighters[0].position.z = 0.55;
    match.fighters[1].position.x = 0.08;
    match.fighters[1].position.z = -0.35;
    match.fighters[0].facingYaw = -Math.PI / 2;
    match.fighters[0].state = 'knockdown';
    match.fighters[0].actionFramesRemaining = 0;
    match.fighters[0].actionTimer = 0;
    match.fighters[0].stunFramesRemaining = 0;
    match.fighters[0].stunTimer = 0;
    const sideBefore = match.fighters[0].controlSideSign;
    const facingBefore = match.fighters[0].facing;

    match = stepMatch(match, { ...emptyInputFrame(), confirm: true }, emptyInputFrame(), 1 / 60);
    const recovering = match.fighters[0];
    const standing = match.fighters[1];
    const targetYaw = Math.atan2(standing.position.x - recovering.position.x, standing.position.z - recovering.position.z);

    expect(recovering.state).toBe('getup');
    expect(recovering.controlSideSign).toBe(sideBefore);
    expect(recovering.facing).toBe(facingBefore);
    expect(Math.abs(unwrappedAngleDelta(recovering.facingYaw, targetYaw))).toBeLessThan(0.000001);
    expect(Math.abs(Math.abs(unwrappedAngleDelta(recovering.facingYaw, standing.facingYaw)) - Math.PI)).toBeLessThan(0.000001);
  });

  it('keeps training mode infinite by refilling zero health without ending the round', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.timer = 0.01;
    match.fighters[0].hp = 0;
    match.fighters[1].hp = -4;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('fighting');
    expect(match.round).toBe(1);
    expect(match.winnerSlot).toBeNull();
    expect(match.fighters[0].roundsWon).toBe(0);
    expect(match.fighters[1].roundsWon).toBe(0);
    expect(match.fighters[0].hp).toBe(starterCharacters[0].stats.health);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
    expect(match.timer).toBe(60);
  });

  it('keeps training online sparring infinite without ending the round', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'trainingOnline', 5, { roundTime: 0 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.timer = 0;
    match.fighters[0].hp = 0;
    match.fighters[1].hp = -4;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('fighting');
    expect(match.winnerSlot).toBeNull();
    expect(match.fighters[0].roundsWon).toBe(0);
    expect(match.fighters[1].roundsWon).toBe(0);
    expect(match.fighters[0].hp).toBe(starterCharacters[0].stats.health);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
    expect(match.timer).toBe(0);
  });

  it('refills a lethal direct training hit without starting a round finisher', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].hp = 1;
    match.fighters[0].position.x = -0.5;
    match.fighters[1].position.x = 0.5;
    const attack = emptyInputFrame();
    attack.heavy = true;

    for (let i = 0; i < 40 && !match.fighters[0].hitConnected; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.heavy = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.phase).toBe('fighting');
    expect(match.roundFinisher).toBeNull();
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
    expect(match.fighters[0].roundsWon).toBe(0);
  });

  it('allows training health reset to be disabled', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training', 5, { trainingInfiniteHealth: false });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].hp = 0;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('roundOver');
    expect(match.message).toBe('PERFECT');
    expect(match.visualTimeScale).toBeLessThan(1);
    expect(match.fighters[1].hp).toBe(0);
  });

  it('uses custom round timer settings for new matches', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { roundTime: 45 });

    expect(match.roundTime).toBe(45);
    expect(match.timer).toBe(45);
  });

  it('uses KORE controls by default and Beginner controls when requested', () => {
    const kore = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    const beginner = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { controlScheme: 'beginner' });

    expect(kore.controlScheme).toBe('kore');
    expect(beginner.controlScheme).toBe('beginner');
  });

  it('uses custom max health settings for new matches', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { maxHealth: 250 });

    expect(match.maxHealth).toBe(250);
    expect(match.fighters[0].maxHp).toBe(250);
    expect(match.fighters[1].maxHp).toBe(250);
    expect(match.fighters[0].hp).toBe(250);
    expect(match.fighters[1].hp).toBe(250);
  });

  it('supports infinite max health as a non-KO health pool', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { maxHealth: 0 });

    expect(match.maxHealth).toBe(0);
    expect(match.fighters[1].maxHp).toBeGreaterThan(999);
    expect(match.fighters[1].hp).toBe(match.fighters[1].maxHp);
    expect(match.phase).toBe('fighting');
  });

  it('supports infinite round timers without timing out', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p', 3, { roundTime: 0 });
    match.phase = 'fighting';
    match.countdown = 0;

    for (let i = 0; i < 240; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.roundTime).toBe(0);
    expect(match.timer).toBe(0);
    expect(match.phase).toBe('fighting');
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

  it('lets CPU vs CPU fighters connect attacks without needing point-blank spacing', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 4);
    match.phase = 'fighting';
    match.countdown = 0;
    const startHp = [match.fighters[0].hp, match.fighters[1].hp];

    for (let i = 0; i < 900; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.phase !== 'fighting') break;
    }

    expect(match.lastHitId).toBeGreaterThan(0);
    const totalDamage = startHp[0] - match.fighters[0].hp + (startHp[1] - match.fighters[1].hp);
    expect(totalDamage).toBeGreaterThan(0);
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

  it('keeps a leading CPU active instead of over-braking into a comeback', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 160;
    match.fighters[1].hp = 90;
    match.fighters[0].position.x = -0.78;
    match.fighters[1].position.x = 0.78;

    let leaderAttackStarts = 0;
    let leaderBackWalkFrames = 0;
    let wasAttacking = false;

    for (let i = 0; i < 540; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const leader = match.fighters[0];
      const opponentSide = leader.position.x <= match.fighters[1].position.x ? 1 : -1;
      const walkingAway = leader.state === 'walk' && ((opponentSide > 0 && leader.position.x < -0.78) || (opponentSide < 0 && leader.position.x > -0.78));
      const isAttacking = leader.state === 'attack' && Boolean(leader.currentMove);
      if (isAttacking && !wasAttacking) leaderAttackStarts += 1;
      if (walkingAway) leaderBackWalkFrames += 1;
      wasAttacking = isAttacking;
      if (match.phase !== 'fighting') break;
    }

    expect(leaderAttackStarts).toBeGreaterThanOrEqual(1);
    expect(leaderBackWalkFrames).toBeLessThan(180);
  });

  it('makes a leading CPU close rounds with pokes instead of max-damage launcher routes', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 160;
    match.fighters[1].hp = 90;
    match.fighters[0].position.x = -0.82;
    match.fighters[1].position.x = 0.82;

    let leaderAttackStarts = 0;
    let maxLeaderComboStep = 0;
    let usedLauncher = false;
    let maxLeaderMoveDamage = 0;
    let wasAttacking = false;

    for (let i = 0; i < 540; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const leader = match.fighters[0];
      const isAttacking = leader.state === 'attack' && Boolean(leader.currentMove);
      if (isAttacking && !wasAttacking && leader.currentMove) {
        leaderAttackStarts += 1;
        maxLeaderComboStep = Math.max(maxLeaderComboStep, leader.currentMove.comboStep ?? 1);
        maxLeaderMoveDamage = Math.max(maxLeaderMoveDamage, leader.currentMove.damage);
        usedLauncher = usedLauncher || Boolean(leader.currentMove.launchHeight);
      }
      wasAttacking = isAttacking;
      if (match.phase !== 'fighting') break;
    }

    expect(leaderAttackStarts).toBeGreaterThanOrEqual(1);
    expect(maxLeaderComboStep).toBeLessThanOrEqual(3);
    expect(maxLeaderMoveDamage).toBeLessThanOrEqual(16);
    expect(usedLauncher).toBe(false);
  });

  it('lets high difficulty CPU route into authored tornado when a juggle is near dropping', () => {
    const tornadoCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 3,
              recoveryFrames: 12,
              damage: 6,
              range: 2.4,
              tornado: true
            }
          : move
      )
    };
    let match = createMatch(tornadoCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 337 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 1.1;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].stunFramesRemaining = 90;
    match.fighters[1].actionFramesRemaining = 90;
    match.fighters[1].juggleSequenceDamage = 40;
    match.fighters[1].juggleTornadoCount = 0;
    let usedTornado = false;

    for (let i = 0; i < 90; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      usedTornado = usedTornado || Boolean(match.fighters[0].currentMove?.tornado);
      if (usedTornado) break;
    }

    expect(usedTornado).toBe(true);
  });

  it('varies CPU route choices when matches use different AI seeds', () => {
    const sampleRoute = (aiSeed: number) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5, { aiSeed });
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      const keys: string[] = [];
      const wasAttacking: [boolean, boolean] = [false, false];

      for (let i = 0; i < 420; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        match.fighters.forEach((fighter, index) => {
          const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
          if (isAttacking && !wasAttacking[index] && fighter.currentMove) {
            keys.push(`${fighter.slot}:${fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`}`);
          }
          wasAttacking[index] = isAttacking;
        });
        if (keys.length >= 8 || match.phase !== 'fighting') break;
      }

      return keys.join('|');
    };

    expect(sampleRoute(111)).not.toBe(sampleRoute(222));
  });

  it('rerolls round AI seed between rounds while keeping the match AI seed', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 4444 });
    const initialMatchSeed = match.aiSeed;
    const initialRoundSeed = match.roundAiSeed;

    match.fighters[1].hp = 0;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.phase).toBe('roundOver');

    for (let i = 0; i < 150; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.phase).toBe('fighting');
    expect(match.round).toBe(2);
    expect(match.aiSeed).toBe(initialMatchSeed);
    expect(match.roundAiSeed).not.toBe(initialRoundSeed);
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

      for (let i = 0; i < 540; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        for (const fighter of match.fighters) {
          if (fighter.state !== 'attack' || !fighter.currentMove) continue;
          if (fighter.moveFrame === 0) attackStarts += 1;
          if (fighter.currentMove.route && fighter.currentMove.route !== 'neutral') complexFrames += 1;
          seenMoveKeys.add(fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`);
        }
        if (match.phase !== 'fighting') break;
      }

      return { attackStarts, complexFrames, uniqueMoves: seenMoveKeys.size };
    };

    const easy = simulate(1);
    const kore = simulate(5);

    expect(kore.attackStarts).toBeGreaterThan(easy.attackStarts);
    expect(kore.complexFrames).toBeGreaterThan(easy.complexFrames);
    expect(kore.uniqueMoves).toBeGreaterThan(easy.uniqueMoves);
  });

  it('rotates CPU move routes instead of leaning on one repeated route', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 4);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    const moveCounts = new Map<string, number>();
    let attackStarts = 0;
    const wasAttacking: [boolean, boolean] = [false, false];

    for (let i = 0; i < 720; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      match.fighters.forEach((fighter, index) => {
        const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
        if (!isAttacking || wasAttacking[index] || !fighter.currentMove) {
          wasAttacking[index] = isAttacking;
          return;
        }
        attackStarts += 1;
        const key = fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`;
        moveCounts.set(key, (moveCounts.get(key) ?? 0) + 1);
        wasAttacking[index] = isAttacking;
      });
      if (match.phase !== 'fighting') break;
    }

    const topCount = Math.max(...moveCounts.values());
    expect(moveCounts.size).toBeGreaterThanOrEqual(4);
    expect(topCount / Math.max(1, attackStarts)).toBeLessThan(0.7);
  });

  it('drops CPU combo continuations instead of repeating the same move identity', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 909 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.72;
    match.fighters[1].position.x = 0.72;
    match.fighters[1].state = 'hit';
    match.fighters[1].stunFramesRemaining = 240;
    match.fighters[1].actionFramesRemaining = 240;
    match.fighters[1].stunTimer = 4;
    match.fighters[1].actionTimer = 4;

    const seenInCombo = new Set<string>();
    let attackStarts = 0;
    let repeatedStarts = 0;
    let wasAttacking = false;

    for (let i = 0; i < 240; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const fighter = match.fighters[0];
      const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
      if (isAttacking && !wasAttacking && fighter.currentMove) {
        attackStarts += 1;
        if (fighter.comboStep <= 1) seenInCombo.clear();
        const key = fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`;
        if (seenInCombo.has(key)) repeatedStarts += 1;
        seenInCombo.add(key);
      }
      wasAttacking = isAttacking;
    }

    expect(attackStarts).toBeGreaterThan(2);
    expect(repeatedStarts).toBe(0);
  });

  it('drops CPU juggle continuations once its juggle budget is spent', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 991 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[0].comboTimer = 0.5;
    match.fighters[0].comboStep = 12;
    match.fighters[0].comboHits = 12;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 1.3;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].stunFramesRemaining = 180;
    match.fighters[1].actionFramesRemaining = 180;
    match.fighters[1].stunTimer = 3;
    match.fighters[1].actionTimer = 3;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).not.toBe('attack');
    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].aiJuggleLockoutFrames).toBeGreaterThan(0);
  });

  it('drops stale visual-family juggle followups instead of changing command on the same button', () => {
    const jabVariantCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      aiProfile: { ...starterCharacters[0].aiProfile, aggression: 1, specialChance: 0 },
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:f+1': starterCharacters[0].animationFrames?.jableft ?? starterCharacters[0].animationFrames?.jab ?? [],
        'cmd:qcf+1': starterCharacters[0].animationFrames?.jableft ?? starterCharacters[0].animationFrames?.jab ?? []
      },
      moves: starterCharacters[0].moves
        .filter((move) => move.input === 'jab')
        .map((move) => ({
          ...move,
          startupFrames: 3,
          activeFrames: 5,
          recoveryFrames: 10,
          range: 2.4,
          damage: 5,
          launchHeight: undefined,
          knockdown: false
        }))
    };
    let match = createMatch(jabVariantCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 992 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[0].comboTimer = 0.5;
    match.fighters[0].comboStep = 1;
    match.fighters[0].comboHits = 1;
    match.fighters[0].comboSequence = ['jab'];
    match.fighters[0].comboIdentitySequence = ['neutral:jab'];
    match.fighters[0].comboFamilySequence = ['neutral:jab'];
    match.fighters[0].comboVisualFamilySequence = [visualFamilyByInput.jab];
    match.fighters[0].comboUsedKeys = ['neutral:jab'];
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 1.25;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].stunFramesRemaining = 180;
    match.fighters[1].actionFramesRemaining = 180;
    match.fighters[1].stunTimer = 3;
    match.fighters[1].actionTimer = 3;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).not.toBe('attack');
    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].aiJuggleLockoutFrames).toBeGreaterThan(0);
  });

  it('lets high difficulty CPU use varied visual families before ending a juggle route', () => {
    const variedJuggleCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      aiProfile: { ...starterCharacters[0].aiProfile, aggression: 1, specialChance: 0.35 },
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 3,
        activeFrames: 5,
        recoveryFrames: 10,
        range: 2.5,
        damage: 3,
        onHitFrames: 48,
        onComboHitFrames: 48,
        onJuggleHitFrames: 48,
        launchHeight: undefined,
        knockdown: false
      }))
    };
    let match = createMatch(variedJuggleCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 993 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 1.25;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].stunFramesRemaining = 240;
    match.fighters[1].actionFramesRemaining = 240;
    match.fighters[1].stunTimer = 4;
    match.fighters[1].actionTimer = 4;

    const seenInCombo = new Set<string>();
    const allSeen = new Set<string>();
    let repeatedVisualStarts = 0;
    let attackStarts = 0;
    let maxComboStep = 0;
    let wasAttacking = false;

    for (let i = 0; i < 300; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const fighter = match.fighters[0];
      maxComboStep = Math.max(maxComboStep, fighter.comboStep);
      const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
      if (isAttacking && !wasAttacking && fighter.currentMove) {
        attackStarts += 1;
        if (fighter.comboStep <= 1) seenInCombo.clear();
        const visualFamily = visualFamilyByInput[fighter.currentMove.input];
        if (seenInCombo.has(visualFamily)) repeatedVisualStarts += 1;
        seenInCombo.add(visualFamily);
        allSeen.add(visualFamily);
      }
      wasAttacking = isAttacking;
    }

    expect(attackStarts).toBeGreaterThanOrEqual(2);
    expect(allSeen.size).toBeGreaterThanOrEqual(2);
    expect(repeatedVisualStarts).toBe(0);
    expect(maxComboStep).toBeLessThan(30);
  });

  it('CPU-watch metric reports zero repeated exact identities inside active combos', () => {
    const reports = starterCharacters.slice(0, 10).map((character, index) => {
      let match = createMatch(character, starterCharacters[(index + 1) % starterCharacters.length] ?? starterCharacters[0], stages[0], 'cpu', 5, { aiSeed: 1200 + index * 17 });
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      match.fighters[0].position.x = -0.72;
      match.fighters[1].position.x = 0.72;
      match.fighters[1].state = 'hit';
      match.fighters[1].stunFramesRemaining = 240;
      match.fighters[1].actionFramesRemaining = 240;
      match.fighters[1].stunTimer = 4;
      match.fighters[1].actionTimer = 4;

      const seenInCombo = new Set<string>();
      let attackStarts = 0;
      let repeatedStarts = 0;
      let wasAttacking = false;

      for (let i = 0; i < 240; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        const fighter = match.fighters[0];
        const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
        if (isAttacking && !wasAttacking && fighter.currentMove) {
          if (fighter.comboStep <= 1) seenInCombo.clear();
          const key = fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`;
          if (seenInCombo.has(key)) repeatedStarts += 1;
          seenInCombo.add(key);
          attackStarts += 1;
        }
        wasAttacking = isAttacking;
      }

      return `${character.id}:${attackStarts}:${repeatedStarts}`;
    });

    expect(reports.some((report) => Number(report.split(':')[1]) > 1)).toBe(true);
    expect(reports.filter((report) => Number(report.split(':')[2]) > 0)).toEqual([]);
  });

  it('makes high difficulty CPU take hitstun pressure openings more often than easy CPU', () => {
    const stepOpening = (difficulty: 1 | 5) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', difficulty);
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      match.fighters[0].position.x = -0.78;
      match.fighters[1].position.x = 0.78;
      match.fighters[1].state = 'hit';
      match.fighters[1].stunFramesRemaining = 180;
      match.fighters[1].actionFramesRemaining = 180;
      match.fighters[1].stunTimer = 3;
      match.fighters[1].actionTimer = 3;

      let attackStarts = 0;
      const usedInputs = new Set<string>();
      let wasAttacking = false;
      for (let i = 0; i < 180; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        const move = match.fighters[0].currentMove;
        const isAttacking = match.fighters[0].state === 'attack' && Boolean(move);
        if (move && isAttacking && !wasAttacking) {
          attackStarts += 1;
          usedInputs.add(move.input);
        }
        wasAttacking = isAttacking;
      }
      return { attackStarts, usedInputs: usedInputs.size };
    };

    const hard = stepOpening(5);
    const easy = stepOpening(1);
    expect(hard.attackStarts).toBeGreaterThan(easy.attackStarts);
    expect(hard.usedInputs).toBeGreaterThanOrEqual(1);
  });

  it('lets CPU spend ki on charge-plus-attack routes during battle', () => {
    const kiCharacter = {
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:O+1': ['/characters/kiro/frames/frame-000.png']
      }
    };
    let match = createMatch(kiCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 222 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].ki = 100;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[1].state = 'hit';
    match.fighters[1].stunFramesRemaining = 180;
    match.fighters[1].actionFramesRemaining = 180;
    match.fighters[1].stunTimer = 3;
    match.fighters[1].actionTimer = 3;

    let sawKiBurst = false;
    for (let i = 0; i < 180; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[0].currentMove?.kiBurst) {
        sawKiBurst = true;
        break;
      }
    }

    expect(sawKiBurst).toBe(true);
    expect(match.fighters[0].ki).toBeLessThan(100);
  });

  it('lets CPU Naruto charge for shadow clone ability instead of only using ki bursts', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 118 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].ki = 50;
    match.fighters[0].position.x = -1.25;
    match.fighters[1].position.x = 1.25;

    let sawCharge = false;
    let sawClone = false;
    for (let i = 0; i < 720; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[0].state === 'chargeKi') sawCharge = true;
      if (match.fighters[0].shadowClone?.phase === 'active') {
        sawClone = true;
        break;
      }
    }

    expect(sawCharge).toBe(true);
    expect(sawClone).toBe(true);
  });

  it('lets non-Naruto CPU characters charge for authored ki abilities before using them', () => {
    const kiCharacter: CharacterDefinition = {
      ...starterCharacters[1],
      id: 'charged-riven',
      displayName: 'Charged Riven',
      animationFrames: {
        ...(starterCharacters[1].animationFrames ?? {}),
        'cmd:O+2': starterCharacters[1].animationFrames?.jabright ?? starterCharacters[1].animationFrames?.jab ?? []
      }
    };
    let match = createMatch(kiCharacter, starterCharacters[0], stages[0], 'cpu', 5, { aiSeed: 118 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].ki = 18;
    match.fighters[0].position.x = -1.35;
    match.fighters[1].position.x = 1.35;

    let sawCharge = false;
    let sawKiBurst = false;
    for (let i = 0; i < 360; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[0].state === 'chargeKi') sawCharge = true;
      if (match.fighters[0].currentMove?.kiBurst) {
        sawKiBurst = true;
        break;
      }
    }

    expect(sawCharge).toBe(true);
    expect(sawKiBurst).toBe(true);
  });

  it('lets high difficulty CPU route into configured full-crouch stance attacks', () => {
    const crouchCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        'cmd:FC+1': starterCharacters[0].animationFrames?.jableft ?? starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        'cmd:FC+1': {
          label: 'CPU Crouch Check',
          startupFrames: 10,
          activeFrames: 3,
          recoveryFrames: 16,
          damage: 8,
          blockDamage: 0,
          hitLevel: 'low',
          onBlockFrames: -9,
          onHitFrames: 5,
          onCounterHitFrames: 8,
          range: 1.45,
          pushback: 0.25,
          blockPushback: 0.15,
          tracking: 'medium',
          knockdown: false,
          hitbox: { offset: [0.58, 0.56, 0], size: [1, 0.46, 0.56] }
        }
      }
    };
    let match = createMatch(crouchCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 440 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.5;
    match.fighters[1].position.x = 0.5;
    match.fighters[1].state = 'hit';
    match.fighters[1].stunFramesRemaining = 240;
    match.fighters[1].actionFramesRemaining = 240;
    match.fighters[1].stunTimer = 4;
    match.fighters[1].actionTimer = 4;

    let sawFullCrouch = false;
    for (let i = 0; i < 240; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const move = match.fighters[0].currentMove;
      if (match.fighters[0].state === 'attack' && move?.command === 'FC+1') {
        sawFullCrouch = true;
        expect(move.animationKey).toBe('cmd:FC+1');
        expect(move.label).toBe('CPU Crouch Check');
        break;
      }
    }

    expect(sawFullCrouch).toBe(true);
  });

  it('higher CPU difficulty extends hit-confirmed routes with variety instead of repeats', () => {
    const simulatePressure = (difficulty: 1 | 5) => {
      let match = createMatch(makeCancelableCharacter(starterCharacters[0]), starterCharacters[1], stages[0], 'cpu', difficulty);
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].hp = 999;
      match.fighters[1].hp = 999;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      match.fighters[0].comboTimer = 0.5;
      match.fighters[0].comboStep = 1;
      match.fighters[0].comboSequence = ['jab'];
      match.fighters[0].comboIdentitySequence = ['neutral:jab'];
      match.fighters[0].comboUsedKeys = ['neutral:jab'];
      match.fighters[0].comboHits = 1;
      match.fighters[1].state = 'hit';
      match.fighters[1].stunFramesRemaining = 180;
      match.fighters[1].actionFramesRemaining = 180;
      match.fighters[1].stunTimer = 3;
      match.fighters[1].actionTimer = 3;
      let peakStep = match.fighters[0].comboStep;
      const seen = new Set<string>(['neutral:jab']);
      let maxUniqueMoves = seen.size;
      let repeats = 0;
      let lastMoveInstanceId = match.fighters[0].moveInstanceId;

      for (let i = 0; i < 180; i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        const fighter = match.fighters[0];
        peakStep = Math.max(peakStep, fighter.comboStep);
        const isAttacking = fighter.state === 'attack' && Boolean(fighter.currentMove);
        if (isAttacking && fighter.currentMove && fighter.moveInstanceId !== lastMoveInstanceId) {
          if (fighter.comboStep <= 1) seen.clear();
          const key = fighter.currentMove.command ?? `${fighter.currentMove.route ?? 'neutral'}:${fighter.currentMove.input}`;
          if (seen.has(key)) repeats += 1;
          seen.add(key);
          maxUniqueMoves = Math.max(maxUniqueMoves, seen.size);
        }
        lastMoveInstanceId = fighter.moveInstanceId;
      }

      return { peakStep, uniqueMoves: maxUniqueMoves, repeats };
    };

    const hard = simulatePressure(5);
    const easy = simulatePressure(1);
    expect(hard.peakStep).toBeGreaterThanOrEqual(easy.peakStep);
    expect(hard.uniqueMoves).toBeGreaterThanOrEqual(2);
    expect(hard.repeats).toBe(0);
  });

  it('keeps CPU locked in non-cancelable recovery but lets cancelable hit-confirms continue', () => {
    const prepareCpuRecovery = (cancelable: boolean) => {
      const character: CharacterDefinition = {
        ...starterCharacters[0],
        aiProfile: { ...starterCharacters[0].aiProfile, aggression: 1, specialChance: 0 },
        moves: starterCharacters[0].moves.map((move) => ({
          ...move,
          cancelable,
          startupFrames: 3,
          activeFrames: 2,
          recoveryFrames: 60,
          onHitFrames: 90,
          range: 3,
          pushback: 0.08,
          launchHeight: undefined,
          knockdown: false
        }))
      };
      const next = createMatch(character, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 13 });
      next.phase = 'fighting';
      next.countdown = 0;
      next.fighters[0].position.x = -0.45;
      next.fighters[1].position.x = 0.45;
      const move = next.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
      next.fighters[0].state = 'attack';
      next.fighters[0].currentMove = move;
      next.fighters[0].moveInstanceId = 1;
      next.fighters[0].moveFrame = move.startupFrames + move.activeFrames;
      next.fighters[0].actionFramesRemaining = move.recoveryFrames;
      next.fighters[0].actionTimer = move.recoveryFrames / 60;
      next.fighters[0].hitConnected = true;
      next.fighters[0].hitConfirmed = true;
      next.fighters[0].comboTimer = 0.5;
      next.fighters[0].comboStep = 1;
      next.fighters[0].comboSequence = ['jab'];
      next.fighters[0].comboHits = 1;
      next.fighters[1].state = 'hit';
      next.fighters[1].stunFramesRemaining = 120;
      next.fighters[1].actionFramesRemaining = 120;
      next.fighters[1].stunTimer = 2;
      next.fighters[1].actionTimer = 2;
      return next;
    };

    let strict = prepareCpuRecovery(false);
    for (let i = 0; i < 20; i += 1) {
      strict = stepMatch(strict, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(strict.fighters[0].moveInstanceId).toBe(1);
    expect(strict.fighters[0].currentMove?.input).toBe('jab');

    let cancelable = prepareCpuRecovery(true);
    for (let i = 0; i < 20 && cancelable.fighters[0].moveInstanceId === 1; i += 1) {
      cancelable = stepMatch(cancelable, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(cancelable.fighters[0].moveInstanceId).toBeGreaterThan(1);
    expect(cancelable.fighters[0].currentMove?.comboStep).toBe(2);
  });

  it('keeps CPU from jumping in neutral without a homing move or air juggle chase', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    let jumpFrames = 0;

    for (let i = 0; i < 720; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters.some((fighter) => fighter.state === 'jump' && fighter.backHopTotalFrames === 0)) {
        jumpFrames += 1;
      }
      if (match.phase !== 'fighting') break;
    }

    expect(jumpFrames).toBe(0);
  });

  it('lets CPU jump before committing to a homing move', () => {
    const homingCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      aiProfile: { ...starterCharacters[0].aiProfile, aggression: 1, specialChance: 1 },
      moves: starterCharacters[0].moves
        .filter((move) => move.input === 'special')
        .map((move) => ({
          ...move,
          startupFrames: 3,
          activeFrames: 8,
          recoveryFrames: 10,
          range: 2.6,
          tracking: 'homing' as const,
          homingSpeed: 12
        }))
    };
    let match = createMatch(homingCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 77 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.85;
    match.fighters[1].position.x = 0.85;
    let jumped = false;
    let usedHoming = false;

    for (let i = 0; i < 720; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      jumped = jumped || match.fighters[0].state === 'jump';
      usedHoming = usedHoming || match.fighters[0].currentMove?.tracking === 'homing';
      if (jumped && usedHoming) break;
    }

    expect(jumped).toBe(true);
    expect(usedHoming).toBe(true);
  });

  it('keeps CPU grounded for non-air-chase juggle followups after launch', () => {
    const groundedChaseCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      aiProfile: { ...starterCharacters[0].aiProfile, aggression: 1, specialChance: 0 },
      moves: starterCharacters[0].moves
        .filter((move) => move.input === 'jab')
        .map((move) => ({
          ...move,
          startupFrames: 3,
          activeFrames: 5,
          recoveryFrames: 10,
          range: 2.4,
          tracking: 'none' as const
        }))
    };
    let match = createMatch(groundedChaseCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 19 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 1.25;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].stunFramesRemaining = 160;
    match.fighters[1].actionFramesRemaining = 160;
    match.fighters[1].stunTimer = 160 / 60;
    match.fighters[1].actionTimer = 160 / 60;
    let jumpFrames = 0;
    let attackedGrounded = false;

    for (let i = 0; i < 180; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[0].state === 'jump') jumpFrames += 1;
      attackedGrounded = attackedGrounded || (match.fighters[0].state === 'attack' && match.fighters[0].position.y === 0);
      if (attackedGrounded && jumpFrames > 0) break;
    }

    expect(attackedGrounded).toBe(true);
    expect(jumpFrames).toBe(0);
  });

  it('lets CPU jump to chase an opponent after launch with an air-chase move', () => {
    const airChaseCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      aiProfile: { ...starterCharacters[0].aiProfile, aggression: 1, specialChance: 0 },
      moves: starterCharacters[0].moves
        .filter((move) => move.input === 'jab')
        .map((move) => ({
          ...move,
          startupFrames: 3,
          activeFrames: 5,
          recoveryFrames: 10,
          range: 2.4,
          tracking: 'homing' as const,
          homingSpeed: 12
        }))
    };
    let match = createMatch(airChaseCharacter, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 19 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 999;
    match.fighters[1].hp = 999;
    match.fighters[0].position.x = -0.55;
    match.fighters[1].position.x = 0.55;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 1.25;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].stunFramesRemaining = 160;
    match.fighters[1].actionFramesRemaining = 160;
    match.fighters[1].stunTimer = 160 / 60;
    match.fighters[1].actionTimer = 160 / 60;
    let jumped = false;
    let attackedAirborne = false;

    for (let i = 0; i < 180; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      jumped = jumped || match.fighters[0].state === 'jump';
      attackedAirborne = attackedAirborne || (match.fighters[0].state === 'attack' && match.fighters[0].position.y > 0);
      if (jumped && attackedAirborne) break;
    }

    expect(jumped).toBe(true);
    expect(attackedAirborne).toBe(true);
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

  it('lets high difficulty CPU anti-air incoming airborne attacks', () => {
    let antiAirStarts = 0;
    let specialStarts = 0;
    for (let index = 0; index < 36; index += 1) {
      let match = createMatch(starterCharacters[0], makeAntiAirCharacter(starterCharacters[1]), stages[0], 'versusCpu', 5, { aiSeed: 3000 + index });
      match.phase = 'fighting';
      match.countdown = 0;
      match.timer = 60 - index * 0.031;
      match.fighters[0].position.x = -0.62;
      match.fighters[1].position.x = 0.62;
      match.fighters[0].position.z = 0;
      match.fighters[1].position.z = 0;
      primeAirborneAttack(match, 0);

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[1].state === 'attack' && match.fighters[1].currentMove) {
        antiAirStarts += 1;
        if (match.fighters[1].currentMove.input === 'special') specialStarts += 1;
      }
    }

    expect(antiAirStarts).toBeGreaterThan(20);
    expect(specialStarts).toBeGreaterThan(antiAirStarts * 0.7);
  });

  it('makes easy CPU miss more anti-air chances than high difficulty CPU', () => {
    const sample = (difficulty: 1 | 5) => {
      let starts = 0;
      for (let index = 0; index < 48; index += 1) {
        let match = createMatch(starterCharacters[0], makeAntiAirCharacter(starterCharacters[1]), stages[0], 'versusCpu', difficulty, { aiSeed: 3400 + index });
        match.phase = 'fighting';
        match.countdown = 0;
        match.timer = 60 - index * 0.029;
        match.fighters[0].position.x = -0.62;
        match.fighters[1].position.x = 0.62;
        match.fighters[0].position.z = 0;
        match.fighters[1].position.z = 0;
        primeAirborneAttack(match, 0);

        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        if (match.fighters[1].state === 'attack' && match.fighters[1].currentMove) starts += 1;
      }
      return starts;
    };

    expect(sample(5)).toBeGreaterThan(sample(1) + 12);
  });

  it('does not treat juggled opponents as neutral anti-air threats', () => {
    let match = createMatch(starterCharacters[0], makeAntiAirCharacter(starterCharacters[1]), stages[0], 'versusCpu', 5, { aiSeed: 3777 });
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -1.32;
    match.fighters[1].position.x = 1.32;
    match.fighters[0].position.z = 0;
    match.fighters[1].position.z = 0;
    match.fighters[0].state = 'juggle';
    match.fighters[0].position.y = 1.1;
    match.fighters[0].velocityY = -0.1;
    match.fighters[0].stunFramesRemaining = 0;
    match.fighters[0].actionFramesRemaining = 0;
    match.fighters[0].stunTimer = 0;
    match.fighters[0].actionTimer = 0;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).not.toBe('attack');
    expect(match.fighters[1].currentMove).toBeNull();
  });

  it('lets KORE CPU sidestep incoming linear pressure as defense', () => {
    let sidesteps = 0;
    let blocks = 0;
    for (let index = 0; index < 60; index += 1) {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moves: starterCharacters[0].moves.map((move) =>
          move.input === 'jab'
            ? {
                ...move,
                startupFrames: 3,
                activeFrames: 18,
                recoveryFrames: 18,
                hitLevel: 'mid' as const,
                tracking: 'none' as const,
                range: 2.6
              }
            : move
        )
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 960 + index });
      match.phase = 'fighting';
      match.countdown = 0;
      match.timer = 60 - index * 0.047;
      match.fighters[0].position.x = -0.72;
      match.fighters[1].position.x = 0.72;
      match.fighters[0].position.z = 0;
      match.fighters[1].position.z = 0;
      const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = move;
      match.fighters[0].moveFrame = move.startupFrames;
      match.fighters[0].actionFramesRemaining = 24;
      match.fighters[0].actionTimer = 24 / 60;

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[1].state === 'sidestep') sidesteps += 1;
      if (match.fighters[1].state === 'block') blocks += 1;
    }

    expect(sidesteps).toBeGreaterThan(0);
    expect(blocks).toBeGreaterThan(0);
  });

  it('does not make KORE CPU sidestep homing pressure like linear pressure', () => {
    const sample = (tracking: 'none' | 'homing') => {
      let sidesteps = 0;
      let blocks = 0;
      for (let index = 0; index < 60; index += 1) {
        const attacker: CharacterDefinition = {
          ...starterCharacters[0],
          moves: starterCharacters[0].moves.map((move) =>
            move.input === 'jab'
              ? {
                  ...move,
                  startupFrames: 3,
                  activeFrames: 18,
                  recoveryFrames: 18,
                  hitLevel: 'mid' as const,
                  tracking,
                  homingSpeed: tracking === 'homing' ? 12 : undefined,
                  range: 2.6
                }
              : move
          )
        };
        let match = createMatch(attacker, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 1040 + index });
        match.phase = 'fighting';
        match.countdown = 0;
        match.timer = 60 - index * 0.047;
        match.fighters[0].position.x = -0.72;
        match.fighters[1].position.x = 0.72;
        match.fighters[0].position.z = 0;
        match.fighters[1].position.z = 0;
        const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
        match.fighters[0].state = 'attack';
        match.fighters[0].currentMove = move;
        match.fighters[0].moveFrame = move.startupFrames;
        match.fighters[0].actionFramesRemaining = 24;
        match.fighters[0].actionTimer = 24 / 60;

        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        if (match.fighters[1].state === 'sidestep') sidesteps += 1;
        if (match.fighters[1].state === 'block') blocks += 1;
      }
      return { sidesteps, blocks };
    };

    const linear = sample('none');
    const homing = sample('homing');
    expect(linear.sidesteps).toBeGreaterThan(homing.sidesteps);
    expect(homing.blocks).toBeGreaterThan(homing.sidesteps);
  });

  it('makes high difficulty CPU back-hop for neutral space more often than easy CPU', () => {
    const sample = (difficulty: 1 | 5) => {
      let backHops = 0;
      for (let index = 0; index < 72; index += 1) {
        let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'versusCpu', difficulty, { aiSeed: 1300 + index * 17 });
        match.phase = 'fighting';
        match.countdown = 0;
        match.timer = 60 - index * 0.061;
        match.fighters[0].hp = 999;
        match.fighters[1].hp = 999;
        match.fighters[0].position.x = -0.48;
        match.fighters[1].position.x = 0.48;
        match.fighters[0].position.z = 0;
        match.fighters[1].position.z = 0;

        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        if (match.fighters[1].backHopTotalFrames > 0) backHops += 1;
      }
      return backHops;
    };

    const easy = sample(1);
    const kore = sample(5);
    expect(kore).toBeGreaterThan(easy);
    expect(kore).toBeGreaterThan(0);
  });

  it('lets KORE CPU back-hop to bait close linear pressure', () => {
    const sample = (difficulty: 1 | 5) => {
      let backHops = 0;
      for (let index = 0; index < 72; index += 1) {
        const attacker: CharacterDefinition = {
          ...starterCharacters[0],
          moves: starterCharacters[0].moves.map((move) =>
            move.input === 'jab'
              ? {
                  ...move,
                  startupFrames: 5,
                  activeFrames: 18,
                  recoveryFrames: 22,
                  hitLevel: 'mid' as const,
                  tracking: 'none' as const,
                  range: 2.05
                }
              : move
          )
        };
        let match = createMatch(attacker, starterCharacters[1], stages[0], 'versusCpu', difficulty, { aiSeed: 1440 + index * 19 });
        match.phase = 'fighting';
        match.countdown = 0;
        match.timer = 60 - index * 0.053;
        match.fighters[0].position.x = -0.68;
        match.fighters[1].position.x = 0.68;
        match.fighters[0].position.z = 0;
        match.fighters[1].position.z = 0;
        const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
        match.fighters[0].state = 'attack';
        match.fighters[0].currentMove = move;
        match.fighters[0].moveFrame = move.startupFrames;
        match.fighters[0].actionFramesRemaining = 24;
        match.fighters[0].actionTimer = 24 / 60;

        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        if (match.fighters[1].backHopTotalFrames > 0) backHops += 1;
      }
      return backHops;
    };

    const easy = sample(1);
    const kore = sample(5);
    expect(kore).toBeGreaterThan(easy);
    expect(kore).toBeGreaterThan(0);
  });

  it('does not back-hop as a bait against lows or homing pressure', () => {
    const sample = (movePatch: Partial<MoveDefinition>) => {
      let backHops = 0;
      for (let index = 0; index < 48; index += 1) {
        const attacker: CharacterDefinition = {
          ...starterCharacters[0],
          moves: starterCharacters[0].moves.map((move) =>
            move.input === 'jab'
              ? {
                  ...move,
                  startupFrames: 5,
                  activeFrames: 18,
                  recoveryFrames: 22,
                  range: 2.05,
                  ...movePatch
                }
              : move
          )
        };
        let match = createMatch(attacker, starterCharacters[1], stages[0], 'versusCpu', 5, { aiSeed: 1580 + index * 23 });
        match.phase = 'fighting';
        match.countdown = 0;
        match.timer = 60 - index * 0.049;
        match.fighters[0].position.x = -0.68;
        match.fighters[1].position.x = 0.68;
        match.fighters[0].position.z = 0;
        match.fighters[1].position.z = 0;
        const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
        match.fighters[0].state = 'attack';
        match.fighters[0].currentMove = move;
        match.fighters[0].moveFrame = move.startupFrames;
        match.fighters[0].actionFramesRemaining = 24;
        match.fighters[0].actionTimer = 24 / 60;

        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        if (match.fighters[1].backHopTotalFrames > 0) backHops += 1;
      }
      return backHops;
    };

    expect(sample({ hitLevel: 'low' })).toBe(0);
    expect(sample({ hitLevel: 'mid', tracking: 'homing', homingSpeed: 12 })).toBe(0);
    expect(sample({ hitLevel: 'mid', tracking: 'strong' })).toBe(0);
  });

  it('lets CPU chase whiff-punish windows after a back-hop bait', () => {
    let chaseOrAttackFrames = 0;
    for (let index = 0; index < 48; index += 1) {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moves: starterCharacters[0].moves.map((move) =>
          move.input === 'jab'
            ? {
                ...move,
                startupFrames: 3,
                activeFrames: 3,
                recoveryFrames: 28,
                whiffRecoveryFrames: 12,
                hitLevel: 'mid' as const,
                tracking: 'none' as const,
                range: 1.0
              }
            : move
        )
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'versusCpu', 5, { aiSeed: 1700 + index * 29 });
      match.phase = 'fighting';
      match.countdown = 0;
      match.timer = 60 - index * 0.057;
      match.fighters[0].position.x = -0.9;
      match.fighters[1].position.x = 0.9;
      match.fighters[0].position.z = 0;
      match.fighters[1].position.z = 0;
      const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = move;
      match.fighters[0].moveFrame = move.startupFrames + move.activeFrames + 1;
      match.fighters[0].actionFramesRemaining = 24;
      match.fighters[0].actionTimer = 24 / 60;
      match.fighters[0].whiffRecoveryApplied = true;
      match.fighters[1].backHopCooldownFrames = 8;

      const beforeX = match.fighters[1].position.x;
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      const cpu = match.fighters[1];
      if (cpu.state === 'attack' || cpu.position.x < beforeX) chaseOrAttackFrames += 1;
    }

    expect(chaseOrAttackFrames).toBeGreaterThan(0);
  });

  it('makes KORE CPU crouch-block incoming lows more often than easy CPU', () => {
    const sample = (difficulty: 1 | 5) => {
      let crouchBlocks = 0;
      let standBlocks = 0;
      for (let index = 0; index < 36; index += 1) {
        const attacker: CharacterDefinition = {
          ...starterCharacters[0],
          moves: starterCharacters[0].moves.map((move) =>
            move.input === 'jab'
              ? {
                  ...move,
                  startupFrames: 3,
                  activeFrames: 18,
                  recoveryFrames: 18,
                  hitLevel: 'low' as const,
                  range: 2.6
                }
              : move
          )
        };
        let match = createMatch(attacker, starterCharacters[1], stages[0], 'cpu', difficulty, { aiSeed: 700 + index });
        match.phase = 'fighting';
        match.countdown = 0;
        match.timer = 60 - index * 0.07;
        match.fighters[0].position.x = -0.72;
        match.fighters[1].position.x = 0.72;
        const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
        match.fighters[0].state = 'attack';
        match.fighters[0].currentMove = move;
        match.fighters[0].moveFrame = move.startupFrames;
        match.fighters[0].actionFramesRemaining = 24;
        match.fighters[0].actionTimer = 24 / 60;

        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        if (match.fighters[1].state === 'crouchBlock') crouchBlocks += 1;
        if (match.fighters[1].state === 'block') standBlocks += 1;
      }
      return { crouchBlocks, standBlocks };
    };

    const easy = sample(1);
    const kore = sample(5);
    expect(kore.crouchBlocks).toBeGreaterThan(kore.standBlocks);
    expect(kore.crouchBlocks).toBeGreaterThan(easy.crouchBlocks);
  });

  it('keeps CPU standing-blocking mids instead of over-crouching unknown pressure', () => {
    let standBlocks = 0;
    let crouchBlocks = 0;
    for (let index = 0; index < 24; index += 1) {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moves: starterCharacters[0].moves.map((move) =>
          move.input === 'jab'
            ? {
                ...move,
                startupFrames: 3,
                activeFrames: 18,
                recoveryFrames: 18,
                hitLevel: 'mid' as const,
                range: 2.6
              }
            : move
        )
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 800 + index });
      match.phase = 'fighting';
      match.countdown = 0;
      match.timer = 60 - index * 0.07;
      match.fighters[0].position.x = -0.72;
      match.fighters[1].position.x = 0.72;
      const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = move;
      match.fighters[0].moveFrame = move.startupFrames;
      match.fighters[0].actionFramesRemaining = 24;
      match.fighters[0].actionTimer = 24 / 60;

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[1].state === 'block') standBlocks += 1;
      if (match.fighters[1].state === 'crouchBlock') crouchBlocks += 1;
    }

    expect(standBlocks).toBeGreaterThan(0);
    expect(crouchBlocks).toBe(0);
  });

  it('lets high difficulty CPU duck some incoming high attacks', () => {
    let ducks = 0;
    let standBlocks = 0;
    for (let index = 0; index < 60; index += 1) {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moves: starterCharacters[0].moves.map((move) =>
          move.input === 'jab'
            ? {
                ...move,
                startupFrames: 3,
                activeFrames: 18,
                recoveryFrames: 18,
                hitLevel: 'high' as const,
                range: 2.6,
                hitbox: {
                  offset: [0.62, 1.55, 0],
                  size: [1.1, 0.34, 0.7]
                }
              }
            : move
        )
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 900 + index });
      match.phase = 'fighting';
      match.countdown = 0;
      match.timer = 60 - index * 0.05;
      match.fighters[0].position.x = -0.72;
      match.fighters[1].position.x = 0.72;
      const move = match.fighters[0].character.moves.find((candidate) => candidate.input === 'jab')!;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = move;
      match.fighters[0].moveFrame = move.startupFrames;
      match.fighters[0].actionFramesRemaining = 24;
      match.fighters[0].actionTimer = 24 / 60;

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[1].state === 'crouch') ducks += 1;
      if (match.fighters[1].state === 'block') standBlocks += 1;
    }

    expect(ducks).toBeGreaterThan(0);
    expect(standBlocks).toBeGreaterThan(ducks);
  });

  it('keeps horizontal controls relative to the opponent after fighters cross physical sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 1.3;
    match.fighters[1].position.x = -1.3;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].facing).toBe(-1);
    expect(match.fighters[1].facing).toBe(1);

    const toward = emptyInputFrame();
    toward.left = true;
    const towardResult = stepMatch(match, toward, emptyInputFrame(), 1 / 60);
    expect(towardResult.fighters[0].position.x).toBeLessThan(match.fighters[0].position.x);

    const away = emptyInputFrame();
    away.right = true;
    const awayResult = stepMatch(match, away, emptyInputFrame(), 1 / 60);
    expect(awayResult.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);
    expect(awayResult.fighters[0].state).toBe('block');

    const p2Toward = emptyInputFrame();
    p2Toward.right = true;
    const p2TowardResult = stepMatch(match, emptyInputFrame(), p2Toward, 1 / 60);
    expect(p2TowardResult.fighters[1].position.x).toBeGreaterThan(match.fighters[1].position.x);

    const p2Away = emptyInputFrame();
    p2Away.left = true;
    const p2AwayResult = stepMatch(match, emptyInputFrame(), p2Away, 1 / 60);
    expect(p2AwayResult.fighters[1].position.x).toBeLessThan(match.fighters[1].position.x);
    expect(p2AwayResult.fighters[1].state).toBe('block');

    const laneUp = emptyInputFrame();
    laneUp.sidewalkUp = true;
    const laneZBefore = match.fighters[0].position.z;
    const laneUpResult = stepMatch(match, laneUp, emptyInputFrame(), 10 / 60);
    expect(laneUpResult.fighters[0].position.z).toBeLessThan(laneZBefore - 0.35);

    const laneDown = emptyInputFrame();
    laneDown.sidewalkDown = true;
    const laneDownResult = stepMatch(match, laneDown, emptyInputFrame(), 10 / 60);
    expect(laneDownResult.fighters[0].position.z).toBeGreaterThan(laneZBefore + 0.35);
  });

  it('uses back-back as an unsafe airborne retreat for both sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const p1X = match.fighters[0].position.x;
    const p1Back = { ...emptyInputFrame(), left: true, dashBack: true, dashForward: true };

    match = stepMatch(match, p1Back, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].position.x).toBeLessThan(p1X);
    expect(match.fighters[0].position.y).toBeGreaterThan(0);
    expect(match.fighters[0].velocityY).toBeGreaterThan(0);
    expect(match.fighters[0].state).toBe('jump');
    expect(match.fighters[0].backHopTotalFrames).toBeGreaterThan(0);
    expect(match.fighters[0].state).not.toBe('block');

    let p2Match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    p2Match.phase = 'fighting';
    p2Match.countdown = 0;
    const p2X = p2Match.fighters[1].position.x;
    const p2Back = { ...emptyInputFrame(), right: true, dashBack: true, dashForward: true };

    p2Match = stepMatch(p2Match, emptyInputFrame(), p2Back, 1 / 60);

    expect(p2Match.fighters[1].position.x).toBeGreaterThan(p2X);
    expect(p2Match.fighters[1].position.y).toBeGreaterThan(0);
    expect(p2Match.fighters[1].state).toBe('jump');
    expect(p2Match.fighters[1].backHopTotalFrames).toBeGreaterThan(0);
    expect(p2Match.fighters[1].state).not.toBe('block');
  });

  it('keeps forward double-tap sprint behavior separate from back hop', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    const p1X = match.fighters[0].position.x;
    const forwardDash = { ...emptyInputFrame(), right: true, dashForward: true, dashBack: true };

    const next = stepMatch(match, forwardDash, emptyInputFrame(), 1 / 60);

    expect(next.fighters[0].position.x).toBeGreaterThan(p1X);
    expect(next.fighters[0].dashForwardFrames).toBeGreaterThan(0);
    expect(next.fighters[0].backHopTotalFrames).toBe(0);
    expect(next.fighters[0].state).toBe('walk');
  });

  it('lands back hop much faster than a normal jump', () => {
    const framesUntilGrounded = (start: ReturnType<typeof createMatch>) => {
      let next = start;
      for (let frame = 1; frame <= 90; frame += 1) {
        next = stepMatch(next, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        if (next.fighters[0].position.y === 0 && next.fighters[0].velocityY === 0) return frame;
      }
      return 91;
    };

    const backHopStart = stepMatch(
      createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p'),
      { ...emptyInputFrame(), left: true, dashBack: true },
      emptyInputFrame(),
      1 / 60
    );
    const jumpStart = stepMatch(
      createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p'),
      { ...emptyInputFrame(), up: true },
      emptyInputFrame(),
      1 / 60
    );

    expect(backHopStart.fighters[0].position.y).toBeGreaterThan(0);
    expect(framesUntilGrounded(backHopStart)).toBeLessThan(framesUntilGrounded(jumpStart) * 0.65);
  });

  it('does not start back hop from locked or invalid states', () => {
    const cases: Array<{ name: string; setup: (match: MatchSnapshot) => ReturnType<typeof emptyInputFrame> }> = [
      { name: 'crouching', setup: () => ({ ...emptyInputFrame(), left: true, down: true, dashBack: true }) },
      {
        name: 'airborne',
        setup: (match) => {
          match.fighters[0].state = 'jump';
          match.fighters[0].position.y = 0.6;
          match.fighters[0].velocityY = 0.2;
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'attacking',
        setup: (match) => {
          match.fighters[0].state = 'attack';
          match.fighters[0].currentMove = match.fighters[0].character.moves[0];
          match.fighters[0].actionFramesRemaining = 8;
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'hitstun',
        setup: (match) => {
          match.fighters[0].state = 'hit';
          match.fighters[0].stunFramesRemaining = 8;
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'blockstun',
        setup: (match) => {
          match.fighters[0].state = 'block';
          match.fighters[0].blockstunFramesRemaining = 8;
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'knockdown',
        setup: (match) => {
          match.fighters[0].state = 'knockdown';
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'getup',
        setup: (match) => {
          match.fighters[0].state = 'getup';
          match.fighters[0].actionFramesRemaining = 8;
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'throw hold',
        setup: (match) => {
          match.fighters[0].state = 'throwHold';
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'throw held',
        setup: (match) => {
          match.fighters[0].state = 'throwHeld';
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'transform',
        setup: (match) => {
          match.fighters[0].state = 'transform';
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'charge startup',
        setup: (match) => {
          match.fighters[0].state = 'chargeKi';
          match.fighters[0].chargePhase = 'startup';
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      },
      {
        name: 'charge recovery',
        setup: (match) => {
          match.fighters[0].state = 'chargeKi';
          match.fighters[0].chargePhase = 'recovery';
          return { ...emptyInputFrame(), left: true, dashBack: true };
        }
      }
    ];

    for (const item of cases) {
      const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
      const input = item.setup(match);
      const next = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      expect(next.fighters[0].backHopTotalFrames, item.name).toBe(0);
    }
  });

  it('gives smaller characters quicker back hops than larger characters', () => {
    const small: CharacterDefinition = {
      ...starterCharacters[0],
      id: 'small-back-hop-test',
      modelScale: { width: 0.65, height: 0.65 }
    };
    const large: CharacterDefinition = {
      ...starterCharacters[0],
      id: 'large-back-hop-test',
      modelScale: { width: 1.45, height: 1.45 }
    };
    const opponent = starterCharacters[1];
    const input = { ...emptyInputFrame(), left: true, dashBack: true };

    const smallMatch = stepMatch(createMatch(small, opponent, stages[0], 'local2p'), input, emptyInputFrame(), 1 / 60);
    const largeMatch = stepMatch(createMatch(large, opponent, stages[0], 'local2p'), input, emptyInputFrame(), 1 / 60);

    expect(smallMatch.fighters[0].backHopTotalFrames).toBeLessThan(largeMatch.fighters[0].backHopTotalFrames);
  });

  it('resolves back-hop animation through walk back, jump, canonical backHop, then legacy backflip', () => {
    const base = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p').fighters[0];
    const makeFighter = (animationFrames: CharacterDefinition['animationFrames']) => ({
      ...base,
      state: 'jump' as const,
      backHopTotalFrames: 6,
      character: {
        ...base.character,
        animationFrames
      }
    });

    expect(getFighterAnimationFrameSource(makeFighter({ walkBack: ['walk-back.png'], jump: ['jump.png'], backHop: ['back-hop.png'], idle: ['idle.png'] }))?.key).toBe('walkBack');
    expect(getFighterAnimationFrameSource(makeFighter({ jump: ['jump.png'], backHop: ['back-hop.png'], idle: ['idle.png'] }))?.key).toBe('jump');
    expect(getFighterAnimationFrameSource(makeFighter({ backHop: ['back-hop.png'], idle: ['idle.png'] }))?.key).toBe('backHop');
    expect(getFighterAnimationFrameSource(makeFighter({ backflip: ['legacy-backflip.png'], idle: ['idle.png'] }))?.key).toBe('backflip');
  });

  it('keeps double-tap up and down sidesteps relative to the current control side', () => {
    let sameSide = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    sameSide.phase = 'fighting';
    sameSide.countdown = 0;
    const sameSideZ = sameSide.fighters[0].position.z;

    const sameSideUp = stepMatch(sameSide, { ...emptyInputFrame(), sidestepUp: true }, emptyInputFrame(), 1 / 60);
    expect(sameSideUp.fighters[0].position.z).toBeLessThan(sameSideZ);

    const sameSideDown = stepMatch(sameSide, { ...emptyInputFrame(), sidestepDown: true }, emptyInputFrame(), 1 / 60);
    expect(sameSideDown.fighters[0].position.z).toBeGreaterThan(sameSideZ);

    let crossed = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    crossed.phase = 'fighting';
    crossed.countdown = 0;
    crossed.fighters[0].position.x = 1.3;
    crossed.fighters[1].position.x = -1.3;
    crossed = stepMatch(crossed, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    const crossedZ = crossed.fighters[0].position.z;

    const crossedUp = stepMatch(crossed, { ...emptyInputFrame(), sidestepUp: true }, emptyInputFrame(), 1 / 60);
    expect(crossedUp.fighters[0].position.z).toBeLessThan(crossedZ);

    const crossedDown = stepMatch(crossed, { ...emptyInputFrame(), sidestepDown: true }, emptyInputFrame(), 1 / 60);
    expect(crossedDown.fighters[0].position.z).toBeGreaterThan(crossedZ);
  });

  it('keeps up and down sidesteps control-side relative on rotated stages', () => {
    const rotatedStage: StageDefinition = {
      ...stages[0],
      fightPlane: { center: [4, 0, -2], width: 14, depth: 8, y: 0, rotationY: Math.PI / 2 },
      playableBounds: { shape: 'box', width: 14, depth: 8 }
    };
    let match = createMatch(starterCharacters[0], starterCharacters[1], rotatedStage, 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const crossedP1 = boundsWorldPosition(rotatedStage, { x: 1.3, z: 0 });
    const crossedP2 = boundsWorldPosition(rotatedStage, { x: -1.3, z: 0 });
    match.fighters[0].position.x = crossedP1.x;
    match.fighters[0].position.z = crossedP1.z;
    match.fighters[1].position.x = crossedP2.x;
    match.fighters[1].position.z = crossedP2.z;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].controlSideSign).toBe(-1);

    const laneBefore = boundsLocalPosition(rotatedStage, match.fighters[0].position).z;
    const crossedUp = stepMatch(match, { ...emptyInputFrame(), sidestepUp: true }, emptyInputFrame(), 1 / 60);
    expect(boundsLocalPosition(rotatedStage, crossedUp.fighters[0].position).z).toBeLessThan(laneBefore);

    const crossedDown = stepMatch(match, { ...emptyInputFrame(), sidestepDown: true }, emptyInputFrame(), 1 / 60);
    expect(boundsLocalPosition(rotatedStage, crossedDown.fighters[0].position).z).toBeGreaterThan(laneBefore);
  });

  it('uses the facing tangent for sidesteps without treating lane movement as a side swap', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -1.3;
    match.fighters[0].position.z = 0.9;
    match.fighters[1].position.x = 1.3;
    match.fighters[1].position.z = 0;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    const facingX = match.fighters[1].position.x - match.fighters[0].position.x;
    const facingZ = match.fighters[1].position.z - match.fighters[0].position.z;
    const upTangent = { x: facingZ, z: -facingX };
    const downTangent = { x: -facingZ, z: facingX };

    const up = stepMatch(match, { ...emptyInputFrame(), sidestepUp: true }, emptyInputFrame(), 1 / 60);
    const upDelta = {
      x: up.fighters[0].position.x - match.fighters[0].position.x,
      z: up.fighters[0].position.z - match.fighters[0].position.z
    };
    expect(upDelta.x * upTangent.x + upDelta.z * upTangent.z).toBeGreaterThan(0);

    const down = stepMatch(match, { ...emptyInputFrame(), sidestepDown: true }, emptyInputFrame(), 1 / 60);
    const downDelta = {
      x: down.fighters[0].position.x - match.fighters[0].position.x,
      z: down.fighters[0].position.z - match.fighters[0].position.z
    };
    expect(downDelta.x * downTangent.x + downDelta.z * downTangent.z).toBeGreaterThan(0);
  });

  it('does not swap control sides from repeated up-up orbit sidesteps', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const startingControlSide = match.fighters[0].controlSideSign;
    let previousAngle = fighterOrbitAngle(match, 0);
    let orbitSteps = 0;

    for (let tap = 0; tap < 72; tap += 1) {
      match = stepMatch(match, { ...emptyInputFrame(), sidestepUp: true }, emptyInputFrame(), 1 / 60);
      expect(match.fighters[0].controlSideSign).toBe(startingControlSide);
      for (let frame = 0; frame < 12; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        expect(match.fighters[0].controlSideSign).toBe(startingControlSide);
        const nextAngle = fighterOrbitAngle(match, 0);
        if (Math.abs(unwrappedAngleDelta(nextAngle, previousAngle)) > 0.0001) orbitSteps += 1;
        previousAngle = nextAngle;
      }
    }

    expect(orbitSteps).toBeGreaterThan(360);
  });

  it('keeps real keyboard up-up spam from flipping the control reference', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const input = emptyInputFrame();
    const verticalState = createVerticalTapState();
    const startingControlSide = match.fighters[0].controlSideSign;
    let now = 100;

    const readFrame = () => {
      prepareVerticalTapForRead(input, verticalState, 'keyboard', now);
      expect(input.sidestepDown).toBe(false);
      expect(input.sidewalkDown).toBe(false);
      match = stepMatch(match, { ...input }, emptyInputFrame(), 1 / 60);
      expect(match.fighters[0].controlSideSign).toBe(startingControlSide);
      consumeVerticalTapAfterRead(input, verticalState, 'keyboard');
      now += 1000 / 60;
    };

    for (let tap = 0; tap < 96; tap += 1) {
      applyVerticalTap(input, verticalState, 'up', true, 'keyboard', now);
      now += 24;
      applyVerticalTap(input, verticalState, 'up', false, 'keyboard', now);
      now += 46;
      applyVerticalTap(input, verticalState, 'up', true, 'keyboard', now);
      readFrame();
      expect(match.fighters[0].laneOrbitControlLocked).toBe(true);
      readFrame();
      applyVerticalTap(input, verticalState, 'up', false, 'keyboard', now);
      for (let frame = 0; frame < 5; frame += 1) readFrame();
    }
  });

  it('keeps sidestep-orbit side locks through sidestep-caused side crossings', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const startingControlSide = match.fighters[0].controlSideSign;

    for (let tap = 0; tap < 84; tap += 1) {
      match = stepMatch(match, { ...emptyInputFrame(), sidestepUp: true }, emptyInputFrame(), 1 / 60);
      for (let frame = 0; frame < 11; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
    }

    match.fighters[0].position.x = 1.3;
    match.fighters[1].position.x = -1.3;
    match.fighters[0].sidestepTimer = 0;
    match.fighters[0].sidestepDirection = 0;
    match.fighters[0].sidestepRepeatGraceFrames = 0;
    expect(match.fighters[0].laneOrbitControlLocked).toBe(true);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].controlSideSign).toBe(startingControlSide);

    const forward = emptyInputFrame();
    forward.right = true;
    match = stepMatch(match, forward, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].controlSideSign).toBe(startingControlSide);
    expect(match.fighters[0].laneOrbitControlLocked).toBe(true);
  });

  it('releases the sidestep side lock when horizontal movement actually crosses sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const startingControlSide = match.fighters[0].controlSideSign;
    match.fighters[0].position.x = -0.02;
    match.fighters[1].position.x = 0.02;
    match.fighters[0].laneOrbitControlLocked = true;
    match.fighters[0].sidestepTimer = 0;
    match.fighters[0].sidestepDirection = 0;
    match.fighters[0].sidestepRepeatGraceFrames = 0;

    const forward = emptyInputFrame();
    forward.right = true;
    match = stepMatch(match, forward, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].laneOrbitControlLocked).toBe(false);
    expect(match.fighters[0].controlSideSign).toBe(-startingControlSide);
  });

  it('immediately flips horizontal controls while jumping over the opponent head', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 0.72;
    match.fighters[0].position.y = 1.05;
    match.fighters[0].velocityY = 0;
    match.fighters[0].state = 'jump';
    match.fighters[1].position.x = 0;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].facing).toBe(-1);
    expect(match.fighters[0].controlSideSign).toBe(-1);

    const right = emptyInputFrame();
    right.right = true;
    const rightResult = stepMatch(match, right, emptyInputFrame(), 1 / 60);
    expect(rightResult.fighters[0].walkDirection).toBe(-1);
    expect(rightResult.fighters[0].controlSideSign).toBe(-1);

    const left = emptyInputFrame();
    left.left = true;
    const leftResult = stepMatch(match, left, emptyInputFrame(), 1 / 60);
    expect(leftResult.fighters[0].walkDirection).toBe(1);
    expect(leftResult.fighters[0].controlSideSign).toBe(-1);
  });

  it('immediately flips horizontal controls after a head-landing side swap', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 0.04;
    match.fighters[0].position.y = 0;
    match.fighters[0].velocityY = 0;
    match.fighters[1].position.x = 0;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].controlSideSign).toBe(-1);

    const right = emptyInputFrame();
    right.right = true;
    const rightResult = stepMatch(match, right, emptyInputFrame(), 1 / 60);
    expect(rightResult.fighters[0].walkDirection).toBe(-1);

    const left = emptyInputFrame();
    left.left = true;
    const leftResult = stepMatch(match, left, emptyInputFrame(), 1 / 60);
    expect(leftResult.fighters[0].walkDirection).toBe(1);
  });

  it('flips horizontal controls after a clear grounded side swap', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 1.1;
    match.fighters[0].position.y = 0;
    match.fighters[0].velocityY = 0;
    match.fighters[1].position.x = 0;
    match.fighters[1].position.y = 0;
    match.fighters[1].velocityY = 0;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].controlSideSign).toBe(-1);

    const left = emptyInputFrame();
    left.left = true;
    const leftResult = stepMatch(match, left, emptyInputFrame(), 1 / 60);
    expect(leftResult.fighters[0].walkDirection).toBe(1);
    expect(leftResult.fighters[0].position.x).toBeLessThan(match.fighters[0].position.x);

    const right = emptyInputFrame();
    right.right = true;
    const rightResult = stepMatch(match, right, emptyInputFrame(), 1 / 60);
    expect(rightResult.fighters[0].walkDirection).toBe(-1);
    expect(rightResult.fighters[0].state).toBe('block');
  });

  it('keeps side-relative horizontal controls after repeated up-up sidesteps', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    for (let tap = 0; tap < 36; tap += 1) {
      const sidestep = emptyInputFrame();
      sidestep.sidestepUp = true;
      match = stepMatch(match, sidestep, emptyInputFrame(), 1 / 60);
      for (let frame = 0; frame < 12; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
    }

    match.fighters[0].position.x = -1.3;
    match.fighters[0].position.z = 0;
    match.fighters[1].position.x = 1.3;
    match.fighters[1].position.z = 0;
    const sameSideForward = emptyInputFrame();
    sameSideForward.right = true;
    const sameSideForwardResult = stepMatch(match, sameSideForward, emptyInputFrame(), 1 / 60);
    expect(sameSideForwardResult.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);

    const sameSideBack = emptyInputFrame();
    sameSideBack.left = true;
    const sameSideBackResult = stepMatch(match, sameSideBack, emptyInputFrame(), 1 / 60);
    expect(sameSideBackResult.fighters[0].state).toBe('block');
    expect(sameSideBackResult.fighters[0].position.x).toBeLessThan(match.fighters[0].position.x);

    match.fighters[0].position.x = 1.3;
    match.fighters[0].position.z = 0;
    match.fighters[1].position.x = -1.3;
    match.fighters[1].position.z = 0;
    const crossedStillOriginalForward = emptyInputFrame();
    crossedStillOriginalForward.right = true;
    const crossedForwardResult = stepMatch(match, crossedStillOriginalForward, emptyInputFrame(), 1 / 60);
    expect(crossedForwardResult.fighters[0].position.x).toBeLessThan(match.fighters[0].position.x);

    const crossedStillOriginalBack = emptyInputFrame();
    crossedStillOriginalBack.left = true;
    const crossedBackResult = stepMatch(match, crossedStillOriginalBack, emptyInputFrame(), 1 / 60);
    expect(crossedBackResult.fighters[0].state).toBe('block');
    expect(crossedBackResult.fighters[0].position.x).toBeGreaterThan(match.fighters[0].position.x);

    let p2Match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    p2Match.phase = 'fighting';
    p2Match.countdown = 0;
    const p2Forward = emptyInputFrame();
    p2Forward.left = true;
    const p2ForwardResult = stepMatch(p2Match, emptyInputFrame(), p2Forward, 1 / 60);
    expect(p2ForwardResult.fighters[1].position.x).toBeLessThan(p2Match.fighters[1].position.x);

    const p2Back = emptyInputFrame();
    p2Back.right = true;
    const p2BackResult = stepMatch(p2Match, emptyInputFrame(), p2Back, 1 / 60);
    expect(p2BackResult.fighters[1].state).toBe('block');
    expect(p2BackResult.fighters[1].position.x).toBeGreaterThan(p2Match.fighters[1].position.x);
  });

  it('treats simultaneous left and right as neutral movement', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const input = emptyInputFrame();
    input.left = true;
    input.right = true;

    const next = stepMatch(match, input, emptyInputFrame(), 1 / 60);

    expect(next.fighters[0].state).toBe('idle');
    expect(next.fighters[0].position.x).toBeCloseTo(match.fighters[0].position.x, 5);
  });

  it('keeps full-crouch forward and back inputs stationary', () => {
    const match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const crouchForward = emptyInputFrame();
    crouchForward.down = true;
    crouchForward.right = true;
    const forwardResult = stepMatch(match, crouchForward, emptyInputFrame(), 1 / 60);
    expect(forwardResult.fighters[0].state).toBe('crouch');
    expect(forwardResult.fighters[0].position.x).toBeCloseTo(match.fighters[0].position.x, 5);

    const crouchBack = emptyInputFrame();
    crouchBack.down = true;
    crouchBack.left = true;
    const backResult = stepMatch(match, crouchBack, emptyInputFrame(), 1 / 60);
    expect(backResult.fighters[0].state).toBe('crouchBlock');
    expect(backResult.fighters[0].position.x).toBeCloseTo(match.fighters[0].position.x, 5);
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
    const beforeWalk = match.fighters[0].position.z;
    match = stepMatch(match, laneWalk, emptyInputFrame(), 10 / 60);
    expect(match.fighters[0].position.z).toBeGreaterThan(beforeWalk + 0.35);
  });

  it('boosts forward movement on double-tap forward and keeps normal forward movement afterward', () => {
    const dashCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      stats: { ...starterCharacters[0].stats, speed: 4, dashDistance: 1.05 }
    };
    let dashMatch = createMatch(dashCharacter, starterCharacters[1], stages[0], 'local2p');
    dashMatch.phase = 'fighting';
    dashMatch.countdown = 0;
    const holdForward = { ...emptyInputFrame(), right: true };
    const dashForward = { ...holdForward, dashForward: true };

    const walkStartX = dashMatch.fighters[0].position.x;
    const walkMatch = stepMatch(dashMatch, holdForward, emptyInputFrame(), 1 / 60);
    const walkDelta = walkMatch.fighters[0].position.x - walkStartX;

    dashMatch = stepMatch(dashMatch, dashForward, emptyInputFrame(), 1 / 60);
    const dashDelta = dashMatch.fighters[0].position.x - walkStartX;

    expect(dashDelta).toBeGreaterThan(walkDelta + 0.8);
    expect(dashMatch.fighters[0].state).toBe('walk');
    expect(dashMatch.fighters[0].dashForwardFrames).toBeGreaterThan(0);
    expect(dashMatch.fighters[0].walkDirection).toBe(1);

    const afterDashX = dashMatch.fighters[0].position.x;
    dashMatch = stepMatch(dashMatch, holdForward, emptyInputFrame(), 1 / 60);
    expect(dashMatch.fighters[0].position.x).toBeGreaterThan(afterDashX);
  });

  it('only applies dash-forward when the double-tapped direction is toward the opponent', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const backDashAttempt = { ...emptyInputFrame(), left: true, dashForward: true };
    const before = match.fighters[0].position.x;

    match = stepMatch(match, backDashAttempt, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].dashForwardFrames).toBe(0);
    expect(match.fighters[0].position.x).toBeLessThan(before);

    let p2Match = createMatch(starterCharacters[0], { ...starterCharacters[1], stats: { ...starterCharacters[1].stats, dashDistance: 0.95 } }, stages[0], 'local2p');
    p2Match.phase = 'fighting';
    p2Match.countdown = 0;
    const p2Before = p2Match.fighters[1].position.x;
    p2Match = stepMatch(p2Match, emptyInputFrame(), { ...emptyInputFrame(), left: true, dashForward: true }, 1 / 60);

    expect(p2Match.fighters[1].position.x).toBeLessThan(p2Before - 0.8);
    expect(p2Match.fighters[1].dashForwardFrames).toBeGreaterThan(0);
    expect(p2Match.fighters[1].walkDirection).toBe(1);

    let crossedMatch = createMatch({ ...starterCharacters[0], stats: { ...starterCharacters[0].stats, dashDistance: 0.95 } }, starterCharacters[1], stages[0], 'local2p');
    crossedMatch.phase = 'fighting';
    crossedMatch.countdown = 0;
    crossedMatch.fighters[0].position.x = 1.3;
    crossedMatch.fighters[1].position.x = -1.3;
    crossedMatch = stepMatch(crossedMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    const crossedBefore = crossedMatch.fighters[0].position.x;
    crossedMatch = stepMatch(crossedMatch, { ...emptyInputFrame(), left: true, dashForward: true }, emptyInputFrame(), 1 / 60);

    expect(crossedMatch.fighters[0].position.x).toBeLessThan(crossedBefore - 0.8);
    expect(crossedMatch.fighters[0].dashForwardFrames).toBeGreaterThan(0);
    expect(crossedMatch.fighters[0].walkDirection).toBe(1);
  });

  it('does not turn held physical back into forward dash after the opponent changes sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const heldBack = { ...emptyInputFrame(), left: true };
    match = stepMatch(match, heldBack, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].horizontalHoldIntent).toBe('back');

    match.fighters[1].position.x = match.fighters[0].position.x - 1.2;
    const before = match.fighters[0].position.x;
    const jitterBack = { ...emptyInputFrame(), left: true } as InputFrameWithMetadata;
    jitterBack.__horizontalDashDirection = 'left';

    match = stepMatch(match, jitterBack, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].dashForwardFrames).toBe(0);
    expect(match.fighters[0].horizontalHoldIntent).toBe('back');
    expect(match.fighters[0].position.x).toBeGreaterThanOrEqual(before);
  });

  it('allows a fresh physical forward press after releasing held back', () => {
    let match = createMatch({ ...starterCharacters[0], stats: { ...starterCharacters[0].stats, dashDistance: 0.95 } }, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    match = stepMatch(match, { ...emptyInputFrame(), left: true }, emptyInputFrame(), 1 / 60);
    match.fighters[1].position.x = match.fighters[0].position.x - 1.2;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].horizontalHoldIntent).toBe(null);

    const before = match.fighters[0].position.x;
    const freshForward = { ...emptyInputFrame(), left: true } as InputFrameWithMetadata;
    freshForward.__horizontalDashDirection = 'left';
    match = stepMatch(match, freshForward, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].dashForwardFrames).toBeGreaterThan(0);
    expect(match.fighters[0].position.x).toBeLessThan(before - 0.5);
    expect(match.fighters[0].horizontalHoldIntent).toBe('forward');
  });

  it('keeps both players from crossing through the opponent while holding back', () => {
    let p1Match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    p1Match.phase = 'fighting';
    p1Match.countdown = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      p1Match = stepMatch(p1Match, { ...emptyInputFrame(), left: true }, emptyInputFrame(), 1 / 60);
      expect(p1Match.fighters[0].position.x).toBeLessThan(p1Match.fighters[1].position.x);
      expect(p1Match.fighters[0].dashForwardFrames).toBe(0);
    }

    let p2Match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    p2Match.phase = 'fighting';
    p2Match.countdown = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      p2Match = stepMatch(p2Match, emptyInputFrame(), { ...emptyInputFrame(), right: true }, 1 / 60);
      expect(p2Match.fighters[1].position.x).toBeGreaterThan(p2Match.fighters[0].position.x);
      expect(p2Match.fighters[1].dashForwardFrames).toBe(0);
    }
  });

  it('keeps continuous lane walking on the same stage lane after side crossover', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const laneWalk = emptyInputFrame();
    laneWalk.sidewalkDown = true;
    let previousAngle = fighterOrbitAngle(match, 0);
    let orbitDirection: -1 | 1 | null = null;
    let originalDirectionSteps = 0;
    let flippedDirectionSteps = 0;

    for (let i = 0; i < 120; i += 1) {
      match = stepMatch(match, laneWalk, emptyInputFrame(), 1 / 60);
      const nextAngle = fighterOrbitAngle(match, 0);
      const delta = unwrappedAngleDelta(nextAngle, previousAngle);
      if (Math.abs(delta) > 0.0001) {
        const sign = delta > 0 ? 1 : -1;
        orbitDirection ??= sign;
        if (sign === orbitDirection) originalDirectionSteps += 1;
        else flippedDirectionSteps += 1;
      }
      previousAngle = nextAngle;
    }

    expect(originalDirectionSteps).toBeGreaterThan(60);
    expect(flippedDirectionSteps).toBe(0);
  });

  it('keeps up/down orbit direction control-side relative at the old arena edge', () => {
    let downMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    downMatch.phase = 'fighting';
    downMatch.countdown = 0;
    downMatch.fighters[0].position.x = 18;
    downMatch.fighters[0].position.z = -2;
    downMatch.fighters[1].position.x = 16;
    downMatch.fighters[1].position.z = 0;
    const down = emptyInputFrame();
    down.sidewalkDown = true;
    const downZBefore = downMatch.fighters[0].position.z;
    downMatch = stepMatch(downMatch, down, emptyInputFrame(), 12 / 60);
    expect(downMatch.fighters[0].position.z).toBeGreaterThan(downZBefore);

    let upMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    upMatch.phase = 'fighting';
    upMatch.countdown = 0;
    upMatch.fighters[0].position.x = 18;
    upMatch.fighters[0].position.z = 2;
    upMatch.fighters[1].position.x = 16;
    upMatch.fighters[1].position.z = 0;
    const up = emptyInputFrame();
    up.sidewalkUp = true;
    const upZBefore = upMatch.fighters[0].position.z;
    upMatch = stepMatch(upMatch, up, emptyInputFrame(), 12 / 60);
    expect(upMatch.fighters[0].position.z).toBeLessThan(upZBefore);
  });

  it('keeps repeated down-down taps moving down lane after crossing sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    let previousAngle = fighterOrbitAngle(match, 0);
    let orbitDirection: -1 | 1 | null = null;
    let originalDirectionSteps = 0;
    let flippedDirectionSteps = 0;

    for (let tap = 0; tap < 46; tap += 1) {
      const input = emptyInputFrame();
      input.sidestepDown = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      for (let frame = 0; frame < 12; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        const nextAngle = fighterOrbitAngle(match, 0);
        const delta = unwrappedAngleDelta(nextAngle, previousAngle);
        if (Math.abs(delta) > 0.0001) {
          const sign = delta > 0 ? 1 : -1;
          orbitDirection ??= sign;
          if (sign === orbitDirection) originalDirectionSteps += 1;
          else flippedDirectionSteps += 1;
        }
        previousAngle = nextAngle;
      }
    }

    expect(originalDirectionSteps).toBeGreaterThan(180);
    expect(flippedDirectionSteps).toBe(0);
  });

  it('keeps repeated up-up orbit direction tied to facing at side crossover', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 18;
    match.fighters[0].position.z = 2;
    match.fighters[1].position.x = 16;
    match.fighters[1].position.z = 0;
    let previousAngle = fighterOrbitAngle(match, 0);
    let orbitDirection: -1 | 1 | null = null;
    let originalDirectionSteps = 0;
    let flippedDirectionSteps = 0;

    for (let tap = 0; tap < 36; tap += 1) {
      const input = emptyInputFrame();
      input.sidestepUp = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      for (let frame = 0; frame < 12; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        const nextAngle = fighterOrbitAngle(match, 0);
        const delta = unwrappedAngleDelta(nextAngle, previousAngle);
        if (Math.abs(delta) > 0.0001) {
          const sign = delta > 0 ? 1 : -1;
          orbitDirection ??= sign;
          if (sign === orbitDirection) originalDirectionSteps += 1;
          else flippedDirectionSteps += 1;
        }
        previousAngle = nextAngle;
      }
    }

    expect(originalDirectionSteps).toBeGreaterThan(120);
    expect(flippedDirectionSteps).toBe(0);
  });

  it('hits a standing defender only when the active hitbox overlaps their hurtbox', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - starterCharacters[0].moves[0].damage);
  });

  it('projects attack hitboxes toward the opponent after a side swap', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 0.45;
    match.fighters[1].position.x = -0.45;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].facing).toBe(-1);
    expect(match.fighters[1].facing).toBe(1);

    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - starterCharacters[0].moves[0].damage);
  });

  it('gives attacks a small universal reach buffer so close-but-not-perfect hits connect', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.62;
    match.fighters[1].position.x = 0.62;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[1].hp).toBeLessThan(starterCharacters[1].stats.health);
  });

  it('lets a globally wider attacker connect from farther away', () => {
    const wideAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      modelScale: { width: 1.8, height: starterCharacters[0].scale }
    };
    let match = createMatch(wideAttacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - wideAttacker.moves[0].damage);
  });

  it('makes a globally narrower attacker miss where the default size connects', () => {
    const narrowAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      modelScale: { width: 0.45, height: starterCharacters[0].scale }
    };
    let match = createMatch(narrowAttacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].hitConnected).toBe(false);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
  });

  it('uses global defender height when checking vertical hurtbox overlap', () => {
    const highJabAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 1,
              activeFrames: 12,
              recoveryFrames: 8,
              range: 2,
              hitbox: { offset: [0, 1.25, 0.62], size: [0.62, 0.2, 0.58] }
            }
          : move
      )
    };
    const shortDefender: CharacterDefinition = {
      ...starterCharacters[1],
      modelScale: { width: starterCharacters[1].scale, height: 0.45 }
    };
    const tallDefender: CharacterDefinition = {
      ...starterCharacters[1],
      modelScale: { width: starterCharacters[1].scale, height: 1.08 }
    };

    const runHighJab = (defender: CharacterDefinition) => {
      let match = createMatch(highJabAttacker, defender, stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      const attack = emptyInputFrame();
      attack.jab = true;
      for (let i = 0; i < 8; i += 1) {
        match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
        attack.jab = false;
      }
      return match;
    };

    expect(runHighJab(shortDefender).fighters[0].hitConnected).toBe(false);
    expect(runHighJab(tallDefender).fighters[0].hitConnected).toBe(true);
  });

  it('lets an active move effect hitbox connect beyond the base move range', () => {
    const effectAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      effects: [{
        id: 'wide-aura',
        name: 'Wide Aura',
        frames: [],
        fps: 12,
        loop: false,
        billboard: true,
        blendMode: 'additive',
        anchor: 'body',
        defaultTransform: {
          position: [2.25, 0.05, 0],
          scale: [1.7, 1.7, 1.7],
          rotation: [0, 0, 0],
          opacity: 1,
          color: '#ffffff'
        }
      }],
      moveEffects: {
        jableft: [{
          id: 'wide-aura-hit',
          effectId: 'wide-aura',
          startFrame: 0,
          endFrame: 30,
          layer: 0,
          mirrorWithFacing: true,
          keyframes: []
        }]
      },
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              range: 0.25,
              startupFrames: 1,
              activeFrames: 18,
              recoveryFrames: 12,
              hitbox: { offset: [0, 1.1, 0.25], size: [0.12, 0.12, 0.12] }
            }
          : move
      )
    };
    let match = createMatch(effectAttacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -1.08;
    match.fighters[1].position.x = 1.18;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 8; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - effectAttacker.moves[0].damage);
    expect(match.impactEvents[match.impactEvents.length - 1]?.position[0]).toBeGreaterThan(0.45);
  });

  it('lets crouching defenders duck under high jabs', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'crouch';
    match.fighters[1].wasCrouching = true;
    const attack = emptyInputFrame();
    attack.jab = true;
    const crouch = emptyInputFrame();
    crouch.down = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, crouch, 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
    expect(match.fighters[0].hitConnected).toBe(false);
  });

  it('lets jumping defenders pass above low attacks', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.y = 1.08;
    match.fighters[1].velocityY = 0.1;
    match.fighters[1].state = 'jump';
    const lowKick = emptyInputFrame();
    lowKick.down = true;
    lowKick.kick = true;

    for (let i = 0; i < 22; i += 1) {
      match = stepMatch(match, lowKick, emptyInputFrame(), 1 / 60);
      lowKick.kick = false;
      match.fighters[1].position.y = 1.08;
      match.fighters[1].velocityY = 0.1;
      match.fighters[1].state = 'jump';
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
  });

  it('lets sidestepped defenders avoid narrow forward attacks while still inside range', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.z = 0.82;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health);
  });

  it('uses move-specific evasive hurtboxes to make an otherwise valid jab whiff', () => {
    const evasiveDefender: CharacterDefinition = {
      ...starterCharacters[1],
      moves: starterCharacters[1].moves.map((move) =>
        move.id === 'jab'
          ? {
              ...move,
              hurtboxes: [{ offset: [0, 0.42, 0], size: [0.82, 0.72, 0.56] }]
            }
          : move
      )
    };
    let match = createMatch(starterCharacters[0], evasiveDefender, stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = evasiveDefender.moves[0];
    match.fighters[1].actionFramesRemaining = 30;
    match.fighters[1].actionTimer = 30 / 60;
    const attack = emptyInputFrame();
    attack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
      match.fighters[1].state = 'attack';
      match.fighters[1].currentMove = evasiveDefender.moves[0];
      match.fighters[1].actionFramesRemaining = 30;
      match.fighters[1].actionTimer = 30 / 60;
    }

    expect(match.fighters[1].hp).toBe(evasiveDefender.stats.health);
  });

  it('applies block chip instead of full damage', () => {
    const chipCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        jableft: {
          blockDamage: 3
        }
      }
    };
    let match = createMatch(chipCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - 3);
  });

  it('lets mid and low hit properties beat standing block', () => {
    const attackWithLevel = (hitLevel: MoveDefinition['hitLevel']) => {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moveOverrides: {
          ...(starterCharacters[0].moveOverrides ?? {}),
          jableft: {
            damage: 10,
            blockDamage: 1,
            hitLevel
          }
        }
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      const attack = emptyInputFrame();
      attack.jab = true;
      const block = emptyInputFrame();
      block.block = true;
      for (let i = 0; i < 18; i += 1) {
        match = stepMatch(match, attack, block, 1 / 60);
        attack.jab = false;
      }
      return match;
    };

    expect(attackWithLevel('high').fighters[1].hp).toBe(starterCharacters[1].stats.health - 1);
    expect(attackWithLevel('mid').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
    expect(attackWithLevel('low').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
  });

  it('adds crouch block and lets high and mid hit properties beat it', () => {
    const attackCrouchBlockWithLevel = (hitLevel: MoveDefinition['hitLevel']) => {
      const attacker: CharacterDefinition = {
        ...starterCharacters[0],
        moveOverrides: {
          ...(starterCharacters[0].moveOverrides ?? {}),
          jableft: {
            damage: 10,
            blockDamage: 1,
            hitLevel
          }
        }
      };
      let match = createMatch(attacker, starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      const attack = emptyInputFrame();
      attack.jab = true;
      const crouchBlock = emptyInputFrame();
      crouchBlock.block = true;
      crouchBlock.down = true;
      for (let i = 0; i < 18; i += 1) {
        match = stepMatch(match, attack, crouchBlock, 1 / 60);
        attack.jab = false;
      }
      return match;
    };

    expect(attackCrouchBlockWithLevel('low').fighters[1].hp).toBe(starterCharacters[1].stats.health - 1);
    expect(attackCrouchBlockWithLevel('high').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
    expect(attackCrouchBlockWithLevel('mid').fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
  });

  it('only resolves a hit during active frames', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

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

  it('registers hits when a simulation step crosses the active window', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const sweptMove: MoveDefinition = {
      ...starterCharacters[0].moves[0],
      startupFrames: 4,
      activeFrames: 2,
      recoveryFrames: 12,
      range: 2.5
    };
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = sweptMove;
    match.fighters[0].moveFrame = 3;
    match.fighters[0].actionFramesRemaining = 13;
    match.fighters[0].actionTimer = 13 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 3 / 60);

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - sweptMove.damage);
    expect(match.impactEvents).toHaveLength(1);
  });

  it('does not let knocked down fighters get hit', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
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

  it('keeps knocked down fighters grounded until they choose a getup option', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].state = 'knockdown';
    match.fighters[1].actionFramesRemaining = 2;
    match.fighters[1].actionTimer = 2 / 60;
    match.fighters[1].stunFramesRemaining = 2;
    match.fighters[1].stunTimer = 2 / 60;

    for (let i = 0; i < 4; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].state).toBe('knockdown');
    expect(match.fighters[1].getupStarted).toBe(false);

    const zBefore = match.fighters[1].position.z;
    const hpBefore = match.fighters[1].hp;
    const roll = emptyInputFrame();
    roll.sidewalkUp = true;

    match = stepMatch(match, emptyInputFrame(), roll, 1 / 60);
    expect(match.fighters[1].getupStarted).toBe(true);
    expect(match.fighters[1].state).toBe('getup');
    expect(match.fighters[1].getupAction).toBe('rollUp');
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
    expect(match.fighters[1].position.z).toBeGreaterThan(zBefore);
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
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

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

  it('honors authored positive block advantage without forcing blocker plus frames', () => {
    const plusAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        jab: {
          startupFrames: 1,
          activeFrames: 1,
          recoveryFrames: 20,
          onBlockFrames: 4
        }
      }
    };
    let match = createMatch(plusAttacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 5; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].blockstunFramesRemaining - match.fighters[0].actionFramesRemaining).toBe(4);
    expect(match.fighters[1].blockPunishWindowFrames).toBe(0);
  });

  it('honors authored neutral block advantage', () => {
    const neutralAttacker: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        jab: {
          startupFrames: 1,
          activeFrames: 1,
          recoveryFrames: 20,
          onBlockFrames: 0
        }
      }
    };
    let match = createMatch(neutralAttacker, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 5; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }

    expect(match.fighters[1].blockstunFramesRemaining).toBe(match.fighters[0].actionFramesRemaining);
    expect(match.fighters[1].blockPunishWindowFrames).toBe(0);
  });

  it('lets CPU punish during its post-block advantage window', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = starterCharacters[0].moves[0];
    match.fighters[0].actionFramesRemaining = 18;
    match.fighters[0].actionTimer = 18 / 60;
    match.fighters[0].moveFrame = starterCharacters[0].moves[0].startupFrames + starterCharacters[0].moves[0].activeFrames + 1;
    match.fighters[0].hitConnected = true;
    match.fighters[1].blockPunishWindowFrames = 12;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('attack');
    expect(match.fighters[1].currentMove?.input).toBe('jab');
  });

  it('keeps max difficulty CPUs imperfect across repeated punish windows', () => {
    let punishStarts = 0;
    const attempts = 48;

    for (let i = 0; i < attempts; i += 1) {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 5);
      match.phase = 'fighting';
      match.countdown = 0;
      match.timer = match.roundTime - i * 0.23;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = starterCharacters[0].moves[0];
      match.fighters[0].actionFramesRemaining = 18;
      match.fighters[0].actionTimer = 18 / 60;
      match.fighters[0].moveFrame = starterCharacters[0].moves[0].startupFrames + starterCharacters[0].moves[0].activeFrames + 1;
      match.fighters[0].hitConnected = true;
      match.fighters[1].blockPunishWindowFrames = 12;

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      if (match.fighters[1].state === 'attack') punishStarts += 1;
    }

    expect(punishStarts).toBeGreaterThan(Math.floor(attempts * 0.55));
    expect(punishStarts).toBeLessThan(attempts);
  });

  it('makes low difficulty CPUs miss more post-block punish windows', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'cpu', 1);
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = starterCharacters[0].moves[0];
    match.fighters[0].actionFramesRemaining = 18;
    match.fighters[0].actionTimer = 18 / 60;
    match.fighters[0].moveFrame = starterCharacters[0].moves[0].startupFrames + starterCharacters[0].moves[0].activeFrames + 1;
    match.fighters[0].hitConnected = true;
    match.fighters[1].blockPunishWindowFrames = 12;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).not.toBe('attack');
    expect(match.fighters[1].currentMove).toBeNull();
  });

  it('blocks while holding side-relative back after physical side crossover', () => {
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

    const crouchBlock = emptyInputFrame();
    crouchBlock.right = true;
    crouchBlock.down = true;
    match = stepMatch(match, crouchBlock, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('crouchBlock');
  });

  it('falls back to a base attack when crouch command moves are not configured', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const crouch = emptyInputFrame();
    crouch.down = true;
    match = stepMatch(match, crouch, emptyInputFrame(), 1 / 60);

    const crouchJab = emptyInputFrame();
    crouchJab.down = true;
    crouchJab.jab = true;
    match = stepMatch(match, crouchJab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].currentMove?.command).toBeUndefined();
  });

  it('starts configured FC attacks while crouching and applies their overrides', () => {
    const crouchCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:FC+1': starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        ...starterCharacters[0].moveOverrides,
        'cmd:FC+1': {
          label: 'Crouch Strike',
          startupFrames: 14,
          activeFrames: 2,
          recoveryFrames: 18,
          damage: 9,
          hitLevel: 'low',
          onBlockFrames: -11,
          onHitFrames: 3,
          onCounterHitFrames: 7
        }
      }
    };
    let match = createMatch(crouchCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const crouchJab = emptyInputFrame();
    crouchJab.down = true;
    crouchJab.jab = true;
    match = stepMatch(match, crouchJab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.command).toBe('FC+1');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:FC+1');
    expect(match.fighters[0].currentMove?.label).toBe('Crouch Strike');
    expect(match.fighters[0].currentMove?.startupFrames).toBe(14);
    expect(match.fighters[0].currentMove?.hitLevel).toBe('low');
  });

  it('starts configured FC attacks from crouch block', () => {
    const crouchCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:FC+1': starterCharacters[0].animationFrames?.jab ?? []
      }
    };
    let match = createMatch(crouchCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const crouchBlockJab = emptyInputFrame();
    crouchBlockJab.down = true;
    crouchBlockJab.block = true;
    crouchBlockJab.jab = true;
    match = stepMatch(match, crouchBlockJab, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:FC+1');
  });

  it('lets moves end directly in held crouch stance', () => {
    const crouchEndCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? { ...move, startupFrames: 1, activeFrames: 1, recoveryFrames: 1, whiffRecoveryFrames: 0, endsInCrouch: true }
          : move
      )
    };
    let match = createMatch(crouchEndCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);

    const heldCrouch = emptyInputFrame();
    heldCrouch.down = true;
    for (let i = 0; i < 30 && match.fighters[0].currentMove; i += 1) {
      match = stepMatch(match, heldCrouch, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].forcedCrouchFrames).toBe(0);
  });

  it('shows a forced crouch exit before idle when a crouch-ending move is not held down', () => {
    const crouchEndCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? { ...move, startupFrames: 1, activeFrames: 1, recoveryFrames: 1, whiffRecoveryFrames: 0, endsInCrouch: true }
          : move
      )
    };
    let match = createMatch(crouchEndCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);

    for (let i = 0; i < 30 && match.fighters[0].currentMove; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].state).toBe('crouch');
    expect(match.fighters[0].forcedCrouchFrames).toBeGreaterThan(0);

    for (let i = 0; i < 10; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('idle');
  });

  it('keeps standing attacks and while-standing commands working', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    const standingJab = emptyInputFrame();
    standingJab.jab = true;
    match = stepMatch(match, standingJab, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].currentMove?.command).toBeUndefined();

    match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const crouch = emptyInputFrame();
    crouch.down = true;
    match = stepMatch(match, crouch, emptyInputFrame(), 1 / 60);

    const whileStandingKick = emptyInputFrame();
    whileStandingKick.special = true;
    match = stepMatch(match, whileStandingKick, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:WS+4');
  });

  it('raw base button 1 uses jableft data while keeping neutral combo identity', () => {
    const canonicalCharacter = normalizeCharacter({
      ...starterCharacters[0],
      animationFrames: {
        ...(starterCharacters[0].animationFrames ?? {}),
        jableft: starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        'cmd:1': { damage: 3 },
        jab: { damage: 4 },
        jableft: { damage: 8 }
      }
    });
    let match = createMatch(canonicalCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.6;
    match.fighters[1].position.x = 0.6;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.animationKey).toBe('jableft');
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab');
    expect(match.fighters[0].currentMove?.damage).toBe(8);
  });

  it('buffers early player attack inputs during non-cancelable recovery after a confirmed hit', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(1);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab');

    for (let i = 0; i < 20; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].hitConfirmed).toBe(true);

    const three = emptyInputFrame();
    three.kick = true;
    match = stepMatch(match, three, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(1);
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].bufferedMoveInput).toBe('kick');
  });

  it('does not buffer early attack inputs if no chain window opens', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    const earlyKick = emptyInputFrame();
    earlyKick.kick = true;
    match = stepMatch(match, earlyKick, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].bufferedMoveInput).toBe('kick');

    for (let i = 0; i < 20; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].bufferedMoveInput).toBeNull();
    expect(match.fighters[0].currentMove?.input).toBe('jab');
  });

  it('starts a buffered follow-up after non-cancelable recovery when hit advantage remains', () => {
    const plusCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 2,
              recoveryFrames: 8,
              onHitFrames: 30,
              range: 3,
              pushback: 0.08,
              launchHeight: undefined,
              knockdown: false
            }
          : move
      )
    };
    let match = createMatch(plusCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 8 && !match.fighters[0].hitConfirmed; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const earlyKick = emptyInputFrame();
    earlyKick.kick = true;
    match = stepMatch(match, earlyKick, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('jab');

    for (let i = 0; i < 20 && match.fighters[0].currentMove?.input !== 'kick'; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].currentMove?.input).toBe('kick');
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
  });

  it('lets a cancelable landed move cancel into a follow-up after active frames', () => {
    const cancelableCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              cancelable: true,
              startupFrames: 3,
              activeFrames: 2,
              recoveryFrames: 18,
              onHitFrames: 28,
              range: 3,
              pushback: 0.08,
              launchHeight: undefined,
              knockdown: false
            }
          : move
      )
    };
    let match = createMatch(cancelableCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 8 && (!match.fighters[0].hitConfirmed || match.fighters[0].moveFrame < 5); i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].actionFramesRemaining).toBeGreaterThan(0);

    const kick = emptyInputFrame();
    kick.kick = true;
    match = stepMatch(match, kick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.input).toBe('kick');
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
  });

  it('does not let cancelable whiffs or blocks cancel early', () => {
    const cancelableCharacter = makeCancelableCharacter(starterCharacters[0], ['jab']);
    let whiff = createMatch(cancelableCharacter, starterCharacters[1], stages[0], 'local2p');
    whiff.phase = 'fighting';
    whiff.countdown = 0;
    whiff.fighters[0].position.x = -5;
    whiff.fighters[1].position.x = 5;

    const jab = emptyInputFrame();
    jab.jab = true;
    whiff = stepMatch(whiff, jab, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 16 && whiff.fighters[0].moveFrame < whiff.fighters[0].currentMove!.startupFrames + whiff.fighters[0].currentMove!.activeFrames; i += 1) {
      whiff = stepMatch(whiff, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const whiffKick = emptyInputFrame();
    whiffKick.kick = true;
    whiff = stepMatch(whiff, whiffKick, emptyInputFrame(), 1 / 60);
    expect(whiff.fighters[0].currentMove?.input).toBe('jab');
    expect(whiff.fighters[0].comboStep).toBe(1);

    let blocked = createMatch(cancelableCharacter, starterCharacters[1], stages[0], 'local2p');
    blocked.phase = 'fighting';
    blocked.countdown = 0;
    blocked.fighters[0].position.x = -0.45;
    blocked.fighters[1].position.x = 0.45;
    const blockInput = emptyInputFrame();
    blockInput.block = true;
    const blockJab = emptyInputFrame();
    blockJab.jab = true;
    for (let i = 0; i < 16 && !blocked.fighters[0].hitConnected; i += 1) {
      blocked = stepMatch(blocked, i === 0 ? blockJab : emptyInputFrame(), blockInput, 1 / 60);
    }
    expect(blocked.fighters[0].hitConfirmed).toBe(false);
    const blockKick = emptyInputFrame();
    blockKick.kick = true;
    blocked = stepMatch(blocked, blockKick, blockInput, 1 / 60);
    expect(blocked.fighters[0].currentMove?.input).toBe('jab');
    expect(blocked.fighters[0].comboStep).toBe(1);
  });

  it('allows a four-hit player string when frame data keeps the route valid', () => {
    const frameDataComboCharacter: CharacterDefinition = {
      ...makeCancelableCharacter(starterCharacters[0]),
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        cancelable: true,
        startupFrames: 3,
        activeFrames: 3,
        recoveryFrames: 8,
        onHitFrames: 28,
        onCounterHitFrames: 32,
        range: 3,
        pushback: 0.08,
        launchHeight: undefined,
        knockdown: false
      }))
    };
    let match = createMatch(frameDataComboCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const route: Array<keyof ReturnType<typeof emptyInputFrame>> = ['jab', 'jab', 'kick', 'heavy'];

    route.forEach((button, index) => {
      const input = emptyInputFrame();
      input[button] = true;
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      for (
        let i = 0;
        i < 54 &&
        (match.fighters[0].comboStep < index + 1 ||
          !match.fighters[0].hitConfirmed ||
          (match.fighters[0].currentMove && match.fighters[0].moveFrame < match.fighters[0].currentMove.startupFrames + match.fighters[0].currentMove.activeFrames));
        i += 1
      ) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
    });

    expect(match.fighters[0].comboStep).toBeGreaterThanOrEqual(4);
    expect(match.fighters[0].comboSequence.slice(0, 4)).toEqual(['jab', 'jab', 'kick', 'heavy']);
  });

  it('ships thirty authored neutral string routes by default', () => {
    expect(getAuthoredNeutralStringRouteCount()).toBe(30);
  });

  it('resolves newly authored neutral string routes with tuned frame data', () => {
    const frameDataComboCharacter: CharacterDefinition = {
      ...makeCancelableCharacter(starterCharacters[0]),
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        cancelable: true,
        startupFrames: 3,
        activeFrames: 3,
        recoveryFrames: 8,
        onHitFrames: 28,
        onCounterHitFrames: 32,
        range: 3,
        pushback: 0.08,
        launchHeight: undefined,
        knockdown: false
      }))
    };
    let match = createMatch(frameDataComboCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const kick = emptyInputFrame();
    kick.kick = true;
    match = stepMatch(match, kick, emptyInputFrame(), 1 / 60);
    for (
      let i = 0;
      i < 20 &&
      (!match.fighters[0].hitConfirmed ||
        (match.fighters[0].currentMove && match.fighters[0].moveFrame < match.fighters[0].currentMove.startupFrames + match.fighters[0].currentMove.activeFrames));
      i += 1
    ) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const special = emptyInputFrame();
    special.special = true;
    match = stepMatch(match, special, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 20 && match.fighters[0].comboStep < 2; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:kick-special');
    expect(match.fighters[0].currentMove?.label).toBe('Toad Sage Mode');
    expect(match.fighters[0].currentMove?.startupFrames).toBe(16);
    expect(match.fighters[0].currentMove?.onBlockFrames).toBe(-7);
  });

  it('allows repeating the same exact landed attack when the move is cancelable', () => {
    let match = createMatch(makeCancelableCharacter(starterCharacters[0], ['jab']), starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 11; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].hitConfirmed).toBe(true);
    expect(match.fighters[0].comboUsedKeys).toContain('neutral:jab');

    const sameOne = emptyInputFrame();
    sameOne.jab = true;
    match = stepMatch(match, sameOne, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:jab-jab');
    expect(match.fighters[0].currentMove?.damage).toBe(8);
    expect(match.fighters[0].currentMove?.onBlockFrames).toBe(-7);
    expect(match.fighters[0].currentMove?.onHitFrames).toBe(4);
    expect(match.fighters[0].currentMove?.hitLevel).toBe('mid');
  });

  it('does not direct-cancel a non-authored same attack while recovery remains', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const kick = emptyInputFrame();
    kick.kick = true;
    match = stepMatch(match, kick, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 18 && !match.fighters[0].hitConfirmed; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].hitConfirmed).toBe(true);
    expect(match.fighters[0].actionFramesRemaining).toBeGreaterThan(0);

    const sameKick = emptyInputFrame();
    sameKick.kick = true;
    match = stepMatch(match, sameKick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.comboStep).toBe(1);
    expect(match.fighters[0].currentMove?.comboKey).toBe('neutral:kick');
    expect(match.fighters[0].bufferedMoveInput).toBe('kick');
  });

  it('allows the same attack again after recovery when hit advantage keeps the defender stuck', () => {
    const plusJabCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'jab'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 2,
              recoveryFrames: 4,
              onHitFrames: 18,
              comboKey: 'neutral:jab'
            }
          : move
      )
    };
    let match = createMatch(plusJabCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 24 && match.fighters[0].actionFramesRemaining > 0; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[0].comboTimer).toBeGreaterThan(0);

    const secondOne = emptyInputFrame();
    secondOne.jab = true;
    match = stepMatch(match, secondOne, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
  });

  it('scales combo damage after the first hit and reports scaled popup totals', () => {
    const scalingCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 3,
        activeFrames: 2,
        recoveryFrames: 4,
        damage: 10,
        blockDamage: 5,
        onHitFrames: 26,
        onCounterHitFrames: 30,
        range: 3,
        pushback: 0.04,
        launchHeight: undefined,
        knockdown: false,
        comboKey: `neutral:${move.input}`,
        hitbox: { offset: [0, 1.1, 0.72], size: [1.5, 1.8, 1.4] }
      }))
    };

    const runRoute = (route: Array<keyof ReturnType<typeof emptyInputFrame>>) => {
      let match = createMatch(scalingCharacter, starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;

      for (const button of route) {
        match = stepUntilFighterActionable(match, 0);
        const input = emptyInputFrame();
        input[button] = true;
        match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
        for (let i = 0; i < 36 && !match.fighters[0].hitConfirmed; i += 1) {
          match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
        }
      }
      return match;
    };

    const varied = runRoute(['jab', 'heavy']);
    const repeated = runRoute(['jab', 'jab']);

    const variedDamage = starterCharacters[1].stats.health - varied.fighters[1].hp;
    const repeatedDamage = starterCharacters[1].stats.health - repeated.fighters[1].hp;
    expect(variedDamage).toBe(18);
    expect(varied.fighters[0].comboDamage).toBe(18);
    expect(varied.combatEvents[varied.combatEvents.length - 1]?.damage).toBe(18);
    expect(varied.impactEvents[varied.impactEvents.length - 1]?.damage).toBe(8);
    expect(repeatedDamage).toBeLessThan(variedDamage);
    expect(repeated.fighters[0].comboDamage).toBe(repeatedDamage);
  });

  it('keeps block chip unscaled', () => {
    const chipCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {
        ...(starterCharacters[0].moveOverrides ?? {}),
        jableft: {
          blockDamage: 5
        }
      }
    };
    let match = createMatch(chipCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    const guard = emptyInputFrame();
    guard.block = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, attack, guard, 1 / 60);
      attack.jab = false;
    }
    for (let i = 0; i < 4 && match.impactEvents.length === 0; i += 1) {
      match = stepMatch(match, emptyInputFrame(), guard, 1 / 60);
    }

    expect(starterCharacters[1].stats.health - match.fighters[1].hp).toBe(5);
    expect(match.impactEvents[match.impactEvents.length - 1]?.damage).toBe(5);
  });

  it('lets repeated same-button links happen only after recovery and makes them less plus', () => {
    const plusKickCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) =>
        move.input === 'kick'
          ? {
              ...move,
              startupFrames: 3,
              activeFrames: 2,
              recoveryFrames: 4,
              onHitFrames: 25,
              onCounterHitFrames: 28,
              comboKey: 'neutral:kick'
            }
          : move
      )
    };
    let match = createMatch(plusKickCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const kick = emptyInputFrame();
    kick.kick = true;
    match = stepMatch(match, kick, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 20 && match.fighters[0].actionFramesRemaining > 0; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);

    const secondKick = emptyInputFrame();
    secondKick.kick = true;
    match = stepMatch(match, secondKick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.input).toBe('kick');
    expect(match.fighters[0].currentMove?.recoveryFrames).toBeGreaterThan(plusKickCharacter.moves[1].recoveryFrames);
    expect(match.fighters[0].currentMove?.onHitFrames).toBeLessThan(plusKickCharacter.moves[1].onHitFrames);
  });

  it('makes repeated launcher hits lose juggle control instead of looping forever', () => {
    const launcherCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 3,
        activeFrames: 2,
        recoveryFrames: 4,
        damage: 2,
        range: 2.8,
        pushback: 0.05,
        launchHeight: move.input === 'jab' ? 2.2 : undefined,
        knockdown: false,
        onHitFrames: move.input === 'jab' ? 28 : 12,
        onCounterHitFrames: move.input === 'jab' ? 30 : 14,
        onComboHitFrames: move.input === 'jab' ? 8 : 10,
        onJuggleHitFrames: move.input === 'jab' ? 4 : 12,
        comboRepeatPenaltyFrames: move.input === 'jab' ? 6 : 3,
        juggleRepeatPenaltyFrames: move.input === 'jab' ? 14 : 5,
        comboKey: `neutral:${move.input}`,
        hitbox: { offset: [0, 1.8, 0.72], size: [2.1, 4.2, 2.2] }
      }))
    };
    let match = createMatch(launcherCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const jab = emptyInputFrame();
      jab.jab = true;
      match = stepUntilFighterActionable(match, 0);
      match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
      for (let i = 0; i < 28 && (!match.fighters[0].hitConfirmed || match.fighters[0].state === 'attack'); i += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
    }

    for (let i = 0; i < 120; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].comboHits).toBeLessThanOrEqual(2);
    expect(match.fighters[1].state === 'juggle' && match.fighters[1].stunFramesRemaining > 0).toBe(false);
  });

  it('forces player juggle loops to drop when repeating one, two, or three moves', () => {
    const loopCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 2,
        activeFrames: 2,
        recoveryFrames: 3,
        damage: 1,
        range: 8,
        pushback: 0,
        launchHeight: move.input === 'jab' ? 2.4 : undefined,
        knockdown: false,
        onHitFrames: move.input === 'jab' ? 32 : 24,
        onCounterHitFrames: move.input === 'jab' ? 34 : 26,
        onComboHitFrames: 24,
        onJuggleHitFrames: 28,
        comboRepeatPenaltyFrames: 2,
        juggleRepeatPenaltyFrames: 2,
        cancelable: true,
        comboKey: `neutral:${move.input}`,
        hitbox: { offset: [0, 5, 0.72], size: [8, 20, 8] }
      }))
    };

    const runLoopCase = (previousInputs: MoveInput[]) => {
      const repeatedInput = previousInputs[0];
      const repeatedMove = loopCharacter.moves.find((move) => move.input === repeatedInput);
      expect(repeatedMove).toBeDefined();
      let match = createMatch(loopCharacter, starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = {
        ...repeatedMove!,
        startupFrames: 0,
        activeFrames: 3,
        recoveryFrames: 12
      };
      match.fighters[0].actionFramesRemaining = 12;
      match.fighters[0].actionTimer = 12 / 60;
      match.fighters[0].moveFrame = 0;
      match.fighters[0].hitConnected = false;
      match.fighters[0].hitConfirmed = false;
      match.fighters[0].comboTimer = 0.5;
      match.fighters[0].comboStep = previousInputs.length + 1;
      match.fighters[0].comboHits = previousInputs.length;
      match.fighters[0].comboSequence = [...previousInputs, repeatedInput];
      match.fighters[0].comboIdentitySequence = [...previousInputs, repeatedInput].map((inputName) => `neutral:${inputName}`);
      match.fighters[0].comboFamilySequence = [...previousInputs, repeatedInput].map((inputName) => `neutral:${inputName}`);
      match.fighters[0].comboVisualFamilySequence = [...previousInputs, repeatedInput].map((inputName) => visualFamilyByInput[inputName]);
      match.fighters[1].state = 'juggle';
      match.fighters[1].position.y = 1.25;
      match.fighters[1].velocityY = 0.1;
      match.fighters[1].stunFramesRemaining = 120;
      match.fighters[1].actionFramesRemaining = 120;
      match.fighters[1].stunTimer = 2;
      match.fighters[1].actionTimer = 2;
      const hpBeforeRepeat = match.fighters[1].hp;

      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      expect(match.fighters[0].hitConnected).toBe(true);
      expect(match.fighters[0].hitConfirmed).toBe(true);
      expect(match.fighters[0].comboHits).toBe(previousInputs.length + 1);
      expect(match.fighters[1].hp).toBeLessThan(hpBeforeRepeat);
      expect(match.fighters[1].state).toBe('knockdown');
      expect(match.impactEvents).toHaveLength(1);
      expect(match.impactEvents[0]).toMatchObject({ kind: 'hit', attackerSlot: 1, defenderSlot: 2, juggled: true });
    };

    runLoopCase(['jab']);
    runLoopCase(['jab', 'heavy']);
    runLoopCase(['jab', 'heavy', 'kick']);
  });

  it('keeps launcher into varied juggle followup viable', () => {
    const variedCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 3,
        activeFrames: 2,
        recoveryFrames: 4,
        damage: move.input === 'heavy' ? 6 : 2,
        range: 2.8,
        pushback: 0.05,
        launchHeight: move.input === 'jab' ? 2.2 : undefined,
        knockdown: false,
        onHitFrames: move.input === 'jab' ? 28 : 16,
        onCounterHitFrames: move.input === 'jab' ? 30 : 18,
        onComboHitFrames: move.input === 'jab' ? 8 : 12,
        onJuggleHitFrames: move.input === 'heavy' ? 18 : 4,
        comboRepeatPenaltyFrames: 4,
        juggleRepeatPenaltyFrames: move.input === 'heavy' ? 4 : 14,
        comboKey: `neutral:${move.input}`,
        hitbox: { offset: [0, 1.8, 0.72], size: [2.1, 4.2, 2.2] }
      }))
    };
    let match = createMatch(variedCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const jab = emptyInputFrame();
    jab.jab = true;
    match = stepMatch(match, jab, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 28 && (!match.fighters[0].hitConfirmed || match.fighters[0].state === 'attack'); i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    match = stepUntilFighterActionable(match, 0);

    const heavy = emptyInputFrame();
    heavy.heavy = true;
    match = stepMatch(match, heavy, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 28 && match.fighters[0].comboHits < 2; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].comboHits).toBeGreaterThanOrEqual(2);
    expect(match.fighters[1].state).toBe('juggle');
  });

  it('lets a varied four-move low-damage juggle route stay viable', () => {
    const longRouteCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      moveOverrides: {},
      moves: starterCharacters[0].moves.map((move) => ({
        ...move,
        startupFrames: 2,
        activeFrames: 2,
        recoveryFrames: 2,
        damage: 1,
        range: 8,
        pushback: 0,
        launchHeight: move.input === 'jab' ? 2.4 : undefined,
        knockdown: false,
        onHitFrames: move.input === 'jab' ? 32 : 24,
        onCounterHitFrames: move.input === 'jab' ? 34 : 26,
        onComboHitFrames: 24,
        onJuggleHitFrames: 24,
        comboRepeatPenaltyFrames: move.input === 'jab' ? 8 : 2,
        juggleRepeatPenaltyFrames: 2,
        cancelable: true,
        comboKey: `neutral:${move.input}`,
        hitbox: { offset: [0, 5, 0.72], size: [8, 20, 8] }
      }))
    };
    let match = createMatch(longRouteCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const sequence: MoveInput[] = ['jab'];
    const filler: MoveInput[] = ['heavy', 'kick', 'special', 'jab'];
    while (sequence.length < 12) sequence.push(filler[(sequence.length - 1) % filler.length]);

    for (const [index, inputName] of sequence.entries()) {
      const input = emptyInputFrame();
      input[inputName] = true;
      for (let frame = 0; frame < 12 && match.fighters[0].currentMove && (!match.fighters[0].hitConfirmed || match.fighters[0].moveFrame < match.fighters[0].currentMove.startupFrames + match.fighters[0].currentMove.activeFrames); frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
      if (index === 0) match = stepUntilFighterActionable(match, 0);
      match = stepMatch(match, input, emptyInputFrame(), 1 / 60);
      for (let frame = 0; frame < 36 && match.fighters[0].comboHits < index + 1; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }
      expect(match.fighters[0].comboHits, `hit ${index + 1}`).toBeGreaterThanOrEqual(index + 1);
    }

    expect(match.fighters[0].comboHits).toBeGreaterThanOrEqual(12);
    expect(match.fighters[0].comboStep).toBeLessThanOrEqual(30);
  });

  it('charges ki while holding the charge input in neutral', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const charge = emptyInputFrame();
    charge.charge = true;

    for (let i = 0; i < 60; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].ki).toBeGreaterThan(15);
    expect(match.fighters[0].ki).toBeLessThan(28);
    expect(match.fighters[0].state).toBe('chargeKi');
    expect(match.fighters[0].chargePhase).toBe('hold');
  });

  it('spawns Naruto shadow clone after charging past half ki', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 50;
    const charge = emptyInputFrame();
    charge.charge = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].shadowClone?.phase).toBe('active');
    expect(match.fighters[0].shadowClone?.state).toBe('chargeKi');
    expect(match.fighters[1].shadowClone).toBeNull();
  });

  it('spawns Naruto shadow clone on the side-relative lane after crossing sides', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = 1.3;
    match.fighters[1].position.x = -1.3;
    match.fighters[0].ki = 50;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    const charge = emptyInputFrame();
    charge.charge = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].facing).toBe(-1);
    expect(match.fighters[0].shadowClone?.phase).toBe('active');
    expect(match.fighters[0].shadowClone?.position.z).toBeLessThan(match.fighters[0].position.z);
  });

  it('mirrors Naruto passive movement states with the spawned shadow clone', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 60;
    const charge = emptyInputFrame();
    charge.charge = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    for (let i = 0; i < 48 && match.fighters[0].state !== 'idle'; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].shadowClone?.state).toBe('idle');

    const walkForward = emptyInputFrame();
    walkForward.right = true;
    match = stepMatch(match, walkForward, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('walk');
    expect(match.fighters[0].shadowClone?.state).toBe('walk');

    const blockBack = emptyInputFrame();
    blockBack.left = true;
    match = stepMatch(match, blockBack, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('block');
    expect(match.fighters[0].shadowClone?.state).toBe('block');
  });

  it('mirrors Naruto next attack once with the spawned shadow clone', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 60;
    const charge = emptyInputFrame();
    charge.charge = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    const burst = emptyInputFrame();
    burst.charge = true;
    burst.jab = true;
    match = stepMatch(match, burst, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].shadowClone?.state).toBe('attack');
    expect(match.fighters[0].shadowClone?.currentMove?.input).toBe('jab');
    expect(match.fighters[0].shadowClone?.attackConsumed).toBe(true);

    for (let i = 0; i < 70; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].shadowClone).toBeNull();
  });

  it('starts a round finisher when a shadow clone hit is lethal', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    const sourceMove: MoveDefinition = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 8,
      recoveryFrames: 12,
      damage: 9,
      range: 2.5,
      hitbox: {
        offset: [0, 1.05, 0.7],
        size: [1, 1.2, 1.5]
      }
    };
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.75;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].hp = 1;
    match.fighters[0].shadowClone = {
      phase: 'active',
      position: { x: -0.35, y: 0, z: 0 },
      velocityY: 0,
      facing: 1,
      facingYaw: Math.PI / 2,
      state: 'attack',
      currentMove: sourceMove,
      moveInstanceId: 2,
      moveFrame: 1,
      actionFramesRemaining: 10,
      hitConnected: false,
      attackConsumed: true,
      vanishOnLanding: false,
      visualHitstop: { framesRemaining: 0, animationKey: null, progress: 0 },
      spawnSmokeFrames: 0,
      vanishSmokeFrames: 0
    };

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.phase).toBe('roundFinisher');
    expect(match.message).toBe('');
    expect(match.roundFinisher?.attackerSlot).toBe(1);
    expect(match.roundFinisher?.defenderSlot).toBe(2);
    expect(match.fighters[0].shadowClone?.visualHitstop).toMatchObject({ framesRemaining: 3, animationKey: sourceMove.animationKey ?? sourceMove.input });
    expect(match.fighters[1].visualHitstop).toMatchObject({ framesRemaining: 3, animationKey: 'hitLight' });

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.8);
    expect(match.phase).toBe('roundOver');
    expect(match.fighters[0].roundsWon).toBe(1);
  });

  it('keeps a spawned shadow clone offset instead of teleporting it onto Naruto before attack', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 60;
    const charge = emptyInputFrame();
    charge.charge = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }

    for (let i = 0; i < 48 && match.fighters[0].state !== 'idle'; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    const clone = match.fighters[0].shadowClone;
    expect(clone?.phase).toBe('active');
    const initialOffset = {
      x: (clone?.position.x ?? 0) - match.fighters[0].position.x,
      z: (clone?.position.z ?? 0) - match.fighters[0].position.z
    };

    const walk = emptyInputFrame();
    walk.right = true;
    for (let i = 0; i < 10; i += 1) {
      match = stepMatch(match, walk, emptyInputFrame(), 1 / 60);
    }

    const movedClone = match.fighters[0].shadowClone;
    expect((movedClone?.position.x ?? 0) - match.fighters[0].position.x).toBeCloseTo(initialOffset.x, 4);
    expect((movedClone?.position.z ?? 0) - match.fighters[0].position.z).toBeCloseTo(initialOffset.z, 4);

    const attack = emptyInputFrame();
    attack.jab = true;
    match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);

    const attackingClone = match.fighters[0].shadowClone;
    expect(attackingClone?.state).toBe('attack');
    expect((attackingClone?.position.x ?? 0) - match.fighters[0].position.x).toBeCloseTo(initialOffset.x, 4);
    expect((attackingClone?.position.z ?? 0) - match.fighters[0].position.z).toBeCloseTo(initialOffset.z, 4);
  });

  it('cancels charge without recovery before the commit window', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const charge = emptyInputFrame();
    charge.charge = true;

    match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].actionFramesRemaining).toBe(0);
  });

  it('forces recovery when a committed ki charge is released', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    const charge = emptyInputFrame();
    charge.charge = true;

    for (let i = 0; i < 36; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('chargeKi');
    expect(match.fighters[0].chargePhase).toBe('recovery');
    expect(match.fighters[0].actionFramesRemaining).toBeGreaterThan(0);
  });

  it('builds ki when attacks connect during combos', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const one = emptyInputFrame();
    one.jab = true;

    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    one.jab = false;
    for (let i = 0; i < 14; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].ki).toBeGreaterThan(0);
  });

  it('builds a smaller amount of ki for the defender when blocking', () => {
    let hitMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    hitMatch.phase = 'fighting';
    hitMatch.countdown = 0;
    hitMatch.fighters[0].position.x = -0.45;
    hitMatch.fighters[1].position.x = 0.45;
    const hitAttack = emptyInputFrame();
    hitAttack.jab = true;
    hitMatch = stepMatch(hitMatch, hitAttack, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 14; i += 1) {
      hitMatch = stepMatch(hitMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    let blockMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    blockMatch.phase = 'fighting';
    blockMatch.countdown = 0;
    blockMatch.fighters[0].position.x = -0.45;
    blockMatch.fighters[1].position.x = 0.45;
    const blockAttack = emptyInputFrame();
    blockAttack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    blockMatch = stepMatch(blockMatch, blockAttack, block, 1 / 60);
    for (let i = 0; i < 14; i += 1) {
      blockMatch = stepMatch(blockMatch, emptyInputFrame(), block, 1 / 60);
    }

    expect(blockMatch.fighters[1].ki).toBeGreaterThan(0);
    expect(blockMatch.fighters[1].ki).toBeLessThan(hitMatch.fighters[0].ki);
  });

  it('spends ki on charge plus attack for a powered move', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 35;
    const chargedAttack = emptyInputFrame();
    chargedAttack.charge = true;
    chargedAttack.jab = true;

    match = stepMatch(match, chargedAttack, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].ki).toBe(0);
    expect(match.fighters[0].currentMove?.kiBurst).toBe(true);
    expect(match.fighters[0].currentMove?.damage).toBeGreaterThan(starterCharacters[0].moves[0].damage);
  });

  it('does not start a charged command attack without enough ki', () => {
    const commandNaruto: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:O+2': ['/characters/kiro/frames/frame-197.png']
      }
    };
    let match = createMatch(commandNaruto, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 34;
    const chargedAttack = emptyInputFrame();
    chargedAttack.charge = true;
    chargedAttack.heavy = true;

    for (let i = 0; i < 6; i += 1) {
      match = stepMatch(match, chargedAttack, emptyInputFrame(), 1 / 60);
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].ki).toBe(34);
  });

  it('uses per-move ki cost for charged command attacks', () => {
    const customCostNaruto: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:O+2': ['/characters/kiro/frames/frame-197.png']
      },
      moveOverrides: {
        ...starterCharacters[0].moveOverrides,
        'cmd:O+2': {
          ...starterCharacters[0].moveOverrides?.['cmd:O+2'],
          kiCost: 12
        }
      }
    };
    let match = createMatch(customCostNaruto, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 12;
    const chargedAttack = emptyInputFrame();
    chargedAttack.charge = true;
    chargedAttack.heavy = true;

    match = stepMatch(match, chargedAttack, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.kiBurst).toBe(true);
    expect(match.fighters[0].currentMove?.kiCost).toBe(12);
    expect(match.fighters[0].ki).toBe(0);
  });

  it('spends ki for authored moves marked as using ki', () => {
    const kiMoveNaruto: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:3+4': ['/characters/kiro/frames/frame-197.png']
      },
      moveOverrides: {
        ...starterCharacters[0].moveOverrides,
        'cmd:3+4': {
          ...starterCharacters[0].moveOverrides?.['cmd:3+4'],
          usesKi: true,
          kiCost: 35
        }
      }
    };
    let match = createMatch(kiMoveNaruto, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 35;
    const greatRasengan = emptyInputFrame();
    greatRasengan.kick = true;
    greatRasengan.special = true;

    match = stepMatch(match, greatRasengan, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:3+4');
    expect(match.fighters[0].currentMove?.usesKi).toBe(true);
    expect(match.fighters[0].currentMove?.kiCost).toBe(35);
    expect(match.fighters[0].currentMove?.kiBurst).toBeFalsy();
    expect(match.fighters[0].ki).toBe(0);
  });

  it('spends ki and heals the attacker for authored healing moves', () => {
    const healingNaruto: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:3+4': ['/characters/kiro/frames/frame-197.png']
      },
      moveOverrides: {
        ...starterCharacters[0].moveOverrides,
        'cmd:3+4': {
          ...starterCharacters[0].moveOverrides?.['cmd:3+4'],
          usesKi: true,
          kiCost: 20,
          healsHp: true,
          healAmount: 7
        }
      }
    };
    let match = createMatch(healingNaruto, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 60;
    match.fighters[0].ki = 20;
    const healingMove = emptyInputFrame();
    healingMove.kick = true;
    healingMove.special = true;

    match = stepMatch(match, healingMove, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.healsHp).toBe(true);
    expect(match.fighters[0].ki).toBe(0);
    expect(match.fighters[0].hp).toBe(67);
  });

  it('does not start or heal from authored healing moves without enough ki', () => {
    const healingNaruto: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:3+4': ['/characters/kiro/frames/frame-197.png']
      },
      moveOverrides: {
        ...starterCharacters[0].moveOverrides,
        'cmd:3+4': {
          ...starterCharacters[0].moveOverrides?.['cmd:3+4'],
          kiCost: 20,
          healsHp: true,
          healAmount: 7
        }
      }
    };
    let match = createMatch(healingNaruto, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].hp = 60;
    match.fighters[0].ki = 19;
    const healingMove = emptyInputFrame();
    healingMove.kick = true;
    healingMove.special = true;

    match = stepMatch(match, healingMove, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].ki).toBe(19);
    expect(match.fighters[0].hp).toBe(60);
  });

  it('does not start authored ki moves without enough ki', () => {
    const kiMoveNaruto: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:3+4': ['/characters/kiro/frames/frame-197.png']
      },
      moveOverrides: {
        ...starterCharacters[0].moveOverrides,
        'cmd:3+4': {
          ...starterCharacters[0].moveOverrides?.['cmd:3+4'],
          usesKi: true,
          kiCost: 35
        }
      }
    };
    let match = createMatch(kiMoveNaruto, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 34;
    const greatRasengan = emptyInputFrame();
    greatRasengan.kick = true;
    greatRasengan.special = true;

    match = stepMatch(match, greatRasengan, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].ki).toBe(34);
  });

  it('does not regenerate ki when a powered move hits', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 35;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const chargedAttack = emptyInputFrame();
    chargedAttack.charge = true;
    chargedAttack.jab = true;

    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, chargedAttack, emptyInputFrame(), 1 / 60);
      chargedAttack.jab = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[0].ki).toBe(0);
    expect(match.fighters[1].hp).toBeLessThan(starterCharacters[1].stats.health);
  });

  it('can spend ki on a powered move after charge startup has begun', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].ki = 34;
    const charge = emptyInputFrame();
    charge.charge = true;
    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, charge, emptyInputFrame(), 1 / 60);
    }
    const burst = emptyInputFrame();
    burst.charge = true;
    burst.jab = true;

    match = stepMatch(match, burst, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.kiBurst).toBe(true);
    expect(match.fighters[0].chargePhase).toBe('none');
  });

  it('allows the same button again after recovery when it resolves to a different command move', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 11; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    match = stepUntilFighterActionable(match, 0);

    const forwardOne = emptyInputFrame();
    forwardOne.right = true;
    forwardOne.jab = true;
    match = stepMatch(match, forwardOne, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.comboStep).toBe(2);
    expect(match.fighters[0].currentMove?.command).toBe('f+1');
  });

  it('uses configured full-movelist directional routes after confirmed-hit recovery', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;

    const one = emptyInputFrame();
    one.jab = true;
    match = stepMatch(match, one, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 11; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    match = stepUntilFighterActionable(match, 0);

    const downForwardTwo = emptyInputFrame();
    downForwardTwo.down = true;
    downForwardTwo.right = true;
    downForwardTwo.heavy = true;
    match = stepMatch(match, downForwardTwo, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.route).toBe('down-forward');
    expect(match.fighters[0].currentMove?.command).toBe('d/f+2');
    expect(match.fighters[0].currentMove?.comboKey).toContain('heavy');
  });

  it('falls back to a base attack for an unauthored full-movelist command slot', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const missingForwardKick = emptyInputFrame();
    missingForwardKick.right = true;
    missingForwardKick.kick = true;
    match = stepMatch(match, missingForwardKick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].currentMove?.input).toBe('kick');
    expect(match.fighters[0].currentMove?.command).toBeUndefined();
  });

  it('does not start a base button attack when its animation frame slot is missing', () => {
    const missingKickFrames: CharacterDefinition = {
      ...normalizeCharacter(starterCharacters[0]),
      animationFrames: {
        ...normalizeCharacter(starterCharacters[0]).animationFrames,
        kickleft: []
      }
    };
    let match = createMatch(missingKickFrames, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    match = stepMatch(match, { ...emptyInputFrame(), kick: true }, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].currentMove).toBeNull();
    expect(match.fighters[0].bufferedMoveInput).toBeNull();
  });

  it('does not fall back from an unauthored command to a base attack with missing animation frames', () => {
    const missingKickFrames: CharacterDefinition = {
      ...normalizeCharacter(starterCharacters[0]),
      animationFrames: {
        ...normalizeCharacter(starterCharacters[0]).animationFrames,
        kickleft: []
      }
    };
    let match = createMatch(missingKickFrames, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;

    const missingForwardKick = emptyInputFrame();
    missingForwardKick.right = true;
    missingForwardKick.kick = true;
    match = stepMatch(match, missingForwardKick, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].currentMove).toBeNull();
  });

  it('does not start a move override that resolves to a missing animation key', () => {
    const brokenOverride: CharacterDefinition = {
      ...normalizeCharacter(starterCharacters[0]),
      moveOverrides: {
        kickleft: {
          animationKey: 'missing-kickleft'
        }
      }
    };
    let match = createMatch(brokenOverride, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;

    match = stepMatch(match, { ...emptyInputFrame(), kick: true }, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].currentMove).toBeNull();
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

  it('uses the latest queued button press when multiple independent attacks land in one step', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.9;
    match.fighters[1].position.x = 0.9;
    const queue: Parameters<typeof applyQueuedPressesToInputs>[1] = [];
    const sequenceRef = { current: 0 };
    enqueueInputPress(queue, sequenceRef, 0, 'jab', 100);
    enqueueInputPress(queue, sequenceRef, 0, 'heavy', 101);
    const inputs: [ReturnType<typeof emptyInputFrame>, ReturnType<typeof emptyInputFrame>] = [emptyInputFrame(), emptyInputFrame()];
    applyQueuedPressesToInputs(inputs, queue, true);

    match = stepMatch(match, inputs[0], emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].currentMove?.input).toBe('heavy');
  });

  it('preserves a buffered command snapshot after the player releases before recovery ends', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;

    match = stepMatch(match, { ...emptyInputFrame(), kick: true }, emptyInputFrame(), 1 / 60);
    while (match.fighters[0].actionFramesRemaining > 8) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].hitConfirmed).toBe(false);
    expect(match.fighters[0].actionFramesRemaining).toBeGreaterThan(0);

    const forwardOne = { ...emptyInputFrame(), right: true, jab: true };
    match = stepMatch(match, forwardOne, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].bufferedMoveIntent?.inputSnapshot.right).toBe(true);
    expect(match.fighters[0].bufferedMoveIntent?.inputSnapshot.jab).toBe(true);

    for (let frame = 0; frame < 40 && match.fighters[0].currentMove?.command !== 'f+1'; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].currentMove?.command).toBe('f+1');
    expect(match.fighters[0].currentMove?.animationKey).toBe('cmd:f+1');
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

  it('keeps whiffed moves locked through recovery plus a light whiff penalty', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;
    const attack = emptyInputFrame();
    attack.heavy = true;
    match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
    attack.heavy = false;
    const whiffExtraFrames = 4;
    const total = starterCharacters[0].moves[2].startupFrames + starterCharacters[0].moves[2].activeFrames + starterCharacters[0].moves[2].recoveryFrames + whiffExtraFrames;

    for (let i = 0; i < total - 1; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].state).toBe('attack');

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('idle');
  });

  it('does not allow movement or a second attack during whiff penalty recovery', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -5;
    match.fighters[1].position.x = 5;
    const whiff = emptyInputFrame();
    whiff.jab = true;
    match = stepMatch(match, whiff, emptyInputFrame(), 1 / 60);
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    const xBeforeMash = match.fighters[0].position.x;

    const mash = emptyInputFrame();
    mash.kick = true;
    mash.right = true;
    match = stepMatch(match, mash, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].comboStep).toBe(1);
    expect(match.fighters[0].position.x).toBe(xBeforeMash);
    expect(match.fighters[0].whiffRecoveryApplied).toBe(true);
  });

  it('keeps whiff penalty lighter than blocked disadvantage', () => {
    const heavy = starterCharacters[0].moves[2];
    const whiffExtraFrames = heavy.whiffRecoveryFrames ?? 4;
    expect(whiffExtraFrames).toBeLessThan(Math.abs(heavy.onBlockFrames));
  });

  it('does not allow combo continuation after a blocked move by default', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    const block = emptyInputFrame();
    block.block = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, block, 1 / 60);
      attack.jab = false;
    }
    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.fighters[0].hitConfirmed).toBe(false);

    const mash = emptyInputFrame();
    mash.kick = true;
    match = stepMatch(match, mash, block, 1 / 60);
    expect(match.fighters[0].currentMove?.input).toBe('jab');
    expect(match.fighters[0].comboStep).toBe(1);
  });

  it('finishes a round when health reaches zero', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.fighters[1].hp = 1;
    match.fighters[0].position.x = -0.5;
    match.fighters[1].position.x = 0.5;
    const attack = emptyInputFrame();
    attack.heavy = true;
    for (let i = 0; i < 40; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.heavy = false;
    }
    expect(match.phase).toBe('roundFinisher');
    expect(match.message).toBe('');
    expect(match.roundFinisher?.attackerSlot).toBe(1);
    expect(match.roundFinisher?.defenderSlot).toBe(2);
    expect(match.roundFinisher?.impactPosition[1]).toBeGreaterThan(0);
    expect(match.visualTimeScale).toBeLessThan(1);
    expect(match.fighters[0].roundsWon).toBe(0);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.8);
    expect(match.phase).toBe('roundOver');
    expect(match.message).toBe('PERFECT');
    expect(match.visualTimeScale).toBeLessThan(1);
    expect(match.fighters[0].roundsWon).toBe(1);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.9);
    expect(match.phase).toBe('roundOver');
    expect(match.visualTimeScale).toBe(1);
  });

  it('keeps K.O. when the round winner took damage first', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.fighters[0].hp = Math.max(1, match.fighters[0].hp - 1);
    match.fighters[0].tookDamageThisRound = true;
    match.fighters[1].hp = 1;
    match.fighters[0].position.x = -0.5;
    match.fighters[1].position.x = 0.5;
    const attack = emptyInputFrame();
    attack.heavy = true;
    for (let i = 0; i < 40; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.heavy = false;
    }

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 0.8);
    expect(match.phase).toBe('roundOver');
    expect(match.message).toBe('K.O.');
    expect(match.fighters[0].roundsWon).toBe(1);
  });

  it('keeps nonlethal direct hits in the fighting phase', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.fighters[1].hp = 60;
    match.fighters[0].position.x = -0.5;
    match.fighters[1].position.x = 0.5;
    const attack = emptyInputFrame();
    attack.heavy = true;
    for (let i = 0; i < 40 && !match.fighters[0].hitConnected; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.heavy = false;
    }

    expect(match.fighters[0].hitConnected).toBe(true);
    expect(match.phase).toBe('fighting');
    expect(match.roundFinisher).toBeNull();
    expect(match.fighters[0].roundsWon).toBe(0);
  });

  it('emits a combo popup event on multi-hit combos', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].comboHits = 1;
    match.fighters[0].comboDamage = 7;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.combatEvents).toHaveLength(1);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'combo', hits: 2 });
    expect(match.combatEvents[0].damage).toBeGreaterThan(7);
    expect(match.impactEvents).toHaveLength(1);
    expect(match.impactEvents[0]).toMatchObject({ kind: 'hit', attackerSlot: 1, defenderSlot: 2, comboHits: 2, moveLabel: match.fighters[0].currentMove?.label });
    expect(match.impactEvents[0].position[1]).toBeGreaterThan(0);
    expect(match.fighters[0].visualHitstop).toMatchObject({ framesRemaining: 4, animationKey: match.fighters[0].currentMove?.animationKey ?? match.fighters[0].currentMove?.input });
    expect(match.fighters[1].visualHitstop).toMatchObject({ framesRemaining: 4, animationKey: 'hitLight' });

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'combo', hits: 2 });
    expect(match.fighters[0].visualHitstop.framesRemaining).toBe(3);
    expect(match.fighters[0].moveFrame).toBeGreaterThan(match.fighters[0].visualHitstop.progress * (match.fighters[0].currentMove ? match.fighters[0].currentMove.startupFrames + match.fighters[0].currentMove.activeFrames + match.fighters[0].currentMove.recoveryFrames : 1));
  });

  it('emits a punish popup event when a block punish lands', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].blockPunishWindowFrames = 10;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.combatEvents).toHaveLength(1);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'punish', hits: 1 });
    expect(match.impactEvents[0]).toMatchObject({ kind: 'punish', attackerSlot: 1, defenderSlot: 2, comboHits: 1 });
  });

  it('emits a whiff punish popup event when hitting whiff recovery', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = {
      ...starterCharacters[1].moves[0],
      startupFrames: 1,
      activeFrames: 1,
      recoveryFrames: 20,
      range: 1
    };
    match.fighters[1].moveFrame = 4;
    match.fighters[1].actionFramesRemaining = 12;
    match.fighters[1].actionTimer = 12 / 60;
    match.fighters[1].whiffRecoveryApplied = true;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.combatEvents).toHaveLength(1);
    expect(match.combatEvents[0]).toMatchObject({ slot: 1, kind: 'whiffPunish', hits: 1 });
    expect(match.impactEvents[0]).toMatchObject({ kind: 'whiffPunish', attackerSlot: 1, defenderSlot: 2, comboHits: 1 });
  });

  it('emits a block spark for blocked overlap and no spark for whiffs', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    const blockInput = emptyInputFrame();
    blockInput.block = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, blockInput, 1 / 60);
      attack.jab = false;
    }

    expect(match.impactEvents).toHaveLength(1);
    expect(match.impactEvents[0]).toMatchObject({ kind: 'block', attackerSlot: 1, defenderSlot: 2, comboHits: 0 });
    expect(match.combatEvents).toHaveLength(0);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBeGreaterThan(0);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBeLessThanOrEqual(3);
    expect(match.fighters[1].visualHitstop).toMatchObject({ animationKey: 'block' });

    let whiff = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    whiff.phase = 'fighting';
    whiff.countdown = 0;
    whiff.fighters[0].position.x = -4;
    whiff.fighters[1].position.x = 4;
    whiff.fighters[0].state = 'attack';
    whiff.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5
    };
    whiff.fighters[0].actionFramesRemaining = 12;
    whiff.fighters[0].actionTimer = 12 / 60;

    whiff = stepMatch(whiff, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(whiff.impactEvents).toHaveLength(0);
  });

  it('spawns projectile moves on authored spawn frames and keeps them moving after attacker recovery', () => {
    const shooter = makeProjectileCharacter('projectile-spawn-test');
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');
    match.fighters[1].position.z = 8;
    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    expect(match.projectiles).toHaveLength(0);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.projectiles).toHaveLength(0);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.projectiles).toHaveLength(1);
    const spawnedX = match.projectiles[0].position.x;
    match = stepFrames(match, 20);
    expect(match.fighters[0].state).not.toBe('attack');
    expect(match.projectiles[0]?.position.x).toBeGreaterThan(spawnedX);
  });

  it('supports floaty arcing projectiles with vertical velocity and gravity', () => {
    const shooter = makeProjectileCharacter('projectile-arc-test', {}, {
      homingMode: 'none',
      speed: 0,
      forwardVelocity: 0,
      verticalVelocity: 5,
      gravity: 9,
      lifetimeFrames: 120
    });
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');
    match.fighters[1].position.x = 5;
    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepFrames(match, 2);
    expect(match.projectiles).toHaveLength(1);
    const spawnY = match.projectiles[0].position.y;
    match = stepFrames(match, 12);
    expect(match.projectiles[0].position.y).toBeGreaterThan(spawnY);
    match = stepFrames(match, 36);
    const fallingY = match.projectiles[0].position.y;
    expect(match.projectiles[0].velocity.y).toBeLessThan(0);
    match = stepFrames(match, 8);
    expect(match.projectiles[0].position.y).toBeLessThan(fallingY);
  });

  it('keeps holdable attacks active until the button is released', () => {
    const shooter = makeProjectileCharacter('holdable-projectile-test', {
      holdable: true,
      startupFrames: 1,
      activeFrames: 1,
      recoveryFrames: 2
    }, {
      homingMode: 'none',
      repeatStartFrame: 2,
      repeatEveryFrames: 3,
      lifetimeFrames: 120
    });
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');
    match.fighters[1].position.z = 5;

    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepFrames(match, 16, makeInput('jab'));

    expect(match.fighters[0].state).toBe('attack');
    expect(match.fighters[0].moveFrame).toBeGreaterThan(4);
    expect(match.projectiles.length).toBeGreaterThan(2);
    expect(new Set(match.projectiles.map((projectile) => projectile.instanceId)).size).toBe(match.projectiles.length);

    match = stepFrames(match, 4);
    expect(match.fighters[0].state).not.toBe('attack');
  });

  it('lets active projectiles hit once and emit normal combat feedback', () => {
    const shooter = makeProjectileCharacter('projectile-hit-test');
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');
    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepFrames(match, 20);
    expect(match.fighters[1].hp).toBeLessThan(match.fighters[1].maxHp);
    expect(match.projectiles).toHaveLength(0);
    expect(match.impactEvents[match.impactEvents.length - 1]?.moveLabel).toBe('Test Shot');
    const hpAfterHit = match.fighters[1].hp;
    match = stepFrames(match, 20);
    expect(match.fighters[1].hp).toBe(hpAfterHit);
  });

  it('applies short hit-stun knockback without knockdown for projectile hits', () => {
    const shooter = makeProjectileCharacter('projectile-hitstun-knockback-test', {
      knockdown: true,
      launchHeight: 2.4,
      tornado: true,
      pushback: 0,
      onHitFrames: 40
    });
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');
    const defenderStartX = match.fighters[1].position.x;

    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepFrames(match, 20);

    expect(match.fighters[1].state).toBe('hit');
    expect(match.fighters[1].position.x).toBeGreaterThan(defenderStartX + 0.08);
    expect(match.fighters[1].position.y).toBe(0);
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].stunFramesRemaining).toBeLessThanOrEqual(24);
    expect(match.fighters[1].actionFramesRemaining).toBe(match.fighters[1].stunFramesRemaining);
  });

  it('gives projectile hits tornado extension while the defender is already juggled', () => {
    const shooter = makeProjectileCharacter('projectile-juggle-tornado-test', {
      damage: 9,
      pushback: 0.3,
      onHitFrames: 8
    });
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0.78;
    match.fighters[1].velocityY = -0.4;
    match.fighters[1].juggleDamage = 32;
    match.fighters[1].juggleSequenceDamage = 86;
    match.fighters[1].juggleTornadoCount = 0;

    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    const startingImpactCount = match.impactEvents.length;
    for (let frame = 0; frame < 30 && match.impactEvents.length === startingImpactCount; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].juggleTornadoCount).toBe(1);
    expect(match.fighters[1].juggleSequenceDamage).toBeLessThan(86);
    expect(match.fighters[1].position.y).toBeGreaterThanOrEqual(1.26);
    expect(match.fighters[1].velocityY).toBeGreaterThan(4.2);
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThanOrEqual(30);
    expect(match.impactEvents[match.impactEvents.length - 1]).toMatchObject({ tornado: true, juggled: true });
  });

  it('allows blocking projectile hits', () => {
    const shooter = makeProjectileCharacter('projectile-block-test');
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'local2p');
    match.fighters[1].state = 'block';
    match = stepMatch(match, makeInput('jab'), makeInput('block', 'right'), 1 / 60);
    match = stepFrames(match, 20, emptyInputFrame(), makeInput('block', 'right'));
    expect(match.fighters[1].state).toBe('block');
    expect(match.impactEvents[match.impactEvents.length - 1]?.kind).toBe('block');
    expect(match.fighters[1].hp).toBe(match.fighters[1].maxHp);
  });

  it('lets sidestep lane separation dodge limited-homing projectiles', () => {
    const shooter = makeProjectileCharacter('projectile-dodge-test');
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');
    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.projectiles).toHaveLength(1);
    match.fighters[1].position.z = 8;
    match = stepFrames(match, 40);
    expect(match.fighters[1].hp).toBe(match.fighters[1].maxHp);
  });

  it('lets target-location projectiles hit stationary defenders after startup', () => {
    const shooter = makeProjectileCharacter('projectile-target-location-hit-test', {}, {
      targetMode: 'targetLocation',
      spawnOffset: [0, 1, 0],
      startupFrames: 6,
      activeFrames: 18,
      recoveryFrames: 8,
      lifetimeFrames: 32,
      speed: 0,
      forwardVelocity: 0,
      homingMode: 'none',
      homingStrength: 0,
      homingTurnRate: 0,
      hitbox: { offset: [0, 0, 0], size: [0.58, 0.58, 0.58] }
    });
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');

    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepFrames(match, 12);

    expect(match.fighters[1].hp).toBeLessThan(match.fighters[1].maxHp);
    expect(match.projectiles).toHaveLength(0);
  });

  it('lets sidesteps dodge target-location projectiles before they become active', () => {
    const shooter = makeProjectileCharacter('projectile-target-location-dodge-test', {}, {
      targetMode: 'targetLocation',
      spawnOffset: [0, 1, 0],
      startupFrames: 10,
      activeFrames: 18,
      recoveryFrames: 8,
      lifetimeFrames: 36,
      speed: 0,
      forwardVelocity: 0,
      homingMode: 'none',
      homingStrength: 0,
      homingTurnRate: 0,
      hitbox: { offset: [0, 0, 0], size: [0.58, 0.58, 0.58] }
    });
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'training');

    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.projectiles[0]?.targetMode).toBe('targetLocation');
    match.fighters[1].position.z = 8;
    match = stepFrames(match, 24);

    expect(match.fighters[1].hp).toBe(match.fighters[1].maxHp);
  });

  it('expires projectile runtimes after their lifetime', () => {
    const shooter = makeProjectileCharacter('projectile-expiry-test');
    const defender = makeProjectileCharacter('projectile-expiry-defender');
    let match = createMatch(shooter, defender, stages[0], 'training');
    match.fighters[1].position.z = 3;
    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepFrames(match, 120);
    expect(match.projectiles).toHaveLength(0);
  });

  it('removes opposing clash-enabled projectiles when they overlap', () => {
    const p1 = makeProjectileCharacter('projectile-clash-p1', {}, { clash: true, homingMode: 'none', hitbox: { offset: [0, 0, 0], size: [0.65, 0.65, 0.75] } });
    const p2 = makeProjectileCharacter('projectile-clash-p2', {}, { clash: true, homingMode: 'none', hitbox: { offset: [0, 0, 0], size: [0.65, 0.65, 0.75] } });
    let match = createMatch(p1, p2, stages[0], 'local2p');
    match.fighters[0].position.x = -2;
    match.fighters[1].position.x = 2;

    match = stepMatch(match, makeInput('jab'), makeInput('jab'), 1 / 60);
    match = stepFrames(match, 24);

    expect(match.projectiles).toHaveLength(0);
    expect(match.impactEvents.some((event) => event.kind === 'clash' && event.moveLabel === 'Projectile Clash')).toBe(true);
  });

  it('lets active ki-burst attacks remove clash-enabled projectiles', () => {
    const shooter = makeProjectileCharacter(
      'projectile-attack-clash-test',
      {},
      {
        clash: true,
        homingMode: 'none',
        speed: 0,
        forwardVelocity: 0,
        spawnOffset: [0, 1, 1.1],
        hitbox: { offset: [0, 0, 0], size: [0.7, 0.7, 0.7] }
      }
    );
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'local2p');
    match.fighters[0].position.x = -1;
    match.fighters[1].position.x = 0.4;
    match.fighters[1].position.z = 4;
    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepFrames(match, 2);
    expect(match.projectiles).toHaveLength(1);
    match.fighters[1].position.z = 0;

    const antiProjectileMove = normalizeMove({
      ...defender.moves[0],
      label: 'Anti Projectile Burst',
      startupFrames: 0,
      activeFrames: 20,
      recoveryFrames: 1,
      range: 2,
      kiBurst: true,
      hitbox: { offset: [0, 1, 0.3], size: [0.8, 0.8, 0.9] }
    });
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = antiProjectileMove;
    match.fighters[1].moveFrame = 1;
    match.fighters[1].actionFramesRemaining = 20;
    match.fighters[1].actionTimer = 20 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.projectiles).toHaveLength(0);
    expect(match.fighters[1].hp).toBe(match.fighters[1].maxHp);
    expect(match.impactEvents[match.impactEvents.length - 1]?.kind).toBe('clash');
  });

  it('compacts and hydrates active projectiles for online snapshots', () => {
    const shooter = makeProjectileCharacter('projectile-codec-test');
    const defender = normalizeCharacter(starterCharacters[1]);
    let match = createMatch(shooter, defender, stages[0], 'online');
    match = stepMatch(match, makeInput('jab'), emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.projectiles).toHaveLength(1);
    const hydrated = hydrateMatchSnapshot(createMatch(shooter, defender, stages[0], 'online'), compactMatchSnapshot(match, 12));
    expect(hydrated.projectiles).toHaveLength(1);
    expect(hydrated.projectiles[0].position).toEqual(match.projectiles[0].position);
    expect(hydrated.projectiles[0].move.label).toBe('Test Shot');
  });

  it('emits counter hit events and uses counter-hit advantage only for eligible moves', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const counterMove: MoveDefinition = {
      ...starterCharacters[0].moves[0],
      label: 'Counter Hit Test',
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5,
      onHitFrames: 2,
      onCounterHitFrames: 30,
      counterHitStunBonusFrames: 4,
      counterHit: true
    };
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = counterMove;
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = {
      ...starterCharacters[1].moves[2],
      startupFrames: 20,
      activeFrames: 3,
      recoveryFrames: 20
    };
    match.fighters[1].moveFrame = 5;
    match.fighters[1].actionFramesRemaining = 38;
    match.fighters[1].actionTimer = 38 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.impactEvents[0]).toMatchObject({ kind: 'counterHit', attackerSlot: 1, defenderSlot: 2, moveLabel: 'Counter Hit Test' });
    expect(match.combatEvents[0]).toMatchObject({ kind: 'counterHit', slot: 1, moveLabel: 'Counter Hit Test' });
    expect(match.fighters[1].stunFramesRemaining).toBe(match.fighters[0].actionFramesRemaining + 30 + 4 + 8);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBe(5);
    expect(match.fighters[1].visualHitstop).toMatchObject({ framesRemaining: 5, animationKey: 'hitLight' });
  });

  it('emits counter hit feedback for any move while only eligible moves use counter-hit advantage', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      range: 2.5,
      onHitFrames: 2,
      onCounterHitFrames: 30,
      counterHit: false
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = {
      ...starterCharacters[1].moves[2],
      startupFrames: 20,
      activeFrames: 3,
      recoveryFrames: 20
    };
    match.fighters[1].moveFrame = 5;
    match.fighters[1].actionFramesRemaining = 38;
    match.fighters[1].actionTimer = 38 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.impactEvents[0]).toMatchObject({ kind: 'counterHit', attackerSlot: 1, defenderSlot: 2 });
    expect(match.combatEvents[0]).toMatchObject({ kind: 'counterHit', slot: 1 });
    expect(match.fighters[1].stunFramesRemaining).toBe(match.fighters[0].actionFramesRemaining + 2 + 8);
    expect(match.fighters[1].stunFramesRemaining).toBeLessThan(match.fighters[0].actionFramesRemaining + 30);
  });

  it('keeps gameplay timing active while visual hitstop only holds the rendered pose', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const attack = emptyInputFrame();
    attack.jab = true;
    for (let i = 0; i < 12; i += 1) {
      match = stepMatch(match, attack, emptyInputFrame(), 1 / 60);
      attack.jab = false;
    }
    expect(match.cameraShake).toBe(0);
    expect(match.impactEvents).toHaveLength(1);
    expect(match.fighters[1].hitFlash).toBe(0);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].visualHitstop.framesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].state).toBe('hit');
    expect(match.fighters[1].stunFramesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].actionFramesRemaining).toBeGreaterThan(0);
    const defenderStunAfterImpact = match.fighters[1].stunFramesRemaining;
    const zBefore = match.fighters[1].position.z;
    const xBefore = match.fighters[1].position.x;
    for (let i = 0; i < 32; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].visualHitstop.framesRemaining).toBe(0);
    expect(match.fighters[1].visualHitstop.framesRemaining).toBe(0);
    expect(match.fighters[0].actionFramesRemaining).toBeLessThanOrEqual(0);
    expect(match.fighters[1].stunFramesRemaining).toBeLessThan(defenderStunAfterImpact);
    const moveAfterHit = emptyInputFrame();
    moveAfterHit.sidewalkUp = true;
    match = stepMatch(match, emptyInputFrame(), moveAfterHit, 1 / 60);
    expect(match.phase).toBe('fighting');
    expect(Math.abs(match.fighters[1].position.z - zBefore) + Math.abs(match.fighters[1].position.x - xBefore)).toBeGreaterThan(0.01);
  });

  it('launches into juggle float for an authored non-knockdown launcher command', () => {
    const launcherCharacter: CharacterDefinition = {
      ...starterCharacters[0],
      animationFrames: {
        ...starterCharacters[0].animationFrames,
        'cmd:u+1': starterCharacters[0].animationFrames?.jab ?? []
      },
      moveOverrides: {
        'cmd:u+1': {
          launchHeight: 2.2,
          knockdown: false,
          startupFrames: 4,
          activeFrames: 3,
          recoveryFrames: 18,
          hitbox: {
            offset: [0, 1.22, 0.94],
            size: [0.72, 0.92, 1.3]
          }
        }
      }
    };
    let match = createMatch(launcherCharacter, starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    const launcher = emptyInputFrame();
    launcher.up = true;
    launcher.jab = true;

    for (let i = 0; i < 18; i += 1) {
      match = stepMatch(match, launcher, emptyInputFrame(), 1 / 60);
      launcher.jab = false;
    }

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].position.y).toBeGreaterThan(0.6);
    expect(match.fighters[1].velocityY).toBeGreaterThan(3.4);
    expect(match.fighters[1].velocityY).toBeLessThan(3.9);
    expect(match.fighters[1].juggleDamage).toBeGreaterThan(0);

    let apex = match.fighters[1].position.y;
    for (let i = 0; i < 28; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      apex = Math.max(apex, match.fighters[1].position.y);
    }
    expect(apex).toBeGreaterThan(2.1);
    expect(match.fighters[1].state).toBe('juggle');
  });

  it('applies per-launcher pop and fall-speed tuning', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      knockdown: false,
      launchHeight: 2.2,
      launchVelocity: 4.05,
      juggleRefloatVelocity: 3.25,
      juggleGravityScale: 1.08,
      range: 2.5,
      hitbox: {
        offset: [0, 1.1, 0.75],
        size: [0.9, 0.8, 1.2]
      }
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].velocityY).toBeCloseTo(4.05, 2);
    expect(match.fighters[1].juggleGravityScale).toBeCloseTo(1.08, 2);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBe(5);
    expect(match.fighters[1].visualHitstop).toMatchObject({ framesRemaining: 5, animationKey: 'hitHeavy' });
  });

  it('lets different juggle fall speeds create different airborne arcs', () => {
    let fastFall = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    let slowFall = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    fastFall.phase = 'fighting';
    slowFall.phase = 'fighting';
    fastFall.countdown = 0;
    slowFall.countdown = 0;

    for (const match of [fastFall, slowFall]) {
      match.fighters[1].state = 'juggle';
      match.fighters[1].position.y = 1.1;
      match.fighters[1].velocityY = 4.6;
      match.fighters[1].stunFramesRemaining = 80;
      match.fighters[1].actionFramesRemaining = 80;
    }
    fastFall.fighters[1].juggleGravityScale = 1.08;
    slowFall.fighters[1].juggleGravityScale = 0.34;

    for (let i = 0; i < 24; i += 1) {
      fastFall = stepMatch(fastFall, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      slowFall = stepMatch(slowFall, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(slowFall.fighters[1].position.y).toBeGreaterThan(fastFall.fighters[1].position.y + 0.55);
  });

  it('keeps a launched defender unable to act while airborne even after hit frames expire', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0.72;
    match.fighters[1].velocityY = 0.05;
    match.fighters[1].stunFramesRemaining = 0;
    match.fighters[1].actionFramesRemaining = 0;

    const attemptedAirAction = emptyInputFrame();
    attemptedAirAction.jab = true;
    attemptedAirAction.right = true;
    const startX = match.fighters[1].position.x;

    match = stepMatch(match, emptyInputFrame(), attemptedAirAction, 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].currentMove).toBeNull();
    expect(match.fighters[1].position.x).toBe(startX);
  });

  it('keeps a landed launched defender locked until remaining recovery frames expire', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0;
    match.fighters[1].velocityY = 0;
    match.fighters[1].stunFramesRemaining = 12;
    match.fighters[1].actionFramesRemaining = 12;

    const attemptedGroundAction = emptyInputFrame();
    attemptedGroundAction.jab = true;
    attemptedGroundAction.left = true;
    const startX = match.fighters[1].position.x;

    match = stepMatch(match, emptyInputFrame(), attemptedGroundAction, 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].currentMove).toBeNull();
    expect(match.fighters[1].position.x).toBe(startX);

    for (let i = 0; i < 14; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].state).toBe('idle');
  });

  it('adds landing recovery when a juggled defender falls to the floor with expired hit frames', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0.04;
    match.fighters[1].velocityY = -2.2;
    match.fighters[1].stunFramesRemaining = 0;
    match.fighters[1].actionFramesRemaining = 0;
    match.fighters[1].stunTimer = 0;
    match.fighters[1].actionTimer = 0;

    for (let i = 0; i < 3 && match.fighters[1].position.y > 0; i += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[1].position.y).toBe(0);
    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].actionFramesRemaining).toBeGreaterThan(0);

    const attemptedGroundAction = emptyInputFrame();
    attemptedGroundAction.jab = true;
    match = stepMatch(match, emptyInputFrame(), attemptedGroundAction, 1 / 60);

    expect(match.fighters[1].currentMove).toBeNull();
    expect(match.fighters[1].state).toBe('juggle');
  });

  it('re-floats airborne defenders on juggle follow-up hits', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.y = 0.5;
    match.fighters[1].velocityY = -0.4;
    match.fighters[1].state = 'juggle';
    match.fighters[1].juggleDamage = 8;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      knockdown: false,
      launchHeight: 2.2,
      range: 2.5
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;
    match.fighters[0].moveFrame = 0;
    match.fighters[0].hitConnected = false;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('juggle');
    expect(match.fighters[1].position.y).toBeGreaterThan(1);
    expect(match.fighters[1].velocityY).toBeGreaterThan(3.7);
    expect(match.fighters[1].juggleDamage).toBeGreaterThan(8);
  });

  it('does not relaunch grounded defenders with tornado unless the move is also a launcher', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[0].state = 'attack';
    match.fighters[0].currentMove = {
      ...starterCharacters[0].moves[0],
      startupFrames: 0,
      activeFrames: 3,
      recoveryFrames: 12,
      damage: 6,
      tornado: true,
      knockdown: false,
      launchHeight: undefined,
      range: 2.5,
      hitbox: {
        offset: [0, 1.1, 0.75],
        size: [1, 1.2, 1.5]
      }
    };
    match.fighters[0].actionFramesRemaining = 12;
    match.fighters[0].actionTimer = 12 / 60;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('hit');
    expect(match.fighters[1].position.y).toBe(0);
    expect(match.fighters[1].juggleTornadoCount).toBe(0);
  });

  it('extends a juggle with two different tornado identities, then stops resetting the juggle limit', () => {
    const runTornadoHit = (tornadoCount: number, command: string, comboIdentitySequence: string[], sequenceDamage = tornadoCount >= 2 ? 86 : 40) => {
      let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -0.45;
      match.fighters[1].position.x = 0.45;
      match.fighters[1].position.y = 0.74;
      match.fighters[1].velocityY = -0.35;
      match.fighters[1].state = 'juggle';
      match.fighters[1].juggleDamage = 28;
      match.fighters[1].juggleSequenceDamage = sequenceDamage;
      match.fighters[1].juggleTornadoCount = tornadoCount;
      match.fighters[0].comboIdentitySequence = comboIdentitySequence;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = {
        ...starterCharacters[0].moves[0],
        command,
        startupFrames: 0,
        activeFrames: 3,
        recoveryFrames: 12,
        damage: 6,
        tornado: true,
        knockdown: false,
        launchHeight: undefined,
        range: 2.5,
        hitbox: {
          offset: [0, 1.15, 0.75],
          size: [1.1, 1.6, 1.5]
        }
      };
      match.fighters[0].actionFramesRemaining = 12;
      match.fighters[0].actionTimer = 12 / 60;
      match.fighters[0].moveFrame = 0;
      match.fighters[0].hitConnected = false;
      return stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    };

    const first = runTornadoHit(0, '1+2', ['1+2']);
    expect(first.fighters[1].state).toBe('juggle');
    expect(first.fighters[1].juggleTornadoCount).toBe(1);
    expect(first.fighters[1].juggleSequenceDamage).toBe(3);
    expect(first.fighters[1].position.y).toBeGreaterThanOrEqual(1.26);
    expect(first.fighters[1].velocityY).toBeGreaterThan(4.2);

    const second = runTornadoHit(1, '3+4', ['1+2', '3+4']);
    expect(second.fighters[1].state).toBe('juggle');
    expect(second.fighters[1].juggleTornadoCount).toBe(2);
    expect(second.fighters[1].juggleSequenceDamage).toBe(3);

    const repeated = runTornadoHit(1, '1+2', ['1+2', '1+2'], 86);
    expect(repeated.fighters[0].hitConnected).toBe(true);
    expect(repeated.fighters[0].hitConfirmed).toBe(true);
    expect(repeated.fighters[1].state).toBe('knockdown');
    expect(repeated.fighters[1].juggleTornadoCount).toBe(0);
    expect(repeated.impactEvents).toHaveLength(1);
    expect(repeated.impactEvents[0]).toMatchObject({ kind: 'hit', attackerSlot: 1, defenderSlot: 2, juggled: true });

    const third = runTornadoHit(2, 'O+4', ['1+2', '3+4', 'O+4']);
    expect(third.fighters[1].state).toBe('knockdown');
    expect(third.fighters[1].juggleTornadoCount).toBe(0);
  });

  it('forces knockdown after enough juggle damage', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    match.phase = 'fighting';
    match.countdown = 0;
    match.fighters[0].position.x = -0.45;
    match.fighters[1].position.x = 0.45;
    match.fighters[1].position.y = 0.5;
    match.fighters[1].velocityY = 0.2;
    match.fighters[1].state = 'juggle';
    match.fighters[1].juggleDamage = 88;
    match.fighters[1].juggleSequenceDamage = 88;
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

  it('starts throw capture on an unblocked hit and freezes both fighters', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(match);

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('throwHold');
    expect(match.fighters[1].state).toBe('throwHeld');
    expect(match.fighters[1].hp).toBe(starterCharacters[1].stats.health - 10);
    expect(match.fighters[0].moveFrame).toBe(match.fighters[0].currentMove!.startupFrames + match.fighters[0].currentMove!.activeFrames + match.fighters[0].currentMove!.recoveryFrames);
    expect(match.fighters[1].throwEscapeGoal).toBe(9);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBe(4);
    expect(match.fighters[1].visualHitstop).toMatchObject({ framesRemaining: 4, animationKey: 'hitLight' });
  });

  it('does not capture on blocked or whiffed throw-capture moves', () => {
    let blocked = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(blocked, 0, makeThrowCaptureMove({ hitLevel: 'high', blockDamage: 1 }));
    const blockInput = { ...emptyInputFrame(), block: true };

    blocked = stepMatch(blocked, emptyInputFrame(), blockInput, 1 / 60);

    expect(blocked.fighters[0].state).not.toBe('throwHold');
    expect(blocked.fighters[1].state).toBe('block');
    expect(blocked.fighters[1].hp).toBe(starterCharacters[1].stats.health - 1);

    let whiffed = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(whiffed);
    whiffed.fighters[1].position.x = 8;

    whiffed = stepMatch(whiffed, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(whiffed.fighters[0].state).toBe('attack');
    expect(whiffed.fighters[1].state).not.toBe('throwHeld');
    expect(whiffed.fighters[1].hp).toBe(starterCharacters[1].stats.health);
  });

  it('lets throw capture override launcher, tornado, and knockdown reactions', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(match, 0, makeThrowCaptureMove({ launchHeight: 2.8, tornado: true, knockdown: true }));
    match.fighters[1].state = 'juggle';
    match.fighters[1].position.y = 0.9;
    match.fighters[1].juggleTornadoCount = 1;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[1].state).toBe('throwHeld');
    expect(match.fighters[1].position.y).toBe(0);
    expect(match.fighters[1].velocityY).toBe(0);
    expect(match.fighters[1].juggleTornadoCount).toBe(0);
  });

  it('keeps the defender attached until mash escape or timeout release', () => {
    let mashMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(mashMatch);
    mashMatch = stepMatch(mashMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    const heldOffset = mashMatch.fighters[1].position.x - mashMatch.fighters[0].position.x;

    mashMatch.fighters[0].position.x -= 0.2;
    mashMatch = stepMatch(mashMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(mashMatch.fighters[1].position.x - mashMatch.fighters[0].position.x).toBeCloseTo(heldOffset, 4);

    const escapeGoal = mashMatch.fighters[1].throwEscapeGoal;
    for (let i = 0; i < escapeGoal; i += 1) {
      mashMatch = stepWithMash(mashMatch, 2, i % 2 === 0 ? 'jab' : 'heavy');
    }

    expect(mashMatch.fighters[0].state).toBe('idle');
    expect(mashMatch.fighters[1].state).toBe('idle');
    expect(mashMatch.fighters[1].throwCaptorSlot).toBeNull();

    let timeoutMatch = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(timeoutMatch);
    timeoutMatch = stepMatch(timeoutMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 241; frame += 1) {
      timeoutMatch = stepMatch(timeoutMatch, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(timeoutMatch.fighters[0].state).toBe('idle');
    expect(timeoutMatch.fighters[1].state).toBe('idle');
  });

  it('lets the grabber left-jab a held defender and then returns to the throw pose', () => {
    let match = createMatch(makeHeldJabCharacter(), starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(match);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    const throwMove = match.fighters[0].currentMove;
    const defenderHp = match.fighters[1].hp;

    match = stepMatch(match, { ...emptyInputFrame(), jab: true }, emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('throwHold');
    expect(match.fighters[0].throwJabActive).toBe(true);
    expect(match.fighters[0].currentMove?.input).toBe('jab');

    for (let frame = 0; frame < 2; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(defenderHp - match.fighters[1].hp).toBe(6);
    expect(match.fighters[0].visualHitstop.framesRemaining).toBeGreaterThan(0);
    expect(match.fighters[1].visualHitstop).toMatchObject({ animationKey: 'hitLight' });

    for (let frame = 0; frame < 8; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(match.fighters[0].throwJabActive).toBe(false);
    expect(match.fighters[0].currentMove?.id).toBe(throwMove?.id);
    expect(match.fighters[0].moveFrame).toBe(match.fighters[0].currentMove!.startupFrames + match.fighters[0].currentMove!.activeFrames + match.fighters[0].currentMove!.recoveryFrames);
    expect(match.fighters[1].state).toBe('throwHeld');
  });

  it('ignores non-jab grabber attacks and gates repeated held jabs by recovery timing', () => {
    let match = createMatch(makeHeldJabCharacter(), starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(match);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    const capturedHp = match.fighters[1].hp;

    match = stepMatch(match, { ...emptyInputFrame(), heavy: true }, emptyInputFrame(), 1 / 60);
    match = stepMatch(match, { ...emptyInputFrame(), kick: true }, emptyInputFrame(), 1 / 60);
    match = stepMatch(match, { ...emptyInputFrame(), special: true }, emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].throwJabActive).toBe(false);
    expect(match.fighters[1].hp).toBe(capturedHp);

    match = stepMatch(match, { ...emptyInputFrame(), jab: true }, emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 2; frame += 1) {
      match = stepMatch(match, { ...emptyInputFrame(), jab: true }, emptyInputFrame(), 1 / 60);
    }
    const firstHeldJabDamage = capturedHp - match.fighters[1].hp;
    expect(firstHeldJabDamage).toBe(6);

    for (let frame = 0; frame < 3; frame += 1) {
      match = stepMatch(match, { ...emptyInputFrame(), jab: true }, emptyInputFrame(), 1 / 60);
    }
    expect(capturedHp - match.fighters[1].hp).toBe(firstHeldJabDamage);

    for (let frame = 0; frame < 8; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    match = stepMatch(match, { ...emptyInputFrame(), jab: true }, emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 2; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }
    expect(capturedHp - match.fighters[1].hp).toBeGreaterThan(firstHeldJabDamage);
  });

  it('makes CPU grabbers light-attack held defenders during a throw capture', () => {
    let match = createMatch(makeHeldJabCharacter(), starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 771 });
    startActiveThrowHit(match);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    match.fighters[1].throwEscapeGoal = 999;
    expect(match.fighters[0].state).toBe('throwHold');
    expect(match.fighters[1].state).toBe('throwHeld');
    const capturedHp = match.fighters[1].hp;

    let firstJabStarted = false;
    for (let frame = 0; frame < 8; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      firstJabStarted = firstJabStarted || match.fighters[0].throwJabActive;
      if (match.fighters[1].hp < capturedHp) break;
    }

    expect(firstJabStarted).toBe(true);
    const firstHeldJabDamage = capturedHp - match.fighters[1].hp;
    expect(firstHeldJabDamage).toBe(6);

    for (let frame = 0; frame < 16 && capturedHp - match.fighters[1].hp <= firstHeldJabDamage; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].state).toBe('throwHold');
    expect(match.fighters[1].state).toBe('throwHeld');
    expect(capturedHp - match.fighters[1].hp).toBeGreaterThan(firstHeldJabDamage);
  });

  it('makes CPU held defenders mash out instead of taking repeated held jabs', () => {
    let match = createMatch(makeHeldJabCharacter(), starterCharacters[1], stages[0], 'cpu', 5, { aiSeed: 883 });
    startActiveThrowHit(match);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('throwHold');
    expect(match.fighters[1].state).toBe('throwHeld');
    const capturedHp = match.fighters[1].hp;
    const escapeGoal = match.fighters[1].throwEscapeGoal;

    let maxEscapeProgress = 0;
    for (let frame = 0; frame < 36 && match.fighters[1].state === 'throwHeld'; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      maxEscapeProgress = Math.max(maxEscapeProgress, match.fighters[1].throwEscapeProgress);
    }

    expect(maxEscapeProgress).toBeGreaterThan(0);
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].state).toBe('idle');
    expect(match.fighters[1].throwCaptorSlot).toBeNull();
    expect(match.fighters[1].hp).toBeGreaterThan(capturedHp - 14);
    expect(escapeGoal).toBeGreaterThan(0);
  });

  it('scales throw mash escape by defender health and shows shake on fresh presses', () => {
    let highHp = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    startActiveThrowHit(highHp);
    highHp = stepMatch(highHp, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    let lowHp = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'local2p');
    lowHp.fighters[1].hp = Math.max(20, Math.round(lowHp.fighters[1].maxHp * 0.5));
    startActiveThrowHit(lowHp);
    lowHp = stepMatch(lowHp, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(highHp.fighters[1].throwEscapeGoal).toBeLessThan(lowHp.fighters[1].throwEscapeGoal);

    highHp = stepWithMash(highHp, 2, 'special');
    expect(highHp.fighters[1].throwEscapeProgress).toBe(1);
    expect(highHp.fighters[1].throwShakeFrames).toBeGreaterThan(0);
  });

  it('supports throw capture and escape in training mode without ending the round', () => {
    let match = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'training');
    startActiveThrowHit(match, 1);
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('throwHeld');

    const escapeGoal = match.fighters[0].throwEscapeGoal;
    for (let i = 0; i < escapeGoal; i += 1) {
      match = stepWithMash(match, 1, i % 2 === 0 ? 'kick' : 'special');
    }

    expect(match.phase).toBe('fighting');
    expect(match.round).toBe(1);
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[1].state).toBe('idle');
  });

  it('fills a second transform bar and drains it back to one full ki bar after the ready window', () => {
    const { base, opponent, roster } = makeTransformRoster();
    let match = createMatch(base, opponent, stages[0], 'local2p', 3, { roster });

    match = chargeUntilTransformReady(match);

    expect(match.fighters[0].ki).toBe(100);
    expect(match.fighters[0].transformOvercharge).toBe(100);
    expect(match.fighters[0].transformReadyTimer).toBeGreaterThan(0);

    for (let frame = 0; frame < 181; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].ki).toBe(100);
    expect(match.fighters[0].transformOvercharge).toBe(0);
    expect(match.fighters[0].transformReadyTimer).toBe(0);
  });

  it('does not fill a second bar when transform metadata has no valid roster target', () => {
    const { base, opponent } = makeTransformRoster();
    const invalidTransform = {
      ...base,
      transformCharacterId: 'missing-form'
    };
    let match = createMatch(invalidTransform, opponent, stages[0], 'local2p', 3, { roster: [invalidTransform, opponent] });

    for (let frame = 0; frame < 560; frame += 1) {
      match = stepMatch(match, { ...emptyInputFrame(), charge: true }, emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].ki).toBe(100);
    expect(match.fighters[0].transformOvercharge).toBe(0);
    expect(match.fighters[0].transformReadyTimer).toBe(0);
  });

  it('transforms with invincible startup, keeps hp percent, and resets ki', () => {
    const { base, form, opponent, roster } = makeTransformRoster();
    let match = createMatch(base, opponent, stages[0], 'local2p', 3, { roster });
    match.fighters[0].hp = 60;
    match = chargeUntilTransformReady(match);

    match = stepMatch(match, allLimbsInput(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('transform');
    expect(match.fighters[0].ki).toBe(0);
    expect(match.fighters[0].transformOvercharge).toBe(0);

    match.fighters[1].position.x = match.fighters[0].position.x + 0.7;
    match.fighters[1].state = 'attack';
    match.fighters[1].currentMove = {
      ...opponent.moves[0],
      startupFrames: 0,
      activeFrames: 8,
      recoveryFrames: 8,
      damage: 30,
      range: 2.4,
      hitbox: { offset: [0, 1.1, 0.72], size: [1.3, 1.2, 1.5] }
    };
    match.fighters[1].actionFramesRemaining = 8;
    match.fighters[1].actionTimer = 8 / 60;
    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].hp).toBe(60);

    for (let frame = 0; frame < 90; frame += 1) {
      match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    }

    expect(match.fighters[0].character.id).toBe(form.id);
    expect(match.fighters[0].baseCharacter.id).toBe(base.id);
    expect(match.fighters[0].maxHp).toBe(form.stats.health);
    expect(match.fighters[0].hp).toBe(120);
    expect(match.fighters[0].state).toBe('idle');
    expect(match.fighters[0].ki).toBe(0);
  });

  it('chains transforms when ready and reverts to base when not ready', () => {
    const { base, form, final, opponent, roster } = makeTransformRoster();
    let match = createMatch(base, opponent, stages[0], 'local2p', 3, { roster });
    match = chargeUntilTransformReady(match);
    match = stepMatch(match, allLimbsInput(), emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 91; frame += 1) match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].character.id).toBe(form.id);

    match = chargeUntilTransformReady(match);
    match = stepMatch(match, allLimbsInput(), emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 91; frame += 1) match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].character.id).toBe(final.id);
    expect(match.fighters[0].baseCharacter.id).toBe(base.id);

    match = stepMatch(match, allLimbsInput(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].state).toBe('transform');
    for (let frame = 0; frame < 91; frame += 1) match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].character.id).toBe(base.id);
    expect(match.fighters[0].ki).toBe(0);
  });

  it('lets training mode repeatedly charge, transform, chain, revert, and charge again', () => {
    const { base, form, final, opponent, roster } = makeTransformRoster();
    let match = createMatch(base, opponent, stages[0], 'training', 3, { roster, trainingInfiniteHealth: true });

    match = chargeUntilTransformReady(match);
    expect(match.mode).toBe('training');
    expect(match.timer).toBe(match.roundTime);
    expect(match.fighters[0].transformReadyTimer).toBeGreaterThan(0);

    match = stepMatch(match, allLimbsInput(), emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 91; frame += 1) match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].character.id).toBe(form.id);
    expect(match.fighters[0].ki).toBe(0);

    match = chargeUntilTransformReady(match);
    expect(match.fighters[0].transformReadyTimer).toBeGreaterThan(0);
    match = stepMatch(match, allLimbsInput(), emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 91; frame += 1) match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].character.id).toBe(final.id);
    expect(match.fighters[0].ki).toBe(0);

    match = stepMatch(match, allLimbsInput(), emptyInputFrame(), 1 / 60);
    for (let frame = 0; frame < 91; frame += 1) match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
    expect(match.fighters[0].character.id).toBe(base.id);
    expect(match.fighters[0].ki).toBe(0);

    match = chargeUntilTransformReady(match);
    expect(match.fighters[0].character.id).toBe(base.id);
    expect(match.fighters[0].ki).toBe(100);
    expect(match.fighters[0].transformReadyTimer).toBeGreaterThan(0);
  });

  it('lets cpu fighters trigger a smart transform during the ready window', () => {
    const { base, opponent, roster } = makeTransformRoster();
    let match = createMatch(base, opponent, stages[0], 'cpu', 4, { roster, aiSeed: 4 });
    match.fighters[0].ki = 100;
    match.fighters[0].transformOvercharge = 100;
    match.fighters[0].transformReadyTimer = 3;
    match.fighters[0].position.x = -2.5;
    match.fighters[1].position.x = 2.5;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).toBe('transform');
  });

  it('keeps cpu from chasing transform charge when the target is missing', () => {
    const { base, opponent } = makeTransformRoster();
    const invalidTransform = {
      ...base,
      transformCharacterId: 'missing-form'
    };
    let match = createMatch(invalidTransform, opponent, stages[0], 'cpu', 4, { roster: [invalidTransform, opponent], aiSeed: 4 });
    match.fighters[0].ki = 100;
    match.fighters[0].transformOvercharge = 100;
    match.fighters[0].transformReadyTimer = 3;
    match.fighters[0].position.x = -2.5;
    match.fighters[1].position.x = 2.5;

    match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);

    expect(match.fighters[0].state).not.toBe('transform');
  });

  it('drops user bindings for all four limbs because transform owns that chord', () => {
    const settings = sanitizeGameSettings({
      controls: {
        keyboardCombos: [{ '1+2+3+4': ['KeyP'], '1+2': ['KeyL'] }, {}],
        gamepadCombos: [{ '1+2+3+4': [8], '1+2': [7] }, {}]
      }
    });
    const event = new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' });
    const keptEvent = new KeyboardEvent('keydown', { code: 'KeyL', key: 'l' });

    expect(settings.controls.keyboardCombos[0]['1+2+3+4']).toBeUndefined();
    expect(settings.controls.gamepadCombos[0]['1+2+3+4']).toBeUndefined();
    expect(getKeyboardBindingsForEvent(event, 'local2p', settings.controls)).toEqual([]);
    expect(getKeyboardBindingsForEvent(keptEvent, 'local2p', settings.controls).map((binding) => binding.action)).toEqual(['jab', 'heavy']);
  });

  it('hydrates online snapshots with active and base transform characters', () => {
    const { base, form, opponent, roster } = makeTransformRoster();
    const host = createMatch(base, opponent, stages[0], 'online', 3, { roster });
    host.fighters[0].character = form;
    host.fighters[0].baseCharacter = base;
    host.fighters[0].maxHp = form.stats.health;
    host.fighters[0].hp = 144;
    host.fighters[0].ki = 100;
    host.fighters[0].transformOvercharge = 72;
    host.fighters[0].transformReadyTimer = 1.4;
    host.fighters[0].transformStartupFrames = 33;
    host.fighters[0].transformTargetId = base.id;
    host.fighters[0].transformSmokeFrames = 18;

    const guestBase = createMatch(base, opponent, stages[0], 'online', 3, { roster });
    const hydrated = hydrateMatchSnapshot(guestBase, compactMatchSnapshot(host, 7));

    expect(hydrated.fighters[0].character.id).toBe(form.id);
    expect(hydrated.fighters[0].baseCharacter.id).toBe(base.id);
    expect(hydrated.fighters[0].transformOvercharge).toBe(72);
    expect(hydrated.fighters[0].transformReadyTimer).toBe(1.4);
    expect(hydrated.fighters[0].transformStartupFrames).toBe(33);
    expect(hydrated.fighters[0].transformTargetId).toBe(base.id);
    expect(hydrated.fighters[0].transformSmokeFrames).toBe(18);
  });

  it('preserves training online mode in compact snapshots', () => {
    const host = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'trainingOnline', 3, { roundTime: 0 });
    const guestBase = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online', 3);
    const snapshot = compactMatchSnapshot(host, 12);
    const hydrated = hydrateMatchSnapshot(guestBase, snapshot);

    expect(snapshot.mode).toBe('trainingOnline');
    expect(hydrated.mode).toBe('trainingOnline');
    expect(hydrated.roundTime).toBe(0);
  });

  it('round-trips control scheme in compact snapshots and defaults legacy snapshots to KORE', () => {
    const host = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online', 3, { controlScheme: 'beginner' });
    const guestBase = createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online', 3);
    const snapshot = compactMatchSnapshot(host, 14);
    const hydrated = hydrateMatchSnapshot(guestBase, snapshot);
    const legacyHydrated = hydrateMatchSnapshot(guestBase, { ...snapshot, controlScheme: undefined });

    expect(snapshot.controlScheme).toBe('beginner');
    expect(hydrated.controlScheme).toBe('beginner');
    expect(legacyHydrated.controlScheme).toBe('kore');
  });
});
