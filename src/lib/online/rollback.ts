import { emptyInputFrame, type InputFrame, type MatchSnapshot } from '../../types';

export type RollbackPlayerIndex = 0 | 1;
export type RollbackExecutionMode = 'normal' | 'rollback';
export type RollbackSyncResultReason = 'prediction_limit';

export type RollbackInputBatch = {
  startFrame: number;
  masks: number[];
  ackFrame: number;
  currentFrame: number;
  remoteFrame: number;
  checksum?: number;
  sentAt?: number;
  disconnectRequested?: boolean;
};

export type RollbackSavedState = {
  frame: number;
  checksum: number;
  match: MatchSnapshot;
};

export type RollbackNetworkStats = {
  currentFrame: number;
  localFrame: number;
  remoteFrame: number;
  remoteQueueFrames: number;
  predictionFrames: number;
  consecutivePredictionFrames: number;
  rollbackCount: number;
  maxRollbackDepth: number;
  lastRollbackFrames: number;
  droppedLateInputs: number;
  pingEstimateMs: number | null;
  localFrameDelay: number;
  maxPredictionFrames: number;
  desyncCount: number;
  needsResync: boolean;
  disconnected: boolean;
};

export type RollbackAdvanceResult = {
  advanced: boolean;
  frame: number;
  match: MatchSnapshot;
  executionMode: RollbackExecutionMode;
  replayedFrames: number;
  reason?: RollbackSyncResultReason;
};

export type RollbackSynchronizedInputs = {
  ok: boolean;
  frame: number;
  inputs: [InputFrame, InputFrame];
  masks: [number, number];
  executionMode: RollbackExecutionMode;
  reason?: RollbackSyncResultReason;
};

export type RollbackSessionOptions = {
  initialMatch: MatchSnapshot;
  localPlayerIndex: RollbackPlayerIndex;
  stepMatch: (match: MatchSnapshot, p1Input: InputFrame, p2Input: InputFrame, dt: number) => MatchSnapshot;
  cloneMatch: (match: MatchSnapshot) => MatchSnapshot;
  encodeInput: (input: InputFrame) => number;
  decodeInput: (mask: number) => InputFrame;
  fixedStep?: number;
  localFrameDelay?: number;
  maxPredictionFrames?: number;
  maxRollbackFrames?: number;
  historyLimit?: number;
  disconnectTimeoutMs?: number;
};

type RemoteInputRecord = {
  mask: number;
  predicted: boolean;
};

type InternalStepResult = {
  advanced: boolean;
  reason?: RollbackSyncResultReason;
};

const DEFAULT_FIXED_STEP = 1 / 60;
const DEFAULT_FRAME_DELAY = 0;
const DEFAULT_MAX_PREDICTION_FRAMES = 12;
const DEFAULT_MAX_ROLLBACK_FRAMES = 12;
const DEFAULT_HISTORY_LIMIT = 180;
const DEFAULT_DISCONNECT_TIMEOUT_MS = 10_000;

export type RollbackSession = ReturnType<typeof createRollbackSession>;
export type RollbackController = RollbackSession;

export function createRollbackSession(options: RollbackSessionOptions) {
  const fixedStep = options.fixedStep ?? DEFAULT_FIXED_STEP;
  const localFrameDelay = Math.max(0, Math.round(options.localFrameDelay ?? DEFAULT_FRAME_DELAY));
  const maxPredictionFrames = Math.max(0, Math.round(options.maxPredictionFrames ?? DEFAULT_MAX_PREDICTION_FRAMES));
  const maxRollbackFrames = Math.max(0, Math.round(options.maxRollbackFrames ?? DEFAULT_MAX_ROLLBACK_FRAMES));
  const historyLimit = Math.max(maxRollbackFrames + 1, Math.round(options.historyLimit ?? DEFAULT_HISTORY_LIMIT));
  const disconnectTimeoutMs = Math.max(1000, Math.round(options.disconnectTimeoutMs ?? DEFAULT_DISCONNECT_TIMEOUT_MS));
  const remotePlayerIndex: RollbackPlayerIndex = options.localPlayerIndex === 0 ? 1 : 0;
  const inputHistory: [Map<number, number>, Map<number, number>] = [new Map(), new Map()];
  const remoteInputs = new Map<number, RemoteInputRecord>();
  const savedStates = new Map<number, RollbackSavedState>();
  const stats: RollbackNetworkStats = {
    currentFrame: 0,
    localFrame: -1,
    remoteFrame: -1,
    remoteQueueFrames: 0,
    predictionFrames: 0,
    consecutivePredictionFrames: 0,
    rollbackCount: 0,
    maxRollbackDepth: 0,
    lastRollbackFrames: 0,
    droppedLateInputs: 0,
    pingEstimateMs: null,
    localFrameDelay,
    maxPredictionFrames,
    desyncCount: 0,
    needsResync: false,
    disconnected: false
  };
  let match = options.cloneMatch(options.initialMatch);
  let synchronizedFrame: RollbackSynchronizedInputs | null = null;
  let lastRemotePacketAt = Date.now();

  const addLocalInput = (player: RollbackPlayerIndex, input: InputFrame) => {
    if (player !== options.localPlayerIndex) return false;
    const frame = stats.currentFrame + localFrameDelay;
    inputHistory[player].set(frame, options.encodeInput(input));
    stats.localFrame = Math.max(stats.localFrame, frame);
    return true;
  };

  const synchronizeInputs = (executionMode: RollbackExecutionMode = 'normal'): RollbackSynchronizedInputs => {
    if (synchronizedFrame && synchronizedFrame.frame === stats.currentFrame && synchronizedFrame.executionMode === executionMode) return cloneSynchronizedInputs(synchronizedFrame);
    const frame = stats.currentFrame;
    const localMask = inputHistory[options.localPlayerIndex].get(frame) ?? 0;
    const remote = getRemoteRecordForSimulation(frame);
    const predictedDepth = remote.predicted ? Math.max(0, frame - stats.remoteFrame) : 0;
    if (remote.predicted && predictedDepth > maxPredictionFrames) {
      const p1Mask = options.localPlayerIndex === 0 ? localMask : remote.mask;
      const p2Mask = options.localPlayerIndex === 0 ? remote.mask : localMask;
      stats.needsResync = true;
      synchronizedFrame = {
        ok: false,
        frame,
        inputs: masksToInputs([p1Mask, p2Mask]),
        masks: [p1Mask, p2Mask],
        executionMode,
        reason: 'prediction_limit'
      };
      return cloneSynchronizedInputs(synchronizedFrame);
    }

    if (remote.predicted) {
      stats.predictionFrames += 1;
      stats.consecutivePredictionFrames += 1;
    } else {
      stats.consecutivePredictionFrames = 0;
    }
    const p1Mask = options.localPlayerIndex === 0 ? localMask : remote.mask;
    const p2Mask = options.localPlayerIndex === 0 ? remote.mask : localMask;
    synchronizedFrame = {
      ok: true,
      frame,
      inputs: masksToInputs([p1Mask, p2Mask]),
      masks: [p1Mask, p2Mask],
      executionMode
    };
    return cloneSynchronizedInputs(synchronizedFrame);
  };

  const advanceFrame = (executionMode: RollbackExecutionMode = 'normal'): RollbackAdvanceResult => {
    const frame = stats.currentFrame;
    saveGameState(frame);
    const result = stepCurrentFrame(executionMode);
    pruneHistory();
    return {
      advanced: result.advanced,
      frame,
      match: getMatch(),
      executionMode,
      replayedFrames: executionMode === 'rollback' && result.advanced ? 1 : 0,
      reason: result.reason
    };
  };

  const receiveRemoteInputBatch = (batch: RollbackInputBatch, receivedAt = Date.now()): RollbackAdvanceResult => {
    lastRemotePacketAt = receivedAt;
    stats.disconnected = Boolean(batch.disconnectRequested);
    stats.remoteQueueFrames = Math.max(0, batch.currentFrame - batch.remoteFrame);
    if (typeof batch.sentAt === 'number' && Number.isFinite(batch.sentAt)) {
      const sample = Math.max(0, receivedAt - batch.sentAt);
      stats.pingEstimateMs = stats.pingEstimateMs === null ? sample : Math.round(stats.pingEstimateMs * 0.75 + sample * 0.25);
    }

    let earliestMismatch: number | null = null;
    batch.masks.forEach((mask, offset) => {
      const frame = batch.startFrame + offset;
      const normalizedMask = normalizeMask(mask);
      const previous = remoteInputs.get(frame);
      if (previous && !previous.predicted && previous.mask !== normalizedMask) {
        stats.desyncCount += 1;
        if (stats.desyncCount >= 3) stats.needsResync = true;
        return;
      }
      if (previous?.predicted && previous.mask !== normalizedMask) {
        earliestMismatch = earliestMismatch === null ? frame : Math.min(earliestMismatch, frame);
      }
      remoteInputs.set(frame, { mask: normalizedMask, predicted: false });
      inputHistory[remotePlayerIndex].set(frame, normalizedMask);
      stats.remoteFrame = Math.max(stats.remoteFrame, frame);
    });

    stats.remoteQueueFrames = Math.max(0, batch.currentFrame - stats.remoteFrame);
    if (earliestMismatch !== null) {
      const result = rollbackFrom(earliestMismatch);
      checkRemoteChecksum(batch);
      pruneHistory();
      return result;
    }
    checkRemoteChecksum(batch);
    pruneHistory();
    return { advanced: false, frame: stats.currentFrame, match: getMatch(), executionMode: 'normal', replayedFrames: 0 };
  };

  const makeInputBatch = (redundantFrames = 8, sentAt = Date.now()): RollbackInputBatch => {
    const endFrame = stats.localFrame;
    const startFrame = Math.max(0, endFrame - Math.max(0, redundantFrames - 1));
    const masks: number[] = [];
    for (let frame = startFrame; frame <= endFrame; frame += 1) {
      masks.push(inputHistory[options.localPlayerIndex].get(frame) ?? 0);
    }
    return {
      startFrame,
      masks,
      ackFrame: getHighestActualRemoteFrame(),
      currentFrame: stats.currentFrame,
      remoteFrame: stats.remoteFrame,
      checksum: checksumMatch(match),
      sentAt,
      disconnectRequested: stats.disconnected
    };
  };

  const saveGameState = (frame = stats.currentFrame): RollbackSavedState => {
    const saved = {
      frame,
      checksum: checksumMatch(match),
      match: options.cloneMatch(match)
    };
    savedStates.set(frame, saved);
    return {
      ...saved,
      match: options.cloneMatch(saved.match)
    };
  };

  const loadGameState = (frame: number) => {
    const saved = savedStates.get(frame);
    if (!saved) return false;
    match = options.cloneMatch(saved.match);
    stats.currentFrame = frame;
    synchronizedFrame = null;
    return true;
  };

  const idle = (timeoutMs = 0) => {
    if (timeoutMs > 0 && Date.now() - lastRemotePacketAt > disconnectTimeoutMs) {
      stats.disconnected = true;
    }
    return getNetworkStats();
  };

  const reset = (nextMatch: MatchSnapshot) => {
    inputHistory.forEach((history) => history.clear());
    remoteInputs.clear();
    savedStates.clear();
    match = options.cloneMatch(nextMatch);
    synchronizedFrame = null;
    stats.currentFrame = 0;
    stats.localFrame = -1;
    stats.remoteFrame = -1;
    stats.remoteQueueFrames = 0;
    stats.predictionFrames = 0;
    stats.consecutivePredictionFrames = 0;
    stats.rollbackCount = 0;
    stats.maxRollbackDepth = 0;
    stats.lastRollbackFrames = 0;
    stats.droppedLateInputs = 0;
    stats.pingEstimateMs = null;
    stats.desyncCount = 0;
    stats.needsResync = false;
    stats.disconnected = false;
    lastRemotePacketAt = Date.now();
  };

  const getNetworkStats = () => ({ ...stats });
  const getStats = getNetworkStats;
  const getMatch = () => options.cloneMatch(match);
  const clearResyncRequest = () => {
    stats.needsResync = false;
  };

  function rollbackFrom(frame: number): RollbackAdvanceResult {
    const targetFrame = stats.currentFrame;
    const depth = targetFrame - frame;
    if (depth > maxRollbackFrames || !savedStates.has(frame)) {
      stats.droppedLateInputs += 1;
      stats.needsResync = true;
      return { advanced: false, frame: targetFrame, match: getMatch(), executionMode: 'rollback', replayedFrames: 0, reason: 'prediction_limit' };
    }

    stats.rollbackCount += 1;
    stats.maxRollbackDepth = Math.max(stats.maxRollbackDepth, depth);
    stats.lastRollbackFrames = depth;
    loadGameState(frame);
    let replayedFrames = 0;
    while (stats.currentFrame < targetFrame) {
      saveGameState(stats.currentFrame);
      const result = stepCurrentFrame('rollback');
      if (!result.advanced) break;
      replayedFrames += 1;
    }
    return { advanced: replayedFrames > 0, frame, match: getMatch(), executionMode: 'rollback', replayedFrames };
  }

  function stepCurrentFrame(executionMode: RollbackExecutionMode): InternalStepResult {
    const synchronized = synchronizeInputs(executionMode);
    if (!synchronized.ok) return { advanced: false, reason: synchronized.reason };
    match = options.stepMatch(match, synchronized.inputs[0], synchronized.inputs[1], fixedStep);
    stats.currentFrame += 1;
    synchronizedFrame = null;
    return { advanced: true };
  }

  function getRemoteRecordForSimulation(frame: number): RemoteInputRecord {
    const existing = remoteInputs.get(frame);
    if (existing && !existing.predicted) return existing;
    const predicted = existing ?? { mask: getLastActualRemoteMaskBefore(frame), predicted: true };
    remoteInputs.set(frame, predicted);
    inputHistory[remotePlayerIndex].set(frame, predicted.mask);
    return predicted;
  }

  function getLastActualRemoteMaskBefore(frame: number) {
    let bestFrame = -1;
    let bestMask = 0;
    remoteInputs.forEach((record, candidateFrame) => {
      if (!record.predicted && candidateFrame < frame && candidateFrame > bestFrame) {
        bestFrame = candidateFrame;
        bestMask = record.mask;
      }
    });
    return bestMask;
  }

  function getHighestActualRemoteFrame() {
    let highest = -1;
    remoteInputs.forEach((record, frame) => {
      if (!record.predicted) highest = Math.max(highest, frame);
    });
    return highest;
  }

  function checkRemoteChecksum(batch: RollbackInputBatch) {
    if (typeof batch.checksum !== 'number') return;
    if (Math.abs(batch.currentFrame - stats.currentFrame) > 1) return;
    if (batch.checksum === checksumMatch(match)) {
      stats.desyncCount = 0;
      return;
    }
    stats.desyncCount += 1;
    if (stats.desyncCount >= 3) stats.needsResync = true;
  }

  function masksToInputs(masks: [number, number]): [InputFrame, InputFrame] {
    return [options.decodeInput(masks[0]), options.decodeInput(masks[1])];
  }

  function pruneHistory() {
    const minFrame = Math.max(0, stats.currentFrame - historyLimit);
    inputHistory.forEach((history) => pruneMap(history, minFrame));
    pruneMap(remoteInputs, minFrame);
    pruneMap(savedStates, minFrame);
  }

  return {
    addLocalInput,
    synchronizeInputs,
    advanceFrame,
    saveGameState,
    loadGameState,
    idle,
    getNetworkStats,
    receiveRemoteInputBatch,
    makeInputBatch,
    reset,
    getMatch,
    getStats,
    clearResyncRequest,
    advance(localInput: InputFrame) {
      addLocalInput(options.localPlayerIndex, localInput);
      return advanceFrame().match;
    }
  };
}

export function createRollbackController(options: RollbackSessionOptions) {
  return createRollbackSession(options);
}

export type RollbackSyncTestOptions = {
  initialMatch: MatchSnapshot;
  frames: number;
  stepMatch: RollbackSessionOptions['stepMatch'];
  cloneMatch: RollbackSessionOptions['cloneMatch'];
  p1Inputs?: (frame: number) => InputFrame;
  p2Inputs?: (frame: number) => InputFrame;
  fixedStep?: number;
};

export type RollbackSyncTestResult = {
  ok: boolean;
  framesChecked: number;
  failures: Array<{ frame: number; expected: number; actual: number }>;
};

export function runRollbackSyncTest(options: RollbackSyncTestOptions): RollbackSyncTestResult {
  const fixedStep = options.fixedStep ?? DEFAULT_FIXED_STEP;
  let match = options.cloneMatch(options.initialMatch);
  const failures: RollbackSyncTestResult['failures'] = [];
  for (let frame = 0; frame < options.frames; frame += 1) {
    const p1 = options.p1Inputs?.(frame) ?? emptyDecodedInput();
    const p2 = options.p2Inputs?.(frame) ?? emptyDecodedInput();
    const saved = options.cloneMatch(match);
    const uninterrupted = options.stepMatch(match, p1, p2, fixedStep);
    const replayed = options.stepMatch(options.cloneMatch(saved), p1, p2, fixedStep);
    const expected = checksumMatch(uninterrupted);
    const actual = checksumMatch(replayed);
    if (expected !== actual) failures.push({ frame, expected, actual });
    match = uninterrupted;
  }
  return { ok: failures.length === 0, framesChecked: options.frames, failures };
}

export function checksumMatch(match: MatchSnapshot) {
  const value = JSON.stringify({
    phase: match.phase,
    round: match.round,
    timer: roundNumber(match.timer),
    winnerSlot: match.winnerSlot,
    lastHitId: match.lastHitId,
    projectiles: (match.projectiles ?? []).map((projectile) => ({
      id: projectile.id,
      ownerSlot: projectile.ownerSlot,
      projectileId: projectile.projectileId,
      phase: projectile.phase,
      ageFrames: roundNumber(projectile.ageFrames),
      x: roundNumber(projectile.position.x),
      y: roundNumber(projectile.position.y),
      z: roundNumber(projectile.position.z),
      vx: roundNumber(projectile.velocity.x),
      vy: roundNumber(projectile.velocity.y),
      vz: roundNumber(projectile.velocity.z),
      gravity: projectile.gravity === undefined ? undefined : roundNumber(projectile.gravity),
      targetMode: projectile.targetMode,
      targetX: projectile.targetPoint ? roundNumber(projectile.targetPoint.x) : undefined,
      targetY: projectile.targetPoint ? roundNumber(projectile.targetPoint.y) : undefined,
      targetZ: projectile.targetPoint ? roundNumber(projectile.targetPoint.z) : undefined,
      hitConnected: projectile.hitConnected,
      expired: projectile.expired
    })),
    combatEvents: match.combatEvents.map((event) => ({ id: event.id, slot: event.slot, hits: event.hits, damage: roundNumber(event.damage) })),
    impactEvents: match.impactEvents.map((event) => ({ id: event.id, kind: event.kind, attackerSlot: event.attackerSlot, defenderSlot: event.defenderSlot })),
    clashState: {
      id: match.clashState.id,
      status: match.clashState.status,
      elapsedFrames: match.clashState.elapsedFrames,
      p1: match.clashState.p1,
      p2: match.clashState.p2
    },
    fighters: match.fighters.map((fighter) => ({
      id: fighter.character.id,
      hp: roundNumber(fighter.hp),
      ki: roundNumber(fighter.ki),
      x: roundNumber(fighter.position.x),
      y: roundNumber(fighter.position.y),
      z: roundNumber(fighter.position.z),
      velocityY: roundNumber(fighter.velocityY),
      state: fighter.state,
      facing: fighter.facing,
      facingYaw: roundNumber(fighter.facingYaw),
      controlSideSign: fighter.controlSideSign,
      move: fighter.currentMove?.id ?? fighter.currentMove?.input ?? null,
      moveInstanceId: fighter.moveInstanceId,
      moveFrame: fighter.moveFrame,
      actionFramesRemaining: fighter.actionFramesRemaining,
      stunFramesRemaining: fighter.stunFramesRemaining,
      blockstunFramesRemaining: fighter.blockstunFramesRemaining,
      comboHits: fighter.comboHits,
      comboDamage: roundNumber(fighter.comboDamage),
      roundsWon: fighter.roundsWon,
      shadowClone: fighter.shadowClone
        ? {
            phase: fighter.shadowClone.phase,
            x: roundNumber(fighter.shadowClone.position.x),
            y: roundNumber(fighter.shadowClone.position.y),
            z: roundNumber(fighter.shadowClone.position.z),
            state: fighter.shadowClone.state,
            moveFrame: fighter.shadowClone.moveFrame
          }
        : null
    }))
  });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cloneSynchronizedInputs(source: RollbackSynchronizedInputs): RollbackSynchronizedInputs {
  return {
    ...source,
    inputs: [{ ...source.inputs[0] }, { ...source.inputs[1] }],
    masks: [...source.masks] as [number, number]
  };
}

function pruneMap<T>(map: Map<number, T>, minFrame: number) {
  for (const frame of map.keys()) {
    if (frame < minFrame) map.delete(frame);
  }
}

function normalizeMask(mask: number) {
  return Number.isFinite(mask) ? Math.max(0, Math.round(mask)) : 0;
}

function roundNumber(value: number) {
  return Math.round(value * 1000) / 1000;
}

function emptyDecodedInput(): InputFrame {
  return emptyInputFrame();
}
