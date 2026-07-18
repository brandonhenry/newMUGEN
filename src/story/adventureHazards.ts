import type { StoryAdventureHazardKind, StoryHazardDefinition } from './types';

export const STORY_HAZARD_ENTRY_CLEARANCE = 8;

export type StoryHazardSpriteDefinition = {
  path: string;
  atlasSize: [number, number];
  frameSize: [number, number];
  displayFrame: number;
  worldHeight: number;
};

export const STORY_HAZARD_SPRITES = {
  spikes: { path: '/story/hazards/generated/thorn-spikes-sheet.png', atlasSize: [1772, 648], frameSize: [443, 324], displayFrame: 0, worldHeight: 1.7 },
  saw: { path: '/story/hazards/generated/saw-trap-sheet.png', atlasSize: [1536, 742], frameSize: [384, 371], displayFrame: 0, worldHeight: 2.25 },
  'collapsing-floor': { path: '/story/hazards/generated/collapsing-floor-sheet.png', atlasSize: [1536, 644], frameSize: [384, 322], displayFrame: 0, worldHeight: 1.2 },
  lava: { path: '/story/hazards/generated/lava-pool-sheet.png', atlasSize: [1536, 718], frameSize: [384, 359], displayFrame: 0, worldHeight: 1.35 },
  icicle: { path: '/story/hazards/generated/ice-spikes-sheet.png', atlasSize: [1536, 742], frameSize: [384, 371], displayFrame: 0, worldHeight: 2.15 }
} as const satisfies Partial<Record<StoryAdventureHazardKind, StoryHazardSpriteDefinition>>;

export function storyHazardDealsContactDamage(kind: StoryAdventureHazardKind) {
  return Object.prototype.hasOwnProperty.call(STORY_HAZARD_SPRITES, kind);
}

export function storyHazardHasVisibleDamageSprite(hazard: StoryHazardDefinition) {
  if (hazard.damage <= 0) return true;
  const sprite = STORY_HAZARD_SPRITES[hazard.kind as keyof typeof STORY_HAZARD_SPRITES];
  return Boolean(sprite?.path.toLowerCase().endsWith('.png'));
}

export function storyHazardIsClearOfEntry(hazard: StoryHazardDefinition, entryX: number, entryHalfWidth = 0, clearance = STORY_HAZARD_ENTRY_CLEARANCE) {
  const entryMinX = entryX - Math.max(0, entryHalfWidth);
  const entryMaxX = entryX + Math.max(0, entryHalfWidth);
  const [hazardMinX, hazardMaxX] = hazard.bounds;
  if (hazardMaxX < entryMinX) return entryMinX - hazardMaxX >= clearance;
  if (hazardMinX > entryMaxX) return hazardMinX - entryMaxX >= clearance;
  return false;
}

export function storyHazardContactDamageReady(nowMs: number, contactStartedAtMs: number, telegraphMs: number, cooldownUntilMs = 0) {
  const warningDuration = Math.max(0, Number.isFinite(telegraphMs) ? telegraphMs : 0);
  return nowMs >= contactStartedAtMs + warningDuration && nowMs >= cooldownUntilMs;
}
