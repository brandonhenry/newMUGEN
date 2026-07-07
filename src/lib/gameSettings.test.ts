import { describe, expect, it } from 'vitest';
import { cloneSettings, defaultGameSettings, sanitizeGameSettings } from './gameSettings';

describe('game settings', () => {
  it('defaults dedicated jump bindings for keyboard and gamepad', () => {
    const settings = sanitizeGameSettings(null);

    expect(settings.controls.keyboard[0].up).toEqual(['KeyW']);
    expect(settings.controls.keyboard[0].jump).toEqual(['Space']);
    expect(settings.controls.keyboard[1].up).toEqual(['ArrowUp']);
    expect(settings.controls.keyboard[1].jump).toEqual(['Numpad0']);
    expect(settings.controls.gamepad[0].jump).toEqual([7]);
    expect(settings.controls.gamepad[1].jump).toEqual([7]);
    expect(settings.controls.upHoldJumps).toBe(false);
  });

  it('sanitizes and clones the up-hold jump option', () => {
    const settings = sanitizeGameSettings({
      controls: {
        upHoldJumps: true,
        gamepad: [{ jump: [] }]
      }
    });

    expect(settings.controls.upHoldJumps).toBe(true);
    expect(settings.controls.gamepad[0].jump).toBeUndefined();

    const clone = cloneSettings(settings);
    clone.controls.upHoldJumps = false;
    expect(settings.controls.upHoldJumps).toBe(true);
  });

  it('migrates legacy Space-as-up saves to dedicated jump', () => {
    const settings = sanitizeGameSettings({
      version: 7,
      settings: {
        controls: {
          keyboard: [
            { up: ['KeyW', 'Space'] },
            { up: ['ArrowUp'] }
          ]
        }
      }
    });

    expect(settings.controls.keyboard[0].up).toEqual(['KeyW']);
    expect(settings.controls.keyboard[0].jump).toEqual(['Space']);
    expect(settings.controls.keyboard[1].jump).toEqual(['Numpad0']);
  });

  it('defaults performance settings for older saves', () => {
    const settings = sanitizeGameSettings({
      game: { controlScheme: 'beginner' },
      display: { reducedMotion: true }
    });

    expect(settings.performance).toEqual(defaultGameSettings.performance);
    expect(settings.game.controlScheme).toBe('beginner');
    expect(settings.display.reducedMotion).toBe(true);
  });

  it('sanitizes performance settings', () => {
    const settings = sanitizeGameSettings({
      performance: {
        autoDetectMenuLag: false,
        menuAttractMode: 'snappy',
        menuMotionMode: 'snappy'
      }
    });

    expect(settings.performance).toEqual({
      autoDetectMenuLag: false,
      menuAttractMode: 'snappy',
      menuMotionMode: 'snappy'
    });

    const invalid = sanitizeGameSettings({
      performance: {
        autoDetectMenuLag: 'no',
        menuAttractMode: 'lite',
        menuMotionMode: 'none'
      }
    });

    expect(invalid.performance).toEqual(defaultGameSettings.performance);
  });

  it('clones performance settings independently', () => {
    const clone = cloneSettings(defaultGameSettings);
    clone.performance.menuAttractMode = 'snappy';

    expect(defaultGameSettings.performance.menuAttractMode).toBe('full');
    expect(clone.performance.menuAttractMode).toBe('snappy');
  });
});
