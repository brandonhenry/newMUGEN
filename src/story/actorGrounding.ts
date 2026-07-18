import { STORY_SPRITE_MANIFEST } from './streetAvatarCatalog';

export const STORY_GROUNDED_ACTOR_CENTER_Y = 0.82;
export const STORY_AVATAR_MESH_CENTER_Y = 0.63;

const STORY_AVATAR_REFERENCE_HEIGHT = 176;
const STORY_AVATAR_REFERENCE_WORLD_HEIGHT = 3.2;

export function storyAvatarPlaneHeight(): number {
  return STORY_AVATAR_REFERENCE_WORLD_HEIGHT * STORY_SPRITE_MANIFEST.frameSize.height / STORY_AVATAR_REFERENCE_HEIGHT;
}

export function storyAvatarMeshCenterYForVisualScale(visualScale = 1): number {
  const scale = Math.max(0.01, visualScale);
  const frameHeight = STORY_SPRITE_MANIFEST.frameSize.height;
  const planeHeight = storyAvatarPlaneHeight();
  const baselineFromBottom = (frameHeight - STORY_SPRITE_MANIFEST.frameSize.baseline) / frameHeight * planeHeight;
  return STORY_AVATAR_MESH_CENTER_Y + (scale - 1) * (planeHeight / 2 - baselineFromBottom);
}

export function storyAvatarVisibleFootFromRigOrigin(): number {
  const frameHeight = STORY_SPRITE_MANIFEST.frameSize.height;
  const planeHeight = storyAvatarPlaneHeight();
  const baselineFromBottom = (frameHeight - STORY_SPRITE_MANIFEST.frameSize.baseline) / frameHeight * planeHeight;
  return STORY_AVATAR_MESH_CENTER_Y - planeHeight / 2 + baselineFromBottom;
}

export function storyAvatarGroundingOffsetY(bodyCenterY = STORY_GROUNDED_ACTOR_CENTER_Y, targetFootY = 0): number {
  return targetFootY - bodyCenterY - storyAvatarVisibleFootFromRigOrigin();
}

export const STORY_AVATAR_GROUNDING_OFFSET_Y = storyAvatarGroundingOffsetY();
export const STORY_CENTRAL_AVATAR_GROUNDING_OFFSET_Y = STORY_AVATAR_GROUNDING_OFFSET_Y;

export function storyAvatarGroundingOffsetForWorld(): number {
  return STORY_AVATAR_GROUNDING_OFFSET_Y;
}

export function storyAvatarVisibleFootWorldY(bodyCenterY: number, groundingOffsetY = STORY_AVATAR_GROUNDING_OFFSET_Y): number {
  return bodyCenterY + groundingOffsetY + storyAvatarVisibleFootFromRigOrigin();
}

export function storyGroundAnchoredPlaneCenterY(planeHeight: number, footAnchorFromBottom = 0): number {
  return planeHeight / 2 - STORY_GROUNDED_ACTOR_CENTER_Y - planeHeight * footAnchorFromBottom;
}

export function storyScaledGroundAnchorOffsetY(scale: number): number {
  return (Math.max(0.01, scale) - 1) * STORY_GROUNDED_ACTOR_CENTER_Y;
}
