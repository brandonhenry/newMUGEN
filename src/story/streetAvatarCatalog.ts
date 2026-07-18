import manifestJson from './storyStreetAvatarManifest.json';
import type { StoryAttackAnimationId, StoryAttackInput, StoryAvatarSet, StoryHubAvatarPose, StorySpriteAnimation, StorySpriteManifest, StorySpriteProjectileDefinition, StorySpriteSetDefinition } from './types';

export const STORY_ATTACK_ANIMATION_IDS: Record<StoryAttackInput, StoryAttackAnimationId> = {
  jab: 'attack',
  heavy: 'attack-heavy',
  kick: 'attack-kick',
  special: 'attack-special'
};

export const STORY_ATTACK_POSES: Record<StoryAttackInput, Extract<StoryHubAvatarPose, `attack-${string}`>> = {
  jab: 'attack-jab',
  heavy: 'attack-heavy',
  kick: 'attack-kick',
  special: 'attack-special'
};

export function storyAttackAnimationId(input: StoryAttackInput): StoryAttackAnimationId {
  return STORY_ATTACK_ANIMATION_IDS[input];
}

export const STORY_SPRITE_MANIFEST = manifestJson as unknown as StorySpriteManifest;
export const STORY_SPRITE_SETS = STORY_SPRITE_MANIFEST.sets;

export function getStorySpriteSet(setId: StoryAvatarSet): StorySpriteSetDefinition {
  return STORY_SPRITE_SETS.find((set) => set.id === setId)
    ?? STORY_SPRITE_SETS.find((set) => set.id === STORY_SPRITE_MANIFEST.defaultSet)!;
}

export function getStorySpriteProjectile(setId: StoryAvatarSet): StorySpriteProjectileDefinition | undefined {
  return getStorySpriteSet(setId).projectile;
}

export function getStorySpriteAnimation(setId: StoryAvatarSet, animationId: string): StorySpriteAnimation {
  const set = getStorySpriteSet(setId);
  return set.animations.find((animation) => animation.id === animationId)
    ?? set.animations.find((animation) => animation.id === 'idle')!;
}

export function getStorySpriteAnimationDurationMs(setId: StoryAvatarSet, animationId: string): number {
  return getStorySpriteAnimation(setId, animationId).frames.reduce((total, frame) => total + frame.durationMs, 0);
}

export function validateStorySpriteManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['manifest must be an object'];
  const manifest = value as Partial<StorySpriteManifest>;
  if (manifest.version !== 3) errors.push('manifest version must be 3');
  if (manifest.avatarStyle !== 'kore-street-v1') errors.push('avatar style must be kore-street-v1');
  if (manifest.defaultSet !== 'street-shadow') errors.push('default set must be street-shadow');
  if (manifest.frameCount !== 855) errors.push('the authored set union must contain 855 unique frames');
  if (manifest.facing !== 'right') errors.push('canonical frames must face right');
  if (manifest.frameSize?.width !== 320 || manifest.frameSize?.height !== 192 || manifest.frameSize?.baseline !== 182) {
    errors.push('all frames must share the 320x192 canvas and baseline 182');
  }
  const expectedSets = new Set<StoryAvatarSet>([
    'solar-runner', 'street-shadow', 'crimson-ranger', 'rose-blade',
    'neon-courier', 'ember-scout', 'synth-drifter', 'forest-warden',
    'solar-brawler', 'void-operative', 'circuit-mage', 'street-medic',
    'arena-rebel', 'tech-nomad'
  ]);
  const setIds = new Set<string>();
  let totalFrameCount = 0;
  for (const set of manifest.sets ?? []) {
    if (!set.id || setIds.has(set.id)) errors.push(`duplicate or empty set id: ${set.id || '(empty)'}`);
    setIds.add(set.id);
    if (!expectedSets.has(set.id)) errors.push(`unknown avatar set: ${set.id}`);
    if (!set.source?.sha256 || !set.source?.originalFile) errors.push(`${set.id} is missing source provenance`);
    if (!set.attackSource?.sha256 || set.attackSource?.originalFile !== 'attacks-v2-source.png') errors.push(`${set.id} is missing supplemental attack provenance`);
    if (set.projectile) {
      const projectile = set.projectile;
      if (projectile.id !== 'special') errors.push(`${set.id} has an invalid projectile move`);
      if (!projectile.source?.sha256 || projectile.source.originalFile !== 'projectile-special-source.png') errors.push(`${set.id} is missing projectile provenance`);
      if (projectile.frameSize.width !== 192 || projectile.frameSize.height !== 96) errors.push(`${set.id} has an invalid projectile frame size`);
      if (projectile.frames.length !== 6) errors.push(`${set.id} must have six projectile frames`);
      if (projectile.releaseDelayMs < 0 || projectile.speed <= 0 || projectile.lifetimeMs <= 0) errors.push(`${set.id} has invalid projectile timing`);
      if (projectile.worldSize.some((value) => value <= 0) || projectile.hitboxSize.some((value) => value <= 0)) errors.push(`${set.id} has invalid projectile dimensions`);
      if (projectile.launchPoint.length !== 2
        || !projectile.launchPoint.every(Number.isFinite)
        || projectile.launchPoint[0] < 160 || projectile.launchPoint[0] > 320
        || projectile.launchPoint[1] < 0 || projectile.launchPoint[1] > 192) errors.push(`${set.id} has an invalid projectile launch point`);
      for (const frame of projectile.frames) {
        if (!frame.path.startsWith(`/story/avatars/kore-street-v1/sets/${set.id}/projectiles/special/`)) errors.push(`${set.id}/${frame.id} has an invalid projectile path`);
        if (frame.durationMs <= 0) errors.push(`${set.id}/${frame.id} has an invalid projectile duration`);
        const [left, top, right, bottom] = frame.contentBounds;
        if (left < 0 || top < 0 || right > 192 || bottom > 96 || left >= right || top >= bottom) errors.push(`${set.id}/${frame.id} has invalid projectile bounds`);
      }
    }
    const animationIds = new Set<string>();
    const uniquePaths = new Set<string>();
    for (const animation of set.animations ?? []) {
      if (!animation.id || animationIds.has(animation.id)) errors.push(`${set.id} has a duplicate or empty animation id: ${animation.id || '(empty)'}`);
      animationIds.add(animation.id);
      if (!animation.frames.length) errors.push(`${set.id}/${animation.id} has no frames`);
      for (const frame of animation.frames) {
        uniquePaths.add(frame.path);
        if (!frame.path.startsWith(`/story/avatars/kore-street-v1/sets/${set.id}/frames/`)) errors.push(`${set.id}/${frame.id} has an invalid path`);
        if (frame.durationMs <= 0) errors.push(`${set.id}/${frame.id} has an invalid duration`);
        if (!Number.isFinite(frame.bodyAnchorX) || frame.bodyAnchorX < 0 || frame.bodyAnchorX > 320) errors.push(`${set.id}/${frame.id} has an invalid body anchor`);
        if (animation.id.startsWith('attack') && frame.bodyAnchorX !== 160) errors.push(`${set.id}/${frame.id} must keep its attack body anchored at x=160`);
        if (animation.id.startsWith('attack') && (!Number.isFinite(frame.visualScale) || (frame.visualScale ?? 0) < 1 || (frame.visualScale ?? 0) > 2.5)) {
          errors.push(`${set.id}/${frame.id} has an invalid attack visual scale`);
        }
        const [left, top, right, bottom] = frame.contentBounds;
        if (left < 0 || top < 0 || right > 320 || bottom > 192 || left >= right || top >= bottom) errors.push(`${set.id}/${frame.id} has invalid bounds`);
      }
      if (animation.id.startsWith('attack')) {
        const range = animation.activeFrameRange;
        if (!range || range[0] < 0 || range[0] > range[1] || range[1] >= animation.frames.length) errors.push(`${set.id}/${animation.id} has an invalid active frame range`);
      }
    }
    for (const required of ['idle', 'walk', 'sprint', 'jump', 'attack', 'attack-heavy', 'attack-kick', 'attack-special']) {
      if (!animationIds.has(required)) errors.push(`${set.id} is missing ${required} animation`);
    }
    if (uniquePaths.size !== set.frameCount) errors.push(`${set.id} frame count does not match its unique assets`);
    totalFrameCount += set.frameCount;
  }
  for (const expected of expectedSets) if (!setIds.has(expected)) errors.push(`missing avatar set: ${expected}`);
  if (totalFrameCount !== manifest.frameCount) errors.push('total frame count does not match set contents');
  return errors;
}
