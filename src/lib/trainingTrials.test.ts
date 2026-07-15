import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CharacterDefinition, FighterRuntime, ImpactSparkEvent, InputFrameWithMetadata, MatchSnapshot, MoveProjectileInstance } from '../types';
import { emptyInputFrame } from '../types';
import { resolveMoveRoutes } from './comboRoutes';
import {
  TRAINING_TRIAL_STORAGE_KEY,
  advanceTrainingTrialWithImpact,
  advanceTrainingTrialWithInput,
  generateBasicTrainingTrials,
  generateComboTrainingTrials,
  makeMovePreviewScript,
  makePreviewInput,
  makeTrainingTrialProgress,
  previewScriptLength,
  readTrainingTrialCompletion,
  resolveNextTrainingTrial,
  trainingTrialCategoryLabels,
  writeTrainingTrialCompletion
} from './trainingTrials';

const repoRoot = process.cwd();

function readRosterCharacters() {
  const charactersDir = join(repoRoot, 'public', 'characters');
  return readdirSync(charactersDir)
    .map((id) => join(charactersDir, id, 'character.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as CharacterDefinition);
}

function hasAttackAnimation(character: CharacterDefinition) {
  const frames = character.animationFrames ?? {};
  return ['jableft', 'jabright', 'kickleft', 'kickright', 'jab', 'kick', 'heavy', 'special']
    .some((key) => (frames[key]?.length ?? 0) > 0);
}

function mockMatch(playerState: FighterRuntime['state'] = 'idle', dummyState: FighterRuntime['state'] = 'idle') {
  return {
    fighters: [
      { state: playerState, position: { x: -0.45, y: 0, z: 0 } } as FighterRuntime,
      { state: dummyState, position: { x: 0.45, y: 0, z: 0 } } as FighterRuntime
    ]
  } as MatchSnapshot;
}

function mockImpact(overrides: Partial<ImpactSparkEvent> = {}): ImpactSparkEvent {
  return {
    id: 1,
    kind: 'hit',
    position: [0, 1, 0],
    attackerSlot: 1,
    defenderSlot: 2,
    hitLevel: 'mid',
    damage: 10,
    moveLabel: 'Test Hit',
    moveInput: 'jab',
    ...overrides
  };
}

function routeForStep(routes: ReturnType<typeof resolveMoveRoutes>, step: ReturnType<typeof generateBasicTrainingTrials>[number]['steps'][number]) {
  return routes.find((item) => step.routeKey ? item.routeKey === step.routeKey : item.command === step.command || (!step.command && item.input === step.input));
}

function routeUsesKi(route: ReturnType<typeof resolveMoveRoutes>[number] | undefined) {
  return Boolean(route?.command?.startsWith('O+') || route?.move.usesKi || route?.move.kiBurst || route?.requiresKi);
}

function routeProjectileInstances(character: CharacterDefinition, route: ReturnType<typeof resolveMoveRoutes>[number] | undefined): MoveProjectileInstance[] {
  if (!route) return [];
  const keys = projectileMoveKeys(route);
  const instances = keys.flatMap((key) => character.moveProjectiles?.[key] ?? []);
  return instances.filter((instance, index) => instances.findIndex((candidate) => candidate.id === instance.id) === index);
}

function projectileMoveKeys(route: ReturnType<typeof resolveMoveRoutes>[number]) {
  const baseInputKeys: Record<string, string> = {
    jab: 'jableft',
    heavy: 'jabright',
    kick: 'kickleft',
    special: 'kickright',
    '1': 'jableft',
    '2': 'jabright',
    '3': 'kickleft',
    '4': 'kickright'
  };
  const commandKeys = route.command
    ? [route.command, route.command.startsWith('cmd:') ? route.command.slice(4) : `cmd:${route.command}`]
    : [];
  return [...new Set([
    route.animationKey,
    route.move.animationKey,
    ...commandKeys,
    route.move.comboKey,
    route.move.id,
    baseInputKeys[route.input],
    route.input
  ].filter((key): key is string => Boolean(key)))];
}

function projectileInstanceKind(character: CharacterDefinition, instance: MoveProjectileInstance) {
  return instance.kind ?? character.projectiles?.find((projectile) => projectile.id === instance.projectileId)?.kind ?? 'projectile';
}

function progressAtImpactFrame(trial: ReturnType<typeof generateBasicTrainingTrials>[number], frame = trial.steps[0]?.targetFrame ?? 18) {
  let progress = makeTrainingTrialProgress(trial)!;
  for (let index = 0; index < frame; index += 1) {
    progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch());
  }
  return progress;
}

describe('training trial catalog', () => {
  beforeEach(() => {
    window.localStorage.removeItem(TRAINING_TRIAL_STORAGE_KEY);
  });

  it('generates fundamentals for every routable playable character', () => {
    const roster = readRosterCharacters();
    const routable = roster.filter((character) => !character.unplayable && hasAttackAnimation(character));
    expect(routable.length).toBeGreaterThan(0);

    for (const character of routable) {
      const trials = generateBasicTrainingTrials(character, roster);
      expect(trials.length, character.id).toBeGreaterThanOrEqual(8);
      expect(trials.filter((trial) => trial.category === 'movement' || trial.category === 'defense').length, character.id).toBeGreaterThanOrEqual(5);
      expect(trials.some((trial) => trial.id.endsWith('movement:back-hop')), character.id).toBe(true);
      expect(trials.some((trial) => trial.id.endsWith('ki:transform')), character.id).toBe(true);
      expect(trials.some((trial) => trial.category === 'offense'), character.id).toBe(true);
      expect(trainingTrialCategoryLabels.offense).toBe('Offense');
      for (const trial of trials) {
        expect(trial.characterId).toBe(character.id);
        expect(trial.stageId).toBeTruthy();
        expect(trial.steps.length, trial.id).toBeGreaterThan(0);
        expect(trial.previewScript.length, trial.id).toBeGreaterThan(0);
      }
    }
  });

  it('teaches unsafe back hop in the basic movement list', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('movement:back-hop'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.title).toBe('Back Hop');
    expect(trial.steps[0]).toMatchObject({
      notation: ['b,b'],
      actions: ['dashBack'],
      requireState: 'jump'
    });
    expect(trial.lesson.toLowerCase()).toContain('unsafe');
    expect(trial.lesson.toLowerCase()).toContain('airtime');
    expect(trial.lesson.toLowerCase()).toContain('neutral');
    expect(trial.lesson.toLowerCase()).toContain('whiff bait');
    expect(trial.lesson.toLowerCase()).toContain('whiff punish');

    const previewInput = makePreviewInput(trial.previewScript, trial.previewScript[0].frame);
    expect(previewInput.dashBack).toBe(true);
  });

  it('teaches dedicated jump as a basic movement principle', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('movement:jump'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.title).toBe('Jump');
    expect(trial.steps[0]).toMatchObject({
      notation: ['JUMP'],
      actions: ['jump'],
      requireState: 'jump'
    });
    expect(trial.lesson).toContain('dedicated Jump binding');
    expect(trial.lesson).toContain('Up Hold Jumps');
    expect(trial.lesson.toLowerCase()).toContain('cannot guard');

    const previewInput = makePreviewInput(trial.previewScript, trial.previewScript[0].frame);
    expect(previewInput.jump).toBe(true);
    expect(previewInput.up).toBe(false);
  });

  it('adds basic offense drills for button feel, dash checks, and guarded pressure', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster);
    const byId = (suffix: string) => trials.find((trial) => trial.id.endsWith(suffix));
    const buttonFeel = byId('offense:button-feel');
    const dashCheck = byId('offense:dash-check');
    const guardedCheck = byId('offense:guarded-check');

    expect(buttonFeel?.category).toBe('offense');
    expect(buttonFeel?.steps.length).toBeGreaterThan(1);
    expect(buttonFeel?.steps.every((step) => step.kind === 'state' && step.requireState === 'attack')).toBe(true);
    expect(dashCheck?.steps.map((step) => step.kind)).toEqual(['state', 'impact']);
    expect(dashCheck?.steps[0]).toMatchObject({ actions: ['dashForward'], requireState: 'walk' });
    expect(guardedCheck?.setup.dummyScript).toBe('guard');
    expect(guardedCheck?.steps[0].expectImpactKinds).toEqual(['block']);
    expect(guardedCheck?.lesson.toLowerCase()).toContain('blocked');

    for (const trial of [buttonFeel, dashCheck, guardedCheck]) {
      expect(trial?.previewScript.length, trial?.id).toBeGreaterThan(0);
    }
  });

  it('requires the requested dash action instead of accepting shared walk state', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('movement:dash'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    const wrongInput = emptyInputFrame();
    wrongInput.left = true;
    let wrongProgress = makeTrainingTrialProgress(trial)!;
    let rightProgress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 13; frame += 1) {
      wrongProgress = advanceTrainingTrialWithInput(wrongProgress, trial, emptyInputFrame(), mockMatch());
      rightProgress = advanceTrainingTrialWithInput(rightProgress, trial, emptyInputFrame(), mockMatch());
    }

    wrongProgress = advanceTrainingTrialWithInput(wrongProgress, trial, wrongInput, mockMatch('walk'));
    expect(wrongProgress.completed).toBe(false);
    expect(wrongProgress.statuses[0]).toBe('current');

    const rightInput = emptyInputFrame();
    rightInput.dashForward = true;
    rightProgress = advanceTrainingTrialWithInput(rightProgress, trial, rightInput, mockMatch('walk'));
    expect(rightProgress.completed).toBe(true);
    expect(rightProgress.statuses[0]).toBe('perfect');
  });

  it('accepts physical forward-forward metadata for dash trials', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('movement:dash'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    let progress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 13; frame += 1) {
      progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch());
    }

    const input = emptyInputFrame() as InputFrameWithMetadata;
    input.right = true;
    input.__horizontalDashDirection = 'right';
    progress = advanceTrainingTrialWithInput(progress, trial, input, mockMatch('walk'));

    expect(progress.completed).toBe(true);
    expect(progress.succeeded).toBe(true);
  });

  it('accepts physical back-back metadata for back hop trials', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('movement:back-hop'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    let progress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 13; frame += 1) {
      progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch());
    }

    const input = emptyInputFrame() as InputFrameWithMetadata;
    input.left = true;
    input.__horizontalDashDirection = 'left';
    progress = advanceTrainingTrialWithInput(progress, trial, input, mockMatch('jump'));

    expect(progress.completed).toBe(true);
    expect(progress.succeeded).toBe(true);
  });

  it('accepts physical dash metadata for every dash-gated state trial step', () => {
    const roster = readRosterCharacters();
    const routable = roster.filter((character) => !character.unplayable && hasAttackAnimation(character));
    const checked: string[] = [];

    for (const character of routable) {
      const trials = [
        ...generateBasicTrainingTrials(character, roster),
        ...generateComboTrainingTrials(character)
      ];

      for (const trial of trials) {
        trial.steps.forEach((step, stepIndex) => {
          if (step.kind === 'impact') return;
          const needsForwardDash = step.actions.includes('dashForward');
          const needsBackDash = step.actions.includes('dashBack');
          if (!needsForwardDash && !needsBackDash) return;

          let progress = makeTrainingTrialProgress(trial)!;
          progress = {
            ...progress,
            stepIndex,
            stepFrame: (step.targetFrame ?? 12) - 1,
            statuses: progress.statuses.map((status, index) => index < stepIndex ? 'confirmed' : index === stepIndex ? 'current' : status),
            ratings: progress.ratings.map((rating, index) => index < stepIndex ? 'Confirmed' : rating)
          };

          const input = emptyInputFrame() as InputFrameWithMetadata;
          for (const action of step.actions) {
            if (action !== 'dashForward' && action !== 'dashBack') input[action] = true;
          }
          if (needsForwardDash) {
            input.right = true;
            input.__horizontalDashDirection = 'right';
          } else {
            input.left = true;
            input.__horizontalDashDirection = 'left';
          }

          const next = advanceTrainingTrialWithInput(
            progress,
            trial,
            input,
            mockMatch(step.requireState ?? 'walk', step.requireDummyState ?? 'idle')
          );

          checked.push(`${trial.id}:${step.id}`);
          expect(next.stepIndex > stepIndex || next.completed, `${trial.id}:${step.id}`).toBe(true);
        });
      }
    }

    expect(checked.length).toBeGreaterThan(0);
  });

  it('labels jump-in basics with the dedicated jump binding instead of up', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('jump:starter'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.steps[0]).toMatchObject({
      notation: ['JUMP', '1'],
      actions: ['jump', 'jab'],
      requireState: 'jump'
    });
    expect(trial.lesson).toContain('Jump binding');
    const previewInput = makePreviewInput(trial.previewScript, trial.previewScript[0].frame);
    expect(previewInput.jump).toBe(true);
    expect(previewInput.up).toBe(false);
  });

  it('teaches blocking fundamentals in the basic defense list', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster);
    const byId = (suffix: string) => trials.find((trial) => trial.id.endsWith(suffix));
    const standing = byId('defense:block');
    const low = byId('defense:crouch-block');
    const duck = byId('defense:duck-high');
    const sidestep = byId('defense:sidestep-linear');
    const switchTrial = byId('defense:guard-switch');
    const lowLimit = byId('defense:low-guard-limit');

    expect(standing?.lesson.toLowerCase()).toContain('unknown');
    expect(low?.lesson.toLowerCase()).toContain('lows');
    expect(low?.lesson.toLowerCase()).toContain('mids beat crouch block');
    expect(low?.steps[0].requireState).toBe('crouchBlock');
    expect(duck?.lesson.toLowerCase()).toContain('duck');
    expect(duck?.steps[0].actions).toEqual(['down']);
    expect(sidestep?.lesson.toLowerCase()).toContain('non-tracking');
    expect(sidestep?.steps[0].requireState).toBe('sidestep');
    expect(sidestep?.steps[0].actions).toEqual(['sidestepUp']);
    expect(switchTrial?.steps.map((step) => step.requireState)).toEqual(['block', 'crouchBlock']);
    expect(switchTrial?.lesson.toLowerCase()).toContain('stand guard');
    expect(switchTrial?.lesson.toLowerCase()).toContain('crouch block');
    expect(switchTrial?.lesson.toLowerCase()).toContain('mids beat crouch block');
    expect(lowLimit?.steps.map((step) => step.requireState)).toEqual(['crouchBlock', 'block']);
    expect(lowLimit?.lesson.toLowerCase()).toContain('mids beat crouch block');
  });

  it('teaches neutral control with back-hop, sidestep, block, anti-air, and whiff punish concepts', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster);
    const neutral = trials.find((trial) => trial.id.endsWith('defense:neutral-control'));
    const whiff = trials.find((trial) => trial.id.endsWith('punish:whiff'));
    expect(neutral).toBeTruthy();
    expect(whiff).toBeTruthy();
    if (!neutral || !whiff) return;

    expect(neutral.steps.map((step) => step.actions)).toEqual([
      ['dashBack'],
      ['sidestepUp'],
      ['block'],
      ['down', 'block']
    ]);
    const neutralLesson = neutral.lesson.toLowerCase();
    expect(neutralLesson).toContain('neutral');
    expect(neutralLesson).toContain('back-hop');
    expect(neutralLesson).toContain('whiff');
    expect(neutralLesson).toContain('sidestep');
    expect(neutralLesson).toContain('block');
    expect(neutralLesson).toContain('anti-air');
    expect(neutralLesson).toContain('whiff punish');

    const whiffLesson = whiff.lesson.toLowerCase();
    expect(whiffLesson).toContain('back-hop');
    expect(whiffLesson).toContain('sidestep');
    expect(whiffLesson).toContain('whiff');
  });

  it('keeps basic trial copy generic to KORE instead of source-game terminology', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const bannedTerms = ['guilty', 'strive', 'roman', 'burst', 'dust', 'tension', 'safe jump'];
    const copy = generateBasicTrainingTrials(character, roster)
      .flatMap((trial) => [trial.title, trial.lesson, trial.zoroLine, trial.successText, ...trial.steps.flatMap((step) => [step.label, step.reason ?? ''])])
      .join(' ')
      .toLowerCase();

    for (const term of bannedTerms) {
      expect(copy).not.toContain(term);
    }
  });

  it('skips character-specific fundamentals unless real route properties exist', () => {
    const roster = readRosterCharacters();
    for (const character of roster) {
      const routes = resolveMoveRoutes(character);
      const trials = generateBasicTrainingTrials(character, roster);
      for (const trial of trials) {
        if (trial.category === 'launcher') {
          const step = trial.steps[0];
          const route = routes.find((item) => step.routeKey ? item.routeKey === step.routeKey : item.command === step.command || (!step.command && item.input === step.input));
          expect(route?.move.launchHeight ?? 0, `${character.id}:${trial.id}`).toBeGreaterThan(0);
        }
        if (trial.category === 'tornado') {
          const step = trial.steps[0];
          const route = routes.find((item) => step.routeKey ? item.routeKey === step.routeKey : item.command === step.command || (!step.command && item.input === step.input));
          expect(route?.move.tornado, `${character.id}:${trial.id}`).toBe(true);
        }
        if (trial.category === 'crouch') {
          expect(trial.steps[0].command, `${character.id}:${trial.id}`).toMatch(/^(FC|WS)\+/);
        }
        if (trial.category === 'ki') {
          if (trial.id.endsWith('ki:perfect-block') || trial.id.endsWith('ki:charge') || trial.id.endsWith('ki:transform')) continue;
          const step = trial.steps[0];
          const route = routeForStep(routes, step);
          const hasProjectile = routeProjectileInstances(character, route).length > 0;
          expect(Boolean(routeUsesKi(route) || hasProjectile), `${character.id}:${trial.id}`).toBe(true);
        }
      }
    }
  });

  it('adds basics for ki charge, ki block, whiff punish, anti-air, block punish, and counter-hit fundamentals', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster);
    const byId = (suffix: string) => trials.find((trial) => trial.id.endsWith(suffix));

    expect(byId('ki:perfect-block')?.steps[0]).toMatchObject({
      expectImpactKinds: ['block'],
      expectImpactAttackerSlot: 2,
      expectImpactDefenderSlot: 1,
      requireImpactKiBurst: true
    });
    expect(byId('ki:charge')?.steps[0]).toMatchObject({
      actions: ['charge'],
      requireState: 'chargeKi',
      requireKiAtLeast: 8
    });
    expect(byId('ki:charge')?.steps[1]).toMatchObject({
      actions: [],
      requireState: 'idle',
      requireDisplayedKiAtLeast: 8
    });
    expect(byId('ki:charge')?.lesson.toLowerCase()).toContain('does not update in real time');
    expect(byId('ki:charge')?.lesson.toLowerCase()).toContain('release');
    expect(byId('ki:charge')?.lesson.toLowerCase()).toContain('overcharge');
    expect(byId('ki:transform')?.steps[0]).toMatchObject({
      actions: ['jab', 'heavy', 'kick', 'special']
    });
    expect(byId('punish:whiff')?.steps[0].expectImpactKinds).toEqual(['whiffPunish']);
    expect(byId('defense:block-punish')?.steps.map((step) => step.kind)).toEqual(['state', 'impact']);
    expect(byId('defense:block-punish')?.steps[1].expectImpactKinds).toEqual(['punish']);
    expect(byId('defense:anti-air')?.steps[0]).toMatchObject({
      expectImpactKinds: ['hit', 'counterHit'],
      requireAirborneDefender: true
    });
    expect(byId('punish:counter-hit')?.steps[0].expectImpactKinds).toEqual(['counterHit']);
  });

  it('starts transform-capable characters ready and requires a real transform', () => {
    const roster = readRosterCharacters();
    const base = roster.find((candidate) => hasAttackAnimation(candidate));
    const formSource = roster.find((candidate) => candidate.id !== base?.id && hasAttackAnimation(candidate)) ?? base;
    expect(base).toBeTruthy();
    expect(formSource).toBeTruthy();
    if (!base || !formSource) return;

    const transformBase: CharacterDefinition = {
      ...base,
      id: 'trial-transform-base',
      displayName: 'Trial Transform Base',
      hasTransform: true,
      transformCharacterId: 'trial-transform-form'
    };
    const transformForm: CharacterDefinition = {
      ...formSource,
      id: 'trial-transform-form',
      displayName: 'Trial Transform Form',
      hasTransform: false,
      transformCharacterId: undefined
    };
    const trial = generateBasicTrainingTrials(transformBase, [transformBase, transformForm]).find((item) => item.id.endsWith('ki:transform'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.category).toBe('ki');
    expect(trial.title).toBe('Transform');
    expect(trial.setup).toMatchObject({
      p1Ki: 100,
      p1TransformOvercharge: 100,
      p1TransformReadyTimer: 3
    });
    expect(trial.steps[0]).toMatchObject({
      notation: ['1+2+3+4'],
      actions: ['jab', 'heavy', 'kick', 'special'],
      requireState: 'transform'
    });
    expect(trial.lesson.toLowerCase()).toContain('overcharge');
    expect(trial.lesson.toLowerCase()).toContain('second transform bar');
    expect(trial.lesson).toContain('1+2+3+4');

    const previewInput = makePreviewInput(trial.previewScript, trial.previewScript[0].frame);
    expect(previewInput.jab).toBe(true);
    expect(previewInput.heavy).toBe(true);
    expect(previewInput.kick).toBe(true);
    expect(previewInput.special).toBe(true);
  });

  it('keeps transform lessons informational for characters without a valid form', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('ki:transform'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.setup.p1Ki).toBeUndefined();
    expect(trial.setup.p1TransformOvercharge).toBeUndefined();
    expect(trial.setup.p1TransformReadyTimer).toBeUndefined();
    expect(trial.steps[0]).toMatchObject({
      actions: ['jab', 'heavy', 'kick', 'special'],
      requireState: undefined
    });
    expect(trial.lesson.toLowerCase()).toContain('some characters can transform');
    expect(trial.lesson.toLowerCase()).toContain('second transform bar');

    const input = emptyInputFrame();
    input.jab = true;
    input.heavy = true;
    input.kick = true;
    input.special = true;
    let progress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 13; frame += 1) {
      progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch());
    }
    progress = advanceTrainingTrialWithInput(progress, trial, input, mockMatch('idle'));
    expect(progress.completed).toBe(true);
    expect(progress.succeeded).toBe(true);
  });

  it('adds representative projectile, blast, ki, and clash basics from character metadata', () => {
    const roster = readRosterCharacters();
    const routable = roster.filter((character) => !character.unplayable && hasAttackAnimation(character));
    expect(routable.length).toBeGreaterThan(0);

    for (const character of routable) {
      const routes = resolveMoveRoutes(character);
      const trials = generateBasicTrainingTrials(character, roster);
      const hasTrial = (suffix: string) => trials.some((trial) => trial.id.endsWith(suffix));
      const hasProjectileRoute = routes.some((route) => routeProjectileInstances(character, route).length > 0);
      const hasNonBlastProjectileRoute = routes.some((route) => routeProjectileInstances(character, route).some((instance) => projectileInstanceKind(character, instance) !== 'blast'));
      const hasBlastRoute = routes.some((route) => routeProjectileInstances(character, route).some((instance) => projectileInstanceKind(character, instance) === 'blast'));
      const hasKiRoute = routes.some((route) => routeUsesKi(route));
      const hasClashRoute = routes.some((route) => route.move.kiBurst);

      if (hasProjectileRoute) expect(hasTrial('ki:projectile') || hasTrial('ki:blast'), character.id).toBe(true);
      if (hasNonBlastProjectileRoute) expect(hasTrial('ki:projectile'), character.id).toBe(true);
      if (hasBlastRoute) expect(hasTrial('ki:blast'), character.id).toBe(true);
      if (hasKiRoute) expect(hasTrial('ki:route'), character.id).toBe(true);
      if (hasClashRoute) {
        const trial = trials.find((item) => item.id.endsWith('ki:clash-qte'));
        expect(trial, character.id).toBeTruthy();
        expect(trial?.setup).toMatchObject({ dummyScript: 'kiAttack', p1Ki: 100, p2Ki: 100 });
        expect(trial?.steps[0]).toMatchObject({
          expectImpactKinds: ['clash'],
          requireImpactKiBurst: true,
          requireImpactDamage: true
        });
      }
    }
  });

  it('adds wakeup basics that start the player knocked down', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster);
    const byId = (suffix: string) => trials.find((trial) => trial.id.endsWith(suffix));
    const knockdownState = byId('oki:knockdown-state');
    const stand = byId('oki:wakeup-stand');
    const rollUp = byId('oki:wakeup-roll-up');
    const rollDown = byId('oki:wakeup-roll-down');
    const rollBack = byId('oki:wakeup-roll-back');

    for (const trial of [knockdownState, stand, rollUp, rollDown, rollBack]) {
      expect(trial).toBeTruthy();
      if (!trial) continue;
      expect(trial.category).toBe('oki');
      expect(trial.setup.p1State).toBe('knockdown');
      expect(trial.lesson.toLowerCase()).toContain('knockdown');
    }

    expect(knockdownState?.lesson.toLowerCase()).toContain('stand');
    expect(knockdownState?.lesson.toLowerCase()).toContain('roll');
    expect(stand?.steps[0]).toMatchObject({ requireState: 'getup', requireGetupAction: 'stand' });
    expect(rollUp?.steps[0]).toMatchObject({ requireState: 'getup', requireGetupAction: 'rollUp', actions: ['sidestepUp'] });
    expect(rollDown?.steps[0]).toMatchObject({ requireState: 'getup', requireGetupAction: 'rollDown', actions: ['sidestepDown'] });
    expect(rollBack?.steps[0]).toMatchObject({ requireState: 'getup', requireGetupAction: 'rollBack', actions: ['left'] });
  });

  it('adds Oki basics that start the dummy knocked down and teach wakeup pressure', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster);
    const byId = (suffix: string) => trials.find((trial) => trial.id.endsWith(suffix));
    const takeSpace = byId('oki:take-space');
    const meaty = byId('oki:meaty-check');
    const bait = byId('oki:wakeup-block-bait');

    expect(takeSpace?.setup.p2State).toBe('knockdown');
    expect(takeSpace?.setup.dummyScript).toBe('getup');
    expect(takeSpace?.lesson.toLowerCase()).toContain('offense after knockdown');
    expect(takeSpace?.lesson.toLowerCase()).toContain('cannot be hit yet');
    expect(meaty?.setup.p2State).toBe('knockdown');
    expect(meaty?.setup.dummyScript).toBe('wakeupMash');
    expect(meaty?.steps[0]).toMatchObject({
      kind: 'impact',
      expectImpactKinds: ['hit', 'counterHit'],
      expectImpactAttackerSlot: 1
    });
    expect(meaty?.lesson.toLowerCase()).toContain('invulnerable');
    expect(bait?.setup.p2State).toBe('knockdown');
    expect(bait?.setup.dummyScript).toBe('wakeupMash');
    expect(bait?.steps.map((step) => step.kind)).toEqual(['state', 'impact']);
    expect(bait?.steps[0]).toMatchObject({ actions: ['block'], requireState: 'block' });
    expect(bait?.steps[1].expectImpactKinds).toEqual(['punish']);
  });

  it('requires the matching getup action for wakeup basics', () => {
    const character = readRosterCharacters().find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;
    const trial = generateBasicTrainingTrials(character, readRosterCharacters()).find((item) => item.id.endsWith('oki:wakeup-roll-up'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    const input = emptyInputFrame();
    input.sidestepUp = true;
    let wrongProgress = makeTrainingTrialProgress(trial)!;
    let rightProgress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 13; frame += 1) {
      wrongProgress = advanceTrainingTrialWithInput(wrongProgress, trial, emptyInputFrame(), mockMatch('knockdown'));
      rightProgress = advanceTrainingTrialWithInput(rightProgress, trial, emptyInputFrame(), mockMatch('knockdown'));
    }

    const wrongMatch = {
      fighters: [
        { state: 'getup', getupAction: 'rollDown' } as FighterRuntime,
        { state: 'idle' } as FighterRuntime
      ]
    } as MatchSnapshot;
    wrongProgress = advanceTrainingTrialWithInput(wrongProgress, trial, input, wrongMatch);
    expect(wrongProgress.completed).toBe(false);
    expect(wrongProgress.statuses[0]).toBe('current');

    const rightMatch = {
      fighters: [
        { state: 'getup', getupAction: 'rollUp' } as FighterRuntime,
        { state: 'idle' } as FighterRuntime
      ]
    } as MatchSnapshot;
    rightProgress = advanceTrainingTrialWithInput(rightProgress, trial, input, rightMatch);
    expect(rightProgress.completed).toBe(true);
    expect(rightProgress.statuses[0]).toBe('perfect');
  });

  it('still allows actionless state-recognition basics', () => {
    const character = readRosterCharacters().find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;
    const trial = generateBasicTrainingTrials(character, readRosterCharacters()).find((item) => item.id.endsWith('oki:knockdown-state'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    let progress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 7; frame += 1) {
      progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch('knockdown'));
    }
    progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch('knockdown'));

    expect(progress.completed).toBe(true);
    expect(progress.statuses[0]).toBe('perfect');
  });

  it('grades a timed ki block from a blocked ki impact', () => {
    const character = readRosterCharacters().find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;
    const trial = generateBasicTrainingTrials(character, readRosterCharacters()).find((item) => item.id.endsWith('ki:perfect-block'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    let progress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 20; frame += 1) {
      progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch());
    }
    progress = advanceTrainingTrialWithImpact(progress, trial, mockImpact({ kind: 'block', attackerSlot: 2, defenderSlot: 1, kiBurst: true, moveInput: 'special' }));

    expect(progress.completed).toBe(true);
    expect(progress.statuses[0]).toBe('perfect');
  });

  it('only grades clash impacts for explicit clash trials and waits for QTE damage', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => resolveMoveRoutes(candidate).some((route) => route.move.kiBurst));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster);
    const clashTrial = trials.find((item) => item.id.endsWith('ki:clash-qte'));
    const normalTrial = trials.find((item) => item.id.endsWith('ki:perfect-block'));
    expect(clashTrial).toBeTruthy();
    expect(normalTrial).toBeTruthy();
    if (!clashTrial || !normalTrial) return;

    const ignoredNormal = advanceTrainingTrialWithImpact(
      progressAtImpactFrame(normalTrial),
      normalTrial,
      mockImpact({ kind: 'clash', damage: 24, kiBurst: true })
    );
    expect(ignoredNormal.completed).toBe(false);
    expect(ignoredNormal.statuses[0]).toBe('current');

    const clashStart = advanceTrainingTrialWithImpact(
      progressAtImpactFrame(clashTrial),
      clashTrial,
      mockImpact({ kind: 'clash', damage: 0, kiBurst: true })
    );
    expect(clashStart.completed).toBe(false);
    expect(clashStart.statuses[0]).toBe('current');

    const clashWin = advanceTrainingTrialWithImpact(
      progressAtImpactFrame(clashTrial),
      clashTrial,
      mockImpact({ kind: 'clash', damage: 24, kiBurst: true })
    );
    expect(clashWin.completed).toBe(true);
    expect(clashWin.statuses[0]).toBe('perfect');
  });

  it('requires whiff punish, airborne anti-air, and counter-hit impacts for their basics drills', () => {
    const character = readRosterCharacters().find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;
    const trials = generateBasicTrainingTrials(character, readRosterCharacters());

    const whiff = trials.find((item) => item.id.endsWith('punish:whiff'));
    expect(whiff).toBeTruthy();
    if (whiff) {
      const wrong = advanceTrainingTrialWithImpact(makeTrainingTrialProgress(whiff)!, whiff, mockImpact({ kind: 'hit' }));
      expect(wrong.completed).toBe(false);
      expect(wrong.statuses[0]).toBe('missed');
      const right = advanceTrainingTrialWithImpact(progressAtImpactFrame(whiff), whiff, mockImpact({ kind: 'whiffPunish', moveInput: whiff.steps[0].input }));
      expect(right.completed).toBe(true);
    }

    const antiAir = trials.find((item) => item.id.endsWith('defense:anti-air'));
    expect(antiAir).toBeTruthy();
    if (antiAir) {
      const grounded = advanceTrainingTrialWithImpact(makeTrainingTrialProgress(antiAir)!, antiAir, mockImpact({ kind: 'hit', moveInput: antiAir.steps[0].input, juggled: false }));
      expect(grounded.completed).toBe(false);
      expect(grounded.statuses[0]).toBe('missed');
      const airborneCounter = advanceTrainingTrialWithImpact(progressAtImpactFrame(antiAir), antiAir, mockImpact({ kind: 'counterHit', moveInput: antiAir.steps[0].input, moveCommand: antiAir.steps[0].command, juggled: true }));
      expect(airborneCounter.completed).toBe(true);
    }

    const counter = trials.find((item) => item.id.endsWith('punish:counter-hit'));
    expect(counter).toBeTruthy();
    if (counter) {
      const normal = advanceTrainingTrialWithImpact(makeTrainingTrialProgress(counter)!, counter, mockImpact({ kind: 'hit', moveInput: counter.steps[0].input, moveCommand: counter.steps[0].command }));
      expect(normal.completed).toBe(false);
      expect(normal.statuses[0]).toBe('missed');
      const counterHit = advanceTrainingTrialWithImpact(progressAtImpactFrame(counter), counter, mockImpact({ kind: 'counterHit', moveInput: counter.steps[0].input, moveCommand: counter.steps[0].command }));
      expect(counterHit.completed).toBe(true);
    }
  });

  it('adapts combo routes into the shared trial shape', () => {
    const character = readRosterCharacters().find((candidate) => generateComboTrainingTrials(candidate).some((trial) => trial.sourceBeginnerRoute));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateComboTrainingTrials(character);
    const routeTrials = trials.filter((trial) => trial.sourceBeginnerRoute);
    expect(trials.length).toBeGreaterThan(0);
    expect(trials.every((trial) => trial.mode === 'combos' && trial.category === 'combo')).toBe(true);
    const rosterRouteTrials = readRosterCharacters().flatMap((candidate) => generateComboTrainingTrials(candidate).filter((trial) => trial.sourceBeginnerRoute));
    expect(rosterRouteTrials.some((trial) => trial.steps.length > 3)).toBe(true);
    expect(routeTrials.every((trial) => trial.steps.filter((step) => step.kind === 'impact').every((step) => step.animationKey))).toBe(true);
    expect(routeTrials.every((trial) => trial.steps.filter((step) => step.kind === 'impact').length >= 3)).toBe(true);
    expect(routeTrials.every((trial) => trial.lesson.includes('confirm each hit'))).toBe(true);
  });

  it('uses simple gestures in Beginner and the same route commands in KORE', () => {
    const character = readRosterCharacters().find((candidate) => candidate.beginnerComboRoutes?.length);
    expect(character).toBeTruthy();
    if (!character) return;
    const beginner = generateComboTrainingTrials(character, 'beginner').find((trial) => trial.sourceBeginnerRoute);
    const kore = generateComboTrainingTrials(character, 'kore').find((trial) => trial.sourceBeginnerRoute?.id === beginner?.sourceBeginnerRoute?.id);
    expect(beginner).toBeTruthy();
    expect(kore).toBeTruthy();
    if (!beginner || !kore) return;

    const beginnerAttacks = beginner.steps.filter((step) => step.kind === 'impact');
    const koreAttacks = kore.steps.filter((step) => step.kind === 'impact');
    expect(beginnerAttacks[0].notation).toEqual(['Light']);
    expect(koreAttacks.map((step) => step.command)).toEqual(beginner.sourceBeginnerRoute!.steps.map((step) => step.command));
    expect(koreAttacks.map((step) => step.animationKey)).toEqual(beginnerAttacks.map((step) => step.animationKey));
  });

  it('adds a recoverable health combo lesson for every combo-capable character', () => {
    const roster = readRosterCharacters();
    const comboCapable = roster.filter((candidate) => generateComboTrainingTrials(candidate).some((trial) => trial.sourceBeginnerRoute));
    expect(comboCapable.length).toBeGreaterThan(0);

    for (const character of comboCapable) {
      const trials = generateComboTrainingTrials(character);
      const trial = trials.find((item) => item.id.endsWith('system:recoverable-health'));
      expect(trial, character.id).toBeTruthy();
      if (!trial) continue;
      expect(trials[0].id, character.id).toBe(trial.id);
      expect(trial.setup.p1Hp, character.id).toBeGreaterThan(0);
      expect(trial.setup.p1Hp, character.id).toBeLessThan(character.stats.health);
      expect(trial.setup.p1RecoverableHp, character.id).toBeGreaterThan(0);
      expect([trial.title, trial.lesson, trial.successText, ...trial.steps.map((step) => `${step.label} ${step.reason ?? ''}`)].join(' ').toLowerCase()).toMatch(/recoverable|white|grey/);
    }
  });

  it('surfaces reviewed move labels in training and combo trial steps', () => {
    const roster = readRosterCharacters();
    const yusuke = roster.find((character) => character.id === 'yusuke-urameshi');
    expect(yusuke).toBeTruthy();
    if (!yusuke) return;

    const basicStepLabels = generateBasicTrainingTrials(yusuke, roster).flatMap((trial) => trial.steps.map((step) => step.label));
    const comboTrials = generateComboTrainingTrials(yusuke);
    const comboStepLabels = comboTrials.flatMap((trial) => trial.steps.map((step) => step.label));

    expect(basicStepLabels).toContain('Spirit Wave Drive');
    expect([...basicStepLabels, ...comboStepLabels].some((label) => /Frame Link/.test(label))).toBe(false);
    expect(comboTrials.filter((trial) => trial.sourceBeginnerRoute).every((trial) => trial.steps.some((step) => step.label.trim().length > 0))).toBe(true);
  });

  it('generates Beginner auto-combo previews from the route-aware finisher plan', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.beginnerComboRoutes?.some((route) => route.id.endsWith('light-core')));
    expect(character).toBeTruthy();
    if (!character) return;

    const route = character.beginnerComboRoutes!.find((candidate) => candidate.id.endsWith('light-core'))!;
    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('offense:beginner-auto-combo'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.title).toBe('Beginner Light Route');
    expect(trial.steps).toHaveLength(3);
    expect(trial.steps.every((step) => step.notation.includes('Light'))).toBe(true);
    expect(trial.steps[2].label).toContain('Knockdown');
    expect(trial.sourceBeginnerRoute?.id).toBe(route.id);
    expect(trial.lesson).toContain('block or whiff resets');

    const attackPreviewFrames = trial.previewScript.filter((frame) => frame.actions.includes('jab'));
    expect(attackPreviewFrames.length).toBeGreaterThanOrEqual(3);
  });

  it('sets up ki and command-family combo trials with executable previews', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateComboTrainingTrials(candidate).some((trial) => trial.id.endsWith(':ki'))
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateComboTrainingTrials(character);
    const kiTrial = trials.find((trial) => trial.id.endsWith(':ki'));
    expect(kiTrial?.setup.p1Ki).toBe(100);
    expect(kiTrial?.sourceBeginnerRoute).toBeTruthy();
    expect(kiTrial?.steps.filter((step) => step.kind === 'impact')).toHaveLength(3);

    const motionTrial = trials.find((trial) => trial.steps.some((step) => /^(qcf|qcb|hcf|hcb|dp|rdp|cd)\+/.test(step.command ?? '')));
    if (motionTrial) {
      expect(motionTrial.previewScript.some((frame) => frame.actions.includes('down'))).toBe(true);
      expect(motionTrial.previewScript.some((frame) => frame.actions.includes('left') || frame.actions.includes('right'))).toBe(true);
    }

    const jumpTrial = readRosterCharacters()
      .flatMap((candidate) => generateComboTrainingTrials(candidate))
      .find((trial) => trial.steps.some((step) => step.command && /^(u|U|u\/f|U\/F|u\/b|U\/B)\+/.test(step.command)));
    if (jumpTrial) {
      expect(jumpTrial.steps.some((step) => step.actions.includes('jump')), jumpTrial.id).toBe(true);
      expect(jumpTrial.steps.some((step) => step.notation.includes('JUMP') || step.notation.some((token) => token.startsWith('JUMP/'))), jumpTrial.id).toBe(true);
      expect(jumpTrial.previewScript.some((frame) => frame.actions.includes('jump')), jumpTrial.id).toBe(true);
    }
  });

  it('keeps grounded launcher trial previews free of jump inputs', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateComboTrainingTrials(candidate).some((trial) => trial.steps.some((step) => step.kind === 'state'))
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateComboTrainingTrials(character).find((candidate) => candidate.steps.some((step) => step.kind === 'state'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    const movement = trial.steps.find((step) => step.kind === 'state')!;
    expect(movement.label).toMatch(/Neutral|Dash|Back Hop|Jump/);
    expect(trial.previewScript.some((frame) => movement.actions.every((action) => frame.actions.includes(action)))).toBe(true);
  });

  it('stores completion by character and trial id', () => {
    expect(readTrainingTrialCompletion('naruto')).toEqual(new Set());
    writeTrainingTrialCompletion('naruto', new Set(['basic:naruto:movement:walk', 'combo:naruto:test']));
    writeTrainingTrialCompletion('sasuke', new Set(['basic:sasuke:movement:walk']));

    expect(readTrainingTrialCompletion('naruto')).toEqual(new Set(['basic:naruto:movement:walk', 'combo:naruto:test']));
    expect(readTrainingTrialCompletion('sasuke')).toEqual(new Set(['basic:sasuke:movement:walk']));
  });

  it('resolves the next uncompleted training trial after the current trial', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster).slice(0, 4);
    expect(trials.length).toBe(4);
    const completed = new Set([trials[0].id, trials[1].id]);
    const next = resolveNextTrainingTrial(trials, trials[1].id, completed);

    expect(next).toMatchObject({
      label: 'Next Trial',
      allComplete: false,
      trial: { id: trials[2].id }
    });
  });

  it('wraps to review next when every training trial is complete', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateBasicTrainingTrials(character, roster).slice(0, 3);
    expect(trials.length).toBe(3);
    const completed = new Set(trials.map((trial) => trial.id));
    const next = resolveNextTrainingTrial(trials, trials[1].id, completed);

    expect(next).toMatchObject({
      label: 'Review Next',
      allComplete: true,
      trial: { id: trials[2].id }
    });
  });

  it('resets completion and preserves attempt count when retrying a trial', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => candidate.id === 'naruto') ?? roster.find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('movement:walk'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    let progress = makeTrainingTrialProgress(trial, false, 1)!;
    const input = emptyInputFrame();
    input.right = true;
    for (let frame = 0; frame < 13; frame += 1) {
      progress = advanceTrainingTrialWithInput(progress, trial, emptyInputFrame(), mockMatch());
    }
    progress = advanceTrainingTrialWithInput(progress, trial, input, mockMatch('walk'));
    expect(progress.completed).toBe(true);

    const retry = makeTrainingTrialProgress(trial, false, 2)!;
    expect(retry.completed).toBe(false);
    expect(retry.attempts).toBe(2);
    expect(retry.statuses[0]).toBe('current');
    expect(retry.lastFeedback).toBe('Ready');
  });

  it('grades early, perfect, and late input timing', () => {
    const character = readRosterCharacters().find((candidate) => candidate.id === 'naruto') ?? readRosterCharacters()[0];
    const trial = generateBasicTrainingTrials(character, readRosterCharacters()).find((item) => item.id.endsWith('movement:walk'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    const earlyInput = emptyInputFrame();
    earlyInput.right = true;
    const early = advanceTrainingTrialWithInput(makeTrainingTrialProgress(trial)!, trial, earlyInput, mockMatch('walk'));
    expect(early.statuses[0]).toBe('early');
    expect(early.lastFeedback).toContain('early');

    let perfectProgress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 13; frame += 1) {
      perfectProgress = advanceTrainingTrialWithInput(perfectProgress, trial, emptyInputFrame(), mockMatch());
    }
    perfectProgress = advanceTrainingTrialWithInput(perfectProgress, trial, earlyInput, mockMatch('walk'));
    expect(perfectProgress.completed).toBe(true);
    expect(perfectProgress.statuses[0]).toBe('perfect');

    let lateProgress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 40; frame += 1) {
      lateProgress = advanceTrainingTrialWithInput(lateProgress, trial, emptyInputFrame(), mockMatch());
    }
    lateProgress = advanceTrainingTrialWithInput(lateProgress, trial, earlyInput, mockMatch('walk'));
    expect(lateProgress.completed).toBe(true);
    expect(lateProgress.statuses[0]).toBe('late');
  });

  it('builds preview input frames without writing completion', () => {
    const character = readRosterCharacters().find((candidate) => hasAttackAnimation(candidate));
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateBasicTrainingTrials(character, readRosterCharacters())[0];
    const length = previewScriptLength(trial.previewScript);
    expect(length).toBeGreaterThan(0);

    const activeFrame = trial.previewScript[0].frame;
    const previewInput = makePreviewInput(trial.previewScript, activeFrame);
    expect(trial.previewScript[0].actions.some((action) => previewInput[action])).toBe(true);
    expect(readTrainingTrialCompletion(character.id)).toEqual(new Set());
  });

  it('builds raw button move preview input windows', () => {
    const script = makeMovePreviewScript({ input: 'jab', command: '1' });
    const activeFrame = script.find((frame) => frame.actions.includes('jab'))?.frame ?? 0;

    expect(activeFrame).toBeGreaterThan(0);
    expect(makePreviewInput(script, activeFrame).jab).toBe(true);
    expect(makePreviewInput(script, Math.max(0, activeFrame - 1)).jab).toBe(false);
  });

  it('builds motion command previews with directional timing before the attack', () => {
    const script = makeMovePreviewScript({ input: 'jab', command: 'qcf+1' });
    const downFrame = script.find((frame) => frame.actions.includes('down') && !frame.actions.includes('jab'));
    const attackFrame = script.find((frame) => frame.actions.includes('jab'));

    expect(downFrame).toBeTruthy();
    expect(attackFrame).toBeTruthy();
    expect(downFrame!.frame).toBeLessThan(attackFrame!.frame);
    expect(makePreviewInput(script, downFrame!.frame).down).toBe(true);
    expect(makePreviewInput(script, attackFrame!.frame).right).toBe(true);
    expect(makePreviewInput(script, attackFrame!.frame).jab).toBe(true);
  });

  it('builds combo route preview scripts in ordered step timing', () => {
    const character = readRosterCharacters().find((candidate) => generateComboTrainingTrials(candidate).some((trial) => trial.sourceBeginnerRoute));
    expect(character).toBeTruthy();
    if (!character) return;
    const trial = generateComboTrainingTrials(character).find((candidate) => candidate.sourceBeginnerRoute);
    expect(trial).toBeTruthy();
    if (!trial) return;
    const script = trial.previewScript;
    const attackFrames = script
      .filter((frame) => frame.actions.some((action) => action === 'jab' || action === 'heavy' || action === 'kick' || action === 'special'))
      .map((frame) => frame.frame);

    expect(attackFrames.length).toBeGreaterThanOrEqual(2);
    expect(attackFrames[1]).toBeGreaterThan(attackFrames[0]);
  });
});
