import type { CharacterDefinition, MoveInput } from '../types';
import { generateCharacterComboRoutes, type ComboTrialStep, type GeneratedComboRoute } from './comboRoutes';

export const BEGINNER_AUTO_COMBO_INPUTS: MoveInput[] = ['jab', 'heavy', 'kick', 'special'];
export const BEGINNER_AUTO_COMBO_KI_COST = 35;

export type BeginnerAutoComboPlan = {
  inputs: MoveInput[];
  finisherCommand?: string;
  finisherLabel: string;
  finisherStep?: ComboTrialStep;
  sourceRoute?: GeneratedComboRoute;
  estimatedDamage?: number;
  usesKi: boolean;
};

type BeginnerAutoComboCandidate = {
  route: GeneratedComboRoute;
  step: ComboTrialStep;
  stepIndex: number;
  score: number;
  genericLabel: boolean;
};

export function resolveBeginnerAutoComboPlan(
  character: CharacterDefinition,
  options: { ki?: number } = {}
): BeginnerAutoComboPlan {
  const availableKi = options.ki ?? 0;
  const candidates = generateCharacterComboRoutes(character)
    .flatMap((route) => route.steps.map((step, stepIndex) => ({ route, step, stepIndex })))
    .filter(({ route, step, stepIndex }) => beginnerFinisherCandidateFits(character, route, step, stepIndex, availableKi))
    .map(({ route, step, stepIndex }) => {
      const genericLabel = isGenericBeginnerFinisherLabel(step.label, step.command);
      return {
        route,
        step,
        stepIndex,
        genericLabel,
        score: scoreBeginnerFinisherCandidate(route, step, stepIndex, genericLabel, availableKi)
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort(compareBeginnerFinisherCandidates);

  const finisher = candidates[0];
  if (!finisher) {
    return {
      inputs: BEGINNER_AUTO_COMBO_INPUTS,
      finisherLabel: baseSpecialLabel(character),
      usesKi: false
    };
  }

  return {
    inputs: BEGINNER_AUTO_COMBO_INPUTS,
    finisherCommand: finisher.step.command,
    finisherLabel: finisher.step.label,
    finisherStep: finisher.step,
    sourceRoute: finisher.route,
    estimatedDamage: finisher.route.estimatedDamage,
    usesKi: Boolean(finisher.step.command?.startsWith('O+'))
  };
}

export function hasNamedBeginnerAutoComboFinisher(character: CharacterDefinition, options: { ki?: number } = {}) {
  const availableKi = options.ki ?? 0;
  return generateCharacterComboRoutes(character).some((route) =>
    route.steps.some((step, stepIndex) =>
      beginnerFinisherCandidateFits(character, route, step, stepIndex, availableKi) &&
      !isGenericBeginnerFinisherLabel(step.label, step.command)
    )
  );
}

function beginnerFinisherCandidateFits(
  character: CharacterDefinition,
  route: GeneratedComboRoute,
  step: ComboTrialStep,
  stepIndex: number,
  availableKi: number
) {
  if (!step.command || step.input !== 'special') return false;
  if ((character.animationFrames?.[`cmd:${step.command}`]?.length ?? 0) <= 0) return false;
  if (route.tier === 'long' || route.tier === 'marathon') return false;
  if (route.category === 'counterHit' || route.structure.includes('counterHit') || step.counterHit) return false;
  if (route.launchRouteStyle === 'airChase') return false;
  if (step.expect?.juggled || step.expect?.tornado) return false;
  if (step.command.startsWith('O+')) return availableKi >= BEGINNER_AUTO_COMBO_KI_COST;
  if (route.estimatedDamage > 86) return false;
  if (route.category === 'tornado' && route.estimatedDamage > 42) return false;
  if (route.rewardClass === 'tornado' && route.estimatedDamage > 44) return false;
  if (stepIndex > 0 && !route.structure.includes('ender')) return false;
  return true;
}

function scoreBeginnerFinisherCandidate(
  route: GeneratedComboRoute,
  step: ComboTrialStep,
  stepIndex: number,
  genericLabel: boolean,
  availableKi: number
) {
  const usesKi = Boolean(step.command?.startsWith('O+'));
  const idealDamage = usesKi ? 42 : 30;
  let score = 34;

  score -= Math.abs(route.estimatedDamage - idealDamage) * 0.6;
  if (!usesKi && route.estimatedDamage > 42) score -= (route.estimatedDamage - 42) * 0.45;
  if (usesKi && route.estimatedDamage > 62) score -= (route.estimatedDamage - 62) * 1.15;

  if (route.tier === 'short') score += 9;
  if (route.tier === 'medium') score += 2;

  if (route.category === 'basic') score += 4;
  if (route.category === 'advanced') score += 3;
  if (route.category === 'crouch') score += 1;
  if (route.category === 'launcher') score -= 2;
  if (route.category === 'tornado') score -= 5;

  if (route.rewardClass === 'poke') score += 1;
  if (route.rewardClass === 'string') score += 4;
  if (route.rewardClass === 'launcher') score -= 3;
  if (route.rewardClass === 'tornado') score -= 5;

  if (route.structure.includes('ender')) score += 8;
  if (route.structure.includes('launcher')) score -= 2;
  if (route.structure.includes('tornado')) score -= 4;
  if (usesKi) score += availableKi >= BEGINNER_AUTO_COMBO_KI_COST ? 3 : -40;
  if (stepIndex === route.steps.length - 1) score += 5;
  if (step.command?.startsWith('qcf+') || step.command?.startsWith('qcb+')) score += 2;
  if (step.command?.includes('+') && !step.command.startsWith('O+')) score += 1;
  if (genericLabel) score -= 80;

  return score;
}

function compareBeginnerFinisherCandidates(a: BeginnerAutoComboCandidate, b: BeginnerAutoComboCandidate) {
  return b.score - a.score ||
    Number(a.genericLabel) - Number(b.genericLabel) ||
    a.route.level - b.route.level ||
    a.route.estimatedDamage - b.route.estimatedDamage ||
    a.step.label.localeCompare(b.step.label);
}

function isGenericBeginnerFinisherLabel(label: string, command?: string) {
  const normalized = label.trim().toLowerCase();
  return /frame link/i.test(label) ||
    (command !== undefined && normalized === command.toLowerCase()) ||
    normalized === 'right kick' ||
    normalized.endsWith(' right kick');
}

function baseSpecialLabel(character: CharacterDefinition) {
  return character.moves.find((move) => move.input === 'special' && !move.command)?.label ?? '4 Special';
}
