import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { StageDefinition } from '../types';
import {
  cameraBoundsLocalToWorld,
  findCameraSightlineBlockers,
  isCameraNearStageSafetyEnvelope,
  isCameraOutsideStageSafetyEnvelope,
  resolveCameraBoundaryNudge,
  resolveCameraStageBounds,
  worldToCameraBoundsLocal
} from './cameraSafety';

const baseStage: StageDefinition = {
  id: 'test-stage',
  name: 'Test Stage',
  subtitle: 'Camera tests',
  renderMode: 'model',
  floor: '#000000',
  rail: '#ffffff',
  light: '#ffffff',
  world: { width: 80, depth: 80, floorY: 0, backgroundColor: '#101114' }
};

describe('cameraSafety', () => {
  it('resolves rotated authored box bounds in stage-local space', () => {
    const stage: StageDefinition = {
      ...baseStage,
      fightPlane: { center: [10, 0, 5], width: 14, depth: 8, y: 0, rotationY: Math.PI / 2 },
      playableBounds: { shape: 'box', width: 8, depth: 4 }
    };
    const bounds = resolveCameraStageBounds(stage, 0);
    const world = cameraBoundsLocalToWorld({ x: 4, z: 2 }, bounds);
    const local = worldToCameraBoundsLocal(world, bounds);

    expect(bounds.centerX).toBe(10);
    expect(bounds.centerZ).toBe(5);
    expect(bounds.halfWidth).toBe(4);
    expect(bounds.halfDepth).toBe(2);
    expect(local.x).toBeCloseTo(4);
    expect(local.z).toBeCloseTo(2);
  });

  it('nudges camera positions back toward rotated ellipse bounds', () => {
    const stage: StageDefinition = {
      ...baseStage,
      fightPlane: { center: [2, 0, -3], width: 14, depth: 8, y: 0, rotationY: Math.PI / 5 },
      playableBounds: { shape: 'ellipse', width: 8, depth: 4 }
    };
    const focus = new THREE.Vector3(2, 1.1, -3);
    const desiredLocal = { x: 0, z: 12 };
    const bounds = resolveCameraStageBounds(stage);
    const desiredWorld = cameraBoundsLocalToWorld(desiredLocal, bounds);
    const desired = new THREE.Vector3(desiredWorld.x, 3, desiredWorld.z);
    const output = new THREE.Vector3();

    expect(resolveCameraBoundaryNudge(stage, focus, desired, output)).toBe(true);
    expect(Number.isFinite(output.x)).toBe(true);
    expect(Number.isFinite(output.z)).toBe(true);

    const nudgedLocal = worldToCameraBoundsLocal(output, bounds);
    expect(Math.abs(nudgedLocal.z)).toBeLessThan(Math.abs(desiredLocal.z));
  });

  it('leaves unobstructed sightlines clear', () => {
    const colliders = [
      { box: new THREE.Box3(new THREE.Vector3(8, 0, 0), new THREE.Vector3(9, 3, 1)) }
    ];
    const blockers = findCameraSightlineBlockers(
      new THREE.Vector3(0, 2, 0),
      [new THREE.Vector3(0, 1, 8)],
      colliders
    );

    expect(blockers.size).toBe(0);
  });

  it('finds the blockers hit by any camera-to-fighter sight ray', () => {
    const near = { box: new THREE.Box3(new THREE.Vector3(-0.5, 0, 2), new THREE.Vector3(0.5, 3, 3)) };
    const far = { box: new THREE.Box3(new THREE.Vector3(-0.5, 0, 5), new THREE.Vector3(0.5, 3, 6)) };
    const offAxis = { box: new THREE.Box3(new THREE.Vector3(4, 0, 2), new THREE.Vector3(5, 3, 3)) };
    const blockers = findCameraSightlineBlockers(
      new THREE.Vector3(0, 2, 0),
      [new THREE.Vector3(0, 1.1, 8), new THREE.Vector3(0.35, 1.8, 8)],
      [near, far, offAxis]
    );

    expect(blockers.has(near)).toBe(true);
    expect(blockers.has(far)).toBe(true);
    expect(blockers.has(offAxis)).toBe(false);
  });

  it('detects camera escape outside the expanded stage safety envelope', () => {
    const stage: StageDefinition = {
      ...baseStage,
      fightPlane: { center: [0, 0, 0], width: 10, depth: 7, y: 0, rotationY: 0 },
      playableBounds: { shape: 'box', width: 10, depth: 7 }
    };

    expect(isCameraOutsideStageSafetyEnvelope(stage, { x: 0, z: 7.5 })).toBe(false);
    expect(isCameraOutsideStageSafetyEnvelope(stage, { x: 0, z: 9.8 })).toBe(true);
  });

  it('detects camera positions approaching the safety envelope before crossing it', () => {
    const stage: StageDefinition = {
      ...baseStage,
      fightPlane: { center: [0, 0, 0], width: 10, depth: 7, y: 0, rotationY: 0 },
      playableBounds: { shape: 'box', width: 10, depth: 7 }
    };

    expect(isCameraNearStageSafetyEnvelope(stage, { x: 0, z: 6.4 })).toBe(false);
    expect(isCameraNearStageSafetyEnvelope(stage, { x: 0, z: 7.4 })).toBe(true);
    expect(isCameraOutsideStageSafetyEnvelope(stage, { x: 0, z: 7.4 })).toBe(false);
  });
});
