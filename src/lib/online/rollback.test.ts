import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../../data/characters';
import { stages } from '../../data/stages';
import { cloneMatchSnapshot, createMatch, stepMatch } from '../../engine/fightEngine';
import { emptyInputFrame, type InputFrame, type MatchSnapshot } from '../../types';
import { decodeInputFrame, encodeInputFrame } from './codec';
import { checksumMatch, createRollbackController, type RollbackController, type RollbackPlayerIndex } from './rollback';

function makeMatch() {
  return createMatch(starterCharacters[0], starterCharacters[1], stages[0], 'online', 3, {
    aiSeed: 12345,
    playIntro: false,
    roster: starterCharacters
  });
}

function makeController(match: MatchSnapshot, localPlayerIndex: RollbackPlayerIndex, maxRollbackFrames = 12) {
  return createRollbackController({
    initialMatch: match,
    localPlayerIndex,
    stepMatch,
    cloneMatch: cloneMatchSnapshot,
    encodeInput: encodeInputFrame,
    decodeInput: decodeInputFrame,
    maxRollbackFrames
  });
}

function input(actions: Array<keyof InputFrame>) {
  const frame = emptyInputFrame();
  actions.forEach((action) => {
    frame[action] = true;
  });
  return frame;
}

function advance(controller: RollbackController, frames: number, frameInput = emptyInputFrame()) {
  for (let frame = 0; frame < frames; frame += 1) controller.advance(frameInput);
}

describe('rollback controller', () => {
  it('does not roll back when late input matches prediction', () => {
    const controller = makeController(makeMatch(), 0);

    advance(controller, 3);
    controller.receiveRemoteInputBatch({ startFrame: 0, masks: [0, 0, 0], ackFrame: -1 });

    expect(controller.getStats().rollbackCount).toBe(0);
  });

  it('rolls back and replays when a late remote input differs from prediction', () => {
    const controller = makeController(makeMatch(), 0);
    const remoteJab = encodeInputFrame(input(['jab']));

    advance(controller, 4);
    controller.receiveRemoteInputBatch({ startFrame: 1, masks: [remoteJab], ackFrame: -1 });

    expect(controller.getStats().rollbackCount).toBe(1);
    expect(controller.getStats().maxRollbackDepth).toBe(3);
    expect(controller.getMatch().fighters[1].state).toBe('attack');
  });

  it('rolls back once from the earliest mismatch in a multi-frame batch', () => {
    const controller = makeController(makeMatch(), 0);
    const remoteRight = encodeInputFrame(input(['right']));
    const remoteJab = encodeInputFrame(input(['jab']));

    advance(controller, 6);
    controller.receiveRemoteInputBatch({ startFrame: 2, masks: [remoteRight, remoteJab], ackFrame: -1 });

    expect(controller.getStats().rollbackCount).toBe(1);
    expect(controller.getStats().maxRollbackDepth).toBe(4);
  });

  it('requests resync when a mismatch is older than the rollback window', () => {
    const controller = makeController(makeMatch(), 0, 2);

    advance(controller, 5);
    controller.receiveRemoteInputBatch({ startFrame: 0, masks: [encodeInputFrame(input(['jab']))], ackFrame: -1 });

    expect(controller.getStats().needsResync).toBe(true);
    expect(controller.getStats().droppedLateInputs).toBe(1);
  });

  it('applies local input immediately', () => {
    const controller = makeController(makeMatch(), 0);

    controller.advance(input(['jab']));

    expect(controller.getMatch().fighters[0].state).toBe('attack');
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

  it('keeps host and guest simulations converged through latency and jitter', () => {
    const initial = makeMatch();
    const host = makeController(initial, 0);
    const guest = makeController(initial, 1);
    const hostPackets: Array<{ deliverAt: number; batch: ReturnType<RollbackController['makeInputBatch']> }> = [];
    const guestPackets: Array<{ deliverAt: number; batch: ReturnType<RollbackController['makeInputBatch']> }> = [];

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
