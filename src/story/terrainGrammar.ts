import type { StoryTerrainTileRole, StoryWorldThemeId } from './types';

export type StoryTerrainGrammar = {
  id: string;
  theme: StoryWorldThemeId;
  roles: Record<StoryTerrainTileRole, { variantOffset: 0 | 1 | 2; rotation: boolean; mirroring: boolean }>;
};

const ROLE_ORDER: StoryTerrainTileRole[] = [
  'fill', 'top', 'underside', 'left-wall', 'right-wall',
  'outer-top-left', 'outer-top-right', 'outer-bottom-left', 'outer-bottom-right',
  'inner-top-left', 'inner-top-right', 'inner-bottom-left', 'inner-bottom-right', 'connector-lip'
];

function grammar(theme: StoryWorldThemeId, offset: number): StoryTerrainGrammar {
  return {
    id: `${theme}-enclosed-terrain-v1`, theme,
    roles: Object.fromEntries(ROLE_ORDER.map((role, index) => [role, {
      variantOffset: ((offset + index) % 3) as 0 | 1 | 2,
      rotation: role !== 'fill' && role !== 'top',
      mirroring: role.includes('left') || role.includes('right')
    }])) as StoryTerrainGrammar['roles']
  };
}

export const STORY_TERRAIN_GRAMMARS: Partial<Record<StoryWorldThemeId, StoryTerrainGrammar>> = {
  village: grammar('village', 0), forest: grammar('forest', 1), mine: grammar('mine', 2), crypt: grammar('crypt', 0),
  underworld: grammar('underworld', 2), snow: grammar('snow', 1), desert: grammar('desert', 0), ruins: grammar('ruins', 2)
};

export function resolveStoryTerrainVariant(theme: StoryWorldThemeId | undefined, role: StoryTerrainTileRole, authoredVariant: number) {
  const grammar = theme ? STORY_TERRAIN_GRAMMARS[theme] : undefined;
  return (authoredVariant + (grammar?.roles[role].variantOffset ?? 0)) % 3;
}

export function storyTerrainGrammarCoverageErrors() {
  const errors: string[] = [];
  for (const theme of ['village', 'forest', 'mine', 'crypt', 'underworld', 'snow', 'desert', 'ruins'] as StoryWorldThemeId[]) {
    const entry = STORY_TERRAIN_GRAMMARS[theme];
    if (!entry) { errors.push(`terrain-grammar:${theme}`); continue; }
    for (const role of ROLE_ORDER) if (!entry.roles[role]) errors.push(`terrain-role:${theme}:${role}`);
  }
  return errors;
}
