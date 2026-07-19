import { STORY_BIOME_RESOURCE_IDS, STORY_RECIPE_BY_ID, STORY_RESOURCE_BY_ID, type StoryBiomeId } from './adventureCrafting';
import { storyBiomeGameplayAssetContract } from './biomeGameplayAssets';
import type { StoryFloorIntent, StoryGeneratedContainer, StoryGeneratedRoom, StoryHazardDefinition } from './types';

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function unit(value: string) {
  return hash(value) / 0xffffffff;
}

const JUNK = ['Bent nails and damp cloth.', 'A cracked token with no trade value.', 'Dust, string, and a blunt spoon.', 'Spoiled trail rations.'];
const CONSUMABLES = ['berry-tonic', 'herbal-draught', 'stoneguard-tonic', 'gatherers-tea'];

export function generateStoryFloorContainers(input: {
  worldId: StoryBiomeId;
  seed: string;
  floorNumber: number;
  version: number;
  intent: StoryFloorIntent;
  visualSetId?: string;
  rooms: StoryGeneratedRoom[];
  entranceRoomId: string;
  exitRoomId: string;
  hazards: StoryHazardDefinition[];
}): StoryGeneratedContainer[] {
  if (input.version < 8) return [];
  const contract = storyBiomeGameplayAssetContract(input.visualSetId);
  if (!contract?.containers.length) return [];
  const rewardRooms = input.rooms.filter((room) => room.optional && room.id !== input.entranceRoomId && room.id !== input.exitRoomId && room.rewardAlcoves.length > 0);
  if (rewardRooms.length === 0) return [];
  const desired = input.intent === 'exploration' || input.intent === 'harvest' ? 3 : 2;
  const count = Math.min(desired, rewardRooms.length);
  return rewardRooms.slice(0, count).map((room, index) => {
    const rollSeed = `${input.worldId}:${input.seed}:${input.floorNumber}:${room.id}:container`;
    const visualDefinition = contract.containers[hash(`${rollSeed}:visual`) % contract.containers.length];
    const pickup = contract.pickups.length > 0 ? contract.pickups[hash(`${rollSeed}:pickup`) % contract.pickups.length] : undefined;
    const alcove = room.rewardAlcoves[hash(`${rollSeed}:alcove`) % room.rewardAlcoves.length];
    const roomCenter = (room.bounds[0] + room.bounds[1]) / 2;
    const unclampedX = roomCenter + alcove[0] + (unit(`${rollSeed}:x`) - 0.5) * 0.8;
    const x = Math.max(room.bounds[0] + 3, Math.min(room.bounds[1] - 3, unclampedX));
    const position: [number, number] = [x, room.bounds[2] + 2 + visualDefinition.footprint[1] / 2 - 0.08];
    const outcomeRoll = unit(`${rollSeed}:outcome`);
    const base = {
      id: `${room.id}-supply-${index + 1}`,
      roomId: room.id,
      visualId: visualDefinition.id,
      ...(pickup ? { pickupVisualId: pickup.id } : {}),
      position,
      label: room.hidden ? 'Hidden Supply Cache' : 'Route Supply Cache'
    };
    if (outcomeRoll < 0.18) return { ...base, outcome: 'empty' as const, quality: 'empty' as const, resultText: 'Empty. Someone reached it first.' };
    if (outcomeRoll < 0.38) return { ...base, outcome: 'junk' as const, quality: 'poor' as const, resultText: JUNK[hash(`${rollSeed}:junk`) % JUNK.length] };
    if (outcomeRoll < 0.68) {
      const rewardCoins = 2 + hash(`${rollSeed}:coins`) % Math.max(4, 7 + Math.min(8, input.floorNumber));
      return { ...base, outcome: 'coins' as const, quality: 'common' as const, rewardCoins, resultText: `${rewardCoins} provisional Route Coins.` };
    }
    if (outcomeRoll < 0.90) {
      const local = STORY_BIOME_RESOURCE_IDS[input.worldId];
      const materialId = local[hash(`${rollSeed}:material`) % 3];
      const materialQuantity = 1 + hash(`${rollSeed}:quantity`) % 2;
      return { ...base, outcome: 'material' as const, quality: 'useful' as const, materialId, materialQuantity, resultText: `${materialQuantity} ${STORY_RESOURCE_BY_ID[materialId].label}.` };
    }
    const consumableId = CONSUMABLES[hash(`${rollSeed}:consumable`) % CONSUMABLES.length];
    return { ...base, outcome: 'consumable' as const, quality: 'useful' as const, consumableId, resultText: `${STORY_RECIPE_BY_ID[consumableId].label}.` };
  });
}

export function storyFloorContainerValidationErrors(input: {
  containers: StoryGeneratedContainer[];
  rooms: StoryGeneratedRoom[];
  entranceRoomId: string;
  exitRoomId: string;
  hazards: StoryHazardDefinition[];
  visualSetId?: string;
}) {
  const errors: string[] = [];
  const contract = storyBiomeGameplayAssetContract(input.visualSetId);
  if (!contract && input.containers.length > 0) errors.push('container-family-contract');
  if (new Set(input.containers.map((container) => container.id)).size !== input.containers.length) errors.push('container-duplicate-id');
  if (new Set(input.containers.map((container) => container.roomId)).size !== input.containers.length) errors.push('container-density');
  for (const container of input.containers) {
    const room = input.rooms.find((candidate) => candidate.id === container.roomId);
    if (!room || !room.optional || room.id === input.entranceRoomId || room.id === input.exitRoomId) errors.push(`container-room:${container.id}`);
    if (room && (container.position[0] < room.bounds[0] + 2 || container.position[0] > room.bounds[1] - 2 || container.position[1] < room.bounds[2] + 2 || container.position[1] > room.bounds[3] - 1)) errors.push(`container-bounds:${container.id}`);
    if (!contract?.containers.some((visual) => visual.id === container.visualId)) errors.push(`container-visual:${container.id}`);
    if (container.pickupVisualId && !contract?.pickups.some((visual) => visual.id === container.pickupVisualId)) errors.push(`container-pickup:${container.id}`);
    if (input.hazards.some((hazard) => container.position[0] >= hazard.bounds[0] - 1.5 && container.position[0] <= hazard.bounds[1] + 1.5 && container.position[1] >= hazard.bounds[2] - 1 && container.position[1] <= hazard.bounds[3] + 2)) errors.push(`container-hazard:${container.id}`);
    if (container.outcome === 'coins' && !container.rewardCoins) errors.push(`container-coins:${container.id}`);
    if (container.outcome === 'material' && (!container.materialId || !container.materialQuantity)) errors.push(`container-material:${container.id}`);
    if (container.outcome === 'consumable' && !container.consumableId) errors.push(`container-consumable:${container.id}`);
    if ((container.outcome === 'empty' || container.outcome === 'junk') && (container.rewardCoins || container.materialId || container.consumableId)) errors.push(`container-empty-reward:${container.id}`);
  }
  return Array.from(new Set(errors));
}
