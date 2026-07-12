import { describe, expect, it } from 'vitest';
import type { StageDefinition } from '../types';
import { cameraScreenRightStageAlignment, fightCameraSideFollowAlpha, shouldFlipCameraSideForControls, stableControlAlignedFightCameraSide, stableFightCameraSide, stageControlAxis } from './fightCamera';

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

  it('crosses the full sidestep orbit without inverted controls or midpoint collapse', () => {
    let previous = { x: 0, z: 1 };

    for (let degrees = 0; degrees <= 720; degrees += 1) {
      const angle = degrees * Math.PI / 180;
      const fighterLine = { x: Math.cos(angle), z: Math.sin(angle) };
      const [x, z] = stableControlAlignedFightCameraSide(fighterLine.x, fighterLine.z, previous, baseStage);
      const next = { x, z };
      const screenRight = { x: z, z: -x };
      const screenSeparation = Math.abs(fighterLine.x * screenRight.x + fighterLine.z * screenRight.z);

      expect(cameraScreenRightStageAlignment(next, baseStage)).toBeGreaterThan(0);
      expect(screenSeparation).toBeGreaterThan(0.5);
      previous = next;
    }
  });

  it('uses the fixed stage-depth side while crossing the unstable orbit axis', () => {
    const [x, z] = stableControlAlignedFightCameraSide(0, 1, { x: 0.1, z: 0.99 }, baseStage);

    const screenSeparation = Math.abs(-x);
    expect(screenSeparation).toBeGreaterThan(0.8);
    expect(cameraScreenRightStageAlignment({ x, z }, baseStage)).toBeGreaterThan(0);
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
      const fighterLine = { x: Math.cos(angle), z: Math.sin(angle) };
      const [x, z] = stableControlAlignedFightCameraSide(fighterLine.x, fighterLine.z, previous, rotatedStage);
      const next = { x, z };
      const screenRight = { x: z, z: -x };
      const screenSeparation = Math.abs(fighterLine.x * screenRight.x + fighterLine.z * screenRight.z);

      expect(cameraScreenRightStageAlignment(next, rotatedStage)).toBeGreaterThan(0);
      expect(screenSeparation).toBeGreaterThan(0.5);
      previous = next;
    }
  });

  it('keeps up with a tap sidestep before the fighters can touch at screen midpoint', () => {
    const startAngle = 45 * Math.PI / 180;
    const [initialX, initialZ] = stableControlAlignedFightCameraSide(Math.cos(startAngle), Math.sin(startAngle), undefined, baseStage);
    let cameraSide = { x: initialX, z: initialZ };
    let minimumScreenSeparation = 1;

    // A typical tap sidestep advances about 6-7 degrees per 60 Hz frame at close range.
    for (let degrees = 52; degrees <= 136; degrees += 7) {
      const angle = degrees * Math.PI / 180;
      const fighterLine = { x: Math.cos(angle), z: Math.sin(angle) };
      const [targetX, targetZ] = stableControlAlignedFightCameraSide(fighterLine.x, fighterLine.z, cameraSide, baseStage);
      const alpha = fightCameraSideFollowAlpha(1 / 60, 1, true);
      cameraSide.x += (targetX - cameraSide.x) * alpha;
      cameraSide.z += (targetZ - cameraSide.z) * alpha;
      const length = Math.hypot(cameraSide.x, cameraSide.z);
      cameraSide.x /= length;
      cameraSide.z /= length;

      const screenRight = { x: cameraSide.z, z: -cameraSide.x };
      const separation = Math.abs(fighterLine.x * screenRight.x + fighterLine.z * screenRight.z);
      minimumScreenSeparation = Math.min(minimumScreenSeparation, separation);
      expect(cameraScreenRightStageAlignment(cameraSide, baseStage)).toBeGreaterThan(0);
    }

    expect(minimumScreenSeparation).toBeGreaterThan(0.15);
  });
});
