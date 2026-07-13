import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultGameSettings } from '../lib/gameSettings';
import type { StageDefinition } from '../types';
import { StageAmbiencePlayer } from './StageAmbiencePlayer';

class MockAudio {
  static instances: MockAudio[] = [];
  src: string;
  volume = 1;
  loop = false;
  preload = '';
  paused = false;
  dataset: Record<string, string> = {};
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => undefined);
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

const cleanStage: StageDefinition = {
  id: 'test-clean',
  name: 'Test Clean',
  subtitle: 'Test',
  ambiencePreset: 'clean-tech',
  floor: '#000',
  rail: '#fff',
  light: '#fff'
};

const energyStage: StageDefinition = {
  ...cleanStage,
  id: 'test-energy',
  ambiencePreset: 'energy-void'
};

beforeEach(() => {
  MockAudio.instances = [];
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: MockAudio });
  let rafTime = performance.now();
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => {
      rafTime += 16;
      callback(rafTime);
    }, 16)
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => window.clearTimeout(id)
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StageAmbiencePlayer', () => {
  it('starts, mixes, adjusts, and fades loop layers without duplicating them', () => {
    const audio = { ...defaultGameSettings.audio, master: 1, ambience: 0.55 };
    const view = render(<StageAmbiencePlayer audio={audio} stage={cleanStage} active />);
    expect(screen.getByTestId('stage-ambience-player').getAttribute('data-preset')).toBe('clean-tech');
    expect(MockAudio.instances).toHaveLength(2);
    expect(MockAudio.instances.every((entry) => entry.loop && entry.play.mock.calls.length === 1)).toBe(true);

    act(() => vi.advanceTimersByTime(550));
    expect(MockAudio.instances[0]?.volume).toBeCloseTo(0.55 * 0.4, 2);
    expect(MockAudio.instances[1]?.volume).toBeCloseTo(0.55 * 0.12, 2);

    view.rerender(<StageAmbiencePlayer audio={{ ...audio, ambience: 0.25 }} stage={cleanStage} active />);
    expect(MockAudio.instances).toHaveLength(2);
    expect(MockAudio.instances[0]?.volume).toBeCloseTo(0.25 * 0.4, 3);

    view.rerender(<StageAmbiencePlayer audio={audio} stage={cleanStage} active={false} />);
    act(() => vi.advanceTimersByTime(300));
    expect(MockAudio.instances.slice(0, 2).every((entry) => entry.pause.mock.calls.length === 1 && entry.src === '')).toBe(true);
  });

  it('crossfades stages and schedules one rare cue at a time', () => {
    const audio = { ...defaultGameSettings.audio, master: 1, ambience: 0.55 };
    const view = render(<StageAmbiencePlayer audio={audio} stage={cleanStage} active />);
    act(() => vi.advanceTimersByTime(45_050));
    expect(MockAudio.instances).toHaveLength(3);
    expect(MockAudio.instances[2]?.src).toContain('computer-load.mp3');
    expect(MockAudio.instances[2]?.volume).toBeCloseTo(0.55 * 0.18, 3);

    view.rerender(<StageAmbiencePlayer audio={audio} stage={energyStage} active />);
    expect(MockAudio.instances).toHaveLength(5);
    expect(screen.getByTestId('stage-ambience-player').getAttribute('data-preset')).toBe('energy-void');
    act(() => vi.advanceTimersByTime(550));
    expect(MockAudio.instances.slice(0, 3).every((entry) => entry.pause.mock.calls.length >= 1)).toBe(true);
    expect(MockAudio.instances.slice(3).every((entry) => entry.pause.mock.calls.length === 0)).toBe(true);
  });
});
