import type {
  BoxSpec,
  CharacterDefinition,
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
  StageDefinition
} from '../types';
import { ROUNDS_TO_WIN, emptyInputFrame } from '../types';

const ARENA_LIMIT_X = 18;
const ARENA_LIMIT_Z = 9;
const ROUND_TIME = 60;
const START_DISTANCE = 2.6;
const ROUND_OVER_DELAY = 2.1;
const KO_SLOWMO_SECONDS = 0.8;
const KO_SLOWMO_TIME_SCALE = 0.24;
const ROUND_INTRO_ENTRY_SECONDS = 1.2;
const ROUND_INTRO_ROUND_SECONDS = 0.95;
const ROUND_INTRO_FIGHT_SECONDS = 0.65;
const ROUND_INTRO_TOTAL_SECONDS = ROUND_INTRO_ENTRY_SECONDS + ROUND_INTRO_ROUND_SECONDS + ROUND_INTRO_FIGHT_SECONDS;
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
const AI_RECENT_MEMORY_LIMIT = 12;
const DEFAULT_WHIFF_RECOVERY_FRAMES = 4;
const BLOCKER_MIN_ADVANTAGE_FRAMES = 3;
const BLOCK_PUNISH_BUFFER_FRAMES = 12;
const PRESSURE_LANE_TOLERANCE = 0.82;
const AI_DECISION_BUCKETS_PER_SECOND = 4;
const AI_SEED_MODULUS = 1_000_000;
const KI_MAX = 100;
const KI_CHARGE_PER_SECOND = 28;
const KI_HIT_GAIN = 9;
const KI_BLOCK_GAIN = 4;
const KI_DEFENDER_BLOCK_GAIN = 5;
const KI_BURST_COST = 30;
const ATTACK_BUFFER_FRAMES = 16;
const MAX_COMBO_STEPS = 6;
const KI_CHARGE_DEFAULT_STARTUP_FRAMES = 14;
const KI_CHARGE_DEFAULT_ACTIVE_FRAMES = 18;
const KI_CHARGE_DEFAULT_RECOVERY_FRAMES = 16;

const moveInputs: MoveInput[] = ['special', 'heavy', 'kick', 'jab'];
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
  const roundTime = clamp(Math.round(options.roundTime ?? ROUND_TIME), 30, 99);
  const aiSeed = normalizeAiSeed(options.aiSeed);
  const match: MatchSnapshot = {
    fighters: [createFighter(1, p1, -START_DISTANCE / 2), createFighter(2, p2, START_DISTANCE / 2)],
    stage,
    mode,
    cpuDifficulty,
    aiSeed,
    roundAiSeed: makeRoundAiSeed(aiSeed, 1),
    roundTime,
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

  const input1 = next.mode === 'cpu' ? makeAiInput(next.fighters[0], next.fighters[1], next.timer, next.cpuDifficulty, true, next.aiSeed, next.roundAiSeed) : p1Input;
  const input2 =
    next.mode === 'training'
      ? emptyInputFrame()
      : next.mode === 'ai' || next.mode === 'cpu'
        ? makeAiInput(next.fighters[1], next.fighters[0], next.timer, next.cpuDifficulty, next.mode === 'cpu', next.aiSeed, next.roundAiSeed)
        : p2Input;
  applyFighterStep(next, 0, input1, dt);
  applyFighterStep(next, 1, input2, dt);
  resolveFacing(next);
  resolveBodyCollision(next);
  resolveHits(next);

  next.timer = next.mode === 'training' && next.trainingInfiniteHealth ? next.roundTime : Math.max(0, next.timer - dt);
  const ko = next.fighters.find((fighter) => fighter.hp <= 0);
  if (next.mode === 'training' && next.trainingInfiniteHealth) {
    refillTrainingHealth(next);
  } else if (ko || next.timer <= 0) {
    finishRound(next);
  }

  return next;
}

export function createEmptyInputs(): [InputFrame, InputFrame] {
  return [emptyInputFrame(), emptyInputFrame()];
}

function createFighter(slot: 1 | 2, character: CharacterDefinition, x: number): FighterRuntime {
  return {
    slot,
    character,
    hp: character.stats.health,
    ki: 0,
    position: { x, y: 0, z: 0 },
    velocityY: 0,
    facing: slot === 1 ? 1 : -1,
    facingYaw: slot === 1 ? Math.PI / 2 : -Math.PI / 2,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
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
    getupInvulnerableFrames: 0,
    getupForward: 0,
    getupLane: 0,
    getupStarted: false,
    juggleDamage: 0,
    juggleSequenceDamage: 0,
    juggleTornadoCount: 0,
    juggleGravityScale: JUGGLE_GRAVITY_SCALE,
    blockFlash: 0,
    hitFlash: 0
  };
}

function applyFighterStep(match: MatchSnapshot, fighterIndex: 0 | 1, input: InputFrame, dt: number) {
  const fighter = match.fighters[fighterIndex];
  const opponent = match.fighters[fighterIndex === 0 ? 1 : 0];
  const jumpPressed = input.up && !fighter.jumpInputHeld;
  const frameDelta = secondsToFrames(dt);
  fighter.jumpInputHeld = input.up;
  fighter.blockFlash = 0;
  fighter.hitFlash = 0;
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
  fighter.getupInvulnerableFrames = Math.max(0, fighter.getupInvulnerableFrames - frameDelta);
  updateCommandHistory(fighter, opponent, input, dt);
  const freshMoveInput = getFreshMoveInput(fighter, input);
  if (freshMoveInput && canBufferFreshMoveInput(fighter)) bufferMoveInput(fighter, freshMoveInput);

  if (
    fighter.state === 'chargeKi' &&
    freshMoveInput &&
    input.charge &&
    fighter.ki >= KI_BURST_COST &&
    fighter.chargePhase !== 'startup' &&
    fighter.chargePhase !== 'recovery'
  ) {
    clearKiChargeState(fighter);
    startComboAttack(fighter, opponent, input, freshMoveInput, 'neutral');
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.state === 'chargeKi') {
    handleKiChargeStep(fighter, input, dt);
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.actionFramesRemaining > 0) {
    const previousMoveFrame = fighter.moveFrame;
    fighter.moveFrame += frameDelta;
    applyAttackForwardForce(fighter, opponent, previousMoveFrame, fighter.moveFrame);
    fighter.actionFramesRemaining = Math.max(0, fighter.actionFramesRemaining - frameDelta);
    applyWhiffRecoveryIfNeeded(fighter);
    fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
    if (fighter.actionFramesRemaining === 0 && fighter.state !== 'knockdown') {
      fighter.currentMove = null;
      fighter.hitConnected = false;
      fighter.hitConfirmed = false;
      fighter.whiffRecoveryApplied = false;
      fighter.moveFrame = 0;
      fighter.state = getPostLockState(fighter);
    }
  } else if (fighter.actionTimer > 0) {
    fighter.actionTimer = Math.max(0, fighter.actionTimer - dt);
    if (fighter.actionTimer === 0 && fighter.state !== 'knockdown') {
      fighter.currentMove = null;
      fighter.hitConnected = false;
      fighter.hitConfirmed = false;
      fighter.whiffRecoveryApplied = false;
      fighter.moveFrame = 0;
      fighter.state = getPostLockState(fighter);
    }
  }

  if (fighter.stunFramesRemaining > 0 || fighter.blockstunFramesRemaining > 0) {
    fighter.stunFramesRemaining = Math.max(0, fighter.stunFramesRemaining - frameDelta);
    fighter.blockstunFramesRemaining = Math.max(0, fighter.blockstunFramesRemaining - frameDelta);
    fighter.stunTimer = framesToSeconds(Math.max(fighter.stunFramesRemaining, fighter.blockstunFramesRemaining));
    if (fighter.stunFramesRemaining === 0 && fighter.blockstunFramesRemaining === 0 && fighter.state !== 'knockdown') {
      fighter.state = getPostLockState(fighter);
    }
  } else if (fighter.stunTimer > 0) {
    fighter.stunTimer = Math.max(0, fighter.stunTimer - dt);
    if (fighter.stunTimer === 0 && fighter.state !== 'knockdown') {
      fighter.state = getPostLockState(fighter);
    }
  }
  if (fighter.blockstunFramesRemaining === 0) {
    fighter.blockPunishWindowFrames = Math.max(0, fighter.blockPunishWindowFrames - frameDelta);
  }

  if (fighter.state === 'knockdown') {
    handleKnockdownStep(fighter, opponent, input, dt);
    if (fighter.actionFramesRemaining === 0 && fighter.actionTimer === 0 && fighter.position.y === 0 && fighter.velocityY === 0) {
      fighter.state = 'idle';
      fighter.getupForward = 0;
      fighter.getupLane = 0;
      fighter.getupStarted = false;
      fighter.getupInvulnerableFrames = 0;
      fighter.juggleDamage = 0;
      fighter.juggleSequenceDamage = 0;
      fighter.juggleTornadoCount = 0;
      fighter.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
    }
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
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
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.state === 'hit' && isAirborne(fighter)) {
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.state === 'attack' && (fighter.actionFramesRemaining > 0 || fighter.actionTimer > 0)) {
    const bufferedMove = fighter.bufferedMoveInput;
    if (bufferedMove && shouldDropSameMoveRecoveryBuffer(fighter, opponent, input, bufferedMove)) {
      clearBufferedMoveInput(fighter);
    } else if (bufferedMove && canComboCancel(fighter) && startComboAttack(fighter, opponent, input, bufferedMove, 'cancel')) {
      clearBufferedMoveInput(fighter);
      applyGravity(fighter, dt);
      updateAttackInputMemory(fighter, input);
      return;
    }
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.stunFramesRemaining > 0 || fighter.blockstunFramesRemaining > 0) {
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  const moveInput = fighter.bufferedMoveInput ?? freshMoveInput;
  if (moveInput) {
    const chainMode = fighter.comboTimer > 0 && canLinkAfterHit(fighter, opponent) ? 'link' : 'neutral';
    if (startComboAttack(fighter, opponent, input, moveInput, chainMode)) {
      clearBufferedMoveInput(fighter);
    }
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (input.charge) {
    startKiCharge(fighter);
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  const forward = resolveForwardInput(fighter, opponent, input);
  const holdingBack = forward < 0;
  const blocking = input.block || holdingBack;
  const laneWalk = input.sidewalkUp ? -1 : input.sidewalkDown ? 1 : 0;
  const sidestepTap = input.sidestepUp ? -1 : input.sidestepDown ? 1 : 0;
  const grounded = fighter.position.y === 0 && fighter.velocityY === 0;
  const crouching = input.down && grounded;
  const jumping = isAirborne(fighter);
  const speedScale = blocking ? 0.42 : crouching ? 0.18 : 1;

  if (jumpPressed && grounded && !blocking && !input.down) {
    fighter.velocityY = fighter.character.stats.jumpForce;
    fighter.position.y = Math.max(fighter.position.y, 0.18);
    fighter.state = 'jump';
  }

  if (sidestepTap !== 0 && fighter.sidestepTimer === 0) {
    fighter.sidestepTimer = 0.18;
    fighter.sidestepDirection = sidestepTap;
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
    moveAlongOpponentAxis(fighter, opponent, forward * fighter.character.stats.speed * speedScale * dt);
  }
  if (sidestep !== 0) {
    const sidestepScale = fighter.sidestepTimer > 0 ? 1.75 : 1.35;
    const sideSign = getOpponentSideSign(fighter, opponent);
    orbitAroundOpponent(fighter, opponent, -sidestep * sideSign * fighter.character.stats.sidestepSpeed * sidestepScale * speedScale * dt);
  }

  fighter.position.x = clamp(fighter.position.x, -ARENA_LIMIT_X, ARENA_LIMIT_X);
  fighter.position.z = clamp(fighter.position.z, -ARENA_LIMIT_Z, ARENA_LIMIT_Z);
  applyGravity(fighter, dt);
  fighter.wasCrouching = crouching;
  updateAttackInputMemory(fighter, input);
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
  if (fighter.state === 'attack') return true;
  if (fighter.state === 'juggle' || fighter.state === 'knockdown' || fighter.state === 'chargeKi') return false;
  return fighter.stunFramesRemaining === 0 && fighter.blockstunFramesRemaining === 0 && fighter.actionFramesRemaining === 0;
}

function startKiCharge(fighter: FighterRuntime) {
  const move = buildKiChargeMove(fighter.character);
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
}

function handleKiChargeStep(fighter: FighterRuntime, input: InputFrame, dt: number) {
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
  fighter.ki = clamp(fighter.ki + KI_CHARGE_PER_SECOND * dt, 0, KI_MAX);
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
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
}

function resetKiChargeRuntime(fighter: FighterRuntime) {
  fighter.chargePhase = 'none';
  fighter.chargeFrame = 0;
  fighter.chargeCommitted = false;
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

  if (fighter.getupStarted) {
    if (fighter.getupForward !== 0) {
      moveAlongOpponentAxis(fighter, opponent, fighter.getupForward * fighter.character.stats.speed * GETUP_ROLL_SPEED * dt);
    }
    if (fighter.getupLane !== 0) {
      const sideSign = getOpponentSideSign(fighter, opponent);
      orbitAroundOpponent(fighter, opponent, -fighter.getupLane * sideSign * fighter.character.stats.sidestepSpeed * GETUP_LANE_SPEED * dt);
    }
    return;
  }

  if (fighter.actionFramesRemaining > KNOCKDOWN_MIN_FRAMES) return;

  const forward = resolveForwardInput(fighter, opponent, input);
  const lane = input.up || input.sidestepUp || input.sidewalkUp ? -1 : input.down || input.sidestepDown || input.sidewalkDown ? 1 : 0;
  const wantsRecovery = forward !== 0 || lane !== 0 || input.block || input.confirm;
  if (!wantsRecovery) return;

  fighter.getupStarted = true;
  fighter.getupForward = forward === 0 ? 0 : forward > 0 ? 1 : -1;
  fighter.getupLane = lane;
  fighter.getupInvulnerableFrames = GETUP_INVULNERABLE_FRAMES;
  fighter.actionFramesRemaining = GETUP_FRAMES;
  fighter.actionTimer = framesToSeconds(GETUP_FRAMES);
  fighter.stunFramesRemaining = 0;
  fighter.blockstunFramesRemaining = 0;
  fighter.blockPunishWindowFrames = 0;
  fighter.stunTimer = 0;
}

function canComboCancel(fighter: FighterRuntime) {
  const move = fighter.currentMove;
  if (!move) return false;
  const cancelWindow = move.cancelWindows?.find((window) => fighter.moveFrame >= window.startFrame && fighter.moveFrame <= window.endFrame);
  if (cancelWindow) return true;
  return fighter.hitConfirmed && fighter.moveFrame >= move.startupFrames + move.activeFrames;
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
  const command = crouchCommandRequired
    ? findConfiguredCrouchCommand(fighter, opponent, input, moveInput)
    : findConfiguredCommand(fighter, opponent, input, moveInput);
  if (crouchCommandRequired && !command) return false;
  if (continuing && !canChainInto(fighter, chainMode)) return false;
  if (!command && hasCommandInputIntent(fighter, opponent, input, moveInput)) return false;
  const move = buildComboMove(fighter.character, baseMove, moveInput, route, comboStep, sequence, command);
  if (continuing && chainMode === 'cancel' && isSameInputRepeat(sequence) && !isAuthoredChain(fighter.character, move, route, sequence, command)) {
    if (fighter.bufferedMoveInput === moveInput) clearBufferedMoveInput(fighter);
    return false;
  }
  const charged = input.charge && fighter.ki >= KI_BURST_COST;
  const resolvedMove = charged ? buildKiBurstMove(move) : move;
  const identity = getMoveIdentity(move);
  fighter.aiRecentComboKeys = addRecentComboKey(fighter.aiRecentComboKeys, identity);
  if (charged) fighter.ki = clamp(fighter.ki - KI_BURST_COST, 0, KI_MAX);

  fighter.currentMove = resolvedMove;
  fighter.moveInstanceId += 1;
  fighter.state = 'attack';
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
  return true;
}

function canChainInto(fighter: FighterRuntime, chainMode: 'neutral' | 'cancel' | 'link') {
  if (chainMode === 'neutral') return true;
  const current = fighter.currentMove;
  if (chainMode === 'cancel') {
    if (!current || !fighter.hitConfirmed) return false;
    const cancelWindow = current.cancelWindows?.find((window) => fighter.moveFrame >= window.startFrame && fighter.moveFrame <= window.endFrame);
    return Boolean(cancelWindow) || fighter.moveFrame >= current.startupFrames + current.activeFrames;
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

function buildKiBurstMove(move: MoveDefinition): MoveDefinition {
  return {
    ...move,
    id: `${move.id}-ki`,
    label: `Ki ${move.label}`,
    damage: Math.round(move.damage * 1.35 + 3),
    blockDamage: Math.round(move.blockDamage * 1.5 + 1),
    hitLevel: move.hitLevel === 'throw' ? move.hitLevel : 'special',
    onBlockFrames: move.onBlockFrames - 2,
    onHitFrames: move.onHitFrames + 5,
    onCounterHitFrames: move.onCounterHitFrames + 7,
    range: move.range + 0.18,
    pushback: move.pushback + 0.32,
    blockPushback: move.blockPushback + 0.24,
    comboKey: `${move.comboKey ?? move.id}:ki`,
    kiCost: KI_BURST_COST,
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
    blockDamage: Math.max(baseMove.blockDamage, Math.round(baseMove.blockDamage * (1 + sequenceBonus * 0.55))),
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
    launchVelocity: merged.launchVelocity === undefined ? undefined : clamp(merged.launchVelocity, 3.2, 7.2),
    juggleRefloatVelocity: merged.juggleRefloatVelocity === undefined ? undefined : clamp(merged.juggleRefloatVelocity, 2.2, 6.4),
    juggleGravityScale: merged.juggleGravityScale === undefined ? undefined : clamp(merged.juggleGravityScale, 0.28, 1.2)
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
    blockDamage: 1,
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
    blockDamage: 2,
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
    blockDamage: 2,
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
    blockDamage: 3,
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
    blockDamage: 1,
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
    blockDamage: 3,
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
    blockDamage: 2,
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
    blockDamage: 1,
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
    blockDamage: 2,
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
    blockDamage: 2,
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
    blockDamage: 3,
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
    blockDamage: 1,
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
    blockDamage: 2,
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
    blockDamage: 2,
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
    blockDamage: 3,
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
    blockDamage: 2,
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
    blockDamage: 3,
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
    blockDamage: 2,
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
    blockDamage: 1,
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
    blockDamage: 3,
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
    blockDamage: 2,
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
    blockDamage: 3,
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
    blockDamage: 1,
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
    blockDamage: 3,
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
    blockDamage: 2,
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
    blockDamage: 2,
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
    blockDamage: 2,
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
    blockDamage: 2,
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
    blockDamage: 3,
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
    blockDamage: 3,
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
  if (crouchNotation) push(crouchNotation);
  if (fighter.wasCrouching && !input.down) push(`WS+${buttonText}`);
  if (direction === 'f' && hasRecentSequence(fighter.commandHistory, ['f', 'f'])) push(`f,f+${buttonText}`);
  if (direction === 'b' && hasRecentSequence(fighter.commandHistory, ['b', 'b'])) push(`b,b+${buttonText}`);

  if (direction !== 'N') {
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
  tryHit(match, a, b);
  tryHit(match, b, a);
}

function tryHit(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime) {
  const move = attacker.currentMove;
  if (!move || attacker.state !== 'attack' || attacker.hitConnected) return;
  if (defender.state === 'knockdown' || defender.getupInvulnerableFrames > 0) return;
  const moveFrame = attacker.moveFrame || secondsToFrames(totalMoveSeconds(move) - attacker.actionTimer);
  if (!isActiveMoveFrame(move, moveFrame)) return;
  const dx = defender.position.x - attacker.position.x;
  const dz = defender.position.z - attacker.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > move.range + UNIVERSAL_RANGE_BUFFER) return;
  if (!hitboxIntersectsAnyHurtbox(attacker, defender, move)) return;

  const wasJuggled = defender.state === 'juggle';
  const wasAirborne = isAirborne(defender) || wasJuggled;
  const launchHeight = Math.max(0, move.launchHeight ?? 0);
  const blocked = canDefenderBlockMove(defender, attacker, move);
  const counterHit = isCounterHit(defender);
  const whiffPunish = isWhiffPunish(defender);
  const blockPunish = attacker.blockPunishWindowFrames > 0;
  const impactId = nextHitEventId(match);
  pushImpactSparkEvent(match, impactId, attacker, defender, move, blocked ? 'block' : whiffPunish ? 'whiffPunish' : blockPunish ? 'punish' : 'hit', {
    launched: launchHeight > 0,
    juggled: wasJuggled || wasAirborne,
    tornado: Boolean(move.tornado) && wasJuggled,
    kiBurst: Boolean(move.kiBurst)
  });
  attacker.hitConnected = true;
  const pushX = distance > 0 ? dx / distance : attacker.facing;
  const pushZ = distance > 0 ? dz / distance : 0;
  const attackerRemaining = Math.max(0, attacker.actionFramesRemaining || secondsToFrames(attacker.actionTimer));

  if (blocked) {
    attacker.hitConfirmed = false;
    attacker.ki = clamp(attacker.ki + KI_BLOCK_GAIN + Math.max(0, move.blockDamage), 0, KI_MAX);
    defender.ki = clamp(defender.ki + KI_DEFENDER_BLOCK_GAIN, 0, KI_MAX);
    defender.hp = Math.max(0, defender.hp - move.blockDamage);
    const effectiveOnBlockFrames = getEffectiveOnBlockFrames(move);
    defender.blockstunFramesRemaining = Math.max(1, attackerRemaining + effectiveOnBlockFrames);
    const defenderAdvantageFrames = Math.max(0, attackerRemaining - defender.blockstunFramesRemaining);
    defender.blockPunishWindowFrames = Math.max(defender.blockPunishWindowFrames, defenderAdvantageFrames + BLOCK_PUNISH_BUFFER_FRAMES);
    defender.stunFramesRemaining = 0;
    defender.stunTimer = framesToSeconds(defender.blockstunFramesRemaining);
    defender.state = defender.state === 'crouchBlock' ? 'crouchBlock' : 'block';
    defender.juggleDamage = 0;
    defender.juggleSequenceDamage = 0;
    defender.juggleTornadoCount = 0;
    defender.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
    defender.position.x += pushX * move.blockPushback * 0.14;
    defender.position.z += pushZ * move.blockPushback * 0.14;
    return;
  }

  attacker.hitConfirmed = true;
  attacker.ki = clamp(attacker.ki + KI_HIT_GAIN + Math.max(0, Math.round(move.damage * 0.35)) + Math.max(0, attacker.comboStep - 1) * 2, 0, KI_MAX);
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
  resetKiChargeRuntime(defender);

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
  context: { launched?: boolean; juggled?: boolean; tornado?: boolean; kiBurst?: boolean } = {}
) {
  match.impactEvents = [
    ...match.impactEvents,
    {
      id,
      kind,
      position: getImpactPosition(attacker, defender, move),
      attackerSlot: attacker.slot,
      defenderSlot: defender.slot,
      hitLevel: move.hitLevel,
      damage: kind === 'block' ? move.blockDamage : move.damage,
      moveLabel: move.label,
      moveInput: move.input,
      launched: context.launched,
      juggled: context.juggled,
      tornado: context.tornado,
      kiBurst: context.kiBurst
    }
  ].slice(-12);
}

function enterKnockdown(fighter: FighterRuntime, frames: number) {
  const recoveryFrames = Math.max(KNOCKDOWN_MIN_FRAMES + GETUP_FRAMES, frames);
  fighter.state = 'knockdown';
  fighter.stunFramesRemaining = recoveryFrames;
  fighter.blockstunFramesRemaining = 0;
  fighter.blockPunishWindowFrames = 0;
  fighter.stunTimer = framesToSeconds(recoveryFrames);
  fighter.actionFramesRemaining = recoveryFrames;
  fighter.actionTimer = framesToSeconds(recoveryFrames);
  fighter.currentMove = null;
  fighter.moveFrame = 0;
  resetKiChargeRuntime(fighter);
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
  fighter.getupStarted = false;
  fighter.getupForward = 0;
  fighter.getupLane = 0;
  fighter.getupInvulnerableFrames = 0;
  fighter.juggleDamage = 0;
  fighter.juggleSequenceDamage = 0;
  fighter.juggleTornadoCount = 0;
  fighter.juggleGravityScale = JUGGLE_GRAVITY_SCALE;
}

function isActiveMoveFrame(move: MoveDefinition, moveFrame: number) {
  return moveFrame >= move.startupFrames && moveFrame < move.startupFrames + move.activeFrames;
}

function getPostLockState(fighter: FighterRuntime): FighterRuntime['state'] {
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
  return Math.min(move.onBlockFrames, -BLOCKER_MIN_ADVANTAGE_FRAMES);
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

function hitboxIntersectsAnyHurtbox(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition) {
  const attackBox = moveHitboxToWorldAabb(attacker, move.hitbox);
  return getCurrentHurtboxes(defender).some((hurtbox) => boxesIntersect(attackBox, hurtboxToWorldAabb(defender, hurtbox)));
}

function getImpactPosition(attacker: FighterRuntime, defender: FighterRuntime, move: MoveDefinition): [number, number, number] {
  const attackBox = moveHitboxToWorldAabb(attacker, move.hitbox);
  const hurtbox = getCurrentHurtboxes(defender)
    .map((box) => hurtboxToWorldAabb(defender, box))
    .find((box) => boxesIntersect(attackBox, box));
  if (!hurtbox) return [defender.position.x, defender.position.y + 1.08, defender.position.z];
  const minX = Math.max(attackBox.minX, hurtbox.minX);
  const maxX = Math.min(attackBox.maxX, hurtbox.maxX);
  const minY = Math.max(attackBox.minY, hurtbox.minY);
  const maxY = Math.min(attackBox.maxY, hurtbox.maxY);
  const minZ = Math.max(attackBox.minZ, hurtbox.minZ);
  const maxZ = Math.min(attackBox.maxZ, hurtbox.maxZ);
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

function moveHitboxToWorldAabb(attacker: FighterRuntime, hitbox: BoxSpec): Aabb {
  const facing = attacker.facing || 1;
  const centerX = attacker.position.x + facing * hitbox.offset[2];
  const centerY = attacker.position.y + hitbox.offset[1];
  const centerZ = attacker.position.z + hitbox.offset[0];
  return makeAabb(
    centerX,
    centerY,
    centerZ,
    hitbox.size[2] + UNIVERSAL_HITBOX_FORWARD_PADDING,
    hitbox.size[1] + UNIVERSAL_HITBOX_VERTICAL_PADDING,
    hitbox.size[0] + UNIVERSAL_HITBOX_LATERAL_PADDING
  );
}

function hurtboxToWorldAabb(defender: FighterRuntime, hurtbox: BoxSpec): Aabb {
  const centerX = defender.position.x + hurtbox.offset[2] * (defender.facing || 1);
  const centerY = defender.position.y + hurtbox.offset[1];
  const centerZ = defender.position.z + hurtbox.offset[0];
  return makeAabb(centerX, centerY, centerZ, hurtbox.size[2], hurtbox.size[1], hurtbox.size[0]);
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
  });
}

function refillTrainingHealth(match: MatchSnapshot) {
  match.phase = 'fighting';
  match.countdown = 0;
  match.message = '';
  match.visualTimeScale = 1;
  match.winnerSlot = null;
  match.fighters.forEach((fighter) => {
    if (fighter.hp <= 0) fighter.hp = fighter.character.stats.health;
    fighter.roundsWon = 0;
  });
}

function beginRoundIntro(match: MatchSnapshot) {
  match.phase = 'intro';
  match.countdown = ROUND_INTRO_TOTAL_SECONDS;
  match.message = '';
  match.visualTimeScale = 1;
  match.winnerSlot = null;
  match.fighters.forEach((fighter) => {
    fighter.state = 'entry';
    fighter.currentMove = null;
    fighter.actionTimer = ROUND_INTRO_TOTAL_SECONDS;
    fighter.actionFramesRemaining = secondsToFrames(ROUND_INTRO_TOTAL_SECONDS);
    fighter.moveFrame = 0;
    resetKiChargeRuntime(fighter);
    fighter.hitConnected = false;
    fighter.hitConfirmed = false;
    fighter.whiffRecoveryApplied = false;
    fighter.stunTimer = 0;
    fighter.stunFramesRemaining = 0;
    fighter.blockstunFramesRemaining = 0;
    fighter.blockPunishWindowFrames = 0;
    fighter.getupInvulnerableFrames = 0;
    fighter.velocityY = 0;
    fighter.position.y = 0;
  });
}

function updateRoundIntro(match: MatchSnapshot) {
  const inEntry = match.countdown > ROUND_INTRO_ROUND_SECONDS + ROUND_INTRO_FIGHT_SECONDS;
  const inRoundCall = match.countdown > ROUND_INTRO_FIGHT_SECONDS;
  match.message = inEntry ? '' : inRoundCall ? `ROUND ${match.round}` : 'FIGHT';
  match.fighters.forEach((fighter) => {
    fighter.state = inEntry ? 'entry' : 'idle';
    fighter.actionTimer = match.countdown;
    fighter.actionFramesRemaining = secondsToFrames(match.countdown);
  });
}

function updateRoundOverVisuals(match: MatchSnapshot) {
  const elapsed = ROUND_OVER_DELAY - Math.max(0, match.countdown);
  match.visualTimeScale = elapsed < KO_SLOWMO_SECONDS ? KO_SLOWMO_TIME_SCALE : 1;
}

function resetRound(match: MatchSnapshot) {
  const rounds: [number, number] = [match.fighters[0].roundsWon, match.fighters[1].roundsWon];
  const [p1Character, p2Character] = [match.fighters[0].character, match.fighters[1].character];
  match.fighters = [createFighter(1, p1Character, -START_DISTANCE / 2), createFighter(2, p2Character, START_DISTANCE / 2)];
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
  match.visualTimeScale = 1;
  if (match.introEnabled) beginRoundIntro(match);
}

function resolveFacing(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  p1.facing = p1.position.x <= p2.position.x ? 1 : -1;
  p2.facing = p2.position.x <= p1.position.x ? 1 : -1;
  p1.facingYaw = Math.atan2(p2.position.x - p1.position.x, p2.position.z - p1.position.z);
  p2.facingYaw = Math.atan2(p1.position.x - p2.position.x, p1.position.z - p2.position.z);
}

function resolveBodyCollision(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
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
  p1.position.x = clamp(p1.position.x, -ARENA_LIMIT_X, ARENA_LIMIT_X);
  p2.position.x = clamp(p2.position.x, -ARENA_LIMIT_X, ARENA_LIMIT_X);
  p1.position.z = clamp(p1.position.z, -ARENA_LIMIT_Z, ARENA_LIMIT_Z);
  p2.position.z = clamp(p2.position.z, -ARENA_LIMIT_Z, ARENA_LIMIT_Z);
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
  if (!move || fighter.state !== 'attack' || fighter.hitConnected || force === 0) return;
  const totalFrames = Math.max(1, move.startupFrames + move.activeFrames + move.recoveryFrames);
  const startFrame = clamp(Math.round(move.forwardForceStartFrame ?? 1), 1, totalFrames);
  const endFrame = clamp(Math.round(move.forwardForceEndFrame ?? totalFrames), startFrame, totalFrames);
  const windowFrames = Math.max(1, endFrame - startFrame + 1);
  const overlapFrames = Math.max(0, Math.min(currentMoveFrame, endFrame) - Math.max(previousMoveFrame, startFrame - 1));
  if (overlapFrames <= 0) return;
  moveAlongOpponentAxis(fighter, opponent, (force * overlapFrames) / windowFrames);
}

function resolveForwardInput(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame) {
  const sideSign = getOpponentSideSign(fighter, opponent);
  const toward = (input.right && sideSign > 0) || (input.left && sideSign < 0);
  const away = (input.left && sideSign > 0) || (input.right && sideSign < 0);
  if (toward) return 1;
  if (away) return -1;
  return 0;
}

function getOpponentSideSign(fighter: FighterRuntime, opponent: FighterRuntime) {
  const dx = opponent.position.x - fighter.position.x;
  if (Math.abs(dx) > 0.001) return dx > 0 ? 1 : -1;
  return fighter.facing || 1;
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

function makeAiInput(ai: FighterRuntime, opponent: FighterRuntime, timer: number, difficulty: CpuDifficulty, cpuDuel = false, aiSeed = 0, roundAiSeed = aiSeed): InputFrame {
  const input = emptyInputFrame();
  const dx = opponent.position.x - ai.position.x;
  const dz = opponent.position.z - ai.position.z;
  const distance = Math.hypot(dx, dz);
  const laneDiff = opponent.position.z - ai.position.z;
  const profile = ai.character.aiProfile;
  const elapsed = ROUND_TIME - timer;
  const settings = getCpuDifficultySettings(difficulty);
  const leadRatio = (ai.hp - opponent.hp) / Math.max(1, ai.character.stats.health);
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
  const canAct = (canStartAction || canAttemptCancel) && ai.stunFramesRemaining === 0 && ai.blockstunFramesRemaining === 0 && ai.state !== 'knockdown';
  const punishRoll = positiveModulo(selector + routeRoll + ai.slot * 11 + Math.floor(ai.blockPunishWindowFrames * 3), 100) / 100;
  const punishDropped = aiDecisionRoll(ai, opponent, elapsed, 3, roundAiSeed) < settings.punishDropRate * style.imperfectionScale;
  const punishAccepted = punishRoll < settings.punishResponse && !punishDropped;
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
  const pressureMove = ai.character.moves.find((move) => move.input === pressureMoveInput) ?? selectedMove;
  const pressureKiBurst = shouldAiUseKiBurst(ai, opponent, pressureMoveInput, difficulty, opening.kind === 'whiff' ? 'whiff' : 'pressure', selector + 11, routeRoll + 19, leaderCloseout);
  const pressureReach = (pressureMove?.range ?? 1.28) + settings.rangeBuffer + (pressureKiBurst ? 0.18 : 0) + (opening.kind === 'hitstun' ? 0.36 + difficulty * 0.035 : 0);
  const pressureLaneTolerance = PRESSURE_LANE_TOLERANCE + (difficulty >= 4 ? 0.16 : 0);
  const pressureInRange = distance <= pressureReach && Math.abs(laneDiff) <= pressureReach * pressureLaneTolerance;
  if (opening.kind !== 'none' && pressureAccepted && canStartAction && canAct && pressureInRange && !tooClose) {
    input.block = false;
    input[awayKey] = false;
    input[towardKey] = distance > pressureReach * 0.78;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
    input.charge = pressureKiBurst;
    input[pressureMoveInput] = true;
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
  const leaderAttackScale = leaderCloseout ? 1.12 - leaderBrake * 0.08 : 1;
  const leaderComboScale = leaderCloseout ? 0.74 - leaderBrake * 0.14 : 1;
  const attackPulse = attackPhase < settings.attackPulse * style.attackPulseScale * leaderAttackScale || (shouldContinueCombo && comboPhase < settings.comboPulse * style.comboPulseScale * leaderComboScale);
  if (canPressure && attackPulse) {
    applyAiRoute(ai, input, towardKey, awayKey, leaderCloseout ? Math.min(difficulty, 2) as CpuDifficulty : difficulty, ai.comboStep, selector, routeRoll);
    selectedMoveInput = chooseAiKiBurstMoveInput(ai, selectedMoveInput, difficulty, selector + 31, routeRoll + 37);
    input.charge = shouldAiUseKiBurst(ai, opponent, selectedMoveInput, difficulty, shouldContinueCombo ? 'pressure' : 'neutral', selector + 29, routeRoll + 41, leaderCloseout);
    input[selectedMoveInput] = true;
    if (!leaderCloseout && difficulty >= 4 && routeRoll > 78) {
      const secondButton = routeRoll > 90 ? 'special' : routeRoll > 84 ? 'heavy' : 'kick';
      input[secondButton] = true;
    }
  }

  input.up = false;
  return input;
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
    if (varied && routeRoll > (difficulty >= 5 ? 28 : 54)) return varied.input;
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
            ? 0.74
            : 0.84;
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
            ? 0.4
            : 0.52;
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
  const t = (level - 1) / 4;
  return {
    attackCycle: lerp(1.3, 0.42, t),
    aggressionCycleBonus: lerp(0.07, 0.18, t),
    attackPulse: lerp(0.045, 0.12, t),
    comboCycle: lerp(0.58, 0.16, t),
    comboPulse: lerp(0.04, 0.22, t),
    maxComboSteps: Math.round(lerp(2, MAX_COMBO_STEPS, t)),
    guardBonus: lerp(-0.2, 0.5, t),
    punishResponse: lerp(0.08, 0.98, t),
    pressureResponse: lerp(0.08, 0.96, t),
    punishDropRate: lerp(0.6, 0.1, t),
    pressureDropRate: lerp(0.52, 0.12, t),
    attackHesitationRate: lerp(0.36, 0.08, t),
    spacingMistakeRate: lerp(0.28, 0.06, t),
    suboptimalMoveRate: lerp(0.5, 0.14, t),
    suboptimalPunishRate: lerp(0.5, 0.12, t),
    suboptimalPressureRate: lerp(0.46, 0.12, t),
    hitstunPressureBonus: lerp(0.02, 0.08, t),
    stalePressurePenalty: lerp(0.08, 0.24, t),
    leaderPressurePenalty: lerp(0.08, 0.22, t),
    staleBreakThreshold: Math.round(lerp(24, 62, t)),
    reactionLeadFrames: Math.round(lerp(-2, 8, t)),
    spacingScale: lerp(1.08, 0.78, t),
    pressureBonus: lerp(0.28, 0.9, t),
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

  if (difficulty >= 4 && routeRoll > 68 && !(usedSide && selector > 70)) {
    input.sidewalkUp = routeRoll < 82;
    input.sidewalkDown = routeRoll >= 82;
  }

  if (difficulty >= 5) {
    if (comboStep >= 2 && selector > 34) input[towardKey] = true;
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
    fighter.velocityY -= fighter.character.stats.gravity * gravityScale * dt;
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
    stage: { ...match.stage },
    combatEvents: [...match.combatEvents],
    impactEvents: [...match.impactEvents],
    fighters: match.fighters.map((fighter) => ({
      ...fighter,
      character: fighter.character,
      position: { ...fighter.position },
      currentMove: fighter.currentMove,
      commandHistory: fighter.commandHistory.map((entry) => ({ ...entry })),
      comboSequence: [...fighter.comboSequence],
      comboUsedKeys: [...fighter.comboUsedKeys],
      aiRecentComboKeys: [...fighter.aiRecentComboKeys],
      previousAttackInputs: { ...fighter.previousAttackInputs }
    })) as [FighterRuntime, FighterRuntime]
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
