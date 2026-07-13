import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CharacterProjectileDefinition, ProjectileRuntime } from '../types';
import { getProjectileVisualQuaternion } from './GameScene';

function makeProjectile(velocity: { x: number; y: number; z: number }, facing: 1 | -1 = 1) {
  return { velocity, facing } as ProjectileRuntime;
}

function makeDefinition(alignToVelocity: boolean) {
  return {
    defaultRotation: [0, 0, 0],
    alignToVelocity
  } as CharacterProjectileDefinition;
}

function expectAligned(velocity: { x: number; y: number; z: number }) {
  const projectile = makeProjectile(velocity, velocity.x < 0 ? -1 : 1);
  const quaternion = getProjectileVisualQuaternion(projectile, makeDefinition(true));
  const actual = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
  const expected = new THREE.Vector3(velocity.x, velocity.y, velocity.z).normalize();
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe('projectile velocity alignment', () => {
  it('keeps legacy projectiles on facing-only rotation', () => {
    const quaternion = getProjectileVisualQuaternion(makeProjectile({ x: -1, y: 4, z: 3 }, -1), makeDefinition(false));
    const actual = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
    expect(actual.x).toBeCloseTo(-1, 6);
    expect(actual.y).toBeCloseTo(0, 6);
    expect(actual.z).toBeCloseTo(0, 6);
  });

  it('aligns right-, left-, upward-, downward-, and lane-diagonal shots', () => {
    expectAligned({ x: 1, y: 0, z: 0 });
    expectAligned({ x: -1, y: 0, z: 0 });
    expectAligned({ x: 1, y: 1, z: 0 });
    expectAligned({ x: 1, y: -1, z: 0 });
    expectAligned({ x: 1, y: 0, z: 1 });
  });
});
