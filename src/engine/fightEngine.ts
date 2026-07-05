import type {
  BoxSpec,
  ActionName,
  CharacterDefinition,
  ClashState,
  CpuDifficulty,
  FighterRuntime,
  InputFrame,
  InputFrameWithMetadata,
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
import { getCharacterCombatScale, getCharacterGlobalScale } from '../lib/characterScale';
import { contextualComboFrameData, contextualHitAdvantage } from '../lib/comboFrameMath';
import {
  cpuMoveFamilyKeyFromMove,
  cpuMoveFamilyKeyFromStep,
  cpuMoveIdentityKeyFromMove,
  cpuMoveIdentityKeyFromStep,
  cpuMoveVisualFamilyKeyFromMove,
  cpuMoveVisualFamilyKeyFromStep,
  recommendCpuComboRoute,
  type ComboTrialStep,
  type CpuRouteRecommendation
} from '../lib/comboRoutes';
import { commandRouteFamily } from '../lib/commandRoutes';
import { effectIsVisibleAt, effectTransformAt } from '../lib/effects';

const ROUND_TIME = 60;
const INFINITE_HEALTH_VALUE = 999_999;
const START_DISTANCE = 2.6;
const ROUND_OVER_DELAY = 2.1;
const ROUND_FINISHER_SECONDS = 0.72;
const ROUND_FINISHER_TIME_SCALE = 0.28;
const ROUND_FINISHER_CAMERA_ZOOM_SCALE = 0.78;
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
const IDLE_FLOURISH_TRIGGER_FRAMES = 45 * FRAMES_PER_SECOND;
const IDLE_FLOURISH_DEFAULT_FRAMES = 120;
const KNOCKDOWN_MIN_FRAMES = 34;
const GETUP_FRAMES = 24;
const GETUP_INVULNERABLE_FRAMES = 20;
const GETUP_ROLL_SPEED = 2.25;
const GETUP_LANE_SPEED = 2.7;
const GETUP_SIDE_LOCK_MARGIN = 0.08;
const JUGGLE_DAMAGE_LIMIT = 90;
const JUGGLE_INITIAL_VELOCITY = 5.95;
const JUGGLE_REFLOAT_VELOCITY = 4.35;
const TORNADO_REFLOAT_VELOCITY = 4.85;
const JUGGLE_GRAVITY_SCALE = 0.52;
const JUGGLE_FALL_SPEED_MULTIPLIER = 1.2;
const JUGGLE_EFFECTIVE_GRAVITY_SCALE_MAX = 1.5;
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
const AI_JUGGLE_LOCKOUT_FRAMES = 24;
const DEFAULT_WHIFF_RECOVERY_FRAMES = 4;
const FORCED_CROUCH_EXIT_FRAMES = 8;
const BLOCK_PUNISH_BUFFER_FRAMES = 12;
const UNIVERSAL_COUNTER_HIT_STUN_BONUS_FRAMES = 8;
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
const MAX_COMBO_STEPS = 30;
const COMBO_SEQUENCE_MEMORY = 30;
const JUGGLE_REPEAT_LOOP_UNIQUE_LIMIT = 3;
const JUGGLE_LOOP_BREAKER_DAMAGE_SCALE = 0.35;
const SIDESTEP_TAP_SCALE = 1.45;
const SIDEWALK_SCALE = 1.15;
const SIDESTEP_REPEAT_GRACE_FRAMES = 30;
const DEFAULT_DASH_FORWARD_DISTANCE = 0.78;
const DEFAULT_STAGE_BOUND_WIDTH = 96;
const DEFAULT_STAGE_BOUND_DEPTH = 42;
const MIN_STAGE_BOUND_WIDTH = 16;
const MIN_STAGE_BOUND_DEPTH = 10;
const MIN_WALL_RADIUS = 0.34;
const MAX_WALL_RADIUS = 1.05;
const DASH_FORWARD_ANIMATION_FRAMES = 18;
const DASH_FORWARD_COOLDOWN_FRAMES = 14;
const BACK_HOP_COOLDOWN_FRAMES = 18;
const BACK_HOP_MIN_SIZE = 0.65;
const BACK_HOP_MAX_SIZE = 1.45;
const BACK_HOP_GRAVITY_SCALE = 1.45;
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
const VISUAL_HITSTOP_BLOCK_FRAMES = 3;
const VISUAL_HITSTOP_LIGHT_FRAMES = 3;
const VISUAL_HITSTOP_NORMAL_FRAMES = 4;
const VISUAL_HITSTOP_HEAVY_FRAMES = 5;

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
    trainingDummyInput: null,
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
    roundFinisher: null,
    visualTimeScale: 1,
    cameraShake: 0,
    idleQuietFrames: 0,
    idleQuietLockFrames: 0
  };
  if (match.introEnabled) beginRoundIntro(match);
  return match;
}

export function stepMatch(match: MatchSnapshot, p1Input: InputFrame, p2Input: InputFrame, dt: number): MatchSnapshot {
  const next = cloneMatch(match);
  next.cameraShake = 0;
  const frameDelta = secondsToFrames(dt);

  if (next.phase === 'matchOver') return next;

  if (next.phase === 'intro') {
    next.visualTimeScale = 1;
    next.countdown = Math.max(0, next.countdown - dt);
    if (next.countdown <= 0) {
      next.phase = 'fighting';
      next.message = '';
      next.idleQuietFrames = 0;
      next.idleQuietLockFrames = 0;
      next.fighters.forEach((fighter) => {
        fighter.state = 'idle';
        fighter.actionTimer = 0;
        fighter.actionFramesRemaining = 0;
        clearIdleFlourish(fighter);
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
          next.idleQuietFrames = 0;
          next.idleQuietLockFrames = 0;
          next.fighters.forEach((fighter) => {
            fighter.state = fighter.slot === winner.slot ? 'win' : 'lose';
            clearIdleFlourish(fighter);
          });
      } else {
        resetRound(next);
      }
    }
    return next;
  }

  if (next.phase === 'roundFinisher') {
    updateRoundFinisher(next, dt);
    return next;
  }

  const cpuControlsBothFighters = next.mode === 'cpu' || next.mode === 'tournamentInfinite';
  const cpuControlsP2 = next.mode === 'ai' || next.mode === 'versusCpu' || cpuControlsBothFighters;
  const input1 = cpuControlsBothFighters ? makeAiInput(next, next.fighters[0], next.fighters[1], next.timer, next.cpuDifficulty, true, next.aiSeed, next.roundAiSeed) : p1Input;
  const input2 =
    next.mode === 'training'
      ? next.trainingDummyInput ?? makeTrainingDummyInput(next.fighters[1])
      : cpuControlsP2
        ? makeAiInput(next, next.fighters[1], next.fighters[0], next.timer, next.cpuDifficulty, cpuControlsBothFighters, next.aiSeed, next.roundAiSeed)
        : p2Input;
  if (isClashActive(next.clashState)) {
    const clashInput1 = cpuControlsBothFighters ? makeAiClashInput(next, 1) : input1;
    const clashInput2 = cpuControlsP2 ? makeAiClashInput(next, 2) : input2;
    handleClashStep(next, clashInput1, clashInput2, dt);
    constrainFightersToStageBounds(next);
    resetIdleQuietState(next);
    return next;
  }
  updateControlSideSigns(next);
  applyFighterStep(next, 0, input1, dt);
  applyFighterStep(next, 1, input2, dt);
  resolveFacing(next);
  resolveBodyCollision(next);
  constrainFightersToStageBounds(next);
  updateControlSideSigns(next);
  resolveHits(next, frameDelta);
  constrainFightersToStageBounds(next);

  if (next.roundFinisher) {
    resetIdleQuietState(next);
    return next;
  }

  updateIdleQuietState(next, input1, input2, frameDelta);

  const infiniteTimer = isInfiniteRoundTime(next.roundTime);
  next.timer = infiniteTimer || (isTrainingInfiniteHealthMode(next) && next.trainingInfiniteHealth) ? next.roundTime : Math.max(0, next.timer - dt);
  const ko = next.fighters.find((fighter) => fighter.hp <= 0);
  if (isTrainingInfiniteHealthMode(next) && next.trainingInfiniteHealth) {
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
    tookDamageThisRound: false,
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
    controlSideSign: slot === 1 ? 1 : -1,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    sidestepOrbitSign: slot === 1 ? 1 : -1,
    laneOrbitControlLocked: false,
    sidestepRepeatGraceFrames: 0,
    dashForwardFrames: 0,
    dashForwardCooldownFrames: 0,
    backHopFrames: 0,
    backHopTotalFrames: 0,
    backHopCooldownFrames: 0,
    walkDirection: 0,
    jumpInputHeld: false,
    currentMove: null,
    moveInstanceId: 0,
    actionTimer: 0,
    actionFramesRemaining: 0,
    moveFrame: 0,
    idleFlourishFramesRemaining: 0,
    idleFlourishTotalFrames: 0,
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
    comboIdentitySequence: [],
    comboFamilySequence: [],
    comboVisualFamilySequence: [],
    comboUsedKeys: [],
    comboHits: 0,
    comboDamage: 0,
    bufferedMoveInput: null,
    bufferedMoveFrames: 0,
    bufferedMoveIntent: null,
    aiRecentComboKeys: [],
    aiRecentComboFamilies: [],
    aiRecentComboVisualFamilies: [],
    aiActiveComboRouteId: null,
    aiJuggleLockoutFrames: 0,
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
    visualHitstop: createEmptyVisualHitstop(),
    shadowClone: null,
    shadowCloneChargeConsumed: false
  };
}

function createEmptyVisualHitstop() {
  return {
    framesRemaining: 0,
    animationKey: null,
    progress: 0
  };
}

function clearIdleFlourish(fighter: FighterRuntime) {
  fighter.idleFlourishFramesRemaining = 0;
  fighter.idleFlourishTotalFrames = 0;
}

function resetIdleQuietState(match: MatchSnapshot) {
  match.idleQuietFrames = 0;
  match.idleQuietLockFrames = 0;
  match.fighters.forEach(clearIdleFlourish);
}

function updateIdleFlourishTimers(match: MatchSnapshot, frameDelta: number) {
  match.fighters.forEach((fighter) => {
    fighter.idleFlourishFramesRemaining = Math.max(0, fighter.idleFlourishFramesRemaining - frameDelta);
    if (fighter.idleFlourishFramesRemaining === 0) fighter.idleFlourishTotalFrames = 0;
  });
}

function updateIdleQuietState(match: MatchSnapshot, input1: InputFrame, input2: InputFrame, frameDelta: number) {
  const hadActiveFlourish = match.fighters.some(isIdleFlourishActive);
  updateIdleFlourishTimers(match, frameDelta);
  if (hadActiveFlourish) {
    if (!canAdvanceIdleQuietTimer(match, input1, input2)) {
      match.fighters.forEach(clearIdleFlourish);
      match.idleQuietLockFrames = IDLE_FLOURISH_TRIGGER_FRAMES;
    }
    match.idleQuietFrames = 0;
    return;
  }
  if (!canAdvanceIdleQuietTimer(match, input1, input2)) {
    match.idleQuietFrames = 0;
    match.idleQuietLockFrames = IDLE_FLOURISH_TRIGGER_FRAMES;
    return;
  }
  if (match.idleQuietLockFrames > 0) {
    match.idleQuietLockFrames = Math.max(0, match.idleQuietLockFrames - frameDelta);
    match.idleQuietFrames = 0;
    return;
  }
  match.idleQuietFrames += frameDelta;
  if (match.idleQuietFrames < IDLE_FLOURISH_TRIGGER_FRAMES) return;
  match.fighters.forEach(startIdleFlourish);
  match.idleQuietFrames = 0;
}

function canAdvanceIdleQuietTimer(match: MatchSnapshot, input1: InputFrame, input2: InputFrame) {
  return (
    match.phase === 'fighting' &&
    !match.roundFinisher &&
    !isClashActive(match.clashState) &&
    isInputFrameEmpty(input1) &&
    isInputFrameEmpty(input2) &&
    match.fighters.every(isFighterQuietIdle)
  );
}

function isInputFrameEmpty(input: InputFrame) {
  return !(Object.keys(emptyInputFrame()) as ActionName[]).some((action) => input[action]);
}

function isFighterQuietIdle(fighter: FighterRuntime) {
  return (
    fighter.state === 'idle' &&
    fighter.position.y === 0 &&
    fighter.velocityY === 0 &&
    fighter.currentMove === null &&
    fighter.actionFramesRemaining === 0 &&
    fighter.actionTimer === 0 &&
    fighter.stunFramesRemaining === 0 &&
    fighter.blockstunFramesRemaining === 0 &&
    fighter.stunTimer === 0 &&
    fighter.visualHitstop.framesRemaining === 0 &&
    fighter.throwOpponentSlot === null &&
    fighter.throwCaptorSlot === null
  );
}

function isIdleFlourishActive(fighter: FighterRuntime) {
  return fighter.idleFlourishFramesRemaining > 0 && fighter.idleFlourishTotalFrames > 0;
}

function startIdleFlourish(fighter: FighterRuntime) {
  const duration = getIdleFlourishDurationFrames(fighter.character);
  fighter.idleFlourishFramesRemaining = duration;
  fighter.idleFlourishTotalFrames = duration;
}

function getIdleFlourishDurationFrames(character: CharacterDefinition) {
  const frameCount = character.animationFrames?.win?.length ?? 0;
  if (frameCount <= 0) return IDLE_FLOURISH_DEFAULT_FRAMES;
  const fps = character.animationFrameRates?.win ?? character.animationFps ?? 8;
  return Math.max(1, Math.round((frameCount / Math.max(1, fps)) * FRAMES_PER_SECOND));
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
  tickVisualHitstop(fighter, frameDelta);
  updateShadowClone(fighter, dt);
  updateTransformRuntime(fighter, dt);
  tickBufferedMoveIntent(fighter, frameDelta);
  fighter.comboTimer = Math.max(0, fighter.comboTimer - dt);
  if (fighter.comboTimer === 0 && fighter.state !== 'attack') {
    fighter.comboStep = 0;
    fighter.comboSequence = [];
    fighter.comboIdentitySequence = [];
    fighter.comboFamilySequence = [];
    fighter.comboVisualFamilySequence = [];
    fighter.comboUsedKeys = [];
    fighter.comboHits = 0;
    fighter.comboDamage = 0;
    fighter.aiActiveComboRouteId = null;
  }
  fighter.aiJuggleLockoutFrames = Math.max(0, fighter.aiJuggleLockoutFrames - frameDelta);
  if (opponent.state !== 'juggle' && !isAirborne(opponent)) fighter.aiJuggleLockoutFrames = 0;
  fighter.sidestepTimer = Math.max(0, fighter.sidestepTimer - dt);
  fighter.sidestepRepeatGraceFrames = Math.max(0, fighter.sidestepRepeatGraceFrames - frameDelta);
  fighter.dashForwardFrames = Math.max(0, fighter.dashForwardFrames - frameDelta);
  fighter.dashForwardCooldownFrames = Math.max(0, fighter.dashForwardCooldownFrames - frameDelta);
  fighter.backHopCooldownFrames = Math.max(0, fighter.backHopCooldownFrames - frameDelta);
  if (fighter.state !== 'jump' && fighter.backHopTotalFrames > 0) {
    clearBackHop(fighter);
  }
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

  const freshMoveIntent = transformDestination ? null : getFreshMoveIntent(fighter, input);
  const freshMoveInput = freshMoveIntent?.moveInput ?? null;
  if (freshMoveIntent && canBufferFreshMoveInput(fighter)) bufferMoveIntent(fighter, freshMoveIntent);

  if (
    fighter.state === 'chargeKi' &&
    freshMoveInput &&
    input.charge &&
    fighter.ki >= getChargedMoveKiCost(fighter, opponent, input, freshMoveInput) &&
    fighter.chargePhase !== 'startup' &&
    fighter.chargePhase !== 'recovery'
  ) {
    clearKiChargeState(fighter);
    if (startComboAttack(fighter, opponent, input, freshMoveInput, 'neutral')) clearBufferedMoveInput(fighter);
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (fighter.state === 'chargeKi') {
    handleKiChargeStep(fighter, input, dt, hasForwardTransform(match, fighter));
    maybeSpawnShadowCloneFromCharge(match.stage, fighter, opponent);
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
    handleKnockdownStep(match.stage, fighter, opponent, input, dt);
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
    const cancelMove = freshMoveIntent;
    if (cancelMove && shouldDropSameMoveRecoveryBuffer(fighter, opponent, cancelMove.inputSnapshot, cancelMove.moveInput)) {
      // Keep the stored intent for the first actionable frame; just do not direct-cancel now.
    } else if (cancelMove && canComboCancel(fighter) && startComboAttack(fighter, opponent, cancelMove.inputSnapshot, cancelMove.moveInput, 'cancel')) {
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

  if (fighter.backHopTotalFrames > 0) {
    applyBackHopMovement(fighter, opponent, frameDelta);
    fighter.state = 'jump';
    const landed = applyGravity(fighter, dt, BACK_HOP_GRAVITY_SCALE);
    if (landed) clearBackHop(fighter);
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

  const moveIntent = fighter.bufferedMoveIntent ?? freshMoveIntent;
  if (moveIntent) {
    const moveInput = moveIntent.moveInput;
    const moveInputSnapshot = moveIntent.inputSnapshot;
    const chainMode = fighter.comboTimer > 0 && canLinkAfterHit(fighter, opponent) ? 'link' : 'neutral';
    if (startComboAttack(fighter, opponent, moveInputSnapshot, moveInput, chainMode)) {
      clearBufferedMoveInput(fighter);
    }
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  if (input.charge) {
    startKiCharge(fighter);
    maybeSpawnShadowCloneFromCharge(match.stage, fighter, opponent);
    applyGravity(fighter, dt);
    finishFighterStep();
    return;
  }

  const horizontalIntent = resolveHorizontalIntent(fighter, opponent, input);
  const forward = horizontalIntent.direction;
  fighter.walkDirection = 0;
  const holdingBack = horizontalIntent.back;
  const laneWalk = input.sidewalkUp ? -1 : input.sidewalkDown ? 1 : 0;
  const sidestepTap = input.sidestepUp ? -1 : input.sidestepDown ? 1 : 0;
  const grounded = fighter.position.y === 0 && fighter.velocityY === 0;
  const crouching = input.down && grounded;
  const jumping = isAirborne(fighter);
  const backHopRequested = input.dashBack && holdingBack && grounded && !crouching && !jumping && fighter.backHopCooldownFrames === 0;
  const blocking = input.block || (holdingBack && !backHopRequested);
  const axisSpeedScale = crouching ? 0 : blocking ? 0.42 : 1;
  const laneSpeedScale = blocking ? 0.42 : crouching ? 0.18 : 1;
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

  if (backHopRequested) {
    startBackHop(fighter);
    applyBackHopMovement(fighter, opponent, frameDelta);
    applyGravity(fighter, dt, BACK_HOP_GRAVITY_SCALE);
    finishFighterStep();
    return;
  }

  const laneInputActive = sidestepTap !== 0 || laneWalk !== 0;
  const horizontalMovementEndsLaneOrbit = !laneInputActive && forward !== 0 && fighter.sidestepTimer === 0;
  if (horizontalMovementEndsLaneOrbit) {
    fighter.sidestepDirection = 0;
    fighter.sidestepRepeatGraceFrames = 0;
  }

  const chooseSidestepOrbit = (direction: -1 | 1) => {
    fighter.sidestepDirection = direction;
    fighter.sidestepRepeatGraceFrames = SIDESTEP_REPEAT_GRACE_FRAMES;
    fighter.laneOrbitControlLocked = true;
  };

  if (sidestepTap !== 0 && fighter.sidestepTimer === 0) {
    fighter.sidestepTimer = 0.18;
    chooseSidestepOrbit(sidestepTap);
  } else if (laneWalk !== 0 && fighter.sidestepTimer === 0) {
    chooseSidestepOrbit(laneWalk);
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

  if (forward !== 0 && axisSpeedScale > 0) {
    const sideBeforeHorizontalMove = getPositionSideSign(fighter, opponent, match.stage);
    fighter.walkDirection = forward > 0 ? 1 : -1;
    moveAlongOpponentAxis(fighter, opponent, forward * fighter.character.stats.speed * axisSpeedScale * dt);
    if (horizontalMovementEndsLaneOrbit) {
      maybeUnlockLaneOrbitControlAfterHorizontalCross(match.stage, fighter, opponent, sideBeforeHorizontalMove);
    }
  }
  if (sidestep !== 0) {
    const sidestepScale = fighter.sidestepTimer > 0 ? SIDESTEP_TAP_SCALE : SIDEWALK_SCALE;
    const controlSide = getControlSideSign(fighter, opponent, match.stage);
    orbitAroundOpponent(fighter, opponent, -sidestep * controlSide * fighter.character.stats.sidestepSpeed * sidestepScale * laneSpeedScale * dt);
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
    if (fighter.throwJabCooldownFrames === 0 && isFreshAttackPress(fighter, input, 'jab')) {
      startThrowHoldJab(fighter);
    }
  }
  if (fighter.throwHoldFrames >= fighter.throwMaxHoldFrames) {
    releaseThrowCapture(fighter, defender);
  }
}

function countFreshAttackPresses(fighter: FighterRuntime, input: InputFrame) {
  return moveInputs.reduce((count, action) => count + (isFreshAttackPress(fighter, input, action) ? 1 : 0), 0);
}

function isFreshAttackPress(fighter: FighterRuntime, input: InputFrame, action: MoveInput) {
  const inputMeta = input as InputFrameWithMetadata;
  return Boolean(input[action] && ((inputMeta.__pressedActions?.includes(action) ?? false) || !fighter.previousAttackInputs[action]));
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
  attacker.comboTimer = Math.max(attacker.comboTimer, COMBO_WINDOW);
  attacker.comboDamage = Math.max(0, attacker.comboDamage + move.damage);
  const identity = getMoveIdentity(move);
  const family = getMoveFamily(move);
  const visualFamily = getMoveVisualFamily(move);
  if (!attacker.comboUsedKeys.includes(identity)) {
    attacker.comboUsedKeys = [...attacker.comboUsedKeys, identity].slice(-COMBO_SEQUENCE_MEMORY);
  }
  attacker.aiRecentComboKeys = addRecentAiMemoryKey(attacker.aiRecentComboKeys, identity);
  attacker.aiRecentComboFamilies = addRecentAiMemoryKey(attacker.aiRecentComboFamilies, family);
  attacker.aiRecentComboVisualFamilies = addRecentAiMemoryKey(attacker.aiRecentComboVisualFamilies, visualFamily);
  applyFighterDamage(defender, move.damage);
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
  applyVisualHitstop(attacker, defender, move, 'hit');
  pushCombatPopupEvent(match, impactId, attacker, move, attacker.comboHits >= 2 ? 'combo' : null, {
    launched: false,
    juggled: false,
    tornado: false,
    kiBurst: Boolean(move.kiBurst)
  });
  if (defender.hp <= 0) {
    releaseThrowCapture(attacker, defender);
    beginRoundFinisher(match, attacker, defender, impactId, impactPosition);
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

function bufferMoveIntent(fighter: FighterRuntime, intent: NonNullable<FighterRuntime['bufferedMoveIntent']>) {
  fighter.bufferedMoveIntent = {
    moveInput: intent.moveInput,
    inputSnapshot: cloneInputFrame(intent.inputSnapshot),
    framesRemaining: ATTACK_BUFFER_FRAMES,
    sequence: intent.sequence
  };
  fighter.bufferedMoveInput = intent.moveInput;
  fighter.bufferedMoveFrames = ATTACK_BUFFER_FRAMES;
}

function tickBufferedMoveIntent(fighter: FighterRuntime, frameDelta: number) {
  if (!fighter.bufferedMoveIntent) {
    fighter.bufferedMoveInput = null;
    fighter.bufferedMoveFrames = 0;
    return;
  }
  fighter.bufferedMoveIntent.framesRemaining = Math.max(0, fighter.bufferedMoveIntent.framesRemaining - frameDelta);
  fighter.bufferedMoveFrames = fighter.bufferedMoveIntent.framesRemaining;
  fighter.bufferedMoveInput = fighter.bufferedMoveIntent.moveInput;
  if (fighter.bufferedMoveIntent.framesRemaining === 0) clearBufferedMoveInput(fighter);
}

function clearBufferedMoveInput(fighter: FighterRuntime) {
  fighter.bufferedMoveInput = null;
  fighter.bufferedMoveFrames = 0;
  fighter.bufferedMoveIntent = null;
}

function canBufferFreshMoveInput(fighter: FighterRuntime) {
  if (fighter.state === 'juggle' || fighter.state === 'knockdown' || fighter.state === 'transform' || fighter.state === 'throwHold' || fighter.state === 'throwHeld') return false;
  if (fighter.state === 'chargeKi' && (fighter.chargePhase === 'startup' || fighter.chargePhase === 'recovery')) return false;
  return true;
}

function cloneInputFrame(input: InputFrame): InputFrame {
  const clone = emptyInputFrame();
  for (const action of Object.keys(clone) as ActionName[]) {
    clone[action] = input[action];
  }
  const inputMeta = input as InputFrameWithMetadata;
  const cloneMeta = clone as InputFrameWithMetadata;
  if (inputMeta.__pressedActions) cloneMeta.__pressedActions = [...inputMeta.__pressedActions];
  if (inputMeta.__pressSequences) cloneMeta.__pressSequences = { ...inputMeta.__pressSequences };
  return clone;
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
  fighter.comboIdentitySequence = [];
  fighter.comboFamilySequence = [];
  fighter.comboVisualFamilySequence = [];
  fighter.comboUsedKeys = [];
  fighter.comboHits = 0;
  fighter.comboDamage = 0;
  fighter.aiRecentComboKeys = [];
  fighter.aiRecentComboFamilies = [];
  fighter.aiRecentComboVisualFamilies = [];
  fighter.aiActiveComboRouteId = null;
  fighter.aiJuggleLockoutFrames = 0;
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

function maybeSpawnShadowCloneFromCharge(stage: StageDefinition, fighter: FighterRuntime, opponent: FighterRuntime) {
  if (!isShadowCloneCharacter(fighter)) return;
  if (fighter.shadowClone || fighter.shadowCloneChargeConsumed) return;
  if (fighter.state !== 'chargeKi' || fighter.chargePhase === 'startup' || fighter.chargePhase === 'recovery') return;
  if (fighter.ki < SHADOW_CLONE_KI_THRESHOLD) return;

  const sideSign = -getOpponentSideSign(fighter, opponent, stage);
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
    visualHitstop: createEmptyVisualHitstop(),
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
  tickVisualHitstop(clone, frameDelta);

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

function getFreshMoveIntent(fighter: FighterRuntime, input: InputFrame): FighterRuntime['bufferedMoveIntent'] {
  const inputMeta = input as InputFrameWithMetadata;
  const pressedMoveInputs = (inputMeta.__pressedActions ?? [])
    .filter((action): action is MoveInput => isMoveInput(action) && input[action])
    .sort((a, b) => (inputMeta.__pressSequences?.[b] ?? 0) - (inputMeta.__pressSequences?.[a] ?? 0));
  const moveInput = pressedMoveInputs[0] ?? moveInputs.find((action) => input[action] && !fighter.previousAttackInputs[action]) ?? null;
  if (!moveInput) return null;
  return {
    moveInput,
    inputSnapshot: cloneInputFrame(input),
    framesRemaining: ATTACK_BUFFER_FRAMES,
    sequence: inputMeta.__pressSequences?.[moveInput] ?? 0
  };
}

function isMoveInput(action: ActionName): action is MoveInput {
  return action === 'jab' || action === 'kick' || action === 'heavy' || action === 'special';
}

function updateAttackInputMemory(fighter: FighterRuntime, input: InputFrame) {
  for (const action of moveInputs) {
    fighter.previousAttackInputs[action] = input[action];
  }
}

function handleKnockdownStep(stage: StageDefinition, fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, dt: number) {
  if (fighter.position.y > 0 || fighter.velocityY !== 0) return;

  if (fighter.state === 'getup' || fighter.getupStarted) {
    const recoverySide = getControlSideSign(fighter, opponent, stage);
    if (fighter.getupForward !== 0) {
      moveAlongOpponentAxis(fighter, opponent, fighter.getupForward * fighter.character.stats.speed * GETUP_ROLL_SPEED * dt);
    }
    if (fighter.getupLane !== 0) {
      moveAlongOpponentLateralAxis(
        fighter,
        opponent,
        fighter.getupLane,
        fighter.character.stats.sidestepSpeed * GETUP_LANE_SPEED * dt
      );
    }
    keepFighterOnControlSide(stage, fighter, opponent, recoverySide);
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
  keepFighterOnControlSide(stage, fighter, opponent, getControlSideSign(fighter, opponent, stage));
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
  const sequence = continuing ? [...fighter.comboSequence, moveInput].slice(-COMBO_SEQUENCE_MEMORY) : [moveInput];
  const command = findConfiguredCommand(fighter, opponent, input, moveInput);
  if (continuing && !canChainInto(fighter, chainMode)) return false;
  const move = buildComboMove(fighter.character, baseMove, moveInput, route, comboStep, sequence, command);
  if (!hasResolvedAttackAnimationFrames(fighter.character, move)) {
    if (fighter.bufferedMoveInput === moveInput) clearBufferedMoveInput(fighter);
    return false;
  }
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
  const family = getMoveFamily(move);
  const visualFamily = getMoveVisualFamily(move);
  fighter.aiRecentComboKeys = addRecentAiMemoryKey(fighter.aiRecentComboKeys, identity);
  fighter.aiRecentComboFamilies = addRecentAiMemoryKey(fighter.aiRecentComboFamilies, family);
  fighter.aiRecentComboVisualFamilies = addRecentAiMemoryKey(fighter.aiRecentComboVisualFamilies, visualFamily);
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
  fighter.comboIdentitySequence = continuing ? [...fighter.comboIdentitySequence, identity].slice(-COMBO_SEQUENCE_MEMORY) : [identity];
  fighter.comboFamilySequence = continuing ? [...fighter.comboFamilySequence, family].slice(-COMBO_SEQUENCE_MEMORY) : [family];
  fighter.comboVisualFamilySequence = continuing ? [...fighter.comboVisualFamilySequence, visualFamily].slice(-COMBO_SEQUENCE_MEMORY) : [visualFamily];
  if (!continuing) {
    fighter.comboUsedKeys = [];
    fighter.aiJuggleLockoutFrames = 0;
  }

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
  const sequence = fighter.comboTimer > 0 ? [...fighter.comboSequence, moveInput].slice(-COMBO_SEQUENCE_MEMORY) : [moveInput];
  const command = findConfiguredCommand(fighter, opponent, input, moveInput);
  const move = buildComboMove(fighter.character, baseMove, moveInput, route, comboStep, sequence, command);
  if (!hasResolvedAttackAnimationFrames(fighter.character, move)) return Number.POSITIVE_INFINITY;
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
  const sequence = [...fighter.comboSequence, moveInput].slice(-COMBO_SEQUENCE_MEMORY);
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
    counterHit: move.counterHit,
    counterHitStunBonusFrames: move.counterHitStunBonusFrames,
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
  const generatedTimingStep = Math.min(comboStep, 6);
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
    animationKey: command?.animationKey ?? resolveBaseAttackAnimationKey(character, moveInput),
    comboKey: generatedComboKey,
    comboStep,
    route: route.key,
    startupFrames: Math.max(4, Math.round(baseMove.startupFrames * speedScale + (generatedTimingStep > 1 ? Math.min(8, generatedTimingStep * 2) : 0) - Math.min(2, generatedTimingStep - 1) + repeatFatigue * 2)),
    activeFrames: baseMove.activeFrames + (generatedTimingStep > 2 ? 1 : 0) + (generatedTimingStep >= 5 ? 1 : 0),
    recoveryFrames: Math.max(8, Math.round(baseMove.recoveryFrames * (route.away ? 0.92 : 1) + Math.max(0, generatedTimingStep - 1) * 2 - (route.toward ? 1 : 0) + repeatFatigue * 6)),
    damage: Math.max(3, Math.round(baseMove.damage * damageScale)),
    blockDamage: 0,
    range: baseMove.range + rangeBonus,
    pushback: baseMove.pushback + pushBonus,
    blockPushback: baseMove.blockPushback + pushBonus * 0.4,
    onBlockFrames: baseMove.onBlockFrames + (route.away ? 2 : route.toward ? -1 : 0) - Math.max(0, generatedTimingStep - 1) * 2 - repeatFatigue * 3,
    onHitFrames: baseMove.onHitFrames + (generatedTimingStep <= 1 ? 0 : Math.max(-5, 3 - generatedTimingStep * 2)) + (route.launcher ? 4 : 0) - repeatFatigue * 8,
    onCounterHitFrames: baseMove.onCounterHitFrames + (generatedTimingStep <= 1 ? 0 : Math.max(-4, 5 - generatedTimingStep)) + (route.launcher ? 5 : 0) - repeatFatigue * 5,
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

function resolveBaseAttackAnimationKey(character: CharacterDefinition, moveInput: MoveInput) {
  const canonicalKey = baseInputToAnimationKey[moveInput];
  if ((character.animationFrames?.[canonicalKey]?.length ?? 0) > 0) return canonicalKey;
  if ((character.animationFrames?.[moveInput]?.length ?? 0) > 0) return moveInput;
  return canonicalKey;
}

function hasResolvedAttackAnimationFrames(character: CharacterDefinition, move: MoveDefinition) {
  const key = move.animationKey ?? resolveBaseAttackAnimationKey(character, move.input);
  return (character.animationFrames?.[key]?.length ?? 0) > 0;
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

function countTrailingIdentityRepeats(sequence: string[], identity: string) {
  let count = 0;
  for (let index = sequence.length - 1; index >= 0 && sequence[index] === identity; index -= 1) {
    count += 1;
  }
  return Math.max(1, count);
}

function countIdentityOccurrences(sequence: string[], identity: string) {
  return sequence.reduce((count, candidate) => count + (candidate === identity ? 1 : 0), 0);
}

function shouldForceJuggleRepeatDrop(attacker: FighterRuntime, identity: string, family: string, visualFamily: string) {
  return (
    isStaleJuggleLoopKey(attacker.comboIdentitySequence, identity) ||
    isStaleJuggleLoopKey(attacker.comboFamilySequence, family) ||
    isStaleJuggleLoopKey(attacker.comboVisualFamilySequence, visualFamily)
  );
}

function isStaleJuggleLoopKey(sequence: string[], key: string) {
  const previous = sequence[sequence.length - 1] === key ? sequence.slice(0, -1) : sequence;
  if (!previous.includes(key)) return false;
  const loopKeys = new Set([...previous, key]);
  return loopKeys.size <= JUGGLE_REPEAT_LOOP_UNIQUE_LIMIT;
}

function buildJuggleLoopBreakerMove(move: MoveDefinition): MoveDefinition {
  return {
    ...move,
    damage: Math.max(1, Math.round(move.damage * JUGGLE_LOOP_BREAKER_DAMAGE_SCALE)),
    launchHeight: undefined,
    knockdown: true,
    tornado: false
  };
}

function applyJuggleLoopBreakerHit(
  match: MatchSnapshot,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  move: MoveDefinition,
  position: [number, number, number],
  distance: number,
  dx: number,
  dz: number
) {
  const breakerMove = buildJuggleLoopBreakerMove(move);
  const impactId = nextHitEventId(match);
  const damage = breakerMove.damage;
  pushImpactSparkEvent(match, impactId, attacker, defender, breakerMove, 'hit', {
    comboHits: Math.max(1, attacker.comboHits + 1),
    juggled: true,
    kiBurst: Boolean(move.kiBurst)
  }, position);
  attacker.hitConnected = true;
  attacker.hitConfirmed = true;
  attacker.comboHits = Math.max(1, attacker.comboHits + 1);
  attacker.comboTimer = Math.max(attacker.comboTimer, COMBO_WINDOW);
  attacker.comboDamage = Math.max(0, attacker.comboDamage + damage);
  attacker.aiJuggleLockoutFrames = Math.max(attacker.aiJuggleLockoutFrames, AI_JUGGLE_LOCKOUT_FRAMES);
  pushCombatPopupEvent(match, impactId, attacker, breakerMove, attacker.comboHits >= 2 ? 'combo' : null, {
    juggled: true,
    kiBurst: Boolean(move.kiBurst)
  });
  applyFighterDamage(defender, damage);
  defender.currentMove = null;
  defender.moveFrame = 0;
  defender.blockstunFramesRemaining = 0;
  defender.blockPunishWindowFrames = 0;
  defender.forcedCrouchFrames = 0;
  resetKiChargeRuntime(defender);
  mirrorShadowCloneHit(defender, breakerMove, true, true);
  enterKnockdown(defender, Math.max(KNOCKDOWN_MIN_FRAMES + GETUP_FRAMES, breakerMove.onHitFrames + KNOCKDOWN_MIN_FRAMES));
  const pushX = distance > 0 ? dx / distance : attacker.facing;
  const pushZ = distance > 0 ? dz / distance : 0;
  defender.position.x += pushX * Math.max(0.2, breakerMove.pushback) * 0.22;
  defender.position.z += pushZ * Math.max(0.2, breakerMove.pushback) * 0.22;
  applyVisualHitstop(attacker, defender, breakerMove, 'hit');
  if (defender.hp <= 0) beginRoundFinisher(match, attacker, defender, impactId, position);
}

function applyShadowCloneJuggleLoopBreakerHit(
  match: MatchSnapshot,
  attacker: FighterRuntime,
  cloneFighter: FighterRuntime,
  defender: FighterRuntime,
  weakMove: MoveDefinition,
  position: [number, number, number],
  distance: number,
  dx: number,
  dz: number
) {
  const breakerMove = buildJuggleLoopBreakerMove(weakMove);
  const impactId = nextHitEventId(match);
  pushImpactSparkEvent(match, impactId, attacker, defender, breakerMove, 'hit', {
    comboHits: Math.max(1, attacker.comboHits + 1),
    juggled: true,
    kiBurst: Boolean(weakMove.kiBurst)
  }, position);
  attacker.hitConfirmed = true;
  attacker.comboHits = Math.max(1, attacker.comboHits + 1);
  attacker.comboDamage = Math.max(0, attacker.comboDamage + breakerMove.damage);
  attacker.aiJuggleLockoutFrames = Math.max(attacker.aiJuggleLockoutFrames, AI_JUGGLE_LOCKOUT_FRAMES);
  pushCombatPopupEvent(match, impactId, attacker, breakerMove, attacker.comboHits >= 2 ? 'combo' : null, {
    juggled: true,
    kiBurst: Boolean(weakMove.kiBurst)
  });
  applyFighterDamage(defender, breakerMove.damage);
  defender.currentMove = null;
  defender.moveFrame = 0;
  defender.blockstunFramesRemaining = 0;
  defender.blockPunishWindowFrames = 0;
  defender.forcedCrouchFrames = 0;
  resetKiChargeRuntime(defender);
  enterKnockdown(defender, Math.max(KNOCKDOWN_MIN_FRAMES + GETUP_FRAMES, breakerMove.onHitFrames + KNOCKDOWN_MIN_FRAMES));
  const pushX = distance > 0 ? dx / distance : cloneFighter.facing;
  const pushZ = distance > 0 ? dz / distance : 0;
  defender.position.x += pushX * Math.max(0.2, breakerMove.pushback) * 0.16;
  defender.position.z += pushZ * Math.max(0.2, breakerMove.pushback) * 0.16;
  applyShadowCloneVisualHitstop(attacker, defender, breakerMove, 'hit');
  scheduleShadowCloneVanish(attacker);
  if (defender.hp <= 0) beginRoundFinisher(match, attacker, defender, impactId, position);
}

function getEngineRouteVarietyCredit(move: MoveDefinition, attacker: FighterRuntime, identity: string, context: 'neutral' | 'combo' | 'juggle', repeatCount: number) {
  if (context === 'neutral' || repeatCount > 1) return 0;
  const recentIdentities = attacker.comboIdentitySequence.slice(0, -1);
  let credit = 0;
  if (!recentIdentities.includes(identity)) credit += 1;
  if (move.command) credit += 1;
  if (move.endsInCrouch) credit += 1;
  if (context === 'juggle' && move.tornado) credit += 3;
  if (context === 'juggle' && attacker.comboHits >= 6) credit += 3;
  if (context === 'juggle' && attacker.comboHits >= 12) credit += 3;
  if (context === 'juggle' && attacker.comboHits >= 20) credit += 2;
  return Math.min(12, credit);
}

function getEngineVariedJuggleAdvantageFloor(move: MoveDefinition, comboHits: number, repeatCount: number, context: 'neutral' | 'combo' | 'juggle') {
  if (context !== 'juggle' || repeatCount > 1 || move.launchHeight || move.knockdown) return null;
  if (comboHits >= 18) return 30;
  if (comboHits >= 10) return 26;
  if (comboHits >= 6) return 22;
  return null;
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
    onComboHitFrames: merged.onComboHitFrames === undefined ? undefined : Math.round(merged.onComboHitFrames),
    onJuggleHitFrames: merged.onJuggleHitFrames === undefined ? undefined : Math.round(merged.onJuggleHitFrames),
    comboRepeatPenaltyFrames: merged.comboRepeatPenaltyFrames === undefined ? undefined : Math.max(0, Math.round(merged.comboRepeatPenaltyFrames)),
    juggleRepeatPenaltyFrames: merged.juggleRepeatPenaltyFrames === undefined ? undefined : Math.max(0, Math.round(merged.juggleRepeatPenaltyFrames)),
    counterHit: Boolean(merged.counterHit),
    counterHitStunBonusFrames: merged.counterHitStunBonusFrames === undefined ? undefined : Math.max(0, Math.round(merged.counterHitStunBonusFrames)),
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
  return cpuMoveIdentityKeyFromMove(move);
}

function getMoveFamily(move: MoveDefinition) {
  return cpuMoveFamilyKeyFromMove(move);
}

function getMoveVisualFamily(move: MoveDefinition) {
  return cpuMoveVisualFamilyKeyFromMove(move);
}

function addRecentAiMemoryKey(keys: string[], key: string) {
  return [...keys, key].slice(-AI_RECENT_MEMORY_LIMIT);
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
  if (launcher && away) return { key: 'up-back', label: 'Back Hop', toward, away, low: false, launcher };
  if (low && toward) return { key: 'down-forward', label: 'Low Drive', toward, away, low, launcher: false };
  if (low && away) return { key: 'down-back', label: 'Guard Low', toward, away, low, launcher: false };
  if (launcher) return { key: 'up', label: 'Rising', toward, away, low: false, launcher };
  if (low) return { key: 'down', label: 'Crouch', toward, away, low, launcher: false };
  if (toward) return { key: 'forward', label: 'Advancing', toward, away, low, launcher: false };
  if (away) return { key: 'back', label: 'Retreat', toward, away, low, launcher: false };
  return { key: 'neutral', label: 'Neutral', toward, away, low, launcher: false };
}

function resolveHits(match: MatchSnapshot, frameDelta = 1) {
  const [a, b] = match.fighters;
  if (tryStartKiClash(match, a, b, frameDelta)) return;
  tryHit(match, a, b, frameDelta);
  if (match.roundFinisher) return;
  tryHit(match, b, a, frameDelta);
  if (match.roundFinisher) return;
  tryShadowCloneHit(match, a, b, frameDelta);
  if (match.roundFinisher) return;
  tryShadowCloneHit(match, b, a, frameDelta);
}

function tryStartKiClash(match: MatchSnapshot, p1: FighterRuntime, p2: FighterRuntime, frameDelta: number) {
  if (isClashActive(match.clashState)) return false;
  const p1Move = p1.currentMove;
  const p2Move = p2.currentMove;
  if (!p1Move || !p2Move) return false;
  if (p1.state !== 'attack' || p2.state !== 'attack') return false;
  if (!p1Move.kiBurst || !p2Move.kiBurst) return false;
  if (p1.hitConnected || p2.hitConnected) return false;
  const p1ActiveFrame = getSweptActiveMoveFrame(p1Move, p1.moveFrame, frameDelta);
  const p2ActiveFrame = getSweptActiveMoveFrame(p2Move, p2.moveFrame, frameDelta);
  if (p1ActiveFrame === null || p2ActiveFrame === null) return false;
  const clashOverlap = findFirstBoxOverlap(getActiveAttackAabbs(p1, p1Move, true, p1ActiveFrame), getActiveAttackAabbs(p2, p2Move, true, p2ActiveFrame));
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
  applyFighterDamage(loser, damage);

  const pushX = loser.position.x - winner.position.x;
  const pushZ = loser.position.z - winner.position.z;
  const pushDistance = Math.hypot(pushX, pushZ) || 1;
  loser.position.x += (pushX / pushDistance) * CLASH_PUSHBACK;
  loser.position.z += (pushZ / pushDistance) * CLASH_PUSHBACK;
  applyVisualHitstop(winner, loser, winnerMove, 'clash');

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
  if (loser.hp <= 0) beginRoundFinisher(match, winner, loser, popupId, clash.contactPoint);
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
  applyVisualHitstop(p1, p2, p1Move ?? p2Move, 'clash');
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

function tryHit(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime, frameDelta: number) {
  const move = attacker.currentMove;
  if (!move || attacker.state !== 'attack' || attacker.hitConnected) return;
  if (defender.state === 'knockdown' || defender.state === 'transform' || defender.state === 'throwHold' || defender.state === 'throwHeld' || defender.getupInvulnerableFrames > 0) return;
  const moveFrame = attacker.moveFrame || secondsToFrames(totalMoveSeconds(move) - attacker.actionTimer);
  const activeMoveFrame = getSweptActiveMoveFrame(move, moveFrame, frameDelta);
  if (activeMoveFrame === null) return;
  const attackerPosition = getFighterCombatPosition(attacker);
  const defenderPosition = getFighterCombatPosition(defender);
  const dx = defenderPosition.x - attackerPosition.x;
  const dz = defenderPosition.z - attackerPosition.z;
  const distance = Math.hypot(dx, dz);
  const attackerScale = getCharacterCombatScale(attacker.character);
  const collision = getAttackCollision(attacker, defender, move, distance <= move.range * attackerScale.width + UNIVERSAL_RANGE_BUFFER, activeMoveFrame);
  if (!collision) return;

  const wasJuggled = defender.state === 'juggle';
  const wasAirborne = isAirborne(defender) || wasJuggled;
  const launchHeight = Math.max(0, move.launchHeight ?? 0);
  const blocked = canDefenderBlockMove(defender, attacker, move);
  const counterHit = isCounterHit(defender);
  const whiffPunish = isWhiffPunish(defender);
  const blockPunish = attacker.blockPunishWindowFrames > 0;
  const identity = getMoveIdentity(move);
  const family = getMoveFamily(move);
  const visualFamily = getMoveVisualFamily(move);
  const identityUsesInCombo = countIdentityOccurrences(attacker.comboIdentitySequence, identity);
  const tornadoExtendsJuggle = Boolean(move.tornado) && wasJuggled && defender.juggleTornadoCount < TORNADO_EXTENSION_LIMIT && identityUsesInCombo <= 1;
  if (!blocked && wasJuggled && shouldForceJuggleRepeatDrop(attacker, identity, family, visualFamily)) {
    applyJuggleLoopBreakerHit(match, attacker, defender, move, collision.position, distance, dx, dz);
    return;
  }
  const impactId = nextHitEventId(match);
  const comboHits = blocked ? 0 : Math.max(1, attacker.comboHits + 1);
  pushImpactSparkEvent(match, impactId, attacker, defender, move, blocked ? 'block' : counterHit ? 'counterHit' : whiffPunish ? 'whiffPunish' : blockPunish ? 'punish' : 'hit', {
    comboHits,
    launched: launchHeight > 0,
    juggled: wasJuggled || wasAirborne,
    tornado: tornadoExtendsJuggle,
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
    applyFighterDamage(defender, move.blockDamage);
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
    applyVisualHitstop(attacker, defender, move, 'block');
    if (defender.hp <= 0) beginRoundFinisher(match, attacker, defender, impactId, collision.position);
    return;
  }

  attacker.hitConfirmed = true;
  if (!moveUsesKi(move)) {
    attacker.ki = clamp(attacker.ki + KI_HIT_GAIN + Math.max(0, Math.round(move.damage * 0.35)) + Math.max(0, attacker.comboStep - 1) * 2, 0, KI_MAX);
  }
  attacker.comboHits = Math.max(1, attacker.comboHits + 1);
  attacker.comboTimer = Math.max(attacker.comboTimer, COMBO_WINDOW);
  attacker.comboDamage = Math.max(0, attacker.comboDamage + move.damage);
  if (!attacker.comboUsedKeys.includes(identity)) {
    attacker.comboUsedKeys = [...attacker.comboUsedKeys, identity].slice(-COMBO_SEQUENCE_MEMORY);
  }
  attacker.aiRecentComboKeys = addRecentAiMemoryKey(attacker.aiRecentComboKeys, identity);
  attacker.aiRecentComboFamilies = addRecentAiMemoryKey(attacker.aiRecentComboFamilies, family);
  attacker.aiRecentComboVisualFamilies = addRecentAiMemoryKey(attacker.aiRecentComboVisualFamilies, visualFamily);
  pushCombatPopupEvent(match, impactId, attacker, move, counterHit ? 'counterHit' : whiffPunish ? 'whiffPunish' : blockPunish ? 'punish' : attacker.comboHits >= 2 ? 'combo' : null, {
    launched: launchHeight > 0,
    juggled: wasJuggled || wasAirborne,
    tornado: tornadoExtendsJuggle,
    kiBurst: Boolean(move.kiBurst)
  });

  const repeatCount = countTrailingIdentityRepeats(attacker.comboIdentitySequence, identity);
  const hitContext = wasAirborne ? 'juggle' : defender.state === 'hit' && defender.stunFramesRemaining > 0 ? 'combo' : 'neutral';
  const frameData = contextualComboFrameData(move, {
    context: hitContext,
    counterHit: counterHit && Boolean(move.counterHit),
    comboHits: attacker.comboHits,
    repeatCount,
    routeVarietyCredit: getEngineRouteVarietyCredit(move, attacker, identity, hitContext, repeatCount)
  });
  const advantage = Math.max(
    frameData.effectiveAdvantage,
    getEngineVariedJuggleAdvantageFloor(move, attacker.comboHits, repeatCount, hitContext) ?? frameData.effectiveAdvantage
  );
  const stunFrames = Math.max(1, attackerRemaining + advantage + (counterHit ? UNIVERSAL_COUNTER_HIT_STUN_BONUS_FRAMES : 0));
  const entersJuggle = launchHeight > 0 || wasJuggled;
  const juggleTotalDamage = (wasAirborne || entersJuggle ? defender.juggleDamage : 0) + move.damage;
  const juggleDamageContribution = getJuggleSequenceDamageContribution(move, attacker.comboHits, repeatCount, tornadoExtendsJuggle);
  const juggleSequenceDamage = tornadoExtendsJuggle
    ? juggleDamageContribution
    : (wasAirborne || entersJuggle ? defender.juggleSequenceDamage : 0) + juggleDamageContribution;
  const forceKnockdown = move.knockdown || (!tornadoExtendsJuggle && juggleSequenceDamage >= JUGGLE_DAMAGE_LIMIT);
  applyFighterDamage(defender, move.damage);
  defender.blockstunFramesRemaining = 0;
  defender.blockPunishWindowFrames = 0;
  defender.currentMove = null;
  defender.moveFrame = 0;
  defender.forcedCrouchFrames = 0;
  resetKiChargeRuntime(defender);
  mirrorShadowCloneHit(defender, move, forceKnockdown, entersJuggle);

  if (move.throwCapture && defender.hp > 0) {
    startThrowCapture(attacker, defender, move);
    applyVisualHitstop(attacker, defender, move, 'hit');
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
    const refloatVelocity = tornadoExtendsJuggle ? getTornadoRefloatVelocity(move) : getJuggleVelocity(move, wasAirborne, attacker.comboHits);
    const minHeight = tornadoExtendsJuggle ? TORNADO_REFLOAT_MIN_HEIGHT : wasAirborne ? JUGGLE_REFLOAT_MIN_HEIGHT : JUGGLE_MIN_START_HEIGHT;
    defender.position.y = Math.min(Math.max(defender.position.y, minHeight), getJuggleRefloatMaxHeight(move, wasAirborne, attacker.comboHits, tornadoExtendsJuggle));
    defender.velocityY = Math.max(defender.velocityY, refloatVelocity);
    defender.juggleGravityScale = getMoveJuggleGravityScale(move);
    const explicitRefloat = wasAirborne && Number.isFinite(move.juggleRefloatVelocity);
    const juggleFloor = tornadoExtendsJuggle ? TORNADO_REFLOAT_STUN_FRAMES : !wasAirborne ? 28 : explicitRefloat ? 16 : 1;
    defender.stunFramesRemaining = Math.max(defender.stunFramesRemaining, juggleFloor);
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
  applyVisualHitstop(attacker, defender, move, counterHit ? 'counterHit' : whiffPunish ? 'whiffPunish' : blockPunish ? 'punish' : 'hit');
  if (defender.hp <= 0) beginRoundFinisher(match, attacker, defender, impactId, collision.position);
}

function tryShadowCloneHit(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime, frameDelta: number) {
  const clone = attacker.shadowClone;
  const sourceMove = clone?.currentMove;
  if (!clone || clone.phase !== 'active' || clone.state !== 'attack' || !sourceMove || clone.hitConnected) return;
  if (defender.state === 'knockdown' || defender.state === 'transform' || defender.state === 'throwHold' || defender.state === 'throwHeld' || defender.getupInvulnerableFrames > 0) return;
  const activeMoveFrame = getSweptActiveMoveFrame(sourceMove, clone.moveFrame, frameDelta);
  if (activeMoveFrame === null) return;

  const cloneFighter = makeShadowCloneFighter(attacker, clone);
  const clonePosition = getFighterCombatPosition(cloneFighter);
  const defenderPosition = getFighterCombatPosition(defender);
  const dx = defenderPosition.x - clonePosition.x;
  const dz = defenderPosition.z - clonePosition.z;
  const distance = Math.hypot(dx, dz);
  const weakMove = buildShadowCloneMove(sourceMove);
  const collision = getAttackCollision(cloneFighter, defender, weakMove, distance <= weakMove.range + UNIVERSAL_RANGE_BUFFER, activeMoveFrame);
  if (!collision) return;

  const blocked = canDefenderBlockMove(defender, cloneFighter, weakMove);
  const identity = getMoveIdentity(sourceMove);
  const family = getMoveFamily(sourceMove);
  const visualFamily = getMoveVisualFamily(sourceMove);
  if (!blocked && defender.state === 'juggle' && shouldForceJuggleRepeatDrop(attacker, identity, family, visualFamily)) {
    clone.hitConnected = true;
    applyShadowCloneJuggleLoopBreakerHit(match, attacker, cloneFighter, defender, weakMove, collision.position, distance, dx, dz);
    return;
  }

  clone.hitConnected = true;
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
    applyFighterDamage(defender, weakMove.blockDamage);
    const effectiveOnBlockFrames = getEffectiveOnBlockFrames(weakMove);
    defender.blockstunFramesRemaining = Math.max(1, attackerRemaining + effectiveOnBlockFrames);
    defender.stunFramesRemaining = 0;
    defender.stunTimer = framesToSeconds(defender.blockstunFramesRemaining);
    defender.state = defender.state === 'crouchBlock' ? 'crouchBlock' : 'block';
    defender.forcedCrouchFrames = 0;
    defender.position.x += pushX * weakMove.blockPushback * 0.12;
    defender.position.z += pushZ * weakMove.blockPushback * 0.12;
    applyShadowCloneVisualHitstop(attacker, defender, weakMove, 'block');
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
  const cloneContext = wasJuggled || isAirborne(defender) ? 'juggle' : defender.state === 'hit' && defender.stunFramesRemaining > 0 ? 'combo' : 'neutral';
  const cloneAdvantage = contextualHitAdvantage(weakMove, {
    context: cloneContext,
    comboHits: attacker.comboHits,
    repeatCount: 1
  });
  const stunFrames = Math.max(8, attackerRemaining + cloneAdvantage);
  applyFighterDamage(defender, weakMove.damage);
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
  applyShadowCloneVisualHitstop(attacker, defender, weakMove, 'hit');
  if (defender.hp <= 0) beginRoundFinisher(match, attacker, defender, impactId, collision.position);
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
    onComboHitFrames: move.onComboHitFrames === undefined ? undefined : Math.max(4, Math.round(move.onComboHitFrames * 0.72)),
    onJuggleHitFrames: move.onJuggleHitFrames === undefined ? undefined : Math.max(3, Math.round(move.onJuggleHitFrames * 0.62)),
    comboRepeatPenaltyFrames: move.comboRepeatPenaltyFrames,
    juggleRepeatPenaltyFrames: move.juggleRepeatPenaltyFrames,
    pushback: move.pushback * 0.62,
    blockPushback: move.blockPushback * 0.58,
    launchHeight: 0,
    knockdown: false,
    tornado: false
  };
}

function tickVisualHitstop(actor: Pick<FighterRuntime, 'visualHitstop'> | NonNullable<FighterRuntime['shadowClone']>, frameDelta: number) {
  const hitstop = actor.visualHitstop;
  if (hitstop.framesRemaining <= 0) return;
  hitstop.framesRemaining = Math.max(0, hitstop.framesRemaining - frameDelta);
  if (hitstop.framesRemaining === 0) {
    hitstop.animationKey = null;
    hitstop.progress = 0;
  }
}

function applyVisualHitstop(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition | null | undefined, kind: ImpactSparkKind) {
  const frames = getVisualHitstopFrames(move, kind);
  if (frames <= 0) return;
  setVisualHitstop(attacker, move, frames);
  setVisualHitstop(defender, null, frames);
}

function applyShadowCloneVisualHitstop(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition | null | undefined, kind: ImpactSparkKind) {
  const frames = getVisualHitstopFrames(move, kind);
  if (frames <= 0) return;
  const clone = attacker.shadowClone;
  if (clone?.phase === 'active') {
    clone.visualHitstop = {
      framesRemaining: Math.max(clone.visualHitstop.framesRemaining, frames),
      animationKey: clone.currentMove?.animationKey ?? clone.currentMove?.input ?? getFighterAnimationKey(attacker),
      progress: clone.currentMove ? clamp(getMoveProgress(clone.moveFrame, clone.currentMove), 0, 1) : 0
    };
  }
  setVisualHitstop(defender, null, frames);
}

function setVisualHitstop(fighter: FighterRuntime, move: MoveDefinition | null | undefined, frames: number) {
  fighter.visualHitstop = {
    framesRemaining: Math.max(fighter.visualHitstop.framesRemaining, frames),
    animationKey: move?.animationKey ?? getFighterAnimationKey(fighter),
    progress: move ? clamp(getMoveProgress(fighter.moveFrame, move), 0, 1) : activeMoveProgress(fighter)
  };
}

function getVisualHitstopFrames(move: MoveDefinition | null | undefined, kind: ImpactSparkKind) {
  if (kind === 'block') return VISUAL_HITSTOP_BLOCK_FRAMES;
  if (kind === 'counterHit' || kind === 'punish' || kind === 'whiffPunish' || kind === 'clash' || Boolean(move?.kiBurst) || (move?.launchHeight ?? 0) > 0) {
    return VISUAL_HITSTOP_HEAVY_FRAMES;
  }
  if (!move || move.damage <= 4) return VISUAL_HITSTOP_LIGHT_FRAMES;
  return VISUAL_HITSTOP_NORMAL_FRAMES;
}

function getMoveProgress(moveFrame: number, move: MoveDefinition) {
  return moveFrame / Math.max(1, totalMoveFrames(move));
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
    visualHitstop: { ...clone.visualHitstop },
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
  kind: 'combo' | 'punish' | 'whiffPunish' | 'counterHit' | null,
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
      moveCommand: move.command,
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
      moveCommand: move.command,
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

function getSweptActiveMoveFrame(move: MoveDefinition, moveFrame: number, frameDelta: number) {
  const startFrame = move.startupFrames;
  const endFrame = move.startupFrames + move.activeFrames;
  const previousFrame = Math.max(0, moveFrame - Math.max(0, frameDelta));
  if (moveFrame >= startFrame && previousFrame < endFrame) {
    return clamp(moveFrame, startFrame, Math.max(startFrame, endFrame - 1));
  }
  return null;
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

function isGrounded(fighter: FighterRuntime) {
  return fighter.position.y <= 0 && fighter.velocityY === 0;
}

function getJuggleVelocity(move: MoveDefinition, wasAirborne: boolean, comboHits = 1) {
  const launchHeight = Math.max(0, move.launchHeight ?? 0);
  if (wasAirborne && Number.isFinite(move.juggleRefloatVelocity)) {
    return clamp(move.juggleRefloatVelocity ?? JUGGLE_REFLOAT_VELOCITY, 2.2, 6.4);
  }
  if (!wasAirborne && Number.isFinite(move.launchVelocity)) {
    return clamp(move.launchVelocity ?? JUGGLE_INITIAL_VELOCITY, 3.2, 7.2);
  }
  if (wasAirborne) {
    const base = Math.min(5.25, Math.max(JUGGLE_REFLOAT_VELOCITY, launchHeight > 0 ? launchHeight * 1.95 : JUGGLE_REFLOAT_VELOCITY));
    if (comboHits >= 18) return Math.min(base, 2.25);
    if (comboHits >= 10) return Math.min(base, 2.85);
    if (comboHits >= 6) return Math.min(base, 3.45);
    return base;
  }
  return Math.min(6.65, Math.max(JUGGLE_INITIAL_VELOCITY, launchHeight > 0 ? launchHeight * 2.55 : JUGGLE_INITIAL_VELOCITY));
}

function getTornadoRefloatVelocity(move: MoveDefinition) {
  return clamp(move.juggleRefloatVelocity ?? TORNADO_REFLOAT_VELOCITY, 3.4, 6.4);
}

function getJuggleRefloatMaxHeight(move: MoveDefinition, wasAirborne: boolean, comboHits: number, tornadoExtendsJuggle: boolean) {
  if (tornadoExtendsJuggle) return 5.8;
  const launchHeight = Math.max(0, move.launchHeight ?? 0);
  if (!wasAirborne) return Math.max(4.4, launchHeight * 2.65);
  if (Number.isFinite(move.juggleRefloatVelocity)) return 5.6;
  if (comboHits >= 18) return 3.8;
  if (comboHits >= 10) return 4.4;
  if (comboHits >= 6) return 5.2;
  return 6.2;
}

function getJuggleSequenceDamageContribution(move: MoveDefinition, comboHits: number, repeatCount: number, tornadoExtendsJuggle: boolean) {
  const depth = Math.max(1, comboHits);
  const depthScale = depth <= 2 ? 1 : depth <= 6 ? 0.58 : depth <= 14 ? 0.28 : 0.12;
  const repeatScale = repeatCount > 1 ? 1 + repeatCount * 0.45 : 1;
  const propertyLoad = (move.launchHeight ? 8 : 0) + (move.knockdown ? 4 : 0) + (move.tornado && !tornadoExtendsJuggle ? 3 : 0);
  const tornadoResetRelief = tornadoExtendsJuggle ? -3 : 0;
  return Math.max(1, Math.round(move.damage * depthScale * repeatScale + propertyLoad + tornadoResetRelief));
}

function getMoveJuggleGravityScale(move: MoveDefinition) {
  return clamp(move.juggleGravityScale ?? JUGGLE_GRAVITY_SCALE, 0.28, 1.2);
}

function getFighterJuggleGravityScale(fighter: FighterRuntime) {
  return clamp((fighter.juggleGravityScale || JUGGLE_GRAVITY_SCALE) * JUGGLE_FALL_SPEED_MULTIPLIER, 0.28, JUGGLE_EFFECTIVE_GRAVITY_SCALE_MAX);
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

function getAttackCollision(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition, includeBaseHitbox: boolean, moveFrame = attacker.moveFrame) {
  const attackBoxes = getActiveAttackAabbs(attacker, move, includeBaseHitbox, moveFrame);
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

function getActiveAttackAabbs(attacker: FighterRuntime, move: MoveDefinition, includeBaseHitbox: boolean, moveFrame = attacker.moveFrame) {
  const boxes = includeBaseHitbox ? [moveHitboxToWorldAabb(attacker, move.hitbox)] : [];
  return [...boxes, ...getActiveEffectHitboxes(attacker, move, moveFrame)];
}

function findFirstBoxOverlap(a: Aabb[], b: Aabb[]) {
  for (const first of a) {
    const second = b.find((box) => boxesIntersect(first, box));
    if (second) return [first, second] as const;
  }
  return null;
}

function getActiveEffectHitboxes(attacker: FighterRuntime, move: MoveDefinition, moveFrame = attacker.moveFrame) {
  const effects = attacker.character.effects ?? [];
  const library = new Map(effects.map((effect) => [effect.id, effect]));
  const totalFrames = Math.max(1, move.startupFrames + move.activeFrames + move.recoveryFrames);
  return getEffectMoveKeys(attacker, move)
    .flatMap((moveKey) => attacker.character.moveEffects?.[moveKey] ?? [])
    .filter((instance) => effectIsVisibleAt(instance, moveFrame, totalFrames))
    .filter((instance, index, all) => all.findIndex((candidate) => candidate.id === instance.id) === index)
    .flatMap((instance) => {
      const effect = library.get(instance.effectId);
      if (!effect) return [];
      const transform = effectTransformAt(effect, instance, moveFrame);
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

export function getFighterAnimationFrameSource(fighter: FighterRuntime) {
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
    key === 'backHopMovement' ? 'walkBack' : undefined,
    key === 'backHopMovement' ? 'jump' : undefined,
    key === 'backHopMovement' ? 'backHop' : undefined,
    key === 'backHopMovement' ? 'backflip' : undefined,
    key === 'backHop' ? 'backflip' : undefined,
    key === 'backflip' ? 'backHop' : undefined,
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
  if (fighter.state === 'jump' && fighter.backHopTotalFrames > 0) return 'backHopMovement';
  if (fighter.state === 'attack') return fighter.currentMove?.animationKey ?? resolveBaseAttackAnimationKey(fighter.character, fighter.currentMove?.input ?? 'jab');
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
  if (fighter.state === 'throwHold') return fighter.currentMove?.animationKey ?? resolveBaseAttackAnimationKey(fighter.character, fighter.currentMove?.input ?? 'jab');
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

function applyFighterDamage(fighter: FighterRuntime, damage: number) {
  if (damage <= 0) return;
  const previousHp = fighter.hp;
  fighter.hp = Math.max(0, fighter.hp - damage);
  if (fighter.hp < previousHp) fighter.tookDamageThisRound = true;
}

function getRoundFinishMessage(winner: FighterRuntime, loser: FighterRuntime) {
  return loser.hp <= 0 && winner.hp > 0 && !winner.tookDamageThisRound ? 'PERFECT' : 'K.O.';
}

function finishRound(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  const winner = p1.hp === p2.hp ? (p1.slot === 1 ? p1 : p2) : p1.hp > p2.hp ? p1 : p2;
  const loser = winner.slot === p1.slot ? p2 : p1;
  winner.roundsWon += 1;
  match.phase = 'roundOver';
  match.countdown = ROUND_OVER_DELAY;
  match.message = getRoundFinishMessage(winner, loser);
  match.clashState = createEmptyClashState();
  match.roundFinisher = null;
  match.visualTimeScale = KO_SLOWMO_TIME_SCALE;
  match.idleQuietFrames = 0;
  match.idleQuietLockFrames = 0;
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
    fighter.visualHitstop = createEmptyVisualHitstop();
    fighter.shadowClone = null;
    fighter.shadowCloneChargeConsumed = false;
    clearIdleFlourish(fighter);
    clearThrowRuntime(fighter);
  });
}

function beginRoundFinisher(
  match: MatchSnapshot,
  attacker: FighterRuntime,
  defender: FighterRuntime,
  impactId: number,
  impactPosition: [number, number, number]
) {
  if (isTrainingInfiniteHealthMode(match) && match.trainingInfiniteHealth) return false;
  if (match.phase === 'roundFinisher' || match.phase === 'roundOver' || match.phase === 'matchOver') return false;
  match.phase = 'roundFinisher';
  match.countdown = ROUND_FINISHER_SECONDS;
  match.message = '';
  match.clashState = createEmptyClashState();
  match.idleQuietFrames = 0;
  match.idleQuietLockFrames = 0;
  match.fighters.forEach(clearIdleFlourish);
  match.roundFinisher = {
    attackerSlot: attacker.slot,
    defenderSlot: defender.slot,
    impactId,
    impactPosition: [...impactPosition],
    duration: ROUND_FINISHER_SECONDS,
    elapsed: 0,
    cameraZoomScale: ROUND_FINISHER_CAMERA_ZOOM_SCALE
  };
  match.visualTimeScale = ROUND_FINISHER_TIME_SCALE;
  return true;
}

function updateRoundFinisher(match: MatchSnapshot, dt: number) {
  const finisher = match.roundFinisher;
  if (!finisher) {
    finishRound(match);
    return;
  }
  finisher.elapsed = Math.min(finisher.duration, finisher.elapsed + dt);
  match.countdown = Math.max(0, finisher.duration - finisher.elapsed);
  match.message = '';
  match.visualTimeScale = ROUND_FINISHER_TIME_SCALE;

  const scaledDt = dt * ROUND_FINISHER_TIME_SCALE;
  applyFighterStep(match, 0, emptyInputFrame(), scaledDt);
  applyFighterStep(match, 1, emptyInputFrame(), scaledDt);
  resolveFacing(match);
  resolveBodyCollision(match);
  constrainFightersToStageBounds(match);

  if (finisher.elapsed >= finisher.duration) {
    finishRound(match);
  }
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
  match.roundFinisher = null;
  match.visualTimeScale = 1;
  match.winnerSlot = null;
  match.idleQuietFrames = 0;
  match.idleQuietLockFrames = 0;
  match.fighters.forEach(clearIdleFlourish);
  defeated.forEach((fighter) => {
    fighter.hp = fighter.maxHp;
    fighter.tookDamageThisRound = false;
    fighter.visualHitstop = createEmptyVisualHitstop();
  });
}

function isTrainingInfiniteHealthMode(match: MatchSnapshot) {
  return match.mode === 'training' || match.mode === 'trainingOnline';
}

function beginRoundIntro(match: MatchSnapshot) {
  const totalIntroSeconds = getRoundIntroTotalSeconds(match.round);
  match.phase = 'intro';
  match.countdown = totalIntroSeconds;
  match.message = `ROUND ${match.round}`;
  match.clashState = createEmptyClashState();
  match.roundFinisher = null;
  match.visualTimeScale = 1;
  match.winnerSlot = null;
  match.idleQuietFrames = 0;
  match.idleQuietLockFrames = 0;
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
    fighter.visualHitstop = createEmptyVisualHitstop();
    fighter.shadowClone = null;
    fighter.shadowCloneChargeConsumed = false;
    clearIdleFlourish(fighter);
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
  match.roundFinisher = null;
  match.visualTimeScale = 1;
  match.idleQuietFrames = 0;
  match.idleQuietLockFrames = 0;
  if (match.introEnabled) beginRoundIntro(match);
}

function resolveFacing(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  resolveFighterFacing(match.stage, p1, p2);
  resolveFighterFacing(match.stage, p2, p1);
}

function resolveFighterFacing(stage: StageDefinition, fighter: FighterRuntime, opponent: FighterRuntime) {
  if (!isRecoverySideLocked(fighter)) {
    fighter.facing = getOpponentSideSign(fighter, opponent, stage);
  }
  fighter.facingYaw = getFacingYawTowardOpponent(fighter, opponent);
}

function updateControlSideSigns(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  updateControlSideSign(match.stage, p1, p2);
  updateControlSideSign(match.stage, p2, p1);
}

function updateControlSideSign(stage: StageDefinition, fighter: FighterRuntime, opponent: FighterRuntime) {
  if (isRecoverySideLocked(fighter)) return;
  if (isLaneOrbitActive(fighter)) return;
  fighter.controlSideSign = getPositionSideSign(fighter, opponent, stage) ?? fighter.controlSideSign;
}

function isLaneOrbitActive(fighter: FighterRuntime) {
  return fighter.laneOrbitControlLocked || fighter.sidestepTimer > 0 || fighter.sidestepRepeatGraceFrames > 0 || fighter.sidestepDirection !== 0;
}

function isRecoverySideLocked(fighter: FighterRuntime) {
  return fighter.state === 'knockdown' || fighter.state === 'getup' || fighter.getupStarted;
}

function maybeUnlockLaneOrbitControlAfterHorizontalCross(
  stage: StageDefinition,
  fighter: FighterRuntime,
  opponent: FighterRuntime,
  sideBeforeHorizontalMove: 1 | -1 | null
) {
  if (!fighter.laneOrbitControlLocked || sideBeforeHorizontalMove !== fighter.controlSideSign) return;
  const sideAfterHorizontalMove = getPositionSideSign(fighter, opponent, stage);
  if (sideAfterHorizontalMove !== null && sideAfterHorizontalMove !== fighter.controlSideSign) {
    fighter.laneOrbitControlLocked = false;
  }
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

function getBackHopTuning(fighter: FighterRuntime) {
  const globalScale = getCharacterGlobalScale(fighter.character);
  const size = clamp((globalScale.width + globalScale.height) / 2, BACK_HOP_MIN_SIZE, BACK_HOP_MAX_SIZE);
  const sizeRatio = (size - BACK_HOP_MIN_SIZE) / (BACK_HOP_MAX_SIZE - BACK_HOP_MIN_SIZE);
  const durationFrames = Math.max(1, Math.round(lerp(9, 15, sizeRatio)));
  return {
    durationFrames,
    distance: clamp(0.52 / Math.sqrt(size), 0.36, 0.68),
    jumpForce: fighter.character.stats.jumpForce * clamp(0.26 + size * 0.04, 0.28, 0.34)
  };
}

function startBackHop(fighter: FighterRuntime) {
  const tuning = getBackHopTuning(fighter);
  fighter.velocityY = tuning.jumpForce;
  fighter.position.y = Math.max(fighter.position.y, 0.12);
  fighter.state = 'jump';
  fighter.walkDirection = -1;
  fighter.backHopFrames = tuning.durationFrames;
  fighter.backHopTotalFrames = tuning.durationFrames;
  fighter.backHopCooldownFrames = BACK_HOP_COOLDOWN_FRAMES;
}

function applyBackHopMovement(fighter: FighterRuntime, opponent: FighterRuntime, frameDelta: number) {
  if (fighter.backHopFrames <= 0) return;
  const overlapFrames = Math.min(fighter.backHopFrames, Math.max(0, frameDelta));
  if (overlapFrames <= 0) return;
  const tuning = getBackHopTuning(fighter);
  moveAlongOpponentAxis(fighter, opponent, -(tuning.distance * overlapFrames) / tuning.durationFrames);
  fighter.backHopFrames = Math.max(0, fighter.backHopFrames - overlapFrames);
}

function clearBackHop(fighter: FighterRuntime) {
  fighter.backHopFrames = 0;
  fighter.backHopTotalFrames = 0;
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

type HorizontalControlIntent = {
  direction: -1 | 0 | 1;
  forward: boolean;
  back: boolean;
  neutral: boolean;
};

function resolveForwardInput(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame) {
  return resolveHorizontalIntent(fighter, opponent, input).direction;
}

function resolveHorizontalIntent(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame): HorizontalControlIntent {
  if (input.left === input.right) return { direction: 0, forward: false, back: false, neutral: true };
  const sideSign = getControlSideSign(fighter, opponent);
  const forward = sideSign > 0 ? input.right : input.left;
  const back = sideSign > 0 ? input.left : input.right;
  if (forward) return { direction: 1, forward: true, back: false, neutral: false };
  if (back) return { direction: -1, forward: false, back: true, neutral: false };
  return { direction: 0, forward: false, back: false, neutral: true };
}

function getOpponentSideSign(fighter: FighterRuntime, opponent: FighterRuntime, stage?: StageDefinition) {
  const sideSign = getPositionSideSign(fighter, opponent, stage);
  if (sideSign) return sideSign;
  return fighter.facing || 1;
}

function getPositionSideSign(fighter: FighterRuntime, opponent: FighterRuntime, stage?: StageDefinition): 1 | -1 | null {
  const sideDelta = getPositionSideDelta(fighter, opponent, stage);
  if (Math.abs(sideDelta) > 0.001) return sideDelta > 0 ? 1 : -1;
  return null;
}

function getPositionSideDelta(fighter: FighterRuntime, opponent: FighterRuntime, stage?: StageDefinition) {
  return getStageSideCoordinate(opponent.position, stage) - getStageSideCoordinate(fighter.position, stage);
}

function getStageSideCoordinate(position: { x: number; z: number }, stage?: StageDefinition) {
  const fightPlane = stage?.fightPlane;
  if (!fightPlane) return position.x;
  const rotationY = fightPlane.rotationY ?? 0;
  const center = fightPlane.center ?? [0, 0, 0];
  const dx = position.x - center[0];
  const dz = position.z - center[2];
  return dx * Math.cos(rotationY) - dz * Math.sin(rotationY);
}

function getControlSideSign(fighter: FighterRuntime, opponent: FighterRuntime, stage?: StageDefinition): 1 | -1 {
  return fighter.controlSideSign || getOpponentSideSign(fighter, opponent, stage);
}

function getFacingYawTowardOpponent(fighter: FighterRuntime, opponent: FighterRuntime) {
  return Math.atan2(opponent.position.x - fighter.position.x, opponent.position.z - fighter.position.z);
}

function moveAlongOpponentLateralAxis(
  fighter: FighterRuntime,
  opponent: FighterRuntime,
  laneDirection: -1 | 1,
  distance: number
) {
  const dx = opponent.position.x - fighter.position.x;
  const dz = opponent.position.z - fighter.position.z;
  const length = Math.hypot(dx, dz);
  const axisX = length > 0.001 ? dx / length : Math.sin(fighter.facingYaw);
  const axisZ = length > 0.001 ? dz / length : Math.cos(fighter.facingYaw);
  const signedDistance = -laneDirection * distance;
  fighter.position.x += axisZ * signedDistance;
  fighter.position.z -= axisX * signedDistance;
}

function keepFighterOnControlSide(stage: StageDefinition, fighter: FighterRuntime, opponent: FighterRuntime, side: 1 | -1) {
  const sideDelta = getPositionSideDelta(fighter, opponent, stage);
  if (sideDelta * side >= GETUP_SIDE_LOCK_MARGIN) return;
  const opponentSide = getStageSideCoordinate(opponent.position, stage);
  const fighterSide = getStageSideCoordinate(fighter.position, stage);
  const targetFighterSide = opponentSide - side * GETUP_SIDE_LOCK_MARGIN;
  shiftPositionAlongStageSideAxis(fighter.position, stage, targetFighterSide - fighterSide);
}

function shiftPositionAlongStageSideAxis(position: { x: number; z: number }, stage: StageDefinition, delta: number) {
  const rotationY = stage.fightPlane?.rotationY ?? 0;
  position.x += delta * Math.cos(rotationY);
  position.z -= delta * Math.sin(rotationY);
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
  const evadeRoll = (Math.sin(elapsed * (5.2 + style.tempo * 0.9 + roundStyle.tempo * 0.35) + ai.slot * 2.3 + opponent.hp * 0.015 + roundPhase * 0.55) + 1) / 2;
  const attackCycle = Math.max(0.12, (settings.attackCycle - profile.aggression * settings.aggressionCycleBonus) * style.attackCycleScale);
  const comboCycle = Math.max(0.1, settings.comboCycle * style.comboCycleScale);
  const attackPhase = positiveModulo(elapsed + ai.slot * 0.18 + style.attackPhaseOffset + roundStyle.attackPhaseOffset * 0.65, attackCycle);
  const comboPhase = positiveModulo(elapsed + ai.slot * 0.11 + style.comboPhaseOffset + roundStyle.comboPhaseOffset * 0.75, comboCycle);
  const selector = positiveModulo(Math.floor(elapsed * 1000) + ai.slot * 17 + Math.floor(ai.hp) + style.selectorJitter + roundStyle.selectorJitter, 100);
  const routeRoll = positiveModulo(Math.floor(elapsed * 760) + ai.slot * 29 + Math.floor(opponent.hp) + style.routeJitter + roundStyle.routeJitter, 100);
  if (ai.state === 'throwHold') {
    if (!ai.throwJabActive && ai.throwJabCooldownFrames === 0) {
      input.jab = true;
      (input as InputFrameWithMetadata).__pressedActions = ['jab'];
    }
    return input;
  }
  if (ai.state === 'throwHeld') {
    applyAiThrowEscapeInput(input, ai, opponent, difficulty, elapsed, roundAiSeed);
    return input;
  }
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
  const closeoutComboCapped = leaderCloseout && ai.comboTimer > 0 && ai.comboStep >= maxComboSteps;
  const selectedMoveReach = (selectedMove?.range ?? 1.35) + settings.rangeBuffer + (shouldContinueCombo ? 0.26 : 0);

  const opponentSide = getOpponentSideSign(ai, opponent, match.stage);
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
  const punishRhythmDrop = difficulty >= 5 && positiveModulo(selector + routeRoll * 3 + ai.slot * 17, 100) < 6;
  const punishAccepted = punishRoll < settings.punishResponse && !punishDropped && !punishRhythmDrop;
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

  const antiAirThreat = getAiAntiAirThreat(opponent, distance, laneDiff);
  if (antiAirThreat && canStartAction && canAct) {
    const antiAirMoveInput = chooseAiAntiAirMoveInput(ai, difficulty, antiAirThreat, selector, routeRoll);
    const antiAirMove = ai.character.moves.find((move) => move.input === antiAirMoveInput) ?? selectedMove;
    const antiAirReach = (antiAirMove?.range ?? 1.25) + settings.rangeBuffer + 0.38;
    const antiAirAccepted = shouldAiAntiAir(ai, opponent, difficulty, antiAirThreat, elapsed, selector, routeRoll, roundAiSeed);
    const antiAirInRange = distance <= antiAirReach && Math.abs(laneDiff) <= antiAirReach * 0.82;
    if (antiAirAccepted && antiAirInRange && !tooClose) {
      input.block = false;
      input.charge = false;
      input.down = false;
      input.up = false;
      input[awayKey] = false;
      input[towardKey] = distance > antiAirReach * 0.72;
      input.sidestepUp = false;
      input.sidestepDown = false;
      input.sidewalkUp = false;
      input.sidewalkDown = false;
      input[antiAirMoveInput] = true;
      return input;
    }
    if (antiAirAccepted && distance < antiAirReach + 0.7) {
      input.block = false;
      input[awayKey] = false;
      input[towardKey] = distance > antiAirReach * 0.62;
      input.sidestepUp = false;
      input.sidestepDown = false;
      input.sidewalkUp = false;
      input.sidewalkDown = false;
      return input;
    }
  }

  const opening = getAiOpening(ai, opponent, distance, laneDiff);
  const routeOpening = opening.kind === 'hitstun' && opponent.state === 'juggle' ? 'juggle' : opening.kind;
  if (routeOpening === 'juggle' && shouldCpuDropJuggle(ai, opponent, difficulty)) {
    beginAiJuggleLockout(ai);
    input.block = false;
    input.charge = false;
    for (const moveInput of moveInputs) input[moveInput] = false;
    return input;
  }
  const catalogRoute = routeOpening === 'none'
    ? null
    : recommendCpuComboRoute(ai.character, {
        difficulty,
        opening: routeOpening,
        remainingFrames: opening.frames,
        comboStep: ai.comboStep,
        leaderCloseout,
        usedKeys: ai.aiRecentComboKeys,
        usedFamilies: ai.aiRecentComboFamilies,
        usedVisualFamilies: ai.aiRecentComboVisualFamilies,
        activeRouteId: ai.aiActiveComboRouteId,
        availableKi: ai.ki,
        selector,
        routeRoll
      });
  rememberAiCatalogRecommendation(ai, catalogRoute, routeOpening !== 'none');
  const pressureRoll = positiveModulo(selector * 3 + routeRoll + ai.slot * 19 + Math.floor(opponent.hp), 100) / 100;
  const pressureDropped = aiDecisionRoll(ai, opponent, elapsed, 4, roundAiSeed) < settings.pressureDropRate * style.imperfectionScale;
  const pressureAccepted =
    !pressureDropped &&
    pressureRoll < Math.max(0.04, getAdjustedPressureResponse(ai, opening, settings, pressureRoll) - settings.leaderPressurePenalty * leaderBrake * 0.55);
  let pressureMoveInput = chooseAiPressureMoveInput(ai, opponent, difficulty, opening, selector, routeRoll);
  const pressureCatalogCandidate = catalogRoute && opening.kind !== 'none' && isAiCatalogStepSpendable(ai, catalogRoute.step) ? catalogRoute.step : null;
  const pressureCatalogStep = pressureCatalogCandidate && !isAiCatalogStepStaleInCombo(ai, pressureCatalogCandidate) ? pressureCatalogCandidate : null;
  if (pressureCatalogCandidate && !pressureCatalogStep) ai.aiActiveComboRouteId = null;
  if (pressureCatalogStep) pressureMoveInput = pressureCatalogStep.input;
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
  if (!closeoutComboCapped && opening.kind !== 'none' && pressureAccepted && canStartAction && canAct && pressureInRange && !tooClose) {
    if (
      isAiComboContinuationInputStale(ai, pressureMoveInput)
    ) {
      if (opponent.state === 'juggle') beginAiJuggleLockout(ai);
      else ai.aiActiveComboRouteId = null;
      input.block = false;
      input[awayKey] = false;
      input[towardKey] = distance > pressureReach * 0.78;
      input.sidestepUp = false;
      input.sidestepDown = false;
      input.sidewalkUp = false;
      input.sidewalkDown = false;
      return input;
    }
    const pressureCatalogLaunchStyle = pressureCatalogStep ? catalogRoute?.route.launchRouteStyle : undefined;
    const pressureShouldAirChase =
      opening.kind === 'hitstun' &&
      opponent.state === 'juggle' &&
      pressureCatalogLaunchStyle !== 'grounded' &&
      Boolean(pressureCatalogStep && pressureCatalogLaunchStyle);
    if (!pressureCrouchInput && shouldAiJumpBeforeAttack(ai, opponent, pressureMove, pressureShouldAirChase)) {
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
    } else if (pressureCatalogStep && !pressureKiBurst) {
      applyAiCatalogRouteStep(ai, input, pressureCatalogStep, towardKey, awayKey);
    } else {
      input.charge = pressureKiBurst;
      input[pressureMoveInput] = true;
    }
    return input;
  }
  if (!closeoutComboCapped && opening.kind !== 'none' && pressureAccepted && canStartAction && canAct && distance < pressureReach + 0.88) {
    input.block = false;
    input[awayKey] = false;
    input[towardKey] = true;
    return input;
  }
  const missedKnownOpening = opening.kind !== 'none' && canStartAction && canAct && !pressureAccepted;

  const defensiveSidestep = chooseAiDefensiveSidestep(ai, opponent, difficulty, danger, isIncomingSoon, distance, laneDiff, evadeRoll);
  if (defensiveSidestep !== 'none' && canStartAction && canAct) {
    input.block = false;
    input.down = false;
    input[awayKey] = false;
    input[towardKey] = false;
    input.sidestepUp = defensiveSidestep === 'sidestepUp';
    input.sidestepDown = defensiveSidestep === 'sidestepDown';
    input.sidewalkUp = false;
    input.sidewalkDown = false;
    return input;
  }

  const guardPosture = chooseAiGuardPosture(ai, opponent, difficulty, danger, isIncomingSoon, blockRoll, profile.guard + settings.guardBonus + style.guardBias + leaderBrake * 0.04);
  if (guardPosture !== 'none') {
    input.block = guardPosture === 'standBlock' || guardPosture === 'crouchBlock';
    input.down = guardPosture === 'crouchBlock' || guardPosture === 'duck';
    input[awayKey] = guardPosture === 'standBlock' || guardPosture === 'crouchBlock';
    input[towardKey] = false;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
  }

  const inStrikeRange = distance <= selectedMoveReach && Math.abs(laneDiff) <= selectedMoveReach * 0.82;
  const attackHesitation = canMakeAiDecisionMistake(ai) && aiDecisionRoll(ai, opponent, elapsed, 5, roundAiSeed) < settings.attackHesitationRate * style.imperfectionScale;
  const canPressure = !closeoutComboCapped && !missedKnownOpening && !attackHesitation && !input.block && canAct && inStrikeRange && !tooClose;
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
    const neutralCatalogCandidate = opening.kind === 'none' && !leaderCloseout
      ? recommendCpuComboRoute(ai.character, {
          difficulty,
          opening: 'neutral',
          remainingFrames: 0,
          comboStep: ai.comboStep,
          leaderCloseout,
          usedKeys: ai.aiRecentComboKeys,
          usedFamilies: ai.aiRecentComboFamilies,
          usedVisualFamilies: ai.aiRecentComboVisualFamilies,
          activeRouteId: ai.aiActiveComboRouteId,
          availableKi: ai.ki,
          selector: selector + 41,
          routeRoll: routeRoll + 29
        })
      : null;
    const neutralCatalogRoute = neutralCatalogCandidate && isAiCatalogStepSpendable(ai, neutralCatalogCandidate.step) ? neutralCatalogCandidate : null;
    rememberAiCatalogRecommendation(ai, neutralCatalogRoute, Boolean(neutralCatalogCandidate));
    if (neutralCatalogRoute) selectedMoveInput = neutralCatalogRoute.input;
    if (!leaderCloseout && !neutralCatalogRoute) {
      applyAiRoute(ai, input, towardKey, awayKey, difficulty, ai.comboStep, selector, routeRoll);
    }
    selectedMoveInput = chooseAiKiBurstMoveInput(ai, selectedMoveInput, difficulty, selector + 31, routeRoll + 37);
    const crouchInput = leaderCloseout ? null : chooseAiFullCrouchMoveInput(ai, selectedMoveInput, difficulty, selector + 47, routeRoll + 53, shouldContinueCombo ? 'pressure' : 'neutral');
    if (crouchInput) {
      if (isAiComboContinuationInputStale(ai, crouchInput)) {
        if (opponent.state === 'juggle') beginAiJuggleLockout(ai);
        else ai.aiActiveComboRouteId = null;
        input[towardKey] = distance > selectedMoveReach * 0.78;
        input[awayKey] = false;
        return input;
      }
      selectedMoveInput = crouchInput;
      applyAiFullCrouchAttack(input, selectedMoveInput, towardKey, awayKey);
    } else {
      if (
        (neutralCatalogRoute && isAiCatalogStepStaleInCombo(ai, neutralCatalogRoute.step)) ||
        (shouldContinueCombo && isAiComboContinuationInputStale(ai, selectedMoveInput))
      ) {
        if (opponent.state === 'juggle') beginAiJuggleLockout(ai);
        else ai.aiActiveComboRouteId = null;
        input[towardKey] = distance > selectedMoveReach * 0.78;
        input[awayKey] = false;
        return input;
      }
      const attackMove = ai.character.moves.find((move) => move.input === selectedMoveInput) ?? selectedMove;
      const neutralShouldAirChase =
        shouldContinueCombo &&
        opponent.state === 'juggle' &&
        neutralCatalogRoute?.route.launchRouteStyle !== 'grounded' &&
        Boolean(neutralCatalogRoute?.route.launchRouteStyle);
      if (shouldAiJumpBeforeAttack(ai, opponent, attackMove, neutralShouldAirChase)) {
        applyAiJumpTakeoff(input, towardKey, awayKey);
        return input;
      }
      input.charge = shouldAiUseKiBurst(ai, opponent, selectedMoveInput, difficulty, shouldContinueCombo ? 'pressure' : 'neutral', selector + 29, routeRoll + 41, leaderCloseout);
      if (neutralCatalogRoute && isAiCatalogStepSpendable(ai, neutralCatalogRoute.step) && !input.charge) {
        applyAiCatalogRouteStep(ai, input, neutralCatalogRoute.step, towardKey, awayKey);
      } else {
        input[selectedMoveInput] = true;
      }
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

function applyAiThrowEscapeInput(input: InputFrame, ai: FighterRuntime, opponent: FighterRuntime, difficulty: CpuDifficulty, elapsed: number, roundAiSeed: number) {
  if (ai.throwEscapeGoal <= 0 || ai.throwEscapeProgress >= ai.throwEscapeGoal) return;
  const progressRatio = clamp(ai.throwEscapeProgress / Math.max(1, ai.throwEscapeGoal), 0, 1);
  const urgency = opponent.throwJabActive || opponent.throwJabCooldownFrames > 0 ? 0.18 : 0;
  const comeback = progressRatio < 0.35 ? 0.08 : 0;
  const chance = difficulty <= 1
    ? 0.24
    : difficulty === 2
      ? 0.38
      : difficulty === 3
        ? 0.58
        : difficulty === 4
          ? 0.76
          : 0.94;
  const escapeRoll = aiDecisionRoll(ai, opponent, elapsed, 31 + ai.throwEscapeProgress, roundAiSeed);
  if (escapeRoll >= Math.min(0.98, chance + urgency + comeback)) return;

  const buttons: MoveInput[] = ['jab', 'kick', 'heavy', 'special'];
  const index = positiveModulo(Math.floor(elapsed * 60) + ai.slot * 5 + ai.throwEscapeProgress * 2 + Math.floor(ai.hp), buttons.length);
  const button = buttons[index];
  input[button] = true;
  (input as InputFrameWithMetadata).__pressedActions = [button];
}

type AiAntiAirThreat = {
  activeAttack: boolean;
  airborneHeight: number;
  pressureFrames: number;
};

function getAiAntiAirThreat(opponent: FighterRuntime, distance: number, laneDiff: number): AiAntiAirThreat | null {
  if (opponent.state === 'hit' || opponent.state === 'juggle' || opponent.state === 'knockdown' || opponent.state === 'getup') return null;
  if (opponent.stunFramesRemaining > 0 || opponent.blockstunFramesRemaining > 0 || opponent.getupInvulnerableFrames > 0) return null;
  if (!isAirborne(opponent)) return null;
  if (distance > 2.55 || Math.abs(laneDiff) > 1.05) return null;
  const activeAttack = opponent.state === 'attack' && Boolean(opponent.currentMove);
  if (opponent.state !== 'jump' && !activeAttack) return null;
  const pressureFrames = activeAttack && opponent.currentMove
    ? Math.max(0, opponent.currentMove.startupFrames + opponent.currentMove.activeFrames - opponent.moveFrame)
    : Math.max(0, Math.round((opponent.position.y + Math.max(0, opponent.velocityY)) * 10));
  return {
    activeAttack,
    airborneHeight: Math.max(0, opponent.position.y),
    pressureFrames
  };
}

function chooseAiAntiAirMoveInput(ai: FighterRuntime, difficulty: CpuDifficulty, threat: AiAntiAirThreat, selector: number, routeRoll: number): MoveInput {
  const moves = ai.character.moves
    .filter((move, index, allMoves) => move.damage > 0 && allMoves.findIndex((candidate) => candidate.input === move.input) === index);
  const candidates = moves.filter((move) => move.hitLevel !== 'low');
  const pool = candidates.length > 0 ? candidates : moves;
  if (pool.length === 0) return 'jab';
  const scored = pool.map((move, index) => {
    const verticalReach = move.hitbox.offset[1] + move.hitbox.size[1] * 0.5;
    const activeBonus = threat.activeAttack && move.counterHit ? (difficulty >= 4 ? 1.15 : 0.52) : 0;
    const launchBonus = (move.launchHeight ?? 0) > 0 ? (difficulty >= 4 ? 0.7 : 0.34) : 0;
    const knockdownBonus = move.knockdown ? 0.34 : 0;
    const freshness = inputRecentlyUsed(ai, move.input) ? -0.35 : 0;
    const wave = positiveModulo(selector + routeRoll * (index + 5) + ai.slot * 19 + move.input.length * 13, 100) / 100;
    return {
      input: move.input,
      score:
        activeBonus +
        launchBonus +
        knockdownBonus +
        Math.min(1.1, verticalReach * 0.48) +
        Math.min(0.65, move.range * 0.16) -
        move.startupFrames * 0.032 +
        freshness +
        wave * 0.18
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.input ?? pool[0]?.input ?? 'jab';
}

function shouldAiAntiAir(
  ai: FighterRuntime,
  opponent: FighterRuntime,
  difficulty: CpuDifficulty,
  threat: AiAntiAirThreat,
  elapsed: number,
  selector: number,
  routeRoll: number,
  roundAiSeed: number
) {
  const baseChance = difficulty <= 1 ? 0.1 : difficulty === 2 ? 0.22 : difficulty === 3 ? 0.42 : difficulty === 4 ? 0.68 : 0.86;
  const activeBonus = threat.activeAttack ? 0.1 : 0;
  const heightBonus = clamp((threat.airborneHeight - 0.25) / 1.3, 0, 0.1);
  const urgencyBonus = threat.pressureFrames > 0 && threat.pressureFrames <= 18 ? 0.06 : 0;
  const chance = clamp(baseChance + activeBonus + heightBonus + urgencyBonus, 0.05, 0.94);
  const roll = positiveModulo(
    Math.floor(aiDecisionRoll(ai, opponent, elapsed, 14, roundAiSeed) * 1000) + selector * 3 + routeRoll * 5 + ai.slot * 11,
    100
  ) / 100;
  return roll < chance;
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
    const comboPenalty = comboRepeat ? 1.8 : 0;
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

  const fresh = sorted.find((move) => !inputRecentlyUsed(ai, move.input) && !inputAlreadyUsedInCombo(ai, move.input));
  return fresh?.input ?? sorted.find((move) => !inputRecentlyUsed(ai, move.input))?.input ?? sorted[0]?.input ?? 'jab';
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
  return fresh?.input ?? null;
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
    const freshness = inputRecentlyUsed(ai, input) ? -0.42 : 0;
    const repeatPenalty = inputAlreadyUsedInCombo(ai, input) ? -0.9 : 0;
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
  if (leaderCloseout) return false;
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
  const authoredBonus = hasAuthoredKiRoute ? 0.18 : 0;
  const powerBonus = isPowerMove ? 0.08 : 0;
  const chance = clamp(difficultyChance + contextBonus + kiOverflowBonus + behindBonus + authoredBonus + powerBonus, 0.02, 0.88);
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
  if (hasAuthoredKiAbility && !alreadyReady && difficulty >= 4 && distance > 1.9) return true;

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
    const stalePenalty = inputRecentlyUsed(ai, input) ? 0.48 : 0;
    const comboPenalty = inputAlreadyUsedInCombo(ai, input) ? 0.9 : 0;
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

function applyAiCatalogRouteStep(ai: FighterRuntime, input: InputFrame, step: ComboTrialStep, towardKey: 'left' | 'right', awayKey: 'left' | 'right') {
  input.block = false;
  input.charge = false;
  input.up = false;
  input.down = false;
  input[towardKey] = false;
  input[awayKey] = false;
  input.sidestepUp = false;
  input.sidestepDown = false;
  input.sidewalkUp = false;
  input.sidewalkDown = false;

  const command = step.command ?? '';
  const family = commandRouteFamily(command);
  const [prefix = ''] = command.split('+');
  if (family === 'ki') input.charge = true;
  if (family === 'crouch') input.down = true;
  if (family === 'sidestep' && !command.startsWith('SSR+')) input.sidestepUp = true;
  if (command.startsWith('SSR+')) input.sidestepDown = true;
  if (family === 'motion') seedAiMotionCommandHistory(ai, command);
  if (family === 'motion') {
    input.down = /^(qcf|qcb|hcf|hcb|dp|rdp|cd)\+/.test(command);
    if (/^(qcb|hcb|rdp|b,b)\+/.test(command)) input[awayKey] = true;
    else input[towardKey] = true;
  }
  if (prefix.includes('f')) input[towardKey] = true;
  if (prefix.includes('b')) input[awayKey] = true;
  if (prefix.includes('d')) input.down = true;
  if (prefix.includes('u')) input.up = true;

  const buttons = command.match(/[1-4]/g) ?? [];
  if (buttons.length === 0) {
    input[step.input] = true;
    return;
  }
  for (const button of buttons) {
    input[buttonToInput[button] ?? step.input] = true;
  }
}

function seedAiMotionCommandHistory(ai: FighterRuntime, command: string) {
  const sequence =
    command.startsWith('qcf+') ? ['d', 'd/f', 'f'] :
    command.startsWith('qcb+') ? ['d', 'd/b', 'b'] :
    command.startsWith('hcf+') ? ['b', 'd/b', 'd', 'd/f', 'f'] :
    command.startsWith('hcb+') ? ['f', 'd/f', 'd', 'd/b', 'b'] :
    command.startsWith('dp+') ? ['f', 'd', 'd/f'] :
    command.startsWith('rdp+') ? ['b', 'd', 'd/b'] :
    command.startsWith('cd+') ? ['d', 'd/f'] :
    command.startsWith('WR+') || command.startsWith('iWR+') || command.startsWith('f,f+') ? ['f', 'f'] :
    command.startsWith('b,b+') ? ['b', 'b'] :
    [];
  if (sequence.length === 0) return;
  ai.commandHistory = sequence.map((token, index) => ({ token, age: (sequence.length - index) * 0.016 }));
  ai.previousDirectionToken = sequence[sequence.length - 1] ?? ai.previousDirectionToken;
}

function rememberAiCatalogRecommendation(ai: FighterRuntime, recommendation: CpuRouteRecommendation | null, routeWindowOpen: boolean) {
  if (recommendation) {
    ai.aiActiveComboRouteId = recommendation.route.id;
  } else if (routeWindowOpen) {
    ai.aiActiveComboRouteId = null;
  }
}

function isAiCatalogStepSpendable(ai: FighterRuntime, step: ComboTrialStep) {
  return !step.command?.startsWith('O+') || ai.ki >= KI_BURST_COST;
}

function isAiCatalogStepStaleInCombo(ai: FighterRuntime, step: ComboTrialStep) {
  if (ai.comboTimer <= 0 && ai.comboHits <= 0 && ai.comboStep <= 0) return false;
  const identity = cpuMoveIdentityKeyFromStep(step);
  const family = cpuMoveFamilyKeyFromStep(step);
  const visualFamily = cpuMoveVisualFamilyKeyFromStep(step);
  return (
    ai.comboUsedKeys.includes(identity) ||
    ai.comboIdentitySequence.includes(identity) ||
    ai.comboFamilySequence.includes(family) ||
    ai.comboVisualFamilySequence.includes(visualFamily)
  );
}

function isAiComboContinuationInputStale(ai: FighterRuntime, input: MoveInput) {
  if (ai.comboTimer <= 0 && ai.comboHits <= 0 && ai.comboStep <= 0) return false;
  return inputAlreadyUsedInCombo(ai, input) || ai.comboSequence.includes(input);
}

function inputAlreadyUsedInCombo(ai: FighterRuntime, input: MoveInput) {
  const family = cpuMoveFamilyKeyFromMove({ input });
  const visualFamily = cpuMoveVisualFamilyKeyFromMove({ input });
  return (
    ai.comboFamilySequence.includes(family) ||
    ai.comboVisualFamilySequence.includes(visualFamily) ||
    ai.comboUsedKeys.some((key) => key.endsWith(`:${input}`) || key.includes(`:${input}-`) || key.endsWith(`+${inputToButton[input]}`))
  );
}

function inputRecentlyUsed(ai: FighterRuntime, input: MoveInput) {
  const family = cpuMoveFamilyKeyFromMove({ input });
  const visualFamily = cpuMoveVisualFamilyKeyFromMove({ input });
  return (
    ai.aiRecentComboFamilies.includes(family) ||
    ai.aiRecentComboVisualFamilies.includes(visualFamily) ||
    ai.aiRecentComboKeys.some((key) => key.endsWith(`:${input}`) || key.includes(`:${input}-`) || key.endsWith(`+${inputToButton[input]}`))
  );
}

function routeRecentlyUsed(ai: FighterRuntime, route: string) {
  return ai.aiRecentComboKeys.some((key) => key.startsWith(`${route}:`) || key.startsWith(`${route}-`) || key.includes(`cmd:${route}`));
}

function getCpuJuggleStepBudget(difficulty: CpuDifficulty) {
  if (difficulty <= 1) return 3;
  if (difficulty === 2) return 4;
  if (difficulty === 3) return 7;
  if (difficulty === 4) return 10;
  return 12;
}

function shouldCpuDropJuggle(ai: FighterRuntime, opponent: FighterRuntime, difficulty: CpuDifficulty) {
  if (opponent.state !== 'juggle') return false;
  if (ai.aiJuggleLockoutFrames > 0) return true;
  const budget = getCpuJuggleStepBudget(difficulty);
  return ai.comboStep >= budget || ai.comboHits >= budget;
}

function beginAiJuggleLockout(ai: FighterRuntime) {
  ai.aiActiveComboRouteId = null;
  ai.aiJuggleLockoutFrames = Math.max(ai.aiJuggleLockoutFrames, AI_JUGGLE_LOCKOUT_FRAMES);
}

type AiGuardPosture = 'standBlock' | 'crouchBlock' | 'duck' | 'none';
type AiDefensiveSidestep = 'sidestepUp' | 'sidestepDown' | 'none';

function chooseAiDefensiveSidestep(
  ai: FighterRuntime,
  opponent: FighterRuntime,
  difficulty: CpuDifficulty,
  danger: boolean,
  isIncomingSoon: boolean,
  distance: number,
  laneDiff: number,
  evadeRoll: number
): AiDefensiveSidestep {
  if (!danger || difficulty <= 1) return 'none';
  if (!isIncomingSoon && difficulty < 4) return 'none';
  if (Math.abs(laneDiff) > 0.34) return 'none';
  const move = opponent.currentMove;
  if (!move) return 'none';
  if (move.hitLevel === 'low') return 'none';
  if (move.tracking === 'homing' || move.tracking === 'strong') return 'none';

  const trackingScale = move.tracking === 'none'
    ? 1
    : move.tracking === 'weakLeft' || move.tracking === 'weakRight'
      ? 0.66
      : 0.28;
  const hitLevelScale = move.hitLevel === 'mid' || move.hitLevel === 'high'
    ? 1
    : move.hitLevel === 'throw'
      ? 0.82
      : 0.58;
  const timingScale = isIncomingSoon ? 1 : 0.62;
  const rangeScale = distance <= (move.range ?? 1.4) + 0.42 ? 1 : 0.72;
  const difficultyChance = difficulty === 2 ? 0.18 : difficulty === 3 ? 0.3 : difficulty === 4 ? 0.44 : 0.58;
  const sidestepChance = difficultyChance * trackingScale * hitLevelScale * timingScale * rangeScale;
  if (evadeRoll >= sidestepChance) return 'none';

  if (move.tracking === 'weakLeft') return 'sidestepUp';
  if (move.tracking === 'weakRight') return 'sidestepDown';
  const directionRoll = positiveModulo(Math.floor(evadeRoll * 1000) + ai.slot * 31 + opponent.moveFrame * 7 + Math.floor(opponent.hp), 100);
  return directionRoll < 50 ? 'sidestepUp' : 'sidestepDown';
}

function chooseAiGuardPosture(
  ai: FighterRuntime,
  opponent: FighterRuntime,
  difficulty: CpuDifficulty,
  danger: boolean,
  isIncomingSoon: boolean,
  guardRoll: number,
  guardChanceBase: number
): AiGuardPosture {
  if (!danger) return 'none';
  if (difficulty < 3 && !isIncomingSoon) return 'none';
  const guardChance = Math.min(0.9, Math.max(0.05, guardChanceBase));
  if (guardRoll >= guardChance) return 'none';

  const move = opponent.currentMove;
  const hitLevel = move?.hitLevel ?? 'mid';
  const postureRoll = positiveModulo(Math.floor(guardRoll * 1000) + ai.slot * 23 + opponent.moveFrame * 17 + Math.floor(ai.hp), 100) / 100;
  const lowGuardChance = difficulty <= 1 ? 0.18 : difficulty === 2 ? 0.32 : difficulty === 3 ? 0.55 : difficulty === 4 ? 0.74 : 0.86;
  const specialLowGuardChance = difficulty <= 1 ? 0.12 : difficulty === 2 ? 0.24 : difficulty === 3 ? 0.42 : difficulty === 4 ? 0.62 : 0.72;
  const highDuckChance = difficulty <= 1 ? 0.02 : difficulty === 2 ? 0.08 : difficulty === 3 ? 0.16 : difficulty === 4 ? 0.28 : 0.38;
  const throwDuckChance = difficulty <= 1 ? 0.06 : difficulty === 2 ? 0.14 : difficulty === 3 ? 0.28 : difficulty === 4 ? 0.44 : 0.58;

  if (hitLevel === 'low') return postureRoll < lowGuardChance ? 'crouchBlock' : 'standBlock';
  if (hitLevel === 'special') return postureRoll < specialLowGuardChance ? 'crouchBlock' : 'standBlock';
  if (hitLevel === 'high') return postureRoll < highDuckChance ? 'duck' : 'standBlock';
  if (hitLevel === 'throw') return postureRoll < throwDuckChance ? 'duck' : 'standBlock';
  return 'standBlock';
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
      if (fighter.backHopTotalFrames > 0) clearBackHop(fighter);
      if (fighter.state === 'jump') fighter.state = 'idle';
      return wasAirborne;
    }
  }
  return false;
}

export function cloneMatchSnapshot(match: MatchSnapshot): MatchSnapshot {
  return {
    ...match,
    roster: [...match.roster],
    stage: { ...match.stage },
    trainingDummyInput: match.trainingDummyInput ? cloneInputFrame(match.trainingDummyInput) : null,
    combatEvents: [...match.combatEvents],
    impactEvents: [...match.impactEvents],
    clashState: cloneClashState(match.clashState),
    roundFinisher: match.roundFinisher
      ? {
          ...match.roundFinisher,
          impactPosition: [...match.roundFinisher.impactPosition]
        }
      : null,
    fighters: match.fighters.map((fighter) => ({
      ...fighter,
      character: fighter.character,
      baseCharacter: fighter.baseCharacter,
      position: { ...fighter.position },
      currentMove: fighter.currentMove,
      commandHistory: fighter.commandHistory.map((entry) => ({ ...entry })),
      comboSequence: [...fighter.comboSequence],
      comboIdentitySequence: [...fighter.comboIdentitySequence],
      comboFamilySequence: [...fighter.comboFamilySequence],
      comboVisualFamilySequence: [...fighter.comboVisualFamilySequence],
      comboUsedKeys: [...fighter.comboUsedKeys],
      aiRecentComboKeys: [...fighter.aiRecentComboKeys],
      aiRecentComboFamilies: [...fighter.aiRecentComboFamilies],
      aiRecentComboVisualFamilies: [...fighter.aiRecentComboVisualFamilies],
      aiActiveComboRouteId: fighter.aiActiveComboRouteId,
      aiJuggleLockoutFrames: fighter.aiJuggleLockoutFrames,
      previousAttackInputs: { ...fighter.previousAttackInputs },
      visualHitstop: { ...fighter.visualHitstop },
      bufferedMoveIntent: fighter.bufferedMoveIntent
        ? {
            ...fighter.bufferedMoveIntent,
            inputSnapshot: cloneInputFrame(fighter.bufferedMoveIntent.inputSnapshot)
          }
        : null,
      shadowClone: fighter.shadowClone
        ? {
            ...fighter.shadowClone,
            position: { ...fighter.shadowClone.position },
            visualHitstop: { ...fighter.shadowClone.visualHitstop },
            currentMove: fighter.shadowClone.currentMove
          }
        : null
    })) as [FighterRuntime, FighterRuntime]
  };
}

const cloneMatch = cloneMatchSnapshot;

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
