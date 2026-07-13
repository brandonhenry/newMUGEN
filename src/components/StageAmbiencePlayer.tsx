import { useEffect, useMemo, useRef } from 'react';
import { resolveStageAmbience } from '../lib/stageAmbience';
import type { GameSettings, StageAmbienceCueDefinition, StageAmbiencePresetDefinition, StageDefinition } from '../types';

const ENTER_FADE_MS = 500;
const EXIT_FADE_MS = 250;
const warnedAudioPaths = new Set<string>();

type LoopPlayback = {
  audio: HTMLAudioElement;
  volume: number;
};

type AmbiencePlaybackGroup = {
  key: string;
  preset: StageAmbiencePresetDefinition;
  loops: LoopPlayback[];
  baseVolume: number;
  gain: number;
  cueTimer: number | null;
  cueAudio: HTMLAudioElement | null;
  fadeFrame: number | null;
  disposed: boolean;
};

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, value));
}

function warnAudioUnavailable(path: string, error?: unknown) {
  if (!import.meta.env.DEV || warnedAudioPaths.has(path)) return;
  warnedAudioPaths.add(path);
  console.warn(`KORE stage ambience unavailable: ${path}`, error);
}

function renderGroupVolume(group: AmbiencePlaybackGroup) {
  for (const loop of group.loops) loop.audio.volume = clampVolume(group.baseVolume * loop.volume * group.gain);
  if (group.cueAudio) group.cueAudio.volume = clampVolume(group.baseVolume * group.gain * Number(group.cueAudio.dataset.ambienceVolume ?? 0));
}

function stopCue(group: AmbiencePlaybackGroup) {
  if (group.cueTimer !== null) window.clearTimeout(group.cueTimer);
  group.cueTimer = null;
  if (group.cueAudio) {
    group.cueAudio.onended = null;
    group.cueAudio.onerror = null;
    group.cueAudio.pause();
    group.cueAudio.removeAttribute('src');
    group.cueAudio.load();
  }
  group.cueAudio = null;
}

function disposeGroup(group: AmbiencePlaybackGroup) {
  if (group.disposed) return;
  group.disposed = true;
  if (group.fadeFrame !== null) window.cancelAnimationFrame(group.fadeFrame);
  group.fadeFrame = null;
  stopCue(group);
  for (const loop of group.loops) {
    loop.audio.pause();
    loop.audio.removeAttribute('src');
    loop.audio.load();
  }
  group.loops = [];
}

function fadeGroup(group: AmbiencePlaybackGroup, targetGain: number, durationMs: number, onComplete?: () => void) {
  if (group.fadeFrame !== null) window.cancelAnimationFrame(group.fadeFrame);
  const startGain = group.gain;
  const startTime = performance.now();
  const tick = (time: number) => {
    if (group.disposed) return;
    const progress = durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (time - startTime) / durationMs));
    group.gain = startGain + (targetGain - startGain) * progress;
    renderGroupVolume(group);
    if (progress >= 1) {
      group.fadeFrame = null;
      onComplete?.();
      return;
    }
    group.fadeFrame = window.requestAnimationFrame(tick);
  };
  group.fadeFrame = window.requestAnimationFrame(tick);
}

function randomItem<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function scheduleNextCue(group: AmbiencePlaybackGroup) {
  if (group.disposed || !group.preset.cues?.length) return;
  const cue = randomItem(group.preset.cues);
  if (!cue) return;
  const delayRange = Math.max(0, cue.maxDelaySeconds - cue.minDelaySeconds);
  const delayMs = (cue.minDelaySeconds + Math.random() * delayRange) * 1000;
  group.cueTimer = window.setTimeout(() => playCue(group, cue), delayMs);
}

function playCue(group: AmbiencePlaybackGroup, cue: StageAmbienceCueDefinition) {
  group.cueTimer = null;
  if (group.disposed || group.cueAudio || cue.paths.length === 0) return;
  const path = randomItem(cue.paths);
  if (!path) return;
  const audio = new Audio(path);
  audio.preload = 'auto';
  audio.dataset.ambienceVolume = String(cue.volume);
  audio.volume = clampVolume(group.baseVolume * group.gain * cue.volume);
  group.cueAudio = audio;
  const finish = () => {
    if (group.cueAudio !== audio) return;
    audio.onended = null;
    audio.onerror = null;
    group.cueAudio = null;
    scheduleNextCue(group);
  };
  audio.onended = finish;
  audio.onerror = () => {
    warnAudioUnavailable(path);
    finish();
  };
  audio.play().catch((error) => {
    warnAudioUnavailable(path, error);
    finish();
  });
}

function createGroup(key: string, preset: StageAmbiencePresetDefinition, baseVolume: number) {
  const group: AmbiencePlaybackGroup = {
    key,
    preset,
    loops: [],
    baseVolume,
    gain: 0,
    cueTimer: null,
    cueAudio: null,
    fadeFrame: null,
    disposed: false
  };
  group.loops = preset.loops.map((loop) => {
    const audio = new Audio(loop.path);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.play().catch((error) => warnAudioUnavailable(loop.path, error));
    return { audio, volume: loop.volume };
  });
  fadeGroup(group, 1, ENTER_FADE_MS);
  scheduleNextCue(group);
  return group;
}

export function StageAmbiencePlayer({
  audio,
  stage,
  active
}: {
  audio: GameSettings['audio'];
  stage: StageDefinition | null;
  active: boolean;
}) {
  const groupsRef = useRef<AmbiencePlaybackGroup[]>([]);
  const currentGroupRef = useRef<AmbiencePlaybackGroup | null>(null);
  const baseVolume = audio.muted ? 0 : clampVolume(audio.master * audio.ambience);
  const enabled = active && baseVolume > 0;
  const preset = useMemo(() => enabled ? resolveStageAmbience(stage) : undefined, [enabled, stage]);
  const sourceKey = enabled && stage?.ambiencePreset && preset ? `${stage.id}:${stage.ambiencePreset}` : '';

  useEffect(() => {
    const previous = currentGroupRef.current;
    if (previous?.key === sourceKey) return;
    currentGroupRef.current = null;
    if (previous) {
      stopCue(previous);
      fadeGroup(previous, 0, sourceKey ? ENTER_FADE_MS : EXIT_FADE_MS, () => {
        disposeGroup(previous);
        groupsRef.current = groupsRef.current.filter((group) => group !== previous);
      });
    }
    if (!sourceKey || !preset) return;
    const group = createGroup(sourceKey, preset, baseVolume);
    groupsRef.current.push(group);
    currentGroupRef.current = group;
  }, [preset, sourceKey]);

  useEffect(() => {
    if (baseVolume <= 0) return;
    for (const group of groupsRef.current) {
      group.baseVolume = baseVolume;
      renderGroupVolume(group);
    }
  }, [baseVolume]);

  useEffect(() => () => {
    for (const group of groupsRef.current) disposeGroup(group);
    groupsRef.current = [];
    currentGroupRef.current = null;
  }, []);

  return (
    <div
      className="stage-ambience-player"
      data-testid="stage-ambience-player"
      data-active={Boolean(sourceKey)}
      data-preset={enabled ? stage?.ambiencePreset ?? '' : ''}
      aria-hidden="true"
    />
  );
}
