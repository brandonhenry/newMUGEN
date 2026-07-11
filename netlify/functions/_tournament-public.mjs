export function deriveTournamentSlug(bracket) {
  if (typeof bracket?.slug === 'string' && bracket.slug) return bracket.slug;
  return String(bracket?.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

export function deriveTournamentName(bracket) {
  if (typeof bracket?.name === 'string' && bracket.name.trim()) return bracket.name.trim().slice(0, 80);
  const date = new Date(Number(bracket?.createdAt) || Date.now()).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric'
  });
  return bracket?.kind === 'paidOnline' ? `K.O.R.E Lightning Tournament · ${date}` : `K.O.R.E Online Tournament · ${date}`;
}

export function withTournamentPublicMetadata(bracket) {
  return { ...bracket, slug: deriveTournamentSlug(bracket), name: deriveTournamentName(bracket) };
}

export function sanitizePublicTournament(bracket) {
  const source = withTournamentPublicMetadata(bracket);
  return {
    id: source.id,
    slug: source.slug,
    name: source.name,
    kind: source.kind,
    status: source.status,
    entries: (source.entries || []).map((entry) => ({
      id: entry.id,
      displayName: String(entry.displayName || 'PLAYER').slice(0, 24),
      characterId: entry.characterId,
      seed: entry.seed,
      ...(entry.isCpu ? { isCpu: true } : {}),
      ...(entry.isBot ? { isBot: true } : {})
    })),
    matches: (source.matches || []).map((match) => ({
      id: match.id,
      round: match.round,
      index: match.index,
      status: match.status,
      ...(match.entryAId ? { entryAId: match.entryAId } : {}),
      ...(match.entryBId ? { entryBId: match.entryBId } : {}),
      ...(match.winnerEntryId ? { winnerEntryId: match.winnerEntryId } : {}),
      ...(match.stageId ? { stageId: match.stageId } : {}),
      ...(match.roomStatus ? { roomStatus: match.roomStatus } : {}),
      ...(match.reportedAt ? { reportedAt: match.reportedAt } : {})
    })),
    currentRound: source.currentRound,
    capacity: source.capacity,
    minEntries: source.minEntries,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    rewardLabel: source.reward?.label
  };
}
