import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CharacterDefinition, FighterRuntime, ImpactSparkEvent, MatchSnapshot } from '../types';
import { emptyInputFrame } from '../types';
import { resolveBeginnerAutoComboPlan } from './beginnerAutoCombos';
import { resolveMoveRoutes } from './comboRoutes';
import {
  TRAINING_TRIAL_STORAGE_KEY,
  advanceTrainingTrialWithImpact,
  advanceTrainingTrialWithInput,
  generateBasicTrainingTrials,
  generateComboTrainingTrials,
  makeComboRoutePreviewScript,
  makeMovePreviewScript,
  makePreviewInput,
  makeTrainingTrialProgress,
  previewScriptLength,
  readTrainingTrialCompletion,
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
      { state: playerState } as FighterRuntime,
      { state: dummyState } as FighterRuntime
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
          if (trial.id.endsWith('ki:perfect-block') || trial.id.endsWith('ki:charge')) continue;
          const step = trial.steps[0];
          const route = routes.find((item) => step.routeKey ? item.routeKey === step.routeKey : item.command === step.command || (!step.command && item.input === step.input));
          expect(Boolean(route?.command?.startsWith('O+') || route?.move.usesKi || route?.move.kiBurst), `${character.id}:${trial.id}`).toBe(true);
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
      requireState: 'chargeKi'
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
    const character = readRosterCharacters().find((candidate) => generateComboTrainingTrials(candidate).length > 0);
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateComboTrainingTrials(character);
    expect(trials.length).toBeGreaterThan(0);
    expect(trials.every((trial) => trial.mode === 'combos' && trial.category === 'combo')).toBe(true);
    expect(trials.some((trial) => trial.steps.length > 3)).toBe(true);
    expect(trials.every((trial) => trial.steps.every((step) => step.routeKey && step.animationKey))).toBe(true);
    expect(trials.every((trial) => (trial.sourceComboRoute?.estimatedDamage ?? 0) > 0)).toBe(true);
    expect(trials.every((trial) => trial.sourceComboRoute?.structure.includes('starter'))).toBe(true);
    expect(trials.every((trial) => trial.lesson.includes('damage'))).toBe(true);
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
    expect(comboStepLabels).toContain('Spirit Gun Burst');
    expect([...basicStepLabels, ...comboStepLabels].some((label) => /Frame Link/.test(label))).toBe(false);
    expect(comboTrials.find((trial) => trial.steps[0]?.label === 'Spirit Gun Burst')?.title).toContain('Spirit Gun Burst');
  });

  it('generates Beginner auto-combo previews from the route-aware finisher plan', () => {
    const roster = readRosterCharacters();
    const character = roster.find((candidate) => resolveBeginnerAutoComboPlan(candidate).finisherCommand);
    expect(character).toBeTruthy();
    if (!character) return;

    const plan = resolveBeginnerAutoComboPlan(character);
    const trial = generateBasicTrainingTrials(character, roster).find((item) => item.id.endsWith('offense:beginner-auto-combo'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.title).toBe('Beginner Auto Combo');
    expect(trial.steps.map((step) => step.input)).toEqual(['jab', 'heavy', 'kick', 'special']);
    expect(trial.steps[3].label).toContain(plan.finisherLabel);
    expect(trial.steps[3].routeKey).toBe(plan.finisherStep?.routeKey);
    expect(trial.sourceComboRoute?.id).toBe(plan.sourceRoute?.id);
    expect(trial.lesson).toContain(plan.finisherLabel);

    const finalPreviewFrame = [...trial.previewScript].reverse().find((frame) => frame.actions.includes('special'));
    expect(finalPreviewFrame?.actions).toEqual(['special']);
  });

  it('sets up ki and command-family combo trials with executable previews', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateComboTrainingTrials(candidate).some((trial) => trial.sourceComboRoute?.requiresKi)
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const trials = generateComboTrainingTrials(character);
    const kiTrial = trials.find((trial) => trial.sourceComboRoute?.requiresKi);
    expect(kiTrial?.setup.p1Ki).toBe(100);
    expect(kiTrial?.previewScript.some((frame) => frame.actions.includes('charge'))).toBe(true);

    const motionTrial = trials.find((trial) => trial.steps.some((step) => /^(qcf|qcb|hcf|hcb|dp|rdp|cd)\+/.test(step.command ?? '')));
    if (motionTrial) {
      expect(motionTrial.previewScript.some((frame) => frame.actions.includes('down'))).toBe(true);
      expect(motionTrial.previewScript.some((frame) => frame.actions.includes('left') || frame.actions.includes('right'))).toBe(true);
    }
  });

  it('keeps grounded launcher trial previews free of jump inputs', () => {
    const character = readRosterCharacters().find((candidate) =>
      generateComboTrainingTrials(candidate).some((trial) => trial.sourceComboRoute?.launchRouteStyle === 'grounded')
    );
    expect(character).toBeTruthy();
    if (!character) return;

    const trial = generateComboTrainingTrials(character).find((candidate) => candidate.sourceComboRoute?.launchRouteStyle === 'grounded');
    expect(trial).toBeTruthy();
    if (!trial) return;

    expect(trial.title).toContain('Grounded Launcher');
    expect(trial.steps.every((step) => !step.actions.includes('up')), `${character.id}:${trial.id}`).toBe(true);
    expect(trial.previewScript.every((frame) => !frame.actions.includes('up')), `${character.id}:${trial.id}`).toBe(true);
  });

  it('stores completion by character and trial id', () => {
    expect(readTrainingTrialCompletion('naruto')).toEqual(new Set());
    writeTrainingTrialCompletion('naruto', new Set(['basic:naruto:movement:walk', 'combo:naruto:test']));
    writeTrainingTrialCompletion('sasuke', new Set(['basic:sasuke:movement:walk']));

    expect(readTrainingTrialCompletion('naruto')).toEqual(new Set(['basic:naruto:movement:walk', 'combo:naruto:test']));
    expect(readTrainingTrialCompletion('sasuke')).toEqual(new Set(['basic:sasuke:movement:walk']));
  });

  it('grades early, perfect, and late input timing', () => {
    const character = readRosterCharacters().find((candidate) => candidate.id === 'naruto') ?? readRosterCharacters()[0];
    const trial = generateBasicTrainingTrials(character, readRosterCharacters()).find((item) => item.id.endsWith('movement:walk'));
    expect(trial).toBeTruthy();
    if (!trial) return;

    const earlyInput = emptyInputFrame();
    earlyInput.right = true;
    const early = advanceTrainingTrialWithInput(makeTrainingTrialProgress(trial)!, trial, earlyInput, mockMatch());
    expect(early.statuses[0]).toBe('early');
    expect(early.lastFeedback).toContain('early');

    let perfectProgress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 13; frame += 1) {
      perfectProgress = advanceTrainingTrialWithInput(perfectProgress, trial, emptyInputFrame(), mockMatch());
    }
    perfectProgress = advanceTrainingTrialWithInput(perfectProgress, trial, earlyInput, mockMatch());
    expect(perfectProgress.completed).toBe(true);
    expect(perfectProgress.statuses[0]).toBe('perfect');

    let lateProgress = makeTrainingTrialProgress(trial)!;
    for (let frame = 0; frame < 40; frame += 1) {
      lateProgress = advanceTrainingTrialWithInput(lateProgress, trial, emptyInputFrame(), mockMatch());
    }
    lateProgress = advanceTrainingTrialWithInput(lateProgress, trial, earlyInput, mockMatch());
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
    const character = readRosterCharacters().find((candidate) => generateComboTrainingTrials(candidate)[0]?.sourceComboRoute);
    expect(character).toBeTruthy();
    if (!character) return;
    const route = generateComboTrainingTrials(character)[0]?.sourceComboRoute;
    expect(route).toBeTruthy();
    if (!route) return;

    const script = makeComboRoutePreviewScript(route);
    const attackFrames = script
      .filter((frame) => frame.actions.some((action) => action === 'jab' || action === 'heavy' || action === 'kick' || action === 'special'))
      .map((frame) => frame.frame);

    expect(attackFrames.length).toBeGreaterThanOrEqual(2);
    expect(attackFrames[1]).toBeGreaterThan(attackFrames[0]);
  });
});
