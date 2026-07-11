import type { StageDefinition } from '../types';

export function getTournamentStagePool(stageRoster: StageDefinition[], tournamentOnly: boolean) {
  if (!tournamentOnly) return stageRoster;
  const tournamentStages = stageRoster.filter((stage) => stage.tournamentEligible === true);
  return tournamentStages.length > 0 ? tournamentStages : stageRoster;
}
