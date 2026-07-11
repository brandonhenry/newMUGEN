import type { CharacterProjectileDefinition } from '../types';

export type BlastElectricityMode = 'beam' | 'orb';

export type BlastElectricityProfile = {
  color: string;
  intensity: number;
  size: number;
  count: number;
  refreshFrames: number;
};

export type BlastElectricitySegmentOptions = {
  mode: BlastElectricityMode;
  length: number;
  radius: number;
  arcCount: number;
  seed: number;
  phase: number;
};

export const BLAST_ELECTRICITY_MAX_ARCS = 8;
export const BLAST_ELECTRICITY_POINTS_PER_ARC = 9;
export const BLAST_ELECTRICITY_MAX_VERTICES = BLAST_ELECTRICITY_MAX_ARCS * (BLAST_ELECTRICITY_POINTS_PER_ARC - 1) * 2;

export function getBlastElectricityProfile(
  definition: CharacterProjectileDefinition,
  reducedMotion: boolean
): BlastElectricityProfile {
  const visual = definition.blastVisual;
  const authored = definition.proceduralLayers?.find((layer) => layer.kind === 'lightning');
  const authoredCount = clamp(Math.round(authored?.count ?? 4), 1, BLAST_ELECTRICITY_MAX_ARCS);
  return {
    color: authored?.color ?? visual?.outerColor ?? visual?.glowColor ?? definition.color ?? '#62d8ff',
    intensity: clamp(authored?.intensity ?? 1, 0, 2.5),
    size: clamp(authored?.size ?? 1, 0.45, 2.5),
    count: reducedMotion ? Math.min(2, authoredCount) : authoredCount,
    refreshFrames: reducedMotion ? 18 : 4
  };
}

export function writeBlastElectricitySegments(
  target: Float32Array,
  options: BlastElectricitySegmentOptions
): number {
  const arcCount = clamp(Math.round(options.arcCount), 0, BLAST_ELECTRICITY_MAX_ARCS);
  const length = Math.max(0.05, options.length);
  const radius = Math.max(0.01, options.radius);
  let vertexIndex = 0;

  for (let arc = 0; arc < arcCount; arc += 1) {
    let previous = electricityPoint(options.mode, arc, arcCount, 0, length, radius, options.seed, options.phase);
    for (let point = 1; point < BLAST_ELECTRICITY_POINTS_PER_ARC; point += 1) {
      const current = electricityPoint(options.mode, arc, arcCount, point, length, radius, options.seed, options.phase);
      vertexIndex = writeVertex(target, vertexIndex, previous[0], previous[1], previous[2]);
      vertexIndex = writeVertex(target, vertexIndex, current[0], current[1], current[2]);
      previous = current;
    }
  }

  target.fill(0, vertexIndex * 3);
  return vertexIndex;
}

function electricityPoint(
  mode: BlastElectricityMode,
  arc: number,
  arcCount: number,
  point: number,
  length: number,
  radius: number,
  seed: number,
  phase: number
): [number, number, number] {
  const progress = point / (BLAST_ELECTRICITY_POINTS_PER_ARC - 1);
  const phaseSeed = seed + phase * 101 + arc * 37;
  const jitterA = centeredNoise(phaseSeed, point * 3 + 1);
  const jitterB = centeredNoise(phaseSeed, point * 3 + 2);
  const baseAngle = (arc / Math.max(1, arcCount)) * Math.PI * 2;

  if (mode === 'beam') {
    const angle = baseAngle + progress * Math.PI * (1.15 + noise(phaseSeed, 7) * 1.35) + jitterA * 0.42;
    const surfaceRadius = radius * (1.02 + jitterB * 0.2);
    const xJitter = point === 0 || point === BLAST_ELECTRICITY_POINTS_PER_ARC - 1 ? 0 : centeredNoise(phaseSeed, point * 3) * length * 0.025;
    return [
      -length / 2 + progress * length + xJitter,
      Math.cos(angle) * surfaceRadius,
      Math.sin(angle) * surfaceRadius
    ];
  }

  const longitude = baseAngle + (progress - 0.5) * Math.PI * (1.25 + noise(phaseSeed, 9) * 0.55) + jitterA * 0.38;
  const latitude = Math.sin(progress * Math.PI) * centeredNoise(phaseSeed, 11) * 0.72 + jitterB * 0.22;
  const surfaceRadius = radius * (1.04 + centeredNoise(phaseSeed, point + 23) * 0.18);
  const horizontalRadius = Math.cos(latitude) * surfaceRadius;
  return [
    Math.cos(longitude) * horizontalRadius,
    Math.sin(latitude) * surfaceRadius,
    Math.sin(longitude) * horizontalRadius
  ];
}

function writeVertex(target: Float32Array, vertexIndex: number, x: number, y: number, z: number) {
  const offset = vertexIndex * 3;
  if (offset + 2 >= target.length) return vertexIndex;
  target[offset] = x;
  target[offset + 1] = y;
  target[offset + 2] = z;
  return vertexIndex + 1;
}

function noise(seed: number, index: number) {
  const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function centeredNoise(seed: number, index: number) {
  return noise(seed, index) * 2 - 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
