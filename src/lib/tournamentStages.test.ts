import { describe, expect, it } from 'vitest';
import type { StageDefinition } from '../types';
import { getTournamentStagePool } from './tournamentStages';

const stage = (id: string, tournamentEligible = false) => ({
  id,
  name: id,
  subtitle: '',
  floor: '#000',
  rail: '#fff',
  light: '#fff',
  tournamentEligible
}) satisfies StageDefinition;

describe('getTournamentStagePool', () => {
  it('filters the stage roster to tournament-eligible arenas when enabled', () => {
    const roster = [stage('open-field', true), stage('small-room'), stage('wide-arena', true)];
    expect(getTournamentStagePool(roster, true).map((item) => item.id)).toEqual(['open-field', 'wide-arena']);
  });

  it('keeps the full roster when disabled or when no tournament stages are tagged', () => {
    const roster = [stage('small-room'), stage('narrow-bridge')];
    expect(getTournamentStagePool(roster, false)).toBe(roster);
    expect(getTournamentStagePool(roster, true)).toBe(roster);
  });
});
