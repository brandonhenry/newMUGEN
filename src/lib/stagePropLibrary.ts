import type { StagePropAssetDefinition, StagePropLibraryManifest } from '../types';

export async function loadStagePropLibrary(): Promise<StagePropAssetDefinition[]> {
  try {
    const response = await fetch('/stage-props/index.json', { cache: 'no-store' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return [];
    const manifest = await response.json() as StagePropLibraryManifest;
    return Array.isArray(manifest.props) ? manifest.props.map(normalizeStagePropAsset).filter((asset) => asset.imagePath) : [];
  } catch {
    return [];
  }
}

export function normalizeStagePropAsset(asset: StagePropAssetDefinition): StagePropAssetDefinition {
  return {
    id: typeof asset.id === 'string' && asset.id.trim() ? asset.id : slugifyAssetId(asset.name || asset.imagePath || 'prop'),
    name: typeof asset.name === 'string' && asset.name.trim() ? asset.name.trim() : 'Imported Prop',
    imagePath: typeof asset.imagePath === 'string' ? asset.imagePath : '',
    thumbnailPath: typeof asset.thumbnailPath === 'string' ? asset.thumbnailPath : undefined,
    width: finiteOptional(asset.width),
    height: finiteOptional(asset.height),
    sourcePackId: typeof asset.sourcePackId === 'string' ? asset.sourcePackId : undefined,
    sourceName: typeof asset.sourceName === 'string' ? asset.sourceName : undefined,
    sourceKind: asset.sourceKind === 'mugen' || asset.sourceKind === 'spritesheet' || asset.sourceKind === 'manual' ? asset.sourceKind : undefined,
    sourceSprite: normalizeSprite(asset.sourceSprite),
    tags: Array.isArray(asset.tags) ? asset.tags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    defaultScale: normalizeVec3(asset.defaultScale),
    defaultRenderMode: asset.defaultRenderMode === 'plane' ? 'plane' : 'voxel',
    defaultVoxelDepth: finiteOptional(asset.defaultVoxelDepth),
    defaultVoxelScale: finiteOptional(asset.defaultVoxelScale)
  };
}

function normalizeVec3(value: unknown) {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const x = Number(value[0]);
  const y = Number(value[1]);
  const z = Number(value[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return undefined;
  return [x, y, z] as [number, number, number];
}

function normalizeSprite(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const group = Number(value[0]);
  const image = Number(value[1]);
  if (!Number.isFinite(group) || !Number.isFinite(image)) return undefined;
  return [Math.round(group), Math.round(image)] as [number, number];
}

function finiteOptional(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function slugifyAssetId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'prop';
}
