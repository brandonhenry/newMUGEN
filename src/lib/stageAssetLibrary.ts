import type { StageAssetLibraryManifest, StageFloorAssetDefinition, StageFloorEffects, StageFloorSoundSet, StageSkyboxAssetDefinition } from '../types';

export async function loadStageAssetLibrary(): Promise<StageAssetLibraryManifest> {
  try {
    const response = await fetch('/stage-assets/index.json', { cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return emptyStageAssetLibrary();
    const manifest = await response.json() as StageAssetLibraryManifest;
    return {
      floors: Array.isArray(manifest.floors) ? manifest.floors.map(normalizeFloorAsset).filter((asset) => asset.texturePath) : [],
      skies: Array.isArray(manifest.skies) ? manifest.skies.map(normalizeSkyAsset).filter((asset) => asset.imagePath) : []
    };
  } catch {
    return emptyStageAssetLibrary();
  }
}

export function emptyStageAssetLibrary(): StageAssetLibraryManifest {
  return { floors: [], skies: [] };
}

function normalizeFloorAsset(asset: StageFloorAssetDefinition): StageFloorAssetDefinition {
  return {
    id: typeof asset.id === 'string' && asset.id.trim() ? asset.id : slugifyAssetId(asset.name || asset.texturePath || 'floor'),
    name: typeof asset.name === 'string' && asset.name.trim() ? asset.name.trim() : 'Floor',
    texturePath: typeof asset.texturePath === 'string' ? asset.texturePath : '',
    thumbnailPath: typeof asset.thumbnailPath === 'string' ? asset.thumbnailPath : undefined,
    repeat: Array.isArray(asset.repeat) ? [finiteOr(asset.repeat[0], 24), finiteOr(asset.repeat[1], 24)] : undefined,
    sounds: normalizeFloorSounds(asset.sounds),
    effects: normalizeFloorEffects(asset.effects)
  };
}

function normalizeSkyAsset(asset: StageSkyboxAssetDefinition): StageSkyboxAssetDefinition {
  return {
    id: typeof asset.id === 'string' && asset.id.trim() ? asset.id : slugifyAssetId(asset.name || asset.imagePath || 'sky'),
    name: typeof asset.name === 'string' && asset.name.trim() ? asset.name.trim() : 'Sky',
    imagePath: typeof asset.imagePath === 'string' ? asset.imagePath : '',
    thumbnailPath: typeof asset.thumbnailPath === 'string' ? asset.thumbnailPath : undefined
  };
}

function normalizeFloorSounds(value: unknown): StageFloorSoundSet | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as StageFloorSoundSet;
  const sounds: StageFloorSoundSet = {};
  (['run', 'jump', 'land', 'sprint'] as const).forEach((key) => {
    if (typeof source[key] === 'string' && source[key]) sounds[key] = source[key];
  });
  return Object.keys(sounds).length ? sounds : undefined;
}

function normalizeFloorEffects(value: unknown): StageFloorEffects | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as StageFloorEffects;
  const grass = source.grass;
  const effects: StageFloorEffects = {};
  if (grass && typeof grass === 'object') {
    effects.grass = {
      enabled: grass.enabled === true,
      density: clamp(finiteOr(grass.density, 0.45), 0.05, 1),
      height: clamp(finiteOr(grass.height, 0.28), 0.04, 1.8),
      patchWidth: clamp(finiteOr(grass.patchWidth, 220), 4, 520),
      patchDepth: clamp(finiteOr(grass.patchDepth, 220), 4, 520),
      bladeCount: clamp(finiteOr(grass.bladeCount, 0), 0, 120000),
      bladeWidth: clamp(finiteOr(grass.bladeWidth, 0.075), 0.01, 0.4),
      segments: Math.round(clamp(finiteOr(grass.segments, 5), 2, 10)),
      coverageScale: clamp(finiteOr(grass.coverageScale, 1.08), 0.2, 2),
      colorVariation: clamp(finiteOr(grass.colorVariation, 0.18), 0, 1),
      windDirection: Array.isArray(grass.windDirection) ? [finiteOr(grass.windDirection[0], 1), finiteOr(grass.windDirection[1], 0.35)] : [1, 0.35],
      windNoiseScale: clamp(finiteOr(grass.windNoiseScale, 0.58), 0.02, 4),
      quality: normalizeQuality(grass.quality, 'medium'),
      windStrength: clamp(finiteOr(grass.windStrength, 0.14), 0, 0.8),
      windSpeed: clamp(finiteOr(grass.windSpeed, 1.1), 0, 4),
      colorBottom: typeof grass.colorBottom === 'string' ? grass.colorBottom : '#174d25',
      colorTop: typeof grass.colorTop === 'string' ? grass.colorTop : '#7bd34d'
    };
  }
  ([
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
  ] as const).forEach((key) => {
    const effect = source[key];
    if (effect && typeof effect === 'object') effects[key] = normalizeSimpleFloorEffect(effect);
  });
  return Object.keys(effects).length ? effects : undefined;
}

function normalizeSimpleFloorEffect(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: source.enabled === true,
    intensity: clamp(finiteOr(source.intensity, 0.6), 0, 2),
    density: clamp(finiteOr(source.density, 0.45), 0, 1),
    size: clamp(finiteOr(source.size, 1), 0.05, 12),
    speed: clamp(finiteOr(source.speed, 1), 0, 6),
    opacity: clamp(finiteOr(source.opacity, 0.55), 0, 1),
    radius: clamp(finiteOr(source.radius, 1.4), 0.05, 24),
    strength: clamp(finiteOr(source.strength, 0.35), 0, 2),
    lifetime: clamp(finiteOr(source.lifetime, 900), 100, 6000),
    amount: clamp(finiteOr(source.amount, 80), 0, 800),
    maxParticles: Math.round(clamp(finiteOr(source.maxParticles, 0), 0, 5000)),
    maxDecals: Math.round(clamp(finiteOr(source.maxDecals, 0), 0, 256)),
    spread: clamp(finiteOr(source.spread, 1), 0, 4),
    coverageScale: clamp(finiteOr(source.coverageScale, 1.08), 0.2, 2),
    decay: clamp(finiteOr(source.decay, 0.86), 0, 1),
    atlasPath: typeof source.atlasPath === 'string' ? source.atlasPath : undefined,
    frameCount: Math.round(clamp(finiteOr(source.frameCount, 1), 1, 64)),
    reactive: typeof source.reactive === 'boolean' ? source.reactive : undefined,
    quality: normalizeQuality(source.quality),
    windStrength: clamp(finiteOr(source.windStrength, 0.35), 0, 2),
    fallSpeed: clamp(finiteOr(source.fallSpeed, 0.8), 0, 4),
    pulseSpeed: clamp(finiteOr(source.pulseSpeed, 1.2), 0, 6),
    color: typeof source.color === 'string' ? source.color : undefined,
    colorA: typeof source.colorA === 'string' ? source.colorA : undefined,
    colorB: typeof source.colorB === 'string' ? source.colorB : undefined
  };
}

function finiteOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeQuality(value: unknown, fallback?: 'low' | 'medium' | 'high') {
  return value === 'low' || value === 'medium' || value === 'high' ? value : fallback;
}

function slugifyAssetId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'asset';
}
