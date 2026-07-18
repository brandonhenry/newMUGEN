import type { StoryAdventureHazardKind } from './types';

export type StoryHazardSpriteDefinition = {
  path: string;
  atlasSize: [number, number];
  frameSize: [number, number];
  frameCount: number;
  frameDurationMs: number;
  worldHeight: number;
};

export const STORY_HAZARD_SPRITES = {
  spikes: { path: '/story/hazards/generated/thorn-spikes-sheet.png', atlasSize: [1772, 648], frameSize: [443, 324], frameCount: 8, frameDurationMs: 135, worldHeight: 1.7 },
  saw: { path: '/story/hazards/generated/saw-trap-sheet.png', atlasSize: [1536, 742], frameSize: [384, 371], frameCount: 8, frameDurationMs: 85, worldHeight: 2.25 },
  'collapsing-floor': { path: '/story/hazards/generated/collapsing-floor-sheet.png', atlasSize: [1536, 644], frameSize: [384, 322], frameCount: 8, frameDurationMs: 120, worldHeight: 1.2 },
  lava: { path: '/story/hazards/generated/lava-pool-sheet.png', atlasSize: [1536, 718], frameSize: [384, 359], frameCount: 8, frameDurationMs: 115, worldHeight: 1.35 },
  icicle: { path: '/story/hazards/generated/ice-spikes-sheet.png', atlasSize: [1536, 742], frameSize: [384, 371], frameCount: 8, frameDurationMs: 130, worldHeight: 2.15 }
} as const satisfies Partial<Record<StoryAdventureHazardKind, StoryHazardSpriteDefinition>>;

export function storyHazardDealsContactDamage(kind: StoryAdventureHazardKind) {
  return Object.prototype.hasOwnProperty.call(STORY_HAZARD_SPRITES, kind);
}
