import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { StageDefinition } from '../types';
import { buildMergedEdgeVegetationGeometry, createEdgeVegetationPlacements } from './edgeVegetation';

const stageIds = ['grasslands', 'wind-plain', 'snowfield', 'fog-marsh', 'petal-courtyard'] as const;

function readStage(id: typeof stageIds[number]) {
  return JSON.parse(readFileSync(path.resolve(process.cwd(), 'public', 'stages', id, 'stage.json'), 'utf8')) as StageDefinition;
}

describe('edge vegetation', () => {
  it('creates deterministic, grounded placements outside the playable bounds', () => {
    const stage = readStage('grasslands');
    const first = createEdgeVegetationPlacements(stage);
    const second = createEdgeVegetationPlacements(stage);
    expect(first).toEqual(second);
    expect(first).toHaveLength(stage.edgeVegetation?.count ?? 0);
    expect(new Set(first.map((placement) => placement.variant))).toEqual(new Set(stage.edgeVegetation?.variants));
    const halfWidth = (stage.playableBounds?.width ?? 0) / 2;
    const halfDepth = (stage.playableBounds?.depth ?? 0) / 2;
    const clearMargin = stage.edgeVegetation?.clearMargin ?? 0;
    for (const placement of first) {
      expect(Math.abs(placement.position[0]) >= halfWidth + clearMargin - 0.001 || Math.abs(placement.position[2]) >= halfDepth + clearMargin - 0.001).toBe(true);
      expect(Math.abs(placement.position[0])).toBeLessThanOrEqual((stage.world?.width ?? 0) / 2);
      expect(Math.abs(placement.position[2])).toBeLessThanOrEqual((stage.world?.depth ?? 0) / 2);
      expect(placement.position[1]).toBe(stage.world?.floorY);
    }
  });

  it('covers all 36 trees and 8 bushes across the curated natural-stage palettes', () => {
    const configured = new Set(stageIds.flatMap((id) => readStage(id).edgeVegetation?.variants ?? []));
    const expected = new Set([
      ...Array.from({ length: 36 }, (_, index) => `tree${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 8 }, (_, index) => `bush${String(index + 1).padStart(2, '0')}`)
    ]);
    expect(configured).toEqual(expected);
  });

  it('batches transformed variants into one height-normalized geometry', () => {
    const source = new THREE.BoxGeometry(2, 2, 2);
    const merged = buildMergedEdgeVegetationGeometry(new Map([['tree34', source]]), [{
      variant: 'tree34',
      position: [8, 0, 4],
      rotationY: Math.PI / 4,
      height: 12
    }]);
    expect(merged).not.toBeNull();
    expect(merged?.groups).toHaveLength(0);
    merged?.computeBoundingBox();
    expect(merged?.boundingBox?.min.y).toBeCloseTo(0);
    expect(merged?.boundingBox?.max.y).toBeCloseTo(12);
    merged?.dispose();
    source.dispose();
  });
});
