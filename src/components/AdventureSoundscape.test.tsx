import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultGameSettings } from '../lib/gameSettings';
import { emitAdventureAudioEvent } from '../story/adventureAudio';
import type { AdventureMusicContext } from '../story/types';
import { AdventureSoundscape } from './AdventureSoundscape';

class MockAudio {
  static instances: MockAudio[] = [];
  src: string;
  volume = 1;
  currentTime = 0;
  playbackRate = 1;
  loop = false;
  preload = '';
  paused = true;
  ended = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();

  constructor(src = '') {
    this.src = src;
    MockAudio.instances.push(this);
  }

  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
}

const frostpeakContext: AdventureMusicContext = {
  worldId: 'frostpeak',
  mapId: 'frostpeak:arrival',
  phase: 'explore',
  encounterIntensity: 0,
  depth: false
};

beforeEach(() => {
  MockAudio.instances = [];
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: MockAudio });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdventureSoundscape', () => {
  it('owns biome ambience and routes attack and damage events to distinct clips', () => {
    render(<AdventureSoundscape audio={defaultGameSettings.audio} active context={frostpeakContext} />);
    const soundscape = screen.getByTestId('adventure-soundscape');
    expect(soundscape.getAttribute('data-surface')).toBe('ice');
    expect(soundscape.getAttribute('data-ambience')).toBe('snow-wind');

    act(() => emitAdventureAudioEvent({ kind: 'enemy-hit', attackInput: 'kick', critical: false, finishing: false }));
    act(() => emitAdventureAudioEvent({ kind: 'player-hit', damage: 14 }));

    const enemyHits = MockAudio.instances.filter((clip) => clip.src.endsWith('/hit-009.wav'));
    const playerHits = MockAudio.instances.filter((clip) => clip.src.endsWith('/hit-013.wav'));
    expect(enemyHits).toHaveLength(3);
    expect(playerHits).toHaveLength(3);
    expect(enemyHits.some((clip) => clip.play.mock.calls.length === 1)).toBe(true);
    expect(playerHits.some((clip) => clip.play.mock.calls.length === 1)).toBe(true);
  });

  it('does not play gameplay effects after Adventure audio becomes inactive', () => {
    const view = render(<AdventureSoundscape audio={defaultGameSettings.audio} active context={frostpeakContext} />);
    view.rerender(<AdventureSoundscape audio={defaultGameSettings.audio} active={false} context={frostpeakContext} />);
    const before = MockAudio.instances.length;
    act(() => emitAdventureAudioEvent({ kind: 'portal' }));
    expect(MockAudio.instances).toHaveLength(before);
  });
});
