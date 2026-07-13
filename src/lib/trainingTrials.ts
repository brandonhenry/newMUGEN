import type { ActionName, CharacterDefinition, FighterRuntime, ImpactSparkEvent, InputFrame, InputFrameWithMetadata, MatchSnapshot, MoveInput, MoveProjectileInstance } from '../types';
import { emptyInputFrame } from '../types';
import { BEGINNER_AUTO_COMBO_INPUTS, resolveBeginnerAutoComboPlan } from './beginnerAutoCombos';
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
export type TrainingTrialCategory = 'movement' | 'offense' | 'defense' | 'punish' | 'jumpIn' | 'corner' | 'crouch' | 'ki' | 'launcher' | 'tornado' | 'oki' | 'combo';
export type TrainingTrialStepStatus = 'pending' | 'current' | 'early' | 'perfect' | 'late' | 'missed' | 'confirmed' | 'correct';
export type TrainingTrialTimingRating = 'Ready' | 'Perfect' | 'Too early' | 'Late' | 'Confirmed' | 'Missed';
export type TrainingDummyScript = 'idle' | 'attack' | 'guard' | 'lowGuard' | 'getup' | 'wakeupMash' | 'counterHit' | 'kiAttack' | 'whiff' | 'jumpIn' | 'recoverableHealth';

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
  requireGetupAction?: FighterRuntime['getupAction'];
  requireKiAtLeast?: number;
  requireDisplayedKiAtLeast?: number;
  expectImpact?: ComboTrialStep['expect'];
  expectImpactKinds?: ImpactSparkEvent['kind'][];
  expectImpactAttackerSlot?: 1 | 2;
  expectImpactDefenderSlot?: 1 | 2;
  requireImpactKiBurst?: boolean;
  requireImpactDamage?: boolean;
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
  p1State?: FighterRuntime['state'];
  p2State?: FighterRuntime['state'];
  p1Hp?: number;
  p2Hp?: number;
  p1RecoverableHp?: number;
  p2RecoverableHp?: number;
  p1Ki?: number;
  p2Ki?: number;
  p1TransformOvercharge?: number;
  p1TransformReadyTimer?: number;
  corner?: 'left' | 'right';
};

export type TrainingPreviewFrame = {
  frame: number;
  duration: number;
  actions: ActionName[];
};

export type TrainingPreviewStep = {
  actions: ActionName[];
  targetFrame?: number;
  command?: string;
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
  succeeded: boolean;
  lastFeedback: string;
  preview: boolean;
};

export type TrainingTrialNextResolution = {
  trial: TrainingTrialDefinition | null;
  label: 'Next Trial' | 'Review Next';
  allComplete: boolean;
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
  jump: 'JUMP',
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

const buttonToInput: Record<string, MoveInput> = {
  '1': 'jab',
  '2': 'heavy',
  '3': 'kick',
  '4': 'special'
};

const categoryLabels: Record<TrainingTrialCategory, string> = {
  movement: 'Movement',
  offense: 'Offense',
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
  const damagingRoutes = routes.filter((route) => route.move.damage > 0);
  const basicDamagingRoutes = damagingRoutes.filter((route) => !route.command);
  const beginnerRoutes = basicDamagingRoutes.length > 0 ? basicDamagingRoutes : damagingRoutes;
  const fastestRoute = [...beginnerRoutes].sort((a, b) => a.move.startupFrames - b.move.startupFrames)[0];
  const safeRoute = [...beginnerRoutes].sort((a, b) => b.move.onBlockFrames - a.move.onBlockFrames || a.move.startupFrames - b.move.startupFrames)[0];
  const basicButtonSteps = makeBasicButtonSteps(character);
  const beginnerAutoComboTrial = makeBeginnerAutoComboTrial(character, dummy);
  const trials: TrainingTrialDefinition[] = [
    makeSimpleTrial(character, dummy, 'movement', 'movement:walk', 'Walk In', ['f'], ['right'], 'Close space without swinging.', 'First, take the space. No wasted cuts.', 'Step forward and hold your ground.', { requireState: 'walk' }),
    makeSimpleTrial(character, dummy, 'movement', 'movement:dash', 'Dash In', ['F'], ['dashForward'], 'Dash to punish distance quickly.', 'When the opening is far, move first.', 'Dash forward cleanly.', { requireState: 'walk' }),
    makeSimpleTrial(character, dummy, 'movement', 'movement:jump', 'Jump', ['JUMP'], ['jump'], 'Jump leaves the ground for airborne approaches and evasive timing, but you cannot guard while committed to the air. Use the dedicated Jump binding, or enable Up Hold Jumps in Controls if you prefer classic held-Up jumping.', 'Air has reach, but no guard. Choose the leap.', 'Jump complete.', { requireState: 'jump' }),
    makeSimpleTrial(character, dummy, 'movement', 'movement:back-hop', 'Back Hop', ['b,b'], ['dashBack'], 'Back-back is a quick retreat for neutral spacing and whiff bait. Use it to make short attacks miss, then whiff punish, but it is unsafe if the enemy reads it or hits you during startup or airtime.', 'Retreat with care. Air has no guard.', 'Back hop complete.', { requireState: 'jump' }),
    makeSimpleTrial(character, dummy, 'movement', 'movement:sidestep', 'Sidestep Line', ['SSL'], ['sidestepUp'], 'Step off the center line to move or defend against linear pressure.', "Don't stand where the blade is falling.", 'Sidestep once.'),
    ...(basicButtonSteps.length > 0 ? [makeSequenceTrial(character, dummy, 'offense', 'offense:button-feel', 'Button Feel', basicButtonSteps, 'Press each basic attack button one at a time. Learn what your character feels like before worrying about combos.', 'One button. One result. Remember the feel.', 'Button feel complete.')] : []),
    ...(beginnerAutoComboTrial ? [beginnerAutoComboTrial] : []),
    makeSimpleTrial(character, dummy, 'defense', 'defense:block', 'Standing Guard', ['B'], ['block'], 'Standing guard is your default answer to high, special, and unknown pressure in KORE.', 'Guard first. Then cut.', 'Hold block.', { dummyScript: 'attack', requireState: 'block' }),
    makeSimpleTrial(character, dummy, 'defense', 'defense:crouch-block', 'Low Guard', ['d', 'B'], ['down', 'block'], 'Crouch block is for lows. In KORE, mids beat crouch block, so return to standing guard when the threat is unknown.', 'Low strikes need low guard. Mids punish low guard.', 'Crouch block.', { dummyScript: 'attack', requireState: 'crouchBlock' }),
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
          reason: 'Switch to crouch block only when the threat is low; mids beat crouch block.'
        }
      ],
      'Blocking is a read: stand guard for highs, special, or unknown pressure; crouch block lows; and remember that mids beat crouch block in KORE.',
      'High blade, high guard. Low blade, low guard.',
      'Guard switch complete.',
      { dummyScript: 'attack' }
    ),
    makeSequenceTrial(
      character,
      dummy,
      'defense',
      'defense:low-guard-limit',
      'Low Guard Limit',
      [
        {
          id: 'low',
          notation: ['d', 'B'],
          label: 'Low Guard',
          actions: ['down', 'block'],
          requireState: 'crouchBlock',
          reason: 'Crouch block when you are reading a low.'
        },
        {
          id: 'stand',
          notation: ['B'],
          label: 'Return To Stand Guard',
          actions: ['block'],
          requireState: 'block',
          reason: 'Stand guard after the low read because mids beat crouch block in KORE.'
        }
      ],
      'Low guard solves lows, not everything. In KORE, mids beat crouch block, so use low guard on purpose and return to standing guard for unknown pressure.',
      'Low when it is low. Stand when you do not know.',
      'Low guard limit complete.',
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

  const knockdown = routes.find((route) => route.move.knockdown);
  const launcher = routes.find((route) => (route.move.launchHeight ?? 0) > 0);
  const tornado = routes.find((route) => route.move.tornado);
  const crouch = routes.find((route) => route.command?.startsWith('FC+') || route.command?.startsWith('WS+'));
  const ki = routes.find((route) => route.command?.startsWith('O+') || route.move.usesKi || route.move.kiBurst);
  const projectile = pickProjectileRoute(character, routes, 'projectile');
  const blast = pickProjectileRoute(character, routes, 'blast');
  const clash = routes.find((route) => route.move.kiBurst);
  const advanced = routes.find((route) => route.category === 'advanced' || route.command);
  const antiAir = pickAntiAirRoute(routes);
  const counterHit = routes.find((route) => route.move.counterHit && route.move.damage > 0) ?? antiAir ?? routes.find((route) => route.move.damage > 0);

  if (safeRoute) {
    trials.push(makeMixedTrial(
      character,
      dummy,
      'offense',
      'offense:dash-check',
      'Dash Check',
      [
        {
          id: 'dash',
          notation: ['F'],
          label: 'Dash In',
          actions: ['dashForward'],
          kind: 'state',
          requireState: 'walk',
          reason: 'Use dash to take space before you swing.'
        },
        routeToTrialStep('check', safeRoute, {
          expectImpactKinds: ['hit', 'counterHit'],
          reason: 'Land one simple check after moving in.'
        })
      ],
      'Take space first, then check. This teaches one clean approach before any combo plan.',
      'Feet first. Button second.',
      'Dash check landed.'
    ));
    trials.push(makeRouteStarterTrial(character, dummy, 'offense', 'offense:guarded-check', 'Guarded Check', safeRoute, 'Attack a guarding dummy to feel blocked pressure. A blocked check still tells you the opponent is defending.', 'If they guard, you learned something.', 'Guarded check complete.', { dummyScript: 'guard', expectImpactKinds: ['block'] }));
  }
  if (fastestRoute) {
    trials.push(makeMixedTrial(
      character,
      dummy,
      'defense',
      'defense:block-punish',
      'Block Punish',
      [
        {
          id: 'block',
          notation: ['B'],
          label: 'Block',
          actions: ['block'],
          kind: 'state',
          requireState: 'block',
          reason: 'Hold standing guard against the incoming attack.'
        },
        routeToTrialStep('punish', fastestRoute, {
          expectImpactKinds: ['punish'],
          reason: 'After blockstun ends, answer while the enemy is still recovering.'
        })
      ],
      'Block first, then punish. Some attacks leave the opponent stuck long enough for your fastest answer.',
      'Guard the cut. Then cut back.',
      'Block punish landed.',
      { dummyScript: 'attack' }
    ));
  }
  if (fastestRoute) trials.push(makeRouteStarterTrial(character, dummy, 'punish', 'punish:fastest', 'Fast Punish', fastestRoute, 'Use your fastest button when the enemy is stuck.', 'Small opening, small cut. Take it.', 'Land the fast punish.', { dummyScript: 'attack' }));
  if (fastestRoute) trials.push(makeRouteStarterTrial(character, dummy, 'punish', 'punish:whiff', 'Whiff Punish', fastestRoute, 'Use back-hop or sidestep to make the enemy whiff, then hit their recovery before they can guard.', 'When they cut empty air, answer immediately.', 'Whiff punish landed.', { dummyScript: 'whiff', setup: { p1Position: { x: -0.25, z: 0 }, p2Position: { x: 1.15, z: 0 } }, expectImpactKinds: ['whiffPunish'], missAfterFrame: 72 }));
  if (safeRoute) trials.push(makeRouteStarterTrial(character, dummy, 'punish', 'punish:safe', 'Safe Check', safeRoute, 'Use a safer check when you are not sure.', 'A safe cut beats a greedy one.', 'Land the safe check.'));
  if (advanced) trials.push(makeRouteStarterTrial(character, dummy, 'punish', 'punish:command', 'Command Punish', advanced, 'Use a committed command route for bigger openings.', 'Bigger opening. Sharper answer.', 'Land the command starter.', { dummyScript: 'attack' }));
  trials.push(makeSimpleTrial(character, dummy, 'jumpIn', 'jump:starter', 'Jump-In Starter', ['JUMP', '1'], ['jump', 'jab'], 'Use your Jump binding to start pressure from above.', 'Come down with purpose.', 'Jump-in complete.', { requireState: 'jump' }));
  if (antiAir) trials.push(makeRouteStarterTrial(character, dummy, 'defense', 'defense:anti-air', 'Anti-Air Jump-In', antiAir, 'Stay grounded and interrupt jump-ins before they land.', 'Do not chase the sky. Cut it down.', 'Anti-air landed.', { dummyScript: 'jumpIn', setup: { p1Position: { x: -0.45, z: 0 }, p2Position: { x: 0.62, z: 0 } }, expectImpactKinds: ['hit', 'counterHit'], requireAirborneDefender: true, missAfterFrame: 96 }));
  if (counterHit) trials.push(makeRouteStarterTrial(character, dummy, 'punish', 'punish:counter-hit', 'Counter-Hit Intercept', counterHit, 'Counter hits happen when you interrupt an enemy startup or active attack.', 'Cut into the beginning of their swing.', 'Counter hit landed.', { dummyScript: 'counterHit', expectImpactKinds: ['counterHit'], missAfterFrame: 72 }));
  if (launcher) trials.push(makeRouteStarterTrial(character, dummy, 'launcher', 'launcher:starter', 'Launch Starter', launcher, 'Launchers start longer air routes.', 'Lift them first. The combo starts in the air.', 'Launch the dummy.', { expectImpact: { launched: true } }));
  if (tornado) trials.push(makeRouteStarterTrial(character, dummy, 'tornado', 'tornado:extender', 'Tornado Extender', tornado, 'Tornado keeps a juggle alive once the route is airborne.', 'When they fall, spin them back into the fight.', 'Use the tornado extender.', { setup: { p2Position: { x: 0.45, z: 0 }, dummyScript: 'idle' }, expectImpact: { tornado: true, juggled: true } }));
  if (crouch) trials.push(makeRouteStarterTrial(character, dummy, 'crouch', 'crouch:route', 'FC / WS Route', crouch, 'Crouch routes teach stance-specific followups.', 'Low stance. Different blade.', 'Use the crouch route.'));
  trials.push(makeKiChargeTrial(character, dummy));
  trials.push(makeTransformTrial(character, dummy, roster));
  trials.push(makeImpactOnlyTrial(character, dummy, 'ki', 'ki:perfect-block', 'Ki Perfect Block', ['B'], ['block'], 'Time your guard against ki attacks. A close block earns Perfect timing here.', 'Meet power with timing, not panic.', 'Ki attack blocked.', { dummyScript: 'kiAttack', setup: { p2Ki: 100, p1Position: { x: -0.55, z: 0 }, p2Position: { x: 0.55, z: 0 } }, expectImpactKinds: ['block'], expectImpactAttackerSlot: 2, expectImpactDefenderSlot: 1, requireImpactKiBurst: true, targetFrame: 20, windowBefore: 8, windowAfter: 12, missAfterFrame: 80 }));
  if (ki) trials.push(makeRouteStarterTrial(character, dummy, 'ki', 'ki:route', 'Ki Route', ki, 'Ki routes spend charge for a stronger route.', 'Spend power only when the cut matters.', 'Use the ki route.', { setup: { p1Ki: 100, dummyScript: 'idle' } }));
  if (projectile) trials.push(makeRouteStarterTrial(character, dummy, 'ki', 'ki:projectile', 'Projectile Check', projectile, 'Projectile routes let you threaten space without standing directly next to the opponent. Fire the shot, then watch whether they block, sidestep, or get clipped.', 'Power at range still needs aim.', 'Projectile connected.', { setup: { p1Ki: routeUsesKi(projectile) ? 100 : undefined, dummyScript: 'idle', p1Position: { x: -0.95, z: 0 }, p2Position: { x: 0.85, z: 0 } }, expectImpactKinds: ['hit', 'counterHit'], missAfterFrame: 150 }));
  if (blast) trials.push(makeRouteStarterTrial(character, dummy, 'ki', 'ki:blast', 'Blast Control', blast, 'Blast routes commit to a larger lane of power. Set your spacing first, then release the blast before the opponent walks through your startup.', 'Big power needs clean spacing.', 'Blast connected.', { setup: { p1Ki: routeUsesKi(blast) ? 100 : undefined, dummyScript: 'idle', p1Position: { x: -1, z: 0 }, p2Position: { x: 0.95, z: 0 } }, expectImpactKinds: ['hit', 'counterHit'], missAfterFrame: 170 }));
  if (clash) {
    const clashDummy = pickClashDummy(character, roster) ?? dummy;
    trials.push(makeMixedTrial(
      character,
      clashDummy,
      'ki',
      'ki:clash-qte',
      'Clash QTE',
      [
        routeToTrialStep('clash', clash, {
          expectImpactKinds: ['clash'],
          requireImpactKiBurst: true,
          requireImpactDamage: true,
          targetFrame: 80,
          windowBefore: 80,
          windowAfter: 120,
          missAfterFrame: 240,
          reason: 'Meet a ki attack with your own powered attack, then finish the clash sequence cleanly.'
        })
      ],
      'When two powered ki attacks collide, KORE starts a clash. Win the quick-time sequence to turn the power struggle into damage.',
      'Do not freeze when power meets power. Finish the sequence.',
      'Clash won.',
      { dummyScript: 'kiAttack', setup: { p1Ki: 100, p2Ki: 100, p1Position: { x: -0.42, z: 0 }, p2Position: { x: 0.42, z: 0 } } }
    ));
  }
  trials.push(makeSimpleTrial(character, dummy, 'corner', 'corner:carry', 'Corner Space', ['f', '1'], ['right', 'jab'], 'Corner pressure starts by taking space before attacking.', 'Put their back to the wall, then make it count.', 'Walk in and jab.', { setup: { p1Position: { x: -1.1, z: 0 }, p2Position: { x: -0.18, z: 0 }, corner: 'left', dummyScript: 'guard' } }));
  trials.push(
    makeGetupTrial(character, dummy, 'oki:knockdown-state', 'Knockdown Choice', ['KD'], [], 'Knockdown means you are on the floor until you choose a wakeup: stand in place, side roll to change lanes, or back roll to make space.', 'First lesson: do not panic on the floor. Choose the rise.', 'Knockdown recognized.', { requireState: 'knockdown', targetFrame: 8, windowBefore: 0 }),
    makeGetupTrial(character, dummy, 'oki:wakeup-stand', 'Stand Wakeup', ['OK'], ['confirm'], 'Stand wakeup gets up in place. It is the simplest return from knockdown when you want to guard right away.', 'Rise where you fell. Guard comes next.', 'Stand wakeup complete.', { requireState: 'getup', requireGetupAction: 'stand' }),
    makeGetupTrial(character, dummy, 'oki:wakeup-roll-up', 'Roll Up Wakeup', ['SSL'], ['sidestepUp'], 'Side roll from knockdown to change lanes during wakeup. It can avoid straight Oki pressure, but it can be chased.', 'Leave the line while you rise.', 'Roll up wakeup complete.', { requireState: 'getup', requireGetupAction: 'rollUp' }),
    makeGetupTrial(character, dummy, 'oki:wakeup-roll-down', 'Roll Down Wakeup', ['SSR'], ['sidestepDown'], 'Side roll from knockdown to change lanes the other way. It is a wakeup choice, not automatic safety.', 'Pick the other line and stand ready.', 'Roll down wakeup complete.', { requireState: 'getup', requireGetupAction: 'rollDown' }),
    makeGetupTrial(character, dummy, 'oki:wakeup-roll-back', 'Back Roll Wakeup', ['b'], ['left'], 'Back roll from knockdown to create space before you stand. It can escape close Oki pressure, but it gives up ground.', 'Make distance, then fight your way back in.', 'Back roll wakeup complete.', { requireState: 'getup', requireGetupAction: 'rollBack' })
  );
  trials.push(makeSimpleTrial(character, dummy, 'oki', 'oki:take-space', 'Take Oki Space', ['F'], ['dashForward'], 'Oki means offense after knockdown. The grounded opponent cannot be hit yet, but they must get up, so move into range instead of waiting.', 'Do not let them rise for free.', 'Oki space taken.', { setup: { p2State: 'knockdown', p1Position: { x: -0.85, z: 0 }, p2Position: { x: 0.35, z: 0 }, dummyScript: 'getup' }, requireState: 'walk' }));
  if (fastestRoute) {
    trials.push(makeRouteStarterTrial(character, dummy, 'oki', 'oki:meaty-check', 'Meaty Check', fastestRoute, 'Time your attack for wakeup. The grounded opponent is invulnerable at first, so hit as they become vulnerable; if they mash, your meaty can catch them.', 'Be there when they rise.', 'Meaty check landed.', { dummyScript: 'wakeupMash', setup: { p2State: 'knockdown', p1Position: { x: -0.42, z: 0 }, p2Position: { x: 0.34, z: 0 } }, expectImpactKinds: ['hit', 'counterHit'], missAfterFrame: 130 }));
    trials.push(makeMixedTrial(
      character,
      dummy,
      'oki',
      'oki:wakeup-block-bait',
      'Wakeup Block Bait',
      [
        {
          id: 'block',
          notation: ['B'],
          label: 'Block Wakeup Attack',
          actions: ['block'],
          kind: 'state',
          requireState: 'block',
          reason: 'Walk into range, then block if you expect a wakeup attack.'
        },
        routeToTrialStep('punish', fastestRoute, {
          expectImpactKinds: ['punish'],
          reason: 'After the wakeup attack is blocked, punish the recovery.'
        })
      ],
      'Oki does not mean swinging every time. If you expect a wakeup attack, block first and punish after it fails.',
      'Let them swing into guard. Then answer.',
      'Wakeup bait complete.',
      { dummyScript: 'wakeupMash', setup: { p2State: 'knockdown', p1Position: { x: -0.46, z: 0 }, p2Position: { x: 0.34, z: 0 } } }
    ));
  }
  if (knockdown) trials.push(makeRouteStarterTrial(character, dummy, 'oki', 'oki:knockdown', 'Oki Knockdown', knockdown, 'Oki starts after knockdown, when the defender must get up. Score the knockdown, then take your offense after knockdown.', 'Knock them down. Be there when they rise.', 'Score the knockdown.', { expectDummyState: 'knockdown' }));

  return dedupeTrials(trials);
}

export function generateComboTrainingTrials(character: CharacterDefinition): TrainingTrialDefinition[] {
  const systemTrial = makeRecoverableHealthTrial(character);
  const routeTrials: TrainingTrialDefinition[] = generateComboTrials(character).map((route) => {
    const routeIntent = comboRouteIntent(route);
    const routeStepActions = route.steps.map(stepToActions);
    const steps = route.steps.map((step, index): TrainingTrialStep => ({
      id: `${route.id}:step:${index}`,
      notation: normalizeTrainingNotation(step.notation, routeStepActions[index] ?? []),
      label: step.label,
      routeKey: step.routeKey,
      animationKey: step.animationKey,
      input: step.input,
      command: step.command,
      actions: routeStepActions[index] ?? stepToActions(step),
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
      lesson: `${comboTrialCategoryLabels[route.category]}: ${routeIntent}. ${route.reason}`,
      zoroLine: comboRouteZoroLine(route),
      successText: 'Route complete.',
      previewScript: makePreviewScript(steps),
      sourceComboRoute: route
    };
  });
  return systemTrial ? [systemTrial, ...routeTrials] : routeTrials;
}

function makeRecoverableHealthTrial(character: CharacterDefinition): TrainingTrialDefinition | null {
  const routes = resolveMoveRoutes(character).filter((route) => route.move.damage > 0 || route.move.blockDamage > 0);
  const route = [...routes].sort((a, b) => a.move.startupFrames - b.move.startupFrames || b.move.blockDamage - a.move.blockDamage)[0];
  if (!route) return null;
  const recoverStep = routeToTrialStep('recover', route, {
    expectImpactKinds: ['block'],
    targetFrame: 18,
    windowBefore: 8,
    windowAfter: 14,
    reason: 'Make the dummy block to win back part of your flashing white/grey health.'
  });
  const starterStep = routeToTrialStep('starter', route, {
    expectImpactKinds: ['hit', 'counterHit'],
    targetFrame: 32,
    windowBefore: 12,
    windowAfter: 28,
    missAfterFrame: 120,
    reason: 'After recovery begins, land a clean starter and see how fresh hits cut away recoverable health.'
  });
  const p1Hp = Math.max(1, Math.round(character.stats.health * 0.62));
  const p1RecoverableHp = Math.max(6, Math.round(character.stats.health * 0.18));
  const steps = [recoverStep, starterStep];
  return {
    id: `combo:${character.id}:system:recoverable-health`,
    title: 'Recoverable Health',
    characterId: character.id,
    category: 'combo',
    mode: 'combos',
    difficulty: 1,
    stageId: 'the-chamber',
    setup: {
      stageId: 'the-chamber',
      dummyScript: 'recoverableHealth',
      p1Position: { x: -0.45, z: 0 },
      p2Position: { x: 0.45, z: 0 },
      p1Hp,
      p1RecoverableHp
    },
    steps,
    lesson: 'Recoverable health is the flashing white/grey part of your life bar. Win it back with offense, defense, and time, but a fresh clean hit cuts it away.',
    zoroLine: 'Take your breath back, then protect it.',
    successText: 'Recoverable health lesson complete.',
    previewScript: makePreviewScript(steps)
  };
}

function comboRouteIntent(route: GeneratedComboRoute) {
  if (route.tier === 'marathon') return `Marathon ${route.structure.join(' / ')} route for about ${route.estimatedDamage} damage`;
  if (route.launchRouteStyle === 'grounded') return `Grounded launcher route for about ${route.estimatedDamage} damage`;
  if (route.launchRouteStyle === 'airChase') return `Air chase launcher route for about ${route.estimatedDamage} damage`;
  if (route.launchRouteStyle === 'hybrid') return `Hybrid launcher route for about ${route.estimatedDamage} damage`;
  if (route.structure.includes('tornado')) return `Tornado extender route for about ${route.estimatedDamage} damage`;
  if (route.structure.includes('counterHit')) return `Counter-hit link route for about ${route.estimatedDamage} damage`;
  if (route.structure.includes('crouch')) return `Crouch or while-standing branch for about ${route.estimatedDamage} damage`;
  if (route.structure.includes('ki')) return `Ki route for about ${route.estimatedDamage} damage`;
  return `${route.rewardClass} route for about ${route.estimatedDamage} damage`;
}

function comboRouteZoroLine(route: GeneratedComboRoute) {
  if (route.tier === 'marathon') return 'Long route. Stay clean, keep the order.';
  if (route.category === 'launcher') return 'Launch first. Keep the air route clean.';
  if (route.category === 'counterHit') return 'Make them swing, then cut through it.';
  if (route.structure.includes('tornado')) return 'Extend once the juggle is real.';
  if (route.structure.includes('ki')) return 'Spend power only after the opening.';
  return 'One clean input after another.';
}

export function makeTrainingTrialProgress(trial: TrainingTrialDefinition | null, preview = false, attempts = 0): TrainingTrialProgress | null {
  if (!trial) return null;
  return {
    stepIndex: 0,
    stepFrame: 0,
    statuses: trial.steps.map((_, index) => index === 0 ? 'current' : 'pending'),
    ratings: trial.steps.map(() => 'Ready'),
    attempts,
    completed: false,
    succeeded: false,
    lastFeedback: 'Ready',
    preview
  };
}

export function resolveNextTrainingTrial(
  trials: TrainingTrialDefinition[],
  currentTrialId: string | null,
  completed: Set<string>
): TrainingTrialNextResolution {
  if (trials.length === 0) return { trial: null, label: 'Next Trial', allComplete: true };
  const foundIndex = trials.findIndex((trial) => trial.id === currentTrialId);
  const currentIndex = foundIndex >= 0 ? foundIndex : -1;
  for (let offset = 1; offset <= trials.length; offset += 1) {
    const candidate = trials[(currentIndex + offset) % trials.length];
    if (candidate && !completed.has(candidate.id)) {
      return { trial: candidate, label: 'Next Trial', allComplete: false };
    }
  }
  return {
    trial: trials[(currentIndex + 1) % trials.length] ?? trials[0] ?? null,
    label: 'Review Next',
    allComplete: true
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
      return { ...next, statuses, ratings, completed: true, succeeded: false, lastFeedback: 'Missed' };
    }
    return next;
  }

  const next = { ...progress, statuses: [...progress.statuses], ratings: [...progress.ratings], stepFrame: progress.stepFrame + 1 };
  if (!matchesInputStateStep(step, input, match)) return next;

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
  if (progress.completed) return progress;
  const step = trial.steps[progress.stepIndex];
  if (!step || step.kind !== 'impact') return progress;
  if (shouldIgnoreTrainingImpact(step, event)) return progress;
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
  const feedback = step.expectImpactKinds?.includes('clash') ? 'Clash' : step.counterHit || step.expectImpactKinds?.includes('counterHit') ? 'Counter Hit' : rating === 'Perfect' ? 'Perfect' : rating;
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
  if (script === 'recoverableHealth' && attacker.hp <= (trial?.setup.p1Hp ?? attacker.hp)) input.block = true;
  if (script === 'lowGuard') {
    input.block = true;
    input.down = true;
  }
  if (script === 'getup' && dummy.state === 'knockdown') input.confirm = true;
  if (script === 'wakeupMash' && dummy.state !== 'attack' && dummy.state !== 'hit' && dummy.state !== 'juggle' && dummy.state !== 'knockdown') input.jab = true;
  if (script === 'attack' && dummy.state !== 'attack' && dummy.state !== 'hit' && dummy.state !== 'juggle') input.heavy = true;
  if (script === 'kiAttack' && dummy.state !== 'attack' && dummy.state !== 'hit' && dummy.state !== 'juggle') {
    input.charge = true;
    input[pickKiAttackInput(dummy.character)] = true;
  }
  if (script === 'whiff' && dummy.state !== 'attack' && dummy.state !== 'hit' && dummy.state !== 'juggle') input.heavy = true;
  if (script === 'jumpIn') {
    if (dummy.state === 'idle' || dummy.state === 'walk' || dummy.state === 'block') input.jump = true;
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
    return { ...progress, statuses, ratings, completed: true, succeeded: true, lastFeedback: trial.successText };
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
    difficulty: category === 'movement' || category === 'offense' || category === 'defense' ? 1 : 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps: [{
      id: `${id}:step`,
      notation: normalizeTrainingNotation(notation, actions),
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

function makeKiChargeTrial(character: CharacterDefinition, dummy: CharacterDefinition | undefined): TrainingTrialDefinition {
  const setup = makeSetup(dummy, 'idle');
  const lesson = 'Hold charge to build hidden ki, then release to update the HUD. Ki does not update in real time by design, so be careful when charging for a specific move; if your timing is loose, you can hold past full ki into overcharge before the bar catches up.';
  const steps: TrainingTrialStep[] = [
    {
      id: 'ki:charge:hold',
      notation: ['O'],
      label: 'Hold Charge',
      actions: ['charge'],
      kind: 'state',
      targetFrame: 40,
      windowBefore: 12,
      windowAfter: 80,
      requireState: 'chargeKi',
      requireKiAtLeast: 8,
      reason: 'Hold until real ki has built, even though the HUD has not moved yet.'
    },
    {
      id: 'ki:charge:release',
      notation: ['release O'],
      label: 'Release Charge',
      actions: [],
      kind: 'state',
      targetFrame: 18,
      windowBefore: 4,
      windowAfter: 48,
      requireState: 'idle',
      requireDisplayedKiAtLeast: 8,
      reason: 'Release charge and let the HUD catch up to the ki you actually gained.'
    }
  ];
  return {
    id: `basic:${character.id}:ki:charge`,
    title: 'Ki Charge Timing',
    characterId: character.id,
    category: 'ki',
    mode: 'basics',
    difficulty: 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps,
    lesson,
    zoroLine: 'Feel the power before the bar confirms it.',
    successText: 'Ki charge timing learned.',
    previewScript: [
      { frame: 14, duration: 58, actions: ['charge'] },
      { frame: 84, duration: 12, actions: [] }
    ]
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
    notation: normalizeTrainingNotation(step.notation, step.actions),
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
    difficulty: category === 'movement' || category === 'offense' || category === 'defense' ? 1 : 2,
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

type MixedTrialStepInput = {
  id: string;
  routeKey?: string;
  animationKey?: string;
  notation: string[];
  label: string;
  input?: MoveInput;
  command?: string;
  actions: ActionName[];
  kind: TrainingTrialStepKind;
  requireState?: FighterRuntime['state'];
  requireDummyState?: FighterRuntime['state'];
  expectImpact?: ComboTrialStep['expect'];
  expectImpactKinds?: ImpactSparkEvent['kind'][];
  expectImpactAttackerSlot?: 1 | 2;
  expectImpactDefenderSlot?: 1 | 2;
  requireImpactKiBurst?: boolean;
  requireImpactDamage?: boolean;
  requireAirborneDefender?: boolean;
  targetFrame?: number;
  windowBefore?: number;
  windowAfter?: number;
  missAfterFrame?: number;
  counterHit?: boolean;
  reason: string;
};

function makeMixedTrial(
  character: CharacterDefinition,
  dummy: CharacterDefinition | undefined,
  category: TrainingTrialCategory,
  id: string,
  title: string,
  stepInputs: MixedTrialStepInput[],
  lesson: string,
  zoroLine: string,
  successText: string,
  options: { dummyScript?: TrainingDummyScript; setup?: Partial<TrainingTrialSetup>; sourceComboRoute?: GeneratedComboRoute } = {}
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript ?? options.setup?.dummyScript ?? 'idle', options.setup);
  const steps: TrainingTrialStep[] = stepInputs.map((step, index) => ({
    id: `${id}:${step.id}`,
    routeKey: step.routeKey,
    animationKey: step.animationKey,
    notation: normalizeTrainingNotation(step.notation, step.actions),
    label: step.label,
    input: step.input,
    command: step.command,
    actions: step.actions,
    kind: step.kind,
    targetFrame: step.targetFrame ?? (index === 0 ? 14 : 18),
    windowBefore: step.windowBefore ?? (step.kind === 'impact' ? 7 : 8),
    windowAfter: step.windowAfter ?? (step.kind === 'impact' ? 12 : 20),
    requireState: step.requireState,
    requireDummyState: step.requireDummyState,
    expectImpact: step.expectImpact,
    expectImpactKinds: step.expectImpactKinds,
    expectImpactAttackerSlot: step.expectImpactAttackerSlot,
    expectImpactDefenderSlot: step.expectImpactDefenderSlot,
    requireImpactKiBurst: step.requireImpactKiBurst,
    requireImpactDamage: step.requireImpactDamage,
    requireAirborneDefender: step.requireAirborneDefender,
    missAfterFrame: step.missAfterFrame,
    counterHit: step.counterHit,
    reason: step.reason
  }));
  return {
    id: `basic:${character.id}:${id}`,
    title,
    characterId: character.id,
    category,
    mode: 'basics',
    difficulty: category === 'movement' || category === 'offense' || category === 'defense' ? 1 : category === 'oki' ? 3 : 2,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps,
    lesson,
    zoroLine,
    successText,
    previewScript: makePreviewScript(steps),
    sourceComboRoute: options.sourceComboRoute
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
    requireImpactDamage?: boolean;
    requireAirborneDefender?: boolean;
    missAfterFrame?: number;
  } = {}
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript ?? 'idle', options.setup);
  const step: TrainingTrialStep = {
    id: `${id}:step`,
    notation: normalizeTrainingNotation(notation, actions),
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
    requireImpactDamage: options.requireImpactDamage,
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
    requireImpactDamage?: boolean;
    requireAirborneDefender?: boolean;
    missAfterFrame?: number;
  } = {}
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, options.dummyScript ?? options.setup?.dummyScript ?? 'idle', options.setup);
  const step: TrainingTrialStep = {
    id: `${id}:step`,
    notation: normalizeTrainingNotation(route.notation, commandRouteToActions(route.command, route.input)),
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
    requireImpactDamage: options.requireImpactDamage,
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

function normalizeTrainingNotation(notation: string[], actions: ActionName[]) {
  if (!actions.includes('jump')) return notation;
  return notation.map((token) => {
    const normalized = token.toLowerCase();
    if (normalized === 'u') return 'JUMP';
    if (normalized === 'u/f') return 'JUMP/f';
    if (normalized === 'u/b') return 'JUMP/b';
    return token;
  });
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
    requireImpactDamage?: boolean;
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
    notation: normalizeTrainingNotation(notation, actions),
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
    requireImpactDamage: options.requireImpactDamage,
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

function makeGetupTrial(
  character: CharacterDefinition,
  dummy: CharacterDefinition | undefined,
  id: string,
  title: string,
  notation: string[],
  actions: ActionName[],
  lesson: string,
  zoroLine: string,
  successText: string,
  options: {
    requireState: FighterRuntime['state'];
    requireGetupAction?: FighterRuntime['getupAction'];
    targetFrame?: number;
    windowBefore?: number;
  }
): TrainingTrialDefinition {
  const setup = makeSetup(dummy, 'idle', { p1State: 'knockdown' });
  const step: TrainingTrialStep = {
    id: `${id}:step`,
    notation: normalizeTrainingNotation(notation, actions),
    label: title,
    actions,
    kind: 'state',
    targetFrame: options.targetFrame ?? 14,
    windowBefore: options.windowBefore ?? 8,
    windowAfter: 20,
    requireState: options.requireState,
    requireGetupAction: options.requireGetupAction,
    reason: lesson
  };
  return {
    id: `basic:${character.id}:${id}`,
    title,
    characterId: character.id,
    category: 'oki',
    mode: 'basics',
    difficulty: 1,
    stageId: setup.stageId,
    dummyCharacterId: dummy?.id,
    setup,
    steps: [step],
    lesson,
    zoroLine,
    successText,
    previewScript: makePreviewScript([{ actions, targetFrame: 10 } as TrainingTrialStep])
  };
}

function makeSetup(dummy: CharacterDefinition | undefined, dummyScript: TrainingDummyScript, override: Partial<TrainingTrialSetup> = {}): TrainingTrialSetup {
  return {
    stageId: override.stageId ?? 'the-chamber',
    dummyCharacterId: override.dummyCharacterId ?? dummy?.id,
    dummyScript,
    p1Position: override.p1Position ?? { x: -0.45, z: 0 },
    p2Position: override.p2Position ?? { x: 0.45, z: 0 },
    p1State: override.p1State,
    p2State: override.p2State,
    p1Ki: override.p1Ki,
    p2Ki: override.p2Ki,
    p1TransformOvercharge: override.p1TransformOvercharge,
    p1TransformReadyTimer: override.p1TransformReadyTimer,
    corner: override.corner
  };
}

export function makeTrainingPreviewScript(steps: TrainingPreviewStep[]): TrainingPreviewFrame[] {
  const script: TrainingPreviewFrame[] = [];
  let cursor = 12;
  for (const step of steps) {
    script.push(...makeCommandPreviewFrames(step, cursor));
    cursor += Math.max(28, (step.targetFrame ?? 12) + 18);
  }
  return script;
}

function makePreviewScript(steps: Array<Pick<TrainingTrialStep, 'actions' | 'targetFrame'> & Partial<Pick<TrainingTrialStep, 'command'>>>): TrainingPreviewFrame[] {
  return makeTrainingPreviewScript(steps);
}

export function makeMovePreviewScript({
  input,
  command,
  targetFrame = 12
}: {
  input: MoveInput;
  command?: string;
  targetFrame?: number;
}): TrainingPreviewFrame[] {
  return makeTrainingPreviewScript([{
    actions: commandRouteToActions(command, input),
    command,
    targetFrame
  }]);
}

export function makeComboRoutePreviewScript(route: Pick<GeneratedComboRoute, 'steps'>): TrainingPreviewFrame[] {
  return makeTrainingPreviewScript(route.steps.map((step, index) => ({
    actions: stepToActions(step),
    command: step.command,
    targetFrame: index === 0 ? 18 : 14
  })));
}

export function makeCommandPreviewFrames(
  step: TrainingPreviewStep,
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
  if (step.requireImpactDamage && event.damage <= 0) return false;
  if (step.requireAirborneDefender && !event.juggled) return false;
  if (event.kind === 'clash' && step.expectImpactKinds?.includes('clash')) return true;
  if (step.command || step.input || step.counterHit || step.expectImpact) {
    return comboTrialStepMatchesImpact(stepToComboStep(step), event);
  }
  return true;
}

function shouldIgnoreTrainingImpact(step: TrainingTrialStep, event: ImpactSparkEvent) {
  if (event.kind !== 'clash') return false;
  if (!step.expectImpactKinds?.includes('clash')) return true;
  return Boolean(step.requireImpactDamage && event.damage <= 0);
}

function matchesStateStep(step: TrainingTrialStep, match: MatchSnapshot) {
  const player = match.fighters[0];
  const dummy = match.fighters[1];
  if (step.requireState && player.state !== step.requireState) return false;
  if (step.requireDummyState && dummy.state !== step.requireDummyState) return false;
  if (step.requireGetupAction && player.getupAction !== step.requireGetupAction) return false;
  if (step.requireKiAtLeast !== undefined && player.ki < step.requireKiAtLeast) return false;
  if (step.requireDisplayedKiAtLeast !== undefined && player.displayKi < step.requireDisplayedKiAtLeast) return false;
  if (!step.requireState && !step.requireDummyState && !step.requireGetupAction && step.requireKiAtLeast === undefined && step.requireDisplayedKiAtLeast === undefined) return false;
  return true;
}

function matchesInputStateStep(step: TrainingTrialStep, input: InputFrame, match: MatchSnapshot) {
  const needsActions = step.actions.length > 0;
  const needsState = Boolean(step.requireState || step.requireDummyState || step.requireGetupAction || step.requireKiAtLeast !== undefined || step.requireDisplayedKiAtLeast !== undefined);
  const actionsMatch = !needsActions || step.actions.every((action) => trainingActionMatches(action, input, match));
  const stateMatches = !needsState || matchesStateStep(step, match);
  return actionsMatch && stateMatches && (needsActions || needsState);
}

function trainingActionMatches(action: ActionName, input: InputFrame, match: MatchSnapshot) {
  if (input[action]) return true;
  if (action !== 'dashForward' && action !== 'dashBack') return false;
  const physicalDashDirection = (input as InputFrameWithMetadata).__horizontalDashDirection;
  if (!physicalDashDirection) return false;
  const activePhysicalDirection = input.left === input.right ? null : input.left ? 'left' : 'right';
  if (activePhysicalDirection !== physicalDashDirection) return false;
  const player = match.fighters[0];
  const dummy = match.fighters[1];
  const sideDelta = Math.abs(dummy.position.x - player.position.x) >= Math.abs(dummy.position.z - player.position.z)
    ? dummy.position.x - player.position.x
    : dummy.position.z - player.position.z;
  const forwardDirection = sideDelta >= 0 ? 'right' : 'left';
  const isForwardDash = physicalDashDirection === forwardDirection;
  return action === 'dashForward' ? isForwardDash : !isForwardDash;
}

function pickDummy(character: CharacterDefinition, roster: CharacterDefinition[]) {
  return roster.find((candidate) => candidate.id !== character.id && !candidate.unplayable && !candidate.locked) ??
    roster.find((candidate) => candidate.id !== character.id && !candidate.unplayable) ??
    undefined;
}

function pickClashDummy(character: CharacterDefinition, roster: CharacterDefinition[]) {
  return roster.find((candidate) => candidate.id !== character.id && !candidate.unplayable && !candidate.locked && hasKiBurstRoute(candidate)) ??
    roster.find((candidate) => candidate.id !== character.id && !candidate.unplayable && hasKiBurstRoute(candidate)) ??
    (hasKiBurstRoute(character) ? character : undefined);
}

function hasKiBurstRoute(character: CharacterDefinition) {
  return resolveMoveRoutes(character).some((route) => route.move.kiBurst);
}

function hasValidTransformTarget(character: CharacterDefinition, roster: CharacterDefinition[]) {
  if (!character.hasTransform || !character.transformCharacterId || character.transformCharacterId === character.id) return false;
  return roster.some((candidate) => candidate.id === character.transformCharacterId);
}

function makeTransformTrial(character: CharacterDefinition, dummy: CharacterDefinition | undefined, roster: CharacterDefinition[]) {
  const actions: ActionName[] = ['jab', 'heavy', 'kick', 'special'];
  const canTransform = hasValidTransformTarget(character, roster);
  return makeSimpleTrial(
    character,
    dummy,
    'ki',
    'ki:transform',
    'Transform',
    ['1+2+3+4'],
    actions,
    canTransform
      ? 'Transformations use ki plus the second transform bar. Fill ki, overcharge the second bar, then press 1+2+3+4 while the ready window is active to change forms.'
      : 'Some characters can transform after filling ki and overcharging the second transform bar. When a character has a form available, press 1+2+3+4 during the ready window to change forms.',
    canTransform ? 'When the second bar is ready, commit to the form.' : 'Know the sign. Some fighters carry another form.',
    canTransform ? 'Transformation started.' : 'Transform lesson complete.',
    canTransform
      ? {
          requireState: 'transform',
          setup: {
            p1Ki: 100,
            p1TransformOvercharge: 100,
            p1TransformReadyTimer: 3
          }
        }
      : {}
  );
}

function pickKiAttackInput(character: CharacterDefinition | undefined): MoveInput {
  if (!character) return 'special';
  const scored: Array<{ input: MoveInput; score: number }> = [];
  for (const move of character.moves) {
    if (move.timeStopFrames) continue;
    if (!move.kiBurst && !move.usesKi && !move.command?.startsWith('O+')) continue;
    scored.push({ input: move.input, score: move.kiBurst ? 4 : move.command?.startsWith('O+') ? 2 : 1 });
  }
  for (const [key, override] of Object.entries(character.moveOverrides ?? {})) {
    if (override.timeStopFrames) continue;
    const command = override.command ?? (key.startsWith('cmd:') ? key.slice(4) : key);
    if (!override.kiBurst && !override.usesKi && !command.startsWith('O+')) continue;
    const input = override.input ?? commandInputFromNotation(command);
    if (!input) continue;
    scored.push({ input, score: override.kiBurst ? 5 : command.startsWith('O+') ? 3 : 1 });
  }
  return scored.sort((a, b) => b.score - a.score)[0]?.input ?? 'special';
}

function commandInputFromNotation(command: string | undefined): MoveInput | null {
  const buttons = command?.match(/[1-4]/g) ?? [];
  const button = buttons[buttons.length - 1];
  return button ? buttonToInput[button] ?? null : null;
}

function makeBasicButtonSteps(character: CharacterDefinition): Array<{
  id: string;
  notation: string[];
  label: string;
  actions: ActionName[];
  requireState: FighterRuntime['state'];
  reason: string;
}> {
  return (['jab', 'heavy', 'kick', 'special'] as MoveInput[])
    .filter((input) => character.moves.some((move) => move.input === input && !move.command))
    .map((input) => ({
      id: input,
      notation: [inputToButton[input]],
      label: `${inputToButton[input]} Button`,
      actions: [inputToAction[input]],
      requireState: 'attack',
      reason: `Press ${inputToButton[input]} and notice its range, speed, and recovery.`
    }));
}

function makeBeginnerAutoComboTrial(character: CharacterDefinition, dummy: CharacterDefinition | undefined) {
  const plan = resolveBeginnerAutoComboPlan(character);
  if (!BEGINNER_AUTO_COMBO_INPUTS.every((input) => character.moves.some((move) => move.input === input && !move.command))) return null;

  const routeIntent = plan.sourceRoute ? comboRouteIntent(plan.sourceRoute) : undefined;
  const steps: MixedTrialStepInput[] = BEGINNER_AUTO_COMBO_INPUTS.map((input, index) => {
    const isFinisher = index === BEGINNER_AUTO_COMBO_INPUTS.length - 1;
    const finisherStep = isFinisher ? plan.finisherStep : undefined;
    return {
      id: isFinisher ? 'finisher' : input,
      routeKey: finisherStep?.routeKey,
      animationKey: finisherStep?.animationKey,
      notation: [inputToButton[input]],
      label: isFinisher ? `${inputToButton[input]} Special: ${plan.finisherLabel}` : `${inputToButton[input]} Button`,
      input,
      actions: [inputToAction[input]],
      kind: 'state',
      requireState: 'attack',
      reason: isFinisher
        ? routeIntent
          ? `Beginner 4 selects ${plan.finisherLabel}: ${routeIntent}.`
          : `Beginner 4 finishes with ${plan.finisherLabel}.`
        : `Press ${inputToButton[input]} as the Beginner auto combo advances.`
    };
  });

  return makeMixedTrial(
    character,
    dummy,
    'offense',
    'offense:beginner-auto-combo',
    'Beginner Auto Combo',
    steps,
    routeIntent
      ? `Beginner controls keep the input simple while still using ${plan.finisherLabel}: ${routeIntent}.`
      : `Beginner controls keep the input simple: press 4 through the chain and finish with ${plan.finisherLabel}.`,
    'Simple inputs. Real finish.',
    'Beginner auto combo complete.',
    { sourceComboRoute: plan.sourceRoute }
  );
}

function routeToTrialStep(
  id: string,
  route: ReturnType<typeof resolveMoveRoutes>[number],
  options: {
    expectImpact?: ComboTrialStep['expect'];
    expectImpactKinds?: ImpactSparkEvent['kind'][];
    expectImpactAttackerSlot?: 1 | 2;
    expectImpactDefenderSlot?: 1 | 2;
    requireImpactKiBurst?: boolean;
    requireImpactDamage?: boolean;
    requireAirborneDefender?: boolean;
    targetFrame?: number;
    windowBefore?: number;
    windowAfter?: number;
    missAfterFrame?: number;
    counterHit?: boolean;
    reason: string;
  }
): MixedTrialStepInput {
  const actions = commandRouteToActions(route.command, route.input);
  return {
    id,
    notation: normalizeTrainingNotation(route.notation, actions),
    label: route.label,
    routeKey: route.routeKey,
    animationKey: route.animationKey,
    input: route.input,
    command: route.command,
    actions,
    kind: 'impact',
    targetFrame: options.targetFrame,
    windowBefore: options.windowBefore,
    windowAfter: options.windowAfter,
    expectImpact: options.expectImpact,
    expectImpactKinds: options.expectImpactKinds,
    expectImpactAttackerSlot: options.expectImpactAttackerSlot ?? 1,
    expectImpactDefenderSlot: options.expectImpactDefenderSlot,
    requireImpactKiBurst: options.requireImpactKiBurst,
    requireImpactDamage: options.requireImpactDamage,
    requireAirborneDefender: options.requireAirborneDefender,
    missAfterFrame: options.missAfterFrame,
    counterHit: options.counterHit,
    reason: options.reason
  };
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

function pickProjectileRoute(character: CharacterDefinition, routes: ReturnType<typeof resolveMoveRoutes>, kind: 'projectile' | 'blast') {
  return routes
    .filter((route) => {
      const instances = routeProjectileInstances(character, route);
      if (kind === 'blast') return instances.some((instance) => projectileInstanceKind(character, instance) === 'blast');
      return instances.some((instance) => projectileInstanceKind(character, instance) !== 'blast');
    })
    .sort((a, b) => scoreProjectileRoute(character, b, kind) - scoreProjectileRoute(character, a, kind))[0];
}

function scoreProjectileRoute(character: CharacterDefinition, route: ReturnType<typeof resolveMoveRoutes>[number], kind: 'projectile' | 'blast') {
  const instances = routeProjectileInstances(character, route);
  const matching = instances.filter((instance) => kind === 'blast' ? projectileInstanceKind(character, instance) === 'blast' : projectileInstanceKind(character, instance) !== 'blast');
  return (
    matching.length * 20 +
    (routeUsesKi(route) ? 8 : 0) +
    (route.command ? 4 : 0) +
    Math.max(0, 20 - route.move.startupFrames) * 0.2 +
    route.move.damage * 0.05
  );
}

function routeUsesKi(route: ReturnType<typeof resolveMoveRoutes>[number]) {
  return Boolean(route.requiresKi || route.command?.startsWith('O+') || route.move.usesKi || route.move.kiBurst);
}

function routeProjectileInstances(character: CharacterDefinition, route: ReturnType<typeof resolveMoveRoutes>[number]): MoveProjectileInstance[] {
  const keys = projectileMoveKeys(route);
  const instances = keys.flatMap((key) => character.moveProjectiles?.[key] ?? []);
  return instances.filter((instance, index) => instances.findIndex((candidate) => candidate.id === instance.id) === index);
}

function projectileMoveKeys(route: ReturnType<typeof resolveMoveRoutes>[number]) {
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
  const commandKeys = route.command
    ? [route.command, route.command.startsWith('cmd:') ? route.command.slice(4) : `cmd:${route.command}`]
    : [];
  const candidates = [
    route.animationKey,
    route.move.animationKey,
    ...commandKeys,
    route.move.comboKey,
    route.move.id,
    baseInputKeys[route.input],
    route.input
  ].filter((key): key is string => Boolean(key));
  return [...new Set(candidates)];
}

function projectileInstanceKind(character: CharacterDefinition, instance: MoveProjectileInstance) {
  return instance.kind ?? character.projectiles?.find((projectile) => projectile.id === instance.projectileId)?.kind ?? 'projectile';
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
