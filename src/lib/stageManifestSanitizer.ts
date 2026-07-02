export function sanitizeStageManifest(stage: Record<string, unknown>, stageId: string) {
  const colors = {
    floor: typeof stage.floor === 'string' ? stage.floor : '#07182c',
    rail: typeof stage.rail === 'string' ? stage.rail : '#2ee6ff',
    light: typeof stage.light === 'string' ? stage.light : '#dbe8ff'
  };
  return {
    ...stage,
    id: stageId,
    name: typeof stage.name === 'string' && stage.name.trim() ? stage.name.trim() : stageId,
    subtitle: typeof stage.subtitle === 'string' ? stage.subtitle : 'Sprite-cutout arena',
    renderMode: sanitizeStageRenderMode(stage.renderMode),
    hidden: Boolean(stage.hidden),
    floor: colors.floor,
    floorAssetId: typeof stage.floorAssetId === 'string' ? stage.floorAssetId : undefined,
    floorTexturePath: typeof stage.floorTexturePath === 'string' ? stage.floorTexturePath : undefined,
    floorTextureRepeat: Array.isArray(stage.floorTextureRepeat)
      ? [finiteOr(stage.floorTextureRepeat[0], 24), finiteOr(stage.floorTextureRepeat[1], 24)]
      : undefined,
    floorSounds: sanitizeFloorSounds(stage.floorSounds),
    floorEffects: sanitizeFloorEffects(stage.floorEffects),
    rail: colors.rail,
    light: colors.light,
    skyboxAssetId: typeof stage.skyboxAssetId === 'string' ? stage.skyboxAssetId : undefined,
    skyboxPath: typeof stage.skyboxPath === 'string' ? stage.skyboxPath : undefined,
    sourcePath: typeof stage.sourcePath === 'string' ? stage.sourcePath : `/stages/${stageId}/source.png`,
    thumbnailPath: typeof stage.thumbnailPath === 'string' ? stage.thumbnailPath : undefined,
    world: sanitizeStageWorld(stage.world),
    camera: stage.camera && typeof stage.camera === 'object' ? stage.camera : undefined,
    lighting: stage.lighting && typeof stage.lighting === 'object' ? stage.lighting : undefined,
    type: stage.type === 'model-stage' ? 'model-stage' : undefined,
    fightPlane: sanitizeFightPlane(stage.fightPlane),
    spawns: sanitizeSpawns(stage.spawns),
    collision: sanitizeCollision(stage.collision),
    playableBounds: sanitizePlayableBounds(stage.playableBounds),
    model: sanitizeStageModel(stage.model),
    backgroundLayers: sanitizeStageLayers(stage.backgroundLayers),
    props: sanitizeStageProps(stage.props)
  };
}

function sanitizeStageRenderMode(value: unknown) {
  return value === 'spriteCutout' || value === 'model' ? value : 'procedural';
}

function sanitizeStageModel(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const model = value as Record<string, unknown>;
  const path = typeof model.path === 'string' && model.path.trim()
    ? model.path
    : typeof model.url === 'string' && model.url.trim()
      ? model.url
      : '';
  if (!path) return undefined;
  const bounds = model.bounds && typeof model.bounds === 'object' ? model.bounds as Record<string, unknown> : undefined;
  return {
    path,
    url: typeof model.url === 'string' && model.url.trim() ? model.url : path,
    format: model.format === 'gltf' || model.format === 'fbx' ? model.format : 'glb',
    position: normalizeVec3(model.position, [0, 0, 0]),
    scale: normalizeVec3(model.scale, [1, 1, 1]),
    rotation: normalizeVec3(model.rotation, [0, 0, 0]),
    focus: normalizeVec3(model.focus, [0, 0.8, 0]),
    bounds: bounds
      ? {
          center: normalizeVec3(bounds.center, [0, 0, 0]),
          size: normalizeVec3(bounds.size, [1, 1, 1]),
          radius: Math.max(0, finiteOr(bounds.radius, 0))
        }
      : undefined,
    castShadow: model.castShadow !== false,
    receiveShadow: model.receiveShadow !== false,
    decorativeProps: sanitizeStageProps(model.decorativeProps)
  };
}

function sanitizeFightPlane(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  return {
    center: normalizeVec3(source.center, [0, 0, 0]),
    width: Math.max(4, finiteOr(source.width, 24)),
    depth: Math.max(4, finiteOr(source.depth, 16)),
    y: finiteOr(source.y, 0),
    rotationY: finiteOr(source.rotationY, 0)
  };
}

function sanitizeSpawns(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  return {
    p1: normalizeVec3(source.p1, [-2.2, 0, 0]),
    p2: normalizeVec3(source.p2, [2.2, 0, 0])
  };
}

function sanitizeCollision(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const mode = (value as Record<string, unknown>).mode;
  return { mode: mode === 'mesh' || mode === 'none' ? mode : 'box' };
}

function sanitizePlayableBounds(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  return {
    shape: source.shape === 'ellipse' ? 'ellipse' : 'box',
    width: clamp(finiteOr(source.width, 24), 4, 220),
    depth: clamp(finiteOr(source.depth, 16), 4, 220)
  };
}

function sanitizeStageWorld(value: unknown) {
  const world = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    width: Math.max(12, finiteOr(world.width, 96)),
    depth: Math.max(8, finiteOr(world.depth, 42)),
    floorY: finiteOr(world.floorY, -0.045),
    backgroundColor: typeof world.backgroundColor === 'string' ? world.backgroundColor : '#101114'
  };
}

function sanitizeStageLayers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((layer) => layer && typeof layer === 'object')
    .map((raw, index) => {
      const layer = raw as Record<string, unknown>;
      return {
        id: typeof layer.id === 'string' ? layer.id : `layer-${index}`,
        imagePath: typeof layer.imagePath === 'string' ? layer.imagePath : '',
        position: normalizeVec3(layer.position, [0, 3, -12]),
        scale: normalizeVec3(layer.scale, [12, 8, 1]),
        rotation: normalizeVec3(layer.rotation, [0, 0, 0]),
        opacity: Math.max(0, Math.min(1, finiteOr(layer.opacity, 1))),
        followCamera: Boolean(layer.followCamera),
        parallax: normalizeVec2(layer.parallax, [1, 1]),
        tile: normalizeVec2(layer.tile, [0, 0]),
        tileSpacing: normalizeVec2(layer.tileSpacing, [0, 0]),
        sourceSprite: normalizeOptionalVec2(layer.sourceSprite)
      };
    })
    .filter((layer) => layer.imagePath);
}

function sanitizeStageProps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((prop) => prop && typeof prop === 'object')
    .map((raw, index) => {
      const prop = raw as Record<string, unknown>;
      return {
        id: typeof prop.id === 'string' ? prop.id : `prop-${index}`,
        name: typeof prop.name === 'string' ? prop.name : `Prop ${index + 1}`,
        imagePath: typeof prop.imagePath === 'string' ? prop.imagePath : '',
        position: normalizeVec3(prop.position, [0, 1, 0]),
        scale: normalizeVec3(prop.scale, [1, 1, 1]),
        rotation: normalizeVec3(prop.rotation, [0, 0, 0]),
        opacity: Math.max(0, Math.min(1, finiteOr(prop.opacity, 1))),
        billboard: Boolean(prop.billboard),
        renderMode: prop.renderMode === 'voxel' ? 'voxel' : 'plane',
        voxelDepth: Math.max(0.04, Math.min(0.8, finiteOr(prop.voxelDepth, 0.16))),
        voxelScale: Math.max(2, Math.min(12, Math.round(finiteOr(prop.voxelScale, 4)))),
        hidden: Boolean(prop.hidden),
        locked: Boolean(prop.locked)
      };
    })
    .filter((prop) => prop.imagePath);
}

function sanitizeFloorSounds(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const sounds: Record<string, string> = {};
  ['run', 'jump', 'land', 'sprint'].forEach((key) => {
    if (typeof source[key] === 'string' && source[key]) sounds[key] = source[key];
  });
  return Object.keys(sounds).length ? sounds : undefined;
}

function sanitizeFloorEffects(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const effects: Record<string, unknown> = {};
  if (source.grass && typeof source.grass === 'object') effects.grass = source.grass;
  [
    'dust',
    'footsteps',
    'impact',
    'petals',
    'snow',
    'rain',
    'rainPuddles',
    'ripples',
    'energy',
    'fog',
    'heat',
    'glowTrails',
    'windStreaks',
    'cherryBurst',
    'tileShimmer',
    'debris'
  ].forEach((key) => {
    if (source[key] && typeof source[key] === 'object') effects[key] = source[key];
  });
  return Object.keys(effects).length ? effects : undefined;
}

function normalizeVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    finiteOr(value[0], fallback[0]),
    finiteOr(value[1], fallback[1]),
    finiteOr(value[2], fallback[2])
  ];
}

function normalizeVec2(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  return [finiteOr(value[0], fallback[0]), finiteOr(value[1], fallback[1])];
}

function normalizeOptionalVec2(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  return [finiteOr(value[0], 0), finiteOr(value[1], 0)];
}

function finiteOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
