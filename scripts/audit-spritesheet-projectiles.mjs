#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const selectedCharacter = process.argv.slice(2).find((arg) => arg.startsWith('--character='))?.slice('--character='.length);
const repo = path.resolve(process.env.KORE_REPO ?? path.join(scriptDir, '..'));
const charactersRoot = path.join(repo, 'public', 'characters');
const reportRoot = path.join(repo, 'tmp', 'spritesheet-projectile-audit');
const config = JSON.parse(fs.readFileSync(path.join(scriptDir, 'spritesheet-projectile-matches.json'), 'utf8'));

const frameIndex = (value) => Number(String(value).match(/frame-(\d+)\.png$/)?.[1]);
const framePath = (characterId, index) => `/characters/${characterId}/frames/frame-${String(index).padStart(3, '0')}.png`;
const diskPath = (publicPath) => path.join(repo, 'public', publicPath.replace(/^\//, ''));
const stable = (value) => JSON.stringify(sortDeep(value));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortDeep(child)]));
}

function loadCharacters() {
  const loaded = new Map();
  for (const characterId of fs.readdirSync(charactersRoot).sort()) {
    const manifestPath = path.join(charactersRoot, characterId, 'character.json');
    if (!fs.existsSync(manifestPath)) continue;
    loaded.set(characterId, { manifestPath, character: JSON.parse(fs.readFileSync(manifestPath, 'utf8')) });
  }
  return loaded;
}

function resolveProjectileKind(definition, binding) {
  if (binding?.kind) return binding.kind;
  if (definition?.kind) return definition.kind;
  return /blast/i.test(`${definition?.id ?? binding?.projectileId ?? ''} ${definition?.name ?? ''}`) ? 'blast' : 'projectile';
}

function protectedBlastSnapshot(characters) {
  const snapshot = {};
  for (const [characterId, { character }] of characters) {
    if (character.unplayable) continue;
    const definitions = new Map((character.projectiles ?? []).map((definition) => [definition.id, definition]));
    const protectedIds = new Set((character.projectiles ?? []).filter((definition) => resolveProjectileKind(definition) === 'blast').map((definition) => definition.id));
    const bindings = {};
    for (const [moveKey, instances] of Object.entries(character.moveProjectiles ?? {})) {
      const protectedInstances = instances.filter((instance) => resolveProjectileKind(definitions.get(instance.projectileId), instance) === 'blast');
      if (!protectedInstances.length) continue;
      bindings[moveKey] = protectedInstances;
      for (const instance of protectedInstances) protectedIds.add(instance.projectileId);
    }
    if (!protectedIds.size) continue;
    const protectedDefinitions = (character.projectiles ?? []).filter((definition) => protectedIds.has(definition.id));
    const assets = [];
    for (const definition of protectedDefinitions) {
      const sources = new Set([...(definition.frames ?? []), ...Object.values(definition.animationFrames ?? {}).flat()]);
      for (const source of sources) {
        const file = diskPath(source);
        if (fs.existsSync(file)) assets.push({ path: source, sha256: sha256(file) });
      }
    }
    snapshot[characterId] = { definitions: protectedDefinitions, bindings, assets };
  }
  return snapshot;
}

function unmanagedProtectedBlastSnapshot(snapshot) {
  const managedIds = new Set(config.matches.filter((match) => match.assetType === 'blast').map((match) => `${match.characterId}:${match.assetId}`));
  const filtered = {};
  for (const [characterId, entry] of Object.entries(snapshot)) {
    const definitions = entry.definitions.filter((definition) => !managedIds.has(`${characterId}:${definition.id}`));
    const definitionIds = new Set(definitions.map((definition) => definition.id));
    const bindings = Object.fromEntries(Object.entries(entry.bindings).flatMap(([moveKey, instances]) => {
      const kept = instances.filter((instance) => definitionIds.has(instance.projectileId));
      return kept.length ? [[moveKey, kept]] : [];
    }));
    const managedPaths = config.matches
      .filter((match) => match.assetType === 'blast' && match.characterId === characterId)
      .flatMap((match) => assetFramePaths(match));
    const assets = entry.assets.filter((asset) => !managedPaths.includes(asset.path));
    if (definitions.length) filtered[characterId] = { definitions, bindings, assets };
  }
  return filtered;
}

function ensureConfiguredMove(character, moveKey) {
  if (['jableft', 'jabright', 'kickleft', 'kickright'].includes(moveKey)) return;
  if (!character.moveOverrides?.[moveKey]) throw new Error(`${character.id}: ${moveKey} is not a configured move`);
}

function projectileStyle(style) {
  const base = {
    fps: 18,
    defaultScale: [0.46, 0.46, 0.46],
    color: '#bff7ff',
    speed: 10,
    lifetimeFrames: 96,
    activeFrames: 86,
    hitboxSize: [0.46, 0.42, 0.62],
    homingStrength: 2.5,
    homingTurnRate: 3.2
  };
  const styles = {
    'fireball': { color: '#ff8a24', speed: 9.5, defaultScale: [0.5, 0.5, 0.5], hitboxSize: [0.5, 0.46, 0.66], homingStrength: 2.8 },
    'energy-orb': { color: '#ffe04f', speed: 8.5, defaultScale: [0.55, 0.55, 0.55], hitboxSize: [0.56, 0.54, 0.66], homingStrength: 3.8, homingTurnRate: 4.2 },
    'electric-orb': { color: '#43dfff', speed: 10.5, hitboxSize: [0.48, 0.46, 0.62], homingStrength: 3.6, homingTurnRate: 4 },
    'majin-bolt': { color: '#ff84dc', speed: 11, defaultScale: [0.44, 0.44, 0.44], hitboxSize: [0.44, 0.38, 0.66], homingStrength: 3.2, homingTurnRate: 3.8 },
    'lightning-bolt': { color: '#ffe873', speed: 12.5, defaultScale: [0.5, 0.5, 0.5], hitboxSize: [0.46, 0.42, 0.76], homingStrength: 2.4 },
    'energy-shard': { color: '#78e8ff', speed: 12, defaultScale: [0.4, 0.4, 0.4], hitboxSize: [0.36, 0.34, 0.6], homingStrength: 2.6 },
    'flame-stream': { color: '#ff7b24', speed: 10.5, defaultScale: [0.58, 0.58, 0.58], hitboxSize: [0.58, 0.46, 0.82], homingStrength: 1.5, homingTurnRate: 2.2 },
    'rocket': { color: '#ff9a2f', speed: 11.5, defaultScale: [0.62, 0.62, 0.62], hitboxSize: [0.52, 0.42, 0.9], homingStrength: 2.2, homingTurnRate: 2.8 },
    'sound-note': { color: '#ff69d4', speed: 8, defaultScale: [0.48, 0.48, 0.48], hitboxSize: [0.42, 0.48, 0.56], homingStrength: 4.2, homingTurnRate: 4.6 }
  };
  return { ...base, ...(styles[style] ?? {}) };
}

function blastStyle(style) {
  const styles = {
    'fx-fire-blast': { color: '#ff9a32', outerColor: '#ff3d16', impactColor: '#fff2a6', radius: 0.32, range: 4.2, activeFrames: 12, hitboxSize: [0.5, 0.52, 1] },
    'hx-wind-blast': { color: '#d95cff', outerColor: '#6d2dff', impactColor: '#f8e8ff', radius: 0.3, range: 4.6, activeFrames: 12, hitboxSize: [0.46, 0.5, 1] },
    'lx-ice-blast': { color: '#75efff', outerColor: '#58a8ff', impactColor: '#ffffff', radius: 0.31, range: 4.5, activeFrames: 12, hitboxSize: [0.48, 0.52, 1] },
    'ox-buster-blast': { color: '#62eaff', outerColor: '#35e956', impactColor: '#ffffff', radius: 0.34, range: 5, activeFrames: 14, hitboxSize: [0.52, 0.56, 1] },
    'px-orb-blast': { color: '#e65dff', outerColor: '#6230ff', impactColor: '#fff0ff', radius: 0.33, range: 4.3, activeFrames: 12, hitboxSize: [0.5, 0.54, 1] },
    'x-buster-blast': { color: '#9dff68', outerColor: '#10d983', impactColor: '#ffffff', radius: 0.32, range: 4.8, activeFrames: 12, hitboxSize: [0.48, 0.52, 1] }
  };
  const selected = styles[style];
  if (!selected) throw new Error(`Unknown blast style ${style}`);
  return selected;
}

function assetFramePaths(match) {
  return match.sourceFrames.map((_, index) => `/characters/${match.characterId}/${match.assetType === 'effect' ? 'effects' : 'projectiles'}/${match.assetId}/frames/frame-${String(index).padStart(3, '0')}.png`);
}

function copySourceFrames(match) {
  const outputs = assetFramePaths(match);
  outputs.forEach((output, index) => {
    const source = diskPath(framePath(match.characterId, match.sourceFrames[index]));
    if (!fs.existsSync(source)) throw new Error(`${match.characterId}: missing source frame ${match.sourceFrames[index]}`);
    const destination = diskPath(output);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  });
  return outputs;
}

function sourceMetadata(match, outputs) {
  const framesFile = path.join(charactersRoot, match.characterId, 'frames', 'frames.json');
  const metadata = fs.existsSync(framesFile) ? JSON.parse(fs.readFileSync(framesFile, 'utf8')) : { frames: [] };
  const byIndex = new Map((metadata.frames ?? []).map((frame) => [frame.index, frame]));
  return {
    characterId: match.characterId,
    assetId: match.assetId,
    classification: match.assetType,
    source: `${match.characterId} original sprite sheet`,
    sourceSheetPath: `/characters/${match.characterId}/animation-sheet.png`,
    sourceFrames: match.sourceFrames.map((index, outputIndex) => {
      const frame = byIndex.get(index);
      return {
        index,
        path: framePath(match.characterId, index),
        cropBox: frame?.box,
        output: outputs[outputIndex]
      };
    }),
    matchedMoves: match.moveKeys
  };
}

function createProjectileDefinition(match, outputs) {
  const style = projectileStyle(match.style);
  const definition = {
    id: match.assetId,
    name: match.name,
    kind: 'projectile',
    sourcePath: `/characters/${match.characterId}/animation-sheet.png`,
    frames: outputs,
    animationFrames: { startup: [outputs[0]], active: outputs, recovery: [outputs.at(-1)] },
    fps: style.fps,
    loop: outputs.length > 1,
    billboard: false,
    blendMode: 'additive',
    voxelProfile: match.voxelProfile ?? 'image-source',
    defaultScale: style.defaultScale,
    defaultRotation: [0, 0, 0],
    alignToVelocity: true,
    color: style.color
  };
  if (match.voxelProfile === 'hd-image-source') {
    definition.voxelFidelity = {
      resolutionScale: 1,
      maxRows: 64,
      depth: 0.14,
      alphaThreshold: 24,
      paletteSnap: 8,
      mergeRuns: true
    };
  }
  return definition;
}

function createProjectileBinding(match, moveKey) {
  const style = projectileStyle(match.style);
  return {
    id: `${moveKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${match.assetId}`,
    projectileId: match.assetId,
    kind: 'projectile',
    label: match.name,
    spawnFrame: match.spawnFrames?.[moveKey] ?? 1,
    spawnOffset: [0, 1.05, 0.92],
    startupFrames: 0,
    activeFrames: style.activeFrames,
    recoveryFrames: 6,
    lifetimeFrames: style.lifetimeFrames,
    speed: style.speed,
    forwardVelocity: style.speed,
    homingMode: 'limited',
    homingStrength: style.homingStrength,
    homingTurnRate: style.homingTurnRate,
    homingEndFrame: Math.round(style.lifetimeFrames * 0.5),
    nearMissRadius: 0.52,
    hitbox: { offset: [0, 0, 0], size: style.hitboxSize },
    damageScale: 1,
    blockDamageScale: 1,
    pushbackScale: 1,
    blockPushbackScale: 1,
    mirrorWithFacing: true,
    delivery: 'replaceMoveHit',
    clash: true
  };
}

function createBlastDefinition(match, outputs) {
  const style = blastStyle(match.style);
  return {
    id: match.assetId,
    name: match.name,
    kind: 'blast',
    sourcePath: `/characters/${match.characterId}/animation-sheet.png`,
    frames: outputs,
    animationFrames: { startup: [outputs[0]], active: outputs, recovery: [outputs.at(-1)] },
    fps: 18,
    loop: outputs.length > 1,
    billboard: false,
    blendMode: 'additive',
    voxelProfile: 'image-source',
    defaultScale: [1, 1, 1],
    defaultRotation: [0, 0, 0],
    color: style.color,
    blastVisual: {
      coreColor: '#ffffff',
      glowColor: style.color,
      outerColor: style.outerColor,
      impactColor: style.impactColor,
      radius: style.radius,
      growFrames: 4,
      fadeFrames: 8,
      shake: 0.12
    }
  };
}

function createBlastBinding(match, moveKey) {
  const style = blastStyle(match.style);
  const activeFrames = match.activeFrames?.[moveKey] ?? style.activeFrames;
  const recoveryFrames = 6;
  return {
    id: `${moveKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${match.assetId}`,
    projectileId: match.assetId,
    kind: 'blast',
    label: match.name,
    spawnFrame: match.spawnFrames?.[moveKey] ?? 1,
    spawnOffset: match.spawnOffsets?.[moveKey] ?? [0, 1.02, 0.78],
    startupFrames: 0,
    activeFrames,
    recoveryFrames,
    lifetimeFrames: activeFrames + recoveryFrames,
    speed: 0,
    forwardVelocity: 0,
    blastRange: match.blastRanges?.[moveKey] ?? style.range,
    homingMode: 'none',
    homingStrength: 0,
    homingTurnRate: 0,
    homingEndFrame: 0,
    nearMissRadius: 0.34,
    hitbox: { offset: [0, 0, 0], size: style.hitboxSize },
    damageScale: 1,
    blockDamageScale: 1,
    pushbackScale: 1,
    blockPushbackScale: 1,
    mirrorWithFacing: true,
    delivery: 'replaceMoveHit',
    pierce: true,
    clash: true,
    kiBurst: true,
    releaseGated: false,
    minDamageScale: 1,
    maxDamageScale: 1
  };
}

function createEffectDefinition(match, outputs) {
  const slash = match.style === 'slash';
  return {
    id: match.assetId,
    name: match.name,
    spriteSheetPath: `/characters/${match.characterId}/animation-sheet.png`,
    frames: outputs,
    fps: 18,
    loop: outputs.length > 1,
    billboard: true,
    blendMode: 'additive',
    anchor: slash ? 'hitbox' : 'body',
    defaultTransform: {
      position: slash ? [0, 0.1, 0.35] : [0, 0.9, 0.2],
      scale: slash ? [0.72, 0.72, 0.72] : [0.62, 0.62, 0.62],
      rotation: [0, 0, 0],
      opacity: 1,
      color: '#ffffff'
    }
  };
}

function createEffectBinding(match, moveKey) {
  const startFrame = match.startFrames?.[moveKey] ?? 1;
  return {
    id: `${moveKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}-${match.assetId}`,
    effectId: match.assetId,
    label: match.name,
    startFrame,
    endFrame: startFrame + Math.max(6, match.sourceFrames.length * 3),
    layer: 1,
    mirrorWithFacing: true,
    anchor: match.style === 'slash' ? 'hitbox' : 'body',
    loop: match.sourceFrames.length > 1,
    keyframes: [{ frame: startFrame, position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0], opacity: 1, color: '#ffffff' }]
  };
}

function stripAnimationFrames(character, stripMoveFrames = {}) {
  for (const [moveKey, indices] of Object.entries(stripMoveFrames)) {
    const remove = new Set(indices);
    const frames = character.animationFrames?.[moveKey];
    if (!Array.isArray(frames)) continue;
    const kept = frames.filter((frame) => !remove.has(frameIndex(frame)));
    if (!kept.length) throw new Error(`${character.id}: stripping ${moveKey} would leave no fighter animation frames`);
    character.animationFrames[moveKey] = kept;
  }
}

function removeReplacedProjectiles(character, ids) {
  if (!ids?.length) return [];
  const remove = new Set(ids);
  const definitions = new Map((character.projectiles ?? []).map((definition) => [definition.id, definition]));
  for (const id of remove) {
    const definition = definitions.get(id);
    if (resolveProjectileKind(definition) === 'blast') throw new Error(`${character.id}: refusing to replace protected blast ${id}`);
  }
  character.projectiles = (character.projectiles ?? []).filter((definition) => !remove.has(definition.id));
  for (const [moveKey, instances] of Object.entries(character.moveProjectiles ?? {})) {
    const kept = instances.filter((instance) => !remove.has(instance.projectileId));
    if (kept.length) character.moveProjectiles[moveKey] = kept;
    else delete character.moveProjectiles[moveKey];
  }
  return [...remove];
}

function applyMatches(characters) {
  const changes = [];
  const removedAssetDirs = new Set();
  const changedCharacterIds = new Set();
  for (const match of config.matches.filter((candidate) => !selectedCharacter || candidate.characterId === selectedCharacter)) {
    const loaded = characters.get(match.characterId);
    if (!loaded) throw new Error(`Unknown character ${match.characterId}`);
    const { character } = loaded;
    changedCharacterIds.add(match.characterId);
    if (character.unplayable) throw new Error(`${match.characterId} is unplayable`);
    match.moveKeys.forEach((moveKey) => ensureConfiguredMove(character, moveKey));
    const outputs = copySourceFrames(match);
    const replacedIds = removeReplacedProjectiles(character, match.replaceProjectileIds);
    for (const id of replacedIds) removedAssetDirs.add(path.join(charactersRoot, match.characterId, 'projectiles', id));
    stripAnimationFrames(character, match.stripMoveFrames);
    if (match.assetType === 'projectile' || match.assetType === 'blast') {
      character.projectiles ??= [];
      character.projectiles = character.projectiles.filter((definition) => definition.id !== match.assetId);
      character.projectiles.push(match.assetType === 'blast' ? createBlastDefinition(match, outputs) : createProjectileDefinition(match, outputs));
      character.moveProjectiles ??= {};
      for (const moveKey of match.moveKeys) {
        const existing = (character.moveProjectiles[moveKey] ?? []).filter((instance) => instance.projectileId !== match.assetId);
        character.moveProjectiles[moveKey] = [...existing, match.assetType === 'blast' ? createBlastBinding(match, moveKey) : createProjectileBinding(match, moveKey)];
      }
    } else {
      character.effects ??= [];
      character.effects = character.effects.filter((definition) => definition.id !== match.assetId);
      character.effects.push(createEffectDefinition(match, outputs));
      character.moveEffects ??= {};
      for (const moveKey of match.moveKeys) {
        const existing = (character.moveEffects[moveKey] ?? []).filter((instance) => instance.effectId !== match.assetId);
        character.moveEffects[moveKey] = [...existing, createEffectBinding(match, moveKey)];
      }
    }
    const metadataDir = path.join(charactersRoot, match.characterId, match.assetType === 'effect' ? 'effects' : 'projectiles', match.assetId, 'source');
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(path.join(metadataDir, 'source.json'), `${JSON.stringify(sourceMetadata(match, outputs), null, 2)}\n`);
    changes.push({ characterId: match.characterId, assetType: match.assetType, assetId: match.assetId, sourceFrames: match.sourceFrames, moveKeys: match.moveKeys, replacedIds });
  }
  for (const directory of removedAssetDirs) {
    const stillUsed = config.matches.some((match) => path.join(charactersRoot, match.characterId, 'projectiles', match.assetId) === directory);
    if (!stillUsed && fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
  }
  for (const characterId of changedCharacterIds) {
    const { manifestPath, character } = characters.get(characterId);
    fs.writeFileSync(manifestPath, `${JSON.stringify(character, null, 2)}\n`);
  }
  return changes;
}

function existingProjectileStatuses(beforeCharacters, changes) {
  const replaced = new Set(changes.flatMap((change) => change.replacedIds.map((id) => `${change.characterId}:${id}`)));
  const statuses = [];
  for (const [characterId, { character }] of beforeCharacters) {
    if (character.unplayable) continue;
    const definitions = new Map((character.projectiles ?? []).map((definition) => [definition.id, definition]));
    const protectedIds = new Set();
    for (const instances of Object.values(character.moveProjectiles ?? {})) {
      for (const instance of instances) if (resolveProjectileKind(definitions.get(instance.projectileId), instance) === 'blast') protectedIds.add(instance.projectileId);
    }
    for (const definition of character.projectiles ?? []) {
      if (resolveProjectileKind(definition) === 'blast' || protectedIds.has(definition.id)) continue;
      const key = `${characterId}:${definition.id}`;
      const sourceFile = path.join(charactersRoot, characterId, 'projectiles', definition.id, 'source', 'source.json');
      const sourceText = fs.existsSync(sourceFile) ? fs.readFileSync(sourceFile, 'utf8') : '';
      const originalSheet = /original sprite sheet|sourceSheetPath|sourceFrameIndex/i.test(sourceText);
      statuses.push({
        characterId,
        projectileId: definition.id,
        status: replaced.has(key) ? 'replaced-from-sprite-sheet' : originalSheet ? 'retained-original-sheet' : 'retained-no-confident-sheet-match'
      });
    }
  }
  return statuses;
}

fs.mkdirSync(reportRoot, { recursive: true });
const originalCharacters = loadCharacters();
const protectedBefore = protectedBlastSnapshot(originalCharacters);
const playableCharacters = [...originalCharacters.values()].filter(({ character }) => !character.unplayable).map(({ character }) => character.id);
let changes = [];
if (apply) changes = applyMatches(loadCharacters());
const afterCharacters = apply ? loadCharacters() : originalCharacters;
const protectedAfter = protectedBlastSnapshot(afterCharacters);
if (stable(unmanagedProtectedBlastSnapshot(protectedBefore)) !== stable(unmanagedProtectedBlastSnapshot(protectedAfter))) throw new Error('Protected blast definitions, bindings, or assets changed');

const report = {
  generatedAt: new Date().toISOString(),
  mode: apply ? 'apply' : 'audit',
  playableCharactersChecked: playableCharacters,
  playableCharacterCount: playableCharacters.length,
  protectedBlasts: protectedBefore,
  protectedBlastVerification: 'unchanged',
  changes,
  replacedNonBlastProjectiles: changes.flatMap((change) => change.replacedIds.map((projectileId) => ({ characterId: change.characterId, projectileId, status: 'replaced-from-sprite-sheet' }))),
  existingNonBlastProjectiles: existingProjectileStatuses(originalCharacters, changes),
  ambiguousSkipped: config.ambiguousSkipped
};
const reportFile = path.join(reportRoot, apply ? 'final-report.json' : 'dry-run-report.json');
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
const reportedMatchCount = selectedCharacter ? config.matches.filter((match) => match.characterId === selectedCharacter).length : config.matches.length;
console.log(`${apply ? 'Applied' : 'Audited'} ${reportedMatchCount} sprite-sheet matches across ${playableCharacters.length} playable characters${selectedCharacter ? ` (filtered to ${selectedCharacter})` : ''}.`);
console.log(`Protected blasts: ${Object.values(protectedBefore).reduce((count, entry) => count + entry.definitions.length, 0)} definitions verified unchanged.`);
console.log(`Report: ${reportFile}`);
