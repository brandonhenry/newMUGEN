const framePattern = /(\/characters\/[\w-]+(?:\/projectiles\/[\w-]+)?)\/frames\/(frame-\d+)\.png$/;

export function getVoxelAssetRoot(frameSource: string | undefined) {
  const cleanSource = frameSource?.split('?')[0];
  return cleanSource?.match(framePattern)?.[1] ?? null;
}

export function getVoxelPackFrameName(frameSource: string | undefined) {
  const cleanSource = frameSource?.split('?')[0];
  return cleanSource?.match(framePattern)?.[2] ?? null;
}

export function getPrecomputedVoxelPath(frameSource: string, hd = false) {
  const cleanSource = frameSource.split('?')[0] ?? frameSource;
  const match = cleanSource.match(framePattern);
  if (!match) return null;
  const queryIndex = frameSource.indexOf('?');
  const cacheBust = queryIndex >= 0 ? frameSource.slice(queryIndex) : '';
  return `${match[1]}/${hd ? 'voxels-hd' : 'voxels'}/${match[2]}.json${cacheBust}`;
}
