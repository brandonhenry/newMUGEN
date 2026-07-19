import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';
import { normalizeCharacter } from './characterLoader';

const ino = JSON.parse(
  readFileSync(join(process.cwd(), 'public', 'characters', 'ino-yamanaka', 'character.json'), 'utf8')
) as CharacterDefinition;

describe('Ino Yamanaka mind transfer configuration', () => {
  it('binds Aura Drive to a four-second possession instead of knockdown', () => {
    const auraDrive = normalizeCharacter(ino).moveOverrides?.['cmd:O+2'];

    expect(auraDrive?.label).toBe('Ino Yamanaka Aura Drive');
    expect(auraDrive?.usesKi).toBe(true);
    expect(auraDrive?.kiCost).toBe(35);
    expect(auraDrive?.knockdown).toBe(false);
    expect(auraDrive?.mindTransferFrames).toBe(240);
  });
});
