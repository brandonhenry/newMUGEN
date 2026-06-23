import type {
  CharacterDefinition,
  FighterRuntime,
  InputFrame,
  MatchMode,
  MatchSnapshot,
  MoveDefinition,
  MoveInput,
  StageDefinition
} from '../types';
import { emptyInputFrame } from '../types';

const ARENA_LIMIT_X = 4.8;
const ARENA_LIMIT_Z = 2.1;
const ROUND_TIME = 60;
const START_DISTANCE = 2.6;
const ROUND_OVER_DELAY = 2.1;

const moveInputs: MoveInput[] = ['special', 'heavy', 'kick', 'jab'];

export function createMatch(
  p1: CharacterDefinition,
  p2: CharacterDefinition,
  stage: StageDefinition,
  mode: MatchMode
): MatchSnapshot {
  return {
    fighters: [createFighter(1, p1, -START_DISTANCE / 2), createFighter(2, p2, START_DISTANCE / 2)],
    stage,
    mode,
    timer: ROUND_TIME,
    round: 1,
    countdown: 2.8,
    winnerSlot: null,
    phase: 'intro',
    message: 'ROUND 1',
    lastHitId: 0,
    cameraShake: 0
  };
}

export function stepMatch(match: MatchSnapshot, p1Input: InputFrame, p2Input: InputFrame, dt: number): MatchSnapshot {
  const next = cloneMatch(match);
  next.cameraShake = Math.max(0, next.cameraShake - dt * 4);

  if (next.phase === 'matchOver') return next;

  if (next.phase === 'intro') {
    next.countdown = Math.max(0, next.countdown - dt);
    next.message = next.countdown > 1.8 ? `ROUND ${next.round}` : next.countdown > 0.75 ? 'READY' : 'FIGHT';
    if (next.countdown <= 0) {
      next.phase = 'fighting';
      next.message = '';
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

  const input2 = next.mode === 'ai' ? makeAiInput(next.fighters[1], next.fighters[0], next.timer) : p2Input;
  applyFighterStep(next, 0, p1Input, dt);
  applyFighterStep(next, 1, input2, dt);
  resolveFacing(next);
  resolveBodyCollision(next);
  resolveHits(next);

  next.timer = Math.max(0, next.timer - dt);
  const ko = next.fighters.find((fighter) => fighter.hp <= 0);
  if (ko || next.timer <= 0) {
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
    position: { x, y: 0, z: 0 },
    velocityY: 0,
    facing: slot === 1 ? 1 : -1,
    state: 'idle',
    currentMove: null,
    actionTimer: 0,
    hitConnected: false,
    roundsWon: 0,
    stunTimer: 0,
    blockFlash: 0,
    hitFlash: 0
  };
}

function applyFighterStep(match: MatchSnapshot, fighterIndex: 0 | 1, input: InputFrame, dt: number) {
  const fighter = match.fighters[fighterIndex];
  const opponent = match.fighters[fighterIndex === 0 ? 1 : 0];
  fighter.blockFlash = Math.max(0, fighter.blockFlash - dt * 5);
  fighter.hitFlash = Math.max(0, fighter.hitFlash - dt * 4);

  if (fighter.actionTimer > 0) {
    fighter.actionTimer = Math.max(0, fighter.actionTimer - dt);
    if (fighter.actionTimer === 0 && fighter.state !== 'knockdown') {
      fighter.currentMove = null;
      fighter.hitConnected = false;
      fighter.state = 'idle';
    }
  }

  if (fighter.stunTimer > 0) {
    fighter.stunTimer = Math.max(0, fighter.stunTimer - dt);
    if (fighter.stunTimer === 0 && fighter.state !== 'knockdown') fighter.state = 'idle';
  }

  if (fighter.state === 'knockdown') {
    if (fighter.actionTimer === 0) fighter.state = 'idle';
    applyGravity(fighter, dt);
    return;
  }

  if (fighter.state === 'attack' && fighter.actionTimer > 0) {
    applyGravity(fighter, dt);
    return;
  }

  const moveInput = moveInputs.find((action) => input[action]);
  if (moveInput) {
    const move = fighter.character.moves.find((candidate) => candidate.input === moveInput);
    if (move) {
      fighter.currentMove = move;
      fighter.state = 'attack';
      fighter.actionTimer = move.startup + move.active + move.recovery;
      fighter.hitConnected = false;
      if (moveInput === 'special') {
        fighter.position.x += fighter.facing * 0.32;
      }
      applyGravity(fighter, dt);
      return;
    }
  }

  const forward = input.right ? 1 : input.left ? -1 : 0;
  const sidestep = input.up ? -1 : input.down ? 1 : 0;
  const forwardTowardOpponent = Math.sign(opponent.position.x - fighter.position.x) || fighter.facing;
  const speedScale = input.block ? 0.42 : 1;

  if (input.block) {
    fighter.state = 'block';
  } else if (sidestep !== 0) {
    fighter.state = 'sidestep';
  } else if (forward !== 0) {
    fighter.state = 'walk';
  } else {
    fighter.state = 'idle';
  }

  if (forward !== 0) {
    fighter.position.x += forward * fighter.character.stats.speed * speedScale * dt * forwardTowardOpponent;
  }
  if (sidestep !== 0) {
    fighter.position.z += sidestep * fighter.character.stats.sidestepSpeed * speedScale * dt;
  }

  fighter.position.x = clamp(fighter.position.x, -ARENA_LIMIT_X, ARENA_LIMIT_X);
  fighter.position.z = clamp(fighter.position.z, -ARENA_LIMIT_Z, ARENA_LIMIT_Z);
  applyGravity(fighter, dt);
}

function resolveHits(match: MatchSnapshot) {
  const [a, b] = match.fighters;
  tryHit(match, a, b);
  tryHit(match, b, a);
}

function tryHit(match: MatchSnapshot, attacker: FighterRuntime, defender: FighterRuntime) {
  const move = attacker.currentMove;
  if (!move || attacker.state !== 'attack' || attacker.hitConnected) return;
  const elapsed = move.startup + move.active + move.recovery - attacker.actionTimer;
  if (elapsed < move.startup || elapsed > move.startup + move.active) return;
  const dx = Math.abs(defender.position.x - attacker.position.x);
  const dz = Math.abs(defender.position.z - attacker.position.z);
  const laneWidth = Math.max(0.6, move.hitbox.size[0] + defender.character.hurtboxes[0].size[0] * 0.5);
  if (dx > move.range || dz > laneWidth) return;

  const blocked = defender.state === 'block' && defender.facing === -attacker.facing;
  attacker.hitConnected = true;
  match.lastHitId += 1;
  match.cameraShake = blocked ? 0.18 : 0.38;

  if (blocked) {
    defender.hp = Math.max(0, defender.hp - move.blockDamage);
    defender.blockFlash = 1;
    defender.position.x += attacker.facing * move.push * 0.14;
    return;
  }

  defender.hp = Math.max(0, defender.hp - move.damage);
  defender.hitFlash = 1;
  defender.stunTimer = move.knockdown ? 0.46 : 0.14;
  defender.actionTimer = move.knockdown ? 0.46 : 0;
  defender.currentMove = null;
  defender.state = move.knockdown ? 'knockdown' : 'hit';
  defender.position.x += attacker.facing * move.push * 0.28;
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
  });
}

function resetRound(match: MatchSnapshot) {
  const rounds: [number, number] = [match.fighters[0].roundsWon, match.fighters[1].roundsWon];
  const [p1Character, p2Character] = [match.fighters[0].character, match.fighters[1].character];
  match.fighters = [createFighter(1, p1Character, -START_DISTANCE / 2), createFighter(2, p2Character, START_DISTANCE / 2)];
  match.fighters[0].roundsWon = rounds[0];
  match.fighters[1].roundsWon = rounds[1];
  match.round += 1;
  match.timer = ROUND_TIME;
  match.countdown = 2.4;
  match.phase = 'intro';
  match.message = `ROUND ${match.round}`;
}

function resolveFacing(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  p1.facing = p1.position.x <= p2.position.x ? 1 : -1;
  p2.facing = p2.position.x <= p1.position.x ? 1 : -1;
}

function resolveBodyCollision(match: MatchSnapshot) {
  const [p1, p2] = match.fighters;
  const minDistance = 0.72;
  const dx = p2.position.x - p1.position.x;
  if (Math.abs(dx) < minDistance) {
    const correction = (minDistance - Math.abs(dx)) / 2;
    const direction = dx >= 0 ? 1 : -1;
    p1.position.x -= correction * direction;
    p2.position.x += correction * direction;
  }
  p1.position.x = clamp(p1.position.x, -ARENA_LIMIT_X, ARENA_LIMIT_X);
  p2.position.x = clamp(p2.position.x, -ARENA_LIMIT_X, ARENA_LIMIT_X);
}

function makeAiInput(ai: FighterRuntime, opponent: FighterRuntime, timer: number): InputFrame {
  const input = emptyInputFrame();
  const distance = Math.abs(opponent.position.x - ai.position.x);
  const laneDiff = opponent.position.z - ai.position.z;
  const profile = ai.character.aiProfile;
  const beat = Math.sin(timer * 2.7 + ai.hp * 0.03);

  if (distance > profile.spacing) input.right = true;
  if (distance < profile.spacing * 0.72) input.left = true;
  if (Math.abs(laneDiff) > 0.45) {
    if (laneDiff < 0) input.up = true;
    if (laneDiff > 0) input.down = true;
  } else if (beat > 0.82) {
    input.up = true;
  }

  const danger = opponent.state === 'attack' && distance < 1.9;
  input.block = danger && beat < profile.guard;
  if (!input.block && distance < 1.95 && beat > 1 - profile.aggression) {
    input.special = beat > 1 - profile.specialChance;
    input.heavy = !input.special && beat > 0.9;
    input.kick = !input.special && !input.heavy && beat > 0.78;
    input.jab = !input.special && !input.heavy && !input.kick;
  }

  return input;
}

function applyGravity(fighter: FighterRuntime, dt: number) {
  if (fighter.position.y > 0 || fighter.velocityY !== 0) {
    fighter.velocityY -= fighter.character.stats.gravity * dt;
    fighter.position.y += fighter.velocityY * dt;
    if (fighter.position.y <= 0) {
      fighter.position.y = 0;
      fighter.velocityY = 0;
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
      currentMove: fighter.currentMove
    })) as [FighterRuntime, FighterRuntime]
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function activeMoveProgress(fighter: FighterRuntime): number {
  const move: MoveDefinition | null = fighter.currentMove;
  if (!move) return 0;
  const total = move.startup + move.active + move.recovery;
  return 1 - fighter.actionTimer / total;
}
