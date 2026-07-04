import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition } from '../types';
import { generateCharacterComboRoutes, recommendCpuComboRoute, resolveMoveRoutes } from './comboRoutes';

const repoRoot = process.cwd();

function readRosterCharacters() {
  const charactersDir = join(repoRoot, 'public', 'characters');
  return readdirSync(charactersDir)
    .map((id) => join(charactersDir, id, 'character.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as CharacterDefinition);
}

function moveForStep(character: CharacterDefinition, step: { command?: string; input: string }) {
  const routes = resolveMoveRoutes(character);
  return routes.find((route) => step.command ? route.command === step.command : !route.command && route.input === step.input)?.move ?? null;
}

describe('combo route catalog', () => {
  it('builds route catalogs from real character animations', () => {
    const characters = readRosterCharacters();
    expect(characters.length).toBeGreaterThan(0);

    let routableCharacters = 0;
    for (const character of characters.filter((candidate) => Object.keys(candidate.animationFrames ?? {}).length > 0)) {
      const routes = resolveMoveRoutes(character);
      if (routes.length === 0) continue;
      routableCharacters += 1;
      for (const route of routes) {
        expect(character.animationFrames?.[route.animationKey]?.length, `${character.id}:${route.animationKey}`).toBeGreaterThan(0);
      }
    }
    expect(routableCharacters).toBeGreaterThan(0);
  });

  it('never turns neutral 1/2/3/4 into counter-hit trial starters', () => {
    for (const character of readRosterCharacters()) {
      const trials = generateCharacterComboRoutes(character).filter((trial) => trial.category === 'counterHit');
      for (const trial of trials) {
        const starter = trial.steps[0];
        expect(['1', '2', '3', '4']).not.toContain(starter.command);
        expect(starter.counterHit, `${character.id}:${trial.id}`).toBe(true);
      }
    }
  });

  it('uses actual launch and tornado properties for route categories', () => {
    const characters = readRosterCharacters();
    const launcherTrials = characters.flatMap((character) =>
      generateCharacterComboRoutes(character)
        .filter((trial) => trial.category === 'launcher')
        .map((trial) => ({ character, trial }))
    );
    expect(launcherTrials.length).toBeGreaterThan(0);
    for (const { character, trial } of launcherTrials) {
      const starterMove = moveForStep(character, trial.steps[0]);
      expect(starterMove?.launchHeight ?? 0, `${character.id}:${trial.id}`).toBeGreaterThan(0);
      expect(trial.steps[0].expect?.launched, `${character.id}:${trial.id}`).toBe(true);
    }

    const tornadoTrials = characters.flatMap((character) =>
      generateCharacterComboRoutes(character)
        .filter((trial) => trial.category === 'tornado')
        .map((trial) => ({ character, trial }))
    );
    expect(tornadoTrials.length).toBeGreaterThan(0);
    for (const { trial } of tornadoTrials) {
      expect(trial.steps.some((step) => step.expect?.tornado)).toBe(true);
    }
  });

  it('generates bounded multi-hit routes without exceeding the 30-hit ceiling', () => {
    const allRoutes = readRosterCharacters().flatMap((character) =>
      generateCharacterComboRoutes(character).map((route) => ({ character, route }))
    );
    expect(allRoutes.some(({ route }) => route.steps.length > 3)).toBe(true);
    expect(allRoutes.some(({ route }) => route.tier === 'marathon' && route.estimatedHits === 30)).toBe(true);

    for (const { character, route } of allRoutes) {
      expect(route.steps.length, `${character.id}:${route.id}`).toBeLessThanOrEqual(30);
      expect(route.estimatedHits, `${character.id}:${route.id}`).toBe(route.steps.length);
      expect(route.targetHits, `${character.id}:${route.id}`).toBeLessThanOrEqual(30);
      for (let index = 1; index < route.steps.length; index += 1) {
        const previous = route.steps[index - 1];
        const current = route.steps[index];
        expect(current.command ?? current.input, `${character.id}:${route.id}:step-${index}`).not.toBe(previous.command ?? previous.input);
      }
    }
  });

  it('keeps launcher marathon routes varied instead of repeating launchers', () => {
    const launcherRoutes = readRosterCharacters().flatMap((character) =>
      generateCharacterComboRoutes(character)
        .filter((route) => route.category === 'launcher' || route.category === 'tornado')
        .map((route) => ({ character, route }))
    );
    expect(launcherRoutes.some(({ route }) => route.estimatedHits >= 21)).toBe(true);

    for (const { character, route } of launcherRoutes) {
      const launchSteps = route.steps.filter((step) => (moveForStep(character, step)?.launchHeight ?? 0) > 0);
      expect(launchSteps.length, `${character.id}:${route.id}`).toBeLessThanOrEqual(1);
    }
  });

  it('does not fake routes for characters without real attack animation frames', () => {
    const byId = new Map(readRosterCharacters().map((character) => [character.id, character]));
    for (const id of ['astra', 'dax', 'taizo-momote']) {
      const character = byId.get(id);
      expect(character, id).toBeTruthy();
      if (!character) continue;
      expect(resolveMoveRoutes(character), id).toHaveLength(0);
      const attackFrameCounts = ['jableft', 'jabright', 'kickleft', 'kickright']
        .map((key) => character.animationFrames?.[key]?.length ?? 0);
      expect(attackFrameCounts.every((count) => count === 0), id).toBe(true);
    }
  });

  it('only creates crouch routes from real FC or WS command steps', () => {
    const crouchTrials = readRosterCharacters().flatMap((character) =>
      generateCharacterComboRoutes(character)
        .filter((trial) => trial.category === 'crouch')
        .map((trial) => ({ character, trial }))
    );
    expect(crouchTrials.length).toBeGreaterThan(0);
    for (const { character, trial } of crouchTrials) {
      const followup = trial.steps[1];
      expect(followup.command, `${character.id}:${trial.id}`).toMatch(/^(FC|WS)\+/);
      expect(character.animationFrames?.[`cmd:${followup.command}`]?.length, `${character.id}:${followup.command}`).toBeGreaterThan(0);
    }
  });

  it('scales CPU route catalog usage by difficulty', () => {
    const character = readRosterCharacters().find((candidate) => generateCharacterComboRoutes(candidate).length >= 8);
    expect(character).toBeTruthy();
    if (!character) return;

    let easyUses = 0;
    let koreUses = 0;
    for (let index = 0; index < 60; index += 1) {
      if (recommendCpuComboRoute(character, { difficulty: 1, opening: 'hitstun', remainingFrames: 24, comboStep: 1, selector: index * 7, routeRoll: index * 11 })) {
        easyUses += 1;
      }
      if (recommendCpuComboRoute(character, { difficulty: 5, opening: 'hitstun', remainingFrames: 24, comboStep: 1, selector: index * 7, routeRoll: index * 11 })) {
        koreUses += 1;
      }
    }

    expect(koreUses).toBeGreaterThan(easyUses);
  });

  it('gates CPU route tiers by difficulty', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateCharacterComboRoutes(candidate).some((route) => route.tier === 'marathon')
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const collect = (difficulty: 1 | 2 | 3 | 4 | 5) => {
      const recommendations = [];
      for (let index = 0; index < 80; index += 1) {
        const recommendation = recommendCpuComboRoute(character, {
          difficulty,
          opening: 'juggle',
          remainingFrames: 32,
          comboStep: 8,
          selector: index * 9,
          routeRoll: index * 13
        });
        if (recommendation) recommendations.push(recommendation.route);
      }
      return recommendations;
    };

    expect(collect(1).every((route) => route.tier === 'short')).toBe(true);
    expect(collect(2).every((route) => route.tier === 'short')).toBe(true);
    expect(collect(3).every((route) => route.tier !== 'long' && route.tier !== 'marathon')).toBe(true);
    expect(collect(4).every((route) => route.tier !== 'marathon')).toBe(true);
  });
});
