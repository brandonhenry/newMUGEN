import { emptyInputFrame, type ActionName, type CharacterDefinition, type FighterRuntime, type InputFrame, type MatchSnapshot, type MoveDefinition, type MoveInput } from '../../types';

export const ONLINE_PROTOCOL_VERSION = 4;

export const inputActions: ActionName[] = [
  'up',
  'down',
  'left',
  'right',
  'dashForward',
  'sidestepUp',
  'sidestepDown',
  'sidewalkUp',
  'sidewalkDown',
  'jab',
  'kick',
  'heavy',
  'special',
  'charge',
  'block',
  'confirm',
  'back',
  'pause'
];

export type CompactFighterSnapshot = {
  characterId: string;
  baseCharacterId: string;
  hp: number;
  maxHp: number;
  ki: number;
  transformOvercharge: number;
  transformReadyTimer: number;
  transformStartupFrames: number;
  transformTargetId: string | null;
  transformSmokeFrames: number;
  position: FighterRuntime['position'];
  velocityY: number;
  facing: 1 | -1;
  facingYaw: number;
  state: FighterRuntime['state'];
  sidestepTimer: number;
  sidestepDirection: -1 | 0 | 1;
  sidestepOrbitSign: 1 | -1;
  dashForwardFrames: number;
  dashForwardCooldownFrames: number;
  walkDirection: -1 | 0 | 1;
  jumpInputHeld: boolean;
  currentMove: MoveDefinition | null;
  moveInstanceId: number;
  actionTimer: number;
  actionFramesRemaining: number;
  moveFrame: number;
  chargePhase: FighterRuntime['chargePhase'];
  chargeFrame: number;
  chargeCommitted: boolean;
  hitConnected: boolean;
  hitConfirmed: boolean;
  whiffRecoveryApplied: boolean;
  comboTimer: number;
  comboStep: number;
  comboSequence: MoveInput[];
  comboHits: number;
  comboDamage: number;
  wasCrouching: boolean;
  roundsWon: number;
  stunTimer: number;
  stunFramesRemaining: number;
  blockstunFramesRemaining: number;
  blockPunishWindowFrames: number;
  forcedCrouchFrames: number;
  getupInvulnerableFrames: number;
  getupForward: -1 | 0 | 1;
  getupLane: -1 | 0 | 1;
  getupStarted: boolean;
  getupAction: FighterRuntime['getupAction'];
  getupTotalFrames: number;
  juggleDamage: number;
  juggleSequenceDamage: number;
  juggleTornadoCount: number;
  juggleGravityScale: number;
  throwOpponentSlot: 1 | 2 | null;
  throwCaptorSlot: 1 | 2 | null;
  throwAnchorMove: MoveDefinition | null;
  throwHoldFrames: number;
  throwMaxHoldFrames: number;
  throwJabActive: boolean;
  throwJabCooldownFrames: number;
  throwJabHitConnected: boolean;
  throwEscapeProgress: number;
  throwEscapeGoal: number;
  throwShakeFrames: number;
  blockFlash: number;
  hitFlash: number;
  shadowClone: FighterRuntime['shadowClone'];
  shadowCloneChargeConsumed: boolean;
};

export type CompactMatchSnapshot = {
  protocol: typeof ONLINE_PROTOCOL_VERSION;
  sequence: number;
  p1CharacterId: string;
  p2CharacterId: string;
  p1BaseCharacterId: string;
  p2BaseCharacterId: string;
  stageId: string;
  mode: 'online';
  cpuDifficulty: MatchSnapshot['cpuDifficulty'];
  aiSeed: number;
  roundAiSeed: number;
  roundTime: number;
  maxHealth?: number;
  trainingInfiniteHealth: boolean;
  introEnabled: boolean;
  timer: number;
  round: number;
  countdown: number;
  winnerSlot: MatchSnapshot['winnerSlot'];
  phase: MatchSnapshot['phase'];
  message: string;
  lastHitId: number;
  combatEvents: MatchSnapshot['combatEvents'];
  impactEvents: MatchSnapshot['impactEvents'];
  clashState: MatchSnapshot['clashState'];
  visualTimeScale: number;
  cameraShake: number;
  fighters: [CompactFighterSnapshot, CompactFighterSnapshot];
};

export function encodeInputFrame(input: InputFrame): number {
  return inputActions.reduce((mask, action, index) => (input[action] ? mask | (1 << index) : mask), 0);
}

export function decodeInputFrame(mask: number): InputFrame {
  const frame = emptyInputFrame();
  inputActions.forEach((action, index) => {
    frame[action] = Boolean(mask & (1 << index));
  });
  return frame;
}

export function compactMatchSnapshot(match: MatchSnapshot, sequence: number): CompactMatchSnapshot {
  return {
    protocol: ONLINE_PROTOCOL_VERSION,
    sequence,
    p1CharacterId: match.fighters[0].character.id,
    p2CharacterId: match.fighters[1].character.id,
    p1BaseCharacterId: match.fighters[0].baseCharacter.id,
    p2BaseCharacterId: match.fighters[1].baseCharacter.id,
    stageId: match.stage.id,
    mode: 'online',
    cpuDifficulty: match.cpuDifficulty,
    aiSeed: match.aiSeed,
    roundAiSeed: match.roundAiSeed,
    roundTime: match.roundTime,
    maxHealth: match.maxHealth,
    trainingInfiniteHealth: match.trainingInfiniteHealth,
    introEnabled: match.introEnabled,
    timer: match.timer,
    round: match.round,
    countdown: match.countdown,
    winnerSlot: match.winnerSlot,
    phase: match.phase,
    message: match.message,
    lastHitId: match.lastHitId,
    combatEvents: match.combatEvents.slice(-8),
    impactEvents: match.impactEvents.slice(-12),
    clashState: match.clashState,
    visualTimeScale: match.visualTimeScale,
    cameraShake: match.cameraShake,
    fighters: [compactFighter(match.fighters[0]), compactFighter(match.fighters[1])]
  };
}

export function hydrateMatchSnapshot(base: MatchSnapshot, snapshot: CompactMatchSnapshot): MatchSnapshot {
  return {
    ...base,
    mode: 'online',
    cpuDifficulty: snapshot.cpuDifficulty,
    aiSeed: snapshot.aiSeed ?? base.aiSeed,
    roundAiSeed: snapshot.roundAiSeed ?? base.roundAiSeed,
    roundTime: snapshot.roundTime,
    maxHealth: snapshot.maxHealth ?? base.maxHealth,
    trainingInfiniteHealth: snapshot.trainingInfiniteHealth,
    introEnabled: snapshot.introEnabled,
    timer: snapshot.timer,
    round: snapshot.round,
    countdown: snapshot.countdown,
    winnerSlot: snapshot.winnerSlot,
    phase: snapshot.phase,
    message: snapshot.message,
    lastHitId: snapshot.lastHitId,
    combatEvents: snapshot.combatEvents,
    impactEvents: snapshot.impactEvents,
    clashState: snapshot.clashState ?? base.clashState,
    visualTimeScale: snapshot.visualTimeScale,
    cameraShake: snapshot.cameraShake,
    fighters: [hydrateFighter(base.fighters[0], snapshot.fighters[0], base.roster), hydrateFighter(base.fighters[1], snapshot.fighters[1], base.roster)]
  };
}

function compactFighter(fighter: FighterRuntime): CompactFighterSnapshot {
  return {
    characterId: fighter.character.id,
    baseCharacterId: fighter.baseCharacter.id,
    hp: fighter.hp,
    maxHp: fighter.maxHp,
    ki: fighter.ki,
    transformOvercharge: fighter.transformOvercharge,
    transformReadyTimer: fighter.transformReadyTimer,
    transformStartupFrames: fighter.transformStartupFrames,
    transformTargetId: fighter.transformTargetId,
    transformSmokeFrames: fighter.transformSmokeFrames,
    position: { ...fighter.position },
    velocityY: fighter.velocityY,
    facing: fighter.facing,
    facingYaw: fighter.facingYaw,
    state: fighter.state,
    sidestepTimer: fighter.sidestepTimer,
    sidestepDirection: fighter.sidestepDirection,
    sidestepOrbitSign: fighter.sidestepOrbitSign,
    dashForwardFrames: fighter.dashForwardFrames,
    dashForwardCooldownFrames: fighter.dashForwardCooldownFrames,
    walkDirection: fighter.walkDirection,
    jumpInputHeld: fighter.jumpInputHeld,
    currentMove: fighter.currentMove,
    moveInstanceId: fighter.moveInstanceId,
    actionTimer: fighter.actionTimer,
    actionFramesRemaining: fighter.actionFramesRemaining,
    moveFrame: fighter.moveFrame,
    chargePhase: fighter.chargePhase,
    chargeFrame: fighter.chargeFrame,
    chargeCommitted: fighter.chargeCommitted,
    hitConnected: fighter.hitConnected,
    hitConfirmed: fighter.hitConfirmed,
    whiffRecoveryApplied: fighter.whiffRecoveryApplied,
    comboTimer: fighter.comboTimer,
    comboStep: fighter.comboStep,
    comboSequence: [...fighter.comboSequence],
    comboHits: fighter.comboHits,
    comboDamage: fighter.comboDamage,
    wasCrouching: fighter.wasCrouching,
    roundsWon: fighter.roundsWon,
    stunTimer: fighter.stunTimer,
    stunFramesRemaining: fighter.stunFramesRemaining,
    blockstunFramesRemaining: fighter.blockstunFramesRemaining,
    blockPunishWindowFrames: fighter.blockPunishWindowFrames,
    forcedCrouchFrames: fighter.forcedCrouchFrames,
    getupInvulnerableFrames: fighter.getupInvulnerableFrames,
    getupForward: fighter.getupForward,
    getupLane: fighter.getupLane,
    getupStarted: fighter.getupStarted,
    getupAction: fighter.getupAction,
    getupTotalFrames: fighter.getupTotalFrames,
    juggleDamage: fighter.juggleDamage,
    juggleSequenceDamage: fighter.juggleSequenceDamage,
    juggleTornadoCount: fighter.juggleTornadoCount,
    juggleGravityScale: fighter.juggleGravityScale,
    throwOpponentSlot: fighter.throwOpponentSlot,
    throwCaptorSlot: fighter.throwCaptorSlot,
    throwAnchorMove: fighter.throwAnchorMove,
    throwHoldFrames: fighter.throwHoldFrames,
    throwMaxHoldFrames: fighter.throwMaxHoldFrames,
    throwJabActive: fighter.throwJabActive,
    throwJabCooldownFrames: fighter.throwJabCooldownFrames,
    throwJabHitConnected: fighter.throwJabHitConnected,
    throwEscapeProgress: fighter.throwEscapeProgress,
    throwEscapeGoal: fighter.throwEscapeGoal,
    throwShakeFrames: fighter.throwShakeFrames,
    blockFlash: fighter.blockFlash,
    hitFlash: fighter.hitFlash,
    shadowClone: fighter.shadowClone,
    shadowCloneChargeConsumed: fighter.shadowCloneChargeConsumed
  };
}

function hydrateFighter(base: FighterRuntime, snapshot: CompactFighterSnapshot, roster: CharacterDefinition[]): FighterRuntime {
  const character = roster.find((candidate) => candidate.id === snapshot.characterId) ?? base.character;
  const baseCharacter = roster.find((candidate) => candidate.id === snapshot.baseCharacterId) ?? base.baseCharacter ?? character;
  return {
    ...base,
    character,
    baseCharacter,
    hp: snapshot.hp,
    maxHp: snapshot.maxHp ?? base.maxHp,
    ki: snapshot.ki,
    transformOvercharge: snapshot.transformOvercharge ?? base.transformOvercharge,
    transformReadyTimer: snapshot.transformReadyTimer ?? base.transformReadyTimer,
    transformStartupFrames: snapshot.transformStartupFrames ?? base.transformStartupFrames,
    transformTargetId: snapshot.transformTargetId ?? null,
    transformSmokeFrames: snapshot.transformSmokeFrames ?? base.transformSmokeFrames,
    position: { ...snapshot.position },
    velocityY: snapshot.velocityY,
    facing: snapshot.facing,
    facingYaw: snapshot.facingYaw,
    state: snapshot.state,
    sidestepTimer: snapshot.sidestepTimer,
    sidestepDirection: snapshot.sidestepDirection,
    sidestepOrbitSign: snapshot.sidestepOrbitSign ?? base.sidestepOrbitSign,
    dashForwardFrames: snapshot.dashForwardFrames ?? base.dashForwardFrames,
    dashForwardCooldownFrames: snapshot.dashForwardCooldownFrames ?? base.dashForwardCooldownFrames,
    walkDirection: snapshot.walkDirection ?? base.walkDirection,
    jumpInputHeld: snapshot.jumpInputHeld,
    currentMove: snapshot.currentMove,
    moveInstanceId: snapshot.moveInstanceId ?? base.moveInstanceId,
    actionTimer: snapshot.actionTimer,
    actionFramesRemaining: snapshot.actionFramesRemaining,
    moveFrame: snapshot.moveFrame,
    chargePhase: snapshot.chargePhase ?? base.chargePhase,
    chargeFrame: snapshot.chargeFrame ?? base.chargeFrame,
    chargeCommitted: snapshot.chargeCommitted ?? base.chargeCommitted,
    hitConnected: snapshot.hitConnected,
    hitConfirmed: snapshot.hitConfirmed,
    whiffRecoveryApplied: snapshot.whiffRecoveryApplied,
    comboTimer: snapshot.comboTimer,
    comboStep: snapshot.comboStep,
    comboSequence: [...snapshot.comboSequence],
    comboHits: snapshot.comboHits,
    comboDamage: snapshot.comboDamage,
    wasCrouching: snapshot.wasCrouching,
    roundsWon: snapshot.roundsWon,
    stunTimer: snapshot.stunTimer,
    stunFramesRemaining: snapshot.stunFramesRemaining,
    blockstunFramesRemaining: snapshot.blockstunFramesRemaining,
    blockPunishWindowFrames: snapshot.blockPunishWindowFrames,
    forcedCrouchFrames: snapshot.forcedCrouchFrames ?? base.forcedCrouchFrames,
    getupInvulnerableFrames: snapshot.getupInvulnerableFrames,
    getupForward: snapshot.getupForward,
    getupLane: snapshot.getupLane,
    getupStarted: snapshot.getupStarted,
    getupAction: snapshot.getupAction ?? base.getupAction,
    getupTotalFrames: snapshot.getupTotalFrames ?? base.getupTotalFrames,
    juggleDamage: snapshot.juggleDamage,
    juggleSequenceDamage: snapshot.juggleSequenceDamage ?? base.juggleSequenceDamage,
    juggleTornadoCount: snapshot.juggleTornadoCount ?? base.juggleTornadoCount,
    juggleGravityScale: snapshot.juggleGravityScale ?? base.juggleGravityScale,
    throwOpponentSlot: snapshot.throwOpponentSlot ?? null,
    throwCaptorSlot: snapshot.throwCaptorSlot ?? null,
    throwAnchorMove: snapshot.throwAnchorMove ?? null,
    throwHoldFrames: snapshot.throwHoldFrames ?? base.throwHoldFrames,
    throwMaxHoldFrames: snapshot.throwMaxHoldFrames ?? base.throwMaxHoldFrames,
    throwJabActive: snapshot.throwJabActive ?? base.throwJabActive,
    throwJabCooldownFrames: snapshot.throwJabCooldownFrames ?? base.throwJabCooldownFrames,
    throwJabHitConnected: snapshot.throwJabHitConnected ?? base.throwJabHitConnected,
    throwEscapeProgress: snapshot.throwEscapeProgress ?? base.throwEscapeProgress,
    throwEscapeGoal: snapshot.throwEscapeGoal ?? base.throwEscapeGoal,
    throwShakeFrames: snapshot.throwShakeFrames ?? base.throwShakeFrames,
    blockFlash: snapshot.blockFlash,
    hitFlash: snapshot.hitFlash,
    shadowClone: snapshot.shadowClone ?? null,
    shadowCloneChargeConsumed: snapshot.shadowCloneChargeConsumed ?? base.shadowCloneChargeConsumed
  };
}
