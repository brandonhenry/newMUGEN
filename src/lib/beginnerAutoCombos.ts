import type {
  BeginnerComboGesture,
  BeginnerComboMovement,
  BeginnerComboRoute,
  BeginnerComboRouteStep,
  CharacterDefinition,
  InputFrame,
  MoveInput
} from '../types';

export const BEGINNER_AUTO_COMBO_INPUTS: MoveInput[] = ['jab', 'jab', 'jab'];
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
  'special+light': ['Special+Light'],
  'special+medium': ['Special+Medium'],
  'special+heavy': ['Special+Heavy']
};

export function resolveBeginnerGesture(input: InputFrame, moveInput: MoveInput): BeginnerComboGesture {
  if (input.special && moveInput !== 'special') {
    if (moveInput === 'jab') return 'special+light';
    if (moveInput === 'heavy') return 'special+medium';
    if (moveInput === 'kick') return 'special+heavy';
  }
  return moveInputGesture[moveInput];
}

export function beginnerGestureNotation(gesture: BeginnerComboGesture) {
  return gestureNotation[gesture];
}

export function beginnerGestureActions(gesture: BeginnerComboGesture): MoveInput[] {
  if (gesture === 'special+light') return ['special', 'jab'];
  if (gesture === 'special+medium') return ['special', 'heavy'];
  if (gesture === 'special+heavy') return ['special', 'kick'];
  if (gesture === 'light') return ['jab'];
  if (gesture === 'medium') return ['heavy'];
  if (gesture === 'heavy') return ['kick'];
  return ['special'];
}

export function resolveBeginnerRouteStep(
  character: CharacterDefinition,
  confirmedGestures: BeginnerComboGesture[],
  gesture: BeginnerComboGesture,
  availableKi: number,
  preferredRouteId?: string | null
): BeginnerRouteResolution | null {
  const prefix = [...confirmedGestures, gesture];
  const routes = character.beginnerComboRoutes ?? [];
  const candidates = routes.filter((route) => prefix.every((item, index) => route.gestures[index] === item));
  const route = candidates.find((candidate) => candidate.id === preferredRouteId) ?? candidates[0];
  if (!route) return null;
  const stepIndex = prefix.length - 1;
  const step = route.steps[stepIndex];
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
    usePoweredKi: canUsePoweredKi
  };
}

export function beginnerMovementSatisfied(
  movement: BeginnerComboMovement | undefined,
  state: { dashForwardFrames: number; backHopFrames: number; state: string; position: { y: number }; velocityY: number },
  input: InputFrame
) {
  if (!movement) return true;
  if (movement === 'dashForward') return input.dashForward || state.dashForwardFrames > 0;
  if (movement === 'dashBack') return input.dashBack || state.backHopFrames > 0;
  if (movement === 'jump') return input.jump || state.state === 'jump' || state.position.y > 0 || state.velocityY !== 0;
  return !input.left && !input.right && !input.up && !input.down &&
    !input.dashForward && !input.dashBack && !input.jump;
}

export function resolveBeginnerAutoComboPlan(
  character: CharacterDefinition,
  options: { ki?: number; family?: 'light' | 'medium' | 'heavy' | 'special' } = {}
): BeginnerAutoComboPlan {
  const family = options.family ?? 'light';
  const route = (character.beginnerComboRoutes ?? []).find((candidate) => candidate.id.endsWith(`${family}-core`));
  const finisher = route?.steps[route.steps.length - 1];
  const availableKi = options.ki ?? 0;
  const usesKi = family !== 'light' && Boolean(finisher) && availableKi >= Math.max(0, finisher?.kiCost ?? BEGINNER_AUTO_COMBO_KI_COST);
  return {
    inputs: route?.steps.map((step) => step.input) ?? BEGINNER_AUTO_COMBO_INPUTS,
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
