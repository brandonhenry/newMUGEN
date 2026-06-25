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
  StageDefinition
} from '../types';
import { emptyInputFrame } from '../types';

const ARENA_LIMIT_X = 18;
const ARENA_LIMIT_Z = 9;
const ROUND_TIME = 60;
const START_DISTANCE = 2.6;
const ROUND_OVER_DELAY = 2.1;
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
const DEFAULT_HURTBOX: BoxSpec = { offset: [0, 1, 0], size: [0.86, 1.9, 0.58] };
const AI_RECENT_MEMORY_LIMIT = 8;
const DEFAULT_WHIFF_RECOVERY_FRAMES = 4;
const BLOCKER_MIN_ADVANTAGE_FRAMES = 3;
const BLOCK_PUNISH_BUFFER_FRAMES = 12;
const PRESSURE_LANE_TOLERANCE = 0.82;
const KI_MAX = 100;
const KI_CHARGE_PER_SECOND = 28;
const KI_HIT_GAIN = 9;
const KI_BLOCK_GAIN = 4;
const KI_DEFENDER_BLOCK_GAIN = 5;
const KI_BURST_COST = 30;

const moveInputs: MoveInput[] = ['special', 'heavy', 'kick', 'jab'];
const limbNames: Record<MoveInput, string> = {
  jab: 'Left Hand',
  heavy: 'Right Hand',
  kick: 'Left Foot',
  special: 'Right Foot'
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
  const match: MatchSnapshot = {
    fighters: [createFighter(1, p1, -START_DISTANCE / 2), createFighter(2, p2, START_DISTANCE / 2)],
    stage,
    mode,
    cpuDifficulty,
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
    if (next.countdown <= 0) {
      const winner = next.fighters.find((fighter) => fighter.roundsWon >= 2);
      if (winner) {
        next.phase = 'matchOver';
        next.winnerSlot = winner.slot;
        next.message = `${winner.character.displayName} wins`;
        next.fighters.forEach((fighter) => {
          fighter.state = fighter.slot === winner.slot ? 'win' : 'lose';
        });
      } else {
        resetRound(next);
      }
    }
    return next;
  }

  const input1 = next.mode === 'cpu' ? makeAiInput(next.fighters[0], next.fighters[1], next.timer, next.cpuDifficulty) : p1Input;
  const input2 =
    next.mode === 'training'
      ? emptyInputFrame()
      : next.mode === 'ai' || next.mode === 'cpu'
        ? makeAiInput(next.fighters[1], next.fighters[0], next.timer, next.cpuDifficulty)
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
    actionTimer: 0,
    actionFramesRemaining: 0,
    moveFrame: 0,
    hitConnected: false,
    hitConfirmed: false,
    whiffRecoveryApplied: false,
    commandHistory: [],
    previousDirectionToken: 'N',
    comboTimer: 0,
    comboStep: 0,
    comboSequence: [],
    comboUsedKeys: [],
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
  fighter.comboTimer = Math.max(0, fighter.comboTimer - dt);
  if (fighter.comboTimer === 0 && fighter.state !== 'attack') {
    fighter.comboStep = 0;
    fighter.comboSequence = [];
    fighter.comboUsedKeys = [];
  }
  fighter.sidestepTimer = Math.max(0, fighter.sidestepTimer - dt);
  fighter.getupInvulnerableFrames = Math.max(0, fighter.getupInvulnerableFrames - frameDelta);
  updateCommandHistory(fighter, opponent, input, dt);
  const freshMoveInput = getFreshMoveInput(fighter, input);

  if (fighter.actionFramesRemaining > 0) {
    fighter.moveFrame += frameDelta;
    fighter.actionFramesRemaining = Math.max(0, fighter.actionFramesRemaining - frameDelta);
    applyWhiffRecoveryIfNeeded(fighter);
    fighter.actionTimer = framesToSeconds(fighter.actionFramesRemaining);
    if (fighter.actionFramesRemaining === 0 && fighter.state !== 'knockdown') {
      fighter.currentMove = null;
      fighter.hitConnected = false;
      fighter.hitConfirmed = false;
      fighter.whiffRecoveryApplied = false;
      fighter.moveFrame = 0;
      fighter.state = fighter.state === 'hit' && isAirborne(fighter) ? 'hit' : 'idle';
    }
  } else if (fighter.actionTimer > 0) {
    fighter.actionTimer = Math.max(0, fighter.actionTimer - dt);
    if (fighter.actionTimer === 0 && fighter.state !== 'knockdown') {
      fighter.currentMove = null;
      fighter.hitConnected = false;
      fighter.hitConfirmed = false;
      fighter.whiffRecoveryApplied = false;
      fighter.moveFrame = 0;
      fighter.state = fighter.state === 'hit' && isAirborne(fighter) ? 'hit' : 'idle';
    }
  }

  if (fighter.stunFramesRemaining > 0 || fighter.blockstunFramesRemaining > 0) {
    fighter.stunFramesRemaining = Math.max(0, fighter.stunFramesRemaining - frameDelta);
    fighter.blockstunFramesRemaining = Math.max(0, fighter.blockstunFramesRemaining - frameDelta);
    fighter.stunTimer = framesToSeconds(Math.max(fighter.stunFramesRemaining, fighter.blockstunFramesRemaining));
    if (fighter.stunFramesRemaining === 0 && fighter.blockstunFramesRemaining === 0 && fighter.state !== 'knockdown') {
      fighter.state = fighter.state === 'hit' && isAirborne(fighter) ? 'hit' : 'idle';
    }
  } else if (fighter.stunTimer > 0) {
    fighter.stunTimer = Math.max(0, fighter.stunTimer - dt);
    if (fighter.stunTimer === 0 && fighter.state !== 'knockdown') {
      fighter.state = fighter.state === 'hit' && isAirborne(fighter) ? 'hit' : 'idle';
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
    }
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.state === 'hit' && isAirborne(fighter)) {
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.state === 'attack' && (fighter.actionFramesRemaining > 0 || fighter.actionTimer > 0)) {
    if (freshMoveInput && canComboCancel(fighter)) {
      startComboAttack(fighter, opponent, input, freshMoveInput);
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

  const moveInput = freshMoveInput;
  if (moveInput) {
    startComboAttack(fighter, opponent, input, moveInput);
    applyGravity(fighter, dt);
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (input.charge) {
    fighter.ki = clamp(fighter.ki + KI_CHARGE_PER_SECOND * dt, 0, KI_MAX);
    fighter.state = 'idle';
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

  if (blocking && grounded && !jumping) {
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
  return fighter.hitConfirmed && fighter.moveFrame >= move.startupFrames;
}

function startComboAttack(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, moveInput: MoveInput): boolean {
  const baseMove = fighter.character.moves.find((candidate) => candidate.input === moveInput);
  if (!baseMove) return false;

  const route = getComboRoute(fighter, opponent, input);
  const cancelingCurrentAttack = fighter.state === 'attack' && (fighter.actionFramesRemaining > 0 || fighter.actionTimer > 0);
  const continuing = cancelingCurrentAttack || fighter.comboTimer > 0;
  const comboStep = continuing ? Math.min(5, fighter.comboStep + 1) : 1;
  const sequence = continuing ? [...fighter.comboSequence, moveInput].slice(-6) : [moveInput];
  const command = findConfiguredCommand(fighter, opponent, input, moveInput);
  if (!command && (cancelingCurrentAttack || hasCommandInputIntent(fighter, opponent, input, moveInput))) return false;
  const move = buildComboMove(fighter.character, baseMove, moveInput, route, comboStep, sequence, command);
  const charged = input.charge && fighter.ki >= KI_BURST_COST;
  const resolvedMove = charged ? buildKiBurstMove(move) : move;
  const identity = getMoveIdentity(move);
  if (cancelingCurrentAttack && fighter.comboUsedKeys.includes(identity)) return false;
  fighter.aiRecentComboKeys = addRecentComboKey(fighter.aiRecentComboKeys, identity);
  if (charged) fighter.ki = clamp(fighter.ki - KI_BURST_COST, 0, KI_MAX);

  fighter.currentMove = resolvedMove;
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

  const forwardNudge = route.toward ? 0.18 : route.away ? -0.08 : 0;
  const specialNudge = moveInput === 'special' ? 0.18 : 0;
  if (forwardNudge || specialNudge) {
    moveAlongOpponentAxis(fighter, opponent, forwardNudge + specialNudge);
  }
  return true;
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

function buildComboMove(
  character: CharacterDefinition,
  baseMove: MoveDefinition,
  moveInput: MoveInput,
  route: ComboRoute,
  comboStep: number,
  sequence: MoveInput[],
  command?: CommandCandidate | null
): MoveDefinition {
  const sequenceBonus = Math.min(0.32, (comboStep - 1) * 0.08);
  const repeatBonus = sequence.length >= 2 && sequence[sequence.length - 1] === sequence[sequence.length - 2] ? 0.06 : 0;
  const lowBonus = route.low ? 0.08 : 0;
  const launcherBonus = route.launcher ? 0.1 : 0;
  const damageScale = 1 + sequenceBonus + repeatBonus + lowBonus + launcherBonus;
  const speedScale = route.toward ? 0.9 : route.away ? 1.08 : route.low ? 1.04 : 1;
  const rangeBonus = route.toward ? 0.26 : route.low ? 0.12 : route.launcher ? 0.18 : 0;
  const pushBonus = route.toward ? 0.24 : route.away ? 0.08 : route.launcher ? 0.32 : 0;
  const commandKey = command?.animationKey;
  const generatedComboKey = command ? `${command.notation}:${sequence.join('-')}` : `${route.key}:${sequence.join('-')}`;

  const generated: MoveDefinition = {
    ...baseMove,
    id: command?.animationKey ?? baseMove.id,
    label: command ? `${command.notation} ${limbNames[moveInput]}` : `${route.label} ${limbNames[moveInput]} ${comboStep}`,
    command: command?.notation,
    notation: command?.notation,
    animationKey: command?.animationKey,
    comboKey: generatedComboKey,
    comboStep,
    route: route.key,
    startupFrames: Math.max(4, Math.round(baseMove.startupFrames * speedScale - Math.min(3, comboStep - 1))),
    activeFrames: baseMove.activeFrames + (comboStep > 2 ? 1 : 0),
    recoveryFrames: Math.max(8, Math.round(baseMove.recoveryFrames * (route.away ? 0.92 : 1) - Math.min(4, comboStep - 1))),
    damage: Math.round(baseMove.damage * damageScale),
    blockDamage: Math.max(baseMove.blockDamage, Math.round(baseMove.blockDamage * (1 + sequenceBonus * 0.55))),
    range: baseMove.range + rangeBonus,
    pushback: baseMove.pushback + pushBonus,
    blockPushback: baseMove.blockPushback + pushBonus * 0.4,
    onBlockFrames: baseMove.onBlockFrames + (route.away ? 2 : route.toward ? -1 : 0),
    onHitFrames: baseMove.onHitFrames + Math.min(5, comboStep) + (route.launcher ? 4 : 0),
    onCounterHitFrames: baseMove.onCounterHitFrames + Math.min(7, comboStep + 1) + (route.launcher ? 5 : 0),
    hitLevel: route.low ? 'low' : baseMove.hitLevel,
    launchHeight: route.launcher ? Math.max(baseMove.launchHeight ?? 0, 2.1) : baseMove.launchHeight,
    knockdown: baseMove.knockdown || comboStep >= 5,
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

  return applyMoveOverrides(character, generated, baseMove, commandKey);
}

type CommandCandidate = {
  notation: string;
  animationKey: string;
};

function applyMoveOverrides(
  character: CharacterDefinition,
  generated: MoveDefinition,
  baseMove: MoveDefinition,
  commandKey?: string
): MoveDefinition {
  const overrides = character.moveOverrides ?? {};
  const candidates = [
    commandKey,
    generated.command,
    generated.comboKey,
    generated.route,
    baseMove.id,
    baseMove.input
  ].filter(Boolean) as string[];
  const merged = candidates.reduce<MoveDefinition>((move, key) => {
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
    blockPushback: Math.max(0, merged.blockPushback)
  };
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

function buildCommandCandidates(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, freshMoveInput: MoveInput): CommandCandidate[] {
  const buttons = getHeldButtons(input, freshMoveInput);
  const buttonText = buttons.join('+');
  const direction = getDirectionalNotation(fighter, opponent, input);
  const candidates: string[] = [];

  const push = (notation: string) => {
    if (!candidates.includes(notation)) candidates.push(notation);
  };

  for (const motion of getMotionCandidates(fighter.commandHistory)) push(`${motion}+${buttonText}`);

  if (fighter.state === 'sidestep' || input.sidestepUp || input.sidestepDown || input.sidewalkUp || input.sidewalkDown) {
    push(`SS+${buttonText}`);
    if (fighter.sidestepDirection < 0 || input.sidestepUp || input.sidewalkUp) push(`SSL+${buttonText}`);
    if (fighter.sidestepDirection > 0 || input.sidestepDown || input.sidewalkDown) push(`SSR+${buttonText}`);
  }
  if (input.down || fighter.state === 'crouch') push(`FC+${buttonText}`);
  if (fighter.wasCrouching && !input.down) push(`WS+${buttonText}`);
  if (direction === 'f' && hasRecentSequence(fighter.commandHistory, ['f', 'f'])) push(`f,f+${buttonText}`);
  if (direction === 'b' && hasRecentSequence(fighter.commandHistory, ['b', 'b'])) push(`b,b+${buttonText}`);

  if (direction !== 'N') {
    push(`${direction}+${buttonText}`);
    push(`${direction.toUpperCase()}+${buttonText}`);
  }
  push(buttonText);
  push(`N+${buttonText}`);

  return candidates.map((notation) => ({ notation, animationKey: commandAnimationKey(notation) }));
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
  return `cmd:${notation}`;
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
  const low = input.down || fighter.state === 'crouch' || fighter.wasCrouching;
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
  if (distance > move.range) return;
  if (!hitboxIntersectsAnyHurtbox(attacker, defender, move)) return;

  const blocked = defender.state === 'block' && defender.facing === -attacker.facing;
  const counterHit = isCounterHit(defender);
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
    defender.state = 'block';
    defender.juggleDamage = 0;
    defender.position.x += pushX * move.blockPushback * 0.14;
    defender.position.z += pushZ * move.blockPushback * 0.14;
    return;
  }

  attacker.hitConfirmed = true;
  attacker.ki = clamp(attacker.ki + KI_HIT_GAIN + Math.max(0, Math.round(move.damage * 0.35)) + Math.max(0, attacker.comboStep - 1) * 2, 0, KI_MAX);
  const identity = getMoveIdentity(move);
  if (!attacker.comboUsedKeys.includes(identity)) {
    attacker.comboUsedKeys = [...attacker.comboUsedKeys, identity].slice(-8);
  }
  attacker.aiRecentComboKeys = addRecentComboKey(attacker.aiRecentComboKeys, identity);

  const advantage = counterHit ? move.onCounterHitFrames : move.onHitFrames;
  const stunFrames = Math.max(1, attackerRemaining + advantage);
  const wasAirborne = isAirborne(defender);
  const launchHeight = Math.max(0, move.launchHeight ?? 0);
  const juggleDamage = (wasAirborne || launchHeight > 0 ? defender.juggleDamage : 0) + move.damage;
  const forceKnockdown = move.knockdown || juggleDamage >= JUGGLE_DAMAGE_LIMIT;
  defender.hp = Math.max(0, defender.hp - move.damage);
  defender.blockstunFramesRemaining = 0;
  defender.blockPunishWindowFrames = 0;
  defender.currentMove = null;
  defender.moveFrame = 0;

  if (forceKnockdown) {
    enterKnockdown(defender, Math.max(stunFrames, KNOCKDOWN_MIN_FRAMES + GETUP_FRAMES));
  } else {
    defender.stunFramesRemaining = stunFrames;
    defender.stunTimer = framesToSeconds(stunFrames);
    defender.actionFramesRemaining = stunFrames;
    defender.actionTimer = framesToSeconds(stunFrames);
    defender.state = 'hit';
    defender.juggleDamage = juggleDamage;
  }

  if (!forceKnockdown && launchHeight > 0) {
    defender.position.y = Math.max(defender.position.y, 0.18);
    defender.velocityY = wasAirborne ? Math.max(defender.velocityY, Math.min(1.45, launchHeight * 0.62)) : Math.max(defender.velocityY, launchHeight);
  } else if (!forceKnockdown && wasAirborne) {
    defender.position.y = Math.max(defender.position.y, 0.28);
    defender.velocityY = Math.max(defender.velocityY, 1.15);
  }
  defender.position.x += pushX * move.pushback * 0.28;
  defender.position.z += pushZ * move.pushback * 0.28;
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
  fighter.hitConnected = false;
  fighter.hitConfirmed = false;
  fighter.whiffRecoveryApplied = false;
  fighter.getupStarted = false;
  fighter.getupForward = 0;
  fighter.getupLane = 0;
  fighter.getupInvulnerableFrames = 0;
  fighter.juggleDamage = 0;
}

function isActiveMoveFrame(move: MoveDefinition, moveFrame: number) {
  return moveFrame >= move.startupFrames && moveFrame < move.startupFrames + move.activeFrames;
}

function isAirborne(fighter: FighterRuntime) {
  return fighter.position.y > 0 || fighter.velocityY !== 0;
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

function moveHitboxToWorldAabb(attacker: FighterRuntime, hitbox: BoxSpec): Aabb {
  const facing = attacker.facing || 1;
  const centerX = attacker.position.x + facing * hitbox.offset[2];
  const centerY = attacker.position.y + hitbox.offset[1];
  const centerZ = attacker.position.z + hitbox.offset[0];
  return makeAabb(centerX, centerY, centerZ, hitbox.size[2], hitbox.size[1], hitbox.size[0]);
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
  if (fighter.state === 'crouch' || fighter.wasCrouching) {
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
  match.message = `${winner.character.displayName} takes the round`;
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
  match.winnerSlot = null;
  match.fighters.forEach((fighter) => {
    fighter.state = 'entry';
    fighter.currentMove = null;
    fighter.actionTimer = ROUND_INTRO_TOTAL_SECONDS;
    fighter.actionFramesRemaining = secondsToFrames(ROUND_INTRO_TOTAL_SECONDS);
    fighter.moveFrame = 0;
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

function resetRound(match: MatchSnapshot) {
  const rounds: [number, number] = [match.fighters[0].roundsWon, match.fighters[1].roundsWon];
  const [p1Character, p2Character] = [match.fighters[0].character, match.fighters[1].character];
  match.fighters = [createFighter(1, p1Character, -START_DISTANCE / 2), createFighter(2, p2Character, START_DISTANCE / 2)];
  match.fighters[0].roundsWon = rounds[0];
  match.fighters[1].roundsWon = rounds[1];
  match.round += 1;
  match.timer = match.roundTime;
  match.countdown = 0;
  match.phase = 'fighting';
  match.message = '';
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

function makeAiInput(ai: FighterRuntime, opponent: FighterRuntime, timer: number, difficulty: CpuDifficulty): InputFrame {
  const input = emptyInputFrame();
  const dx = opponent.position.x - ai.position.x;
  const dz = opponent.position.z - ai.position.z;
  const distance = Math.hypot(dx, dz);
  const laneDiff = opponent.position.z - ai.position.z;
  const profile = ai.character.aiProfile;
  const elapsed = ROUND_TIME - timer;
  const settings = getCpuDifficultySettings(difficulty);
  const beat = Math.sin(timer * 2.7 + ai.hp * 0.03 + ai.slot * 0.9);
  const blockRoll = (Math.sin(elapsed * 7.2 + ai.slot * 1.7 + ai.hp * 0.02) + 1) / 2;
  const attackCycle = settings.attackCycle - profile.aggression * settings.aggressionCycleBonus;
  const attackPhase = positiveModulo(elapsed + ai.slot * 0.18, attackCycle);
  const comboPhase = positiveModulo(elapsed + ai.slot * 0.11, settings.comboCycle);
  const selector = positiveModulo(Math.floor(elapsed * 1000) + ai.slot * 17 + Math.floor(ai.hp), 100);
  const routeRoll = positiveModulo(Math.floor(elapsed * 760) + ai.slot * 29 + Math.floor(opponent.hp), 100);
  const selectedMoveInput = chooseAiMoveInput(ai, profile, settings, selector, routeRoll);
  const selectedMove = ai.character.moves.find((move) => move.input === selectedMoveInput) ?? ai.character.moves[0] ?? null;
  const shouldContinueCombo = ai.comboTimer > 0 && ai.comboStep < settings.maxComboSteps;
  const selectedMoveReach = (selectedMove?.range ?? 1.35) + settings.rangeBuffer + (shouldContinueCombo ? 0.26 : 0);

  const opponentSide = getOpponentSideSign(ai, opponent);
  const towardKey = opponentSide > 0 ? 'right' : 'left';
  const awayKey = opponentSide > 0 ? 'left' : 'right';
  const desiredSpacing = clamp(Math.min(profile.spacing * settings.spacingScale, selectedMoveReach * 0.88), 0.88, selectedMoveReach);
  const tooClose = distance < Math.max(0.72, desiredSpacing * 0.58);
  const tooFar = distance > selectedMoveReach;
  const farAway = distance > selectedMoveReach + settings.runInBuffer;
  const resetRhythm = Math.sin(elapsed * 1.17 + ai.slot * 1.9);

  if (farAway) {
    input[towardKey] = true;
  } else if (tooFar && resetRhythm > -0.42) {
    input[towardKey] = true;
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
  const punishAccepted = punishRoll < settings.punishResponse;
  const punishMoveInput = chooseAiPunishMoveInput(ai, difficulty, selector, routeRoll);
  const punishMove = ai.character.moves.find((move) => move.input === punishMoveInput) ?? selectedMove;
  const punishReach = (punishMove?.range ?? 1.28) + settings.rangeBuffer;
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
  const pressureAccepted = (difficulty >= 5 && opening.kind === 'hitstun') || pressureRoll < settings.pressureResponse;
  const pressureMoveInput = chooseAiPressureMoveInput(ai, difficulty, opening, selector, routeRoll);
  const pressureMove = ai.character.moves.find((move) => move.input === pressureMoveInput) ?? selectedMove;
  const pressureReach = (pressureMove?.range ?? 1.28) + settings.rangeBuffer + (opening.kind === 'hitstun' ? 0.24 : 0);
  const pressureInRange = distance <= pressureReach && Math.abs(laneDiff) <= pressureReach * PRESSURE_LANE_TOLERANCE;
  if (opening.kind !== 'none' && pressureAccepted && canStartAction && canAct && pressureInRange && !tooClose) {
    input.block = false;
    input[awayKey] = false;
    input[towardKey] = distance > pressureReach * 0.78;
    input.sidestepUp = false;
    input.sidestepDown = false;
    input.sidewalkUp = false;
    input.sidewalkDown = false;
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

  input.block = danger && (difficulty >= 3 || isIncomingSoon) && blockRoll < Math.min(0.96, Math.max(0.05, profile.guard + settings.guardBonus));
  if (input.block) {
    input[awayKey] = true;
    input[towardKey] = false;
  }

  const inStrikeRange = distance <= selectedMoveReach && Math.abs(laneDiff) <= selectedMoveReach * 0.82;
  const canPressure = !missedKnownOpening && !input.block && canAct && inStrikeRange && !tooClose;
  const attackPulse = attackPhase < settings.attackPulse || (shouldContinueCombo && comboPhase < settings.comboPulse);
  if (canPressure && attackPulse) {
    applyAiRoute(input, towardKey, awayKey, difficulty, ai.comboStep, selector, routeRoll);
    input[selectedMoveInput] = true;
    if (difficulty >= 4 && routeRoll > 78) {
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
    const preferred = settings.maxComboSteps >= 4 && previous === 'jab' ? (selector > 54 ? 'heavy' : 'kick') : settings.maxComboSteps >= 3 && previous === 'kick' ? (selector > 62 ? 'special' : 'heavy') : null;
    if (preferred && availableInputs.includes(preferred) && !inputAlreadyUsedInCombo(ai, preferred)) return preferred;
  }

  const scored = availableInputs.map((input, index) => {
    const isRecent = ai.aiRecentComboKeys.some((key) => key.endsWith(`:${input}`) || key.includes(`:${input}-`) || key.endsWith(`+${inputToButton[input]}`));
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

function chooseAiPunishMoveInput(ai: FighterRuntime, difficulty: CpuDifficulty, selector: number, routeRoll: number): MoveInput {
  const sorted = ai.character.moves
    .filter((move, index, moves) => moves.findIndex((candidate) => candidate.input === move.input) === index)
    .sort((a, b) => a.startupFrames - b.startupFrames);
  if (difficulty <= 2 && sorted.length > 1) {
    const choiceIndex = Math.min(sorted.length - 1, Math.floor(positiveModulo(selector + routeRoll + ai.slot * 7, 100) / (difficulty === 1 ? 34 : 25)));
    return sorted[choiceIndex]?.input ?? sorted[0]?.input ?? 'jab';
  }
  const fresh = sorted.find((move) => !inputAlreadyUsedInCombo(ai, move.input));
  return fresh?.input ?? sorted[0]?.input ?? 'jab';
}

type AiOpening = {
  kind: 'none' | 'hitstun' | 'whiff';
  frames: number;
};

function getAiOpening(ai: FighterRuntime, opponent: FighterRuntime, distance: number, laneDiff: number): AiOpening {
  if (ai.state === 'knockdown' || ai.stunFramesRemaining > 0 || ai.blockstunFramesRemaining > 0) return { kind: 'none', frames: 0 };
  if (opponent.state === 'knockdown' || opponent.getupInvulnerableFrames > 0) return { kind: 'none', frames: 0 };

  if (opponent.state === 'hit' && opponent.stunFramesRemaining > 0) {
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
  difficulty: CpuDifficulty,
  opening: AiOpening,
  selector: number,
  routeRoll: number
): MoveInput {
  const sorted = ai.character.moves
    .filter((move, index, moves) => moves.findIndex((candidate) => candidate.input === move.input) === index)
    .sort((a, b) => a.startupFrames - b.startupFrames);
  if (sorted.length === 0) return 'jab';

  const jab = sorted.find((move) => move.input === 'jab');
  if (opening.kind === 'hitstun' && jab && difficulty >= 3) return 'jab';
  if (opening.kind === 'whiff' && difficulty >= 4) {
    const launcher = sorted.find((move) => move.launchHeight || move.knockdown || move.damage >= 16);
    if (launcher && opening.frames >= launcher.startupFrames + 2 && routeRoll > 38) return launcher.input;
  }

  if (difficulty <= 2 && sorted.length > 1) {
    const choiceIndex = Math.min(sorted.length - 1, Math.floor(positiveModulo(selector + routeRoll + ai.slot * 5, 100) / (difficulty === 1 ? 42 : 31)));
    return sorted[choiceIndex]?.input ?? sorted[0]?.input ?? 'jab';
  }

  return sorted[0]?.input ?? 'jab';
}

function inputAlreadyUsedInCombo(ai: FighterRuntime, input: MoveInput) {
  return ai.comboUsedKeys.some((key) => key.endsWith(`:${input}`) || key.includes(`:${input}-`) || key.endsWith(`+${inputToButton[input]}`));
}

function getCpuDifficultySettings(difficulty: CpuDifficulty) {
  const level = clamp(difficulty, 1, 5);
  const t = (level - 1) / 4;
  return {
    attackCycle: lerp(1.3, 0.42, t),
    aggressionCycleBonus: lerp(0.07, 0.18, t),
    attackPulse: lerp(0.045, 0.12, t),
    comboCycle: lerp(0.54, 0.21, t),
    comboPulse: lerp(0.035, 0.105, t),
    maxComboSteps: Math.round(lerp(1, 5, t)),
    guardBonus: lerp(-0.2, 0.5, t),
    punishResponse: lerp(0.08, 0.98, t),
    pressureResponse: lerp(0.08, 0.96, t),
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
  input: InputFrame,
  towardKey: 'left' | 'right',
  awayKey: 'left' | 'right',
  difficulty: CpuDifficulty,
  comboStep: number,
  selector: number,
  routeRoll: number
) {
  if (difficulty <= 1) return;

  if (difficulty >= 2 && selector > 48) {
    input[towardKey] = true;
    input[awayKey] = false;
  }

  if (difficulty >= 3 && routeRoll > 52) {
    input.down = true;
  }

  if (difficulty >= 4 && routeRoll > 68) {
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

function applyGravity(fighter: FighterRuntime, dt: number) {
  if (fighter.position.y > 0 || fighter.velocityY !== 0) {
    fighter.velocityY -= fighter.character.stats.gravity * dt;
    fighter.position.y += fighter.velocityY * dt;
    if (fighter.position.y <= 0) {
      fighter.position.y = 0;
      fighter.velocityY = 0;
      if (fighter.state === 'jump') fighter.state = 'idle';
    }
  }
}

function cloneMatch(match: MatchSnapshot): MatchSnapshot {
  return {
    ...match,
    stage: { ...match.stage },
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
