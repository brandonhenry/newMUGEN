import type {
  BoxSpec,
  CharacterProjectileDefinition,
  EffectBlendMode,
  MoveProjectileInstance,
  ProjectileAnimationFrames,
  ProjectileHomingMode,
  ProjectileTargetMode,
  ProceduralEffectKind,
  Vec3Tuple,
  VoxelFidelitySettings
} from '../types';
import { sanitizeSoundCues } from './effects';

const blends = new Set<EffectBlendMode>(['normal', 'additive', 'screen']);
const homingModes = new Set<ProjectileHomingMode>(['none', 'limited']);
const targetModes = new Set<ProjectileTargetMode>(['forward', 'targetLocation']);
const proceduralKinds = new Set<ProceduralEffectKind>(['lightning', 'wind', 'ring', 'glow', 'trail', 'shards']);

export function defaultCharacterProjectile(id = 'projectile'): CharacterProjectileDefinition {
  return {
    id,
    name: 'Projectile',
    frames: [],
    animationFrames: {},
    fps: 18,
    loop: true,
    billboard: false,
    blendMode: 'additive',
    voxelProfile: 'image-source',
    defaultScale: [0.55, 0.55, 0.55],
    defaultRotation: [0, 0, 0],
    color: '#fff4a8',
    soundCues: [],
    proceduralLayers: []
  };
}

export function sanitizeProjectiles(projectiles: unknown): CharacterProjectileDefinition[] {
  if (!Array.isArray(projectiles)) return [];
  return projectiles
    .filter((projectile): projectile is Record<string, unknown> => Boolean(projectile) && typeof projectile === 'object')
    .map(sanitizeProjectile)
    .filter((projectile) => projectile.id.length > 0);
}

export function sanitizeMoveProjectiles(moveProjectiles: unknown): Record<string, MoveProjectileInstance[]> {
  if (!moveProjectiles || typeof moveProjectiles !== 'object') return {};
  return Object.fromEntries(
    Object.entries(moveProjectiles as Record<string, unknown>)
      .filter(([key, value]) => key.length > 0 && Array.isArray(value))
      .map(([key, value]) => [key, (value as unknown[]).map(sanitizeMoveProjectileInstance).filter((instance) => instance.projectileId)])
      .filter(([, value]) => value.length > 0)
  );
}

export function sanitizeProjectile(projectile: Record<string, unknown>): CharacterProjectileDefinition {
  const id = safeId(projectile.id, 'projectile');
  const frames = readStringArray(projectile.frames);
  const animationFrames = sanitizeProjectileAnimationFrames(projectile.animationFrames, frames);
  return {
    id,
    name: typeof projectile.name === 'string' && projectile.name.trim() ? projectile.name.trim() : id,
    spriteSheetPath: typeof projectile.spriteSheetPath === 'string' ? projectile.spriteSheetPath : undefined,
    sourcePath: typeof projectile.sourcePath === 'string' ? projectile.sourcePath : undefined,
    frames,
    animationFrames,
    fps: clampNumber(projectile.fps, 1, 60, 18),
    loop: projectile.loop !== false,
    billboard: projectile.billboard === true,
    blendMode: blends.has(projectile.blendMode as EffectBlendMode) ? projectile.blendMode as EffectBlendMode : 'additive',
    voxelProfile: projectile.voxelProfile === 'hd-image-source' ? 'hd-image-source' : 'image-source',
    voxelFidelity: sanitizeVoxelFidelity(projectile.voxelFidelity),
    defaultScale: readVec3(projectile.defaultScale, [0.55, 0.55, 0.55]).map((value) => Math.max(0.01, value)) as Vec3Tuple,
    defaultRotation: readVec3(projectile.defaultRotation, [0, 0, 0]),
    color: typeof projectile.color === 'string' ? projectile.color : undefined,
    soundCues: sanitizeSoundCues(projectile.soundCues),
    proceduralLayers: sanitizeProceduralLayers(projectile.proceduralLayers)
  };
}

export function sanitizeMoveProjectileInstance(instance: unknown): MoveProjectileInstance {
  const source = instance && typeof instance === 'object' ? instance as Record<string, unknown> : {};
  const startupFrames = clampFrame(source.startupFrames, 0, 180, 0);
  const activeFrames = clampFrame(source.activeFrames, 1, 600, 90);
  const recoveryFrames = clampFrame(source.recoveryFrames, 0, 180, 8);
  return {
    id: safeId(source.id, `projectile-${Date.now()}`),
    projectileId: safeId(source.projectileId, ''),
    label: typeof source.label === 'string' ? source.label : undefined,
    spawnFrame: source.spawnFrame === undefined ? undefined : clampFrame(source.spawnFrame, 0, 600, 0),
    spawnOffset: readVec3(source.spawnOffset, [0, 1.1, 0.75]),
    startupFrames,
    activeFrames,
    recoveryFrames,
    lifetimeFrames: clampFrame(source.lifetimeFrames, Math.max(1, startupFrames + activeFrames + recoveryFrames), 720, startupFrames + activeFrames + recoveryFrames),
    speed: clampNumber(source.speed, 0, 28, 8.5),
    forwardVelocity: clampNumber(source.forwardVelocity, -8, 28, clampNumber(source.speed, 0, 28, 8.5)),
    verticalVelocity: source.verticalVelocity === undefined ? undefined : clampNumber(source.verticalVelocity, -16, 24, 0),
    gravity: source.gravity === undefined ? undefined : clampNumber(source.gravity, 0, 80, 0),
    homingMode: homingModes.has(source.homingMode as ProjectileHomingMode) ? source.homingMode as ProjectileHomingMode : 'limited',
    homingStrength: clampNumber(source.homingStrength, 0, 20, 4.2),
    homingTurnRate: clampNumber(source.homingTurnRate, 0, 18, 5.5),
    homingEndFrame: source.homingEndFrame === undefined ? undefined : clampFrame(source.homingEndFrame, 0, 720, activeFrames),
    nearMissRadius: clampNumber(source.nearMissRadius, 0.05, 3, 0.62),
    targetMode: targetModes.has(source.targetMode as ProjectileTargetMode) ? source.targetMode as ProjectileTargetMode : undefined,
    hitbox: sanitizeBox(source.hitbox, { offset: [0, 0, 0], size: [0.42, 0.42, 0.55] }),
    damageScale: clampNumber(source.damageScale, 0, 5, 1),
    blockDamageScale: clampNumber(source.blockDamageScale, 0, 5, 1),
    pushbackScale: clampNumber(source.pushbackScale, 0, 5, 1),
    blockPushbackScale: clampNumber(source.blockPushbackScale, 0, 5, 1),
    mirrorWithFacing: source.mirrorWithFacing !== false,
    pierce: source.pierce === true,
    clash: source.clash === true,
    kiBurst: source.kiBurst === true
  };
}

function sanitizeProjectileAnimationFrames(value: unknown, fallbackFrames: string[]): ProjectileAnimationFrames {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const active = readStringArray(source.active);
  return {
    startup: readStringArray(source.startup),
    active: active.length > 0 ? active : fallbackFrames,
    recovery: readStringArray(source.recovery)
  };
}

function sanitizeProceduralLayers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((layer): layer is Record<string, unknown> => Boolean(layer) && typeof layer === 'object')
    .map((layer) => ({
      id: safeId(layer.id, 'layer'),
      kind: proceduralKinds.has(layer.kind as ProceduralEffectKind) ? layer.kind as ProceduralEffectKind : 'trail',
      color: typeof layer.color === 'string' ? layer.color : '#fff4a8',
      intensity: clampNumber(layer.intensity, 0, 10, 1),
      size: clampNumber(layer.size, 0.01, 10, 1),
      count: layer.count === undefined ? undefined : clampFrame(layer.count, 1, 80, 12)
    }));
}

function sanitizeVoxelFidelity(value: unknown): VoxelFidelitySettings | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  return {
    resolutionScale: optionalNumber(source.resolutionScale, 0.25, 4),
    maxRows: optionalInteger(source.maxRows, 4, 96),
    depth: optionalNumber(source.depth, 0.01, 1),
    alphaThreshold: optionalNumber(source.alphaThreshold, 0, 255),
    paletteSnap: optionalNumber(source.paletteSnap, 1, 64),
    mergeRuns: source.mergeRuns === undefined ? undefined : source.mergeRuns === true
  };
}

function sanitizeBox(value: unknown, fallback: BoxSpec): BoxSpec {
  if (!value || typeof value !== 'object') return fallback;
  const source = value as Partial<BoxSpec>;
  return {
    offset: readVec3(source.offset, fallback.offset),
    size: readVec3(source.size, fallback.size).map((entry) => Math.max(0.01, Math.abs(entry))) as Vec3Tuple
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : [];
}

function readVec3(value: unknown, fallback: Vec3Tuple): Vec3Tuple {
  if (!Array.isArray(value) || value.length < 3) return [...fallback] as Vec3Tuple;
  return [numberOr(value[0], fallback[0]), numberOr(value[1], fallback[1]), numberOr(value[2], fallback[2])];
}

function safeId(value: unknown, fallback: string) {
  const source = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return source.toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function optionalNumber(value: unknown, min: number, max: number) {
  return Number.isFinite(value) ? clampNumber(value, min, max, min) : undefined;
}

function optionalInteger(value: unknown, min: number, max: number) {
  return Number.isFinite(value) ? Math.round(clampNumber(value, min, max, min)) : undefined;
}

function clampFrame(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = numberOr(value, fallback);
  return Math.min(max, Math.max(min, number));
}

function numberOr(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
