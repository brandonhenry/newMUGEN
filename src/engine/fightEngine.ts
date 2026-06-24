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

const ARENA_LIMIT_X = 5.1;
const ARENA_LIMIT_Z = 3.6;
const ROUND_TIME = 60;
const START_DISTANCE = 2.6;
const ROUND_OVER_DELAY = 2.1;
const COMBO_WINDOW = 0.58;

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
  mode: MatchMode
): MatchSnapshot {
  return {
    fighters: [createFighter(1, p1, -START_DISTANCE / 2), createFighter(2, p2, START_DISTANCE / 2)],
    stage,
    mode,
    timer: ROUND_TIME,
    round: 1,
    countdown: 0,
    winnerSlot: null,
    phase: 'fighting',
    message: '',
    lastHitId: 0,
    cameraShake: 0
  };
}

export function stepMatch(match: MatchSnapshot, p1Input: InputFrame, p2Input: InputFrame, dt: number): MatchSnapshot {
  const next = cloneMatch(match);
  next.cameraShake = 0;

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

  const input1 = next.mode === 'cpu' ? makeAiInput(next.fighters[0], next.fighters[1], next.timer) : p1Input;
  const input2 = next.mode === 'ai' || next.mode === 'cpu' ? makeAiInput(next.fighters[1], next.fighters[0], next.timer) : p2Input;
  applyFighterStep(next, 0, input1, dt);
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
    facingYaw: slot === 1 ? Math.PI / 2 : -Math.PI / 2,
    state: 'idle',
    sidestepTimer: 0,
    sidestepDirection: 0,
    jumpInputHeld: false,
    currentMove: null,
    actionTimer: 0,
    hitConnected: false,
    commandHistory: [],
    previousDirectionToken: 'N',
    comboTimer: 0,
    comboStep: 0,
    comboSequence: [],
    previousAttackInputs: { jab: false, kick: false, heavy: false, special: false },
    wasCrouching: false,
    roundsWon: 0,
    stunTimer: 0,
    blockFlash: 0,
    hitFlash: 0
  };
}

function applyFighterStep(match: MatchSnapshot, fighterIndex: 0 | 1, input: InputFrame, dt: number) {
  const fighter = match.fighters[fighterIndex];
  const opponent = match.fighters[fighterIndex === 0 ? 1 : 0];
  const jumpPressed = input.up && !fighter.jumpInputHeld;
  fighter.jumpInputHeld = input.up;
  fighter.blockFlash = 0;
  fighter.hitFlash = 0;
  fighter.comboTimer = Math.max(0, fighter.comboTimer - dt);
  fighter.sidestepTimer = Math.max(0, fighter.sidestepTimer - dt);
  updateCommandHistory(fighter, opponent, input, dt);
  const freshMoveInput = getFreshMoveInput(fighter, input);

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
    updateAttackInputMemory(fighter, input);
    return;
  }

  if (fighter.state === 'attack' && fighter.actionTimer > 0) {
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

  const moveInput = freshMoveInput;
  if (moveInput) {
    startComboAttack(fighter, opponent, input, moveInput);
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
  const jumping = fighter.position.y > 0 || fighter.velocityY !== 0;
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

function canComboCancel(fighter: FighterRuntime) {
  const move = fighter.currentMove;
  if (!move) return false;
  const elapsed = move.startup + move.active + move.recovery - fighter.actionTimer;
  return elapsed >= move.startup;
}

function startComboAttack(fighter: FighterRuntime, opponent: FighterRuntime, input: InputFrame, moveInput: MoveInput) {
  const baseMove = fighter.character.moves.find((candidate) => candidate.input === moveInput);
  if (!baseMove) return;

  const command = findConfiguredCommand(fighter, opponent, input, moveInput);
  const route = getComboRoute(fighter, opponent, input);
  const continuing = fighter.comboTimer > 0 || (fighter.state === 'attack' && fighter.comboStep > 0);
  const comboStep = continuing ? Math.min(5, fighter.comboStep + 1) : 1;
  const sequence = continuing ? [...fighter.comboSequence, moveInput].slice(-6) : [moveInput];
  const move = buildComboMove(baseMove, moveInput, route, comboStep, sequence, command);

  fighter.currentMove = move;
  fighter.state = 'attack';
  fighter.actionTimer = move.startup + move.active + move.recovery;
  fighter.hitConnected = false;
  fighter.comboTimer = COMBO_WINDOW;
  fighter.comboStep = comboStep;
  fighter.comboSequence = sequence;

  const forwardNudge = route.toward ? 0.18 : route.away ? -0.08 : 0;
  const specialNudge = moveInput === 'special' ? 0.18 : 0;
  if (forwardNudge || specialNudge) {
    moveAlongOpponentAxis(fighter, opponent, forwardNudge + specialNudge);
  }
}

function buildComboMove(
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

  return {
    ...baseMove,
    id: command?.animationKey ?? baseMove.id,
    label: command ? `${command.notation} ${limbNames[moveInput]}` : `${route.label} ${limbNames[moveInput]} ${comboStep}`,
    command: command?.notation,
    notation: command?.notation,
    animationKey: command?.animationKey,
    comboKey: command ? `${command.notation}:${sequence.join('-')}` : `${route.key}:${sequence.join('-')}`,
    comboStep,
    route: route.key,
    startup: Math.max(0.06, baseMove.startup * speedScale - Math.min(0.04, (comboStep - 1) * 0.01)),
    active: baseMove.active + (comboStep > 2 ? 0.03 : 0),
    recovery: Math.max(0.16, baseMove.recovery * (route.away ? 0.92 : 1) - Math.min(0.07, (comboStep - 1) * 0.015)),
    damage: Math.round(baseMove.damage * damageScale),
    blockDamage: Math.max(baseMove.blockDamage, Math.round(baseMove.blockDamage * (1 + sequenceBonus * 0.55))),
    range: baseMove.range + rangeBonus,
    push: baseMove.push + pushBonus,
    hitstun: baseMove.hitstun + Math.min(0.22, comboStep * 0.035) + (route.launcher ? 0.08 : 0),
    knockdown: baseMove.knockdown || comboStep >= 4 || route.launcher,
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
}

type CommandCandidate = {
  notation: string;
  animationKey: string;
};

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
  const launcher = input.up || fighter.position.y > 0 || fighter.velocityY > 0;

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
  const elapsed = move.startup + move.active + move.recovery - attacker.actionTimer;
  if (elapsed < move.startup || elapsed > move.startup + move.active) return;
  const dx = defender.position.x - attacker.position.x;
  const dz = defender.position.z - attacker.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance > move.range) return;

  const blocked = defender.state === 'block' && defender.facing === -attacker.facing;
  attacker.hitConnected = true;
  const pushX = distance > 0 ? dx / distance : attacker.facing;
  const pushZ = distance > 0 ? dz / distance : 0;

  if (blocked) {
    defender.hp = Math.max(0, defender.hp - move.blockDamage);
    defender.position.x += pushX * move.push * 0.14;
    defender.position.z += pushZ * move.push * 0.14;
    return;
  }

  defender.hp = Math.max(0, defender.hp - move.damage);
  defender.stunTimer = move.knockdown ? 0.46 : 0.14;
  defender.actionTimer = move.knockdown ? 0.46 : 0;
  defender.currentMove = null;
  defender.state = move.knockdown ? 'knockdown' : 'hit';
  defender.position.x += pushX * move.push * 0.28;
  defender.position.z += pushZ * move.push * 0.28;
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
  match.countdown = 0;
  match.phase = 'fighting';
  match.message = '';
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

function makeAiInput(ai: FighterRuntime, opponent: FighterRuntime, timer: number): InputFrame {
  const input = emptyInputFrame();
  const distance = Math.abs(opponent.position.x - ai.position.x);
  const laneDiff = opponent.position.z - ai.position.z;
  const profile = ai.character.aiProfile;
  const beat = Math.sin(timer * 2.7 + ai.hp * 0.03);

  const opponentSide = getOpponentSideSign(ai, opponent);
  const towardKey = opponentSide > 0 ? 'right' : 'left';
  const awayKey = opponentSide > 0 ? 'left' : 'right';

  if (distance > profile.spacing) input[towardKey] = true;
  if (distance < profile.spacing * 0.72) input[awayKey] = true;
  if (Math.abs(laneDiff) > 0.45) {
    if (laneDiff < 0) input.sidewalkUp = true;
    if (laneDiff > 0) input.sidewalkDown = true;
  } else if (beat > 0.82) {
    input.sidestepUp = true;
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
