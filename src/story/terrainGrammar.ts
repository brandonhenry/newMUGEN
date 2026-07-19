import terrainManifestJson from './storyTerrainKitManifest.json';
import type {
  StoryAdventureWorldId,
  StoryCavityTileDefinition,
  StoryTerrainTileDefinition,
  StoryTerrainTileRole,
  StorySurfaceMaterial,
  StoryWorldAssetId,
  StoryWorldThemeId
} from './types';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;
export type StoryTerrainKitRole = StoryTerrainTileRole | 'background-rock' | 'sky-window-edge' | 'secret-overlay' | 'damage-overlay';

export type StoryTerrainKitFrameDefinition = {
  id: string;
  role: StoryTerrainKitRole;
  variant: number;
  frame: [number, number, number, number];
  alphaBounds: [number, number, number, number];
  anchor: [number, number];
  compatibleSurfaces: string[];
  rotations: Array<0 | 90 | 180 | 270>;
  mirroring: boolean;
  sourcePack: string;
  license: string;
  sourceUrl: string;
  sourceFile: string;
  sourceHash: string;
  sourceCell: [number, number];
  sourceFrame: [number, number, number, number];
  sourceSemantic: string;
  mappingTreatment: string;
  generatedStatus: 'deterministic-source-derived' | 'generated' | 'imported';
  generationMethod: string;
  promptProvenance: string | null;
  referenceInputs?: string[];
  reviewStatus: string;
  surfaceClass: 'walkable-cap' | 'neutral-solid' | 'cavity' | 'overlay';
  surfaceMaterial: StorySurfaceMaterial;
};

export type StoryTerrainKitDefinition = {
  id: string;
  theme: StoryWorldThemeId;
  biome: BiomeId;
  primaryFamily: string;
  visualSetId: string;
  enclosureStyle: string;
  tilePixels: 32;
  runtimeScale: 2;
  asset: StoryWorldAssetId;
  atlasSize: [number, number];
  atlasHash: string;
  contactSheet: StoryWorldAssetId;
  sourceAsset: StoryWorldAssetId;
  sourceAssetHash: string;
  frames: StoryTerrainKitFrameDefinition[];
};

type TerrainManifest = { version: 4; tilePixels: 32; runtimeScale: 2; roles: StoryTerrainKitRole[]; sourceMapping: StoryWorldAssetId; kits: StoryTerrainKitDefinition[] };
const terrainManifest = terrainManifestJson as unknown as TerrainManifest;

export const STORY_BIOME_TERRAIN_THEME: Record<BiomeId, StoryWorldThemeId> = {
  greenhollow: 'village', thornwood: 'forest', ironroot: 'mine', bonevault: 'crypt',
  emberdeep: 'underworld', frostpeak: 'snow', sunscar: 'desert', skyglass: 'ruins'
};

export const STORY_TERRAIN_KITS_BY_ID = Object.fromEntries(terrainManifest.kits.map((kit) => [kit.id, kit])) as Record<string, StoryTerrainKitDefinition>;
export const STORY_TERRAIN_KITS_BY_VISUAL_SET = Object.fromEntries(terrainManifest.kits.map((kit) => [kit.visualSetId, kit])) as Record<string, StoryTerrainKitDefinition>;
export const STORY_TERRAIN_KITS = Object.fromEntries(terrainManifest.kits.filter((kit) => kit.visualSetId.endsWith('-primary')).map((kit) => [kit.theme, kit])) as Partial<Record<StoryWorldThemeId, StoryTerrainKitDefinition>>;

export function storyTerrainKit(theme: StoryWorldThemeId | undefined) {
  return theme ? STORY_TERRAIN_KITS[theme] : undefined;
}

export function storyTerrainKitForBiome(biome: BiomeId, visualSetId?: string) {
  const selected = visualSetId ? STORY_TERRAIN_KITS_BY_VISUAL_SET[visualSetId] : undefined;
  return selected?.biome === biome ? selected : storyTerrainKit(STORY_BIOME_TERRAIN_THEME[biome]);
}

export function storyTerrainFrame(kitId: string | undefined, frameId: string | undefined) {
  if (!kitId || !frameId) return undefined;
  const kit = terrainManifest.kits.find((candidate) => candidate.id === kitId);
  const frame = kit?.frames.find((candidate) => candidate.id === frameId);
  return kit && frame ? { kit, frame } : undefined;
}

export function storyTerrainFrameForRole(kitId: string | undefined, role: StoryTerrainKitRole, variant: number) {
  const kit = kitId ? STORY_TERRAIN_KITS_BY_ID[kitId] : undefined;
  if (!kit) return undefined;
  const normalized = Math.abs(variant) % 3;
  const frame = kit.frames.find((candidate) => candidate.role === role && candidate.variant === normalized);
  return frame ? { kit, frame } : undefined;
}

export function resolveStoryTerrainVariant(_theme: StoryWorldThemeId | undefined, _role: StoryTerrainTileRole, authoredVariant: number) {
  return Math.abs(authoredVariant) % 3;
}

function frameForKit(kit: StoryTerrainKitDefinition | undefined, role: StoryTerrainKitRole, variant: number) {
  if (!kit) throw new Error('Missing terrain kit');
  const normalized = Math.abs(variant) % 3;
  const frame = kit.frames.find((candidate) => candidate.role === role && candidate.variant === normalized);
  if (!frame) throw new Error(`Missing terrain frame ${kit.id}:${role}:${normalized}`);
  if (!frame.rotations.includes(0) || frame.mirroring) throw new Error(`Terrain frame requires an unapproved transform ${frame.id}`);
  return { kit, frame };
}

function frameFor(theme: StoryWorldThemeId, role: StoryTerrainKitRole, variant: number) {
  return frameForKit(STORY_TERRAIN_KITS[theme], role, variant);
}

export function resolveStoryTerrainTile(theme: StoryWorldThemeId, tile: StoryTerrainTileDefinition): StoryTerrainTileDefinition {
  const { kit, frame } = frameFor(theme, tile.role, tile.surfaceVariant);
  return {
    ...tile,
    kitId: kit.id,
    frameId: frame.id,
    surfaceMaterial: frame.surfaceMaterial,
    visualLayer: tile.role === 'fill' ? 'solid-fill' : 'exposed-face'
  };
}

export function resolveStoryTerrainTileForKit(kit: StoryTerrainKitDefinition, tile: StoryTerrainTileDefinition): StoryTerrainTileDefinition {
  const resolved = frameForKit(kit, tile.role, tile.surfaceVariant);
  return { ...tile, kitId: resolved.kit.id, frameId: resolved.frame.id, surfaceMaterial: resolved.frame.surfaceMaterial, visualLayer: tile.role === 'fill' ? 'solid-fill' : 'exposed-face' };
}

export function resolveStoryCavityTile(theme: StoryWorldThemeId, tile: StoryCavityTileDefinition): StoryCavityTileDefinition {
  const { kit, frame } = frameFor(theme, tile.material, tile.surfaceVariant);
  return { ...tile, kitId: kit.id, frameId: frame.id };
}

export function resolveStoryCavityTileForKit(kit: StoryTerrainKitDefinition, tile: StoryCavityTileDefinition): StoryCavityTileDefinition {
  const resolved = frameForKit(kit, tile.material, tile.surfaceVariant);
  return { ...tile, kitId: resolved.kit.id, frameId: resolved.frame.id };
}

export function storyTerrainGrammarCoverageErrors() {
  const errors: string[] = [];
  const requiredRoles = terrainManifest.roles;
  for (const kit of terrainManifest.kits) {
    const theme = kit.theme;
    if (!kit.biome || !kit.visualSetId || kit.tilePixels !== 32 || kit.runtimeScale !== 2) errors.push(`terrain-kit-contract:${kit.id}`);
    if (!kit.sourceAsset || !kit.sourceAssetHash) errors.push(`terrain-source-contract:${kit.id}`);
    for (const role of requiredRoles) for (let variant = 0; variant < 3; variant += 1) {
      const frame = kit.frames.find((candidate) => candidate.role === role && candidate.variant === variant);
      if (!frame) { errors.push(`terrain-role:${theme}:${role}:${variant}`); continue; }
      const [x, y, width, height] = frame.frame;
      if (width !== 32 || height !== 32 || x < 0 || y < 0 || x + width > kit.atlasSize[0] || y + height > kit.atlasSize[1]) errors.push(`terrain-frame-bounds:${frame.id}`);
      if (!frame.rotations.includes(0) || frame.mirroring) errors.push(`terrain-transform:${frame.id}`);
      if (!frame.sourceFile || !frame.sourceHash || !frame.license || frame.reviewStatus.length === 0) errors.push(`terrain-provenance:${frame.id}`);
      const [sourceColumn, sourceRow] = frame.sourceCell;
      const [sourceX, sourceY, sourceWidth, sourceHeight] = frame.sourceFrame;
      if (sourceWidth !== sourceHeight || ![16, 32].includes(sourceWidth) || sourceX !== sourceColumn * sourceWidth || sourceY !== sourceRow * sourceHeight || !frame.sourceSemantic || !frame.mappingTreatment) errors.push(`terrain-source-map:${frame.id}`);
      if (frame.generatedStatus !== 'deterministic-source-derived' || frame.promptProvenance !== null) errors.push(`terrain-source-provenance:${frame.id}`);
      if (!frame.surfaceMaterial) errors.push(`terrain-surface-material:${frame.id}`);
      if (frame.alphaBounds.some((value, index) => value !== [0, 0, 32, 32][index])) errors.push(`terrain-frame-transparency:${frame.id}`);
    }
  }
  return errors;
}
