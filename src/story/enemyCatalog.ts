import manifestJson from './storyEnemyManifest.json';
import type { StoryEnemyArchetype, StoryEnemyBehavior, StoryEnemyId, StoryEnemyTier } from './types';

export type StoryEnemyFrameDefinition = {
  id: string;
  path: string;
  durationMs: number;
  contentBounds: [number, number, number, number];
  derivedFrom?: string;
};

export type StoryEnemyAnimationDefinition = {
  id: string;
  loop: boolean;
  activeFrameRange?: [number, number];
  frames: StoryEnemyFrameDefinition[];
};

export type StoryEnemyAttackDefinition = {
  animation: string;
  damageMultiplier: number;
  range: number;
  cooldownMs: number;
  projectile?: { speed: number; lifetimeMs: number; radius: number; color: string };
};

export type StoryEnemyDefinition = {
  id: StoryEnemyId;
  label: string;
  tier: StoryEnemyTier;
  archetype: StoryEnemyArchetype;
  behavior: StoryEnemyBehavior;
  worldScale: number;
  hitbox: [number, number];
  healthMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
  xpMultiplier: number;
  attacks: StoryEnemyAttackDefinition[];
  animations: StoryEnemyAnimationDefinition[];
};

type ManifestEnemy = {
  id: StoryEnemyId;
  label: string;
  tier: StoryEnemyTier;
  animations: StoryEnemyAnimationDefinition[];
};

const manifest = manifestJson as unknown as { version: number; frameSize: { width: number; height: number; baseline: number }; enemies: ManifestEnemy[] };
const animationsById = new Map(manifest.enemies.map((enemy) => [enemy.id, enemy]));

const melee = (animation: string, damageMultiplier = 1, range = 1.05, cooldownMs = 1_000): StoryEnemyAttackDefinition => ({ animation, damageMultiplier, range, cooldownMs });
const projectile = (animation: string, color: string, damageMultiplier = 0.9, cooldownMs = 1_650): StoryEnemyAttackDefinition => ({
  animation, damageMultiplier, range: 8, cooldownMs,
  projectile: { speed: 5.6, lifetimeMs: 2_400, radius: 0.26, color }
});

const CONFIG: Record<StoryEnemyId, Omit<StoryEnemyDefinition, 'id' | 'label' | 'tier' | 'animations'>> = {
  'veil-shade': { archetype: 'ranged', behavior: 'caster', worldScale: 1.05, hitbox: [0.55, 0.92], healthMultiplier: 1, damageMultiplier: 1, speedMultiplier: 0.95, xpMultiplier: 1.1, attacks: [melee('attack-1', 0.85, 1.1, 1_150), projectile('attack-2', '#d8e5ff')] },
  'cinder-wisp': { archetype: 'flying', behavior: 'flying', worldScale: 0.82, hitbox: [0.5, 0.5], healthMultiplier: 0.9, damageMultiplier: 1.05, speedMultiplier: 1.2, xpMultiplier: 1.15, attacks: [projectile('attack-1', '#ffb02e', 0.85, 1_250), melee('attack-2', 1.2, 1.25, 1_500), projectile('special', '#ff7a21', 1.15, 2_100)] },
  'nightshade-bulb': { archetype: 'ranged', behavior: 'ambusher', worldScale: 0.92, hitbox: [0.55, 0.62], healthMultiplier: 1.08, damageMultiplier: 0.95, speedMultiplier: 0.82, xpMultiplier: 1.1, attacks: [melee('attack-1', 0.8, 1.15, 950), melee('attack-2', 1, 1.45, 1_250), projectile('special', '#b449d1', 1.05, 1_850)] },
  graveblade: { archetype: 'ground', behavior: 'chaser', worldScale: 0.92, hitbox: [0.52, 0.78], healthMultiplier: 1.12, damageMultiplier: 1.05, speedMultiplier: 1.05, xpMultiplier: 1.05, attacks: [melee('attack-1', 0.9, 1.1, 900), melee('attack-2', 1.15, 1.35, 1_200), projectile('special', '#f0b070', 1, 1_900)] },
  'tide-slime': { archetype: 'ground', behavior: 'chaser', worldScale: 0.78, hitbox: [0.55, 0.45], healthMultiplier: 0.88, damageMultiplier: 0.9, speedMultiplier: 1.08, xpMultiplier: 0.9, attacks: [melee('attack-1', 0.85, 1.15, 850), melee('attack-2', 1, 1.25, 1_100)] },
  'venom-slime': { archetype: 'ground', behavior: 'ambusher', worldScale: 0.78, hitbox: [0.55, 0.45], healthMultiplier: 0.92, damageMultiplier: 0.95, speedMultiplier: 1, xpMultiplier: 0.95, attacks: [melee('attack-1', 0.85, 1.15, 900), melee('attack-3', 1.05, 1.3, 1_200)] },
  'volt-slime': { archetype: 'ground', behavior: 'chaser', worldScale: 0.78, hitbox: [0.55, 0.45], healthMultiplier: 0.85, damageMultiplier: 1.05, speedMultiplier: 1.22, xpMultiplier: 1, attacks: [melee('attack-1', 0.8, 1.2, 760), melee('attack-4', 1.1, 1.35, 1_150)] },
  'magma-slime': { archetype: 'ground', behavior: 'bruiser', worldScale: 0.82, hitbox: [0.58, 0.48], healthMultiplier: 1.2, damageMultiplier: 1.15, speedMultiplier: 0.9, xpMultiplier: 1.1, attacks: [melee('attack-1', 0.9, 1.2, 950), melee('attack-3', 1.2, 1.4, 1_350)] },
  'ember-fist': { archetype: 'ground', behavior: 'duelist', worldScale: 1.08, hitbox: [0.58, 0.95], healthMultiplier: 4.5, damageMultiplier: 1.5, speedMultiplier: 1.12, xpMultiplier: 6, attacks: [melee('attack-1', 0.9, 1.2, 800), melee('attack-2', 1.1, 1.35, 1_050), melee('attack-3', 1.35, 1.55, 1_350)] },
  'dusk-ronin': { archetype: 'ground', behavior: 'duelist', worldScale: 1.08, hitbox: [0.58, 0.98], healthMultiplier: 4.5, damageMultiplier: 1.5, speedMultiplier: 1.05, xpMultiplier: 6, attacks: [melee('attack-1', 1, 1.55, 900), melee('attack-2', 1.2, 1.75, 1_150), melee('attack-3', 1.45, 1.9, 1_450)] },
  'crescent-rogue': { archetype: 'ground', behavior: 'duelist', worldScale: 1.08, hitbox: [0.6, 0.95], healthMultiplier: 4.25, damageMultiplier: 1.45, speedMultiplier: 1.25, xpMultiplier: 6, attacks: [melee('attack-1', 0.85, 1.45, 720), melee('attack-2', 1.1, 1.65, 980), melee('attack-3', 1.35, 1.8, 1_250)] },
  'chimera-android': { archetype: 'ground', behavior: 'bruiser', worldScale: 1.08, hitbox: [0.62, 0.98], healthMultiplier: 4.8, damageMultiplier: 1.55, speedMultiplier: 0.98, xpMultiplier: 6, attacks: [melee('attack-1', 0.95, 1.35, 900), melee('attack-3', 1.35, 1.55, 1_350), melee('attack-4', 1.55, 1.7, 1_700)] },
  'silver-duelist': { archetype: 'ground', behavior: 'duelist', worldScale: 1.1, hitbox: [0.58, 1], healthMultiplier: 4.25, damageMultiplier: 1.5, speedMultiplier: 1.18, xpMultiplier: 6, attacks: [melee('attack-1', 0.9, 1.75, 760), melee('attack-2', 1.1, 2, 980), melee('attack-3', 1.35, 2.15, 1_300)] },
  'crimson-countess': { archetype: 'ranged', behavior: 'caster', worldScale: 1.1, hitbox: [0.62, 1], healthMultiplier: 4.35, damageMultiplier: 1.5, speedMultiplier: 0.95, xpMultiplier: 6, attacks: [melee('attack-1', 0.9, 1.4, 900), projectile('attack-2', '#e33558', 1.1, 1_250), projectile('attack-4', '#ff4a72', 1.4, 1_750)] },
  'laughing-oni': { archetype: 'ground', behavior: 'bruiser', worldScale: 1.12, hitbox: [0.64, 1], healthMultiplier: 5, damageMultiplier: 1.6, speedMultiplier: 0.92, xpMultiplier: 6.25, attacks: [melee('attack-1', 0.95, 1.25, 900), melee('attack-2', 1.25, 1.45, 1_250), melee('special', 1.5, 1.75, 1_700)] },
  'hollow-bride': { archetype: 'ranged', behavior: 'caster', worldScale: 1.12, hitbox: [0.62, 1], healthMultiplier: 4.4, damageMultiplier: 1.5, speedMultiplier: 0.9, xpMultiplier: 6, attacks: [melee('attack-1', 0.85, 1.35, 900), projectile('attack-3', '#d62a8b', 1.05, 1_150), projectile('attack-4', '#ff4ea3', 1.35, 1_650)] }
};

export const STORY_ENEMY_FRAME_SIZE = manifest.frameSize;
export const STORY_ENEMY_IDS = Object.keys(CONFIG) as StoryEnemyId[];
export const STORY_REGULAR_ENEMY_IDS = STORY_ENEMY_IDS.filter((id) => animationsById.get(id)?.tier === 'regular');
export const STORY_CHALLENGER_IDS = STORY_ENEMY_IDS.filter((id) => animationsById.get(id)?.tier === 'challenger');

export const STORY_ENEMY_CATALOG = STORY_ENEMY_IDS.reduce((catalog, id) => {
  const assets = animationsById.get(id);
  if (!assets) throw new Error(`Missing runtime enemy assets for ${id}`);
  catalog[id] = { id, label: assets.label, tier: assets.tier, animations: assets.animations, ...CONFIG[id] };
  return catalog;
}, {} as Record<StoryEnemyId, StoryEnemyDefinition>);

export function getStoryEnemyDefinition(id: StoryEnemyId): StoryEnemyDefinition {
  return STORY_ENEMY_CATALOG[id];
}

export function getStoryEnemyAnimation(id: StoryEnemyId, animation: string): StoryEnemyAnimationDefinition {
  const definition = getStoryEnemyDefinition(id);
  return definition.animations.find((candidate) => candidate.id === animation)
    ?? definition.animations.find((candidate) => candidate.id === 'idle')!;
}

export function validateStoryEnemyCatalog(): string[] {
  const errors: string[] = [];
  if (manifest.version !== 1) errors.push('Enemy manifest version must be 1');
  if (manifest.enemies.length !== 16) errors.push('Enemy manifest must contain 16 enemies');
  for (const id of STORY_ENEMY_IDS) {
    const enemy = STORY_ENEMY_CATALOG[id];
    if (!enemy.animations.some((animation) => animation.id === 'idle')) errors.push(`${id} has no idle animation`);
    if (!enemy.attacks.every((attack) => enemy.animations.some((animation) => animation.id === attack.animation))) errors.push(`${id} references a missing attack animation`);
    if (enemy.tier === 'challenger' && (!enemy.animations.some((animation) => animation.id === 'hurt') || !enemy.animations.some((animation) => animation.id === 'dead'))) errors.push(`${id} needs hurt and dead animations`);
  }
  return errors;
}
