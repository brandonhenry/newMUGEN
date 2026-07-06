import { describe, expect, it } from 'vitest';
import { classifyMenuLagStats, type MenuLagFrameStats } from './menuLagDetector';

function stats(patch: Partial<MenuLagFrameStats>): MenuLagFrameStats {
  return {
    sampleMs: 3200,
    frameCount: 180,
    averageMs: 16.67,
    p95Ms: 18,
    p99Ms: 24,
    maxMs: 30,
    averageFps: 60,
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longestLongTaskMs: 0,
    ...patch
  };
}

describe('menu lag detector', () => {
  it('keeps smooth samples unflagged', () => {
    expect(classifyMenuLagStats(stats({}))).toEqual([]);
  });

  it('flags janky frame pacing', () => {
    expect(classifyMenuLagStats(stats({ p95Ms: 38 }))).toContain('p95-frame-gap');
    expect(classifyMenuLagStats(stats({ p99Ms: 72 }))).toContain('p99-frame-gap');
    expect(classifyMenuLagStats(stats({ averageFps: 42 }))).toContain('low-average-fps');
  });

  it('flags multiple long tasks', () => {
    expect(classifyMenuLagStats(stats({ longTaskCount: 2, longTaskTotalMs: 130 }))).toContain('multiple-long-tasks');
  });
});
