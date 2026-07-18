import type {
  StoryAccessory,
  StoryAvatarDefinition,
  StoryAvatarSet,
  StoryAvatarLineage,
  StoryBodyPreset,
  StoryBodyTone,
  StoryHairStyle,
  StoryLegStyle,
  StoryOutfit
} from './types';

export const STORY_AVATAR_SETS: readonly StoryAvatarSet[] = [
  'solar-runner', 'street-shadow', 'crimson-ranger', 'rose-blade',
  'neon-courier', 'ember-scout', 'synth-drifter', 'forest-warden',
  'solar-brawler', 'void-operative', 'circuit-mage', 'street-medic',
  'arena-rebel', 'tech-nomad'
];
export const STORY_AVATAR_SET_LABELS: Record<StoryAvatarSet, string> = {
  'solar-runner': 'Solar Runner',
  'street-shadow': 'Street Shadow',
  'crimson-ranger': 'Crimson Ranger',
  'rose-blade': 'Rose Blade',
  'neon-courier': 'Neon Courier',
  'ember-scout': 'Ember Scout',
  'synth-drifter': 'Synth Drifter',
  'forest-warden': 'Forest Warden',
  'solar-brawler': 'Solar Brawler',
  'void-operative': 'Void Operative',
  'circuit-mage': 'Circuit Mage',
  'street-medic': 'Street Medic',
  'arena-rebel': 'Arena Rebel',
  'tech-nomad': 'Tech Nomad'
};

export type StoryAvatarSelectionProfile = {
  role: string;
  description: string;
  strengths: string;
  special: string;
};

export const STORY_AVATAR_SELECTION_PROFILES: Record<StoryAvatarSet, StoryAvatarSelectionProfile> = {
  'solar-runner': {
    role: 'Swift Vanguard',
    description: 'A fearless pathfinder who meets danger with speed, warmth, and a flash of sunlight.',
    strengths: 'Fast opening strikes, quick pursuit, and keeping pressure on fleeing enemies.',
    special: 'Launches a bright solar flare that carries the fight across the battlefield.'
  },
  'street-shadow': {
    role: 'Close-Range Trickster',
    description: 'A quiet city fighter who slips through danger and strikes before enemies can settle in.',
    strengths: 'Quick kicks, sudden heavy blows, and fighting confidently at close range.',
    special: 'Unleashes a shadow-charged burst against nearby enemies.'
  },
  'crimson-ranger': {
    role: 'Long-Range Hunter',
    description: 'A sharp-eyed trailblazer who stays calm, chooses the right opening, and never wastes a shot.',
    strengths: 'Keeping distance, punishing faraway threats, and landing swift ranged attacks.',
    special: 'Fires a fast crimson shot that reaches enemies in an instant.'
  },
  'rose-blade': {
    role: 'Agile Duelist',
    description: 'A graceful swordfighter whose elegant movements hide a bold and relentless heart.',
    strengths: 'Fast opening slashes, steady close-range pressure, and precise finishing attacks.',
    special: 'Sweeps the blade through a powerful rose-lit finishing arc.'
  },
  'neon-courier': {
    role: 'Mobile Blaster',
    description: 'A daring messenger who treats every battlefield like one more impossible delivery route.',
    strengths: 'Staying on the move, changing distance quickly, and attacking while enemies regroup.',
    special: 'Sends a neon charge racing forward to catch distant targets.'
  },
  'ember-scout': {
    role: 'Flamefront Scrapper',
    description: 'A bold wilderness scout who turns every close call into fuel for the next attack.',
    strengths: 'Aggressive close-range fighting, strong kicks, and forcing enemies backward.',
    special: 'Ignites a fierce point-blank blaze for a powerful finish.'
  },
  'synth-drifter': {
    role: 'Precision Blaster',
    description: 'A wandering machine-soul who studies every threat and answers with cool precision.',
    strengths: 'Measured attacks, safe spacing, and fast shots against hard-to-reach enemies.',
    special: 'Releases a focused energy bolt that travels quickly across the field.'
  },
  'forest-warden': {
    role: 'Steady Guardian',
    description: 'A patient protector who carries the strength of old trees into every dangerous place.',
    strengths: 'Reliable opening strikes, holding ground, and turning defense into close-range pressure.',
    special: 'Calls up a forceful sweep of wild energy around the blade.'
  },
  'solar-brawler': {
    role: 'Sun-Powered Bruiser',
    description: 'A cheerful powerhouse who charges straight toward trouble and hits with unmistakable force.',
    strengths: 'Heavy attacks, strong knockback, and controlling space with a slow, threatening blast.',
    special: 'Throws a broad solar burst that steadily drives enemies out of its path.'
  },
  'void-operative': {
    role: 'Patient Controller',
    description: 'A mysterious tactician who waits for one perfect mistake and makes enemies regret it.',
    strengths: 'Careful spacing, patient counterattacks, and controlling where enemies can safely stand.',
    special: 'Sends a lingering void pulse forward to close off an escape route.'
  },
  'circuit-mage': {
    role: 'Arcane Artillery',
    description: 'A curious spellcaster who blends old mysteries with crackling new power.',
    strengths: 'Fighting from afar, reaching flying threats, and answering danger with fast magic.',
    special: 'Casts a swift circuit spell that streaks toward distant enemies.'
  },
  'street-medic': {
    role: 'Fearless Responder',
    description: 'A level-headed rescuer who runs toward danger and refuses to leave anyone behind.',
    strengths: 'Clear attack timing, dependable close-range blows, and staying composed under pressure.',
    special: 'Delivers a decisive point-blank shock to stop an advancing enemy.'
  },
  'arena-rebel': {
    role: 'Crowd-Favorite Fighter',
    description: 'A bold challenger who brings arena confidence, improvised style, and plenty of heart.',
    strengths: 'Direct jabs, forceful kicks, and keeping close-range fights moving at a lively pace.',
    special: 'Finishes with a dramatic rebel strike built for the front line.'
  },
  'tech-nomad': {
    role: 'Versatile Explorer',
    description: 'A resourceful traveler who brings the right tool, the right plan, and a calm answer to the unknown.',
    strengths: 'Adapting to changing threats, fighting at any distance, and safely reaching remote enemies.',
    special: 'Launches a reliable tech charge that covers the path ahead.'
  }
};

export const STORY_BODY_PRESETS: readonly StoryBodyPreset[] = ['compact', 'standard', 'tall'];
export const STORY_BODY_TONES: readonly StoryBodyTone[] = ['blue', 'dark', 'gray', 'green', 'light', 'pale', 'red', 'tan', 'white', 'yellow'];
export const STORY_AVATAR_LINEAGES: readonly StoryAvatarLineage[] = ['human', 'sylvan', 'emberkin', 'synth'];
export const STORY_HAIR_STYLES: readonly StoryHairStyle[] = ['short', 'spiked', 'bob', 'locs', 'ponytail', 'curls', 'undercut', 'swept'];
export const STORY_HAIR_COLORS = ['#15131a', '#4a2c22', '#8b5134', '#d2a15f', '#e7e8f0', '#2d68d8', '#9f49c8', '#cf3f4f'] as const;
export const STORY_OUTFITS: readonly StoryOutfit[] = [
  'kore-cyan', 'solar-runner', 'royal-circuit', 'signal-striker', 'forest-scout',
  'mono-steel', 'neon-street', 'arena-varsity', 'tech-nomad', 'void-operative'
];
export const STORY_LEG_STYLES: readonly StoryLegStyle[] = [
  'fitted', 'cargo', 'joggers', 'wide', 'runner', 'armored', 'techwear', 'utility'
];
export const STORY_ACCESSORIES: readonly StoryAccessory[] = [
  'none', 'headband', 'glasses', 'headphones', 'scarf', 'cyber-visor',
  'street-cap', 'comms-headset', 'holo-pin'
];

export const STORY_BODY_TONE_SWATCHES: Record<StoryBodyTone, string> = {
  blue: '#4e8eff',
  dark: '#75442f',
  gray: '#9b9ca7',
  green: '#5fae63',
  light: '#e7b98e',
  pale: '#f6d2b8',
  red: '#c45b55',
  tan: '#ca8e65',
  white: '#f1eee7',
  yellow: '#f1b52e'
};

export const STORY_OUTFIT_COLORS: Record<StoryOutfit, { primary: string; secondary: string; trim: string }> = {
  'kore-cyan': { primary: '#143a58', secondary: '#2ee6ff', trim: '#f7f7f2' },
  'solar-runner': { primary: '#5b2918', secondary: '#ff9d35', trim: '#ffe071' },
  'royal-circuit': { primary: '#33205a', secondary: '#aa78ff', trim: '#f0e8ff' },
  'signal-striker': { primary: '#551c25', secondary: '#ff5365', trim: '#fff0e5' },
  'forest-scout': { primary: '#173f32', secondary: '#45d69a', trim: '#e9fff5' },
  'mono-steel': { primary: '#242a35', secondary: '#8e9bad', trim: '#ffffff' },
  'neon-street': { primary: '#29204b', secondary: '#ff67dc', trim: '#53f4ff' },
  'arena-varsity': { primary: '#173b73', secondary: '#ffcc4a', trim: '#ffffff' },
  'tech-nomad': { primary: '#493b2f', secondary: '#e6a75a', trim: '#71d9c5' },
  'void-operative': { primary: '#12131c', secondary: '#6f78a8', trim: '#d94cff' }
};

export const STORY_LEG_COLORS: Record<StoryLegStyle, { primary: string; secondary: string }> = {
  fitted: { primary: '#171b2c', secondary: '#38435f' },
  cargo: { primary: '#263b35', secondary: '#7b9a78' },
  joggers: { primary: '#252538', secondary: '#6d708e' },
  wide: { primary: '#30283d', secondary: '#8a75a5' },
  runner: { primary: '#172d4d', secondary: '#2ee6ff' },
  armored: { primary: '#252b35', secondary: '#a7b2c3' },
  techwear: { primary: '#171722', secondary: '#d94cff' },
  utility: { primary: '#3d3328', secondary: '#d1a15f' }
};

const LEGACY_TONE_MAP: Record<string, StoryBodyTone> = {
  '#f6d2b8': 'pale',
  '#e7b98e': 'light',
  '#ca8e65': 'tan',
  '#a96947': 'yellow',
  '#75442f': 'dark',
  '#46291f': 'dark'
};

const LEGACY_OUTFIT_MAP: Record<string, StoryOutfit> = {
  'kore-cyan': 'kore-cyan',
  'solar-orange': 'solar-runner',
  'royal-violet': 'royal-circuit',
  'signal-red': 'signal-striker',
  'forest-green': 'forest-scout',
  'mono-steel': 'mono-steel'
};

export function sanitizeStoryName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

export function makeDefaultStoryAvatar(preferredName?: string): StoryAvatarDefinition {
  return {
    name: sanitizeStoryName(preferredName) || 'PLAYER',
    avatarSet: 'street-shadow',
    lineage: 'human',
    bodyPreset: 'standard',
    bodyTone: 'tan',
    hairStyle: 'short',
    hairColor: STORY_HAIR_COLORS[0],
    outfit: 'kore-cyan',
    legStyle: 'fitted',
    accessory: 'none'
  };
}

export function sanitizeStoryAvatar(value: unknown, preferredName?: string): StoryAvatarDefinition {
  const fallback = makeDefaultStoryAvatar(preferredName);
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Partial<StoryAvatarDefinition> & { skinTone?: unknown; outfitPalette?: unknown };
  const legacyTone = typeof record.skinTone === 'string' ? LEGACY_TONE_MAP[record.skinTone.toLowerCase()] : undefined;
  const legacyOutfit = typeof record.outfitPalette === 'string' ? LEGACY_OUTFIT_MAP[record.outfitPalette] : undefined;
  return {
    name: sanitizeStoryName(record.name) || fallback.name,
    avatarSet: STORY_AVATAR_SETS.includes(record.avatarSet as StoryAvatarSet) ? record.avatarSet as StoryAvatarSet : fallback.avatarSet,
    lineage: STORY_AVATAR_LINEAGES.includes(record.lineage as StoryAvatarLineage) ? record.lineage as StoryAvatarLineage : fallback.lineage,
    bodyPreset: STORY_BODY_PRESETS.includes(record.bodyPreset as StoryBodyPreset) ? record.bodyPreset as StoryBodyPreset : fallback.bodyPreset,
    bodyTone: STORY_BODY_TONES.includes(record.bodyTone as StoryBodyTone) ? record.bodyTone as StoryBodyTone : legacyTone ?? fallback.bodyTone,
    hairStyle: STORY_HAIR_STYLES.includes(record.hairStyle as StoryHairStyle) ? record.hairStyle as StoryHairStyle : fallback.hairStyle,
    hairColor: STORY_HAIR_COLORS.includes(record.hairColor as (typeof STORY_HAIR_COLORS)[number]) ? record.hairColor as string : fallback.hairColor,
    outfit: STORY_OUTFITS.includes(record.outfit as StoryOutfit) ? record.outfit as StoryOutfit : legacyOutfit ?? fallback.outfit,
    legStyle: STORY_LEG_STYLES.includes(record.legStyle as StoryLegStyle) ? record.legStyle as StoryLegStyle : fallback.legStyle,
    accessory: STORY_ACCESSORIES.includes(record.accessory as StoryAccessory) ? record.accessory as StoryAccessory : fallback.accessory
  };
}
