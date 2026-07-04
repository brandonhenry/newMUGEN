import type { CharacterDefinition, ImpactSparkEvent, MoveDefinition, MoveInput, MoveOverride } from '../types';
import { contextualComboFrameData, contextualHitAdvantage, type ComboHitContext } from './comboFrameMath';

export type ComboRouteCategory = 'basic' | 'advanced' | 'crouch' | 'launcher' | 'tornado' | 'counterHit';
export type ComboRouteState = 'standing' | 'crouch' | 'whileStanding' | 'juggle';
export type ComboRouteTier = 'short' | 'medium' | 'long' | 'marathon';
export type LaunchRouteStyle = 'grounded' | 'airChase' | 'hybrid';

export type ResolvedMoveRoute = {
  id: string;
  label: string;
  notation: string[];
  input: MoveInput;
  command?: string;
  animationKey: string;
  move: MoveDefinition;
  category: ComboRouteCategory;
  state: ComboRouteState;
  complexity: number;
};

export type ComboTrialStepExpectation = {
  counterHit?: boolean;
  launched?: boolean;
  juggled?: boolean;
  tornado?: boolean;
};

export type ComboTrialStep = {
  notation: string[];
  label: string;
  input: MoveInput;
  command?: string;
  startupFrames: number;
  counterHit?: boolean;
  reason?: string;
  expect?: ComboTrialStepExpectation;
};

export type GeneratedComboRoute = {
  id: string;
  title: string;
  category: ComboRouteCategory;
  launchRouteStyle?: LaunchRouteStyle;
  tier: ComboRouteTier;
  level: number;
  estimatedHits: number;
  targetHits: number;
  steps: ComboTrialStep[];
  reason: string;
};

export type CpuRouteRecommendation = {
  route: GeneratedComboRoute;
  step: ComboTrialStep;
  stepIndex: number;
  input: MoveInput;
  score: number;
};

export type CpuRouteContext = {
  difficulty: 1 | 2 | 3 | 4 | 5;
  opening: 'neutral' | 'hitstun' | 'whiff' | 'juggle';
  remainingFrames: number;
  comboStep: number;
  leaderCloseout?: boolean;
  usedKeys?: string[];
  usedFamilies?: string[];
  usedVisualFamilies?: string[];
  activeRouteId?: string | null;
  selector?: number;
  routeRoll?: number;
};

const buttonToInput: Record<string, MoveInput> = {
  '1': 'jab',
  '2': 'heavy',
  '3': 'kick',
  '4': 'special'
};

const inputToButton: Record<MoveInput, string> = {
  jab: '1',
  heavy: '2',
  kick: '3',
  special: '4'
};

const baseInputToAnimationKey: Record<MoveInput, string> = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};

const rawButtonCommandToBaseKey: Record<string, string> = {
  '1': 'jableft',
  '2': 'jabright',
  '3': 'kickleft',
  '4': 'kickright'
};

const MAX_ROUTE_HITS = 30;
const FRAME_LINK_GRACE = 2;
const MAX_ROUTE_IDENTITY_USES = 1;
const MAX_LAUNCHERS_PER_ROUTE = 1;
const MAX_TORNADOES_PER_ROUTE = 2;

const categoryLimits: Record<ComboRouteCategory, number> = {
  basic: 12,
  advanced: 16,
  crouch: 14,
  launcher: 16,
  tornado: 14,
  counterHit: 12
};

const multiHitTargets: Record<ComboRouteCategory, number[]> = {
  basic: [4, 7],
  advanced: [5, 9, 14],
  crouch: [6, 10, 16],
  launcher: [8, 14, 22, 30],
  tornado: [10, 18, 30],
  counterHit: [5, 9, 16]
};

export const comboTrialCategories: ComboRouteCategory[] = ['basic', 'advanced', 'crouch', 'launcher', 'tornado', 'counterHit'];

export const comboTrialCategoryLabels: Record<ComboRouteCategory, string> = {
  basic: 'Basic Links',
  advanced: 'Advanced Links',
  crouch: 'Crouch Routes',
  launcher: 'Launcher Routes',
  tornado: 'Tornado Routes',
  counterHit: 'Counter Hit'
};

export function generateCharacterComboRoutes(character: CharacterDefinition): GeneratedComboRoute[] {
  const routes = resolveMoveRoutes(character);
  const trials: GeneratedComboRoute[] = [];
  const used = new Set<string>();

  const pushTrial = (trial: GeneratedComboRoute) => {
    if (trial.steps.length < 2) return;
    if (used.has(trial.id)) return;
    const count = trials.filter((candidate) => candidate.category === trial.category).length;
    if (count >= categoryLimits[trial.category]) return;
    used.add(trial.id);
    trials.push(trial);
  };

  const basics = routes
    .filter((route) => route.category === 'basic' && route.move.damage > 0)
    .sort((a, b) => a.move.startupFrames - b.move.startupFrames || contextualHitAdvantage(b.move, { context: 'neutral' }) - contextualHitAdvantage(a.move, { context: 'neutral' }));
  for (const starter of basics) {
    const advantage = contextualHitAdvantage(starter.move, { context: 'neutral' });
    const targets = findBestLinks(routes, advantage, starter, { allowStates: ['standing'] }, 2);
    for (const target of targets) {
      pushTrial(makeRouteTrial('basic', starter, [target], `Neutral +${advantage} -> i${target.move.startupFrames} link`));
    }
  }

  const advanced = routes
    .filter((route) => route.category === 'advanced' && route.move.damage > 0)
    .sort((a, b) => routeRewardScore(b) - routeRewardScore(a));
  for (const starter of advanced) {
    const advantage = contextualHitAdvantage(starter.move, { context: 'neutral' });
    const targets = findBestLinks(routes, advantage, starter, { allowStates: ['standing'] }, 2);
    for (const target of targets) {
      pushTrial(makeRouteTrial('advanced', starter, [target], `Neutral +${advantage} -> i${target.move.startupFrames} command link`));
    }
  }

  const crouchStarters = routes
    .filter((route) => route.move.endsInCrouch && route.move.onHitFrames > 0)
    .sort((a, b) => routeRewardScore(b) - routeRewardScore(a));
  for (const starter of crouchStarters) {
    const advantage = contextualHitAdvantage(starter.move, { context: 'neutral' });
    const targets = findBestLinks(routes, advantage, starter, { allowStates: ['crouch', 'whileStanding'] }, 2);
    for (const target of targets) {
      pushTrial(makeRouteTrial('crouch', starter, [target], `FC end +${advantage} -> ${target.command ?? target.notation.join('+')}`));
    }
  }

  const launchers = routes
    .filter((route) => (route.move.launchHeight ?? 0) > 0 && route.move.damage > 0)
    .sort((a, b) => routeRewardScore(b) - routeRewardScore(a));
  for (const starter of launchers) {
    const advantage = Math.max(contextualHitAdvantage(starter.move, { context: 'neutral' }), 24);
    const starterRequiresAirChase = routeRequiresAirChase(starter);
    const groundedTargets = starterRequiresAirChase ? [] : findBestLinks(routes, advantage, starter, { allowStates: ['standing'], preferJuggle: true, groundedOnly: true }, 2);
    for (const target of groundedTargets) {
      pushTrial(makeRouteTrial('launcher', starter, [target], `Grounded Launch +${advantage} -> i${target.move.startupFrames} juggle`, { launched: true }, undefined, 'grounded'));
    }
    const airTargets = findBestLinks(routes, advantage, starter, { allowStates: ['standing'], preferJuggle: true, airChaseOnly: true }, 1);
    for (const target of airTargets) {
      pushTrial(makeRouteTrial('launcher', starter, [target], `Air Chase Launch +${advantage} -> i${target.move.startupFrames} juggle`, { launched: true }, undefined, 'airChase'));
    }
  }

  const tornadoes = routes
    .filter((route) => route.move.tornado && route.move.damage > 0)
    .sort((a, b) => a.move.startupFrames - b.move.startupFrames || routeRewardScore(b) - routeRewardScore(a));
  for (const launcher of launchers) {
    const launcherAdvantage = Math.max(contextualHitAdvantage(launcher.move, { context: 'neutral' }), 28);
    const tornado = findBestLink(tornadoes, launcherAdvantage, launcher, { allowStates: ['standing'], preferJuggle: true });
    if (!tornado) continue;
    const tornadoFrameData = contextualComboFrameData(tornado.move, { context: 'juggle', comboHits: 2 });
    const finisher = findBestLink(routes, Math.max(tornadoFrameData.effectiveAdvantage, 16), tornado, { allowStates: ['standing'], preferJuggle: true, disallowLaunchers: true });
    pushTrial(makeRouteTrial('tornado', launcher, finisher ? [tornado, finisher] : [tornado], `Launch +${launcherAdvantage} -> ${tornado.command ?? tornado.notation.join('+')} | Juggle +${tornadoFrameData.effectiveAdvantage}`, { launched: true }, { tornado: true, juggled: true }));
  }

  const counterHitters = routes
    .filter((route) => route.move.counterHit && !isPlainNeutralRoute(route) && route.move.damage > 0)
    .sort((a, b) => counterHitAdvantage(b.move) - counterHitAdvantage(a.move));
  for (const starter of counterHitters) {
    const advantage = counterHitAdvantage(starter.move);
    const target = findBestLink(routes, advantage, starter, { allowStates: starter.move.endsInCrouch ? ['crouch', 'whileStanding', 'standing'] : ['standing'] });
    if (!target) continue;
    pushTrial(makeRouteTrial('counterHit', starter, [target], `CH +${advantage} -> i${target.move.startupFrames} link`, { counterHit: true }));
  }

  for (const category of comboTrialCategories) {
    const starters = startersForCategory(routes, category);
    const limits = multiHitTargets[category];
    for (const [starterIndex, starter] of starters.entries()) {
      for (const targetHits of limits) {
        if (targetHits >= 21 && starterIndex > 1) continue;
        const route = buildMultiHitTrial(routes, category, starter, targetHits);
        if (!route) continue;
        pushTrial(route);
      }
    }
  }

  return comboTrialCategories.flatMap((category) =>
    trials
      .filter((trial) => trial.category === category)
      .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title))
  );
}

export function generateComboTrials(character: CharacterDefinition): GeneratedComboRoute[] {
  return generateCharacterComboRoutes(character);
}

export function resolveMoveRoutes(character: CharacterDefinition): ResolvedMoveRoute[] {
  const routes: ResolvedMoveRoute[] = [];
  const seen = new Set<string>();
  const addRoute = (route: ResolvedMoveRoute) => {
    if (!hasAnimationFrames(character, route.animationKey)) return;
    if (route.move.damage <= 0) return;
    if (seen.has(route.id)) return;
    seen.add(route.id);
    routes.push(route);
  };

  for (const base of character.moves) {
    const animationKey = base.animationKey ?? baseInputToAnimationKey[base.input];
    const move = applyMoveOverrides(character, base, [base.id, base.input, animationKey]);
    addRoute({
      id: `base:${base.input}`,
      label: move.label,
      notation: [inputToButton[base.input]],
      input: base.input,
      command: move.command,
      animationKey,
      move: { ...move, command: move.command },
      category: 'basic',
      state: 'standing',
      complexity: 1
    });
  }

  const commandKeys = new Set<string>();
  Object.keys(character.animationFrames ?? {}).forEach((key) => {
    if (key.startsWith('cmd:')) commandKeys.add(key);
  });
  Object.keys(character.moveOverrides ?? {}).forEach((key) => {
    if (key.startsWith('cmd:') && hasAnimationFrames(character, key)) commandKeys.add(key);
  });

  for (const key of [...commandKeys].sort()) {
    const command = key.slice(4);
    const input = commandInput(command);
    const base = character.moves.find((move) => move.input === input) ?? character.moves[0];
    if (!base) continue;
    const baseKey = rawButtonCommandToBaseKey[command] ?? baseInputToAnimationKey[input];
    const move = applyMoveOverrides(character, base, [
      baseKey,
      base.id,
      base.input,
      command,
      `cmd:${command}`,
      key
    ]);
    const commandMove: MoveDefinition = {
      ...move,
      input,
      command: move.command ?? command,
      notation: move.notation ?? command,
      animationKey: move.animationKey ?? key,
      comboKey: move.comboKey ?? `${command}:route`
    };
    addRoute({
      id: `cmd:${command}`,
      label: commandMove.label,
      notation: parseNotationTokens(command),
      input,
      command,
      animationKey: key,
      move: commandMove,
      category: categorizeCommandRoute(commandMove, command),
      state: commandState(command),
      complexity: commandComplexity(command)
    });
  }

  return routes;
}

export function comboTrialStepMatchesImpact(step: ComboTrialStep, event: ImpactSparkEvent) {
  if (step.counterHit && event.kind !== 'counterHit') return false;
  if (step.expect?.counterHit && event.kind !== 'counterHit') return false;
  if (step.expect?.launched && !event.launched) return false;
  if (step.expect?.juggled && !event.juggled) return false;
  if (step.expect?.tornado && !event.tornado) return false;
  if (step.command) return event.moveCommand === step.command;
  return event.moveInput === step.input && !event.moveCommand;
}

export function recommendCpuComboRoute(character: CharacterDefinition, context: CpuRouteContext): CpuRouteRecommendation | null {
  const knowledgeChance = cpuRouteKnowledgeChance(context.difficulty, context.opening, context.leaderCloseout);
  const selector = context.selector ?? 0;
  const routeRoll = context.routeRoll ?? 0;
  const roll = positiveModulo(selector * 13 + routeRoll * 17 + context.comboStep * 31, 100) / 100;
  if (roll > knowledgeChance) return null;

  const usedKeys = context.usedKeys ?? [];
  const usedFamilies = context.usedFamilies ?? [];
  const usedVisualFamilies = context.usedVisualFamilies ?? [];
  const eligibleRoutes = generateCharacterComboRoutes(character).filter((route) => routeFitsCpuContext(route, context));
  const activeRoute = eligibleRoutes.find((route) => route.id === context.activeRouteId);
  if (activeRoute) {
    const stepIndex = cpuRouteStepIndex(activeRoute, context);
    const step = activeRoute.steps[stepIndex] ?? activeRoute.steps[activeRoute.steps.length - 1] ?? activeRoute.steps[0];
    if (step && isCpuRouteStepFreshEnough(step, usedKeys, usedFamilies, usedVisualFamilies, context, true)) {
      return {
        route: activeRoute,
        step,
        stepIndex,
        input: step.input,
        score: 10 + routeCategoryCpuWeight(activeRoute.category, context) + routeTierCpuWeight(activeRoute.tier, context) + launchRouteStyleCpuWeight(activeRoute, context)
      };
    }
  }

  const routes = eligibleRoutes
    .map((route, index) => {
      const stepIndex = cpuRouteStepIndex(route, context);
      const step = route.steps[stepIndex] ?? route.steps[0];
      const key = stepIdentityKey(step);
      const family = stepFamilyKey(step);
      const visualFamily = stepVisualFamilyKey(step);
      const sameKeyUses = usedKeys.filter((used) => keyMatchesMoveIdentity(used, key)).length;
      const sameFamilyUses = countFamilyUses(usedKeys, usedFamilies, family, step.input);
      const sameVisualFamilyUses = countVisualFamilyUses(usedVisualFamilies, visualFamily);
      const freshness = -sameKeyUses * 0.85 - sameFamilyUses * 0.32 - sameVisualFamilyUses * (context.opening === 'juggle' ? 0.72 : 0.2);
      const difficultyBonus = route.level <= context.difficulty + 2 ? 0.18 : -0.12;
      const closeoutPenalty = context.leaderCloseout && (route.category === 'launcher' || route.category === 'tornado') ? -1.2 : 0;
      const timing = context.remainingFrames > 0 ? clamp((context.remainingFrames - routeStepStartup(step)) / 18, -0.5, 0.5) : 0;
      const wave = positiveModulo(selector + routeRoll * (index + 3) + route.id.length * 7, 100) / 100;
      const variety = routeDiversityScore(route) * (context.difficulty >= 4 ? 0.08 : 0.03);
      return {
        route,
        step,
        stepIndex,
        input: step.input,
        score: routeCategoryCpuWeight(route.category, context) + routeTierCpuWeight(route.tier, context) + launchRouteStyleCpuWeight(route, context) + freshness + difficultyBonus + closeoutPenalty + timing + variety + wave * 0.18
      };
    })
    .filter((candidate) => candidate.score > 0 && isCpuRouteStepFreshEnough(candidate.step, usedKeys, usedFamilies, usedVisualFamilies, context, false));

  routes.sort((a, b) => b.score - a.score);
  return routes[0] ?? null;
}

type RoutePlannerState = {
  category: ComboRouteCategory;
  context: ComboHitContext;
  advantage: number;
  comboHits: number;
  tornadoCount: number;
  launcherCount: number;
  routeState: ComboRouteState;
  identities: string[];
  families: string[];
  launchRouteStyle: LaunchRouteStyle;
};

function startersForCategory(routes: ResolvedMoveRoute[], category: ComboRouteCategory) {
  const starterRoutes = routes
    .filter((route) => route.move.damage > 0)
    .filter((route) => {
      if (category === 'basic') return route.category === 'basic';
      if (category === 'advanced') return route.category === 'advanced';
      if (category === 'crouch') return route.move.endsInCrouch;
      if (category === 'launcher') return (route.move.launchHeight ?? 0) > 0;
      if (category === 'tornado') return (route.move.launchHeight ?? 0) > 0;
      return route.move.counterHit && !isPlainNeutralRoute(route);
    })
    .sort((a, b) => starterScore(b, category) - starterScore(a, category));
  return starterRoutes.slice(0, 8);
}

function buildMultiHitTrial(
  routes: ResolvedMoveRoute[],
  category: ComboRouteCategory,
  starter: ResolvedMoveRoute,
  targetHits: number
) {
  const state = initialPlannerState(category, starter);
  const sequence = [starter];
  while (sequence.length < Math.min(MAX_ROUTE_HITS, targetHits)) {
    const next = chooseNextRoute(routes, state, targetHits);
    if (!next) break;
    sequence.push(next);
    advancePlannerState(state, next);
  }

  if (sequence.length < minimumRouteHits(targetHits)) return null;
  if (category === 'tornado' && !sequence.slice(1).some((route) => route.move.tornado)) return null;
  if (category === 'crouch' && !sequence.slice(1).some((route) => route.state === 'crouch' || route.state === 'whileStanding')) return null;

  const reason = routeReasonForSequence(category, sequence, targetHits);
  return makeRouteTrialFromSequence(category, sequence, reason, targetHits);
}

function initialPlannerState(category: ComboRouteCategory, starter: ResolvedMoveRoute): RoutePlannerState {
  const isCounterHit = category === 'counterHit';
  const launches = (starter.move.launchHeight ?? 0) > 0;
  const advantage = launches
    ? Math.max(contextualHitAdvantage(starter.move, { context: 'neutral', counterHit: isCounterHit }), 28)
    : isCounterHit
      ? counterHitAdvantage(starter.move)
      : contextualHitAdvantage(starter.move, { context: 'neutral' });
  return {
    category,
    context: launches ? 'juggle' : 'combo',
    advantage,
    comboHits: 1,
    tornadoCount: 0,
    launcherCount: launches ? 1 : 0,
    routeState: starter.move.endsInCrouch ? 'crouch' : 'standing',
    identities: [routeIdentity(starter)],
    families: [routeFamily(starter)],
    launchRouteStyle: launches && routeRequiresAirChase(starter) ? 'airChase' : 'grounded'
  };
}

function chooseNextRoute(routes: ResolvedMoveRoute[], state: RoutePlannerState, targetHits: number) {
  const allowedStates = allowedFollowupStates(state);
  return routes
    .filter((route) => isValidNextRoute(route, state, allowedStates))
    .sort((a, b) => nextRouteScore(b, state, targetHits) - nextRouteScore(a, state, targetHits))
    [0] ?? null;
}

function isValidNextRoute(route: ResolvedMoveRoute, state: RoutePlannerState, allowedStates: ComboRouteState[]) {
  if (route.move.damage <= 0) return false;
  if (!allowedStates.includes(route.state)) return false;
  if (route.move.startupFrames > state.advantage + FRAME_LINK_GRACE) return false;

  const identity = routeIdentity(route);
  const family = routeFamily(route);
  const previousIdentity = state.identities[state.identities.length - 1];
  const previousFamily = state.families[state.families.length - 1];
  if (identity === previousIdentity) return false;
  if (family === previousFamily && state.comboHits >= 2) return false;
  if (identityUseCount(state.identities, identity) >= maxIdentityUsesForRoute(state.comboHits + 1)) return false;
  if (identityUseCount(state.families, family) >= maxFamilyUsesForRoute(state.comboHits + 1)) return false;
  if ((route.move.launchHeight ?? 0) > 0 && state.launcherCount >= MAX_LAUNCHERS_PER_ROUTE) return false;
  if (route.move.tornado && state.context !== 'juggle') return false;
  if (route.move.tornado && state.tornadoCount >= MAX_TORNADOES_PER_ROUTE) return false;
  return true;
}

function advancePlannerState(state: RoutePlannerState, route: ResolvedMoveRoute) {
  const identity = routeIdentity(route);
  const family = routeFamily(route);
  const nextIdentities = [...state.identities, identity];
  const nextFamilies = [...state.families, family];
  const repeatCount = countTrailingRouteIdentities(nextIdentities, identity);
  const hitContext = state.context === 'juggle' ? 'juggle' : 'combo';
  const frameData = contextualComboFrameData(route.move, {
    context: hitContext,
    comboHits: state.comboHits + 1,
    repeatCount,
    routeVarietyCredit: routeVarietyCredit(route, state)
  });
  const tornadoExtends = Boolean(route.move.tornado) && state.context === 'juggle' && state.tornadoCount < MAX_TORNADOES_PER_ROUTE;
  const launches = (route.move.launchHeight ?? 0) > 0 && state.context !== 'juggle';
  state.advantage = Math.max(
    frameData.effectiveAdvantage,
    tornadoExtends ? 30 : launches ? 28 : variedJuggleAdvantageFloor(route.move, state.comboHits + 1, repeatCount, state.context) ?? frameData.effectiveAdvantage
  );
  state.context = state.context === 'juggle' || (route.move.launchHeight ?? 0) > 0 ? 'juggle' : 'combo';
  state.comboHits = Math.min(MAX_ROUTE_HITS, state.comboHits + 1);
  state.tornadoCount += tornadoExtends ? 1 : 0;
  state.launcherCount += (route.move.launchHeight ?? 0) > 0 ? 1 : 0;
  state.routeState = route.move.endsInCrouch ? 'crouch' : 'standing';
  state.identities = nextIdentities.slice(-MAX_ROUTE_HITS);
  state.families = nextFamilies.slice(-MAX_ROUTE_HITS);
  state.launchRouteStyle = combineLaunchRouteStyle(state.launchRouteStyle, routeRequiresAirChase(route), state.comboHits);
}

function allowedFollowupStates(state: RoutePlannerState): ComboRouteState[] {
  if (state.routeState === 'crouch') return ['crouch', 'whileStanding', 'standing'];
  if (state.routeState === 'whileStanding') return ['standing'];
  return ['standing'];
}

function nextRouteScore(route: ResolvedMoveRoute, state: RoutePlannerState, targetHits: number) {
  const identity = routeIdentity(route);
  const uses = identityUseCount(state.identities, identity);
  const family = routeFamily(route);
  const familyUses = identityUseCount(state.families, family);
  const isNewIdentity = !state.identities.includes(identity);
  const isNewFamily = !state.families.includes(family);
  const needsTornado = state.context === 'juggle' && state.tornadoCount < MAX_TORNADOES_PER_ROUTE && state.comboHits >= Math.max(4, Math.floor(targetHits * 0.36));
  const needsCrouchBranch = state.routeState === 'crouch' && (route.state === 'crouch' || route.state === 'whileStanding');
  const lightFiller = state.context === 'juggle' ? clamp((14 - route.move.damage) / 8, -1, 1.2) : 0;
  return (
    10 -
    route.move.startupFrames * 0.18 -
    uses * 8 -
    familyUses * 3 +
    (isNewIdentity ? 5 : 0) +
    (isNewFamily ? 3 : 0) +
    (route.command ? 3 : 0) +
    (needsCrouchBranch ? 8 : 0) +
    (route.state === 'whileStanding' ? 2 : 0) +
    (route.move.endsInCrouch ? 2 : 0) +
    (route.move.tornado && state.context === 'juggle' ? (needsTornado ? 20 : 6) : 0) +
    ((route.move.launchHeight ?? 0) > 0 ? -8 : 0) +
    (route.move.knockdown ? -6 : 0) +
    (state.context === 'juggle' ? juggleScore(route) * 0.35 + lightFiller + groundedJuggleRouteBonus(route, state) : routeRewardScore(route) * 0.08)
  );
}

function routeVarietyCredit(route: ResolvedMoveRoute, state: RoutePlannerState) {
  let credit = route.command ? 1 : 0;
  if (state.routeState === 'crouch' && (route.state === 'crouch' || route.state === 'whileStanding')) credit += 2;
  if (route.move.tornado && state.context === 'juggle') credit += 3;
  if (!state.identities.includes(routeIdentity(route))) credit += 1;
  if (!state.families.includes(routeFamily(route))) credit += 2;
  if (state.context === 'juggle' && state.comboHits >= 6) credit += 3;
  if (state.context === 'juggle' && state.comboHits >= 12) credit += 3;
  if (state.context === 'juggle' && state.comboHits >= 20) credit += 2;
  return credit;
}

function variedJuggleAdvantageFloor(move: MoveDefinition, comboHits: number, repeatCount: number, context: ComboHitContext) {
  if (context !== 'juggle' || repeatCount > 1 || move.launchHeight || move.knockdown) return null;
  if (comboHits >= 18) return 30;
  if (comboHits >= 10) return 26;
  if (comboHits >= 6) return 22;
  return null;
}

function starterScore(route: ResolvedMoveRoute, category: ComboRouteCategory) {
  return routeRewardScore(route) + (category === 'counterHit' ? counterHitAdvantage(route.move) : 0) + (category === 'tornado' && (route.move.launchHeight ?? 0) > 0 ? 12 : 0);
}

function minimumRouteHits(targetHits: number) {
  if (targetHits >= 21) return 12;
  if (targetHits >= 11) return 8;
  if (targetHits >= 6) return 5;
  return 3;
}

function routeReasonForSequence(category: ComboRouteCategory, sequence: ResolvedMoveRoute[], targetHits: number) {
  const actualHits = sequence.length;
  const parts = [`${actualHits}/${targetHits} hits`];
  if (category === 'counterHit') parts.push(`CH +${counterHitAdvantage(sequence[0].move)}`);
  if ((sequence[0].move.launchHeight ?? 0) > 0) {
    const style = launchRouteStyleForSequence(sequence);
    parts.push(style === 'grounded' ? 'Grounded Launch' : style === 'airChase' ? 'Air Chase Launch' : 'Hybrid Launch');
  }
  if (sequence.some((route) => route.move.tornado)) parts.push('Tornado');
  if (sequence.some((route) => route.move.endsInCrouch || route.state === 'crouch' || route.state === 'whileStanding')) parts.push('FC/WS');
  return parts.join(' -> ');
}

function makeRouteTrialFromSequence(
  category: ComboRouteCategory,
  sequence: ResolvedMoveRoute[],
  reason: string,
  targetHits: number
): GeneratedComboRoute {
  const steps: ComboTrialStep[] = [];
  let context: ComboHitContext = 'neutral';
  for (const [index, route] of sequence.entries()) {
    const expect: ComboTrialStepExpectation = {};
    const counterHit = index === 0 && category === 'counterHit';
    if (counterHit) expect.counterHit = true;
    if ((route.move.launchHeight ?? 0) > 0 && (index === 0 || context !== 'juggle')) expect.launched = true;
    if (context === 'juggle') expect.juggled = true;
    if (route.move.tornado && context === 'juggle') {
      expect.juggled = true;
      expect.tornado = true;
    }
    steps.push(routeToStep(route, counterHit, index === 0 ? reasonForStarter(route, category) : reasonForFollowup(route), Object.keys(expect).length > 0 ? expect : undefined));
    context = context === 'juggle' || (route.move.launchHeight ?? 0) > 0 ? 'juggle' : 'combo';
  }

  const estimatedHits = Math.min(MAX_ROUTE_HITS, steps.length);
  const launchRouteStyle = (sequence[0].move.launchHeight ?? 0) > 0 ? launchRouteStyleForSequence(sequence) : undefined;
  return {
    id: `${category}:${steps.map((step) => step.command ?? step.input).join('>')}:${estimatedHits}:${targetHits}`,
    title: routeTitleForSequence(category, sequence, estimatedHits, launchRouteStyle),
    category,
    launchRouteStyle,
    tier: routeTier(estimatedHits),
    level: routeLevel(category, sequence[0], sequence.slice(1), estimatedHits),
    estimatedHits,
    targetHits,
    steps,
    reason
  };
}

function makeRouteTrial(
  category: ComboRouteCategory,
  starter: ResolvedMoveRoute,
  followups: ResolvedMoveRoute[],
  reason: string,
  starterExpectation?: ComboTrialStepExpectation,
  firstFollowupExpectation?: ComboTrialStepExpectation,
  explicitLaunchRouteStyle?: LaunchRouteStyle
): GeneratedComboRoute {
  const steps = [
    routeToStep(starter, category === 'counterHit' || starterExpectation?.counterHit, reasonForStarter(starter, category), starterExpectation),
    ...followups.map((route, index) => routeToStep(route, false, reasonForFollowup(route), index === 0 ? firstFollowupExpectation : undefined))
  ];
  const estimatedHits = Math.min(MAX_ROUTE_HITS, steps.length);
  const sequence = [starter, ...followups];
  const launchRouteStyle = explicitLaunchRouteStyle ?? ((starter.move.launchHeight ?? 0) > 0 ? launchRouteStyleForSequence(sequence) : undefined);
  return {
    id: `${category}:${steps.map((step) => step.command ?? step.input).join('>')}:${reason}`,
    title: category === 'counterHit' ? `${starter.command ?? starter.label} Counter Hit` : routeTitleForSequence(category, sequence, estimatedHits, launchRouteStyle),
    category,
    launchRouteStyle,
    tier: routeTier(estimatedHits),
    level: routeLevel(category, starter, followups, estimatedHits),
    estimatedHits,
    targetHits: estimatedHits,
    steps,
    reason
  };
}

function routeToStep(route: ResolvedMoveRoute, counterHit = false, reason?: string, expect?: ComboTrialStepExpectation): ComboTrialStep {
  return {
    notation: route.notation,
    label: route.label,
    input: route.input,
    command: route.command,
    startupFrames: route.move.startupFrames,
    counterHit,
    reason,
    expect
  };
}

function routeTitleForSequence(category: ComboRouteCategory, sequence: ResolvedMoveRoute[], estimatedHits: number, launchRouteStyle?: LaunchRouteStyle) {
  const starterName = sequence[0].command ?? sequence[0].label;
  if (category === 'launcher' || launchRouteStyle) {
    const label = launchRouteStyle === 'airChase' ? 'Air Chase Launcher' : launchRouteStyle === 'hybrid' ? 'Hybrid Launcher' : 'Grounded Launcher';
    return estimatedHits > 2 ? `${starterName} ${label} ${estimatedHits}-Hit Route` : `${starterName} ${label} Route`;
  }
  return `${starterName} ${estimatedHits}-Hit Route`;
}

function launchRouteStyleForSequence(sequence: ResolvedMoveRoute[]): LaunchRouteStyle {
  const followups = sequence.slice(1);
  const firstAirIndex = followups.findIndex(routeRequiresAirChase);
  if (routeRequiresAirChase(sequence[0]) || firstAirIndex === 0) return 'airChase';
  if (firstAirIndex > 0) return 'hybrid';
  return 'grounded';
}

function combineLaunchRouteStyle(current: LaunchRouteStyle, nextRequiresAirChase: boolean, comboHitsAfterAdvance: number): LaunchRouteStyle {
  if (!nextRequiresAirChase) return current;
  if (current === 'airChase' || comboHitsAfterAdvance <= 2) return 'airChase';
  return 'hybrid';
}

function routeRequiresAirChase(route: ResolvedMoveRoute) {
  return Boolean(route.move.jumpBeforeMove || route.move.tracking === 'homing' || routeUsesJumpNotation(route));
}

function routeUsesJumpNotation(route: ResolvedMoveRoute) {
  return route.notation.some((token) => {
    const normalized = token.toLowerCase();
    return normalized === 'u' || normalized.includes('u/') || normalized.includes('/u');
  }) ||
    Boolean(route.command && /(^|[+,_])u([+,_]|$)|(^|[+,_])u\/[bf]([+,_]|$)/.test(route.command.toLowerCase()));
}

function groundedJuggleRouteBonus(route: ResolvedMoveRoute, state: RoutePlannerState) {
  if (state.context !== 'juggle') return 0;
  return routeRequiresAirChase(route)
    ? (state.comboHits <= 3 ? -8 : -2.5)
    : (state.comboHits <= 5 ? 7 : 2.5);
}

function findBestLink(
  routes: ResolvedMoveRoute[],
  advantage: number,
  starter: ResolvedMoveRoute,
  options: { allowStates: ComboRouteState[]; preferJuggle?: boolean; disallowLaunchers?: boolean; groundedOnly?: boolean; airChaseOnly?: boolean }
) {
  return findBestLinks(routes, advantage, starter, options, 1)[0] ?? null;
}

function findBestLinks(
  routes: ResolvedMoveRoute[],
  advantage: number,
  starter: ResolvedMoveRoute,
  options: { allowStates: ComboRouteState[]; preferJuggle?: boolean; disallowLaunchers?: boolean; groundedOnly?: boolean; airChaseOnly?: boolean },
  limit: number
) {
  return routes
    .filter((route) => route.id !== starter.id)
    .filter((route) => options.allowStates.includes(route.state))
    .filter((route) => !(options.disallowLaunchers && (route.move.launchHeight ?? 0) > 0))
    .filter((route) => !options.groundedOnly || !routeRequiresAirChase(route))
    .filter((route) => !options.airChaseOnly || routeRequiresAirChase(route))
    .filter((route) => !(options.preferJuggle && (starter.move.launchHeight ?? 0) > 0 && (route.move.launchHeight ?? 0) > 0))
    .filter((route) => route.move.startupFrames <= advantage)
    .filter((route) => route.move.damage > 0)
    .sort((a, b) => {
      const aTightness = advantage - a.move.startupFrames;
      const bTightness = advantage - b.move.startupFrames;
      const aJuggle = options.preferJuggle ? juggleScore(a) : 0;
      const bJuggle = options.preferJuggle ? juggleScore(b) : 0;
      return bJuggle - aJuggle || aTightness - bTightness || routeRewardScore(b) - routeRewardScore(a);
    })
    .slice(0, limit);
}

function applyMoveOverrides(character: CharacterDefinition, move: MoveDefinition, keys: Array<string | undefined>): MoveDefinition {
  const overrides = character.moveOverrides ?? {};
  return [...new Set(keys.filter(Boolean) as string[])].reduce<MoveDefinition>((current, key) => {
    const override = overrides[key];
    return override ? mergeMoveOverride(current, override) : current;
  }, move);
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

function categorizeCommandRoute(move: MoveDefinition, command: string): ComboRouteCategory {
  if (move.counterHit && !isPlainNeutralCommand(command)) return 'counterHit';
  if (move.tornado) return 'tornado';
  if ((move.launchHeight ?? 0) > 0) return 'launcher';
  if (command.startsWith('FC+') || command.startsWith('WS+')) return 'crouch';
  return 'advanced';
}

function commandState(command: string): ComboRouteState {
  if (command.startsWith('FC+')) return 'crouch';
  if (command.startsWith('WS+')) return 'whileStanding';
  return 'standing';
}

function commandComplexity(command: string) {
  let score = 2;
  if (command.includes('/')) score += 1;
  if (command.includes(',')) score += 1;
  if (command.includes('+') && command.match(/[1-4]/g)?.length && (command.match(/[1-4]/g)?.length ?? 0) > 1) score += 1;
  if (/^(qcf|qcb|hcf|hcb|dp|rdp|cd|WR|iWR|iWS)/.test(command)) score += 2;
  if (/^(FC|WS|SS|SSL|SSR|BT)/.test(command)) score += 1;
  if (/^(O|H\.|R\.)/.test(command)) score += 2;
  return score;
}

function commandInput(command: string): MoveInput {
  const buttons = [...command.matchAll(/[1-4]/g)];
  const button = buttons[buttons.length - 1]?.[0] ?? '1';
  return buttonToInput[button] ?? 'jab';
}

function parseNotationTokens(command: string) {
  return command
    .replace(/^H\./, 'H.+')
    .replace(/^R\./, 'R.+')
    .split('+')
    .filter(Boolean);
}

function hasAnimationFrames(character: CharacterDefinition, key: string) {
  return (character.animationFrames?.[key]?.length ?? 0) > 0;
}

function isPlainNeutralCommand(command: string) {
  return command === '1' || command === '2' || command === '3' || command === '4';
}

function isPlainNeutralRoute(route: ResolvedMoveRoute) {
  return route.category === 'basic' || Boolean(route.command && isPlainNeutralCommand(route.command));
}

function counterHitAdvantage(move: MoveDefinition) {
  return move.onCounterHitFrames + Math.max(0, Math.round(move.counterHitStunBonusFrames ?? 0));
}

function routeRewardScore(route: ResolvedMoveRoute) {
  return route.move.damage + route.move.onHitFrames * 0.5 + ((route.move.launchHeight ?? 0) > 0 ? 8 : 0) + (route.move.tornado ? 6 : 0) + (route.move.knockdown ? 4 : 0);
}

function juggleScore(route: ResolvedMoveRoute) {
  return (route.move.tornado ? 8 : 0) + (route.move.knockdown ? 3 : 0) + route.move.damage * 0.25 - route.move.startupFrames * 0.08;
}

function routeLevel(category: ComboRouteCategory, starter: ResolvedMoveRoute, followups: ResolvedMoveRoute[], estimatedHits = followups.length + 1) {
  const complexity = starter.complexity + followups.reduce((sum, route) => sum + route.complexity, 0);
  const categoryBonus = category === 'basic' ? 0 : category === 'advanced' ? 2 : category === 'crouch' ? 3 : category === 'launcher' ? 4 : category === 'tornado' ? 5 : 4;
  const lengthBonus = estimatedHits >= 21 ? 5 : estimatedHits >= 11 ? 3 : estimatedHits >= 6 ? 2 : Math.max(0, followups.length - 1);
  return clamp(Math.round(1 + complexity * 0.28 + categoryBonus + lengthBonus), 1, 10);
}

function routeTier(estimatedHits: number): ComboRouteTier {
  if (estimatedHits >= 21) return 'marathon';
  if (estimatedHits >= 11) return 'long';
  if (estimatedHits >= 6) return 'medium';
  return 'short';
}

function routeIdentity(route: ResolvedMoveRoute) {
  return route.move.comboKey ?? route.command ?? route.id;
}

function routeFamily(route: ResolvedMoveRoute) {
  if (!route.command) return `neutral:${route.input}`;
  if (route.command.startsWith('FC+')) return `FC:${route.input}`;
  if (route.command.startsWith('WS+')) return `WS:${route.input}`;
  if (route.command.startsWith('SS+') || route.command.startsWith('SSL+') || route.command.startsWith('SSR+')) return `SS:${route.input}`;
  if (route.command.startsWith('O+')) return `ki:${route.input}`;
  if (/^(qcf|qcb|hcf|hcb|dp|rdp|cd|WR|iWR|iWS)/.test(route.command)) return `motion:${route.input}`;
  if (/^[1-4]\+[1-4]/.test(route.command)) return `chord:${route.input}`;
  const prefix = route.command.split('+').slice(0, -1).join('+') || 'command';
  return `${prefix.replace(/[1-4]/g, '#')}:${route.input}`;
}

function maxIdentityUsesForRoute(routeHits: number) {
  return MAX_ROUTE_IDENTITY_USES;
}

function maxFamilyUsesForRoute(routeHits: number) {
  if (routeHits >= 21) return 4;
  if (routeHits >= 11) return 3;
  return 2;
}

function routeDiversityScore(route: GeneratedComboRoute) {
  const identities = new Set(route.steps.map((step) => stepIdentityKey(step)));
  const families = new Set(route.steps.map((step) => stepFamilyKey(step)));
  return identities.size + families.size * 0.65;
}

function cpuRouteStepIndex(route: GeneratedComboRoute, context: CpuRouteContext) {
  if (context.opening === 'neutral' || context.comboStep <= 0) return 0;
  return Math.min(route.steps.length - 1, Math.max(1, context.comboStep));
}

export function cpuMoveIdentityKeyFromStep(step: Pick<ComboTrialStep, 'command' | 'input'>) {
  return step.command ?? `neutral:${step.input}`;
}

export function cpuMoveFamilyKeyFromStep(step: Pick<ComboTrialStep, 'command' | 'input'>) {
  return commandFamilyKey(step.command, step.input);
}

export function cpuMoveVisualFamilyKeyFromStep(step: Pick<ComboTrialStep, 'input'>) {
  return `visual:${baseInputToAnimationKey[step.input]}`;
}

export function cpuMoveIdentityKeyFromMove(move: Pick<MoveDefinition, 'command' | 'route' | 'input'>) {
  return move.command ?? `${move.route ?? 'neutral'}:${move.input}`;
}

export function cpuMoveFamilyKeyFromMove(move: Pick<MoveDefinition, 'command' | 'input'>) {
  return commandFamilyKey(move.command, move.input);
}

export function cpuMoveVisualFamilyKeyFromMove(move: Pick<MoveDefinition, 'input'>) {
  return `visual:${baseInputToAnimationKey[move.input]}`;
}

function stepIdentityKey(step: ComboTrialStep) {
  return cpuMoveIdentityKeyFromStep(step);
}

function stepFamilyKey(step: ComboTrialStep) {
  return cpuMoveFamilyKeyFromStep(step);
}

function stepVisualFamilyKey(step: ComboTrialStep) {
  return cpuMoveVisualFamilyKeyFromStep(step);
}

function commandFamilyKey(command: string | undefined, input: MoveInput) {
  if (!command) return `neutral:${input}`;
  if (command.startsWith('FC+')) return `FC:${input}`;
  if (command.startsWith('WS+')) return `WS:${input}`;
  if (command.startsWith('SS+') || command.startsWith('SSL+') || command.startsWith('SSR+')) return `SS:${input}`;
  if (command.startsWith('O+')) return `ki:${input}`;
  if (/^(qcf|qcb|hcf|hcb|dp|rdp|cd|WR|iWR|iWS)/.test(command)) return `motion:${input}`;
  if (/^[1-4]\+[1-4]/.test(command)) return `chord:${input}`;
  const prefix = command.split('+').slice(0, -1).join('+') || 'command';
  return `${prefix.replace(/[1-4]/g, '#')}:${input}`;
}

function isCpuRouteStepFreshEnough(
  step: ComboTrialStep,
  usedKeys: string[],
  usedFamilies: string[],
  usedVisualFamilies: string[],
  context: CpuRouteContext,
  committedRoute: boolean
) {
  const identity = stepIdentityKey(step);
  const family = stepFamilyKey(step);
  const visualFamily = stepVisualFamilyKey(step);
  const identityUses = usedKeys.filter((used) => keyMatchesMoveIdentity(used, identity)).length;
  const familyUses = countFamilyUses(usedKeys, usedFamilies, family, step.input);
  const visualFamilyUses = countVisualFamilyUses(usedVisualFamilies, visualFamily);
  const identityLimit = 1;
  const familyLimit = committedRoute && context.difficulty >= 4 ? 3 : context.difficulty >= 4 ? 2 : 1;
  const visualFamilyLimit = context.opening === 'juggle' ? 1 : familyLimit;
  return identityUses < identityLimit && familyUses < familyLimit && visualFamilyUses < visualFamilyLimit;
}

function keyMatchesMoveIdentity(usedKey: string, identity: string) {
  return usedKey === identity || usedKey.endsWith(`:${identity}`) || identity.endsWith(`:${usedKey}`);
}

function keyMatchesMoveFamily(usedKey: string, family: string, input: MoveInput) {
  if (usedKey === family) return true;
  if (usedKey === `neutral:${input}` || usedKey.endsWith(`:${input}`) || usedKey.endsWith(`+${inputToButton[input]}`)) {
    return family.endsWith(`:${input}`);
  }
  return false;
}

function countFamilyUses(usedKeys: string[], usedFamilies: string[], family: string, input: MoveInput) {
  const keyMatches = usedKeys.filter((used) => keyMatchesMoveFamily(used, family, input)).length;
  const familyMatches = usedFamilies.filter((used) => used === family).length;
  return Math.max(keyMatches, familyMatches);
}

function countVisualFamilyUses(usedVisualFamilies: string[], visualFamily: string) {
  return usedVisualFamilies.filter((used) => used === visualFamily).length;
}

function identityUseCount(identities: string[], identity: string) {
  return identities.filter((candidate) => candidate === identity).length;
}

function countTrailingRouteIdentities(identities: string[], identity: string) {
  let count = 0;
  for (let index = identities.length - 1; index >= 0 && identities[index] === identity; index -= 1) {
    count += 1;
  }
  return Math.max(1, count);
}

function reasonForStarter(route: ResolvedMoveRoute, category: ComboRouteCategory) {
  if (category === 'counterHit') return `CH +${counterHitAdvantage(route.move)}`;
  if ((route.move.launchHeight ?? 0) > 0) return 'Launch';
  if (route.move.endsInCrouch) return 'Ends FC';
  return `+${route.move.onHitFrames}`;
}

function reasonForFollowup(route: ResolvedMoveRoute) {
  if (route.move.tornado) return 'Tornado';
  if (route.state === 'crouch') return 'FC link';
  if (route.state === 'whileStanding') return 'WS link';
  if (route.move.knockdown) return 'Ender';
  return `i${route.move.startupFrames}`;
}

function routeFitsCpuContext(route: GeneratedComboRoute, context: CpuRouteContext) {
  if (context.leaderCloseout && (route.category === 'launcher' || route.category === 'tornado' || route.level > 5)) return false;
  if (context.difficulty <= 2 && route.tier !== 'short') return false;
  if (context.difficulty === 3 && (route.tier === 'long' || route.tier === 'marathon')) return false;
  if (context.difficulty === 4 && route.tier === 'marathon') return false;
  if (!routeTierAllowedForCpuMoment(route, context)) return false;
  if (context.difficulty <= 1 && route.category !== 'basic') return false;
  if (context.difficulty === 2 && route.level > 4) return false;
  if (context.difficulty === 3 && route.level > 6) return false;
  if (context.opening === 'juggle') return route.category === 'launcher' || route.category === 'tornado' || route.steps.some((step) => step.expect?.juggled || step.expect?.tornado);
  if (context.opening === 'hitstun') return route.category !== 'counterHit' && route.steps.some((step) => routeStepStartup(step) <= Math.max(1, context.remainingFrames + (context.difficulty >= 4 ? 5 : 1)));
  if (context.opening === 'whiff') return route.category === 'advanced' || route.category === 'launcher' || route.category === 'counterHit';
  return route.category === 'basic' || route.category === 'advanced' || (context.difficulty >= 4 && route.category === 'crouch');
}

function routeCategoryCpuWeight(category: ComboRouteCategory, context: CpuRouteContext) {
  if (context.opening === 'juggle') return category === 'tornado' ? 1.2 : category === 'launcher' ? 0.7 : 0.2;
  if (context.opening === 'hitstun') return category === 'basic' ? 0.6 : category === 'advanced' ? 0.78 : category === 'crouch' ? 0.86 : category === 'launcher' ? 0.74 : 0.58;
  if (context.opening === 'whiff') return category === 'launcher' ? 0.95 : category === 'advanced' ? 0.7 : category === 'counterHit' ? 0.64 : 0.4;
  return category === 'basic' ? 0.46 : category === 'advanced' ? 0.5 : category === 'crouch' ? 0.42 : 0.22;
}

function routeTierCpuWeight(tier: ComboRouteTier, context: CpuRouteContext) {
  if (tier === 'short') return 0.18;
  if (tier === 'medium') return context.difficulty >= 4 ? 0.14 : -0.08;
  if (tier === 'long') return context.difficulty >= 5 && context.opening !== 'neutral' ? -0.18 : -0.34;
  return context.difficulty >= 5 && context.opening === 'juggle' ? -0.92 : -1.25;
}

function launchRouteStyleCpuWeight(route: GeneratedComboRoute, context: CpuRouteContext) {
  if (!route.launchRouteStyle || (route.category !== 'launcher' && route.category !== 'tornado')) return 0;
  if (context.opening !== 'juggle' && context.opening !== 'hitstun') return 0;
  if (route.launchRouteStyle === 'grounded') return context.difficulty >= 4 ? 0.72 : 0.38;
  if (route.launchRouteStyle === 'hybrid') return context.difficulty >= 4 ? 0.16 : 0.04;
  return context.difficulty >= 5 ? -0.32 : -0.58;
}

function cpuRouteKnowledgeChance(difficulty: CpuRouteContext['difficulty'], opening: CpuRouteContext['opening'], leaderCloseout?: boolean) {
  const base = difficulty <= 1 ? 0.08 : difficulty === 2 ? 0.22 : difficulty === 3 ? 0.42 : difficulty === 4 ? 0.68 : 0.84;
  const openingBonus = opening === 'neutral' ? 0 : opening === 'whiff' ? 0.08 : 0.14;
  return clamp(base + openingBonus - (leaderCloseout ? 0.18 : 0), 0.02, 0.92);
}

function routeTierAllowedForCpuMoment(route: GeneratedComboRoute, context: CpuRouteContext) {
  if (route.tier === 'short' || route.tier === 'medium') return true;
  if (context.activeRouteId === route.id) return true;
  if (context.leaderCloseout) return false;

  const momentRoll = cpuRouteAmbitionMomentRoll(context);
  const roll = cpuRouteAmbitionRoll(route, context);
  if (route.tier === 'long') return momentRoll < longRouteChance(context) && roll < 0.7;
  return momentRoll < marathonRouteChance(route, context) && roll < 0.36;
}

function longRouteChance(context: CpuRouteContext) {
  if (context.difficulty < 4) return 0;
  const base =
    context.opening === 'juggle' ? 0.3 :
    context.opening === 'whiff' ? 0.26 :
    context.opening === 'hitstun' ? 0.22 :
    0.08;
  const difficultyBonus = context.difficulty >= 5 ? 0.12 : 0;
  const lateComboPenalty = context.comboStep >= 10 ? 0.18 : context.comboStep >= 6 ? 0.1 : 0;
  return clamp(base + difficultyBonus - lateComboPenalty, 0, 0.5);
}

function marathonRouteChance(route: GeneratedComboRoute, context: CpuRouteContext) {
  if (context.difficulty < 5) return 0;
  if (context.opening === 'neutral') return 0;
  if (context.comboStep >= 12) return 0;
  const base =
    context.opening === 'juggle' ? 0.08 :
    context.opening === 'whiff' ? 0.05 :
    0.035;
  const lateComboPenalty = context.comboStep >= 8 ? 0.06 : context.comboStep >= 4 ? 0.03 : 0;
  const veryLongPenalty = Math.max(0, route.estimatedHits - 22) * 0.008;
  const diversityCredit = routeDiversityScore(route) >= 0.9 ? 0.012 : 0;
  return clamp(base + diversityCredit - lateComboPenalty - veryLongPenalty, 0, 0.09);
}

function cpuRouteAmbitionMomentRoll(context: CpuRouteContext) {
  const selector = context.selector ?? 0;
  const routeRoll = context.routeRoll ?? 0;
  return positiveModulo(selector * 29 + routeRoll * 31 + context.comboStep * 17 + context.remainingFrames * 3, 100) / 100;
}

function cpuRouteAmbitionRoll(route: GeneratedComboRoute, context: CpuRouteContext) {
  const selector = context.selector ?? 0;
  const routeRoll = context.routeRoll ?? 0;
  return positiveModulo(selector * 19 + routeRoll * 23 + route.id.length * 7 + context.comboStep * 11 + route.estimatedHits * 5, 100) / 100;
}

function routeStepStartup(step: ComboTrialStep) {
  return step.startupFrames;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
