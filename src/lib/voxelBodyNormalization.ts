export type VoxelBodyZone = 'chest' | 'waist' | 'hip' | 'ankle';

export type VoxelBodyZoneMetric = {
  width: number;
  rows: number;
};

export type VoxelBodyMetrics = {
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  centerX: number;
  height: number;
  zones: Partial<Record<VoxelBodyZone, VoxelBodyZoneMetric>>;
};

export type VoxelBodyNormalization = {
  enabled: boolean;
  referenceFrame: number;
  scale: number;
  metrics?: VoxelBodyMetrics;
  ratios?: Partial<Record<VoxelBodyZone, number>>;
};

export type VoxelBodyNormalizationOptions = {
  enabled?: boolean;
  referenceFrame?: number;
  minScale?: number;
  maxScale?: number;
};

export type VoxelBodyMask = {
  width: number;
  height: number;
  isForeground: (x: number, y: number) => boolean;
};

const BODY_ZONES: Record<VoxelBodyZone, [number, number]> = {
  chest: [0.25, 0.42],
  waist: [0.43, 0.56],
  hip: [0.55, 0.68],
  ankle: [0.78, 0.92]
};

const BODY_ZONE_ORDER: VoxelBodyZone[] = ['chest', 'waist', 'hip', 'ankle'];

export const DEFAULT_VOXEL_BODY_NORMALIZATION: Required<VoxelBodyNormalizationOptions> = {
  enabled: true,
  referenceFrame: 0,
  minScale: 0.75,
  maxScale: 1.35
};

type Span = {
  minX: number;
  maxX: number;
  width: number;
  centerX: number;
};

export function normalizeVoxelBodyOptions(options?: VoxelBodyNormalizationOptions): Required<VoxelBodyNormalizationOptions> {
  return {
    enabled: options?.enabled !== false,
    referenceFrame: Math.max(0, Math.round(finiteOr(options?.referenceFrame, DEFAULT_VOXEL_BODY_NORMALIZATION.referenceFrame))),
    minScale: clamp(finiteOr(options?.minScale, DEFAULT_VOXEL_BODY_NORMALIZATION.minScale), 0.25, 1),
    maxScale: clamp(finiteOr(options?.maxScale, DEFAULT_VOXEL_BODY_NORMALIZATION.maxScale), 1, 2.5)
  };
}

export function measureVoxelBodyMetrics(mask: VoxelBodyMask): VoxelBodyMetrics | null {
  const bounds = findMaskBounds(mask);
  if (!bounds) return null;

  const height = bounds.maxY - bounds.minY + 1;
  const centerX = estimateBodyCenterX(mask, bounds);
  const zones: Partial<Record<VoxelBodyZone, VoxelBodyZoneMetric>> = {};

  for (const zone of BODY_ZONE_ORDER) {
    const [startRatio, endRatio] = BODY_ZONES[zone];
    const startY = Math.max(bounds.minY, Math.round(bounds.minY + height * startRatio));
    const endY = Math.min(bounds.maxY, Math.round(bounds.minY + height * endRatio));
    const widths: number[] = [];

    for (let y = startY; y <= endY; y += 1) {
      const span = chooseBodySpan(rowSpans(mask, bounds, y), centerX);
      if (span) widths.push(span.width);
    }

    const width = median(widths);
    if (width !== null) {
      zones[zone] = {
        width: roundMetric(width),
        rows: widths.length
      };
    }
  }

  return {
    bounds,
    centerX: roundMetric(centerX),
    height,
    zones
  };
}

export function computeVoxelBodyNormalization(
  reference: VoxelBodyMetrics | null | undefined,
  current: VoxelBodyMetrics | null | undefined,
  options?: VoxelBodyNormalizationOptions
): { scale: number; ratios: Partial<Record<VoxelBodyZone, number>> } {
  const normalized = normalizeVoxelBodyOptions(options);
  if (!normalized.enabled || !reference || !current) return { scale: 1, ratios: {} };

  const ratios: Partial<Record<VoxelBodyZone, number>> = {};
  const usableRatios: number[] = [];

  for (const zone of BODY_ZONE_ORDER) {
    const refWidth = reference.zones[zone]?.width;
    const frameWidth = current.zones[zone]?.width;
    if (!isPositive(refWidth) || !isPositive(frameWidth)) continue;
    const ratio = refWidth / frameWidth;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    ratios[zone] = roundMetric(ratio);
    usableRatios.push(ratio);
  }

  const rawScale = median(usableRatios) ?? 1;
  return {
    scale: roundMetric(clamp(rawScale, normalized.minScale, normalized.maxScale)),
    ratios
  };
}

export function applyVoxelBodyScale<T extends { x: number; y: number; w: number; h: number; d: number }>(
  voxels: T[],
  scale: number,
  anchor = { x: 0, y: 0.02 }
): T[] {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) < 0.00001) return voxels;
  return voxels.map((voxel) => ({
    ...voxel,
    x: roundMetric(anchor.x + (voxel.x - anchor.x) * scale),
    y: roundMetric(anchor.y + (voxel.y - anchor.y) * scale),
    w: roundMetric(voxel.w * scale),
    h: roundMetric(voxel.h * scale),
    d: roundMetric(voxel.d * scale)
  }));
}

function findMaskBounds(mask: VoxelBodyMask) {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.isForeground(x, y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX >= minX && maxY >= minY ? { minX, minY, maxX, maxY } : null;
}

function estimateBodyCenterX(mask: VoxelBodyMask, bounds: NonNullable<ReturnType<typeof findMaskBounds>>) {
  const height = bounds.maxY - bounds.minY + 1;
  const samples: number[] = [];
  const centerFallback = (bounds.minX + bounds.maxX) / 2;
  const startY = Math.round(bounds.minY + height * 0.35);
  const endY = Math.round(bounds.minY + height * 0.88);

  for (let y = startY; y <= endY; y += 1) {
    const span = chooseBodySpan(rowSpans(mask, bounds, y), centerFallback);
    if (span) samples.push(span.centerX);
  }

  return median(samples) ?? centerFallback;
}

function rowSpans(mask: VoxelBodyMask, bounds: NonNullable<ReturnType<typeof findMaskBounds>>, y: number): Span[] {
  const spans: Span[] = [];
  let start = -1;

  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    const foreground = mask.isForeground(x, y);
    if (foreground && start < 0) start = x;
    if ((!foreground || x === bounds.maxX) && start >= 0) {
      const end = foreground && x === bounds.maxX ? x : x - 1;
      const width = end - start + 1;
      spans.push({
        minX: start,
        maxX: end,
        width,
        centerX: (start + end) / 2
      });
      start = -1;
    }
  }

  return spans;
}

function chooseBodySpan(spans: Span[], centerX: number) {
  if (spans.length === 0) return null;
  return [...spans].sort((a, b) => {
    const distanceA = distanceToSpan(a, centerX);
    const distanceB = distanceToSpan(b, centerX);
    if (Math.abs(distanceA - distanceB) > 0.0001) return distanceA - distanceB;
    return b.width - a.width;
  })[0] ?? null;
}

function distanceToSpan(span: Span, x: number) {
  if (x >= span.minX && x <= span.maxX) return 0;
  return Math.min(Math.abs(x - span.minX), Math.abs(x - span.maxX));
}

function median(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finiteValues.length === 0) return null;
  const middle = Math.floor(finiteValues.length / 2);
  if (finiteValues.length % 2 === 1) return finiteValues[middle];
  return (finiteValues[middle - 1] + finiteValues[middle]) / 2;
}

function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMetric(value: number) {
  return Number(value.toFixed(5));
}
