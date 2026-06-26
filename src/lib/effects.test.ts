import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import { normalizeCharacter } from './characterLoader';
import { effectTransformAt, sanitizeEffects, sanitizeMoveEffects, shouldFireEffectCue } from './effects';

describe('character effects', () => {
  it('sanitizes effects and interpolates keyframed transforms in move frames', () => {
    const effect = sanitizeEffects([{
      id: 'wind-01',
      name: 'Wind Cut',
      frames: ['/characters/kiro/effects/wind/frames/frame-000.png'],
      fps: 12,
      defaultTransform: { position: [0, 1, 0], scale: [1, 1, 1], rotation: [0, 0, 0], opacity: 1, color: '#ffffff' }
    }])[0];
    const instance = sanitizeMoveEffects({
      jableft: [{
        id: 'wind-01-instance',
        effectId: 'wind-01',
        startFrame: 4,
        endFrame: 20,
        keyframes: [
          { frame: 0, position: [0, 0, 0], scale: [1, 1, 1], opacity: 1, color: '#ffffff' },
          { frame: 10, position: [1, 2, 3], scale: [2, 2, 2], opacity: 0.5, color: '#2ee6ff' }
        ]
      }]
    }).jableft[0];

    const transform = effectTransformAt(effect, instance, 9);

    expect(transform.position[0]).toBeCloseTo(0.5);
    expect(transform.position[1]).toBeCloseTo(1);
    expect(transform.position[2]).toBeCloseTo(1.5);
    expect(transform.scale[0]).toBeCloseTo(1.5);
    expect(transform.opacity).toBeCloseTo(0.75);
  });

  it('fires audio cues once when move instance crosses cue frame', () => {
    const instance = sanitizeMoveEffects({
      jableft: [{ id: 'spark-a', effectId: 'spark', startFrame: 8 }]
    }).jableft[0];
    const cue = { id: 'cue', name: 'Cue', path: '/characters/kiro/effects/spark/sounds/cue.wav', frame: 3, volume: 1, pitch: 1, pan: 0 };

    expect(shouldFireEffectCue(cue, 10, 11, instance)).toBe(true);
    expect(shouldFireEffectCue(cue, 11, 12, instance)).toBe(false);
  });

  it('canonicalizes raw single-button move effects onto base stance keys', () => {
    const character = normalizeCharacter({
      ...starterCharacters[0],
      moveEffects: {
        'cmd:1': [{ id: 'raw-1', effectId: 'spark', startFrame: 0, layer: 0, mirrorWithFacing: true, keyframes: [] }]
      }
    });

    expect(character.moveEffects?.jableft?.[0]?.effectId).toBe('spark');
    expect(character.moveEffects?.['cmd:1']).toBeUndefined();
  });
});
