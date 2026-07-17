import manifestJson from './storyStreetAvatarManifest.json';
import type { StoryAvatarSet, StorySpriteAnimation, StorySpriteManifest, StorySpriteSetDefinition } from './types';

export const STORY_SPRITE_MANIFEST = manifestJson as unknown as StorySpriteManifest;
export const STORY_SPRITE_SETS = STORY_SPRITE_MANIFEST.sets;

export function getStorySpriteSet(setId: StoryAvatarSet): StorySpriteSetDefinition {
  return STORY_SPRITE_SETS.find((set) => set.id === setId)
    ?? STORY_SPRITE_SETS.find((set) => set.id === STORY_SPRITE_MANIFEST.defaultSet)!;
}

export function getStorySpriteAnimation(setId: StoryAvatarSet, animationId: string): StorySpriteAnimation {
  const set = getStorySpriteSet(setId);
  return set.animations.find((animation) => animation.id === animationId)
    ?? set.animations.find((animation) => animation.id === 'idle')!;
}

export function validateStorySpriteManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['manifest must be an object'];
  const manifest = value as Partial<StorySpriteManifest>;
  if (manifest.version !== 2) errors.push('manifest version must be 2');
  if (manifest.avatarStyle !== 'kore-street-v1') errors.push('avatar style must be kore-street-v1');
  if (manifest.defaultSet !== 'street-shadow') errors.push('default set must be street-shadow');
  if (manifest.frameCount !== 520) errors.push('the authored set union must contain 520 unique frames');
  if (manifest.facing !== 'right') errors.push('canonical frames must face right');
  if (manifest.frameSize?.width !== 224 || manifest.frameSize?.height !== 192 || manifest.frameSize?.baseline !== 182) {
    errors.push('all frames must share the 224x192 canvas and baseline 182');
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
        const [left, top, right, bottom] = frame.contentBounds;
        if (left < 0 || top < 0 || right > 224 || bottom > 192 || left >= right || top >= bottom) errors.push(`${set.id}/${frame.id} has invalid bounds`);
      }
    }
    for (const required of ['idle', 'walk', 'sprint', 'jump', 'attack']) {
      if (!animationIds.has(required)) errors.push(`${set.id} is missing ${required} animation`);
    }
    if (uniquePaths.size !== set.frameCount) errors.push(`${set.id} frame count does not match its unique assets`);
    totalFrameCount += set.frameCount;
  }
  for (const expected of expectedSets) if (!setIds.has(expected)) errors.push(`missing avatar set: ${expected}`);
  if (totalFrameCount !== manifest.frameCount) errors.push('total frame count does not match set contents');
  return errors;
}
