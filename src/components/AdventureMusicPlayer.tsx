import { useEffect, useMemo, useRef, useState } from 'react';
import { adventureCrossfadeMs, deterministicAdventurePlaylist } from '../story/adventureMusic';
import type { AdventureMusicContext, AdventureMusicTrackDefinition } from '../story/types';
import type { GameSettings } from '../types';

type Channel = { element: HTMLAudioElement; gain: number; track: AdventureMusicTrackDefinition | null };

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function AdventureMusicPlayer({ audio, enabled, context, profileKey, onTrackChange }: {
  audio: GameSettings['audio'];
  enabled: boolean;
  context: AdventureMusicContext | null;
  profileKey: string;
  onTrackChange?: (track: AdventureMusicTrackDefinition | null) => void;
}) {
  const firstRef = useRef<HTMLAudioElement>(null);
  const secondRef = useRef<HTMLAudioElement>(null);
  const channels = useRef<Channel[]>([]);
  const activeIndex = useRef(0);
  const previousContext = useRef<AdventureMusicContext | null>(null);
  const fadeFrame = useRef<number | null>(null);
  const trackCursor = useRef(0);
  const resumePositions = useRef(new Map<string, number>());
  const [revision, setRevision] = useState(0);
  const playlist = useMemo(() => context
    ? deterministicAdventurePlaylist(context, profileKey).filter((track) => track.path.startsWith('/story/audio/stimmerman/'))
    : [], [context, profileKey, revision]);
  const baseVolume = audio.muted || !enabled ? 0 : clamp(audio.master * audio.music);

  useEffect(() => {
    const first = firstRef.current;
    const second = secondRef.current;
    if (!first || !second) return;
    channels.current = [{ element: first, gain: 0, track: null }, { element: second, gain: 0, track: null }];
    return () => {
      if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
      for (const channel of channels.current) { channel.element.pause(); channel.element.removeAttribute('src'); channel.element.load(); }
      channels.current = [];
    };
  }, []);

  useEffect(() => {
    for (const channel of channels.current) channel.element.volume = clamp(baseVolume * channel.gain);
    if (baseVolume <= 0) for (const channel of channels.current) channel.element.pause();
  }, [baseVolume]);

  useEffect(() => {
    if (!context || playlist.length === 0 || baseVolume <= 0 || channels.current.length !== 2) return;
    trackCursor.current %= playlist.length;
    const track = playlist[trackCursor.current];
    const previous = channels.current[activeIndex.current];
    if (previous.track && previousContext.current?.worldId === context.worldId && previousContext.current.phase === context.phase && playlist.some((candidate) => candidate.id === previous.track?.id) && !previous.element.paused) {
      previousContext.current = context;
      return;
    }
    if (previous.track?.id === track.id && !previous.element.paused) return;
    const nextIndex = activeIndex.current === 0 ? 1 : 0;
    const next = channels.current[nextIndex];
    next.element.src = track.path;
    next.element.preload = 'auto';
    next.element.currentTime = resumePositions.current.get(track.id) ?? 0;
    next.element.loop = false;
    next.track = track;
    next.gain = 0;
    next.element.volume = 0;
    void next.element.play().catch((error) => console.warn('KORE Adventure music unavailable', error));
    const duration = adventureCrossfadeMs(previousContext.current, context);
    const start = performance.now();
    if (fadeFrame.current !== null) cancelAnimationFrame(fadeFrame.current);
    const tick = (now: number) => {
      const progress = duration <= 0 ? 1 : clamp((now - start) / duration);
      previous.gain = Math.cos(progress * Math.PI / 2);
      next.gain = Math.sin(progress * Math.PI / 2);
      previous.element.volume = clamp(baseVolume * previous.gain);
      next.element.volume = clamp(baseVolume * next.gain);
      if (progress < 1) { fadeFrame.current = requestAnimationFrame(tick); return; }
      fadeFrame.current = null;
      if (previous.track && Number.isFinite(previous.element.currentTime)) resumePositions.current.set(previous.track.id, previous.element.currentTime);
      previous.element.pause();
      previous.element.removeAttribute('src');
      previous.element.load();
      previous.track = null;
      previous.gain = 0;
      next.gain = 1;
      activeIndex.current = nextIndex;
      const upcoming = playlist[(trackCursor.current + 1) % playlist.length];
      if (upcoming && upcoming.id !== track.id) {
        previous.element.src = upcoming.path;
        previous.element.preload = 'metadata';
        previous.element.load();
      }
    };
    fadeFrame.current = requestAnimationFrame(tick);
    previousContext.current = context;
    onTrackChange?.(track);
  }, [baseVolume, context, onTrackChange, playlist]);

  useEffect(() => {
    const handlers = channels.current.map((channel) => {
      const onEnded = () => {
        if (channel !== channels.current[activeIndex.current] || playlist.length === 0) return;
        trackCursor.current = (trackCursor.current + 1) % playlist.length;
        setRevision((value) => value + 1);
      };
      channel.element.addEventListener('ended', onEnded);
      return () => channel.element.removeEventListener('ended', onEnded);
    });
    return () => handlers.forEach((remove) => remove());
  }, [playlist.length]);

  return <div className="adventure-music-player" data-testid="adventure-music-player" data-active={Boolean(context && enabled)} aria-hidden="true">
    <audio ref={firstRef} preload="none" />
    <audio ref={secondRef} preload="none" />
  </div>;
}
