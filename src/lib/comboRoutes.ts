import type { CharacterDefinition, ImpactSparkEvent, MoveDefinition, MoveInput, MoveOverride } from '../types';
import { contextualComboFrameData, contextualHitAdvantage } from './comboFrameMath';

export type ComboRouteCategory = 'basic' | 'advanced' | 'crouch' | 'launcher' | 'tornado' | 'counterHit';
export type ComboRouteState = 'standing' | 'crouch' | 'whileStanding' | 'juggle';

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
  level: number;
  steps: ComboTrialStep[];
  reason: string;
};

export type CpuRouteRecommendation = {
  route: GeneratedComboRoute;
  step: ComboTrialStep;
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

const categoryLimits: Record<ComboRouteCategory, number> = {
  basic: 4,
  advanced: 6,
  crouch: 5,
  launcher: 5,
  tornado: 4,
  counterHit: 5
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
    const target = findBestLink(routes, advantage, starter, { allowStates: ['standing'] });
    if (!target) continue;
    pushTrial(makeRouteTrial('basic', starter, [target], `Neutral +${advantage} -> i${target.move.startupFrames} link`));
  }

  const advanced = routes
    .filter((route) => route.category === 'advanced' && route.move.damage > 0)
    .sort((a, b) => routeRewardScore(b) - routeRewardScore(a));
  for (const starter of advanced) {
    const advantage = contextualHitAdvantage(starter.move, { context: 'neutral' });
    const target = findBestLink(routes, advantage, starter, { allowStates: ['standing'] });
    if (!target) continue;
    pushTrial(makeRouteTrial('advanced', starter, [target], `Neutral +${advantage} -> i${target.move.startupFrames} command link`));
  }

  const crouchStarters = routes
    .filter((route) => route.move.endsInCrouch && route.move.onHitFrames > 0)
    .sort((a, b) => routeRewardScore(b) - routeRewardScore(a));
  for (const starter of crouchStarters) {
    const advantage = contextualHitAdvantage(starter.move, { context: 'neutral' });
    const target = findBestLink(routes, advantage, starter, { allowStates: ['crouch', 'whileStanding'] });
    if (!target) continue;
    pushTrial(makeRouteTrial('crouch', starter, [target], `FC end +${advantage} -> ${target.command ?? target.notation.join('+')}`));
  }

  const launchers = routes
    .filter((route) => (route.move.launchHeight ?? 0) > 0 && route.move.damage > 0)
    .sort((a, b) => routeRewardScore(b) - routeRewardScore(a));
  for (const starter of launchers) {
    const advantage = Math.max(contextualHitAdvantage(starter.move, { context: 'neutral' }), 24);
    const target = findBestLink(routes, advantage, starter, { allowStates: ['standing'], preferJuggle: true });
    if (!target) continue;
    pushTrial(makeRouteTrial('launcher', starter, [target], `Launch +${advantage} -> i${target.move.startupFrames} juggle`, { launched: true }));
  }

  const tornadoes = routes
    .filter((route) => route.move.tornado && route.move.damage > 0)
    .sort((a, b) => a.move.startupFrames - b.move.startupFrames || routeRewardScore(b) - routeRewardScore(a));
  for (const launcher of launchers) {
    const launcherAdvantage = Math.max(contextualHitAdvantage(launcher.move, { context: 'neutral' }), 28);
    const tornado = findBestLink(tornadoes, launcherAdvantage, launcher, { allowStates: ['standing'], preferJuggle: true });
    if (!tornado) continue;
    const tornadoFrameData = contextualComboFrameData(tornado.move, { context: 'juggle', comboHits: 2 });
    const finisher = findBestLink(routes, Math.max(tornadoFrameData.effectiveAdvantage, 16), tornado, { allowStates: ['standing'], preferJuggle: true });
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

  const used = new Set(context.usedKeys ?? []);
  const routes = generateCharacterComboRoutes(character)
    .filter((route) => routeFitsCpuContext(route, context))
    .map((route, index) => {
      const stepIndex = context.opening === 'neutral' || context.comboStep <= 0 ? 0 : Math.min(route.steps.length - 1, Math.max(1, context.comboStep));
      const step = route.steps[stepIndex] ?? route.steps[0];
      const key = step.command ?? step.input;
      const freshness = used.has(key) ? -0.42 : 0;
      const difficultyBonus = route.level <= context.difficulty + 2 ? 0.18 : -0.12;
      const closeoutPenalty = context.leaderCloseout && (route.category === 'launcher' || route.category === 'tornado') ? -1.2 : 0;
      const timing = context.remainingFrames > 0 ? clamp((context.remainingFrames - routeStepStartup(step)) / 18, -0.5, 0.5) : 0;
      const wave = positiveModulo(selector + routeRoll * (index + 3) + route.id.length * 7, 100) / 100;
      return {
        route,
        step,
        input: step.input,
        score: routeCategoryCpuWeight(route.category, context) + freshness + difficultyBonus + closeoutPenalty + timing + wave * 0.18
      };
    })
    .filter((candidate) => candidate.score > 0);

  routes.sort((a, b) => b.score - a.score);
  return routes[0] ?? null;
}

function makeRouteTrial(
  category: ComboRouteCategory,
  starter: ResolvedMoveRoute,
  followups: ResolvedMoveRoute[],
  reason: string,
  starterExpectation?: ComboTrialStepExpectation,
  firstFollowupExpectation?: ComboTrialStepExpectation
): GeneratedComboRoute {
  const steps = [
    routeToStep(starter, category === 'counterHit' || starterExpectation?.counterHit, reasonForStarter(starter, category), starterExpectation),
    ...followups.map((route, index) => routeToStep(route, false, reasonForFollowup(route), index === 0 ? firstFollowupExpectation : undefined))
  ];
  return {
    id: `${category}:${steps.map((step) => step.command ?? step.input).join('>')}:${reason}`,
    title: category === 'counterHit' ? `${starter.command ?? starter.label} Counter Hit` : `${starter.command ?? starter.label} Route`,
    category,
    level: routeLevel(category, starter, followups),
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

function findBestLink(
  routes: ResolvedMoveRoute[],
  advantage: number,
  starter: ResolvedMoveRoute,
  options: { allowStates: ComboRouteState[]; preferJuggle?: boolean }
) {
  return routes
    .filter((route) => route.id !== starter.id)
    .filter((route) => options.allowStates.includes(route.state))
    .filter((route) => route.move.startupFrames <= advantage)
    .filter((route) => route.move.damage > 0)
    .sort((a, b) => {
      const aTightness = advantage - a.move.startupFrames;
      const bTightness = advantage - b.move.startupFrames;
      const aJuggle = options.preferJuggle ? juggleScore(a) : 0;
      const bJuggle = options.preferJuggle ? juggleScore(b) : 0;
      return bJuggle - aJuggle || aTightness - bTightness || routeRewardScore(b) - routeRewardScore(a);
    })[0] ?? null;
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

function routeLevel(category: ComboRouteCategory, starter: ResolvedMoveRoute, followups: ResolvedMoveRoute[]) {
  const complexity = starter.complexity + followups.reduce((sum, route) => sum + route.complexity, 0);
  const categoryBonus = category === 'basic' ? 0 : category === 'advanced' ? 2 : category === 'crouch' ? 3 : category === 'launcher' ? 4 : category === 'tornado' ? 5 : 4;
  return clamp(Math.round(1 + complexity * 0.45 + categoryBonus + Math.max(0, followups.length - 1)), 1, 10);
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

function cpuRouteKnowledgeChance(difficulty: CpuRouteContext['difficulty'], opening: CpuRouteContext['opening'], leaderCloseout?: boolean) {
  const base = difficulty <= 1 ? 0.08 : difficulty === 2 ? 0.22 : difficulty === 3 ? 0.42 : difficulty === 4 ? 0.68 : 0.84;
  const openingBonus = opening === 'neutral' ? 0 : opening === 'whiff' ? 0.08 : 0.14;
  return clamp(base + openingBonus - (leaderCloseout ? 0.18 : 0), 0.02, 0.92);
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
