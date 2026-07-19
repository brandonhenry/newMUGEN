import { storyTerrainFrame, storyTerrainFrameForRole } from './terrainGrammar';
import type { StoryHubDefinition, StoryPlatformDefinition, StorySurfaceMaterial } from './types';

export type StorySurfaceContact = {
  material: StorySurfaceMaterial;
  platformId: string | null;
  tileId: string | null;
  source: 'water' | 'tile' | 'platform' | 'terrain-kit' | 'environment' | 'fallback';
};

function platformForContact(hub: StoryHubDefinition, platformId: string | null, x: number, feetY: number) {
  const direct = platformId ? hub.platforms.find((platform) => platform.id === platformId) : undefined;
  if (direct) return direct;
  return hub.platforms
    .filter((platform) => x >= platform.position[0] - platform.size[0] / 2 && x <= platform.position[0] + platform.size[0] / 2)
    .sort((left, right) => Math.abs(feetY - (left.position[1] + left.size[1] / 2)) - Math.abs(feetY - (right.position[1] + right.size[1] / 2)))[0];
}

function terrainTileAt(hub: StoryHubDefinition, x: number, feetY: number) {
  return (hub.terrainTiles ?? [])
    .filter((tile) => {
      const left = tile.position[0] - tile.size[0] / 2;
      const right = tile.position[0] + tile.size[0] / 2;
      const containsX = x >= left && (x < right || Math.abs(x - hub.bounds.maxX) < 1e-6 && x <= right);
      return containsX && Math.abs(feetY - (tile.position[1] + tile.size[1] / 2)) <= 0.55;
    })
    .sort((left, right) => Math.abs(feetY - (left.position[1] + left.size[1] / 2)) - Math.abs(feetY - (right.position[1] + right.size[1] / 2)))[0];
}

function environmentMaterial(platform: StoryPlatformDefinition | undefined, hub: StoryHubDefinition) {
  const surface = hub.environment?.surface;
  if (!surface) return undefined;
  const variants = surface.variants;
  const variant = variants?.length ? variants[Math.abs(platform?.surfaceVariant ?? 0) % variants.length] : undefined;
  return variant?.surfaceMaterial ?? surface.surfaceMaterial;
}

/** Resolves movement audio from the exact rendered terrain frame under the avatar center. */
export function resolveStorySurfaceContact(input: {
  hub: StoryHubDefinition;
  x: number;
  feetY: number;
  groundedPlatformId: string | null;
  fallbackMaterial: StorySurfaceMaterial;
  underwater?: boolean;
}): StorySurfaceContact {
  if (input.underwater) return { material: 'water', platformId: null, tileId: null, source: 'water' };
  const platform = platformForContact(input.hub, input.groundedPlatformId, input.x, input.feetY);
  if (platform?.surfaceMaterial) return { material: platform.surfaceMaterial, platformId: platform.id, tileId: null, source: 'platform' };
  const tile = terrainTileAt(input.hub, input.x, input.feetY);
  const tileMaterial = tile?.surfaceMaterial ?? storyTerrainFrame(tile?.kitId, tile?.frameId)?.frame.surfaceMaterial;
  if (tile && tileMaterial) return { material: tileMaterial, platformId: platform?.id ?? input.groundedPlatformId, tileId: tile.id, source: 'tile' };
  const kitMaterial = storyTerrainFrameForRole(input.hub.terrainKitId, 'top', platform?.surfaceVariant ?? 0)?.frame.surfaceMaterial;
  if (kitMaterial) return { material: kitMaterial, platformId: platform?.id ?? input.groundedPlatformId, tileId: null, source: 'terrain-kit' };
  const authoredMaterial = environmentMaterial(platform, input.hub);
  if (authoredMaterial) return { material: authoredMaterial, platformId: platform?.id ?? input.groundedPlatformId, tileId: null, source: 'environment' };
  return { material: input.fallbackMaterial, platformId: platform?.id ?? input.groundedPlatformId, tileId: null, source: 'fallback' };
}
