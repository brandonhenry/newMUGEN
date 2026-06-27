import anime from 'animejs';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Gamepad2,
  Home,
  KeyRound,
  Pause,
  Play,
  Rotate3D,
  RotateCcw,
  Save,
  Settings,
  Shuffle,
  Swords,
  Target,
  Timer,
  Trash2,
  Trophy,
  Upload,
  Users,
  Wifi,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { type CSSProperties, type Dispatch, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CharacterPreviewCanvas, GameScene, MenuAttractScene, StagePreviewCanvas, clearImageVoxelCacheForFrame, type PreviewPose } from './components/GameScene';
import { TouchControls } from './components/TouchControls';
import { KORE_APP_VERSION } from './appVersion';
import { stages } from './data/stages';
import { createMatch, stepMatch } from './engine/fightEngine';
import { getKeyboardBindingsForEvent, useControls } from './hooks/useControls';
import { type CharacterLoadResult, loadCharacterRoster } from './lib/characterLoader';
import { debugHypotheses, debugLog } from './lib/debugLogger';
import { defaultCharacterEffect, effectTransformAt, sanitizeEffects, sanitizeMoveEffects } from './lib/effects';
import { cloneSettings, defaultGameSettings, readGameSettings, sanitizeGameSettings, writeGameSettings } from './lib/gameSettings';
import { type StageLoadResult, loadStageRoster } from './lib/stageLoader';
import { ONLINE_PROTOCOL_VERSION, compactMatchSnapshot, decodeInputFrame, encodeInputFrame, hydrateMatchSnapshot } from './lib/online/codec';
import { fetchLeaderboard, readOnlineProfile, sanitizeDisplayName, submitLeaderboardResult, writeOnlineProfile, type LeaderboardEntry, type OnlinePlayerProfile } from './lib/online/leaderboard';
import { leaveOnlineRoom, matchmakeOnline, type OnlineMatchResult } from './lib/online/matchmaking';
import { createOnlinePeerSession, type OnlinePeerSession } from './lib/online/peerSession';
import { addCombatPopupEventToOnlineStats, addImpactEventToOnlineStats, calculateOnlinePerformancePoints, emptyOnlinePerformancePair } from './lib/online/performanceScoring';
import { createPrivateRoom, generatePrivateRoomPassword, joinPrivateRoom, leavePrivateRoom, listPrivateRooms, normalizePrivateRoomPassword, type PrivateRoomIntent, type PrivateRoomResult, type PrivateRoomSummary } from './lib/online/privateRooms';
import type { OnlineConnectionState, OnlineMessage, OnlineRole } from './lib/online/messages';
import {
  ROUNDS_TO_WIN,
  emptyInputFrame,
  type ActionName,
  type CharacterDefinition,
  type CharacterEffectDefinition,
  type CharacterSpriteSheet,
  type CombatPopupEvent,
  type CpuDifficulty,
  type EffectAnchor,
  type EffectBlendMode,
  type EffectKeyframe,
  type GameSettings,
  type HitLevel,
  type ImpactSparkEvent,
  type InputFrame,
  type MatchMode,
  type MatchSnapshot,
  type MoveDefinition,
  type MoveEffectInstance,
  type MoveInput,
  type MoveOverride,
  type MoveTracking,
  type SpriteFrameEdit,
  type StageDefinition,
  type StagePropDefinition,
  type VoxelFidelitySettings
} from './types';

type Screen = 'boot' | 'title' | 'menu' | 'leaderboard' | 'privateRooms' | 'select' | 'stage' | 'fight' | 'settings' | 'viewer' | 'stageEditor';
type ActiveCombatPopup = CombatPopupEvent & { uid: number };
type OnlineWins = [number, number];
type CharacterAnimationOverride = {
  frames?: Record<string, string[]>;
  speeds?: Record<string, number>;
  moves?: Record<string, MoveOverride>;
  sprites?: Record<string, SpriteFrameEdit>;
  effects?: CharacterEffectDefinition[];
  moveEffects?: Record<string, MoveEffectInstance[]>;
};
type AnimationOverrideMap = Record<string, CharacterAnimationOverride>;
type StoredAnimationOverrides = {
  revision: string;
  overrides: AnimationOverrideMap;
};
type NotationToken = string;
type AnimationSlot = {
  key: string;
  label: string;
  pose: PreviewPose;
  notation: NotationToken[];
  category: 'stance' | 'raw' | 'direction' | 'motion' | 'state' | 'special';
  command?: string;
};

type HdVoxelRun = {
  part: 'head' | 'torso' | 'leadArm' | 'rearArm' | 'leadLeg' | 'rearLeg';
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  c: number;
  s?: number;
};

type HdVoxelPayload = {
  format: 'kore-hd-voxels-v1';
  palette: string[];
  voxels: HdVoxelRun[];
  source: {
    frame: string;
    width: number;
    height: number;
    sampleStep: number;
    foregroundWidth?: number;
    foregroundHeight?: number;
    baselineForegroundHeight?: number;
    modelHeight?: number;
    modelHeightScale?: number;
  };
};

type HdVoxelBuildSizing = {
  modelHeightScale?: number;
  baselineForegroundHeight?: number;
};

const defaultVoxelFidelitySettings: Required<VoxelFidelitySettings> = {
  resolutionScale: 2,
  maxRows: 64,
  depth: 0.24,
  alphaThreshold: 24,
  paletteSnap: 1,
  mergeRuns: true,
  lod: {
    mobileStep: 2,
    farStep: 2
  }
};

const ANIMATION_STORAGE_KEY = 'kore.animationOverrides';
const ANIMATION_DEFAULTS_REVISION = 'sprite-inferred-2026-06-24-b';
const KORE_MENU_HOVER_SOUND_URL = new URL('../sounds/menu-button-hover-trimmed.wav', import.meta.url).href;
const KORE_MENU_SELECT_SOUND_URL = new URL('../sounds/menu-button-press.wav', import.meta.url).href;
const KORE_INNER_MENU_SELECT_SOUND_URL = new URL('../sounds/ui/generated/menu-click-004-selected.wav', import.meta.url).href;
const HIT_SFX = {
  punch1: '/sounds/hits/generated/hit-001.wav',
  heavy2: '/sounds/hits/generated/hit-002.wav',
  kick3: '/sounds/hits/generated/hit-009.wav',
  special4: '/sounds/hits/generated/hit-003.wav',
  blockLight: '/sounds/hits/generated/hit-013.wav',
  blockHeavy: '/sounds/hits/generated/hit-007.wav',
  launcher: '/sounds/hits/generated/hit-012.wav',
  bigLauncher: '/sounds/hits/generated/hit-019.wav'
} as const;
const GAME_SFX_URLS = [...new Set(Object.values(HIT_SFX))];
const SFX_POOL_SIZE = 4;
const sfxPools = new Map<string, { audios: HTMLAudioElement[]; cursor: number }>();

function getSfxPool(url: string) {
  let pool = sfxPools.get(url);
  if (!pool) {
    pool = {
      audios: Array.from({ length: SFX_POOL_SIZE }, () => {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.load();
        return audio;
      }),
      cursor: 0
    };
    sfxPools.set(url, pool);
  }
  return pool;
}

function preloadSfxPool(urls: string[]) {
  urls.forEach((url) => getSfxPool(url));
}

function unlockSfxPool(urls: string[]) {
  urls.forEach((url) => {
    const pool = getSfxPool(url);
    const audio = pool.audios[0];
    if (!audio) return;
    audio.muted = true;
    audio.volume = 0;
    audio.currentTime = 0;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    }).catch(() => {
      audio.muted = false;
    });
  });
}

function playPooledSfx(url: string, volume: number, playbackRate = 1) {
  const pool = getSfxPool(url);
  const availableIndex = pool.audios.findIndex((audio) => audio.paused || audio.ended || audio.currentTime > 0.08);
  const index = availableIndex >= 0 ? availableIndex : pool.cursor;
  const audio = pool.audios[index] ?? pool.audios[0];
  pool.cursor = (index + 1) % pool.audios.length;
  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = volume;
  audio.playbackRate = playbackRate;
  void audio.play().catch((error) => {
    console.warn('KORE SFX blocked', { url, error });
  });
}
type BgmSource = {
  key: string;
  tracks: LocalBgmTrack[];
  trackIndex: number;
  lockToTrack: boolean;
};

type LocalBgmTrack = {
  id: string;
  title: string;
  url: string;
  filename: string;
};

const LOCAL_BGM_FILES = [
  { filename: '0000 SEQ_BGMM_TITLE.mp3', url: new URL('../sounds/0000 SEQ_BGMM_TITLE.mp3', import.meta.url).href },
  { filename: '0001 SEQ_BGMM_STAFFROLL.mp3', url: new URL('../sounds/0001 SEQ_BGMM_STAFFROLL.mp3', import.meta.url).href },
  { filename: '0002 SEQ_BGMM_MAINMENU.mp3', url: new URL('../sounds/0002 SEQ_BGMM_MAINMENU.mp3', import.meta.url).href },
  { filename: '0003 SEQ_BGMM_OPTION.mp3', url: new URL('../sounds/0003 SEQ_BGMM_OPTION.mp3', import.meta.url).href },
  { filename: '0004 SEQ_BGMM_DECKMAKE.mp3', url: new URL('../sounds/0004 SEQ_BGMM_DECKMAKE.mp3', import.meta.url).href },
  { filename: '0005 SEQ_BGMM_COMM.mp3', url: new URL('../sounds/0005 SEQ_BGMM_COMM.mp3', import.meta.url).href },
  { filename: '0006 SEQ_BGMM_GALLERY.mp3', url: new URL('../sounds/0006 SEQ_BGMM_GALLERY.mp3', import.meta.url).href },
  { filename: '0007 SEQ_BGMM_QUIZ.mp3', url: new URL('../sounds/0007 SEQ_BGMM_QUIZ.mp3', import.meta.url).href },
  { filename: '0008 SEQ_BGMG_MAP_A.mp3', url: new URL('../sounds/0008 SEQ_BGMG_MAP_A.mp3', import.meta.url).href },
  { filename: '0009 SEQ_BGMG_MAP_B.mp3', url: new URL('../sounds/0009 SEQ_BGMG_MAP_B.mp3', import.meta.url).href },
  { filename: '000A SEQ_BGMG_MAP_C.mp3', url: new URL('../sounds/000A SEQ_BGMG_MAP_C.mp3', import.meta.url).href },
  { filename: '000B SEQ_BGMG_MAP_D.mp3', url: new URL('../sounds/000B SEQ_BGMG_MAP_D.mp3', import.meta.url).href },
  { filename: '000C SEQ_BGMG_EVT_OP.mp3', url: new URL('../sounds/000C SEQ_BGMG_EVT_OP.mp3', import.meta.url).href },
  { filename: '000D SEQ_BGMG_EVT_PLANET.mp3', url: new URL('../sounds/000D SEQ_BGMG_EVT_PLANET.mp3', import.meta.url).href },
  { filename: '000E SEQ_BGMG_EVT_A.mp3', url: new URL('../sounds/000E SEQ_BGMG_EVT_A.mp3', import.meta.url).href },
  { filename: '000F SEQ_BGMG_EVT_B.mp3', url: new URL('../sounds/000F SEQ_BGMG_EVT_B.mp3', import.meta.url).href },
  { filename: '0011 SEQ_BGMG_EVT_D.mp3', url: new URL('../sounds/0011 SEQ_BGMG_EVT_D.mp3', import.meta.url).href },
  { filename: '0012 SEQ_BGMB_STG_01.mp3', url: new URL('../sounds/0012 SEQ_BGMB_STG_01.mp3', import.meta.url).href },
  { filename: '0013 SEQ_BGMB_STG_02.mp3', url: new URL('../sounds/0013 SEQ_BGMB_STG_02.mp3', import.meta.url).href },
  { filename: '0014 SEQ_BGMB_STG_03.mp3', url: new URL('../sounds/0014 SEQ_BGMB_STG_03.mp3', import.meta.url).href },
  { filename: '0015 SEQ_BGMB_STG_04.mp3', url: new URL('../sounds/0015 SEQ_BGMB_STG_04.mp3', import.meta.url).href },
  { filename: '0016 SEQ_BGMB_STG_05.mp3', url: new URL('../sounds/0016 SEQ_BGMB_STG_05.mp3', import.meta.url).href },
  { filename: '0017 SEQ_BGMB_STG_06.mp3', url: new URL('../sounds/0017 SEQ_BGMB_STG_06.mp3', import.meta.url).href },
  { filename: '0018 SEQ_BGMB_STG_07.mp3', url: new URL('../sounds/0018 SEQ_BGMB_STG_07.mp3', import.meta.url).href },
  { filename: '0019 SEQ_BGMB_STG_08.mp3', url: new URL('../sounds/0019 SEQ_BGMB_STG_08.mp3', import.meta.url).href },
  { filename: '001A SEQ_BGMB_STG_09.mp3', url: new URL('../sounds/001A SEQ_BGMB_STG_09.mp3', import.meta.url).href },
  { filename: '001B SEQ_BGMB_STG_10.mp3', url: new URL('../sounds/001B SEQ_BGMB_STG_10.mp3', import.meta.url).href },
  { filename: '001C SEQ_BGMB_STG_11.mp3', url: new URL('../sounds/001C SEQ_BGMB_STG_11.mp3', import.meta.url).href },
  { filename: '001D SEQ_BGMB_STG_12.mp3', url: new URL('../sounds/001D SEQ_BGMB_STG_12.mp3', import.meta.url).href },
  { filename: '001E SEQ_BGMB_STG_13.mp3', url: new URL('../sounds/001E SEQ_BGMB_STG_13.mp3', import.meta.url).href },
  { filename: '001F SEQ_BGMB_STG_20.mp3', url: new URL('../sounds/001F SEQ_BGMB_STG_20.mp3', import.meta.url).href },
  { filename: '0020 SEQ_BGMB_STG_21.mp3', url: new URL('../sounds/0020 SEQ_BGMB_STG_21.mp3', import.meta.url).href },
  { filename: '0021 SEQ_BGMB_STG_22.mp3', url: new URL('../sounds/0021 SEQ_BGMB_STG_22.mp3', import.meta.url).href },
  { filename: '0022 SEQ_BGMB_STG_23.mp3', url: new URL('../sounds/0022 SEQ_BGMB_STG_23.mp3', import.meta.url).href },
  { filename: '0023 SEQ_BGMB_STG_25.mp3', url: new URL('../sounds/0023 SEQ_BGMB_STG_25.mp3', import.meta.url).href },
  { filename: '0024 SEQ_BGMB_STG_40.mp3', url: new URL('../sounds/0024 SEQ_BGMB_STG_40.mp3', import.meta.url).href },
  { filename: '0025 SEQ_BGMB_STG_50.mp3', url: new URL('../sounds/0025 SEQ_BGMB_STG_50.mp3', import.meta.url).href },
  { filename: '0026 SEQ_BGMB_STG_S01.mp3', url: new URL('../sounds/0026 SEQ_BGMB_STG_S01.mp3', import.meta.url).href },
  { filename: '0027 SEQ_BGMB_STG_A.mp3', url: new URL('../sounds/0027 SEQ_BGMB_STG_A.mp3', import.meta.url).href },
  { filename: '0028 SEQ_BGMB_STG_B.mp3', url: new URL('../sounds/0028 SEQ_BGMB_STG_B.mp3', import.meta.url).href },
  { filename: '0029 SEQ_BGMB_STG_C.mp3', url: new URL('../sounds/0029 SEQ_BGMB_STG_C.mp3', import.meta.url).href },
  { filename: '002A SEQ_BGMB_STG_D.mp3', url: new URL('../sounds/002A SEQ_BGMB_STG_D.mp3', import.meta.url).href },
  { filename: '002B SEQ_BGMB_STG_E.mp3', url: new URL('../sounds/002B SEQ_BGMB_STG_E.mp3', import.meta.url).href },
  { filename: '002C SEQ_BGMB_STG_G.mp3', url: new URL('../sounds/002C SEQ_BGMB_STG_G.mp3', import.meta.url).href },
  { filename: '002D SEQ_BGMB_STG_H.mp3', url: new URL('../sounds/002D SEQ_BGMB_STG_H.mp3', import.meta.url).href },
  { filename: '002E SEQ_BGMB_STG_I.mp3', url: new URL('../sounds/002E SEQ_BGMB_STG_I.mp3', import.meta.url).href },
  { filename: '002F SEQ_BGMB_SETTING.mp3', url: new URL('../sounds/002F SEQ_BGMB_SETTING.mp3', import.meta.url).href },
  { filename: '0030 SEQ_BGMB_RESWIN.mp3', url: new URL('../sounds/0030 SEQ_BGMB_RESWIN.mp3', import.meta.url).href },
  { filename: '0031 SEQ_BGMB_RESLOSE.mp3', url: new URL('../sounds/0031 SEQ_BGMB_RESLOSE.mp3', import.meta.url).href },
  { filename: '0032 SEQ_BGMB_SRESWIN.mp3', url: new URL('../sounds/0032 SEQ_BGMB_SRESWIN.mp3', import.meta.url).href },
  { filename: '0033 SEQ_BGMB_SRESLOSE.mp3', url: new URL('../sounds/0033 SEQ_BGMB_SRESLOSE.mp3', import.meta.url).href },
  { filename: '0034 SEQ_BGMA_MENU.mp3', url: new URL('../sounds/0034 SEQ_BGMA_MENU.mp3', import.meta.url).href },
  { filename: '0035 SEQ_BGMA_RANK_A.mp3', url: new URL('../sounds/0035 SEQ_BGMA_RANK_A.mp3', import.meta.url).href },
  { filename: '0036 SEQ_BGMA_RANK_B.mp3', url: new URL('../sounds/0036 SEQ_BGMA_RANK_B.mp3', import.meta.url).href }
];

const LOCAL_BGM_TRACKS: LocalBgmTrack[] = LOCAL_BGM_FILES
  .sort((left, right) => left.filename.localeCompare(right.filename, undefined, { numeric: true }))
  .map(({ filename, url }) => {
    const id = filename.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const title = filename
      .replace(/\.[^.]+$/, '')
      .replace(/^[0-9a-f]+\s+/i, '')
      .replace(/^SEQ_/i, '')
      .replace(/_/g, ' ')
      .replace(/\b(BGM[A-Z]?|STG|EVT|BGMM|BGMB|BGMG|BGMA)\b/gi, (value) => value.toUpperCase())
      .trim();
    return { id, title, url, filename };
  });

const STAGE_BGM_TRACKS = LOCAL_BGM_TRACKS.filter((track) => /SEQ_BGMB_STG/i.test(track.filename));

function normalizeBgmIndex(index: number, length: number) {
  if (length <= 0) return 0;
  const rounded = Math.round(index);
  return ((rounded % length) + length) % length;
}

function findBgmTrack(token: string) {
  const normalized = token.toLowerCase();
  return LOCAL_BGM_TRACKS.find((track) =>
    track.id === normalized ||
    track.filename.toLowerCase() === normalized ||
    track.filename.toLowerCase().includes(normalized) ||
    track.url.toLowerCase().includes(normalized)
  );
}

function fixedBgmSource(key: string, track: LocalBgmTrack | undefined): BgmSource | null {
  if (!track) return null;
  return {
    key,
    tracks: [track],
    trackIndex: 0,
    lockToTrack: true
  };
}

const FALLBACK_BGM_TRACK: LocalBgmTrack = LOCAL_BGM_TRACKS[0] ?? {
  id: 'missing-bgm',
  title: 'No BGM Track',
  url: '',
  filename: ''
};
const KORE_TITLE_BGM_TRACK = findBgmTrack('SEQ_BGMM_TITLE') ?? FALLBACK_BGM_TRACK;
const KORE_MENU_BGM_TRACK = findBgmTrack('SEQ_BGMM_MAINMENU') ?? FALLBACK_BGM_TRACK;
const KORE_OPTIONS_BGM_TRACK = findBgmTrack('SEQ_BGMM_OPTION') ?? KORE_MENU_BGM_TRACK;

const KORE_MENU_BGM_SOURCE: BgmSource = {
  key: 'menu:local-bgm-library',
  tracks: LOCAL_BGM_TRACKS.length > 0 ? LOCAL_BGM_TRACKS : [KORE_MENU_BGM_TRACK],
  trackIndex: 0,
  lockToTrack: false
};

function stageBgmTrack(stage: StageDefinition) {
  const configuredPath = stage.music?.path;
  if (configuredPath) {
    const track = findBgmTrack(configuredPath.split('/').pop() ?? configuredPath);
    if (track) return track;
  }
  const stageTracks = STAGE_BGM_TRACKS.length > 0 ? STAGE_BGM_TRACKS : LOCAL_BGM_TRACKS;
  return stageTracks[normalizeBgmIndex(stage.music?.trackIndex ?? 0, stageTracks.length)] ?? KORE_MENU_BGM_TRACK;
}

function stageBgmSource(stage: StageDefinition): BgmSource | null {
  const track = stageBgmTrack(stage);
  return fixedBgmSource(`stage:${stage.id}:${track?.id ?? 'none'}`, track);
}

const menuAttractStage: StageDefinition = {
  ...stages[0]
};

const baseAnimationSlots: AnimationSlot[] = [
  { key: 'idle', label: 'Neutral', pose: 'idle', notation: ['N'], category: 'stance' },
  { key: 'walkForward', label: 'Forward', pose: 'walk', notation: ['f'], category: 'stance' },
  { key: 'walkBack', label: 'Back', pose: 'walk', notation: ['b'], category: 'stance' },
  { key: 'sidestepLeft', label: 'Side Up', pose: 'sidestep', notation: ['↑↑'], category: 'stance' },
  { key: 'sidestepRight', label: 'Side Down', pose: 'sidestep', notation: ['↓↓'], category: 'stance' },
  { key: 'jump', label: 'Jump', pose: 'jump', notation: ['u'], category: 'stance' },
  { key: 'crouch', label: 'Crouch', pose: 'crouch', notation: ['d'], category: 'stance' },
  { key: 'block', label: 'Block', pose: 'block', notation: ['b'], category: 'stance' },
  { key: 'crouchBlock', label: 'Crouch Block', pose: 'crouchBlock', notation: ['D/B'], category: 'stance' },
  { key: 'chargeKi', label: 'Charge Ki', pose: 'chargeKi', notation: ['O'], category: 'stance' },
  { key: 'jableft', label: 'Left Punch', pose: 'jab', notation: ['1'], category: 'stance' },
  { key: 'jabright', label: 'Right Punch', pose: 'heavy', notation: ['2'], category: 'stance' },
  { key: 'kickleft', label: 'Left Kick', pose: 'kick', notation: ['3'], category: 'stance' },
  { key: 'kickright', label: 'Right Kick', pose: 'special', notation: ['4'], category: 'stance' },
  { key: 'hitLight', label: 'Hit', pose: 'hit', notation: ['HIT'], category: 'stance' },
  { key: 'juggle', label: 'Juggle', pose: 'juggle', notation: ['AIR'], category: 'stance' },
  { key: 'knockdown', label: 'Knockdown', pose: 'knockdown', notation: ['KD'], category: 'stance' },
  { key: 'win', label: 'Win', pose: 'win', notation: ['WIN'], category: 'stance' },
  { key: 'lose', label: 'Lose', pose: 'lose', notation: ['LOSE'], category: 'stance' }
];

const buttonCombos = [
  '1',
  '2',
  '3',
  '4',
  '1+2',
  '1+3',
  '1+4',
  '2+3',
  '2+4',
  '3+4',
  '1+2+3',
  '1+2+4',
  '1+3+4',
  '2+3+4',
  '1+2+3+4'
];
const directionPrefixes = ['f', 'F', 'b', 'B', 'd', 'D', 'u', 'U', 'd/f', 'D/F', 'd/b', 'D/B', 'u/f', 'U/F', 'u/b', 'U/B'];
const motionPrefixes = ['f,f', 'b,b', 'f,F', 'qcf', 'qcb', 'hcf', 'hcb', 'dp', 'rdp', 'cd'];
const statePrefixes = ['WR', 'WS', 'FC', 'SS', 'SSL', 'SSR', 'BT', 'iWS', 'iWR', 'cc'];
const specialPrefixes = ['H.', 'R.'];
const rawButtonCommandToBaseKey: Record<string, string> = {
  '1': 'jableft',
  '2': 'jabright',
  '3': 'kickleft',
  '4': 'kickright'
};
const legacyBaseInputToDataKey: Record<MoveDefinition['input'], string> = {
  jab: 'jableft',
  heavy: 'jabright',
  kick: 'kickleft',
  special: 'kickright'
};
const animationSlots = buildAnimationSlots();
const slotCategoryOptions: Array<{ value: AnimationSlot['category'] | 'all'; label: string }> = [
  { value: 'stance', label: 'Stances' },
  { value: 'raw', label: 'Raw Buttons' },
  { value: 'direction', label: 'Directions' },
  { value: 'motion', label: 'Motions' },
  { value: 'state', label: 'States' },
  { value: 'special', label: 'Ki/Heat/Rage' },
  { value: 'all', label: 'All' }
];
const hitLevelOptions: HitLevel[] = ['high', 'mid', 'low', 'throw', 'special'];
const trackingOptions: MoveTracking[] = ['none', 'weakLeft', 'weakRight', 'medium', 'strong', 'homing'];
const cpuDifficultyLabels: Record<CpuDifficulty, string> = {
  1: 'Easy',
  2: 'Casual',
  3: 'Normal',
  4: 'Hard',
  5: 'KORE'
};

function buildAnimationSlots(): AnimationSlot[] {
  const commandSlots: AnimationSlot[] = [];
  const pushCommand = (command: string, category: AnimationSlot['category'], label = command) => {
    commandSlots.push({
      key: commandAnimationKey(command),
      label,
      pose: commandPose(command),
      notation: parseNotationTokens(command),
      category,
      command
    });
  };

  buttonCombos.forEach((combo) => pushCommand(combo, 'raw'));
  directionPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'direction')));
  motionPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'motion')));
  statePrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}+${combo}`, 'state')));
  buttonCombos.forEach((combo) => pushCommand(`O+${combo}`, 'special', `Charge ${combo}`));
  specialPrefixes.forEach((prefix) => buttonCombos.forEach((combo) => pushCommand(`${prefix}${combo}`, 'special')));

  return [...baseAnimationSlots, ...commandSlots];
}

function commandAnimationKey(command: string) {
  return `cmd:${command}`;
}

function getCanonicalCommandDataKey(command?: string) {
  return command ? rawButtonCommandToBaseKey[command] : undefined;
}

function getSlotDataKey(slot: AnimationSlot) {
  return getCanonicalCommandDataKey(slot.command) ?? slot.key;
}

function getLegacyRawButtonDataKey(dataKey: string) {
  const command = Object.entries(rawButtonCommandToBaseKey).find(([, baseKey]) => baseKey === dataKey)?.[0];
  return command ? commandAnimationKey(command) : undefined;
}

function getLegacyBaseInputDataKey(dataKey: string) {
  return Object.entries(legacyBaseInputToDataKey).find(([, baseKey]) => baseKey === dataKey)?.[0];
}

function canonicalizeRawButtonRecord<T>(record: Record<string, T> = {}) {
  const next = { ...record };
  Object.entries(legacyBaseInputToDataKey).forEach(([legacyKey, baseKey]) => {
    if (next[baseKey] === undefined && next[legacyKey] !== undefined) next[baseKey] = next[legacyKey];
    delete next[legacyKey];
  });
  Object.entries(rawButtonCommandToBaseKey).forEach(([command, baseKey]) => {
    const legacyKey = commandAnimationKey(command);
    if (next[baseKey] === undefined && next[legacyKey] !== undefined) next[baseKey] = next[legacyKey];
    delete next[legacyKey];
  });
  return next;
}

function commandPose(command: string): PreviewPose {
  if (command.includes('3')) return 'kick';
  if (command.includes('4')) return 'special';
  if (command.includes('2')) return 'heavy';
  return 'jab';
}

function parseNotationTokens(command: string): string[] {
  return command.split(/([,+~<:_\[\]*])/).filter(Boolean);
}

function readAnimationOverrides(): AnimationOverrideMap {
  try {
    const raw = window.localStorage.getItem(ANIMATION_STORAGE_KEY);
    debugLog(1, 'storage read', { key: ANIMATION_STORAGE_KEY, hasRawValue: Boolean(raw) });
    if (!raw) return {};
    const stored = JSON.parse(raw) as StoredAnimationOverrides | AnimationOverrideMap | Record<string, Record<string, string[]>>;
    if ('revision' in stored) {
      const revisionMatches = stored.revision === ANIMATION_DEFAULTS_REVISION;
      debugLog(1, 'revisioned storage parsed', {
        storedRevision: stored.revision,
        expectedRevision: ANIMATION_DEFAULTS_REVISION,
        revisionMatches,
        characterIds: Object.keys(stored.overrides ?? {})
      });
      return revisionMatches ? sanitizeAnimationOverrides(stored.overrides as AnimationOverrideMap) : {};
    }
    const parsed = stored as AnimationOverrideMap | Record<string, Record<string, string[]>>;
    return sanitizeAnimationOverrides(Object.fromEntries(
      Object.entries(parsed).map(([characterId, override]) => {
        if ('frames' in override || 'speeds' in override) return [characterId, override];
        return [characterId, { frames: override as Record<string, string[]> }];
      })
    ) as AnimationOverrideMap);
  } catch {
    return {};
  }
}

function sanitizeAnimationOverrides(overrides: AnimationOverrideMap): AnimationOverrideMap {
  const next: AnimationOverrideMap = {};
  for (const [characterId, override] of Object.entries(overrides)) {
    const sanitized: CharacterAnimationOverride = {
      frames: canonicalizeRawButtonRecord({ ...(override.frames ?? {}) }),
      speeds: canonicalizeRawButtonRecord({ ...(override.speeds ?? {}) }),
      moves: sanitizeMoveOverrideMap(override.moves ?? {}),
      sprites: sanitizeSpriteFrameEditMap(override.sprites ?? {})
    };
    if (override.effects) sanitized.effects = sanitizeEffects(override.effects);
    if (override.moveEffects) sanitized.moveEffects = sanitizeMoveEffects(canonicalizeRawButtonRecord(override.moveEffects));
    next[characterId] = sanitized;
  }

  const obsoleteNarutoForward = next.kiro?.frames?.walkForward?.map(getFrameIndex).join(',');
  if (obsoleteNarutoForward === '191,192,193,194,195,196,197') {
    debugLog(5, 'removed obsolete Naruto forward override', { obsoleteNarutoForward });
    delete next.kiro?.frames?.walkForward;
    delete next.kiro?.speeds?.walkForward;
  }

  const sanitized = Object.fromEntries(
    Object.entries(next).filter(
      ([, override]) =>
        Object.keys(override.frames ?? {}).length > 0 ||
        Object.keys(override.speeds ?? {}).length > 0 ||
        Object.keys(override.moves ?? {}).length > 0 ||
        Object.keys(override.sprites ?? {}).length > 0 ||
        override.effects !== undefined ||
        override.moveEffects !== undefined
    )
  );
  debugLog(5, 'sanitized animation overrides', {
    beforeCharacterIds: Object.keys(overrides),
    afterCharacterIds: Object.keys(sanitized)
  });
  return sanitized;
}

function sanitizeMoveOverrideMap(overrides: Record<string, MoveOverride>) {
  return canonicalizeRawButtonRecord(Object.fromEntries(
    Object.entries(overrides)
      .filter(([key, value]) => key.length > 0 && value && typeof value === 'object')
      .map(([key, value]) => [key, sanitizeMoveOverride(value)])
  ));
}

function sanitizeMoveOverride(override: MoveOverride): MoveOverride {
  const next: MoveOverride = {};
  const numericKeys: Array<keyof MoveOverride> = [
    'startupFrames',
    'activeFrames',
    'recoveryFrames',
    'damage',
    'blockDamage',
    'onBlockFrames',
    'onHitFrames',
    'onCounterHitFrames',
    'whiffRecoveryFrames',
    'range',
    'forwardForce',
    'forwardForceStartFrame',
    'forwardForceEndFrame',
    'pushback',
    'blockPushback',
    'launchHeight',
    'launchVelocity',
    'juggleRefloatVelocity',
    'juggleGravityScale',
    'armorStartFrame',
    'armorEndFrame'
  ];
  for (const key of numericKeys) {
    const value = override[key];
    if (Number.isFinite(value)) {
      (next as Record<string, number>)[key] = Number(value);
    }
  }
  if (override.label) next.label = override.label;
  if (override.hitLevel && hitLevelOptions.includes(override.hitLevel)) next.hitLevel = override.hitLevel;
  if (override.tracking && trackingOptions.includes(override.tracking)) next.tracking = override.tracking;
  if (typeof override.knockdown === 'boolean') next.knockdown = override.knockdown;
  if (typeof override.tornado === 'boolean') next.tornado = override.tornado;
  if (Array.isArray(override.cancelWindows)) next.cancelWindows = override.cancelWindows;
  return next;
}

function sanitizeSpriteFrameEditMap(edits: Record<string, SpriteFrameEdit>) {
  return Object.fromEntries(
    Object.entries(edits)
      .filter(([key, value]) => /^\d+$/.test(key) && value && typeof value === 'object')
      .map(([key, value]) => [key, sanitizeSpriteFrameEdit(value)])
  );
}

function sanitizeSpriteFrameEdit(edit: SpriteFrameEdit): SpriteFrameEdit {
  const x1 = Math.max(0, Math.round(Number(edit.box?.[0] ?? 0)));
  const y1 = Math.max(0, Math.round(Number(edit.box?.[1] ?? 0)));
  const x2 = Math.max(x1 + 1, Math.round(Number(edit.box?.[2] ?? x1 + 32)));
  const y2 = Math.max(y1 + 1, Math.round(Number(edit.box?.[3] ?? y1 + 32)));
  const rotation = normalizeRotation(edit.rotation ?? 0);
  const sourceMode = edit.sourceMode === 'replacement' ? 'replacement' : 'sheet';
  const offset: [number, number] = Array.isArray(edit.offset)
    ? [Math.round(Number(edit.offset[0]) || 0), Math.round(Number(edit.offset[1]) || 0)]
    : [0, 0];
  return {
    index: Math.max(0, Math.round(Number(edit.index) || 0)),
    path: edit.path,
    sourceMode,
    sheetId: edit.sheetId,
    sheetPath: edit.sheetPath,
    sourceName: edit.sourceName,
    replacementName: sourceMode === 'replacement' && edit.replacementName ? String(edit.replacementName).slice(0, 120) : undefined,
    replacementWidth: sourceMode === 'replacement' ? Math.max(1, Math.round(Number(edit.replacementWidth) || Number(edit.width) || x2 - x1)) : undefined,
    replacementHeight: sourceMode === 'replacement' ? Math.max(1, Math.round(Number(edit.replacementHeight) || Number(edit.height) || y2 - y1)) : undefined,
    box: [x1, y1, x2, y2],
    width: Math.max(1, Math.round(Number(edit.width) || x2 - x1)),
    height: Math.max(1, Math.round(Number(edit.height) || y2 - y1)),
    row: Number.isFinite(edit.row) ? Math.round(Number(edit.row)) : undefined,
    rotation,
    offset,
    scale: Math.max(0.25, Math.min(4, Number(edit.scale) || 1)),
    hidden: Boolean(edit.hidden),
    revision: Number.isFinite(edit.revision) ? Math.max(0, Math.round(Number(edit.revision))) : undefined
  };
}

function normalizeRotation(value: number) {
  return ((Math.round(value / 90) * 90) % 360 + 360) % 360;
}

function applyAnimationOverrides(characters: CharacterDefinition[], overrides: AnimationOverrideMap) {
  const sanitizedOverrides = sanitizeAnimationOverrides(overrides);
  const effectiveCharacters = characters.map((character) => {
    const characterOverrides = sanitizedOverrides[character.id];
    if (!characterOverrides) return character;
    return applyCharacterAnimationOverride(character, characterOverrides);
  });
  debugLog(3, 'effective roster built', {
    source: characters.map((character) => ({
      id: character.id,
      walkForward: character.animationFrames?.walkForward?.map(getFrameIndex),
      walkForwardFps: character.animationFrameRates?.walkForward ?? character.animationFps
    })),
    effective: effectiveCharacters.map((character) => ({
      id: character.id,
      walkForward: character.animationFrames?.walkForward?.map(getFrameIndex),
      walkForwardFps: character.animationFrameRates?.walkForward ?? character.animationFps
    })),
    overrideCharacterIds: Object.keys(sanitizedOverrides)
  });
  return effectiveCharacters;
}

function applyCharacterAnimationOverride(character: CharacterDefinition, override: CharacterAnimationOverride): CharacterDefinition {
  const frames = canonicalizeRawButtonRecord(override.frames ?? {});
  const speeds = canonicalizeRawButtonRecord(override.speeds ?? {});
  const moves = sanitizeMoveOverrideMap(override.moves ?? {});
  const effects = override.effects ? sanitizeEffects(override.effects) : sanitizeEffects(character.effects ?? []);
  const moveEffects = override.moveEffects ? sanitizeMoveEffects(canonicalizeRawButtonRecord(override.moveEffects)) : {};
  const spriteOverrideIndexes = Object.keys(override.sprites ?? {})
    .map((key) => Number(key))
    .filter((index) => Number.isFinite(index) && index >= 0);
  const spriteFrameCount = Math.max(
    character.spriteFrameCount ?? 0,
    spriteOverrideIndexes.length > 0 ? Math.max(...spriteOverrideIndexes) + 1 : 0
  );
  return {
    ...character,
    spriteFrameCount,
    animationFrames: {
      ...character.animationFrames,
      ...frames
    },
    animationFrameRates: {
      ...character.animationFrameRates,
      ...speeds
    },
    moveOverrides: {
      ...character.moveOverrides,
      ...moves
    },
    effects,
    moveEffects: {
      ...sanitizeMoveEffects(character.moveEffects ?? {}),
      ...moveEffects
    },
    spriteFrameEdits: {
      ...character.spriteFrameEdits,
      ...(override.sprites ?? {})
    }
  };
}

function removeCharacterOverride(overrides: AnimationOverrideMap, characterIds: string[]) {
  const next = { ...overrides };
  characterIds.forEach((characterId) => {
    delete next[characterId];
  });
  return next;
}

async function saveCharacterManifestToDev(character: CharacterDefinition) {
  const animationFrames = canonicalizeRawButtonRecord(character.animationFrames ?? {});
  const animationFrameRates = canonicalizeRawButtonRecord(character.animationFrameRates ?? {});
  const moveOverrides = sanitizeMoveOverrideMap(character.moveOverrides ?? {});
  const effects = sanitizeEffects(character.effects ?? []);
  const moveEffects = sanitizeMoveEffects(character.moveEffects ?? {});
  const response = await fetch('/__kore/dev/save-character-manifest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: character.id,
      animationFrames,
      animationFrameRates,
      moveOverrides,
      effects,
      moveEffects,
      spriteFrameEdits: character.spriteFrameEdits ?? {},
      spriteSheets: getCharacterSpriteSheets(character),
      voxelProfile: character.voxelProfile ?? 'image-source',
      voxelFidelity: character.voxelFidelity ?? defaultVoxelFidelitySettings
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

function getFrameIndex(path: string) {
  const match = path.match(/frame-(\d+)\.png$/);
  return match ? Number(match[1]) : -1;
}

function framePath(character: CharacterDefinition, index: number) {
  return `/characters/${character.id}/frames/frame-${index.toString().padStart(3, '0')}.png`;
}

function getCharacterSpriteSheets(character: CharacterDefinition, frameCount?: number): CharacterSpriteSheet[] {
  const fallbackCount =
    frameCount ??
    character.spriteFrameCount ??
    Math.max(0, ...Object.values(character.animationFrames ?? {}).flat().map(getFrameIndex)) + 1;
  const sheets = (character.spriteSheets ?? [])
    .filter((sheet) => sheet.id && sheet.path)
    .map((sheet, index) => ({
      id: sheet.id,
      name: sheet.name || `Sheet ${index + 1}`,
      path: sheet.path,
      frameStart: Math.max(0, Math.round(sheet.frameStart)),
      frameCount: Math.max(0, Math.round(sheet.frameCount))
    }))
    .filter((sheet) => sheet.frameCount > 0);
  if (sheets.length > 0) return sheets;
  return [{
    id: 'main',
    name: 'Main Sheet',
    path: character.spriteSheetPath ?? `/characters/${character.id}/animation-sheet.png`,
    frameStart: 0,
    frameCount: Math.max(0, fallbackCount)
  }];
}

function getSpriteSheetForFrame(character: CharacterDefinition, frameIndex: number, edit?: SpriteFrameEdit, frameCount?: number): CharacterSpriteSheet {
  if (edit?.sheetId || edit?.sheetPath) {
    const sheets = getCharacterSpriteSheets(character, frameCount);
    const match = sheets.find((sheet) => sheet.id === edit.sheetId || sheet.path === edit.sheetPath);
    if (match) return match;
    return {
      id: edit.sheetId ?? 'main',
      name: edit.sourceName ?? 'Source Sheet',
      path: edit.sheetPath ?? character.spriteSheetPath ?? `/characters/${character.id}/animation-sheet.png`,
      frameStart: frameIndex,
      frameCount: 1
    };
  }
  return getCharacterSpriteSheets(character, frameCount).find((sheet) => frameIndex >= sheet.frameStart && frameIndex < sheet.frameStart + sheet.frameCount)
    ?? getCharacterSpriteSheets(character, frameCount)[0];
}

function uniqueSpriteSheetId(character: CharacterDefinition, fileName: string) {
  const base = slugifyCharacterId(fileName.replace(/\.[^.]+$/, '')) || 'sheet';
  const existing = new Set(getCharacterSpriteSheets(character).map((sheet) => sheet.id));
  let id = base;
  let suffix = 2;
  while (existing.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

const effectAnchorOptions: EffectAnchor[] = ['body', 'head', 'hands', 'feet', 'hitbox', 'world'];

function uniqueEffectId(character: CharacterDefinition, fileName: string) {
  const base = slugifyCharacterId(fileName.replace(/\.[^.]+$/, '')) || 'effect';
  const existing = new Set((character.effects ?? []).map((effect) => effect.id));
  let id = base;
  let suffix = 2;
  while (existing.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function uniqueCueId(effect: CharacterEffectDefinition) {
  const cues = effect.soundCues ?? [];
  const existing = new Set(cues.map((cue) => cue.id));
  let id = `cue-${cues.length + 1}`;
  let suffix = 2;
  while (existing.has(id)) {
    id = `cue-${cues.length + suffix}`;
    suffix += 1;
  }
  return id;
}

function uniqueMoveEffectInstanceId(instances: MoveEffectInstance[], effectId: string) {
  const existing = new Set(instances.map((instance) => instance.id));
  const base = `${effectId}-fx`;
  let id = base;
  let suffix = 2;
  while (existing.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeVoxelFidelity(settings?: VoxelFidelitySettings): Required<VoxelFidelitySettings> {
  const lod = settings?.lod ?? {};
  const defaultMobileStep = defaultVoxelFidelitySettings.lod.mobileStep ?? 2;
  const defaultFarStep = defaultVoxelFidelitySettings.lod.farStep ?? 2;
  return {
    resolutionScale: Math.max(1, Math.min(4, Number(settings?.resolutionScale) || defaultVoxelFidelitySettings.resolutionScale)),
    maxRows: Math.max(24, Math.min(96, Math.round(Number(settings?.maxRows) || defaultVoxelFidelitySettings.maxRows))),
    depth: Math.max(0.08, Math.min(0.5, Number(settings?.depth) || defaultVoxelFidelitySettings.depth)),
    alphaThreshold: Math.max(1, Math.min(254, Math.round(Number(settings?.alphaThreshold) || defaultVoxelFidelitySettings.alphaThreshold))),
    paletteSnap: Math.max(1, Math.min(32, Math.round(Number(settings?.paletteSnap) || defaultVoxelFidelitySettings.paletteSnap))),
    mergeRuns: settings?.mergeRuns !== false,
    lod: {
      mobileStep: Math.max(1, Math.min(4, Math.round(Number(lod.mobileStep) || defaultMobileStep))),
      farStep: Math.max(1, Math.min(4, Math.round(Number(lod.farStep) || defaultFarStep)))
    }
  };
}

async function saveHdVoxelsToDev(character: CharacterDefinition, onProgress?: (completed: number, total: number) => void) {
  const frameCount =
    character.spriteFrameCount ??
    Math.max(0, ...Object.values(character.animationFrames ?? {}).flat().map(getFrameIndex)) + 1;
  const fidelity = normalizeVoxelFidelity(character.voxelFidelity);
  const frames: Array<{ frameIndex: number; payload: HdVoxelPayload }> = [];
  for (let index = 0; index < frameCount; index += 1) {
    const frameEdit = character.spriteFrameEdits?.[String(index)];
    frames.push({
      frameIndex: index,
      payload: await buildHdVoxelPayload(framePath(character, index), fidelity, framePath(character, index), getSpriteFrameVoxelSizing(frameEdit))
    });
    onProgress?.(index + 1, frameCount);
  }
  await saveHdVoxelFramesToDev(character, frames, fidelity);
}

async function saveHdVoxelFramesToDev(
  character: CharacterDefinition,
  frames: Array<{ frameIndex: number; payload: HdVoxelPayload }>,
  fidelity = normalizeVoxelFidelity(character.voxelFidelity)
) {
  const response = await fetch('/__kore/dev/save-hd-voxels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      characterId: character.id,
      voxelProfile: 'hd-image-source',
      voxelFidelity: fidelity,
      frames
    })
  });
  if (!response.ok) throw new Error(await response.text());
}

function getSpriteFrameVoxelSizing(edit?: SpriteFrameEdit): HdVoxelBuildSizing {
  if (!edit) return {};
  const sourceHeight = edit.sourceMode === 'replacement'
    ? Math.max(1, Math.round(edit.replacementHeight ?? edit.height ?? 1))
    : Math.max(1, Math.round((edit.box?.[3] ?? edit.height ?? 1) - (edit.box?.[1] ?? 0)));
  const outputHeight = Math.max(1, Math.round(edit.height || sourceHeight));
  const drawScale = Math.max(0.25, Number(edit.scale) || 1);
  const canvasScale = outputHeight / sourceHeight;
  const modelHeightScale = Math.max(1, drawScale, canvasScale);
  return {
    modelHeightScale: Math.min(2.35, modelHeightScale),
    baselineForegroundHeight: sourceHeight
  };
}

async function buildHdVoxelPayload(
  src: string,
  fidelity: Required<VoxelFidelitySettings>,
  sourceFrame = src,
  sizing: HdVoxelBuildSizing = {}
): Promise<HdVoxelPayload> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return emptyHdVoxelPayload(src, canvas.width, canvas.height, 1);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const background = averageImageCornerColor(imageData);
  const bounds = getHdForegroundBounds(imageData, background, fidelity.alphaThreshold);
  if (!bounds) return emptyHdVoxelPayload(src, canvas.width, canvas.height, 1);

  const bboxWidth = bounds.maxX - bounds.minX + 1;
  const bboxHeight = bounds.maxY - bounds.minY + 1;
  const targetRows = Math.max(24, Math.min(128, Math.round(fidelity.maxRows * fidelity.resolutionScale)));
  const sampleStep = Math.max(1, Math.ceil(bboxHeight / targetRows));
  const rows = Math.max(1, Math.ceil(bboxHeight / sampleStep));
  const columns = Math.max(1, Math.ceil(bboxWidth / sampleStep));
  const aspect = bboxWidth / bboxHeight;
  const maxModelWidth = 2.65;
  const baseModelHeight = Math.min(2.08, maxModelWidth / aspect);
  const baselineForegroundHeight = Math.max(1, sizing.baselineForegroundHeight ?? bboxHeight);
  const foregroundHeightScale = bboxHeight / baselineForegroundHeight;
  const modelHeightScale = Math.min(2.35, Math.max(1, sizing.modelHeightScale ?? 1, foregroundHeightScale));
  const modelHeight = baseModelHeight * modelHeightScale;
  const modelWidth = modelHeight * aspect;
  const cellWidth = modelWidth / columns;
  const cellHeight = modelHeight / rows;
  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  const cells: Array<HdVoxelRun & { row: number; column: number }> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sample = sampleHdVoxelCell(imageData, bounds, background, fidelity, column, row, columns, rows);
      if (!sample) continue;
      const colorIndex = getPaletteIndex(sample.color, palette, paletteIndex);
      const sideColorIndex = getPaletteIndex(sample.sideColor, palette, paletteIndex);
      const x = ((column + 0.5) / columns) * modelWidth - modelWidth / 2;
      const y = modelHeight - (row + 0.5) * cellHeight + 0.02;
      cells.push({
        row,
        column,
        part: classifyHdVoxelPart(row / rows, (column + 0.5) / columns - 0.5),
        x: roundVoxelNumber(x),
        y: roundVoxelNumber(y),
        z: sample.brightness > 150 ? 0.018 : -0.012,
        w: roundVoxelNumber(cellWidth * 0.98),
        h: roundVoxelNumber(cellHeight * 0.98),
        d: roundVoxelNumber(fidelity.depth * (0.78 + sample.foregroundRatio * 0.22)),
        c: colorIndex,
        s: sideColorIndex
      });
    }
  }

  return {
    format: 'kore-hd-voxels-v1',
    palette,
    voxels: fidelity.mergeRuns ? mergeHdVoxelRuns(cells, cellWidth) : cells.map(({ row: _row, column: _column, ...cell }) => cell),
    source: {
      frame: sourceFrame,
      width: canvas.width,
      height: canvas.height,
      sampleStep,
      foregroundWidth: bboxWidth,
      foregroundHeight: bboxHeight,
      baselineForegroundHeight,
      modelHeight: roundVoxelNumber(modelHeight),
      modelHeightScale: roundVoxelNumber(modelHeightScale)
    }
  };
}

function emptyHdVoxelPayload(frame: string, width: number, height: number, sampleStep: number): HdVoxelPayload {
  return {
    format: 'kore-hd-voxels-v1',
    palette: [],
    voxels: [],
    source: { frame, width, height, sampleStep }
  };
}

function averageImageCornerColor(imageData: ImageData): [number, number, number] {
  const { width, height, data } = imageData;
  const points = [
    [1, 1],
    [Math.max(0, width - 2), 1],
    [1, Math.max(0, height - 2)],
    [Math.max(0, width - 2), Math.max(0, height - 2)]
  ];
  const total = points.reduce(
    (sum, [x, y]) => {
      const offset = (y * width + x) * 4;
      return [sum[0] + data[offset], sum[1] + data[offset + 1], sum[2] + data[offset + 2]];
    },
    [0, 0, 0]
  );
  return [total[0] / points.length, total[1] / points.length, total[2] / points.length];
}

function getHdForegroundBounds(imageData: ImageData, background: [number, number, number], alphaThreshold: number) {
  const { width, height, data } = imageData;
  const bounds = { minX: width, minY: height, maxX: 0, maxY: 0 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!isHdForegroundPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3], background, alphaThreshold)) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY ? bounds : null;
}

function sampleHdVoxelCell(
  imageData: ImageData,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  background: [number, number, number],
  fidelity: Required<VoxelFidelitySettings>,
  column: number,
  row: number,
  columns: number,
  rows: number
) {
  const { width, data } = imageData;
  const cellMinX = Math.floor(bounds.minX + ((bounds.maxX - bounds.minX + 1) * column) / columns);
  const cellMaxX = Math.min(bounds.maxX, Math.floor(bounds.minX + ((bounds.maxX - bounds.minX + 1) * (column + 1)) / columns));
  const cellMinY = Math.floor(bounds.minY + ((bounds.maxY - bounds.minY + 1) * row) / rows);
  const cellMaxY = Math.min(bounds.maxY, Math.floor(bounds.minY + ((bounds.maxY - bounds.minY + 1) * (row + 1)) / rows));
  let foreground = 0;
  let samples = 0;
  const colorVotes = new Map<string, number>();
  let brightness = 0;

  for (let y = cellMinY; y <= cellMaxY; y += 1) {
    for (let x = cellMinX; x <= cellMaxX; x += 1) {
      const offset = (y * width + x) * 4;
      samples += 1;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      if (!isHdForegroundPixel(red, green, blue, alpha, background, fidelity.alphaThreshold)) continue;
      const color = quantizeHdColor(red, green, blue, fidelity.paletteSnap);
      foreground += 1;
      brightness += (red + green + blue) / 3;
      colorVotes.set(color, (colorVotes.get(color) ?? 0) + 1);
    }
  }

  const foregroundRatio = samples > 0 ? foreground / samples : 0;
  if (foregroundRatio < 0.12 || foreground === 0) return null;
  const color = [...colorVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff';
  return {
    color,
    sideColor: color,
    brightness: brightness / foreground,
    foregroundRatio
  };
}

function isHdForegroundPixel(red: number, green: number, blue: number, alpha: number, background: [number, number, number], alphaThreshold: number) {
  if (alpha < alphaThreshold) return false;
  if (alpha >= 250) return true;
  const blueScreen = blue > 150 && blue > red * 1.45 && blue > green * 1.1;
  const purpleScreen = blue > 120 && red > 90 && green < 140 && Math.abs(red - blue) < 95;
  if (blueScreen || purpleScreen) return false;
  const distance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
  return alpha > 220 || distance > 58;
}

function quantizeHdColor(red: number, green: number, blue: number, snap: number) {
  const quantize = (value: number) => Math.max(0, Math.min(255, Math.round(value / snap) * snap));
  return `#${[quantize(red), quantize(green), quantize(blue)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function getPaletteIndex(color: string, palette: string[], paletteIndex: Map<string, number>) {
  const existing = paletteIndex.get(color);
  if (existing !== undefined) return existing;
  const nextIndex = palette.length;
  palette.push(color);
  paletteIndex.set(color, nextIndex);
  return nextIndex;
}

function mergeHdVoxelRuns(cells: Array<HdVoxelRun & { row: number; column: number }>, cellWidth: number): HdVoxelRun[] {
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.column - b.column);
  const merged: HdVoxelRun[] = [];
  let run: (HdVoxelRun & { row: number; column: number; count: number }) | null = null;
  const flush = () => {
    if (!run) return;
    const { row: _row, column: _column, count, ...voxel } = run;
    merged.push({
      ...voxel,
      x: roundVoxelNumber(run.x + ((count - 1) * cellWidth) / 2),
      w: roundVoxelNumber(run.w * count)
    });
    run = null;
  };

  for (const cell of sorted) {
    const canMerge =
      run &&
      run.row === cell.row &&
      run.column + run.count === cell.column &&
      run.part === cell.part &&
      run.c === cell.c &&
      run.s === cell.s &&
      Math.abs(run.y - cell.y) < 0.0001 &&
      Math.abs(run.z - cell.z) < 0.0001 &&
      Math.abs(run.h - cell.h) < 0.0001 &&
      Math.abs(run.d - cell.d) < 0.0001;
    if (!canMerge) {
      flush();
      run = { ...cell, count: 1 };
    } else {
      run!.count += 1;
    }
  }
  flush();
  return merged;
}

function classifyHdVoxelPart(topRatio: number, xRatio: number): HdVoxelRun['part'] {
  if (topRatio < 0.29) return 'head';
  if (topRatio > 0.58) return xRatio >= 0 ? 'leadLeg' : 'rearLeg';
  if (Math.abs(xRatio) > 0.26) return xRatio >= 0 ? 'leadArm' : 'rearArm';
  return 'torso';
}

function roundVoxelNumber(value: number) {
  return Number(value.toFixed(5));
}

function characterPortraitPath(character: CharacterDefinition) {
  return character.animationFrames?.idle?.[0] ?? framePath(character, 0);
}

function isLocalDevHost() {
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function freshAiSeed() {
  return Math.floor((Date.now() + performance.now() * 1000 + Math.random() * 1_000_000) % 1_000_000);
}

function withFreshAiSeed<T extends object>(options: T): T & { aiSeed: number } {
  return { ...options, aiSeed: freshAiSeed() };
}

function LocalBgmPlayer({
  audio,
  started,
  source,
  selectedTrackIndex,
  onTrackIndexChange
}: {
  audio: GameSettings['audio'];
  started: boolean;
  source: BgmSource | null;
  selectedTrackIndex: number;
  onTrackIndexChange?: (index: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceKeyRef = useRef<string | null>(null);
  const requestedIndexRef = useRef(-1);
  const onTrackIndexChangeRef = useRef(onTrackIndexChange);

  useEffect(() => {
    onTrackIndexChangeRef.current = onTrackIndexChange;
  }, [onTrackIndexChange]);

  const tracks = source?.tracks ?? [];
  const normalizedIndex = normalizeBgmIndex(selectedTrackIndex, tracks.length);
  const track = tracks[normalizedIndex];
  const volume = audio.muted ? 0 : clamp(audio.master * audio.music, 0, 1);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    if (!started || !source || !track?.url || volume <= 0) {
      element.pause();
      return;
    }
    element.volume = volume;
    element.loop = source.lockToTrack || tracks.length <= 1;
    if (sourceKeyRef.current !== source.key || requestedIndexRef.current !== normalizedIndex || element.src !== track.url) {
      sourceKeyRef.current = source.key;
      requestedIndexRef.current = normalizedIndex;
      element.src = track.url;
      element.currentTime = 0;
    }
    element.play().catch((error) => {
      console.warn('KORE local BGM unavailable', error);
    });
  }, [normalizedIndex, source, started, track, tracks.length, volume]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return undefined;
    const onEnded = () => {
      if (!source || source.lockToTrack || tracks.length <= 1) return;
      const nextIndex = normalizeBgmIndex(requestedIndexRef.current + 1, tracks.length);
      requestedIndexRef.current = nextIndex;
      onTrackIndexChangeRef.current?.(nextIndex);
    };
    element.addEventListener('ended', onEnded);
    return () => element.removeEventListener('ended', onEnded);
  }, [source, tracks.length]);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.volume = volume;
  }, [volume]);

  return <audio className="local-bgm-player" ref={audioRef} preload="auto" aria-hidden="true" />;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('boot');
  const [rosterResult, setRosterResult] = useState<CharacterLoadResult | null>(null);
  const [stageResult, setStageResult] = useState<StageLoadResult | null>(null);
  const [animationOverrides, setAnimationOverrides] = useState<AnimationOverrideMap>({});
  const sourceRoster = rosterResult?.characters ?? [];
  const roster = useMemo(() => applyAnimationOverrides(sourceRoster, animationOverrides), [sourceRoster, animationOverrides]);
  const stageRoster = stageResult?.stages ?? stages;
  const playableStageRoster = useMemo(() => {
    const visible = stageRoster.filter((stage) => !stage.hidden);
    return visible.length > 0 ? visible : stageRoster;
  }, [stageRoster]);
  const [p1Id, setP1Id] = useState('astra');
  const [p2Id, setP2Id] = useState('dax');
  const [stageId, setStageId] = useState(stages[0].id);
  const [mode, setMode] = useState<MatchMode>('ai');
  const [cpuDifficulty, setCpuDifficulty] = useState<CpuDifficulty>(3);
  const [settings, setSettings] = useState<GameSettings>(() => readGameSettings());
  const [onlineProfile, setOnlineProfile] = useState<OnlinePlayerProfile | null>(() => readOnlineProfile());
  const [privateRoomIntent, setPrivateRoomIntent] = useState<PrivateRoomIntent | null>(null);
  const [musicStarted, setMusicStarted] = useState(true);
  const menuHoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const menuSelectAudioRef = useRef<HTMLAudioElement | null>(null);
  const innerMenuSelectAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const menuHoverLastPlayedAtRef = useRef(0);
  const { readInputs, setVirtualAction, clearMenuInputs, getLastInput } = useControls(mode, settings.controls);

  useEffect(() => {
    debugHypotheses();
    let mounted = true;
    Promise.all([loadCharacterRoster(), loadStageRoster()]).then(([result, loadedStages]) => {
      if (!mounted) return;
      debugLog(3, 'roster result accepted by app', {
        characterIds: result.characters.map((character) => character.id),
        warnings: result.warnings
      });
      debugLog(3, 'stage roster result accepted by app', {
        stageIds: loadedStages.stages.map((stage) => stage.id),
        warnings: loadedStages.warnings
      });
      setRosterResult(result);
      setStageResult(loadedStages);
      setP1Id(result.characters[0]?.id ?? 'astra');
      setP2Id(result.characters[1]?.id ?? result.characters[0]?.id ?? 'dax');
      const firstPlayableStage = loadedStages.stages.find((stage) => !stage.hidden) ?? loadedStages.stages[0];
      setStageId(firstPlayableStage?.id ?? stages[0].id);
      window.setTimeout(() => setScreen('title'), 650);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    window.localStorage.removeItem(ANIMATION_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!isLocalDevHost() || sourceRoster.length === 0) return;
    const sanitizedOverrides = sanitizeAnimationOverrides(animationOverrides);
    const characterIds = Object.keys(sanitizedOverrides);
    if (characterIds.length === 0) return;
    const timeout = window.setTimeout(async () => {
      try {
        const sourceById = new Map(sourceRoster.map((character) => [character.id, character]));
        await Promise.all(
          characterIds.map((characterId) => {
            const sourceCharacter = sourceById.get(characterId);
            if (!sourceCharacter) return Promise.resolve();
            const effectiveCharacter = applyCharacterAnimationOverride(sourceCharacter, sanitizedOverrides[characterId]);
            return saveCharacterManifestToDev(effectiveCharacter);
          })
        );
        const result = await loadCharacterRoster();
        setRosterResult(result);
        setAnimationOverrides((current) => removeCharacterOverride(current, characterIds));
        debugLog(4, 'dev animation edits persisted to manifests', { characterIds });
      } catch (error) {
        console.error('Failed to auto-save character manifest edits', error);
      }
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [animationOverrides, sourceRoster]);

  useEffect(() => {
    writeGameSettings(settings);
  }, [settings]);

  useEffect(() => {
    const hoverAudio = new Audio(KORE_MENU_HOVER_SOUND_URL);
    const selectAudio = new Audio(KORE_MENU_SELECT_SOUND_URL);
    const innerSelectAudio = new Audio(KORE_INNER_MENU_SELECT_SOUND_URL);
    hoverAudio.preload = 'auto';
    selectAudio.preload = 'auto';
    innerSelectAudio.preload = 'auto';
    hoverAudio.load();
    selectAudio.load();
    innerSelectAudio.load();
    preloadSfxPool(GAME_SFX_URLS);
    menuHoverAudioRef.current = hoverAudio;
    menuSelectAudioRef.current = selectAudio;
    innerMenuSelectAudioRef.current = innerSelectAudio;
    return () => {
      hoverAudio.pause();
      selectAudio.pause();
      innerSelectAudio.pause();
      if (menuHoverAudioRef.current === hoverAudio) menuHoverAudioRef.current = null;
      if (menuSelectAudioRef.current === selectAudio) menuSelectAudioRef.current = null;
      if (innerMenuSelectAudioRef.current === innerSelectAudio) innerMenuSelectAudioRef.current = null;
    };
  }, []);

  const unlockGameAudio = useCallback(() => {
    if (typeof window === 'undefined' || audioUnlockedRef.current) return;
    const audio = new Audio(KORE_MENU_SELECT_SOUND_URL);
    audio.volume = 0.001;
    audio.currentTime = 0;
    void audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
      unlockSfxPool(GAME_SFX_URLS);
      audioUnlockedRef.current = true;
    }).catch(() => {
      unlockSfxPool(GAME_SFX_URLS);
    });
  }, []);

  useEffect(() => {
    const unlock = () => unlockGameAudio();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('touchstart', unlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
      window.removeEventListener('touchstart', unlock, { capture: true });
    };
  }, [unlockGameAudio]);

  const updateBgmTrackIndex = useCallback((index: number) => {
    setSettings((current) => {
      const nextIndex = normalizeBgmIndex(index, KORE_MENU_BGM_SOURCE.tracks.length);
      if (current.audio.bgmTrackIndex === nextIndex) return current;
      return sanitizeGameSettings({
        ...current,
        audio: {
          ...current.audio,
          bgmTrackIndex: nextIndex
        }
      });
    });
  }, []);

  const playMenuHoverSound = useCallback((minimumGapMs = 120) => {
    unlockGameAudio();
    if (settings.audio.muted || settings.audio.master <= 0 || settings.audio.sfx <= 0) return;
    const now = performance.now();
    if (now - menuHoverLastPlayedAtRef.current < minimumGapMs) return;
    menuHoverLastPlayedAtRef.current = now;
    const audio = menuHoverAudioRef.current ?? new Audio(KORE_MENU_HOVER_SOUND_URL);
    menuHoverAudioRef.current = audio;
    audio.volume = clamp(settings.audio.master * settings.audio.sfx * 0.16, 0, 0.22);
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
  }, [settings.audio.master, settings.audio.muted, settings.audio.sfx, unlockGameAudio]);

  const playMenuSelectSound = useCallback(() => {
    unlockGameAudio();
    if (settings.audio.muted || settings.audio.master <= 0 || settings.audio.sfx <= 0) return;
    const audio = menuSelectAudioRef.current ?? new Audio(KORE_MENU_SELECT_SOUND_URL);
    menuSelectAudioRef.current = audio;
    audio.volume = clamp(settings.audio.master * settings.audio.sfx * 0.075, 0, 0.14);
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
  }, [settings.audio.master, settings.audio.muted, settings.audio.sfx, unlockGameAudio]);

  const playInnerMenuSelectSound = useCallback(() => {
    unlockGameAudio();
    if (settings.audio.muted || settings.audio.master <= 0 || settings.audio.sfx <= 0) return;
    const audio = innerMenuSelectAudioRef.current ?? new Audio(KORE_INNER_MENU_SELECT_SOUND_URL);
    innerMenuSelectAudioRef.current = audio;
    audio.volume = clamp(settings.audio.master * settings.audio.sfx * 0.085, 0, 0.14);
    audio.pause();
    audio.currentTime = 0;
    audio.play().catch(() => undefined);
  }, [settings.audio.master, settings.audio.muted, settings.audio.sfx, unlockGameAudio]);

  useEffect(() => {
    const onUiClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const interactive = target?.closest('button, a, [role="button"], summary');
      if (!interactive || !(interactive instanceof HTMLElement)) return;
      if (interactive.closest('[aria-hidden="true"]')) return;
      if (interactive instanceof HTMLButtonElement && interactive.disabled) return;
      if (interactive.getAttribute('aria-disabled') === 'true') return;
      if (interactive.dataset.sound === 'off') return;
      if (screen === 'menu') {
        playMenuSelectSound();
        return;
      }
      if (screen !== 'title') playInnerMenuSelectSound();
    };
    window.addEventListener('click', onUiClick, true);
    return () => window.removeEventListener('click', onUiClick, true);
  }, [playInnerMenuSelectSound, playMenuSelectSound, screen]);

  useEffect(() => {
    if (screen !== 'menu') return;
    const onMenuTrackKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key !== 'o' && key !== 'p') return;
      event.preventDefault();
      updateBgmTrackIndex(settings.audio.bgmTrackIndex + (key === 'p' ? 1 : -1));
      playMenuHoverSound(80);
    };
    window.addEventListener('keydown', onMenuTrackKeyDown);
    return () => window.removeEventListener('keydown', onMenuTrackKeyDown);
  }, [playMenuHoverSound, screen, settings.audio.bgmTrackIndex, updateBgmTrackIndex]);

  const startFromTitle = useCallback(() => {
    unlockGameAudio();
    playMenuSelectSound();
    setMusicStarted(true);
    setScreen('menu');
  }, [playMenuSelectSound, unlockGameAudio]);

  const setCharacterAnimationFrames = (characterId: string, animationKey: string, frames: string[]) => {
    debugLog(4, 'viewer frame override requested', {
      characterId,
      animationKey,
      frames: frames.map(getFrameIndex)
    });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        frames: {
          ...(current[characterId]?.frames ?? {}),
          [animationKey]: frames
        }
      }
    }));
  };

  const setCharacterAnimationSpeed = (characterId: string, animationKey: string, speed: number) => {
    debugLog(8, 'viewer speed override requested', { characterId, animationKey, speed });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        speeds: {
          ...(current[characterId]?.speeds ?? {}),
          [animationKey]: speed
        }
      }
    }));
  };

  const setCharacterMoveOverride = (characterId: string, moveKey: string, override: MoveOverride) => {
    debugLog(9, 'viewer frame data override requested', { characterId, moveKey, override });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        moves: {
          ...(current[characterId]?.moves ?? {}),
          [moveKey]: sanitizeMoveOverride(override)
        }
      }
    }));
  };

  const setCharacterSpriteFrameEdit = (characterId: string, frameIndex: number, edit: SpriteFrameEdit) => {
    debugLog(10, 'viewer sprite frame edit requested', { characterId, frameIndex, edit });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        sprites: {
          ...(current[characterId]?.sprites ?? {}),
          [String(frameIndex)]: sanitizeSpriteFrameEdit(edit)
        }
      }
    }));
  };

  const setCharacterEffects = (characterId: string, effects: CharacterEffectDefinition[], moveEffects: Record<string, MoveEffectInstance[]>) => {
    debugLog(10, 'viewer effects override requested', {
      characterId,
      effectCount: effects.length,
      moveEffectKeys: Object.keys(moveEffects)
    });
    setAnimationOverrides((current) => ({
      ...current,
      [characterId]: {
        ...(current[characterId] ?? {}),
        effects: sanitizeEffects(effects),
        moveEffects: sanitizeMoveEffects(canonicalizeRawButtonRecord(moveEffects))
      }
    }));
  };

  const reloadRoster = async (preferredCharacterId?: string) => {
    const result = await loadCharacterRoster();
    setRosterResult(result);
    if (preferredCharacterId) {
      setAnimationOverrides((current) => removeCharacterOverride(current, [preferredCharacterId]));
    }
    if (preferredCharacterId && result.characters.some((character) => character.id === preferredCharacterId)) {
      setP1Id(preferredCharacterId);
      const other = result.characters.find((character) => character.id !== preferredCharacterId);
      if (other) setP2Id(other.id);
    }
  };

  const reloadStages = async (preferredStageId?: string) => {
    const result = await loadStageRoster();
    setStageResult(result);
    const visibleStages = result.stages.filter((stage) => !stage.hidden);
    const playableStages = visibleStages.length > 0 ? visibleStages : result.stages;
    if (preferredStageId && playableStages.some((stage) => stage.id === preferredStageId)) {
      setStageId(preferredStageId);
    } else if (!playableStages.some((stage) => stage.id === stageId)) {
      setStageId(playableStages[0]?.id ?? stages[0].id);
    }
  };

  useEffect(() => {
    if (settings.display.reducedMotion) return;
    anime.remove('.screen-panel > *');
    anime({
      targets: '.screen-panel > *',
      translateY: [12, 0],
      opacity: [0, 1],
      delay: anime.stagger(70),
      duration: 460,
      easing: 'easeOutCubic'
    });
  }, [screen, settings.display.reducedMotion]);

  const p1 = roster.find((character) => character.id === p1Id) ?? roster[0];
  const p2 = roster.find((character) => character.id === p2Id) ?? roster[1] ?? roster[0];
  const selectedStage = playableStageRoster.find((stage) => stage.id === stageId) ?? playableStageRoster[0] ?? stages[0];
  const activeBgmSource = useMemo(() => {
    if (!musicStarted || screen === 'boot') return null;
    if (screen === 'fight') return stageBgmSource(selectedStage);
    if (!settings.audio.menuMusic) return null;
    if (screen === 'title') return fixedBgmSource('title:local-bgm', KORE_TITLE_BGM_TRACK);
    if (screen === 'settings') return fixedBgmSource('settings:local-bgm', KORE_OPTIONS_BGM_TRACK);
    return KORE_MENU_BGM_SOURCE;
  }, [musicStarted, screen, selectedStage, settings.audio.menuMusic]);
  const activeBgmTrackIndex = activeBgmSource?.lockToTrack
    ? activeBgmSource.trackIndex
    : normalizeBgmIndex(settings.audio.bgmTrackIndex, activeBgmSource?.tracks.length ?? 0);
  useMenuNavigation(screen);
  const handleAppMenuKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (handleMenuNavigationKeyEvent(event.nativeEvent, screen)) {
      event.stopPropagation();
    }
  }, [screen]);

  if (screen === 'boot' || !p1 || !p2) {
    return (
      <main className="app-shell boot-shell">
        <section className="boot-mark" aria-label="Loading KORE">
          <Swords size={34} />
          <h1>K.O.R.E</h1>
          <p>Loading fighters</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" onKeyDownCapture={handleAppMenuKeyDown}>
      <div className="ambient-grid" />
      <LocalBgmPlayer
        audio={settings.audio}
        started={musicStarted}
        source={activeBgmSource}
        selectedTrackIndex={activeBgmTrackIndex}
        onTrackIndexChange={activeBgmSource?.lockToTrack ? undefined : updateBgmTrackIndex}
      />
      <section className="screen-panel">
        {screen === 'title' && <TitleScreen onStart={startFromTitle} />}
        {screen === 'menu' && (
          <MenuScreen
            roster={roster}
            onMenuSelect={playMenuSelectSound}
            onMenuHover={() => playMenuHoverSound(60)}
            onArcade={() => {
              setMode('ai');
              setScreen('select');
            }}
            onVersus={() => {
              setMode('local2p');
              setScreen('select');
            }}
            onTraining={() => {
              setMode('training');
              setScreen('select');
            }}
            onOnline={() => {
              setMode('online');
              setPrivateRoomIntent(null);
              setScreen('select');
            }}
            onSettings={() => setScreen('settings')}
            onViewer={() => setScreen('viewer')}
            onStages={() => setScreen('stageEditor')}
            onExit={() => setScreen('title')}
          />
        )}
        {screen === 'leaderboard' && (
          <LeaderboardScreen
            profile={onlineProfile}
            onProfileChange={(profile) => setOnlineProfile(writeOnlineProfile(profile))}
            onFindMatch={() => {
              setMode('online');
              setScreen('select');
            }}
            onBack={() => setScreen('select')}
          />
        )}
        {screen === 'privateRooms' && (
          <PrivateRoomsScreen
            p1={p1}
            stage={selectedStage}
            roster={roster}
            stages={playableStageRoster}
            onCreate={(intent) => {
              setMode('private');
              setPrivateRoomIntent(intent);
              setScreen('fight');
            }}
            onJoin={(intent) => {
              setMode('private');
              setPrivateRoomIntent(intent);
              setScreen('fight');
            }}
            onBack={() => setScreen('select')}
          />
        )}
        {screen === 'select' && (
          <CharacterSelect
            roster={roster}
            p1Id={p1Id}
            p2Id={p2Id}
            mode={mode}
            cpuDifficulty={cpuDifficulty}
            setP1Id={setP1Id}
            setP2Id={setP2Id}
            setMode={setMode}
            setCpuDifficulty={setCpuDifficulty}
            onlineProfile={onlineProfile}
            onOnlineProfileChange={(profile) => setOnlineProfile(writeOnlineProfile(profile))}
            onLeaderboards={() => setScreen('leaderboard')}
            onPrivateRooms={() => setScreen('privateRooms')}
            onUiNavigate={playInnerMenuSelectSound}
            onBack={() => setScreen('menu')}
            onNext={() => {
              if (mode !== 'private') setPrivateRoomIntent(null);
              setScreen('stage');
            }}
          />
        )}
        {screen === 'stage' && (
          <StageSelect
            selected={stageId}
            stages={playableStageRoster}
            setSelected={setStageId}
            onBack={() => setScreen('select')}
            onFight={() => {
              if (mode === 'private' && !privateRoomIntent) {
                setPrivateRoomIntent({ kind: 'host', roomName: `${p1.displayName} Room`, password: generatePrivateRoomPassword() });
              }
              setScreen('fight');
            }}
          />
        )}
        {screen === 'stageEditor' && (
          <StageEditor
            stages={stageRoster}
            onReload={reloadStages}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'settings' && (
          <SettingsScreen
            mode={mode}
            setMode={setMode}
            cpuDifficulty={cpuDifficulty}
            setCpuDifficulty={setCpuDifficulty}
            settings={settings}
            setSettings={setSettings}
            selectedStageName={selectedStage.name}
            selectedStageBgmTitle={stageBgmTrack(selectedStage)?.title ?? selectedStage.music?.title ?? 'Local Stage Track'}
            menuBgmTrackTitle={KORE_MENU_BGM_SOURCE.tracks[normalizeBgmIndex(settings.audio.bgmTrackIndex, KORE_MENU_BGM_SOURCE.tracks.length)]?.title ?? 'No track'}
            menuBgmTrackCount={KORE_MENU_BGM_SOURCE.tracks.length}
            onMenuBgmTrackChange={updateBgmTrackIndex}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'viewer' && (
          <CharacterViewer
            roster={roster}
            sourceRoster={sourceRoster}
            onAnimationFramesChange={setCharacterAnimationFrames}
            onAnimationSpeedChange={setCharacterAnimationSpeed}
            onMoveOverrideChange={setCharacterMoveOverride}
            onSpriteFrameEditChange={setCharacterSpriteFrameEdit}
            onEffectsChange={setCharacterEffects}
            onImportComplete={reloadRoster}
            onBack={() => setScreen('menu')}
          />
        )}
        {screen === 'fight' && (
          <FightScreen
            key={`${p1.id}-${p2.id}-${selectedStage.id}-${mode}-${cpuDifficulty}`}
            p1={p1}
            p2={p2}
            stage={selectedStage}
            roster={roster}
            stages={playableStageRoster}
            mode={mode}
            cpuDifficulty={cpuDifficulty}
            settings={settings}
            readInputs={readInputs}
            setVirtualAction={setVirtualAction}
            clearMenuInputs={clearMenuInputs}
            getLastInput={getLastInput}
            onlineProfile={onlineProfile}
            privateRoomIntent={privateRoomIntent}
            onMenu={() => setScreen('menu')}
            onCharacterSelect={() => setScreen('select')}
          />
        )}
      </section>
    </main>
  );
}

type MenuNavigationDirection = 'up' | 'down' | 'left' | 'right';
type MenuNavigationDevice = 'keyboard' | 'gamepad';

const keyboardMenuNavigation: Record<string, MenuNavigationDirection | 'confirm' | 'back'> = {
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyJ: 'confirm',
  KeyK: 'back',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'back'
};

const keyboardMenuNavigationByKey: Record<string, MenuNavigationDirection | 'confirm' | 'back'> = {
  w: 'up',
  W: 'up',
  s: 'down',
  S: 'down',
  a: 'left',
  A: 'left',
  d: 'right',
  D: 'right',
  j: 'confirm',
  J: 'confirm',
  k: 'back',
  K: 'back',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'confirm',
  ' ': 'confirm',
  Escape: 'back'
};

const menuFocusableSelector = [
  'button:not(:disabled)',
  'a[href]',
  'summary',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[role="option"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function useMenuNavigation(screen: Screen) {
  const screenRef = useRef(screen);
  const lastDeviceRef = useRef<MenuNavigationDevice>('keyboard');
  const previousPadStateRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    confirm: false,
    back: false
  });

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    if (!isMenuNavigationActive(screen)) return undefined;
    const frame = window.requestAnimationFrame(() => focusDefaultMenuElement());
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (handleMenuNavigationKeyEvent(event, screenRef.current)) {
        lastDeviceRef.current = 'keyboard';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    let frame = 0;
    let lastMoveAt = 0;
    const repeatDelayMs = 170;

    const tick = () => {
      if (isMenuNavigationActive(screenRef.current)) {
        const pad = getPrimaryMenuGamepad();
        if (pad) {
          const now = performance.now();
          const current = readMenuGamepadState(pad);
          const previous = previousPadStateRef.current;
          const edge = {
            up: current.up && !previous.up,
            down: current.down && !previous.down,
            left: current.left && !previous.left,
            right: current.right && !previous.right,
            confirm: current.confirm && !previous.confirm,
            back: current.back && !previous.back
          };
          const repeatedMove = now - lastMoveAt > repeatDelayMs;
          const heldDirection = current.up ? 'up' : current.down ? 'down' : current.left ? 'left' : current.right ? 'right' : null;

          if (edge.confirm) {
            lastDeviceRef.current = 'gamepad';
            activateFocusedMenuElement();
          } else if (edge.back) {
            lastDeviceRef.current = 'gamepad';
            activateBackMenuElement();
          } else if (edge.up || edge.down || edge.left || edge.right || (heldDirection && repeatedMove)) {
            lastDeviceRef.current = 'gamepad';
            const direction = edge.up ? 'up' : edge.down ? 'down' : edge.left ? 'left' : edge.right ? 'right' : heldDirection;
            if (direction) {
              moveMenuFocus(direction);
              lastMoveAt = now;
            }
          }
          previousPadStateRef.current = current;
        } else {
          previousPadStateRef.current = { up: false, down: false, left: false, right: false, confirm: false, back: false };
        }
      }
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);
}

function handleMenuNavigationKeyEvent(event: KeyboardEvent, screen: Screen) {
  if (!isMenuNavigationActive(screen)) return false;
  if (document.querySelector('.capture')) return false;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return false;
  if (isTextEntryElement(event.target)) return false;
  const command = keyboardMenuNavigation[event.code] ?? keyboardMenuNavigationByKey[event.key];
  if (!command) return false;
  event.preventDefault();
  if (command === 'confirm') {
    activateFocusedMenuElement();
    return true;
  }
  if (command === 'back') {
    activateBackMenuElement();
    return true;
  }
  if ((command === 'left' || command === 'right') && activateFocusedDirectionalControl(command)) return true;
  moveMenuFocus(command);
  return true;
}

function isMenuNavigationActive(screen: Screen) {
  if (screen === 'boot') return false;
  if (screen === 'fight') return Boolean(document.querySelector('.pause-overlay'));
  return true;
}

function isTextEntryElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName !== 'INPUT') return false;
  const input = target as HTMLInputElement;
  const type = (input.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
}

function getPrimaryMenuGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  return pads.find((pad): pad is Gamepad => Boolean(pad?.connected)) ?? null;
}

function readMenuGamepadState(pad: Gamepad) {
  const horizontal = pad.axes[0] ?? 0;
  const vertical = pad.axes[1] ?? 0;
  return {
    up: Boolean(pad.buttons[12]?.pressed) || vertical < -0.45,
    down: Boolean(pad.buttons[13]?.pressed) || vertical > 0.45,
    left: Boolean(pad.buttons[14]?.pressed) || horizontal < -0.45,
    right: Boolean(pad.buttons[15]?.pressed) || horizontal > 0.45,
    confirm: Boolean(pad.buttons[0]?.pressed),
    back: Boolean(pad.buttons[1]?.pressed) || Boolean(pad.buttons[8]?.pressed)
  };
}

function getMenuRoot() {
  const overlay = document.querySelector<HTMLElement>('.pause-overlay');
  if (overlay) return overlay;
  return document.querySelector<HTMLElement>('.screen-panel');
}

function getMenuFocusableElements() {
  const root = getMenuRoot();
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(menuFocusableSelector)).filter(isVisibleMenuElement);
}

function focusDefaultMenuElement() {
  if (isTextEntryElement(document.activeElement)) return;
  const elements = getMenuFocusableElements();
  if (elements.length === 0) return;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (active && elements.includes(active)) return;
  const current = getCurrentMenuElement(elements);
  if (current) focusMenuElement(current, false);
}

function isVisibleMenuElement(element: HTMLElement) {
  if (element.closest('[aria-hidden="true"]')) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

function focusMenuElement(element: HTMLElement, scroll = true) {
  element.focus({ preventScroll: true });
  if (scroll) element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

function getCurrentMenuElement(elements: HTMLElement[]) {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (active && elements.includes(active)) return active;
  const selected = elements.find((element) => (
    element.matches('.is-active, .active, .is-selected, .is-picking, [aria-selected="true"], [aria-current="true"]') ||
    element.getAttribute('aria-pressed') === 'true'
  ));
  return selected ?? elements.find((element) => !isTextEntryElement(element)) ?? elements[0] ?? null;
}

function moveMenuFocus(direction: MenuNavigationDirection) {
  const elements = getMenuFocusableElements();
  if (elements.length === 0) return;
  const current = getCurrentMenuElement(elements);
  if (!current) return;
  const next = findNextMenuElement(elements, current, direction);
  if (next) focusMenuElement(next);
}

function findNextMenuElement(elements: HTMLElement[], current: HTMLElement, direction: MenuNavigationDirection) {
  const currentRect = current.getBoundingClientRect();
  const currentCenter = getRectCenter(currentRect);
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const sign = direction === 'right' || direction === 'down' ? 1 : -1;
  const candidates = elements
    .filter((element) => element !== current)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const center = getRectCenter(rect);
      const primaryDelta = axis === 'x' ? center.x - currentCenter.x : center.y - currentCenter.y;
      const crossDelta = axis === 'x' ? center.y - currentCenter.y : center.x - currentCenter.x;
      return { element, primaryDelta, crossDelta };
    })
    .filter((candidate) => candidate.primaryDelta * sign > 6)
    .sort((a, b) => {
      const aPrimary = Math.abs(a.primaryDelta);
      const bPrimary = Math.abs(b.primaryDelta);
      const aScore = aPrimary * 1.5 + Math.abs(a.crossDelta);
      const bScore = bPrimary * 1.5 + Math.abs(b.crossDelta);
      return aScore - bScore;
    });
  if (candidates[0]) return candidates[0].element;

  const ordered = [...elements].sort((a, b) => {
    const aCenter = getRectCenter(a.getBoundingClientRect());
    const bCenter = getRectCenter(b.getBoundingClientRect());
    if (axis === 'x') return sign > 0 ? aCenter.x - bCenter.x : bCenter.x - aCenter.x;
    return sign > 0 ? aCenter.y - bCenter.y : bCenter.y - aCenter.y;
  });
  return ordered.find((element) => element !== current) ?? current;
}

function getRectCenter(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function activateFocusedMenuElement() {
  const elements = getMenuFocusableElements();
  const current = getCurrentMenuElement(elements);
  if (!current) return;
  if (current instanceof HTMLInputElement && (current.type === 'range' || current.type === 'color')) return;
  current.click();
}

function activateFocusedDirectionalControl(direction: Extract<MenuNavigationDirection, 'left' | 'right'>) {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const carousel = active?.closest<HTMLElement>('.mode-carousel');
  if (!carousel) return false;
  const arrows = Array.from(carousel.querySelectorAll<HTMLButtonElement>('.mode-carousel-arrow:not(:disabled)')).filter(isVisibleMenuElement);
  const target = direction === 'left' ? arrows[0] : arrows[arrows.length - 1];
  if (!target) return false;
  target.click();
  focusMenuElement(carousel, false);
  return true;
}

function activateBackMenuElement() {
  const elements = getMenuFocusableElements();
  const root = getMenuRoot();
  if (root?.classList.contains('pause-overlay')) {
    const resumeElement = elements.find((element) => (element.textContent ?? '').trim().toLowerCase().includes('resume'));
    if (resumeElement) {
      focusMenuElement(resumeElement);
      resumeElement.click();
      return;
    }
  }
  const backElement = elements.find((element) => {
    const text = (element.textContent ?? '').trim().toLowerCase();
    const label = (element.getAttribute('aria-label') ?? '').trim().toLowerCase();
    return text === 'back' || text.endsWith(' back') || label === 'back' || label.includes('back');
  });
  if (backElement) {
    focusMenuElement(backElement);
    backElement.click();
    return;
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
}

function TitleScreen({ onStart }: { onStart: () => void }) {
  const titleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    onStart();
  };

  return (
    <div ref={titleRef} className="title-screen" tabIndex={0} onClick={onStart} onKeyDown={handleKeyDown} aria-label="KORE title screen. Press any key.">
      <img className="title-logo" src="/brand/kore-logo-generated.png" alt="KORE" />
      <span className="press-any-key">PRESS ANY KEY</span>
    </div>
  );
}

function MenuScreen({
  roster,
  onMenuSelect,
  onMenuHover,
  onArcade,
  onVersus,
  onTraining,
  onOnline,
  onSettings,
  onViewer,
  onStages,
  onExit
}: {
  roster: CharacterDefinition[];
  onMenuSelect: () => void;
  onMenuHover: () => void;
  onArcade: () => void;
  onVersus: () => void;
  onTraining: () => void;
  onOnline: () => void;
  onSettings: () => void;
  onViewer: () => void;
  onStages: () => void;
  onExit: () => void;
}) {
  const [attractIds] = useState(() => pickAttractCharacterIds(roster));
  const p1 = roster.find((character) => character.id === attractIds[0]) ?? roster[0];
  const p2 = roster.find((character) => character.id === attractIds[1]) ?? roster.find((character) => character.id !== p1?.id) ?? roster[1] ?? roster[0];
  const [attractMatch, setAttractMatch] = useState<MatchSnapshot | null>(() => (p1 && p2 ? createMatch(p1, p2, menuAttractStage, 'cpu', 4, { aiSeed: freshAiSeed() }) : null));
  const [activeMenuIndex, setActiveMenuIndex] = useState(0);
  const matchRef = useRef<MatchSnapshot | null>(attractMatch);
  const activeMenuIndexRef = useRef(0);

  useEffect(() => {
    if (!p1 || !p2) return;
    const fresh = createMatch(p1, p2, menuAttractStage, 'cpu', 4, { aiSeed: freshAiSeed() });
    matchRef.current = fresh;
    setAttractMatch(fresh);
  }, [p1, p2]);

  useEffect(() => {
    if (!p1 || !p2) return;
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / 60;

    const tick = (now: number) => {
      accumulator += Math.min(0.05, (now - last) / 1000);
      last = now;
      while (accumulator >= fixedStep) {
        const current = matchRef.current ?? createMatch(p1, p2, menuAttractStage, 'cpu', 4, { aiSeed: freshAiSeed() });
        if (current.phase !== 'fighting' || current.timer < 42 || current.fighters.some((fighter) => fighter.hp <= 0)) {
          matchRef.current = createMatch(p1, p2, menuAttractStage, 'cpu', 4, { aiSeed: freshAiSeed() });
        } else {
          matchRef.current = stepMatch(current, emptyInputFrame(), emptyInputFrame(), fixedStep);
        }
        accumulator -= fixedStep;
      }
      setAttractMatch(matchRef.current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [p1, p2]);

  const menuItems = [
    { label: 'Arcade', action: onArcade },
    { label: 'Versus', action: onVersus },
    { label: 'Training', action: onTraining },
    { label: 'Online', action: onOnline },
    { label: 'Characters', action: onViewer },
    ...(isLocalDevHost() ? [{ label: 'Stages', action: onStages }] : []),
    { label: 'Options', action: onSettings },
    { label: 'Exit', action: onExit }
  ];

  const activateMenuItem = (index: number, withSound: boolean) => {
    if (index === activeMenuIndexRef.current) return;
    activeMenuIndexRef.current = index;
    setActiveMenuIndex(index);
    if (withSound) onMenuHover();
  };

  return (
    <div className="menu-screen">
      {attractMatch && (
        <div className="menu-attract-background" aria-hidden="true">
          <MenuAttractScene match={attractMatch} />
        </div>
      )}
      <div className="menu-vignette" />
      <section className="kore-menu-overlay" aria-label="KORE main menu">
        <img className="kore-menu-logo" src="/brand/kore-logo-generated.png" alt="KORE" />
        <div className="kore-menu-version" aria-label={`KORE version ${KORE_APP_VERSION}`}>
          v{KORE_APP_VERSION}
        </div>
        <nav className="arcade-menu-list" aria-label="Main menu">
          {menuItems.map((item, index) => (
            <button
              key={item.label}
              className={index === activeMenuIndex ? 'is-active' : ''}
              data-sound="off"
              onPointerEnter={() => activateMenuItem(index, true)}
              onMouseMove={() => activateMenuItem(index, false)}
              onFocus={() => activateMenuItem(index, false)}
              onClick={() => {
                onMenuSelect();
                item.action();
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </section>
    </div>
  );
}

function pickAttractCharacterIds(roster: CharacterDefinition[]): [string, string] {
  if (roster.length === 0) return ['', ''];
  const firstIndex = Math.floor(Math.random() * roster.length);
  const first = roster[firstIndex];
  const opponents = roster.filter((character) => character.id !== first.id);
  const second = opponents.length > 0 ? opponents[Math.floor(Math.random() * opponents.length)] : first;
  return [first.id, second.id];
}

function LeaderboardScreen({
  profile,
  onProfileChange,
  onFindMatch,
  onBack
}: {
  profile: OnlinePlayerProfile | null;
  onProfileChange: (profile: Partial<OnlinePlayerProfile>) => void;
  onFindMatch: () => void;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const result = await fetchLeaderboard();
      setEntries(result.entries);
      setStatus('ready');
    } catch (error) {
      console.error('Failed to load leaderboard', error);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="leaderboard-screen">
      <header className="leaderboard-header">
        <div>
          <p className="eyebrow">Online Records</p>
          <h1>Leaderboards</h1>
        </div>
      </header>
      <div className="leaderboard-actions">
        <button className="secondary-button" onClick={load}>
          <RotateCcw size={18} />
          Refresh
        </button>
        <button className="primary-button" onClick={onFindMatch} disabled={!profile}>
          <Wifi size={18} />
          Find Match
        </button>
        <button className="secondary-button" onClick={onBack}>
          <Home size={18} />
          Back
        </button>
      </div>
      <ArcadeNameCard profile={profile} onProfileChange={onProfileChange} />
      <section className="leaderboard-board" aria-label="Online leaderboard">
        {status === 'loading' && <div className="leaderboard-empty">Loading ranks</div>}
        {status === 'error' && <div className="leaderboard-empty">Leaderboard unavailable</div>}
        {status === 'ready' && entries.length === 0 && <div className="leaderboard-empty">No records yet. Be the first name on the board.</div>}
        {status === 'ready' && entries.length > 0 && (
          <div className="leaderboard-rows">
            {entries.map((entry, index) => {
              const current = profile?.playerId === entry.playerId;
              return (
                <div key={entry.playerId} className={`leaderboard-row ${current ? 'is-you' : ''}`}>
                  <span className="rank">{index + 1}</span>
                  <strong>{entry.displayName}</strong>
                  <span>{entry.points.toLocaleString()} PTS</span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PrivateRoomsScreen({
  p1,
  stage,
  roster,
  stages,
  onCreate,
  onJoin,
  onBack
}: {
  p1: CharacterDefinition;
  stage: StageDefinition;
  roster: CharacterDefinition[];
  stages: StageDefinition[];
  onCreate: (intent: Extract<PrivateRoomIntent, { kind: 'host' }>) => void;
  onJoin: (intent: Extract<PrivateRoomIntent, { kind: 'guest' }>) => void;
  onBack: () => void;
}) {
  const [rooms, setRooms] = useState<PrivateRoomSummary[]>([]);
  const [roomName, setRoomName] = useState(`${p1.displayName} Room`.slice(0, 18));
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    setMessage('');
    try {
      const result = await listPrivateRooms();
      setRooms(result);
      setStatus('ready');
    } catch (error) {
      console.error('Failed to load private rooms', error);
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Rooms unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const createRoom = () => {
    onCreate({
      kind: 'host',
      roomName: cleanPrivateRoomName(roomName || `${p1.displayName} Room`),
      password: generatePrivateRoomPassword()
    });
  };

  const joinRoom = (roomId: string) => {
    const password = normalizePrivateRoomPassword(passwords[roomId] ?? '');
    if (!password) {
      setMessage('Enter that room password first');
      return;
    }
    onJoin({ kind: 'guest', roomId, password });
  };

  const characterName = (id: string) => roster.find((character) => character.id === id)?.displayName ?? id;
  const stageName = (id: string) => stages.find((item) => item.id === id)?.name ?? id;

  return (
    <div className="leaderboard-screen private-rooms-screen">
      <header className="leaderboard-header">
        <div>
          <p className="eyebrow">Private Match</p>
          <h1>Rooms</h1>
        </div>
      </header>

      <div className="private-room-create">
        <div>
          <span>Host Room</span>
          <strong>{p1.displayName}</strong>
          <small>{stage.name}</small>
        </div>
        <label className="arcade-name-entry">
          <input
            value={roomName}
            maxLength={18}
            placeholder="ROOM NAME"
            onChange={(event) => setRoomName(cleanPrivateRoomName(event.target.value))}
          />
          <button type="button" onClick={createRoom}>
            Create
          </button>
        </label>
      </div>

      <div className="leaderboard-actions">
        <button className="secondary-button" onClick={load}>
          <RotateCcw size={18} />
          Refresh
        </button>
        <button className="secondary-button" onClick={onBack}>
          <Home size={18} />
          Back
        </button>
      </div>

      <section className="leaderboard-board private-room-board" aria-label="Private rooms">
        {message && <div className="private-room-message">{message}</div>}
        {status === 'loading' && <div className="leaderboard-empty">Loading rooms</div>}
        {status === 'error' && <div className="leaderboard-empty">Private rooms unavailable</div>}
        {status === 'ready' && rooms.length === 0 && <div className="leaderboard-empty">No open rooms. Create one and share the password.</div>}
        {status === 'ready' && rooms.length > 0 && (
          <div className="private-room-rows">
            {rooms.map((room) => (
              <article key={room.roomId} className="private-room-row">
                <div>
                  <strong>{room.roomName}</strong>
                  <span>{characterName(room.hostCharacterId)} / {stageName(room.stageId)}</span>
                </div>
                <label className="private-room-password">
                  <span>Password</span>
                  <input
                    value={passwords[room.roomId] ?? ''}
                    maxLength={16}
                    placeholder="KORE-0000"
                    onChange={(event) => setPasswords((current) => ({ ...current, [room.roomId]: normalizePrivateRoomPassword(event.target.value) }))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        joinRoom(room.roomId);
                      }
                    }}
                  />
                </label>
                <button className="primary-button" onClick={() => joinRoom(room.roomId)}>
                  <Wifi size={18} />
                  Join
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function cleanPrivateRoomName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').slice(0, 18);
}

function privateRoomToOnlineResult(room: PrivateRoomResult): OnlineMatchResult {
  return {
    role: room.role,
    status: room.status,
    roomId: room.roomId,
    ownerToken: room.ownerToken,
    hostPeerId: room.hostPeerId,
    guestPeerId: room.guestPeerId,
    hostCharacterId: room.hostCharacterId,
    guestCharacterId: room.guestCharacterId,
    stageId: room.stageId
  };
}

function ArcadeNameCard({
  profile,
  onProfileChange,
  autoFocus = false
}: {
  profile: OnlinePlayerProfile | null;
  onProfileChange: (profile: Partial<OnlinePlayerProfile>) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(profile?.displayName ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(profile?.displayName ?? '');
  }, [profile?.displayName]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const save = () => {
    const displayName = sanitizeDisplayName(draft);
    if (!displayName) return;
    onProfileChange({ playerId: profile?.playerId, displayName });
  };

  return (
    <div className="arcade-name-card">
      <div>
        <span>Player Name</span>
        <strong>{profile?.displayName ?? 'ENTER NAME'}</strong>
      </div>
      <label className="arcade-name-entry">
        <input
          ref={inputRef}
          value={draft}
          maxLength={12}
          placeholder="AAA"
          onChange={(event) => setDraft(sanitizeDisplayName(event.target.value))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
          }}
        />
        <button type="button" onClick={save} disabled={!sanitizeDisplayName(draft)}>
          Enter
        </button>
      </label>
    </div>
  );
}

const characterSelectModeOptions: Array<{ mode: MatchMode; label: string; icon: ReactNode }> = [
  { mode: 'ai', label: '1P vs CPU', icon: <Gamepad2 size={18} /> },
  { mode: 'local2p', label: 'Local 2P', icon: <Users size={18} /> },
  { mode: 'training', label: 'Training', icon: <Target size={18} /> },
  { mode: 'online', label: 'Online', icon: <Wifi size={18} /> },
  { mode: 'private', label: 'Private', icon: <KeyRound size={18} /> },
  { mode: 'cpu', label: 'CPU vs CPU', icon: <Swords size={18} /> }
];

function CharacterSelect({
  roster,
  p1Id,
  p2Id,
  mode,
  cpuDifficulty,
  setP1Id,
  setP2Id,
  setMode,
  setCpuDifficulty,
  onlineProfile,
  onOnlineProfileChange,
  onLeaderboards,
  onPrivateRooms,
  onUiNavigate,
  onBack,
  onNext
}: {
  roster: CharacterDefinition[];
  p1Id: string;
  p2Id: string;
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  setP1Id: (id: string) => void;
  setP2Id: (id: string) => void;
  setMode: (mode: MatchMode) => void;
  setCpuDifficulty: (difficulty: CpuDifficulty) => void;
  onlineProfile?: OnlinePlayerProfile | null;
  onOnlineProfileChange?: (profile: Partial<OnlinePlayerProfile>) => void;
  onLeaderboards?: () => void;
  onPrivateRooms?: () => void;
  onUiNavigate: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [selectTarget, setSelectTarget] = useState<1 | 2>(1);
  const p1Character = roster.find((character) => character.id === p1Id) ?? roster[0];
  const p2Character = roster.find((character) => character.id === p2Id) ?? roster[1] ?? p1Character;
  const targetLabel = getSlotLabel(mode, selectTarget).toUpperCase();
  const assignCharacter = (id: string) => {
    if (selectTarget === 1) {
      setP1Id(id);
      return;
    }
    setP2Id(id);
  };

  if (!p1Character || !p2Character) {
    return (
      <div className="select-screen">
        <header className="section-header">
          <div>
            <span>Roster</span>
            <h2>Character Select</h2>
          </div>
        </header>
        <p>No fighters are available.</p>
        <FooterActions onBack={onBack} onNext={onBack} nextLabel="Back" />
      </div>
    );
  }

  return (
    <div className="select-screen versus-select-screen">
      <button
        type="button"
        className={`versus-hero versus-hero-left ${selectTarget === 1 ? 'is-picking' : ''}`}
        style={{ '--fighter-color': p1Character.colors.primary } as CSSProperties}
        onClick={() => setSelectTarget(1)}
      >
        <span className="versus-player-kicker">{getSlotLabel(mode, 1)}</span>
        <img src={characterPortraitPath(p1Character)} alt="" />
        <span className="versus-hero-name">{p1Character.displayName}</span>
        <span className="versus-hero-meta">{p1Character.moves.map((move) => move.label).slice(0, 3).join(' / ')}</span>
      </button>

      <section className="versus-roster-panel" aria-label="Character select">
        <div className="versus-select-top">
          <div>
            <span>Character Select</span>
            <h2>{targetLabel}</h2>
          </div>
          <div className="mode-stack">
            <CharacterSelectModeCarousel value={mode} setValue={setMode} onNavigate={onUiNavigate} />
            {usesCpuDifficulty(mode) && <CpuDifficultyControl value={cpuDifficulty} setValue={setCpuDifficulty} onNavigate={onUiNavigate} compact />}
          </div>
        </div>

        <div className="versus-target-tabs" aria-label="Choose selection target">
          <button className={selectTarget === 1 ? 'active' : ''} onClick={() => setSelectTarget(1)}>
            {getSlotShortLabel(mode, 1)}
          </button>
          <button className={selectTarget === 2 ? 'active' : ''} onClick={() => setSelectTarget(2)}>
            {getSlotShortLabel(mode, 2)}
          </button>
        </div>

        <div className="versus-roster-grid">
          {roster.map((character) => {
            const isP1 = p1Id === character.id;
            const isP2 = p2Id === character.id;
            return (
              <button
                key={character.id}
                type="button"
                className={`versus-roster-tile ${isP1 ? 'is-p1' : ''} ${isP2 ? 'is-p2' : ''}`}
                style={{ '--fighter-color': character.colors.primary } as CSSProperties}
                onClick={() => assignCharacter(character.id)}
                aria-label={`Select ${character.displayName}`}
              >
                <img src={characterPortraitPath(character)} alt="" />
                <span>{character.displayName}</span>
                <small>{isP1 ? getSlotShortLabel(mode, 1) : ''}{isP1 && isP2 ? ' / ' : ''}{isP2 ? getSlotShortLabel(mode, 2) : ''}</small>
              </button>
            );
          })}
        </div>

        {mode === 'online' && !onlineProfile && onOnlineProfileChange && (
          <ArcadeNameCard profile={onlineProfile ?? null} onProfileChange={onOnlineProfileChange} autoFocus />
        )}

        <FooterActions
          onBack={onBack}
          middleAction={
            mode === 'online' && onLeaderboards
              ? {
                label: 'Leaderboards',
                icon: <Trophy size={18} />,
                onClick: onLeaderboards
              }
              : mode === 'private' && onPrivateRooms
                ? {
                  label: 'Rooms',
                  icon: <KeyRound size={18} />,
                  onClick: onPrivateRooms
                }
                : undefined
          }
          onNext={onNext}
          nextLabel="Stage"
          nextDisabled={mode === 'online' && !onlineProfile}
        />
      </section>

      <button
        type="button"
        className={`versus-hero versus-hero-right ${selectTarget === 2 ? 'is-picking' : ''}`}
        style={{ '--fighter-color': p2Character.colors.primary } as CSSProperties}
        onClick={() => setSelectTarget(2)}
      >
        <span className="versus-player-kicker">{getSlotLabel(mode, 2)}</span>
        <img src={characterPortraitPath(p2Character)} alt="" />
        <span className="versus-hero-name">{p2Character.displayName}</span>
        <span className="versus-hero-meta">{p2Character.moves.map((move) => move.label).slice(0, 3).join(' / ')}</span>
      </button>
      <div className="versus-floor-glow" aria-hidden="true" />
    </div>
  );
}

function CharacterSelectModeCarousel({
  value,
  setValue,
  onNavigate
}: {
  value: MatchMode;
  setValue: (mode: MatchMode) => void;
  onNavigate?: () => void;
}) {
  const activeIndex = Math.max(0, characterSelectModeOptions.findIndex((option) => option.mode === value));
  const activeOption = characterSelectModeOptions[activeIndex] ?? characterSelectModeOptions[0];
  const cycleMode = (direction: -1 | 1, withSound = true) => {
    const nextIndex = (activeIndex + direction + characterSelectModeOptions.length) % characterSelectModeOptions.length;
    const next = characterSelectModeOptions[nextIndex];
    if (!next) return;
    if (withSound) onNavigate?.();
    setValue(next.mode);
  };

  return (
    <div
      className="mode-carousel"
      role="group"
      aria-label="Match mode"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          cycleMode(-1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          cycleMode(1);
        }
      }}
    >
      <button type="button" className="mode-carousel-arrow" onClick={() => cycleMode(-1, false)} aria-label="Previous match mode">
        <ChevronLeft size={26} />
      </button>
      <div className="mode-carousel-current" aria-live="polite">
        {activeOption.icon}
        <strong>{activeOption.label}</strong>
      </div>
      <button type="button" className="mode-carousel-arrow" onClick={() => cycleMode(1, false)} aria-label="Next match mode">
        <ChevronRight size={26} />
      </button>
    </div>
  );
}

function RoundTimerControl({ value, setValue }: { value: number; setValue: (value: number) => void }) {
  const cycleTimer = (direction: -1 | 1) => {
    const next = Math.min(99, Math.max(30, value + direction * 5));
    if (next !== value) setValue(next);
  };

  return (
    <div
      className="mode-carousel round-timer-carousel"
      role="group"
      aria-label="Round timer"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          cycleTimer(-1);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          cycleTimer(1);
        }
      }}
    >
      <button type="button" className="mode-carousel-arrow" onClick={() => cycleTimer(-1)} aria-label="Lower round timer">
        <ChevronLeft size={24} />
      </button>
      <div className="mode-carousel-current" aria-live="polite">
        <Timer size={22} />
        <strong>{value}s</strong>
      </div>
      <button type="button" className="mode-carousel-arrow" onClick={() => cycleTimer(1)} aria-label="Raise round timer">
        <ChevronRight size={24} />
      </button>
    </div>
  );
}

function CpuDifficultyControl({
  value,
  setValue,
  onNavigate,
  compact = false
}: {
  value: CpuDifficulty;
  setValue: (difficulty: CpuDifficulty) => void;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const update = (rawValue: string) => {
    const next = Math.min(5, Math.max(1, Number(rawValue))) as CpuDifficulty;
    setValue(next);
  };
  const cycleDifficulty = (direction: -1 | 1, withSound = true) => {
    const next = Math.min(5, Math.max(1, value + direction)) as CpuDifficulty;
    if (next === value) return;
    if (withSound) onNavigate?.();
    setValue(next);
  };

  if (compact) {
    return (
      <div
        className="mode-carousel cpu-difficulty-carousel"
        role="group"
        aria-label="CPU difficulty"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            cycleDifficulty(-1);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            cycleDifficulty(1);
          }
        }}
      >
        <button type="button" className="mode-carousel-arrow" onClick={() => cycleDifficulty(-1, false)} aria-label="Lower CPU difficulty">
          <ChevronLeft size={24} />
        </button>
        <div className="mode-carousel-current" aria-live="polite">
          <Swords size={22} />
          <strong>{cpuDifficultyLabels[value]}</strong>
        </div>
        <button type="button" className="mode-carousel-arrow" onClick={() => cycleDifficulty(1, false)} aria-label="Raise CPU difficulty">
          <ChevronRight size={24} />
        </button>
      </div>
    );
  }

  return (
    <label className="cpu-difficulty">
      <span>CPU Difficulty</span>
      <div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          onChange={(event) => update(event.target.value)}
          aria-label="CPU difficulty"
        />
        <strong>{cpuDifficultyLabels[value]}</strong>
      </div>
    </label>
  );
}

function getSlotLabel(mode: MatchMode, slot: 1 | 2) {
  if (mode === 'cpu') return slot === 1 ? 'CPU 1' : 'CPU 2';
  if (mode === 'online') return slot === 1 ? 'You' : 'Opponent';
  if (mode === 'private') return slot === 1 ? 'You' : 'Private Guest';
  if (slot === 2 && mode === 'training') return 'Dummy';
  if (slot === 2 && mode === 'ai') return 'CPU';
  return slot === 1 ? 'Player 1' : 'Player 2';
}

function getSlotShortLabel(mode: MatchMode, slot: 1 | 2) {
  if (mode === 'cpu') return slot === 1 ? 'CPU 1' : 'CPU 2';
  if (mode === 'online') return slot === 1 ? 'YOU' : 'ONLINE';
  if (mode === 'private') return slot === 1 ? 'YOU' : 'GUEST';
  if (slot === 2 && mode === 'training') return 'Dummy';
  if (slot === 2 && mode === 'ai') return 'CPU';
  return slot === 1 ? 'P1' : 'P2';
}

function usesCpuDifficulty(mode: MatchMode) {
  return mode === 'ai' || mode === 'cpu';
}

function StageSelect({
  selected,
  stages,
  setSelected,
  onBack,
  onFight
}: {
  selected: string;
  stages: StageDefinition[];
  setSelected: (id: string) => void;
  onBack: () => void;
  onFight: () => void;
}) {
  const selectedStage = stages.find((stage) => stage.id === selected) ?? stages[0];

  return (
    <div className="stage-screen">
      <header className="stage-select-header">
        <h2>Stage Select</h2>
      </header>

      <section
        className="stage-hero"
        style={{ '--stage-color': selectedStage.rail, '--stage-floor': selectedStage.floor } as CSSProperties}
        aria-label={`${selectedStage.name} selected stage preview`}
      >
        <div className="stage-hero-preview">
          <StagePreviewCanvas stage={selectedStage} />
        </div>
        <div className="stage-hero-label">
          <strong>{selectedStage.name}</strong>
          <small>{selectedStage.subtitle}</small>
        </div>
      </section>

      <div className="stage-thumbnail-grid" aria-label="Stage choices">
        {stages.map((stage) => (
          <button
            key={stage.id}
            className={`stage-thumbnail ${selected === stage.id ? 'is-selected' : ''}`}
            style={{ '--stage-color': stage.rail, '--stage-floor': stage.floor } as CSSProperties}
            onClick={() => setSelected(stage.id)}
            aria-label={`Select ${stage.name}`}
          >
            <span className="stage-thumbnail-flag" aria-hidden="true">
              {selected === stage.id ? '1P' : ''}
            </span>
            <span className="stage-preview" data-testid={`stage-preview-${stage.id}`}>
              <StagePreviewCanvas stage={stage} />
            </span>
            <strong>{stage.name}</strong>
          </button>
        ))}
      </div>

      <FooterActions onBack={onBack} onNext={onFight} nextLabel="Fight" />
    </div>
  );
}

type StagePieceDraft = {
  id: string;
  name: string;
  dataUrl: string;
  box: [number, number, number, number];
  width: number;
  height: number;
};

type StageImportDraft = {
  id: string;
  name: string;
  subtitle: string;
  floor: string;
  rail: string;
  light: string;
};

function StageEditor({
  stages,
  onReload,
  onBack
}: {
  stages: StageDefinition[];
  onReload: (preferredStageId?: string) => Promise<void>;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'edit' | 'import'>('edit');
  const [selectedStageId, setSelectedStageId] = useState(stages[0]?.id ?? '');
  const [editableStage, setEditableStage] = useState<StageDefinition>(stages[0] ?? defaultStageDraft());
  const [selectedPropId, setSelectedPropId] = useState('');
  const [draft, setDraft] = useState<StageImportDraft>(() => randomStageDraft());
  const [sourceDataUrl, setSourceDataUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [pieces, setPieces] = useState<StagePieceDraft[]>([]);
  const [importStage, setImportStage] = useState<StageDefinition | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'ready' | 'saving' | 'saved' | 'error'>('idle');
  const [showStageControls, setShowStageControls] = useState(true);

  useEffect(() => {
    const next = stages.find((stage) => stage.id === selectedStageId) ?? stages[0] ?? defaultStageDraft();
    setEditableStage(next);
    setSelectedPropId(next.props?.[0]?.id ?? '');
  }, [selectedStageId, stages]);

  const selectedProp = editableStage.props?.find((prop) => prop.id === selectedPropId) ?? editableStage.props?.[0];

  const updateSelectedProp = (patch: Partial<StagePropDefinition>) => {
    if (!selectedProp) return;
    setEditableStage((current) => ({
      ...current,
      props: (current.props ?? []).map((prop) => prop.id === selectedProp.id ? { ...prop, ...patch } : prop)
    }));
  };

  const duplicateSelectedProp = () => {
    if (!selectedProp) return;
    const copy: StagePropDefinition = {
      ...selectedProp,
      id: `${selectedProp.id}-copy-${Date.now().toString(36)}`,
      name: `${selectedProp.name} Copy`,
      position: [selectedProp.position[0] + 0.55, selectedProp.position[1], selectedProp.position[2]]
    };
    setEditableStage((current) => ({ ...current, props: [...(current.props ?? []), copy] }));
    setSelectedPropId(copy.id);
  };

  const addStageProp = () => {
    const imagePath = editableStage.thumbnailPath ?? editableStage.backgroundLayers?.[0]?.imagePath ?? editableStage.sourcePath;
    if (!imagePath) return;
    const prop: StagePropDefinition = {
      id: `prop-${Date.now().toString(36)}`,
      name: 'New Prop',
      imagePath,
      position: [0, 1, -2],
      scale: [1.5, 1.5, 1],
      opacity: 1,
      billboard: false,
      renderMode: 'voxel',
      voxelDepth: 0.16,
      voxelScale: 4,
      hidden: false,
      locked: false
    };
    setEditableStage((current) => ({ ...current, props: [...(current.props ?? []), prop] }));
    setSelectedPropId(prop.id);
  };

  const removeSelectedProp = () => {
    if (!selectedProp) return;
    setEditableStage((current) => ({
      ...current,
      props: (current.props ?? []).filter((prop) => prop.id !== selectedProp.id)
    }));
    setSelectedPropId('');
  };

  const saveEditedStage = async () => {
    setStatus('saving');
    try {
      const response = await fetch('/__kore/dev/save-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: editableStage.id, stage: editableStage })
      });
      if (!response.ok) throw new Error(await response.text());
      setStatus('saved');
      await onReload(editableStage.id);
      window.setTimeout(() => setStatus('idle'), 1500);
    } catch (error) {
      console.error('Failed to save stage', error);
      setStatus('error');
    }
  };

  const importSource = async (file: File | undefined) => {
    if (!file) return;
    setStatus('working');
    try {
      const result = await detectStagePieces(file);
      setSourceDataUrl(result.sourceDataUrl);
      setSourceName(file.name);
      setPieces(result.pieces);
      const nextStage = buildImportedStageDraft(draft, result.pieces, result.sourceDataUrl, true);
      setImportStage(nextStage);
      setStatus('ready');
    } catch (error) {
      console.error('Failed to import stage sheet', error);
      setStatus('error');
    }
  };

  const updateDraft = (patch: Partial<StageImportDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.name && !patch.id) next.id = slugifyCharacterId(patch.name);
      if (patch.id) next.id = slugifyCharacterId(patch.id);
      if (pieces.length) setImportStage(buildImportedStageDraft(next, pieces, sourceDataUrl, true));
      return next;
    });
  };

  const saveImportedStage = async () => {
    if (!importStage || !sourceDataUrl || pieces.length === 0) return;
    setStatus('saving');
    try {
      const response = await fetch('/__kore/dev/import-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: draft.id,
          sourceDataUrl,
          sourceName,
          pieces,
          stage: buildImportedStageDraft(draft, pieces, sourceDataUrl, false)
        })
      });
      if (!response.ok) throw new Error(await response.text());
      setStatus('saved');
      await onReload(draft.id);
      setMode('edit');
      setSelectedStageId(draft.id);
    } catch (error) {
      console.error('Failed to save imported stage', error);
      setStatus('error');
    }
  };

  return (
    <div className="stage-editor-screen">
      <header className="section-header">
        <span>Local Dev</span>
        <h2>Stages</h2>
      </header>
      <div className="stage-editor-tabs">
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit Existing</button>
        <button className={mode === 'import' ? 'active' : ''} onClick={() => setMode('import')}>Import Stage</button>
      </div>

      {mode === 'edit' ? (
        <section className="stage-editor-layout is-viewport-editor">
          <main className="stage-editor-preview is-interactive">
            <StagePreviewCanvas stage={editableStage} interactive selectedPropId={selectedProp?.id} onSelectProp={setSelectedPropId} />
            <div className="stage-viewport-toolbar">
              <label>
                <span>Stage</span>
                <select value={selectedStageId} onChange={(event) => setSelectedStageId(event.target.value)}>
                  {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.hidden ? `${stage.name} (Hidden)` : stage.name}</option>)}
                </select>
              </label>
              <div className="stage-viewport-actions">
                <button
                  className="secondary-button compact-button"
                  onClick={() => setEditableStage((current) => ({ ...current, hidden: !current.hidden }))}
                >
                  {editableStage.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                  {editableStage.hidden ? 'Show Stage' : 'Hide Stage'}
                </button>
                <button className="secondary-button compact-button" onClick={() => setShowStageControls((current) => !current)}>
                  {showStageControls ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showStageControls ? 'Hide Controls' : 'Show Controls'}
                </button>
                <button className="secondary-button compact-button" onClick={addStageProp}>Add Prop</button>
                <button className="secondary-button compact-button" onClick={duplicateSelectedProp} disabled={!selectedProp}>Duplicate</button>
                <button className="secondary-button compact-button" onClick={removeSelectedProp} disabled={!selectedProp}>Remove</button>
                <button className="secondary-button compact-button dev-save-button" onClick={saveEditedStage}>
                  <Save size={14} />
                  Save Stage
                </button>
                {status !== 'idle' && <span className={`manifest-save-status is-${status}`}>{status}</span>}
              </div>
              <small>Drag to rotate. Scroll to zoom. Right-drag or shift-drag to pan. Click a prop in the world to select it.</small>
            </div>
            {showStageControls && (
              <div className="stage-viewport-props">
                {(editableStage.props ?? []).map((prop) => (
                  <button key={prop.id} className={prop.id === selectedProp?.id ? 'active' : ''} onClick={() => setSelectedPropId(prop.id)}>
                    <span>{prop.name}</span>
                    <small>{prop.hidden ? 'Hidden' : prop.billboard ? 'Billboard' : prop.renderMode === 'voxel' ? 'Voxel' : 'Plane'}</small>
                  </button>
                ))}
              </div>
            )}
            {showStageControls && selectedProp && (
              <div className="stage-viewport-inspector">
                <header>
                  <span>Selected</span>
                  <strong>{selectedProp.name}</strong>
                </header>
                <StagePropEditor prop={selectedProp} onChange={updateSelectedProp} />
              </div>
            )}
          </main>
        </section>
      ) : (
        <section className="stage-editor-layout">
          <aside className="stage-editor-panel">
            <label className="file-drop">
              <Upload size={26} />
              <strong>{sourceName || 'Choose stage spritesheet'}</strong>
              <small>{status === 'working' ? 'Cutting pieces...' : 'Auto-cut props and build a 3D arena'}</small>
              <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => importSource(event.target.files?.[0])} />
            </label>
            <div className="import-field-grid">
              <label><span>Name</span><input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} /></label>
              <label><span>ID</span><input value={draft.id} onChange={(event) => updateDraft({ id: event.target.value })} /></label>
              <label><span>Subtitle</span><input value={draft.subtitle} onChange={(event) => updateDraft({ subtitle: event.target.value })} /></label>
              <label><span>Floor</span><input type="color" value={draft.floor} onChange={(event) => updateDraft({ floor: event.target.value })} /></label>
              <label><span>Rail</span><input type="color" value={draft.rail} onChange={(event) => updateDraft({ rail: event.target.value })} /></label>
              <label><span>Light</span><input type="color" value={draft.light} onChange={(event) => updateDraft({ light: event.target.value })} /></label>
            </div>
            <div className="import-action-row">
              <button className="secondary-button" onClick={() => updateDraft(randomStageDraft())}>
                <Shuffle size={16} />
                Randomize
              </button>
              <button className="secondary-button dev-save-button" onClick={saveImportedStage} disabled={!importStage || status === 'saving'}>
                <Save size={16} />
                {status === 'saving' ? 'Saving' : 'Save Stage'}
              </button>
              {status !== 'idle' && <span className={`manifest-save-status is-${status}`}>{status}</span>}
            </div>
          </aside>
          <main className="stage-editor-preview">
            {importStage ? <StagePreviewCanvas stage={importStage} /> : <div className="stage-empty-preview">Upload a stage sheet to preview the arena.</div>}
            <div className="stage-piece-grid">
              {pieces.map((piece) => (
                <span key={piece.id}>
                  <img src={piece.dataUrl} alt={piece.name} />
                  <small>{piece.name}</small>
                </span>
              ))}
            </div>
          </main>
        </section>
      )}
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back
      </button>
    </div>
  );
}

function StagePropEditor({ prop, onChange }: { prop: StagePropDefinition; onChange: (patch: Partial<StagePropDefinition>) => void }) {
  const setPosition = (axis: 0 | 1 | 2, value: string) => {
    const next: [number, number, number] = [...prop.position] as [number, number, number];
    next[axis] = Number(value) || 0;
    onChange({ position: next });
  };
  const setScale = (axis: 0 | 1 | 2, value: string) => {
    const next: [number, number, number] = [...prop.scale] as [number, number, number];
    next[axis] = Math.max(0.05, Number(value) || 1);
    onChange({ scale: next });
  };
  return (
    <div className="stage-prop-editor">
      <FrameNumberInput label="X" value={prop.position[0]} step={0.1} onChange={(value) => setPosition(0, value)} />
      <FrameNumberInput label="Y" value={prop.position[1]} step={0.1} onChange={(value) => setPosition(1, value)} />
      <FrameNumberInput label="Z" value={prop.position[2]} step={0.1} onChange={(value) => setPosition(2, value)} />
      <FrameNumberInput label="Scale X" value={prop.scale[0]} min={0.05} step={0.05} onChange={(value) => setScale(0, value)} />
      <FrameNumberInput label="Scale Y" value={prop.scale[1]} min={0.05} step={0.05} onChange={(value) => setScale(1, value)} />
      <FrameNumberInput label="Opacity" value={prop.opacity ?? 1} min={0} step={0.05} onChange={(value) => onChange({ opacity: Math.max(0, Math.min(1, Number(value) || 0)) })} />
      <label>
        <span>Render</span>
        <select value={prop.renderMode ?? 'plane'} onChange={(event) => onChange({ renderMode: event.target.value as StagePropDefinition['renderMode'] })}>
          <option value="voxel">Voxel</option>
          <option value="plane">Plane</option>
        </select>
      </label>
      <FrameNumberInput label="Voxel Step" value={prop.voxelScale ?? 4} min={2} step={1} onChange={(value) => onChange({ voxelScale: Math.max(2, Number(value) || 4) })} />
      <FrameNumberInput label="Voxel Depth" value={prop.voxelDepth ?? 0.16} min={0.04} step={0.02} onChange={(value) => onChange({ voxelDepth: Math.max(0.04, Number(value) || 0.16) })} />
      <label className="frame-toggle"><span>Billboard</span><input type="checkbox" checked={Boolean(prop.billboard)} onChange={(event) => onChange({ billboard: event.target.checked })} /></label>
      <label className="frame-toggle"><span>Hidden</span><input type="checkbox" checked={Boolean(prop.hidden)} onChange={(event) => onChange({ hidden: event.target.checked })} /></label>
    </div>
  );
}

function defaultStageDraft(): StageDefinition {
  return {
    id: 'empty-stage',
    name: 'Empty Stage',
    subtitle: 'No stage loaded',
    renderMode: 'procedural',
    floor: '#07182c',
    rail: '#2ee6ff',
    light: '#dbe8ff'
  };
}

function randomStageDraft(): StageImportDraft {
  const names = ['Training Area', 'Forest Ring', 'Skyline Yard', 'River Dojo', 'Pixel Grove'];
  const name = `${names[Math.floor(Math.random() * names.length)]} ${Math.floor(10 + Math.random() * 90)}`;
  return {
    id: slugifyCharacterId(name),
    name,
    subtitle: 'Sprite-cutout arena',
    floor: '#2f6f3f',
    rail: '#2ee6ff',
    light: '#dbe8ff'
  };
}

async function detectStagePieces(file: File): Promise<{ sourceDataUrl: string; pieces: StagePieceDraft[] }> {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create stage canvas');
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const background = [pixels.data[0], pixels.data[1], pixels.data[2], pixels.data[3]];
  const rowHasInk = new Array(canvas.height).fill(false);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      if (isStageInkPixel(pixels.data, offset, background)) {
        rowHasInk[y] = true;
      }
    }
  }

  const rows = groupBooleanRuns(rowHasInk, 6, 8);
  const boxes: Array<{ box: [number, number, number, number]; area: number }> = [];
  rows.forEach(([rowStart, rowEnd]) => {
    const columns = new Array(canvas.width).fill(false);
    for (let y = rowStart; y <= rowEnd; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (isStageInkPixel(pixels.data, offset, background)) columns[x] = true;
      }
    }
    groupBooleanRuns(columns, 7, 8).forEach(([columnStart, columnEnd]) => {
      const box = trimStageBox(pixels.data, canvas.width, canvas.height, columnStart, rowStart, columnEnd, rowEnd, background);
      const width = box[2] - box[0];
      const height = box[3] - box[1];
      if (width >= 12 && height >= 12) boxes.push({ box, area: width * height });
    });
  });

  return {
    sourceDataUrl: canvas.toDataURL('image/png'),
    pieces: boxes
      .sort((a, b) => (a.box[1] - b.box[1]) || (a.box[0] - b.box[0]))
      .slice(0, 80)
      .map((entry, index) => {
        const width = entry.box[2] - entry.box[0];
        const height = entry.box[3] - entry.box[1];
        return {
          id: `piece-${index.toString().padStart(3, '0')}`,
          name: index === 0 ? 'Backdrop' : `Piece ${index}`,
          dataUrl: cropStagePieceDataUrl(image, entry.box, background),
          box: entry.box,
          width,
          height
        };
      })
  };
}

function isStageInkPixel(data: Uint8ClampedArray, offset: number, background: number[]) {
  const alpha = data[offset + 3];
  if (alpha <= 16) return false;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const bgDistance = Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]) + Math.abs(alpha - background[3]);
  const isMagentaMatte = red > 220 && blue > 190 && green < 80;
  const isFlatGreenMatte = green > 120 && red < 110 && blue < 130;
  return bgDistance > 34 && !isMagentaMatte && !isFlatGreenMatte;
}

function trimStageBox(data: Uint8ClampedArray, width: number, height: number, x1: number, y1: number, x2: number, y2: number, background: number[]): [number, number, number, number] {
  let left = x2;
  let top = y2;
  let right = x1;
  let bottom = y1;
  for (let y = Math.max(0, y1); y <= Math.min(height - 1, y2); y += 1) {
    for (let x = Math.max(0, x1); x <= Math.min(width - 1, x2); x += 1) {
      const offset = (y * width + x) * 4;
      if (isStageInkPixel(data, offset, background)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return [Math.max(0, left), Math.max(0, top), Math.min(width, right + 1), Math.min(height, bottom + 1)];
}

function cropStagePieceDataUrl(image: HTMLImageElement, box: [number, number, number, number], background: number[]) {
  const canvas = document.createElement('canvas');
  const width = Math.max(1, box[2] - box[0]);
  const height = Math.max(1, box[3] - box[1]);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return '';
  context.imageSmoothingEnabled = false;
  context.drawImage(image, box[0], box[1], width, height, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height);
  for (let offset = 0; offset < data.data.length; offset += 4) {
    if (!isStageInkPixel(data.data, offset, background)) data.data[offset + 3] = 0;
  }
  context.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

function buildImportedStageDraft(draft: StageImportDraft, pieces: StagePieceDraft[], sourceDataUrl: string, preview: boolean): StageDefinition {
  const imagePath = (piece: StagePieceDraft) => preview ? piece.dataUrl : `/stages/${draft.id}/pieces/${piece.id}.png`;
  const backdrop = pieces.reduce((largest, piece) => piece.width * piece.height > largest.width * largest.height ? piece : largest, pieces[0]);
  const propPieces = pieces.filter((piece) => piece.id !== backdrop?.id).slice(0, 24);
  const props: StagePropDefinition[] = propPieces.map((piece, index) => {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2);
    const x = side * (3.8 + (lane % 4) * 1.2);
    const z = -4.8 + (lane % 5) * 1.55;
    const height = Math.max(0.8, Math.min(3.4, piece.height / 48));
    const width = Math.max(0.8, Math.min(4.2, piece.width / 48));
    return {
      id: `prop-${piece.id}`,
      name: piece.name,
      imagePath: imagePath(piece),
      position: [x, height / 2 - 0.05, z],
      scale: [width, height, 1],
      opacity: 1,
      billboard: false,
      renderMode: 'voxel',
      voxelDepth: 0.16,
      voxelScale: 4
    };
  });
  return {
    id: draft.id,
    name: draft.name,
    subtitle: draft.subtitle,
    renderMode: 'spriteCutout',
    floor: draft.floor,
    rail: draft.rail,
    light: draft.light,
    sourcePath: preview ? sourceDataUrl : `/stages/${draft.id}/source.png`,
    thumbnailPath: pieces[0] ? imagePath(pieces[0]) : undefined,
    world: { width: 96, depth: 42, floorY: -0.045, backgroundColor: '#10291c' },
    lighting: { ambient: '#dbe8ff', sky: '#9bdfff' },
    backgroundLayers: [],
    props: [
      ...(backdrop ? [{
        id: `prop-${backdrop.id}`,
        name: backdrop.name,
        imagePath: imagePath(backdrop),
        position: [-5.2, 1.4, -5.4] as [number, number, number],
        scale: [3.2, 3.2, 1] as [number, number, number],
        opacity: 1,
        billboard: false,
        renderMode: 'voxel' as const,
        voxelDepth: 0.18,
        voxelScale: 5
      }] : []),
      ...props
    ]
  };
}

type SettingsTab = 'game' | 'controls' | 'camera' | 'display' | 'audio';

const settingsTabs: SettingsTab[] = ['game', 'controls', 'camera', 'display', 'audio'];
const tabLabels: Record<SettingsTab, string> = {
  game: 'Game',
  controls: 'Controls',
  camera: 'Camera',
  display: 'Display',
  audio: 'Audio'
};
const sidebars: Record<SettingsTab, string[]> = {
  game: ['Match Rules', 'Training', 'Assist', 'Defaults'],
  controls: ['Keyboard Mapping', 'Gamepad Mapping', 'Input Test', 'Defaults'],
  camera: ['Fight Camera', 'Tracking', 'Zoom', 'Defaults'],
  display: ['HUD', 'Touch Controls', 'Motion', 'Debug'],
  audio: ['Menu Music', 'Stage Music', 'Mix']
};
const controlActions: ActionName[] = ['up', 'down', 'left', 'right', 'jab', 'heavy', 'kick', 'special', 'charge', 'block', 'confirm', 'pause'];
const actionLabels: Record<ActionName, string> = {
  up: 'Up / Jump',
  down: 'Down / Crouch',
  left: 'Left',
  right: 'Right',
  sidestepUp: 'Sidestep Up',
  sidestepDown: 'Sidestep Down',
  sidewalkUp: 'Sidewalk Up',
  sidewalkDown: 'Sidewalk Down',
  jab: '1 Left Hand',
  heavy: '2 Right Hand',
  kick: '3 Left Foot',
  special: '4 Right Foot',
  charge: 'Charge Ki',
  block: 'Block',
  confirm: 'Confirm',
  back: 'Back',
  pause: 'Pause'
};

function SettingsScreen({
  mode,
  setMode,
  cpuDifficulty,
  setCpuDifficulty,
  settings,
  setSettings,
  selectedStageName,
  selectedStageBgmTitle,
  menuBgmTrackTitle,
  menuBgmTrackCount,
  onMenuBgmTrackChange,
  onBack
}: {
  mode: MatchMode;
  setMode: (mode: MatchMode) => void;
  cpuDifficulty: CpuDifficulty;
  setCpuDifficulty: (difficulty: CpuDifficulty) => void;
  settings: GameSettings;
  setSettings: Dispatch<SetStateAction<GameSettings>>;
  selectedStageName: string;
  selectedStageBgmTitle: string;
  menuBgmTrackTitle: string;
  menuBgmTrackCount: number;
  onMenuBgmTrackChange: (index: number) => void;
  onBack: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('controls');
  const [activePlayer, setActivePlayer] = useState<1 | 2>(1);
  const [remapRequest, setRemapRequest] = useState<{ player: 1 | 2; action: ActionName } | null>(null);
  const [duplicateRequest, setDuplicateRequest] = useState<{ key: string; owner: string } | null>(null);
  const [inputTest, setInputTest] = useState('Press a key to test bindings');
  const [activeSections, setActiveSections] = useState<Record<SettingsTab, number>>({ game: 0, controls: 0, camera: 0, display: 0, audio: 0 });
  const editorRef = useRef<HTMLElement | null>(null);
  const activeSectionIndex = Math.min(activeSections[activeTab] ?? 0, sidebars[activeTab].length - 1);

  const updateSettings = (recipe: (current: GameSettings) => GameSettings) => {
    setSettings((current) => sanitizeGameSettings(recipe(cloneSettings(current))));
  };

  const cycleOptionsTab = useCallback((direction: -1 | 1) => {
    setActiveTab((current) => {
      const currentIndex = settingsTabs.indexOf(current);
      return settingsTabs[(currentIndex + direction + settingsTabs.length) % settingsTabs.length] ?? current;
    });
  }, []);

  const scrollOptionsSectionIntoView = useCallback((index: number) => {
    window.requestAnimationFrame(() => {
      editorRef.current
        ?.querySelector<HTMLElement>(`[data-section-index="${index}"]`)
        ?.scrollIntoView({ behavior: settings.display.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }, [settings.display.reducedMotion]);

  const selectSidebarSection = useCallback((index: number) => {
    setActiveSections((current) => ({ ...current, [activeTab]: index }));
    scrollOptionsSectionIntoView(index);
  }, [activeTab, scrollOptionsSectionIntoView]);

  useEffect(() => {
    scrollOptionsSectionIntoView(activeSectionIndex);
  }, [activeSectionIndex, activeTab, scrollOptionsSectionIntoView]);

  useEffect(() => {
    if (!remapRequest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      const nextKey = event.code || event.key;
      const duplicate = findDuplicateKeyboardBinding(settings, nextKey, remapRequest);
      if (duplicate && (duplicateRequest?.key !== nextKey || duplicateRequest.owner !== duplicate.owner)) {
        setDuplicateRequest({ key: nextKey, owner: duplicate.owner });
        return;
      }
      updateSettings((current) => setKeyboardBinding(current, remapRequest.player, remapRequest.action, nextKey));
      setInputTest(`P${remapRequest.player} ${actionLabels[remapRequest.action]} = ${formatKeyName(nextKey)}`);
      setRemapRequest(null);
      setDuplicateRequest(null);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [duplicateRequest, remapRequest, settings]);

  useEffect(() => {
    if (remapRequest) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'o' || key === 'p') {
        event.preventDefault();
        cycleOptionsTab(key === 'p' ? 1 : -1);
        return;
      }
      const bindings = getKeyboardBindingsForEvent(event, mode, settings.controls);
      setInputTest(bindings.length > 0 ? bindings.map((binding) => `P${binding.player} ${actionLabels[binding.action]}`).join(' / ') : `Unbound: ${formatKeyName(event.code || event.key)}`);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [cycleOptionsTab, mode, remapRequest, settings.controls]);

  const renderEditor = () => {
    if (activeTab === 'game') {
      return (
        <div className="settings-section-stack">
          <SettingsSection index={0} title="Match Rules" active={activeSectionIndex === 0}>
            <SettingRow label="Match Mode" value={modeLabel(mode)}>
              <CharacterSelectModeCarousel value={mode} setValue={setMode} />
            </SettingRow>
            <SettingRow label="Round Timer" value={`${settings.game.roundTimer}s`}>
              <RoundTimerControl
                value={settings.game.roundTimer}
                setValue={(roundTimer) => updateSettings((current) => ({ ...current, game: { ...current.game, roundTimer } }))}
              />
            </SettingRow>
            {usesCpuDifficulty(mode) && (
              <SettingRow label="CPU Difficulty" value={cpuDifficultyLabels[cpuDifficulty]}>
                <CpuDifficultyControl value={cpuDifficulty} setValue={setCpuDifficulty} compact />
              </SettingRow>
            )}
          </SettingsSection>
          <SettingsSection index={1} title="Training" active={activeSectionIndex === 1}>
            <SettingToggle label="Training Infinite Health" checked={settings.game.trainingInfiniteHealth} onChange={(checked) => updateSettings((current) => ({ ...current, game: { ...current.game, trainingInfiniteHealth: checked } }))} />
          </SettingsSection>
          <SettingsSection index={2} title="Assist" active={activeSectionIndex === 2}>
            <SettingToggle label="Input Assist" checked={settings.game.inputAssist} onChange={(checked) => updateSettings((current) => ({ ...current, game: { ...current.game, inputAssist: checked } }))} />
          </SettingsSection>
          <SettingsSection index={3} title="Defaults" active={activeSectionIndex === 3}>
            <button className="secondary-button" onClick={() => updateSettings((current) => ({ ...current, game: cloneSettings(defaultGameSettings).game }))}>
              <RotateCcw size={16} />
              Reset Game Settings
            </button>
          </SettingsSection>
        </div>
      );
    }

    if (activeTab === 'controls') {
      const keyboard = settings.controls.keyboard[activePlayer - 1];
      const gamepad = settings.controls.gamepad[activePlayer - 1];
      return (
        <div className="settings-section-stack">
          <SettingsSection index={0} title="Keyboard Mapping" active={activeSectionIndex === 0}>
            <SettingRow label="Player" value={`P${activePlayer}`}>
              <div className="mini-segmented">
                <button className={activePlayer === 1 ? 'active' : ''} onClick={() => setActivePlayer(1)}>P1</button>
                <button className={activePlayer === 2 ? 'active' : ''} onClick={() => setActivePlayer(2)}>P2</button>
              </div>
            </SettingRow>
            {controlActions.map((action) => (
              <div className="binding-row" key={action}>
                <div>
                  <strong>{actionLabels[action]}</strong>
                  <small>{keyboard[action].map(formatKeyName).join(' / ') || 'Unbound'}</small>
                </div>
                <button className={remapRequest?.player === activePlayer && remapRequest.action === action ? 'capture' : ''} onClick={() => {
                  setActivePlayer(activePlayer);
                  setRemapRequest({ player: activePlayer, action });
                  setDuplicateRequest(null);
                }}>
                  {remapRequest?.player === activePlayer && remapRequest.action === action ? 'Press key' : 'Remap'}
                </button>
              </div>
            ))}
          </SettingsSection>
          <SettingsSection index={1} title="Gamepad Mapping" active={activeSectionIndex === 1}>
            {controlActions.map((action) => (
              <div className="binding-row" key={action}>
                <div>
                  <strong>{actionLabels[action]}</strong>
                  <small>{formatGamepadButtonName(gamepad[action]?.[0])}</small>
                </div>
                <div className="gamepad-stepper" aria-label={`${actionLabels[action]} gamepad button`}>
                  <button aria-label="Previous gamepad button" onClick={() => updateSettings((current) => adjustGamepadButton(current, activePlayer, action, -1))}>
                    <ChevronLeft size={18} />
                  </button>
                  <GamepadButtonPrompt button={gamepad[action]?.[0]} />
                  <button aria-label="Next gamepad button" onClick={() => updateSettings((current) => adjustGamepadButton(current, activePlayer, action, 1))}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            ))}
          </SettingsSection>
          <SettingsSection index={2} title="Input Test" active={activeSectionIndex === 2}>
            <SettingRow label="Last Input" value={inputTest}>
              <span className="setting-readout">{inputTest}</span>
            </SettingRow>
          </SettingsSection>
          <SettingsSection index={3} title="Defaults" active={activeSectionIndex === 3}>
          {duplicateRequest && <p className="settings-warning">{duplicateRequest.key} is already bound to {duplicateRequest.owner}. Press it again to replace that binding.</p>}
            <button className="secondary-button" onClick={() => setSettings((current) => ({ ...current, controls: cloneSettings(defaultGameSettings).controls }))}>
              <RotateCcw size={16} />
              Reset Controls
            </button>
          </SettingsSection>
        </div>
      );
    }

    if (activeTab === 'camera') {
      return (
        <div className="settings-section-stack">
          <SettingsSection index={0} title="Fight Camera" active={activeSectionIndex === 0}>
            <SettingSlider label="Distance" value={settings.camera.distance} min={0.7} max={1.35} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, distance: value } }))} />
            <SettingSlider label="Height" value={settings.camera.height} min={0.75} max={1.35} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, height: value } }))} />
          </SettingsSection>
          <SettingsSection index={1} title="Tracking" active={activeSectionIndex === 1}>
            <SettingSlider label="Smoothing" value={settings.camera.smoothing} min={0.35} max={1.5} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, smoothing: value } }))} />
          </SettingsSection>
          <SettingsSection index={2} title="Zoom" active={activeSectionIndex === 2}>
            <SettingSlider label="Zoom Bias" value={settings.camera.zoomBias} min={0.75} max={1.35} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, camera: { ...current.camera, zoomBias: value } }))} />
          </SettingsSection>
          <SettingsSection index={3} title="Defaults" active={activeSectionIndex === 3}>
            <button className="secondary-button" onClick={() => updateSettings((current) => ({ ...current, camera: cloneSettings(defaultGameSettings).camera }))}>
              <RotateCcw size={16} />
              Reset Camera
            </button>
          </SettingsSection>
        </div>
      );
    }

    if (activeTab === 'display') {
      return (
        <div className="settings-section-stack">
          <SettingsSection index={0} title="HUD" active={activeSectionIndex === 0}>
            <SettingSlider label="HUD Scale" value={settings.display.hudScale} min={0.78} max={1.25} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, display: { ...current.display, hudScale: value } }))} />
            <SettingToggle label="Impact Sparks" checked={settings.display.impactSparks.enabled} onChange={(checked) => updateSettings((current) => ({ ...current, display: { ...current.display, impactSparks: { ...current.display.impactSparks, enabled: checked } } }))} />
            <SettingRow label="Spark Shape" value={settings.display.impactSparks.shape.toUpperCase()}>
              <div className="mini-segmented">
                {(['burst', 'ring', 'shards'] as const).map((value) => (
                  <button key={value} className={settings.display.impactSparks.shape === value ? 'active' : ''} onClick={() => updateSettings((current) => ({ ...current, display: { ...current.display, impactSparks: { ...current.display.impactSparks, shape: value } } }))}>{value}</button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Hit Spark" value={settings.display.impactSparks.hitColor.toUpperCase()}>
              <input type="color" value={settings.display.impactSparks.hitColor} onChange={(event) => updateSettings((current) => ({ ...current, display: { ...current.display, impactSparks: { ...current.display.impactSparks, hitColor: event.target.value } } }))} />
            </SettingRow>
            <SettingRow label="Block Spark" value={settings.display.impactSparks.blockColor.toUpperCase()}>
              <input type="color" value={settings.display.impactSparks.blockColor} onChange={(event) => updateSettings((current) => ({ ...current, display: { ...current.display, impactSparks: { ...current.display.impactSparks, blockColor: event.target.value } } }))} />
            </SettingRow>
            <SettingSlider label="Spark Size" value={settings.display.impactSparks.size} min={0.5} max={1.8} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, display: { ...current.display, impactSparks: { ...current.display.impactSparks, size: value } } }))} />
            <SettingSlider label="Spark Intensity" value={settings.display.impactSparks.intensity} min={0.35} max={2} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, display: { ...current.display, impactSparks: { ...current.display.impactSparks, intensity: value } } }))} />
          </SettingsSection>
          <SettingsSection index={1} title="Touch Controls" active={activeSectionIndex === 1}>
            <SettingRow label="Touch Controls" value={settings.display.touchControls.toUpperCase()}>
              <div className="mini-segmented">
                {(['auto', 'on', 'off'] as const).map((value) => (
                  <button key={value} className={settings.display.touchControls === value ? 'active' : ''} onClick={() => updateSettings((current) => ({ ...current, display: { ...current.display, touchControls: value } }))}>{value}</button>
                ))}
              </div>
            </SettingRow>
          </SettingsSection>
          <SettingsSection index={2} title="Motion" active={activeSectionIndex === 2}>
            <SettingToggle label="Reduced Motion" checked={settings.display.reducedMotion} onChange={(checked) => updateSettings((current) => ({ ...current, display: { ...current.display, reducedMotion: checked } }))} />
          </SettingsSection>
          <SettingsSection index={3} title="Debug" active={activeSectionIndex === 3}>
            <SettingToggle label="Debug Overlay" checked={settings.display.debugOverlay} onChange={(checked) => updateSettings((current) => ({ ...current, display: { ...current.display, debugOverlay: checked } }))} />
          </SettingsSection>
        </div>
      );
    }

    return (
      <div className="settings-section-stack">
        <SettingsSection index={0} title="Menu Music" active={activeSectionIndex === 0}>
          <SettingToggle
            label="Main Menu Music"
            checked={settings.audio.menuMusic}
            onChange={(checked) => updateSettings((current) => ({ ...current, audio: { ...current.audio, menuMusic: checked } }))}
          />
          <SettingRow label="BGM Source" value={`${menuBgmTrackCount} local tracks`}>
            <span className="setting-readout">Repo MP3 Library</span>
          </SettingRow>
          <SettingRow label="Menu Song" value={menuBgmTrackTitle}>
            <div className="audio-track-controls" role="group" aria-label="Current BGM song">
              <button type="button" onClick={() => onMenuBgmTrackChange(settings.audio.bgmTrackIndex - 1)}>
                <ChevronLeft size={18} />
                Previous
              </button>
              <button type="button" onClick={() => onMenuBgmTrackChange(settings.audio.bgmTrackIndex + 1)}>
                Next
                <ChevronRight size={18} />
              </button>
            </div>
          </SettingRow>
        </SettingsSection>
        <SettingsSection index={1} title="Stage Music" active={activeSectionIndex === 1}>
          <SettingRow label="Selected Stage" value={selectedStageName}>
            <span className="setting-readout">{selectedStageBgmTitle}</span>
          </SettingRow>
          <SettingRow label="Fight Playback" value="Enabled">
            <span className="setting-readout">Uses stage BGM</span>
          </SettingRow>
        </SettingsSection>
        <SettingsSection index={2} title="Mix" active={activeSectionIndex === 2}>
          <SettingSlider label="Master" value={settings.audio.master} min={0} max={1} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, audio: { ...current.audio, master: value } }))} />
          <SettingSlider label="Music" value={settings.audio.music} min={0} max={1} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, audio: { ...current.audio, music: value } }))} />
          <SettingSlider label="SFX" value={settings.audio.sfx} min={0} max={1} step={0.01} onChange={(value) => updateSettings((current) => ({ ...current, audio: { ...current.audio, sfx: value } }))} />
          <SettingToggle label="Mute All" checked={settings.audio.muted} onChange={(checked) => updateSettings((current) => ({ ...current, audio: { ...current.audio, muted: checked } }))} />
        </SettingsSection>
      </div>
    );
  };

  return (
    <div className="settings-screen">
      <header className="options-header">
        <nav className="options-tabs" aria-label="Options tabs">
          <span>O</span>
          {settingsTabs.map((tab) => (
            <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>
              {tabLabels[tab]}
            </button>
          ))}
          <span>P</span>
        </nav>
      </header>
      <section className="options-layout">
        <aside className="options-sidebar">
          {sidebars[activeTab].map((item, index) => (
            <button key={item} className={activeSectionIndex === index ? 'active' : ''} onClick={() => selectSidebarSection(index)}>{item}</button>
          ))}
        </aside>
        <section ref={editorRef} className="options-editor" aria-label={`${tabLabels[activeTab]} settings`}>
          {renderEditor()}
        </section>
      </section>
      <footer className="settings-support-footer" aria-label="Community links">
        <button className="secondary-button" onClick={onBack}>
          <Home size={18} />
          Back
        </button>
        <div className="support-actions">
          <a className="support-button discord-button" href="https://discord.gg/yDcrFsmTx7" target="_blank" rel="noreferrer">
            <span className="discord-mark" aria-hidden="true">Discord</span>
            <span>Join the Discord</span>
          </a>
          <a className="support-button patreon-button" href="https://www.patreon.com/cw/playKORE" target="_blank" rel="noreferrer">
            <span className="patreon-mark" aria-hidden="true">p</span>
            <span>Become a patron</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

function SettingRow({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <article className="setting-row">
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
      <div>{children}</div>
    </article>
  );
}

function SettingsSection({ index, title, active = true, children }: { index: number; title: string; active?: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <section className="settings-section" data-section-index={index}>
      <h3>{title}</h3>
      <div className="settings-list">{children}</div>
    </section>
  );
}

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow label={label} value={`${Math.round(value * 100)}%`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </SettingRow>
  );
}

function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <article className="setting-row">
      <div>
        <strong>{label}</strong>
        <small>{checked ? 'On' : 'Off'}</small>
      </div>
      <button className={`toggle-switch ${checked ? 'is-on' : ''}`} onClick={() => onChange(!checked)} aria-pressed={checked}>
        <span />
      </button>
    </article>
  );
}

const gamepadButtonPrompts: Record<number, { label: string; shape: 'south' | 'east' | 'west' | 'north' | 'shoulder' | 'trigger' | 'system' | 'stick' | 'dpad'; caption: string }> = {
  0: { label: 'S', shape: 'south', caption: 'Face Down' },
  1: { label: 'E', shape: 'east', caption: 'Face Right' },
  2: { label: 'W', shape: 'west', caption: 'Face Left' },
  3: { label: 'N', shape: 'north', caption: 'Face Up' },
  4: { label: 'L1', shape: 'shoulder', caption: 'Left Shoulder' },
  5: { label: 'R1', shape: 'shoulder', caption: 'Right Shoulder' },
  6: { label: 'L2', shape: 'trigger', caption: 'Left Trigger' },
  7: { label: 'R2', shape: 'trigger', caption: 'Right Trigger' },
  8: { label: 'SEL', shape: 'system', caption: 'Select' },
  9: { label: 'STA', shape: 'system', caption: 'Start' },
  10: { label: 'L3', shape: 'stick', caption: 'Left Stick Press' },
  11: { label: 'R3', shape: 'stick', caption: 'Right Stick Press' },
  12: { label: '↑', shape: 'dpad', caption: 'D-Pad Up' },
  13: { label: '↓', shape: 'dpad', caption: 'D-Pad Down' },
  14: { label: '←', shape: 'dpad', caption: 'D-Pad Left' },
  15: { label: '→', shape: 'dpad', caption: 'D-Pad Right' },
  16: { label: '⌂', shape: 'system', caption: 'Home' }
};

function GamepadButtonPrompt({ button }: { button?: number }) {
  if (button === undefined || button === null) {
    return (
      <span className="gamepad-prompt gamepad-prompt-empty" aria-label="Unbound gamepad button">
        -
      </span>
    );
  }
  const prompt = gamepadButtonPrompts[button] ?? { label: `${button}`, shape: 'system' as const, caption: `Button ${button}` };
  return (
    <span className={`gamepad-prompt gamepad-prompt-${prompt.shape}`} aria-label={prompt.caption} title={prompt.caption}>
      <span>{prompt.label}</span>
    </span>
  );
}

function findDuplicateKeyboardBinding(settings: GameSettings, key: string, target: { player: 1 | 2; action: ActionName }) {
  for (let player = 1; player <= 2; player += 1) {
    const keyboard = settings.controls.keyboard[player - 1];
    for (const action of Object.keys(keyboard) as ActionName[]) {
      if (player === target.player && action === target.action) continue;
      if (keyboard[action].includes(key)) return { owner: `P${player} ${actionLabels[action]}` };
    }
  }
  return null;
}

function setKeyboardBinding(settings: GameSettings, player: 1 | 2, action: ActionName, key: string): GameSettings {
  const next = cloneSettings(settings);
  next.controls.keyboard.forEach((keyboard) => {
    for (const candidate of Object.keys(keyboard) as ActionName[]) {
      keyboard[candidate] = keyboard[candidate].filter((value) => value !== key);
    }
  });
  const bindings = next.controls.keyboard[player - 1][action];
  next.controls.keyboard[player - 1][action] = [key, ...bindings.filter((value) => value !== key)].slice(0, 3);
  return next;
}

function adjustGamepadButton(settings: GameSettings, player: 1 | 2, action: ActionName, delta: number): GameSettings {
  const next = cloneSettings(settings);
  const current = next.controls.gamepad[player - 1][action]?.[0] ?? 0;
  next.controls.gamepad[player - 1][action] = [Math.min(16, Math.max(0, current + delta))];
  return next;
}

function formatKeyName(key: string) {
  return key
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Numpad/, 'Num ')
    .replace('Arrow', '')
    .replace('Space', 'Spacebar')
    .replace('Escape', 'Esc');
}

function formatGamepadButtonName(button?: number) {
  if (button === undefined || button === null) return 'Unbound';
  return gamepadButtonPrompts[button]?.caption ?? `Gamepad button ${button}`;
}

function modeLabel(mode: MatchMode) {
  if (mode === 'ai') return '1P vs CPU';
  if (mode === 'local2p') return 'Local 2P';
  if (mode === 'training') return 'Training';
  if (mode === 'online') return 'Online';
  if (mode === 'private') return 'Private';
  return 'CPU vs CPU';
}

function chooseHitSfx(event: ImpactSparkEvent) {
  if (event.kind === 'block') {
    return event.moveInput === 'heavy' || event.moveInput === 'special' || event.damage >= 2 ? HIT_SFX.blockHeavy : HIT_SFX.blockLight;
  }

  if (event.launched) {
    return event.moveInput === 'special' || event.kiBurst ? HIT_SFX.bigLauncher : HIT_SFX.launcher;
  }

  if (event.moveInput === 'heavy') return HIT_SFX.heavy2;
  if (event.moveInput === 'kick') return HIT_SFX.kick3;
  if (event.moveInput === 'special') return HIT_SFX.special4;
  return HIT_SFX.punch1;
}

function playHitSfx(event: ImpactSparkEvent, audioSettings: GameSettings['audio']) {
  if (typeof window === 'undefined' || audioSettings.muted || audioSettings.master <= 0 || audioSettings.sfx <= 0) return;
  const isBlock = event.kind === 'block';
  const isLauncher = Boolean(event.launched);
  const gain = isBlock ? 0.18 : isLauncher ? 0.35 : 0.28;
  const volume = clamp(audioSettings.master * audioSettings.sfx * gain, 0, isBlock ? 0.32 : 0.48);
  const playbackRate = isBlock ? 0.96 : event.moveInput === 'special' ? 0.94 : 1;
  playPooledSfx(chooseHitSfx(event), volume, playbackRate);
}

function resolveSlotMove(character: CharacterDefinition, slot: AnimationSlot): MoveDefinition | null {
  if (slot.key === 'chargeKi') {
    return buildChargeKiEditorMove(character);
  }
  if (!isMoveSlotPose(slot.pose) && !slot.command) return null;
  const dataKey = getSlotDataKey(slot);
  const baseInput = isMoveSlotPose(slot.pose) ? slot.pose : commandPose(slot.command ?? slot.label);
  const baseMove = character.moves.find((move) => move.input === baseInput) ?? character.moves[0] ?? null;
  if (!baseMove) return null;
  const overrideKeys = [
    getLegacyRawButtonDataKey(dataKey),
    getLegacyBaseInputDataKey(dataKey),
    slot.command && dataKey === slot.key ? slot.command : undefined,
    baseMove.id,
    baseMove.input,
    dataKey
  ].filter(Boolean) as string[];
  const uniqueOverrideKeys = [...new Set(overrideKeys)];
  return uniqueOverrideKeys.reduce<MoveDefinition>((move, key) => {
    const override = character.moveOverrides?.[key];
    return override ? mergeMoveOverride(move, override) : move;
  }, baseMove);
}

function buildChargeKiEditorMove(character: CharacterDefinition): MoveDefinition {
  const base: MoveDefinition = {
    id: 'chargeKi',
    label: 'Charge Ki',
    input: 'special',
    command: 'chargeKi',
    notation: 'O',
    animationKey: 'chargeKi',
    comboKey: 'chargeKi',
    startupFrames: 14,
    activeFrames: 18,
    recoveryFrames: 16,
    damage: 0,
    blockDamage: 0,
    hitLevel: 'special',
    onBlockFrames: 0,
    onHitFrames: 0,
    onCounterHitFrames: 0,
    whiffRecoveryFrames: 0,
    range: 0.1,
    pushback: 0,
    blockPushback: 0,
    tracking: 'none',
    knockdown: false,
    hitbox: { offset: [0, 1, 0], size: [0, 0, 0] }
  };
  const override = character.moveOverrides?.chargeKi ?? character.moveOverrides?.['cmd:chargeKi'] ?? character.moveOverrides?.charge;
  return override ? mergeMoveOverride(base, override) : base;
}

function mergeMoveOverride(move: MoveDefinition, override: MoveOverride): MoveDefinition {
  return {
    ...move,
    ...override,
    hitbox: override.hitbox
      ? {
          offset: override.hitbox.offset ?? move.hitbox.offset,
          size: override.hitbox.size ?? move.hitbox.size
        }
      : move.hitbox
  };
}

function isMoveSlotPose(pose: PreviewPose): pose is MoveDefinition['input'] {
  return pose === 'jab' || pose === 'kick' || pose === 'heavy' || pose === 'special';
}

function formatFrameSummary(move: MoveDefinition | null) {
  if (!move) return 'No move data';
  const hitParts = [
    move.knockdown ? 'KD' : (move.launchHeight ?? 0) > 0 ? 'Launch' : signedFrame(move.onHitFrames),
    move.tornado ? 'T!' : null
  ].filter(Boolean);
  return `i${move.startupFrames} | ${capitalize(move.hitLevel)} | ${signedFrame(move.onBlockFrames)} OB | ${hitParts.join(' / ')} OH`;
}

function formatMoveSlotLabel(slot: AnimationSlot, move: MoveDefinition | null) {
  return move?.label ?? slot.label;
}

function signedFrame(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ControlPanel({ title, rows }: { title: string; rows: string[] }) {
  return (
    <article className="control-panel">
      <h3>{title}</h3>
      {rows.map((row) => (
        <p key={row}>{row}</p>
      ))}
    </article>
  );
}

function CharacterViewer({
  roster,
  sourceRoster,
  onAnimationFramesChange,
  onAnimationSpeedChange,
  onMoveOverrideChange,
  onSpriteFrameEditChange,
  onEffectsChange,
  onImportComplete,
  onBack
}: {
  roster: CharacterDefinition[];
  sourceRoster: CharacterDefinition[];
  onAnimationFramesChange: (characterId: string, animationKey: string, frames: string[]) => void;
  onAnimationSpeedChange: (characterId: string, animationKey: string, speed: number) => void;
  onMoveOverrideChange: (characterId: string, moveKey: string, override: MoveOverride) => void;
  onSpriteFrameEditChange: (characterId: string, frameIndex: number, edit: SpriteFrameEdit) => void;
  onEffectsChange: (characterId: string, effects: CharacterEffectDefinition[], moveEffects: Record<string, MoveEffectInstance[]>) => void;
  onImportComplete: (preferredCharacterId?: string) => Promise<void>;
  onBack: () => void;
}) {
  const [activeId, setActiveId] = useState(roster[0]?.id ?? '');
  const [selectedAnimationKey, setSelectedAnimationKey] = useState(animationSlots[0].key);
  const [slotCategory, setSlotCategory] = useState<AnimationSlot['category'] | 'all'>('stance');
  const [slotSearch, setSlotSearch] = useState('');
  const [rotationTurn, setRotationTurn] = useState(0);
  const [zoom, setZoom] = useState(0.28);
  const [editorMode, setEditorMode] = useState<'browse' | 'animation' | 'sprite' | 'effectsLibrary' | 'moveEffects'>('browse');
  const [showImporter, setShowImporter] = useState(false);
  const [showSpriteSheetPreview, setShowSpriteSheetPreview] = useState(false);
  const [selectedSpriteFrameIndex, setSelectedSpriteFrameIndex] = useState(0);
  const [spriteFrameMeta, setSpriteFrameMeta] = useState<Record<string, SpriteFrameEdit>>({});
  const [spriteFrameMetaRefresh, setSpriteFrameMetaRefresh] = useState(0);
  const [manifestSaveStatus, setManifestSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [spriteSaveStatus, setSpriteSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [spriteSheetImportStatus, setSpriteSheetImportStatus] = useState<'idle' | 'working' | 'saved' | 'error'>('idle');
  const [effectSaveStatus, setEffectSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [effectImportStatus, setEffectImportStatus] = useState<'idle' | 'working' | 'saved' | 'error'>('idle');
  const [effectFrameSaveStatus, setEffectFrameSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selectedEffectId, setSelectedEffectId] = useState('');
  const [selectedEffectFrameIndex, setSelectedEffectFrameIndex] = useState(0);
  const [effectTimelineFrame, setEffectTimelineFrame] = useState(0);
  const [hdVoxelStatus, setHdVoxelStatus] = useState<'idle' | 'building' | 'saved' | 'error'>('idle');
  const [hdVoxelProgress, setHdVoxelProgress] = useState({ completed: 0, total: 0 });
  const [previewHdVoxels, setPreviewHdVoxels] = useState(false);
  const active = roster.find((character) => character.id === activeId) ?? roster[0];
  const sourceActive = sourceRoster.find((character) => character.id === active.id) ?? active;
  const isLocalDev = isLocalDevHost();
  const isEditingAnimation = editorMode === 'animation';
  const isEditingSpriteSheet = editorMode === 'sprite';
  const isEditingEffectsLibrary = editorMode === 'effectsLibrary';
  const isEditingMoveEffects = editorMode === 'moveEffects';
  const selectedSlot = animationSlots.find((slot) => slot.key === selectedAnimationKey) ?? animationSlots[0];
  const frameCount =
    active.spriteFrameCount ??
    Math.max(0, ...Object.values(active.animationFrames ?? {}).flat().map(getFrameIndex)) + 1;
  const frameBank = useMemo(
    () => Array.from({ length: frameCount }, (_, index) => framePath(active, index)),
    [active, frameCount]
  );
  const spriteSheets = useMemo(() => getCharacterSpriteSheets(active, frameCount), [active, frameCount]);
  const selectedSlotDataKey = getSlotDataKey(selectedSlot);
  const selectedFrames = active.animationFrames?.[selectedSlotDataKey] ?? [];
  const defaultFrames = sourceActive.animationFrames?.[selectedSlotDataKey] ?? selectedFrames;
  const selectedSpeed = active.animationFrameRates?.[selectedSlotDataKey] ?? active.animationFps ?? 8;
  const defaultSpeed = sourceActive.animationFrameRates?.[selectedSlotDataKey] ?? sourceActive.animationFps ?? active.animationFps ?? 8;
  const selectedFrameSet = new Set(selectedFrames);
  const selectedMove = resolveSlotMove(active, selectedSlot);
  const selectedMoveOverride = active.moveOverrides?.[selectedSlotDataKey] ?? {};
  const effects = active.effects ?? [];
  const selectedEffect = effects.find((effect) => effect.id === selectedEffectId) ?? effects[0] ?? null;
  const moveEffects = active.moveEffects ?? {};
  const selectedMoveEffectInstances = moveEffects[selectedSlotDataKey] ?? [];
  const selectedMoveTotalFrames = selectedMove ? selectedMove.startupFrames + selectedMove.activeFrames + selectedMove.recoveryFrames : 30;
  useEffect(() => {
    if (!selectedEffect) return;
    const frameCount = selectedEffect.frames?.length ?? 0;
    if (frameCount > 0 && selectedEffectFrameIndex >= frameCount) setSelectedEffectFrameIndex(0);
  }, [selectedEffect, selectedEffectFrameIndex]);
  const previewCharacter = previewHdVoxels
    ? {
        ...active,
        voxelProfile: 'hd-image-source' as const,
        voxelFidelity: normalizeVoxelFidelity(active.voxelFidelity)
      }
    : active;
  const visibleSlots = animationSlots.filter((slot) => {
    const categoryMatches = slotCategory === 'all' || slot.category === slotCategory;
    const search = slotSearch.trim().toLowerCase();
    const searchMatches = !search || slot.label.toLowerCase().includes(search) || slot.command?.toLowerCase().includes(search);
    return categoryMatches && searchMatches;
  });
  const moveGridColumnCount = slotCategory === 'stance' ? 4 : 1;
  const selectedSpriteFramePath = framePath(active, selectedSpriteFrameIndex);

  const cycleActiveCharacter = useCallback((direction: -1 | 1) => {
    if (roster.length <= 1) return;
    const currentIndex = Math.max(0, roster.findIndex((character) => character.id === active.id));
    const nextIndex = (currentIndex + direction + roster.length) % roster.length;
    const next = roster[nextIndex];
    if (next) setActiveId(next.id);
  }, [active.id, roster]);

  const selectVisibleSlotAt = (index: number) => {
    const next = visibleSlots[index];
    if (!next) return;
    setSelectedAnimationKey(next.key);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-viewer-slot-index="${index}"]`)?.focus();
    });
  };

  const handleMoveGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
    if (visibleSlots.length === 0) return;
    const currentIndex = Math.max(0, visibleSlots.findIndex((slot) => slot.key === selectedAnimationKey));
    let nextIndex = currentIndex;

    if (event.key === 'ArrowLeft') nextIndex = currentIndex - 1;
    else if (event.key === 'ArrowRight') nextIndex = currentIndex + 1;
    else if (event.key === 'ArrowUp') nextIndex = currentIndex - moveGridColumnCount;
    else if (event.key === 'ArrowDown') nextIndex = currentIndex + moveGridColumnCount;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = visibleSlots.length - 1;
    else return;

    event.preventDefault();
    selectVisibleSlotAt(Math.max(0, Math.min(visibleSlots.length - 1, nextIndex)));
  };

  useEffect(() => {
    if (!active?.id) return;
    const firstSelectedIndex = getFrameIndex(selectedFrames[0] ?? '');
    if (firstSelectedIndex >= 0) setSelectedSpriteFrameIndex(firstSelectedIndex);
  }, [active.id, selectedAnimationKey]);

  useEffect(() => {
    const handleCharacterShoulderKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target?.tagName ?? '')) return;
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === 'o') {
        event.preventDefault();
        cycleActiveCharacter(-1);
      } else if (key === 'p') {
        event.preventDefault();
        cycleActiveCharacter(1);
      }
    };
    window.addEventListener('keydown', handleCharacterShoulderKeys);
    return () => window.removeEventListener('keydown', handleCharacterShoulderKeys);
  }, [cycleActiveCharacter]);

  useEffect(() => {
    let mounted = true;
    setSpriteFrameMeta({});
    fetch(`/characters/${active.id}/frames/frames.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { frames?: SpriteFrameEdit[] } | null) => {
        if (!mounted) return;
        const entries = Object.fromEntries(
          (data?.frames ?? [])
            .filter((frame) => Number.isFinite(frame.index) && Array.isArray(frame.box))
            .map((frame) => [String(frame.index), sanitizeSpriteFrameEdit(frame)])
        );
        setSpriteFrameMeta(entries);
      })
      .catch(() => {
        if (mounted) setSpriteFrameMeta({});
      });
    return () => {
      mounted = false;
    };
  }, [active.id, spriteFrameMetaRefresh]);

  useEffect(() => {
    if (!isLocalDev && editorMode !== 'browse') setEditorMode('browse');
  }, [editorMode, isLocalDev]);

  useEffect(() => {
    if (!selectedEffectId && effects[0]) setSelectedEffectId(effects[0].id);
    if (selectedEffectId && effects.length > 0 && !effects.some((effect) => effect.id === selectedEffectId)) {
      setSelectedEffectId(effects[0].id);
    }
  }, [effects, selectedEffectId]);

  useEffect(() => {
    if (editorMode !== 'animation') setShowSpriteSheetPreview(false);
  }, [editorMode, selectedAnimationKey, active.id]);

  useEffect(() => {
    debugLog(6, 'viewer active character and slot', {
      activeId: active.id,
      displayName: active.displayName,
      selectedAnimationKey,
      selectedSlotLabel: selectedSlot.label
    });
    debugLog(7, 'viewer effective animation selection', {
      characterId: active.id,
      animationKey: selectedSlotDataKey,
      selectedSlotKey: selectedSlot.key,
      effectiveFrames: selectedFrames.map(getFrameIndex),
      defaultFrames: defaultFrames.map(getFrameIndex),
      effectiveFps: selectedSpeed,
      defaultFps: defaultSpeed
    });
  }, [active.id, active.displayName, defaultFrames, defaultSpeed, selectedAnimationKey, selectedFrames, selectedSlot.key, selectedSlot.label, selectedSlotDataKey, selectedSpeed]);

  const updateSelectedFrames = (frames: string[]) => {
    if (frames.length === 0) return;
    onAnimationFramesChange(active.id, selectedSlotDataKey, frames);
  };

  const updateSelectedSpeed = (speed: number) => {
    if (!Number.isFinite(speed)) return;
    const normalized = Math.max(1, Math.min(24, Number(speed.toFixed(1))));
    onAnimationSpeedChange(active.id, selectedSlotDataKey, normalized);
  };

  const resetSelectedAnimation = () => {
    updateSelectedFrames(defaultFrames);
    updateSelectedSpeed(defaultSpeed);
  };

  const updateSelectedMoveOverride = (patch: MoveOverride) => {
    if (!selectedMove) return;
    onMoveOverrideChange(active.id, selectedSlotDataKey, {
      ...selectedMoveOverride,
      ...patch
    });
  };

  const updateCharacterEffects = (
    nextEffects: CharacterEffectDefinition[] = effects,
    nextMoveEffects: Record<string, MoveEffectInstance[]> = moveEffects
  ) => {
    onEffectsChange(active.id, sanitizeEffects(nextEffects), sanitizeMoveEffects(canonicalizeRawButtonRecord(nextMoveEffects)));
  };

  const saveEffectsToDev = async (
    nextEffects: CharacterEffectDefinition[] = effects,
    nextMoveEffects: Record<string, MoveEffectInstance[]> = moveEffects
  ) => {
    setEffectSaveStatus('saving');
    try {
      const response = await fetch('/__kore/dev/save-character-effects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: active.id,
          effects: sanitizeEffects(nextEffects),
          moveEffects: sanitizeMoveEffects(canonicalizeRawButtonRecord(nextMoveEffects))
        })
      });
      if (!response.ok) throw new Error(await response.text());
      updateCharacterEffects(nextEffects, nextMoveEffects);
      await onImportComplete(active.id);
      setEffectSaveStatus('saved');
      window.setTimeout(() => setEffectSaveStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to save character effects', error);
      setEffectSaveStatus('error');
    }
  };

  const importEffectSpriteSheet = async (file: File | undefined) => {
    if (!file || !isLocalDev) return;
    setEffectImportStatus('working');
    try {
      const result = await detectSpriteSheetFrames(file);
      const effectId = uniqueEffectId(active, file.name);
      const response = await fetch('/__kore/dev/import-effect-spritesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: active.id,
          effectId,
          effectName: file.name.replace(/\.[^.]+$/, ''),
          sheetDataUrl: result.sheetDataUrl,
          frames: result.frames
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json() as { effect?: Partial<CharacterEffectDefinition> };
      const imported = sanitizeEffects([{ ...defaultCharacterEffect(effectId), ...(payload.effect ?? {}) }])[0];
      const nextEffects = sanitizeEffects([...effects.filter((effect) => effect.id !== imported.id), imported]);
      updateCharacterEffects(nextEffects, moveEffects);
      setSelectedEffectId(imported.id);
      setEffectImportStatus('saved');
      window.setTimeout(() => setEffectImportStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to import effect spritesheet', error);
      setEffectImportStatus('error');
    }
  };

  const importEffectSound = async (file: File | undefined, effectId: string) => {
    if (!file || !isLocalDev || !effectId) return;
    setEffectImportStatus('working');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch('/__kore/dev/import-effect-sound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: active.id, effectId, fileName: file.name, dataUrl })
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json() as { path?: string };
      const nextEffects = effects.map((effect) => (
        effect.id === effectId
          ? {
              ...effect,
              soundCues: [
                ...(effect.soundCues ?? []),
                {
                  id: uniqueCueId(effect),
                  name: file.name.replace(/\.[^.]+$/, ''),
                  path: payload.path ?? '',
                  frame: 0,
                  volume: 0.7,
                  pitch: 1,
                  pan: 0,
                  retrigger: false
                }
              ]
            }
          : effect
      ));
      updateCharacterEffects(nextEffects, moveEffects);
      setEffectImportStatus('saved');
      window.setTimeout(() => setEffectImportStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to import effect sound', error);
      setEffectImportStatus('error');
    }
  };

  const addBlankEffect = () => {
    const effectId = uniqueEffectId(active, 'new-effect');
    const effect = defaultCharacterEffect(effectId);
    const nextEffects = sanitizeEffects([...effects, { ...effect, name: `Effect ${effects.length + 1}` }]);
    updateCharacterEffects(nextEffects, moveEffects);
    setSelectedEffectId(effectId);
  };

  const updateEffect = (effectId: string, patch: Partial<CharacterEffectDefinition>) => {
    const nextEffects = effects.map((effect) => (effect.id === effectId ? sanitizeEffects([{ ...effect, ...patch }])[0] : effect));
    updateCharacterEffects(nextEffects, moveEffects);
  };

  const saveEffectFrame = async (effectId: string, edit: SpriteFrameEdit, pngDataUrl: string) => {
    if (!isLocalDev || !effectId) return;
    setEffectFrameSaveStatus('saving');
    try {
      const frameIndex = Math.max(0, Math.round(edit.index));
      const response = await fetch('/__kore/dev/save-effect-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: active.id,
          effectId,
          frameIndex,
          edit,
          pngDataUrl
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json() as { framePath?: string; edit?: SpriteFrameEdit };
      const framePathValue = payload.framePath ?? `/characters/${active.id}/effects/${effectId}/frames/frame-${frameIndex.toString().padStart(3, '0')}.png`;
      const nextEffects = effects.map((effect) => {
        if (effect.id !== effectId) return effect;
        const frames = [...(effect.frames ?? [])];
        frames[frameIndex] = framePathValue;
        return sanitizeEffects([{
          ...effect,
          frames,
          effectFrameEdits: {
            ...(effect.effectFrameEdits ?? {}),
            [String(frameIndex)]: payload.edit ?? edit
          }
        }])[0];
      });
      updateCharacterEffects(nextEffects, moveEffects);
      setEffectFrameSaveStatus('saved');
      window.setTimeout(() => setEffectFrameSaveStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to save effect frame', error);
      setEffectFrameSaveStatus('error');
    }
  };

  const deleteEffectFrame = async (effectId: string, frameIndex: number) => {
    if (!isLocalDev || !effectId) return;
    const effect = effects.find((item) => item.id === effectId);
    const frames = effect?.frames ?? [];
    if (!effect || frameIndex < 0 || frameIndex >= frames.length) return;
    setEffectFrameSaveStatus('saving');
    try {
      const response = await fetch('/__kore/dev/delete-effect-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: active.id,
          effectId,
          frameIndex
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json() as {
        frames?: string[];
        effectFrameEdits?: Record<string, SpriteFrameEdit>;
      };
      const nextFrames = payload.frames ?? frames.filter((_, index) => index !== frameIndex);
      const nextEffects = effects.map((item) => (
        item.id === effectId
          ? sanitizeEffects([{
              ...item,
              frames: nextFrames,
              effectFrameEdits: payload.effectFrameEdits ?? {}
            }])[0]
          : item
      ));
      updateCharacterEffects(nextEffects, moveEffects);
      setSelectedEffectFrameIndex(Math.min(Math.max(0, nextFrames.length - 1), frameIndex));
      setEffectFrameSaveStatus('saved');
      window.setTimeout(() => setEffectFrameSaveStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to delete effect frame', error);
      setEffectFrameSaveStatus('error');
    }
  };

  const deleteEffect = (effectId: string) => {
    const nextEffects = effects.filter((effect) => effect.id !== effectId);
    const nextMoveEffects = Object.fromEntries(
      Object.entries(moveEffects)
        .map(([key, instances]) => [key, instances.filter((instance) => instance.effectId !== effectId)])
        .filter(([, instances]) => instances.length > 0)
    ) as Record<string, MoveEffectInstance[]>;
    updateCharacterEffects(nextEffects, nextMoveEffects);
    if (selectedEffectId === effectId) setSelectedEffectId(nextEffects[0]?.id ?? '');
  };

  const attachSelectedEffectToMove = (effectId: string) => {
    if (!effectId) return;
    const nextInstance: MoveEffectInstance = {
      id: uniqueMoveEffectInstanceId(selectedMoveEffectInstances, effectId),
      effectId,
      label: effects.find((effect) => effect.id === effectId)?.name,
      startFrame: 0,
      endFrame: selectedMoveTotalFrames,
      layer: selectedMoveEffectInstances.length,
      mirrorWithFacing: true,
      anchor: 'body',
      keyframes: [
        { frame: 0, position: [0, 0.15, 0.28], scale: [2.25, 2.25, 2.25], rotation: [0, 0, 0], opacity: 1, color: '#ffffff' },
        { frame: Math.max(1, selectedMoveTotalFrames), position: [0, 0.15, 0.28], scale: [2.25, 2.25, 2.25], rotation: [0, 0, 0], opacity: 1, color: '#ffffff' }
      ],
      soundCues: []
    };
    updateMoveEffectInstances([...selectedMoveEffectInstances, nextInstance]);
  };

  const updateMoveEffectInstances = (instances: MoveEffectInstance[]) => {
    const nextMoveEffects = {
      ...moveEffects,
      [selectedSlotDataKey]: sanitizeMoveEffects({ [selectedSlotDataKey]: instances })[selectedSlotDataKey] ?? []
    };
    if (nextMoveEffects[selectedSlotDataKey].length === 0) delete nextMoveEffects[selectedSlotDataKey];
    updateCharacterEffects(effects, nextMoveEffects);
  };

  const saveActiveManifest = async () => {
    setManifestSaveStatus('saving');
    try {
      await saveCharacterManifestToDev(active);
      await onImportComplete(active.id);
      setManifestSaveStatus('saved');
      window.setTimeout(() => setManifestSaveStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to save character manifest', error);
      setManifestSaveStatus('error');
    }
  };

  const rebuildHdVoxels = async () => {
    setHdVoxelStatus('building');
    setHdVoxelProgress({ completed: 0, total: frameCount });
    try {
      await saveHdVoxelsToDev(
        {
          ...active,
          voxelProfile: 'hd-image-source',
          voxelFidelity: normalizeVoxelFidelity(active.voxelFidelity)
        },
        (completed, total) => setHdVoxelProgress({ completed, total })
      );
      setPreviewHdVoxels(true);
      await onImportComplete(active.id);
      setHdVoxelStatus('saved');
      window.setTimeout(() => setHdVoxelStatus('idle'), 2200);
    } catch (error) {
      console.error('Failed to rebuild HD voxels', error);
      setHdVoxelStatus('error');
    }
  };

  const toggleFrame = (path: string) => {
    if (selectedFrameSet.has(path)) {
      if (selectedFrames.length <= 1) return;
      updateSelectedFrames(selectedFrames.filter((frame) => frame !== path));
      return;
    }
    updateSelectedFrames([...selectedFrames, path]);
  };

  const saveSpriteFrame = async (edit: SpriteFrameEdit, pngDataUrl: string) => {
    setSpriteSaveStatus('saving');
    try {
      const nextEdit = sanitizeSpriteFrameEdit({
        ...edit,
        index: selectedSpriteFrameIndex,
        path: selectedSpriteFramePath,
        revision: Date.now()
      });
      const response = await fetch('/__kore/dev/save-sprite-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: active.id,
          frameIndex: selectedSpriteFrameIndex,
          edit: nextEdit,
          pngDataUrl
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const fidelity = normalizeVoxelFidelity(active.voxelFidelity);
      await saveHdVoxelFramesToDev(
        {
          ...active,
          voxelProfile: 'hd-image-source',
          voxelFidelity: fidelity
        },
        [
          {
            frameIndex: selectedSpriteFrameIndex,
            payload: await buildHdVoxelPayload(pngDataUrl, fidelity, selectedSpriteFramePath, getSpriteFrameVoxelSizing(nextEdit))
          }
        ],
        fidelity
      );
      clearImageVoxelCacheForFrame(active.id, selectedSpriteFrameIndex);
      onSpriteFrameEditChange(active.id, selectedSpriteFrameIndex, nextEdit);
      setSpriteFrameMeta((current) => ({ ...current, [String(selectedSpriteFrameIndex)]: nextEdit }));
      setSpriteSaveStatus('saved');
      window.setTimeout(() => setSpriteSaveStatus('idle'), 1800);
    } catch (error) {
      console.error('Failed to save sprite frame', error);
      setSpriteSaveStatus('error');
    }
  };

  const createSpriteFrame = (edit: SpriteFrameEdit) => {
    const nextEdit = sanitizeSpriteFrameEdit(edit);
    onSpriteFrameEditChange(active.id, nextEdit.index, nextEdit);
    setSpriteFrameMeta((current) => ({ ...current, [String(nextEdit.index)]: nextEdit }));
    setSelectedSpriteFrameIndex(nextEdit.index);
    setSpriteSaveStatus('idle');
  };

  const importAdditionalSpriteSheet = async (file: File | undefined) => {
    if (!file || !isLocalDev) return;
    setSpriteSheetImportStatus('working');
    try {
      const result = await detectSpriteSheetFrames(file);
      const sheetId = uniqueSpriteSheetId(active, file.name);
      const response = await fetch('/__kore/dev/import-character-spritesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: active.id,
          sheetId,
          sheetName: file.name,
          sheetDataUrl: result.sheetDataUrl,
          frames: result.frames
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const payload = await response.json() as { firstFrameIndex?: number };
      await onImportComplete(active.id);
      setSpriteFrameMetaRefresh((value) => value + 1);
      setSelectedSpriteFrameIndex(Math.max(0, Math.round(Number(payload.firstFrameIndex) || frameCount)));
      setSpriteSheetImportStatus('saved');
      window.setTimeout(() => setSpriteSheetImportStatus('idle'), 2200);
    } catch (error) {
      console.error('Failed to append character spritesheet', error);
      setSpriteSheetImportStatus('error');
    }
  };

  if (showImporter && isLocalDev) {
    return (
      <CharacterImportScreen
        onBack={() => setShowImporter(false)}
        onImportComplete={async (characterId) => {
          await onImportComplete(characterId);
          setActiveId(characterId);
          setShowImporter(false);
        }}
      />
    );
  }

  return (
    <div className="viewer-screen">
      <header className="section-header">
        <div>
          <span>Character Select</span>
          <h2>Characters</h2>
          <small className="viewer-shortcut-hint">O / P to change character</small>
        </div>
      </header>
      <div className="viewer-layout">
        <div className="roster-list compact loader-bar">
          {roster.map((character) => (
            <button
              key={character.id}
              className={`fighter-card viewer-character-card ${active.id === character.id ? 'is-selected' : ''}`}
              style={{ '--fighter-color': character.colors.primary } as CSSProperties}
              onClick={() => setActiveId(character.id)}
              aria-label={character.displayName}
              title={character.displayName}
            >
              <img src={characterPortraitPath(character)} alt="" />
            </button>
          ))}
        </div>
        <article className={`model-viewer-panel ${isEditingSpriteSheet ? 'is-sprite-editing' : ''}`}>
          {!isEditingSpriteSheet && (
            <div className="model-viewer-stage">
              <CharacterPreviewCanvas character={previewCharacter} pose={selectedSlot.pose} animationKey={selectedSlotDataKey} previewMove={selectedMove} rotationTurn={rotationTurn} zoom={zoom} />
            </div>
          )}
          <div className="viewer-actions">
            <div className="viewer-action-row">
              {!isEditingSpriteSheet && (
                <>
                  <button className="secondary-button" onClick={() => setRotationTurn((value) => value + 1)}>
                    <Rotate3D size={18} />
                    Rotate
                  </button>
                  {isLocalDev && (
                    <>
                      <button
                        className="secondary-button"
                        onClick={() => setShowImporter(true)}
                        data-testid="open-character-importer"
                      >
                        <Upload size={18} />
                        Import Character
                      </button>
                      <button
                        className={`secondary-button ${isEditingAnimation ? 'active-tool' : ''}`}
                        onClick={() => setEditorMode((current) => (current === 'animation' ? 'browse' : 'animation'))}
                        data-testid="toggle-animation-editor"
                      >
                        <Settings size={18} />
                        {isEditingAnimation ? 'Browse Moves' : 'Edit Selected'}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => setEditorMode('sprite')}
                        data-testid="toggle-sprite-editor"
                      >
                        <Target size={18} />
                        Edit Spritesheet
                      </button>
                      <button
                        className={`secondary-button ${isEditingEffectsLibrary ? 'active-tool' : ''}`}
                        onClick={() => setEditorMode((current) => (current === 'effectsLibrary' ? 'browse' : 'effectsLibrary'))}
                        data-testid="toggle-effects-library"
                      >
                        <Eye size={18} />
                        View Effects
                      </button>
                      <button
                        className={`secondary-button ${isEditingMoveEffects ? 'active-tool' : ''}`}
                        onClick={() => setEditorMode((current) => (current === 'moveEffects' ? 'browse' : 'moveEffects'))}
                        data-testid="toggle-move-effects"
                      >
                        <Settings size={18} />
                        Add Effects
                      </button>
                      <button
                        className={`secondary-button ${previewHdVoxels ? 'active-tool' : ''}`}
                        onClick={() => setPreviewHdVoxels((current) => !current)}
                        data-testid="toggle-hd-voxel-preview"
                      >
                        <Eye size={18} />
                        {previewHdVoxels ? 'HD Preview On' : 'HD Preview'}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={rebuildHdVoxels}
                        disabled={hdVoxelStatus === 'building'}
                        data-testid="rebuild-hd-voxels"
                      >
                        <Target size={18} />
                        {hdVoxelStatus === 'building' ? 'Building HD' : 'Rebuild HD Voxels'}
                      </button>
                    </>
                  )}
                  <div className="zoom-controls" aria-label="Model zoom controls">
                    <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0, value - 0.18))} data-testid="viewer-zoom-out">
                      <ZoomOut size={18} />
                    </button>
                    <input
                      aria-label="Zoom level"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                      data-testid="viewer-zoom-slider"
                    />
                    <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1, value + 0.18))} data-testid="viewer-zoom-in">
                      <ZoomIn size={18} />
                    </button>
                  </div>
                  <span>Drag to rotate. Scroll or pinch to zoom.</span>
                </>
              )}
              {isEditingSpriteSheet && (
                <button className="secondary-button active-tool" onClick={() => setEditorMode('browse')} data-testid="close-sprite-editor">
                  <Eye size={18} />
                  Browse Moves
                </button>
              )}
            </div>
            <div className="viewer-action-row editor-control-row">
              <div className="editing-title">
                <span>{isEditingSpriteSheet ? 'Editing Spritesheet' : isEditingAnimation ? 'Editing' : 'Selected'}</span>
                <strong>
                  <NotationGroup tokens={selectedSlot.notation} />
                  {isEditingSpriteSheet ? `Frame ${selectedSpriteFrameIndex}` : formatMoveSlotLabel(selectedSlot, selectedMove)}
                </strong>
                <small>{isEditingSpriteSheet ? selectedSpriteFramePath : formatFrameSummary(selectedMove)}</small>
              </div>
              {(isEditingAnimation || isEditingEffectsLibrary || isEditingMoveEffects) && (
                <div className="frame-picker-actions">
                  {isEditingAnimation && (
                    <>
                      <label className="speed-control">
                        <span>FPS</span>
                        <input
                          aria-label={`${selectedSlot.label} animation speed`}
                          type="range"
                          min="1"
                          max="24"
                          step="0.5"
                          value={selectedSpeed}
                          onChange={(event) => updateSelectedSpeed(Number(event.target.value))}
                          data-testid="animation-speed-slider"
                        />
                        <input
                          aria-label={`${selectedSlot.label} animation speed value`}
                          type="number"
                          min="1"
                          max="24"
                          step="0.5"
                          value={selectedSpeed}
                          onChange={(event) => updateSelectedSpeed(Number(event.target.value))}
                          data-testid="animation-speed-input"
                        />
                      </label>
                      <button className="secondary-button compact-button" onClick={() => updateSelectedFrames([...selectedFrames].reverse())}>
                        Reverse
                      </button>
                      <button className="secondary-button compact-button" onClick={resetSelectedAnimation}>
                        Reset
                      </button>
                      <label className="sprite-sheet-toggle">
                        <input
                          type="checkbox"
                          checked={showSpriteSheetPreview}
                          onChange={(event) => setShowSpriteSheetPreview(event.target.checked)}
                        />
                        <span>Show spritesheet</span>
                      </label>
                    </>
                  )}
                  <button
                    className="secondary-button compact-button dev-save-button"
                    onClick={isEditingEffectsLibrary || isEditingMoveEffects ? () => saveEffectsToDev() : saveActiveManifest}
                    disabled={manifestSaveStatus === 'saving' || effectSaveStatus === 'saving'}
                    data-testid="save-character-manifest"
                  >
                    <Save size={14} />
                    {manifestSaveStatus === 'saving' || effectSaveStatus === 'saving' ? 'Saving' : 'Save JSON'}
                  </button>
                  {(manifestSaveStatus !== 'idle' || effectSaveStatus !== 'idle') && (
                    <span className={`manifest-save-status is-${manifestSaveStatus}`}>
                      {manifestSaveStatus === 'saved' || effectSaveStatus === 'saved'
                        ? 'Saved to manifest'
                        : manifestSaveStatus === 'error' || effectSaveStatus === 'error'
                          ? 'Save failed'
                          : 'Writing'}
                    </span>
                  )}
                  {hdVoxelStatus !== 'idle' && (
                    <span className={`manifest-save-status is-${hdVoxelStatus === 'saved' ? 'saved' : hdVoxelStatus === 'error' ? 'error' : 'saving'}`}>
                      {hdVoxelStatus === 'building'
                        ? `HD ${hdVoxelProgress.completed}/${hdVoxelProgress.total}`
                        : hdVoxelStatus === 'saved'
                          ? 'HD voxels saved'
                          : 'HD build failed'}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {isEditingSpriteSheet ? (
            <SpriteSheetFrameEditor
              character={active}
              frameBank={frameBank}
              spriteSheets={spriteSheets}
              frameMeta={spriteFrameMeta}
              selectedFrameIndex={selectedSpriteFrameIndex}
              selectedFrames={selectedFrames}
              selectedFrameSet={selectedFrameSet}
              saveStatus={spriteSaveStatus}
              importStatus={spriteSheetImportStatus}
              onSelectFrame={setSelectedSpriteFrameIndex}
              onToggleFrame={toggleFrame}
              onCreateFrame={createSpriteFrame}
              onSave={saveSpriteFrame}
              onImportSpriteSheet={importAdditionalSpriteSheet}
            />
          ) : isEditingEffectsLibrary ? (
            <EffectsLibraryEditor
              character={active}
              effects={effects}
              selectedEffect={selectedEffect}
              selectedFrameIndex={selectedEffectFrameIndex}
              importStatus={effectImportStatus}
              saveStatus={effectSaveStatus}
              frameSaveStatus={effectFrameSaveStatus}
              onSelectEffect={setSelectedEffectId}
              onSelectFrame={setSelectedEffectFrameIndex}
              onAddBlankEffect={addBlankEffect}
              onDeleteEffect={deleteEffect}
              onUpdateEffect={updateEffect}
              onImportSpriteSheet={importEffectSpriteSheet}
              onImportSound={importEffectSound}
              onSaveFrame={saveEffectFrame}
              onDeleteFrame={deleteEffectFrame}
              onSave={() => saveEffectsToDev()}
            />
          ) : isEditingMoveEffects ? (
            <MoveEffectsEditor
              character={previewCharacter}
              selectedSlot={selectedSlot}
              animationKey={selectedSlotDataKey}
              previewMove={selectedMove}
              effects={effects}
              instances={selectedMoveEffectInstances}
              timelineFrame={effectTimelineFrame}
              totalFrames={selectedMoveTotalFrames}
              onTimelineFrameChange={setEffectTimelineFrame}
              onAttachEffect={attachSelectedEffectToMove}
              onUpdateInstances={updateMoveEffectInstances}
            />
          ) : isEditingAnimation ? (
            <section className="frame-picker inline-frame-editor" aria-label="Animation frame picker">
              {selectedMove && (
                <FrameDataEditor move={selectedMove} onChange={updateSelectedMoveOverride} />
              )}
              {showSpriteSheetPreview && active.spriteSheetPath && (
                <div className="sprite-sheet-stage">
                  <span>{active.spriteSheetPath}</span>
                  <img className="sprite-sheet-preview" src={active.spriteSheetPath} alt={`${active.displayName} sprite sheet`} />
                </div>
              )}
              <div className="selected-frame-strip" aria-label="Selected frames">
                {selectedFrames.map((frame, index) => (
                  <button key={`${frame}-${index}`} onClick={() => toggleFrame(frame)} title={`Remove frame ${getFrameIndex(frame)}`}>
                    <img src={frame} alt={`Selected frame ${getFrameIndex(frame)}`} />
                    <span>{getFrameIndex(frame)}</span>
                  </button>
                ))}
              </div>
              <div className="frame-bank" aria-label="All extracted frames">
                {frameBank.map((frame) => (
                  <button
                    key={frame}
                    className={selectedFrameSet.has(frame) ? 'active' : ''}
                    onClick={() => toggleFrame(frame)}
                    title={`Frame ${getFrameIndex(frame)}`}
                  >
                    <img src={frame} alt={`Frame ${getFrameIndex(frame)}`} loading="lazy" />
                    <span>{getFrameIndex(frame)}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <div
              className={`animation-grid ${slotCategory === 'stance' ? 'is-stance-grid' : 'is-command-grid'}`}
              aria-label="Animation previews"
              tabIndex={0}
              onKeyDown={handleMoveGridKeyDown}
            >
              <div className="command-toolbar">
                <CommandCategorySelect value={slotCategory} onChange={setSlotCategory} />
                <input
                  aria-label="Search move slots"
                  placeholder="Search notation"
                  value={slotSearch}
                  onChange={(event) => setSlotSearch(event.target.value)}
                />
              </div>
              {visibleSlots.map((option, index) => {
                const move = resolveSlotMove(active, option);
                const label = formatMoveSlotLabel(option, move);
                return (
                  <button
                    key={option.key}
                    className={selectedSlot.key === option.key ? 'active' : ''}
                    onClick={() => setSelectedAnimationKey(option.key)}
                    title={label}
                    data-viewer-slot-index={index}
                    data-testid={`viewer-pose-${option.key}`}
                  >
                    <NotationGroup tokens={option.notation} />
                    {label}
                    <small>{formatFrameSummary(move)}</small>
                  </button>
                );
              })}
            </div>
          )}
        </article>
      </div>
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back
      </button>
    </div>
  );
}

function EffectsLibraryEditor({
  character,
  effects,
  selectedEffect,
  selectedFrameIndex,
  importStatus,
  saveStatus,
  frameSaveStatus,
  onSelectEffect,
  onSelectFrame,
  onAddBlankEffect,
  onDeleteEffect,
  onUpdateEffect,
  onImportSpriteSheet,
  onImportSound,
  onSaveFrame,
  onDeleteFrame,
  onSave
}: {
  character: CharacterDefinition;
  effects: CharacterEffectDefinition[];
  selectedEffect: CharacterEffectDefinition | null;
  selectedFrameIndex: number;
  importStatus: 'idle' | 'working' | 'saved' | 'error';
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  frameSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSelectEffect: (effectId: string) => void;
  onSelectFrame: (frameIndex: number) => void;
  onAddBlankEffect: () => void;
  onDeleteEffect: (effectId: string) => void;
  onUpdateEffect: (effectId: string, patch: Partial<CharacterEffectDefinition>) => void;
  onImportSpriteSheet: (file: File | undefined) => void;
  onImportSound: (file: File | undefined, effectId: string) => void;
  onSaveFrame: (effectId: string, edit: SpriteFrameEdit, pngDataUrl: string) => Promise<void>;
  onDeleteFrame: (effectId: string, frameIndex: number) => Promise<void>;
  onSave: () => void;
}) {
  return (
    <section className="effects-editor" aria-label="Character effects library">
      <aside className="effects-rail">
        <div className="effects-editor-toolbar">
          <label className="secondary-button compact-button file-button">
            <Upload size={14} />
            Import Sheet
            <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => onImportSpriteSheet(event.target.files?.[0])} />
          </label>
          <button className="secondary-button compact-button" onClick={onAddBlankEffect}>New</button>
        </div>
        {effects.length === 0 ? (
          <p className="effects-empty">Import an effect sprite sheet or create a procedural effect.</p>
        ) : effects.map((effect) => (
          <button
            key={effect.id}
            className={`effect-card ${selectedEffect?.id === effect.id ? 'is-selected' : ''}`}
            onClick={() => onSelectEffect(effect.id)}
          >
            {effect.frames?.[0] ? <img src={effect.frames[0]} alt="" /> : <span>{effect.proceduralLayers?.[0]?.kind ?? 'FX'}</span>}
            <strong>{effect.name}</strong>
            <small>{effect.frames?.length ?? 0} frames / {effect.fps} FPS</small>
          </button>
        ))}
      </aside>
      <div className="effects-detail">
        {selectedEffect ? (
          <>
            <header className="effects-detail-header">
              <div>
                <span>Effect Library</span>
                <strong>{selectedEffect.name}</strong>
                <small>{selectedEffect.id}</small>
              </div>
              <div className="effects-editor-toolbar">
                <label className="secondary-button compact-button file-button">
                  <Upload size={14} />
                  Add Sound
                  <input type="file" accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/webm" onChange={(event) => onImportSound(event.target.files?.[0], selectedEffect.id)} />
                </label>
                <button className="secondary-button compact-button" onClick={() => onDeleteEffect(selectedEffect.id)}>Delete</button>
                <button className="secondary-button compact-button dev-save-button" onClick={onSave} disabled={saveStatus === 'saving'}>
                  <Save size={14} />
                  Save
                </button>
              </div>
            </header>
            <div className="effects-form-grid">
              <label>
                <span>Name</span>
                <input value={selectedEffect.name} onChange={(event) => onUpdateEffect(selectedEffect.id, { name: event.target.value })} />
              </label>
              <FrameNumberInput label="FPS" value={selectedEffect.fps} min={1} max={60} onChange={(value) => onUpdateEffect(selectedEffect.id, { fps: Number(value) })} />
              <label>
                <span>Blend</span>
                <select value={selectedEffect.blendMode} onChange={(event) => onUpdateEffect(selectedEffect.id, { blendMode: event.target.value as EffectBlendMode })}>
                  <option value="normal">Normal</option>
                  <option value="additive">Additive</option>
                  <option value="screen">Screen</option>
                </select>
              </label>
              <label>
                <span>Anchor</span>
                <select value={selectedEffect.anchor} onChange={(event) => onUpdateEffect(selectedEffect.id, { anchor: event.target.value as EffectAnchor })}>
                  {effectAnchorOptions.map((anchor) => <option key={anchor} value={anchor}>{anchor}</option>)}
                </select>
              </label>
              <label className="frame-toggle">
                <span>Loop</span>
                <input type="checkbox" checked={selectedEffect.loop} onChange={(event) => onUpdateEffect(selectedEffect.id, { loop: event.target.checked })} />
              </label>
              <label className="frame-toggle">
                <span>Billboard</span>
                <input type="checkbox" checked={selectedEffect.billboard} onChange={(event) => onUpdateEffect(selectedEffect.id, { billboard: event.target.checked })} />
              </label>
            </div>
            <EffectTransformEditor
              title="Default Transform"
              keyframe={{ frame: 0, ...selectedEffect.defaultTransform }}
              onChange={(keyframe) => onUpdateEffect(selectedEffect.id, { defaultTransform: keyframeToTransform(keyframe) })}
            />
            <div className="effect-preview-strip">
              {(selectedEffect.frames ?? []).slice(0, 16).map((frame, index) => (
                <button
                  key={`${frame}-${index}`}
                  className={selectedFrameIndex === index ? 'active' : ''}
                  onClick={() => onSelectFrame(index)}
                  title={`Edit effect frame ${index}`}
                >
                  <img src={frame} alt={`Effect frame ${index}`} />
                  <span>{index}</span>
                </button>
              ))}
              {(selectedEffect.frames?.length ?? 0) === 0 && (
                <span className="effects-empty">Procedural-only: {(selectedEffect.proceduralLayers ?? []).map((layer) => layer.kind).join(', ') || 'glow'}</span>
              )}
            </div>
            {selectedEffect.spriteSheetPath && (
              <EffectSpriteFrameEditor
                characterId={character.id}
                effect={selectedEffect}
                selectedFrameIndex={selectedFrameIndex}
                saveStatus={frameSaveStatus}
                onSelectFrame={onSelectFrame}
                onUpdateEffect={onUpdateEffect}
                onSaveFrame={onSaveFrame}
                onDeleteFrame={onDeleteFrame}
              />
            )}
            <EffectSoundCueList
              cues={selectedEffect.soundCues}
              onChange={(soundCues) => onUpdateEffect(selectedEffect.id, { soundCues })}
            />
          </>
        ) : (
          <p className="effects-empty">Create or import an effect to edit it.</p>
        )}
        {importStatus !== 'idle' && <small className={`manifest-save-status is-${importStatus === 'error' ? 'error' : importStatus === 'saved' ? 'saved' : 'saving'}`}>{importStatus}</small>}
      </div>
    </section>
  );
}

function createDefaultEffectFrameEdit(characterId: string, effect: CharacterEffectDefinition, frameIndex: number): SpriteFrameEdit {
  const existing = effect.effectFrameEdits?.[String(frameIndex)];
  if (existing) {
    return sanitizeSpriteFrameEdit({
      ...existing,
      index: frameIndex,
      path: effectFramePath(characterId, effect.id, frameIndex),
      sheetId: 'source',
      sheetPath: effect.spriteSheetPath ?? existing.sheetPath,
      sourceName: effect.name
    });
  }
  return sanitizeSpriteFrameEdit({
    index: frameIndex,
    path: effectFramePath(characterId, effect.id, frameIndex),
    sourceMode: 'sheet',
    sheetId: 'source',
    sheetPath: effect.spriteSheetPath,
    sourceName: effect.name,
    box: [0, 0, 64, 64],
    width: 64,
    height: 64,
    row: 0,
    rotation: 0,
    offset: [0, 0],
    scale: 1
  });
}

function effectFramePath(characterId: string, effectId: string, frameIndex: number) {
  return `/characters/${characterId}/effects/${effectId}/frames/frame-${frameIndex.toString().padStart(3, '0')}.png`;
}

function EffectSpriteFrameEditor({
  characterId,
  effect,
  selectedFrameIndex,
  saveStatus,
  onSelectFrame,
  onUpdateEffect,
  onSaveFrame,
  onDeleteFrame
}: {
  characterId: string;
  effect: CharacterEffectDefinition;
  selectedFrameIndex: number;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSelectFrame: (frameIndex: number) => void;
  onUpdateEffect: (effectId: string, patch: Partial<CharacterEffectDefinition>) => void;
  onSaveFrame: (effectId: string, edit: SpriteFrameEdit, pngDataUrl: string) => Promise<void>;
  onDeleteFrame: (effectId: string, frameIndex: number) => Promise<void>;
}) {
  const sheetRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef<{
    mode: string;
    startPointer: [number, number];
    startBox: [number, number, number, number];
  } | null>(null);
  const [sheetSize, setSheetSize] = useState({ width: 1, height: 1 });
  const [edit, setEdit] = useState<SpriteFrameEdit>(() => createDefaultEffectFrameEdit(characterId, effect, selectedFrameIndex));
  const frames = effect.frames ?? [];
  const framePathValue = frames[selectedFrameIndex] ?? effectFramePath(characterId, effect.id, selectedFrameIndex);
  const cropWidth = Math.max(1, edit.box[2] - edit.box[0]);
  const cropHeight = Math.max(1, edit.box[3] - edit.box[1]);
  const pngWidth = Math.max(1, Math.round(edit.width || cropWidth));
  const pngHeight = Math.max(1, Math.round(edit.height || cropHeight));

  useEffect(() => {
    const baseEdit = createDefaultEffectFrameEdit(characterId, effect, selectedFrameIndex);
    setEdit(clampSpriteFrameEditToSheet(baseEdit, sheetSize));
  }, [characterId, effect, selectedFrameIndex, sheetSize]);

  useEffect(() => {
    renderSpriteFrameCanvas(sheetRef.current, canvasRef.current, edit);
  }, [edit, sheetSize]);

  const patchEdit = (patch: Partial<SpriteFrameEdit>) => {
    setEdit((current) => clampSpriteFrameEditToSheet(sanitizeSpriteFrameEdit({
      ...current,
      ...patch,
      index: selectedFrameIndex,
      path: effectFramePath(characterId, effect.id, selectedFrameIndex),
      sourceMode: 'sheet',
      sheetId: 'source',
      sheetPath: effect.spriteSheetPath,
      sourceName: effect.name
    }), sheetSize));
  };

  const pointerToSheetPoint = (event: ReactPointerEvent): [number, number] => {
    const image = sheetRef.current;
    if (!image) return [0, 0];
    const rect = image.getBoundingClientRect();
    return [
      clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * sheetSize.width, 0, sheetSize.width),
      clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * sheetSize.height, 0, sheetSize.height)
    ];
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLElement>, mode: string) => {
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      mode,
      startPointer: pointerToSheetPoint(event),
      startBox: [...edit.box]
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    event.preventDefault();
    const [pointerX, pointerY] = pointerToSheetPoint(event);
    const dx = Math.round(pointerX - drag.startPointer[0]);
    const dy = Math.round(pointerY - drag.startPointer[1]);
    const [x1, y1, x2, y2] = drag.startBox;
    let nextBox: [number, number, number, number];
    if (drag.mode === 'move') {
      nextBox = moveSpriteFrameBoxWithinSheet(drag.startBox, dx, dy, sheetSize);
    } else {
      const movesLeft = drag.mode.includes('w');
      const movesRight = drag.mode.includes('e');
      const movesTop = drag.mode.includes('n');
      const movesBottom = drag.mode.includes('s');
      nextBox = [
        movesLeft ? clamp(x1 + dx, 0, x2 - 1) : x1,
        movesTop ? clamp(y1 + dy, 0, y2 - 1) : y1,
        movesRight ? clamp(x2 + dx, x1 + 1, sheetSize.width) : x2,
        movesBottom ? clamp(y2 + dy, y1 + 1, sheetSize.height) : y2
      ];
    }
    patchEdit({ box: nextBox, width: nextBox[2] - nextBox[0], height: nextBox[3] - nextBox[1] });
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!cropDragRef.current) return;
    cropDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const updateBox = (key: 'x' | 'y' | 'width' | 'height', value: string) => {
    const numeric = Math.max(0, Math.round(Number(value) || 0));
    const [x1, y1, x2, y2] = edit.box;
    if (key === 'x') patchEdit({ box: [numeric, y1, numeric + cropWidth, y2] });
    if (key === 'y') patchEdit({ box: [x1, numeric, x2, numeric + cropHeight] });
    if (key === 'width') patchEdit({ box: [x1, y1, x1 + Math.max(1, numeric), y2] });
    if (key === 'height') patchEdit({ box: [x1, y1, x2, y1 + Math.max(1, numeric)] });
  };

  const fitVisibleCrop = () => {
    const fitted = fitSpriteFrameToVisiblePixels(sheetRef.current, edit);
    if (fitted) setEdit(clampSpriteFrameEditToSheet(fitted, sheetSize));
  };

  const createNewFrame = () => {
    const nextIndex = Math.max(frames.length, ...Object.keys(effect.effectFrameEdits ?? {}).map((key) => Number(key) + 1).filter(Number.isFinite));
    const nextPath = effectFramePath(characterId, effect.id, nextIndex);
    const nextFrames = [...frames];
    nextFrames[nextIndex] = nextPath;
    const nextEdit = sanitizeSpriteFrameEdit({
      ...edit,
      index: nextIndex,
      path: nextPath,
      width: cropWidth,
      height: cropHeight,
      sourceMode: 'sheet',
      sourceName: effect.name,
      sheetId: 'source',
      sheetPath: effect.spriteSheetPath
    });
    onUpdateEffect(effect.id, {
      frames: nextFrames,
      effectFrameEdits: {
        ...(effect.effectFrameEdits ?? {}),
        [String(nextIndex)]: nextEdit
      }
    });
    onSelectFrame(nextIndex);
  };

  const saveFrame = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const nextEdit = clearReplacementFrameEdit({
      ...sanitizeSpriteFrameEdit(edit),
      path: effectFramePath(characterId, effect.id, selectedFrameIndex),
      width: canvas.width,
      height: canvas.height,
      sheetId: 'source',
      sheetPath: effect.spriteSheetPath,
      sourceName: effect.name,
      revision: (edit.revision ?? 0) + 1
    });
    await onSaveFrame(effect.id, nextEdit, canvas.toDataURL('image/png'));
  };

  const deleteFrame = async () => {
    if (frames.length === 0 || selectedFrameIndex >= frames.length) return;
    await onDeleteFrame(effect.id, selectedFrameIndex);
  };

  return (
    <section className="sprite-crop-editor effect-frame-editor" aria-label="Effect spritesheet crop editor">
      <div className="sprite-crop-stage">
        <div className="sprite-sheet-crop-map">
          <div className="sprite-sheet-library" aria-label="Effect frames">
            <strong>{effect.name} Sheet</strong>
            <button className="secondary-button compact-button" onClick={createNewFrame}>New Frame</button>
            <button className="secondary-button compact-button" onClick={fitVisibleCrop}>Fit Visible</button>
            <button
              className="secondary-button compact-button danger-button"
              onClick={deleteFrame}
              disabled={saveStatus === 'saving' || frames.length === 0 || selectedFrameIndex >= frames.length}
            >
              <Trash2 size={14} />
              Delete Frame
            </button>
            <button className="secondary-button compact-button dev-save-button" onClick={saveFrame} disabled={saveStatus === 'saving'}>
              <Save size={14} />
              {saveStatus === 'saving' ? 'Saving' : 'Save Frame'}
            </button>
            {saveStatus !== 'idle' && (
              <span className={`manifest-save-status is-${saveStatus}`}>
                {saveStatus === 'saved' ? 'Saved effect frame' : saveStatus === 'error' ? 'Save failed' : 'Writing'}
              </span>
            )}
          </div>
          <div className="sprite-sheet-crop-content">
            <img
              ref={sheetRef}
              src={effect.spriteSheetPath}
              alt={`${effect.name} effect crop map`}
              onLoad={(event) => {
                const image = event.currentTarget;
                const nextSize = { width: image.naturalWidth || 1, height: image.naturalHeight || 1 };
                setSheetSize(nextSize);
                setEdit(clampSpriteFrameEditToSheet(createDefaultEffectFrameEdit(characterId, effect, selectedFrameIndex), nextSize));
              }}
            />
            <div
              className="sprite-crop-box"
              onPointerDown={(event) => beginCropDrag(event, 'move')}
              onPointerMove={updateCropDrag}
              onPointerUp={endCropDrag}
              onPointerCancel={endCropDrag}
              style={{
                left: `${(edit.box[0] / sheetSize.width) * 100}%`,
                top: `${(edit.box[1] / sheetSize.height) * 100}%`,
                width: `${((edit.box[2] - edit.box[0]) / sheetSize.width) * 100}%`,
                height: `${((edit.box[3] - edit.box[1]) / sheetSize.height) * 100}%`
              }}
            >
              {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                <span
                  key={handle}
                  className={`sprite-crop-handle handle-${handle}`}
                  onPointerDown={(event) => beginCropDrag(event, handle)}
                  onPointerMove={updateCropDrag}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="sprite-crop-preview-panel">
          <span>Effect Crop</span>
          <canvas ref={canvasRef} className="sprite-crop-canvas" aria-label={`Effect frame ${selectedFrameIndex}`} />
          <strong>{`Frame ${selectedFrameIndex}`}</strong>
          <small>{`${cropWidth} x ${cropHeight} crop | ${pngWidth} x ${pngHeight} PNG`}</small>
          <small>{framePathValue}</small>
        </div>
      </div>
      <div className="sprite-crop-controls">
        <div className="sprite-crop-fields">
          <FrameNumberInput label="Crop X" value={edit.box[0]} min={0} onChange={(value) => updateBox('x', value)} />
          <FrameNumberInput label="Crop Y" value={edit.box[1]} min={0} onChange={(value) => updateBox('y', value)} />
          <FrameNumberInput label="Crop W" value={cropWidth} min={1} onChange={(value) => updateBox('width', value)} />
          <FrameNumberInput label="Crop H" value={cropHeight} min={1} onChange={(value) => updateBox('height', value)} />
          <FrameNumberInput label="PNG W" value={pngWidth} min={1} onChange={(value) => patchEdit({ width: Math.max(1, Math.round(Number(value) || 1)) })} />
          <FrameNumberInput label="PNG H" value={pngHeight} min={1} onChange={(value) => patchEdit({ height: Math.max(1, Math.round(Number(value) || 1)) })} />
          <FrameNumberInput label="Offset X" value={edit.offset?.[0] ?? 0} onChange={(value) => patchEdit({ offset: [Math.round(Number(value) || 0), edit.offset?.[1] ?? 0] })} />
          <FrameNumberInput label="Offset Y" value={edit.offset?.[1] ?? 0} onChange={(value) => patchEdit({ offset: [edit.offset?.[0] ?? 0, Math.round(Number(value) || 0)] })} />
          <FrameNumberInput label="Scale" value={edit.scale ?? 1} min={0.25} step={0.05} onChange={(value) => patchEdit({ scale: Number(value) || 1 })} />
          <FrameNumberInput label="Rotation" value={edit.rotation ?? 0} step={90} onChange={(value) => patchEdit({ rotation: normalizeRotation(Number(value) || 0) })} />
        </div>
        <div className="sprite-crop-button-grid">
          <button className="secondary-button compact-button" onClick={() => onSelectFrame(Math.max(0, selectedFrameIndex - 1))}>Prev</button>
          <button className="secondary-button compact-button" onClick={() => onSelectFrame(Math.min(Math.max(0, frames.length - 1), selectedFrameIndex + 1))}>Next</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ box: moveSpriteFrameBoxWithinSheet(edit.box, -1, 0, sheetSize) })}>Crop Left</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ box: moveSpriteFrameBoxWithinSheet(edit.box, 1, 0, sheetSize) })}>Crop Right</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ box: moveSpriteFrameBoxWithinSheet(edit.box, 0, -1, sheetSize) })}>Crop Up</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ box: moveSpriteFrameBoxWithinSheet(edit.box, 0, 1, sheetSize) })}>Crop Down</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ scale: Math.max(0.25, Number(((edit.scale ?? 1) - 0.05).toFixed(2))) })}>Shrink Sprite</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ scale: Math.min(4, Number(((edit.scale ?? 1) + 0.05).toFixed(2))) })}>Grow Sprite</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ offset: [0, 0] })}>Center</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ width: cropWidth, height: cropHeight })}>Fit PNG</button>
        </div>
      </div>
      <div className="sprite-frame-bank effect-frame-bank" aria-label="Effect frame bank">
        {frames.map((frame, index) => (
          <button
            key={`${frame}-${index}`}
            className={index === selectedFrameIndex ? 'active' : ''}
            onClick={() => onSelectFrame(index)}
          >
            <img src={frame} alt={`Effect frame ${index}`} loading="lazy" />
            <span>{index}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MoveEffectsEditor({
  character,
  selectedSlot,
  animationKey,
  previewMove,
  effects,
  instances,
  timelineFrame,
  totalFrames,
  onTimelineFrameChange,
  onAttachEffect,
  onUpdateInstances
}: {
  character: CharacterDefinition;
  selectedSlot: AnimationSlot;
  animationKey: string;
  previewMove?: MoveDefinition | null;
  effects: CharacterEffectDefinition[];
  instances: MoveEffectInstance[];
  timelineFrame: number;
  totalFrames: number;
  onTimelineFrameChange: (frame: number) => void;
  onAttachEffect: (effectId: string) => void;
  onUpdateInstances: (instances: MoveEffectInstance[]) => void;
}) {
  const [effectToAttach, setEffectToAttach] = useState(effects[0]?.id ?? '');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  useEffect(() => {
    if (!effectToAttach && effects[0]) setEffectToAttach(effects[0].id);
  }, [effectToAttach, effects]);

  useEffect(() => {
    if (!isPreviewPlaying) return;
    const interval = window.setInterval(() => {
      onTimelineFrameChange((timelineFrame + 1) % Math.max(1, totalFrames + 1));
    }, 1000 / 60);
    return () => window.clearInterval(interval);
  }, [isPreviewPlaying, onTimelineFrameChange, timelineFrame, totalFrames]);

  const updateInstance = (instanceId: string, patch: Partial<MoveEffectInstance>) => {
    onUpdateInstances(instances.map((instance) => (instance.id === instanceId ? sanitizeMoveEffects({ slot: [{ ...instance, ...patch }] }).slot[0] : instance)));
  };

  const createMoveEffectKeyframe = (frame: number, effect?: CharacterEffectDefinition | null): EffectKeyframe => ({
    frame: Math.max(0, Math.round(frame)),
    endFrame: Math.max(0, Math.round(frame)),
    position: effect?.defaultTransform.position ?? [0, 1.1, 0.55],
    scale: effect?.defaultTransform.scale ?? [1, 1, 1],
    rotation: effect?.defaultTransform.rotation ?? [0, 0, 0],
    opacity: effect?.defaultTransform.opacity ?? 1,
    color: effect?.defaultTransform.color ?? '#ffffff'
  });

  const keyframesForEdit = (instance: MoveEffectInstance, effect?: CharacterEffectDefinition | null) => (
    instance.keyframes.length > 0 ? instance.keyframes : [createMoveEffectKeyframe(0, effect)]
  );

  const updateKeyframe = (instanceId: string, index: number, keyframe: EffectKeyframe, effect?: CharacterEffectDefinition | null) => {
    const instance = instances.find((entry) => entry.id === instanceId);
    if (!instance) return;
    const keyframes = keyframesForEdit(instance, effect).map((entry, entryIndex) => (entryIndex === index ? keyframe : entry));
    updateInstance(instanceId, { keyframes });
  };

  const resetKeyframe = (instanceId: string, index: number, effect?: CharacterEffectDefinition | null) => {
    const instance = instances.find((entry) => entry.id === instanceId);
    if (!instance) return;
    const keyframes = keyframesForEdit(instance, effect).map((entry, entryIndex) => (
      entryIndex === index ? { ...createMoveEffectKeyframe(entry.frame, effect), endFrame: entry.endFrame ?? entry.frame } : entry
    ));
    updateInstance(instanceId, { keyframes });
  };

  const deleteKeyframe = (instanceId: string, index: number, effect?: CharacterEffectDefinition | null) => {
    const instance = instances.find((entry) => entry.id === instanceId);
    if (!instance) return;
    const keyframes = keyframesForEdit(instance, effect).filter((_, entryIndex) => entryIndex !== index);
    updateInstance(instanceId, { keyframes });
  };

  return (
    <section className="effects-editor move-effects-editor" aria-label="Move effects editor">
      <aside className="effects-rail">
        <div className="editing-title compact">
          <span>Move Effects</span>
          <strong><NotationGroup tokens={selectedSlot.notation} /> {selectedSlot.label}</strong>
          <small>{animationKey}</small>
        </div>
        <label>
          <span>Attach Library Effect</span>
          <select value={effectToAttach} onChange={(event) => setEffectToAttach(event.target.value)}>
            {effects.map((effect) => <option key={effect.id} value={effect.id}>{effect.name}</option>)}
          </select>
        </label>
        <button className="secondary-button" disabled={!effectToAttach} onClick={() => onAttachEffect(effectToAttach)}>Attach Effect</button>
        <button className="secondary-button" onClick={() => setIsPreviewPlaying((current) => !current)}>
          {isPreviewPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPreviewPlaying ? 'Pause Preview' : 'Play Preview'}
        </button>
        <label className="speed-control">
          <span>Frame</span>
          <input type="range" min="0" max={Math.max(1, totalFrames)} value={Math.min(timelineFrame, totalFrames)} onChange={(event) => onTimelineFrameChange(Number(event.target.value))} />
          <input type="number" min="0" max={totalFrames} value={timelineFrame} onChange={(event) => onTimelineFrameChange(Number(event.target.value))} />
        </label>
      </aside>
      <div className="effects-detail">
        <div className="move-effect-preview">
          <CharacterPreviewCanvas
            character={character}
            pose={selectedSlot.pose}
            animationKey={animationKey}
            previewMove={previewMove}
            previewEffects={effects}
            previewEffectInstances={instances}
            previewEffectFrame={timelineFrame}
            rotationTurn={0}
            zoom={0.35}
          />
        </div>
        <small className="effects-empty">Use the keyframe sliders below to move effects in 3D space. The preview updates live.</small>
        {instances.length === 0 ? (
          <p className="effects-empty">No effects attached to this move yet.</p>
        ) : instances.map((instance) => {
          const effect = effects.find((candidate) => candidate.id === instance.effectId);
          const transform = effect ? effectTransformAt(effect, instance, timelineFrame) : null;
          return (
            <article key={instance.id} className="move-effect-instance">
              <header>
                <strong>{instance.label ?? effect?.name ?? instance.effectId}</strong>
                <small>{instance.startFrame}-{instance.endFrame ?? totalFrames}f / layer {instance.layer}</small>
                <button className="secondary-button compact-button" onClick={() => onUpdateInstances(instances.filter((entry) => entry.id !== instance.id))}>Remove</button>
              </header>
              <div className="effects-form-grid">
                <FrameNumberInput label="Start" value={instance.startFrame} min={0} onChange={(value) => updateInstance(instance.id, { startFrame: Number(value) })} />
                <FrameNumberInput label="End" value={instance.endFrame ?? totalFrames} min={0} onChange={(value) => updateInstance(instance.id, { endFrame: Number(value) })} />
                <FrameNumberInput label="Layer" value={instance.layer} onChange={(value) => updateInstance(instance.id, { layer: Number(value) })} />
                <label>
                  <span>Anchor</span>
                  <select value={instance.anchor ?? effect?.anchor ?? 'body'} onChange={(event) => updateInstance(instance.id, { anchor: event.target.value as EffectAnchor })}>
                    {effectAnchorOptions.map((anchor) => <option key={anchor} value={anchor}>{anchor}</option>)}
                  </select>
                </label>
                <label className="frame-toggle">
                  <span>Mirror Facing</span>
                  <input type="checkbox" checked={instance.mirrorWithFacing} onChange={(event) => updateInstance(instance.id, { mirrorWithFacing: event.target.checked })} />
                </label>
              </div>
              <div className="effects-keyframes">
                {keyframesForEdit(instance, effect).map((keyframe, index) => (
                  <EffectTransformEditor
                    key={`${instance.id}-${index}`}
                    title={`Keyframe ${index + 1}`}
                    keyframe={keyframe}
                    onChange={(nextKeyframe) => updateKeyframe(instance.id, index, nextKeyframe, effect)}
                    onReset={() => resetKeyframe(instance.id, index, effect)}
                    onDelete={() => deleteKeyframe(instance.id, index, effect)}
                  />
                ))}
                <button
                  className="secondary-button compact-button"
                  onClick={() => updateInstance(instance.id, {
                    keyframes: [...instance.keyframes, { frame: timelineFrame, endFrame: timelineFrame, position: transform?.position ?? [0, 0, 0], scale: transform?.scale ?? [1, 1, 1], rotation: transform?.rotation ?? [0, 0, 0], opacity: transform?.opacity ?? 1, color: transform?.color ?? '#ffffff' }]
                  })}
                >
                  Add Keyframe
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function EffectTransformEditor({
  title,
  keyframe,
  onChange,
  onReset,
  onDelete
}: {
  title: string;
  keyframe: EffectKeyframe;
  onChange: (keyframe: EffectKeyframe) => void;
  onReset?: () => void;
  onDelete?: () => void;
}) {
  const updateVec = (field: 'position' | 'scale' | 'rotation', axis: 0 | 1 | 2, value: string) => {
    const current = keyframe[field] ?? (field === 'scale' ? [1, 1, 1] : [0, 0, 0]);
    const next = [...current] as [number, number, number];
    next[axis] = Number(value);
    onChange({ ...keyframe, [field]: next });
  };
  const updatePositionAxis = (axis: 0 | 1 | 2, value: string) => {
    const position = keyframe.position ?? [0, 1.1, 0.55];
    const next = [...position] as [number, number, number];
    next[axis] = Number(Number(value).toFixed(2));
    onChange({ ...keyframe, position: next });
  };
  const updateStartFrame = (value: number) => {
    const frame = Math.max(0, Math.round(value));
    const endFrame = Math.max(frame, Math.round(keyframe.endFrame ?? keyframe.frame));
    onChange({ ...keyframe, frame, endFrame });
  };
  const updateEndFrame = (value: number) => {
    const endFrame = Math.max(keyframe.frame, Math.round(value));
    onChange({ ...keyframe, endFrame });
  };
  const position = keyframe.position ?? [0, 1.1, 0.55];
  const positionRanges = [
    { label: 'X', min: -4, max: 4 },
    { label: 'Y', min: -1, max: 5 },
    { label: 'Z', min: -4, max: 4 }
  ] as const;
  return (
    <fieldset className="effect-transform-editor">
      <legend>
        <span>{title}</span>
        {(onReset || onDelete) && (
          <span className="keyframe-actions">
            {onReset && <button type="button" className="secondary-button compact-button" onClick={onReset}>Reset</button>}
            {onDelete && <button type="button" className="secondary-button compact-button danger-button" onClick={onDelete}>Delete</button>}
          </span>
        )}
      </legend>
      <div className="effects-form-grid">
        <FrameNumberInput label="Start" value={keyframe.frame} min={0} onChange={(value) => updateStartFrame(Number(value))} />
        <FrameNumberInput label="End" value={keyframe.endFrame ?? keyframe.frame} min={keyframe.frame} onChange={(value) => updateEndFrame(Number(value))} />
        <div className="effect-position-sliders">
          <span>Position</span>
          {positionRanges.map((axisConfig, axis) => (
            <label key={axisConfig.label} className="effect-axis-slider">
              <strong>{axisConfig.label}</strong>
              <input
                type="range"
                min={axisConfig.min}
                max={axisConfig.max}
                step="0.05"
                value={position[axis]}
                onChange={(event) => updatePositionAxis(axis as 0 | 1 | 2, event.target.value)}
                aria-label={`position ${axisConfig.label}`}
              />
              <input
                type="number"
                step="0.05"
                value={position[axis]}
                onChange={(event) => updatePositionAxis(axis as 0 | 1 | 2, event.target.value)}
                aria-label={`position ${axisConfig.label} value`}
              />
            </label>
          ))}
        </div>
        {(['scale', 'rotation'] as const).map((field) => (
          <div className="effect-vector-field" key={field}>
            <span>{capitalize(field)}</span>
            {[0, 1, 2].map((axis) => (
              <input
                key={axis}
                type="number"
                step="0.05"
                value={(keyframe[field] ?? (field === 'scale' ? [1, 1, 1] : [0, 0, 0]))[axis]}
                onChange={(event) => updateVec(field, axis as 0 | 1 | 2, event.target.value)}
                aria-label={`${field} ${axis}`}
              />
            ))}
          </div>
        ))}
        <FrameNumberInput label="Opacity" value={keyframe.opacity ?? 1} min={0} max={1} step={0.05} onChange={(value) => onChange({ ...keyframe, opacity: Number(value) })} />
        <label>
          <span>Color</span>
          <input type="color" value={keyframe.color ?? '#ffffff'} onChange={(event) => onChange({ ...keyframe, color: event.target.value })} />
        </label>
      </div>
    </fieldset>
  );
}

function keyframeToTransform(keyframe: EffectKeyframe): CharacterEffectDefinition['defaultTransform'] {
  return {
    position: keyframe.position ?? [0, 1.1, 0.55],
    scale: keyframe.scale ?? [1, 1, 1],
    rotation: keyframe.rotation ?? [0, 0, 0],
    opacity: keyframe.opacity ?? 1,
    color: keyframe.color ?? '#ffffff'
  };
}

function EffectSoundCueList({ cues, onChange }: { cues: CharacterEffectDefinition['soundCues']; onChange: (cues: NonNullable<CharacterEffectDefinition['soundCues']>) => void }) {
  const safeCues = cues ?? [];
  if (safeCues.length === 0) return <p className="effects-empty">No sound cues yet.</p>;
  return (
    <div className="effect-sound-list">
      {safeCues.map((cue, index) => (
        <div key={cue.id} className="effect-sound-row">
          <strong>{cue.name}</strong>
          <FrameNumberInput label="Frame" value={cue.frame} min={0} onChange={(value) => onChange(safeCues.map((entry, entryIndex) => entryIndex === index ? { ...entry, frame: Number(value) } : entry))} />
          <FrameNumberInput label="Volume" value={cue.volume} min={0} max={1} step={0.05} onChange={(value) => onChange(safeCues.map((entry, entryIndex) => entryIndex === index ? { ...entry, volume: Number(value) } : entry))} />
          <FrameNumberInput label="Pitch" value={cue.pitch} min={0.25} max={3} step={0.05} onChange={(value) => onChange(safeCues.map((entry, entryIndex) => entryIndex === index ? { ...entry, pitch: Number(value) } : entry))} />
          <button className="secondary-button compact-button" onClick={() => onChange(safeCues.filter((_, entryIndex) => entryIndex !== index))}>Remove</button>
        </div>
      ))}
    </div>
  );
}

function FrameDataEditor({ move, onChange }: { move: MoveDefinition; onChange: (patch: MoveOverride) => void }) {
  const isLauncher = (move.launchHeight ?? 0) > 0;
  const launchVelocity = move.launchVelocity ?? defaultLaunchVelocity(move.launchHeight ?? 0);
  const juggleRefloatVelocity = move.juggleRefloatVelocity ?? defaultJuggleRefloatVelocity(move.launchHeight ?? 0);
  const juggleGravityScale = move.juggleGravityScale ?? 0.52;
  const totalFrames = move.startupFrames + move.activeFrames + move.recoveryFrames;
  const forwardForceStart = move.forwardForceStartFrame ?? 1;
  const forwardForceEnd = move.forwardForceEndFrame ?? totalFrames;
  const resultLabel = [move.knockdown ? 'KD' : isLauncher ? 'Launch' : signedFrame(move.onHitFrames), move.tornado ? 'T!' : null].filter(Boolean).join(' / ');
  const updateNumber = (key: keyof MoveOverride, value: string, min = Number.NEGATIVE_INFINITY) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    onChange({ [key]: Math.max(min, numeric) } as MoveOverride);
  };

  return (
    <section className="frame-data-editor" aria-label="Frame data editor">
      <header>
        <span>Frame Data</span>
        <strong>{`i${move.startupFrames} / ${signedFrame(move.onBlockFrames)} / ${resultLabel}`}</strong>
        <small>{move.startupFrames + move.activeFrames + move.recoveryFrames} total frames</small>
      </header>
      <div className="frame-data-grid">
        <FrameNumberInput label="Startup" value={move.startupFrames} min={1} onChange={(value) => updateNumber('startupFrames', value, 1)} />
        <FrameNumberInput label="Active" value={move.activeFrames} min={1} onChange={(value) => updateNumber('activeFrames', value, 1)} />
        <FrameNumberInput label="Recovery" value={move.recoveryFrames} min={1} onChange={(value) => updateNumber('recoveryFrames', value, 1)} />
        <FrameNumberInput label="On Block" value={move.onBlockFrames} onChange={(value) => updateNumber('onBlockFrames', value)} />
        <FrameNumberInput label="On Hit" value={move.onHitFrames} onChange={(value) => updateNumber('onHitFrames', value)} />
        <FrameNumberInput label="Counter Hit" value={move.onCounterHitFrames} onChange={(value) => updateNumber('onCounterHitFrames', value)} />
        <FrameNumberInput label="Damage" value={move.damage} min={1} onChange={(value) => updateNumber('damage', value, 1)} />
        <FrameNumberInput label="Block Dmg" value={move.blockDamage} min={0} onChange={(value) => updateNumber('blockDamage', value, 0)} />
        <label>
          <span>Hit Level</span>
          <select value={move.hitLevel} onChange={(event) => onChange({ hitLevel: event.target.value as HitLevel })}>
            {hitLevelOptions.map((option) => (
              <option key={option} value={option}>{capitalize(option)}</option>
            ))}
          </select>
        </label>
        <FrameNumberInput label="Range" value={move.range} min={0.1} step={0.05} onChange={(value) => updateNumber('range', value, 0.1)} />
        <FrameNumberInput label="Forward Force" value={move.forwardForce ?? 0} step={0.05} onChange={(value) => updateNumber('forwardForce', value)} />
        <FrameNumberInput label="Force Start" value={forwardForceStart} min={1} onChange={(value) => updateNumber('forwardForceStartFrame', value, 1)} />
        <FrameNumberInput label="Force End" value={forwardForceEnd} min={1} onChange={(value) => updateNumber('forwardForceEndFrame', value, 1)} />
        <FrameNumberInput label="Pushback" value={move.pushback} min={0} step={0.05} onChange={(value) => updateNumber('pushback', value, 0)} />
        <FrameNumberInput label="Block Push" value={move.blockPushback} min={0} step={0.05} onChange={(value) => updateNumber('blockPushback', value, 0)} />
        <label>
          <span>Tracking</span>
          <select value={move.tracking} onChange={(event) => onChange({ tracking: event.target.value as MoveTracking })}>
            {trackingOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="frame-toggle">
          <span>Launcher</span>
          <input
            type="checkbox"
            checked={isLauncher}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? {
                      launchHeight: Math.max(move.launchHeight ?? 0, 2.2),
                      launchVelocity,
                      juggleRefloatVelocity,
                      juggleGravityScale
                    }
                  : { launchHeight: 0 }
              )
            }
          />
        </label>
        <FrameNumberInput label="Launch Height" value={move.launchHeight ?? 0} min={0} step={0.1} onChange={(value) => updateNumber('launchHeight', value, 0)} />
        <FrameNumberInput label="Launch Pop" value={launchVelocity} min={3.2} step={0.05} onChange={(value) => updateNumber('launchVelocity', value, 3.2)} />
        <FrameNumberInput label="Re-float Pop" value={juggleRefloatVelocity} min={2.2} step={0.05} onChange={(value) => updateNumber('juggleRefloatVelocity', value, 2.2)} />
        <FrameNumberInput label="Fall Speed" value={juggleGravityScale} min={0.28} step={0.01} onChange={(value) => updateNumber('juggleGravityScale', value, 0.28)} />
        <label className="frame-toggle">
          <span>Knockdown</span>
          <input type="checkbox" checked={move.knockdown} onChange={(event) => onChange({ knockdown: event.target.checked })} />
        </label>
        <label className="frame-toggle">
          <span>Tornado</span>
          <input type="checkbox" checked={Boolean(move.tornado)} onChange={(event) => onChange({ tornado: event.target.checked })} />
        </label>
      </div>
    </section>
  );
}

function defaultLaunchVelocity(launchHeight: number) {
  return Math.min(6.65, Math.max(5.95, launchHeight > 0 ? launchHeight * 2.55 : 5.95));
}

function defaultJuggleRefloatVelocity(launchHeight: number) {
  return Math.min(5.25, Math.max(4.35, launchHeight > 0 ? launchHeight * 1.95 : 4.35));
}

function clearReplacementFrameEdit(edit: SpriteFrameEdit): SpriteFrameEdit {
  const sheetEdit = { ...edit };
  delete sheetEdit.replacementName;
  delete sheetEdit.replacementWidth;
  delete sheetEdit.replacementHeight;
  return {
    ...sheetEdit,
    sourceMode: 'sheet'
  };
}

function createDefaultSpriteFrameEdit(character: CharacterDefinition, frameIndex: number, frameMeta?: SpriteFrameEdit): SpriteFrameEdit {
  const fromCharacter = character.spriteFrameEdits?.[String(frameIndex)];
  const source = fromCharacter ?? frameMeta;
  if (source) {
    return sanitizeSpriteFrameEdit({
      ...source,
      index: frameIndex,
      path: framePath(character, frameIndex)
    });
  }
  return {
    index: frameIndex,
    path: framePath(character, frameIndex),
    sheetId: getSpriteSheetForFrame(character, frameIndex).id,
    sheetPath: getSpriteSheetForFrame(character, frameIndex).path,
    sourceName: getSpriteSheetForFrame(character, frameIndex).name,
    box: [0, 0, 64, 64],
    width: 64,
    height: 64,
    rotation: 0,
    offset: [0, 0],
    scale: 1,
    hidden: false
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampSpriteFrameEditToSheet(edit: SpriteFrameEdit, sheetSize: { width: number; height: number }): SpriteFrameEdit {
  const sheetWidth = Math.max(1, Math.round(sheetSize.width || 1));
  const sheetHeight = Math.max(1, Math.round(sheetSize.height || 1));
  const width = Math.max(1, edit.box[2] - edit.box[0]);
  const height = Math.max(1, edit.box[3] - edit.box[1]);
  const x1 = clamp(Math.round(edit.box[0]), 0, Math.max(0, sheetWidth - 1));
  const y1 = clamp(Math.round(edit.box[1]), 0, Math.max(0, sheetHeight - 1));
  const x2 = clamp(Math.round(edit.box[2]), x1 + 1, sheetWidth);
  const y2 = clamp(Math.round(edit.box[3]), y1 + 1, sheetHeight);
  const clamped = sanitizeSpriteFrameEdit({
    ...edit,
    box: [x1, y1, x2, y2],
    width: Math.max(1, Math.round(edit.width || width)),
    height: Math.max(1, Math.round(edit.height || height))
  });
  return clamped;
}

function moveSpriteFrameBoxWithinSheet(box: [number, number, number, number], dx: number, dy: number, sheetSize: { width: number; height: number }): [number, number, number, number] {
  const sheetWidth = Math.max(1, sheetSize.width);
  const sheetHeight = Math.max(1, sheetSize.height);
  const width = Math.max(1, box[2] - box[0]);
  const height = Math.max(1, box[3] - box[1]);
  const x1 = clamp(Math.round(box[0] + dx), 0, Math.max(0, sheetWidth - width));
  const y1 = clamp(Math.round(box[1] + dy), 0, Math.max(0, sheetHeight - height));
  return [x1, y1, x1 + width, y1 + height];
}

function fitSpriteFrameToVisiblePixels(sheet: HTMLImageElement | null, edit: SpriteFrameEdit): SpriteFrameEdit | null {
  if (!sheet || !sheet.complete || sheet.naturalWidth <= 0 || sheet.naturalHeight <= 0) return null;
  const [rawX1, rawY1, rawX2, rawY2] = edit.box;
  const x1 = clamp(Math.round(rawX1), 0, sheet.naturalWidth - 1);
  const y1 = clamp(Math.round(rawY1), 0, sheet.naturalHeight - 1);
  const x2 = clamp(Math.round(rawX2), x1 + 1, sheet.naturalWidth);
  const y2 = clamp(Math.round(rawY2), y1 + 1, sheet.naturalHeight);
  const sourceWidth = x2 - x1;
  const sourceHeight = y2 - y1;
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(sheet, x1, y1, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  const pixels = context.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const background = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0, pixels[3] ?? 255];
  let minX = sourceWidth;
  let minY = sourceHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const offset = (y * sourceWidth + x) * 4;
      const alpha = pixels[offset + 3] ?? 0;
      const colorDistance =
        Math.abs((pixels[offset] ?? 0) - background[0]) +
        Math.abs((pixels[offset + 1] ?? 0) - background[1]) +
        Math.abs((pixels[offset + 2] ?? 0) - background[2]);
      const alphaDistance = Math.abs(alpha - background[3]);
      if (alpha > 12 && (alphaDistance > 8 || colorDistance > 34)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const padding = 2;
  const nextBox: [number, number, number, number] = [
    clamp(x1 + minX - padding, 0, sheet.naturalWidth - 1),
    clamp(y1 + minY - padding, 0, sheet.naturalHeight - 1),
    clamp(x1 + maxX + 1 + padding, 1, sheet.naturalWidth),
    clamp(y1 + maxY + 1 + padding, 1, sheet.naturalHeight)
  ];
  return clampSpriteFrameEditToSheet({
    ...edit,
    box: nextBox,
    width: nextBox[2] - nextBox[0],
    height: nextBox[3] - nextBox[1],
    offset: [0, 0],
    scale: edit.scale ?? 1
  }, { width: sheet.naturalWidth, height: sheet.naturalHeight });
}

function renderSpriteFrameCanvas(sheet: HTMLImageElement | null, canvas: HTMLCanvasElement | null, edit: SpriteFrameEdit) {
  if (!sheet || !canvas || !sheet.complete || sheet.naturalWidth <= 0 || sheet.naturalHeight <= 0) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const [x1, y1, x2, y2] = edit.box;
  const sourceWidth = Math.max(1, x2 - x1);
  const sourceHeight = Math.max(1, y2 - y1);
  const scale = Math.max(0.25, edit.scale ?? 1);
  const rotation = normalizeRotation(edit.rotation ?? 0);
  const offsetX = edit.offset?.[0] ?? 0;
  const offsetY = edit.offset?.[1] ?? 0;
  const grownWidth = Math.ceil(sourceWidth * scale + Math.abs(offsetX) * 2);
  const grownHeight = Math.ceil(sourceHeight * scale + Math.abs(offsetY) * 2);
  canvas.width = Math.max(1, Math.round(edit.width || sourceWidth), grownWidth);
  canvas.height = Math.max(1, Math.round(edit.height || sourceHeight), grownHeight);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.save();
  context.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(sheet, x1, y1, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);
  context.restore();
  keySpriteSheetBackgroundToTransparent(sheet, canvas);
}

function renderReplacementFrameCanvas(image: HTMLImageElement, canvas: HTMLCanvasElement | null, edit: SpriteFrameEdit) {
  if (!canvas || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const imageWidth = image.naturalWidth;
  const imageHeight = image.naturalHeight;
  const scale = Math.max(0.25, edit.scale ?? 1);
  const rotation = normalizeRotation(edit.rotation ?? 0);
  const offsetX = edit.offset?.[0] ?? 0;
  const offsetY = edit.offset?.[1] ?? 0;
  const grownWidth = Math.ceil(imageWidth * scale + Math.abs(offsetX) * 2);
  const grownHeight = Math.ceil(imageHeight * scale + Math.abs(offsetY) * 2);
  canvas.width = Math.max(1, Math.round(edit.width || edit.replacementWidth || imageWidth), grownWidth);
  canvas.height = Math.max(1, Math.round(edit.height || edit.replacementHeight || imageHeight), grownHeight);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.save();
  context.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scale, scale);
  context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
  context.restore();
  keyCanvasCornerBackgroundToTransparent(canvas);
}

function keySpriteSheetBackgroundToTransparent(sheet: HTMLImageElement, canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width <= 0 || canvas.height <= 0) return;
  const background = sampleSpriteSheetBackground(sheet);
  if (!background) return;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const tolerance = 18;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0;
    if (alpha <= 0) continue;
    const distance =
      Math.abs((data[offset] ?? 0) - background[0]) +
      Math.abs((data[offset + 1] ?? 0) - background[1]) +
      Math.abs((data[offset + 2] ?? 0) - background[2]);
    if (distance <= tolerance) {
      data[offset + 3] = 0;
    }
  }
  context.putImageData(pixels, 0, 0);
}

function keyCanvasCornerBackgroundToTransparent(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width <= 0 || canvas.height <= 0) return;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  const samples = [
    pixelAt(data, canvas.width, 0, 0),
    pixelAt(data, canvas.width, canvas.width - 1, 0),
    pixelAt(data, canvas.width, 0, canvas.height - 1),
    pixelAt(data, canvas.width, canvas.width - 1, canvas.height - 1)
  ].filter((sample): sample is [number, number, number, number] => Boolean(sample));
  const opaqueSamples = samples.filter((sample) => sample[3] > 250);
  if (opaqueSamples.length < 3) return;
  const background = opaqueSamples.reduce((best, color) => {
    const score = opaqueSamples.filter((candidate) => colorDistance(candidate, color) <= 18).length;
    return score > best.score ? { color, score } : best;
  }, { color: opaqueSamples[0], score: 0 }).color;
  if (!background || opaqueSamples.filter((candidate) => colorDistance(candidate, background) <= 18).length < 3) return;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0;
    if (alpha <= 0) continue;
    const distance =
      Math.abs((data[offset] ?? 0) - background[0]) +
      Math.abs((data[offset + 1] ?? 0) - background[1]) +
      Math.abs((data[offset + 2] ?? 0) - background[2]);
    if (distance <= 18) {
      data[offset + 3] = 0;
    }
  }
  context.putImageData(pixels, 0, 0);
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] | null {
  if (x < 0 || y < 0) return null;
  const offset = (y * width + x) * 4;
  if (offset < 0 || offset + 3 >= data.length) return null;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0, data[offset + 3] ?? 0];
}

function sampleSpriteSheetBackground(sheet: HTMLImageElement): [number, number, number] | null {
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 3;
  sampleCanvas.height = 3;
  const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  const points = [
    [0, 0],
    [Math.max(0, sheet.naturalWidth - 1), 0],
    [0, Math.max(0, sheet.naturalHeight - 1)],
    [Math.max(0, sheet.naturalWidth - 1), Math.max(0, sheet.naturalHeight - 1)],
    [Math.floor(sheet.naturalWidth / 2), 0],
    [0, Math.floor(sheet.naturalHeight / 2)]
  ];
  const colors = points.map(([x, y]) => {
    context.clearRect(0, 0, 1, 1);
    context.drawImage(sheet, x, y, 1, 1, 0, 0, 1, 1);
    const data = context.getImageData(0, 0, 1, 1).data;
    return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0] as [number, number, number];
  });
  return colors.reduce((best, color) => {
    const score = colors.filter((candidate) => colorDistance(candidate, color) <= 18).length;
    return score > best.score ? { color, score } : best;
  }, { color: colors[0], score: 0 }).color;
}

function colorDistance(a: readonly number[], b: readonly number[]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function SpriteSheetFrameEditor({
  character,
  frameBank,
  spriteSheets,
  frameMeta,
  selectedFrameIndex,
  selectedFrames,
  selectedFrameSet,
  saveStatus,
  importStatus,
  onSelectFrame,
  onToggleFrame,
  onCreateFrame,
  onSave,
  onImportSpriteSheet
}: {
  character: CharacterDefinition;
  frameBank: string[];
  spriteSheets: CharacterSpriteSheet[];
  frameMeta: Record<string, SpriteFrameEdit>;
  selectedFrameIndex: number;
  selectedFrames: string[];
  selectedFrameSet: Set<string>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  importStatus: 'idle' | 'working' | 'saved' | 'error';
  onSelectFrame: (index: number) => void;
  onToggleFrame: (path: string) => void;
  onCreateFrame: (edit: SpriteFrameEdit) => void;
  onSave: (edit: SpriteFrameEdit, pngDataUrl: string) => Promise<void>;
  onImportSpriteSheet: (file: File | undefined) => Promise<void>;
}) {
  const sheetRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cropDragRef = useRef<{
    mode: string;
    startPointer: [number, number];
    startBox: [number, number, number, number];
  } | null>(null);
  const [sheetSize, setSheetSize] = useState({ width: 1, height: 1 });
  const [edit, setEdit] = useState<SpriteFrameEdit>(() => createDefaultSpriteFrameEdit(character, selectedFrameIndex, frameMeta[String(selectedFrameIndex)]));
  const [replacementPreviewUrl, setReplacementPreviewUrl] = useState<string | null>(null);
  const selectedFramePath = framePath(character, selectedFrameIndex);
  const selectedFrameMeta = frameMeta[String(selectedFrameIndex)] ?? character.spriteFrameEdits?.[String(selectedFrameIndex)];
  const selectedSheet = getSpriteSheetForFrame(character, selectedFrameIndex, selectedFrameMeta, frameBank.length);
  const selectedSheetPath = selectedSheet.path;
  const selectedSequenceIndex = selectedFrames.findIndex((frame) => getFrameIndex(frame) === selectedFrameIndex);
  const selectedInMove = selectedSequenceIndex >= 0;
  const cropWidth = Math.max(1, edit.box[2] - edit.box[0]);
  const cropHeight = Math.max(1, edit.box[3] - edit.box[1]);
  const pngWidth = Math.max(1, Math.round(edit.width || cropWidth));
  const pngHeight = Math.max(1, Math.round(edit.height || cropHeight));
  const hasSavedFrameEdit = Boolean(character.spriteFrameEdits?.[String(selectedFrameIndex)] ?? frameMeta[String(selectedFrameIndex)]);
  const isReplacementFrame = edit.sourceMode === 'replacement';

  useEffect(() => {
    setReplacementPreviewUrl(null);
  }, [character.id, selectedFrameIndex]);

  useEffect(() => {
    const baseEdit = createDefaultSpriteFrameEdit(character, selectedFrameIndex, frameMeta[String(selectedFrameIndex)]);
    const fitted = hasSavedFrameEdit ? null : fitSpriteFrameToVisiblePixels(sheetRef.current, baseEdit);
    const nextEdit = fitted ?? baseEdit;
    setEdit(clampSpriteFrameEditToSheet(nextEdit, sheetSize));
  }, [character, frameMeta, hasSavedFrameEdit, selectedFrameIndex, selectedSheetPath, sheetSize]);

  useEffect(() => {
    if (edit.sourceMode !== 'replacement') {
      renderSpriteFrameCanvas(sheetRef.current, canvasRef.current, edit);
      return;
    }

    const canvas = canvasRef.current;
    const source = replacementPreviewUrl ?? `${selectedFramePath}?replacement=${character.id}-${selectedFrameIndex}-${edit.replacementWidth ?? edit.width}-${edit.replacementHeight ?? edit.height}`;
    let cancelled = false;
    loadImage(source)
      .then((image) => {
        if (!cancelled) renderReplacementFrameCanvas(image, canvas, edit);
      })
      .catch((error) => console.error('Failed to render replacement frame', error));
    return () => {
      cancelled = true;
    };
  }, [character.id, edit, replacementPreviewUrl, selectedFrameIndex, selectedFramePath, sheetSize]);

  const patchEdit = (patch: Partial<SpriteFrameEdit>) => {
    setEdit((current) => clampSpriteFrameEditToSheet(sanitizeSpriteFrameEdit({
      ...current,
      ...patch,
      index: selectedFrameIndex,
      path: selectedFramePath,
      sheetId: selectedSheet.id,
      sheetPath: selectedSheet.path,
      sourceName: selectedSheet.name
    }), sheetSize));
  };

  const updateBox = (key: 'x' | 'y' | 'width' | 'height', value: string) => {
    const numeric = Math.max(0, Math.round(Number(value) || 0));
    const [x1, y1, x2, y2] = edit.box;
    if (key === 'x') patchEdit({ box: [numeric, y1, Math.max(numeric + 1, numeric + cropWidth), y2] });
    if (key === 'y') patchEdit({ box: [x1, numeric, x2, Math.max(numeric + 1, numeric + cropHeight)] });
    if (key === 'width') patchEdit({ box: [x1, y1, x1 + Math.max(1, numeric), y2] });
    if (key === 'height') patchEdit({ box: [x1, y1, x2, y1 + Math.max(1, numeric)] });
  };

  const updatePngSize = (key: 'width' | 'height', value: string) => {
    const numeric = Math.max(1, Math.round(Number(value) || 1));
    patchEdit(key === 'width' ? { width: numeric } : { height: numeric });
  };

  const nudgeBox = (dx: number, dy: number) => {
    patchEdit({
      box: moveSpriteFrameBoxWithinSheet(edit.box, dx, dy, sheetSize)
    });
  };

  const resizeBox = (dx: number, dy: number) => {
    const [x1, y1, x2, y2] = edit.box;
    patchEdit({
      box: [x1, y1, Math.max(x1 + 1, x2 + dx), Math.max(y1 + 1, y2 + dy)],
    });
  };

  const resizePng = (dx: number, dy: number) => {
    patchEdit({
      width: Math.max(1, pngWidth + dx),
      height: Math.max(1, pngHeight + dy)
    });
  };

  const nudgeSprite = (dx: number, dy: number) => {
    patchEdit({
      offset: [
        Math.round((edit.offset?.[0] ?? 0) + dx),
        Math.round((edit.offset?.[1] ?? 0) + dy)
      ]
    });
  };

  const createNewFrame = () => {
    const nextIndex = Math.max(
      frameBank.length,
      character.spriteFrameCount ?? 0,
      ...Object.keys(frameMeta).map((key) => Math.round(Number(key) + 1)).filter((index) => Number.isFinite(index) && index > 0)
    );
    const nextBox = isReplacementFrame
      ? [0, 0, Math.min(64, sheetSize.width), Math.min(64, sheetSize.height)] as [number, number, number, number]
      : edit.box;
    const nextEdit = clampSpriteFrameEditToSheet(clearReplacementFrameEdit({
      ...edit,
      index: nextIndex,
      path: framePath(character, nextIndex),
      sourceMode: 'sheet',
      sheetId: selectedSheet.id,
      sheetPath: selectedSheet.path,
      sourceName: selectedSheet.name,
      box: nextBox,
      width: Math.max(1, nextBox[2] - nextBox[0]),
      height: Math.max(1, nextBox[3] - nextBox[1]),
      row: undefined,
      rotation: 0,
      offset: [0, 0],
      scale: 1,
      hidden: false
    }), sheetSize);
    onCreateFrame(nextEdit);
  };

  const replaceFramePng = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(dataUrl);
    setReplacementPreviewUrl(dataUrl);
    patchEdit({
      sourceMode: 'replacement',
      replacementName: file.name,
      replacementWidth: image.naturalWidth,
      replacementHeight: image.naturalHeight,
      width: image.naturalWidth,
      height: image.naturalHeight,
      scale: 1,
      rotation: 0,
      offset: [0, 0]
    });
  };

  const resetFrameToSheet = () => {
    setReplacementPreviewUrl(null);
    const baseEdit = createDefaultSpriteFrameEdit(character, selectedFrameIndex, frameMeta[String(selectedFrameIndex)]);
    const sheetEdit = clearReplacementFrameEdit(baseEdit);
    const width = Math.max(1, sheetEdit.box[2] - sheetEdit.box[0]);
    const height = Math.max(1, sheetEdit.box[3] - sheetEdit.box[1]);
    setEdit({
      ...sheetEdit,
      width,
      height,
      rotation: 0,
      offset: [0, 0],
      scale: 1
    });
  };

  const saveFrame = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sanitizedEdit = sanitizeSpriteFrameEdit(edit);
    const frameMetadata = {
      path: selectedFramePath,
      sheetId: selectedSheet.id,
      sheetPath: selectedSheet.path,
      sourceName: selectedSheet.name,
      width: canvas.width,
      height: canvas.height
    };
    const nextEdit: SpriteFrameEdit = edit.sourceMode === 'replacement'
      ? {
          ...sanitizedEdit,
          ...frameMetadata,
          sourceMode: 'replacement',
          replacementWidth: edit.replacementWidth ?? canvas.width,
          replacementHeight: edit.replacementHeight ?? canvas.height,
          replacementName: edit.replacementName
        }
      : clearReplacementFrameEdit({
          ...sanitizedEdit,
          ...frameMetadata
        });
    await onSave(
      nextEdit,
      canvas.toDataURL('image/png')
    );
  };

  const fitVisibleCrop = () => {
    const fitted = fitSpriteFrameToVisiblePixels(sheetRef.current, edit);
    if (fitted) setEdit(fitted);
  };

  const pointerToSheetPoint = (event: ReactPointerEvent): [number, number] => {
    const image = sheetRef.current;
    if (!image) return [0, 0];
    const rect = image.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * sheetSize.width, 0, sheetSize.width);
    const y = clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * sheetSize.height, 0, sheetSize.height);
    return [x, y];
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLElement>, mode: string) => {
    event.preventDefault();
    event.stopPropagation();
    cropDragRef.current = {
      mode,
      startPointer: pointerToSheetPoint(event),
      startBox: [...edit.box]
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = cropDragRef.current;
    if (!drag) return;
    event.preventDefault();
    const [pointerX, pointerY] = pointerToSheetPoint(event);
    const dx = Math.round(pointerX - drag.startPointer[0]);
    const dy = Math.round(pointerY - drag.startPointer[1]);
    const [x1, y1, x2, y2] = drag.startBox;
    let nextBox: [number, number, number, number] = [...drag.startBox];

    if (drag.mode === 'move') {
      nextBox = moveSpriteFrameBoxWithinSheet(drag.startBox, dx, dy, sheetSize);
    } else {
      const movesLeft = drag.mode.includes('w');
      const movesRight = drag.mode.includes('e');
      const movesTop = drag.mode.includes('n');
      const movesBottom = drag.mode.includes('s');
      nextBox = [
        movesLeft ? clamp(x1 + dx, 0, x2 - 1) : x1,
        movesTop ? clamp(y1 + dy, 0, y2 - 1) : y1,
        movesRight ? clamp(x2 + dx, x1 + 1, sheetSize.width) : x2,
        movesBottom ? clamp(y2 + dy, y1 + 1, sheetSize.height) : y2
      ];
    }

    patchEdit({ box: nextBox, width: nextBox[2] - nextBox[0], height: nextBox[3] - nextBox[1] });
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!cropDragRef.current) return;
    cropDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <section className="sprite-crop-editor" aria-label="Spritesheet crop editor">
      <div className="sprite-crop-stage">
        <div className="sprite-sheet-crop-map">
          <div className="sprite-sheet-library" aria-label="Character sprite sheets">
            {spriteSheets.map((sheet) => (
              <button
                key={sheet.id}
                className={sheet.id === selectedSheet.id ? 'active' : ''}
                onClick={() => onSelectFrame(sheet.frameStart)}
                title={`${sheet.name}: frames ${sheet.frameStart}-${sheet.frameStart + sheet.frameCount - 1}`}
              >
                <span>{sheet.name}</span>
                <small>{sheet.frameCount} frames</small>
              </button>
            ))}
            <label className="secondary-button compact-button sprite-sheet-import-button">
              <Upload size={14} />
              {importStatus === 'working' ? 'Importing' : 'Import Spritesheet'}
              <input
                type="file"
                accept="image/png,image/webp,image/jpeg"
                onChange={(event) => {
                  void onImportSpriteSheet(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {importStatus !== 'idle' && (
              <span className={`manifest-save-status is-${importStatus === 'saved' ? 'saved' : importStatus === 'error' ? 'error' : 'saving'}`}>
                {importStatus === 'saved' ? 'Spritesheet added' : importStatus === 'error' ? 'Import failed' : 'Auto-cropping'}
              </span>
            )}
          </div>
          <div className="sprite-sheet-crop-content">
            <img
              ref={sheetRef}
              src={selectedSheetPath}
              alt={`${character.displayName} ${selectedSheet.name} crop map`}
              onLoad={(event) => {
                const image = event.currentTarget;
                setSheetSize({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
                const baseEdit = createDefaultSpriteFrameEdit(character, selectedFrameIndex, frameMeta[String(selectedFrameIndex)]);
                const fitted = hasSavedFrameEdit ? null : fitSpriteFrameToVisiblePixels(image, baseEdit);
                setEdit(clampSpriteFrameEditToSheet(fitted ?? baseEdit, { width: image.naturalWidth || 1, height: image.naturalHeight || 1 }));
              }}
            />
            {!isReplacementFrame && (
              <div
                className="sprite-crop-box"
                onPointerDown={(event) => beginCropDrag(event, 'move')}
                onPointerMove={updateCropDrag}
                onPointerUp={endCropDrag}
                onPointerCancel={endCropDrag}
                style={{
                  left: `${(edit.box[0] / sheetSize.width) * 100}%`,
                  top: `${(edit.box[1] / sheetSize.height) * 100}%`,
                  width: `${((edit.box[2] - edit.box[0]) / sheetSize.width) * 100}%`,
                  height: `${((edit.box[3] - edit.box[1]) / sheetSize.height) * 100}%`
                }}
                title="Drag to move crop. Drag handles to resize."
              >
                {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => (
                  <span
                    key={handle}
                    className={`sprite-crop-handle handle-${handle}`}
                    onPointerDown={(event) => beginCropDrag(event, handle)}
                    onPointerMove={updateCropDrag}
                    onPointerUp={endCropDrag}
                    onPointerCancel={endCropDrag}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="sprite-crop-preview-panel">
          <span>Selected Crop</span>
          <canvas ref={canvasRef} className="sprite-crop-canvas" aria-label={`Rendered frame ${selectedFrameIndex}`} />
          <strong>{`Frame ${selectedFrameIndex}`}</strong>
          <small>{isReplacementFrame ? `${pngWidth} x ${pngHeight} custom PNG` : `${cropWidth} x ${cropHeight} crop | ${pngWidth} x ${pngHeight} PNG`}</small>
          {isReplacementFrame && <em>{edit.replacementName ? `Custom PNG: ${edit.replacementName}` : 'Custom PNG'}</em>}
          {edit.hidden && <em>Removed from generated frame list</em>}
        </div>
      </div>
      <div className="sprite-crop-controls">
        <div className="sprite-crop-fields">
          <FrameNumberInput label="Crop X" value={edit.box[0]} min={0} disabled={isReplacementFrame} onChange={(value) => updateBox('x', value)} />
          <FrameNumberInput label="Crop Y" value={edit.box[1]} min={0} disabled={isReplacementFrame} onChange={(value) => updateBox('y', value)} />
          <FrameNumberInput label="Crop W" value={cropWidth} min={1} disabled={isReplacementFrame} onChange={(value) => updateBox('width', value)} />
          <FrameNumberInput label="Crop H" value={cropHeight} min={1} disabled={isReplacementFrame} onChange={(value) => updateBox('height', value)} />
          <FrameNumberInput label="PNG W" value={pngWidth} min={1} onChange={(value) => updatePngSize('width', value)} />
          <FrameNumberInput label="PNG H" value={pngHeight} min={1} onChange={(value) => updatePngSize('height', value)} />
          <FrameNumberInput label="Offset X" value={edit.offset?.[0] ?? 0} onChange={(value) => patchEdit({ offset: [Math.round(Number(value) || 0), edit.offset?.[1] ?? 0] })} />
          <FrameNumberInput label="Offset Y" value={edit.offset?.[1] ?? 0} onChange={(value) => patchEdit({ offset: [edit.offset?.[0] ?? 0, Math.round(Number(value) || 0)] })} />
          <FrameNumberInput label="Scale" value={edit.scale ?? 1} min={0.25} step={0.05} onChange={(value) => patchEdit({ scale: Number(value) || 1 })} />
          <FrameNumberInput label="Rotation" value={edit.rotation ?? 0} step={90} onChange={(value) => patchEdit({ rotation: normalizeRotation(Number(value) || 0) })} />
        </div>
        <div className="sprite-crop-button-grid">
          <button className="secondary-button compact-button" onClick={() => onSelectFrame(Math.max(0, selectedFrameIndex - 1))}>Prev</button>
          <button className="secondary-button compact-button" onClick={() => onSelectFrame(Math.min(frameBank.length - 1, selectedFrameIndex + 1))}>Next</button>
          <button className="secondary-button compact-button" onClick={createNewFrame}>New Frame</button>
          <button className="secondary-button compact-button" onClick={() => nudgeBox(-1, 0)} disabled={isReplacementFrame}>Crop Left</button>
          <button className="secondary-button compact-button" onClick={() => nudgeBox(1, 0)} disabled={isReplacementFrame}>Crop Right</button>
          <button className="secondary-button compact-button" onClick={() => nudgeBox(0, -1)} disabled={isReplacementFrame}>Crop Up</button>
          <button className="secondary-button compact-button" onClick={() => nudgeBox(0, 1)} disabled={isReplacementFrame}>Crop Down</button>
          <button className="secondary-button compact-button" onClick={() => resizeBox(1, 0)} disabled={isReplacementFrame}>W +</button>
          <button className="secondary-button compact-button" onClick={() => resizeBox(-1, 0)} disabled={isReplacementFrame}>W -</button>
          <button className="secondary-button compact-button" onClick={() => resizeBox(0, 1)} disabled={isReplacementFrame}>H +</button>
          <button className="secondary-button compact-button" onClick={() => resizeBox(0, -1)} disabled={isReplacementFrame}>H -</button>
          <button className="secondary-button compact-button" onClick={() => resizePng(-1, 0)}>PNG W -</button>
          <button className="secondary-button compact-button" onClick={() => resizePng(1, 0)}>PNG W +</button>
          <button className="secondary-button compact-button" onClick={() => resizePng(0, -1)}>PNG H -</button>
          <button className="secondary-button compact-button" onClick={() => resizePng(0, 1)}>PNG H +</button>
          <button className="secondary-button compact-button" onClick={() => nudgeSprite(-1, 0)}>Move Left</button>
          <button className="secondary-button compact-button" onClick={() => nudgeSprite(1, 0)}>Move Right</button>
          <button className="secondary-button compact-button" onClick={() => nudgeSprite(0, -1)}>Move Up</button>
          <button className="secondary-button compact-button" onClick={() => nudgeSprite(0, 1)}>Move Down</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ offset: [0, 0] })}>Center</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ width: cropWidth, height: cropHeight })}>Fit PNG</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ scale: Math.max(0.25, Number(((edit.scale ?? 1) - 0.05).toFixed(2))) })}>Shrink Sprite</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ scale: Math.min(4, Number(((edit.scale ?? 1) + 0.05).toFixed(2))) })}>Grow Sprite</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ rotation: normalizeRotation((edit.rotation ?? 0) - 90) })}>Rotate -90</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ rotation: normalizeRotation((edit.rotation ?? 0) + 90) })}>Rotate +90</button>
          <button className="secondary-button compact-button" onClick={() => patchEdit({ hidden: !edit.hidden })}>{edit.hidden ? 'Add / Restore' : 'Remove Frame'}</button>
          <button className="secondary-button compact-button" onClick={() => onToggleFrame(selectedFramePath)}>{selectedInMove ? 'Remove From Move' : 'Add To Move'}</button>
          <button className="secondary-button compact-button" onClick={fitVisibleCrop} disabled={isReplacementFrame}>Fit Visible</button>
          <label className="secondary-button compact-button sprite-sheet-import-button">
            <Upload size={14} />
            Replace PNG
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg"
              onChange={(event) => {
                void replaceFramePng(event.target.files?.[0]).catch((error) => console.error('Failed to replace frame PNG', error));
                event.currentTarget.value = '';
              }}
            />
          </label>
          <button className="secondary-button compact-button" onClick={resetFrameToSheet}>Reset Crop</button>
          <button className="secondary-button compact-button dev-save-button" onClick={saveFrame} disabled={saveStatus === 'saving'}>
            <Save size={14} />
            {saveStatus === 'saving' ? 'Saving' : 'Save Frame'}
          </button>
          {saveStatus !== 'idle' && (
            <span className={`manifest-save-status is-${saveStatus}`}>
              {saveStatus === 'saved' ? 'Saved frame' : saveStatus === 'error' ? 'Save failed' : 'Writing'}
            </span>
          )}
        </div>
      </div>
      <div className="sprite-frame-bank" aria-label="Extracted sprite frames">
        {frameBank.map((frame) => {
          const index = getFrameIndex(frame);
          const meta = frameMeta[String(index)];
          return (
            <button
              key={frame}
              className={`${index === selectedFrameIndex ? 'active' : ''} ${meta?.hidden ? 'is-hidden-frame' : ''} ${selectedFrameSet.has(frame) ? 'in-selected-move' : ''}`}
              onClick={() => onSelectFrame(index)}
              title={`Frame ${index}`}
            >
              <img src={frame} alt={`Frame ${index}`} loading="lazy" />
              <span>{index}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type ImportedFrame = {
  index: number;
  dataUrl: string;
  box: [number, number, number, number];
  width: number;
  height: number;
  row: number;
};

type ImportDraft = {
  displayName: string;
  id: string;
  health: number;
  speed: number;
  sidestepSpeed: number;
  jumpForce: number;
  primary: string;
  secondary: string;
  accent: string;
};

function CharacterImportScreen({
  onBack,
  onImportComplete
}: {
  onBack: () => void;
  onImportComplete: (characterId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ImportDraft>(() => randomImportDraft());
  const [sheetDataUrl, setSheetDataUrl] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [detectedFrames, setDetectedFrames] = useState<ImportedFrame[]>([]);
  const [animationFrames, setAnimationFrames] = useState<Record<string, number[]>>({});
  const [selectedAnimationKey, setSelectedAnimationKey] = useState('idle');
  const [detectStatus, setDetectStatus] = useState<'idle' | 'working' | 'ready' | 'error'>('idle');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const selectedSlot = animationSlots.find((slot) => slot.key === selectedAnimationKey) ?? animationSlots[0];
  const selectedFrameIndexes = animationFrames[selectedAnimationKey] ?? [];
  const selectedIndexSet = new Set(selectedFrameIndexes);

  const updateDraft = (patch: Partial<ImportDraft>) => {
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (patch.displayName && !patch.id) next.id = slugifyCharacterId(patch.displayName);
      if (patch.id) next.id = slugifyCharacterId(patch.id);
      return next;
    });
  };

  const randomize = () => {
    setDraft(randomImportDraft());
  };

  const importSheet = async (file: File | undefined) => {
    if (!file) return;
    setDetectStatus('working');
    setSaveStatus('idle');
    try {
      const result = await detectSpriteSheetFrames(file);
      setSheetName(file.name);
      setSheetDataUrl(result.sheetDataUrl);
      setDetectedFrames(result.frames);
      setAnimationFrames(inferImportedAnimationFrameMap(result.frames.length));
      setSelectedAnimationKey('idle');
      setDetectStatus('ready');
    } catch (error) {
      console.error('Failed to import sprite sheet', error);
      setDetectStatus('error');
    }
  };

  const toggleFrameForAnimation = (index: number) => {
    setAnimationFrames((current) => {
      const existing = current[selectedAnimationKey] ?? [];
      const nextFrames = existing.includes(index) ? existing.filter((frame) => frame !== index) : [...existing, index].sort((a, b) => a - b);
      return { ...current, [selectedAnimationKey]: nextFrames.length > 0 ? nextFrames : existing };
    });
  };

  const saveImportedCharacter = async () => {
    if (!sheetDataUrl || detectedFrames.length === 0 || !draft.id) return;
    setSaveStatus('saving');
    try {
      const manifest = buildImportedCharacterManifest(draft, detectedFrames.length, animationFrames);
      const response = await fetch('/__kore/dev/import-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: draft.id,
          sheetDataUrl,
          frames: detectedFrames,
          manifest,
          sourceName: sheetName
        })
      });
      if (!response.ok) throw new Error(await response.text());
      setSaveStatus('saved');
      await onImportComplete(draft.id);
    } catch (error) {
      console.error('Failed to save imported character', error);
      setSaveStatus('error');
    }
  };

  return (
    <div className="character-import-screen">
      <header className="section-header">
        <span>Local Dev</span>
        <h2>Import Character</h2>
      </header>
      <section className="import-layout">
        <aside className="import-settings-panel">
          <label className="file-drop">
            <Upload size={26} />
            <strong>{sheetName || 'Choose spritesheet PNG'}</strong>
            <small>{detectStatus === 'working' ? 'Detecting frames...' : 'Auto-crop and infer move slots'}</small>
            <input type="file" accept="image/png,image/webp,image/jpeg" onChange={(event) => importSheet(event.target.files?.[0])} />
          </label>
          <div className="import-field-grid">
            <label>
              <span>Name</span>
              <input value={draft.displayName} onChange={(event) => updateDraft({ displayName: event.target.value })} />
            </label>
            <label>
              <span>ID</span>
              <input value={draft.id} onChange={(event) => updateDraft({ id: event.target.value })} />
            </label>
            <label>
              <span>Health</span>
              <input type="number" value={draft.health} onChange={(event) => updateDraft({ health: Number(event.target.value) || 100 })} />
            </label>
            <label>
              <span>Speed</span>
              <input type="number" step="0.05" value={draft.speed} onChange={(event) => updateDraft({ speed: Number(event.target.value) || 5 })} />
            </label>
            <label>
              <span>Sidestep</span>
              <input type="number" step="0.05" value={draft.sidestepSpeed} onChange={(event) => updateDraft({ sidestepSpeed: Number(event.target.value) || 4.3 })} />
            </label>
            <label>
              <span>Jump</span>
              <input type="number" step="0.05" value={draft.jumpForce} onChange={(event) => updateDraft({ jumpForce: Number(event.target.value) || 8 })} />
            </label>
            <label>
              <span>Primary</span>
              <input type="color" value={draft.primary} onChange={(event) => updateDraft({ primary: event.target.value })} />
            </label>
            <label>
              <span>Accent</span>
              <input type="color" value={draft.accent} onChange={(event) => updateDraft({ accent: event.target.value })} />
            </label>
          </div>
          <div className="import-action-row">
            <button className="secondary-button" onClick={randomize}>
              <Shuffle size={16} />
              Randomize
            </button>
            <button className="secondary-button dev-save-button" onClick={saveImportedCharacter} disabled={saveStatus === 'saving' || detectedFrames.length === 0}>
              <Save size={16} />
              {saveStatus === 'saving' ? 'Saving' : 'Save Character'}
            </button>
            {saveStatus !== 'idle' && (
              <span className={`manifest-save-status is-${saveStatus}`}>{saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed' : 'Writing'}</span>
            )}
          </div>
        </aside>
        <main className="import-workbench">
          <div className="import-preview-header">
            <div>
              <span>Detected Frames</span>
              <strong>{detectedFrames.length > 0 ? `${detectedFrames.length} frames` : 'No sheet loaded'}</strong>
            </div>
            <CommandCategorySelect value={selectedSlot.category} onChange={(category) => {
              const nextSlot = animationSlots.find((slot) => category === 'all' || slot.category === category) ?? animationSlots[0];
              setSelectedAnimationKey(nextSlot.key);
            }} />
          </div>
          <div className="import-slot-strip" aria-label="Imported animation slots">
            {baseAnimationSlots.map((slot) => (
              <button key={slot.key} className={slot.key === selectedAnimationKey ? 'active' : ''} onClick={() => setSelectedAnimationKey(slot.key)}>
                <NotationGroup tokens={slot.notation} />
                <span>{slot.label}</span>
                <small>{(animationFrames[slot.key] ?? []).length} frames</small>
              </button>
            ))}
          </div>
          <div className="import-selected-preview">
            <div>
              <span>Editing</span>
              <strong>{selectedSlot.label}</strong>
              <small>Click detected frames to add/remove them from this move.</small>
            </div>
            <div className="import-animation-preview">
              {selectedFrameIndexes.map((index) => {
                const frame = detectedFrames[index];
                return frame ? <img key={`${selectedAnimationKey}-${index}`} src={frame.dataUrl} alt={`Preview frame ${index}`} /> : null;
              })}
            </div>
          </div>
          <div className="import-frame-grid" aria-label="Detected frame bank">
            {detectedFrames.map((frame) => (
              <button
                key={frame.index}
                className={selectedIndexSet.has(frame.index) ? 'active' : ''}
                onClick={() => toggleFrameForAnimation(frame.index)}
                title={`Frame ${frame.index}`}
              >
                <img src={frame.dataUrl} alt={`Detected frame ${frame.index}`} loading="lazy" />
                <span>{frame.index}</span>
              </button>
            ))}
          </div>
        </main>
      </section>
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back To Characters
      </button>
    </div>
  );
}

function randomImportDraft(): ImportDraft {
  const names = ['Nova', 'Kade', 'Vex', 'Rune', 'Sora', 'Jett', 'Nyx', 'Ari', 'Zane', 'Mika'];
  const primary = randomHexColor();
  const accent = randomHexColor();
  const displayName = `${names[Math.floor(Math.random() * names.length)]}-${Math.floor(100 + Math.random() * 900)}`;
  return {
    displayName,
    id: slugifyCharacterId(displayName),
    health: Math.round(92 + Math.random() * 22),
    speed: Number((4.7 + Math.random() * 0.9).toFixed(2)),
    sidestepSpeed: Number((4.05 + Math.random() * 0.75).toFixed(2)),
    jumpForce: Number((7.6 + Math.random() * 0.9).toFixed(2)),
    primary,
    secondary: '#111224',
    accent
  };
}

function randomHexColor() {
  return `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}

function slugifyCharacterId(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'imported-fighter';
}

async function detectSpriteSheetFrames(file: File): Promise<{ sheetDataUrl: string; frames: ImportedFrame[] }> {
  const sheetDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sheetDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create canvas context');
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const background = [pixels.data[0], pixels.data[1], pixels.data[2], pixels.data[3]];
  const rowHasInk = new Array(canvas.height).fill(false);
  const columnHasInk = new Array(canvas.width).fill(false);

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      if (isSpritePixel(pixels.data, offset, background)) {
        rowHasInk[y] = true;
        columnHasInk[x] = true;
      }
    }
  }

  const rowGroups = groupBooleanRuns(rowHasInk, 6, 6);
  const boxes: Array<{ box: [number, number, number, number]; row: number }> = [];
  rowGroups.forEach(([rowStart, rowEnd], rowIndex) => {
    const columns = new Array(canvas.width).fill(false);
    for (let y = rowStart; y <= rowEnd; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (isSpritePixel(pixels.data, offset, background)) columns[x] = true;
      }
    }
    const columnGroups = groupBooleanRuns(columns, 6, 5);
    columnGroups.forEach(([columnStart, columnEnd]) => {
      const box = trimSpriteBox(pixels.data, canvas.width, canvas.height, columnStart, rowStart, columnEnd, rowEnd, background);
      const width = box[2] - box[0];
      const height = box[3] - box[1];
      if (width >= 8 && height >= 8) boxes.push({ box, row: rowIndex });
    });
  });

  const frames = boxes
    .sort((a, b) => (a.box[1] - b.box[1]) || (a.box[0] - b.box[0]))
    .map((entry, index) => ({
      index,
      box: entry.box,
      width: entry.box[2] - entry.box[0],
      height: entry.box[3] - entry.box[1],
      row: entry.row,
      dataUrl: cropFrameDataUrl(image, entry.box)
    }));

  if (frames.length === 0) throw new Error('No frames detected');
  return { sheetDataUrl: canvas.toDataURL('image/png'), frames };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image load failed'));
    image.src = src;
  });
}

function isSpritePixel(data: Uint8ClampedArray, offset: number, background: number[]) {
  const alpha = data[offset + 3];
  if (alpha <= 16) return false;
  if (background[3] <= 16) return alpha > 16;
  const distance =
    Math.abs(data[offset] - background[0]) +
    Math.abs(data[offset + 1] - background[1]) +
    Math.abs(data[offset + 2] - background[2]) +
    Math.abs(alpha - background[3]);
  return distance > 34;
}

function groupBooleanRuns(values: boolean[], gapTolerance: number, minLength: number): Array<[number, number]> {
  const groups: Array<[number, number]> = [];
  let start = -1;
  let last = -1;
  let gap = 0;
  values.forEach((value, index) => {
    if (value) {
      if (start < 0) start = index;
      last = index;
      gap = 0;
      return;
    }
    if (start >= 0) {
      gap += 1;
      if (gap > gapTolerance) {
        if (last - start + 1 >= minLength) groups.push([start, last]);
        start = -1;
        last = -1;
        gap = 0;
      }
    }
  });
  if (start >= 0 && last - start + 1 >= minLength) groups.push([start, last]);
  return groups;
}

function trimSpriteBox(data: Uint8ClampedArray, width: number, height: number, x1: number, y1: number, x2: number, y2: number, background: number[]): [number, number, number, number] {
  let left = x2;
  let top = y2;
  let right = x1;
  let bottom = y1;
  for (let y = Math.max(0, y1); y <= Math.min(height - 1, y2); y += 1) {
    for (let x = Math.max(0, x1); x <= Math.min(width - 1, x2); x += 1) {
      const offset = (y * width + x) * 4;
      if (isSpritePixel(data, offset, background)) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return [Math.max(0, left), Math.max(0, top), Math.min(width, right + 1), Math.min(height, bottom + 1)];
}

function cropFrameDataUrl(image: HTMLImageElement, box: [number, number, number, number]) {
  const canvas = document.createElement('canvas');
  const width = Math.max(1, box[2] - box[0]);
  const height = Math.max(1, box[3] - box[1]);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return '';
  context.imageSmoothingEnabled = false;
  context.drawImage(image, box[0], box[1], width, height, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

function inferImportedAnimationFrameMap(count: number): Record<string, number[]> {
  const safe = (indexes: number[]) => indexes.filter((index) => index >= 0 && index < count);
  const fallback = count > 0 ? [0] : [];
  const pick = (indexes: number[]) => {
    const frames = safe(indexes);
    return frames.length > 0 ? frames : fallback;
  };
  return {
    idle: pick([0, 1, 2, 3]),
    walkForward: pick([4, 5, 6, 7, 8, 9]),
    walkBack: pick([9, 8, 7, 6, 5, 4]),
    sidestepLeft: pick([10, 11, 12]),
    sidestepRight: pick([13, 14, 15]),
    crouch: pick([16, 17]),
    jump: pick([18, 19, 20, 21]),
    block: pick([22, 23, 24]),
    jab: pick([25, 26, 27, 28]),
    kick: pick([29, 30, 31, 32]),
    heavy: pick([33, 34, 35, 36]),
    special: pick([37, 38, 39, 40]),
    hitLight: pick([41, 42]),
    hitHeavy: pick([43, 44, 45]),
    juggle: pick([43, 44, 45]),
    knockdown: pick([46, 47, 48, 49]),
    win: pick([50, 51, 52]),
    lose: pick([53, 54, 55])
  };
}

function importedFramePath(characterId: string, index: number) {
  return `/characters/${characterId}/frames/frame-${index.toString().padStart(3, '0')}.png`;
}

function buildImportedCharacterManifest(draft: ImportDraft, frameCount: number, frameMap: Record<string, number[]>): CharacterDefinition {
  const animationFrames = Object.fromEntries(
    Object.entries(frameMap).map(([key, indexes]) => [key, indexes.map((index) => importedFramePath(draft.id, index))])
  );
  return {
    id: draft.id,
    displayName: draft.displayName,
    renderMode: 'spriteVoxel',
    modelPath: `spritevoxel://${draft.id}`,
    spriteSheetPath: `/characters/${draft.id}/animation-sheet.png`,
    spriteSheets: [{
      id: 'main',
      name: 'Main Sheet',
      path: `/characters/${draft.id}/animation-sheet.png`,
      frameStart: 0,
      frameCount
    }],
    spriteFrameCount: frameCount,
    voxelProfile: 'image-source',
    animationFrames,
    animationFrameRates: {
      idle: 5,
      walkForward: 10,
      walkBack: 8,
      sidestepLeft: 10,
      sidestepRight: 10,
      crouch: 5,
      jump: 8,
      block: 5,
      jab: 12,
      kick: 10,
      heavy: 9,
      special: 10,
      hitLight: 8,
      hitHeavy: 8,
      juggle: 8,
      knockdown: 8,
      win: 5,
      lose: 4
    },
    animationFps: 6,
    scale: 1.08,
    cameraOffset: [0, 1.22, 0],
    stats: {
      health: Math.max(1, Math.round(draft.health)),
      speed: Math.max(1, draft.speed),
      sidestepSpeed: Math.max(1, draft.sidestepSpeed),
      jumpForce: Math.max(1, draft.jumpForce),
      gravity: 18
    },
    animations: {
      idle: 'idle',
      walkForward: 'walkForward',
      walkBack: 'walkBack',
      sidestepLeft: 'sidestepLeft',
      sidestepRight: 'sidestepRight',
      crouch: 'crouch',
      jump: 'jump',
      block: 'block',
      jab: 'jab',
      kick: 'kick',
      heavy: 'heavy',
      special: 'special',
      hitLight: 'hitLight',
      hitHeavy: 'hitHeavy',
      juggle: 'juggle',
      knockdown: 'knockdown',
      win: 'win',
      lose: 'lose'
    },
    moves: buildImportedMoves(),
    hurtboxes: [{ offset: [0, 1, 0], size: [0.86, 1.9, 0.58] }],
    inputMap: { jab: 'J', kick: 'K', heavy: 'L', special: 'U', block: 'I' },
    colors: { primary: draft.primary, secondary: draft.secondary, accent: draft.accent },
    aiProfile: {
      aggression: 0.58 + Math.random() * 0.24,
      guard: 0.32 + Math.random() * 0.28,
      spacing: 1.34 + Math.random() * 0.28,
      specialChance: 0.18 + Math.random() * 0.16
    }
  };
}

function buildImportedMoves(): MoveDefinition[] {
  return [
    {
      id: 'jab',
      label: 'Imported 1',
      input: 'jab',
      startupFrames: 10,
      activeFrames: 2,
      recoveryFrames: 12,
      damage: 7,
      blockDamage: 1,
      hitLevel: 'high',
      onBlockFrames: 1,
      onHitFrames: 8,
      onCounterHitFrames: 10,
      range: 1.42,
      pushback: 0.7,
      blockPushback: 0.35,
      tracking: 'medium',
      knockdown: false,
      hitbox: { offset: [0, 1.18, 0.62], size: [0.64, 0.46, 0.58] }
    },
    {
      id: 'kick',
      label: 'Imported 3',
      input: 'kick',
      startupFrames: 16,
      activeFrames: 3,
      recoveryFrames: 18,
      damage: 11,
      blockDamage: 2,
      hitLevel: 'mid',
      onBlockFrames: -8,
      onHitFrames: 4,
      onCounterHitFrames: 7,
      range: 1.62,
      pushback: 0.95,
      blockPushback: 0.44,
      tracking: 'medium',
      knockdown: false,
      hitbox: { offset: [0, 0.82, 0.72], size: [0.76, 0.42, 0.64] }
    },
    {
      id: 'heavy',
      label: 'Imported 2',
      input: 'heavy',
      startupFrames: 15,
      activeFrames: 3,
      recoveryFrames: 24,
      damage: 18,
      blockDamage: 4,
      hitLevel: 'mid',
      onBlockFrames: -13,
      onHitFrames: 18,
      onCounterHitFrames: 22,
      range: 1.54,
      pushback: 1.3,
      blockPushback: 0.62,
      launchHeight: 2.1,
      tracking: 'weakLeft',
      knockdown: true,
      hitbox: { offset: [0, 1.08, 0.66], size: [0.82, 0.58, 0.6] }
    },
    {
      id: 'special',
      label: 'Imported 4',
      input: 'special',
      startupFrames: 18,
      activeFrames: 4,
      recoveryFrames: 25,
      damage: 16,
      blockDamage: 3,
      hitLevel: 'mid',
      onBlockFrames: -9,
      onHitFrames: 14,
      onCounterHitFrames: 18,
      range: 2.35,
      pushback: 1.5,
      blockPushback: 0.76,
      tracking: 'strong',
      knockdown: false,
      hitbox: { offset: [0, 1.05, 0.9], size: [0.94, 0.64, 0.72] }
    }
  ];
}

function FrameNumberInput({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  onChange
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <input type="number" value={Number(value.toFixed(step < 1 ? 2 : 0))} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CommandCategorySelect({
  value,
  onChange
}: {
  value: AnimationSlot['category'] | 'all';
  onChange: (value: AnimationSlot['category'] | 'all') => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = slotCategoryOptions.find((option) => option.value === value) ?? slotCategoryOptions[0];

  return (
    <div className={`custom-select ${open ? 'is-open' : ''}`} onBlur={(event) => {
      const nextTarget = event.relatedTarget;
      if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpen(false);
    }}>
      <button
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Move slot category"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label="Move slot category options" tabIndex={-1}>
          {slotCategoryOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'is-selected' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotationGroup({ tokens }: { tokens: NotationToken[] }) {
  return (
    <span className="notation-group" aria-hidden="true">
      {tokens.map((token, index) => (
        <span key={`${token}-${index}`} className={`notation-token token-${safeClassToken(token)}`}>
          {notationLabel(token)}
        </span>
      ))}
    </span>
  );
}

function notationLabel(token: NotationToken) {
  const labels: Record<string, string> = {
    N: 'N',
    n: 'N',
    f: '→',
    F: '→*',
    b: '←',
    B: '←*',
    u: '↑',
    U: '↑*',
    d: '↓',
    D: '↓*',
    'u/b': '↖',
    'u/f': '↗',
    'd/b': '↙',
    'd/f': '↘',
    'U/B': '↖*',
    'U/F': '↗*',
    'D/B': '↙*',
    'D/F': '↘*',
    'f,f': '→→',
    'b,b': '←←',
    '↑↑': '↑↑',
    '↓↓': '↓↓',
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
    HIT: 'HIT',
    KD: 'KD',
    '+': '+',
    ',': ',',
    '~': '~',
    '<': '<',
    ':': ':',
    '_': '_',
    '*': '*',
    win: 'WIN',
    WIN: 'WIN',
    lose: 'LOSE',
    LOSE: 'LOSE'
  };
  return labels[token] ?? token;
}

function safeClassToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'symbol';
}

function FightScreen({
  p1,
  p2,
  stage,
  roster,
  stages,
  mode,
  cpuDifficulty,
  settings,
  readInputs,
  setVirtualAction,
  clearMenuInputs,
  getLastInput,
  onlineProfile,
  privateRoomIntent,
  onMenu,
  onCharacterSelect
}: {
  p1: CharacterDefinition;
  p2: CharacterDefinition;
  stage: StageDefinition;
  roster: CharacterDefinition[];
  stages: StageDefinition[];
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  settings: GameSettings;
  readInputs: () => [InputFrame, InputFrame];
  setVirtualAction: (player: 1 | 2, action: ActionName, pressed: boolean) => void;
  clearMenuInputs: () => void;
  getLastInput: () => string;
  onlineProfile: OnlinePlayerProfile | null;
  privateRoomIntent: PrivateRoomIntent | null;
  onMenu: () => void;
  onCharacterSelect: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const isOnline = mode === 'online' || mode === 'private';
  const isPrivate = mode === 'private';
  const matchOptions = useMemo(
    () => ({
      roundTime: settings.game.roundTimer,
      trainingInfiniteHealth: settings.game.trainingInfiniteHealth,
      playIntro: true
    }),
    [settings.game.roundTimer, settings.game.trainingInfiniteHealth]
  );
  const [match, setMatch] = useState<MatchSnapshot>(() => createMatch(p1, p2, stage, isOnline ? 'ai' : mode, cpuDifficulty, withFreshAiSeed(matchOptions)));
  const matchRef = useRef(match);
  const pausedRef = useRef(paused);
  const pauseLatch = useRef(false);
  const frameInputRef = useRef('none');
  const screenRef = useRef<HTMLDivElement>(null);
  const seenCombatEventIds = useRef<Set<number>>(new Set());
  const seenImpactScoreEventIds = useRef<Set<number>>(new Set());
  const seenImpactAudioEventIds = useRef<Set<number>>(new Set());
  const lastCombatEventId = useRef(0);
  const [combatPopups, setCombatPopups] = useState<ActiveCombatPopup[]>([]);
  const [onlineState, setOnlineState] = useState<OnlineConnectionState>(isOnline ? 'searching' : 'idle');
  const [onlineRole, setOnlineRole] = useState<OnlineRole | null>(null);
  const [onlineStatusText, setOnlineStatusText] = useState(isOnline ? (isPrivate ? 'PRIVATE ROOM' : 'LOOKING FOR MATCH') : '');
  const [privateRoomPassword, setPrivateRoomPassword] = useState('');
  const [privateRoomName, setPrivateRoomName] = useState('');
  const [onlineWins, setOnlineWins] = useState<OnlineWins>([0, 0]);
  const onlineSessionRef = useRef<OnlinePeerSession | null>(null);
  const onlineRoomRef = useRef<OnlineMatchResult | null>(null);
  const onlineRoleRef = useRef<OnlineRole | null>(null);
  const onlineStateRef = useRef<OnlineConnectionState>(isOnline ? 'searching' : 'idle');
  const remoteInputRef = useRef<InputFrame>(emptyInputFrame());
  const onlineWinsRef = useRef<OnlineWins>([0, 0]);
  const onlineRematchReadyRef = useRef({ local: false, remote: false });
  const onlineWinnerRecordedRef = useRef(false);
  const onlineSnapshotSequenceRef = useRef(0);
  const onlineInputSequenceRef = useRef(0);
  const onlineLatestSnapshotRef = useRef(-1);
  const onlineLastSnapshotAtRef = useRef(0);
  const onlineClosingRef = useRef(false);
  const onlineLocalProfileRef = useRef<OnlinePlayerProfile | null>(onlineProfile);
  const onlineRemoteProfileRef = useRef<OnlinePlayerProfile | null>(null);
  const onlinePerformanceRef = useRef(emptyOnlinePerformancePair());
  const onlineLastClashInputRef = useRef<{ clashId: number; button: MoveInput | null }>({ clashId: 0, button: null });

  useEffect(() => {
    matchRef.current = match;
  }, [match]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!paused) return undefined;
    const frame = window.requestAnimationFrame(() => focusDefaultMenuElement());
    return () => window.cancelAnimationFrame(frame);
  }, [paused]);

  useEffect(() => {
    onlineStateRef.current = onlineState;
    if (onlineState === 'connected') setPaused(false);
  }, [onlineState]);

  useEffect(() => {
    onlineRoleRef.current = onlineRole;
  }, [onlineRole]);

  useEffect(() => {
    onlineLocalProfileRef.current = onlineProfile;
  }, [onlineProfile]);

  useEffect(() => {
    if (match.lastHitId < lastCombatEventId.current) {
      seenCombatEventIds.current.clear();
      setCombatPopups([]);
      seenImpactAudioEventIds.current.clear();
    }
    lastCombatEventId.current = match.lastHitId;

    match.combatEvents.forEach((event) => {
      if (seenCombatEventIds.current.has(event.id)) return;
      seenCombatEventIds.current.add(event.id);
      if (mode === 'online' && onlineRoleRef.current === 'host' && onlineStateRef.current === 'connected') {
        const index = event.slot - 1;
        onlinePerformanceRef.current[index] = addCombatPopupEventToOnlineStats(onlinePerformanceRef.current[index], event);
      }
      const popup: ActiveCombatPopup = { ...event, uid: Date.now() + event.id };
      setCombatPopups((current) => [...current.filter((item) => item.slot !== event.slot).slice(-2), popup].slice(-4));
      window.setTimeout(() => {
        setCombatPopups((current) => current.filter((item) => item.uid !== popup.uid));
      }, 2600);
    });

    match.impactEvents.forEach((event) => {
      if (!seenImpactAudioEventIds.current.has(event.id)) {
        seenImpactAudioEventIds.current.add(event.id);
        playHitSfx(event, settings.audio);
      }
      if (seenImpactScoreEventIds.current.has(event.id)) return;
      seenImpactScoreEventIds.current.add(event.id);
      if (mode !== 'online' || onlineRoleRef.current !== 'host' || onlineStateRef.current !== 'connected') return;
      if (event.kind === 'block') {
        const index = event.defenderSlot - 1;
        onlinePerformanceRef.current[index] = addImpactEventToOnlineStats(onlinePerformanceRef.current[index], event, event.defenderSlot);
        return;
      }
      const index = event.attackerSlot - 1;
      onlinePerformanceRef.current[index] = addImpactEventToOnlineStats(onlinePerformanceRef.current[index], event, event.attackerSlot);
    });
  }, [match.combatEvents, match.impactEvents, match.lastHitId, mode, settings.audio]);

  useEffect(() => {
    screenRef.current?.focus();
  }, []);

  const makeOnlineMatch = useCallback((hostCharacterId: string, guestCharacterId: string, onlineStageId: string) => {
    const hostCharacter = roster.find((character) => character.id === hostCharacterId) ?? p1;
    const guestCharacter = roster.find((character) => character.id === guestCharacterId) ?? p2;
    const onlineStage = stages.find((item) => item.id === onlineStageId) ?? stage;
    return createMatch(hostCharacter, guestCharacter, onlineStage, 'online', cpuDifficulty, withFreshAiSeed(matchOptions));
  }, [cpuDifficulty, matchOptions, p1, p2, roster, stage, stages]);

  const publishOnlineSnapshot = useCallback((force = false) => {
    if (onlineRoleRef.current !== 'host' || onlineStateRef.current !== 'connected') return;
    const now = performance.now();
    if (!force && now - onlineLastSnapshotAtRef.current < 33) return;
    onlineLastSnapshotAtRef.current = now;
    onlineSessionRef.current?.send({
      type: 'snapshot',
      snapshot: compactMatchSnapshot(matchRef.current, onlineSnapshotSequenceRef.current += 1),
      wins: onlineWinsRef.current
    });
  }, []);

  const startOnlineRematch = useCallback(() => {
    const current = matchRef.current;
    const fresh = makeOnlineMatch(current.fighters[0].character.id, current.fighters[1].character.id, current.stage.id);
    matchRef.current = fresh;
    setMatch(fresh);
    onlineWinnerRecordedRef.current = false;
    onlinePerformanceRef.current = emptyOnlinePerformancePair();
    seenCombatEventIds.current.clear();
    seenImpactScoreEventIds.current.clear();
    seenImpactAudioEventIds.current.clear();
    lastCombatEventId.current = 0;
    onlineRematchReadyRef.current = { local: false, remote: false };
    setOnlineStatusText('CONNECTED');
    onlineSessionRef.current?.send({ type: 'rematchStart', wins: onlineWinsRef.current });
    publishOnlineSnapshot(true);
  }, [makeOnlineMatch, publishOnlineSnapshot]);

  const markOnlineDisconnected = useCallback((message = 'Opponent disconnected') => {
    onlineClosingRef.current = true;
    try {
      onlineSessionRef.current?.close();
    } catch {
      // no-op
    }
    onlineSessionRef.current = null;
    onlineStateRef.current = 'disconnected';
    onlineRoleRef.current = null;
    onlineRoomRef.current = null;
    remoteInputRef.current = emptyInputFrame();
    onlineRematchReadyRef.current = { local: false, remote: false };
    onlineRemoteProfileRef.current = null;
    onlineWinsRef.current = [0, 0];
    onlinePerformanceRef.current = emptyOnlinePerformancePair();
    seenImpactScoreEventIds.current.clear();
    seenImpactAudioEventIds.current.clear();
    setOnlineState('disconnected');
    setOnlineRole(null);
    setOnlineWins([0, 0]);
    setOnlineStatusText(message);
    setPrivateRoomPassword('');
    setPrivateRoomName('');
  }, []);

  const cleanupOnline = useCallback((notifyOpponent = true) => {
    if (!isOnline) return;
    const session = onlineSessionRef.current;
    const room = onlineRoomRef.current;
    onlineClosingRef.current = true;
    if (notifyOpponent) {
      try {
        session?.send({ type: 'leave', reason: 'left' });
      } catch {
        // no-op
      }
    }
    try {
      session?.close();
    } catch {
      // no-op
    }
    onlineSessionRef.current = null;
    onlineRoomRef.current = null;
    onlineRoleRef.current = null;
    onlineStateRef.current = 'idle';
    remoteInputRef.current = emptyInputFrame();
    onlineRematchReadyRef.current = { local: false, remote: false };
    onlineRemoteProfileRef.current = null;
    onlineWinsRef.current = [0, 0];
    onlinePerformanceRef.current = emptyOnlinePerformancePair();
    seenImpactScoreEventIds.current.clear();
    seenImpactAudioEventIds.current.clear();
    if (room || session?.peerId) {
      const leaveRequest = { roomId: room?.roomId, ownerToken: room?.ownerToken, peerId: session?.peerId };
      void (isPrivate ? leavePrivateRoom(leaveRequest) : leaveOnlineRoom(leaveRequest)).catch(() => undefined);
    }
    setPrivateRoomPassword('');
    setPrivateRoomName('');
  }, [isOnline, isPrivate]);

  const recordOnlineMatchWin = useCallback((candidate: MatchSnapshot) => {
    if (candidate.phase !== 'matchOver' || !candidate.winnerSlot || onlineWinnerRecordedRef.current) return;
    const wins: OnlineWins = [...onlineWinsRef.current] as OnlineWins;
    wins[candidate.winnerSlot - 1] += 1;
    onlineWinsRef.current = wins;
    onlineWinnerRecordedRef.current = true;
    setOnlineWins(wins);
    setOnlineStatusText('REMATCH?');
    if (mode === 'online' && onlineRoleRef.current === 'host') {
      const localProfile = onlineLocalProfileRef.current;
      const remoteProfile = onlineRemoteProfileRef.current;
      if (localProfile && remoteProfile) {
        const [p1Stats, p2Stats] = onlinePerformanceRef.current;
        const p1Points = calculateOnlinePerformancePoints(p1Stats, candidate.fighters[0].roundsWon, candidate.winnerSlot === 1);
        const p2Points = calculateOnlinePerformancePoints(p2Stats, candidate.fighters[1].roundsWon, candidate.winnerSlot === 2);
        void submitLeaderboardResult({
          players: [
            { profile: localProfile, points: p1Points },
            { profile: remoteProfile, points: p2Points }
          ]
        }).catch((error) => {
          console.error('Failed to submit leaderboard result', error);
        });
      }
    }
    publishOnlineSnapshot(true);
  }, [mode, publishOnlineSnapshot]);

  const handleOnlineMessage = useCallback((message: OnlineMessage) => {
    if (message.type === 'hello') {
      if (message.protocol !== ONLINE_PROTOCOL_VERSION) {
        onlineSessionRef.current?.send({ type: 'error', message: 'Protocol mismatch' });
        markOnlineDisconnected('Version mismatch');
        return;
      }
      if (message.profile) onlineRemoteProfileRef.current = message.profile;
      if (onlineRoleRef.current === 'host') {
        const onlineMatch = makeOnlineMatch(p1.id, message.characterId, onlineRoomRef.current?.stageId ?? stage.id);
        matchRef.current = onlineMatch;
        setMatch(onlineMatch);
        onlinePerformanceRef.current = emptyOnlinePerformancePair();
        seenCombatEventIds.current.clear();
        seenImpactScoreEventIds.current.clear();
        seenImpactAudioEventIds.current.clear();
        lastCombatEventId.current = 0;
        onlineStateRef.current = 'connected';
        setOnlineState('connected');
        setOnlineStatusText('CONNECTED');
        publishOnlineSnapshot(true);
      }
      return;
    }
    if (message.type === 'input') {
      if (onlineRoleRef.current === 'host') remoteInputRef.current = decodeInputFrame(message.frame);
      return;
    }
    if (message.type === 'clashInput') {
      const current = matchRef.current.clashState;
      if (onlineRoleRef.current !== 'host' || current.id !== message.clashId || current.status !== 'input') return;
      remoteInputRef.current = mergeInputFrames(remoteInputRef.current, clashButtonInputFrame(message.button));
      return;
    }
    if (message.type === 'snapshot') {
      if (onlineRoleRef.current !== 'guest' || message.snapshot.sequence <= onlineLatestSnapshotRef.current) return;
      onlineLatestSnapshotRef.current = message.snapshot.sequence;
      const current = matchRef.current;
      const needsBase =
        current.fighters[0].character.id !== message.snapshot.p1CharacterId ||
        current.fighters[1].character.id !== message.snapshot.p2CharacterId ||
        current.stage.id !== message.snapshot.stageId ||
        current.mode !== 'online';
      const base = needsBase
        ? makeOnlineMatch(message.snapshot.p1CharacterId, message.snapshot.p2CharacterId, message.snapshot.stageId)
        : current;
      const hydrated = hydrateMatchSnapshot(base, message.snapshot);
      matchRef.current = hydrated;
      onlineWinsRef.current = message.wins;
      setMatch(hydrated);
      setOnlineWins(message.wins);
      onlineStateRef.current = 'connected';
      setOnlineState('connected');
      setOnlineStatusText('CONNECTED');
      return;
    }
    if (message.type === 'rematchReady') {
      onlineRematchReadyRef.current.remote = true;
      if (onlineRoleRef.current === 'host' && onlineRematchReadyRef.current.local) startOnlineRematch();
      return;
    }
    if (message.type === 'rematchStart') {
      onlineRematchReadyRef.current = { local: false, remote: false };
      onlineWinnerRecordedRef.current = false;
      onlineWinsRef.current = message.wins;
      setOnlineWins(message.wins);
      setOnlineStatusText('REMATCH STARTING');
      return;
    }
    if (message.type === 'leave') {
      markOnlineDisconnected('Opponent disconnected');
      return;
    }
    if (message.type === 'error') {
      markOnlineDisconnected(message.message);
    }
  }, [makeOnlineMatch, markOnlineDisconnected, p1.id, publishOnlineSnapshot, stage.id, startOnlineRematch]);

  useEffect(() => {
    if (!isOnline) return undefined;
    let cancelled = false;
    let matchmakingTimer = 0;
    onlineClosingRef.current = false;
    onlineStateRef.current = 'searching';
    onlineRoleRef.current = null;
    onlineRoomRef.current = null;
    remoteInputRef.current = emptyInputFrame();
    onlineWinsRef.current = [0, 0];
    onlineRematchReadyRef.current = { local: false, remote: false };
    onlineWinnerRecordedRef.current = false;
    onlineLatestSnapshotRef.current = -1;
    onlineSnapshotSequenceRef.current = 0;
    onlinePerformanceRef.current = emptyOnlinePerformancePair();
    seenCombatEventIds.current.clear();
    seenImpactScoreEventIds.current.clear();
    seenImpactAudioEventIds.current.clear();
    lastCombatEventId.current = 0;
    setOnlineState('searching');
    setOnlineRole(null);
    setOnlineWins([0, 0]);
    setOnlineStatusText(isPrivate ? (privateRoomIntent?.kind === 'guest' ? 'JOINING PRIVATE ROOM' : 'CREATING PRIVATE ROOM') : 'LOOKING FOR MATCH');
    setPrivateRoomPassword('');
    setPrivateRoomName('');

    const start = async () => {
      try {
        const session = await createOnlinePeerSession({
          characterId: p1.id,
          profile: onlineLocalProfileRef.current ?? undefined,
          onConnection: () => {
            if (onlineRoleRef.current === 'guest') setOnlineStatusText('CONNECTING');
          },
          onMessage: handleOnlineMessage,
          onClose: () => {
            if (!onlineClosingRef.current && onlineStateRef.current === 'connected') markOnlineDisconnected('Opponent disconnected');
          },
          onError: (error) => {
            if (onlineClosingRef.current) return;
            if (onlineStateRef.current === 'connected' || onlineStateRef.current === 'connecting') {
              markOnlineDisconnected(error.message || 'Online connection error');
            } else {
              setOnlineStatusText('LOOKING FOR MATCH');
            }
          }
        });
        if (cancelled) {
          session.close();
          return;
        }
        onlineSessionRef.current = session;

        const poll = async () => {
          if (cancelled || !onlineSessionRef.current) return;
          if (onlineStateRef.current === 'connected' || onlineStateRef.current === 'disconnected') return;
          if (!isPrivate && pausedRef.current) {
            const currentRoom = onlineRoomRef.current;
            if (currentRoom) {
              onlineRoomRef.current = null;
              onlineRoleRef.current = null;
              setOnlineRole(null);
              await leaveOnlineRoom({ roomId: currentRoom.roomId, ownerToken: currentRoom.ownerToken, peerId: session.peerId }).catch(() => undefined);
            }
            onlineStateRef.current = 'searching';
            setOnlineState('searching');
            setOnlineStatusText('SEARCH PAUSED');
            return;
          }
          if (onlineRoleRef.current === 'guest' && onlineStateRef.current === 'connecting') return;
          if (isPrivate) {
            const intent = privateRoomIntent ?? { kind: 'host' as const, roomName: `${p1.displayName} Room`, password: generatePrivateRoomPassword() };
            if (intent.kind === 'host') {
              const currentRoom = onlineRoomRef.current;
              const privateResult = await createPrivateRoom({
                peerId: session.peerId,
                characterId: p1.id,
                stageId: stage.id,
                roomName: intent.roomName,
                password: intent.password,
                roomId: currentRoom?.role === 'host' ? currentRoom.roomId : undefined,
                ownerToken: currentRoom?.role === 'host' ? currentRoom.ownerToken : undefined
              });
              const result = privateRoomToOnlineResult(privateResult);
              onlineRoomRef.current = result;
              onlineRoleRef.current = 'host';
              setOnlineRole('host');
              setPrivateRoomPassword(privateResult.password ?? intent.password);
              setPrivateRoomName(privateResult.roomName);
              onlineStateRef.current = 'searching';
              setOnlineState('searching');
              setOnlineStatusText(privateResult.status === 'matched' ? 'MATCH FOUND' : 'PRIVATE ROOM WAITING');
              return;
            }

            const privateResult = await joinPrivateRoom({
              peerId: session.peerId,
              characterId: p1.id,
              roomId: intent.roomId,
              password: intent.password
            });
            const result = privateRoomToOnlineResult(privateResult);
            onlineRoomRef.current = result;
            onlineRoleRef.current = 'guest';
            setOnlineRole('guest');
            onlineStateRef.current = 'connecting';
            setOnlineState('connecting');
            setOnlineStatusText('MATCH FOUND');
            session.connect(result.hostPeerId);
            return;
          }
          const currentRoom = onlineRoomRef.current;
          const result = await matchmakeOnline({
            peerId: session.peerId,
            characterId: p1.id,
            stageId: stage.id,
            roomId: currentRoom?.role === 'host' ? currentRoom.roomId : undefined,
            ownerToken: currentRoom?.role === 'host' ? currentRoom.ownerToken : undefined
          });
          if (cancelled) return;
          onlineRoomRef.current = result;
          onlineRoleRef.current = result.role;
          setOnlineRole(result.role);
          if (result.role === 'guest') {
            onlineStateRef.current = 'connecting';
            setOnlineState('connecting');
            setOnlineStatusText('MATCH FOUND');
            session.connect(result.hostPeerId);
          } else {
            onlineStateRef.current = 'searching';
            setOnlineState('searching');
            setOnlineStatusText(result.status === 'matched' ? 'MATCH FOUND' : 'LOOKING FOR MATCH');
          }
        };

        await poll();
        matchmakingTimer = window.setInterval(() => {
          void poll().catch((error) => {
            if (!cancelled) setOnlineStatusText(error instanceof Error ? error.message : 'MATCHMAKING ERROR');
          });
        }, 2000);
      } catch (error) {
        if (!cancelled) {
          setOnlineState('error');
          onlineStateRef.current = 'error';
          setOnlineStatusText(error instanceof Error ? error.message : 'ONLINE ERROR');
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      window.clearInterval(matchmakingTimer);
      cleanupOnline(true);
    };
  }, [cleanupOnline, handleOnlineMessage, isOnline, isPrivate, markOnlineDisconnected, p1.displayName, p1.id, privateRoomIntent, stage.id]);

  useEffect(() => {
    if (!isOnline) return undefined;
    const onBeforeUnload = () => cleanupOnline(true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [cleanupOnline, isOnline]);

  useEffect(() => {
    if (!isOnline) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntryElement(event.target)) return;
      if (onlineStateRef.current === 'connected') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      pauseLatch.current = true;
      setPaused((value) => !value);
      clearMenuInputs();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [clearMenuInputs, isOnline]);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let accumulator = 0;
    const fixedStep = 1 / 60;

    const tick = (now: number) => {
      const delta = Math.min(0.2, (now - previous) / 1000);
      previous = now;
      const [p1Input, p2Input] = readInputs();
      frameInputRef.current =
        p1Input.right ? 'p1:right' :
        p1Input.left ? 'p1:left' :
        p1Input.up ? 'p1:up' :
        p1Input.down ? 'p1:down' :
        p1Input.sidestepUp ? 'p1:sidestepUp' :
        p1Input.sidestepDown ? 'p1:sidestepDown' :
        p1Input.sidewalkUp ? 'p1:sidewalkUp' :
        p1Input.sidewalkDown ? 'p1:sidewalkDown' :
        p1Input.jab ? 'p1:jab' :
        p1Input.kick ? 'p1:kick' :
        p1Input.heavy ? 'p1:heavy' :
        p1Input.special ? 'p1:special' :
        p2Input.right ? 'p2:right' :
        p2Input.left ? 'p2:left' :
        p2Input.up ? 'p2:up' :
        p2Input.down ? 'p2:down' :
        p2Input.sidestepUp ? 'p2:sidestepUp' :
        p2Input.sidestepDown ? 'p2:sidestepDown' :
        p2Input.sidewalkUp ? 'p2:sidewalkUp' :
        p2Input.sidewalkDown ? 'p2:sidewalkDown' :
        p2Input.jab ? 'p2:jab' :
        'none';
      const localOnlineInput = mergeInputFrames(p1Input, p2Input);
      const canOpenPauseMenu = !isOnline || onlineStateRef.current !== 'connected';
      if (canOpenPauseMenu && (p1Input.pause || p2Input.pause)) {
        if (!pauseLatch.current) {
          setPaused((value) => !value);
          pauseLatch.current = true;
          clearMenuInputs();
        }
      } else {
        pauseLatch.current = false;
      }

      if (!paused) {
        accumulator += delta;
        while (accumulator >= fixedStep) {
          if (isOnline && onlineStateRef.current === 'connected' && onlineRoleRef.current === 'guest') {
            onlineSessionRef.current?.send({ type: 'input', sequence: onlineInputSequenceRef.current += 1, frame: encodeInputFrame(localOnlineInput) });
            const clash = matchRef.current.clashState;
            const clashButton = clash.status === 'input' ? getClashInputButton(localOnlineInput) : null;
            const lastClashInput = onlineLastClashInputRef.current;
            if (clashButton && (lastClashInput.clashId !== clash.id || lastClashInput.button !== clashButton)) {
              onlineLastClashInputRef.current = { clashId: clash.id, button: clashButton };
              onlineSessionRef.current?.send({
                type: 'clashInput',
                clashId: clash.id,
                button: clashButton,
                elapsedFrame: clash.elapsedFrames,
                sequence: onlineInputSequenceRef.current += 1
              });
            }
            if (!clashButton && lastClashInput.clashId === clash.id) {
              onlineLastClashInputRef.current = { clashId: clash.id, button: null };
            }
          } else if (isOnline && onlineStateRef.current === 'connected' && onlineRoleRef.current === 'host') {
            matchRef.current = stepMatch(matchRef.current, localOnlineInput, remoteInputRef.current, fixedStep);
            recordOnlineMatchWin(matchRef.current);
            publishOnlineSnapshot(matchRef.current.phase !== 'fighting');
          } else if (isOnline) {
            const shouldRefreshWarmup =
              matchRef.current.phase === 'matchOver' ||
              matchRef.current.fighters.some((fighter) => fighter.hp <= fighter.character.stats.health * 0.2);
            matchRef.current = shouldRefreshWarmup
              ? createMatch(p1, p2, stage, 'ai', cpuDifficulty, withFreshAiSeed(matchOptions))
              : stepMatch(matchRef.current, localOnlineInput, emptyInputFrame(), fixedStep);
          } else {
            matchRef.current = stepMatch(matchRef.current, p1Input, p2Input, fixedStep);
          }
          accumulator -= fixedStep;
        }
        if (!(isOnline && onlineStateRef.current === 'connected' && onlineRoleRef.current === 'guest')) setMatch(matchRef.current);
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clearMenuInputs, cpuDifficulty, isOnline, matchOptions, p1, p2, paused, publishOnlineSnapshot, readInputs, recordOnlineMatchWin, stage]);

  const requestOnlineRematch = () => {
    if (!isOnline || onlineStateRef.current !== 'connected') {
      const warmup = createMatch(p1, p2, stage, isOnline ? 'ai' : mode, cpuDifficulty, withFreshAiSeed(matchOptions));
      matchRef.current = warmup;
      setMatch(warmup);
      setPaused(false);
      return;
    }
    onlineRematchReadyRef.current.local = true;
    setOnlineStatusText('WAITING FOR REMATCH');
    onlineSessionRef.current?.send({ type: 'rematchReady' });
    if (onlineRoleRef.current === 'host' && onlineRematchReadyRef.current.remote) startOnlineRematch();
  };

  const reset = () => {
    if (isOnline) {
      requestOnlineRematch();
      return;
    }
    const fresh = createMatch(p1, p2, stage, mode, cpuDifficulty, withFreshAiSeed(matchOptions));
    matchRef.current = fresh;
    setMatch(fresh);
    setPaused(false);
  };

  const leaveToMenu = () => {
    cleanupOnline(true);
    onMenu();
  };

  const leaveToCharacterSelect = () => {
    cleanupOnline(true);
    onCharacterSelect();
  };

  const handleSurfaceKey = (event: ReactKeyboardEvent<HTMLDivElement>, pressed: boolean) => {
    if (event.defaultPrevented) return;
    const binding = getSurfaceKeyBinding(event.nativeEvent, mode, settings.controls);
    if (!binding) return;
    setVirtualAction(binding.player, binding.action, pressed);
    event.preventDefault();
  };

  return (
    <div
      className="fight-screen"
      ref={screenRef}
      tabIndex={-1}
      onPointerDown={() => screenRef.current?.focus()}
      onKeyDown={(event) => handleSurfaceKey(event, true)}
      onKeyUp={(event) => handleSurfaceKey(event, false)}
    >
      <GameScene
        match={match}
        cameraSettings={settings.camera}
        sparkSettings={settings.display.impactSparks}
        audioSettings={settings.audio}
        reducedMotion={settings.display.reducedMotion}
      />
      <FightHud match={match} hudScale={settings.display.hudScale} onlineWins={isOnline ? onlineWins : undefined} />
      <CombatPopupLayer popups={combatPopups} />
      <ClashOverlay match={match} />
      {settings.display.debugOverlay && <FightDebug match={match} paused={paused} lastInput={getLastInput()} frameInput={frameInputRef.current} />}
      {settings.display.touchControls !== 'off' && <TouchControls onAction={setVirtualAction} forceVisible={settings.display.touchControls === 'on'} />}
      {match.message && match.clashState.status === 'none' && <div className={`match-message ${match.phase === 'intro' ? 'intro-message' : ''} ${match.phase === 'roundOver' ? 'ko-message' : ''}`}>{match.message}</div>}
      {isOnline && onlineState !== 'connected' && onlineState !== 'idle' && onlineState !== 'disconnected' && onlineState !== 'error' && (
        <div className={`match-message online-search-message ${isPrivate ? 'private-search-message' : ''}`}>
          <span>{onlineStatusText}</span>
          {isPrivate && privateRoomPassword && onlineRole !== 'guest' && (
            <strong>{privateRoomName ? `${privateRoomName} ` : ''}{privateRoomPassword}</strong>
          )}
        </div>
      )}
      {isOnline && onlineState === 'connected' && (
        <div className="online-status-pill">
          {onlineRole === 'host' ? 'HOST' : 'GUEST'} ONLINE
        </div>
      )}
      {paused && (
        <div className="pause-overlay">
          <Pause size={32} />
          <h2>Paused</h2>
          <ConfiguredMoveList characters={[p1, p2]} />
          <div className="overlay-actions">
            <button className="primary-button" onClick={() => setPaused(false)}>
              <Play size={18} />
              Resume
            </button>
            <button className="secondary-button" onClick={reset}>
              <RotateCcw size={18} />
              Restart
            </button>
            <button className="secondary-button" onClick={leaveToCharacterSelect}>
              <Users size={18} />
              Select
            </button>
            <button className="secondary-button" onClick={leaveToMenu}>
              <Home size={18} />
              Menu
            </button>
          </div>
        </div>
      )}
      {isOnline && (onlineState === 'disconnected' || onlineState === 'error') && (
        <div className="pause-overlay online-disconnect-overlay">
          <Wifi size={34} />
          <h2>{onlineStatusText || 'Opponent disconnected'}</h2>
          <div className="overlay-actions">
            <button className="primary-button" onClick={leaveToCharacterSelect}>
              <Wifi size={18} />
              Online Search
            </button>
            <button className="secondary-button" onClick={leaveToMenu}>
              <Home size={18} />
              Menu
            </button>
          </div>
        </div>
      )}
      {match.phase === 'matchOver' && (!isOnline || onlineState === 'connected') && (
        <div className="pause-overlay results-overlay">
          <Swords size={34} />
          <h2>{match.message}</h2>
          <div className="overlay-actions">
            <button className="primary-button" onClick={reset}>
              <RotateCcw size={18} />
              {isOnline && onlineRematchReadyRef.current.local ? 'Waiting' : 'Rematch'}
            </button>
            <button className="secondary-button" onClick={leaveToCharacterSelect}>
              <Users size={18} />
              Character Select
            </button>
            <button className="secondary-button" onClick={leaveToMenu}>
              <Home size={18} />
              Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfiguredMoveList({ characters }: { characters: [CharacterDefinition, CharacterDefinition] }) {
  return (
    <div className="pause-movelist">
      {characters.map((character, index) => {
        const configured = animationSlots.filter((slot) => slot.command && (character.animationFrames?.[getSlotDataKey(slot)]?.length ?? 0) > 0);
        return (
          <section key={character.id}>
            <h3>{index === 0 ? 'P1' : 'P2'} {character.displayName}</h3>
            {configured.length === 0 ? (
              <p>No custom commands configured.</p>
            ) : (
              <div>
                {configured.slice(0, 36).map((slot) => {
                  const move = resolveSlotMove(character, slot);
                  return (
                    <span key={slot.key}>
                      <NotationGroup tokens={slot.notation} />
                      {formatMoveSlotLabel(slot, move)}
                      <small>{formatFrameSummary(move)}</small>
                    </span>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function getSurfaceKeyBinding(event: KeyboardEvent, mode: MatchMode, controls: GameSettings['controls']): { player: 1 | 2; action: ActionName } | null {
  return getKeyboardBindingsForEvent(event, mode, controls)[0] ?? null;
}

function mergeInputFrames(primary: InputFrame, secondary: InputFrame): InputFrame {
  const merged = emptyInputFrame();
  for (const action of Object.keys(merged) as ActionName[]) {
    merged[action] = primary[action] || secondary[action];
  }
  return merged;
}

const clashButtonLabels: Record<MoveInput, string> = {
  jab: '1',
  heavy: '2',
  kick: '3',
  special: '4'
};

const clashButtonOrder: MoveInput[] = ['jab', 'heavy', 'kick', 'special'];

function getClashInputButton(input: InputFrame): MoveInput | null {
  return clashButtonOrder.find((action) => input[action]) ?? null;
}

function clashButtonInputFrame(button: MoveInput): InputFrame {
  const frame = emptyInputFrame();
  frame[button] = true;
  return frame;
}

function FightDebug({
  match,
  paused,
  lastInput,
  frameInput
}: {
  match: MatchSnapshot;
  paused: boolean;
  lastInput: string;
  frameInput: string;
}) {
  const [p1, p2] = match.fighters;
  return (
    <div className="fight-debug" aria-hidden="true">
      <span data-testid="match-phase">{paused ? 'paused' : match.phase}</span>
      <span data-testid="match-mode">{match.mode}</span>
      <span data-testid="cpu-difficulty">{match.cpuDifficulty}</span>
      <span data-testid="match-timer">{match.timer.toFixed(2)}</span>
      <span data-testid="p1-position">{`${p1.position.x.toFixed(3)},${p1.position.z.toFixed(3)}`}</span>
      <span data-testid="p2-position">{`${p2.position.x.toFixed(3)},${p2.position.z.toFixed(3)}`}</span>
      <span data-testid="p1-height">{p1.position.y.toFixed(3)}</span>
      <span data-testid="p2-height">{p2.position.y.toFixed(3)}</span>
      <span data-testid="p1-state">{p1.state}</span>
      <span data-testid="p2-state">{p2.state}</span>
      <span data-testid="p2-hp">{p2.hp.toFixed(0)}</span>
      <span data-testid="p1-ki">{p1.ki.toFixed(0)}</span>
      <span data-testid="p2-ki">{p2.ki.toFixed(0)}</span>
      <span data-testid="last-input">{lastInput}</span>
      <span data-testid="frame-input">{frameInput}</span>
    </div>
  );
}

function ClashOverlay({ match }: { match: MatchSnapshot }) {
  const clash = match.clashState;
  if (!clash || clash.status === 'none') return null;
  const p1Progress = clash.p1.completedFrame !== null ? clash.sequence.length : clash.p1.progress;
  const p2Progress = clash.p2.completedFrame !== null ? clash.sequence.length : clash.p2.progress;
  const resultText =
    clash.status === 'result'
      ? clash.winnerSlot
        ? `${clash.winnerSlot === 1 ? match.fighters[0].character.displayName : match.fighters[1].character.displayName} Wins`
        : 'Draw'
      : clash.status === 'intro'
        ? 'Ki Clash'
        : 'Match the sequence';
  return (
    <div className={`clash-overlay ${clash.status}`} aria-live="assertive">
      <div className="clash-vignette" />
      <div className="clash-panel">
        <span className="clash-eyebrow">{clash.status === 'result' ? 'Result' : 'Struggle'}</span>
        <strong>{resultText}</strong>
        {clash.status !== 'intro' && (
          <div className="clash-sequence" aria-label="Clash quick time sequence">
            {clash.sequence.map((button, index) => (
              <span key={`${clash.id}-${button}-${index}`}>{clashButtonLabels[button]}</span>
            ))}
          </div>
        )}
        <div className="clash-progress">
          <ClashProgress name={match.fighters[0].character.displayName} progress={p1Progress} total={clash.sequence.length} failed={clash.p1.failed} />
          <ClashProgress name={match.fighters[1].character.displayName} progress={p2Progress} total={clash.sequence.length} failed={clash.p2.failed} />
        </div>
        {clash.status === 'result' && clash.damage > 0 && <small>{clash.damage} clash damage</small>}
      </div>
    </div>
  );
}

function ClashProgress({ name, progress, total, failed }: { name: string; progress: number; total: number; failed: boolean }) {
  return (
    <div className={`clash-progress-row ${failed ? 'failed' : ''}`}>
      <span>{name}</span>
      <div>
        {Array.from({ length: total }, (_, index) => (
          <i key={index} className={index < progress ? 'filled' : ''} />
        ))}
      </div>
    </div>
  );
}

function FightHud({ match, hudScale, onlineWins }: { match: MatchSnapshot; hudScale: number; onlineWins?: OnlineWins }) {
  const [p1, p2] = match.fighters;
  return (
    <div className="fight-hud" style={{ '--hud-scale': hudScale } as CSSProperties}>
      <HealthBar fighter={p1} align="left" onlineWins={onlineWins?.[0]} />
      <div className="round-box">
        <strong>{Math.ceil(match.timer)}</strong>
      </div>
      <HealthBar fighter={p2} align="right" onlineWins={onlineWins?.[1]} />
    </div>
  );
}

function CombatPopupLayer({ popups }: { popups: ActiveCombatPopup[] }) {
  const leftPopups = popups.filter((popup) => popup.slot === 1);
  const rightPopups = popups.filter((popup) => popup.slot === 2);
  return (
    <div className="combat-popup-layer" aria-live="polite">
      <div className="combat-popup-column left">
        {leftPopups.map((popup) => (
          <CombatPopupCard key={popup.uid} popup={popup} />
        ))}
      </div>
      <div className="combat-popup-column right">
        {rightPopups.map((popup) => (
          <CombatPopupCard key={popup.uid} popup={popup} />
        ))}
      </div>
    </div>
  );
}

function CombatPopupCard({ popup }: { popup: ActiveCombatPopup }) {
  const punishLabel = popup.kind === 'whiffPunish' ? 'Whiff Punish' : popup.kind === 'punish' ? 'Punish' : '';
  const clashLabel =
    popup.kind === 'clashPerfect' ? 'Clash Perfect' :
    popup.kind === 'clashWin' ? 'Clash Win' :
    popup.kind === 'clashDraw' ? 'Clash Draw' :
    '';
  return (
    <div className={`combat-popup-card ${popup.kind}`}>
      {clashLabel ? (
        <>
          <div className="punish-line">{clashLabel}</div>
          {popup.damage > 0 && (
            <div className="damage-line">
              <strong>{Math.round(popup.damage)}</strong>
              <span>Damage</span>
            </div>
          )}
        </>
      ) : popup.hits >= 2 && (
        <>
          <div className="combo-line">
            <strong>{popup.hits}</strong>
            <span>Hit Combo</span>
          </div>
          <div className="damage-line">
            <strong>{Math.round(popup.damage)}</strong>
            <span>Damage</span>
          </div>
        </>
      )}
      {punishLabel && !clashLabel && <div className="punish-line">{punishLabel}</div>}
      <small>{popup.moveLabel}</small>
    </div>
  );
}

function HealthBar({ fighter, align, onlineWins }: { fighter: MatchSnapshot['fighters'][number]; align: 'left' | 'right'; onlineWins?: number }) {
  const percent = Math.max(0, Math.min(100, (fighter.hp / fighter.character.stats.health) * 100));
  const kiPercent = Math.max(0, Math.min(100, fighter.ki));
  const isDanger = percent <= 25;
  const portraitPath = getHudPortraitPath(fighter.character);
  return (
    <div className={`health ${align} ${isDanger ? 'danger' : ''}`}>
      <div className="health-identity">
        <div className="hud-portrait" aria-hidden="true">
          {portraitPath ? <img src={portraitPath} alt="" /> : <span>{fighter.character.displayName.slice(0, 2).toUpperCase()}</span>}
        </div>
        <div className="health-label">
          <strong>{fighter.character.displayName}</strong>
        </div>
      </div>
      <div className="health-track">
        <span style={{ width: `${percent}%`, background: isDanger ? 'linear-gradient(90deg, #ff1f32, #ff5b2f 60%, #fff0a5)' : fighter.character.colors.primary }} />
      </div>
      <div className="ki-track" aria-label={`${fighter.character.displayName} ki`}>
        <span style={{ width: `${kiPercent}%` }} />
      </div>
      <div className="round-pips" aria-label={`${fighter.character.displayName} rounds won`}>
        {Array.from({ length: ROUNDS_TO_WIN }, (_, pip) => (
          <span key={pip} className={pip < fighter.roundsWon ? 'won' : ''} />
        ))}
      </div>
      {onlineWins !== undefined && onlineWins > 0 && <div className="online-wins">WINS: {onlineWins}</div>}
    </div>
  );
}

function getHudPortraitPath(character: MatchSnapshot['fighters'][number]['character']) {
  return character.animationFrames?.idle?.[0] ?? character.animationFrames?.walkForward?.[0] ?? character.spriteSheetPath ?? '';
}

function FooterActions({
  onBack,
  middleAction,
  onNext,
  nextLabel,
  nextDisabled = false
}: {
  onBack: () => void;
  middleAction?: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
  };
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  return (
    <footer className="footer-actions">
      <button className="secondary-button" onClick={onBack}>
        <Home size={18} />
        Back
      </button>
      {middleAction && (
        <button className="secondary-button" onClick={middleAction.onClick}>
          {middleAction.icon}
          {middleAction.label}
        </button>
      )}
      <button className="primary-button" onClick={onNext} disabled={nextDisabled}>
        <Play size={18} />
        {nextLabel}
      </button>
    </footer>
  );
}
