import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CharacterDefinition, MoveInput } from '../types';
import {
  cpuMoveFamilyKeyFromStep,
  cpuMoveVisualFamilyKeyFromStep,
  generateCharacterComboRoutes,
  recommendCpuComboRoute,
  resolveMoveRoutes
} from './comboRoutes';
import { commandFamilyKey } from './commandRoutes';

const repoRoot = process.cwd();

function readRosterCharacters() {
  const charactersDir = join(repoRoot, 'public', 'characters');
  return readdirSync(charactersDir)
    .map((id) => join(charactersDir, id, 'character.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as CharacterDefinition);
}

function moveForStep(character: CharacterDefinition, step: { routeKey?: string; command?: string; input: string }) {
  const routes = resolveMoveRoutes(character);
  return routes.find((route) =>
    step.routeKey ? route.routeKey === step.routeKey : step.command ? route.command === step.command : !route.command && route.input === step.input
  )?.move ?? null;
}

function stepIdentity(step: { routeKey?: string; command?: string; input: string }) {
  return step.routeKey ?? step.command ?? `neutral:${step.input}`;
}

function stepFamily(step: { family?: string; command?: string; input: string }) {
  return commandFamilyKey(step.command, step.input as MoveInput);
}

function stepRequiresAirChase(character: CharacterDefinition, step: { command?: string; input: string; notation?: string[] }) {
  const move = moveForStep(character, step);
  return Boolean(
    move?.jumpBeforeMove ||
    move?.tracking === 'homing' ||
    step.notation?.some((token) => {
      const normalized = token.toLowerCase();
      return normalized === 'u' || normalized.includes('u/') || normalized.includes('/u');
    }) ||
    (step.command && /(^|[+,_])u([+,_]|$)|(^|[+,_])u\/[bf]([+,_]|$)/.test(step.command.toLowerCase()))
  );
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

  it('uses reviewed move labels in routes and combo titles', () => {
    const yusuke = readRosterCharacters().find((character) => character.id === 'yusuke-urameshi');
    expect(yusuke).toBeTruthy();
    if (!yusuke) return;

    const routes = resolveMoveRoutes(yusuke);
    expect(routes.find((route) => route.command === 'qcf+4')?.label).toBe('Spirit Gun Burst');
    expect(routes.some((route) => /Frame Link/.test(route.label))).toBe(false);

    const comboRoutes = generateCharacterComboRoutes(yusuke);
    const spiritGunRoute = comboRoutes.find((route) => route.steps[0]?.label === 'Spirit Gun Burst');
    expect(spiritGunRoute?.title).toContain('Spirit Gun Burst');
    expect(spiritGunRoute?.title).not.toContain('qcf+4');
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
    expect(allRoutes.some(({ route }) => route.tier === 'marathon' && route.estimatedHits >= 21)).toBe(true);

    for (const { character, route } of allRoutes) {
      const identities = route.steps.map(stepIdentity);
      expect(route.steps.length, `${character.id}:${route.id}`).toBeLessThanOrEqual(30);
      expect(route.estimatedHits, `${character.id}:${route.id}`).toBe(route.steps.length);
      expect(route.estimatedDamage, `${character.id}:${route.id}:estimatedDamage`).toBeGreaterThan(0);
      expect(route.rewardClass, `${character.id}:${route.id}:rewardClass`).toBeTruthy();
      expect(route.structure, `${character.id}:${route.id}:structure`).toContain('starter');
      expect(route.targetHits, `${character.id}:${route.id}`).toBeLessThanOrEqual(30);
      expect(new Set(identities).size, `${character.id}:${route.id}:exact-identities`).toBe(identities.length);
      for (let index = 1; index < route.steps.length; index += 1) {
        const previous = route.steps[index - 1];
        const current = route.steps[index];
        expect(current.command ?? current.input, `${character.id}:${route.id}:step-${index}`).not.toBe(previous.command ?? previous.input);
      }
    }
  });

  it('describes route reward and structure from real route properties', () => {
    const routes = readRosterCharacters().flatMap((character) =>
      generateCharacterComboRoutes(character).map((route) => ({ character, route }))
    );
    expect(routes.some(({ route }) => route.rewardClass === 'launcher' || route.rewardClass === 'tornado')).toBe(true);
    expect(routes.some(({ route }) => route.tier === 'marathon' && route.rewardClass === 'marathon')).toBe(true);

    for (const { character, route } of routes) {
      if (route.category === 'launcher') {
        expect(route.structure, `${character.id}:${route.id}`).toContain('launcher');
      }
      if (route.category === 'tornado') {
        expect(route.structure, `${character.id}:${route.id}`).toContain('tornado');
      }
      if (route.requiresKi) {
        expect(route.structure, `${character.id}:${route.id}`).toContain('ki');
      }
      expect(route.reason, `${character.id}:${route.id}`).toContain('dmg');
    }
  });

  it('keeps long routes diverse by move identity and command family', () => {
    const longRoutes = readRosterCharacters().flatMap((character) =>
      generateCharacterComboRoutes(character)
        .filter((route) => route.tier === 'long' || route.tier === 'marathon')
        .map((route) => ({ character, route }))
    );
    expect(longRoutes.length).toBeGreaterThan(0);

    for (const { character, route } of longRoutes) {
      const identities = route.steps.map(stepIdentity);
      const families = route.steps.map(stepFamily);
      const uniqueIdentities = new Set(identities);
      const uniqueFamilies = new Set(families);
      const minimumUniqueIdentities = route.tier === 'marathon' ? Math.min(12, Math.ceil(route.steps.length * 0.52)) : Math.min(8, Math.ceil(route.steps.length * 0.6));
      const minimumUniqueFamilies = route.tier === 'marathon' ? Math.min(6, route.steps.length) : Math.min(5, route.steps.length);

      expect(uniqueIdentities.size, `${character.id}:${route.id}`).toBeGreaterThanOrEqual(minimumUniqueIdentities);
      expect(uniqueFamilies.size, `${character.id}:${route.id}`).toBeGreaterThanOrEqual(minimumUniqueFamilies);
      for (let index = 1; index < route.steps.length; index += 1) {
        expect(families[index], `${character.id}:${route.id}:family-${index}`).not.toBe(families[index - 1]);
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
      const tornadoIdentities = route.steps
        .filter((step) => moveForStep(character, step)?.tornado)
        .map(stepIdentity);
      expect(launchSteps.length, `${character.id}:${route.id}`).toBeLessThanOrEqual(1);
      expect(new Set(tornadoIdentities).size, `${character.id}:${route.id}:tornado-identities`).toBe(tornadoIdentities.length);
    }
  });

  it('generates grounded launcher routes without jump-chase followups', () => {
    const groundedLauncherRoutes = readRosterCharacters().flatMap((character) =>
      generateCharacterComboRoutes(character)
        .filter((route) => route.category === 'launcher' && route.launchRouteStyle === 'grounded')
        .map((route) => ({ character, route }))
    );
    expect(groundedLauncherRoutes.length).toBeGreaterThan(0);

    for (const { character, route } of groundedLauncherRoutes) {
      expect(route.title, `${character.id}:${route.id}`).toContain('Grounded Launcher');
      expect(route.reason, `${character.id}:${route.id}`).toContain('Grounded Launch');
      expect(moveForStep(character, route.steps[0])?.launchHeight ?? 0, `${character.id}:${route.id}`).toBeGreaterThan(0);
      expect(route.steps.some((step) => stepRequiresAirChase(character, step)), `${character.id}:${route.id}`).toBe(false);
    }
  });

  it('keeps authored air-chase launcher routes available when jump-capable followups exist', () => {
    const airChaseCapable = readRosterCharacters().filter((character) => {
      const routes = resolveMoveRoutes(character);
      return routes.some((route) => (route.move.launchHeight ?? 0) > 0) &&
        routes.some((route) => route.move.jumpBeforeMove || route.move.tracking === 'homing' || route.notation.some((token) => token === 'u' || token.includes('u/')));
    });
    const airChaseRoutes = airChaseCapable.flatMap((character) =>
      generateCharacterComboRoutes(character).filter((route) => route.category === 'launcher' && route.launchRouteStyle === 'airChase')
    );
    expect(airChaseCapable.length).toBeGreaterThan(0);
    expect(airChaseRoutes.length).toBeGreaterThan(0);
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
      const stanceStep = trial.steps.find((step) => step.command?.match(/^(FC|WS)\+/));
      expect(stanceStep?.command, `${character.id}:${trial.id}`).toMatch(/^(FC|WS)\+/);
      expect(character.animationFrames?.[`cmd:${stanceStep?.command}`]?.length, `${character.id}:${stanceStep?.command}`).toBeGreaterThan(0);
    }
  });

  it('covers the expanded command route families from real command frames', () => {
    const familyCatalog = readRosterCharacters().flatMap((character) =>
      resolveMoveRoutes(character)
        .filter((route) => route.command)
        .map((route) => ({ character, route }))
    );
    expect(familyCatalog.length).toBeGreaterThan(0);

    const families = new Set(familyCatalog.map(({ route }) => route.family));
    for (const family of ['direction', 'motion', 'sidestep', 'crouch', 'ki', 'chord']) {
      expect(families.has(family as never), family).toBe(true);
    }
    for (const { character, route } of familyCatalog) {
      expect(character.animationFrames?.[route.animationKey]?.length, `${character.id}:${route.animationKey}`).toBeGreaterThan(0);
      expect(route.routeKey, `${character.id}:${route.id}`).toContain(route.animationKey);
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

  it('keeps KORE marathon route recommendations rare during ordinary juggle openings', () => {
    const character = readRosterCharacters().find((candidate) => {
      const routes = generateCharacterComboRoutes(candidate);
      return routes.some((route) => route.tier === 'marathon') && routes.some((route) => route.tier === 'short' || route.tier === 'medium');
    });
    expect(character).toBeTruthy();
    if (!character) return;

    let total = 0;
    let marathon = 0;
    let shortOrMedium = 0;
    for (let index = 0; index < 300; index += 1) {
      const recommendation = recommendCpuComboRoute(character, {
        difficulty: 5,
        opening: 'juggle',
        remainingFrames: 38,
        comboStep: 1,
        selector: index * 7,
        routeRoll: index * 17
      });
      if (!recommendation) continue;
      total += 1;
      if (recommendation.route.tier === 'marathon') marathon += 1;
      if (recommendation.route.tier === 'short' || recommendation.route.tier === 'medium') shortOrMedium += 1;
    }

    expect(total).toBeGreaterThan(60);
    expect(shortOrMedium).toBeGreaterThan(marathon * 3);
    expect(marathon).toBeLessThanOrEqual(Math.max(4, Math.floor(total * 0.16)));
  });

  it('continues a committed KORE marathon route instead of re-rolling ambition mid-route', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateCharacterComboRoutes(candidate).some((route) => route.tier === 'marathon' && route.steps.length >= 4)
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const route = generateCharacterComboRoutes(character).find((candidate) => candidate.tier === 'marathon' && candidate.steps.length >= 4);
    expect(route).toBeTruthy();
    if (!route) return;

    const recommendation = recommendCpuComboRoute(character, {
      difficulty: 5,
      opening: 'juggle',
      remainingFrames: 48,
      comboStep: 2,
      activeRouteId: route.id,
      usedKeys: route.steps.slice(0, 2).map(stepIdentity),
      selector: 99,
      routeRoll: 99
    });

    expect(recommendation?.route.id).toBe(route.id);
    expect(recommendation?.stepIndex).toBe(2);
  });

  it('prefers grounded launcher recommendations over air chase after a juggle opening', () => {
    const character = readRosterCharacters().find((candidate) => {
      const routes = generateCharacterComboRoutes(candidate);
      return routes.some((route) => route.category === 'launcher' && route.launchRouteStyle === 'grounded') &&
        routes.some((route) => route.category === 'launcher' && route.launchRouteStyle === 'airChase');
    });
    expect(character).toBeTruthy();
    if (!character) return;

    let grounded = 0;
    let airChase = 0;
    for (let index = 0; index < 120; index += 1) {
      const recommendation = recommendCpuComboRoute(character, {
        difficulty: 5,
        opening: 'juggle',
        remainingFrames: 34,
        comboStep: 1,
        selector: index * 7,
        routeRoll: index * 17
      });
      if (recommendation?.route.launchRouteStyle === 'grounded') grounded += 1;
      if (recommendation?.route.launchRouteStyle === 'airChase') airChase += 1;
    }

    expect(grounded).toBeGreaterThan(airChase);
  });

  it('keeps committed high-difficulty CPU recommendations on the active route step order', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateCharacterComboRoutes(candidate).some((route) => route.steps.length >= 4)
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const route = generateCharacterComboRoutes(character).find((candidate) =>
      candidate.steps.length >= 4 &&
      new Set(candidate.steps.slice(0, 3).map(stepIdentity)).size === 3 &&
      new Set(candidate.steps.slice(0, 3).map(stepFamily)).size === 3
    );
    expect(route).toBeTruthy();
    if (!route) return;

    const recommendation = recommendCpuComboRoute(character, {
      difficulty: 5,
      opening: 'hitstun',
      remainingFrames: 40,
      comboStep: 2,
      activeRouteId: route.id,
      usedKeys: route.steps.slice(0, 2).map(stepIdentity),
      selector: 0,
      routeRoll: 0
    });

    expect(recommendation?.route.id).toBe(route.id);
    expect(recommendation?.stepIndex).toBe(2);
    expect(stepIdentity(recommendation!.step)).toBe(stepIdentity(route.steps[2]));
  });

  it('drops stale CPU catalog route steps instead of repeating a move identity', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateCharacterComboRoutes(candidate).some((route) => route.steps.length >= 3)
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const route = generateCharacterComboRoutes(character).find((candidate) => candidate.steps.length >= 3);
    expect(route).toBeTruthy();
    if (!route) return;

    const repeatedStep = route.steps[1];
    const recommendation = recommendCpuComboRoute(character, {
      difficulty: 5,
      opening: 'hitstun',
      remainingFrames: 40,
      comboStep: 1,
      activeRouteId: route.id,
      usedKeys: [stepIdentity(repeatedStep)],
      selector: 0,
      routeRoll: 0
    });

    expect(recommendation?.route.id).not.toBe(route.id);
  });

  it('rejects stale CPU juggle recommendations by family and visual family', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateCharacterComboRoutes(candidate).some((route) => route.steps.length >= 2 && route.steps[1].expect?.juggled)
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const route = generateCharacterComboRoutes(character).find((candidate) => candidate.steps.length >= 2 && candidate.steps[1].expect?.juggled);
    expect(route).toBeTruthy();
    if (!route) return;

    const staleStep = route.steps[1];
    const recommendation = recommendCpuComboRoute(character, {
      difficulty: 5,
      opening: 'juggle',
      remainingFrames: 48,
      comboStep: 1,
      activeRouteId: route.id,
      usedFamilies: [cpuMoveFamilyKeyFromStep(staleStep)],
      usedVisualFamilies: [cpuMoveVisualFamilyKeyFromStep(staleStep)],
      selector: 0,
      routeRoll: 0
    });

    expect(recommendation?.route.id).not.toBe(route.id);
    expect(recommendation && cpuMoveVisualFamilyKeyFromStep(recommendation.step)).not.toBe(cpuMoveVisualFamilyKeyFromStep(staleStep));
  });
});
