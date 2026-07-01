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
  if (!grass || typeof grass !== 'object') return undefined;
  return {
    grass: {
      enabled: grass.enabled === true,
      density: clamp(finiteOr(grass.density, 0.45), 0.05, 1),
      height: clamp(finiteOr(grass.height, 0.48), 0.08, 1.8),
      patchWidth: clamp(finiteOr(grass.patchWidth, 32), 4, 220),
      patchDepth: clamp(finiteOr(grass.patchDepth, 16), 4, 220),
      windStrength: clamp(finiteOr(grass.windStrength, 0.14), 0, 0.8),
      windSpeed: clamp(finiteOr(grass.windSpeed, 1.1), 0, 4),
      colorBottom: typeof grass.colorBottom === 'string' ? grass.colorBottom : '#174d25',
      colorTop: typeof grass.colorTop === 'string' ? grass.colorTop : '#7bd34d'
    }
  };
}

function finiteOr(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function slugifyAssetId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'asset';
}
