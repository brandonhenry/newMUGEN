import { describe, expect, it } from 'vitest';
import type { StageDefinition } from '../types';
import { cameraScreenRightStageAlignment, resolveFightCameraSide, shouldFlipCameraSideForControls, stableFightCameraSide, stageControlAxis } from './fightCamera';

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

  it('keeps the previous camera hemisphere even when stage alignment crosses the orbit axis', () => {
    const rawSide = { x: 0, z: -1 };
    const previousSame = { x: 0.1, z: -0.99 };
    const previousOpposite = { x: -0.1, z: 0.99 };

    expect(cameraScreenRightStageAlignment(rawSide, baseStage)).toBeLessThan(0);
    expect(shouldFlipCameraSideForControls(rawSide, previousSame, baseStage)).toBe(false);
    expect(shouldFlipCameraSideForControls(rawSide, previousOpposite, baseStage)).toBe(true);
  });

  it('uses previous camera continuity when stage-side alignment is tied', () => {
    const rawSide = { x: -1, z: 0 };
    const previousSame = { x: -0.9, z: 0.1 };
    const previousOpposite = { x: 0.9, z: -0.1 };

    expect(Math.abs(cameraScreenRightStageAlignment(rawSide, baseStage))).toBeLessThan(0.001);
    expect(shouldFlipCameraSideForControls(rawSide, previousSame, baseStage)).toBe(false);
    expect(shouldFlipCameraSideForControls(rawSide, previousOpposite, baseStage)).toBe(true);
  });

  it('follows a full sidestep orbit without a 180-degree camera swap', () => {
    let previous: { x: number; z: number } | undefined;

    for (let degrees = 0; degrees <= 720; degrees += 2) {
      const angle = degrees * Math.PI / 180;
      const [x, z] = resolveFightCameraSide(Math.cos(angle), Math.sin(angle), previous, baseStage);
      if (previous) expect(x * previous.x + z * previous.z).toBeGreaterThan(0.99);
      previous = { x, z };
    }
  });

  it('applies presentation mirroring before continuity selection', () => {
    const [initialX, initialZ] = resolveFightCameraSide(1, 0, undefined, baseStage, true);
    const previous = { x: initialX, z: initialZ };
    const [nextX, nextZ] = resolveFightCameraSide(1, 0.01, previous, baseStage, true);

    expect(nextX * previous.x + nextZ * previous.z).toBeGreaterThan(0.99);
    expect(nextZ).toBeLessThan(0);
  });
});
