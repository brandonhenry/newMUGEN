import type { ActionName, GameSettings, PlayerControlBindings, PlayerGamepadBindings } from '../types';
import { emptyInputFrame } from '../types';

const SETTINGS_STORAGE_KEY = 'kore.gameSettings';
const settingsVersion = 1;
const actions = Object.keys(emptyInputFrame()) as ActionName[];

const p1Keyboard: PlayerControlBindings = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  sidestepUp: [],
  sidestepDown: [],
  sidewalkUp: [],
  sidewalkDown: [],
  jab: ['KeyU', 'Digit1', 'Numpad1'],
  heavy: ['KeyI', 'Digit2', 'Numpad2'],
  kick: ['KeyJ', 'Digit3', 'Numpad3'],
  special: ['KeyK', 'Digit4', 'Numpad4'],
  charge: ['KeyO'],
  block: [],
  confirm: ['Enter'],
  back: [],
  pause: ['Escape']
};

const p2Keyboard: PlayerControlBindings = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  sidestepUp: [],
  sidestepDown: [],
  sidewalkUp: [],
  sidewalkDown: [],
  jab: ['Numpad1', 'Digit1'],
  heavy: ['Numpad2', 'Digit2'],
  kick: ['Numpad3', 'Digit3'],
  special: ['Numpad4', 'Digit4'],
  charge: ['Numpad6', 'Digit6'],
  block: ['Numpad5', 'Digit5', 'ShiftRight'],
  confirm: ['Space'],
  back: [],
  pause: ['Escape']
};

const defaultGamepad: PlayerGamepadBindings = {
  jab: [0],
  kick: [1],
  heavy: [2],
  special: [3],
  charge: [6],
  block: [4, 5],
  pause: [9]
};

export const defaultGameSettings: GameSettings = {
  game: {
    roundTimer: 60,
    maxHealth: 100,
    trainingInfiniteHealth: true,
    inputAssist: true
  },
  controls: {
    keyboard: [p1Keyboard, p2Keyboard],
    gamepad: [defaultGamepad, defaultGamepad]
  },
  camera: {
    distance: 1,
    height: 1,
    smoothing: 1,
    zoomBias: 1
  },
  display: {
    hudScale: 1,
    touchControls: 'auto',
    reducedMotion: false,
    debugOverlay: true,
    impactSparks: {
      enabled: true,
      shape: 'burst',
      hitColor: '#ffb33f',
      blockColor: '#9eeeff',
      size: 1,
      intensity: 1
    }
  },
  audio: {
    master: 1,
    music: 0.72,
    sfx: 0.85,
    hitSfx: 1.35,
    muted: false,
    menuMusic: true,
    bgmTrackIndex: 0
  }
};

export function readGameSettings(): GameSettings {
  if (typeof window === 'undefined') return cloneSettings(defaultGameSettings);
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return sanitizeGameSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return cloneSettings(defaultGameSettings);
  }
}

export function writeGameSettings(settings: GameSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      version: settingsVersion,
      settings: sanitizeGameSettings(settings)
    })
  );
}

export function sanitizeGameSettings(raw: unknown): GameSettings {
  const candidate = unwrapStoredSettings(raw);
  const source = isRecord(candidate) ? candidate : {};
  const defaults = cloneSettings(defaultGameSettings);
  const game = isRecord(source.game) ? source.game : {};
  const camera = isRecord(source.camera) ? source.camera : {};
  const display = isRecord(source.display) ? source.display : {};
  const impactSparks = isRecord(display.impactSparks) ? display.impactSparks : {};
  const audio = isRecord(source.audio) ? source.audio : {};
  const controls = isRecord(source.controls) ? source.controls : {};
  const keyboard = Array.isArray(controls.keyboard) ? controls.keyboard : [];
  const gamepad = Array.isArray(controls.gamepad) ? controls.gamepad : [];

  return {
    game: {
      roundTimer: sanitizeRoundTimer(game.roundTimer, defaults.game.roundTimer),
      maxHealth: sanitizeMaxHealth(game.maxHealth, defaults.game.maxHealth),
      trainingInfiniteHealth: booleanOr(game.trainingInfiniteHealth, defaults.game.trainingInfiniteHealth),
      inputAssist: booleanOr(game.inputAssist, defaults.game.inputAssist)
    },
    controls: {
      keyboard: [
        sanitizeKeyboardBindings(keyboard[0], defaults.controls.keyboard[0]),
        sanitizeKeyboardBindings(keyboard[1], defaults.controls.keyboard[1])
      ],
      gamepad: [
        sanitizeGamepadBindings(gamepad[0], defaults.controls.gamepad[0]),
        sanitizeGamepadBindings(gamepad[1], defaults.controls.gamepad[1])
      ]
    },
    camera: {
      distance: clampNumber(camera.distance, 0.7, 1.35, defaults.camera.distance),
      height: clampNumber(camera.height, 0.75, 1.35, defaults.camera.height),
      smoothing: clampNumber(camera.smoothing, 0.35, 1.5, defaults.camera.smoothing),
      zoomBias: clampNumber(camera.zoomBias, 0.75, 1.35, defaults.camera.zoomBias)
    },
    display: {
      hudScale: clampNumber(display.hudScale, 0.78, 1.25, defaults.display.hudScale),
      touchControls: display.touchControls === 'on' || display.touchControls === 'off' ? display.touchControls : defaults.display.touchControls,
      reducedMotion: booleanOr(display.reducedMotion, defaults.display.reducedMotion),
      debugOverlay: booleanOr(display.debugOverlay, defaults.display.debugOverlay),
      impactSparks: {
        enabled: booleanOr(impactSparks.enabled, defaults.display.impactSparks.enabled),
        shape: impactSparks.shape === 'ring' || impactSparks.shape === 'shards' ? impactSparks.shape : defaults.display.impactSparks.shape,
        hitColor: sanitizeHexColor(impactSparks.hitColor, defaults.display.impactSparks.hitColor),
        blockColor: sanitizeHexColor(impactSparks.blockColor, defaults.display.impactSparks.blockColor),
        size: clampNumber(impactSparks.size, 0.5, 1.8, defaults.display.impactSparks.size),
        intensity: clampNumber(impactSparks.intensity, 0.35, 2, defaults.display.impactSparks.intensity)
      }
    },
    audio: {
      master: clampNumber(audio.master, 0, 1, defaults.audio.master),
      music: clampNumber(audio.music, 0, 1, defaults.audio.music),
      sfx: clampNumber(audio.sfx, 0, 1, defaults.audio.sfx),
      hitSfx: clampNumber(audio.hitSfx, 0, 2, defaults.audio.hitSfx),
      muted: booleanOr(audio.muted, defaults.audio.muted),
      menuMusic: booleanOr(audio.menuMusic, defaults.audio.menuMusic),
      bgmTrackIndex: Math.round(clampNumber(audio.bgmTrackIndex, 0, 99, defaults.audio.bgmTrackIndex))
    }
  };
}

export function cloneSettings(settings: GameSettings): GameSettings {
  return {
    ...settings,
    game: { ...settings.game },
    controls: {
      keyboard: [
        cloneKeyboardBindings(settings.controls.keyboard[0]),
        cloneKeyboardBindings(settings.controls.keyboard[1])
      ],
      gamepad: [
        cloneGamepadBindings(settings.controls.gamepad[0]),
        cloneGamepadBindings(settings.controls.gamepad[1])
      ]
    },
    camera: { ...settings.camera },
    display: { ...settings.display, impactSparks: { ...settings.display.impactSparks } },
    audio: { ...settings.audio }
  };
}

function unwrapStoredSettings(raw: unknown) {
  if (isRecord(raw) && isRecord(raw.settings)) return raw.settings;
  return raw;
}

function sanitizeKeyboardBindings(raw: unknown, fallback: PlayerControlBindings): PlayerControlBindings {
  const source = isRecord(raw) ? raw : {};
  return actions.reduce((bindings, action) => {
    const values = Array.isArray(source[action]) ? source[action] : fallback[action];
    bindings[action] = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
    return bindings;
  }, {} as PlayerControlBindings);
}

function sanitizeGamepadBindings(raw: unknown, fallback: PlayerGamepadBindings): PlayerGamepadBindings {
  const source = isRecord(raw) ? raw : {};
  return actions.reduce((bindings, action) => {
    const values = Array.isArray(source[action]) ? source[action] : fallback[action] ?? [];
    const buttons = values.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 16);
    if (buttons.length > 0) bindings[action] = buttons;
    return bindings;
  }, {} as PlayerGamepadBindings);
}

function cloneKeyboardBindings(bindings: PlayerControlBindings): PlayerControlBindings {
  return actions.reduce((copy, action) => {
    copy[action] = [...bindings[action]];
    return copy;
  }, {} as PlayerControlBindings);
}

function cloneGamepadBindings(bindings: PlayerGamepadBindings): PlayerGamepadBindings {
  return actions.reduce((copy, action) => {
    const values = bindings[action];
    if (values) copy[action] = [...values];
    return copy;
  }, {} as PlayerGamepadBindings);
}

function booleanOr(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeRoundTimer(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return 0;
  return Math.round(clampNumber(numeric, 30, 99, fallback));
}

function sanitizeMaxHealth(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return 0;
  return Math.round(clampNumber(numeric, 1, 999, fallback));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function sanitizeHexColor(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
