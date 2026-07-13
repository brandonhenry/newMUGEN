import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Match = {
  characterId: string;
  assetType: 'projectile' | 'effect';
  assetId: string;
  sourceFrames: number[];
  moveKeys: string[];
  stripMoveFrames?: Record<string, number[]>;
  replaceProjectileIds?: string[];
};

const root = process.cwd();
const config = JSON.parse(readFileSync(path.join(root, 'scripts', 'spritesheet-projectile-matches.json'), 'utf8')) as {
  matches: Match[];
  ambiguousSkipped: Array<{ characterId: string }>;
};

const loadCharacter = (characterId: string) => JSON.parse(readFileSync(path.join(root, 'public', 'characters', characterId, 'character.json'), 'utf8'));
const frameIndex = (frame: string) => Number(frame.match(/frame-(\d+)\.png$/)?.[1]);

describe('sprite-sheet projectile conversion', () => {
  it('only configures playable characters and binds every extracted asset to a configured move', () => {
    for (const match of config.matches) {
      const character = loadCharacter(match.characterId);
      expect(character.unplayable, match.characterId).not.toBe(true);
      const definitions = match.assetType === 'projectile' ? character.projectiles : character.effects;
      const bindings = match.assetType === 'projectile' ? character.moveProjectiles : character.moveEffects;
      expect(definitions.some((definition: { id: string }) => definition.id === match.assetId), `${match.characterId}:${match.assetId}`).toBe(true);
      for (const moveKey of match.moveKeys) {
        const configured = ['jableft', 'jabright', 'kickleft', 'kickright'].includes(moveKey) || Boolean(character.moveOverrides?.[moveKey]);
        expect(configured, `${match.characterId}:${moveKey}`).toBe(true);
        expect(bindings?.[moveKey]?.some((binding: { projectileId?: string; effectId?: string }) => (binding.projectileId ?? binding.effectId) === match.assetId), `${match.characterId}:${moveKey}`).toBe(true);
      }
    }
  });

  it('keeps every extracted source frame non-empty and records its original sheet crop', () => {
    for (const match of config.matches) {
      const assetFolder = match.assetType === 'projectile' ? 'projectiles' : 'effects';
      const source = JSON.parse(readFileSync(path.join(root, 'public', 'characters', match.characterId, assetFolder, match.assetId, 'source', 'source.json'), 'utf8'));
      expect(source.sourceSheetPath).toBe(`/characters/${match.characterId}/animation-sheet.png`);
      expect(source.sourceFrames).toHaveLength(match.sourceFrames.length);
      match.sourceFrames.forEach((sourceFrame, index) => {
        expect(source.sourceFrames[index].index).toBe(sourceFrame);
        expect(source.sourceFrames[index].cropBox).toHaveLength(4);
        const output = path.join(root, 'public', source.sourceFrames[index].output.replace(/^\//, ''));
        expect(existsSync(output), output).toBe(true);
        expect(statSync(output).size, output).toBeGreaterThan(0);
      });
    }
  });

  it('removes detached source-only cells from fighter animations without emptying a move', () => {
    for (const match of config.matches) {
      const character = loadCharacter(match.characterId);
      for (const [moveKey, removed] of Object.entries(match.stripMoveFrames ?? {})) {
        const remaining = character.animationFrames?.[moveKey] ?? [];
        expect(remaining.length, `${match.characterId}:${moveKey}`).toBeGreaterThan(0);
        expect(remaining.map(frameIndex).some((index: number) => removed.includes(index)), `${match.characterId}:${moveKey}`).toBe(false);
      }
    }
  });

  it('replaces Majin Buu generated projectiles while retaining Train when no sheet bullet exists', () => {
    const buu = loadCharacter('majin-buu');
    expect(buu.projectiles.some((definition: { id: string }) => definition.id === 'ki-energy-projectile')).toBe(false);
    expect(existsSync(path.join(root, 'public', 'characters', 'majin-buu', 'projectiles', 'ki-energy-projectile'))).toBe(false);
    expect(buu.projectiles.some((definition: { id: string }) => definition.id === 'majin-ki-bolt')).toBe(true);
    expect(buu.projectiles.some((definition: { id: string }) => definition.id === 'majin-ki-orb')).toBe(true);

    const train = loadCharacter('train-heartnet');
    expect(train.projectiles.some((definition: { id: string }) => definition.id === 'firearm-bullet-projectile')).toBe(true);
  });

  it('never targets a protected blast for replacement', () => {
    for (const match of config.matches) {
      const character = loadCharacter(match.characterId);
      const definitions = new Map<string, { kind?: string }>((character.projectiles ?? []).map((definition: { id: string; kind?: string }) => [definition.id, definition]));
      const protectedIds = new Set<string>((character.projectiles ?? []).filter((definition: { id: string; name?: string; kind?: string }) => definition.kind === 'blast' || (!definition.kind && /blast/i.test(`${definition.id} ${definition.name ?? ''}`))).map((definition: { id: string }) => definition.id));
      for (const instances of Object.values(character.moveProjectiles ?? {}) as Array<Array<{ projectileId: string; kind?: string }>>) {
        for (const instance of instances) if ((instance.kind ?? definitions.get(instance.projectileId)?.kind) === 'blast') protectedIds.add(instance.projectileId);
      }
      for (const replacedId of match.replaceProjectileIds ?? []) expect(protectedIds.has(replacedId), `${match.characterId}:${replacedId}`).toBe(false);
    }
    expect(config.ambiguousSkipped.some((entry) => entry.characterId === 'train-heartnet')).toBe(true);
  });
});
