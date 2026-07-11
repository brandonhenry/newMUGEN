import { createMatch, stepMatch } from '../../engine/fightEngine';
import type { CharacterDefinition, MatchSnapshot, StageDefinition } from '../../types';
import { decodeInputFrame, hydrateMatchSnapshot } from '../online/codec';
import { checksumMatch } from '../online/rollback';
import type { SpectatorBootstrap, SpectatorCheckpoint, SpectatorInputBatch } from './protocol';

export function createSpectatorPlayback(delayFrames: number) {
  const p1Masks = new Map<number, number>();
  const p2Masks = new Map<number, number>();
  const checkpoints = new Map<number, number>();
  return {
    match: null as MatchSnapshot | null,
    frame: 0,
    latestConfirmedFrame: -1,
    bootstrap(message: SpectatorBootstrap, roster: CharacterDefinition[], stages: StageDefinition[]) {
      p1Masks.clear(); p2Masks.clear(); checkpoints.clear();
      const snapshot = message.snapshot.snapshot;
      const p1 = roster.find((character) => character.id === (snapshot.p1BaseCharacterId || snapshot.p1CharacterId));
      const p2 = roster.find((character) => character.id === (snapshot.p2BaseCharacterId || snapshot.p2CharacterId));
      const stage = stages.find((candidate) => candidate.id === snapshot.stageId);
      if (!p1 || !p2 || !stage) throw new Error('Spectator assets unavailable');
      const base = createMatch(p1, p2, stage, 'online', snapshot.cpuDifficulty, { roster, roundTime: snapshot.roundTime, roundsToWin: snapshot.roundsToWin, maxHealth: snapshot.maxHealth, playIntro: false });
      this.match = hydrateMatchSnapshot(base, snapshot);
      this.frame = message.snapshot.frame;
      this.latestConfirmedFrame = message.latestConfirmedFrame;
      for (const batch of message.inputs) this.addInputs(batch);
      checkpoints.set(message.snapshot.frame, message.snapshot.checksum);
    },
    addInputs(batch: SpectatorInputBatch) {
      batch.p1Masks.forEach((mask, offset) => p1Masks.set(batch.startFrame + offset, mask));
      batch.p2Masks.forEach((mask, offset) => p2Masks.set(batch.startFrame + offset, mask));
      this.latestConfirmedFrame = Math.max(this.latestConfirmedFrame, batch.latestConfirmedFrame);
    },
    addCheckpoint(checkpoint: SpectatorCheckpoint) { checkpoints.set(checkpoint.frame, checkpoint.checksum); },
    targetFrame() { return Math.max(0, this.latestConfirmedFrame - Math.max(0, Math.round(delayFrames))); },
    advance(): 'advanced' | 'gap' | 'desync' {
      if (!this.match) return 'gap';
      const expected = checkpoints.get(this.frame);
      if (expected !== undefined && checksumMatch(this.match) !== expected) return 'desync';
      const p1 = p1Masks.get(this.frame); const p2 = p2Masks.get(this.frame);
      if (p1 === undefined || p2 === undefined) return 'gap';
      this.match = stepMatch(this.match, decodeInputFrame(p1), decodeInputFrame(p2), 1 / 60);
      this.frame += 1;
      const minimum = this.frame - 600;
      for (const frame of p1Masks.keys()) if (frame < minimum) { p1Masks.delete(frame); p2Masks.delete(frame); checkpoints.delete(frame); }
      return 'advanced';
    }
  };
}

export type SpectatorPlayback = ReturnType<typeof createSpectatorPlayback>;
