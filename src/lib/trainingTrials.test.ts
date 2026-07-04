import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CharacterDefinition, FighterRuntime, MatchSnapshot } from '../types';
import { emptyInputFrame } from '../types';
import { resolveMoveRoutes } from './comboRoutes';
import {
  TRAINING_TRIAL_STORAGE_KEY,
  advanceTrainingTrialWithInput,
  generateBasicTrainingTrials,
  generateComboTrainingTrials,
  makePreviewInput,
  makeTrainingTrialProgress,
  previewScriptLength,
  readTrainingTrialCompletion,
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
      for (const trial of trials) {
        expect(trial.characterId).toBe(character.id);
        expect(trial.stageId).toBeTruthy();
        expect(trial.steps.length, trial.id).toBeGreaterThan(0);
        expect(trial.previewScript.length, trial.id).toBeGreaterThan(0);
      }
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
          const route = routes.find((item) => item.command === step.command || (!step.command && item.input === step.input));
          expect(route?.move.launchHeight ?? 0, `${character.id}:${trial.id}`).toBeGreaterThan(0);
        }
        if (trial.category === 'tornado') {
          const step = trial.steps[0];
          const route = routes.find((item) => item.command === step.command || (!step.command && item.input === step.input));
          expect(route?.move.tornado, `${character.id}:${trial.id}`).toBe(true);
        }
        if (trial.category === 'crouch') {
          expect(trial.steps[0].command, `${character.id}:${trial.id}`).toMatch(/^(FC|WS)\+/);
        }
        if (trial.category === 'ki') {
          const step = trial.steps[0];
          const route = routes.find((item) => item.command === step.command || (!step.command && item.input === step.input));
          expect(Boolean(route?.command?.startsWith('O+') || route?.move.usesKi || route?.move.kiBurst), `${character.id}:${trial.id}`).toBe(true);
        }
      }
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
});
