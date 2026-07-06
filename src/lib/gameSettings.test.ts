import { describe, expect, it } from 'vitest';
import { cloneSettings, defaultGameSettings, sanitizeGameSettings } from './gameSettings';

describe('game settings', () => {
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
