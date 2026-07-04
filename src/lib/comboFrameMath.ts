import type { MoveDefinition } from '../types';

export type ComboHitContext = 'neutral' | 'combo' | 'juggle';

export type ComboAdvantageContext = {
  context: ComboHitContext;
  counterHit?: boolean;
  comboHits?: number;
  repeatCount?: number;
  routeVarietyCredit?: number;
};

export type ContextualFrameData = {
  baseAdvantage: number;
  repeatPenalty: number;
  comboLengthPenalty: number;
  routeVarietyCredit: number;
  effectiveAdvantage: number;
};

export function contextualComboFrameData(move: MoveDefinition, context: ComboAdvantageContext): ContextualFrameData {
  const baseAdvantage = baseContextualAdvantage(move, context);
  const repeatCount = Math.max(1, Math.round(context.repeatCount ?? 1));
  const repeatPenalty = repeatCount > 1 ? (repeatCount - 1) * repeatPenaltyFrames(move, context.context) : 0;
  const comboLengthPenalty = comboLengthPenaltyFrames(context.context, context.comboHits ?? 0);
  const routeVarietyCredit = routeVarietyCreditFrames(move, context);
  const effectiveAdvantage = Math.max(
    minimumContextualAdvantage(context.context),
    Math.round(baseAdvantage - repeatPenalty - comboLengthPenalty + routeVarietyCredit)
  );
  return {
    baseAdvantage,
    repeatPenalty,
    comboLengthPenalty,
    routeVarietyCredit,
    effectiveAdvantage
  };
}

export function contextualHitAdvantage(move: MoveDefinition, context: ComboAdvantageContext) {
  return contextualComboFrameData(move, context).effectiveAdvantage;
}

export function defaultOnComboHitFrames(move: Pick<MoveDefinition, 'onHitFrames' | 'activeFrames' | 'damage' | 'launchHeight' | 'tornado' | 'knockdown' | 'forwardForce' | 'command' | 'hitLevel'>) {
  const commitmentCredit = move.command && !isPlainNeutralCommand(move.command) ? 2 : 0;
  const risk =
    (move.launchHeight ? 3 : 0) +
    (move.tornado ? 2 : 0) +
    (move.knockdown ? 2 : 0) +
    Math.max(0, Math.round((move.damage - 12) / 4)) +
    Math.max(0, move.activeFrames - 3) +
    Math.max(0, Math.round(((move.forwardForce ?? 0) - 1.4) * 1.5));
  const lowCredit = move.hitLevel === 'low' ? 1 : 0;
  return clamp(Math.round(move.onHitFrames * 0.84) + 1 + commitmentCredit + lowCredit - risk, 5, Math.max(5, move.onHitFrames + 2));
}

export function defaultOnJuggleHitFrames(move: Pick<MoveDefinition, 'onHitFrames' | 'activeFrames' | 'damage' | 'launchHeight' | 'tornado' | 'knockdown' | 'forwardForce' | 'command' | 'juggleRefloatVelocity'>) {
  const explicitJuggleCredit = move.tornado ? 11 : move.juggleRefloatVelocity ? 6 : 0;
  const commandCredit = move.command && !isPlainNeutralCommand(move.command) ? 2 : 0;
  const propertyRisk =
    (move.launchHeight ? 5 : 0) +
    (move.knockdown ? 4 : 0) +
    Math.max(0, Math.round((move.damage - 10) / 3)) +
    Math.max(0, move.activeFrames - 3) +
    Math.max(0, Math.round(((move.forwardForce ?? 0) - 1) * 1.4));
  return clamp(Math.round(move.onHitFrames * 0.62) + 1 + explicitJuggleCredit + commandCredit - propertyRisk, 4, move.tornado ? 30 : 20);
}

export function defaultComboRepeatPenaltyFrames(move: Pick<MoveDefinition, 'damage' | 'launchHeight' | 'tornado' | 'knockdown' | 'command'>) {
  const commandRelief = move.command && !isPlainNeutralCommand(move.command) ? -1 : 0;
  return clamp(3 + commandRelief + Math.max(0, Math.round((move.damage - 10) / 5)) + (move.launchHeight ? 2 : 0) + (move.tornado ? 2 : 0) + (move.knockdown ? 1 : 0), 2, 10);
}

export function defaultJuggleRepeatPenaltyFrames(move: Pick<MoveDefinition, 'damage' | 'launchHeight' | 'tornado' | 'knockdown' | 'command'>) {
  const commandRelief = move.command && !isPlainNeutralCommand(move.command) ? -1 : 0;
  return clamp(5 + commandRelief + Math.max(0, Math.round((move.damage - 8) / 4)) + (move.launchHeight ? 4 : 0) + (move.tornado ? 5 : 0) + (move.knockdown ? 2 : 0), 4, 16);
}

function baseContextualAdvantage(move: MoveDefinition, context: ComboAdvantageContext) {
  if (context.context === 'juggle') return move.onJuggleHitFrames ?? defaultOnJuggleHitFrames(move);
  if (context.context === 'combo') return move.onComboHitFrames ?? defaultOnComboHitFrames(move);
  if (context.counterHit) return move.onCounterHitFrames + Math.max(0, Math.round(move.counterHitStunBonusFrames ?? 0));
  return move.onHitFrames;
}

function repeatPenaltyFrames(move: MoveDefinition, context: ComboHitContext) {
  if (context === 'juggle') return move.juggleRepeatPenaltyFrames ?? defaultJuggleRepeatPenaltyFrames(move);
  if (context === 'combo') return move.comboRepeatPenaltyFrames ?? defaultComboRepeatPenaltyFrames(move);
  return Math.max(1, Math.round((move.comboRepeatPenaltyFrames ?? defaultComboRepeatPenaltyFrames(move)) * 0.5));
}

function comboLengthPenaltyFrames(context: ComboHitContext, comboHits: number) {
  if (comboHits <= 1) return 0;
  const extraHits = comboHits - 1;
  if (context === 'juggle') return Math.min(10, Math.floor(extraHits * 1.2));
  if (context === 'combo') return Math.min(8, Math.floor(extraHits * 1.1));
  return 0;
}

function minimumContextualAdvantage(context: ComboHitContext) {
  if (context === 'juggle') return -14;
  if (context === 'combo') return -8;
  return -30;
}

function routeVarietyCreditFrames(move: MoveDefinition, context: ComboAdvantageContext) {
  if (context.repeatCount && context.repeatCount > 1) return 0;
  const explicit = Math.max(0, Math.round(context.routeVarietyCredit ?? 0));
  const commandCredit = move.command && !isPlainNeutralCommand(move.command) ? 1 : 0;
  const stanceCredit = move.command && /^(FC|WS|SS|SSL|SSR|WR|iWS|iWR|qcf|qcb|hcf|hcb|dp|rdp|cd|\w\.)/.test(move.command) ? 1 : 0;
  const tornadoCredit = context.context === 'juggle' && move.tornado ? 2 : 0;
  return Math.min(12, explicit + commandCredit + stanceCredit + tornadoCredit);
}

function isPlainNeutralCommand(command: string) {
  return command === '1' || command === '2' || command === '3' || command === '4';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
