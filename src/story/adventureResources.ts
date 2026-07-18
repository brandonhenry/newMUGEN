import { STORY_BIOME_RESOURCE_IDS, STORY_RESOURCE_BY_ID, type StoryBiomeId } from './adventureCrafting';
import type { StoryAdventureMapRole, StoryAttackInput, StoryGeneratedDepthZone, StoryGeneratedFloor, StoryHazardDefinition, StoryNpcDefinition, StoryPortalDefinition, StoryResourceNodeDefinition } from './types';

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function unit(seed: string) {
  return hash(seed) / 0xffffffff;
}

const RESOURCE_FOOT_CONTACT_SINK_Y = 0.035;

function nodeSize(kind: StoryResourceNodeDefinition['kind'], emphasized: boolean): [number, number] {
  const size: [number, number] = kind === 'tree'
    ? [3.25, 4.5]
    : kind === 'berry'
      ? [2.25, 2.05]
      : kind === 'plant'
        ? [1.9, 1.8]
        : [2.4, 2.05];
  return emphasized ? [size[0] * 1.18, size[1] * 1.18] : size;
}

export function groundedResourceNodeCenterY(height: number, footAnchorY: number) {
  return height * (footAnchorY - 0.5) - RESOURCE_FOOT_CONTACT_SINK_Y;
}

function awayFromReserved(x: number, portals: StoryPortalDefinition[], npcs: StoryNpcDefinition[], hazards: StoryHazardDefinition[], minX: number, maxX: number) {
  const safe = (candidate: number) => {
    const portalCollision = portals.some((portal) => Math.abs(candidate - portal.position[0]) < portal.size[0] / 2 + 2.25);
    const npcCollision = npcs.some((npc) => Math.abs(candidate - npc.position[0]) < 2.4);
    const hazardCollision = hazards.some((hazard) => candidate >= hazard.bounds[0] - 1.6 && candidate <= hazard.bounds[1] + 1.6);
    return !portalCollision && !npcCollision && !hazardCollision;
  };
  const origin = Math.max(minX + 5, Math.min(maxX - 5, x));
  for (let step = 0; step <= 48; step += 1) {
    const distance = step * 1.25;
    for (const candidate of step === 0 ? [origin] : [origin + distance, origin - distance]) {
      const clamped = Math.max(minX + 5, Math.min(maxX - 5, candidate));
      if (safe(clamped)) return clamped;
    }
  }
  return origin;
}

function makeNode(id: string, resourceId: string, x: number, major: boolean, secondaryResourceId?: string, baseY = 0): StoryResourceNodeDefinition {
  const resource = STORY_RESOURCE_BY_ID[resourceId];
  const legendary = resource.rarity === 'legendary';
  const majorDeposit = major && (resource.kind === 'ore' || resource.kind === 'rock');
  const size = nodeSize(resource.kind, majorDeposit || legendary);
  return {
    id,
    resourceId,
    kind: resource.kind,
    rarity: resource.rarity,
    position: [x, baseY + groundedResourceNodeCenterY(size[1], resource.footAnchorY), majorDeposit || legendary ? 0.35 : -0.35],
    size,
    toughness: legendary ? 8 : majorDeposit ? 6 : resource.kind === 'plant' || resource.kind === 'berry' ? 1 : 3,
    respawn: legendary ? 'daily' : majorDeposit ? 'timed' : 'visit',
    major: legendary || majorDeposit,
    secondaryResourceId: legendary ? secondaryResourceId : undefined
  };
}

export function createSurfaceResourceNodes(input: {
  biomeId: StoryBiomeId;
  mapId: string;
  role: StoryAdventureMapRole;
  bounds: { minX: number; maxX: number };
  portals: StoryPortalDefinition[];
  npcs: StoryNpcDefinition[];
  hazards: StoryHazardDefinition[];
}) {
  const order = ['arrival', 'field-a', 'field-b', 'mastery'].indexOf(input.role);
  const count = 12 + order * 2;
  const local = STORY_BIOME_RESOURCE_IDS[input.biomeId];
  const universal = ['routewood', 'wildberry', 'medicinal-herb', 'fieldstone'];
  const resources = [...universal, local[0], local[0], local[1], local[1], local[2]];
  const clusterStart = Math.max(5, count - 7);
  const span = input.bounds.maxX - input.bounds.minX - 14;
  const nodes: StoryResourceNodeDefinition[] = [];
  for (let index = 0; index < count; index += 1) {
    const legendary = input.role === 'mastery' && index === count - 1;
    const major = index >= clusterStart;
    const resourceId = legendary ? local[3] : resources[(index + order * 3) % resources.length];
    const evenX = input.bounds.minX + 7 + span * ((index + 0.5) / count);
    const clusterX = 5 + (index - clusterStart) * 2.15 - (count - clusterStart) * 1.05;
    const jitter = (unit(`${input.mapId}:${index}`) - 0.5) * 2.4;
    const candidate = major ? clusterX + jitter : evenX + jitter;
    const x = awayFromReserved(candidate, input.portals, input.npcs, input.hazards, input.bounds.minX, input.bounds.maxX);
    nodes.push(makeNode(`${input.mapId}-resource-${index + 1}`, resourceId, x, major, local[2]));
  }
  return nodes;
}

export function createDepthResourceNodes(biomeId: StoryBiomeId, zone: StoryGeneratedDepthZone) {
  const local = STORY_BIOME_RESOURCE_IDS[biomeId];
  const count = Math.min(10, 6 + zone.difficulty);
  const width = zone.camera.maxX - zone.camera.minX;
  return Array.from({ length: count }, (_, index) => {
    const legendary = (zone.hidden || zone.finale) && index === count - 1;
    const major = zone.hidden || zone.finale || index >= count - 3;
    const resourceId = legendary ? local[3] : index % 4 === 0 ? 'fieldstone' : local[Math.min(2, (index + zone.depth) % 3)];
    const x = zone.camera.minX + 7 + (width - 14) * ((index + 0.5) / count) + (unit(`${zone.id}:${index}`) - 0.5) * 1.5;
    return makeNode(`${zone.id}-resource-${index + 1}`, resourceId, x, major, local[2]);
  });
}

export function createEndlessFloorResourceNodes(biomeId: StoryBiomeId, floor: StoryGeneratedFloor) {
  const local = STORY_BIOME_RESOURCE_IDS[biomeId];
  const rewardRooms = floor.rooms.filter((room) => room.id !== floor.entranceRoomId && room.id !== floor.exitRoomId && (room.optional || room.critical));
  const count = floor.intent === 'harvest'
    ? Math.min(24, 14 + rewardRooms.length + floor.chapterFloor)
    : floor.intent === 'exploration'
      ? Math.min(16, 8 + rewardRooms.length)
      : Math.min(12, 5 + rewardRooms.length + floor.chapterFloor);
  return Array.from({ length: count }, (_, index) => {
    const room = rewardRooms[index % Math.max(1, rewardRooms.length)] ?? floor.rooms[0];
    const legendary = floor.boss && index === count - 1;
    const major = room.optional || index >= count - (floor.intent === 'harvest' ? 6 : 3);
    const resourceId = legendary
      ? local[3]
      : floor.intent === 'harvest'
        ? local[(index + floor.floorNumber) % 3]
        : index % 5 === 0 ? 'fieldstone' : local[Math.min(2, (index + floor.floorNumber) % 3)];
    const roomCenter = (room.bounds[0] + room.bounds[1]) / 2;
    const alcove = room.rewardAlcoves[index % Math.max(1, room.rewardAlcoves.length)] ?? [0, 1.05];
    const baseX = roomCenter + alcove[0];
    const x = Math.max(floor.bounds.minX + 8, Math.min(floor.bounds.maxX - 8, baseX + (unit(`${floor.seed}:${floor.floorNumber}:${index}`) - 0.5) * 2));
    return makeNode(`${room.id}-resource-${index + 1}`, resourceId, x, major, local[2], room.bounds[2]);
  });
}

export function resourceYield(node: StoryResourceNodeDefinition, seed: string, multiplier = 1) {
  if (node.rarity === 'legendary') return 1;
  const min = node.kind === 'berry' ? 2 : node.major ? 4 : node.kind === 'plant' ? 1 : 2;
  const max = node.major ? 7 : node.kind === 'berry' ? 4 : node.kind === 'plant' ? 2 : 4;
  const base = min + Math.floor(unit(`${node.id}:${seed}`) * (max - min + 1));
  return Math.max(1, Math.round(base * Math.max(0, multiplier)));
}

export function adventureResourceHitStrength(attackInput: StoryAttackInput) {
  return attackInput === 'heavy' ? 2 : 1;
}

export function adventureAttackCanHitResource(lastAttackId: number, attackId: number) {
  return attackId > 0 && lastAttackId !== attackId;
}

export function adventureUtcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}
