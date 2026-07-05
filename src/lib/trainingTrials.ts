import type { ActionName, CharacterDefinition, FighterRuntime, ImpactSparkEvent, InputFrame, MatchSnapshot, MoveInput } from '../types';
import { emptyInputFrame } from '../types';
import { commandRouteFamily, commandToActions as commandRouteToActions } from './commandRoutes';
import {
  comboTrialCategoryLabels,
  comboTrialStepMatchesImpact,
  generateComboTrials,
  resolveMoveRoutes,
  type ComboTrialStep,
  type GeneratedComboRoute
} from './comboRoutes';

export type TrainingTrialMode = 'free' | 'basics' | 'combos' | 'online';
export type TrainingTrialCategory = 'movement' | 'defense' | 'punish' | 'jumpIn' | 'corner' | 'crouch' | 'ki' | 'launcher' | 'tornado' | 'oki' | 'combo';
export type TrainingTrialStepStatus = 'pending' | 'current' | 'early' | 'perfect' | 'late' | 'missed' | 'confirmed' | 'correct';
export type TrainingTrialTimingRating = 'Ready' | 'Perfect' | 'Too early' | 'Late' | 'Confirmed' | 'Missed';
export type TrainingDummyScript = 'idle' | 'attack' | 'guard' | 'lowGuard' | 'getup' | 'counterHit' | 'kiAttack' | 'whiff' | 'jumpIn';

export type TrainingTrialStepKind = 'input' | 'state' | 'impact';

export type TrainingTrialStep = {
  id: string;
  routeKey?: string;
  animationKey?: string;
  notation: string[];
  label: string;
  input?: MoveInput;
  command?: string;
  actions: ActionName[];
  kind: TrainingTrialStepKind;
  targetFrame?: number;
  windowBefore?: number;
  windowAfter?: number;
  requireState?: FighterRuntime['state'];
  requireDummyState?: FighterRuntime['state'];
  expectImpact?: ComboTrialStep['expect'];
  expectImpactKinds?: ImpactSparkEvent['kind'][];
  expectImpactAttackerSlot?: 1 | 2;
  expectImpactDefenderSlot?: 1 | 2;
  requireImpactKiBurst?: boolean;
  requireAirborneDefender?: boolean;
  missAfterFrame?: number;
  counterHit?: boolean;
  reason?: string;
};

export type TrainingTrialSetup = {
  stageId: string;
  dummyCharacterId?: string;
  dummyScript: TrainingDummyScript;
  p1Position?: { x: number; z: number };
  p2Position?: { x: number; z: number };
  p1Ki?: number;
  p2Ki?: number;
  corner?: 'left' | 'right';
};

export type TrainingPreviewFrame = {
  frame: number;
  duration: number;
  actions: ActionName[];
};

export type TrainingTrialDefinition = {
  id: string;
  title: string;
  characterId: string;
  category: TrainingTrialCategory;
  mode: Exclude<TrainingTrialMode, 'free' | 'online'>;
  difficulty: number;
  stageId: string;
  dummyCharacterId?: string;
  setup: TrainingTrialSetup;
  steps: TrainingTrialStep[];
  lesson: string;
  zoroLine: string;
  successText: string;
  previewScript: TrainingPreviewFrame[];
  sourceComboRoute?: GeneratedComboRoute;
};

export type TrainingTrialProgress = {
  stepIndex: number;
  stepFrame: number;
  statuses: TrainingTrialStepStatus[];
  ratings: TrainingTrialTimingRating[];
  attempts: number;
  completed: boolean;
  lastFeedback: string;
  preview: boolean;
};

export const TRAINING_TRIAL_CATALOG_VERSION = 1;
export const TRAINING_TRIAL_STORAGE_KEY = `kore.trainingTrials.v${TRAINING_TRIAL_CATALOG_VERSION}`;

const actionToNotation: Partial<Record<ActionName, string>> = {
  up: 'u',
  down: 'd',
  left: 'b',
  right: 'f',
  dashForward: 'F',
  dashBack: 'b,b',
  sidestepUp: 'SSL',
  sidestepDown: 'SSR',
  sidewalkUp: 'SSL',
  sidewalkDown: 'SSR',
  jab: '1',
  heavy: '2',
  kick: '3',
  special: '4',
  charge: 'O',
  block: 'B'
};

const inputToAction: Record<MoveInput, ActionName> = {
  jab: 'jab',
  heavy: 'heavy',
  kick: 'kick',
  special: 'special'
};

const inputToButton: Record<MoveInput, string> = {
  jab: '1',
  heavy: '2',
  kick: '3',
  special: '4'
};

const categoryLabels: Record<TrainingTrialCategory, string> = {
  movement: 'Movement',
  defense: 'Defense',
  punish: 'Punish',
  jumpIn: 'Jump-In',
  corner: 'Corner',
  crouch: 'Crouch',
  ki: 'Ki',
  launcher: 'Launcher',
  tornado: 'Tornado',
  oki: 'Oki',
  combo: 'Combo'
};

export const trainingTrialCategoryLabels = categoryLabels;
export const trainingTrialModes: TrainingTrialMode[] = ['free', 'basics', 'combos'];

export function generateTrainingTrials(character: CharacterDefinition, roster: CharacterDefinition[] = []): TrainingTrialDefinition[] {
  return [
    ...generateBasicTrainingTrials(character, roster),
    ...generateComboTrainingTrials(character)
  ];
}

export function generateBasicTrainingTrials(character: CharacterDefinition, roster: CharacterDefinition[] = []): TrainingTrialDefinition[] {
  if (!isRoutableCharacter(character)) return [];
  const routes = resolveMoveRoutes(character);
  const dummy = pickDummy(character, roster);
  const trials: TrainingTrialDefinition[] = [
    makeSimpleTrial(character, dummy, 'movement', 'movement:walk', 'Walk In', ['f'], ['right'], 'Close space without swinging.', 'First, take the space. No wasted cuts.', 'Step forward and hold your ground.', { requireState: 'walk' }),
    makeSimpleTrial(character, dummy, 'movement', 'movement:dash', 'Dash In', ['F'], ['dashForward'], 'Dash to punish distance quickly.', 'When the opening is far, move first.', 'Dash forward cleanly.', { requireState: 'walk' }),
    makeSimpleTrial(character, dummy, 'movement', 'movement:back-hop', 'Back Hop', ['b,b'], ['dashBack'], 'Back-back is a quick retreat for neutral spacing and whiff bait. Use it to make short attacks miss, then whiff punish, but it is unsafe if the enemy reads it or hits you during startup or airtime.', 'Retreat with care. Air has no guard.', 'Back hop complete.', { requireState: 'jump' }),
    makeSimpleTrial(character, dummy, 'movement', 'movement:sidestep', 'Sidestep Line', ['SSL'], ['sidestepUp'], 'Step off the center line to move or defend against linear pressure.', "Don't stand where the blade is falling.", 'Sidestep once.'),
    makeSimpleTrial(character, dummy, 'defense', 'defense:block', 'Standing Guard', ['B'], ['block'], 'Standing guard is your default answer to high, special, and unknown pressure.', 'Guard first. Then cut.', 'Hold block.', { dummyScript: 'attack', requireState: 'block' }),
    makeSimpleTrial(character, dummy, 'defense', 'defense:crouch-block', 'Low Guard', ['d', 'B'], ['down', 'block'], 'Crouch block low pressure; standing guard loses to lows.', 'Low strikes need low guard. Simple.', 'Crouch block.', { dummyScript: 'attack', requireState: 'crouchBlock' }),
    makeSimpleTrial(character, dummy, 'defense', 'defense:duck-high', 'Duck Highs', ['d'], ['down'], 'Crouch without blocking to duck high strikes and throw-like pressure.', 'Some attacks pass over a low stance.', 'Duck under the high threat.', { dummyScript: 'attack', requireState: 'crouch' }),
    makeSimpleTrial(character, dummy, 'defense', 'defense:sidestep-linear', 'Sidestep Linear', ['SSL'], ['sidestepUp'], 'Sidestep is defense against straight, non-tracking attacks; homing pressure must be guarded instead.', 'A straight cut can miss if you leave the line.', 'Sidestep the linear threat.', { dummyScript: 'attack', requireState: 'sidestep' }),
    makeSequenceTrial(
      character,
      dummy,
      'defense',
      'defense:guard-switch',
      'Guard Switch',
      [
        {
          id: 'stand',
          notation: ['B'],
          label: 'Stand Guard',
          actions: ['block'],
          requireState: 'block',
          reason: 'Stand block covers high, special, and unknown pressure.'
        },
        {
          id: 'low',
          notation: ['d', 'B'],
          label: 'Low Guard',
          actions: ['down', 'block'],
          requireState: 'crouchBlock',
          reason: 'Switch to crouch block when the threat is low.'
        }
      ],
      'Blocking is a read: stand guard for highs or unknowns, crouch block lows, and crouch without block to duck highs or throws.',
      'High blade, high guard. Low blade, low guard.',
      'Guard switch complete.',
      { dummyScript: 'attack' }
    ),
    makeSequenceTrial(
      character,
      dummy,
      'defense',
      'defense:neutral-control',
      'Neutral Control',
      [
        {
          id: 'back-hop',
          notation: ['b,b'],
          label: 'Back Hop',
          actions: ['dashBack'],
          requireState: 'jump',
          reason: 'Back-hop creates space and can bait short attacks into whiffing.'
        },
        {
          id: 'sidestep',
          notation: ['SSL'],
          label: 'Sidestep',
          actions: ['sidestepUp'],
          requireState: 'sidestep',
          reason: 'Sidestep linear, non-tracking pressure instead of blocking every approach.'
        },
        {
          id: 'block',
          notation: ['B'],
          label: 'Stand Block',
          actions: ['block'],
          requireState: 'block',
          reason: 'Block unknown, high, and special pressure when movement is risky.'
        },
        {
          id: 'low-block',
          notation: ['d', 'B'],
          label: 'Crouch Block',
          actions: ['down', 'block'],
          requireState: 'crouchBlock',
          reason: 'Crouch block lows; standing guard loses to low pressure.'
        }
      ],
      'Neutral is controlled by choosing the right answer: back-hop to create space and bait a whiff, sidestep linear attacks, block unknown pressure, crouch block lows, anti-air jump-ins, then whiff punish when the opponent misses.',
      'Control the space first. The punish comes after.',
      'Neutral control complete.',
      { dummyScript: 'attack' }
    )
  ];

  const fastest = [...character.moves].filter((move) => move.damage > 0).sort((a, b) => a.startupFrames - b.startupFrames)[0];
  const safe = [...character.moves].filter((move) => move.damage > 0).sort((a, b) => b.onBlockFrames - a.onBlockFrames || a.startupFrames - b.startupFrames)[0];
  const knockdown = routes.find((route) => route.move.knockdown);
  const launcher = routes.find((route) => (route.move.launchHeight ?? 0) > 0);
  const tornado = routes.find((route) => route.move.tornado);
  const crouch = routes.find((route) => route.command?.startsWith('FC+') || route.command?.startsWith('WS+'));
  const ki = routes.find((route) => route.command?.startsWith('O+') || route.move.usesKi || route.move.kiBurst);
  const advanced = routes.find((route) => route.category === 'advanced' || route.command);
  const antiAir = pickAntiAirRoute(routes);
  const counterHit = routes.find((route) => route.move.counterHit && route.move.damage > 0) ?? antiAir ?? routes.find((route) => route.move.damage > 0);

  if (fastest) trials.push(makeMoveTrial(character, dummy, 'punish', 'punish:fastest', 'Fast Punish', fastest.label, [inputToButton[fastest.input]], [inputToAction[fastest.input]], fastest.input, 'Use your fastest button when the enemy is stuck.', 'Small opening, small cut. Take it.', 'Land the fast punish.', { dummyScript: 'attack' }));
  if (fastest) trials.push(makeMoveTrial(character, dummy, 'punish', 'punish:whiff', 'Whiff Punish', fastest.label, [inputToButton[fastest.input]], [inputToAction[fastest.input]], fastest.input, 'Use back-hop or sidestep to make the enemy whiff, then hit their recovery before they can guard.', 'When they cut empty air, answer immediately.', 'Whiff punish landed.', { dummyScript: 'whiff', setup: { p1Position: { x: -0.25, z: 0 }, p2Position: { x: 1.15, z: 0 } }, expectImpactKinds: ['whiffPunish'], missAfterFrame: 72 }));
  if (safe) trials.push(makeMoveTrial(character, dummy, 'punish', 'punish:safe', 'Safe Check', safe.label, [inputToButton[safe.input]], [inputToAction[safe.input]], safe.input, 'Use a safer check when you are not sure.', 'A safe cut beats a greedy one.', 'Land the safe check.'));
  if (advanced) trials.push(makeRouteStarterTrial(character, dummy, 'punish', 'punish:command', 'Command Punish', advanced, 'Use a committed command route for bigger openings.', 'Bigger opening. Sharper answer.', 'Land the command starter.', { dummyScript: 'attack' }));
  trials.push(makeSimpleTrial(character, dummy, 'jumpIn', 'jump:starter', 'Jump-In Starter', ['u', '1'], ['up', 'jab'], 'Jump in to start pressure from above.', 'Come down with purpose.', 'Jump, then press 1.', { requireState: 'jump' }));
  if (antiAir) trials.push(makeRouteStarterTrial(character, dummy, 'defense', 'defense:anti-air', 'Anti-Air Jump-In', antiAir, 'Stay grounded and interrupt jump-ins before they land.', 'Do not chase the sky. Cut it down.', 'Anti-air landed.', { dummyScript: 'jumpIn', setup: { p1Position: { x: -0.45, z: 0 }, p2Position: { x: 0.62, z: 0 } }, expectImpactKinds: ['hit', 'counterHit'], requireAirborneDefender: true, missAfterFrame: 96 }));
  if (counterHit) trials.push(makeRouteStarterTrial(character, dummy, 'punish', 'punish:counter-hit', 'Counter-Hit Intercept', counterHit, 'Counter hits happen when you interrupt an enemy startup or active attack.', 'Cut into the beginning of their swing.', 'Counter hit landed.', { dummyScript: 'counterHit', expectImpactKinds: ['counterHit'], missAfterFrame: 72 }));
  if (launcher) trials.push(makeRouteStarterTrial(character, dummy, 'launcher', 'launcher:starter', 'Launch Starter', launcher, 'Launchers start longer air routes.', 'Lift them first. The combo starts in the air.', 'Launch the dummy.', { expectImpact: { launched: true } }));
  if (tornado) trials.push(makeRouteStarterTrial(character, dummy, 'tornado', 'tornado:extender', 'Tornado Extender', tornado, 'Tornado keeps a juggle alive once the route is airborne.', 'When they fall, spin them back into the fight.', 'Use the tornado extender.', { setup: { p2Position: { x: 0.45, z: 0 }, dummyScript: 'idle' }, expectImpact: { tornado: true, juggled: true } }));
  if (crouch) trials.push(makeRouteStarterTrial(character, dummy, 'crouch', 'crouch:route', 'FC / WS Route', crouch, 'Crouch routes teach stance-specific followups.', 'Low stance. Different blade.', 'Use the crouch route.'));
  trials.push(makeImpactOnlyTrial(character, dummy, 'ki', 'ki:perfect-block', 'Ki Perfect Block', ['B'], ['block'], 'Time your guard against ki attacks. A close block earns Perfect timing here.', 'Meet power with timing, not panic.', 'Ki attack blocked.', { dummyScript: 'kiAttack', setup: { p2Ki: 100, p1Position: { x: -0.55, z: 0 }, p2Position: { x: 0.55, z: 0 } }, expectImpactKinds: ['block'], expectImpactAttackerSlot: 2, expectImpactDefenderSlot: 1, requireImpactKiBurst: true, targetFrame: 20, windowBefore: 8, windowAfter: 12, missAfterFrame: 80 }));
  if (ki) trials.push(makeRouteStarterTrial(character, dummy, 'ki', 'ki:route', 'Ki Route', ki, 'Ki routes spend charge for a stronger route.', 'Spend power only when the cut matters.', 'Use the ki route.', { setup: { p1Ki: 100, dummyScript: 'idle' } }));
  trials.push(makeSimpleTrial(character, dummy, 'corner', 'corner:carry', 'Corner Space', ['f', '1'], ['right', 'jab'], 'Corner pressure starts by taking space before attacking.', 'Put their back to the wall, then make it count.', 'Walk in and jab.', { setup: { p1Position: { x: -1.1, z: 0 }, p2Position: { x: -0.18, z: 0 }, corner: 'left', dummyScript: 'guard' } }));
  if (knockdown) trials.push(makeRouteStarterTrial(character, dummy, 'oki', 'oki:knockdown', 'Oki Knockdown', knockdown, 'Oki starts after knockdown, when the defender must get up.', 'Knock them down. Be there when they rise.', 'Score the knockdown.', { expectDummyState: 'knockdown' }));

  return dedupeTrials(trials);
}

export function generateComboTrainingTrials(character: CharacterDefinition): TrainingTrialDefinition[] {
  return generateComboTrials(character).map((route) => {
    const steps = route.steps.map((step, index): TrainingTrialStep => ({
      id: `${route.id}:step:${index}`,
      notation: step.notation,
      label: step.label,
      routeKey: step.routeKey,
      animationKey: step.animationKey,
      input: step.input,
      command: step.command,
      actions: stepToActions(step),
      kind: 'impact',
      targetFrame: index === 0 ? 18 : 14,
      windowBefore: 6,
      windowAfter: 8,
      expectImpact: step.expect,
      counterHit: step.counterHit,
      reason: step.reason
    }));
    return {
      id: `combo:${route.id}`,
      title: route.title,
      characterId: character.id,
      category: 'combo',
      mode: 'combos',
      difficulty: route.level,
      stageId: 'the-chamber',
      setup: {
        stageId: 'the-chamber',
        dummyScript: route.steps[0]?.counterHit ? 'counterHit' : 'idle',
        p1Position: { x: -0.45, z: 0 },
        p2Position: { x: 0.45, z: 0 },
        p1Ki: route.requiresKi ? 100 : undefined
      },
      steps,
      lesson: `${comboTrialCategoryLabels[route.category]}: ${route.reason}`,
      zoroLine: route.category === 'launcher' ? 'Launch first. Keep the air route clean.' : route.category === 'counterHit' ? 'Make them swing, then cut through it.' : 'One clean input after another.',
      successText: 'Route complete.',
      previewScript: makePreviewScript(steps),
      sourceComboRoute: route
    };
  });
}

export function makeTrainingTrialProgress(trial: TrainingTrialDefinition | null, preview = false): TrainingTrialProgress | null {
  if (!trial) return null;
  return {
    stepIndex: 0,
    stepFrame: 0,
    statuses: trial.steps.map((_, index) => index === 0 ? 'current' : 'pending'),
    ratings: trial.steps.map(() => 'Ready'),
    attempts: 0,
    completed: false,
    lastFeedback: 'Ready',
    preview
  };
}

export function advanceTrainingTrialWithInput(progress: TrainingTrialProgress, trial: TrainingTrialDefinition, input: InputFrame, match: MatchSnapshot): TrainingTrialProgress {
  if (progress.completed) return progress;
  const step = trial.steps[progress.stepIndex];
  if (!step) return { ...progress, stepFrame: progress.stepFrame + 1 };
  if (step.kind === 'impact') {
    const next = { ...progress, stepFrame: progress.stepFrame + 1 };
    if (step.missAfterFrame !== undefined && next.stepFrame > step.missAfterFrame) {
      const statuses = [...next.statuses];
      const ratings = [...next.ratings];
      statuses[progress.stepIndex] = 'missed';
      ratings[progress.stepIndex] = 'Missed';
      return { ...next, statuses, ratings, completed: true, lastFeedback: 'Missed' };
    }
    return next;
  }

  const next = { ...progress, statuses: [...progress.statuses], ratings: [...progress.ratings], stepFrame: progress.stepFrame + 1 };
  const pressed = step.actions.length > 0 && step.actions.every((action) => input[action]);
  const stateMatches = matchesStateStep(step, match);
  if (!pressed && !stateMatches) return next;

  const target = step.targetFrame ?? 12;
  const before = step.windowBefore ?? 5;
  const after = step.windowAfter ?? 8;
  const delta = next.stepFrame - target;
  if (next.stepFrame < target - before) {
    next.statuses[progress.stepIndex] = 'early';
    next.ratings[progress.stepIndex] = 'Too early';
    next.lastFeedback = `${Math.abs(delta)}f early`;
    return next;
  }
  if (next.stepFrame > target + after) {
    next.statuses[progress.stepIndex] = 'late';
    next.ratings[progress.stepIndex] = 'Late';
    next.lastFeedback = `+${delta}f late`;
    return completeTrainingStep(next, trial, 'late', 'Late');
  }
  const rating: TrainingTrialTimingRating = Math.abs(delta) <= 2 ? 'Perfect' : 'Confirmed';
  return completeTrainingStep(next, trial, Math.abs(delta) <= 2 ? 'perfect' : 'confirmed', rating, Math.abs(delta) <= 2 ? 'Perfect' : `${delta >= 0 ? '+' : ''}${delta}f`);
}

export function advanceTrainingTrialWithImpact(progress: TrainingTrialProgress, trial: TrainingTrialDefinition, event: ImpactSparkEvent): TrainingTrialProgress {
  if (progress.completed || event.kind === 'clash') return progress;
  const step = trial.steps[progress.stepIndex];
  if (!step || step.kind !== 'impact') return progress;
  const matches = trainingTrialStepMatchesImpact(step, event);
  if (!matches) {
    const statuses = [...progress.statuses];
    const ratings = [...progress.ratings];
    statuses[progress.stepIndex] = 'missed';
    ratings[progress.stepIndex] = 'Missed';
    return { ...progress, statuses, ratings, lastFeedback: 'Wrong hit' };
  }
  const target = step.targetFrame ?? 18;
  const before = step.windowBefore ?? 6;
  const after = step.windowAfter ?? 10;
  const delta = progress.stepFrame - target;
  if (progress.stepFrame < target - before) {
    const statuses = [...progress.statuses];
    const ratings = [...progress.ratings];
    statuses[progress.stepIndex] = 'early';
    ratings[progress.stepIndex] = 'Too early';
    return { ...progress, statuses, ratings, lastFeedback: `${Math.abs(delta)}f early` };
  }
  const rating: TrainingTrialTimingRating = progress.stepFrame > target + after ? 'Late' : Math.abs(delta) <= 2 ? 'Perfect' : 'Confirmed';
  const status: TrainingTrialStepStatus = rating === 'Late' ? 'late' : rating === 'Perfect' ? 'perfect' : 'confirmed';
  const feedback = step.counterHit || step.expectImpactKinds?.includes('counterHit') ? 'Counter Hit' : rating === 'Perfect' ? 'Perfect' : rating;
  return completeTrainingStep(progress, trial, status, rating, feedback);
}

export function readTrainingTrialCompletion(characterId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TRAINING_TRIAL_STORAGE_KEY) ?? '{}') as Record<string, string[]>;
    return new Set(Array.isArray(parsed[characterId]) ? parsed[characterId] : []);
  } catch {
    return new Set();
  }
}

export function writeTrainingTrialCompletion(characterId: string, completed: Set<string>) {
  if (typeof window === 'undefined') return;
  let parsed: Record<string, string[]> = {};
  try {
    parsed = JSON.parse(window.localStorage.getItem(TRAINING_TRIAL_STORAGE_KEY) ?? '{}') as Record<string, string[]>;
  } catch {
    parsed = {};
  }
  parsed[characterId] = [...completed].sort();
  window.localStorage.setItem(TRAINING_TRIAL_STORAGE_KEY, JSON.stringify(parsed));
}

export function makePreviewInput(script: TrainingPreviewFrame[], frame: number): InputFrame {
  const input = emptyInputFrame();
  for (const item of script) {
    if (frame < item.frame || frame >= item.frame + item.duration) continue;
    for (const action of item.actions) input[action] = true;
  }
  return input;
}

export function previewScriptLength(script: TrainingPreviewFrame[]) {
  return script.reduce((max, item) => Math.max(max, item.frame + item.duration), 0);
}

export function makeTrialDummyInput(trial: TrainingTrialDefinition | null, match: MatchSnapshot): InputFrame {
  const input = emptyInputFrame();
  const script = trial?.setup.dummyScript ?? 'idle';
  const dummy = match.fighters[1];
  const attacker = match.fighters[0];
  if (dummy.state === 'knockdown' && !dummy.getupStarted) input.confirm = true;
  if (script === 'guard') input.block = true;
  if (script === 'lowGuard') {
    input.block = true;
    input.down = true;
  }
  if (script === 'getup' && dummy.state === 'knockdown') input.confirm = true;
  if (script === 'attack' && dummy.state !== 'attack' && dummy.state !== 'hit' && dummy.state !== 'juggle') input.heavy = true;
  if (script === 'kiAttack' && dummy.state !== 'attack' && dummy.state !== 'hit' && dummy.state !== 'juggle') {
    input.charge = true;
    input.special = true;
  }
  if (script === 'whiff' && dummy.state !== 'attack' && dummy.state !== 'hit' && dummy.state !== 'juggle') input.heavy = true;
  if (script === 'jumpIn') {
    if (dummy.state === 'idle' || dummy.state === 'walk' || dummy.state === 'block') input.up = true;
    if (dummy.state === 'jump' && dummy.position.y > 0.28) input.jab = true;
  }
  if (script === 'counterHit') {
    if (attacker.state === 'attack' && attacker.currentMove && attacker.moveFrame >= Math.max(1, attacker.currentMove.startupFrames - 4)) input.heavy = true;
  }
  return input;
}

function completeTrainingStep(
  progress: TrainingTrialProgress,
  trial: TrainingTrialDefinition,
  status: TrainingTrialStepStatus,
  rating: TrainingTrialTimingRating,
  feedback: string = rating
): TrainingTrialProgress {
  const statuses = [...progress.statuses];
  const ratings = [...progress.ratings];
  statuses[progress.stepIndex] = status;
  ratings[progress.stepIndex] = rating;
  const nextIndex = progress.stepIndex + 1;
  if (nextIndex >= trial.steps.length) {
    return { ...progress, statuses, ratings, completed: true, lastFeedback: trial.successText };
  }
  statuses[nextIndex] = 'current';
  return { ...progress, stepIndex: nextIndex, stepFrame: 0, statuses, ratings, completed: false, lastFeedback: feedback };
}

function makeSimpleTrial(
  character: CharacterDefinition,
  dummy: CharacterDefinition | undefined,
  category: TrainingTrialCategory,
  id: string,
  title: string,
  notation: string[],
  actions: ActionName[],
  lesson: string,
  zoroLine: string,
  successText: string,
  options: Partial<TrainingTrialStep & { dummyScript: TrainingDummyScript; setup: Partial<TrainingTrialSetup> }> = {}
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript ?? options.setup?.dummyScript ?? 'idle', options.setup);
  return {
    id: `basic:${character.id}:${id}`,
    title,
    characterId: character.id,
    category,
    mode: 'basics',
    difficulty: category === 'movement' || category === 'defense' ? 1 : 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps: [{
      id: `${id}:step`,
      notation,
      label: title,
      actions,
      kind: 'state',
      targetFrame: 14,
      windowBefore: 8,
      windowAfter: 18,
      requireState: options.requireState,
      requireDummyState: options.requireDummyState,
      reason: lesson
    }],
    lesson,
    zoroLine,
    successText,
    previewScript: makePreviewScript([{ actions, targetFrame: 10 } as TrainingTrialStep])
  };
}

function makeSequenceTrial(
  character: CharacterDefinition,
  dummy: CharacterDefinition | undefined,
  category: TrainingTrialCategory,
  id: string,
  title: string,
  stepInputs: Array<{
    id: string;
    notation: string[];
    label: string;
    actions: ActionName[];
    requireState?: FighterRuntime['state'];
    requireDummyState?: FighterRuntime['state'];
    reason: string;
  }>,
  lesson: string,
  zoroLine: string,
  successText: string,
  options: { dummyScript?: TrainingDummyScript; setup?: Partial<TrainingTrialSetup> } = {}
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript ?? options.setup?.dummyScript ?? 'idle', options.setup);
  const steps: TrainingTrialStep[] = stepInputs.map((step, index) => ({
    id: `${id}:${step.id}`,
    notation: step.notation,
    label: step.label,
    actions: step.actions,
    kind: 'state',
    targetFrame: index === 0 ? 14 : 18,
    windowBefore: 8,
    windowAfter: 20,
    requireState: step.requireState,
    requireDummyState: step.requireDummyState,
    reason: step.reason
  }));
  return {
    id: `basic:${character.id}:${id}`,
    title,
    characterId: character.id,
    category,
    mode: 'basics',
    difficulty: category === 'movement' || category === 'defense' ? 1 : 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps,
    lesson,
    zoroLine,
    successText,
    previewScript: makePreviewScript(steps)
  };
}

function makeMoveTrial(
  character: CharacterDefinition,
  dummy: CharacterDefinition | undefined,
  category: TrainingTrialCategory,
  id: string,
  title: string,
  label: string,
  notation: string[],
  actions: ActionName[],
  input: MoveInput,
  lesson: string,
  zoroLine: string,
  successText: string,
  options: {
    dummyScript?: TrainingDummyScript;
    setup?: Partial<TrainingTrialSetup>;
    expectImpactKinds?: ImpactSparkEvent['kind'][];
    expectImpactAttackerSlot?: 1 | 2;
    expectImpactDefenderSlot?: 1 | 2;
    requireImpactKiBurst?: boolean;
    requireAirborneDefender?: boolean;
    missAfterFrame?: number;
  } = {}
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript ?? 'idle', options.setup);
  const step: TrainingTrialStep = {
    id: `${id}:step`,
    notation,
    label,
    input,
    actions,
    kind: 'impact',
    targetFrame: 18,
    windowBefore: 6,
    windowAfter: 10,
    expectImpactKinds: options.expectImpactKinds,
    expectImpactAttackerSlot: options.expectImpactAttackerSlot ?? 1,
    expectImpactDefenderSlot: options.expectImpactDefenderSlot,
    requireImpactKiBurst: options.requireImpactKiBurst,
    requireAirborneDefender: options.requireAirborneDefender,
    missAfterFrame: options.missAfterFrame,
    reason: lesson
  };
  return {
    id: `basic:${character.id}:${id}`,
    title,
    characterId: character.id,
    category,
    mode: 'basics',
    difficulty: 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps: [step],
    lesson,
    zoroLine,
    successText,
    previewScript: makePreviewScript([step])
  };
}

function makeRouteStarterTrial(
  character: CharacterDefinition,
  dummy: CharacterDefinition | undefined,
  category: TrainingTrialCategory,
  id: string,
  title: string,
  route: ReturnType<typeof resolveMoveRoutes>[number],
  lesson: string,
  zoroLine: string,
  successText: string,
  options: {
    dummyScript?: TrainingDummyScript;
    setup?: Partial<TrainingTrialSetup>;
    expectImpact?: ComboTrialStep['expect'];
    expectImpactKinds?: ImpactSparkEvent['kind'][];
    expectDummyState?: FighterRuntime['state'];
    requireImpactKiBurst?: boolean;
    requireAirborneDefender?: boolean;
    missAfterFrame?: number;
  } = {}
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript ?? options.setup?.dummyScript ?? 'idle', options.setup);
  const step: TrainingTrialStep = {
    id: `${id}:step`,
    notation: route.notation,
    label: route.label,
    routeKey: route.routeKey,
    animationKey: route.animationKey,
    input: route.input,
    command: route.command,
    actions: commandRouteToActions(route.command, route.input),
    kind: options.expectDummyState ? 'state' : 'impact',
    targetFrame: 18,
    windowBefore: 7,
    windowAfter: 12,
    expectImpact: options.expectImpact,
    expectImpactKinds: options.expectImpactKinds,
    expectImpactAttackerSlot: 1,
    requireImpactKiBurst: options.requireImpactKiBurst,
    requireAirborneDefender: options.requireAirborneDefender,
    missAfterFrame: options.missAfterFrame,
    requireDummyState: options.expectDummyState,
    reason: lesson
  };
  return {
    id: `basic:${character.id}:${id}`,
    title,
    characterId: character.id,
    category,
    mode: 'basics',
    difficulty: category === 'launcher' || category === 'tornado' || category === 'oki' ? 3 : 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps: [step],
    lesson,
    zoroLine,
    successText,
    previewScript: makePreviewScript([step])
  };
}

function makeImpactOnlyTrial(
  character: CharacterDefinition,
  dummy: CharacterDefinition | undefined,
  category: TrainingTrialCategory,
  id: string,
  title: string,
  notation: string[],
  actions: ActionName[],
  lesson: string,
  zoroLine: string,
  successText: string,
  options: {
    dummyScript: TrainingDummyScript;
    setup?: Partial<TrainingTrialSetup>;
    expectImpactKinds: ImpactSparkEvent['kind'][];
    expectImpactAttackerSlot?: 1 | 2;
    expectImpactDefenderSlot?: 1 | 2;
    requireImpactKiBurst?: boolean;
    requireAirborneDefender?: boolean;
    targetFrame?: number;
    windowBefore?: number;
    windowAfter?: number;
    missAfterFrame?: number;
  }
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript, options.setup);
  const step: TrainingTrialStep = {
    id: `${id}:step`,
    notation,
    label: title,
    actions,
    kind: 'impact',
    targetFrame: options.targetFrame ?? 18,
    windowBefore: options.windowBefore ?? 6,
    windowAfter: options.windowAfter ?? 10,
    expectImpactKinds: options.expectImpactKinds,
    expectImpactAttackerSlot: options.expectImpactAttackerSlot,
    expectImpactDefenderSlot: options.expectImpactDefenderSlot,
    requireImpactKiBurst: options.requireImpactKiBurst,
    requireAirborneDefender: options.requireAirborneDefender,
    missAfterFrame: options.missAfterFrame,
    reason: lesson
  };
  return {
    id: `basic:${character.id}:${id}`,
    title,
    characterId: character.id,
    category,
    mode: 'basics',
    difficulty: 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps: [step],
    lesson,
    zoroLine,
    successText,
    previewScript: makePreviewScript([step])
  };
}

function makeSetup(dummy: CharacterDefinition | undefined, dummyScript: TrainingDummyScript, override: Partial<TrainingTrialSetup> = {}): TrainingTrialSetup {
  return {
    stageId: override.stageId ?? 'the-chamber',
    dummyCharacterId: override.dummyCharacterId ?? dummy?.id,
    dummyScript,
    p1Position: override.p1Position ?? { x: -0.45, z: 0 },
    p2Position: override.p2Position ?? { x: 0.45, z: 0 },
    p1Ki: override.p1Ki,
    p2Ki: override.p2Ki,
    corner: override.corner
  };
}

function makePreviewScript(steps: Array<Pick<TrainingTrialStep, 'actions' | 'targetFrame'> & Partial<Pick<TrainingTrialStep, 'command'>>>): TrainingPreviewFrame[] {
  const script: TrainingPreviewFrame[] = [];
  let cursor = 12;
  for (const step of steps) {
    script.push(...makeCommandPreviewFrames(step, cursor));
    cursor += Math.max(28, (step.targetFrame ?? 12) + 18);
  }
  return script;
}

function makeCommandPreviewFrames(
  step: Pick<TrainingTrialStep, 'actions' | 'targetFrame'> & Partial<Pick<TrainingTrialStep, 'command'>>,
  cursor: number
): TrainingPreviewFrame[] {
  const target = cursor + (step.targetFrame ?? 12);
  const command = step.command ?? '';
  const frames: TrainingPreviewFrame[] = [];
  const push = (frame: number, actions: ActionName[], duration = 5) => {
    frames.push({ frame: Math.max(cursor, frame), duration, actions });
  };

  if (/^(qcf|qcb|hcf|hcb|dp|rdp|cd)\+/.test(command)) {
    const toward: ActionName = command.startsWith('qcb') || command.startsWith('hcb') || command.startsWith('rdp') ? 'left' : 'right';
    const away: ActionName = toward === 'right' ? 'left' : 'right';
    if (command.startsWith('hcf') || command.startsWith('hcb')) {
      push(target - 18, [away], 4);
      push(target - 14, [away, 'down'], 4);
    }
    push(target - 12, ['down'], 4);
    push(target - 8, ['down', toward], 4);
    if (command.startsWith('dp') || command.startsWith('rdp')) push(target - 16, [toward], 4);
    push(target - 4, [toward, ...step.actions], 8);
    return frames;
  }

  if (/^(f,f|WR|iWR)\+/.test(command)) {
    push(target - 14, ['right'], 4);
    push(target - 8, ['right'], 4);
  } else if (/^b,b\+/.test(command)) {
    push(target - 14, ['left'], 4);
    push(target - 8, ['left'], 4);
  } else if (/^(SS|SSL)\+/.test(command)) {
    push(target - 10, ['sidestepUp'], 5);
  } else if (/^SSR\+/.test(command)) {
    push(target - 10, ['sidestepDown'], 5);
  } else if (/^WS\+/.test(command)) {
    push(target - 12, ['down'], 5);
  }

  push(target, step.actions, 8);
  return frames;
}

function stepToActions(step: ComboTrialStep) {
  return commandRouteToActions(step.command, step.input);
}

function stepToComboStep(step: TrainingTrialStep): ComboTrialStep {
  const input = step.input ?? 'jab';
  return {
    routeKey: step.routeKey ?? step.id,
    animationKey: step.animationKey ?? (step.command ? `cmd:${step.command}` : input),
    family: commandRouteFamily(step.command),
    notation: step.notation,
    label: step.label,
    input,
    command: step.command,
    startupFrames: 1,
    counterHit: step.counterHit,
    reason: step.reason,
    expect: step.expectImpact
  };
}

function trainingTrialStepMatchesImpact(step: TrainingTrialStep, event: ImpactSparkEvent) {
  if (step.expectImpactAttackerSlot && event.attackerSlot !== step.expectImpactAttackerSlot) return false;
  if (step.expectImpactDefenderSlot && event.defenderSlot !== step.expectImpactDefenderSlot) return false;
  if (!step.expectImpactAttackerSlot && event.attackerSlot !== 1) return false;
  if (step.expectImpactKinds && !step.expectImpactKinds.includes(event.kind)) return false;
  if (step.requireImpactKiBurst && !event.kiBurst) return false;
  if (step.requireAirborneDefender && !event.juggled) return false;
  if (step.command || step.input || step.counterHit || step.expectImpact) {
    return comboTrialStepMatchesImpact(stepToComboStep(step), event);
  }
  return true;
}

function matchesStateStep(step: TrainingTrialStep, match: MatchSnapshot) {
  const player = match.fighters[0];
  const dummy = match.fighters[1];
  if (step.requireState && player.state !== step.requireState) return false;
  if (step.requireDummyState && dummy.state !== step.requireDummyState) return false;
  if (!step.requireState && !step.requireDummyState) return false;
  return true;
}

function pickDummy(character: CharacterDefinition, roster: CharacterDefinition[]) {
  return roster.find((candidate) => candidate.id !== character.id && !candidate.unplayable && !candidate.locked) ??
    roster.find((candidate) => candidate.id !== character.id && !candidate.unplayable) ??
    undefined;
}

function isRoutableCharacter(character: CharacterDefinition) {
  const frames = character.animationFrames ?? {};
  return ['jableft', 'jabright', 'kickleft', 'kickright', 'jab', 'kick', 'heavy', 'special'].some((key) => (frames[key]?.length ?? 0) > 0);
}

function pickAntiAirRoute(routes: ReturnType<typeof resolveMoveRoutes>) {
  const candidates = routes.filter((route) => route.move.damage > 0 && route.move.hitLevel !== 'low');
  const pool = candidates.length > 0 ? candidates : routes.filter((route) => route.move.damage > 0);
  return [...pool].sort((a, b) => scoreAntiAirRoute(b) - scoreAntiAirRoute(a))[0];
}

function scoreAntiAirRoute(route: ReturnType<typeof resolveMoveRoutes>[number]) {
  const move = route.move;
  const verticalReach = move.hitbox.offset[1] + move.hitbox.size[1] * 0.5;
  return (
    (move.counterHit ? 18 : 0) +
    ((move.launchHeight ?? 0) > 0 ? 14 : 0) +
    (move.knockdown ? 8 : 0) +
    Math.min(12, verticalReach * 7) +
    Math.min(8, move.range * 2) -
    move.startupFrames * 0.35
  );
}

function dedupeTrials(trials: TrainingTrialDefinition[]) {
  const seen = new Set<string>();
  return trials.filter((trial) => {
    if (seen.has(trial.id)) return false;
    seen.add(trial.id);
    return true;
  });
}
