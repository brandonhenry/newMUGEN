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
});
