import type {
  BreakTargetExplosionRuntime,
  BreakTargetMiniGameSnapshot,
  BreakTargetRuntime,
  BreakTargetTier,
  CharacterDefinition,
  ControlScheme,
  CpuDifficulty,
  EnemyRushEnemyKind,
  EnemyRushLaneIndex,
  EnemyRushLaneTransition,
  EnemyRushMiniGameSnapshot,
  EnemyRushRuntime,
  FighterRuntime,
  InputFrame,
  MiniGameHighScoreKey,
  MiniGameKind,
  MiniGameResult,
  MoveInput,
  StageDefinition,
  TagMiniGameSnapshot,
  TagRole
} from '../types';
import { emptyInputFrame } from '../types';
import { createMatch, KO_SLOWMO_SECONDS, KO_SLOWMO_TIME_SCALE, stepMatch } from '../engine/fightEngine';
import { getCharacterCombatScale } from './characterScale';

export const BREAK_TARGET_GAME_ID = 'break-target' satisfies MiniGameKind;
export const ENEMY_RUSH_GAME_ID = 'enemy-rush' satisfies MiniGameKind;
export const FIGHTER_RUSH_GAME_ID = 'fighter-rush' satisfies MiniGameKind;
export const TAG_GAME_ID = 'tag' satisfies MiniGameKind;
export const BREAK_TARGET_HIGH_SCORE_STORAGE_KEY = 'kore.arcadeMiniGameHighScores.v1';
export const BREAK_TARGET_ROUND_TIME = 45;
export const ARCADE_MINI_GAME_CHANCE = 0.35;
export const TAG_ROUND_TIME = 60;
export const TAG_MAX_SCORE = 3000;
export const TAG_POINTS_PER_SECOND = 50;
export const TAG_MINI_GAME_WEIGHT = 0.25;

const TAG_ROLE_INTRO_SECONDS = 1;
const TAG_OBJECTIVE_INTRO_SECONDS = 1.2;
const TAG_VICTORY_SECONDS = 0.8;

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
const MINI_GAME_ATTACK_BUFFER_FRAMES = 10;
const ENEMY_RUSH_PLAYER_RADIUS = 0.42;
const ENEMY_RUSH_PROJECTILE_RADIUS = 0.18;
const ENEMY_RUSH_PROJECTILE_SPEED = 4.2;
const ENEMY_RUSH_MIN_SPAWN_DISTANCE = 2.2;
const ENEMY_RUSH_CLEAR_BONUS_PER_LEVEL = 500;
const ENEMY_RUSH_LANE_COUNT = 5;
const ENEMY_RUSH_MIDDLE_LANE: EnemyRushLaneIndex = 2;
const ENEMY_RUSH_LANE_CHANGE_DURATION = 0.16;
const ENEMY_RUSH_LANE_ATTACK_GRACE = 0.48;
const FIGHTER_RUSH_MAX_ENEMY_COUNT = 16;

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

export type EnemyRushLaneLayout = {
  laneZ: [number, number, number, number, number];
  laneLocalZ: [number, number, number, number, number];
  halfWidth: number;
};

const moveInputs: MoveInput[] = ['special', 'heavy', 'kick', 'jab'];

type EnemyRushDefinition = {
  kind: EnemyRushEnemyKind;
  name: string;
  minLevel: number;
  behavior: EnemyRushRuntime['behavior'];
  hp: number;
  damage: number;
  speed: number;
  points: number;
  radius: number;
  height: number;
  elite: boolean;
  awareness: number;
  attackRange: number;
  projectileKind?: string;
};

export const ENEMY_RUSH_ENEMY_DEFINITIONS: EnemyRushDefinition[] = [
  { kind: 'zombie-small', name: 'Zombie', minLevel: 1, behavior: 'chaser', hp: 24, damage: 7, speed: 1.15, points: 100, radius: 0.38, height: 1.05, elite: false, awareness: 5.4, attackRange: 0.9 },
  { kind: 'skeleton-small', name: 'Skeleton', minLevel: 1, behavior: 'ambusher', hp: 28, damage: 8, speed: 1.28, points: 135, radius: 0.36, height: 1.08, elite: false, awareness: 3.4, attackRange: 1.0 },
  { kind: 'pig-small', name: 'Pig', minLevel: 1, behavior: 'sentry', hp: 34, damage: 9, speed: 1.05, points: 175, radius: 0.44, height: 0.95, elite: false, awareness: 2.8, attackRange: 1.05 },
  { kind: 'orc-small', name: 'Orc', minLevel: 2, behavior: 'bruiser', hp: 48, damage: 11, speed: 1.16, points: 250, radius: 0.46, height: 1.15, elite: false, awareness: 5.6, attackRange: 1.08 },
  { kind: 'zombie-big', name: 'Big Zombie', minLevel: 2, behavior: 'bruiser', hp: 58, damage: 13, speed: 0.95, points: 300, radius: 0.52, height: 1.28, elite: false, awareness: 5.2, attackRange: 1.15 },
  { kind: 'skeleton-big', name: 'Big Skeleton', minLevel: 2, behavior: 'ambusher', hp: 54, damage: 13, speed: 1.1, points: 340, radius: 0.5, height: 1.3, elite: false, awareness: 4.6, attackRange: 1.12 },
  { kind: 'samurai', name: 'Samurai', minLevel: 3, behavior: 'chaser', hp: 72, damage: 17, speed: 1.35, points: 400, radius: 0.48, height: 1.34, elite: false, awareness: 7.2, attackRange: 1.18 },
  { kind: 'pig-big', name: 'Big Pig', minLevel: 3, behavior: 'sentry', hp: 78, damage: 18, speed: 1.08, points: 380, radius: 0.56, height: 1.24, elite: false, awareness: 3.4, attackRange: 1.18 },
  { kind: 'orc-big', name: 'Big Orc', minLevel: 3, behavior: 'bruiser', hp: 92, damage: 20, speed: 1.04, points: 500, radius: 0.58, height: 1.4, elite: true, awareness: 6.2, attackRange: 1.22, projectileKind: 'orc-b' },
  { kind: 'wizzart-a', name: 'Wizzart A', minLevel: 4, behavior: 'caster', hp: 70, damage: 18, speed: 1.0, points: 560, radius: 0.46, height: 1.38, elite: true, awareness: 8.4, attackRange: 5.2, projectileKind: 'wizzart-a' },
  { kind: 'wizzart-b', name: 'Wizzart B', minLevel: 4, behavior: 'caster', hp: 76, damage: 20, speed: 1.0, points: 640, radius: 0.46, height: 1.38, elite: true, awareness: 8.8, attackRange: 5.6, projectileKind: 'wizzart-b' },
  { kind: 'wizzart-c', name: 'Wizzart C', minLevel: 4, behavior: 'caster', hp: 82, damage: 22, speed: 1.0, points: 700, radius: 0.46, height: 1.38, elite: true, awareness: 9.2, attackRange: 6.0, projectileKind: 'wizzart-c' },
  { kind: 'dark-knight', name: 'Dark Knight', minLevel: 4, behavior: 'chaser', hp: 125, damage: 26, speed: 1.2, points: 800, radius: 0.58, height: 1.48, elite: true, awareness: 8.2, attackRange: 1.3 }
];

export function shouldStartArcadeMiniGame(random = Math.random()) {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('forceArcadeMiniGame') === '1') return true;
    if (params.get('disableArcadeMiniGame') === '1') return false;
    if (window.localStorage.getItem('kore.forceArcadeMiniGame') === '1') return true;
  }
  return random < ARCADE_MINI_GAME_CHANCE;
}

export function pickArcadeMiniGameKind(arcadeLevel = 1, random = Math.random()): MiniGameKind {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('forceMiniGameKind');
    if (forced === BREAK_TARGET_GAME_ID || forced === ENEMY_RUSH_GAME_ID || forced === FIGHTER_RUSH_GAME_ID || forced === TAG_GAME_ID) return forced;
  }
  if (random < TAG_MINI_GAME_WEIGHT) return TAG_GAME_ID;
  const legacyRandom = (random - TAG_MINI_GAME_WEIGHT) / (1 - TAG_MINI_GAME_WEIGHT);
  const safeLevel = Math.max(1, Math.round(arcadeLevel));
  if (safeLevel >= 2) {
    const fighterRushChance = Math.min(0.4, 0.16 + (safeLevel - 2) * 0.06);
    if (legacyRandom < fighterRushChance) return FIGHTER_RUSH_GAME_ID;
    const adjustedRandom = (legacyRandom - fighterRushChance) / Math.max(0.001, 1 - fighterRushChance);
    const enemyRushChance = Math.min(0.72, 0.28 + Math.max(0, safeLevel - 1) * 0.11);
    return adjustedRandom < enemyRushChance ? ENEMY_RUSH_GAME_ID : BREAK_TARGET_GAME_ID;
  }
  const enemyRushChance = Math.min(0.72, 0.28 + Math.max(0, arcadeLevel - 1) * 0.11);
  return legacyRandom < enemyRushChance ? ENEMY_RUSH_GAME_ID : BREAK_TARGET_GAME_ID;
}

export function pickTagRole(seed = Date.now()): TagRole {
  if (typeof window !== 'undefined') {
    const forced = new URLSearchParams(window.location.search).get('forceTagRole');
    if (forced === 'player-it' || forced === 'cpu-it') return forced;
  }
  return Math.abs(Math.trunc(seed)) % 2 === 0 ? 'player-it' : 'cpu-it';
}

export function pickTagOpponent(
  roster: CharacterDefinition[],
  playerId: string,
  unlockedIds: Set<string>,
  seed = Date.now()
) {
  const candidates = roster.filter((character) => !character.unplayable && character.id !== playerId);
  if (candidates.length === 0) return null;
  const locked = candidates.filter((character) => Boolean(character.locked) && !unlockedIds.has(character.id));
  const pool = locked.length > 0 ? locked : candidates;
  return pool[Math.floor(seededRandom(seed ^ 0x5f3759df)() * pool.length)] ?? pool[0] ?? null;
}

export function createTagMiniGame(
  player: CharacterDefinition,
  opponent: CharacterDefinition,
  stage: StageDefinition,
  seed = Date.now(),
  arcadeLevel = 1,
  role: TagRole = pickTagRole(seed),
  durationSeconds = TAG_ROUND_TIME,
  controlScheme: ControlScheme = 'kore',
  roster: CharacterDefinition[] = [player, opponent]
): TagMiniGameSnapshot {
  const roundTime = Math.max(1, Math.min(TAG_ROUND_TIME, durationSeconds));
  const difficulty = Math.max(1, Math.min(5, Math.round(arcadeLevel))) as CpuDifficulty;
  const match = createMatch(player, opponent, stage, 'ai', difficulty, {
    roundTime: TAG_ROUND_TIME,
    roundsToWin: 1,
    maxHealth: 0,
    controlScheme,
    playIntro: false,
    aiSeed: seed,
    roster,
    aiObjective: role === 'cpu-it' ? 'tagger' : 'runner'
  });
  match.timer = roundTime;
  return {
    kind: TAG_GAME_ID,
    gameId: TAG_GAME_ID,
    stage,
    match,
    seed,
    role,
    level: Math.max(1, Math.round(arcadeLevel)),
    difficulty,
    roundTime,
    timer: roundTime,
    elapsed: 0,
    score: role === 'player-it' ? TAG_MAX_SCORE : 0,
    introTimer: TAG_ROLE_INTRO_SECONDS,
    outcomeTimer: 0,
    phase: 'intro-role',
    completedReason: null,
    lastProcessedImpactId: match.lastHitId
  };
}

export function stepTagMiniGame(snapshot: TagMiniGameSnapshot, input: InputFrame, dt: number): TagMiniGameSnapshot {
  if (snapshot.phase === 'complete') return snapshot;
  const next: TagMiniGameSnapshot = { ...snapshot };
  if (next.phase === 'intro-role' || next.phase === 'intro-objective') {
    next.introTimer = Math.max(0, next.introTimer - dt);
    if (next.introTimer <= 0) {
      if (next.phase === 'intro-role') {
        next.phase = 'intro-objective';
        next.introTimer = TAG_OBJECTIVE_INTRO_SECONDS;
      } else {
        next.phase = 'playing';
        next.match = { ...next.match, message: '' };
      }
    }
    return next;
  }
  if (next.phase === 'tagged' || next.phase === 'victory') {
    next.outcomeTimer = Math.max(0, next.outcomeTimer - dt);
    if (next.outcomeTimer <= 0) {
      if (next.phase === 'tagged' && next.completedReason === 'tagged-cpu') {
        next.phase = 'victory';
        next.outcomeTimer = TAG_VICTORY_SECONDS;
        next.match = setTagOutcomePresentation(next.match, 'YOU WIN!', true);
      } else {
        next.phase = 'complete';
      }
    }
    return next;
  }

  const stepped = stepMatch(next.match, input, emptyInputFrame(), dt);
  const newImpacts = stepped.impactEvents.filter((event) => event.id > next.lastProcessedImpactId);
  next.lastProcessedImpactId = Math.max(next.lastProcessedImpactId, ...newImpacts.map((event) => event.id));
  next.elapsed = Math.min(next.roundTime, next.elapsed + dt);
  next.timer = Math.max(0, next.roundTime - next.elapsed);
  next.score = scoreTagMiniGame(next.role, next.elapsed, next.roundTime);
  stepped.timer = next.timer;
  stepped.fighters.forEach((fighter) => {
    fighter.hp = fighter.maxHp;
    fighter.recoverableHp = 0;
    fighter.displayRecoverableHp = 0;
  });
  next.match = stepped;

  const runnerSlot = next.role === 'cpu-it' ? 1 : 2;
  const taggerSlot = runnerSlot === 1 ? 2 : 1;
  const tagged = newImpacts.some((event) => (
    event.defenderSlot === runnerSlot &&
    event.attackerSlot === taggerSlot &&
    event.kind !== 'block' &&
    event.damage > 0
  ));
  if (tagged) {
    next.completedReason = next.role === 'cpu-it' ? 'tagged-player' : 'tagged-cpu';
    next.phase = 'tagged';
    next.outcomeTimer = KO_SLOWMO_SECONDS;
    next.match = setTagOutcomePresentation(next.match, 'TAGGED!', false, true);
    return next;
  }
  if (next.timer <= 0) {
    if (next.role === 'cpu-it') {
      next.score = TAG_MAX_SCORE;
      next.completedReason = 'survived';
      next.match = setTagOutcomePresentation(next.match, 'YOU WIN!', true);
    } else {
      next.score = 0;
      next.completedReason = 'escaped';
      next.match = setTagOutcomePresentation(next.match, 'CPU ESCAPED', false);
    }
    next.phase = 'victory';
    next.outcomeTimer = TAG_VICTORY_SECONDS;
  }
  return next;
}

export function makeTagMiniGameResult(snapshot: TagMiniGameSnapshot, previousHighScore = 0): MiniGameResult {
  const score = Math.max(0, Math.round(snapshot.score));
  const cleared = snapshot.completedReason === 'survived' || snapshot.completedReason === 'tagged-cpu';
  return {
    kind: TAG_GAME_ID,
    gameId: TAG_GAME_ID,
    stageId: snapshot.stage.id,
    stageName: snapshot.stage.name,
    score,
    previousHighScore,
    highScore: Math.max(previousHighScore, score),
    newHighScore: score > previousHighScore,
    cleared,
    targetsDestroyed: cleared ? 1 : 0,
    totalTargets: 1,
    timeRemaining: snapshot.timer,
    allClear: cleared,
    completedReason: snapshot.completedReason ?? (snapshot.role === 'cpu-it' ? 'tagged-player' : 'escaped'),
    tagRole: snapshot.role,
    survivalTime: snapshot.role === 'cpu-it' ? snapshot.elapsed : undefined,
    timeToTag: snapshot.role === 'player-it' && snapshot.completedReason === 'tagged-cpu' ? snapshot.elapsed : undefined
  };
}

function scoreTagMiniGame(role: TagRole, elapsed: number, _roundTime: number) {
  if (role === 'cpu-it') return Math.min(TAG_MAX_SCORE, Math.max(0, Math.round(elapsed * TAG_POINTS_PER_SECOND)));
  return Math.min(TAG_MAX_SCORE, Math.max(0, Math.round(TAG_MAX_SCORE - elapsed * TAG_POINTS_PER_SECOND)));
}

function setTagOutcomePresentation(match: TagMiniGameSnapshot['match'], message: string, playerWon: boolean, slowMotion = false) {
  const next = { ...match, fighters: [{ ...match.fighters[0] }, { ...match.fighters[1] }] as typeof match.fighters };
  next.message = message;
  next.visualTimeScale = slowMotion ? KO_SLOWMO_TIME_SCALE : 1;
  if (!slowMotion) {
    next.fighters[0].state = playerWon ? 'win' : 'lose';
    next.fighters[1].state = playerWon ? 'lose' : 'win';
  }
  return next;
}

export function createBreakTargetMiniGame(
  character: CharacterDefinition,
  stage: StageDefinition,
  seed = Date.now(),
  durationSeconds = BREAK_TARGET_ROUND_TIME
): BreakTargetMiniGameSnapshot {
  const roundTime = Math.max(1, Math.min(BREAK_TARGET_ROUND_TIME, durationSeconds));
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
    roundTime,
    timer: roundTime,
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
  handleMiniGameAttackInput(player, freshMove, frameDelta);
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
    cleared: destroyed === snapshot.targets.length,
    targetsDestroyed: destroyed,
    totalTargets: snapshot.targets.length,
    timeRemaining: Math.max(0, snapshot.timer),
    allClear: destroyed === snapshot.targets.length,
    completedReason: snapshot.completedReason ?? (snapshot.timer <= 0 ? 'time-up' : 'all-clear')
  };
}

export function createEnemyRushMiniGame(
  character: CharacterDefinition,
  stage: StageDefinition,
  seed = Date.now(),
  level = 1
): EnemyRushMiniGameSnapshot {
  const safeLevel = Math.max(1, Math.round(level));
  const bounds = resolveMiniGameStageBounds(stage, PLAYER_RADIUS);
  const lanes = resolveEnemyRushLaneLayout(stage);
  const fallbackSpawn = stageBoundsLocalToWorld({ x: -Math.min(2.8, bounds.halfWidth * 0.45), z: 0 }, bounds);
  const spawn = stage.spawns?.p1
    ? { x: stage.spawns.p1[0], y: Math.max(0, stage.spawns.p1[1] ?? 0), z: stage.spawns.p1[2] }
    : { x: fallbackSpawn.x, y: 0, z: fallbackSpawn.z };
  spawn.z = lanes.laneZ[ENEMY_RUSH_MIDDLE_LANE];
  const player = createMiniGameFighter(character, spawn);
  return {
    kind: 'enemy-rush',
    gameId: ENEMY_RUSH_GAME_ID,
    stage,
    player,
    seed,
    level: safeLevel,
    score: 0,
    enemies: generateEnemyRushEnemies(stage, seed, safeLevel, spawn),
    coins: [],
    projectiles: [],
    explosions: [],
    lockedEnemyId: null,
    laneIndex: ENEMY_RUSH_MIDDLE_LANE,
    laneTargetIndex: ENEMY_RUSH_MIDDLE_LANE,
    laneTransition: null,
    queuedLaneStep: 0,
    phase: 'playing',
    completedReason: null
  };
}

export function createFighterRushMiniGame(
  character: CharacterDefinition,
  stage: StageDefinition,
  seed = Date.now(),
  level = 1,
  rosterPool: CharacterDefinition[] = []
): EnemyRushMiniGameSnapshot {
  const snapshot = createEnemyRushMiniGame(character, stage, seed, level);
  return {
    ...snapshot,
    kind: FIGHTER_RUSH_GAME_ID,
    gameId: FIGHTER_RUSH_GAME_ID,
    enemies: generateFighterRushEnemies(stage, seed, level, rosterPool, character, snapshot.player.position)
  };
}

export function generateEnemyRushEnemies(
  stage: StageDefinition,
  seed = 1,
  level = 1,
  playerPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): EnemyRushRuntime[] {
  const safeLevel = Math.max(1, Math.round(level));
  const random = seededRandom(seed);
  const bounds = resolveMiniGameStageBounds(stage, 0.8);
  const lanes = resolveEnemyRushLaneLayout(stage);
  const pool = ENEMY_RUSH_ENEMY_DEFINITIONS.filter((enemy) => enemy.minLevel <= safeLevel);
  const count = Math.min(18, 3 + safeLevel * 2);
  const enemies: EnemyRushRuntime[] = [];
  let attempts = 0;
  while (enemies.length < count && attempts < count * 36) {
    attempts += 1;
    const definition = pool[Math.floor(random() * pool.length)] ?? ENEMY_RUSH_ENEMY_DEFINITIONS[0];
    const playerLocal = worldToMiniGameBoundsLocal(playerPosition, bounds);
    const laneIndex = clampEnemyRushLaneIndex(Math.floor(random() * ENEMY_RUSH_LANE_COUNT));
    const local = { x: 0, z: lanes.laneLocalZ[laneIndex] };
    const laneWidth = Math.min(3.4, bounds.halfWidth * 0.42);
    local.x = clamp(playerLocal.x + (random() * 2 - 1) * laneWidth, -bounds.halfWidth, bounds.halfWidth);
    const world = stageBoundsLocalToWorld(local, bounds);
    const distanceFromPlayer = Math.hypot(world.x - playerPosition.x, world.z - playerPosition.z);
    if (distanceFromPlayer < ENEMY_RUSH_MIN_SPAWN_DISTANCE) continue;
    const spacing = definition.radius + 0.72;
    if (enemies.some((enemy) => Math.hypot(enemy.position.x - world.x, enemy.position.z - world.z) < spacing + enemy.radius)) continue;
    enemies.push({
      id: `enemy-${enemies.length + 1}`,
      kind: definition.kind,
      name: definition.name,
      level: safeLevel,
      hp: Math.round(definition.hp * (1 + (safeLevel - definition.minLevel) * 0.18)),
      maxHp: Math.round(definition.hp * (1 + (safeLevel - definition.minLevel) * 0.18)),
      damage: Math.round(definition.damage * (1 + (safeLevel - 1) * 0.12)),
      speed: definition.speed * (1 + Math.min(0.45, (safeLevel - 1) * 0.045)),
      points: Math.round(definition.points * (1 + (safeLevel - 1) * 0.12)),
      radius: definition.radius,
      height: definition.height,
      position: { x: world.x, y: 0, z: world.z },
      laneIndex,
      laneTransition: null,
      facing: world.x >= playerPosition.x ? -1 : 1,
      attackCooldown: 0.45 + random() * 0.9,
      hitFlash: 0,
      defeated: false,
      elite: definition.elite,
      behavior: definition.behavior,
      awareness: definition.awareness + Math.min(2.2, (safeLevel - 1) * 0.45),
      attackRange: definition.attackRange + Math.min(0.4, (safeLevel - 1) * 0.06),
      projectileKind: definition.projectileKind
    });
  }
  return enemies;
}

export function generateFighterRushEnemies(
  stage: StageDefinition,
  seed = 1,
  level = 1,
  rosterPool: CharacterDefinition[] = [],
  playerCharacter?: CharacterDefinition,
  playerPosition: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): EnemyRushRuntime[] {
  const safeLevel = Math.max(1, Math.round(level));
  const random = seededRandom(seed);
  const bounds = resolveMiniGameStageBounds(stage, 0.8);
  const lanes = resolveEnemyRushLaneLayout(stage);
  const playablePool = uniqueCharactersById(rosterPool.filter((candidate) => !candidate.unplayable));
  const preferredPool = playablePool.filter((candidate) => candidate.id !== playerCharacter?.id);
  const pool = preferredPool.length > 0 ? preferredPool : playablePool.length > 0 ? playablePool : playerCharacter ? [playerCharacter] : [];
  const count = Math.min(FIGHTER_RUSH_MAX_ENEMY_COUNT, 4 + safeLevel * 2);
  const enemies: EnemyRushRuntime[] = [];
  if (pool.length === 0) return enemies;
  let attempts = 0;
  while (enemies.length < count && attempts < count * 44) {
    attempts += 1;
    const rosterCharacter = pool[Math.floor(random() * pool.length)] ?? pool[0];
    const playerLocal = worldToMiniGameBoundsLocal(playerPosition, bounds);
    const laneIndex = clampEnemyRushLaneIndex(Math.floor(random() * ENEMY_RUSH_LANE_COUNT));
    const local = { x: 0, z: lanes.laneLocalZ[laneIndex] };
    const laneWidth = Math.min(3.8, bounds.halfWidth * 0.46);
    local.x = clamp(playerLocal.x + (random() * 2 - 1) * laneWidth, -bounds.halfWidth, bounds.halfWidth);
    const world = stageBoundsLocalToWorld(local, bounds);
    const distanceFromPlayer = Math.hypot(world.x - playerPosition.x, world.z - playerPosition.z);
    if (distanceFromPlayer < ENEMY_RUSH_MIN_SPAWN_DISTANCE) continue;
    const radius = 0.42;
    if (enemies.some((enemy) => Math.hypot(enemy.position.x - world.x, enemy.position.z - world.z) < radius + enemy.radius + 0.62)) continue;
    const levelBonus = Math.max(0, safeLevel - 1);
    const hp = Math.min(18, Math.round(8 + levelBonus * 1.45 + random() * 4));
    const damage = Math.min(7, Math.round(3 + levelBonus * 0.42 + random() * 2));
    enemies.push({
      id: `fighter-${enemies.length + 1}-${rosterCharacter.id}`,
      kind: 'samurai',
      rosterCharacter,
      name: rosterCharacter.displayName,
      level: safeLevel,
      hp,
      maxHp: hp,
      damage,
      speed: Math.max(0.95, Math.min(1.42, rosterCharacter.stats.speed * 0.22 + Math.min(0.2, levelBonus * 0.025))),
      points: Math.round(150 + safeLevel * 42 + (enemies.length % Math.max(1, pool.length)) * 12),
      radius,
      height: 1.35,
      position: { x: world.x, y: 0, z: world.z },
      laneIndex,
      laneTransition: null,
      facing: world.x >= playerPosition.x ? -1 : 1,
      attackCooldown: 0.65 + random() * 0.85,
      hitFlash: 0,
      defeated: false,
      elite: false,
      behavior: enemies.length % 4 === 1 ? 'ambusher' : 'chaser',
      awareness: 5.2 + Math.min(2.4, levelBonus * 0.35),
      attackRange: 0.86 + Math.min(0.28, levelBonus * 0.035)
    });
  }
  return enemies;
}

function uniqueCharactersById(characters: CharacterDefinition[]) {
  const seen = new Set<string>();
  return characters.filter((character) => {
    if (!character.id || seen.has(character.id)) return false;
    seen.add(character.id);
    return true;
  });
}

export function stepEnemyRushMiniGame(
  snapshot: EnemyRushMiniGameSnapshot,
  input: InputFrame,
  dt: number
): EnemyRushMiniGameSnapshot {
  if (snapshot.phase === 'complete') return snapshot;
  const next = cloneEnemyRushMiniGame(snapshot);
  const player = next.player;
  const frameDelta = Math.max(1, Math.round(dt * FRAMES_PER_SECOND));
  const sanitized = sanitizeMiniGameInput(input);
  updateEnemyRushLock(next, sanitized);
  tickAttack(player, frameDelta);
  const freshMove = getFreshMoveInput(player, sanitized);
  handleMiniGameAttackInput(player, freshMove, frameDelta);
  applyEnemyRushLaneTransition(next, dt);
  if (player.state !== 'attack' || player.actionFramesRemaining <= 0) applyEnemyRushMovement(next, sanitized, dt);
  applyMiniGameGravity(player, dt);
  constrainMiniGamePlayer(next);
  snapEnemyRushPlayerToLane(next);
  faceEnemyRushLockTarget(next);
  resolveEnemyRushPlayerHits(next);
  stepEnemyRushEnemies(next, dt);
  stepEnemyRushProjectiles(next, dt);
  collectEnemyRushCoins(next);
  next.explosions = next.explosions
    .map((explosion) => ({ ...explosion, age: explosion.age + dt }))
    .filter((explosion) => explosion.age < explosion.duration);
  next.enemies = next.enemies.map((enemy) => ({ ...enemy, hitFlash: Math.max(0, enemy.hitFlash - dt) }));
  if (player.hp <= 0) completeEnemyRushMiniGame(next, 'player-death');
  else if (next.enemies.every((enemy) => enemy.defeated)) completeEnemyRushMiniGame(next, 'all-clear');
  player.previousAttackInputs = {
    jab: sanitized.jab,
    kick: sanitized.kick,
    heavy: sanitized.heavy,
    special: sanitized.special
  };
  return next;
}

export function makeEnemyRushMiniGameResult(snapshot: EnemyRushMiniGameSnapshot, previousHighScore = 0): MiniGameResult {
  const defeated = snapshot.enemies.filter((enemy) => enemy.defeated).length;
  const coinsCollected = snapshot.coins.filter((coin) => coin.collected).length;
  const score = Math.max(0, Math.round(snapshot.score));
  const highScore = Math.max(previousHighScore, score);
  return {
    kind: snapshot.gameId,
    gameId: snapshot.gameId,
    stageId: snapshot.stage.id,
    stageName: snapshot.stage.name,
    score,
    previousHighScore,
    highScore,
    newHighScore: score > previousHighScore,
    cleared: snapshot.completedReason === 'all-clear',
    targetsDestroyed: defeated,
    totalTargets: snapshot.enemies.length,
    enemiesDefeated: defeated,
    totalEnemies: snapshot.enemies.length,
    coinsCollected,
    timeRemaining: 0,
    allClear: snapshot.completedReason === 'all-clear',
    completedReason: snapshot.completedReason ?? 'player-death'
  };
}

export function miniGameHighScoreStorageKey(key: MiniGameHighScoreKey) {
  return `${key.gameId}:${key.stageId}${key.gameId === TAG_GAME_ID && key.tagRole ? `:${key.tagRole}` : ''}`;
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

export function resolveEnemyRushLaneLayout(stage: StageDefinition): EnemyRushLaneLayout {
  const bounds = resolveMiniGameStageBounds(stage, ENEMY_RUSH_PLAYER_RADIUS);
  const laneSpread = Math.max(2.4, Math.min(4.8, bounds.halfDepth * 0.68));
  const laneLocalZ: [number, number, number, number, number] = [-laneSpread, -laneSpread * 0.5, 0, laneSpread * 0.5, laneSpread];
  const laneZ = laneLocalZ.map((z) => stageBoundsLocalToWorld({ x: 0, z }, bounds).z) as [number, number, number, number, number];
  return {
    laneZ,
    laneLocalZ,
    halfWidth: bounds.halfWidth
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
    recoverableHp: 0,
    displayRecoverableHp: 0,
    recoverableRecoveryDelayFrames: 0,
    recoverableFlashFrames: 0,
    ki: 0,
    displayKi: 0,
    transformOvercharge: 0,
    displayTransformOvercharge: 0,
    transformReadyTimer: 0,
    transformStartupFrames: 0,
    transformTargetId: null,
    transformSmokeFrames: 0,
    position,
    velocityY: 0,
    facing: 1,
    facingYaw: Math.PI / 2,
    controlSideSign: 1,
    horizontalHoldDirection: null,
    horizontalHoldIntent: null,
    horizontalHoldControlSideSign: 1,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    sidestepOrbitSign: 1,
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
    comboContactHits: 0,
    comboDamage: 0,
    beginnerGestureSequence: [],
    beginnerActiveRouteId: null,
    beginnerPendingRouteStep: -1,
    beginnerPendingSpecialIntent: null,
    beginnerSpecialGraceFrames: 0,
    horizontalKnockback: null,
    bufferedMoveInput: null,
    bufferedMoveFrames: 0,
    bufferedMoveIntent: null,
    aiRecentComboKeys: [],
    aiRecentComboFamilies: [],
    aiRecentComboVisualFamilies: [],
    aiActiveComboRouteId: null,
    aiJuggleLockoutFrames: 0,
    aiActionableIdleFrames: 0,
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
    juggleHitCount: 0,
    juggleTornadoCount: 0,
    juggleGravityScale: 0.52,
    tornadoReactionFrames: 0,
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
    lotusFinisherDefenderSlot: null,
    lotusCinematicFrames: 0,
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

function applyMiniGameMovement(snapshot: { player: FighterRuntime }, input: InputFrame, dt: number) {
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
  if (input.jump && !player.jumpInputHeld && grounded && !input.down) {
    player.velocityY = player.character.stats.jumpForce;
    player.position.y = Math.max(player.position.y, 0.18);
  }
  player.jumpInputHeld = input.jump;
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

function applyEnemyRushMovement(snapshot: EnemyRushMiniGameSnapshot, input: InputFrame, dt: number) {
  const player = snapshot.player;
  const grounded = player.position.y === 0 && player.velocityY === 0;
  const dx = input.left === input.right ? 0 : input.left ? -1 : 1;
  const laneStep = getEnemyRushLaneStep(input);
  const crouching = input.down && grounded;
  if (laneStep !== 0) startEnemyRushPlayerLaneChange(snapshot, laneStep);
  if (input.jump && !player.jumpInputHeld && grounded && !input.down) {
    player.velocityY = player.character.stats.jumpForce;
    player.position.y = Math.max(player.position.y, 0.18);
  }
  player.jumpInputHeld = input.jump;
  if (dx !== 0) {
    player.position.x += dx * player.character.stats.speed * (crouching ? 0.18 : 1) * dt;
    player.facing = dx > 0 ? 1 : -1;
    player.facingYaw = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
    player.walkDirection = 1;
  } else {
    player.walkDirection = 0;
  }
  player.sidestepDirection = snapshot.laneTransition ? (snapshot.laneTargetIndex > snapshot.laneIndex ? 1 : -1) : 0;
  if (player.position.y > 0 || player.velocityY !== 0) player.state = 'jump';
  else if (crouching) player.state = 'crouch';
  else if (snapshot.laneTransition) player.state = 'sidestep';
  else if (dx !== 0) player.state = 'walk';
  else player.state = 'idle';
  player.wasCrouching = crouching;
}

function getEnemyRushLaneStep(input: InputFrame): -1 | 0 | 1 {
  const pressed = (input as InputFrame & { __pressedActions?: string[] }).__pressedActions;
  if (pressed) {
    if (pressed.includes('sidestepUp')) return -1;
    if (pressed.includes('sidestepDown')) return 1;
    return 0;
  }
  if (input.sidestepUp) return -1;
  if (input.sidestepDown) return 1;
  return 0;
}

function startEnemyRushPlayerLaneChange(snapshot: EnemyRushMiniGameSnapshot, step: -1 | 1) {
  if (snapshot.laneTransition) {
    snapshot.queuedLaneStep = step;
    return;
  }
  const from = snapshot.laneTargetIndex;
  const to = clampEnemyRushLaneIndex(from + step);
  if (to === from) return;
  snapshot.queuedLaneStep = 0;
  snapshot.laneIndex = from;
  snapshot.laneTargetIndex = to;
  snapshot.laneTransition = makeEnemyRushLaneTransition(from, to);
}

function applyEnemyRushLaneTransition(snapshot: EnemyRushMiniGameSnapshot, dt: number) {
  const lanes = resolveEnemyRushLaneLayout(snapshot.stage);
  if (snapshot.laneTransition) {
    const transition = {
      ...snapshot.laneTransition,
      progress: Math.min(snapshot.laneTransition.duration, snapshot.laneTransition.progress + dt)
    };
    const eased = easeOutCubic(transition.progress / transition.duration);
    snapshot.player.position.z = lerp(lanes.laneZ[transition.from], lanes.laneZ[transition.to], eased);
    if (transition.progress >= transition.duration) {
      snapshot.laneIndex = transition.to;
      snapshot.laneTargetIndex = transition.to;
      snapshot.laneTransition = null;
      snapshot.player.position.z = lanes.laneZ[transition.to];
      const queuedStep = snapshot.queuedLaneStep;
      snapshot.queuedLaneStep = 0;
      if (queuedStep !== 0) startEnemyRushPlayerLaneChange(snapshot, queuedStep);
    } else {
      snapshot.laneTransition = transition;
    }
    return;
  }
  snapshot.player.position.z = lanes.laneZ[snapshot.laneIndex];
}

function snapEnemyRushPlayerToLane(snapshot: EnemyRushMiniGameSnapshot) {
  const lanes = resolveEnemyRushLaneLayout(snapshot.stage);
  if (!snapshot.laneTransition) snapshot.player.position.z = lanes.laneZ[snapshot.laneIndex];
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

function constrainMiniGamePlayer(snapshot: { stage: StageDefinition; player: FighterRuntime }) {
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

function handleMiniGameAttackInput(player: FighterRuntime, freshMove: MoveInput | null, frameDelta: number) {
  if (player.bufferedMoveFrames > 0) player.bufferedMoveFrames = Math.max(0, player.bufferedMoveFrames - frameDelta);
  if (freshMove) {
    if (canStartMiniGameAttack(player)) {
      startMiniGameAttack(player, freshMove);
      return;
    }
    player.bufferedMoveInput = freshMove;
    player.bufferedMoveFrames = MINI_GAME_ATTACK_BUFFER_FRAMES;
  }
  if (player.bufferedMoveInput && player.bufferedMoveFrames > 0 && canStartMiniGameAttack(player)) {
    const buffered = player.bufferedMoveInput;
    player.bufferedMoveInput = null;
    player.bufferedMoveFrames = 0;
    startMiniGameAttack(player, buffered);
  }
  if (player.bufferedMoveFrames <= 0) {
    player.bufferedMoveInput = null;
    player.bufferedMoveFrames = 0;
  }
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
  player.bufferedMoveInput = null;
  player.bufferedMoveFrames = 0;
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

function cloneEnemyRushMiniGame(snapshot: EnemyRushMiniGameSnapshot): EnemyRushMiniGameSnapshot {
  return {
    ...snapshot,
    laneTransition: snapshot.laneTransition ? { ...snapshot.laneTransition } : null,
    player: {
      ...snapshot.player,
      position: { ...snapshot.player.position },
      previousAttackInputs: { ...snapshot.player.previousAttackInputs },
      visualHitstop: { ...snapshot.player.visualHitstop }
    },
    enemies: snapshot.enemies.map((enemy) => ({ ...enemy, position: { ...enemy.position }, laneTransition: enemy.laneTransition ? { ...enemy.laneTransition } : null })),
    coins: snapshot.coins.map((coin) => ({ ...coin, position: { ...coin.position } })),
    projectiles: snapshot.projectiles.map((projectile) => ({ ...projectile, position: { ...projectile.position }, velocity: { ...projectile.velocity } })),
    explosions: snapshot.explosions.map((explosion) => ({ ...explosion, position: { ...explosion.position } }))
  };
}

function updateEnemyRushLock(snapshot: EnemyRushMiniGameSnapshot, input: InputFrame) {
  const pressed = (input as InputFrame & { __pressedActions?: string[] }).__pressedActions ?? [];
  const aliveEnemies = snapshot.enemies.filter((enemy) => !enemy.defeated);
  if (aliveEnemies.length === 0) {
    snapshot.lockedEnemyId = null;
    return;
  }
  if (snapshot.lockedEnemyId && !aliveEnemies.some((enemy) => enemy.id === snapshot.lockedEnemyId)) snapshot.lockedEnemyId = null;
  if (pressed.includes('lockTarget')) {
    snapshot.lockedEnemyId = snapshot.lockedEnemyId ? null : nearestEnemyRushEnemy(snapshot)?.id ?? null;
  }
  if (pressed.includes('cycleTargetUp')) cycleEnemyRushLock(snapshot, -1);
  if (pressed.includes('cycleTargetDown')) cycleEnemyRushLock(snapshot, 1);
}

function nearestEnemyRushEnemy(snapshot: EnemyRushMiniGameSnapshot) {
  return snapshot.enemies
    .filter((enemy) => !enemy.defeated)
    .sort((left, right) => {
      const leftDistance = Math.hypot(left.position.x - snapshot.player.position.x, left.position.z - snapshot.player.position.z);
      const rightDistance = Math.hypot(right.position.x - snapshot.player.position.x, right.position.z - snapshot.player.position.z);
      return leftDistance - rightDistance;
    })[0] ?? null;
}

function cycleEnemyRushLock(snapshot: EnemyRushMiniGameSnapshot, direction: -1 | 1) {
  const ordered = snapshot.enemies
    .filter((enemy) => !enemy.defeated)
    .sort((left, right) => left.position.z - right.position.z || left.position.x - right.position.x);
  if (ordered.length === 0) {
    snapshot.lockedEnemyId = null;
    return;
  }
  const currentIndex = Math.max(0, ordered.findIndex((enemy) => enemy.id === snapshot.lockedEnemyId));
  const nextIndex = (currentIndex + direction + ordered.length) % ordered.length;
  snapshot.lockedEnemyId = ordered[nextIndex]?.id ?? ordered[0].id;
}

function faceEnemyRushLockTarget(snapshot: EnemyRushMiniGameSnapshot) {
  const enemy = snapshot.enemies.find((candidate) => candidate.id === snapshot.lockedEnemyId && !candidate.defeated);
  if (!enemy) return;
  const dx = enemy.position.x - snapshot.player.position.x;
  if (Math.abs(dx) <= 0.05) return;
  snapshot.player.facing = dx >= 0 ? 1 : -1;
  snapshot.player.facingYaw = snapshot.player.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
}

function resolveEnemyRushPlayerHits(snapshot: EnemyRushMiniGameSnapshot) {
  const player = snapshot.player;
  const move = player.currentMove;
  if (!move || player.state !== 'attack' || !isActiveMoveFrame(move.startupFrames, move.activeFrames, player.moveFrame)) return;
  const attackBox = moveHitboxToWorldAabb(player, move.hitbox);
  for (const enemy of snapshot.enemies) {
    if (enemy.defeated) continue;
    if (!enemyRushLanesOverlap(snapshot, enemy)) continue;
    if (!boxesIntersect(attackBox, enemyToAabb(enemy))) continue;
    const damage = Math.max(1, Math.round(move.damage || 1));
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitFlash = 0.16;
    player.hitConnected = true;
    player.hitConfirmed = true;
    if (enemy.hp <= 0) defeatEnemyRushEnemy(snapshot, enemy);
    break;
  }
}

function stepEnemyRushEnemies(snapshot: EnemyRushMiniGameSnapshot, dt: number) {
  const player = snapshot.player;
  const bounds = resolveMiniGameStageBounds(snapshot.stage, 0.6);
  const lanes = resolveEnemyRushLaneLayout(snapshot.stage);
  for (const enemy of snapshot.enemies) {
    if (enemy.defeated) continue;
    enemy.laneTransition = null;
    enemy.position.z = lanes.laneZ[enemy.laneIndex];
    const dx = player.position.x - enemy.position.x;
    const laneDistance = enemyRushLaneDistance(snapshot, enemy);
    const distance = Math.max(0.001, Math.hypot(dx, laneDistance * ENEMY_RUSH_LANE_ATTACK_GRACE));
    enemy.facing = dx >= 0 ? 1 : -1;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    const intelligence = Math.min(1, Math.max(0, (snapshot.level - 1) / 4));
    const ranged = enemy.behavior === 'caster' || Boolean(enemy.projectileKind);
    const attackRange = ranged ? enemy.attackRange : enemy.radius + ENEMY_RUSH_PLAYER_RADIUS + enemy.attackRange * 0.42;
    const awake = enemy.behavior === 'chaser' || enemy.behavior === 'bruiser' || distance <= enemy.awareness;
    const shouldChase =
      awake &&
      enemy.behavior !== 'sentry' &&
      (enemy.behavior !== 'caster' ? Math.abs(dx) > attackRange * 0.72 : Math.abs(dx) > attackRange * 1.08 || Math.abs(dx) < attackRange * 0.52);
    if (shouldChase) {
      const casterRetreat = enemy.behavior === 'caster' && Math.abs(dx) < attackRange * 0.52 ? -1 : 1;
      const behaviorSpeed =
        enemy.behavior === 'bruiser' ? 0.72 :
          enemy.behavior === 'ambusher' ? 0.9 :
            enemy.behavior === 'caster' ? 0.62 :
              1;
      const chaseSpeed = enemy.speed * behaviorSpeed * (0.72 + intelligence * 0.38);
      enemy.position.x += Math.sign(dx) * chaseSpeed * casterRetreat * dt;
      enemy.position.z = lanes.laneZ[enemy.laneIndex];
      constrainPointToBounds(enemy.position, bounds);
    }
    const aligned = enemyRushLanesOverlap(snapshot, enemy);
    const canAttack = awake && aligned && Math.abs(dx) <= attackRange && Math.abs(dx) <= enemy.radius + ENEMY_RUSH_PLAYER_RADIUS + 0.8 + intelligence * 0.5 && enemy.attackCooldown <= 0;
    if (canAttack) {
      if (ranged && enemy.projectileKind) {
        snapshot.projectiles.push({
          id: `projectile-${enemy.id}-${snapshot.projectiles.length + 1}`,
          ownerId: enemy.id,
          kind: enemy.projectileKind,
          damage: Math.max(1, Math.round(enemy.damage * 0.85)),
          position: { x: enemy.position.x, y: 0.85, z: lanes.laneZ[enemy.laneIndex] },
          velocity: { x: Math.sign(dx || enemy.facing) * ENEMY_RUSH_PROJECTILE_SPEED, z: 0 },
          laneIndex: enemy.laneIndex,
          radius: ENEMY_RUSH_PROJECTILE_RADIUS,
          age: 0
        });
        enemy.attackCooldown = 1.9 - intelligence * 0.55;
      } else if (boxesIntersect(enemyToAabb(enemy), playerToAabb(player))) {
        damageEnemyRushPlayer(snapshot, enemy.damage);
        enemy.attackCooldown = 1.15 - intelligence * 0.32;
      }
    }
  }
}

function stepEnemyRushProjectiles(snapshot: EnemyRushMiniGameSnapshot, dt: number) {
  const bounds = resolveMiniGameStageBounds(snapshot.stage, 1);
  snapshot.projectiles = snapshot.projectiles
    .map((projectile) => ({
      ...projectile,
      age: projectile.age + dt,
      position: {
        x: projectile.position.x + projectile.velocity.x * dt,
        y: projectile.position.y,
        z: projectile.position.z + projectile.velocity.z * dt
      }
    }))
    .filter((projectile) => {
      const local = worldToMiniGameBoundsLocal(projectile.position, bounds);
      if (projectile.age > 4 || Math.abs(local.x) > bounds.halfWidth + 1 || Math.abs(local.z) > bounds.halfDepth + 1) return false;
      if (!enemyRushProjectileOverlapsPlayerLane(snapshot, projectile)) return true;
      if (boxesIntersect(projectileToAabb(projectile), playerToAabb(snapshot.player))) {
        damageEnemyRushPlayer(snapshot, projectile.damage);
        return false;
      }
      return true;
    });
}

function collectEnemyRushCoins(snapshot: EnemyRushMiniGameSnapshot) {
  for (const coin of snapshot.coins) {
    if (coin.collected) continue;
    if (!enemyRushProjectileOverlapsPlayerLane(snapshot, coin)) continue;
    if (Math.hypot(snapshot.player.position.x - coin.position.x, snapshot.player.position.z - coin.position.z) > coin.radius + ENEMY_RUSH_PLAYER_RADIUS) continue;
    coin.collected = true;
    snapshot.score += coin.value;
  }
}

function defeatEnemyRushEnemy(snapshot: EnemyRushMiniGameSnapshot, enemy: EnemyRushRuntime) {
  if (enemy.defeated) return;
  enemy.defeated = true;
  snapshot.score += enemy.points;
  const lanes = resolveEnemyRushLaneLayout(snapshot.stage);
  const laneZ = lanes.laneZ[enemy.laneIndex];
  snapshot.explosions.push({
    id: `enemy-explosion-${enemy.id}-${snapshot.explosions.length + 1}`,
    position: { x: enemy.position.x, y: Math.max(0.4, enemy.height * 0.5), z: laneZ },
    age: 0,
    duration: EXPLOSION_DURATION
  });
  const dropRoll = seededRandom(snapshot.seed + snapshot.coins.length * 97 + Number(enemy.id.replace(/\D/g, '') || 0) * 31)();
  const dropChance = enemy.elite ? 0.78 : enemy.points >= 250 ? 0.42 : 0.18;
  if (dropRoll <= dropChance) {
    const coinRandom = seededRandom(snapshot.seed + snapshot.coins.length * 131 + enemy.points);
    const min = 50 + (snapshot.level - 1) * 50;
    const max = 150 + (snapshot.level - 1) * 50;
    snapshot.coins.push({
      id: `coin-${snapshot.coins.length + 1}`,
      value: Math.round(min + coinRandom() * (max - min)),
      position: { x: enemy.position.x, y: 0.28, z: laneZ },
      laneIndex: enemy.laneIndex,
      radius: 0.42,
      collected: false
    });
  }
}

function damageEnemyRushPlayer(snapshot: EnemyRushMiniGameSnapshot, damage: number) {
  if (snapshot.player.hp <= 0) return;
  snapshot.player.hp = Math.max(0, snapshot.player.hp - Math.max(1, Math.round(damage)));
  snapshot.player.hitFlash = 0.18;
  if (snapshot.player.hp <= 0) completeEnemyRushMiniGame(snapshot, 'player-death');
}

function completeEnemyRushMiniGame(snapshot: EnemyRushMiniGameSnapshot, reason: 'all-clear' | 'player-death') {
  if (snapshot.phase === 'complete') return;
  snapshot.phase = 'complete';
  snapshot.completedReason = reason;
  if (reason === 'all-clear') snapshot.score += snapshot.level * ENEMY_RUSH_CLEAR_BONUS_PER_LEVEL;
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

function enemyToAabb(enemy: EnemyRushRuntime): Aabb {
  return makeAabb(enemy.position.x, enemy.position.y + enemy.height * 0.5, enemy.position.z, enemy.radius * 2, enemy.height, enemy.radius * 2);
}

function playerToAabb(player: FighterRuntime): Aabb {
  const scale = getCharacterCombatScale(player.character);
  return makeAabb(player.position.x, player.position.y + scale.height * 0.5, player.position.z, 0.82 * scale.width, scale.height, 0.82 * scale.width);
}

function projectileToAabb(projectile: { position: { x: number; y: number; z: number }; radius: number }): Aabb {
  return makeAabb(projectile.position.x, projectile.position.y, projectile.position.z, projectile.radius * 2, projectile.radius * 2, projectile.radius * 2);
}

function makeEnemyRushLaneTransition(from: EnemyRushLaneIndex, to: EnemyRushLaneIndex): EnemyRushLaneTransition {
  return {
    from,
    to,
    progress: 0,
    duration: ENEMY_RUSH_LANE_CHANGE_DURATION
  };
}

function enemyRushLaneDistance(snapshot: EnemyRushMiniGameSnapshot, enemy: EnemyRushRuntime) {
  return Math.abs(snapshot.laneTargetIndex - enemy.laneIndex);
}

function enemyRushLanesOverlap(snapshot: EnemyRushMiniGameSnapshot, enemy: EnemyRushRuntime) {
  if (enemy.laneIndex === snapshot.laneTargetIndex) return true;
  if (!snapshot.laneTransition) return false;
  return enemy.laneIndex === snapshot.laneTransition.from || enemy.laneIndex === snapshot.laneTransition.to;
}

function enemyRushProjectileOverlapsPlayerLane(snapshot: EnemyRushMiniGameSnapshot, projectile: { laneIndex: EnemyRushLaneIndex }) {
  if (projectile.laneIndex === snapshot.laneTargetIndex) return true;
  if (!snapshot.laneTransition) return false;
  return projectile.laneIndex === snapshot.laneTransition.from || projectile.laneIndex === snapshot.laneTransition.to;
}

function clampEnemyRushLaneIndex(value: number): EnemyRushLaneIndex {
  return Math.max(0, Math.min(ENEMY_RUSH_LANE_COUNT - 1, Math.round(value))) as EnemyRushLaneIndex;
}

function easeOutCubic(progress: number) {
  const clamped = clamp(progress, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

function constrainPointToBounds(position: { x: number; z: number }, bounds: ResolvedMiniGameStageBounds) {
  const local = worldToMiniGameBoundsLocal(position, bounds);
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
  position.x = world.x;
  position.z = world.z;
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

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}
