import type { InputFrame, MatchSnapshot } from '../../types';

export type RollbackPlayerIndex = 0 | 1;

export type RollbackInputBatch = {
  startFrame: number;
  masks: number[];
  ackFrame: number;
  checksum?: number;
  sentAt?: number;
};

export type RollbackStats = {
  currentFrame: number;
  predictionFrames: number;
  rollbackCount: number;
  maxRollbackDepth: number;
  droppedLateInputs: number;
  pingEstimateMs: number | null;
  needsResync: boolean;
};

export type RollbackControllerOptions = {
  initialMatch: MatchSnapshot;
  localPlayerIndex: RollbackPlayerIndex;
  stepMatch: (match: MatchSnapshot, p1Input: InputFrame, p2Input: InputFrame, dt: number) => MatchSnapshot;
  cloneMatch: (match: MatchSnapshot) => MatchSnapshot;
  encodeInput: (input: InputFrame) => number;
  decodeInput: (mask: number) => InputFrame;
  fixedStep?: number;
  maxRollbackFrames?: number;
  historyLimit?: number;
};

type RemoteInputRecord = {
  mask: number;
  predicted: boolean;
};

const DEFAULT_FIXED_STEP = 1 / 60;
const DEFAULT_MAX_ROLLBACK_FRAMES = 12;
const DEFAULT_HISTORY_LIMIT = 180;

export type RollbackController = ReturnType<typeof createRollbackController>;

export function createRollbackController(options: RollbackControllerOptions) {
  const fixedStep = options.fixedStep ?? DEFAULT_FIXED_STEP;
  const maxRollbackFrames = options.maxRollbackFrames ?? DEFAULT_MAX_ROLLBACK_FRAMES;
  const historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
  const localInputs = new Map<number, number>();
  const remoteInputs = new Map<number, RemoteInputRecord>();
  const checkpoints = new Map<number, MatchSnapshot>();
  const stats: RollbackStats = {
    currentFrame: 0,
    predictionFrames: 0,
    rollbackCount: 0,
    maxRollbackDepth: 0,
    droppedLateInputs: 0,
    pingEstimateMs: null,
    needsResync: false
  };
  let match = options.cloneMatch(options.initialMatch);

  const advance = (localInput: InputFrame) => {
    const frame = stats.currentFrame;
    localInputs.set(frame, options.encodeInput(localInput));
    checkpoints.set(frame, options.cloneMatch(match));
    const remote = getRemoteRecordForSimulation(frame);
    if (remote.predicted) stats.predictionFrames += 1;
    match = stepFrame(frame, match, remote.mask);
    stats.currentFrame += 1;
    pruneHistory();
    return getMatch();
  };

  const receiveRemoteInputBatch = (batch: RollbackInputBatch, receivedAt = Date.now()) => {
    if (typeof batch.sentAt === 'number' && Number.isFinite(batch.sentAt)) {
      const sample = Math.max(0, receivedAt - batch.sentAt);
      stats.pingEstimateMs = stats.pingEstimateMs === null ? sample : Math.round(stats.pingEstimateMs * 0.75 + sample * 0.25);
    }

    let earliestMismatch: number | null = null;
    batch.masks.forEach((mask, offset) => {
      const frame = batch.startFrame + offset;
      const normalizedMask = normalizeMask(mask);
      const previous = remoteInputs.get(frame);
      if (previous?.predicted && previous.mask !== normalizedMask) {
        earliestMismatch = earliestMismatch === null ? frame : Math.min(earliestMismatch, frame);
      }
      remoteInputs.set(frame, { mask: normalizedMask, predicted: false });
    });

    if (earliestMismatch !== null) rollbackFrom(earliestMismatch);
    pruneHistory();
    return getMatch();
  };

  const makeInputBatch = (redundantFrames = 8, sentAt = Date.now()): RollbackInputBatch => {
    const endFrame = stats.currentFrame - 1;
    const startFrame = Math.max(0, endFrame - Math.max(0, redundantFrames - 1));
    const masks: number[] = [];
    for (let frame = startFrame; frame <= endFrame; frame += 1) {
      masks.push(localInputs.get(frame) ?? 0);
    }
    return {
      startFrame,
      masks,
      ackFrame: getHighestActualRemoteFrame(),
      checksum: checksumMatch(match),
      sentAt
    };
  };

  const reset = (nextMatch: MatchSnapshot) => {
    localInputs.clear();
    remoteInputs.clear();
    checkpoints.clear();
    match = options.cloneMatch(nextMatch);
    stats.currentFrame = 0;
    stats.predictionFrames = 0;
    stats.rollbackCount = 0;
    stats.maxRollbackDepth = 0;
    stats.droppedLateInputs = 0;
    stats.pingEstimateMs = null;
    stats.needsResync = false;
  };

  const getStats = () => ({ ...stats });
  const getMatch = () => options.cloneMatch(match);
  const clearResyncRequest = () => {
    stats.needsResync = false;
  };

  function rollbackFrom(frame: number) {
    const targetFrame = stats.currentFrame;
    const depth = targetFrame - frame;
    if (depth > maxRollbackFrames || !checkpoints.has(frame)) {
      stats.droppedLateInputs += 1;
      stats.needsResync = true;
      return;
    }

    const checkpoint = checkpoints.get(frame);
    if (!checkpoint) return;
    stats.rollbackCount += 1;
    stats.maxRollbackDepth = Math.max(stats.maxRollbackDepth, depth);
    match = options.cloneMatch(checkpoint);
    stats.currentFrame = frame;
    while (stats.currentFrame < targetFrame) {
      const replayFrame = stats.currentFrame;
      checkpoints.set(replayFrame, options.cloneMatch(match));
      const remote = getRemoteRecordForSimulation(replayFrame);
      match = stepFrame(replayFrame, match, remote.mask);
      stats.currentFrame += 1;
    }
  }

  function stepFrame(frame: number, source: MatchSnapshot, remoteMask: number) {
    const localMask = localInputs.get(frame) ?? 0;
    const localInput = options.decodeInput(localMask);
    const remoteInput = options.decodeInput(remoteMask);
    return options.localPlayerIndex === 0
      ? options.stepMatch(source, localInput, remoteInput, fixedStep)
      : options.stepMatch(source, remoteInput, localInput, fixedStep);
  }

  function getRemoteRecordForSimulation(frame: number): RemoteInputRecord {
    const existing = remoteInputs.get(frame);
    if (existing && !existing.predicted) return existing;
    const predicted = existing ?? { mask: getLastActualRemoteMaskBefore(frame), predicted: true };
    remoteInputs.set(frame, predicted);
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

  function pruneHistory() {
    const minFrame = Math.max(0, stats.currentFrame - historyLimit);
    pruneMap(localInputs, minFrame);
    pruneMap(remoteInputs, minFrame);
    pruneMap(checkpoints, minFrame);
  }

  return {
    advance,
    receiveRemoteInputBatch,
    makeInputBatch,
    reset,
    getMatch,
    getStats,
    clearResyncRequest
  };
}

export function checksumMatch(match: MatchSnapshot) {
  const value = JSON.stringify({
    phase: match.phase,
    round: match.round,
    timer: roundNumber(match.timer),
    winnerSlot: match.winnerSlot,
    lastHitId: match.lastHitId,
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
      move: fighter.currentMove?.id ?? fighter.currentMove?.input ?? null,
      moveFrame: fighter.moveFrame,
      actionFramesRemaining: fighter.actionFramesRemaining,
      stunFramesRemaining: fighter.stunFramesRemaining,
      blockstunFramesRemaining: fighter.blockstunFramesRemaining,
      roundsWon: fighter.roundsWon
    }))
  });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
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
