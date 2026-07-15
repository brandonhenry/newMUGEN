import type {
  ActionName,
  BeginnerComboGesture,
  BeginnerComboMovement,
  BeginnerComboRoute,
  BeginnerComboRouteStep,
  CharacterDefinition,
  InputFrame,
  MoveInput
} from '../types';

export const BEGINNER_AUTO_COMBO_INPUTS: MoveInput[] = Array(8).fill('jab');
export const BEGINNER_AUTO_COMBO_KI_COST = 35;
export const BEGINNER_SPECIAL_CHORD_GRACE_FRAMES = 6;

export type BeginnerAutoComboPlan = {
  inputs: MoveInput[];
  finisherCommand?: string;
  finisherLabel: string;
  finisherStep?: BeginnerComboRouteStep;
  sourceRoute?: BeginnerComboRoute;
  estimatedDamage?: number;
  usesKi: boolean;
};

export type BeginnerRouteResolution = {
  gesture: BeginnerComboGesture;
  route: BeginnerComboRoute;
  step: BeginnerComboRouteStep;
  stepIndex: number;
  moveInput: MoveInput;
  forcedCommand?: string;
  usePoweredKi: boolean;
  nextGraphNodeId: string;
  damageScale: number;
  movementBefore?: BeginnerComboMovement;
};

const moveInputGesture: Record<MoveInput, BeginnerComboGesture> = {
  jab: 'light',
  heavy: 'medium',
  kick: 'heavy',
  special: 'special'
};

const gestureNotation: Record<BeginnerComboGesture, string[]> = {
  light: ['Light'],
  medium: ['Medium'],
  heavy: ['Heavy'],
  special: ['Special'],
  'forward+light': ['F', 'Light'],
  'forward+medium': ['F', 'Medium'],
  'forward+heavy': ['F', 'Heavy'],
  'forward+special': ['F', 'Special'],
  'down+light': ['D', 'Light'],
  'down+medium': ['D', 'Medium'],
  'down+heavy': ['D', 'Heavy'],
  'down+special': ['D', 'Special'],
  'down-forward+light': ['D/F', 'Light'],
  'down-forward+medium': ['D/F', 'Medium'],
  'down-forward+heavy': ['D/F', 'Heavy'],
  'down-forward+special': ['D/F', 'Special'],
  'special+light': ['Special+Light'],
  'special+medium': ['Special+Medium'],
  'special+heavy': ['Special+Heavy'],
  'forward+special+light': ['F', 'Special+Light'],
  'forward+special+medium': ['F', 'Special+Medium'],
  'forward+special+heavy': ['F', 'Special+Heavy'],
  'down+special+light': ['D', 'Special+Light'],
  'down+special+medium': ['D', 'Special+Medium'],
  'down+special+heavy': ['D', 'Special+Heavy'],
  'down-forward+special+light': ['D/F', 'Special+Light'],
  'down-forward+special+medium': ['D/F', 'Special+Medium'],
  'down-forward+special+heavy': ['D/F', 'Special+Heavy']
};

export function resolveBeginnerGesture(input: InputFrame, moveInput: MoveInput, forwardDirection = 0): BeginnerComboGesture {
  const direction = input.down && forwardDirection > 0 ? 'down-forward' : input.down ? 'down' : forwardDirection > 0 ? 'forward' : '';
  const directionPrefix = direction ? `${direction}+` : '';
  if (input.special && moveInput !== 'special') {
    if (moveInput === 'jab') return `${directionPrefix}special+light` as BeginnerComboGesture;
    if (moveInput === 'heavy') return `${directionPrefix}special+medium` as BeginnerComboGesture;
    if (moveInput === 'kick') return `${directionPrefix}special+heavy` as BeginnerComboGesture;
  }
  return `${directionPrefix}${moveInputGesture[moveInput]}` as BeginnerComboGesture;
}

export function beginnerGestureNotation(gesture: BeginnerComboGesture) {
  return gestureNotation[gesture];
}

export function beginnerGestureActions(gesture: BeginnerComboGesture): ActionName[] {
  const actions: ActionName[] = [];
  if (gesture.startsWith('down-forward+')) actions.push('down', 'right');
  else if (gesture.startsWith('down+')) actions.push('down');
  else if (gesture.startsWith('forward+')) actions.push('right');
  const attack = gesture.replace(/^(down-forward|down|forward)\+/, '');
  if (attack === 'special+light') actions.push('special', 'jab');
  else if (attack === 'special+medium') actions.push('special', 'heavy');
  else if (attack === 'special+heavy') actions.push('special', 'kick');
  else if (attack === 'light') actions.push('jab');
  else if (attack === 'medium') actions.push('heavy');
  else if (attack === 'heavy') actions.push('kick');
  else actions.push('special');
  return actions;
}

export function beginnerGestureAttackClass(gesture: BeginnerComboGesture): 'light' | 'medium' | 'heavy' | null {
  if (gesture.endsWith('light')) return 'light';
  if (gesture.endsWith('medium')) return 'medium';
  if (gesture.endsWith('heavy')) return 'heavy';
  return null;
}

export function beginnerRouteSteps(character: CharacterDefinition, route: BeginnerComboRoute): BeginnerComboRouteStep[] {
  if (route.steps?.length) return route.steps;
  return (route.stepKeys ?? [])
    .map((key) => character.beginnerComboMoves?.[key])
    .filter((step): step is BeginnerComboRouteStep => Boolean(step));
}

export function resolveBeginnerRouteStep(
  character: CharacterDefinition,
  confirmedGestures: BeginnerComboGesture[],
  gesture: BeginnerComboGesture,
  availableKi: number,
  preferredRouteId?: string | null,
  graphNodeId?: string | null
): BeginnerRouteResolution | null {
  const prefix = [...confirmedGestures, gesture];
  const routes = character.beginnerComboRoutes ?? [];
  const graph = character.beginnerComboGraph;
  const currentNode = graph?.nodes[graphNodeId ?? graph.rootId];
  const nextGraphNodeId = currentNode?.edges[gesture];
  const nextNode = nextGraphNodeId ? graph?.nodes[nextGraphNodeId] : undefined;
  const candidates = nextNode
    ? routes.filter((route) => route.id === nextNode.routeId)
    : routes.filter((route) => prefix.every((item, index) => route.gestures[index] === item));
  const route = candidates.find((candidate) => candidate.id === preferredRouteId) ?? candidates[0];
  if (!route) return null;
  const stepIndex = nextNode ? nextNode.depth - 1 : prefix.length - 1;
  const step = beginnerRouteSteps(character, route)[stepIndex];
  if (!step) return null;
  const authoredKiCost = Math.max(0, Math.round(step.kiCost ?? BEGINNER_AUTO_COMBO_KI_COST));
  const canUseAuthoredKi = Boolean(step.kiCommand) && availableKi >= authoredKiCost;
  const canUsePoweredKi = !canUseAuthoredKi && Boolean(step.poweredKiFallback) && availableKi >= BEGINNER_AUTO_COMBO_KI_COST;
  return {
    gesture,
    route,
    step,
    stepIndex,
    moveInput: canUseAuthoredKi && step.kiCommand ? commandMoveInput(step.kiCommand) : step.input,
    forcedCommand: canUseAuthoredKi ? step.kiCommand : step.command,
    usePoweredKi: canUsePoweredKi,
    nextGraphNodeId: nextGraphNodeId ?? `${prefix.length}:${prefix.join('>')}`,
    damageScale: Math.min(0.6, Math.max(0.1, route.damageScale ?? 0.6)),
    movementBefore: canUseAuthoredKi ? step.kiMovementBefore ?? step.movementBefore : step.movementBefore
  };
}

export function resolveBeginnerSafeEnder(
  character: CharacterDefinition,
  gesture: BeginnerComboGesture,
  availableKi: number
): BeginnerRouteResolution | null {
  const attackClass = beginnerGestureAttackClass(gesture);
  if (!attackClass) return null;
  const route = (character.beginnerComboRoutes ?? []).find((candidate) => candidate.id.endsWith(`${attackClass}-core`));
  const routeSteps = route ? beginnerRouteSteps(character, route) : [];
  const stepIndex = Math.min(7, routeSteps.length - 1);
  const step = routeSteps[stepIndex];
  if (!route || !step) return null;
  const authoredKiCost = Math.max(0, Math.round(step.kiCost ?? BEGINNER_AUTO_COMBO_KI_COST));
  const canUseAuthoredKi = Boolean(step.kiCommand) && availableKi >= authoredKiCost;
  const canUsePoweredKi = !canUseAuthoredKi && Boolean(step.poweredKiFallback) && availableKi >= BEGINNER_AUTO_COMBO_KI_COST;
  return {
    gesture,
    route,
    step,
    stepIndex,
    moveInput: canUseAuthoredKi && step.kiCommand ? commandMoveInput(step.kiCommand) : step.input,
    forcedCommand: canUseAuthoredKi ? step.kiCommand : step.command,
    usePoweredKi: canUsePoweredKi,
    nextGraphNodeId: character.beginnerComboGraph?.rootId ?? 'n0',
    damageScale: Math.min(0.6, Math.max(0.1, route.damageScale ?? 0.6)),
    movementBefore: canUseAuthoredKi ? step.kiMovementBefore ?? step.movementBefore : step.movementBefore
  };
}

export function beginnerMovementSatisfied(
  movement: BeginnerComboMovement | undefined,
  state: { dashForwardFrames: number; backHopFrames: number; state: string; position: { y: number }; velocityY: number; sidestepDirection?: number },
  input: InputFrame
) {
  if (!movement) return true;
  if (movement === 'dashForward') return input.dashForward || state.dashForwardFrames > 0;
  if (movement === 'dashBack') return input.dashBack || state.backHopFrames > 0;
  if (movement === 'jump') return input.jump || state.state === 'jump' || state.position.y > 0 || state.velocityY !== 0;
  if (movement === 'crouch') return input.down || state.state === 'crouch' || state.state === 'crouchBlock';
  if (movement === 'sidestepUp') return input.sidestepUp || input.sidewalkUp || state.sidestepDirection === -1;
  if (movement === 'sidestepDown') return input.sidestepDown || input.sidewalkDown || state.sidestepDirection === 1;
  return !input.left && !input.right && !input.up && !input.down &&
    !input.dashForward && !input.dashBack && !input.jump;
}

export function resolveBeginnerAutoComboPlan(
  character: CharacterDefinition,
  options: { ki?: number; family?: 'light' | 'medium' | 'heavy' | 'special' } = {}
): BeginnerAutoComboPlan {
  const family = options.family ?? 'light';
  const route = (character.beginnerComboRoutes ?? []).find((candidate) => candidate.id.endsWith(`${family}-core`));
  const routeSteps = route ? beginnerRouteSteps(character, route) : [];
  const finisher = routeSteps[routeSteps.length - 1];
  const availableKi = options.ki ?? 0;
  const usesKi = family !== 'light' && Boolean(finisher) && availableKi >= Math.max(0, finisher?.kiCost ?? BEGINNER_AUTO_COMBO_KI_COST);
  return {
    inputs: routeSteps.map((step) => step.input) ?? BEGINNER_AUTO_COMBO_INPUTS,
    finisherCommand: usesKi ? finisher?.kiCommand ?? finisher?.command : finisher?.command,
    finisherLabel: finisher?.label ?? baseSpecialLabel(character),
    finisherStep: finisher,
    sourceRoute: route,
    estimatedDamage: undefined,
    usesKi
  };
}

export function hasNamedBeginnerAutoComboFinisher(character: CharacterDefinition, options: { ki?: number } = {}) {
  const plan = resolveBeginnerAutoComboPlan(character, options);
  return Boolean(plan.finisherStep && !/frame link/i.test(plan.finisherLabel));
}

function commandMoveInput(command: string): MoveInput {
  const buttons = [...command.matchAll(/[1-4]/g)];
  const button = buttons[buttons.length - 1]?.[0] ?? '1';
  if (button === '2') return 'heavy';
  if (button === '3') return 'kick';
  if (button === '4') return 'special';
  return 'jab';
}

function baseSpecialLabel(character: CharacterDefinition) {
  return character.moves.find((move) => move.input === 'special' && !move.command)?.label ?? 'Special';
}
