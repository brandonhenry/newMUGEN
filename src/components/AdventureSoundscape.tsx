import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ADVENTURE_HIT_SFX,
  ADVENTURE_PLAYER_HIT_SFX,
  ADVENTURE_PORTAL_SFX,
  ADVENTURE_RESOURCE_SFX,
  adventureAmbiencePreset,
  adventureSurfaceMaterial,
  subscribeAdventureAudio,
  type AdventureAudioEvent,
  type AdventureSurfaceMaterial
} from '../story/adventureAudio';
import type { AdventureMusicContext, StoryAttackInput } from '../story/types';
import type { GameSettings, StageDefinition } from '../types';
import { StageAmbiencePlayer } from './StageAmbiencePlayer';

type AudioContextWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
type ClipPool = { clips: HTMLAudioElement[]; cursor: number };

const STEP_PROFILE: Record<AdventureSurfaceMaterial, { cutoff: number; tone: number; duration: number; noise: number }> = {
  grass: { cutoff: 980, tone: 92, duration: 0.085, noise: 0.9 },
  wood: { cutoff: 1350, tone: 170, duration: 0.075, noise: 0.42 },
  metal: { cutoff: 2600, tone: 760, duration: 0.09, noise: 0.32 },
  stone: { cutoff: 1450, tone: 118, duration: 0.07, noise: 0.48 },
  ice: { cutoff: 3900, tone: 1280, duration: 0.1, noise: 0.5 },
  sand: { cutoff: 620, tone: 72, duration: 0.105, noise: 1 },
  crystal: { cutoff: 4200, tone: 1560, duration: 0.11, noise: 0.28 },
  water: { cutoff: 480, tone: 82, duration: 0.13, noise: 0.75 }
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function makeAdventureStage(context: AdventureMusicContext, underwater: boolean): StageDefinition {
  const ambiencePreset = adventureAmbiencePreset(context, underwater);
  return {
    id: `adventure:${context.worldId}:${context.depth ? 'depth' : context.mapId ?? 'surface'}:${underwater ? 'water' : ambiencePreset}`,
    name: 'Adventure ambience',
    subtitle: context.worldId,
    ambiencePreset,
    floor: '#111827',
    rail: '#111827',
    light: '#ffffff'
  };
}

function createAudioContext(current: AudioContext | null) {
  if (current || typeof window === 'undefined') return current;
  const audioWindow = window as AudioContextWindow;
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

function playSynthStep(context: AudioContext, material: AdventureSurfaceMaterial, volume: number, scale = 1) {
  const profile = STEP_PROFILE[material];
  const now = context.currentTime;
  const duration = profile.duration * scale;
  const frames = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    const envelope = Math.pow(1 - index / frames, 2.4);
    data[index] = (Math.random() * 2 - 1) * envelope;
  }
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = buffer;
  filter.type = material === 'ice' || material === 'crystal' || material === 'metal' ? 'highpass' : 'lowpass';
  filter.frequency.value = profile.cutoff * (0.92 + Math.random() * 0.16);
  noiseGain.gain.setValueAtTime(volume * profile.noise, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(filter);
  filter.connect(noiseGain);
  noiseGain.connect(context.destination);
  noise.start(now);
  const tone = context.createOscillator();
  const toneGain = context.createGain();
  tone.type = material === 'ice' || material === 'crystal' ? 'sine' : 'triangle';
  tone.frequency.setValueAtTime(profile.tone * (0.94 + Math.random() * 0.12), now);
  tone.frequency.exponentialRampToValueAtTime(Math.max(40, profile.tone * 0.68), now + duration);
  toneGain.gain.setValueAtTime(volume * (material === 'grass' || material === 'sand' ? 0.16 : 0.38), now);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  tone.connect(toneGain);
  toneGain.connect(context.destination);
  tone.start(now);
  tone.stop(now + duration);
}

function playWhoosh(context: AudioContext, attackInput: StoryAttackInput, volume: number) {
  const duration = attackInput === 'special' ? 0.28 : attackInput === 'heavy' ? 0.22 : attackInput === 'kick' ? 0.17 : 0.13;
  const now = context.currentTime;
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * Math.sin(Math.PI * index / data.length);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.Q.value = attackInput === 'special' ? 0.65 : 1.1;
  filter.frequency.setValueAtTime(attackInput === 'heavy' ? 1100 : 1900, now);
  filter.frequency.exponentialRampToValueAtTime(attackInput === 'special' ? 360 : 520, now + duration);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + duration * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(now);
}

export function AdventureSoundscape({ audio, active, context }: {
  audio: GameSettings['audio'];
  active: boolean;
  context: AdventureMusicContext;
}) {
  const audioContext = useRef<AudioContext | null>(null);
  const pools = useRef(new Map<string, ClipPool>());
  const [underwater, setUnderwater] = useState(false);
  const ambienceStage = useMemo(() => makeAdventureStage(context, underwater), [context, underwater]);
  const sfxVolume = audio.muted || !active ? 0 : clamp(audio.master * audio.sfx);
  const hitVolume = sfxVolume * clamp(audio.hitSfx);
  const ambienceAudio = useMemo(() => ({
    ...audio,
    ambience: audio.ambience * (['elite', 'race', 'tension'].includes(context.phase) ? 0.68 : 1)
  }), [audio, context.phase]);

  useEffect(() => setUnderwater(false), [context.depth, context.mapId, context.worldId]);

  useEffect(() => {
    const playClip = (path: string, volume: number, playbackRate = 1) => {
      if (volume <= 0 || typeof Audio === 'undefined') return;
      let pool = pools.current.get(path);
      if (!pool) {
        pool = { clips: Array.from({ length: 3 }, () => { const clip = new Audio(path); clip.preload = 'auto'; return clip; }), cursor: 0 };
        pools.current.set(path, pool);
      }
      const clip = pool.clips.find((candidate) => candidate.paused || candidate.ended) ?? pool.clips[pool.cursor];
      pool.cursor = (pool.cursor + 1) % pool.clips.length;
      clip.pause();
      clip.currentTime = 0;
      clip.volume = clamp(volume);
      clip.playbackRate = playbackRate;
      void clip.play().catch(() => undefined);
    };
    const playSynth = (event: AdventureAudioEvent) => {
      if (sfxVolume <= 0) return;
      audioContext.current = createAudioContext(audioContext.current);
      const synth = audioContext.current;
      if (!synth) return;
      if (synth.state === 'suspended') void synth.resume().catch(() => undefined);
      const surface = adventureSurfaceMaterial(context, underwater);
      if (event.kind === 'step') playSynthStep(synth, surface, sfxVolume * (event.sprinting ? 0.12 : 0.09), event.sprinting ? 0.84 : 1);
      else if (event.kind === 'jump') playSynthStep(synth, surface, sfxVolume * 0.1, 0.72);
      else if (event.kind === 'land') playSynthStep(synth, surface, sfxVolume * 0.18 * clamp(event.intensity ?? 1), 1.35);
      else if (event.kind === 'attack') playWhoosh(synth, event.attackInput, sfxVolume * (event.attackInput === 'special' ? 0.28 : event.attackInput === 'heavy' ? 0.22 : 0.16));
      else if (event.kind === 'water') playSynthStep(synth, 'water', sfxVolume * 0.18, event.entered ? 1.5 : 0.9);
    };
    return subscribeAdventureAudio((event) => {
      if (!active) return;
      if (event.kind === 'water') setUnderwater(event.entered);
      if (['step', 'jump', 'land', 'attack', 'water'].includes(event.kind)) playSynth(event);
      else if (event.kind === 'enemy-hit') playClip(ADVENTURE_HIT_SFX[event.attackInput], hitVolume * (event.finishing ? 1 : event.critical ? 0.92 : 0.78), event.finishing ? 0.9 : 0.96 + Math.random() * 0.08);
      else if (event.kind === 'player-hit') playClip(ADVENTURE_PLAYER_HIT_SFX, hitVolume * 0.88, event.damage >= 20 ? 0.82 : 0.94);
      else if (event.kind === 'resource-hit') {
        const profile = ADVENTURE_RESOURCE_SFX[event.material];
        const candidates = event.broken ? profile.broken : profile.hit;
        const path = candidates[Math.abs(event.sequence) % candidates.length];
        const weight = event.legendary ? 1.2 : event.major ? 1.08 : 1;
        const attackWeight = event.attackInput === 'heavy' ? 1.12 : event.attackInput === 'special' ? 1.06 : 1;
        const rateJitter = ((Math.abs(event.sequence) % 5) - 2) * 0.018;
        const playbackRate = profile.playbackRate + rateJitter + (event.broken ? -0.06 : 0);
        playClip(path, hitVolume * (event.broken ? 0.72 : 0.46) * weight * attackWeight, playbackRate);
        if (event.broken && profile.breakLayer) playClip(profile.breakLayer, hitVolume * 0.32 * weight, Math.max(0.68, playbackRate - 0.12));
      }
      else if (event.kind === 'portal') playClip(ADVENTURE_PORTAL_SFX, sfxVolume * 0.34, 1);
    });
  }, [active, context, hitVolume, sfxVolume, underwater]);

  useEffect(() => () => {
    pools.current.forEach((pool) => pool.clips.forEach((clip) => { clip.pause(); clip.removeAttribute('src'); clip.load(); }));
    pools.current.clear();
    if (audioContext.current) void audioContext.current.close().catch(() => undefined);
    audioContext.current = null;
  }, []);

  return <div className="adventure-soundscape" data-testid="adventure-soundscape" data-surface={adventureSurfaceMaterial(context, underwater)} data-ambience={ambienceStage.ambiencePreset} aria-hidden="true">
    <StageAmbiencePlayer audio={ambienceAudio} stage={ambienceStage} active={active} />
  </div>;
}
