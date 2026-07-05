import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { stages } from '../../src/data/stages';
import { normalizeCharacter, normalizeMove } from '../../src/lib/characterLoader';
import { createMatch, stepMatch } from '../../src/engine/fightEngine';
import { emptyInputFrame, type CharacterDefinition, type MoveDefinition, type MoveInput } from '../../src/types';

const repoRoot = path.resolve(__dirname, '..', '..');
const approved = JSON.parse(readFileSync(path.join(repoRoot, 'tmp/projectile-audit/approved-candidates.json'), 'utf8')) as {
  candidates: Array<{ characterId: string; moveKey: string }>;
};

const inputForBaseKey: Record<string, MoveInput> = {
  jableft: 'jab',
  jabright: 'heavy',
  kickleft: 'kick',
  kickright: 'special'
};

const buttonToInput: Record<string, MoveInput> = {
  '1': 'jab',
  '2': 'heavy',
  '3': 'kick',
  '4': 'special'
};

describe('roster projectile manifest smoke', () => {
  for (const candidate of approved.candidates) {
    it(`${candidate.characterId} ${candidate.moveKey} spawns a manifest projectile`, () => {
      const character = loadCharacter(candidate.characterId);
      const defender = loadCharacter('goku');
      const move = resolveMove(character, candidate.moveKey);
      const bindings = character.moveProjectiles?.[candidate.moveKey] ?? [];
      expect(bindings.length, `${candidate.characterId}.${candidate.moveKey} binding`).toBeGreaterThan(0);
      for (const binding of bindings) {
        const projectile = character.projectiles?.find((entry) => entry.id === binding.projectileId);
        expect(projectile, `${candidate.characterId}.${binding.projectileId} definition`).toBeTruthy();
        for (const frame of projectile?.frames ?? []) {
          expect(existsSync(path.join(repoRoot, 'public', frame.replace(/^\//, ''))), `${candidate.characterId}.${binding.projectileId}.${frame}`).toBe(true);
        }
      }

      let match = createMatch(character, defender, stages[0], 'training');
      match.phase = 'fighting';
      match.countdown = 0;
      match.fighters[0].position.x = -2.5;
      match.fighters[1].position.x = 4;
      match.fighters[1].position.z = 6;
      match.fighters[0].state = 'attack';
      match.fighters[0].currentMove = move;
      match.fighters[0].moveFrame = 0;
      match.fighters[0].actionFramesRemaining = move.startupFrames + move.activeFrames + move.recoveryFrames + 2;
      match.fighters[0].actionTimer = match.fighters[0].actionFramesRemaining / 60;

      for (let frame = 0; frame < 90 && match.projectiles.length === 0; frame += 1) {
        match = stepMatch(match, emptyInputFrame(), emptyInputFrame(), 1 / 60);
      }

      expect(match.projectiles.length, `${candidate.characterId}.${candidate.moveKey} runtime projectile`).toBeGreaterThan(0);
      expect(bindings.map((binding) => binding.projectileId)).toContain(match.projectiles[0].projectileId);
    });
  }
});

function loadCharacter(characterId: string): CharacterDefinition {
  return normalizeCharacter(JSON.parse(readFileSync(path.join(repoRoot, 'public/characters', characterId, 'character.json'), 'utf8')));
}

function resolveMove(character: CharacterDefinition, moveKey: string): MoveDefinition {
  if (inputForBaseKey[moveKey]) {
    const move = character.moves.find((entry) => entry.input === inputForBaseKey[moveKey]);
    if (!move) throw new Error(`Missing base move ${character.id}.${moveKey}`);
    return normalizeMove({ ...move, animationKey: moveKey });
  }
  const override = character.moveOverrides?.[moveKey];
  if (!override) throw new Error(`Missing move override ${character.id}.${moveKey}`);
  const command = moveKey.startsWith('cmd:') ? moveKey.slice(4) : moveKey;
  const input = buttonToInput[command.match(/[1-4](?!.*[1-4])/)?.[0] ?? '1'] ?? 'jab';
  const base = character.moves.find((entry) => entry.input === input) ?? character.moves[0];
  return normalizeMove({
    ...base,
    ...override,
    id: moveKey,
    input,
    command,
    animationKey: moveKey,
    hitbox: override.hitbox ?? base.hitbox
  });
}
