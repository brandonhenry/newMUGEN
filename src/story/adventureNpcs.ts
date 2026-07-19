import npcManifest from './storyNpcManifest.json';
import rosterExpansion from './storyRosterExpansion.json';
import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import type { StoryAdventureMapRole, StoryAdventureWorldId, StoryNpcDefinition, StoryNpcDefenseProfile, StoryNpcSpriteManifest } from './types';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

const STARTER_DEFENSE: Record<'mina' | 'hana' | 'tamsin', StoryNpcDefenseProfile> = {
  mina: { invulnerable: true, attackerOnly: true, warningMs: 3_000, threatRadius: 5.5, guardMs: 350, counterDamagePercent: 0.1, knockback: 4.8, cooldownMs: 6_000, counterRange: 5.5 },
  hana: { invulnerable: true, attackerOnly: true, warningMs: 3_000, threatRadius: 3.2, guardMs: 260, counterDamagePercent: 0.14, knockback: 6.2, cooldownMs: 6_000, counterRange: 2.4 },
  tamsin: { invulnerable: true, attackerOnly: true, warningMs: 3_000, threatRadius: 3.4, guardMs: 420, counterDamagePercent: 0.16, knockback: 7.1, cooldownMs: 6_000, counterRange: 2.6 }
};

function biomeDefense(role: 'guide' | 'specialist' | 'resident', index: number): StoryNpcDefenseProfile {
  const percent = Math.min(0.18, 0.1 + index * 0.008 + (role === 'specialist' ? 0.025 : role === 'resident' ? 0.01 : 0));
  return {
    invulnerable: true,
    attackerOnly: true,
    warningMs: 3_000,
    threatRadius: role === 'guide' ? 4.2 : 3.5,
    guardMs: role === 'specialist' ? 300 : 380,
    counterDamagePercent: Number(percent.toFixed(3)),
    knockback: role === 'specialist' ? 6.8 : 5.6,
    cooldownMs: 6_000,
    counterRange: role === 'guide' ? 3.8 : 2.8
  };
}

function npc(input: Omit<StoryNpcDefinition, 'safeAnchor' | 'defense'> & { defense: StoryNpcDefenseProfile }): StoryNpcDefinition {
  return { ...input, safeAnchor: [...input.position], defense: input.defense };
}

export const STORY_STARTER_NPCS: StoryNpcDefinition[] = [
  npc({ id: 'mina-quill', displayName: 'Mina Quill', role: 'archivist', biomeId: 'world-route', mapId: 'world-route', position: [-9.5, 0.82], spriteId: 'mina-quill', bark: 'Every road leaves a trace. I keep the atlas honest.', warningBark: 'Please lower your guard before I raise mine.', defense: STARTER_DEFENSE.mina }),
  npc({ id: 'hana-rook', displayName: 'Hana Rook', role: 'warden', biomeId: 'world-route', mapId: 'world-route', position: [4.5, 0.82], spriteId: 'hana-rook', bark: 'Daily routes reward attention, not rushing.', warningBark: 'That was your warning step.', defense: STARTER_DEFENSE.hana }),
  npc({ id: 'tamsin-reed', displayName: 'Tamsin Reed', role: 'steward', biomeId: 'world-route', mapId: 'world-route', position: [19, 0.82], spriteId: 'tamsin-reed', bark: 'Coins rebuild roads. Rebuilt roads remember you.', warningBark: 'Tools are safer when everyone stands back.', services: ['market'], defense: STARTER_DEFENSE.tamsin })
];

const BIOME_NPC_DATA: Record<BiomeId, Array<[string, string, 'guide' | 'specialist' | 'resident', string, string]>> = {
  greenhollow: [
    ['elio-fen', 'Elio Fen', 'guide', 'The mill sails point toward every safe landing.', 'Easy—grain is lighter than this satchel.'],
    ['pippa-brook', 'Pippa Brook', 'specialist', 'Open the blue valves before crossing the lower channel.', 'Stand clear of the wrench.'],
    ['bram-appleby', 'Bram Appleby', 'resident', 'The best apples grow above the market roofs.', 'You are about to meet the hard side of this basket.']
  ],
  thornwood: [
    ['syl-veyra', 'Syl Veyra', 'guide', 'Follow the pale roots; thorns avoid old wood.', 'The roots do not welcome that.'],
    ['moss-bell', 'Moss Bell', 'specialist', 'Spore lanterns mark air that is safe to breathe.', 'Herbs can soothe or sting.'],
    ['nera-thorne', 'Nera Thorne', 'resident', 'The canopy route moves when the wind changes.', 'I saw that coming.']
  ],
  ironroot: [
    ['orin-pike', 'Orin Pike', 'guide', 'A singing rail means the cart is already close.', 'Do not make me brace this pick.'],
    ['della-gear', 'Della Gear', 'specialist', 'Restore the lift before breaking the amber wall.', 'Back away from the moving parts.'],
    ['jax-flint', 'Jax Flint', 'resident', 'Sunstone shines brightest beside deep water.', 'Survey says: bad idea.']
  ],
  bonevault: [
    ['mara-bell', 'Mara Bell', 'guide', 'Count the bells. The silent arch is the safe one.', 'Respect the quiet.'],
    ['ivo-ossin', 'Ivo Ossin', 'specialist', 'A violet flame means the floor is still awake.', 'The bell tolls for careless hands.'],
    ['edda-veil', 'Edda Veil', 'resident', 'Names fade. Offerings show who was remembered.', 'Leave the memorial undisturbed.']
  ],
  emberdeep: [
    ['kael-cinder', 'Kael Cinder', 'guide', 'Move after the lava falls, never before.', 'Heat is not the only thing that pushes back.'],
    ['sura-forge', 'Sura Forge', 'specialist', 'Three vent strikes wake the forge lift.', 'My hammer answers once.'],
    ['ren-ash', 'Ren Ash', 'resident', 'The caldera breathes in sets of four.', 'Ash remembers every spark.']
  ],
  frostpeak: [
    ['ylva-snow', 'Ylva Snow', 'guide', 'Face the gust and watch the loose powder.', 'The mountain taught me to hold ground.'],
    ['corin-gale', 'Corin Gale', 'specialist', 'Blue flags mark the sheltered wind lane.', 'You chose the exposed route.'],
    ['mika-hearth', 'Mika Hearth', 'resident', 'Last Shelter keeps soup warm for every traveler.', 'Do not bring a fight into the shelter.']
  ],
  sunscar: [
    ['sahir-dune', 'Sahir Dune', 'guide', 'Walk the stone shadows; loose sand swallows speed.', 'The dunes return every shove.'],
    ['amara-wells', 'Amara Wells', 'specialist', 'Glasswater reveals doors at the lowest ripple.', 'Step away from the well.'],
    ['nilo-glass', 'Nilo Glass', 'resident', 'Buried markers point opposite the noon sun.', 'Careful—glass keeps an edge.']
  ],
  skyglass: [
    ['aeri-prism', 'Aeri Prism', 'guide', 'Wait for the crystal hum before entering an updraft.', 'The bridge will not catch both of us.'],
    ['tovan-chime', 'Tovan Chime', 'specialist', 'Matched chimes stabilize a moving span.', 'That note calls a counter.'],
    ['lumi-cloud', 'Lumi Cloud', 'resident', 'The tower shadow points toward hidden platforms.', 'Clouds move. So do I.']
  ]
};

const STORY_LEGACY_BIOME_NPCS: StoryNpcDefinition[] = Object.entries(BIOME_NPC_DATA).flatMap(([biome, entries], biomeIndex) => entries.map(([id, displayName, role, bark, warningBark], roleIndex) => {
  const mapRole = role === 'specialist' ? 'field-b' : 'arrival';
  const mapId = `${biome}-${mapRole}`;
  const position: [number, number] = role === 'guide' ? [-20, 0.82] : role === 'resident' ? [18, 0.82] : [-18, 0.82];
  return npc({ id, displayName, role, biomeId: biome as BiomeId, mapId, position, patrolRange: role === 'resident' ? [12, 23] : undefined, spriteId: id, bark, warningBark, defense: biomeDefense(role, biomeIndex + roleIndex) });
}));

type ExpansionNpcRow = [string, string, StoryAdventureMapRole, 'guide' | 'specialist' | 'resident', 'human' | 'folk', string, string, string];
type ExpansionBiome = { npcs: ExpansionNpcRow[] };

const EXPANSION_POSITION_X: Record<StoryAdventureMapRole, Record<'guide' | 'specialist' | 'resident', number>> = {
  arrival: { guide: -20, specialist: 0, resident: 18 },
  'field-a': { guide: -48, specialist: 0, resident: 48 },
  'field-b': { guide: -50, specialist: -18, resident: 50 },
  mastery: { guide: -50, specialist: 0, resident: 50 }
};

const STORY_EXPANSION_NPCS: StoryNpcDefinition[] = Object.entries(rosterExpansion.biomes as unknown as Record<BiomeId, ExpansionBiome>)
  .flatMap(([biomeId, biome], biomeIndex) => biome.npcs.map(([id, displayName, mapRole, role, _species, _design, bark, warningBark], roleIndex) => {
    const x = EXPANSION_POSITION_X[mapRole][role];
    return npc({
      id,
      displayName,
      role,
      biomeId: biomeId as BiomeId,
      mapId: `${biomeId}-${mapRole}`,
      position: [x, 0.82],
      patrolRange: role === 'resident' ? [x - 4, x + 4] : undefined,
      spriteId: id,
      bark,
      warningBark,
      defense: biomeDefense(role, biomeIndex * 2 + roleIndex % 3)
    });
  }));

export const STORY_BIOME_NPCS: StoryNpcDefinition[] = [...STORY_LEGACY_BIOME_NPCS, ...STORY_EXPANSION_NPCS];

export const STORY_NPCS = [...STORY_STARTER_NPCS, ...STORY_BIOME_NPCS];

export const STORY_NPC_SPRITES: Record<string, StoryNpcSpriteManifest> = Object.fromEntries(
  (npcManifest.npcs as unknown as StoryNpcSpriteManifest[]).map((entry) => [entry.id, entry])
);

export const STORY_NPC_VISIBLE_WORLD_HEIGHT = 3.05;
export const STORY_NPC_FOOT_CONTACT_SINK_Y = 0.055;
export const STORY_NPC_ENTRANCE_SIDE_CLEARANCE = 1.25;
// Html popups are centered on their world anchor, so this includes enough room
// for the lower half of the card to clear the NPC's visible head.
export const STORY_NPC_POPUP_ANCHOR_Y = STORY_NPC_VISIBLE_WORLD_HEIGHT - STORY_GROUNDED_ACTOR_CENTER_Y + 0.82;
export const STORY_NPC_WATCH_RADIUS_X = 4.5;
export const STORY_NPC_WATCH_RADIUS_Y = 2.4;

export function storyNpcWatchFacing(
  npcPosition: readonly [number, number],
  playerPosition: Readonly<{ x: number; y: number }>,
  currentFacing: -1 | 1
): -1 | 1 {
  const deltaX = playerPosition.x - npcPosition[0];
  const deltaY = playerPosition.y - npcPosition[1];
  if (Math.abs(deltaX) > STORY_NPC_WATCH_RADIUS_X || Math.abs(deltaY) > STORY_NPC_WATCH_RADIUS_Y) return currentFacing;
  if (Math.abs(deltaX) < 0.08) return currentFacing;
  return deltaX > 0 ? 1 : -1;
}

export function storyNpcPlaneSize(sprite: StoryNpcSpriteManifest | undefined): number {
  if (!sprite) return STORY_NPC_VISIBLE_WORLD_HEIGHT;
  const contentHeight = sprite.referenceContentBounds[3] - sprite.referenceContentBounds[1];
  return STORY_NPC_VISIBLE_WORLD_HEIGHT * sprite.frameSize.height / Math.max(1, contentHeight);
}

export function storyNpcFootContactSinkY(planeSize: number, frameHeight: number, surfacePixelWorldHeight = 0): number {
  return Math.max(STORY_NPC_FOOT_CONTACT_SINK_Y, planeSize / Math.max(1, frameHeight), Math.max(0, surfacePixelWorldHeight));
}

export function storyNpcsForMap(mapId: string) {
  return STORY_NPCS.filter((entry) => entry.mapId === mapId);
}

export function getStoryNpc(id: string) {
  return STORY_NPCS.find((entry) => entry.id === id);
}
