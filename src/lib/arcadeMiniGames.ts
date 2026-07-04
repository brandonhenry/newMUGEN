import type {
  BreakTargetExplosionRuntime,
  BreakTargetMiniGameSnapshot,
  BreakTargetRuntime,
  BreakTargetTier,
  CharacterDefinition,
  FighterRuntime,
  InputFrame,
  MiniGameHighScoreKey,
  MiniGameKind,
  MiniGameResult,
  MoveInput,
  StageDefinition
} from '../types';
import { emptyInputFrame } from '../types';
import { getCharacterCombatScale } from './characterScale';

export const BREAK_TARGET_GAME_ID: MiniGameKind = 'break-target';
export const BREAK_TARGET_HIGH_SCORE_STORAGE_KEY = 'kore.arcadeMiniGameHighScores.v1';
export const BREAK_TARGET_ROUND_TIME = 45;
export const ARCADE_MINI_GAME_CHANCE = 0.35;

const FRAMES_PER_SECOND = 60;
const TARGET_COUNT = 12;
const TARGET_TIERS: BreakTargetTier[] = [10, 10, 10, 20, 20, 30];
const TARGET_POINTS: Record<BreakTargetTier, number> = {
  10: 100,
  20: 225,
  30: 400
};
const MIN_STAGE_BOUND_WIDTH = 16;
const MIN_STAGE_BOUND_DEPTH = 10;
const DEFAULT_STAGE_BOUND_WIDTH = 96;
const DEFAULT_STAGE_BOUND_DEPTH = 42;
const PLAYER_RADIUS = 0.38;
const MINI_GAME_GRAVITY = 18;
const UNIVERSAL_HITBOX_FORWARD_PADDING = 0.3;
const UNIVERSAL_HITBOX_LATERAL_PADDING = 0.14;
const UNIVERSAL_HITBOX_VERTICAL_PADDING = 0.14;
const TARGET_MIN_SPACING = 1.55;
const EXPLOSION_DURATION = 0.58;

type ResolvedMiniGameStageBounds = {
  shape: 'box' | 'ellipse';
  centerX: number;
  centerZ: number;
  rotationY: number;
  halfWidth: number;
  halfDepth: number;
};

type Aabb = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const moveInputs: MoveInput[] = ['special', 'heavy', 'kick', 'jab'];

export function shouldStartArcadeMiniGame(random = Math.random()) {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('forceArcadeMiniGame') === '1') return true;
    if (params.get('disableArcadeMiniGame') === '1') return false;
    if (window.localStorage.getItem('kore.forceArcadeMiniGame') === '1') return true;
  }
  return random < ARCADE_MINI_GAME_CHANCE;
}

export function createBreakTargetMiniGame(
  character: CharacterDefinition,
  stage: StageDefinition,
  seed = Date.now()
): BreakTargetMiniGameSnapshot {
  const bounds = resolveMiniGameStageBounds(stage, PLAYER_RADIUS);
  const fallbackSpawn = stageBoundsLocalToWorld({ x: -Math.min(2.8, bounds.halfWidth * 0.45), z: 0 }, bounds);
  const spawn = stage.spawns?.p1
    ? { x: stage.spawns.p1[0], y: Math.max(0, stage.spawns.p1[1] ?? 0), z: stage.spawns.p1[2] }
    : { x: fallbackSpawn.x, y: 0, z: fallbackSpawn.z };
  return {
    kind: 'break-target',
    gameId: BREAK_TARGET_GAME_ID,
    stage,
    player: createMiniGameFighter(character, spawn),
    seed,
    roundTime: BREAK_TARGET_ROUND_TIME,
    timer: BREAK_TARGET_ROUND_TIME,
    score: 0,
    targets: generateBreakTargets(stage, seed),
    explosions: [],
    phase: 'playing',
    completedReason: null
  };
}

export function generateBreakTargets(stage: StageDefinition, seed = 1): BreakTargetRuntime[] {
  const random = seededRandom(seed);
  const bounds = resolveMiniGameStageBounds(stage, 0.75);
  const targets: BreakTargetRuntime[] = [];
  let attempts = 0;
  while (targets.length < TARGET_COUNT && attempts < TARGET_COUNT * 28) {
    attempts += 1;
    const tier = TARGET_TIERS[Math.floor(random() * TARGET_TIERS.length)] ?? 10;
    const local = randomLocalPoint(bounds, random);
    const world = stageBoundsLocalToWorld(local, bounds);
    const heightBand = targets.length % 4;
    const y = heightBand === 0 ? 0.72 : heightBand === 1 ? 1.15 : heightBand === 2 ? 1.72 : 2.35;
    const radius = tier === 10 ? 0.48 : tier === 20 ? 0.56 : 0.64;
    const candidate = {
      id: `target-${targets.length + 1}`,
      tier,
      hp: tier,
      maxHp: tier,
      position: { x: world.x, y, z: world.z },
      radius,
      height: radius * 2.15,
      points: TARGET_POINTS[tier],
      destroyed: false,
      hitFlash: 0
    };
    if (targets.every((target) => Math.hypot(target.position.x - candidate.position.x, target.position.z - candidate.position.z) >= TARGET_MIN_SPACING)) {
      targets.push(candidate);
    }
  }
  return targets;
}

export function stepBreakTargetMiniGame(
  snapshot: BreakTargetMiniGameSnapshot,
  input: InputFrame,
  dt: number
): BreakTargetMiniGameSnapshot {
  if (snapshot.phase === 'complete') return snapshot;
  const next = cloneBreakTargetMiniGame(snapshot);
  const player = next.player;
  const frameDelta = Math.max(1, Math.round(dt * FRAMES_PER_SECOND));
  const sanitized = sanitizeMiniGameInput(input);
  tickAttack(player, frameDelta);
  const freshMove = getFreshMoveInput(player, sanitized);
  if (freshMove && canStartMiniGameAttack(player)) startMiniGameAttack(player, freshMove);
  if (player.state !== 'attack' || player.actionFramesRemaining <= 0) applyMiniGameMovement(next, sanitized, dt);
  applyMiniGameGravity(player, dt);
  constrainMiniGamePlayer(next);
  resolveTargetHits(next);
  next.explosions = next.explosions
    .map((explosion) => ({ ...explosion, age: explosion.age + dt }))
    .filter((explosion) => explosion.age < explosion.duration);
  next.targets = next.targets.map((target) => ({ ...target, hitFlash: Math.max(0, target.hitFlash - dt) }));
  next.timer = Math.max(0, next.timer - dt);
  if (next.targets.every((target) => target.destroyed)) completeBreakTargetMiniGame(next, 'all-clear');
  else if (next.timer <= 0) completeBreakTargetMiniGame(next, 'time-up');
  player.previousAttackInputs = {
    jab: sanitized.jab,
    kick: sanitized.kick,
    heavy: sanitized.heavy,
    special: sanitized.special
  };
  return next;
}

export function makeBreakTargetMiniGameResult(snapshot: BreakTargetMiniGameSnapshot, previousHighScore = 0): MiniGameResult {
  const destroyed = snapshot.targets.filter((target) => target.destroyed).length;
  const score = Math.max(0, Math.round(snapshot.score));
  const highScore = Math.max(previousHighScore, score);
  return {
    kind: BREAK_TARGET_GAME_ID,
    gameId: BREAK_TARGET_GAME_ID,
    stageId: snapshot.stage.id,
    stageName: snapshot.stage.name,
    score,
    previousHighScore,
    highScore,
    newHighScore: score > previousHighScore,
    targetsDestroyed: destroyed,
    totalTargets: snapshot.targets.length,
    timeRemaining: Math.max(0, snapshot.timer),
    allClear: destroyed === snapshot.targets.length,
    completedReason: snapshot.completedReason ?? (snapshot.timer <= 0 ? 'time-up' : 'all-clear')
  };
}

export function miniGameHighScoreStorageKey(key: MiniGameHighScoreKey) {
  return `${key.gameId}:${key.stageId}`;
}

export function readMiniGameHighScore(key: MiniGameHighScoreKey) {
  if (typeof window === 'undefined') return 0;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BREAK_TARGET_HIGH_SCORE_STORAGE_KEY) ?? '{}') as Record<string, number>;
    return Math.max(0, Math.round(Number(parsed[miniGameHighScoreStorageKey(key)]) || 0));
  } catch {
    return 0;
  }
}

export function writeMiniGameHighScore(key: MiniGameHighScoreKey, score: number) {
  if (typeof window === 'undefined') return 0;
  const storageKey = miniGameHighScoreStorageKey(key);
  let parsed: Record<string, number> = {};
  try {
    parsed = JSON.parse(window.localStorage.getItem(BREAK_TARGET_HIGH_SCORE_STORAGE_KEY) ?? '{}') as Record<string, number>;
  } catch {
    parsed = {};
  }
  const nextScore = Math.max(Math.round(score), Math.round(Number(parsed[storageKey]) || 0), 0);
  parsed[storageKey] = nextScore;
  window.localStorage.setItem(BREAK_TARGET_HIGH_SCORE_STORAGE_KEY, JSON.stringify(parsed));
  return nextScore;
}

export function resolveMiniGameStageBounds(stage: StageDefinition, radius = 0): ResolvedMiniGameStageBounds {
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

export function worldToMiniGameBoundsLocal(position: { x: number; z: number }, bounds: ResolvedMiniGameStageBounds) {
  const dx = position.x - bounds.centerX;
  const dz = position.z - bounds.centerZ;
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos
  };
}

function createMiniGameFighter(character: CharacterDefinition, position: { x: number; y: number; z: number }): FighterRuntime {
  return {
    slot: 1,
    character,
    baseCharacter: character,
    hp: character.stats.health,
    maxHp: character.stats.health,
    tookDamageThisRound: false,
    ki: 0,
    transformOvercharge: 0,
    transformReadyTimer: 0,
    transformStartupFrames: 0,
    transformTargetId: null,
    transformSmokeFrames: 0,
    position,
    velocityY: 0,
    facing: 1,
    facingYaw: Math.PI / 2,
    controlSideSign: 1,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    sidestepOrbitSign: 1,
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
    juggleGravityScale: 0.52,
    throwOpponentSlot: null,
    throwCaptorSlot: null,
    throwAnchorMove: null,
    throwHoldFrames: 0,
    throwMaxHoldFrames: 240,
    throwJabActive: false,
    throwJabCooldownFrames: 0,
    throwJabHitConnected: false,
    throwEscapeProgress: 0,
    throwEscapeGoal: 0,
    throwShakeFrames: 0,
    blockFlash: 0,
    hitFlash: 0,
    visualHitstop: { framesRemaining: 0, animationKey: null, progress: 0 },
    shadowClone: null,
    shadowCloneChargeConsumed: false
  };
}

function cloneBreakTargetMiniGame(snapshot: BreakTargetMiniGameSnapshot): BreakTargetMiniGameSnapshot {
  return {
    ...snapshot,
    player: {
      ...snapshot.player,
      position: { ...snapshot.player.position },
      previousAttackInputs: { ...snapshot.player.previousAttackInputs },
      visualHitstop: { ...snapshot.player.visualHitstop }
    },
    targets: snapshot.targets.map((target) => ({ ...target, position: { ...target.position } })),
    explosions: snapshot.explosions.map((explosion) => ({ ...explosion, position: { ...explosion.position } }))
  };
}

function sanitizeMiniGameInput(input: InputFrame): InputFrame {
  return {
    ...input,
    block: false,
    back: false,
    charge: false
  };
}

function applyMiniGameMovement(snapshot: BreakTargetMiniGameSnapshot, input: InputFrame, dt: number) {
  const player = snapshot.player;
  const grounded = player.position.y === 0 && player.velocityY === 0;
  const dx = input.left === input.right ? 0 : input.left ? -1 : 1;
  const dz =
    input.sidestepUp || input.sidewalkUp
      ? -1
      : input.sidestepDown || input.sidewalkDown
        ? 1
        : 0;
  const crouching = input.down && grounded;
  if (input.up && !player.jumpInputHeld && grounded && !input.down) {
    player.velocityY = player.character.stats.jumpForce;
    player.position.y = Math.max(player.position.y, 0.18);
  }
  player.jumpInputHeld = input.up;
  if (dx !== 0) {
    player.position.x += dx * player.character.stats.speed * (crouching ? 0.18 : 1) * dt;
    player.facing = dx > 0 ? 1 : -1;
    player.facingYaw = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    player.walkDirection = dx;
  } else {
    player.walkDirection = 0;
  }
  if (dz !== 0) {
    player.position.z += dz * player.character.stats.sidestepSpeed * (crouching ? 0.22 : 1) * dt;
    player.sidestepDirection = dz > 0 ? 1 : -1;
  } else {
    player.sidestepDirection = 0;
  }
  if (player.position.y > 0 || player.velocityY !== 0) player.state = 'jump';
  else if (crouching) player.state = 'crouch';
  else if (dz !== 0) player.state = 'sidestep';
  else if (dx !== 0) player.state = 'walk';
  else player.state = 'idle';
  player.wasCrouching = crouching;
}

function applyMiniGameGravity(player: FighterRuntime, dt: number) {
  if (player.position.y <= 0 && player.velocityY <= 0) {
    player.position.y = 0;
    player.velocityY = 0;
    return;
  }
  player.velocityY -= MINI_GAME_GRAVITY * dt;
  player.position.y += player.velocityY * dt;
  if (player.position.y <= 0) {
    player.position.y = 0;
    player.velocityY = 0;
    if (player.state === 'jump') player.state = 'idle';
  }
}

function constrainMiniGamePlayer(snapshot: BreakTargetMiniGameSnapshot) {
  const bounds = resolveMiniGameStageBounds(snapshot.stage, PLAYER_RADIUS);
  const local = worldToMiniGameBoundsLocal(snapshot.player.position, bounds);
  if (bounds.shape === 'ellipse') {
    const distance = (local.x * local.x) / (bounds.halfWidth * bounds.halfWidth) + (local.z * local.z) / (bounds.halfDepth * bounds.halfDepth);
    if (distance > 1) {
      const scale = 1 / Math.sqrt(distance);
      local.x *= scale;
      local.z *= scale;
    }
  } else {
    local.x = clamp(local.x, -bounds.halfWidth, bounds.halfWidth);
    local.z = clamp(local.z, -bounds.halfDepth, bounds.halfDepth);
  }
  const world = stageBoundsLocalToWorld(local, bounds);
  snapshot.player.position.x = world.x;
  snapshot.player.position.z = world.z;
}

function getFreshMoveInput(player: FighterRuntime, input: InputFrame): MoveInput | null {
  return moveInputs.find((moveInput) => input[moveInput] && !player.previousAttackInputs[moveInput]) ?? null;
}

function canStartMiniGameAttack(player: FighterRuntime) {
  return player.actionFramesRemaining <= 0 && player.stunFramesRemaining <= 0;
}

function startMiniGameAttack(player: FighterRuntime, input: MoveInput) {
  const move = player.character.moves.find((candidate) => candidate.input === input) ?? player.character.moves[0];
  if (!move) return;
  const totalFrames = Math.max(1, move.startupFrames + move.activeFrames + move.recoveryFrames);
  player.state = 'attack';
  player.currentMove = move;
  player.moveInstanceId += 1;
  player.moveFrame = 0;
  player.actionFramesRemaining = totalFrames;
  player.actionTimer = totalFrames / FRAMES_PER_SECOND;
  player.hitConnected = false;
  player.hitConfirmed = false;
  player.whiffRecoveryApplied = false;
}

function tickAttack(player: FighterRuntime, frameDelta: number) {
  if (player.actionFramesRemaining <= 0) {
    player.currentMove = null;
    player.moveFrame = 0;
    return;
  }
  player.moveFrame += frameDelta;
  player.actionFramesRemaining = Math.max(0, player.actionFramesRemaining - frameDelta);
  player.actionTimer = player.actionFramesRemaining / FRAMES_PER_SECOND;
  if (player.currentMove?.forwardForce && player.state === 'attack') {
    player.position.x += player.facing * player.currentMove.forwardForce * (frameDelta / FRAMES_PER_SECOND) * 0.35;
  }
  if (player.actionFramesRemaining === 0) {
    player.currentMove = null;
    player.moveFrame = 0;
    player.state = player.position.y > 0 ? 'jump' : 'idle';
    player.hitConnected = false;
    player.hitConfirmed = false;
  }
}

function resolveTargetHits(snapshot: BreakTargetMiniGameSnapshot) {
  const player = snapshot.player;
  const move = player.currentMove;
  if (!move || player.state !== 'attack' || !isActiveMoveFrame(move.startupFrames, move.activeFrames, player.moveFrame)) return;
  const attackBox = moveHitboxToWorldAabb(player, move.hitbox);
  for (const target of snapshot.targets) {
    if (target.destroyed) continue;
    if (!boxesIntersect(attackBox, targetToAabb(target))) continue;
    const damage = Math.max(1, Math.round(move.damage || 1));
    target.hp = Math.max(0, target.hp - damage);
    target.hitFlash = 0.16;
    player.hitConnected = true;
    player.hitConfirmed = true;
    if (target.hp <= 0) {
      target.destroyed = true;
      snapshot.score += target.points;
      snapshot.explosions.push({
        id: `explosion-${target.id}-${snapshot.explosions.length + 1}`,
        position: { ...target.position },
        age: 0,
        duration: EXPLOSION_DURATION
      });
    }
    break;
  }
}

function completeBreakTargetMiniGame(snapshot: BreakTargetMiniGameSnapshot, reason: 'all-clear' | 'time-up') {
  if (snapshot.phase === 'complete') return;
  snapshot.phase = 'complete';
  snapshot.completedReason = reason;
  if (reason === 'all-clear') snapshot.score += Math.round(snapshot.timer * 12);
}

function moveHitboxToWorldAabb(player: FighterRuntime, hitbox: { offset: [number, number, number]; size: [number, number, number] }): Aabb {
  const facing = player.facing || 1;
  const scale = getCharacterCombatScale(player.character);
  return makeAabb(
    player.position.x + facing * hitbox.offset[2] * scale.width,
    player.position.y + hitbox.offset[1] * scale.height,
    player.position.z + hitbox.offset[0] * scale.width,
    hitbox.size[2] * scale.width + UNIVERSAL_HITBOX_FORWARD_PADDING,
    hitbox.size[1] * scale.height + UNIVERSAL_HITBOX_VERTICAL_PADDING,
    hitbox.size[0] * scale.width + UNIVERSAL_HITBOX_LATERAL_PADDING
  );
}

function targetToAabb(target: BreakTargetRuntime): Aabb {
  return makeAabb(target.position.x, target.position.y, target.position.z, target.radius * 2, target.height, target.radius * 0.58);
}

function makeAabb(centerX: number, centerY: number, centerZ: number, width: number, height: number, depth: number): Aabb {
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: centerY - height / 2,
    maxY: centerY + height / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2
  };
}

function boxesIntersect(a: Aabb, b: Aabb) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

function isActiveMoveFrame(startupFrames: number, activeFrames: number, frame: number) {
  return frame >= startupFrames && frame < startupFrames + activeFrames;
}

function randomLocalPoint(bounds: ResolvedMiniGameStageBounds, random: () => number) {
  if (bounds.shape === 'ellipse') {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random());
    return {
      x: Math.cos(angle) * bounds.halfWidth * radius,
      z: Math.sin(angle) * bounds.halfDepth * radius
    };
  }
  return {
    x: (random() * 2 - 1) * bounds.halfWidth,
    z: (random() * 2 - 1) * bounds.halfDepth
  };
}

function stageBoundsLocalToWorld(position: { x: number; z: number }, bounds: ResolvedMiniGameStageBounds) {
  const cos = Math.cos(bounds.rotationY);
  const sin = Math.sin(bounds.rotationY);
  return {
    x: bounds.centerX + position.x * cos + position.z * sin,
    z: bounds.centerZ - position.x * sin + position.z * cos
  };
}

function seededRandom(seed: number) {
  let state = Math.max(1, Math.floor(Math.abs(seed)) % 2147483647);
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
