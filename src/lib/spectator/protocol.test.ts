import { describe, expect, it } from 'vitest';
import { isSpectatorRelayMessage, SPECTATOR_PROTOCOL_VERSION } from './protocol';

describe('spectator protocol', () => {
  it('accepts bounded confirmed input batches', () => {
    expect(isSpectatorRelayMessage({
      type: 'inputBatch', protocol: SPECTATOR_PROTOCOL_VERSION,
      startFrame: 12, p1Masks: [0, 4], p2Masks: [1, 0], latestConfirmedFrame: 13
    })).toBe(true);
  });

  it('rejects mismatched protocols and uneven input arrays', () => {
    expect(isSpectatorRelayMessage({ type: 'resyncRequest', protocol: 99 })).toBe(false);
    expect(isSpectatorRelayMessage({
      type: 'inputBatch', protocol: SPECTATOR_PROTOCOL_VERSION,
      startFrame: 12, p1Masks: [0, 4], p2Masks: [1], latestConfirmedFrame: 13
    })).toBe(false);
  });
});
