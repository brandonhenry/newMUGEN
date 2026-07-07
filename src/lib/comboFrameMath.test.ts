import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition, MoveDefinition } from '../types';
import {
  contextualHitAdvantage,
  defaultComboRepeatPenaltyFrames,
  defaultJuggleRepeatPenaltyFrames,
  defaultOnComboHitFrames,
  defaultOnJuggleHitFrames
} from './comboFrameMath';

const repoRoot = process.cwd();
const timingKeys = ['startupFrames', 'activeFrames', 'recoveryFrames'] as const;
const contextualKeys = ['onComboHitFrames', 'onJuggleHitFrames', 'comboRepeatPenaltyFrames', 'juggleRepeatPenaltyFrames'] as const;
const baseKeys = new Set(['jableft', 'jabright', 'kickleft', 'kickright']);

const baseMove: MoveDefinition = {
  id: 'test',
  label: 'Test Move',
  input: 'heavy',
  startupFrames: 12,
  activeFrames: 3,
  recoveryFrames: 18,
  damage: 10,
  blockDamage: 0,
  hitLevel: 'mid',
  onBlockFrames: -5,
  onHitFrames: 14,
  onCounterHitFrames: 18,
  onComboHitFrames: 10,
  onJuggleHitFrames: 7,
  comboRepeatPenaltyFrames: 3,
  juggleRepeatPenaltyFrames: 6,
  range: 1.5,
  pushback: 0.6,
  blockPushback: 0.3,
  tracking: 'medium',
  knockdown: false,
  hitbox: { offset: [0, 1, 0.5], size: [0.5, 0.5, 0.5] }
};

function readRosterCharacters() {
  const charactersDir = join(repoRoot, 'public', 'characters');
  return readdirSync(charactersDir)
    .map((id) => join(charactersDir, id, 'character.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as CharacterDefinition);
}

function isAttackOverride(key: string, override: NonNullable<CharacterDefinition['moveOverrides']>[string]) {
  if (!override || key === 'chargeKi') return false;
  if (baseKeys.has(key) || key.startsWith('cmd:')) return true;
  return Boolean(override.input || override.command || override.animationKey || override.damage || override.onHitFrames || override.range || override.hitLevel);
}

function timingSnapshot(character: CharacterDefinition) {
  const snapshot: Record<string, number> = {};
  character.moves.forEach((move, index) => {
    for (const key of timingKeys) {
      if (move[key] !== undefined) snapshot[`moves.${index}.${key}`] = move[key];
    }
  });
  for (const [key, override] of Object.entries(character.moveOverrides ?? {})) {
    for (const timingKey of timingKeys) {
      if (override[timingKey] !== undefined) snapshot[`moveOverrides.${key}.${timingKey}`] = override[timingKey];
    }
  }
  return snapshot;
}

describe('contextual combo frame math', () => {
  it('preserves neutral hit advantage while using contextual combo and juggle values', () => {
    expect(contextualHitAdvantage(baseMove, { context: 'neutral' })).toBe(14);
    expect(contextualHitAdvantage(baseMove, { context: 'neutral', counterHit: true })).toBe(18);
    expect(contextualHitAdvantage(baseMove, { context: 'combo' })).toBe(10);
    expect(contextualHitAdvantage(baseMove, { context: 'juggle' })).toBe(7);
  });

  it('applies repeat and combo-length penalties while preserving varied route viability', () => {
    const varied = contextualHitAdvantage(baseMove, { context: 'combo', comboHits: 2, repeatCount: 1 });
    const repeated = contextualHitAdvantage(baseMove, { context: 'combo', comboHits: 2, repeatCount: 3 });
    const repeatedJuggle = contextualHitAdvantage(baseMove, { context: 'juggle', comboHits: 3, repeatCount: 2 });

    expect(repeated).toBeLessThan(varied);
    expect(repeatedJuggle).toBeLessThan(contextualHitAdvantage(baseMove, { context: 'juggle', comboHits: 3, repeatCount: 1 }));
  });

  it('generates harsher default repeat costs for launchers and tornado moves', () => {
    const launcher = { ...baseMove, launchHeight: 2.2, damage: 16 };
    const tornado = { ...baseMove, tornado: true, damage: 12 };

    expect(defaultOnComboHitFrames(launcher)).toBeLessThan(defaultOnComboHitFrames(baseMove));
    expect(defaultOnJuggleHitFrames(launcher)).toBeLessThan(defaultOnJuggleHitFrames(baseMove));
    expect(defaultComboRepeatPenaltyFrames(launcher)).toBeGreaterThan(defaultComboRepeatPenaltyFrames(baseMove));
    expect(defaultJuggleRepeatPenaltyFrames(tornado)).toBeGreaterThan(defaultJuggleRepeatPenaltyFrames(baseMove));
  });

  it('writes contextual frame fields to every roster attack without adding timing fields', () => {
    for (const character of readRosterCharacters()) {
      for (const [index, move] of character.moves.entries()) {
        for (const key of contextualKeys) {
          expect(typeof move[key], `${character.id}:moves.${index}.${key}`).toBe('number');
        }
      }
      for (const [key, override] of Object.entries(character.moveOverrides ?? {})) {
        if (!isAttackOverride(key, override)) continue;
        for (const field of contextualKeys) {
          expect(typeof override[field], `${character.id}:${key}.${field}`).toBe('number');
        }
        for (const timingKey of timingKeys) {
          if (override[timingKey] !== undefined) {
            expect(Number.isFinite(override[timingKey]), `${character.id}:${key}.${timingKey}`).toBe(true);
          }
        }
      }
    }
  });

  it('preserves roster startup, active, and recovery timing against the git baseline', () => {
    for (const character of readRosterCharacters()) {
      const manifestPath = `public/characters/${character.id}/character.json`;
      let baselineText = '';
      try {
        baselineText = execFileSync('git', ['show', `HEAD:${manifestPath}`], { cwd: repoRoot, encoding: 'utf8' });
      } catch {
        continue;
      }
      const baseline = JSON.parse(baselineText) as CharacterDefinition;
      expect(timingSnapshot(character), character.id).toEqual(timingSnapshot(baseline));
    }
  });
});
