import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { starterCharacters } from '../data/characters';
import type { CharacterDefinition } from '../types';
import {
  BEGINNER_AUTO_COMBO_INPUTS,
  BEGINNER_AUTO_COMBO_KI_COST,
  hasNamedBeginnerAutoComboFinisher,
  resolveBeginnerAutoComboPlan
} from './beginnerAutoCombos';

const repoRoot = process.cwd();

function readRosterCharacters() {
  const charactersDir = join(repoRoot, 'public', 'characters');
  return readdirSync(charactersDir)
    .map((id) => join(charactersDir, id, 'character.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as CharacterDefinition);
}

function makeBeginnerCharacter(overrides: NonNullable<CharacterDefinition['moveOverrides']>): CharacterDefinition {
  const base = starterCharacters[0];
  const commandFrames = Object.fromEntries(
    Object.keys(overrides)
      .filter((key) => key.startsWith('cmd:'))
      .map((key) => [key, [`/${key}.png`]])
  );
  return {
    ...base,
    id: `beginner-helper-${Object.keys(overrides).join('-')}`,
    animationFrames: {
      jableft: ['/jableft.png'],
      jabright: ['/jabright.png'],
      kickleft: ['/kickleft.png'],
      kickright: ['/kickright.png'],
      ...commandFrames
    },
    moveOverrides: overrides
  };
}

describe('Beginner auto combos', () => {
  it('keeps the fixed Beginner input chain', () => {
    expect(BEGINNER_AUTO_COMBO_INPUTS).toEqual(['jab', 'heavy', 'kick', 'special']);
  });

  it('prefers named character finishers over generic frame links', () => {
    const character = makeBeginnerCharacter({
      'cmd:qcf+4': { label: 'qcf+4 Frame Link', damage: 18, blockDamage: 4 },
      'cmd:1+4': { label: 'Hero Step Kick', damage: 18, blockDamage: 4 }
    });

    const plan = resolveBeginnerAutoComboPlan(character);

    expect(plan.finisherCommand).toBe('1+4');
    expect(plan.finisherLabel).toBe('Hero Step Kick');
    expect(plan.sourceRoute?.tier).not.toBe('long');
    expect(plan.sourceRoute?.tier).not.toBe('marathon');
  });

  it('does not select ki finishers until the character has enough ki', () => {
    const character = makeBeginnerCharacter({
      'cmd:qcf+4': { label: 'Grounded Burst Kick', damage: 12, blockDamage: 3 },
      'cmd:O+4': { label: 'Overdrive Burst Kick', damage: 32, blockDamage: 4, usesKi: true, kiCost: BEGINNER_AUTO_COMBO_KI_COST }
    });

    expect(resolveBeginnerAutoComboPlan(character, { ki: 0 }).finisherCommand).toBe('qcf+4');
    expect(resolveBeginnerAutoComboPlan(character, { ki: BEGINNER_AUTO_COMBO_KI_COST }).finisherCommand).toBe('O+4');
  });

  it('falls back to base special when only generic command labels are available', () => {
    const character = makeBeginnerCharacter({
      'cmd:qcf+4': { label: 'qcf+4 Frame Link', damage: 14, blockDamage: 3 },
      'cmd:1+4': { label: '1+4 Frame Link', damage: 16, blockDamage: 3 }
    });

    const plan = resolveBeginnerAutoComboPlan(character);

    expect(plan.finisherCommand).toBeUndefined();
    expect(plan.finisherLabel).toBe(character.moves.find((move) => move.input === 'special')?.label);
  });

  it('resolves executable teaching-safe plans across the playable roster', () => {
    const characters = readRosterCharacters().filter((character) => !character.unplayable);
    expect(characters.length).toBeGreaterThan(0);

    for (const character of characters) {
      const plan = resolveBeginnerAutoComboPlan(character);
      expect(plan.inputs, character.id).toEqual(BEGINNER_AUTO_COMBO_INPUTS);
      expect(plan.sourceRoute?.tier, character.id).not.toBe('long');
      expect(plan.sourceRoute?.tier, character.id).not.toBe('marathon');
      if (plan.finisherCommand) {
        expect(character.animationFrames?.[`cmd:${plan.finisherCommand}`]?.length, character.id).toBeGreaterThan(0);
      }
      if (hasNamedBeginnerAutoComboFinisher(character) && plan.finisherCommand) {
        expect(plan.finisherLabel, character.id).not.toMatch(/Frame Link/i);
      }
    }
  });
});
