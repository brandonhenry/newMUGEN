import { describe, expect, it } from 'vitest';
import type { StageDefinition } from '../types';
import { cameraScreenRightStageAlignment, shouldFlipCameraSideForControls, stableControlAlignedFightCameraSide, stableFightCameraSide, stageControlAxis } from './fightCamera';

const baseStage: StageDefinition = {
  id: 'test-stage',
  name: 'Test Stage',
  subtitle: 'Fixture',
  floor: '',
  rail: '',
  light: '',
  fightPlane: { center: [0, 0, 0], width: 14, depth: 8, y: 0, rotationY: 0 }
};

describe('fightCamera', () => {
  it('keeps screen-right aligned to the default stage control axis', () => {
    const [x, z] = stableFightCameraSide(-2, 0);
    const side = { x, z };

    expect(cameraScreenRightStageAlignment(side, baseStage)).toBeLessThan(0);
    expect(shouldFlipCameraSideForControls(side, undefined, baseStage)).toBe(true);

    side.x *= -1;
    side.z *= -1;
    expect(cameraScreenRightStageAlignment(side, baseStage)).toBeGreaterThan(0);
  });

  it('uses the rotated stage axis when choosing the non-inverting camera side', () => {
    const rotatedStage: StageDefinition = {
      ...baseStage,
      fightPlane: { center: [4, 0, -2], width: 14, depth: 8, y: 0, rotationY: Math.PI / 2 }
    };
    const [stageRightX, stageRightZ] = stageControlAxis(rotatedStage);
    const side = { x: stageRightZ, z: -stageRightX };

    expect(cameraScreenRightStageAlignment(side, rotatedStage)).toBeLessThan(0);
    expect(shouldFlipCameraSideForControls(side, undefined, rotatedStage)).toBe(true);
  });

  it('falls back to previous camera continuity when stage-side alignment is tied', () => {
    const rawSide = { x: -1, z: 0 };
    const previousSame = { x: -0.9, z: 0.1 };
    const previousOpposite = { x: 0.9, z: -0.1 };

    expect(Math.abs(cameraScreenRightStageAlignment(rawSide, baseStage))).toBeLessThan(0.001);
    expect(shouldFlipCameraSideForControls(rawSide, previousSame, baseStage)).toBe(false);
    expect(shouldFlipCameraSideForControls(rawSide, previousOpposite, baseStage)).toBe(true);
  });

  it('crosses the full sidestep orbit without a camera swap or inverted controls', () => {
    let previous = { x: 0, z: 1 };

    for (let degrees = 0; degrees <= 720; degrees += 1) {
      const angle = degrees * Math.PI / 180;
      const [x, z] = stableControlAlignedFightCameraSide(Math.cos(angle), Math.sin(angle), previous, baseStage);
      const next = { x, z };

      expect(cameraScreenRightStageAlignment(next, baseStage)).toBeGreaterThan(0);
      expect(x * previous.x + z * previous.z).toBeGreaterThan(0.99);
      previous = next;
    }
  });

  it('uses the fixed stage-depth side while crossing the unstable orbit axis', () => {
    const [x, z] = stableControlAlignedFightCameraSide(0, 1, { x: 0.1, z: 0.99 }, baseStage);

    expect(x).toBeCloseTo(0, 5);
    expect(z).toBeCloseTo(1, 5);
  });

  it('keeps control alignment and continuity on rotated stages', () => {
    const rotatedStage: StageDefinition = {
      ...baseStage,
      fightPlane: { ...baseStage.fightPlane!, rotationY: Math.PI / 3 }
    };
    const [initialX, initialZ] = stableControlAlignedFightCameraSide(1, 0, undefined, rotatedStage);
    let previous = { x: initialX, z: initialZ };

    for (let degrees = 1; degrees <= 360; degrees += 1) {
      const angle = degrees * Math.PI / 180;
      const [x, z] = stableControlAlignedFightCameraSide(Math.cos(angle), Math.sin(angle), previous, rotatedStage);
      const next = { x, z };

      expect(cameraScreenRightStageAlignment(next, rotatedStage)).toBeGreaterThan(0);
      expect(x * previous.x + z * previous.z).toBeGreaterThan(0.99);
      previous = next;
    }
  });
});
