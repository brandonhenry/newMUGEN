import type { StageDefinition, StageVisualStyle, StageVisualStylePreset, Vec3Tuple } from '../types';

const visualStylePresets: Record<StageVisualStylePreset, StageVisualStyle> = {
  'anime-daylight': {
    lighting: {
      backgroundColor: '#9bdfff',
      fogColor: '#c9f5ff',
      fogNear: 30,
      fogFar: 145,
      ambientMode: 'hemisphere',
      skyColor: '#b8dcff',
      groundColor: '#54456b',
      hemiIntensity: 0.72,
      ambientIntensity: 0.28,
      keyColor: '#fff0d0',
      keyIntensity: 2.45,
      keyPosition: [4, 7, 5],
      fillColor: '#7aa8ff',
      fillIntensity: 0.82,
      fillPosition: [-5, 3, 4],
      rimColor: '#ffffff',
      rimIntensity: 1.65,
      rimPosition: [0, 4.2, -6],
      accentIntensity: 5.8,
      accentDistance: 8.5,
      shadowStrength: 0.48,
      shadowSoftness: 2.6
    },
    toon: {
      enabled: true,
      steps: 3,
      shadowStrength: 0.42,
      highlightStrength: 0.18,
      rimStrength: 0.22,
      saturation: 1.12,
      stagePropIntensity: 0.48
    },
    outline: {
      enabled: true,
      fighterThickness: 1.55,
      fighterStrength: 2.2,
      effectThickness: 1.1,
      effectStrength: 1.45,
      propThickness: 0.58,
      propStrength: 0.46,
      visibleColor: '#08090d',
      hiddenColor: '#000000'
    },
    post: {
      enabled: true,
      bloomEnabled: true,
      bloomThreshold: 0.72,
      bloomStrength: 0.34,
      bloomRadius: 0.28,
      saturation: 1.12,
      contrast: 1.08,
      brightness: 1,
      warmth: 0.06,
      vignetteStrength: 0.15,
      vignetteRadius: 0.82
    },
    camera: {
      impactShake: 0.12,
      impactZoom: 0.045,
      clashZoom: 0.11
    },
    combatFx: {
      hitBloom: 0.34,
      blockBloom: 0.16,
      punishBloom: 0.52,
      launchBloom: 0.48,
      rimPulse: 1.35,
      shockwaveStrength: 0.62,
      reducedMotionScale: 0.36
    }
  },
  'anime-night': {
    lighting: {
      backgroundColor: '#111827',
      fogColor: '#172033',
      fogNear: 26,
      fogFar: 128,
      ambientMode: 'hemisphere',
      skyColor: '#4f7dff',
      groundColor: '#120d20',
      hemiIntensity: 0.48,
      ambientIntensity: 0.18,
      keyColor: '#dbe8ff',
      keyIntensity: 2.2,
      keyPosition: [3.8, 6.8, 4.8],
      fillColor: '#6ddcff',
      fillIntensity: 0.76,
      fillPosition: [-4.8, 3.1, 4.2],
      rimColor: '#b9f7ff',
      rimIntensity: 2.1,
      rimPosition: [0, 4.4, -5.8],
      accentIntensity: 7.4,
      accentDistance: 9,
      shadowStrength: 0.56,
      shadowSoftness: 2.8
    },
    toon: {
      enabled: true,
      steps: 3,
      shadowStrength: 0.52,
      highlightStrength: 0.22,
      rimStrength: 0.32,
      saturation: 1.18,
      stagePropIntensity: 0.44
    },
    outline: {
      enabled: true,
      fighterThickness: 1.72,
      fighterStrength: 2.45,
      effectThickness: 1.18,
      effectStrength: 1.7,
      propThickness: 0.5,
      propStrength: 0.38,
      visibleColor: '#05060a',
      hiddenColor: '#000000'
    },
    post: {
      enabled: true,
      bloomEnabled: true,
      bloomThreshold: 0.58,
      bloomStrength: 0.52,
      bloomRadius: 0.42,
      saturation: 1.18,
      contrast: 1.12,
      brightness: 0.96,
      warmth: -0.08,
      vignetteStrength: 0.22,
      vignetteRadius: 0.76
    },
    camera: {
      impactShake: 0.13,
      impactZoom: 0.05,
      clashZoom: 0.12
    },
    combatFx: {
      hitBloom: 0.42,
      blockBloom: 0.22,
      punishBloom: 0.62,
      launchBloom: 0.56,
      rimPulse: 1.6,
      shockwaveStrength: 0.7,
      reducedMotionScale: 0.34
    }
  },
  'dojo-sunset': {
    lighting: {
      backgroundColor: '#ffd6a1',
      fogColor: '#ffe3bd',
      fogNear: 24,
      fogFar: 132,
      ambientMode: 'hemisphere',
      skyColor: '#ffc07a',
      groundColor: '#4a2830',
      hemiIntensity: 0.62,
      ambientIntensity: 0.24,
      keyColor: '#ffd2a2',
      keyIntensity: 2.55,
      keyPosition: [5.2, 6.6, 3.8],
      fillColor: '#776cff',
      fillIntensity: 0.58,
      fillPosition: [-5.2, 3.2, 4.4],
      rimColor: '#fff4d6',
      rimIntensity: 1.85,
      rimPosition: [0, 4.1, -6.2],
      accentIntensity: 6.2,
      accentDistance: 8.5,
      shadowStrength: 0.5,
      shadowSoftness: 2.5
    },
    toon: {
      enabled: true,
      steps: 3,
      shadowStrength: 0.46,
      highlightStrength: 0.2,
      rimStrength: 0.26,
      saturation: 1.14,
      stagePropIntensity: 0.5
    },
    outline: {
      enabled: true,
      fighterThickness: 1.52,
      fighterStrength: 2.18,
      effectThickness: 1.08,
      effectStrength: 1.42,
      propThickness: 0.56,
      propStrength: 0.44,
      visibleColor: '#13070b',
      hiddenColor: '#000000'
    },
    post: {
      enabled: true,
      bloomEnabled: true,
      bloomThreshold: 0.68,
      bloomStrength: 0.38,
      bloomRadius: 0.34,
      saturation: 1.13,
      contrast: 1.09,
      brightness: 1,
      warmth: 0.16,
      vignetteStrength: 0.17,
      vignetteRadius: 0.8
    },
    camera: {
      impactShake: 0.12,
      impactZoom: 0.045,
      clashZoom: 0.1
    },
    combatFx: {
      hitBloom: 0.36,
      blockBloom: 0.18,
      punishBloom: 0.54,
      launchBloom: 0.5,
      rimPulse: 1.38,
      shockwaveStrength: 0.64,
      reducedMotionScale: 0.36
    }
  },
  'storm-temple': {
    lighting: {
      backgroundColor: '#426878',
      fogColor: '#9bd7e5',
      fogNear: 20,
      fogFar: 118,
      ambientMode: 'hemisphere',
      skyColor: '#8fdcff',
      groundColor: '#183346',
      hemiIntensity: 0.54,
      ambientIntensity: 0.2,
      keyColor: '#e5fcff',
      keyIntensity: 2.25,
      keyPosition: [3.4, 7.2, 5.4],
      fillColor: '#6795ff',
      fillIntensity: 0.72,
      fillPosition: [-5.2, 3.4, 4.2],
      rimColor: '#d8ffff',
      rimIntensity: 2.25,
      rimPosition: [0, 4.8, -6.2],
      accentIntensity: 7,
      accentDistance: 9.2,
      shadowStrength: 0.54,
      shadowSoftness: 3
    },
    toon: {
      enabled: true,
      steps: 3,
      shadowStrength: 0.5,
      highlightStrength: 0.24,
      rimStrength: 0.34,
      saturation: 1.1,
      stagePropIntensity: 0.46
    },
    outline: {
      enabled: true,
      fighterThickness: 1.68,
      fighterStrength: 2.36,
      effectThickness: 1.18,
      effectStrength: 1.64,
      propThickness: 0.52,
      propStrength: 0.4,
      visibleColor: '#061018',
      hiddenColor: '#000000'
    },
    post: {
      enabled: true,
      bloomEnabled: true,
      bloomThreshold: 0.62,
      bloomStrength: 0.46,
      bloomRadius: 0.42,
      saturation: 1.1,
      contrast: 1.1,
      brightness: 0.98,
      warmth: -0.05,
      vignetteStrength: 0.2,
      vignetteRadius: 0.78
    },
    camera: {
      impactShake: 0.14,
      impactZoom: 0.052,
      clashZoom: 0.12
    },
    combatFx: {
      hitBloom: 0.42,
      blockBloom: 0.24,
      punishBloom: 0.6,
      launchBloom: 0.58,
      rimPulse: 1.55,
      shockwaveStrength: 0.72,
      reducedMotionScale: 0.34
    }
  },
  'void-boss': {
    lighting: {
      backgroundColor: '#201024',
      fogColor: '#2a1634',
      fogNear: 22,
      fogFar: 120,
      ambientMode: 'hemisphere',
      skyColor: '#a348ff',
      groundColor: '#09030e',
      hemiIntensity: 0.42,
      ambientIntensity: 0.16,
      keyColor: '#ffd6a3',
      keyIntensity: 2.4,
      keyPosition: [4.6, 7.4, 4.6],
      fillColor: '#a920ff',
      fillIntensity: 0.84,
      fillPosition: [-4.8, 3.2, 4.4],
      rimColor: '#ffb347',
      rimIntensity: 2.45,
      rimPosition: [0, 4.8, -6],
      accentIntensity: 8.6,
      accentDistance: 9.5,
      shadowStrength: 0.6,
      shadowSoftness: 2.8
    },
    toon: {
      enabled: true,
      steps: 3,
      shadowStrength: 0.56,
      highlightStrength: 0.26,
      rimStrength: 0.38,
      saturation: 1.2,
      stagePropIntensity: 0.42
    },
    outline: {
      enabled: true,
      fighterThickness: 1.78,
      fighterStrength: 2.55,
      effectThickness: 1.28,
      effectStrength: 1.85,
      propThickness: 0.46,
      propStrength: 0.34,
      visibleColor: '#050209',
      hiddenColor: '#000000'
    },
    post: {
      enabled: true,
      bloomEnabled: true,
      bloomThreshold: 0.54,
      bloomStrength: 0.68,
      bloomRadius: 0.48,
      saturation: 1.22,
      contrast: 1.16,
      brightness: 0.94,
      warmth: 0.08,
      vignetteStrength: 0.28,
      vignetteRadius: 0.72
    },
    camera: {
      impactShake: 0.16,
      impactZoom: 0.06,
      clashZoom: 0.13
    },
    combatFx: {
      hitBloom: 0.5,
      blockBloom: 0.26,
      punishBloom: 0.72,
      launchBloom: 0.64,
      rimPulse: 1.82,
      shockwaveStrength: 0.82,
      reducedMotionScale: 0.32
    }
  },
  'training-clean': {
    lighting: {
      backgroundColor: '#f8fbff',
      fogColor: '#eef8ff',
      fogNear: 36,
      fogFar: 160,
      ambientMode: 'hemisphere',
      skyColor: '#f8fbff',
      groundColor: '#d5e2ec',
      hemiIntensity: 0.84,
      ambientIntensity: 0.34,
      keyColor: '#ffffff',
      keyIntensity: 2.15,
      keyPosition: [4.2, 7.2, 5],
      fillColor: '#dbe8ff',
      fillIntensity: 0.68,
      fillPosition: [-5, 3.1, 4],
      rimColor: '#ffffff',
      rimIntensity: 1.38,
      rimPosition: [0, 4.1, -6],
      accentIntensity: 4.8,
      accentDistance: 8,
      shadowStrength: 0.4,
      shadowSoftness: 2.4
    },
    toon: {
      enabled: true,
      steps: 3,
      shadowStrength: 0.34,
      highlightStrength: 0.14,
      rimStrength: 0.18,
      saturation: 1.06,
      stagePropIntensity: 0.38
    },
    outline: {
      enabled: true,
      fighterThickness: 1.36,
      fighterStrength: 1.95,
      effectThickness: 0.95,
      effectStrength: 1.22,
      propThickness: 0.42,
      propStrength: 0.3,
      visibleColor: '#141820',
      hiddenColor: '#000000'
    },
    post: {
      enabled: true,
      bloomEnabled: true,
      bloomThreshold: 0.78,
      bloomStrength: 0.22,
      bloomRadius: 0.22,
      saturation: 1.06,
      contrast: 1.05,
      brightness: 1.02,
      warmth: 0.02,
      vignetteStrength: 0.08,
      vignetteRadius: 0.88
    },
    camera: {
      impactShake: 0.09,
      impactZoom: 0.035,
      clashZoom: 0.08
    },
    combatFx: {
      hitBloom: 0.24,
      blockBloom: 0.12,
      punishBloom: 0.38,
      launchBloom: 0.36,
      rimPulse: 1.05,
      shockwaveStrength: 0.48,
      reducedMotionScale: 0.4
    }
  }
};

export function getStageVisualStylePreset(value: unknown): StageVisualStylePreset | undefined {
  return typeof value === 'string' && value in visualStylePresets ? value as StageVisualStylePreset : undefined;
}

export function inferStageVisualStylePreset(stage: Pick<StageDefinition, 'id' | 'light' | 'rail' | 'world' | 'floorEffects' | 'visualStylePreset'>): StageVisualStylePreset {
  const explicit = getStageVisualStylePreset(stage.visualStylePreset);
  if (explicit) return explicit;
  if (stage.id.includes('chamber') || stage.id.includes('footstep') || stage.id.includes('shimmer')) return 'training-clean';
  if (stage.floorEffects?.energy) return 'void-boss';
  if (stage.floorEffects?.rain || stage.floorEffects?.rainPuddles || stage.floorEffects?.ripples || stage.floorEffects?.fog) return 'storm-temple';
  if (stage.floorEffects?.petals || stage.floorEffects?.cherryBurst || stage.id.includes('heat') || stage.id.includes('dust')) return 'dojo-sunset';
  const background = stage.world?.backgroundColor ?? '';
  if (isDarkColor(background) || isDarkColor(stage.rail)) return 'anime-night';
  return 'anime-daylight';
}

export function getStageVisualStylePresetDefaults(preset: StageVisualStylePreset) {
  return cloneStyle(visualStylePresets[preset]);
}

export function normalizeStageVisualStyle(stage: Pick<StageDefinition, 'id' | 'light' | 'rail' | 'world' | 'lighting' | 'floorEffects' | 'visualStyle' | 'visualStylePreset'>): StageVisualStyle {
  const preset = inferStageVisualStylePreset(stage);
  const source: Partial<StageVisualStyle> = stage.visualStyle ?? {};
  const defaults = visualStylePresets[preset];
  return {
    lighting: {
      backgroundColor: colorOr(source.lighting?.backgroundColor, stage.world?.backgroundColor ?? defaults.lighting.backgroundColor),
      fogColor: colorOr(source.lighting?.fogColor, stage.lighting?.sky ?? stage.world?.backgroundColor ?? defaults.lighting.fogColor),
      fogNear: clampNumber(source.lighting?.fogNear, defaults.lighting.fogNear, 1, 400),
      fogFar: clampNumber(source.lighting?.fogFar, defaults.lighting.fogFar, 10, 600),
      ambientMode: source.lighting?.ambientMode === 'ambient' ? 'ambient' : defaults.lighting.ambientMode,
      skyColor: colorOr(source.lighting?.skyColor, stage.lighting?.sky ?? defaults.lighting.skyColor),
      groundColor: colorOr(source.lighting?.groundColor, stage.lighting?.ambient ?? defaults.lighting.groundColor),
      hemiIntensity: clampNumber(source.lighting?.hemiIntensity, defaults.lighting.hemiIntensity, 0, 3),
      ambientIntensity: clampNumber(source.lighting?.ambientIntensity, defaults.lighting.ambientIntensity, 0, 2),
      keyColor: colorOr(source.lighting?.keyColor, stage.light ?? defaults.lighting.keyColor),
      keyIntensity: clampNumber(source.lighting?.keyIntensity, defaults.lighting.keyIntensity, 0, 8),
      keyPosition: vec3Or(source.lighting?.keyPosition, defaults.lighting.keyPosition),
      fillColor: colorOr(source.lighting?.fillColor, defaults.lighting.fillColor),
      fillIntensity: clampNumber(source.lighting?.fillIntensity, defaults.lighting.fillIntensity, 0, 5),
      fillPosition: vec3Or(source.lighting?.fillPosition, defaults.lighting.fillPosition),
      rimColor: colorOr(source.lighting?.rimColor, defaults.lighting.rimColor),
      rimIntensity: clampNumber(source.lighting?.rimIntensity, defaults.lighting.rimIntensity, 0, 6),
      rimPosition: vec3Or(source.lighting?.rimPosition, defaults.lighting.rimPosition),
      accentIntensity: clampNumber(source.lighting?.accentIntensity, defaults.lighting.accentIntensity, 0, 20),
      accentDistance: clampNumber(source.lighting?.accentDistance, defaults.lighting.accentDistance, 0.5, 40),
      shadowStrength: clampNumber(source.lighting?.shadowStrength, defaults.lighting.shadowStrength, 0, 1),
      shadowSoftness: clampNumber(source.lighting?.shadowSoftness, defaults.lighting.shadowSoftness, 0.1, 8)
    },
    toon: {
      enabled: source.toon?.enabled !== false,
      steps: Math.round(clampNumber(source.toon?.steps, defaults.toon.steps, 2, 6)),
      shadowStrength: clampNumber(source.toon?.shadowStrength, defaults.toon.shadowStrength, 0, 1),
      highlightStrength: clampNumber(source.toon?.highlightStrength, defaults.toon.highlightStrength, 0, 1),
      rimStrength: clampNumber(source.toon?.rimStrength, defaults.toon.rimStrength, 0, 1),
      saturation: clampNumber(source.toon?.saturation, defaults.toon.saturation, 0.2, 2),
      stagePropIntensity: clampNumber(source.toon?.stagePropIntensity, defaults.toon.stagePropIntensity, 0, 1)
    },
    outline: {
      enabled: source.outline?.enabled !== false,
      fighterThickness: clampNumber(source.outline?.fighterThickness, defaults.outline.fighterThickness, 0, 6),
      fighterStrength: clampNumber(source.outline?.fighterStrength, defaults.outline.fighterStrength, 0, 8),
      effectThickness: clampNumber(source.outline?.effectThickness, defaults.outline.effectThickness, 0, 6),
      effectStrength: clampNumber(source.outline?.effectStrength, defaults.outline.effectStrength, 0, 8),
      propThickness: clampNumber(source.outline?.propThickness, defaults.outline.propThickness, 0, 6),
      propStrength: clampNumber(source.outline?.propStrength, defaults.outline.propStrength, 0, 8),
      visibleColor: colorOr(source.outline?.visibleColor, defaults.outline.visibleColor),
      hiddenColor: colorOr(source.outline?.hiddenColor, defaults.outline.hiddenColor)
    },
    post: {
      enabled: source.post?.enabled !== false,
      bloomEnabled: source.post?.bloomEnabled !== false,
      bloomThreshold: clampNumber(source.post?.bloomThreshold, defaults.post.bloomThreshold, 0, 2),
      bloomStrength: clampNumber(source.post?.bloomStrength, defaults.post.bloomStrength, 0, 3),
      bloomRadius: clampNumber(source.post?.bloomRadius, defaults.post.bloomRadius, 0, 2),
      saturation: clampNumber(source.post?.saturation, defaults.post.saturation, 0.2, 2.5),
      contrast: clampNumber(source.post?.contrast, defaults.post.contrast, 0.2, 2.5),
      brightness: clampNumber(source.post?.brightness, defaults.post.brightness, 0.2, 2),
      warmth: clampNumber(source.post?.warmth, defaults.post.warmth, -1, 1),
      vignetteStrength: clampNumber(source.post?.vignetteStrength, defaults.post.vignetteStrength, 0, 1),
      vignetteRadius: clampNumber(source.post?.vignetteRadius, defaults.post.vignetteRadius, 0.1, 1.5)
    },
    camera: {
      impactShake: clampNumber(source.camera?.impactShake, defaults.camera.impactShake, 0, 1),
      impactZoom: clampNumber(source.camera?.impactZoom, defaults.camera.impactZoom, 0, 0.5),
      clashZoom: clampNumber(source.camera?.clashZoom, defaults.camera.clashZoom, 0, 0.6)
    },
    combatFx: {
      hitBloom: clampNumber(source.combatFx?.hitBloom, defaults.combatFx.hitBloom, 0, 3),
      blockBloom: clampNumber(source.combatFx?.blockBloom, defaults.combatFx.blockBloom, 0, 3),
      punishBloom: clampNumber(source.combatFx?.punishBloom, defaults.combatFx.punishBloom, 0, 4),
      launchBloom: clampNumber(source.combatFx?.launchBloom, defaults.combatFx.launchBloom, 0, 4),
      rimPulse: clampNumber(source.combatFx?.rimPulse, defaults.combatFx.rimPulse, 0, 5),
      shockwaveStrength: clampNumber(source.combatFx?.shockwaveStrength, defaults.combatFx.shockwaveStrength, 0, 3),
      reducedMotionScale: clampNumber(source.combatFx?.reducedMotionScale, defaults.combatFx.reducedMotionScale, 0, 1)
    }
  };
}

export function resolveStageVisualStyle(stage: StageDefinition): StageVisualStyle {
  return stage.visualStyle ?? normalizeStageVisualStyle(stage);
}

function cloneStyle(style: StageVisualStyle): StageVisualStyle {
  return JSON.parse(JSON.stringify(style)) as StageVisualStyle;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function colorOr(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function vec3Or(value: unknown, fallback: Vec3Tuple): Vec3Tuple {
  if (!Array.isArray(value)) return [...fallback];
  return [
    clampNumber(value[0], fallback[0], -100, 100),
    clampNumber(value[1], fallback[1], -100, 100),
    clampNumber(value[2], fallback[2], -100, 100)
  ];
}

function isDarkColor(value: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!match) return false;
  const raw = Number.parseInt(match[1], 16);
  const red = (raw >> 16) & 255;
  const green = (raw >> 8) & 255;
  const blue = raw & 255;
  return (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255 < 0.24;
}
