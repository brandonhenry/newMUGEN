import type { MugenStageLayerMetadata, StageDefinition, StagePropAssetDefinition, StagePropDefinition } from '../types';

export type MugenDefSection = {
  name: string;
  title: string;
  values: Record<string, string>;
  lines: string[];
};

export type ParsedMugenDef = {
  sections: MugenDefSection[];
  info: Record<string, string>;
  camera: Record<string, number>;
  playerInfo: Record<string, number>;
  stageInfo: Record<string, string>;
  music: Record<string, string>;
  bgDef: Record<string, string>;
  bgLayers: MugenStageLayerMetadata[];
  actions: Record<string, Array<{ sprite: [number, number]; offset: [number, number]; duration: number }>>;
};

export type MugenStageConversionOptions = {
  stageId: string;
  spritePathFor: (sprite: [number, number]) => string | undefined;
  spriteAssets?: MugenSpriteAsset[];
  sourceDef: string;
  sourceSff?: string;
  musicPath?: string;
  warnings?: string[];
};

export type MugenPropAssetConversionOptions = {
  packId: string;
  sourceName: string;
  spriteAssets: MugenSpriteAsset[];
};

export type MugenSpriteAsset = {
  sprite: [number, number];
  imagePath: string;
  width?: number;
  height?: number;
  axis?: [number, number];
  format?: number;
};

export function parseMugenDef(text: string): ParsedMugenDef {
  const sections: MugenDefSection[] = [];
  let current: MugenDefSection | null = null;

  text.replace(/\r\n?/g, '\n').split('\n').forEach((rawLine) => {
    const line = stripDefComment(rawLine).trim();
    if (!line) return;
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      const title = sectionMatch[1].trim();
      current = { name: title.toLowerCase(), title, values: {}, lines: [] };
      sections.push(current);
      return;
    }
    if (!current) return;
    current.lines.push(line);
    const equalsAt = line.indexOf('=');
    if (equalsAt === -1) return;
    const key = line.slice(0, equalsAt).trim().toLowerCase();
    const value = line.slice(equalsAt + 1).trim();
    if (key) current.values[key] = value;
  });

  const getValues = (name: string) => sections.find((section) => section.name === name)?.values ?? {};
  const actions: ParsedMugenDef['actions'] = {};
  sections
    .filter((section) => section.name.startsWith('begin action'))
    .forEach((section) => {
      const actionNo = section.title.match(/begin action\s+(-?\d+)/i)?.[1];
      if (!actionNo) return;
      actions[actionNo] = section.lines
        .map(parseMugenActionLine)
        .filter((frame): frame is NonNullable<ReturnType<typeof parseMugenActionLine>> => Boolean(frame));
    });

  return {
    sections,
    info: getValues('info'),
    camera: numberMap(getValues('camera')),
    playerInfo: numberMap(getValues('playerinfo')),
    stageInfo: getValues('stageinfo'),
    music: getValues('music'),
    bgDef: getValues('bgdef'),
    bgLayers: sections
      .filter((section) => section.name.startsWith('bg ') && !section.name.startsWith('bgdef'))
      .map((section, index) => parseBgLayer(section, index)),
    actions
  };
}

export function convertMugenDefToStage(parsed: ParsedMugenDef, options: MugenStageConversionOptions): StageDefinition {
  const displayName = unquote(parsed.info.displayname || parsed.info.name || options.stageId);
  const localcoord = parseNumberTuple(parsed.stageInfo.localcoord, [640, 480]);
  const zoffset = finiteNumber(Number(parsed.stageInfo.zoffset), localcoord[1] * 0.8);
  const worldWidth = mugenWorldWidth(parsed.camera, parsed.playerInfo, localcoord[0]);
  const warnings = [...(options.warnings ?? [])];
  const layerBySprite = new Map<string, MugenStageLayerMetadata>();
  parsed.bgLayers.forEach((layer) => {
    if (layer.sprite) layerBySprite.set(spriteKey(layer.sprite), layer);
  });
  const spriteAssets = options.spriteAssets?.length
    ? options.spriteAssets
    : referencedMugenSprites(parsed)
        .map((sprite) => {
          const imagePath = options.spritePathFor(sprite);
          return imagePath ? { sprite, imagePath } : null;
        })
        .filter((asset): asset is MugenSpriteAsset => Boolean(asset));
  const groundAsset = spriteAssets.find((asset) => isMugenFloorLayer(layerBySprite.get(spriteKey(asset.sprite))?.name ?? ''))
    ?? spriteAssets[spriteAssets.length - 1];
  const propAssets = spriteAssets.filter((asset) => spriteKey(asset.sprite) !== spriteKey(groundAsset?.sprite ?? [-1, -1]));

  parsed.bgLayers.forEach((layer) => {
    const sprite = layer.sprite;
    if (sprite && !spriteAssets.some((asset) => spriteKey(asset.sprite) === spriteKey(sprite))) {
      warnings.push(`Missing extracted sprite ${sprite[0]},${sprite[1]} for "${layer.name}".`);
    }
  });

  const props = propAssets.map((asset, index) => buildMugenSpriteProp(asset, index, parsed.bgLayers, layerBySprite));

  return {
    id: options.stageId,
    name: displayName,
    subtitle: 'Imported MUGEN sprite kit',
    renderMode: 'spriteCutout',
    hidden: true,
    music: options.musicPath ? { path: options.musicPath, title: displayName } : undefined,
    floor: '#3f8f4c',
    floorTexturePath: groundAsset?.imagePath,
    floorTextureRepeat: [Math.max(8, Math.round(worldWidth / 8)), 8],
    rail: '#f0d27b',
    light: '#e6f5d6',
    skyboxPath: '/stages/shared/default-skybox.png',
    sourcePath: `/stages/${options.stageId}/mugen/${options.sourceDef}`,
    thumbnailPath: spriteAssets[0]?.imagePath,
    world: {
      width: Math.max(64, worldWidth),
      depth: 42,
      floorY: -0.045,
      backgroundColor: '#8fcad4'
    },
    lighting: { ambient: '#e6f5d6', sky: '#fff3f6' },
    mugen: {
      sourceDef: options.sourceDef,
      sourceSff: options.sourceSff,
      localcoord,
      zoffset,
      camera: parsed.camera,
      playerInfo: parsed.playerInfo,
      bgm: parsed.music.bgmusic,
      layers: parsed.bgLayers,
      warnings
    },
    backgroundLayers: [],
    props
  };
}

export function convertMugenDefToPropAssets(parsed: ParsedMugenDef, options: MugenPropAssetConversionOptions): StagePropAssetDefinition[] {
  const layerBySprite = new Map<string, MugenStageLayerMetadata>();
  parsed.bgLayers.forEach((layer) => {
    if (layer.sprite) layerBySprite.set(spriteKey(layer.sprite), layer);
  });
  return options.spriteAssets.map((asset, index) => {
    const prop = buildMugenSpriteProp(asset, index, parsed.bgLayers, layerBySprite);
    return {
      id: `${options.packId}-${asset.sprite[0]}-${asset.sprite[1]}`,
      name: prop.name,
      imagePath: asset.imagePath,
      thumbnailPath: asset.imagePath,
      width: asset.width,
      height: asset.height,
      sourcePackId: options.packId,
      sourceName: options.sourceName,
      sourceKind: 'mugen',
      sourceSprite: asset.sprite,
      tags: ['mugen', options.packId],
      defaultScale: prop.scale,
      defaultRenderMode: prop.renderMode,
      defaultVoxelDepth: prop.voxelDepth,
      defaultVoxelScale: prop.voxelScale
    };
  });
}

export function referencedMugenSprites(parsed: ParsedMugenDef): Array<[number, number]> {
  const seen = new Set<string>();
  const sprites: Array<[number, number]> = [];
  const add = (sprite: [number, number]) => {
    const key = `${sprite[0]},${sprite[1]}`;
    if (seen.has(key)) return;
    seen.add(key);
    sprites.push(sprite);
  };
  parsed.bgLayers.forEach((layer) => {
    if (layer.sprite) add(layer.sprite);
    if (layer.action !== undefined) {
      parsed.actions[String(layer.action)]?.forEach((frame) => add(frame.sprite));
    }
  });
  return sprites;
}

export function slugifyMugenId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'mugen-stage';
}

function spriteKey(sprite: [number, number]) {
  return `${sprite[0]},${sprite[1]}`;
}

function buildMugenSpriteProp(
  asset: MugenSpriteAsset,
  index: number,
  layers: MugenStageLayerMetadata[],
  layerBySprite: Map<string, MugenStageLayerMetadata>
): StagePropDefinition {
  const layer = layerBySprite.get(spriteKey(asset.sprite));
  const widthPx = Math.max(1, asset.width ?? 256);
  const heightPx = Math.max(1, asset.height ?? 256);
  const aspect = widthPx / heightPx;
  const layerIndex = Math.max(0, layers.findIndex((entry) => entry.sprite && spriteKey(entry.sprite) === spriteKey(asset.sprite)));
  const width = Math.max(1.3, Math.min(14, widthPx / 82));
  const height = Math.max(0.8, Math.min(7.2, width / Math.max(0.2, aspect)));
  const row = Math.floor(index / 3);
  const column = index % 3;
  const wide = width > 7;
  const x = wide ? 0 : [-6.2, 0, 6.2][column];
  const z = Math.max(-16, Math.min(7, -13 + layerIndex * 2.7 + row * 1.4));
  return {
    id: `mugen-sprite-${asset.sprite[0]}-${asset.sprite[1]}`,
    name: layer?.name ?? `Sprite ${asset.sprite[0]},${asset.sprite[1]}`,
    imagePath: asset.imagePath,
    position: [x, height / 2 - 0.04, z],
    scale: [width, height, 1],
    rotation: [0, 0, 0],
    opacity: 1,
    billboard: false,
    renderMode: 'voxel',
    voxelDepth: wide ? 0.18 : 0.22,
    voxelScale: widthPx > 900 || heightPx > 360 ? 8 : 5,
    hidden: false,
    locked: false
  };
}

function parseBgLayer(section: MugenDefSection, index: number): MugenStageLayerMetadata {
  const values = section.values;
  return {
    id: slugifyMugenId(section.title || `layer-${index + 1}`),
    name: section.title.replace(/^bg\s+/i, '').trim() || `Layer ${index + 1}`,
    type: (values.type ?? 'normal').toLowerCase(),
    sprite: values.spriteno ? parseNumberTuple(values.spriteno, [0, 0]) : undefined,
    action: values.actionno === undefined ? undefined : Math.round(finiteNumber(Number(values.actionno), 0)),
    start: parseNumberTuple(values.start, [0, 0]),
    delta: parseNumberTuple(values.delta, [1, 1]),
    tile: parseNumberTuple(values.tile, [0, 0]),
    tileSpacing: parseNumberTuple(values.tilespacing, [0, 0]),
    mask: values.mask === '1',
    raw: { ...values }
  };
}

function parseMugenActionLine(line: string) {
  const parts = line.split(',').map((part) => part.trim());
  if (parts.length < 5) return null;
  const group = Number(parts[0]);
  const image = Number(parts[1]);
  if (!Number.isFinite(group) || !Number.isFinite(image)) return null;
  return {
    sprite: [group, image] as [number, number],
    offset: [finiteNumber(Number(parts[2]), 0), finiteNumber(Number(parts[3]), 0)] as [number, number],
    duration: Math.max(1, Math.round(finiteNumber(Number(parts[4]), 1)))
  };
}

function stripDefComment(line: string) {
  const semicolon = line.indexOf(';');
  return semicolon === -1 ? line : line.slice(0, semicolon);
}

function unquote(value: string) {
  return value.trim().replace(/^["']|["']$/g, '');
}

function parseNumberTuple(value: string | undefined, fallback: [number, number]): [number, number] {
  if (!value) return fallback;
  const [left, right] = value.split(',').map((part) => Number(part.trim()));
  return [finiteNumber(left, fallback[0]), finiteNumber(right, fallback[1])];
}

function numberMap(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, Number(value)])
      .filter((entry): entry is [string, number] => Number.isFinite(entry[1]))
  );
}

function mugenWorldWidth(camera: Record<string, number>, playerInfo: Record<string, number>, localWidth: number) {
  const left = finiteNumber(playerInfo.leftbound, finiteNumber(camera.boundleft, -localWidth));
  const right = finiteNumber(playerInfo.rightbound, finiteNumber(camera.boundright, localWidth));
  return Math.max(64, Math.abs(right - left) / Math.max(18, localWidth / 34));
}

function isMugenGroundLayer(name: string) {
  const normalized = name.toLowerCase().replace(/\s+/g, '');
  return normalized.includes('ground') && !normalized.includes('background');
}

function isMugenFloorLayer(name: string) {
  const normalized = name.toLowerCase().replace(/\s+/g, '');
  return normalized === 'ground' || normalized === 'floor' || normalized === 'stageground' || normalized.endsWith('floor');
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
