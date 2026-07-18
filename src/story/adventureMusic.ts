import soundtrackManifest from './stimmermanAdventureManifest.json';
import type { AdventureMusicContext, AdventureMusicTrackDefinition } from './types';

type ImportedTrack = AdventureMusicTrackDefinition & { sourceVideoId: string; collectionTitle: string };

export const STIMMERMAN_ADVENTURE_CREDIT = 'Original music composed and produced by Stimmerman. Used with permission.';
export const STIMMERMAN_ADVENTURE_TRACKS = soundtrackManifest.tracks as unknown as ImportedTrack[];

const WORLD_ANCHORS: Record<AdventureMusicContext['worldId'], string[]> = {
  'world-route': ['Village of Ages', 'Gentle Landing/Village Music 1', 'Welcome Home', 'Menu of Dreams'],
  greenhollow: ['Enchanted Forest', 'Whole Forests in a Single Inch', 'River Theme', 'Bog of Friendship'],
  thornwood: ['Unfamiliar Land', 'Creeping and Crawling', 'Wiggle Wriggle Dig', 'Intimations'],
  ironroot: ['Under Ground Control', 'Over Rocks and Under Hills', 'Substrate', 'Chromium Crossing'],
  bonevault: ['Bodies in the Rain', 'New Bone', 'Shot in the Dark', 'Spooky Mystical Plot Point', 'Into the Abyss'],
  emberdeep: ["Pressure's On", 'Building to Battle', 'Close Range', 'Gear Head'],
  frostpeak: ['Crystal Vista', 'Mountain Theme (Lookout)', 'Smog on the Horizon', 'From the Mist'],
  sunscar: ['Grain and Sand', 'Golden Light', 'Dust in the Sunbeam', 'Beachside', 'Eat Dust'],
  skyglass: ['On Pastel Clouds', 'Clouds Over Town', 'Slightly Majestic Underscore', 'Asteroid Exploration', 'Light Speed']
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function shuffled<T>(items: T[], seed: string) {
  const output = [...items];
  let state = hash(seed) || 0x9e3779b9;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

export function adventureMusicPool(context: AdventureMusicContext) {
  const anchors = STIMMERMAN_ADVENTURE_TRACKS.filter((track) => WORLD_ANCHORS[context.worldId].some((title) => track.title.toLowerCase().includes(title.toLowerCase())));
  const exact = STIMMERMAN_ADVENTURE_TRACKS.filter((track) => track.biomes.includes(context.worldId) && track.phases.includes(context.phase));
  if (exact.length > 0) return Array.from(new Map([...anchors, ...exact].map((track) => [track.id, track])).values());
  const biome = STIMMERMAN_ADVENTURE_TRACKS.filter((track) => track.biomes.includes(context.worldId));
  if (biome.length > 0) return biome;
  const phase = STIMMERMAN_ADVENTURE_TRACKS.filter((track) => track.phases.includes(context.phase));
  return phase.length > 0 ? phase : STIMMERMAN_ADVENTURE_TRACKS;
}

export function deterministicAdventurePlaylist(context: AdventureMusicContext, profileKey: string, utcDate = new Date().toISOString().slice(0, 10)) {
  return shuffled(adventureMusicPool(context), `${profileKey}:${utcDate}:${context.worldId}:${context.mapId ?? 'surface'}:${context.phase}`);
}

export function adventureCrossfadeMs(previous: AdventureMusicContext | null, next: AdventureMusicContext) {
  if (next.phase === 'elite' || next.phase === 'race') return 750;
  if (previous?.worldId === next.worldId && previous.phase === next.phase) return 0;
  return 1_800;
}
