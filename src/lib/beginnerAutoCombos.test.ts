import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BeginnerComboGesture, CharacterDefinition, InputFrame } from '../types';
import { emptyInputFrame } from '../types';
import {
  BEGINNER_AUTO_COMBO_INPUTS,
  BEGINNER_AUTO_COMBO_KI_COST,
  BEGINNER_SPECIAL_CHORD_GRACE_FRAMES,
  beginnerRouteSteps,
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
  it('uses eight-hit attack chains and a six-frame Special chord grace', () => {
    expect(BEGINNER_AUTO_COMBO_INPUTS).toEqual(Array(8).fill('jab'));
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
    expect(resolveBeginnerGesture(inputFrame({ right: true, jab: true }), 'jab', 1)).toBe('forward+light');
    expect(resolveBeginnerGesture(inputFrame({ down: true, jab: true }), 'jab')).toBe('down+light');
    expect(resolveBeginnerGesture(inputFrame({ down: true, right: true, special: true, kick: true }), 'kick', 1)).toBe('down-forward+special+heavy');
  });

  it('resolves only matching confirmed prefixes and preserves insufficient-Ki fallbacks', () => {
    const character = readPlayableRoster().find((candidate) =>
      candidate.beginnerComboRoutes?.some((route) => beginnerRouteSteps(candidate, route).some((step) => step.kiCommand || step.poweredKiFallback))
    );
    expect(character).toBeTruthy();
    if (!character) return;
    const medium = character.beginnerComboRoutes!.find((route) => route.id.endsWith('medium-core'))!;
    const first = resolveBeginnerRouteStep(character, [], 'medium', 0);
    const second = resolveBeginnerRouteStep(character, ['medium'], 'medium', 0, medium.id, first?.nextGraphNodeId);
    let node = second?.nextGraphNodeId;
    let zeroKi = second;
    let fullKi = second;
    for (let index = 2; index < 8; index += 1) {
      zeroKi = resolveBeginnerRouteStep(character, Array(index).fill('medium'), 'medium', 0, medium.id, node);
      fullKi = resolveBeginnerRouteStep(character, Array(index).fill('medium'), 'medium', 100, medium.id, node);
      node = zeroKi?.nextGraphNodeId;
    }

    expect(first?.stepIndex).toBe(0);
    expect(second?.stepIndex).toBe(1);
    const mediumSteps = beginnerRouteSteps(character, medium);
    expect(zeroKi?.stepIndex).toBe(7);
    expect(zeroKi?.forcedCommand).toBe(mediumSteps[7].command);
    expect(zeroKi?.usePoweredKi).toBe(false);
    expect(fullKi?.stepIndex).toBe(7);
    expect(Boolean(fullKi?.forcedCommand === mediumSteps[7].kiCommand || fullKi?.usePoweredKi)).toBe(true);
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
      const advanced = routes.filter((route) => route.family === 'advanced');
      expect(core, character.id).toHaveLength(4);
      expect(mixed.length, character.id).toBeGreaterThanOrEqual(4);
      expect(routes.length, character.id).toBeGreaterThanOrEqual(15);
      expect(character.beginnerComboGraph?.version, character.id).toBe(2);
      expect(advanced.length + mixed.length, character.id).toBeGreaterThanOrEqual(11);

      const coreGestures: BeginnerComboGesture[] = ['light', 'medium', 'heavy', 'special'];
      for (const gesture of coreGestures) {
        const route = core.find((candidate) => candidate.gestures.every((item) => item === gesture));
        expect(route, `${character.id}:${gesture}`).toBeTruthy();
        const steps = route ? beginnerRouteSteps(character, route) : [];
        expect(steps, `${character.id}:${gesture}`).toHaveLength(gesture === 'special' ? 3 : 8);
        expect(steps[steps.length - 1]?.expect, `${character.id}:${gesture}`).toBe('knockdown');
        if (gesture === 'light') {
          expect(steps.every((step) => !step.kiCommand && !step.poweredKiFallback), character.id).toBe(true);
        }
      }

      for (const chord of ['special+light', 'special+medium', 'special+heavy'] as BeginnerComboGesture[]) {
        expect(mixed.some((route) => route.gestures.includes(chord)), `${character.id}:${chord}`).toBe(true);
      }
      for (const gesture of ['forward+light', 'down+medium', 'down-forward+heavy', 'forward+special+light', 'down+special+medium', 'down-forward+special+heavy'] as BeginnerComboGesture[]) {
        expect(routes.some((route) => route.gestures.includes(gesture)), `${character.id}:${gesture}`).toBe(true);
      }
      for (const [nodeId, node] of Object.entries(character.beginnerComboGraph?.nodes ?? {})) {
        expect(routes.some((route) => route.id === node.routeId), `${character.id}:${nodeId}:route`).toBe(true);
        for (const target of Object.values(node.edges)) {
          expect(character.beginnerComboGraph?.nodes[target!], `${character.id}:${nodeId}:${target}`).toBeTruthy();
        }
      }

      for (const route of routes) {
        const steps = beginnerRouteSteps(character, route);
        expect(steps.length, route.id).toBeGreaterThanOrEqual(3);
        expect(steps.length, route.id).toBeLessThanOrEqual(30);
        if (route.family === 'core') expect(steps[steps.length - 1]?.expect, route.id).toBe('knockdown');
        expect(steps.reduce((total, step) => total + (step.kiCost ?? 0), 0), route.id).toBeLessThanOrEqual(100);
        for (const step of steps) {
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

    const sasuke = characters.find((character) => character.id === 'riven');
    expect(sasuke?.beginnerComboRoutes?.filter((route) => route.family === 'advanced').length).toBeGreaterThanOrEqual(106);
    expect(Math.max(...(sasuke?.beginnerComboRoutes ?? []).map((route) => beginnerRouteSteps(sasuke!, route).length))).toBeGreaterThanOrEqual(22);
    expect(sasuke?.beginnerComboRoutes?.some((route) => route.gestures.slice(0, 7).every((gesture) => gesture === 'light') && route.gestures[7] === 'medium' && route.steps?.length !== 8)).toBe(true);
  });
});
