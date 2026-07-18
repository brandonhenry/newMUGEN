import { STORY_GROUNDED_ACTOR_CENTER_Y } from './actorGrounding';
import { resolveStoryLevelAsset } from './levelAssets';
import { STORY_MOVEMENT_PROFILE, storyConservativeDoubleJumpRise, storyConservativeJumpRun } from './movementProfile';
import type { StoryPlatformDefinition, StoryWorldPropDefinition } from './types';
import type { StoryCompiledLevelMeta, StoryLevelAssetRole, StoryLevelBlueprintV1, StoryLevelValidationResult } from './levelTypes';

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function snapped(value: number, grid: number) {
  return Math.abs(value / grid - Math.round(value / grid)) < 1e-7;
}

function rectsOverlap(left: [number, number, number, number], right: [number, number, number, number]) {
  return left[0] < right[0] + right[2] && left[0] + left[2] > right[0] && left[1] < right[1] + right[3] && left[1] + left[3] > right[1];
}

export function validateStoryLevelBlueprint(blueprint: StoryLevelBlueprintV1): StoryLevelValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) errors.push(`duplicate-${label}`);
  };
  if (blueprint.version !== 1) errors.push('blueprint-version');
  if (blueprint.grid !== 0.25) errors.push('grid-version');
  if (!blueprint.id || !/^[a-z0-9][a-z0-9-]+$/.test(blueprint.id)) errors.push('blueprint-id');
  if (blueprint.bounds[0] >= blueprint.bounds[1] || blueprint.bounds[2] >= blueprint.bounds[3]) errors.push('bounds');
  unique(blueprint.beats.map((beat) => beat.id), 'beat-id');
  unique(blueprint.routes.map((route) => route.id), 'route-id');
  unique(blueprint.geometry.map((geometry) => geometry.id), 'geometry-id');
  unique(blueprint.connectors.map((connector) => connector.id), 'connector-id');
  unique(blueprint.slots.map((slot) => slot.id), 'slot-id');

  const beatIds = new Set(blueprint.beats.map((beat) => beat.id));
  for (const route of blueprint.routes) {
    if (route.beatIds.length === 0) errors.push(`route-empty:${route.id}`);
    if (route.beatIds.some((id) => !beatIds.has(id))) errors.push(`route-beat:${route.id}`);
  }
  if (!blueprint.routes.some((route) => route.critical) && (blueprint.kind === 'surface' || !['branch', 'secret', 'event'].includes(blueprint.chunkRole ?? ''))) errors.push('critical-route');
  if (!blueprint.beats.some((beat) => beat.kind === 'entrance' || blueprint.kind === 'chunk')) errors.push('entrance-beat');
  if (!blueprint.beats.some((beat) => beat.kind === 'exit' || blueprint.kind === 'chunk')) errors.push('exit-beat');
  if (blueprint.brief.pacing.some((intensity, index) => intensity === 'high' && blueprint.brief.pacing[index - 1] === 'high') && blueprint.brief.difficulty < 5) warnings.push('consecutive-high-intensity');

  for (const geometry of blueprint.geometry) {
    if (geometry.rect[2] <= 0 || geometry.rect[3] <= 0) errors.push(`geometry-size:${geometry.id}`);
    if (!geometry.rect.every((value) => snapped(value, blueprint.grid))) errors.push(`geometry-grid:${geometry.id}`);
    const [x, y, width, height] = geometry.rect;
    const edgeAllowance = geometry.surfaceIntent === 'ground' ? 1 : blueprint.grid;
    if (x < blueprint.bounds[0] - edgeAllowance || x + width > blueprint.bounds[1] + edgeAllowance || y < blueprint.bounds[2] - 1 || y + height > blueprint.bounds[3] + 1) errors.push(`geometry-bounds:${geometry.id}`);
  }
  const solids = blueprint.geometry.filter((geometry) => geometry.kind === 'solid' && geometry.surfaceIntent !== 'ground');
  for (let left = 0; left < solids.length; left += 1) for (let right = left + 1; right < solids.length; right += 1) {
    if (rectsOverlap(solids[left].rect, solids[right].rect)) errors.push(`solid-overlap:${solids[left].id}:${solids[right].id}`);
  }
  for (const connector of blueprint.connectors) {
    if (!connector.point.every((value) => snapped(value, blueprint.grid))) errors.push(`connector-grid:${connector.id}`);
    if (connector.clearance[0] < STORY_MOVEMENT_PROFILE.avatarHalfWidth * 2 || connector.clearance[1] < STORY_MOVEMENT_PROFILE.avatarHalfHeight * 2) errors.push(`connector-clearance:${connector.id}`);
  }
  for (const slot of blueprint.slots) {
    if (slot.beatId && !beatIds.has(slot.beatId)) errors.push(`slot-beat:${slot.id}`);
    if (slot.semanticTags.length === 0) errors.push(`slot-tags:${slot.id}`);
    const conflictsWithConnector = blueprint.connectors.some((connector) => Math.abs(slot.position[0] - connector.point[0]) < blueprint.constraints.entryClearance && slot.kind === 'hazard');
    if (conflictsWithConnector) errors.push(`hazard-entry:${slot.id}`);
  }

  const entry = blueprint.connectors.find((connector) => connector.edge === 'west')?.point ?? [blueprint.bounds[0] + 2, STORY_GROUNDED_ACTOR_CENTER_Y];
  const exit = blueprint.connectors.find((connector) => connector.edge === 'east')?.point ?? [blueprint.bounds[1] - 2, STORY_GROUNDED_ACTOR_CENTER_Y];
  const witnessRoute: Array<[number, number]> = [entry, ...blueprint.beats.filter((beat) => blueprint.routes.some((route) => route.critical && route.beatIds.includes(beat.id))).map((beat) => [(beat.bounds[0] + beat.bounds[1]) / 2, Math.max(STORY_GROUNDED_ACTOR_CENTER_Y, beat.bounds[2] + STORY_GROUNDED_ACTOR_CENTER_Y)] as [number, number]), exit];
  return {
    valid: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    witnessRoute,
    metrics: {
      criticalBeats: blueprint.beats.filter((beat) => blueprint.routes.some((route) => route.critical && route.beatIds.includes(beat.id))).length,
      optionalBeats: blueprint.beats.filter((beat) => blueprint.routes.some((route) => !route.critical && route.beatIds.includes(beat.id))).length,
      maximumJumpRise: storyConservativeDoubleJumpRise(),
      maximumJumpRun: storyConservativeJumpRun(),
      assetSlotCount: blueprint.slots.filter((slot) => slot.kind === 'prop' || slot.kind === 'landmark').length
    }
  };
}

export type CompiledStoryLevelBlueprint = {
  platforms: StoryPlatformDefinition[];
  props: StoryWorldPropDefinition[];
  meta: StoryCompiledLevelMeta;
  validation: StoryLevelValidationResult;
};

export function compileStoryLevelBlueprint(blueprint: StoryLevelBlueprintV1, seed = blueprint.id, generationVersion = 1): CompiledStoryLevelBlueprint {
  const validation = validateStoryLevelBlueprint(blueprint);
  if (!validation.valid) throw new Error(`Invalid story level blueprint ${blueprint.id}: ${validation.errors.join(', ')}`);
  const platforms = blueprint.geometry.map((geometry): StoryPlatformDefinition => ({
    id: geometry.id,
    position: [geometry.rect[0] + geometry.rect[2] / 2, geometry.rect[1] + geometry.rect[3] / 2],
    size: [geometry.rect[2], geometry.rect[3]],
    collision: geometry.kind,
    terrainRole: geometry.surfaceIntent,
    surfaceVariant: hashString(`${blueprint.id}:${geometry.id}:terrain`) % 3,
    ...(geometry.kind === 'one-way' ? { oneWay: true } : {})
  }));
  const assetResolution: StoryCompiledLevelMeta['assetResolution'] = [];
  const repetitions = new Map<string, number>();
  let densityUsed = 0;
  const props = blueprint.biomeId ? blueprint.slots.filter((slot) => slot.kind === 'prop').flatMap((slot, index): StoryWorldPropDefinition[] => {
    const requestedRole = (['structural', 'framing', 'foliage', 'clutter'] as StoryLevelAssetRole[]).find((role) => slot.semanticTags.includes(role)) ?? (index === 0 ? 'framing' : 'clutter');
    const selected = resolveStoryLevelAsset(blueprint.biomeId!, slot, requestedRole, hashString(`${seed}:${slot.id}`));
    if (!selected) return [];
    const used = repetitions.get(selected.id) ?? 0;
    if (used >= selected.repetitionLimit || densityUsed + selected.densityCost > blueprint.visual.densityBudget) return [];
    repetitions.set(selected.id, used + 1);
    densityUsed += selected.densityCost;
    assetResolution.push({ slotId: slot.id, assetId: selected.id });
    return [{
      id: `${blueprint.id}-${slot.id}-${selected.id}`,
      asset: selected.asset,
      frame: [0, 0, selected.pixelSize[0], selected.pixelSize[1]],
      atlasSize: selected.pixelSize,
      position: [slot.position[0], selected.footprint[1] / 2 - 0.08, -2.18 - index % 3 * 0.12],
      size: selected.footprint,
      mirrored: hashString(`${slot.id}:mirror`) % 3 === 0,
      opacity: 0.94
    }];
  }) : [];
  return {
    platforms,
    props,
    validation,
    meta: { blueprintId: blueprint.id, blueprintVersion: 1, generationVersion, seed, chunkIds: blueprint.kind === 'chunk' ? [blueprint.id] : [], witnessRoute: validation.witnessRoute, assetResolution }
  };
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);
}

export function renderStoryLevelBlueprintSvg(blueprint: StoryLevelBlueprintV1, width = 1400, height = 420) {
  const [minX, maxX, minY, maxY] = blueprint.bounds;
  const scaleX = width / (maxX - minX);
  const scaleY = height / (maxY - minY);
  const x = (value: number) => (value - minX) * scaleX;
  const y = (value: number) => height - (value - minY) * scaleY;
  const validation = validateStoryLevelBlueprint(blueprint);
  const beatColors: Record<string, string> = { entrance: '#52e1a1', observation: '#2ee6ff', traversal: '#ffe071', combat: '#ff6b45', choice: '#ff83d1', respite: '#8ee8ff', reward: '#ffd166', secret: '#b8a8ff', boss: '#ff5d69', exit: '#52e1a1' };
  const beats = blueprint.beats.map((beat) => `<rect x="${x(beat.bounds[0])}" y="${y(beat.bounds[3])}" width="${(beat.bounds[1] - beat.bounds[0]) * scaleX}" height="${(beat.bounds[3] - beat.bounds[2]) * scaleY}" fill="${beatColors[beat.kind]}" fill-opacity="0.09" stroke="${beatColors[beat.kind]}" stroke-dasharray="6 5"/><text x="${x(beat.bounds[0]) + 7}" y="${y(beat.bounds[3]) + 18}" fill="#dcecff" font-size="12">${escapeXml(beat.kind)}</text>`).join('');
  const geometry = blueprint.geometry.map((piece) => `<rect x="${x(piece.rect[0])}" y="${y(piece.rect[1] + piece.rect[3])}" width="${piece.rect[2] * scaleX}" height="${Math.max(3, piece.rect[3] * scaleY)}" fill="${piece.kind === 'solid' ? '#52667a' : '#8ee8ff'}"/>`).join('');
  const witness = validation.witnessRoute.map(([px, py]) => `${x(px)},${y(py)}`).join(' ');
  const connectors = blueprint.connectors.map((connector) => `<circle cx="${x(connector.point[0])}" cy="${y(connector.point[1])}" r="7" fill="#ffe071"/><text x="${x(connector.point[0]) + 10}" y="${y(connector.point[1]) - 8}" fill="#ffe071" font-size="11">${escapeXml(connector.edge)}</text>`).join('');
  const slots = blueprint.slots.map((slot) => `<circle cx="${x(slot.position[0])}" cy="${y(slot.position[1])}" r="4" fill="#ff83d1"><title>${escapeXml(`${slot.kind}: ${slot.semanticTags.join(', ')}`)}</title></circle>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(blueprint.id)} level plan"><rect width="100%" height="100%" fill="#08121e"/>${beats}${geometry}<polyline points="${witness}" fill="none" stroke="#ffffff" stroke-width="3" stroke-opacity="0.78"/>${connectors}${slots}<text x="18" y="28" fill="#fff" font-size="18" font-family="sans-serif">${escapeXml(blueprint.id)} · ${validation.valid ? 'PASS' : 'FAIL'}</text></svg>`;
}
