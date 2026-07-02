import type {
  BoxSpec,
  CharacterDefinition,
  ClashState,
  CpuDifficulty,
  FighterRuntime,
  InputFrame,
  MatchMode,
  MatchOptions,
  MatchSnapshot,
  MoveDefinition,
  MoveInput,
  MoveOverride,
  ImpactSparkKind,
  ImpactSparkEvent,
  StageDefinition
} from '../types';
import { ROUNDS_TO_WIN, emptyInputFrame } from '../types';
import { getCharacterCombatScale } from '../lib/characterScale';
import { effectIsVisibleAt, effectTransformAt } from '../lib/effects';

const ROUND_TIME = 60;
const INFINITE_HEALTH_VALUE = 999_999;
const START_DISTANCE = 2.6;
const ROUND_OVER_DELAY = 2.1;
const KO_SLOWMO_SECONDS = 0.8;
const KO_SLOWMO_TIME_SCALE = 0.24;
const ROUND_INTRO_ENTRY_SECONDS = 1.2;
const ROUND_ANNOUNCER_TIMINGS = [
  { duration: 4.05, fightAt: 2.49 },
  { duration: 3.98, fightAt: 2.4 },
  { duration: 4.04, fightAt: 2.47 },
  { duration: 4.16, fightAt: 2.6 },
  { duration: 4.28, fightAt: 2.72 }
] as const;
const COMBO_WINDOW = 0.58;
const FRAMES_PER_SECOND = 60;
const KNOCKDOWN_MIN_FRAMES = 34;
const GETUP_FRAMES = 24;
const GETUP_INVULNERABLE_FRAMES = 20;
const GETUP_ROLL_SPEED = 2.25;
const GETUP_LANE_SPEED = 2.7;
const JUGGLE_DAMAGE_LIMIT = 44;
const JUGGLE_INITIAL_VELOCITY = 5.95;
const JUGGLE_REFLOAT_VELOCITY = 4.35;
const TORNADO_REFLOAT_VELOCITY = 4.85;
const JUGGLE_GRAVITY_SCALE = 0.52;
const JUGGLE_MIN_START_HEIGHT = 0.72;
const JUGGLE_REFLOAT_MIN_HEIGHT = 1.12;
const TORNADO_REFLOAT_MIN_HEIGHT = 1.26;
const TORNADO_REFLOAT_STUN_FRAMES = 30;
const TORNADO_EXTENSION_LIMIT = 2;
const JUGGLE_LANDING_RECOVERY_FRAMES = 18;
const JUGGLE_KEEP_CLOSE_DISTANCE = 1.16;
const JUGGLE_KEEP_CLOSE_PULL = 0.34;
const DEFAULT_HURTBOX: BoxSpec = { offset: [0, 1, 0], size: [0.86, 1.9, 0.58] };
const UNIVERSAL_RANGE_BUFFER = 0.32;
const UNIVERSAL_HITBOX_FORWARD_PADDING = 0.3;
const UNIVERSAL_HITBOX_LATERAL_PADDING = 0.14;
const UNIVERSAL_HITBOX_VERTICAL_PADDING = 0.14;
const LOW_HURTBOX_FORWARD_EXTENSION = 0.34;
const LOW_HURTBOX_MAX_HEIGHT = 0.62;
const LOW_HURTBOX_MIN_HEIGHT = 0.34;
const AI_RECENT_MEMORY_LIMIT = 12;
const DEFAULT_WHIFF_RECOVERY_FRAMES = 4;
const FORCED_CROUCH_EXIT_FRAMES = 8;
const BLOCK_PUNISH_BUFFER_FRAMES = 12;
const PRESSURE_LANE_TOLERANCE = 0.82;
const AI_DECISION_BUCKETS_PER_SECOND = 4;
const AI_SEED_MODULUS = 1_000_000;
const KI_MAX = 100;
const KI_CHARGE_PER_SECOND = 28;
const TRANSFORM_READY_SECONDS = 3;
const TRANSFORM_STARTUP_FRAMES = 90;
const TRANSFORM_SMOKE_FRAMES = 54;
const THROW_MAX_HOLD_FRAMES = 240;
const THROW_RELEASE_RECOVERY_FRAMES = 12;
const THROW_HAND_FORWARD_OFFSET = 0.68;
const THROW_RELEASE_SPACING = 0.98;
const THROW_SHAKE_FRAMES = 10;
const KI_HIT_GAIN = 9;
const KI_BLOCK_GAIN = 4;
const KI_DEFENDER_BLOCK_GAIN = 5;
const KI_BURST_COST = 35;
const ATTACK_BUFFER_FRAMES = 16;
const MAX_COMBO_STEPS = 6;
const SIDESTEP_TAP_SCALE = 1.45;
const SIDEWALK_SCALE = 1.15;
const DEFAULT_DASH_FORWARD_DISTANCE = 0.78;
const DEFAULT_STAGE_BOUND_WIDTH = 96;
const DEFAULT_STAGE_BOUND_DEPTH = 42;
const MIN_STAGE_BOUND_WIDTH = 16;
const MIN_STAGE_BOUND_DEPTH = 10;
const MIN_WALL_RADIUS = 0.34;
const MAX_WALL_RADIUS = 1.05;
const DASH_FORWARD_ANIMATION_FRAMES = 18;
const DASH_FORWARD_COOLDOWN_FRAMES = 14;
const KI_CHARGE_DEFAULT_STARTUP_FRAMES = 14;
const KI_CHARGE_DEFAULT_ACTIVE_FRAMES = 18;
const KI_CHARGE_DEFAULT_RECOVERY_FRAMES = 16;
const SHADOW_CLONE_CHARACTER_IDS = new Set(['kiro', 'naruto']);
const SHADOW_CLONE_KI_THRESHOLD = 50;
const SHADOW_CLONE_DAMAGE_SCALE = 0.34;
const SHADOW_CLONE_BLOCK_DAMAGE_SCALE = 0.35;
const SHADOW_CLONE_SPAWN_SMOKE_FRAMES = 24;
const SHADOW_CLONE_VANISH_SMOKE_FRAMES = 24;
const SHADOW_CLONE_OFFSET_FORWARD = -0.42;
const SHADOW_CLONE_OFFSET_LANE = 0.52;
const CLASH_SEQUENCE_LENGTH = 3;
const CLASH_INTRO_FRAMES = 45;
const CLASH_INPUT_FRAMES = 150;
const CLASH_RESULT_FRAMES = 54;
const CLASH_DRAW_RECOVERY_FRAMES = 20;
const CLASH_WINNER_RECOVERY_FRAMES = 8;
const CLASH_LOSER_HITSTUN_FRAMES = 36;
const CLASH_DAMAGE_MULTIPLIER = 1.65;
const CLASH_MIN_DAMAGE = 12;
const CLASH_PUSHBACK = 1.15;

const moveInputs: MoveInput[] = ['special', 'heavy', 'kick', 'jab'];
const clashInputOrder: MoveInput[] = ['jab', 'heavy', 'kick', 'special'];
const limbNames: Record<MoveInput, string> = {
  jab: 'Left Hand',
  heavy: 'Right Hand',
  kick: 'Left Foot',
  special: 'Right Foot'
};
const baseInputToAnimationKey: Record<MoveInput, string> = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};
const rawButtonCommandToBaseAnimationKey: Record<string, string> = {
  '1': 'jableft',
  '2': 'jabright',
  '3': 'kickleft',
  '4': 'kickright'
};

export function createMatch(
  p1: CharacterDefinition,
  p2: CharacterDefinition,
  stage: StageDefinition,
  mode: MatchMode,
  cpuDifficulty: CpuDifficulty = 3,
  options: MatchOptions = {}
): MatchSnapshot {
  const roundTime = normalizeRoundTime(options.roundTime);
  const maxHealth = normalizeMaxHealth(options.maxHealth);
  const aiSeed = normalizeAiSeed(options.aiSeed);
  const roster = normalizeTransformRoster(options.roster, p1, p2);
  const match: MatchSnapshot = {
    fighters: [createFighter(1, p1, -START_DISTANCE / 2, maxHealth), createFighter(2, p2, START_DISTANCE / 2, maxHealth)],
    roster,
    stage,
    mode,
    cpuDifficulty,
    aiSeed,
    roundAiSeed: makeRoundAiSeed(aiSeed, 1),
    roundTime,
    maxHealth,
    trainingInfiniteHealth: options.trainingInfiniteHealth ?? true,
    introEnabled: options.playIntro ?? false,
    timer: roundTime,
    round: 1,
    countdown: 0,
    winnerSlot: null,
    phase: 'fighting',
    message: '',
    lastHitId: 0,
    combatEvents: [],
    impactEvents: [],
    clashState: createEmptyClashState(),
    visualTimeScale: 1,
    cameraShake: 0
  };
  if (match.introEnabled) beginRoundIntro(match);
  return match;
}

export function stepMatch(match: MatchSnapshot, p1Input: InputFrame, p2Input: InputFrame, dt: number): MatchSnapshot {
  const next = cloneMatch(match);
  next.cameraShake = 0;

  if (next.phase === 'matchOver') return next;

  if (next.phase === 'intro') {
    next.visualTimeScale = 1;
    next.countdown = Math.max(0, next.countdown - dt);
    if (next.countdown <= 0) {
      next.phase = 'fighting';
      next.message = '';
      next.fighters.forEach((fighter) => {
        fighter.state = 'idle';
        fighter.actionTimer = 0;
        fighter.actionFramesRemaining = 0;
      });
    } else {
      updateRoundIntro(next);
    }
    return next;
  }

  if (next.phase === 'roundOver') {
    next.countdown -= dt;
    updateRoundOverVisuals(next);
    if (next.countdown <= 0) {
      const winner = next.fighters.find((fighter) => fighter.roundsWon >= ROUNDS_TO_WIN);
      if (winner) {
        next.phase = 'matchOver';
        next.winnerSlot = winner.slot;
        next.message = `${winner.character.displayName} wins`;
        next.visualTimeScale = 1;
        next.fighters.forEach((fighter) => {
          fighter.state = fighter.slot === winner.slot ? 'win' : 'lose';
        });
      } else {
        resetRound(next);
      }
    }
    return next;
  }

  const input1 = next.mode === 'cpu' ? makeAiInput(next, next.fighters[0], next.fighters[1], next.timer, next.cpuDifficulty, true, next.aiSeed, next.roundAiSeed) : p1Input;
  const input2 =
    next.mode === 'training'
      ? makeTrainingDummyInput(next.fighters[1])
      : next.mode === 'ai' || next.mode === 'versusCpu' || next.mode === 'cpu'
        ? makeAiInput(next, next.fighters[1], next.fighters[0], next.timer, next.cpuDifficulty, next.mode === 'cpu', next.aiSeed, next.roundAiSeed)
        : p2Input;
  if (isClashActive(next.clashState)) {
    const clashInput1 = next.mode === 'cpu' ? makeAiClashInput(next, 1) : input1;
    const clashInput2 = next.mode === 'ai' || next.mode === 'versusCpu' || next.mode === 'cpu' ? makeAiClashInput(next, 2) : input2;
    handleClashStep(next, clashInput1, clashInput2, dt);
    constrainFightersToStageBounds(next);
    return next;
  }
  applyFighterStep(next, 0, input1, dt);
  applyFighterStep(next, 1, input2, dt);
  resolveFacing(next);
  resolveBodyCollision(next);
  constrainFightersToStageBounds(next);
  resolveHits(next);
  constrainFightersToStageBounds(next);

  const infiniteTimer = isInfiniteRoundTime(next.roundTime);
  next.timer = infiniteTimer || (next.mode === 'training' && next.trainingInfiniteHealth) ? next.roundTime : Math.max(0, next.timer - dt);
  const ko = next.fighters.find((fighter) => fighter.hp <= 0);
  if (next.mode === 'training' && next.trainingInfiniteHealth) {
    refillTrainingHealth(next);
  } else if (ko || (!infiniteTimer && next.timer <= 0)) {
    finishRound(next);
  }

  return next;
}

function normalizeRoundTime(roundTime: number | undefined) {
  if (roundTime !== undefined && roundTime <= 0) return 0;
  return clamp(Math.round(roundTime ?? ROUND_TIME), 30, 99);
}

function normalizeMaxHealth(maxHealth: number | undefined) {
  if (maxHealth === undefined) return undefined;
  if (maxHealth <= 0) return 0;
  return clamp(Math.round(maxHealth), 1, 999);
}

function resolveFighterMaxHealth(character: CharacterDefinition, matchMaxHealth: number | undefined) {
  if (matchMaxHealth === undefined) return character.stats.health;
  if (matchMaxHealth <= 0) return INFINITE_HEALTH_VALUE;
  return matchMaxHealth;
}

function normalizeTransformRoster(roster: CharacterDefinition[] | undefined, p1: CharacterDefinition, p2: CharacterDefinition) {
  const byId = new Map<string, CharacterDefinition>();
  for (const character of roster ?? []) {
    if (character?.id) byId.set(character.id, character);
  }
  byId.set(p1.id, p1);
  byId.set(p2.id, p2);
  return [...byId.values()];
}

function isInfiniteRoundTime(roundTime: number) {
  return roundTime <= 0;
}

export function createEmptyInputs(): [InputFrame, InputFrame] {
  return [emptyInputFrame(), emptyInputFrame()];
}

function makeTrainingDummyInput(dummy: FighterRuntime): InputFrame {
  const input = emptyInputFrame();
  if (dummy.state === 'knockdown' && !dummy.getupStarted) {
    input.confirm = true;
  }
  return input;
}

function createEmptyClashParticipant(): ClashState['p1'] {
  return {
    progress: 0,
    inputs: [],
    completedFrame: null,
    failed: false,
    mistakes: 0,
    lastInput: null
  };
}

function createEmptyClashState(): ClashState {
  return {
    id: 0,
    status: 'none',
    sequence: [],
    elapsedFrames: 0,
    introFrames: CLASH_INTRO_FRAMES,
    inputFrames: CLASH_INPUT_FRAMES,
    resultFrames: CLASH_RESULT_FRAMES,
    winnerSlot: null,
    damage: 0,
    contactPoint: [0, 1.1, 0],
    p1: createEmptyClashParticipant(),
    p2: createEmptyClashParticipant()
  };
}

function isClashActive(clashState: ClashState | undefined) {
  return Boolean(clashState && clashState.status !== 'none');
}

function handleClashStep(match: MatchSnapshot, p1Input: InputFrame, p2Input: InputFrame, dt: number) {
  const clash = match.clashState;
  if (!isClashActive(clash)) return;
  match.visualTimeScale = 1;
  match.cameraShake = 0;
  const frameDelta = Math.max(1, secondsToFrames(dt));

  if (clash.status === 'intro') {
    clash.elapsedFrames += frameDelta;
    match.message = 'CLASH';
    if (clash.elapsedFrames >= clash.introFrames) {
      clash.status = 'input';
      clash.elapsedFrames = 0;
      clash.p1.lastInput = null;
      clash.p2.lastInput = null;
      match.message = '';
    }
    return;
  }

  if (clash.status === 'input') {
    processClashParticipant(clash, clash.p1, p1Input);
    processClashParticipant(clash, clash.p2, p2Input);
    clash.elapsedFrames += frameDelta;
    const p1Resolved = clash.p1.failed || clash.p1.completedFrame !== null;
    const p2Resolved = clash.p2.failed || clash.p2.completedFrame !== null;
    if ((p1Resolved && p2Resolved) || clash.elapsedFrames >= clash.inputFrames) {
      resolveClashOutcome(match);
    }
    return;
  }

  if (clash.status === 'result') {
    clash.elapsedFrames += frameDelta;
    if (clash.elapsedFrames >= clash.resultFrames) {
      match.clashState = createEmptyClashState();
      match.message = '';
    }
  }
}

function processClashParticipant(clash: ClashState, participant: ClashState['p1'], input: InputFrame) {
  if (participant.failed || participant.completedFrame !== null) return;
  const button = getPressedClashButton(input);
  if (button === participant.lastInput) return;
  participant.lastInput = button;
  if (!button) return;
  participant.inputs = [...participant.inputs, button].slice(-CLASH_SEQUENCE_LENGTH);
  const expected = clash.sequence[participant.progress];
  if (button !== expected) {
    participant.failed = true;
    participant.mistakes += 1;
    return;
  }
  participant.progress += 1;
  if (participant.progress >= clash.sequence.length) {
    participant.completedFrame = clash.elapsedFrames;
  }
}

function getPressedClashButton(input: InputFrame): MoveInput | null {
  return clashInputOrder.find((action) => input[action]) ?? null;
}

function makeAiClashInput(match: MatchSnapshot, slot: 1 | 2): InputFrame {
  const input = emptyInputFrame();
  const clash = match.clashState;
  if (clash.status !== 'input') return input;
  const participant = slot === 1 ? clash.p1 : clash.p2;
  if (participant.failed || participant.completedFrame !== null) return input;
  const elapsed = clash.elapsedFrames;
  const difficulty = match.cpuDifficulty;
  const reactionDelay =
    difficulty <= 1 ? 38 :
    difficulty === 2 ? 29 :
    difficulty === 3 ? 21 :
    difficulty === 4 ? 11 :
    7;
  const perButtonDelay = difficulty <= 2 ? 18 : difficulty === 3 ? 14 : difficulty === 4 ? 8 : 6;
  const targetFrame = reactionDelay + participant.progress * perButtonDelay;
  if (elapsed < targetFrame) return input;
  const mistakeChance =
    difficulty <= 1 ? 0.42 :
    difficulty === 2 ? 0.28 :
    difficulty === 3 ? 0.18 :
    difficulty === 4 ? 0.07 :
    0.035;
  const roll = seededUnit(match.aiSeed + match.roundAiSeed + clash.id * 17 + slot * 101, participant.progress + Math.floor(elapsed / 8));
  const expected = clash.sequence[participant.progress] ?? 'jab';
  const chosen =
    roll < mistakeChance
      ? clashInputOrder[(clashInputOrder.indexOf(expected) + 1 + positiveModulo(Math.floor(roll * 1000), clashInputOrder.length - 1)) % clashInputOrder.length]
      : expected;
  input[chosen] = true;
  return input;
}

function createFighter(slot: 1 | 2, character: CharacterDefinition, x: number, matchMaxHealth?: number, baseCharacter = character): FighterRuntime {
  const maxHp = resolveFighterMaxHealth(character, matchMaxHealth);
  return {
    slot,
    character,
    baseCharacter,
    hp: maxHp,
    maxHp,
    ki: 0,
    transformOvercharge: 0,
    transformReadyTimer: 0,
    transformStartupFrames: 0,
    transformTargetId: null,
    transformSmokeFrames: 0,
    position: { x, y: 0, z: 0 },
    velocityY: 0,
    facing: slot === 1 ? 1 : -1,
    facingYaw: slot === 1 ? Math.PI / 2 : -Math.PI / 2,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    sidestepOrbitSign: slot === 1 ? 1 : -1,
    dashForwardFrames: 0,
    dashForwardCooldownFrames: 0,
    walkDirection: 0,
    jumpInputHeld: false,
    currentMove: null,
    moveInstanceId: 0,
    actionTimer: 0,
    actionFramesRemaining: 0,
    moveFrame: 0,
    chargePhase: 'none',
    chargeFrame: 0,
    chargeCommitted: false,
    hitConnected: false,
    hitConfirmed: false,
    whiffRecoveryApplied: false,
    commandHistory: [],
    previousDirectionToken: 'N',
    comboTimer: 0,
    comboStep: 0,
    comboSequence: [],
    comboUsedKeys: [],
    comboHits: 0,
    comboDamage: 0,
    bufferedMoveInput: null,
    bufferedMoveFrames: 0,
    aiRecentComboKeys: [],
    previousAttackInputs: { jab: false, kick: false, heavy: false, special: false },
    wasCrouching: false,
    roundsWon: 0,
    stunTimer: 0,
    stunFramesRemaining: 0,
    blockstunFramesRemaining: 0,
    blockPunishWindowFrames: 0,
    forcedCrouchFrames: 0,
    getupInvulnerableFrames: 0,
    getupForward: 0,
    getupLane: 0,
    getupStarted: false,
    getupAction: 'none',
    getupTotalFrames: 0,
    juggleDamage: 0,
    juggleSequenceDamage: 0,
    juggleTornadoCount: 0,
    juggleGravityScale: JUGGLE_GRAVITY_SCALE,
    throwOpponentSlot: null,
    throwCaptorSlot: null,
    throwAnchorMove: null,
    throwHoldFrames: 0,
    throwMaxHoldFrames: THROW_MAX_HOLD_FRAMES,
    throwJabActive: false,
    throwJabCooldownFrames: 0,
    throwJabHitConnected: false,
    throwEscapeProgress: 0,
    throwEscapeGoal: 0,
    throwShakeFrames: 0,
    blockFlash: 0,
    hitFlash: 0,
    shadowClone: null,
    shadowCloneChargeConsumed: false
  };
}

function applyFighterStep(match: MatchSnapshot, fighterIndex: 0 | 1, input: InputFrame, dt: number) {
  const fighter = match.fighters[fighterIndex];
  const opponent = match.fighters[fighterIndex === 0 ? 1 : 0];
  const previousPosition = { ...fighter.position };
  const finishFighterStep = () => {
    constrainFighterToStageBounds(match, fighter);
    applyShadowCloneMovementDelta(fighter, previousPosition);
    constrainShadowCloneToStageBounds(match, fighter);
    syncShadowClonePassiveState(fighter);
    updateAttackInputMemory(fighter, input);
  };
  const jumpPressed = input.up && !fighter.jumpInputHeld;
  const frameDelta = secondsToFrames(dt);
  fighter.jumpInputHeld = input.up;
  fighter.blockFlash = 0;
  fighter.hitFlash = 0;
  updateShadowClone(fighter, dt);
  updateTransformRuntime(fighter, dt);
  fighter.bufferedMoveFrames = Math.max(0, fighter.bufferedMoveFrames - frameDelta);
  if (fighter.bufferedMoveFrames === 0) fighter.bufferedMoveInput = null;
  fighter.comboTimer = Math.max(0, fighter.comboTimer - dt);
  if (fighter.comboTimer === 0 && fighter.state !== 'attack') {
    fighter.comboStep = 0;
    fighter.comboSequence = [];
    fighter.comboUsedKeys = [];
    fighter.comboHits = 0;
    fighter.comboDamage = 0;
  }
  fighter.sidestepTimer = Math.max(0, fighter.sidestepTimer - dt);
  fighter.dashForwardFrames = Math.max(0, fighter.dashForwardFrames - frameDelta);
  fighter.dashForwardCooldownFrames = Math.max(0, fighter.dashForwardCooldownFrames - frameDelta);
  fighter.getupInvulnerableFrames = Math.max(0, fighter.getupInvulnerableFrames - frameDelta);
  updateCommandHistory(fighter, opponent, input, dt);
  if (fighter.state === 'throwHold' || fighter.state === 'throwHeld') {
    handleThrowCaptureStep(match, fighter, opponent, input, dt);
    finishFighterStep();
    return;
  }
  if (fighter.state === 'transform') {
    handleTransformStep(match, fighter, dt);
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  const allLimbInput = isAllLimbInput(input);
  const transformDestination = allLimbInput ? resolveTransformDestination(match, fighter) : null;
  const transformRequested = allLimbInput && !isAllPreviousLimbInput(fighter);
  if (transformRequested && transformDestination && canStartTransform(fighter)) {
    startTransform(fighter, transformDestination);
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  const freshMoveInput = transformDestination ? null : getFreshMoveInput(fighter, input);
  if (freshMoveInput && canBufferFreshMoveInput(fighter)) bufferMoveInput(fighter, freshMoveInput);

  if (
    fighter.state === 'chargeKi' &&
    freshMoveInput &&
    input.charge &&
    fighter.ki >= getChargedMoveKiCost(fighter, opponent, input, freshMoveInput) &&
    fighter.chargePhase !== 'startup' &&
    fighter.chargePhase !== 'recovery'
  ) {
    clearKiChargeState(fighter);
    startComboAttack(fighter, opponent, input, freshMoveInput, 'neutral');
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (fighter.state === 'chargeKi') {
    handleKiChargeStep(fighter, input, dt, hasForwardTransform(match, fighter));
    maybeSpawnShadowCloneFromCharge(fighter, opponent);
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (fighter.actionFramesRemaining > 0) {
    const previousMoveFrame = fighter.moveFrame;
    fighter.moveFrame += frameDelta;
    applyAttackForwardForce(fighter, opponent, previousMoveFrame, fighter.moveFrame);
    fighter.actionFramesRemaining = Math.max(0, fighter.actionFramesRemaining - frameDelta);
    applyWhiffRecoveryIfNeeded(fighter);
    fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
    if (fighter.actionFramesRemaining === 0 && fighter.state !== 'knockdown' && fighter.state !== 'getup') {
      completeActionLock(fighter, input);
    }
  } else if (fighter.actionTimer > 0) {
    fighter.actionTimer = Math.max(0, fighter.actionTimer - dt);
    if (fighter.actionTimer === 0 && fighter.state !== 'knockdown' && fighter.state !== 'getup') {
      completeActionLock(fighter, input);
    }
  }

  if (fighter.stunFramesRemaining > 0 || fighter.blockstunFramesRemaining > 0) {
    fighter.stunFramesRemaining = Math.max(0, fighter.stunFramesRemaining - frameDelta);
    fighter.blockstunFramesRemaining = Math.max(0, fighter.blockstunFramesRemaining - frameDelta);
    fighter.stunTimer = framesToSeconds(Math.max(fighter.stunFramesRemaining, fighter.blockstunFramesRemaining));
    if (fighter.stunFramesRemaining === 0 && fighter.blockstunFramesRemaining === 0 && fighter.state !== 'knockdown') {
      fighter.state = getPostLockState(fighter, input);
    }
  } else if (fighter.stunTimer > 0) {
    fighter.stunTimer = Math.max(0, fighter.stunTimer - dt);
    if (fighter.stunTimer === 0 && fighter.state !== 'knockdown') {
      fighter.state = getPostLockState(fighter, input);
    }
  }
  if (fighter.blockstunFramesRemaining === 0) {
    fighter.blockPunishWindowFrames = Math.max(0, fighter.blockPunishWindowFrames - frameDelta);
  }

  if (fighter.state === 'knockdown' || fighter.state === 'getup') {
    handleKnockdownStep(fighter, opponent, input, dt);
    if (fighter.state === 'getup' && fighter.actionFramesRemaining === 0 && fighter.actionTimer === 0 && fighter.position.y === 0 && fighter.velocityY === 0) {
      fighter.state = 'idle';
      fighter.getupForward = 0;
      fighter.getupLane = 0;
      fighter.getupStarted = false;
      fighter.getupAction = 'none';
      fighter.getupTotalFrames = 0;
      fighter.wasCrouching = true;
      fighter.getupInvulnerableFrames = 0;
      fighter.juggleDamage = 0;
      fighter.juggleSequenceDamage = 0;
      fighter.juggleTornadoCount = 0;
      fighter.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
    }
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (fighter.state === 'juggle') {
    const landed = applyGravity(fighter, dt, getFighterJuggleGravityScale(fighter));
    if (landed) {
      applyJuggleLandingRecovery(fighter);
    }
    if (!isAirborne(fighter) && fighter.stunFramesRemaining === 0 && fighter.actionFramesRemaining === 0 && fighter.stunTimer === 0 && fighter.actionTimer === 0) {
      fighter.state = 'idle';
      fighter.juggleDamage = 0;
      fighter.juggleSequenceDamage = 0;
      fighter.juggleTornadoCount = 0;
      fighter.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
    }
    finishFighterStep();
    return;
  }

  if (fighter.state === 'hit' && isAirborne(fighter)) {
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (fighter.state === 'attack' && (fighter.actionFramesRemaining > 0 || fighter.actionTimer > 0)) {
    const cancelMove = freshMoveInput;
    if (cancelMove && shouldDropSameMoveRecoveryBuffer(fighter, opponent, input, cancelMove)) {
      clearBufferedMoveInput(fighter);
    } else if (cancelMove && canComboCancel(fighter) && startComboAttack(fighter, opponent, input, cancelMove, 'cancel')) {
      clearBufferedMoveInput(fighter);
      applyGravity(fighter, dt);
      finishFighterStep();
      return;
    }
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (fighter.stunFramesRemaining > 0 || fighter.blockstunFramesRemaining > 0) {
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (fighter.forcedCrouchFrames > 0 && !input.down && fighter.position.y === 0 && fighter.velocityY === 0) {
    fighter.forcedCrouchFrames = Math.max(0, fighter.forcedCrouchFrames - frameDelta);
    fighter.state = 'crouch';
    fighter.wasCrouching = true;
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }
  if (input.down) fighter.forcedCrouchFrames = 0;

  const moveInput = fighter.bufferedMoveInput ?? freshMoveInput;
  if (moveInput) {
    const chainMode = fighter.comboTimer > 0 && canLinkAfterHit(fighter, opponent) ? 'link' : 'neutral';
    if (startComboAttack(fighter, opponent, input, moveInput, chainMode)) {
      clearBufferedMoveInput(fighter);
    }
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (input.charge) {
    startKiCharge(fighter);
    maybeSpawnShadowCloneFromCharge(fighter, opponent);
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  const forward = resolveForwardInput(fighter, opponent, input);
  fighter.walkDirection = 0;
  const holdingBack = forward < 0;
  const blocking = input.block || holdingBack;
  const laneWalk = input.sidewalkUp ? -1 : input.sidewalkDown ? 1 : 0;
  const sidestepTap = input.sidestepUp ? -1 : input.sidestepDown ? 1 : 0;
  const grounded = fighter.position.y === 0 && fighter.velocityY === 0;
  const crouching = input.down && grounded;
  const jumping = isAirborne(fighter);
  const speedScale = blocking ? 0.42 : crouching ? 0.18 : 1;
  const dashForwardRequested = input.dashForward && forward > 0 && grounded && !blocking && !crouching && !jumping && fighter.dashForwardCooldownFrames === 0;

  if (jumpPressed && grounded && !blocking && !input.down) {
    fighter.velocityY = fighter.character.stats.jumpForce;
    fighter.position.y = Math.max(fighter.position.y, 0.18);
    fighter.state = 'jump';
  }

  if (dashForwardRequested) {
    moveAlongOpponentAxis(fighter, opponent, getDashForwardDistance(fighter));
    fighter.dashForwardFrames = DASH_FORWARD_ANIMATION_FRAMES;
    fighter.dashForwardCooldownFrames = DASH_FORWARD_COOLDOWN_FRAMES;
  }

  if (sidestepTap !== 0 && fighter.sidestepTimer === 0) {
    fighter.sidestepTimer = 0.18;
    fighter.sidestepDirection = sidestepTap;
    fighter.sidestepOrbitSign = getBaseSidestepOrbitSign(fighter);
  } else if (laneWalk !== 0 && fighter.sidestepTimer === 0 && fighter.sidestepDirection !== laneWalk) {
    fighter.sidestepDirection = laneWalk;
    fighter.sidestepOrbitSign = getBaseSidestepOrbitSign(fighter);
  } else if (laneWalk === 0 && fighter.sidestepTimer === 0) {
    fighter.sidestepDirection = 0;
  }

  const sidestep = fighter.sidestepTimer > 0 ? fighter.sidestepDirection : laneWalk;

  if (blocking && crouching && grounded && !jumping) {
    fighter.state = 'crouchBlock';
  } else if (blocking && grounded && !jumping) {
    fighter.state = 'block';
  } else if (crouching) {
    fighter.state = 'crouch';
  } else if (jumping || fighter.velocityY > 0) {
    fighter.state = 'jump';
  } else if (fighter.sidestepTimer > 0) {
    fighter.state = 'sidestep';
  } else if (laneWalk !== 0) {
    fighter.state = 'walk';
  } else if (forward !== 0) {
    fighter.state = 'walk';
  } else {
    fighter.state = 'idle';
  }

  if (forward !== 0) {
    fighter.walkDirection = forward > 0 ? 1 : -1;
    moveAlongOpponentAxis(fighter, opponent, forward * fighter.character.stats.speed * speedScale * dt);
  }
  if (sidestep !== 0) {
    const sidestepScale = fighter.sidestepTimer > 0 ? SIDESTEP_TAP_SCALE : SIDEWALK_SCALE;
    const sideSign = fighter.sidestepOrbitSign || getOpponentSideSign(fighter, opponent);
    orbitAroundOpponent(fighter, opponent, -sidestep * sideSign * fighter.character.stats.sidestepSpeed * sidestepScale * speedScale * dt);
  }

  applyGravity(fighter, dt);
  fighter.wasCrouching = crouching;
  finishFighterStep();
}

function handleThrowCaptureStep(match: MatchSnapshot, fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, dt: number) {
  const frameDelta = secondsToFrames(dt);
  fighter.velocityY = 0;
  fighter.position.y = 0;
  fighter.blockFlash = 0;
  fighter.hitFlash = 0;
  resetKiChargeRuntime(fighter);
  fighter.throwShakeFrames = Math.max(0, fighter.throwShakeFrames - frameDelta);

  if (fighter.state === 'throwHeld') {
    const captor = match.fighters.find((candidate) => candidate.slot === fighter.throwCaptorSlot);
    if (!captor || captor.state !== 'throwHold') {
      clearThrowRuntime(fighter);
      fighter.state = 'idle';
      return;
    }
    applyThrowHoldPosition(captor, fighter);
    const freshMashes = countFreshAttackPresses(fighter, input);
    if (freshMashes > 0) {
      fighter.throwEscapeProgress += freshMashes;
      fighter.throwShakeFrames = THROW_SHAKE_FRAMES;
    }
    if (fighter.throwEscapeProgress >= fighter.throwEscapeGoal && fighter.throwEscapeGoal > 0) {
      releaseThrowCapture(captor, fighter);
    }
    return;
  }

  const defender = match.fighters.find((candidate) => candidate.slot === fighter.throwOpponentSlot);
  if (!defender || defender.state !== 'throwHeld') {
    clearThrowRuntime(fighter);
    fighter.state = 'idle';
    fighter.currentMove = null;
    return;
  }
  fighter.throwHoldFrames += frameDelta;
  fighter.throwJabCooldownFrames = Math.max(0, fighter.throwJabCooldownFrames - frameDelta);
  applyThrowHoldPosition(fighter, defender);
  if (fighter.throwJabActive) {
    handleThrowHoldJabStep(match, fighter, defender, frameDelta);
  } else {
    restoreThrowAnchorPose(fighter);
    if (fighter.throwJabCooldownFrames === 0 && input.jab && !fighter.previousAttackInputs.jab) {
      startThrowHoldJab(fighter);
    }
  }
  if (fighter.throwHoldFrames >= fighter.throwMaxHoldFrames) {
    releaseThrowCapture(fighter, defender);
  }
}

function countFreshAttackPresses(fighter: FighterRuntime, input: InputFrame) {
  return moveInputs.reduce((count, action) => count + (input[action] && !fighter.previousAttackInputs[action] ? 1 : 0), 0);
}

function startThrowHoldJab(attacker: FighterRuntime) {
  const move = getThrowHoldJabMove(attacker);
  if (!move) return;
  attacker.currentMove = move;
  attacker.moveInstanceId += 1;
  attacker.moveFrame = 0;
  attacker.actionFramesRemaining = totalMoveFrames(move);
  attacker.actionTimer = framesToSeconds(attacker.actionFramesRemaining);
  attacker.hitConnected = false;
  attacker.hitConfirmed = false;
  attacker.whiffRecoveryApplied = false;
  attacker.throwJabActive = true;
  attacker.throwJabHitConnected = false;
  attacker.throwJabCooldownFrames = totalMoveFrames(move) + Math.max(0, -move.onHitFrames);
}

function handleThrowHoldJabStep(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime, frameDelta: number) {
  const move = attacker.currentMove;
  if (!move) {
    restoreThrowAnchorPose(attacker);
    return;
  }
  const previousMoveFrame = attacker.moveFrame;
  attacker.moveFrame += frameDelta;
  attacker.actionFramesRemaining = Math.max(0, attacker.actionFramesRemaining - frameDelta);
  attacker.actionTimer = framesToSeconds(attacker.actionFramesRemaining);
  if (!attacker.throwJabHitConnected && didMoveBecomeActive(move, previousMoveFrame, attacker.moveFrame)) {
    applyThrowHoldJabHit(match, attacker, defender, move);
    if (attacker.state !== 'throwHold') return;
  }
  if (attacker.actionFramesRemaining === 0 || attacker.moveFrame >= totalMoveFrames(move)) {
    restoreThrowAnchorPose(attacker);
  }
}

function didMoveBecomeActive(move: MoveDefinition, previousMoveFrame: number, currentMoveFrame: number) {
  return previousMoveFrame < move.startupFrames + move.activeFrames && currentMoveFrame >= move.startupFrames;
}

function applyThrowHoldJabHit(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition) {
  attacker.throwJabHitConnected = true;
  attacker.hitConnected = true;
  attacker.hitConfirmed = true;
  if (!moveUsesKi(move)) {
    attacker.ki = clamp(attacker.ki + KI_HIT_GAIN + Math.max(0, Math.round(move.damage * 0.35)), 0, KI_MAX);
  }
  attacker.comboHits = Math.max(1, attacker.comboHits + 1);
  attacker.comboDamage = Math.max(0, attacker.comboDamage + move.damage);
  const identity = getMoveIdentity(move);
  if (!attacker.comboUsedKeys.includes(identity)) {
    attacker.comboUsedKeys = [...attacker.comboUsedKeys, identity].slice(-8);
  }
  attacker.aiRecentComboKeys = addRecentComboKey(attacker.aiRecentComboKeys, identity);
  defender.hp = Math.max(0, defender.hp - move.damage);
  defender.hitFlash = Math.max(defender.hitFlash, 0.12);
  defender.throwShakeFrames = Math.max(defender.throwShakeFrames, THROW_SHAKE_FRAMES);
  const impactId = nextHitEventId(match);
  const impactPosition: [number, number, number] = [defender.position.x, defender.position.y + 1.12, defender.position.z];
  pushImpactSparkEvent(match, impactId, attacker, defender, move, 'hit', {
    comboHits: attacker.comboHits,
    launched: false,
    juggled: false,
    tornado: false,
    kiBurst: Boolean(move.kiBurst)
  }, impactPosition);
  pushCombatPopupEvent(match, impactId, attacker, move, attacker.comboHits >= 2 ? 'combo' : null, {
    launched: false,
    juggled: false,
    tornado: false,
    kiBurst: Boolean(move.kiBurst)
  });
  if (defender.hp <= 0) {
    releaseThrowCapture(attacker, defender);
  }
}

function restoreThrowAnchorPose(attacker: FighterRuntime) {
  const anchor = attacker.throwAnchorMove;
  attacker.throwJabActive = false;
  attacker.throwJabHitConnected = false;
  attacker.currentMove = anchor;
  attacker.actionFramesRemaining = 0;
  attacker.actionTimer = 0;
  attacker.moveFrame = anchor ? totalMoveFrames(anchor) : attacker.moveFrame;
  attacker.hitConnected = true;
  attacker.hitConfirmed = true;
}

function getThrowHoldJabMove(attacker: FighterRuntime): MoveDefinition | null {
  const baseMove = attacker.character.moves.find((candidate) => candidate.input === 'jab');
  if (!baseMove) return null;
  const move = applyMoveOverrides(attacker.character, baseMove, baseMove, baseInputToAnimationKey.jab);
  return {
    ...move,
    input: 'jab',
    animationKey: move.animationKey ?? baseInputToAnimationKey.jab,
    jumpBeforeMove: false,
    forwardForce: 0,
    launchHeight: 0,
    tornado: false,
    knockdown: false,
    throwCapture: false
  };
}

function startThrowCapture(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition) {
  attacker.state = 'throwHold';
  attacker.currentMove = move;
  attacker.moveFrame = totalMoveFrames(move);
  attacker.actionFramesRemaining = 0;
  attacker.actionTimer = 0;
  attacker.velocityY = 0;
  attacker.position.y = 0;
  attacker.hitConfirmed = true;
  attacker.throwOpponentSlot = defender.slot;
  attacker.throwCaptorSlot = null;
  attacker.throwAnchorMove = move;
  attacker.throwHoldFrames = 0;
  attacker.throwMaxHoldFrames = THROW_MAX_HOLD_FRAMES;
  attacker.throwJabActive = false;
  attacker.throwJabCooldownFrames = 0;
  attacker.throwJabHitConnected = false;
  attacker.throwEscapeProgress = 0;
  attacker.throwEscapeGoal = 0;
  attacker.throwShakeFrames = 0;

  defender.state = 'throwHeld';
  defender.currentMove = null;
  defender.moveFrame = 0;
  defender.actionFramesRemaining = 0;
  defender.actionTimer = 0;
  defender.stunFramesRemaining = 0;
  defender.blockstunFramesRemaining = 0;
  defender.stunTimer = 0;
  defender.velocityY = 0;
  defender.position.y = 0;
  defender.throwOpponentSlot = null;
  defender.throwCaptorSlot = attacker.slot;
  defender.throwAnchorMove = null;
  defender.throwHoldFrames = 0;
  defender.throwMaxHoldFrames = THROW_MAX_HOLD_FRAMES;
  defender.throwJabActive = false;
  defender.throwJabCooldownFrames = 0;
  defender.throwJabHitConnected = false;
  defender.throwEscapeProgress = 0;
  defender.throwEscapeGoal = getThrowEscapeGoal(defender);
  defender.throwShakeFrames = 0;
  defender.juggleDamage = 0;
  defender.juggleSequenceDamage = 0;
  defender.juggleTornadoCount = 0;
  defender.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
  applyThrowHoldPosition(attacker, defender);
}

function getThrowEscapeGoal(defender: FighterRuntime) {
  const hpPercent = clamp(defender.hp / Math.max(1, defender.maxHp), 0, 1);
  return Math.round(18 - hpPercent * 10);
}

function applyThrowHoldPosition(attacker: FighterRuntime, defender: FighterRuntime) {
  defender.position.x = attacker.position.x + attacker.facing * THROW_HAND_FORWARD_OFFSET;
  defender.position.y = 0;
  defender.position.z = attacker.position.z;
  defender.facing = attacker.facing === 1 ? -1 : 1;
  defender.facingYaw = defender.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  defender.velocityY = 0;
}

function releaseThrowCapture(attacker: FighterRuntime, defender: FighterRuntime) {
  const releaseX = attacker.position.x + attacker.facing * THROW_RELEASE_SPACING;
  const releaseZ = attacker.position.z;
  clearThrowRuntime(attacker);
  clearThrowRuntime(defender);
  attacker.state = 'idle';
  defender.state = 'idle';
  attacker.currentMove = null;
  defender.currentMove = null;
  attacker.moveFrame = 0;
  defender.moveFrame = 0;
  attacker.velocityY = 0;
  defender.velocityY = 0;
  attacker.position.y = 0;
  defender.position = { x: releaseX, y: 0, z: releaseZ };
  attacker.actionFramesRemaining = THROW_RELEASE_RECOVERY_FRAMES;
  defender.actionFramesRemaining = THROW_RELEASE_RECOVERY_FRAMES;
  attacker.actionTimer = framesToSeconds(THROW_RELEASE_RECOVERY_FRAMES);
  defender.actionTimer = framesToSeconds(THROW_RELEASE_RECOVERY_FRAMES);
  defender.facing = attacker.facing === 1 ? -1 : 1;
  defender.facingYaw = defender.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
}

function clearThrowRuntime(fighter: FighterRuntime) {
  fighter.throwOpponentSlot = null;
  fighter.throwCaptorSlot = null;
  fighter.throwAnchorMove = null;
  fighter.throwHoldFrames = 0;
  fighter.throwMaxHoldFrames = THROW_MAX_HOLD_FRAMES;
  fighter.throwJabActive = false;
  fighter.throwJabCooldownFrames = 0;
  fighter.throwJabHitConnected = false;
  fighter.throwEscapeProgress = 0;
  fighter.throwEscapeGoal = 0;
  fighter.throwShakeFrames = 0;
}

function bufferMoveInput(fighter: FighterRuntime, moveInput: MoveInput) {
  fighter.bufferedMoveInput = moveInput;
  fighter.bufferedMoveFrames = ATTACK_BUFFER_FRAMES;
}

function clearBufferedMoveInput(fighter: FighterRuntime) {
  fighter.bufferedMoveInput = null;
  fighter.bufferedMoveFrames = 0;
}

function canBufferFreshMoveInput(fighter: FighterRuntime) {
  if (fighter.state === 'attack') return false;
  if (fighter.state === 'juggle' || fighter.state === 'knockdown' || fighter.state === 'getup' || fighter.state === 'chargeKi' || fighter.state === 'transform' || fighter.state === 'throwHold' || fighter.state === 'throwHeld') return false;
  return fighter.stunFramesRemaining === 0 && fighter.blockstunFramesRemaining === 0 && fighter.actionFramesRemaining === 0;
}

function isAllLimbInput(input: InputFrame) {
  return input.jab && input.heavy && input.kick && input.special;
}

function isAllPreviousLimbInput(fighter: FighterRuntime) {
  return fighter.previousAttackInputs.jab && fighter.previousAttackInputs.heavy && fighter.previousAttackInputs.kick && fighter.previousAttackInputs.special;
}

function getTransformTarget(match: MatchSnapshot, character: CharacterDefinition) {
  if (!character.hasTransform || !character.transformCharacterId || character.transformCharacterId === character.id) return null;
  return match.roster.find((candidate) => candidate.id === character.transformCharacterId) ?? null;
}

function hasForwardTransform(match: MatchSnapshot, fighter: FighterRuntime) {
  return Boolean(getTransformTarget(match, fighter.character));
}

function isTransformed(fighter: FighterRuntime) {
  return fighter.character.id !== fighter.baseCharacter.id;
}

function isTransformReady(fighter: FighterRuntime) {
  return fighter.ki >= KI_MAX && fighter.transformOvercharge > 0 && fighter.transformReadyTimer > 0;
}

function resolveTransformDestination(match: MatchSnapshot, fighter: FighterRuntime): CharacterDefinition | null {
  const forwardTarget = getTransformTarget(match, fighter.character);
  if (forwardTarget && isTransformReady(fighter)) return forwardTarget;
  if (isTransformed(fighter)) return fighter.baseCharacter;
  return null;
}

function canStartTransform(fighter: FighterRuntime) {
  if (fighter.state === 'transform') return false;
  if (fighter.state === 'knockdown' || fighter.state === 'getup' || fighter.state === 'juggle' || fighter.state === 'hit' || fighter.state === 'throwHold' || fighter.state === 'throwHeld') return false;
  if (fighter.stunFramesRemaining > 0 || fighter.blockstunFramesRemaining > 0) return false;
  if (fighter.state === 'chargeKi') return fighter.chargePhase !== 'startup' && fighter.chargePhase !== 'recovery';
  return fighter.actionFramesRemaining === 0 && fighter.actionTimer === 0;
}

function startTransform(fighter: FighterRuntime, target: CharacterDefinition) {
  clearKiChargeState(fighter);
  fighter.state = 'transform';
  fighter.currentMove = null;
  fighter.moveInstanceId += 1;
  fighter.actionFramesRemaining = TRANSFORM_STARTUP_FRAMES;
  fighter.actionTimer = framesToSeconds(TRANSFORM_STARTUP_FRAMES);
  fighter.transformStartupFrames = TRANSFORM_STARTUP_FRAMES;
  fighter.transformTargetId = target.id;
  fighter.transformSmokeFrames = TRANSFORM_SMOKE_FRAMES;
  fighter.moveFrame = 0;
  fighter.velocityY = 0;
  fighter.position.y = 0;
  fighter.stunFramesRemaining = 0;
  fighter.blockstunFramesRemaining = 0;
  fighter.blockPunishWindowFrames = 0;
  fighter.stunTimer = 0;
  fighter.forcedCrouchFrames = 0;
  fighter.bufferedMoveInput = null;
  fighter.bufferedMoveFrames = 0;
  fighter.shadowClone = null;
  resetTransformCharge(fighter);
}

function handleTransformStep(match: MatchSnapshot, fighter: FighterRuntime, dt: number) {
  const frameDelta = secondsToFrames(dt);
  fighter.moveFrame += frameDelta;
  fighter.transformStartupFrames = Math.max(0, fighter.transformStartupFrames - frameDelta);
  fighter.actionFramesRemaining = fighter.transformStartupFrames;
  fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
  if (fighter.transformStartupFrames > 0) return;

  const target = fighter.transformTargetId
    ? match.roster.find((character) => character.id === fighter.transformTargetId)
    : null;
  completeTransform(fighter, target ?? fighter.character, match.maxHealth);
}

function completeTransform(fighter: FighterRuntime, target: CharacterDefinition, matchMaxHealth: number | undefined) {
  const hpPercent = clamp(fighter.hp / Math.max(1, fighter.maxHp), 0, 1);
  fighter.character = target;
  fighter.maxHp = resolveFighterMaxHealth(target, matchMaxHealth);
  fighter.hp = Math.max(1, Math.min(fighter.maxHp, Math.round(fighter.maxHp * hpPercent)));
  fighter.state = 'idle';
  fighter.currentMove = null;
  fighter.actionFramesRemaining = 0;
  fighter.actionTimer = 0;
  fighter.moveFrame = 0;
  fighter.transformStartupFrames = 0;
  fighter.transformTargetId = null;
  fighter.comboTimer = 0;
  fighter.comboStep = 0;
  fighter.comboSequence = [];
  fighter.comboUsedKeys = [];
  fighter.comboHits = 0;
  fighter.comboDamage = 0;
  fighter.aiRecentComboKeys = [];
  resetTransformCharge(fighter);
}

function updateTransformRuntime(fighter: FighterRuntime, dt: number) {
  const frameDelta = secondsToFrames(dt);
  fighter.transformSmokeFrames = Math.max(0, fighter.transformSmokeFrames - frameDelta);
  if (fighter.state === 'transform') return;
  if (fighter.transformReadyTimer <= 0) return;
  fighter.transformReadyTimer = Math.max(0, fighter.transformReadyTimer - dt);
  fighter.transformOvercharge = Math.max(0, fighter.transformOvercharge - (KI_MAX / TRANSFORM_READY_SECONDS) * dt);
  if (fighter.transformReadyTimer === 0 || fighter.transformOvercharge <= 0) {
    fighter.transformReadyTimer = 0;
    fighter.transformOvercharge = 0;
  }
}

function resetTransformCharge(fighter: FighterRuntime) {
  fighter.ki = 0;
  fighter.transformOvercharge = 0;
  fighter.transformReadyTimer = 0;
}

function clearTransformOverchargeIfKiBelowFull(fighter: FighterRuntime) {
  if (fighter.ki >= KI_MAX) return;
  fighter.transformOvercharge = 0;
  fighter.transformReadyTimer = 0;
}

function startKiCharge(fighter: FighterRuntime) {
  const move = buildKiChargeMove(fighter.character);
  fighter.forcedCrouchFrames = 0;
  fighter.currentMove = move;
  fighter.moveInstanceId += 1;
  fighter.state = 'chargeKi';
  fighter.chargePhase = 'startup';
  fighter.chargeFrame = 0;
  fighter.chargeCommitted = false;
  fighter.moveFrame = 0;
  fighter.actionFramesRemaining = move.startupFrames;
  fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
  fighter.bufferedMoveInput = null;
  fighter.bufferedMoveFrames = 0;
  fighter.shadowCloneChargeConsumed = false;
}

function handleKiChargeStep(fighter: FighterRuntime, input: InputFrame, dt: number, canOverchargeTransform: boolean) {
  const move = fighter.currentMove ?? buildKiChargeMove(fighter.character);
  fighter.currentMove = move;
  const frameDelta = secondsToFrames(dt);
  const forwardFrames = move.startupFrames + move.activeFrames;

  if (fighter.chargePhase === 'recovery') {
    fighter.chargeFrame += frameDelta;
    fighter.moveFrame = Math.max(0, forwardFrames - fighter.chargeFrame);
    fighter.actionFramesRemaining = Math.max(0, fighter.actionFramesRemaining - frameDelta);
    fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
    if (fighter.actionFramesRemaining === 0) clearKiChargeState(fighter);
    return;
  }

  if (!input.charge) {
    if (fighter.chargeCommitted) {
      beginKiChargeRecovery(fighter, move);
    } else {
      clearKiChargeState(fighter);
    }
    return;
  }

  fighter.chargeFrame += frameDelta;
  fighter.moveFrame = Math.min(forwardFrames, fighter.moveFrame + frameDelta);

  if (fighter.chargeFrame < move.startupFrames) {
    fighter.chargePhase = 'startup';
    fighter.actionFramesRemaining = Math.max(0, move.startupFrames - fighter.chargeFrame);
    fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
    return;
  }

  const activeElapsed = fighter.chargeFrame - move.startupFrames;
  fighter.chargePhase = activeElapsed >= move.activeFrames ? 'hold' : 'active';
  fighter.chargeCommitted = activeElapsed >= move.activeFrames;
  fighter.actionFramesRemaining = 0;
  fighter.actionTimer = 0;
  addKiCharge(fighter, KI_CHARGE_PER_SECOND * dt, canOverchargeTransform);
}

function addKiCharge(fighter: FighterRuntime, amount: number, canOverchargeTransform: boolean) {
  if (amount <= 0) return;
  const missingKi = Math.max(0, KI_MAX - fighter.ki);
  const kiGain = Math.min(missingKi, amount);
  fighter.ki = clamp(fighter.ki + kiGain, 0, KI_MAX);
  const overflow = amount - kiGain;
  if (fighter.ki < KI_MAX || !canOverchargeTransform) return;
  fighter.transformOvercharge = clamp(fighter.transformOvercharge + overflow, 0, KI_MAX);
  if (fighter.transformOvercharge >= KI_MAX) {
    fighter.transformOvercharge = KI_MAX;
    fighter.transformReadyTimer = TRANSFORM_READY_SECONDS;
  }
}

function beginKiChargeRecovery(fighter: FighterRuntime, move: MoveDefinition) {
  fighter.chargePhase = 'recovery';
  fighter.chargeFrame = 0;
  fighter.actionFramesRemaining = move.recoveryFrames;
  fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
  fighter.bufferedMoveInput = null;
  fighter.bufferedMoveFrames = 0;
}

function clearKiChargeState(fighter: FighterRuntime) {
  fighter.currentMove = null;
  fighter.state = 'idle';
  resetKiChargeRuntime(fighter);
  fighter.actionFramesRemaining = 0;
  fighter.actionTimer = 0;
  fighter.moveFrame = 0;
  fighter.forcedCrouchFrames = 0;
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
  fighter.shadowCloneChargeConsumed = false;
}

function resetKiChargeRuntime(fighter: FighterRuntime) {
  fighter.chargePhase = 'none';
  fighter.chargeFrame = 0;
  fighter.chargeCommitted = false;
}

function isShadowCloneCharacter(fighter: FighterRuntime) {
  return SHADOW_CLONE_CHARACTER_IDS.has(fighter.character.id.toLowerCase()) || fighter.character.displayName.toLowerCase() === 'naruto';
}

function maybeSpawnShadowCloneFromCharge(fighter: FighterRuntime, opponent: FighterRuntime) {
  if (!isShadowCloneCharacter(fighter)) return;
  if (fighter.shadowClone || fighter.shadowCloneChargeConsumed) return;
  if (fighter.state !== 'chargeKi' || fighter.chargePhase === 'startup' || fighter.chargePhase === 'recovery') return;
  if (fighter.ki < SHADOW_CLONE_KI_THRESHOLD) return;

  const sideSign = fighter.slot === 1 ? -1 : 1;
  const dx = opponent.position.x - fighter.position.x;
  const dz = opponent.position.z - fighter.position.z;
  const distance = Math.hypot(dx, dz) || 1;
  const towardX = dx / distance;
  const towardZ = dz / distance;
  const laneX = -towardZ * sideSign;
  const laneZ = towardX * sideSign;
  fighter.shadowClone = {
    phase: 'active',
    position: {
      x: fighter.position.x + towardX * SHADOW_CLONE_OFFSET_FORWARD + laneX * SHADOW_CLONE_OFFSET_LANE,
      y: Math.max(0, fighter.position.y),
      z: fighter.position.z + towardZ * SHADOW_CLONE_OFFSET_FORWARD + laneZ * SHADOW_CLONE_OFFSET_LANE
    },
    velocityY: 0,
    facing: fighter.facing,
    facingYaw: fighter.facingYaw,
    state: 'idle',
    currentMove: null,
    moveInstanceId: fighter.moveInstanceId + 1,
    moveFrame: 0,
    actionFramesRemaining: 0,
    hitConnected: false,
    attackConsumed: false,
    vanishOnLanding: false,
    spawnSmokeFrames: SHADOW_CLONE_SPAWN_SMOKE_FRAMES,
    vanishSmokeFrames: 0
  };
  fighter.shadowCloneChargeConsumed = true;
}

function startShadowCloneAttack(fighter: FighterRuntime, _opponent: FighterRuntime, move: MoveDefinition) {
  const clone = fighter.shadowClone;
  if (!clone || clone.phase !== 'active' || clone.attackConsumed || clone.state === 'juggle' || clone.state === 'knockdown') return;

  clone.velocityY = 0;
  clone.facing = fighter.facing;
  clone.facingYaw = fighter.facingYaw;
  clone.state = 'attack';
  clone.currentMove = move;
  clone.moveInstanceId += 1;
  clone.moveFrame = 0;
  clone.actionFramesRemaining = totalMoveFrames(move);
  clone.hitConnected = false;
  clone.attackConsumed = true;
  clone.vanishOnLanding = false;
}

function applyShadowCloneMovementDelta(fighter: FighterRuntime, previousPosition: FighterRuntime['position']) {
  const clone = fighter.shadowClone;
  if (!clone || clone.phase !== 'active') return;
  if (isShadowCloneAutonomousState(clone)) return;
  const dx = fighter.position.x - previousPosition.x;
  const dy = fighter.position.y - previousPosition.y;
  const dz = fighter.position.z - previousPosition.z;
  if (dx === 0 && dy === 0 && dz === 0) {
    clone.facing = fighter.facing;
    clone.facingYaw = fighter.facingYaw;
    return;
  }
  clone.position.x += dx;
  clone.position.y = Math.max(0, clone.position.y + dy);
  clone.position.z += dz;
  clone.facing = fighter.facing;
  clone.facingYaw = fighter.facingYaw;
}

function syncShadowClonePassiveState(fighter: FighterRuntime) {
  const clone = fighter.shadowClone;
  if (!clone || clone.phase !== 'active' || isShadowCloneAutonomousState(clone)) return;
  if (!isShadowClonePassiveMirrorState(fighter.state)) return;

  const previousState = clone.state;
  clone.state = fighter.state;
  clone.velocityY = fighter.velocityY;
  clone.facing = fighter.facing;
  clone.facingYaw = fighter.facingYaw;
  clone.currentMove = fighter.state === 'chargeKi' ? fighter.currentMove : null;
  clone.moveFrame = fighter.state === 'chargeKi' ? fighter.moveFrame : 0;
  clone.actionFramesRemaining = fighter.state === 'chargeKi' ? fighter.actionFramesRemaining : 0;
  clone.hitConnected = false;
  if (clone.state !== previousState) clone.moveInstanceId += 1;
}

function isShadowCloneAutonomousState(clone: NonNullable<FighterRuntime['shadowClone']>) {
  return clone.state === 'attack' || clone.state === 'hit' || clone.state === 'juggle' || clone.state === 'knockdown' || clone.state === 'getup';
}

function isShadowClonePassiveMirrorState(state: FighterRuntime['state']) {
  return state === 'idle' || state === 'walk' || state === 'sidestep' || state === 'crouch' || state === 'crouchBlock' || state === 'jump' || state === 'block' || state === 'chargeKi';
}

function updateShadowClone(fighter: FighterRuntime, dt: number) {
  const clone = fighter.shadowClone;
  if (!clone) return;
  const frameDelta = secondsToFrames(dt);
  clone.spawnSmokeFrames = Math.max(0, clone.spawnSmokeFrames - frameDelta);
  clone.vanishSmokeFrames = Math.max(0, clone.vanishSmokeFrames - frameDelta);

  if (clone.phase === 'vanishing') {
    if (clone.vanishSmokeFrames === 0) fighter.shadowClone = null;
    return;
  }

  if (clone.state === 'attack' && clone.currentMove) {
    clone.moveFrame += frameDelta;
    clone.actionFramesRemaining = Math.max(0, clone.actionFramesRemaining - frameDelta);
    if (clone.actionFramesRemaining === 0) {
      scheduleShadowCloneVanish(fighter);
    }
    return;
  }

  if (clone.state === 'juggle' || clone.state === 'hit' || clone.state === 'knockdown') {
    const landed = applyShadowCloneGravity(clone, dt);
    if ((landed || clone.state === 'hit') && clone.vanishOnLanding) {
      scheduleShadowCloneVanish(fighter);
    }
  }
}

function applyShadowCloneGravity(clone: NonNullable<FighterRuntime['shadowClone']>, dt: number) {
  if (clone.position.y <= 0 && clone.velocityY <= 0) {
    clone.position.y = 0;
    clone.velocityY = 0;
    return false;
  }
  clone.velocityY -= 9.8 * dt * JUGGLE_GRAVITY_SCALE;
  clone.position.y += clone.velocityY * dt;
  if (clone.position.y <= 0) {
    clone.position.y = 0;
    clone.velocityY = 0;
    return true;
  }
  return false;
}

function scheduleShadowCloneVanish(fighter: FighterRuntime) {
  const clone = fighter.shadowClone;
  if (!clone) return;
  clone.phase = 'vanishing';
  clone.state = 'idle';
  clone.currentMove = null;
  clone.actionFramesRemaining = 0;
  clone.moveFrame = 0;
  clone.vanishSmokeFrames = Math.max(clone.vanishSmokeFrames, SHADOW_CLONE_VANISH_SMOKE_FRAMES);
}

function mirrorShadowCloneHit(fighter: FighterRuntime, move: MoveDefinition, forceKnockdown: boolean, entersJuggle: boolean) {
  const clone = fighter.shadowClone;
  if (!clone || clone.phase !== 'active') return;
  clone.currentMove = null;
  clone.moveFrame = 0;
  clone.actionFramesRemaining = 0;
  clone.hitConnected = false;
  clone.attackConsumed = true;
  clone.vanishOnLanding = true;
  if (forceKnockdown) {
    clone.state = 'knockdown';
    clone.position.y = Math.max(clone.position.y, 0.32);
    clone.velocityY = Math.max(clone.velocityY, 1.55);
  } else if (entersJuggle || (move.launchHeight ?? 0) > 0) {
    clone.state = 'juggle';
    clone.position.y = Math.max(clone.position.y, 0.9);
    clone.velocityY = Math.max(clone.velocityY, Math.min(4.8, getJuggleVelocity(move, false) * 0.72));
  } else {
    clone.state = 'hit';
    clone.velocityY = Math.max(clone.velocityY, 0.75);
  }
}

function getFreshMoveInput(fighter: FighterRuntime, input: InputFrame): MoveInput | null {
  return moveInputs.find((action) => input[action] && !fighter.previousAttackInputs[action]) ?? null;
}

function updateAttackInputMemory(fighter: FighterRuntime, input: InputFrame) {
  for (const action of moveInputs) {
    fighter.previousAttackInputs[action] = input[action];
  }
}

function handleKnockdownStep(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, dt: number) {
  if (fighter.position.y > 0 || fighter.velocityY !== 0) return;

  if (fighter.state === 'getup' || fighter.getupStarted) {
    if (fighter.getupForward !== 0) {
      moveAlongOpponentAxis(fighter, opponent, fighter.getupForward * fighter.character.stats.speed * GETUP_ROLL_SPEED * dt);
    }
    if (fighter.getupLane !== 0) {
      const sideSign = getOpponentSideSign(fighter, opponent);
      orbitAroundOpponent(fighter, opponent, -fighter.getupLane * sideSign * fighter.character.stats.sidestepSpeed * GETUP_LANE_SPEED * dt);
    }
    return;
  }

  if (fighter.actionFramesRemaining > 0 || fighter.stunFramesRemaining > 0 || fighter.actionTimer > 0 || fighter.stunTimer > 0) return;

  const getupAction = getRequestedGetupAction(fighter, opponent, input);
  if (getupAction === 'none') return;

  fighter.getupStarted = true;
  fighter.getupAction = getupAction;
  fighter.getupForward = getupAction === 'rollBack' ? -1 : 0;
  fighter.getupLane = getupAction === 'rollUp' ? -1 : getupAction === 'rollDown' ? 1 : 0;
  fighter.getupInvulnerableFrames = GETUP_INVULNERABLE_FRAMES;
  fighter.getupTotalFrames = getGetupAnimationFrames(fighter, getupAction);
  fighter.actionFramesRemaining = fighter.getupTotalFrames;
  fighter.actionTimer = framesToSeconds(fighter.getupTotalFrames);
  fighter.state = 'getup';
  fighter.stunFramesRemaining = 0;
  fighter.blockstunFramesRemaining = 0;
  fighter.blockPunishWindowFrames = 0;
  fighter.stunTimer = 0;
}

function getRequestedGetupAction(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame): FighterRuntime['getupAction'] {
  const forward = resolveForwardInput(fighter, opponent, input);
  if (input.up || input.sidestepUp || input.sidewalkUp) return 'rollUp';
  if (input.down || input.sidestepDown || input.sidewalkDown) return 'rollDown';
  if (forward < 0) return 'rollBack';
  if (forward > 0 || input.block || input.confirm || input.charge || moveInputs.some((action) => input[action])) return 'stand';
  return 'none';
}

function getGetupAnimationFrames(fighter: FighterRuntime, action: FighterRuntime['getupAction']) {
  if (action !== 'none') {
    const override = fighter.character.getupFrameOverrides?.[action];
    if (Number.isFinite(override) && Number(override) > 0) return clamp(Math.round(Number(override)), 12, 96);
  }
  const key = getGetupAnimationKey(action);
  const animationKey = key && (fighter.character.animationFrames?.[key]?.length ?? 0) > 0
    ? key
    : key && (fighter.character.animationFrames?.knockdown?.length ?? 0) > 0
      ? 'knockdown'
      : key;
  const frameCount = animationKey ? fighter.character.animationFrames?.[animationKey]?.length ?? 0 : 0;
  const fps = animationKey ? fighter.character.animationFrameRates?.[animationKey] ?? (key ? fighter.character.animationFrameRates?.[key] : undefined) ?? fighter.character.animationFps ?? 8 : fighter.character.animationFps ?? 8;
  if (frameCount > 0) return clamp(Math.round((frameCount / Math.max(1, fps)) * FRAMES_PER_SECOND), 12, 72);
  return GETUP_FRAMES;
}

function getGetupAnimationKey(action: FighterRuntime['getupAction']) {
  if (action === 'stand') return 'getupStand';
  if (action === 'rollUp') return 'getupRollUp';
  if (action === 'rollDown') return 'getupRollDown';
  if (action === 'rollBack') return 'getupRollBack';
  return null;
}

function canComboCancel(fighter: FighterRuntime) {
  const move = fighter.currentMove;
  if (!move) return false;
  return Boolean(move.cancelable) && fighter.hitConfirmed && fighter.moveFrame >= move.startupFrames + move.activeFrames;
}

function startComboAttack(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, moveInput: MoveInput, chainMode: 'neutral' | 'cancel' | 'link' = 'neutral'): boolean {
  const baseMove = fighter.character.moves.find((candidate) => candidate.input === moveInput);
  if (!baseMove) return false;

  const route = getComboRoute(fighter, opponent, input);
  const cancelingCurrentAttack = fighter.state === 'attack' && (fighter.actionFramesRemaining > 0 || fighter.actionTimer > 0);
  const continuing = cancelingCurrentAttack || chainMode === 'link';
  const comboStep = continuing ? Math.min(MAX_COMBO_STEPS, fighter.comboStep + 1) : 1;
  const sequence = continuing ? [...fighter.comboSequence, moveInput].slice(-6) : [moveInput];
  const crouchCommandRequired = Boolean(getCrouchCommandNotation(fighter, opponent, input, moveInput));
  const command = findConfiguredCommand(fighter, opponent, input, moveInput);
  if (crouchCommandRequired && !command) return false;
  if (continuing && !canChainInto(fighter, chainMode)) return false;
  if (!command && hasCommandInputIntent(fighter, opponent, input, moveInput)) return false;
  const move = buildComboMove(fighter.character, baseMove, moveInput, route, comboStep, sequence, command);
  if (continuing && chainMode === 'cancel' && isSameInputRepeat(sequence) && !isAuthoredChain(fighter.character, move, route, sequence, command)) {
    if (fighter.bufferedMoveInput === moveInput) clearBufferedMoveInput(fighter);
    return false;
  }
  const chargedIntent = input.charge;
  const kiCost = getMoveKiCost(move);
  const spendsKi = chargedIntent || moveUsesKi(move);
  if (spendsKi && fighter.ki < kiCost) {
    if (fighter.bufferedMoveInput === moveInput) clearBufferedMoveInput(fighter);
    return false;
  }
  const charged = chargedIntent;
  const resolvedMove = charged ? buildKiBurstMove(move, kiCost) : move;
  const identity = getMoveIdentity(move);
  fighter.aiRecentComboKeys = addRecentComboKey(fighter.aiRecentComboKeys, identity);
  if (spendsKi) {
    fighter.ki = clamp(fighter.ki - kiCost, 0, KI_MAX);
    clearTransformOverchargeIfKiBelowFull(fighter);
  }
  applyMoveHealing(fighter, resolvedMove);
  applyMoveJumpStart(fighter, resolvedMove);

  fighter.currentMove = resolvedMove;
  fighter.moveInstanceId += 1;
  fighter.state = 'attack';
  fighter.forcedCrouchFrames = 0;
  fighter.actionFramesRemaining = totalMoveFrames(resolvedMove);
  fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
  fighter.moveFrame = 0;
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
  fighter.comboTimer = COMBO_WINDOW;
  fighter.comboStep = comboStep;
  fighter.comboSequence = sequence;
  if (!continuing) fighter.comboUsedKeys = [];

  const forwardNudge = route.toward ? 0.18 : route.away ? -0.08 : continuing ? 0.16 : 0;
  const specialNudge = moveInput === 'special' ? 0.18 : 0;
  if (forwardNudge || specialNudge) {
    moveAlongOpponentAxis(fighter, opponent, forwardNudge + specialNudge);
  }
  startShadowCloneAttack(fighter, opponent, resolvedMove);
  return true;
}

function getChargedMoveKiCost(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, moveInput: MoveInput) {
  const baseMove = fighter.character.moves.find((candidate) => candidate.input === moveInput);
  if (!baseMove) return Number.POSITIVE_INFINITY;
  const route = getComboRoute(fighter, opponent, input);
  const comboStep = fighter.comboTimer > 0 ? Math.min(MAX_COMBO_STEPS, fighter.comboStep + 1) : 1;
  const sequence = fighter.comboTimer > 0 ? [...fighter.comboSequence, moveInput].slice(-6) : [moveInput];
  const command = findConfiguredCommand(fighter, opponent, input, moveInput);
  const move = buildComboMove(fighter.character, baseMove, moveInput, route, comboStep, sequence, command);
  return getMoveKiCost(move);
}

function applyMoveJumpStart(fighter: FighterRuntime, move: MoveDefinition) {
  if (!move.jumpBeforeMove) return;
  if (fighter.position.y > 0 || fighter.velocityY !== 0) return;
  fighter.velocityY = move.moveJumpForce ?? fighter.character.stats.jumpForce;
  fighter.position.y = Math.max(fighter.position.y, 0.18);
}

function canChainInto(fighter: FighterRuntime, chainMode: 'neutral' | 'cancel' | 'link') {
  if (chainMode === 'neutral') return true;
  const current = fighter.currentMove;
  if (chainMode === 'cancel') {
    if (!current || !fighter.hitConfirmed) return false;
    return Boolean(current.cancelable) && fighter.moveFrame >= current.startupFrames + current.activeFrames;
  }
  if (fighter.comboTimer <= 0 || fighter.comboHits <= 0 || fighter.stunFramesRemaining > 0 || fighter.blockstunFramesRemaining > 0 || fighter.state === 'knockdown') return false;
  return true;
}

function canLinkAfterHit(fighter: FighterRuntime, opponent: FighterRuntime) {
  if (fighter.comboTimer <= 0 || fighter.comboHits <= 0) return false;
  return opponent.stunFramesRemaining > 0 || opponent.state === 'hit' || opponent.state === 'juggle' || isAirborne(opponent);
}

function shouldDropSameMoveRecoveryBuffer(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, moveInput: MoveInput) {
  if (!fighter.currentMove || !fighter.hitConfirmed || fighter.currentMove.input !== moveInput) return false;
  const baseMove = fighter.character.moves.find((candidate) => candidate.input === moveInput);
  if (!baseMove) return false;
  const route = getComboRoute(fighter, opponent, input);
  const sequence = [...fighter.comboSequence, moveInput].slice(-6);
  if (!isSameInputRepeat(sequence)) return false;
  const command = findConfiguredCommand(fighter, opponent, input, moveInput);
  const move = buildComboMove(fighter.character, baseMove, moveInput, route, Math.min(MAX_COMBO_STEPS, fighter.comboStep + 1), sequence, command);
  return !isAuthoredChain(fighter.character, move, route, sequence, command);
}

function getMoveKiCost(move: MoveDefinition) {
  return clamp(Math.round(move.kiCost ?? KI_BURST_COST), 0, KI_MAX);
}

function moveUsesKi(move?: MoveDefinition | null) {
  return Boolean(move?.usesKi || move?.kiBurst || move?.healsHp);
}

function applyMoveHealing(fighter: FighterRuntime, move: MoveDefinition) {
  if (!move.healsHp) return;
  const healAmount = Math.max(0, Math.round(move.healAmount ?? 8));
  if (healAmount <= 0) return;
  fighter.hp = Math.min(fighter.maxHp, fighter.hp + healAmount);
}

function buildKiBurstMove(move: MoveDefinition, kiCost = getMoveKiCost(move)): MoveDefinition {
  return {
    ...move,
    id: `${move.id}-ki`,
    label: `Ki ${move.label}`,
    damage: Math.round(move.damage * 1.35 + 3),
    blockDamage: Math.round(move.blockDamage * 1.5),
    hitLevel: move.hitLevel === 'throw' ? move.hitLevel : 'special',
    onBlockFrames: move.onBlockFrames - 2,
    onHitFrames: move.onHitFrames + 5,
    onCounterHitFrames: move.onCounterHitFrames + 7,
    range: move.range + 0.18,
    pushback: move.pushback + 0.32,
    blockPushback: move.blockPushback + 0.24,
    comboKey: `${move.comboKey ?? move.id}:ki`,
    usesKi: true,
    kiCost,
    kiBurst: true
  };
}

function buildKiChargeMove(character: CharacterDefinition): MoveDefinition {
  const base: MoveDefinition = {
    id: 'chargeKi',
    label: 'Charge Ki',
    input: 'special',
    command: 'chargeKi',
    notation: 'O',
    animationKey: 'chargeKi',
    comboKey: 'chargeKi',
    startupFrames: KI_CHARGE_DEFAULT_STARTUP_FRAMES,
    activeFrames: KI_CHARGE_DEFAULT_ACTIVE_FRAMES,
    recoveryFrames: KI_CHARGE_DEFAULT_RECOVERY_FRAMES,
    damage: 0,
    blockDamage: 0,
    hitLevel: 'special',
    onBlockFrames: 0,
    onHitFrames: 0,
    onCounterHitFrames: 0,
    whiffRecoveryFrames: 0,
    range: 0.1,
    pushback: 0,
    blockPushback: 0,
    tracking: 'none',
    knockdown: false,
    hitbox: { offset: [0, 1, 0], size: [0, 0, 0] }
  };
  const override = character.moveOverrides?.chargeKi ?? character.moveOverrides?.['cmd:chargeKi'] ?? character.moveOverrides?.charge;
  return override ? mergeMoveOverride(base, override) : base;
}

function mergeMoveOverride(move: MoveDefinition, override: MoveOverride): MoveDefinition {
  return {
    ...move,
    ...override,
    hitbox: override.hitbox
      ? {
          offset: override.hitbox.offset ?? move.hitbox.offset,
          size: override.hitbox.size ?? move.hitbox.size
        }
      : move.hitbox
  };
}

function buildComboMove(
  character: CharacterDefinition,
  baseMove: MoveDefinition,
  moveInput: MoveInput,
  route: ComboRoute,
  comboStep: number,
  sequence: MoveInput[],
  command?: CommandCandidate | null
): MoveDefinition {
  const sequenceBonus = Math.min(0.38, (comboStep - 1) * 0.075);
  const repeatedSameInputCount = countTrailingSameInputs(sequence);
  const repeatFatigue = Math.max(0, repeatedSameInputCount - 1);
  const repeatBonus = repeatFatigue > 0 ? -0.08 * repeatFatigue : 0;
  const lowBonus = route.low ? 0.08 : 0;
  const launcherBonus = route.launcher ? 0.1 : 0;
  const stringScale = Math.max(0.52, 0.82 - Math.max(0, comboStep - 2) * 0.06);
  const damageScale = comboStep <= 1 ? 1 + lowBonus + launcherBonus : stringScale + repeatBonus + lowBonus + launcherBonus;
  const speedScale = route.toward ? 0.9 : route.away ? 1.08 : route.low ? 1.04 : 1;
  const rangeBonus = (route.toward ? 0.26 : route.low ? 0.12 : route.launcher ? 0.18 : 0) + Math.min(0.5, Math.max(0, comboStep - 1) * 0.14);
  const pushBonus = route.toward ? 0.24 : route.away ? 0.08 : route.launcher ? 0.32 : 0;
  const commandKey = command?.animationKey;
  const commandRouteNotation = command && !command.isBaseButton ? command.notation : null;
  const generatedComboKey = commandRouteNotation ? `${commandRouteNotation}:${sequence.join('-')}` : `${route.key}:${sequence.join('-')}`;
  const stringKey = buttonSequenceKey(sequence);

  const generated: MoveDefinition = {
    ...baseMove,
    id: command?.animationKey ?? baseMove.id,
    label: commandRouteNotation ? `${commandRouteNotation} ${limbNames[moveInput]}` : comboStep > 1 ? `${stringKey} String` : `${route.label} ${limbNames[moveInput]} ${comboStep}`,
    command: commandRouteNotation ?? undefined,
    notation: commandRouteNotation ?? undefined,
    animationKey: command?.animationKey,
    comboKey: generatedComboKey,
    comboStep,
    route: route.key,
    startupFrames: Math.max(4, Math.round(baseMove.startupFrames * speedScale + (comboStep > 1 ? Math.min(8, comboStep * 2) : 0) - Math.min(2, comboStep - 1) + repeatFatigue * 2)),
    activeFrames: baseMove.activeFrames + (comboStep > 2 ? 1 : 0) + (comboStep >= 5 ? 1 : 0),
    recoveryFrames: Math.max(8, Math.round(baseMove.recoveryFrames * (route.away ? 0.92 : 1) + Math.max(0, comboStep - 1) * 2 - (route.toward ? 1 : 0) + repeatFatigue * 6)),
    damage: Math.max(3, Math.round(baseMove.damage * damageScale)),
    blockDamage: 0,
    range: baseMove.range + rangeBonus,
    pushback: baseMove.pushback + pushBonus,
    blockPushback: baseMove.blockPushback + pushBonus * 0.4,
    onBlockFrames: baseMove.onBlockFrames + (route.away ? 2 : route.toward ? -1 : 0) - Math.max(0, comboStep - 1) * 2 - repeatFatigue * 3,
    onHitFrames: baseMove.onHitFrames + (comboStep <= 1 ? 0 : Math.max(-5, 3 - comboStep * 2)) + (route.launcher ? 4 : 0) - repeatFatigue * 8,
    onCounterHitFrames: baseMove.onCounterHitFrames + (comboStep <= 1 ? 0 : Math.max(-4, 5 - comboStep)) + (route.launcher ? 5 : 0) - repeatFatigue * 5,
    hitLevel: route.low ? 'low' : baseMove.hitLevel,
    launchHeight: baseMove.launchHeight,
    knockdown: baseMove.knockdown || comboStep >= MAX_COMBO_STEPS,
    hitbox: {
      offset: [
        baseMove.hitbox.offset[0],
        route.low ? Math.max(0.58, baseMove.hitbox.offset[1] - 0.28) : route.launcher ? baseMove.hitbox.offset[1] + 0.18 : baseMove.hitbox.offset[1],
        baseMove.hitbox.offset[2] + (route.toward ? 0.12 : 0)
      ],
      size: [
        baseMove.hitbox.size[0] + (comboStep > 2 ? 0.08 : 0),
        baseMove.hitbox.size[1] + (route.launcher ? 0.12 : 0),
        baseMove.hitbox.size[2] + rangeBonus * 0.4
      ]
    }
  };

  return applyMoveOverrides(character, applyStringFrameData(generated, route, sequence, command), baseMove, commandKey);
}

function isSameInputRepeat(sequence: MoveInput[]) {
  return sequence.length >= 2 && sequence[sequence.length - 1] === sequence[sequence.length - 2];
}

function countTrailingSameInputs(sequence: MoveInput[]) {
  if (sequence.length === 0) return 0;
  const last = sequence[sequence.length - 1];
  let count = 0;
  for (let index = sequence.length - 1; index >= 0 && sequence[index] === last; index -= 1) {
    count += 1;
  }
  return count;
}

function isAuthoredChain(character: CharacterDefinition, move: MoveDefinition, route: ComboRoute, sequence: MoveInput[], command?: CommandCandidate | null) {
  if (command && !command.isBaseButton) {
    return Boolean(
      character.moveOverrides?.[command.animationKey] ||
        character.moveOverrides?.[command.notation] ||
        character.moveOverrides?.[move.comboKey ?? '']
    );
  }
  if (character.moveOverrides?.[move.comboKey ?? '']) return true;
  return route.key === 'neutral' && Boolean(neutralStringFrameData[buttonSequenceKey(sequence)]);
}

type CommandCandidate = {
  notation: string;
  animationKey: string;
  isBaseButton?: boolean;
};

function applyMoveOverrides(
  character: CharacterDefinition,
  generated: MoveDefinition,
  baseMove: MoveDefinition,
  commandKey?: string
): MoveDefinition {
  const overrides = character.moveOverrides ?? {};
  const candidates = [
    generated.command,
    generated.route,
    baseMove.id,
    baseMove.input,
    baseInputToAnimationKey[baseMove.input],
    commandKey,
    generated.comboKey
  ].filter(Boolean) as string[];
  const merged = [...new Set(candidates)].reduce<MoveDefinition>((move, key) => {
    const override = overrides[key];
    if (!override) return move;
    return {
      ...move,
      ...override,
      hitbox: override.hitbox
        ? {
            offset: override.hitbox.offset ?? move.hitbox.offset,
            size: override.hitbox.size ?? move.hitbox.size
          }
        : move.hitbox
    };
  }, generated);

  return {
    ...merged,
    startupFrames: Math.max(1, Math.round(merged.startupFrames)),
    activeFrames: Math.max(1, Math.round(merged.activeFrames)),
    recoveryFrames: Math.max(1, Math.round(merged.recoveryFrames)),
    damage: Math.max(1, Math.round(merged.damage)),
    blockDamage: Math.max(0, Math.round(merged.blockDamage)),
    onBlockFrames: Math.round(merged.onBlockFrames),
    onHitFrames: Math.round(merged.onHitFrames),
    onCounterHitFrames: Math.round(merged.onCounterHitFrames),
    range: Math.max(0.1, merged.range),
    pushback: Math.max(0, merged.pushback),
    blockPushback: Math.max(0, merged.blockPushback),
    forwardForce: merged.forwardForce === undefined ? undefined : clamp(merged.forwardForce, -4, 4),
    forwardForceStartFrame: merged.forwardForceStartFrame === undefined ? undefined : Math.max(1, Math.round(merged.forwardForceStartFrame)),
    forwardForceEndFrame: merged.forwardForceEndFrame === undefined ? undefined : Math.max(1, Math.round(merged.forwardForceEndFrame)),
    jumpBeforeMove: Boolean(merged.jumpBeforeMove),
    moveJumpForce: merged.moveJumpForce === undefined ? undefined : clamp(merged.moveJumpForce, 1, 18),
    moveJumpGravity: merged.moveJumpGravity === undefined ? undefined : clamp(merged.moveJumpGravity, 1, 48),
    homingSpeed: merged.homingSpeed === undefined ? undefined : clamp(merged.homingSpeed, 0, 24),
    launchVelocity: merged.launchVelocity === undefined ? undefined : clamp(merged.launchVelocity, 3.2, 7.2),
    juggleRefloatVelocity: merged.juggleRefloatVelocity === undefined ? undefined : clamp(merged.juggleRefloatVelocity, 2.2, 6.4),
    juggleGravityScale: merged.juggleGravityScale === undefined ? undefined : clamp(merged.juggleGravityScale, 0.28, 1.2),
    throwCapture: Boolean(merged.throwCapture),
    cancelable: Boolean(merged.cancelable),
    healsHp: Boolean(merged.healsHp),
    healAmount: merged.healAmount === undefined ? undefined : clamp(Math.round(merged.healAmount), 0, 100)
  };
}

function applyStringFrameData(generated: MoveDefinition, route: ComboRoute, sequence: MoveInput[], command?: CommandCandidate | null): MoveDefinition {
  if (command || route.key !== 'neutral') return generated;
  const stringKey = buttonSequenceKey(sequence);
  const tuning = neutralStringFrameData[stringKey];
  if (!tuning) return generated;
  return {
    ...generated,
    ...tuning,
    label: tuning.label ?? generated.label,
    comboKey: generated.comboKey,
    comboStep: generated.comboStep,
    route: generated.route,
    input: generated.input,
    hitbox: generated.hitbox
  };
}

function buttonSequenceKey(sequence: MoveInput[]) {
  return sequence.map((input) => inputToButton[input]).join(',');
}

function getMoveIdentity(move: MoveDefinition) {
  return move.command ?? `${move.route ?? 'neutral'}:${move.input}`;
}

function addRecentComboKey(keys: string[], key: string) {
  return [...keys.filter((candidate) => candidate !== key), key].slice(-AI_RECENT_MEMORY_LIMIT);
}

const inputToButton: Record<MoveInput, string> = {
  jab: '1',
  heavy: '2',
  kick: '3',
  special: '4'
};

const buttonToInput: Record<string, MoveInput> = {
  '1': 'jab',
  '2': 'heavy',
  '3': 'kick',
  '4': 'special'
};

type StringFrameTuning = Partial<Pick<
  MoveDefinition,
  | 'label'
  | 'startupFrames'
  | 'activeFrames'
  | 'recoveryFrames'
  | 'damage'
  | 'blockDamage'
  | 'hitLevel'
  | 'onBlockFrames'
  | 'onHitFrames'
  | 'onCounterHitFrames'
  | 'launchHeight'
  | 'tornado'
  | 'knockdown'
>>;

const neutralStringFrameData: Record<string, StringFrameTuning> = {
  '1,1': {
    label: '1,1 String',
    startupFrames: 14,
    activeFrames: 2,
    recoveryFrames: 19,
    damage: 8,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -7,
    onHitFrames: 4,
    onCounterHitFrames: 7,
    knockdown: false
  },
  '1,1,3': {
    label: '1,1,3 Ender',
    startupFrames: 21,
    activeFrames: 2,
    recoveryFrames: 17,
    damage: 12,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -5,
    onHitFrames: 6,
    onCounterHitFrames: 14,
    knockdown: false
  },
  '1,1,2': {
    label: '1,1,2 Mid Check',
    startupFrames: 16,
    activeFrames: 2,
    recoveryFrames: 22,
    damage: 12,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -9,
    onHitFrames: 8,
    onCounterHitFrames: 15,
    knockdown: false
  },
  '1,1,4': {
    label: '1,1,4 Ender',
    startupFrames: 20,
    activeFrames: 3,
    recoveryFrames: 25,
    damage: 14,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -12,
    onHitFrames: 18,
    onCounterHitFrames: 24,
    knockdown: true
  },
  '1,2': {
    label: '1,2 String',
    startupFrames: 12,
    activeFrames: 2,
    recoveryFrames: 20,
    damage: 9,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -8,
    onHitFrames: 6,
    onCounterHitFrames: 8,
    knockdown: false
  },
  '1,2,3': {
    label: '1,2,3 Launcher',
    startupFrames: 22,
    activeFrames: 3,
    recoveryFrames: 21,
    damage: 15,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -2,
    onHitFrames: 20,
    onCounterHitFrames: 29,
    launchHeight: 0,
    knockdown: false
  },
  '1,2,4': {
    label: '1,2,4 Ender',
    startupFrames: 18,
    activeFrames: 3,
    recoveryFrames: 27,
    damage: 13,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -12,
    onHitFrames: 18,
    onCounterHitFrames: 22,
    launchHeight: 0,
    knockdown: false
  },
  '1,3': {
    label: '1,3 Low String',
    startupFrames: 21,
    activeFrames: 3,
    recoveryFrames: 20,
    damage: 9,
    blockDamage: 0,
    hitLevel: 'low',
    onBlockFrames: -11,
    onHitFrames: 0,
    onCounterHitFrames: 4,
    knockdown: false
  },
  '1,3,4': {
    label: '1,3,4 Low Ender',
    startupFrames: 18,
    activeFrames: 3,
    recoveryFrames: 26,
    damage: 12,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -13,
    onHitFrames: 15,
    onCounterHitFrames: 22,
    knockdown: true
  },
  '1,4': {
    label: '1,4 High Kick',
    startupFrames: 17,
    activeFrames: 3,
    recoveryFrames: 23,
    damage: 11,
    blockDamage: 0,
    hitLevel: 'high',
    onBlockFrames: -8,
    onHitFrames: 7,
    onCounterHitFrames: 16,
    knockdown: false
  },
  '1,4,2': {
    label: '1,4,2 Power Ender',
    startupFrames: 21,
    activeFrames: 3,
    recoveryFrames: 29,
    damage: 15,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -14,
    onHitFrames: 20,
    onCounterHitFrames: 27,
    launchHeight: 0,
    knockdown: false
  },
  '2,1': {
    label: '2,1 String',
    startupFrames: 8,
    activeFrames: 2,
    recoveryFrames: 18,
    damage: 8,
    blockDamage: 0,
    hitLevel: 'high',
    onBlockFrames: -6,
    onHitFrames: 6,
    onCounterHitFrames: 8,
    knockdown: false
  },
  '2,1,2': {
    label: '2,1,2 Spin String',
    startupFrames: 18,
    activeFrames: 3,
    recoveryFrames: 25,
    damage: 12,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -10,
    onHitFrames: 16,
    onCounterHitFrames: 22,
    launchHeight: 0,
    knockdown: false
  },
  '2,3': {
    label: '2,3 Launcher',
    startupFrames: 22,
    activeFrames: 3,
    recoveryFrames: 30,
    damage: 13,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -17,
    onHitFrames: 11,
    onCounterHitFrames: 18,
    launchHeight: 0,
    knockdown: false
  },
  '2,3,4': {
    label: '2,3,4 Juggle Ender',
    startupFrames: 19,
    activeFrames: 3,
    recoveryFrames: 28,
    damage: 15,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -13,
    onHitFrames: 18,
    onCounterHitFrames: 25,
    knockdown: true
  },
  '2,4': {
    label: '2,4 Side Kick',
    startupFrames: 18,
    activeFrames: 3,
    recoveryFrames: 24,
    damage: 11,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -9,
    onHitFrames: 8,
    onCounterHitFrames: 16,
    knockdown: false
  },
  '2,4,3': {
    label: '2,4,3 Sweep Ender',
    startupFrames: 23,
    activeFrames: 3,
    recoveryFrames: 30,
    damage: 15,
    blockDamage: 0,
    hitLevel: 'low',
    onBlockFrames: -18,
    onHitFrames: 16,
    onCounterHitFrames: 24,
    knockdown: true
  },
  '3,1': {
    label: '3,1 Mid String',
    startupFrames: 18,
    activeFrames: 3,
    recoveryFrames: 24,
    damage: 11,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -11,
    onHitFrames: 8,
    onCounterHitFrames: 27,
    knockdown: false
  },
  '3,2': {
    label: '3,2 Kick Punch',
    startupFrames: 15,
    activeFrames: 2,
    recoveryFrames: 22,
    damage: 10,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -8,
    onHitFrames: 7,
    onCounterHitFrames: 14,
    knockdown: false
  },
  '3,2,4': {
    label: '3,2,4 Launcher',
    startupFrames: 20,
    activeFrames: 3,
    recoveryFrames: 28,
    damage: 15,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -14,
    onHitFrames: 19,
    onCounterHitFrames: 28,
    launchHeight: 0,
    knockdown: false
  },
  '3,4': {
    label: '3,4 Kick String',
    startupFrames: 16,
    activeFrames: 3,
    recoveryFrames: 23,
    damage: 11,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -7,
    onHitFrames: 9,
    onCounterHitFrames: 17,
    knockdown: false
  },
  '3,4,2': {
    label: '3,4,2 Launcher',
    startupFrames: 22,
    activeFrames: 3,
    recoveryFrames: 31,
    damage: 15,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -16,
    onHitFrames: 21,
    onCounterHitFrames: 30,
    launchHeight: 0,
    knockdown: false
  },
  '4,1': {
    label: '4,1 Counter String',
    startupFrames: 14,
    activeFrames: 2,
    recoveryFrames: 21,
    damage: 10,
    blockDamage: 0,
    hitLevel: 'high',
    onBlockFrames: -6,
    onHitFrames: 8,
    onCounterHitFrames: 18,
    knockdown: false
  },
  '4,1,2': {
    label: '4,1,2 Counter Ender',
    startupFrames: 19,
    activeFrames: 3,
    recoveryFrames: 28,
    damage: 14,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -13,
    onHitFrames: 18,
    onCounterHitFrames: 28,
    launchHeight: 0,
    knockdown: false
  },
  '4,2': {
    label: '4,2 Power String',
    startupFrames: 18,
    activeFrames: 3,
    recoveryFrames: 26,
    damage: 13,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -11,
    onHitFrames: 12,
    onCounterHitFrames: 23,
    knockdown: false
  },
  '4,3': {
    label: '4,3 Low Check',
    startupFrames: 20,
    activeFrames: 3,
    recoveryFrames: 25,
    damage: 10,
    blockDamage: 0,
    hitLevel: 'low',
    onBlockFrames: -16,
    onHitFrames: 4,
    onCounterHitFrames: 12,
    knockdown: false
  },
  '1,3,2': {
    label: '1,3,2 Low Lift',
    startupFrames: 20,
    activeFrames: 3,
    recoveryFrames: 27,
    damage: 13,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -13,
    onHitFrames: 17,
    onCounterHitFrames: 25,
    launchHeight: 0,
    knockdown: false
  },
  '2,1,4': {
    label: '2,1,4 Check Ender',
    startupFrames: 20,
    activeFrames: 3,
    recoveryFrames: 27,
    damage: 13,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -12,
    onHitFrames: 16,
    onCounterHitFrames: 24,
    knockdown: true
  },
  '3,1,4': {
    label: '3,1,4 Kick Ender',
    startupFrames: 21,
    activeFrames: 3,
    recoveryFrames: 29,
    damage: 14,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -14,
    onHitFrames: 18,
    onCounterHitFrames: 27,
    knockdown: true
  },
  '1+2': {
    label: '1+2 Power Mid',
    startupFrames: 16,
    activeFrames: 3,
    recoveryFrames: 25,
    damage: 14,
    blockDamage: 0,
    hitLevel: 'mid',
    onBlockFrames: -9,
    onHitFrames: 20,
    onCounterHitFrames: 27,
    launchHeight: 0,
    knockdown: false
  }
};

export function getAuthoredNeutralStringRouteCount() {
  return Object.keys(neutralStringFrameData).length;
}

export function getAuthoredNeutralStringDamageCeiling() {
  return Math.max(0, ...Object.values(neutralStringFrameData).map((move) => move.damage ?? 0));
}

function updateCommandHistory(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, dt: number) {
  fighter.commandHistory = fighter.commandHistory
    .map((entry) => ({ ...entry, age: entry.age + dt }))
    .filter((entry) => entry.age <= 0.62);

  const token = getDirectionalNotation(fighter, opponent, input);
  if (token !== 'N' && token !== fighter.previousDirectionToken) {
    fighter.commandHistory.push({ token, age: 0 });
  }
  fighter.previousDirectionToken = token;
}

function findConfiguredCommand(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, freshMoveInput: MoveInput): CommandCandidate | null {
  const candidates = buildCommandCandidates(fighter, opponent, input, freshMoveInput);
  const frames = fighter.character.animationFrames ?? {};
  return candidates.find((candidate) => (frames[candidate.animationKey]?.length ?? 0) > 0) ?? null;
}

function findConfiguredCrouchCommand(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, freshMoveInput: MoveInput): CommandCandidate | null {
  const notation = getCrouchCommandNotation(fighter, opponent, input, freshMoveInput);
  if (!notation) return null;
  const candidate = { notation, animationKey: commandAnimationKey(notation) };
  return (fighter.character.animationFrames?.[candidate.animationKey]?.length ?? 0) > 0 ? candidate : null;
}

function getCrouchCommandNotation(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, freshMoveInput: MoveInput): string | null {
  if (fighter.wasCrouching && !input.down) return null;
  const direction = getDirectionalNotation(fighter, opponent, input);
  const inPlainCrouch = direction === 'd' || direction === 'd/b';
  const heldCrouchStance = isCrouchingState(fighter) && direction !== 'd/f' && direction !== 'u' && direction !== 'u/f' && direction !== 'u/b';
  if (!inPlainCrouch && !heldCrouchStance) return null;
  return `FC+${getHeldButtons(input, freshMoveInput).join('+')}`;
}

function buildCommandCandidates(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, freshMoveInput: MoveInput): CommandCandidate[] {
  const buttons = getHeldButtons(input, freshMoveInput);
  const buttonText = buttons.join('+');
  const direction = getDirectionalNotation(fighter, opponent, input);
  const candidates: string[] = [];

  const push = (notation: string) => {
    if (!candidates.includes(notation)) candidates.push(notation);
  };

  if (input.charge) push(`O+${buttonText}`);
  for (const motion of getMotionCandidates(fighter.commandHistory)) push(`${motion}+${buttonText}`);

  if (fighter.state === 'sidestep' || input.sidestepUp || input.sidestepDown || input.sidewalkUp || input.sidewalkDown) {
    push(`SS+${buttonText}`);
    if (fighter.sidestepDirection < 0 || input.sidestepUp || input.sidewalkUp) push(`SSL+${buttonText}`);
    if (fighter.sidestepDirection > 0 || input.sidestepDown || input.sidewalkDown) push(`SSR+${buttonText}`);
  }
  const crouchNotation = getCrouchCommandNotation(fighter, opponent, input, freshMoveInput);
  const preferDirectCrouchCommand = Boolean(crouchNotation) && !isCrouchingState(fighter) && (direction === 'd' || direction === 'd/b');
  if (direction !== 'N' && preferDirectCrouchCommand) {
    push(`${direction}+${buttonText}`);
    push(`${direction.toUpperCase()}+${buttonText}`);
  }
  if (crouchNotation) push(crouchNotation);
  if (fighter.wasCrouching && !input.down) push(`WS+${buttonText}`);
  if (direction === 'f' && hasRecentSequence(fighter.commandHistory, ['f', 'f'])) push(`f,f+${buttonText}`);
  if (direction === 'b' && hasRecentSequence(fighter.commandHistory, ['b', 'b'])) push(`b,b+${buttonText}`);

  if (direction !== 'N' && !preferDirectCrouchCommand) {
    push(`${direction}+${buttonText}`);
    push(`${direction.toUpperCase()}+${buttonText}`);
  }
  push(buttonText);
  push(`N+${buttonText}`);

  return candidates.map((notation) => ({
    notation,
    animationKey: commandAnimationKey(notation),
    isBaseButton: Boolean(rawButtonCommandToBaseAnimationKey[notation])
  }));
}

function hasCommandInputIntent(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, freshMoveInput: MoveInput) {
  if (getHeldButtons(input, freshMoveInput).length > 1) return true;
  if (getDirectionalNotation(fighter, opponent, input) !== 'N') return true;
  if (input.sidestepUp || input.sidestepDown || input.sidewalkUp || input.sidewalkDown || fighter.state === 'sidestep') return true;
  return getMotionCandidates(fighter.commandHistory).length > 0;
}

function getHeldButtons(input: InputFrame, freshMoveInput: MoveInput) {
  const buttons = new Set<string>([inputToButton[freshMoveInput]]);
  for (const button of ['1', '2', '3', '4']) {
    const action = buttonToInput[button];
    if (input[action]) buttons.add(button);
  }
  return [...buttons].sort((a, b) => Number(a) - Number(b));
}

function getDirectionalNotation(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame) {
  const forward = resolveForwardInput(fighter, opponent, input);
  const vertical = input.up ? 'u' : input.down ? 'd' : '';
  const horizontal = forward > 0 ? 'f' : forward < 0 ? 'b' : '';
  if (vertical && horizontal) return `${vertical}/${horizontal}`;
  return vertical || horizontal || 'N';
}

function getMotionCandidates(history: FighterRuntime['commandHistory']) {
  const candidates: string[] = [];
  if (hasRecentSequence(history, ['d', 'd/f', 'f'])) candidates.push('qcf');
  if (hasRecentSequence(history, ['d', 'd/b', 'b'])) candidates.push('qcb');
  if (hasRecentSequence(history, ['b', 'd/b', 'd', 'd/f', 'f'])) candidates.push('hcf');
  if (hasRecentSequence(history, ['f', 'd/f', 'd', 'd/b', 'b'])) candidates.push('hcb');
  if (hasRecentSequence(history, ['f', 'd', 'd/f'])) candidates.push('dp');
  if (hasRecentSequence(history, ['b', 'd', 'd/b'])) candidates.push('rdp');
  if (hasRecentSequence(history, ['f', 'f'])) candidates.push('WR');
  if (hasRecentSequence(history, ['d', 'd/f'])) candidates.push('cd');
  return candidates;
}

function hasRecentSequence(history: FighterRuntime['commandHistory'], sequence: string[]) {
  let cursor = 0;
  for (const entry of history) {
    if (entry.token === sequence[cursor]) cursor += 1;
    if (cursor === sequence.length) return true;
  }
  return false;
}

function commandAnimationKey(notation: string) {
  return rawButtonCommandToBaseAnimationKey[notation] ?? `cmd:${notation}`;
}

type ComboRoute = {
  key: string;
  label: string;
  toward: boolean;
  away: boolean;
  low: boolean;
  launcher: boolean;
};

function getComboRoute(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame): ComboRoute {
  const forward = resolveForwardInput(fighter, opponent, input);
  const toward = forward > 0;
  const away = forward < 0;
  const low = input.down || isCrouchingState(fighter) || fighter.wasCrouching;
  const launcher = input.up || isAirborne(fighter);

  if (launcher && toward) return { key: 'up-forward', label: 'Rising Step', toward, away, low: false, launcher };
  if (launcher && away) return { key: 'up-back', label: 'Backflip', toward, away, low: false, launcher };
  if (low && toward) return { key: 'down-forward', label: 'Low Drive', toward, away, low, launcher: false };
  if (low && away) return { key: 'down-back', label: 'Guard Low', toward, away, low, launcher: false };
  if (launcher) return { key: 'up', label: 'Rising', toward, away, low: false, launcher };
  if (low) return { key: 'down', label: 'Crouch', toward, away, low, launcher: false };
  if (toward) return { key: 'forward', label: 'Advancing', toward, away, low, launcher: false };
  if (away) return { key: 'back', label: 'Retreat', toward, away, low, launcher: false };
  return { key: 'neutral', label: 'Neutral', toward, away, low, launcher: false };
}

function resolveHits(match: MatchSnapshot) {
  const [a, b] = match.fighters;
  if (tryStartKiClash(match, a, b)) return;
  tryHit(match, a, b);
  tryHit(match, b, a);
  tryShadowCloneHit(match, a, b);
  tryShadowCloneHit(match, b, a);
}

function tryStartKiClash(match: MatchSnapshot, p1: FighterRuntime, p2: FighterRuntime) {
  if (isClashActive(match.clashState)) return false;
  const p1Move = p1.currentMove;
  const p2Move = p2.currentMove;
  if (!p1Move || !p2Move) return false;
  if (p1.state !== 'attack' || p2.state !== 'attack') return false;
  if (!p1Move.kiBurst || !p2Move.kiBurst) return false;
  if (p1.hitConnected || p2.hitConnected) return false;
  if (!isActiveMoveFrame(p1Move, p1.moveFrame) || !isActiveMoveFrame(p2Move, p2.moveFrame)) return false;
  const clashOverlap = findFirstBoxOverlap(getActiveAttackAabbs(p1, p1Move, true), getActiveAttackAabbs(p2, p2Move, true));
  if (!clashOverlap) return false;

  const id = nextHitEventId(match);
  const contactPoint = getAabbOverlapCenter(clashOverlap[0], clashOverlap[1]);
  match.clashState = {
    ...createEmptyClashState(),
    id,
    status: 'intro',
    sequence: makeClashSequence(match, id),
    contactPoint
  };
  match.message = 'CLASH';
  const clashSpark: ImpactSparkEvent = {
    id,
    kind: 'clash',
    position: contactPoint,
    attackerSlot: 1,
    defenderSlot: 2,
    hitLevel: 'special',
    damage: 0,
    moveLabel: 'Ki Clash',
    kiBurst: true
  };
  match.impactEvents = [
    ...match.impactEvents,
    clashSpark
  ].slice(-12);
  return true;
}

function makeClashSequence(match: MatchSnapshot, clashId: number): MoveInput[] {
  return Array.from({ length: CLASH_SEQUENCE_LENGTH }, (_, index) => {
    const roll = seededUnit(match.aiSeed + match.roundAiSeed + clashId * 31, index + 13);
    return clashInputOrder[Math.floor(roll * clashInputOrder.length)] ?? 'jab';
  });
}

function getAabbOverlapCenter(a: Aabb, b: Aabb): [number, number, number] {
  const minX = Math.max(a.minX, b.minX);
  const maxX = Math.min(a.maxX, b.maxX);
  const minY = Math.max(a.minY, b.minY);
  const maxY = Math.min(a.maxY, b.maxY);
  const minZ = Math.max(a.minZ, b.minZ);
  const maxZ = Math.min(a.maxZ, b.maxZ);
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

function resolveClashOutcome(match: MatchSnapshot) {
  const clash = match.clashState;
  const p1Done = clash.p1.completedFrame;
  const p2Done = clash.p2.completedFrame;
  const p1Succeeded = p1Done !== null && !clash.p1.failed;
  const p2Succeeded = p2Done !== null && !clash.p2.failed;
  let winnerSlot: 1 | 2 | null = null;
  if (p1Succeeded && !p2Succeeded) winnerSlot = 1;
  if (p2Succeeded && !p1Succeeded) winnerSlot = 2;
  if (p1Succeeded && p2Succeeded) {
    winnerSlot = p1Done < p2Done ? 1 : p2Done < p1Done ? 2 : null;
  }

  clash.status = 'result';
  clash.elapsedFrames = 0;
  clash.winnerSlot = winnerSlot;
  if (winnerSlot) {
    applyClashWin(match, winnerSlot);
  } else {
    applyClashDraw(match);
  }
}

function applyClashWin(match: MatchSnapshot, winnerSlot: 1 | 2) {
  const clash = match.clashState;
  const winner = match.fighters[winnerSlot - 1];
  const loser = match.fighters[winnerSlot === 1 ? 1 : 0];
  const winnerMove = winner.currentMove ?? match.fighters[0].currentMove ?? match.fighters[1].currentMove;
  const loserMove = loser.currentMove ?? match.fighters[0].currentMove ?? match.fighters[1].currentMove;
  const baseDamage = Math.max(winnerMove?.damage ?? 0, loserMove?.damage ?? 0);
  const damage = Math.max(CLASH_MIN_DAMAGE, Math.round(baseDamage * CLASH_DAMAGE_MULTIPLIER));
  clash.damage = damage;
  match.message = clashParticipantHasPerfect(clash, winnerSlot) ? 'CLASH PERFECT' : 'CLASH WIN';
  loser.hp = Math.max(0, loser.hp - damage);

  const pushX = loser.position.x - winner.position.x;
  const pushZ = loser.position.z - winner.position.z;
  const pushDistance = Math.hypot(pushX, pushZ) || 1;
  loser.position.x += (pushX / pushDistance) * CLASH_PUSHBACK;
  loser.position.z += (pushZ / pushDistance) * CLASH_PUSHBACK;

  winner.currentMove = null;
  winner.state = 'idle';
  winner.moveFrame = 0;
  winner.actionFramesRemaining = CLASH_WINNER_RECOVERY_FRAMES;
  winner.actionTimer = framesToSeconds(CLASH_WINNER_RECOVERY_FRAMES);
  winner.hitConnected = true;
  winner.hitConfirmed = true;
  winner.comboHits = Math.max(1, winner.comboHits + 1);
  winner.comboDamage = Math.max(0, winner.comboDamage + damage);
  winner.comboTimer = COMBO_WINDOW;
  if (!moveUsesKi(winnerMove)) {
    winner.ki = clamp(winner.ki + Math.round(damage * 0.25), 0, KI_MAX);
  }

  const stunFrames = Math.max(CLASH_LOSER_HITSTUN_FRAMES, (winnerMove?.onHitFrames ?? 0) + CLASH_LOSER_HITSTUN_FRAMES);
  loser.currentMove = null;
  loser.moveFrame = 0;
  loser.blockstunFramesRemaining = 0;
  loser.blockPunishWindowFrames = 0;
  resetKiChargeRuntime(loser);
  if (winnerMove?.knockdown) {
    enterKnockdown(loser, Math.max(stunFrames, KNOCKDOWN_MIN_FRAMES + GETUP_FRAMES));
  } else if (winnerMove && (winnerMove.launchHeight ?? 0) > 0) {
    loser.state = 'juggle';
    loser.position.y = Math.max(loser.position.y, JUGGLE_MIN_START_HEIGHT);
    loser.velocityY = Math.max(loser.velocityY, getJuggleVelocity(winnerMove, false));
    loser.juggleGravityScale = getMoveJuggleGravityScale(winnerMove);
    loser.stunFramesRemaining = stunFrames;
    loser.actionFramesRemaining = stunFrames;
    loser.stunTimer = framesToSeconds(stunFrames);
    loser.actionTimer = framesToSeconds(stunFrames);
  } else {
    loser.state = 'hit';
    loser.stunFramesRemaining = stunFrames;
    loser.actionFramesRemaining = stunFrames;
    loser.stunTimer = framesToSeconds(stunFrames);
    loser.actionTimer = framesToSeconds(stunFrames);
  }

  const popupId = nextHitEventId(match);
  const perfect = clashParticipantHasPerfect(clash, winnerSlot);
  pushClashCombatPopupEvent(match, popupId, winner, winnerMove, perfect ? 'clashPerfect' : 'clashWin', damage);
  const clashSpark: ImpactSparkEvent = {
    id: popupId,
    kind: 'clash',
    position: clash.contactPoint,
    attackerSlot: winner.slot,
    defenderSlot: loser.slot,
    hitLevel: winnerMove?.hitLevel ?? 'special',
    damage,
    moveLabel: winnerMove?.label ?? 'Ki Clash',
    moveInput: winnerMove?.input,
    launched: Boolean(winnerMove?.launchHeight),
    kiBurst: true
  };
  match.impactEvents = [
    ...match.impactEvents,
    clashSpark
  ].slice(-12);
}

function applyClashDraw(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  const p1Move = p1.currentMove;
  const p2Move = p2.currentMove;
  match.message = 'CLASH DRAW';
  const dx = p2.position.x - p1.position.x;
  const dz = p2.position.z - p1.position.z;
  const distance = Math.hypot(dx, dz) || 1;
  p1.position.x -= (dx / distance) * (CLASH_PUSHBACK * 0.55);
  p1.position.z -= (dz / distance) * (CLASH_PUSHBACK * 0.55);
  p2.position.x += (dx / distance) * (CLASH_PUSHBACK * 0.55);
  p2.position.z += (dz / distance) * (CLASH_PUSHBACK * 0.55);
  [p1, p2].forEach((fighter) => {
    fighter.currentMove = null;
    fighter.moveFrame = 0;
    fighter.state = 'idle';
    fighter.actionFramesRemaining = CLASH_DRAW_RECOVERY_FRAMES;
    fighter.actionTimer = framesToSeconds(CLASH_DRAW_RECOVERY_FRAMES);
    fighter.hitConnected = false;
    fighter.hitConfirmed = false;
    fighter.whiffRecoveryApplied = false;
    fighter.blockstunFramesRemaining = 0;
    fighter.stunFramesRemaining = 0;
    fighter.stunTimer = 0;
    resetKiChargeRuntime(fighter);
  });
  const id = nextHitEventId(match);
  pushClashCombatPopupEvent(match, id, p1, p1Move, 'clashDraw', 0);
  pushClashCombatPopupEvent(match, id + 1, p2, p2Move, 'clashDraw', 0);
  match.lastHitId = id + 1;
}

function clashParticipantHasPerfect(clash: ClashState, slot: 1 | 2) {
  const participant = slot === 1 ? clash.p1 : clash.p2;
  return participant.mistakes === 0 && participant.completedFrame !== null && participant.inputs.length === clash.sequence.length;
}

function tryHit(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime) {
  const move = attacker.currentMove;
  if (!move || attacker.state !== 'attack' || attacker.hitConnected) return;
  if (defender.state === 'knockdown' || defender.state === 'transform' || defender.state === 'throwHold' || defender.state === 'throwHeld' || defender.getupInvulnerableFrames > 0) return;
  const moveFrame = attacker.moveFrame || secondsToFrames(totalMoveSeconds(move) - attacker.actionTimer);
  if (!isActiveMoveFrame(move, moveFrame)) return;
  const attackerPosition = getFighterCombatPosition(attacker);
  const defenderPosition = getFighterCombatPosition(defender);
  const dx = defenderPosition.x - attackerPosition.x;
  const dz = defenderPosition.z - attackerPosition.z;
  const distance = Math.hypot(dx, dz);
  const attackerScale = getCharacterCombatScale(attacker.character);
  const collision = getAttackCollision(attacker, defender, move, distance <= move.range * attackerScale.width + UNIVERSAL_RANGE_BUFFER);
  if (!collision) return;

  const wasJuggled = defender.state === 'juggle';
  const wasAirborne = isAirborne(defender) || wasJuggled;
  const launchHeight = Math.max(0, move.launchHeight ?? 0);
  const blocked = canDefenderBlockMove(defender, attacker, move);
  const counterHit = isCounterHit(defender);
  const whiffPunish = isWhiffPunish(defender);
  const blockPunish = attacker.blockPunishWindowFrames > 0;
  const impactId = nextHitEventId(match);
  const comboHits = blocked ? 0 : Math.max(1, attacker.comboHits + 1);
  pushImpactSparkEvent(match, impactId, attacker, defender, move, blocked ? 'block' : whiffPunish ? 'whiffPunish' : blockPunish ? 'punish' : 'hit', {
    comboHits,
    launched: launchHeight > 0,
    juggled: wasJuggled || wasAirborne,
    tornado: Boolean(move.tornado) && wasJuggled,
    kiBurst: Boolean(move.kiBurst)
  }, collision.position);
  attacker.hitConnected = true;
  const pushX = distance > 0 ? dx / distance : attacker.facing;
  const pushZ = distance > 0 ? dz / distance : 0;
  const attackerRemaining = Math.max(0, attacker.actionFramesRemaining || secondsToFrames(attacker.actionTimer));

  if (blocked) {
    attacker.hitConfirmed = false;
    if (!moveUsesKi(move)) {
      attacker.ki = clamp(attacker.ki + KI_BLOCK_GAIN + Math.max(0, move.blockDamage), 0, KI_MAX);
    }
    defender.ki = clamp(defender.ki + KI_DEFENDER_BLOCK_GAIN, 0, KI_MAX);
    defender.hp = Math.max(0, defender.hp - move.blockDamage);
    const effectiveOnBlockFrames = getEffectiveOnBlockFrames(move);
    defender.blockstunFramesRemaining = Math.max(1, attackerRemaining + effectiveOnBlockFrames);
    const defenderAdvantageFrames = Math.max(0, attackerRemaining - defender.blockstunFramesRemaining);
    if (defenderAdvantageFrames > 0) {
      defender.blockPunishWindowFrames = Math.max(defender.blockPunishWindowFrames, defenderAdvantageFrames + BLOCK_PUNISH_BUFFER_FRAMES);
    }
    defender.stunFramesRemaining = 0;
    defender.stunTimer = framesToSeconds(defender.blockstunFramesRemaining);
    defender.state = defender.state === 'crouchBlock' ? 'crouchBlock' : 'block';
    defender.forcedCrouchFrames = 0;
    defender.juggleDamage = 0;
    defender.juggleSequenceDamage = 0;
    defender.juggleTornadoCount = 0;
    defender.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
    defender.position.x += pushX * move.blockPushback * 0.14;
    defender.position.z += pushZ * move.blockPushback * 0.14;
    return;
  }

  attacker.hitConfirmed = true;
  if (!moveUsesKi(move)) {
    attacker.ki = clamp(attacker.ki + KI_HIT_GAIN + Math.max(0, Math.round(move.damage * 0.35)) + Math.max(0, attacker.comboStep - 1) * 2, 0, KI_MAX);
  }
  attacker.comboHits = Math.max(1, attacker.comboHits + 1);
  attacker.comboDamage = Math.max(0, attacker.comboDamage + move.damage);
  const identity = getMoveIdentity(move);
  if (!attacker.comboUsedKeys.includes(identity)) {
    attacker.comboUsedKeys = [...attacker.comboUsedKeys, identity].slice(-8);
  }
  attacker.aiRecentComboKeys = addRecentComboKey(attacker.aiRecentComboKeys, identity);
  pushCombatPopupEvent(match, impactId, attacker, move, whiffPunish ? 'whiffPunish' : blockPunish ? 'punish' : attacker.comboHits >= 2 ? 'combo' : null, {
    launched: launchHeight > 0,
    juggled: wasJuggled || wasAirborne,
    tornado: Boolean(move.tornado) && wasJuggled,
    kiBurst: Boolean(move.kiBurst)
  });

  const advantage = counterHit ? move.onCounterHitFrames : move.onHitFrames;
  const stunFrames = Math.max(1, attackerRemaining + advantage);
  const tornadoExtendsJuggle = Boolean(move.tornado) && wasJuggled && defender.juggleTornadoCount < TORNADO_EXTENSION_LIMIT;
  const entersJuggle = launchHeight > 0 || wasJuggled;
  const juggleTotalDamage = (wasAirborne || entersJuggle ? defender.juggleDamage : 0) + move.damage;
  const juggleSequenceDamage = tornadoExtendsJuggle
    ? move.damage
    : (wasAirborne || entersJuggle ? defender.juggleSequenceDamage : 0) + move.damage;
  const forceKnockdown = move.knockdown || (!tornadoExtendsJuggle && juggleSequenceDamage >= JUGGLE_DAMAGE_LIMIT);
  defender.hp = Math.max(0, defender.hp - move.damage);
  defender.blockstunFramesRemaining = 0;
  defender.blockPunishWindowFrames = 0;
  defender.currentMove = null;
  defender.moveFrame = 0;
  defender.forcedCrouchFrames = 0;
  resetKiChargeRuntime(defender);
  mirrorShadowCloneHit(defender, move, forceKnockdown, entersJuggle);

  if (move.throwCapture && defender.hp > 0) {
    startThrowCapture(attacker, defender, move);
    return;
  }

  if (forceKnockdown) {
    enterKnockdown(defender, Math.max(stunFrames, KNOCKDOWN_MIN_FRAMES + GETUP_FRAMES));
  } else {
    defender.stunFramesRemaining = stunFrames;
    defender.stunTimer = framesToSeconds(stunFrames);
    defender.actionFramesRemaining = stunFrames;
    defender.actionTimer = framesToSeconds(stunFrames);
    defender.state = entersJuggle ? 'juggle' : 'hit';
    defender.juggleDamage = entersJuggle ? juggleTotalDamage : 0;
    defender.juggleSequenceDamage = entersJuggle ? juggleSequenceDamage : 0;
    if (tornadoExtendsJuggle) {
      defender.juggleTornadoCount = Math.min(TORNADO_EXTENSION_LIMIT, defender.juggleTornadoCount + 1);
    } else if (!entersJuggle) {
      defender.juggleTornadoCount = 0;
    }
  }

  if (!forceKnockdown && entersJuggle) {
    const refloatVelocity = tornadoExtendsJuggle ? getTornadoRefloatVelocity(move) : getJuggleVelocity(move, wasAirborne);
    const minHeight = tornadoExtendsJuggle ? TORNADO_REFLOAT_MIN_HEIGHT : wasAirborne ? JUGGLE_REFLOAT_MIN_HEIGHT : JUGGLE_MIN_START_HEIGHT;
    defender.position.y = Math.max(defender.position.y, minHeight);
    defender.velocityY = Math.max(defender.velocityY, refloatVelocity);
    defender.juggleGravityScale = getMoveJuggleGravityScale(move);
    defender.stunFramesRemaining = Math.max(defender.stunFramesRemaining, tornadoExtendsJuggle ? TORNADO_REFLOAT_STUN_FRAMES : wasAirborne ? 18 : 28);
    defender.stunTimer = framesToSeconds(defender.stunFramesRemaining);
    defender.actionFramesRemaining = Math.max(defender.actionFramesRemaining, defender.stunFramesRemaining);
    defender.actionTimer = framesToSeconds(defender.actionFramesRemaining);
    applyJuggleFloatCorrection(attacker, defender);
  } else if (!forceKnockdown && wasAirborne) {
    defender.position.y = Math.max(defender.position.y, 0.28);
    defender.velocityY = Math.max(defender.velocityY, 1.15);
  }
  defender.position.x += pushX * move.pushback * 0.28;
  defender.position.z += pushZ * move.pushback * 0.28;
}

function tryShadowCloneHit(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime) {
  const clone = attacker.shadowClone;
  const sourceMove = clone?.currentMove;
  if (!clone || clone.phase !== 'active' || clone.state !== 'attack' || !sourceMove || clone.hitConnected) return;
  if (defender.state === 'knockdown' || defender.state === 'transform' || defender.state === 'throwHold' || defender.state === 'throwHeld' || defender.getupInvulnerableFrames > 0) return;
  if (!isActiveMoveFrame(sourceMove, clone.moveFrame)) return;

  const cloneFighter = makeShadowCloneFighter(attacker, clone);
  const clonePosition = getFighterCombatPosition(cloneFighter);
  const defenderPosition = getFighterCombatPosition(defender);
  const dx = defenderPosition.x - clonePosition.x;
  const dz = defenderPosition.z - clonePosition.z;
  const distance = Math.hypot(dx, dz);
  const weakMove = buildShadowCloneMove(sourceMove);
  const collision = getAttackCollision(cloneFighter, defender, weakMove, distance <= weakMove.range + UNIVERSAL_RANGE_BUFFER);
  if (!collision) return;

  clone.hitConnected = true;
  const blocked = canDefenderBlockMove(defender, cloneFighter, weakMove);
  const impactId = nextHitEventId(match);
  pushImpactSparkEvent(match, impactId, attacker, defender, weakMove, blocked ? 'block' : 'hit', {
    comboHits: blocked ? 0 : Math.max(1, attacker.comboHits + 1),
    juggled: defender.state === 'juggle' || isAirborne(defender),
    kiBurst: Boolean(sourceMove.kiBurst)
  }, collision.position);

  const pushX = distance > 0 ? dx / distance : clone.facing;
  const pushZ = distance > 0 ? dz / distance : 0;
  const attackerRemaining = Math.max(0, clone.actionFramesRemaining);
  if (blocked) {
    if (!moveUsesKi(sourceMove)) {
      attacker.ki = clamp(attacker.ki + Math.max(1, Math.round(KI_BLOCK_GAIN * 0.5)), 0, KI_MAX);
    }
    defender.ki = clamp(defender.ki + Math.max(1, Math.round(KI_DEFENDER_BLOCK_GAIN * 0.6)), 0, KI_MAX);
    defender.hp = Math.max(0, defender.hp - weakMove.blockDamage);
    const effectiveOnBlockFrames = getEffectiveOnBlockFrames(weakMove);
    defender.blockstunFramesRemaining = Math.max(1, attackerRemaining + effectiveOnBlockFrames);
    defender.stunFramesRemaining = 0;
    defender.stunTimer = framesToSeconds(defender.blockstunFramesRemaining);
    defender.state = defender.state === 'crouchBlock' ? 'crouchBlock' : 'block';
    defender.forcedCrouchFrames = 0;
    defender.position.x += pushX * weakMove.blockPushback * 0.12;
    defender.position.z += pushZ * weakMove.blockPushback * 0.12;
    return;
  }

  attacker.hitConfirmed = true;
  if (!moveUsesKi(sourceMove)) {
    attacker.ki = clamp(attacker.ki + Math.max(1, Math.round(KI_HIT_GAIN * 0.45)), 0, KI_MAX);
  }
  attacker.comboHits = Math.max(1, attacker.comboHits + 1);
  attacker.comboDamage = Math.max(0, attacker.comboDamage + weakMove.damage);
  pushCombatPopupEvent(match, impactId, attacker, weakMove, attacker.comboHits >= 2 ? 'combo' : null, {
    juggled: defender.state === 'juggle' || isAirborne(defender),
    kiBurst: Boolean(sourceMove.kiBurst)
  });

  const wasJuggled = defender.state === 'juggle';
  const stunFrames = Math.max(8, attackerRemaining + Math.round(weakMove.onHitFrames * 0.72));
  defender.hp = Math.max(0, defender.hp - weakMove.damage);
  defender.blockstunFramesRemaining = 0;
  defender.blockPunishWindowFrames = 0;
  defender.currentMove = null;
  defender.moveFrame = 0;
  defender.forcedCrouchFrames = 0;
  resetKiChargeRuntime(defender);
  defender.stunFramesRemaining = stunFrames;
  defender.stunTimer = framesToSeconds(stunFrames);
  defender.actionFramesRemaining = stunFrames;
  defender.actionTimer = framesToSeconds(stunFrames);
  defender.state = wasJuggled || isAirborne(defender) ? 'juggle' : 'hit';
  if (defender.state === 'juggle') {
    defender.position.y = Math.max(defender.position.y, JUGGLE_REFLOAT_MIN_HEIGHT * 0.86);
    defender.velocityY = Math.max(defender.velocityY, Math.min(3.9, JUGGLE_REFLOAT_VELOCITY * 0.78));
    defender.juggleDamage += weakMove.damage;
    defender.juggleSequenceDamage += weakMove.damage;
    applyJuggleFloatCorrection(cloneFighter, defender);
  }
  defender.position.x += pushX * weakMove.pushback * 0.18;
  defender.position.z += pushZ * weakMove.pushback * 0.18;
}

function buildShadowCloneMove(move: MoveDefinition): MoveDefinition {
  return {
    ...move,
    id: `${move.id}-shadow-clone`,
    label: `Shadow Clone ${move.label}`,
    damage: Math.max(1, Math.round(move.damage * SHADOW_CLONE_DAMAGE_SCALE)),
    blockDamage: Math.max(0, Math.round(move.blockDamage * SHADOW_CLONE_BLOCK_DAMAGE_SCALE)),
    onBlockFrames: Math.min(move.onBlockFrames, -1),
    onHitFrames: Math.max(6, Math.round(move.onHitFrames * 0.72)),
    onCounterHitFrames: Math.max(8, Math.round(move.onCounterHitFrames * 0.72)),
    pushback: move.pushback * 0.62,
    blockPushback: move.blockPushback * 0.58,
    launchHeight: 0,
    knockdown: false,
    tornado: false
  };
}

function makeShadowCloneFighter(source: FighterRuntime, clone: NonNullable<FighterRuntime['shadowClone']>): FighterRuntime {
  return {
    ...source,
    position: { ...clone.position },
    velocityY: clone.velocityY,
    facing: clone.facing,
    facingYaw: clone.facingYaw,
    state: clone.state,
    currentMove: clone.currentMove,
    moveInstanceId: clone.moveInstanceId,
    actionFramesRemaining: clone.actionFramesRemaining,
    actionTimer: framesToSeconds(clone.actionFramesRemaining),
    moveFrame: clone.moveFrame,
    hitConnected: clone.hitConnected,
    hitConfirmed: false,
    blockFlash: 0,
    hitFlash: 0,
    shadowClone: null,
    shadowCloneChargeConsumed: true
  };
}

function isWhiffPunish(defender: FighterRuntime) {
  const move = defender.currentMove;
  if (defender.state !== 'attack' || !move || defender.hitConnected) return false;
  return defender.whiffRecoveryApplied || defender.moveFrame >= move.startupFrames + move.activeFrames;
}

function pushCombatPopupEvent(
  match: MatchSnapshot,
  id: number,
  attacker: FighterRuntime,
  move: MoveDefinition,
  kind: 'combo' | 'punish' | 'whiffPunish' | null,
  context: { launched?: boolean; juggled?: boolean; tornado?: boolean; kiBurst?: boolean } = {}
) {
  if (!kind) return;
  match.combatEvents = [
    ...match.combatEvents,
    {
      id,
      slot: attacker.slot,
      kind,
      hits: attacker.comboHits,
      damage: attacker.comboDamage,
      moveLabel: move.label,
      moveInput: move.input,
      hitLevel: move.hitLevel,
      launched: context.launched,
      juggled: context.juggled,
      tornado: context.tornado,
      kiBurst: context.kiBurst
    }
  ].slice(-8);
}

function pushClashCombatPopupEvent(
  match: MatchSnapshot,
  id: number,
  fighter: FighterRuntime,
  move: MoveDefinition | null | undefined,
  kind: 'clashWin' | 'clashDraw' | 'clashPerfect',
  damage: number
) {
  match.combatEvents = [
    ...match.combatEvents,
    {
      id,
      slot: fighter.slot,
      kind,
      hits: kind === 'clashDraw' ? 0 : Math.max(1, fighter.comboHits),
      damage,
      moveLabel: move?.label ?? 'Ki Clash',
      moveInput: move?.input,
      hitLevel: move?.hitLevel ?? 'special',
      launched: Boolean(move?.launchHeight),
      kiBurst: true
    }
  ].slice(-8);
}

function nextHitEventId(match: MatchSnapshot) {
  match.lastHitId += 1;
  return match.lastHitId;
}

function pushImpactSparkEvent(
  match: MatchSnapshot,
  id: number,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  move: MoveDefinition,
  kind: ImpactSparkKind,
  context: { comboHits?: number; launched?: boolean; juggled?: boolean; tornado?: boolean; kiBurst?: boolean } = {},
  position: [number, number, number] = getImpactPosition(attacker, defender, move)
) {
  match.impactEvents = [
    ...match.impactEvents,
    {
      id,
      kind,
      position,
      attackerSlot: attacker.slot,
      defenderSlot: defender.slot,
      hitLevel: move.hitLevel,
      damage: kind === 'block' ? move.blockDamage : move.damage,
      moveLabel: move.label,
      moveInput: move.input,
      comboHits: context.comboHits,
      launched: context.launched,
      juggled: context.juggled,
      tornado: context.tornado,
      kiBurst: context.kiBurst
    }
  ].slice(-12);
}

function enterKnockdown(fighter: FighterRuntime, frames: number) {
  const floorFrames = Math.max(KNOCKDOWN_MIN_FRAMES, frames - GETUP_FRAMES);
  fighter.state = 'knockdown';
  fighter.stunFramesRemaining = floorFrames;
  fighter.blockstunFramesRemaining = 0;
  fighter.blockPunishWindowFrames = 0;
  fighter.stunTimer = framesToSeconds(floorFrames);
  fighter.actionFramesRemaining = floorFrames;
  fighter.actionTimer = framesToSeconds(floorFrames);
  fighter.currentMove = null;
  fighter.moveFrame = 0;
  fighter.forcedCrouchFrames = 0;
  resetKiChargeRuntime(fighter);
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
  fighter.getupStarted = false;
  fighter.getupForward = 0;
  fighter.getupLane = 0;
  fighter.getupAction = 'none';
  fighter.getupTotalFrames = 0;
  fighter.getupInvulnerableFrames = 0;
  fighter.juggleDamage = 0;
  fighter.juggleSequenceDamage = 0;
  fighter.juggleTornadoCount = 0;
  fighter.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
}

function isActiveMoveFrame(move: MoveDefinition, moveFrame: number) {
  return moveFrame >= move.startupFrames && moveFrame < move.startupFrames + move.activeFrames;
}

function completeActionLock(fighter: FighterRuntime, input: InputFrame) {
  const completedMove = fighter.currentMove;
  const endedAttackInCrouch = fighter.state === 'attack' && Boolean(completedMove?.endsInCrouch);
  fighter.currentMove = null;
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
  fighter.moveFrame = 0;
  if (endedAttackInCrouch) {
    fighter.forcedCrouchFrames = input.down ? 0 : FORCED_CROUCH_EXIT_FRAMES;
    fighter.wasCrouching = true;
  }
  fighter.state = getPostLockState(fighter, input);
}

function getPostLockState(fighter: FighterRuntime, input?: InputFrame): FighterRuntime['state'] {
  if (
    fighter.state === 'juggle' &&
    (isAirborne(fighter) ||
      fighter.stunFramesRemaining > 0 ||
      fighter.actionFramesRemaining > 0 ||
      fighter.stunTimer > 0 ||
      fighter.actionTimer > 0)
  ) {
    return 'juggle';
  }
  if (fighter.state === 'hit' && isAirborne(fighter)) return 'hit';
  if (fighter.forcedCrouchFrames > 0 || input?.down) return 'crouch';
  return 'idle';
}

function isAirborne(fighter: FighterRuntime) {
  return fighter.position.y > 0 || fighter.velocityY !== 0;
}

function getJuggleVelocity(move: MoveDefinition, wasAirborne: boolean) {
  const launchHeight = Math.max(0, move.launchHeight ?? 0);
  if (wasAirborne && Number.isFinite(move.juggleRefloatVelocity)) {
    return clamp(move.juggleRefloatVelocity ?? JUGGLE_REFLOAT_VELOCITY, 2.2, 6.4);
  }
  if (!wasAirborne && Number.isFinite(move.launchVelocity)) {
    return clamp(move.launchVelocity ?? JUGGLE_INITIAL_VELOCITY, 3.2, 7.2);
  }
  if (wasAirborne) {
    return Math.min(5.25, Math.max(JUGGLE_REFLOAT_VELOCITY, launchHeight > 0 ? launchHeight * 1.95 : JUGGLE_REFLOAT_VELOCITY));
  }
  return Math.min(6.65, Math.max(JUGGLE_INITIAL_VELOCITY, launchHeight > 0 ? launchHeight * 2.55 : JUGGLE_INITIAL_VELOCITY));
}

function getTornadoRefloatVelocity(move: MoveDefinition) {
  return clamp(move.juggleRefloatVelocity ?? TORNADO_REFLOAT_VELOCITY, 3.4, 6.4);
}

function getMoveJuggleGravityScale(move: MoveDefinition) {
  return clamp(move.juggleGravityScale ?? JUGGLE_GRAVITY_SCALE, 0.28, 1.2);
}

function getFighterJuggleGravityScale(fighter: FighterRuntime) {
  return clamp(fighter.juggleGravityScale || JUGGLE_GRAVITY_SCALE, 0.28, 1.2);
}

function applyJuggleLandingRecovery(fighter: FighterRuntime) {
  const recoveryFrames = Math.max(
    JUGGLE_LANDING_RECOVERY_FRAMES,
    fighter.stunFramesRemaining,
    fighter.actionFramesRemaining,
    secondsToFrames(fighter.stunTimer),
    secondsToFrames(fighter.actionTimer)
  );
  fighter.stunFramesRemaining = recoveryFrames;
  fighter.actionFramesRemaining = recoveryFrames;
  fighter.stunTimer = framesToSeconds(recoveryFrames);
  fighter.actionTimer = framesToSeconds(recoveryFrames);
}

function applyJuggleFloatCorrection(attacker: FighterRuntime, defender: FighterRuntime) {
  const dx = defender.position.x - attacker.position.x;
  const dz = defender.position.z - attacker.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= JUGGLE_KEEP_CLOSE_DISTANCE || distance === 0) return;
  const pull = Math.min(JUGGLE_KEEP_CLOSE_PULL, distance - JUGGLE_KEEP_CLOSE_DISTANCE);
  defender.position.x -= (dx / distance) * pull;
  defender.position.z -= (dz / distance) * pull;
}

function applyWhiffRecoveryIfNeeded(fighter: FighterRuntime) {
  const move = fighter.currentMove;
  if (!move || fighter.state !== 'attack' || fighter.hitConnected || fighter.whiffRecoveryApplied) return;
  if (fighter.moveFrame < move.startupFrames + move.activeFrames) return;
  const extraFrames = getWhiffRecoveryFrames(move);
  fighter.actionFramesRemaining += extraFrames;
  fighter.whiffRecoveryApplied = true;
}

function getWhiffRecoveryFrames(move: MoveDefinition) {
  return Math.max(0, Math.round(move.whiffRecoveryFrames ?? DEFAULT_WHIFF_RECOVERY_FRAMES));
}

function getEffectiveOnBlockFrames(move: MoveDefinition) {
  return move.onBlockFrames;
}

function isCrouchingState(fighter: FighterRuntime) {
  return fighter.state === 'crouch' || fighter.state === 'crouchBlock';
}

function canDefenderBlockMove(defender: FighterRuntime, attacker: FighterRuntime, move: MoveDefinition) {
  if (defender.facing !== -attacker.facing) return false;
  if (defender.state === 'block') return canStandingBlockHitLevel(move.hitLevel);
  if (defender.state === 'crouchBlock') return canCrouchBlockHitLevel(move.hitLevel);
  return false;
}

function canStandingBlockHitLevel(hitLevel: MoveDefinition['hitLevel']) {
  return hitLevel === 'high' || hitLevel === 'special';
}

function canCrouchBlockHitLevel(hitLevel: MoveDefinition['hitLevel']) {
  return hitLevel === 'low' || hitLevel === 'special';
}

type Aabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

function getAttackCollision(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition, includeBaseHitbox: boolean) {
  const attackBoxes = getActiveAttackAabbs(attacker, move, includeBaseHitbox);
  const hurtboxes = getCurrentHurtboxes(defender)
    .flatMap((hurtbox) => getHurtboxesForHitLevel(hurtbox, move.hitLevel))
    .map((hurtbox) => hurtboxToWorldAabb(defender, hurtbox));
  for (const attackBox of attackBoxes) {
    const hurtbox = hurtboxes.find((box) => boxesIntersect(attackBox, box));
    if (hurtbox) return { attackBox, hurtbox, position: getAabbOverlapCenter(attackBox, hurtbox) };
  }
  return null;
}

function getImpactPosition(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition): [number, number, number] {
  const defenderPosition = getFighterCombatPosition(defender);
  return getAttackCollision(attacker, defender, move, true)?.position ?? [defenderPosition.x, defenderPosition.y + 1.08, defenderPosition.z];
}

function getActiveAttackAabbs(attacker: FighterRuntime, move: MoveDefinition, includeBaseHitbox: boolean) {
  const boxes = includeBaseHitbox ? [moveHitboxToWorldAabb(attacker, move.hitbox)] : [];
  return [...boxes, ...getActiveEffectHitboxes(attacker, move)];
}

function findFirstBoxOverlap(a: Aabb[], b: Aabb[]) {
  for (const first of a) {
    const second = b.find((box) => boxesIntersect(first, box));
    if (second) return [first, second] as const;
  }
  return null;
}

function getActiveEffectHitboxes(attacker: FighterRuntime, move: MoveDefinition) {
  const effects = attacker.character.effects ?? [];
  const library = new Map(effects.map((effect) => [effect.id, effect]));
  const totalFrames = Math.max(1, move.startupFrames + move.activeFrames + move.recoveryFrames);
  return getEffectMoveKeys(attacker, move)
    .flatMap((moveKey) => attacker.character.moveEffects?.[moveKey] ?? [])
    .filter((instance) => effectIsVisibleAt(instance, attacker.moveFrame, totalFrames))
    .filter((instance, index, all) => all.findIndex((candidate) => candidate.id === instance.id) === index)
    .flatMap((instance) => {
      const effect = library.get(instance.effectId);
      if (!effect) return [];
      const transform = effectTransformAt(effect, instance, attacker.moveFrame);
      const anchor = instance.anchor ?? effect.anchor;
      return [effectHitboxToWorldAabb(attacker, transform, anchor, instance.hitbox)];
    });
}

function getEffectMoveKeys(attacker: FighterRuntime, move: MoveDefinition) {
  const baseInputKeys: Record<string, string> = {
    jab: 'jableft',
    heavy: 'jabright',
    kick: 'kickleft',
    special: 'kickright',
    '1': 'jableft',
    '2': 'jabright',
    '3': 'kickleft',
    '4': 'kickright'
  };
  const commandKeys = move.command
    ? [move.command, move.command.startsWith('cmd:') ? move.command.slice(4) : `cmd:${move.command}`]
    : [];
  const candidates = [
    move.animationKey,
    ...commandKeys,
    move.comboKey,
    move.id,
    baseInputKeys[move.input],
    move.input
  ].filter((key): key is string => Boolean(key));
  return [...new Set(candidates)].filter((key) => attacker.character.moveEffects?.[key]?.length);
}

function effectHitboxToWorldAabb(attacker: FighterRuntime, transform: { position: [number, number, number]; scale: [number, number, number] }, anchor: string, hitbox?: BoxSpec) {
  const [baseX, baseY, baseZ] = resolveEffectWorldPosition(attacker, transform, anchor);
  const globalScale = getCharacterCombatScale(attacker.character);
  if (hitbox) {
    const facing = attacker.facing || 1;
    return makeAabb(
      baseX + hitbox.offset[2] * globalScale.width * facing,
      baseY + hitbox.offset[1] * globalScale.height,
      baseZ + hitbox.offset[0] * globalScale.width,
      hitbox.size[2] * globalScale.width + UNIVERSAL_HITBOX_FORWARD_PADDING,
      hitbox.size[1] * globalScale.height + UNIVERSAL_HITBOX_VERTICAL_PADDING,
      hitbox.size[0] * globalScale.width + UNIVERSAL_HITBOX_LATERAL_PADDING
    );
  }
  const sizeX = Math.max(0.38, Math.abs(transform.scale[0]) * 0.62 * globalScale.width) + UNIVERSAL_HITBOX_FORWARD_PADDING;
  const sizeY = Math.max(0.38, Math.abs(transform.scale[1]) * 0.62 * globalScale.height) + UNIVERSAL_HITBOX_VERTICAL_PADDING;
  const sizeZ = Math.max(0.36, Math.abs(transform.scale[2]) * 0.62 * globalScale.width) + UNIVERSAL_HITBOX_LATERAL_PADDING;
  return makeAabb(baseX, baseY, baseZ, sizeX, sizeY, sizeZ);
}

function resolveEffectWorldPosition(fighter: FighterRuntime, transform: { position: [number, number, number] }, anchor: string): [number, number, number] {
  const facing = fighter.facing || 1;
  const fighterPosition = getFighterCombatPosition(fighter);
  const globalScale = getCharacterCombatScale(fighter.character);
  const anchorOffsets: Record<string, [number, number, number]> = {
    root: [0, 0, 0],
    body: [0, 1.05, 0],
    head: [0, 1.75, 0],
    hands: [0.52 * facing, 1.18, 0],
    feet: [0.18 * facing, 0.28, 0],
    hitbox: [0.78 * facing, 1.08, 0],
    world: [0, 0, 0]
  };
  const offset = anchorOffsets[anchor] ?? anchorOffsets.body;
  if (anchor === 'world') return [...transform.position] as [number, number, number];
  const mirroredX = transform.position[0] * globalScale.width * (facing === -1 ? -1 : 1);
  return [
    fighterPosition.x + offset[0] * globalScale.width + mirroredX,
    fighterPosition.y + offset[1] * globalScale.height + transform.position[1] * globalScale.height,
    fighterPosition.z + offset[2] * globalScale.width + transform.position[2] * globalScale.width
  ];
}

function moveHitboxToWorldAabb(attacker: FighterRuntime, hitbox: BoxSpec): Aabb {
  const facing = attacker.facing || 1;
  const attackerPosition = getFighterCombatPosition(attacker);
  const globalScale = getCharacterCombatScale(attacker.character);
  const centerX = attackerPosition.x + facing * hitbox.offset[2] * globalScale.width;
  const centerY = attackerPosition.y + hitbox.offset[1] * globalScale.height;
  const centerZ = attackerPosition.z + hitbox.offset[0] * globalScale.width;
  return makeAabb(
    centerX,
    centerY,
    centerZ,
    hitbox.size[2] * globalScale.width + UNIVERSAL_HITBOX_FORWARD_PADDING,
    hitbox.size[1] * globalScale.height + UNIVERSAL_HITBOX_VERTICAL_PADDING,
    hitbox.size[0] * globalScale.width + UNIVERSAL_HITBOX_LATERAL_PADDING
  );
}

function hurtboxToWorldAabb(defender: FighterRuntime, hurtbox: BoxSpec): Aabb {
  const defenderPosition = getFighterCombatPosition(defender);
  const globalScale = getCharacterCombatScale(defender.character);
  const centerX = defenderPosition.x + hurtbox.offset[2] * globalScale.width * (defender.facing || 1);
  const centerY = defenderPosition.y + hurtbox.offset[1] * globalScale.height;
  const centerZ = defenderPosition.z + hurtbox.offset[0] * globalScale.width;
  return makeAabb(centerX, centerY, centerZ, hurtbox.size[2] * globalScale.width, hurtbox.size[1] * globalScale.height, hurtbox.size[0] * globalScale.width);
}

function getFighterCombatPosition(fighter: FighterRuntime) {
  return {
    x: fighter.position.x + getFighterAnimationOffsetX(fighter),
    y: fighter.position.y,
    z: fighter.position.z
  };
}

function getFighterAnimationOffsetX(fighter: FighterRuntime) {
  const animation = getFighterAnimationFrameSource(fighter);
  if (!animation?.key) return 0;
  const frameIndex = animation.frameSource?.match(/frame-(\d+)\.png/)?.[1];
  const frameSize = frameIndex ? fighter.character.animationFrameScales?.[animation.key]?.[String(Number(frameIndex))] : undefined;
  const size = frameSize ?? fighter.character.animationScales?.[animation.key];
  return clamp(Number(size?.offsetX) || 0, -6, 6);
}

function getFighterAnimationFrameSource(fighter: FighterRuntime) {
  const frames = fighter.character.animationFrames;
  if (!frames) return null;
  const key = getFighterAnimationKey(fighter);
  const resolved = resolveAnimationFrameSequence(frames, key);
  if (!resolved) return { key, frameSource: undefined };
  return { key: resolved.key, frameSource: resolved.sequence[getFighterAnimationFrameIndex(fighter, key, resolved.sequence.length)] };
}

function resolveAnimationFrameSequence(frames: NonNullable<CharacterDefinition['animationFrames']>, key: string) {
  const fallbackKeys = [
    key,
    key === 'sprint' ? 'walkForward' : undefined,
    key === 'backflip' ? 'jump' : undefined,
    key === 'backflip' ? 'walkBack' : undefined,
    key === 'crouchBlock' ? 'block' : undefined,
    key === 'crouchBlock' ? 'crouch' : undefined,
    key === 'entry' ? 'win' : undefined,
    key === 'juggle' ? 'hitHeavy' : undefined,
    key === 'juggle' ? 'hitLight' : undefined,
    key.startsWith('getup') ? 'knockdown' : undefined,
    'idle'
  ];
  for (const fallbackKey of fallbackKeys) {
    if (!fallbackKey) continue;
    const sequence = frames[fallbackKey];
    if (sequence?.length) return { key: fallbackKey, sequence };
  }
  return null;
}

function getFighterAnimationFrameIndex(fighter: FighterRuntime, key: string, sequenceLength: number) {
  if (sequenceLength <= 1) return 0;
  if (fighter.state === 'chargeKi') return getChargeKiAnimationFrameIndex(fighter, sequenceLength);
  if (fighter.state === 'attack') return Math.min(sequenceLength - 1, Math.floor(activeMoveProgress(fighter) * sequenceLength));
  if (fighter.state === 'getup') return Math.min(sequenceLength - 1, Math.floor(getFighterGetupProgress(fighter) * sequenceLength));
  if (key === 'idle' || key === 'crouch' || key === 'block' || key === 'crouchBlock' || key === 'hitLight' || key === 'win' || key === 'lose') return 0;
  return 0;
}

function getChargeKiAnimationFrameIndex(fighter: FighterRuntime, sequenceLength: number) {
  if (sequenceLength <= 1) return 0;
  const move = fighter.currentMove;
  const forwardFrames = Math.max(1, (move?.startupFrames ?? 14) + (move?.activeFrames ?? 18));
  if (fighter.chargePhase === 'hold') return sequenceLength - 2 + (Math.floor(fighter.chargeFrame / 10) % 2);
  if (fighter.chargePhase === 'recovery') {
    const recoveryFrames = Math.max(1, move?.recoveryFrames ?? 16);
    const reverseProgress = Math.min(1, Math.max(0, fighter.chargeFrame / recoveryFrames));
    return Math.max(0, Math.min(sequenceLength - 1, sequenceLength - 1 - Math.floor(reverseProgress * sequenceLength)));
  }
  const forwardProgress = Math.min(1, Math.max(0, fighter.moveFrame / forwardFrames));
  return Math.max(0, Math.min(sequenceLength - 1, Math.floor(forwardProgress * sequenceLength)));
}

function getFighterGetupProgress(fighter: FighterRuntime) {
  const total = Math.max(1, fighter.getupTotalFrames || GETUP_FRAMES);
  const remaining = Math.max(0, fighter.actionFramesRemaining || secondsToFrames(fighter.actionTimer));
  return clamp(1 - remaining / total, 0, 1);
}

function getFighterAnimationKey(fighter: FighterRuntime) {
  if (fighter.previewAnimationKey) return fighter.previewAnimationKey;
  if (fighter.state === 'attack') return fighter.currentMove?.animationKey ?? fighter.currentMove?.input ?? 'jab';
  if (fighter.state === 'walk') {
    if (fighter.dashForwardFrames > 0 && fighter.character.animationFrames?.sprint?.length) return 'sprint';
    if (fighter.walkDirection > 0) return 'walkForward';
    if (fighter.walkDirection < 0) return 'walkBack';
    return fighter.facing === 1 ? 'walkForward' : 'walkBack';
  }
  if (fighter.state === 'sidestep') return fighter.sidestepDirection < 0 ? 'sidestepLeft' : 'sidestepRight';
  if (fighter.state === 'crouchBlock') return fighter.character.animationFrames?.crouchBlock?.length ? 'crouchBlock' : fighter.character.animationFrames?.block?.length ? 'block' : 'crouch';
  if (fighter.state === 'chargeKi') return 'chargeKi';
  if (fighter.state === 'transform') return fighter.character.animationFrames?.transform?.length ? 'transform' : fighter.character.animationFrames?.chargeKi?.length ? 'chargeKi' : 'idle';
  if (fighter.state === 'throwHold') return fighter.currentMove?.animationKey ?? fighter.currentMove?.input ?? 'jab';
  if (fighter.state === 'throwHeld') return 'hitLight';
  if (fighter.state === 'hit') return 'hitLight';
  if (fighter.state === 'juggle') return fighter.character.animationFrames?.juggle?.length ? 'juggle' : fighter.character.animationFrames?.hitHeavy?.length ? 'hitHeavy' : 'hitLight';
  if (fighter.state === 'getup') return getGetupAnimationKey(fighter.getupAction) ?? 'knockdown';
  if (fighter.state === 'entry') return 'entry';
  return fighter.state;
}

function makeAabb(centerX: number, centerY: number, centerZ: number, sizeX: number, sizeY: number, sizeZ: number): Aabb {
  return {
    minX: centerX - sizeX / 2,
    maxX: centerX + sizeX / 2,
    minY: centerY - sizeY / 2,
    maxY: centerY + sizeY / 2,
    minZ: centerZ - sizeZ / 2,
    maxZ: centerZ + sizeZ / 2
  };
}

function boxesIntersect(a: Aabb, b: Aabb) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function getCurrentHurtboxes(fighter: FighterRuntime): BoxSpec[] {
  const base = fighter.state === 'attack' && fighter.currentMove?.hurtboxes?.length ? fighter.currentMove.hurtboxes : fighter.character.hurtboxes;
  const source = base.length > 0 ? base : [DEFAULT_HURTBOX];
  const offset = fighter.state === 'attack' ? fighter.currentMove?.hurtboxOffset : undefined;
  return source.map((box) => applyPoseToHurtbox(fighter, offset ? offsetHurtbox(box, offset) : box));
}

function getHurtboxesForHitLevel(hurtbox: BoxSpec, hitLevel: MoveDefinition['hitLevel']): BoxSpec[] {
  if (hitLevel !== 'low') return [hurtbox];
  const bottom = hurtbox.offset[1] - hurtbox.size[1] / 2;
  const lowHeight = clamp(Math.min(LOW_HURTBOX_MAX_HEIGHT, hurtbox.size[1] * 0.34), LOW_HURTBOX_MIN_HEIGHT, LOW_HURTBOX_MAX_HEIGHT);
  return [
    hurtbox,
    {
      offset: [hurtbox.offset[0], bottom + lowHeight / 2, hurtbox.offset[2]],
      size: [hurtbox.size[0], lowHeight, hurtbox.size[2] + LOW_HURTBOX_FORWARD_EXTENSION]
    }
  ];
}

function offsetHurtbox(box: BoxSpec, offset: [number, number, number]): BoxSpec {
  return {
    offset: [box.offset[0] + offset[0], box.offset[1] + offset[1], box.offset[2] + offset[2]],
    size: box.size
  };
}

function applyPoseToHurtbox(fighter: FighterRuntime, box: BoxSpec): BoxSpec {
  if (fighter.state === 'crouch' || (fighter.wasCrouching && fighter.state !== 'crouchBlock')) {
    const bottom = box.offset[1] - box.size[1] / 2;
    const sizeY = Math.min(box.size[1] * 0.42, 0.82);
    return {
      offset: [box.offset[0], bottom + sizeY / 2, box.offset[2]],
      size: [box.size[0] * 0.94, sizeY, box.size[2] * 0.94]
    };
  }
  if (fighter.state === 'jump' || fighter.position.y > 0 || fighter.velocityY > 0) {
    return {
      offset: [box.offset[0], box.offset[1] + 0.34, box.offset[2]],
      size: [box.size[0] * 0.96, box.size[1] * 0.9, box.size[2] * 0.96]
    };
  }
  return box;
}

function isCounterHit(defender: FighterRuntime) {
  if (defender.state !== 'attack' || !defender.currentMove) return false;
  return defender.moveFrame <= defender.currentMove.startupFrames + defender.currentMove.activeFrames;
}

function finishRound(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  const winner = p1.hp === p2.hp ? (p1.slot === 1 ? p1 : p2) : p1.hp > p2.hp ? p1 : p2;
  winner.roundsWon += 1;
  match.phase = 'roundOver';
  match.countdown = ROUND_OVER_DELAY;
  match.message = 'K.O.';
  match.clashState = createEmptyClashState();
  match.visualTimeScale = KO_SLOWMO_TIME_SCALE;
  match.fighters.forEach((fighter) => {
    fighter.state = fighter.slot === winner.slot ? 'win' : 'lose';
    fighter.currentMove = null;
    fighter.actionTimer = ROUND_OVER_DELAY;
    fighter.actionFramesRemaining = secondsToFrames(ROUND_OVER_DELAY);
    fighter.moveFrame = 0;
    fighter.stunFramesRemaining = 0;
    fighter.blockstunFramesRemaining = 0;
    fighter.blockPunishWindowFrames = 0;
    fighter.forcedCrouchFrames = 0;
    fighter.getupInvulnerableFrames = 0;
    fighter.getupForward = 0;
    fighter.getupLane = 0;
    fighter.getupStarted = false;
    fighter.getupAction = 'none';
    fighter.getupTotalFrames = 0;
    fighter.shadowClone = null;
    fighter.shadowCloneChargeConsumed = false;
    clearThrowRuntime(fighter);
  });
}

function refillTrainingHealth(match: MatchSnapshot) {
  const defeated = match.fighters.filter((fighter) => fighter.hp <= 0);
  match.fighters.forEach((fighter) => {
    fighter.roundsWon = 0;
  });
  if (defeated.length === 0) return;

  match.phase = 'fighting';
  match.countdown = 0;
  match.message = '';
  match.clashState = createEmptyClashState();
  match.visualTimeScale = 1;
  match.winnerSlot = null;
  defeated.forEach((fighter) => {
    fighter.hp = fighter.maxHp;
  });
}

function beginRoundIntro(match: MatchSnapshot) {
  const totalIntroSeconds = getRoundIntroTotalSeconds(match.round);
  match.phase = 'intro';
  match.countdown = totalIntroSeconds;
  match.message = `ROUND ${match.round}`;
  match.clashState = createEmptyClashState();
  match.visualTimeScale = 1;
  match.winnerSlot = null;
  match.fighters.forEach((fighter) => {
    fighter.state = 'entry';
    fighter.currentMove = null;
    fighter.actionTimer = totalIntroSeconds;
    fighter.actionFramesRemaining = secondsToFrames(totalIntroSeconds);
    fighter.moveFrame = 0;
    resetKiChargeRuntime(fighter);
    fighter.hitConnected = false;
    fighter.hitConfirmed = false;
    fighter.whiffRecoveryApplied = false;
    fighter.stunTimer = 0;
    fighter.stunFramesRemaining = 0;
    fighter.blockstunFramesRemaining = 0;
    fighter.blockPunishWindowFrames = 0;
    fighter.forcedCrouchFrames = 0;
    fighter.getupInvulnerableFrames = 0;
    fighter.getupForward = 0;
    fighter.getupLane = 0;
    fighter.getupStarted = false;
    fighter.getupAction = 'none';
    fighter.getupTotalFrames = 0;
    fighter.velocityY = 0;
    fighter.position.y = 0;
    fighter.shadowClone = null;
    fighter.shadowCloneChargeConsumed = false;
  });
}

function updateRoundIntro(match: MatchSnapshot) {
  const timing = getRoundAnnouncerTiming(match.round);
  const clipElapsed = getRoundIntroTotalSeconds(match.round) - match.countdown;
  const inEntry = clipElapsed < ROUND_INTRO_ENTRY_SECONDS;
  const inRoundCall = clipElapsed < timing.fightAt;
  match.message = inRoundCall ? `ROUND ${match.round}` : 'FIGHT';
  match.fighters.forEach((fighter) => {
    fighter.state = inEntry ? 'entry' : 'idle';
    fighter.actionTimer = match.countdown;
    fighter.actionFramesRemaining = secondsToFrames(match.countdown);
    fighter.forcedCrouchFrames = 0;
  });
}

function getRoundIntroTotalSeconds(round: number) {
  return Math.max(ROUND_INTRO_ENTRY_SECONDS, getRoundAnnouncerTiming(round).duration);
}

function getRoundAnnouncerTiming(round: number) {
  const index = Math.min(Math.max(1, Math.round(round)), ROUND_ANNOUNCER_TIMINGS.length) - 1;
  return ROUND_ANNOUNCER_TIMINGS[index] ?? ROUND_ANNOUNCER_TIMINGS[0];
}

function updateRoundOverVisuals(match: MatchSnapshot) {
  const elapsed = ROUND_OVER_DELAY - Math.max(0, match.countdown);
  match.visualTimeScale = elapsed < KO_SLOWMO_SECONDS ? KO_SLOWMO_TIME_SCALE : 1;
}

function resetRound(match: MatchSnapshot) {
  const rounds: [number, number] = [match.fighters[0].roundsWon, match.fighters[1].roundsWon];
  const [p1Character, p2Character] = [match.fighters[0].character, match.fighters[1].character];
  const [p1BaseCharacter, p2BaseCharacter] = [match.fighters[0].baseCharacter, match.fighters[1].baseCharacter];
  match.fighters = [
    createFighter(1, p1Character, -START_DISTANCE / 2, match.maxHealth, p1BaseCharacter),
    createFighter(2, p2Character, START_DISTANCE / 2, match.maxHealth, p2BaseCharacter)
  ];
  match.fighters[0].roundsWon = rounds[0];
  match.fighters[1].roundsWon = rounds[1];
  match.round += 1;
  match.roundAiSeed = makeRoundAiSeed(match.aiSeed, match.round);
  match.timer = match.roundTime;
  match.countdown = 0;
  match.phase = 'fighting';
  match.message = '';
  match.combatEvents = [];
  match.impactEvents = [];
  match.clashState = createEmptyClashState();
  match.visualTimeScale = 1;
  if (match.introEnabled) beginRoundIntro(match);
}

function resolveFacing(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  p1.facing = 1;
  p2.facing = -1;
  p1.facingYaw = Math.atan2(p2.position.x - p1.position.x, p2.position.z - p1.position.z);
  p2.facingYaw = Math.atan2(p1.position.x - p2.position.x, p1.position.z - p2.position.z);
}

function resolveBodyCollision(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  if (p1.state === 'throwHold' || p1.state === 'throwHeld' || p2.state === 'throwHold' || p2.state === 'throwHeld') return;
  const minDistance = 0.72;
  const dx = p2.position.x - p1.position.x;
  const dz = p2.position.z - p1.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance < minDistance) {
    const correction = (minDistance - distance) / 2;
    const directionX = distance > 0 ? dx / distance : 1;
    const directionZ = distance > 0 ? dz / distance : 0;
    p1.position.x -= correction * directionX;
    p1.position.z -= correction * directionZ;
    p2.position.x += correction * directionX;
    p2.position.z += correction * directionZ;
  }
}

function constrainFightersToStageBounds(match: MatchSnapshot) {
  match.fighters.forEach((fighter) => constrainFighterToStageBounds(match, fighter));
}

function constrainFighterToStageBounds(match: MatchSnapshot, fighter: FighterRuntime) {
  constrainPositionToStageBounds(match.stage, fighter.position, getFighterWallRadius(fighter));
  constrainShadowCloneToStageBounds(match, fighter);
}

function constrainShadowCloneToStageBounds(match: MatchSnapshot, fighter: FighterRuntime) {
  if (!fighter.shadowClone) return;
  constrainPositionToStageBounds(match.stage, fighter.shadowClone.position, getFighterWallRadius(fighter));
}

function constrainPositionToStageBounds(
  stage: StageDefinition,
  position: { x: number; z: number },
  radius = MIN_WALL_RADIUS
) {
  const bounds = resolveStageMovementBounds(stage, radius);
  const local = worldToStageBoundsLocal(position, bounds);
  if (bounds.shape === 'ellipse') {
    constrainLocalPointToEllipse(local, bounds);
  } else {
    local.x = clamp(local.x, -bounds.halfWidth, bounds.halfWidth);
    local.z = clamp(local.z, -bounds.halfDepth, bounds.halfDepth);
  }
  const next = stageBoundsLocalToWorld(local, bounds);
  position.x = next.x;
  position.z = next.z;
}

type ResolvedStageMovementBounds = {
  shape: 'box' | 'ellipse';
  centerX: number;
  centerZ: number;
  rotationY: number;
  halfWidth: number;
  halfDepth: number;
};

function resolveStageMovementBounds(stage: StageDefinition, radius = MIN_WALL_RADIUS): ResolvedStageMovementBounds {
  const authoredBounds = stage.playableBounds;
  const minWidth = authoredBounds ? 4 : MIN_STAGE_BOUND_WIDTH;
  const minDepth = authoredBounds ? 4 : MIN_STAGE_BOUND_DEPTH;
  const width = Math.max(
    minWidth,
    Number.isFinite(authoredBounds?.width)
      ? Number(authoredBounds?.width)
      : Number.isFinite(stage.world?.width)
        ? Number(stage.world?.width)
        : DEFAULT_STAGE_BOUND_WIDTH
  );
  const depth = Math.max(
    minDepth,
    Number.isFinite(authoredBounds?.depth)
      ? Number(authoredBounds?.depth)
      : Number.isFinite(stage.world?.depth)
        ? Number(stage.world?.depth)
        : DEFAULT_STAGE_BOUND_DEPTH
  );
  const wallPadding = clamp(radius, 0, Math.min(width, depth) * 0.45);
  const laneCenter = stage.fightPlane?.center;
  return {
    shape: authoredBounds?.shape === 'ellipse' ? 'ellipse' : 'box',
    centerX: authoredBounds ? laneCenter?.[0] ?? 0 : 0,
    centerZ: authoredBounds ? laneCenter?.[2] ?? 0 : 0,
    rotationY: authoredBounds ? stage.fightPlane?.rotationY ?? 0 : 0,
    halfWidth: Math.max(0.1, width / 2 - wallPadding),
    halfDepth: Math.max(0.1, depth / 2 - wallPadding)
  };
}

function worldToStageBoundsLocal(position: { x: number; z: number }, bounds: ResolvedStageMovementBounds) {
  const dx = position.x - bounds.centerX;
  const dz = position.z - bounds.centerZ;
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos
  };
}

function stageBoundsLocalToWorld(position: { x: number; z: number }, bounds: ResolvedStageMovementBounds) {
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return {
    x: bounds.centerX + position.x * cos + position.z * sin,
    z: bounds.centerZ - position.x * sin + position.z * cos
  };
}

function constrainLocalPointToEllipse(position: { x: number; z: number }, bounds: ResolvedStageMovementBounds) {
  const normalizedDistance = (position.x * position.x) / (bounds.halfWidth * bounds.halfWidth)
    + (position.z * position.z) / (bounds.halfDepth * bounds.halfDepth);
  if (normalizedDistance <= 1) return;
  const scale = 1 / Math.sqrt(normalizedDistance);
  position.x *= scale;
  position.z *= scale;
}

function getFighterWallRadius(fighter: FighterRuntime) {
  const scale = getCharacterCombatScale(fighter.character);
  return clamp(scale.width * 0.38, MIN_WALL_RADIUS, MAX_WALL_RADIUS);
}

function getDashForwardDistance(fighter: FighterRuntime) {
  return clamp(fighter.character.stats.dashDistance ?? DEFAULT_DASH_FORWARD_DISTANCE, 0, 2.4);
}

function moveAlongOpponentAxis(fighter: FighterRuntime, opponent: FighterRuntime, amount: number) {
  const dx = opponent.position.x - fighter.position.x;
  const dz = opponent.position.z - fighter.position.z;
  const distance = Math.hypot(dx, dz) || 1;
  fighter.position.x += (dx / distance) * amount;
  fighter.position.z += (dz / distance) * amount;
}

function applyAttackForwardForce(fighter: FighterRuntime, opponent: FighterRuntime, previousMoveFrame: number, currentMoveFrame: number) {
  const move = fighter.currentMove;
  const force = move?.forwardForce ?? 0;
  if (!move || fighter.state !== 'attack' || fighter.hitConnected) return;
  const totalFrames = Math.max(1, move.startupFrames + move.activeFrames + move.recoveryFrames);
  const startFrame = clamp(Math.round(move.forwardForceStartFrame ?? 1), 1, totalFrames);
  const endFrame = clamp(Math.round(move.forwardForceEndFrame ?? totalFrames), startFrame, totalFrames);
  const windowFrames = Math.max(1, endFrame - startFrame + 1);
  const overlapFrames = Math.max(0, Math.min(currentMoveFrame, endFrame) - Math.max(previousMoveFrame, startFrame - 1));
  if (overlapFrames <= 0) return;
  if (force !== 0) moveAlongOpponentAxis(fighter, opponent, (force * overlapFrames) / windowFrames);
  applyAirHomingForce(fighter, opponent, move, overlapFrames);
}

function applyAirHomingForce(fighter: FighterRuntime, opponent: FighterRuntime, move: MoveDefinition, overlapFrames: number) {
  const homingSpeed = move.tracking === 'homing' ? move.homingSpeed ?? 8 : 0;
  if (homingSpeed <= 0 || !isAirborne(fighter)) return;
  const target = {
    x: opponent.position.x,
    y: Math.max(0, opponent.position.y + 0.12),
    z: opponent.position.z
  };
  const dx = target.x - fighter.position.x;
  const dy = target.y - fighter.position.y;
  const dz = target.z - fighter.position.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= 0.001) return;
  const amount = Math.min(distance, homingSpeed * (overlapFrames / FRAMES_PER_SECOND));
  fighter.position.x += (dx / distance) * amount;
  fighter.position.y = Math.max(0, fighter.position.y + (dy / distance) * amount);
  fighter.position.z += (dz / distance) * amount;
}

function resolveForwardInput(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame) {
  const sideSign = getStableControlSideSign(fighter);
  const toward = (input.right && sideSign > 0) || (input.left && sideSign < 0);
  const away = (input.left && sideSign > 0) || (input.right && sideSign < 0);
  if (toward) return 1;
  if (away) return -1;
  return 0;
}

function getStableControlSideSign(fighter: FighterRuntime): 1 | -1 {
  return fighter.slot === 1 ? 1 : -1;
}

function getOpponentSideSign(fighter: FighterRuntime, opponent: FighterRuntime) {
  const dx = opponent.position.x - fighter.position.x;
  if (Math.abs(dx) > 0.001) return dx > 0 ? 1 : -1;
  return fighter.facing || 1;
}

function getBaseSidestepOrbitSign(fighter: FighterRuntime): 1 | -1 {
  return fighter.slot === 1 ? 1 : -1;
}

function orbitAroundOpponent(fighter: FighterRuntime, opponent: FighterRuntime, arcDistance: number) {
  const dx = fighter.position.x - opponent.position.x;
  const dz = fighter.position.z - opponent.position.z;
  const radius = Math.max(0.92, Math.hypot(dx, dz));
  const angle = Math.atan2(dz, dx);
  const nextAngle = angle + arcDistance / radius;
  fighter.position.x = opponent.position.x + Math.cos(nextAngle) * radius;
  fighter.position.z = opponent.position.z + Math.sin(nextAngle) * radius;
}

function makeAiInput(match: MatchSnapshot, ai: FighterRuntime, opponent: FighterRuntime, timer: number, difficulty: CpuDifficulty, cpuDuel = false, aiSeed = 0, roundAiSeed = aiSeed): InputFrame {
  const input = emptyInputFrame();
  const dx = opponent.position.x - ai.position.x;
  const dz = opponent.position.z - ai.position.z;
  const distance = Math.hypot(dx, dz);
  const laneDiff = opponent.position.z - ai.position.z;
  const hasTransformAbility = hasForwardTransform(match, ai);
  const profile = ai.character.aiProfile;
  const elapsed = ROUND_TIME - timer;
  const settings = getCpuDifficultySettings(difficulty);
  const leadRatio = (ai.hp - opponent.hp) / Math.max(1, ai.maxHp);
  const leaderBrake = cpuDuel ? clamp((leadRatio - 0.14) / 0.34, 0, 1) : 0;
  const leaderCloseout = leaderBrake > 0.18;
  const style = getAiSeedStyle(aiSeed, ai.slot);
  const roundStyle = getAiSeedStyle(roundAiSeed, ai.slot);
  const roundPhase = style.phase + roundStyle.phase * 0.35;
  const beat = Math.sin(timer * (2.45 + (style.tempo + roundStyle.tempo * 0.28) * 0.48) + ai.hp * 0.03 + ai.slot * 0.9 + roundPhase);
  const blockRoll = (Math.sin(elapsed * (6.4 + (style.guardTempo + roundStyle.guardTempo * 0.25) * 1.5) + ai.slot * 1.7 + ai.hp * 0.02 + roundPhase * 0.7) + 1) / 2;
  const attackCycle = Math.max(0.12, (settings.attackCycle - profile.aggression * settings.aggressionCycleBonus) * style.attackCycleScale);
  const comboCycle = Math.max(0.1, settings.comboCycle * style.comboCycleScale);
  const attackPhase = positiveModulo(elapsed + ai.slot * 0.18 + style.attackPhaseOffset + roundStyle.attackPhaseOffset * 0.65, attackCycle);
  const comboPhase = positiveModulo(elapsed + ai.slot * 0.11 + style.comboPhaseOffset + roundStyle.comboPhaseOffset * 0.75, comboCycle);
  const selector = positiveModulo(Math.floor(elapsed * 1000) + ai.slot * 17 + Math.floor(ai.hp) + style.selectorJitter + roundStyle.selectorJitter, 100);
  const routeRoll = positiveModulo(Math.floor(elapsed * 760) + ai.slot * 29 + Math.floor(opponent.hp) + style.routeJitter + roundStyle.routeJitter, 100);
  if (ai.state === 'getup') return input;
  if (ai.state === 'knockdown') {
    if (ai.actionFramesRemaining > 0 || ai.stunFramesRemaining > 0 || ai.actionTimer > 0 || ai.stunTimer > 0 || isAirborne(ai)) return input;
    const getupRoll = aiDecisionRoll(ai, opponent, elapsed, 13, roundAiSeed);
    if (getupRoll < 0.26) input.sidewalkUp = true;
    else if (getupRoll < 0.52) input.sidewalkDown = true;
    else if (getupRoll < 0.72) input[opponent.position.x > ai.position.x ? 'left' : 'right'] = true;
    else input.confirm = true;
    return input;
  }
  if (ai.state === 'chargeKi') {
    if (shouldAiTriggerTransform(ai, opponent, difficulty, distance, Math.abs(laneDiff), hasTransformAbility)) {
      applyAiTransformInput(input);
      return input;
    }
    input.charge = shouldAiContinueCharacterAbilityCharge(ai, hasTransformAbility);
    return input;
  }
  let selectedMoveInput = chooseAiMoveInput(ai, profile, settings, selector, routeRoll);
  if (leaderCloseout) {
    selectedMoveInput = chooseAiCloseoutMoveInput(ai, selectedMoveInput, selector, routeRoll);
  } else if (aiDecisionRoll(ai, opponent, elapsed, 6, roundAiSeed) < settings.suboptimalMoveRate * style.imperfectionScale) {
    selectedMoveInput = chooseAiImperfectMoveInput(ai, selectedMoveInput, selector, routeRoll);
  }
  const selectedMove = ai.character.moves.find((move) => move.input === selectedMoveInput) ?? ai.character.moves[0] ?? null;
  const maxComboSteps = leaderCloseout ? Math.max(2, Math.min(settings.maxComboSteps, leaderBrake > 0.72 ? 2 : 3)) : settings.maxComboSteps;
  const shouldContinueCombo = ai.comboTimer > 0 && ai.comboStep < maxComboSteps;
  const selectedMoveReach = (selectedMove?.range ?? 1.35) + settings.rangeBuffer + (shouldContinueCombo ? 0.26 : 0);

  const opponentSide = getOpponentSideSign(ai, opponent);
  const towardKey = opponentSide > 0 ? 'right' : 'left';
  const awayKey = opponentSide > 0 ? 'left' : 'right';
  const desiredSpacing = clamp(Math.min(profile.spacing * settings.spacingScale * style.spacingScale, selectedMoveReach * 0.9), 0.82, selectedMoveReach);
  const tooClose = distance < Math.max(0.72, desiredSpacing * 0.58);
  const tooFar = distance > selectedMoveReach;
  const farAway = distance > selectedMoveReach + settings.runInBuffer;
  const resetRhythm = Math.sin(elapsed * 1.17 + ai.slot * 1.9);

  const spacingMistake = canMakeAiDecisionMistake(ai) && aiDecisionRoll(ai, opponent, elapsed, 2, roundAiSeed) < settings.spacingMistakeRate * style.imperfectionScale;
  if (spacingMistake && !farAway && distance < selectedMoveReach + 0.95) {
    input[awayKey] = true;
    input[towardKey] = false;
  } else if (farAway) {
    input[towardKey] = true;
  } else if (tooFar && resetRhythm > -0.42) {
    input[towardKey] = true;
  } else if (leaderBrake > 0.72 && distance < selectedMoveReach * 0.74 && resetRhythm > 0.18) {
    input[awayKey] = true;
  } else if (tooClose || resetRhythm < -0.72) {
    input[awayKey] = true;
  }

  if (farAway) {
    // Stay committed to closing distance instead of drifting sideways out of range.
  } else if (Math.abs(laneDiff) > 0.45) {
    if (laneDiff < 0) input.sidewalkUp = true;
    if (laneDiff > 0) input.sidewalkDown = true;
  } else if (beat > 0.82) {
    input.sidestepUp = true;
  } else if (beat < -0.88) {
    input.sidestepDown = true;
  }

  const incomingRange = Math.max(2.1, (opponent.currentMove?.range ?? 1.45) + 0.8);
  const danger = opponent.state === 'attack' && distance < incomingRange;
  const opponentMoveFrame = opponent.currentMove ? opponent.moveFrame : 0;
  const isIncomingSoon = !opponent.currentMove || opponentMoveFrame >= opponent.currentMove.startupFrames - settings.reactionLeadFrames;
  const canStartAction = ai.actionFramesRemaining === 0 && ai.actionTimer === 0;
  const canAttemptCancel = shouldContinueCombo && canComboCancel(ai);
  const canAct = (canStartAction || canAttemptCancel) && ai.stunFramesRemaining === 0 && ai.blockstunFramesRemaining === 0;
  const punishRoll = positiveModulo(selector + routeRoll + ai.slot * 11 + Math.floor(ai.blockPunishWindowFrames * 3), 100) / 100;
  const punishDropped = aiDecisionRoll(ai, opponent, elapsed, 3, roundAiSeed) < settings.punishDropRate * style.imperfectionScale;
  const punishAccepted = punishRoll < settings.punishResponse && !punishDropped;
  if (
    isShadowCloneCharacter(ai) &&
    !ai.shadowClone &&
    !ai.shadowCloneChargeConsumed &&
    ai.ki >= SHADOW_CLONE_KI_THRESHOLD &&
    !leaderCloseout &&
    !tooClose &&
    !danger &&
    distance > 1.35 &&
    ai.comboTimer === 0 &&
    ai.comboHits === 0 &&
    canStartAction &&
    canAct
  ) {
    input.charge = true;
    input[towardKey] = false;
    input[awayKey] = false;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
    input.down = false;
    input.up = false;
    return input;
  }
  let punishMoveInput = chooseAiPunishMoveInput(ai, difficulty, selector, routeRoll);
  punishMoveInput = chooseAiKiBurstMoveInput(ai, punishMoveInput, difficulty, selector + 5, routeRoll + 3);
  if (aiDecisionRoll(ai, opponent, elapsed, 7, roundAiSeed) < settings.suboptimalPunishRate * style.imperfectionScale) {
    punishMoveInput = chooseAiImperfectMoveInput(ai, punishMoveInput, selector + 13, routeRoll + 7);
  }
  const punishMove = ai.character.moves.find((move) => move.input === punishMoveInput) ?? selectedMove;
  const punishKiBurst = shouldAiUseKiBurst(ai, opponent, punishMoveInput, difficulty, 'punish', selector, routeRoll, leaderCloseout);
  const punishReach = (punishMove?.range ?? 1.28) + settings.rangeBuffer + (punishKiBurst ? 0.18 : 0);
  const punishReady = punishAccepted && ai.blockPunishWindowFrames > 0 && canStartAction && canAct && opponent.state === 'attack' && opponent.actionFramesRemaining > 0;
  const punishInRange = distance <= punishReach && Math.abs(laneDiff) <= punishReach * 0.86;
  if (punishReady && punishInRange) {
    if (shouldAiJumpBeforeAttack(ai, opponent, punishMove, false)) {
      applyAiJumpTakeoff(input, towardKey, awayKey);
      return input;
    }
    input.block = false;
    input[awayKey] = false;
    input[towardKey] = distance > punishReach * 0.72;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
    input.charge = punishKiBurst;
    input[punishMoveInput] = true;
    return input;
  }
  if (punishReady && distance < punishReach + 0.72) {
    input.block = false;
    input[awayKey] = false;
    input[towardKey] = true;
    return input;
  }

  const opening = getAiOpening(ai, opponent, distance, laneDiff);
  const pressureRoll = positiveModulo(selector * 3 + routeRoll + ai.slot * 19 + Math.floor(opponent.hp), 100) / 100;
  const pressureDropped = aiDecisionRoll(ai, opponent, elapsed, 4, roundAiSeed) < settings.pressureDropRate * style.imperfectionScale;
  const pressureAccepted =
    !pressureDropped &&
    pressureRoll < Math.max(0.04, getAdjustedPressureResponse(ai, opening, settings, pressureRoll) - settings.leaderPressurePenalty * leaderBrake * 0.55);
  let pressureMoveInput = chooseAiPressureMoveInput(ai, opponent, difficulty, opening, selector, routeRoll);
  pressureMoveInput = chooseAiKiBurstMoveInput(ai, pressureMoveInput, difficulty, selector + 17, routeRoll + 9);
  if (leaderCloseout && opening.kind !== 'none') {
    pressureMoveInput = chooseAiCloseoutMoveInput(ai, pressureMoveInput, selector + 23, routeRoll + 11);
  } else if (aiDecisionRoll(ai, opponent, elapsed, 8, roundAiSeed) < settings.suboptimalPressureRate * style.imperfectionScale) {
    pressureMoveInput = chooseAiImperfectMoveInput(ai, pressureMoveInput, selector + 23, routeRoll + 11);
  }
  const pressureCrouchInput =
    !leaderCloseout && opponent.state !== 'juggle' && (opening.kind === 'hitstun' || opening.kind === 'whiff')
      ? chooseAiFullCrouchMoveInput(ai, pressureMoveInput, difficulty, selector + 37, routeRoll + 21, 'pressure')
      : null;
  if (pressureCrouchInput) pressureMoveInput = pressureCrouchInput;
  const pressureMove = ai.character.moves.find((move) => move.input === pressureMoveInput) ?? selectedMove;
  const pressureKiBurst =
    !pressureCrouchInput &&
    shouldAiUseKiBurst(ai, opponent, pressureMoveInput, difficulty, opening.kind === 'whiff' ? 'whiff' : 'pressure', selector + 11, routeRoll + 19, leaderCloseout);
  const pressureReach = (pressureMove?.range ?? 1.28) + settings.rangeBuffer + (pressureKiBurst ? 0.18 : 0) + (opening.kind === 'hitstun' ? 0.36 + settings.hitstunReachBonus : 0);
  const pressureLaneTolerance = PRESSURE_LANE_TOLERANCE + (difficulty >= 4 ? 0.16 : 0);
  const pressureInRange = distance <= pressureReach && Math.abs(laneDiff) <= pressureReach * pressureLaneTolerance;
  if (opening.kind !== 'none' && pressureAccepted && canStartAction && canAct && pressureInRange && !tooClose) {
    if (!pressureCrouchInput && shouldAiJumpBeforeAttack(ai, opponent, pressureMove, opening.kind === 'hitstun' && opponent.state === 'juggle')) {
      applyAiJumpTakeoff(input, towardKey, awayKey);
      return input;
    }
    input.block = false;
    input[awayKey] = false;
    input[towardKey] = distance > pressureReach * 0.78;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
    if (pressureCrouchInput) {
      applyAiFullCrouchAttack(input, pressureCrouchInput, towardKey, awayKey);
    } else {
      input.charge = pressureKiBurst;
      input[pressureMoveInput] = true;
    }
    return input;
  }
  if (opening.kind !== 'none' && pressureAccepted && canStartAction && canAct && distance < pressureReach + 0.88) {
    input.block = false;
    input[awayKey] = false;
    input[towardKey] = true;
    return input;
  }
  const missedKnownOpening = opening.kind !== 'none' && canStartAction && canAct && !pressureAccepted;

  input.block = danger && (difficulty >= 3 || isIncomingSoon) && blockRoll < Math.min(0.9, Math.max(0.05, profile.guard + settings.guardBonus + style.guardBias + leaderBrake * 0.04));
  if (input.block) {
    input[awayKey] = true;
    input[towardKey] = false;
  }

  const inStrikeRange = distance <= selectedMoveReach && Math.abs(laneDiff) <= selectedMoveReach * 0.82;
  const attackHesitation = canMakeAiDecisionMistake(ai) && aiDecisionRoll(ai, opponent, elapsed, 5, roundAiSeed) < settings.attackHesitationRate * style.imperfectionScale;
  const canPressure = !missedKnownOpening && !attackHesitation && !input.block && canAct && inStrikeRange && !tooClose;
  if (
    !input.block &&
    canStartAction &&
    canAct &&
    shouldAiTriggerTransform(ai, opponent, difficulty, distance, Math.abs(laneDiff), hasTransformAbility)
  ) {
    applyAiTransformInput(input);
    return input;
  }
  if (
    !input.block &&
    canStartAction &&
    canAct &&
    shouldAiStartCharacterAbilityCharge(ai, opponent, difficulty, distance, tooClose, danger, leaderCloseout, opening, selector + 71, routeRoll + 43, hasTransformAbility)
  ) {
    input.charge = true;
    input[towardKey] = false;
    input[awayKey] = false;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
    input.down = false;
    input.up = false;
    return input;
  }
  const leaderAttackScale = leaderCloseout ? 1.12 - leaderBrake * 0.08 : 1;
  const leaderComboScale = leaderCloseout ? 0.74 - leaderBrake * 0.14 : 1;
  const attackPulse = attackPhase < settings.attackPulse * style.attackPulseScale * leaderAttackScale || (shouldContinueCombo && comboPhase < settings.comboPulse * style.comboPulseScale * leaderComboScale);
  if (canPressure && attackPulse) {
    if (!leaderCloseout) {
      applyAiRoute(ai, input, towardKey, awayKey, difficulty, ai.comboStep, selector, routeRoll);
    }
    selectedMoveInput = chooseAiKiBurstMoveInput(ai, selectedMoveInput, difficulty, selector + 31, routeRoll + 37);
    const crouchInput = leaderCloseout ? null : chooseAiFullCrouchMoveInput(ai, selectedMoveInput, difficulty, selector + 47, routeRoll + 53, shouldContinueCombo ? 'pressure' : 'neutral');
    if (crouchInput) {
      selectedMoveInput = crouchInput;
      applyAiFullCrouchAttack(input, selectedMoveInput, towardKey, awayKey);
    } else {
      const attackMove = ai.character.moves.find((move) => move.input === selectedMoveInput) ?? selectedMove;
      if (shouldAiJumpBeforeAttack(ai, opponent, attackMove, shouldContinueCombo && opponent.state === 'juggle')) {
        applyAiJumpTakeoff(input, towardKey, awayKey);
        return input;
      }
      input.charge = shouldAiUseKiBurst(ai, opponent, selectedMoveInput, difficulty, shouldContinueCombo ? 'pressure' : 'neutral', selector + 29, routeRoll + 41, leaderCloseout);
      input[selectedMoveInput] = true;
    }
    if (!crouchInput && !leaderCloseout && difficulty >= 4 && routeRoll > 78) {
      const secondButton = routeRoll > 90 ? 'special' : routeRoll > 84 ? 'heavy' : 'kick';
      input[secondButton] = true;
    }
  } else if (!leaderCloseout && !input.block && canAct && inStrikeRange && shouldAiHoldFullCrouchStance(ai, difficulty, selector + 61, routeRoll + 17)) {
    input.down = true;
    input[towardKey] = false;
    input[awayKey] = false;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
  }

  input.up = false;
  return input;
}

function shouldAiJumpBeforeAttack(ai: FighterRuntime, opponent: FighterRuntime, move: MoveDefinition | null | undefined, chaseLaunchedOpponent: boolean) {
  if (!move) return false;
  if (ai.position.y > 0 || ai.velocityY !== 0) return false;
  if (ai.actionFramesRemaining > 0 || ai.actionTimer > 0 || ai.stunFramesRemaining > 0 || ai.blockstunFramesRemaining > 0) return false;
  if (ai.state === 'knockdown' || ai.state === 'getup' || ai.state === 'chargeKi' || ai.state === 'juggle') return false;
  if (move.tracking === 'homing') return true;
  return chaseLaunchedOpponent && opponent.state === 'juggle' && isAirborne(opponent);
}

function applyAiJumpTakeoff(input: InputFrame, towardKey: 'left' | 'right', awayKey: 'left' | 'right') {
  input.block = false;
  input.charge = false;
  input.down = false;
  input.up = true;
  input[towardKey] = false;
  input[awayKey] = false;
  input.sidestepUp = false;
  input.sidestepDown = false;
  input.sidewalkUp = false;
  input.sidewalkDown = false;
  for (const moveInput of moveInputs) {
    input[moveInput] = false;
  }
}

function chooseAiMoveInput(
  ai: FighterRuntime,
  profile: CharacterDefinition['aiProfile'],
  settings: ReturnType<typeof getCpuDifficultySettings>,
  selector: number,
  routeRoll: number
): MoveInput {
  const availableInputs = moveInputs.filter((input) => ai.character.moves.some((move) => move.input === input));
  if (availableInputs.length === 0) return 'jab';

  if (ai.comboTimer > 0 && ai.comboStep > 0) {
    const sequence = ai.comboSequence;
    const previous = sequence[sequence.length - 1];
    const preferred =
      settings.maxComboSteps >= 5 && previous === 'heavy'
        ? (selector > 55 ? 'special' : 'kick')
        : settings.maxComboSteps >= 4 && previous === 'jab'
          ? (selector > 54 ? 'heavy' : 'kick')
          : settings.maxComboSteps >= 3 && previous === 'kick'
            ? (selector > 62 ? 'special' : 'heavy')
            : settings.maxComboSteps >= 2 && previous === 'jab'
              ? 'kick'
              : null;
    const preferredIsStale = preferred ? inputRecentlyUsed(ai, preferred) && routeRoll < settings.staleBreakThreshold : false;
    if (preferred && availableInputs.includes(preferred) && !inputAlreadyUsedInCombo(ai, preferred) && !preferredIsStale) return preferred;
  }

  const scored = availableInputs.map((input, index) => {
    const isRecent = inputRecentlyUsed(ai, input);
    const comboRepeat = inputAlreadyUsedInCombo(ai, input);
    const wave = positiveModulo(selector + routeRoll * (index + 2) + ai.slot * 13 + input.length * 17, 100) / 100;
    const base =
      input === 'jab'
        ? 0.58
        : input === 'kick'
          ? settings.kickPreference
          : input === 'heavy'
            ? settings.heavyPreference
            : Math.min(0.9, profile.specialChance * settings.specialScale + 0.16);
    const recentPenalty = isRecent ? settings.recentPenalty : 0;
    const comboPenalty = comboRepeat ? 1.2 : 0;
    return {
      input,
      score: base + wave * settings.varietyRoll - recentPenalty - comboPenalty
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.input ?? availableInputs[0];
}

function chooseAiImperfectMoveInput(ai: FighterRuntime, preferred: MoveInput, selector: number, routeRoll: number): MoveInput {
  const availableInputs = moveInputs.filter((input) => input !== preferred && ai.character.moves.some((move) => move.input === input));
  if (availableInputs.length === 0) return preferred;
  const index = positiveModulo(selector + routeRoll * 3 + ai.slot * 11 + Math.floor(ai.hp), availableInputs.length);
  return availableInputs[index] ?? preferred;
}

function chooseAiCloseoutMoveInput(ai: FighterRuntime, preferred: MoveInput, selector: number, routeRoll: number): MoveInput {
  const moves = ai.character.moves.filter((move) => !move.launchHeight && !move.knockdown && move.damage <= 11);
  const preferredMove = moves.find((move) => move.input === preferred);
  if (preferredMove && preferredMove.input !== 'special') return preferredMove.input;

  const pokeOrder: MoveInput[] = routeRoll % 3 === 0 ? ['kick', 'jab', 'heavy'] : ['jab', 'kick', 'heavy'];
  const ordered = pokeOrder
    .map((input) => moves.find((move) => move.input === input))
    .filter((move): move is MoveDefinition => Boolean(move));
  if (ordered.length === 0) return preferred;
  const fresh = ordered.find((move) => !inputRecentlyUsed(ai, move.input) && !inputAlreadyUsedInCombo(ai, move.input));
  return (fresh ?? ordered[positiveModulo(selector + routeRoll, ordered.length)] ?? ordered[0]).input;
}

function chooseAiPunishMoveInput(ai: FighterRuntime, difficulty: CpuDifficulty, selector: number, routeRoll: number): MoveInput {
  const sorted = ai.character.moves
    .filter((move, index, moves) => moves.findIndex((candidate) => candidate.input === move.input) === index)
    .sort((a, b) => a.startupFrames - b.startupFrames);
  if (difficulty <= 2 && sorted.length > 1) {
    const choiceIndex = Math.min(sorted.length - 1, Math.floor(positiveModulo(selector + routeRoll + ai.slot * 7, 100) / (difficulty === 1 ? 34 : 25)));
    return sorted[choiceIndex]?.input ?? sorted[0]?.input ?? 'jab';
  }
  const fresh = sorted.find((move) => !inputAlreadyUsedInCombo(ai, move.input) && !inputRecentlyUsed(ai, move.input));
  return fresh?.input ?? sorted[0]?.input ?? 'jab';
}

type AiOpening = {
  kind: 'none' | 'hitstun' | 'whiff';
  frames: number;
};

function getAiOpening(ai: FighterRuntime, opponent: FighterRuntime, distance: number, laneDiff: number): AiOpening {
  if (ai.state === 'knockdown' || ai.stunFramesRemaining > 0 || ai.blockstunFramesRemaining > 0) return { kind: 'none', frames: 0 };
  if (opponent.state === 'knockdown' || opponent.getupInvulnerableFrames > 0) return { kind: 'none', frames: 0 };

  if ((opponent.state === 'hit' || opponent.state === 'juggle') && opponent.stunFramesRemaining > 0) {
    return { kind: 'hitstun', frames: opponent.stunFramesRemaining };
  }

  const move = opponent.currentMove;
  const whiffing =
    opponent.state === 'attack' &&
    move &&
    opponent.actionFramesRemaining > 0 &&
    !opponent.hitConnected &&
    (opponent.whiffRecoveryApplied || opponent.moveFrame >= move.startupFrames + move.activeFrames);
  const whiffRange = move ? move.range + 1.05 : 2.2;
  if (whiffing && distance <= whiffRange && Math.abs(laneDiff) <= whiffRange * 0.95) {
    return { kind: 'whiff', frames: opponent.actionFramesRemaining };
  }

  return { kind: 'none', frames: 0 };
}

function chooseAiPressureMoveInput(
  ai: FighterRuntime,
  opponent: FighterRuntime,
  difficulty: CpuDifficulty,
  opening: AiOpening,
  selector: number,
  routeRoll: number
): MoveInput {
  const sorted = ai.character.moves
    .filter((move, index, moves) => moves.findIndex((candidate) => candidate.input === move.input) === index)
    .sort((a, b) => a.startupFrames - b.startupFrames);
  if (sorted.length === 0) return 'jab';

  const tornadoInput = chooseAiTornadoPressureInput(ai, opponent, difficulty, opening, selector, routeRoll);
  if (tornadoInput) return tornadoInput;

  if (opening.kind === 'hitstun' && difficulty >= 3) {
    const viable = sorted.filter((move) => opening.frames <= 0 || move.startupFrames <= opening.frames + (difficulty >= 4 ? 4 : 1));
    const fresh = viable.find((move) => !inputAlreadyUsedInCombo(ai, move.input) && !inputRecentlyUsed(ai, move.input));
    if (fresh && (difficulty >= 4 || routeRoll > 42)) return fresh.input;
    const varied = viable.find((move) => !inputAlreadyUsedInCombo(ai, move.input));
    if (varied && routeRoll > (difficulty >= 5 ? 18 : difficulty >= 4 ? 28 : 54)) return varied.input;
    const jab = sorted.find((move) => move.input === 'jab');
    if (jab) return jab.input;
  }
  if (opening.kind === 'whiff' && difficulty >= 4) {
    const launcher = sorted.find((move) => move.launchHeight || move.knockdown || move.damage >= 16);
    if (launcher && opening.frames >= launcher.startupFrames + 2 && routeRoll > 38) return launcher.input;
  }

  if (difficulty <= 2 && sorted.length > 1) {
    const choiceIndex = Math.min(sorted.length - 1, Math.floor(positiveModulo(selector + routeRoll + ai.slot * 5, 100) / (difficulty === 1 ? 42 : 31)));
    return sorted[choiceIndex]?.input ?? sorted[0]?.input ?? 'jab';
  }

  const fresh = sorted.find((move) => !inputRecentlyUsed(ai, move.input));
  return fresh?.input ?? sorted[0]?.input ?? 'jab';
}

function chooseAiTornadoPressureInput(
  ai: FighterRuntime,
  opponent: FighterRuntime,
  difficulty: CpuDifficulty,
  opening: AiOpening,
  selector: number,
  routeRoll: number
): MoveInput | null {
  if (opening.kind !== 'hitstun' || opponent.state !== 'juggle') return null;
  if (opponent.juggleTornadoCount >= TORNADO_EXTENSION_LIMIT) return null;
  const tornadoMoves = ai.character.moves
    .filter((move, index, moves) => move.tornado && moves.findIndex((candidate) => candidate.input === move.input) === index)
    .sort((a, b) => a.startupFrames - b.startupFrames);
  if (tornadoMoves.length === 0) return null;

  const nearDrop = opponent.juggleSequenceDamage >= JUGGLE_DAMAGE_LIMIT - (difficulty >= 4 ? 18 : 11);
  const timingReady = opening.frames <= 0 || tornadoMoves.some((move) => move.startupFrames <= opening.frames + (difficulty >= 4 ? 7 : 2));
  if (!nearDrop || !timingReady) return null;

  const reliability =
    difficulty <= 1
      ? 0.12
      : difficulty === 2
        ? 0.34
        : difficulty === 3
          ? 0.58
          : difficulty === 4
            ? 0.84
            : 0.93;
  const roll = positiveModulo(selector * 5 + routeRoll * 7 + ai.slot * 23 + Math.floor(opponent.juggleSequenceDamage * 3), 100) / 100;
  if (roll > reliability) return null;

  const viable = tornadoMoves.filter((move) => opening.frames <= 0 || move.startupFrames <= opening.frames + (difficulty >= 4 ? 7 : 2));
  if (viable.length === 0) return null;
  const fresh = viable.find((move) => !inputAlreadyUsedInCombo(ai, move.input) && !inputRecentlyUsed(ai, move.input));
  return (fresh ?? viable[positiveModulo(selector + routeRoll + ai.slot, viable.length)]).input;
}

type AiKiBurstContext = 'neutral' | 'pressure' | 'punish' | 'whiff';

function chooseAiKiBurstMoveInput(ai: FighterRuntime, preferred: MoveInput, difficulty: CpuDifficulty, selector: number, routeRoll: number): MoveInput {
  if (ai.ki < KI_BURST_COST) return preferred;
  const availableInputs = moveInputs.filter((input) => ai.character.moves.some((move) => move.input === input));
  if (availableInputs.length === 0) return preferred;
  const authoredKiInputs = availableInputs.filter((input) => hasConfiguredKiCommand(ai, input));
  const candidates = authoredKiInputs.length > 0 ? authoredKiInputs : availableInputs;
  const preferredMove = ai.character.moves.find((move) => move.input === preferred);
  if (authoredKiInputs.includes(preferred) && !inputAlreadyUsedInCombo(ai, preferred)) return preferred;
  const scored = candidates.map((input, index) => {
    const move = ai.character.moves.find((candidate) => candidate.input === input);
    const authoredBonus = hasConfiguredKiCommand(ai, input) ? 0.42 : 0;
    const powerBonus = move ? clamp((move.damage - 8) / 22, 0, 0.5) + (move.launchHeight ? 0.16 : 0) + (move.tornado ? 0.12 : 0) : 0;
    const freshness = inputRecentlyUsed(ai, input) ? -0.22 : 0;
    const repeatPenalty = inputAlreadyUsedInCombo(ai, input) ? -0.5 : 0;
    const preferredBonus = input === preferred ? 0.18 : 0;
    const lowDifficultyCaution = difficulty <= 2 && (move?.input === 'special' || (move?.damage ?? 0) >= 16) ? -0.18 : 0;
    const wave = positiveModulo(selector + routeRoll * (index + 3) + input.length * 23 + ai.slot * 31, 100) / 100;
    return {
      input,
      score: authoredBonus + powerBonus + freshness + repeatPenalty + preferredBonus + lowDifficultyCaution + wave * 0.28
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.input ?? preferredMove?.input ?? preferred;
}

function shouldAiUseKiBurst(
  ai: FighterRuntime,
  opponent: FighterRuntime,
  moveInput: MoveInput,
  difficulty: CpuDifficulty,
  context: AiKiBurstContext,
  selector: number,
  routeRoll: number,
  leaderCloseout: boolean
) {
  if (ai.ki < KI_BURST_COST) return false;
  if (isShadowCloneCharacter(ai) && !ai.shadowClone && !ai.shadowCloneChargeConsumed && ai.ki <= SHADOW_CLONE_KI_THRESHOLD) return false;
  if (inputAlreadyUsedInCombo(ai, moveInput)) return false;
  const move = ai.character.moves.find((candidate) => candidate.input === moveInput);
  const hasAuthoredKiRoute = hasConfiguredKiCommand(ai, moveInput);
  const isPowerMove = moveInput === 'special' || moveInput === 'heavy' || Boolean(move?.launchHeight) || Boolean(move?.tornado) || (move?.damage ?? 0) >= 14;
  const contextBonus =
    context === 'punish'
      ? 0.24
      : context === 'whiff'
        ? 0.2
        : context === 'pressure'
          ? 0.14
          : 0;
  const difficultyChance =
    difficulty <= 1
      ? 0.07
      : difficulty === 2
        ? 0.14
        : difficulty === 3
          ? 0.26
          : difficulty === 4
            ? 0.52
            : 0.64;
  const kiOverflowBonus = clamp((ai.ki - 55) / 70, 0, 0.22);
  const behindBonus = ai.hp < opponent.hp ? 0.1 : 0;
  const closeoutPenalty = leaderCloseout ? 0.16 : 0;
  const authoredBonus = hasAuthoredKiRoute ? 0.18 : 0;
  const powerBonus = isPowerMove ? 0.08 : 0;
  const chance = clamp(difficultyChance + contextBonus + kiOverflowBonus + behindBonus + authoredBonus + powerBonus - closeoutPenalty, 0.02, 0.88);
  const roll = positiveModulo(selector * 7 + routeRoll * 11 + ai.slot * 43 + Math.floor(ai.ki * 3), 100) / 100;
  return roll < chance;
}

function hasConfiguredKiCommand(ai: FighterRuntime, input: MoveInput) {
  const button = inputToButton[input];
  const key = commandAnimationKey(`O+${button}`);
  return (ai.character.animationFrames?.[key]?.length ?? 0) > 0;
}

function hasAnyConfiguredKiCommand(ai: FighterRuntime) {
  return moveInputs.some((input) => hasConfiguredKiCommand(ai, input));
}

function shouldAiContinueCharacterAbilityCharge(ai: FighterRuntime, hasTransformAbility: boolean) {
  if (ai.chargePhase === 'startup') return true;
  if (hasTransformAbility) {
    return ai.ki < KI_MAX || ai.transformOvercharge < KI_MAX;
  }
  if (isShadowCloneCharacter(ai)) {
    return !ai.shadowClone && !ai.shadowCloneChargeConsumed;
  }
  if (!hasAnyConfiguredKiCommand(ai)) return false;
  return ai.ki < KI_BURST_COST;
}

function shouldAiStartCharacterAbilityCharge(
  ai: FighterRuntime,
  opponent: FighterRuntime,
  difficulty: CpuDifficulty,
  distance: number,
  tooClose: boolean,
  danger: boolean,
  leaderCloseout: boolean,
  opening: AiOpening,
  selector: number,
  routeRoll: number,
  hasTransformAbility: boolean
) {
  const isShadowCloneAbility = isShadowCloneCharacter(ai);
  const hasAuthoredKiAbility = hasAnyConfiguredKiCommand(ai);
  if (!isShadowCloneAbility && !hasAuthoredKiAbility && !hasTransformAbility) return false;
  if (isShadowCloneAbility && (ai.shadowClone || ai.shadowCloneChargeConsumed)) return false;
  if (leaderCloseout) return false;
  if (tooClose || danger) return false;
  if (opening.kind !== 'none') return false;
  if (ai.comboTimer > 0 || ai.comboHits > 0) return false;
  if (opponent.state === 'attack' && opponent.currentMove && distance < opponent.currentMove.range + 0.55) return false;

  const targetKi = isShadowCloneAbility ? SHADOW_CLONE_KI_THRESHOLD : hasTransformAbility ? KI_MAX : KI_BURST_COST;
  const alreadyReady = hasTransformAbility ? isTransformReady(ai) : ai.ki >= targetKi;
  if (!isShadowCloneAbility && !hasTransformAbility && alreadyReady) return false;
  if (hasTransformAbility && alreadyReady) return false;
  const safeWindow = distance > 1.35 || opponent.state === 'knockdown' || opponent.state === 'getup';
  if (!alreadyReady && !safeWindow) return false;

  const difficultyChance =
    difficulty <= 1
      ? 0.05
      : difficulty === 2
        ? 0.1
        : difficulty === 3
          ? 0.17
          : difficulty === 4
            ? 0.28
            : 0.34;
  const authoredKiBonus = hasAuthoredKiAbility ? 0.08 : 0;
  const kiReadinessBonus = alreadyReady ? 0.18 : clamp(ai.ki / targetKi, 0, 1) * 0.1;
  const openingBonus = opponent.state === 'knockdown' || opponent.state === 'getup' ? 0.1 : 0;
  const distanceBonus = clamp((distance - 1.2) / 2.4, 0, 0.08);
  const chance = clamp(difficultyChance + authoredKiBonus + kiReadinessBonus + openingBonus + distanceBonus, 0.02, 0.58);
  const roll = positiveModulo(selector * 11 + routeRoll * 5 + ai.slot * 37 + Math.floor(ai.ki * 7) + Math.floor(opponent.hp), 100) / 100;
  return roll < chance;
}

function shouldAiTriggerTransform(ai: FighterRuntime, opponent: FighterRuntime, difficulty: CpuDifficulty, distance: number, laneDiff: number, hasTransformAbility: boolean) {
  if (!hasTransformAbility || !isTransformReady(ai)) return false;
  if (difficulty <= 1) return false;
  if (ai.state === 'knockdown' || ai.state === 'getup' || ai.state === 'juggle' || ai.state === 'hit' || ai.state === 'attack') return false;
  if (ai.stunFramesRemaining > 0 || ai.blockstunFramesRemaining > 0 || ai.actionFramesRemaining > 0 || ai.actionTimer > 0) return false;
  const opponentThreat = opponent.state === 'attack' && distance < (opponent.currentMove?.range ?? 1.35) + 0.5 && laneDiff < 0.85;
  if (opponentThreat) return false;
  return distance > 1.1 || opponent.state === 'knockdown' || opponent.state === 'getup';
}

function applyAiTransformInput(input: InputFrame) {
  input.block = false;
  input.charge = false;
  input.down = false;
  input.up = false;
  input.left = false;
  input.right = false;
  input.sidestepUp = false;
  input.sidestepDown = false;
  input.sidewalkUp = false;
  input.sidewalkDown = false;
  input.jab = true;
  input.heavy = true;
  input.kick = true;
  input.special = true;
}

type AiFullCrouchContext = 'neutral' | 'pressure';

function hasConfiguredFullCrouchCommand(ai: FighterRuntime, input: MoveInput) {
  const button = inputToButton[input];
  return (ai.character.animationFrames?.[commandAnimationKey(`FC+${button}`)]?.length ?? 0) > 0;
}

function getConfiguredFullCrouchInputs(ai: FighterRuntime): MoveInput[] {
  return moveInputs.filter((input) => ai.character.moves.some((move) => move.input === input) && hasConfiguredFullCrouchCommand(ai, input));
}

function chooseAiFullCrouchMoveInput(
  ai: FighterRuntime,
  preferred: MoveInput,
  difficulty: CpuDifficulty,
  selector: number,
  routeRoll: number,
  context: AiFullCrouchContext
): MoveInput | null {
  const candidates = getConfiguredFullCrouchInputs(ai);
  if (candidates.length === 0) return null;

  const chance =
    context === 'pressure'
      ? difficulty <= 1
        ? 0.05
        : difficulty === 2
          ? 0.12
          : difficulty === 3
            ? 0.24
            : difficulty === 4
              ? 0.48
              : 0.58
      : difficulty <= 1
        ? 0.02
        : difficulty === 2
          ? 0.08
          : difficulty === 3
            ? 0.16
            : difficulty === 4
              ? 0.38
              : 0.48;
  const roll = positiveModulo(selector * 5 + routeRoll * 9 + ai.slot * 31 + ai.comboStep * 17, 100) / 100;
  if (roll > chance) return null;

  const scored = candidates.map((input, index) => {
    const move = ai.character.moves.find((candidate) => candidate.input === input);
    const preferredBonus = input === preferred ? 0.16 : 0;
    const stalePenalty = inputRecentlyUsed(ai, input) ? 0.32 : 0;
    const comboPenalty = inputAlreadyUsedInCombo(ai, input) ? 0.58 : 0;
    const lowPressureBonus = context === 'pressure' && (move?.hitLevel === 'low' || move?.hitLevel === 'mid') ? 0.18 : 0;
    const speedBonus = move ? clamp((18 - move.startupFrames) / 24, -0.16, 0.22) : 0;
    const wave = positiveModulo(selector + routeRoll * (index + 4) + input.length * 19 + ai.slot * 7, 100) / 100;
    return {
      input,
      score: preferredBonus + lowPressureBonus + speedBonus + wave * 0.36 - stalePenalty - comboPenalty
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.input ?? null;
}

function shouldAiHoldFullCrouchStance(ai: FighterRuntime, difficulty: CpuDifficulty, selector: number, routeRoll: number) {
  if (difficulty <= 1) return false;
  if (getConfiguredFullCrouchInputs(ai).length === 0) return false;
  const chance = difficulty === 2 ? 0.03 : difficulty === 3 ? 0.06 : difficulty === 4 ? 0.12 : 0.17;
  const roll = positiveModulo(selector * 7 + routeRoll * 3 + ai.slot * 43 + Math.floor(ai.hp), 100) / 100;
  return roll < chance;
}

function applyAiFullCrouchAttack(input: InputFrame, moveInput: MoveInput, towardKey: 'left' | 'right', awayKey: 'left' | 'right') {
  input.block = false;
  input.charge = false;
  input.up = false;
  input.down = true;
  input[towardKey] = false;
  input[awayKey] = false;
  input.sidestepUp = false;
  input.sidestepDown = false;
  input.sidewalkUp = false;
  input.sidewalkDown = false;
  input[moveInput] = true;
}

function inputAlreadyUsedInCombo(ai: FighterRuntime, input: MoveInput) {
  return ai.comboUsedKeys.some((key) => key.endsWith(`:${input}`) || key.includes(`:${input}-`) || key.endsWith(`+${inputToButton[input]}`));
}

function inputRecentlyUsed(ai: FighterRuntime, input: MoveInput) {
  return ai.aiRecentComboKeys.some((key) => key.endsWith(`:${input}`) || key.includes(`:${input}-`) || key.endsWith(`+${inputToButton[input]}`));
}

function routeRecentlyUsed(ai: FighterRuntime, route: string) {
  return ai.aiRecentComboKeys.some((key) => key.startsWith(`${route}:`) || key.startsWith(`${route}-`) || key.includes(`cmd:${route}`));
}

function getAdjustedPressureResponse(ai: FighterRuntime, opening: AiOpening, settings: ReturnType<typeof getCpuDifficultySettings>, pressureRoll: number) {
  const recentInputFatigue = ai.aiRecentComboKeys.length >= 3 && ai.aiRecentComboKeys.slice(-3).every((key) => key.includes(':jab') || key.endsWith('+1'));
  const hitstunBonus = opening.kind === 'hitstun' ? settings.hitstunPressureBonus : 0;
  const fatiguePenalty = recentInputFatigue && pressureRoll < 0.72 ? settings.stalePressurePenalty : 0;
  return clamp(settings.pressureResponse + hitstunBonus - fatiguePenalty, 0.04, 0.92);
}

function canMakeAiDecisionMistake(ai: FighterRuntime) {
  return ai.actionFramesRemaining === 0 && ai.stunFramesRemaining === 0 && ai.blockstunFramesRemaining === 0 && ai.state !== 'knockdown' && ai.state !== 'juggle';
}

function aiDecisionRoll(ai: FighterRuntime, opponent: FighterRuntime, elapsed: number, salt: number, aiSeed = 0) {
  const bucket = Math.floor(elapsed * AI_DECISION_BUCKETS_PER_SECOND);
  const seed =
    normalizeAiSeed(aiSeed) * 0.0113 +
    bucket * 12.9898 +
    ai.slot * 78.233 +
    opponent.slot * 37.719 +
    Math.floor(ai.hp) * 0.117 +
    Math.floor(opponent.hp) * 0.173 +
    salt * 19.19;
  const raw = Math.sin(seed) * 43758.5453;
  return raw - Math.floor(raw);
}

function getAiSeedStyle(aiSeed: number, slot: 1 | 2) {
  const seed = normalizeAiSeed(aiSeed);
  if (seed === 0) {
    return {
      phase: 0,
      tempo: 0.5208333333333334,
      guardTempo: 0.5333333333333333,
      attackCycleScale: 1,
      comboCycleScale: 1,
      attackPulseScale: 1,
      comboPulseScale: 1,
      guardBias: 0,
      spacingScale: 1,
      imperfectionScale: 1,
      attackPhaseOffset: 0,
      comboPhaseOffset: 0,
      selectorJitter: 0,
      routeJitter: 0
    };
  }
  const attackFlavor = seededUnit(seed, slot * 11 + 1);
  const comboFlavor = seededUnit(seed, slot * 11 + 2);
  const guardFlavor = seededUnit(seed, slot * 11 + 3);
  const spacingFlavor = seededUnit(seed, slot * 11 + 4);
  const mistakeFlavor = seededUnit(seed, slot * 11 + 5);
  return {
    phase: seededUnit(seed, slot * 11 + 6) * Math.PI * 2,
    tempo: seededUnit(seed, slot * 11 + 7) * 2 - 1,
    guardTempo: seededUnit(seed, slot * 11 + 8),
    attackCycleScale: lerp(0.88, 1.16, attackFlavor),
    comboCycleScale: lerp(0.86, 1.2, comboFlavor),
    attackPulseScale: lerp(0.88, 1.18, attackFlavor),
    comboPulseScale: lerp(0.82, 1.22, comboFlavor),
    guardBias: lerp(-0.14, 0.08, guardFlavor),
    spacingScale: lerp(0.9, 1.14, spacingFlavor),
    imperfectionScale: lerp(0.85, 1.28, mistakeFlavor),
    attackPhaseOffset: seededUnit(seed, slot * 11 + 9) * 0.75,
    comboPhaseOffset: seededUnit(seed, slot * 11 + 10) * 0.55,
    selectorJitter: Math.floor(seededUnit(seed, slot * 11 + 11) * 100),
    routeJitter: Math.floor(seededUnit(seed, slot * 11 + 12) * 100)
  };
}

function seededUnit(seed: number, salt: number) {
  const raw = Math.sin(normalizeAiSeed(seed) * 0.0137 + salt * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function normalizeAiSeed(seed: number | undefined) {
  return positiveModulo(Math.floor(Number.isFinite(seed) ? Number(seed) : 0), AI_SEED_MODULUS);
}

function makeRoundAiSeed(aiSeed: number, round: number) {
  const seed = normalizeAiSeed(aiSeed);
  if (seed === 0) return 0;
  const roundValue = Math.max(1, Math.floor(round));
  const roll = Math.floor(seededUnit(seed, roundValue * 101 + 31) * AI_SEED_MODULUS);
  return normalizeAiSeed(seed + roll + roundValue * 7919);
}

function getCpuDifficultySettings(difficulty: CpuDifficulty) {
  const level = clamp(difficulty, 1, 5);
  const t = cpuDifficultyCurve(level);
  return {
    attackCycle: lerp(1.3, 0.42, t),
    aggressionCycleBonus: lerp(0.07, 0.18, t),
    attackPulse: lerp(0.045, 0.12, t),
    comboCycle: lerp(0.58, 0.16, t),
    comboPulse: lerp(0.04, 0.22, t),
    maxComboSteps: clamp(Math.round(lerp(2, MAX_COMBO_STEPS, t)), 2, MAX_COMBO_STEPS),
    guardBonus: lerp(-0.2, 0.5, t),
    punishResponse: lerp(0.08, 0.98, t),
    pressureResponse: lerp(0.08, 0.96, t),
    punishDropRate: level >= 5 ? 0.08 : lerp(0.6, 0.1, t),
    pressureDropRate: level >= 5 ? 0.08 : lerp(0.52, 0.12, t),
    attackHesitationRate: level >= 5 ? 0.05 : lerp(0.36, 0.08, t),
    spacingMistakeRate: level >= 5 ? 0.04 : lerp(0.28, 0.06, t),
    suboptimalMoveRate: level >= 5 ? 0.08 : lerp(0.5, 0.14, t),
    suboptimalPunishRate: level >= 5 ? 0.07 : lerp(0.5, 0.12, t),
    suboptimalPressureRate: level >= 5 ? 0.07 : lerp(0.46, 0.12, t),
    hitstunPressureBonus: lerp(0.02, 0.08, t),
    stalePressurePenalty: lerp(0.08, 0.24, t),
    leaderPressurePenalty: lerp(0.08, 0.22, t),
    staleBreakThreshold: Math.round(lerp(24, 62, t)),
    reactionLeadFrames: Math.round(lerp(-2, 8, t)),
    spacingScale: lerp(1.08, 0.78, t),
    pressureBonus: lerp(0.28, 0.9, t),
    hitstunReachBonus: lerp(0.035, 0.175, t),
    rangeBuffer: lerp(0.08, 0.28, t),
    runInBuffer: lerp(0.92, 0.36, t),
    specialScale: lerp(0.35, 1.55, t),
    recentPenalty: lerp(0.26, 0.54, t),
    varietyRoll: lerp(0.18, 0.42, t),
    kickPreference: lerp(0.4, 0.58, t),
    heavyPreference: lerp(0.24, 0.62, t),
    heavyThreshold: Math.round(lerp(88, 58, t)),
    kickThreshold: Math.round(lerp(66, 36, t))
  };
}

function cpuDifficultyCurve(level: number) {
  const curve = [0, 0.25, 0.5, 1, 1.18] as const;
  return curve[clamp(Math.round(level), 1, 5) - 1] ?? 0.5;
}

function applyAiRoute(
  ai: FighterRuntime,
  input: InputFrame,
  towardKey: 'left' | 'right',
  awayKey: 'left' | 'right',
  difficulty: CpuDifficulty,
  comboStep: number,
  selector: number,
  routeRoll: number
) {
  if (difficulty <= 1) return;
  const usedForward = routeRecentlyUsed(ai, 'forward');
  const usedLow = routeRecentlyUsed(ai, 'down') || routeRecentlyUsed(ai, 'down-forward');
  const usedSide = routeRecentlyUsed(ai, 'sidestep') || routeRecentlyUsed(ai, 'side');

  if (difficulty >= 2 && selector > 48 && !(usedForward && routeRoll < 54)) {
    input[towardKey] = true;
    input[awayKey] = false;
  }

  if (difficulty >= 3 && routeRoll > 52 && !(usedLow && selector < 68)) {
    input.down = true;
  }

  if (difficulty >= 5 && routeRoll > 58 && !(usedSide && selector > 82)) {
    input.sidewalkUp = routeRoll < 79;
    input.sidewalkDown = routeRoll >= 79;
  } else if (difficulty >= 4 && routeRoll > 68 && !(usedSide && selector > 70)) {
    input.sidewalkUp = routeRoll < 82;
    input.sidewalkDown = routeRoll >= 82;
  }

  if (difficulty >= 4) {
    if (comboStep >= 2 && selector > 34) input[towardKey] = true;
  }

  if (difficulty >= 5) {
    if (comboStep >= 1 && selector > 24) input[towardKey] = true;
    if (!usedLow && routeRoll > 44) input.down = true;
  }
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t;
}

function totalMoveFrames(move: MoveDefinition) {
  return move.startupFrames + move.activeFrames + move.recoveryFrames;
}

function totalMoveSeconds(move: MoveDefinition) {
  return framesToSeconds(totalMoveFrames(move));
}

function secondsToFrames(seconds: number) {
  return Math.max(0, Math.round(seconds * FRAMES_PER_SECOND));
}

function framesToSeconds(frames: number) {
  return frames / FRAMES_PER_SECOND;
}

function applyGravity(fighter: FighterRuntime, dt: number, gravityScale = 1) {
  if (fighter.position.y > 0 || fighter.velocityY !== 0) {
    const wasAirborne = fighter.position.y > 0 || fighter.velocityY !== 0;
    const moveGravity = fighter.state === 'attack' ? fighter.currentMove?.moveJumpGravity : undefined;
    fighter.velocityY -= (moveGravity ?? fighter.character.stats.gravity) * gravityScale * dt;
    fighter.position.y += fighter.velocityY * dt;
    if (fighter.position.y <= 0) {
      fighter.position.y = 0;
      fighter.velocityY = 0;
      if (fighter.state === 'jump') fighter.state = 'idle';
      return wasAirborne;
    }
  }
  return false;
}

function cloneMatch(match: MatchSnapshot): MatchSnapshot {
  return {
    ...match,
    roster: [...match.roster],
    stage: { ...match.stage },
    combatEvents: [...match.combatEvents],
    impactEvents: [...match.impactEvents],
    clashState: cloneClashState(match.clashState),
    fighters: match.fighters.map((fighter) => ({
      ...fighter,
      character: fighter.character,
      baseCharacter: fighter.baseCharacter,
      position: { ...fighter.position },
      currentMove: fighter.currentMove,
      commandHistory: fighter.commandHistory.map((entry) => ({ ...entry })),
      comboSequence: [...fighter.comboSequence],
      comboUsedKeys: [...fighter.comboUsedKeys],
      aiRecentComboKeys: [...fighter.aiRecentComboKeys],
      previousAttackInputs: { ...fighter.previousAttackInputs },
      shadowClone: fighter.shadowClone
        ? {
            ...fighter.shadowClone,
            position: { ...fighter.shadowClone.position },
            currentMove: fighter.shadowClone.currentMove
          }
        : null
    })) as [FighterRuntime, FighterRuntime]
  };
}

function cloneClashState(clashState: ClashState): ClashState {
  return {
    ...clashState,
    sequence: [...clashState.sequence],
    contactPoint: [...clashState.contactPoint],
    p1: {
      ...clashState.p1,
      inputs: [...clashState.p1.inputs]
    },
    p2: {
      ...clashState.p2,
      inputs: [...clashState.p2.inputs]
    }
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function activeMoveProgress(fighter: FighterRuntime): number {
  const move: MoveDefinition | null = fighter.currentMove;
  if (!move) return 0;
  const total = totalMoveFrames(move);
  const frame = fighter.moveFrame || Math.max(0, total - secondsToFrames(fighter.actionTimer));
  return clamp(frame / total, 0, 1);
}
