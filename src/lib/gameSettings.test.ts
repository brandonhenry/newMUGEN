import { describe, expect, it } from 'vitest';
import { cloneSettings, defaultGameSettings, sanitizeGameSettings } from './gameSettings';

describe('game settings', () => {
  it('defaults, sanitizes, and independently clones training settings', () => {
    expect(sanitizeGameSettings(null).training.frameAdvantageNumbers).toBe(true);
    expect(sanitizeGameSettings({ training: { frameAdvantageNumbers: false } }).training.frameAdvantageNumbers).toBe(false);
    expect(sanitizeGameSettings({ training: { frameAdvantageNumbers: 'sometimes' } }).training.frameAdvantageNumbers).toBe(true);
    expect(sanitizeGameSettings(null).training.blockAfterFirstHit).toBe(false);
    expect(sanitizeGameSettings({ training: { blockAfterFirstHit: true } }).training.blockAfterFirstHit).toBe(true);
    expect(sanitizeGameSettings({ training: { blockAfterFirstHit: 'sometimes' } }).training.blockAfterFirstHit).toBe(false);
    expect(sanitizeGameSettings(null).training.autoAttack).toBe(false);
    expect(sanitizeGameSettings({ training: { autoAttack: true } }).training.autoAttack).toBe(true);
    expect(sanitizeGameSettings({ training: { autoAttackDifficulty: 5 } }).training.autoAttackDifficulty).toBe(5);
    expect(sanitizeGameSettings({ training: { autoAttackDifficulty: 99 } }).training.autoAttackDifficulty).toBe(5);
    expect(sanitizeGameSettings({ training: { autoAttackDifficulty: 'hard' } }).training.autoAttackDifficulty).toBe(3);

    const clone = cloneSettings(defaultGameSettings);
    clone.training.frameAdvantageNumbers = false;
    clone.training.blockAfterFirstHit = true;
    clone.training.autoAttack = true;
    clone.training.autoAttackDifficulty = 5;
    expect(defaultGameSettings.training.frameAdvantageNumbers).toBe(true);
    expect(defaultGameSettings.training.blockAfterFirstHit).toBe(false);
    expect(defaultGameSettings.training.autoAttack).toBe(false);
    expect(defaultGameSettings.training.autoAttackDifficulty).toBe(3);
  });

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

  it('forces the voxel impact default once for old saves and preserves later user choices', () => {
    const migrated = sanitizeGameSettings({
      version: 9,
      settings: {
        display: { impactSparks: { shape: 'white-ink' } }
      }
    });
    expect(migrated.display.impactSparks.shape).toBe('voxel-burst');

    const current = sanitizeGameSettings({
      version: 13,
      settings: {
        display: { impactSparks: { shape: 'white-ink' } }
      }
    });
    expect(current.display.impactSparks.shape).toBe('white-ink');

    const directSelection = sanitizeGameSettings({
      display: { impactSparks: { shape: 'ring' } }
    });
    expect(directSelection.display.impactSparks.shape).toBe('ring');
  });

  it('defaults and migrates movement smoke styles while preserving new selections', () => {
    expect(defaultGameSettings.display.movementSmokeStyle).toBe('speed-trail');
    for (const style of ['speed-trail', 'soft-puff', 'burst-puff', 'dust-ring'] as const) {
      expect(sanitizeGameSettings({ display: { movementSmokeStyle: style } }).display.movementSmokeStyle).toBe(style);
    }
    expect(sanitizeGameSettings({ display: { movementSmokeStyle: 'cloud' } }).display.movementSmokeStyle).toBe('speed-trail');

    const migrated = sanitizeGameSettings({
      version: 10,
      settings: { display: { movementSmokeStyle: 'green' } }
    });
    expect(migrated.display.movementSmokeStyle).toBe('speed-trail');

    const current = sanitizeGameSettings({
      version: 13,
      settings: { display: { movementSmokeStyle: 'dust-ring' } }
    });
    expect(current.display.movementSmokeStyle).toBe('dust-ring');
  });

  it('overwrites both effect selections for existing production settings exactly once', () => {
    const migrated = sanitizeGameSettings({
      version: 12,
      settings: {
        display: {
          movementSmokeStyle: 'dust-ring',
          impactSparks: { shape: 'white-ink' }
        }
      }
    });
    expect(migrated.display.movementSmokeStyle).toBe('speed-trail');
    expect(migrated.display.impactSparks.shape).toBe('voxel-burst');

    const afterMigration = sanitizeGameSettings({
      version: 13,
      settings: {
        display: {
          movementSmokeStyle: 'soft-puff',
          impactSparks: { shape: 'heavy-burst' }
        }
      }
    });
    expect(afterMigration.display.movementSmokeStyle).toBe('soft-puff');
    expect(afterMigration.display.impactSparks.shape).toBe('heavy-burst');
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

  it('defaults and sanitizes voice volume settings', () => {
    expect(sanitizeGameSettings(null).audio.voices).toBe(defaultGameSettings.audio.voices);

    const migrated = sanitizeGameSettings({
      audio: {
        sfx: 0.32
      }
    });

    expect(migrated.audio.sfx).toBe(0.32);
    expect(migrated.audio.voices).toBe(0.32);

    expect(sanitizeGameSettings({ audio: { sfx: 0.4, voices: -1 } }).audio.voices).toBe(0);
    expect(sanitizeGameSettings({ audio: { sfx: 0.4, voices: 5 } }).audio.voices).toBe(1);
  });

  it('clones audio settings independently', () => {
    const clone = cloneSettings(defaultGameSettings);
    clone.audio.voices = 0.2;

    expect(defaultGameSettings.audio.voices).toBe(0.85);
    expect(clone.audio.voices).toBe(0.2);
  });
});
