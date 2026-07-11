import { describe, expect, it } from 'vitest';
import { parseSpectatorRoute } from './SpectatorExperience';

describe('spectator routes', () => {
  it('parses tournament, continuous watch, and direct match links', () => {
    expect(parseSpectatorRoute('/tournaments/kore-weekly-47')).toEqual({ kind: 'tournament', slug: 'kore-weekly-47' });
    expect(parseSpectatorRoute('/tournaments/kore-weekly-47/watch')).toEqual({ kind: 'watch', slug: 'kore-weekly-47' });
    expect(parseSpectatorRoute('/tournaments/kore-weekly-47/matches/r2m1')).toEqual({ kind: 'match', slug: 'kore-weekly-47', matchId: 'r2m1' });
    expect(parseSpectatorRoute('/settings')).toBeNull();
  });
});
