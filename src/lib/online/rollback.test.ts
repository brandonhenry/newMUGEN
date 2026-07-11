import { describe, expect, it, vi } from 'vitest';
import { starterCharacters } from '../../data/characters';
import { stages } from '../../data/stages';
import { cloneMatchSnapshot, createMatch, stepMatch } from '../../engine/fightEngine';
import { emptyInputFrame, type InputFrame, type MatchSnapshot } from '../../types';
import { decodeInputFrame, encodeInputFrame } from './codec';
import { checksumMatch, createRollbackSession, runRollbackSyncTest, type RollbackPlayerIndex, type RollbackSession } from './rollback';

function makeMatch() {
  return createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online', 3, {
    aiSeed: 12345,
    playIntro: false,
    roster: starterCharacters
  });
}

function makeSession(match: MatchSnapshot, localPlayerIndex: RollbackPlayerIndex, maxRollbackFrames = 12, maxPredictionFrames = 12, localFrameDelay = 0) {
  return createRollbackSession({
    initialMatch: match,
    localPlayerIndex,
    stepMatch,
    cloneMatch: cloneMatchSnapshot,
    encodeInput: encodeInputFrame,
    decodeInput: decodeInputFrame,
    maxRollbackFrames,
    maxPredictionFrames,
    localFrameDelay
  });
}

function input(actions: Array<keyof InputFrame>) {
  const frame = emptyInputFrame();
  actions.forEach((action) => {
    frame[action] = true;
  });
  return frame;
}

function advance(controller: RollbackSession, frames: number, frameInput = emptyInputFrame()) {
  for (let frame = 0; frame < frames; frame += 1) controller.advance(frameInput);
}

function batch(startFrame: number, masks: number[]) {
  return {
    startFrame,
    masks,
    ackFrame: -1,
    currentFrame: startFrame + masks.length,
    remoteFrame: startFrame + masks.length - 1
  };
}

describe('rollback session', () => {
  it('exports only fully confirmed two-player inputs and retained saved states', () => {
    const controller = makeSession(makeMatch(), 0);
    const localMasks: number[] = [];
    const remoteMasks: number[] = [];
    for (let frame = 0; frame < 5; frame += 1) {
      const local = frame === 1 ? input(['jab']) : emptyInputFrame();
      const remote = frame === 3 ? input(['kick']) : emptyInputFrame();
      localMasks.push(encodeInputFrame(local));
      remoteMasks.push(encodeInputFrame(remote));
      controller.addLocalInput(0, local);
      controller.receiveRemoteInputBatch(batch(frame, [remoteMasks[frame]]));
      controller.advanceFrame();
    }
    controller.saveGameState(5);

    expect(controller.getConfirmedFrame()).toBe(4);
    expect(controller.makeConfirmedInputBatch(0, 6)).toEqual({
      startFrame: 0,
      p1Masks: localMasks,
      p2Masks: remoteMasks,
      latestConfirmedFrame: 4
    });
    expect(controller.getSavedState(5)?.checksum).toBe(checksumMatch(controller.getMatch()));
  });

  it('does not roll back when late input matches prediction', () => {
    const controller = makeSession(makeMatch(), 0);

    advance(controller, 3);
    controller.receiveRemoteInputBatch(batch(0, [0, 0, 0]));

    expect(controller.getStats().rollbackCount).toBe(0);
  });

  it('rolls back and replays when a late remote input differs from prediction', () => {
    const controller = makeSession(makeMatch(), 0);
    const remoteJab = encodeInputFrame(input(['jab']));

    advance(controller, 4);
    const result = controller.receiveRemoteInputBatch(batch(1, [remoteJab]));

    expect(result.executionMode).toBe('rollback');
    expect(result.replayedFrames).toBe(3);
    expect(controller.getStats().rollbackCount).toBe(1);
    expect(controller.getStats().maxRollbackDepth).toBe(3);
    expect(controller.getMatch().fighters[1].state).toBe('attack');
  });

  it('rolls back once from the earliest mismatch in a multi-frame batch', () => {
    const controller = makeSession(makeMatch(), 0);
    const remoteRight = encodeInputFrame(input(['right']));
    const remoteJab = encodeInputFrame(input(['jab']));

    advance(controller, 6);
    controller.receiveRemoteInputBatch(batch(2, [remoteRight, remoteJab]));

    expect(controller.getStats().rollbackCount).toBe(1);
    expect(controller.getStats().maxRollbackDepth).toBe(4);
  });

  it('requests resync when a mismatch is older than the rollback window', () => {
    const controller = makeSession(makeMatch(), 0, 2);

    advance(controller, 5);
    controller.receiveRemoteInputBatch(batch(0, [encodeInputFrame(input(['jab']))]));

    expect(controller.getStats().needsResync).toBe(true);
    expect(controller.getStats().droppedLateInputs).toBe(1);
  });

  it('applies local input immediately', () => {
    const controller = makeSession(makeMatch(), 0);

    controller.advance(input(['jab']));

    expect(controller.getMatch().fighters[0].state).toBe('attack');
  });

  it('uses the GGPO-style addLocalInput/synchronizeInputs/advanceFrame API', () => {
    const controller = makeSession(makeMatch(), 0);

    expect(controller.addLocalInput(0, input(['jab']))).toBe(true);
    const synchronized = controller.synchronizeInputs();
    const result = controller.advanceFrame();

    expect(synchronized.ok).toBe(true);
    expect(synchronized.masks[0]).toBe(encodeInputFrame(input(['jab'])));
    expect(result.advanced).toBe(true);
    expect(controller.getMatch().fighters[0].state).toBe('attack');
  });

  it('honors configurable local frame delay', () => {
    const controller = makeSession(makeMatch(), 0, 12, 12, 2);

    controller.addLocalInput(0, input(['jab']));
    controller.advanceFrame();
    controller.addLocalInput(0, emptyInputFrame());
    controller.advanceFrame();
    controller.addLocalInput(0, emptyInputFrame());
    controller.advanceFrame();

    expect(controller.getMatch().fighters[0].state).toBe('attack');
    expect(controller.getNetworkStats().localFrameDelay).toBe(2);
  });

  it('stops advancing and requests resync when max prediction is exceeded', () => {
    const controller = makeSession(makeMatch(), 0, 12, 1);

    controller.addLocalInput(0, emptyInputFrame());
    expect(controller.advanceFrame().advanced).toBe(true);
    controller.addLocalInput(0, emptyInputFrame());
    const result = controller.advanceFrame();

    expect(result.advanced).toBe(false);
    expect(result.reason).toBe('prediction_limit');
    expect(controller.getNetworkStats().needsResync).toBe(true);
  });

  it('ignores duplicate remote packets after the first correction', () => {
    const controller = makeSession(makeMatch(), 0);
    const remoteJab = batch(1, [encodeInputFrame(input(['jab']))]);

    advance(controller, 4);
    controller.receiveRemoteInputBatch(remoteJab);
    controller.receiveRemoteInputBatch(remoteJab);

    expect(controller.getNetworkStats().rollbackCount).toBe(1);
  });

  it('marks the session disconnected after idle timeout', () => {
    vi.useFakeTimers();
    try {
      const controller = createRollbackSession({
        initialMatch: makeMatch(),
        localPlayerIndex: 0,
        stepMatch,
        cloneMatch: cloneMatchSnapshot,
        encodeInput: encodeInputFrame,
        decodeInput: decodeInputFrame,
        disconnectTimeoutMs: 1000
      });

      vi.advanceTimersByTime(1001);

      expect(controller.idle(1).disconnected).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails loudly after repeated checksum divergence', () => {
    const controller = makeSession(makeMatch(), 0);
    const desyncPacket = { ...batch(0, []), currentFrame: 0, remoteFrame: -1, checksum: 123 };

    controller.receiveRemoteInputBatch(desyncPacket);
    controller.receiveRemoteInputBatch(desyncPacket);
    controller.receiveRemoteInputBatch(desyncPacket);

    expect(controller.getNetworkStats().desyncCount).toBe(3);
    expect(controller.getNetworkStats().needsResync).toBe(true);
  });

  it('replaying from a cloned checkpoint reaches the uninterrupted checksum', () => {
    const initial = makeMatch();
    const inputs = [input(['right']), input(['right']), input(['jab']), emptyInputFrame()];
    let uninterrupted = cloneMatchSnapshot(initial);
    inputs.forEach((frameInput) => {
      uninterrupted = stepMatch(uninterrupted, frameInput, emptyInputFrame(), 1 / 60);
    });

    let replayed = cloneMatchSnapshot(initial);
    const checkpoint = cloneMatchSnapshot(replayed);
    replayed = stepMatch(replayed, inputs[0], emptyInputFrame(), 1 / 60);
    replayed = cloneMatchSnapshot(checkpoint);
    inputs.forEach((frameInput) => {
      replayed = stepMatch(replayed, frameInput, emptyInputFrame(), 1 / 60);
    });

    expect(checksumMatch(replayed)).toBe(checksumMatch(uninterrupted));
  });

  it('passes the GGPO-style synctest runner for representative repeated inputs', () => {
    const result = runRollbackSyncTest({
      initialMatch: makeMatch(),
      frames: 24,
      stepMatch,
      cloneMatch: cloneMatchSnapshot,
      p1Inputs: (frame) => (frame % 8 < 4 ? input(['right']) : input(['jab'])),
      p2Inputs: (frame) => (frame === 6 ? input(['heavy']) : emptyInputFrame())
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('keeps host and guest simulations converged through latency and jitter', () => {
    const initial = makeMatch();
    const host = makeSession(initial, 0);
    const guest = makeSession(initial, 1);
    const hostPackets: Array<{ deliverAt: number; batch: ReturnType<RollbackSession['makeInputBatch']> }> = [];
    const guestPackets: Array<{ deliverAt: number; batch: ReturnType<RollbackSession['makeInputBatch']> }> = [];

    for (let frame = 0; frame < 24; frame += 1) {
      host.advance(frame % 8 < 4 ? input(['right']) : emptyInputFrame());
      guest.advance(frame === 6 ? input(['jab']) : emptyInputFrame());
      hostPackets.push({ deliverAt: frame + 3 + (frame % 2), batch: host.makeInputBatch(8, frame) });
      guestPackets.push({ deliverAt: frame + 4 - (frame % 2), batch: guest.makeInputBatch(8, frame) });

      hostPackets.filter((packet) => packet.deliverAt === frame).forEach((packet) => guest.receiveRemoteInputBatch(packet.batch, frame));
      guestPackets.filter((packet) => packet.deliverAt === frame).forEach((packet) => host.receiveRemoteInputBatch(packet.batch, frame));
    }

    hostPackets.forEach((packet) => guest.receiveRemoteInputBatch(packet.batch, 99));
    guestPackets.forEach((packet) => host.receiveRemoteInputBatch(packet.batch, 99));

    expect(checksumMatch(host.getMatch())).toBe(checksumMatch(guest.getMatch()));
    expect(host.getStats().rollbackCount + guest.getStats().rollbackCount).toBeGreaterThan(0);
  });
});
