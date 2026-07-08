import { describe, expect, it } from 'vitest';
import type { StageDefinition } from '../types';
import { cameraScreenRightStageAlignment, shouldFlipCameraSideForControls, stableFightCameraSide, stageControlAxis } from './fightCamera';

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
});
