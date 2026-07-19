import type {
  StoryAdventureMapRole,
  StoryAdventureTraversalPieceKind,
  StoryAdventureWorldId,
  StoryEnemyId,
  StoryRoomConnector,
  StoryRoomTemplateKind,
  StoryTraversalKind,
  StoryWorldAssetId,
  StoryWorldThemeId
} from './types';

export type StoryLevelBlueprintKind = 'surface' | 'chunk';
export type StoryLevelBeatKind = 'entrance' | 'observation' | 'traversal' | 'combat' | 'choice' | 'respite' | 'reward' | 'secret' | 'boss' | 'exit';
export type StoryLevelSlotKind = 'enemy-lane' | 'hazard' | 'traversal' | 'reward' | 'npc' | 'resource' | 'portal' | 'landmark' | 'prop';
export type StoryLevelAssetRole = 'structural' | 'hero' | 'traversal' | 'hazard' | 'framing' | 'foliage' | 'clutter' | 'background';
export type StoryLevelAssetLayer = 'background' | 'midground' | 'play-plane' | 'foreground';

export type StoryLevelDesignBrief = {
  emotion: string;
  primaryMechanic: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  pacing: Array<'low' | 'medium' | 'high' | 'release'>;
  heroLandmark: string;
  playerDecision: string;
  riskReward: string;
};

export type StoryLevelBeat = {
  id: string;
  kind: StoryLevelBeatKind;
  bounds: [number, number, number, number];
  intensity: 0 | 1 | 2 | 3 | 4 | 5;
  required?: boolean;
};

export type StoryLevelRoute = {
  id: string;
  beatIds: string[];
  critical: boolean;
  oneWay?: boolean;
  requiredCapabilities: StoryTraversalKind[];
};

export type StoryLevelGeometry = {
  id: string;
  kind: 'solid' | 'one-way';
  rect: [number, number, number, number];
  surfaceIntent: 'ground' | 'ledge' | 'wall' | 'ceiling';
};

export type StoryLevelGeometryV2 = StoryLevelGeometry | {
  id: string;
  kind: 'carve';
  rect: [number, number, number, number];
  surfaceIntent: 'air';
};

export type StoryLevelConnector = {
  id: string;
  edge: StoryRoomConnector;
  point: [number, number];
  clearance: [number, number];
  capabilities: StoryTraversalKind[];
  route: 'critical' | 'optional';
};

export type StoryLevelSlot = {
  id: string;
  kind: StoryLevelSlotKind;
  position: [number, number];
  bounds?: [number, number];
  beatId?: string;
  semanticTags: string[];
  route: 'critical' | 'optional' | 'ambient';
  enemyPool?: StoryEnemyId[];
  traversalKind?: StoryAdventureTraversalPieceKind;
};

export type StoryLevelVisualIntent = {
  paletteId: StoryWorldThemeId;
  structuralMaterial: string;
  heroRole: StoryLevelAssetRole;
  densityBudget: number;
  permittedAssetTags: string[];
  enclosureStyle: string;
  defaultCavityMaterial: 'background-rock' | 'interior';
  skyWindowRegions: Array<[number, number, number, number]>;
  landmarkFramingRegions: Array<[number, number, number, number]>;
  dressingClusterAnchors: Array<[number, number]>;
  permittedTerrainFamilies: string[];
  permittedPropFamilies: string[];
};

export type StoryLevelConstraints = {
  entryClearance: number;
  cameraHeight: number;
  maximumEncounterEnemies: number;
  mutation: { platformHeight: number; platformWidth: [number, number]; hazardOffset: number; propOffset: number };
  accessibilityProfiles: Array<'base' | 'swim' | 'climb' | 'break-wall' | 'glide' | 'mount'>;
};

export type StoryLevelBlueprintV1 = {
  version: 1;
  id: string;
  kind: StoryLevelBlueprintKind;
  biomeId?: Exclude<StoryAdventureWorldId, 'world-route'>;
  mapRole?: StoryAdventureMapRole;
  chunkRole?: StoryRoomTemplateKind;
  grid: 0.25;
  bounds: [number, number, number, number];
  brief: StoryLevelDesignBrief;
  beats: StoryLevelBeat[];
  routes: StoryLevelRoute[];
  geometry: StoryLevelGeometry[];
  connectors: StoryLevelConnector[];
  slots: StoryLevelSlot[];
  visual: StoryLevelVisualIntent;
  constraints: StoryLevelConstraints;
};

/** Solid-first enclosed level source. V1 remains readable for legacy content. */
export type StoryLevelBlueprintV2 = Omit<StoryLevelBlueprintV1, 'version' | 'geometry'> & {
  version: 2;
  terrain: { cellSize: 2; perimeterCells: 1 };
  geometry: StoryLevelGeometryV2[];
};

export type StoryLevelBlueprint = StoryLevelBlueprintV1 | StoryLevelBlueprintV2;

export type StoryLevelAssetDefinition = {
  id: string;
  asset: StoryWorldAssetId;
  biomes: Array<Exclude<StoryAdventureWorldId, 'world-route'> | 'universal'>;
  roles: StoryLevelAssetRole[];
  tags: string[];
  family: string;
  layers: StoryLevelAssetLayer[];
  pixelSize: [number, number];
  footprint: [number, number];
  anchor: [number, number];
  scaleRange: [number, number];
  mirrorable: boolean;
  occlusion: 'none' | 'low' | 'medium' | 'high';
  densityCost: number;
  repetitionLimit: number;
  sourcePack: string;
  license: string;
  frame?: [number, number, number, number];
  atlasSize?: [number, number];
  generated?: boolean;
  provenance?: string;
};

export type StoryLevelValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  witnessRoute: Array<[number, number]>;
  metrics: {
    criticalBeats: number;
    optionalBeats: number;
    maximumJumpRise: number;
    maximumJumpRun: number;
    assetSlotCount: number;
  };
};

export type StoryCompiledLevelMeta = {
  blueprintId: string;
  blueprintVersion: 1 | 2;
  generationVersion: number;
  seed: string;
  chunkIds: string[];
  witnessRoute: Array<[number, number]>;
  assetResolution: Array<{ slotId: string; assetId: string }>;
  topologySignature?: string;
  entranceTier?: 0 | 1 | 2;
  exitTier?: 0 | 1 | 2;
  witnessInputs?: Array<{ frames: number; durationSeconds?: number; horizontal: -1 | 0 | 1; jump?: boolean; down?: boolean }>;
};
