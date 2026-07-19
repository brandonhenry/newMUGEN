import type {
  StoryAdventureWorldId,
  StoryEnemySpawnDefinition,
  StoryGeneratedFloor,
  StoryGeneratedPickup,
  StoryGeneratedRoom,
  StoryGeneratedWildlife,
  StoryHazardDefinition,
  StoryWildlifeBehavior,
  StoryWildlifeSpeciesDefinition
} from './types';

type BiomeId = Exclude<StoryAdventureWorldId, 'world-route'>;

const INTEGRITY = '/story/ecology/asset-integrity.json';
const species = (
  id: string, label: string, packId: string, biomes: BiomeId[], behavior: StoryWildlifeBehavior,
  habitat: StoryWildlifeSpeciesDefinition['habitat'], frameCount: number, frameSize: number, scale: number,
  sourcePack: string, license: string
): StoryWildlifeSpeciesDefinition => ({
  id, label, packId, biomes, behavior, habitat,
  atlasPath: `/story/ecology/atlases/${packId}/${id}.png`, frameSize: [frameSize, frameSize], frameCount,
  frameDurationMs: 145, scale, sourcePack, license, integrityPath: INTEGRITY
});

export const STORY_WILDLIFE_SPECIES: StoryWildlifeSpeciesDefinition[] = [
  species('dog', 'Route Dog', 'street', ['greenhollow'], 'passive', 'settlement', 4, 48, 1.2, 'Free Street Animals', 'free commercial use with attribution'),
  species('cat', 'Market Cat', 'street', ['greenhollow', 'bonevault'], 'passive', 'settlement', 4, 48, 1.1, 'Free Street Animals', 'free commercial use with attribution'),
  species('bird', 'Street Pigeon', 'street', ['greenhollow', 'sunscar'], 'fleeing', 'air', 4, 32, 0.9, 'Free Street Animals', 'free commercial use with attribution'),
  species('rat', 'Street Rat', 'street', ['greenhollow', 'ironroot', 'bonevault'], 'fleeing', 'ground', 4, 32, 0.75, 'Free Street Animals', 'free commercial use with attribution'),
  species('minibunny', 'Forest Rabbit', 'minifolks', ['greenhollow', 'thornwood', 'frostpeak'], 'passive', 'ground', 4, 32, 0.9, 'MiniFolks Forest Animals', 'CC BY 4.0'),
  species('minideer1', 'Forest Deer', 'minifolks', ['greenhollow', 'thornwood', 'frostpeak', 'skyglass'], 'passive', 'ground', 4, 32, 1.35, 'MiniFolks Forest Animals', 'CC BY 4.0'),
  species('minifox', 'Forest Fox', 'minifolks', ['greenhollow', 'thornwood', 'frostpeak'], 'fleeing', 'ground', 4, 32, 1, 'MiniFolks Forest Animals', 'CC BY 4.0'),
  species('minibird', 'Canopy Bird', 'minifolks', ['greenhollow', 'thornwood', 'frostpeak', 'skyglass'], 'fleeing', 'air', 4, 16, 0.75, 'MiniFolks Forest Animals', 'CC BY 4.0'),
  species('miniboar', 'Wild Boar', 'minifolks', ['thornwood', 'sunscar'], 'hostile', 'ground', 4, 32, 1.15, 'MiniFolks Forest Animals', 'CC BY 4.0'),
  species('miniwolf', 'Wild Wolf', 'minifolks', ['thornwood', 'frostpeak', 'skyglass'], 'hostile', 'ground', 4, 32, 1.15, 'MiniFolks Forest Animals', 'CC BY 4.0'),
  species('minibear', 'Wild Bear', 'minifolks', ['thornwood', 'frostpeak'], 'hostile', 'ground', 4, 32, 1.35, 'MiniFolks Forest Animals', 'CC BY 4.0'),
  species('green-frog', 'Moss Frog', 'froglet', ['thornwood', 'ironroot'], 'passive', 'ground', 8, 16, 0.8, 'Froglet', 'CC0'),
  species('blue-frog', 'Cave Frog', 'froglet', ['ironroot', 'frostpeak'], 'passive', 'cave', 8, 16, 0.8, 'Froglet', 'CC0'),
  species('yellow-frog', 'Ember Frog', 'froglet', ['emberdeep', 'sunscar'], 'fleeing', 'cave', 8, 16, 0.8, 'Froglet', 'CC0'),
  species('pink-frog', 'Prism Frog', 'froglet', ['skyglass'], 'passive', 'ground', 8, 16, 0.8, 'Froglet', 'CC0'),
  species('kimbul-bat', 'Cave Bat', 'bat', ['ironroot', 'bonevault', 'emberdeep', 'skyglass'], 'hostile', 'air', 15, 80, 0.85, 'Kimbulworks Bat', 'CC0'),
  species('crow', 'Vault Crow', 'birds', ['bonevault'], 'ambient', 'air', 12, 32, 0.85, 'Carysaurus Birds free tier', 'attribution required'),
  species('pigeon', 'Route Pigeon', 'birds', ['greenhollow', 'frostpeak'], 'ambient', 'air', 12, 32, 0.85, 'Carysaurus Birds free tier', 'attribution required'),
  species('yellowbird', 'Ash Bird', 'birds', ['emberdeep', 'sunscar', 'skyglass'], 'ambient', 'air', 12, 32, 0.85, 'Carysaurus Birds free tier', 'attribution required'),
  species('rat-darkgrey', 'Cave Rat', 'rats', ['ironroot', 'bonevault'], 'ambient', 'cave', 4, 32, 0.7, 'Carysaurus Rats free tier', 'attribution required'),
  species('snakebrown', 'Briar Snake', 'snakes', ['thornwood', 'sunscar'], 'ambient', 'ground', 7, 32, 0.85, 'Carysaurus Snakes free tier', 'attribution required'),
  species('snakered', 'Fire Snake', 'snakes', ['emberdeep'], 'ambient', 'cave', 7, 32, 0.85, 'Carysaurus Snakes free tier', 'attribution required'),
  species('snakeblue', 'Ice Snake', 'snakes', ['frostpeak', 'skyglass'], 'ambient', 'ground', 7, 32, 0.85, 'Carysaurus Snakes free tier', 'attribution required'),
  species('snow-fox', 'Snow Fox', 'deepdive', ['frostpeak'], 'passive', 'ground', 4, 16, 0.72, 'DeepDive free basic tier', 'free basic tier'),
  species('pasturing-sheep', 'Route Sheep', 'deepdive', ['greenhollow', 'sunscar'], 'passive', 'ground', 4, 16, 0.72, 'DeepDive free basic tier', 'free basic tier'),
  species('croaking-toad', 'Ash Toad', 'deepdive', ['thornwood', 'emberdeep'], 'passive', 'ground', 4, 16, 0.72, 'DeepDive free basic tier', 'free basic tier'),
  species('timber-wolf', 'Timber Wolf', 'deepdive', ['thornwood', 'frostpeak'], 'hostile', 'ground', 4, 16, 0.78, 'DeepDive free basic tier', 'free basic tier'),
  species('mad-boar', 'Dune Boar', 'deepdive', ['thornwood', 'sunscar'], 'hostile', 'ground', 4, 16, 0.78, 'DeepDive free basic tier', 'free basic tier')
];

export const STORY_WILDLIFE_BY_ID = Object.fromEntries(STORY_WILDLIFE_SPECIES.map((entry) => [entry.id, entry])) as Record<string, StoryWildlifeSpeciesDefinition>;

const BIOME_FAMILIES: Record<BiomeId, string[]> = {
  greenhollow: ['street', 'minifolks', 'birds', 'deepdive'], thornwood: ['minifolks', 'froglet', 'deepdive', 'snakes'],
  ironroot: ['froglet', 'bat', 'rats'], bonevault: ['street', 'bat', 'birds', 'rats'],
  emberdeep: ['froglet', 'bat', 'birds', 'snakes', 'deepdive'], frostpeak: ['minifolks', 'birds', 'deepdive', 'snakes'],
  sunscar: ['street', 'birds', 'deepdive', 'snakes'], skyglass: ['minifolks', 'froglet', 'bat', 'birds', 'snakes']
};

export const STORY_COLLECTIBLE_FAMILIES = ['lared', 'svor', 'fantasy', 'greatdoc'] as const;

const PICKUP_VISUALS: Record<typeof STORY_COLLECTIBLE_FAMILIES[number], Array<{ id: string; path: string; frames: number }>> = {
  lared: [
    { id: 'spr-coin-ama', path: '/story/ecology/atlases/lared/spr-coin-ama.png', frames: 4 },
    { id: 'spr-coin-azu', path: '/story/ecology/atlases/lared/spr-coin-azu.png', frames: 4 },
    { id: 'spr-coin-roj', path: '/story/ecology/atlases/lared/spr-coin-roj.png', frames: 4 },
    { id: 'spr-coin-gri', path: '/story/ecology/atlases/lared/spr-coin-gri.png', frames: 4 }
  ],
  svor: [
    { id: 'coin', path: '/story/ecology/atlases/svor/coin-.png', frames: 7 },
    { id: 'gemstone1', path: '/story/ecology/atlases/svor/gemstone1-.png', frames: 8 },
    { id: 'key1', path: '/story/ecology/atlases/svor/key1.png', frames: 6 },
    { id: 'mushroom', path: '/story/ecology/atlases/svor/mushroom-.png', frames: 2 }
  ],
  fantasy: [{ id: 'fantasy-orb', path: '/story/ecology/atlases/collectibles/fantasy-orb.png', frames: 12 }],
  greatdoc: [{ id: 'greatdoc-coin', path: '/story/ecology/atlases/collectibles/greatdoc-coin.png', frames: 8 }]
};

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function safeFromHazards(position: [number, number], hazards: StoryHazardDefinition[]) {
  return hazards.every((hazard) => position[0] < hazard.bounds[0] - 2 || position[0] > hazard.bounds[1] + 2 || position[1] < hazard.bounds[2] - 1 || position[1] > hazard.bounds[3] + 1);
}

function safeRoomSockets(room: StoryGeneratedRoom, kind: 'wildlife' | 'pickup'): Array<[number, number]> {
  const center = (room.bounds[0] + room.bounds[1]) / 2;
  const sockets = kind === 'pickup' ? room.rewardAlcoves : room.propSockets;
  return sockets.map(([x, y]) => [center + x, room.bounds[2] + y + 1] as [number, number]);
}

export function generateStoryFloorEcology(input: Pick<StoryGeneratedFloor, 'version' | 'worldId' | 'seed' | 'floorNumber' | 'intent' | 'rooms' | 'hazards' | 'enemySpawns' | 'entranceRoomId' | 'exitRoomId' | 'spawn' | 'exit'>) {
  if (input.version < 9) return { ecologyFamilyId: undefined, collectibleFamilyId: undefined, wildlife: [] as StoryGeneratedWildlife[], pickups: [] as StoryGeneratedPickup[] };
  const peaceful = input.intent === 'harvest' || input.intent === 'exploration';
  const ecologyFamilies = BIOME_FAMILIES[input.worldId].filter((packId) => {
    const compatible = STORY_WILDLIFE_SPECIES.filter((entry) => entry.packId === packId && entry.biomes.includes(input.worldId));
    if (compatible.some((entry) => entry.behavior !== 'hostile')) return true;
    return !peaceful && compatible.some((entry) => entry.behavior === 'hostile') && input.enemySpawns.some((enemy) => safeFromHazards(enemy.position, input.hazards));
  });
  const ecologyFamilyId = ecologyFamilies[hash(`${input.seed}:${input.floorNumber}:ecology`) % ecologyFamilies.length];
  const collectibleFamilyId = STORY_COLLECTIBLE_FAMILIES[hash(`${input.seed}:${input.floorNumber}:collectibles`) % STORY_COLLECTIBLE_FAMILIES.length];
  const available = STORY_WILDLIFE_SPECIES.filter((entry) => entry.packId === ecologyFamilyId && entry.biomes.includes(input.worldId));
  const ambientSpecies = available.filter((entry) => entry.behavior !== 'hostile');
  const hostileSpecies = peaceful ? [] : available.filter((entry) => entry.behavior === 'hostile');
  const safeRooms = input.rooms.filter((room) => room.id !== input.entranceRoomId && room.id !== input.exitRoomId && room.templateKind !== 'event');
  const wildlife: StoryGeneratedWildlife[] = [];
  const desired = Math.min(5, Math.max(2, Math.floor(safeRooms.length * 0.6)));
  const candidates = safeRooms.flatMap((room) => safeRoomSockets(room, 'wildlife').map((position) => ({ room, position })))
    .filter(({ position }) => safeFromHazards(position, input.hazards))
    .filter(({ position }) => input.enemySpawns.every((enemy) => Math.abs(enemy.position[0] - position[0]) >= 4));
  for (let index = 0; index < desired && index < candidates.length && ambientSpecies.length > 0; index += 1) {
    const selected = candidates[hash(`${input.seed}:wildlife-socket:${index}`) % candidates.length];
    const definition = ambientSpecies[hash(`${input.seed}:wildlife-species:${index}`) % ambientSpecies.length];
    wildlife.push({ id: `${selected.room.id}-wildlife-${index + 1}`, roomId: selected.room.id, speciesId: definition.id, packId: ecologyFamilyId, behavior: definition.behavior, position: selected.position, leash: [selected.room.bounds[0] + 3, selected.room.bounds[1] - 3] });
  }
  if (hostileSpecies.length > 0) {
    input.enemySpawns.filter((enemy) => safeFromHazards(enemy.position, input.hazards)).slice(0, Math.max(1, Math.floor(input.enemySpawns.length * 0.15))).forEach((enemy, index) => {
      const definition = hostileSpecies[hash(`${input.seed}:hostile-wildlife:${index}`) % hostileSpecies.length];
      const room = input.rooms.find((candidate) => enemy.position[0] >= candidate.bounds[0] && enemy.position[0] <= candidate.bounds[1]);
      if (room && safeFromHazards(enemy.position, input.hazards)) wildlife.push({ id: `${enemy.id}-wildlife`, roomId: room.id, speciesId: definition.id, packId: ecologyFamilyId, behavior: 'hostile', position: enemy.position, leash: enemy.leash ?? [room.bounds[0] + 3, room.bounds[1] - 3], linkedEnemySpawnId: enemy.id });
    });
  }

  const pickupVisuals = PICKUP_VISUALS[collectibleFamilyId];
  const pickupRooms = input.rooms.filter((room) => room.optional && room.templateKind !== 'event');
  const pickups: StoryGeneratedPickup[] = [];
  pickupRooms.slice(0, 2).forEach((room, roomIndex) => {
    const anchor = safeRoomSockets(room, 'pickup')[0];
    if (!anchor) return;
    const visual = pickupVisuals[hash(`${input.seed}:pickup-visual:${roomIndex}`) % pickupVisuals.length];
    const count = 3 + hash(`${input.seed}:pickup-count:${roomIndex}`) % 3;
    for (let index = 0; index < count; index += 1) {
      const position: [number, number] = [anchor[0] - (count - 1) * 0.7 + index * 1.4, anchor[1] + Math.sin(index / Math.max(1, count - 1) * Math.PI) * 0.7];
      if (!safeFromHazards(position, input.hazards) || Math.abs(position[0] - input.spawn[0]) < 6 || Math.abs(position[0] - input.exit[0]) < 6) continue;
      pickups.push({ id: `${room.id}-pickup-${index + 1}`, roomId: room.id, familyId: collectibleFamilyId, visualId: visual.id, atlasPath: visual.path, frameSize: [16, 16], frameCount: visual.frames, position, rewardKind: 'coins', rewardCoins: 1 });
    }
  });
  return { ecologyFamilyId, collectibleFamilyId, wildlife, pickups };
}

export function storyFloorEcologyValidationErrors(floor: StoryGeneratedFloor) {
  if (floor.version < 9) return floor.pickups.length || floor.wildlife.length ? ['legacy-ecology'] : [];
  const failures: string[] = [];
  if (!floor.ecologyFamilyId || floor.wildlife.some((entry) => entry.packId !== floor.ecologyFamilyId)) failures.push('ecology-family-mix');
  if (!floor.collectibleFamilyId || floor.pickups.some((entry) => entry.familyId !== floor.collectibleFamilyId)) failures.push('collectible-family-mix');
  if ((floor.intent === 'harvest' || floor.intent === 'exploration') && floor.wildlife.some((entry) => entry.behavior === 'hostile')) failures.push('peaceful-hostile-wildlife');
  if (floor.wildlife.some((entry) => !STORY_WILDLIFE_BY_ID[entry.speciesId] || !safeFromHazards(entry.position, floor.hazards))) failures.push('unsafe-wildlife');
  if (floor.pickups.some((entry) => !safeFromHazards(entry.position, floor.hazards) || Math.abs(entry.position[0] - floor.spawn[0]) < 6 || Math.abs(entry.position[0] - floor.exit[0]) < 6)) failures.push('unsafe-pickup');
  if (floor.wildlife.filter((entry) => entry.behavior === 'hostile').some((entry) => !entry.linkedEnemySpawnId || !floor.enemySpawns.some((enemy) => enemy.id === entry.linkedEnemySpawnId))) failures.push('wildlife-encounter-budget');
  return failures;
}
