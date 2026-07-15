import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BeginnerComboGesture, CharacterDefinition, InputFrame } from '../types';
import { emptyInputFrame } from '../types';
import {
  BEGINNER_AUTO_COMBO_INPUTS,
  BEGINNER_AUTO_COMBO_KI_COST,
  BEGINNER_SPECIAL_CHORD_GRACE_FRAMES,
  beginnerMovementSatisfied,
  resolveBeginnerGesture,
  resolveBeginnerRouteStep
} from './beginnerAutoCombos';

const repoRoot = process.cwd();

function readPlayableRoster() {
  const charactersDir = join(repoRoot, 'public', 'characters');
  return readdirSync(charactersDir)
    .map((id) => join(charactersDir, id, 'character.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as CharacterDefinition)
    .filter((character) => !character.unplayable);
}

function inputFrame(actions: Partial<InputFrame>) {
  return { ...emptyInputFrame(), ...actions };
}

describe('Beginner auto-combo routes', () => {
  it('uses three-hit core routes and a six-frame Special chord grace', () => {
    expect(BEGINNER_AUTO_COMBO_INPUTS).toEqual(['jab', 'jab', 'jab']);
    expect(BEGINNER_SPECIAL_CHORD_GRACE_FRAMES).toBe(6);
  });

  it('recognizes all simple attacks and Special chords', () => {
    expect(resolveBeginnerGesture(inputFrame({ jab: true }), 'jab')).toBe('light');
    expect(resolveBeginnerGesture(inputFrame({ heavy: true }), 'heavy')).toBe('medium');
    expect(resolveBeginnerGesture(inputFrame({ kick: true }), 'kick')).toBe('heavy');
    expect(resolveBeginnerGesture(inputFrame({ special: true }), 'special')).toBe('special');
    expect(resolveBeginnerGesture(inputFrame({ special: true, jab: true }), 'jab')).toBe('special+light');
    expect(resolveBeginnerGesture(inputFrame({ special: true, heavy: true }), 'heavy')).toBe('special+medium');
    expect(resolveBeginnerGesture(inputFrame({ special: true, kick: true }), 'kick')).toBe('special+heavy');
  });

  it('resolves only matching confirmed prefixes and preserves insufficient-Ki fallbacks', () => {
    const character = readPlayableRoster().find((candidate) =>
      candidate.beginnerComboRoutes?.some((route) => route.steps.some((step) => step.kiCommand || step.poweredKiFallback))
    );
    expect(character).toBeTruthy();
    if (!character) return;
    const medium = character.beginnerComboRoutes!.find((route) => route.id.endsWith('medium-core'))!;
    const first = resolveBeginnerRouteStep(character, [], 'medium', 0);
    const second = resolveBeginnerRouteStep(character, ['medium'], 'medium', 0, medium.id);
    const zeroKi = resolveBeginnerRouteStep(character, ['medium', 'medium'], 'medium', 0, medium.id);
    const fullKi = resolveBeginnerRouteStep(character, ['medium', 'medium'], 'medium', 100, medium.id);

    expect(first?.stepIndex).toBe(0);
    expect(second?.stepIndex).toBe(1);
    expect(zeroKi?.stepIndex).toBe(2);
    expect(zeroKi?.forcedCommand).toBe(medium.steps[2].command);
    expect(zeroKi?.usePoweredKi).toBe(false);
    expect(fullKi?.stepIndex).toBe(2);
    expect(Boolean(fullKi?.forcedCommand === medium.steps[2].kiCommand || fullKi?.usePoweredKi)).toBe(true);
    expect(resolveBeginnerRouteStep(character, ['medium'], 'light', 0, medium.id)).toBeNull();
  });

  it('requires authored movement bridges to be performed by the player', () => {
    const idleState = { dashForwardFrames: 0, backHopFrames: 0, state: 'idle', position: { y: 0 }, velocityY: 0 };
    expect(beginnerMovementSatisfied('dashForward', idleState, inputFrame({}))).toBe(false);
    expect(beginnerMovementSatisfied('dashForward', idleState, inputFrame({ dashForward: true }))).toBe(true);
    expect(beginnerMovementSatisfied('dashBack', { ...idleState, backHopFrames: 2 }, inputFrame({}))).toBe(true);
    expect(beginnerMovementSatisfied('jump', { ...idleState, state: 'jump', position: { y: 0.2 } }, inputFrame({}))).toBe(true);
    expect(beginnerMovementSatisfied('neutral', idleState, inputFrame({}))).toBe(true);
    expect(beginnerMovementSatisfied('neutral', idleState, inputFrame({ right: true }))).toBe(false);
  });

  it('checks every playable fighter has complete, real, bounded route metadata', () => {
    const characters = readPlayableRoster();
    expect(characters).toHaveLength(125);

    for (const character of characters) {
      const routes = character.beginnerComboRoutes ?? [];
      const core = routes.filter((route) => route.family === 'core');
      const mixed = routes.filter((route) => route.family === 'mixed');
      expect(core, character.id).toHaveLength(4);
      expect(mixed.length, character.id).toBeGreaterThanOrEqual(4);

      const coreGestures: BeginnerComboGesture[] = ['light', 'medium', 'heavy', 'special'];
      for (const gesture of coreGestures) {
        const route = core.find((candidate) => candidate.gestures.every((item) => item === gesture));
        expect(route, `${character.id}:${gesture}`).toBeTruthy();
        expect(route?.steps, `${character.id}:${gesture}`).toHaveLength(3);
        expect(route?.steps[route.steps.length - 1]?.expect, `${character.id}:${gesture}`).toBe('knockdown');
        if (gesture === 'light') {
          expect(route?.steps.every((step) => !step.kiCommand && !step.poweredKiFallback), character.id).toBe(true);
        }
      }

      for (const chord of ['special+light', 'special+medium', 'special+heavy'] as BeginnerComboGesture[]) {
        expect(mixed.some((route) => route.gestures.includes(chord)), `${character.id}:${chord}`).toBe(true);
      }

      for (const route of routes) {
        expect(route.steps.length, route.id).toBeGreaterThanOrEqual(3);
        expect(route.steps.length, route.id).toBeLessThanOrEqual(6);
        expect(route.steps[route.steps.length - 1]?.expect, route.id).toBe('knockdown');
        expect(route.steps.filter((step) => step.kiCommand || step.poweredKiFallback).length, route.id).toBeLessThanOrEqual(1);
        for (const step of route.steps) {
          expect(step.label.trim().length, route.id).toBeGreaterThan(0);
          expect(step.windowBefore, route.id).toBeGreaterThan(0);
          expect(step.windowAfter, route.id).toBeGreaterThan(0);
          expect(character.animationFrames?.[step.animationKey]?.length, `${route.id}:${step.animationKey}`).toBeGreaterThan(0);
          if (step.kiAnimationKey) {
            expect(character.animationFrames?.[step.kiAnimationKey]?.length, `${route.id}:${step.kiAnimationKey}`).toBeGreaterThan(0);
            expect(step.kiCost, route.id).toBeGreaterThanOrEqual(0);
          } else if (step.poweredKiFallback) {
            expect(BEGINNER_AUTO_COMBO_KI_COST).toBe(35);
          }
        }
      }
    }
  });
});
