import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifestJson from './storyEnemyManifest.json';
import { STORY_CHALLENGER_IDS, STORY_CHALLENGER_IDS_BY_BIOME, STORY_ENEMY_CATALOG, STORY_ENEMY_FRAME_SIZE, STORY_ENEMY_IDS, STORY_ENEMY_RUNTIME_SCALE, STORY_REGULAR_ENEMY_IDS, STORY_REGULAR_ENEMY_IDS_BY_BIOME, storyEnemyPlaneSize, validateStoryEnemyCatalog } from './enemyCatalog';
import { STORY_ADVENTURE_REGION_IDS } from './adventureWorlds';

type EnemyManifest = {
  enemies: Array<{
    id: string;
    tier: 'regular' | 'challenger';
    sources: Array<{ kind: 'user-supplied' | 'imagegen'; path: string; sha256: string; originalFile?: string; chromaSourcePath?: string; chromaSourceSha256?: string; prompt?: string; model?: string }>;
    facing: 'right';
    animations: Array<{ id: string; frames: Array<{ path: string; sha256: string; contentBounds: [number, number, number, number]; derivedFrom?: string }> }>;
  }>;
};

const manifest = manifestJson as unknown as EnemyManifest;
const publicRoot = resolve(process.cwd(), 'public');
const diskPath = (publicPath: string) => resolve(publicRoot, publicPath.replace(/^\//, ''));

describe('story enemy catalog', () => {
  it('registers exactly 32 regular enemies and 24 challengers', () => {
    expect(validateStoryEnemyCatalog()).toEqual([]);
    expect(STORY_ENEMY_IDS).toHaveLength(56);
    expect(STORY_REGULAR_ENEMY_IDS).toHaveLength(32);
    expect(STORY_CHALLENGER_IDS).toHaveLength(24);
    expect(STORY_ENEMY_RUNTIME_SCALE).toBeGreaterThanOrEqual(1.25);
    expect(new Set(manifest.enemies.map((enemy) => enemy.id))).toEqual(new Set(STORY_ENEMY_IDS));
  });

  it('pins every legacy and image-generated source sheet to its recorded SHA-256', () => {
    const sources = manifest.enemies.flatMap((enemy) => enemy.sources);
    expect(new Set(sources.map((source) => source.path)).size).toBe(109);
    for (const source of sources) {
      if (source.kind === 'user-supplied') expect(source.originalFile).toMatch(/^codex-clipboard-[a-f0-9-]+\.png$/);
      else {
        expect(source.prompt).toBeTruthy();
        expect(source.model).toBeTruthy();
        expect(source.chromaSourcePath).toBeTruthy();
        const chroma = readFileSync(diskPath(source.chromaSourcePath!));
        expect(createHash('sha256').update(chroma).digest('hex')).toBe(source.chromaSourceSha256);
      }
      const contents = readFileSync(diskPath(source.path));
      expect(createHash('sha256').update(contents).digest('hex'), source.path).toBe(source.sha256);
    }
  });

  it('exports normalized transparent runtime frames inside the shared baseline', () => {
    let frameCount = 0;
    for (const enemy of manifest.enemies) {
      expect(enemy.facing).toBe('right');
      for (const animation of enemy.animations) {
        for (const frame of animation.frames) {
          frameCount += 1;
          expect(existsSync(diskPath(frame.path)), frame.path).toBe(true);
          const contents = readFileSync(diskPath(frame.path));
          expect(contents[25], `${frame.path} must be an RGBA PNG`).toBe(6);
          expect(createHash('sha256').update(contents).digest('hex'), frame.path).toBe(frame.sha256);
          const [left, top, right, bottom] = frame.contentBounds;
          expect(left).toBeGreaterThanOrEqual(0);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(right).toBeLessThanOrEqual(STORY_ENEMY_FRAME_SIZE.width);
          expect(bottom).toBeLessThanOrEqual(STORY_ENEMY_FRAME_SIZE.baseline);
          expect(right).toBeGreaterThan(left);
          expect(bottom).toBeGreaterThan(top);
        }
      }
    }
    expect(frameCount).toBeGreaterThan(3_000);
  });

  it('exports six regulars and three biome-coherent challengers per biome', () => {
    for (const biome of STORY_ADVENTURE_REGION_IDS) {
      expect(STORY_REGULAR_ENEMY_IDS_BY_BIOME[biome]).toHaveLength(6);
      expect(STORY_CHALLENGER_IDS_BY_BIOME[biome]).toHaveLength(3);
      expect(new Set(STORY_REGULAR_ENEMY_IDS_BY_BIOME[biome]).size).toBe(6);
      expect(new Set(STORY_CHALLENGER_IDS_BY_BIOME[biome]).size).toBe(3);
    }
  });

  it('palette-maps Tide Slime combat reactions to Venom and Volt without changing their identities', () => {
    for (const id of ['venom-slime', 'volt-slime'] as const) {
      const manifestEnemy = manifest.enemies.find((enemy) => enemy.id === id)!;
      const derived = manifestEnemy.animations.flatMap((animation) => animation.frames).filter((frame) => frame.derivedFrom);
      expect(derived.length).toBeGreaterThan(0);
      expect(derived.every((frame) => frame.derivedFrom?.startsWith('tide-slime/'))).toBe(true);
      expect(STORY_ENEMY_CATALOG[id].animations.some((animation) => animation.id === 'hurt')).toBe(true);
      expect(STORY_ENEMY_CATALOG[id].animations.some((animation) => animation.id === 'dead')).toBe(true);
    }
  });

  it('uses authored combat animation active frames and challenger stat multipliers', () => {
    for (const id of STORY_ENEMY_IDS) {
      const enemy = STORY_ENEMY_CATALOG[id];
      for (const attack of enemy.attacks) {
        const animation = enemy.animations.find((candidate) => candidate.id === attack.animation);
        expect(animation, `${id}/${attack.animation}`).toBeDefined();
        expect(animation?.activeFrameRange, `${id}/${attack.animation}`).toBeDefined();
      }
      if (enemy.tier === 'challenger') {
        expect(enemy.healthMultiplier).toBeGreaterThanOrEqual(4.25);
        expect(enemy.damageMultiplier).toBeGreaterThanOrEqual(1.45);
        expect(enemy.xpMultiplier).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('renders humanoids near player height while preserving intentionally small creatures', () => {
    for (const enemy of Object.values(STORY_ENEMY_CATALOG)) {
      const idle = enemy.animations.find((animation) => animation.id === 'idle')!.frames[0];
      const visiblePixels = idle.contentBounds[3] - idle.contentBounds[1];
      const renderedVisibleHeight = storyEnemyPlaneSize(enemy) * visiblePixels / STORY_ENEMY_FRAME_SIZE.height;
      expect(renderedVisibleHeight, enemy.id).toBeCloseTo(enemy.visualHeight, 4);
    }
    expect(STORY_ENEMY_CATALOG['hollow-bride'].visualHeight).toBeGreaterThan(3.2);
    expect(STORY_ENEMY_CATALOG['laughing-oni'].visualHeight).toBeGreaterThan(STORY_ENEMY_CATALOG['hollow-bride'].visualHeight);
    for (const id of ['tide-slime', 'venom-slime', 'volt-slime', 'magma-slime'] as const) {
      expect(STORY_ENEMY_CATALOG[id].visualHeight).toBeLessThan(1.6);
    }
  });
});
