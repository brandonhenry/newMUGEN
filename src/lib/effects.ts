import type {
  CharacterEffectDefinition,
  EffectAnchor,
  EffectBlendMode,
  EffectKeyframe,
  EffectSoundCue,
  EffectTransform,
  MoveEffectInstance,
  ProceduralEffectKind,
  ProceduralEffectLayer,
  SpriteFrameEdit,
  Vec3Tuple
} from '../types';

const defaultTransform: EffectTransform = {
  position: [0, 1.1, 0.55],
  scale: [1, 1, 1],
  rotation: [0, 0, 0],
  opacity: 1,
  color: '#ffffff'
};

const anchors = new Set<EffectAnchor>(['body', 'head', 'hands', 'feet', 'hitbox', 'world']);
const blends = new Set<EffectBlendMode>(['normal', 'additive', 'screen']);
const proceduralKinds = new Set<ProceduralEffectKind>(['lightning', 'wind', 'ring', 'glow', 'trail', 'shards']);

export function defaultCharacterEffect(id = 'new-effect'): CharacterEffectDefinition {
  return {
    id,
    name: 'New Effect',
    frames: [],
    fps: 12,
    loop: false,
    billboard: true,
    blendMode: 'additive',
    anchor: 'body',
    defaultTransform: { ...defaultTransform },
    proceduralLayers: [{ id: 'glow', kind: 'glow', color: '#7de7ff', intensity: 1, size: 1 }],
    soundCues: []
  };
}

export function sanitizeEffects(effects: unknown): CharacterEffectDefinition[] {
  if (!Array.isArray(effects)) return [];
  return effects
    .filter((effect): effect is Record<string, unknown> => Boolean(effect) && typeof effect === 'object')
    .map(sanitizeEffect)
    .filter((effect) => effect.id.length > 0);
}

export function sanitizeMoveEffects(moveEffects: unknown): Record<string, MoveEffectInstance[]> {
  if (!moveEffects || typeof moveEffects !== 'object') return {};
  return Object.fromEntries(
    Object.entries(moveEffects as Record<string, unknown>)
      .filter(([key, value]) => key.length > 0 && Array.isArray(value))
      .map(([key, value]) => [key, (value as unknown[]).map(sanitizeMoveEffectInstance).filter((instance) => instance.effectId)])
      .filter(([, value]) => value.length > 0)
  );
}

export function sanitizeEffect(effect: Record<string, unknown>): CharacterEffectDefinition {
  const id = safeId(effect.id, 'effect');
  return {
    id,
    name: typeof effect.name === 'string' && effect.name.trim() ? effect.name.trim() : id,
    spriteSheetPath: typeof effect.spriteSheetPath === 'string' ? effect.spriteSheetPath : undefined,
    frames: Array.isArray(effect.frames) ? effect.frames.filter((frame): frame is string => typeof frame === 'string') : [],
    effectFrameEdits: sanitizeEffectFrameEdits(effect.effectFrameEdits),
    fps: clampNumber(effect.fps, 1, 60, 12),
    loop: effect.loop === true,
    billboard: effect.billboard !== false,
    blendMode: blends.has(effect.blendMode as EffectBlendMode) ? effect.blendMode as EffectBlendMode : 'additive',
    anchor: anchors.has(effect.anchor as EffectAnchor) ? effect.anchor as EffectAnchor : 'body',
    defaultTransform: sanitizeTransform(effect.defaultTransform),
    proceduralLayers: sanitizeProceduralLayers(effect.proceduralLayers),
    soundCues: sanitizeSoundCues(effect.soundCues)
  };
}

function sanitizeEffectFrameEdits(value: unknown): Record<string, SpriteFrameEdit> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, edit]) => /^\d+$/.test(key) && Boolean(edit) && typeof edit === 'object')
      .map(([key, edit]) => [key, sanitizeEffectFrameEdit({ ...(edit as Record<string, unknown>), index: Number(key) })])
  );
}

function sanitizeEffectFrameEdit(edit: Record<string, unknown>): SpriteFrameEdit {
  const box = readBox(edit.box);
  const width = Math.max(1, Math.round(numberOr(edit.width, Math.max(1, box[2] - box[0]))));
  const height = Math.max(1, Math.round(numberOr(edit.height, Math.max(1, box[3] - box[1]))));
  const sourceMode = edit.sourceMode === 'replacement' ? 'replacement' : 'sheet';
  return {
    index: Math.max(0, Math.round(numberOr(edit.index, 0))),
    path: typeof edit.path === 'string' ? edit.path : undefined,
    sourceMode,
    sheetId: typeof edit.sheetId === 'string' ? safeId(edit.sheetId, 'source') : undefined,
    sheetPath: typeof edit.sheetPath === 'string' ? edit.sheetPath : undefined,
    sourceName: typeof edit.sourceName === 'string' ? edit.sourceName : undefined,
    replacementName: sourceMode === 'replacement' && typeof edit.replacementName === 'string' ? edit.replacementName : undefined,
    replacementWidth: sourceMode === 'replacement' ? Math.max(1, Math.round(numberOr(edit.replacementWidth, width))) : undefined,
    replacementHeight: sourceMode === 'replacement' ? Math.max(1, Math.round(numberOr(edit.replacementHeight, height))) : undefined,
    box,
    width,
    height,
    row: edit.row === undefined ? undefined : Math.round(numberOr(edit.row, 0)),
    rotation: numberOr(edit.rotation, 0),
    offset: readVec2(edit.offset),
    scale: clampNumber(edit.scale, 0.25, 4, 1),
    hidden: edit.hidden === true,
    revision: edit.revision === undefined ? undefined : Math.max(0, Math.round(numberOr(edit.revision, 0)))
  };
}

function readBox(value: unknown): [number, number, number, number] {
  if (!Array.isArray(value) || value.length < 4) return [0, 0, 32, 32];
  const x1 = Math.max(0, Math.round(numberOr(value[0], 0)));
  const y1 = Math.max(0, Math.round(numberOr(value[1], 0)));
  const x2 = Math.max(x1 + 1, Math.round(numberOr(value[2], x1 + 1)));
  const y2 = Math.max(y1 + 1, Math.round(numberOr(value[3], y1 + 1)));
  return [x1, y1, x2, y2];
}

function readVec2(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [0, 0];
  return [numberOr(value[0], 0), numberOr(value[1], 0)];
}

export function sanitizeMoveEffectInstance(instance: unknown): MoveEffectInstance {
  const source = instance && typeof instance === 'object' ? instance as Record<string, unknown> : {};
  return {
    id: safeId(source.id, `fx-${Date.now()}`),
    effectId: safeId(source.effectId, ''),
    label: typeof source.label === 'string' ? source.label : undefined,
    hitbox: sanitizeEffectHitbox(source.hitbox),
    startFrame: Math.max(0, Math.round(numberOr(source.startFrame, 0))),
    endFrame: source.endFrame === undefined ? undefined : Math.max(0, Math.round(numberOr(source.endFrame, 0))),
    layer: Math.round(numberOr(source.layer, 0)),
    mirrorWithFacing: source.mirrorWithFacing !== false,
    anchor: anchors.has(source.anchor as EffectAnchor) ? source.anchor as EffectAnchor : undefined,
    loop: source.loop === true,
    keyframes: sanitizeKeyframes(source.keyframes),
    soundCues: sanitizeSoundCues(source.soundCues)
  };
}

function sanitizeEffectHitbox(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const offset = readVec3(source.offset, [0, 0, 0]);
  const size = readVec3(source.size, [0.8, 0.8, 0.8]).map((entry) => Math.max(0.05, Math.abs(entry))) as Vec3Tuple;
  return { offset, size };
}

export function effectTransformAt(effect: CharacterEffectDefinition, instance: MoveEffectInstance, moveFrame: number): EffectTransform {
  const timelineFrame = Math.max(0, moveFrame);
  const keyframes = instance.keyframes.length > 0 ? instance.keyframes : [{ frame: 0, ...effect.defaultTransform }];
  const sorted = [...keyframes].sort((a, b) => a.frame - b.frame);
  const keyframeWindows = sorted.filter((keyframe) => keyframe.endFrame !== undefined);
  if (keyframeWindows.length > 0) {
    const activeWindow = [...keyframeWindows].reverse().find((keyframe) => timelineFrame >= keyframe.frame && timelineFrame <= getKeyframeEndFrame(keyframe));
    const nearestKeyframe = activeWindow ?? [...sorted].reverse().find((keyframe) => keyframe.frame <= timelineFrame) ?? sorted[0];
    return transformFromKeyframe(effect, nearestKeyframe);
  }
  const previous = [...sorted].reverse().find((keyframe) => keyframe.frame <= timelineFrame) ?? sorted[0];
  const next = sorted.find((keyframe) => keyframe.frame >= timelineFrame) ?? previous;
  const previousEndFrame = getKeyframeEndFrame(previous);
  const amount = previous === next || timelineFrame <= previousEndFrame ? 0 : (timelineFrame - previousEndFrame) / Math.max(1, next.frame - previousEndFrame);
  const base = effect.defaultTransform;
  return {
    position: lerpVec3(readVec3(previous.position, base.position), readVec3(next.position, base.position), amount),
    scale: lerpVec3(readVec3(previous.scale, base.scale), readVec3(next.scale, base.scale), amount),
    rotation: lerpVec3(readVec3(previous.rotation, base.rotation), readVec3(next.rotation, base.rotation), amount),
    opacity: lerpNumber(numberOr(previous.opacity, base.opacity), numberOr(next.opacity, base.opacity), amount),
    color: typeof next.color === 'string' ? next.color : typeof previous.color === 'string' ? previous.color : base.color
  };
}

function transformFromKeyframe(effect: CharacterEffectDefinition, keyframe: EffectKeyframe): EffectTransform {
  const base = effect.defaultTransform;
  return {
    position: readVec3(keyframe.position, base.position),
    scale: readVec3(keyframe.scale, base.scale),
    rotation: readVec3(keyframe.rotation, base.rotation),
    opacity: numberOr(keyframe.opacity, base.opacity),
    color: typeof keyframe.color === 'string' ? keyframe.color : base.color
  };
}

export function effectIsActive(instance: MoveEffectInstance, moveFrame: number, fallbackEndFrame: number) {
  return moveFrame >= instance.startFrame && moveFrame <= (instance.endFrame ?? fallbackEndFrame);
}

export function effectIsVisibleAt(instance: MoveEffectInstance, moveFrame: number, fallbackEndFrame: number) {
  if (!effectIsActive(instance, moveFrame, fallbackEndFrame)) return false;
  const keyframeWindows = instance.keyframes.filter((keyframe) => keyframe.endFrame !== undefined);
  if (keyframeWindows.length === 0) return true;
  return keyframeWindows.some((keyframe) => moveFrame >= keyframe.frame && moveFrame <= (keyframe.endFrame ?? keyframe.frame));
}

export function shouldFireEffectCue(cue: EffectSoundCue, previousMoveFrame: number, moveFrame: number, instance: MoveEffectInstance) {
  const cueFrame = instance.startFrame + cue.frame;
  return previousMoveFrame < cueFrame && moveFrame >= cueFrame;
}

function sanitizeTransform(value: unknown): EffectTransform {
  const source = value && typeof value === 'object' ? value as Partial<EffectTransform> : {};
  return {
    position: readVec3(source.position, defaultTransform.position),
    scale: readVec3(source.scale, defaultTransform.scale).map((value) => Math.max(0.01, value)) as Vec3Tuple,
    rotation: readVec3(source.rotation, defaultTransform.rotation),
    opacity: clampNumber(source.opacity, 0, 1, defaultTransform.opacity),
    color: sanitizeHex(source.color, defaultTransform.color)
  };
}

function sanitizeKeyframes(value: unknown): EffectKeyframe[] {
  if (!Array.isArray(value)) return [{ frame: 0, ...defaultTransform }];
  return value
    .filter((keyframe): keyframe is Record<string, unknown> => Boolean(keyframe) && typeof keyframe === 'object')
    .map((keyframe) => {
      const frame = Math.max(0, Math.round(numberOr(keyframe.frame, 0)));
      const endFrame = keyframe.endFrame === undefined ? undefined : Math.max(frame, Math.round(numberOr(keyframe.endFrame, frame)));
      return {
        frame,
        endFrame,
        position: Array.isArray(keyframe.position) ? readVec3(keyframe.position, defaultTransform.position) : undefined,
        scale: Array.isArray(keyframe.scale) ? readVec3(keyframe.scale, defaultTransform.scale) : undefined,
        rotation: Array.isArray(keyframe.rotation) ? readVec3(keyframe.rotation, defaultTransform.rotation) : undefined,
        opacity: keyframe.opacity === undefined ? undefined : clampNumber(keyframe.opacity, 0, 1, 1),
        color: typeof keyframe.color === 'string' ? sanitizeHex(keyframe.color, '#ffffff') : undefined
      };
    })
    .sort((a, b) => a.frame - b.frame);
}

function getKeyframeEndFrame(keyframe: EffectKeyframe) {
  return Math.max(keyframe.frame, Math.round(keyframe.endFrame ?? keyframe.frame));
}

function sanitizeProceduralLayers(value: unknown): ProceduralEffectLayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((layer): layer is Record<string, unknown> => Boolean(layer) && typeof layer === 'object')
    .map((layer, index) => ({
      id: safeId(layer.id, `layer-${index + 1}`),
      kind: proceduralKinds.has(layer.kind as ProceduralEffectKind) ? layer.kind as ProceduralEffectKind : 'glow',
      color: sanitizeHex(layer.color, '#7de7ff'),
      intensity: clampNumber(layer.intensity, 0, 4, 1),
      size: clampNumber(layer.size, 0.05, 8, 1),
      count: layer.count === undefined ? undefined : Math.max(1, Math.min(64, Math.round(numberOr(layer.count, 8))))
    }));
}

function sanitizeSoundCues(value: unknown): EffectSoundCue[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((cue): cue is Record<string, unknown> => Boolean(cue) && typeof cue === 'object')
    .map((cue, index) => ({
      id: safeId(cue.id, `cue-${index + 1}`),
      name: typeof cue.name === 'string' && cue.name.trim() ? cue.name.trim() : `Cue ${index + 1}`,
      path: typeof cue.path === 'string' ? cue.path : '',
      frame: Math.max(0, Math.round(numberOr(cue.frame, 0))),
      volume: clampNumber(cue.volume, 0, 1, 0.8),
      pitch: clampNumber(cue.pitch, 0.25, 3, 1),
      pan: clampNumber(cue.pan, -1, 1, 0),
      retrigger: cue.retrigger === true
    }))
    .filter((cue) => cue.path.length > 0);
}

function readVec3(value: unknown, fallback: Vec3Tuple): Vec3Tuple {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [numberOr(value[0], fallback[0]), numberOr(value[1], fallback[1]), numberOr(value[2], fallback[2])];
}

function lerpVec3(a: Vec3Tuple, b: Vec3Tuple, amount: number): Vec3Tuple {
  return [lerpNumber(a[0], b[0], amount), lerpNumber(a[1], b[1], amount), lerpNumber(a[2], b[2], amount)];
}

function lerpNumber(a: number, b: number, amount: number) {
  return a + (b - a) * Math.max(0, Math.min(1, amount));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return Math.min(max, Math.max(min, numberOr(value, fallback)));
}

function numberOr(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function safeId(value: unknown, fallback: string) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  return raw.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function sanitizeHex(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
