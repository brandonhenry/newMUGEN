import { describe, expect, it } from 'vitest';
import { formatTrainingFrameNumber, trainingFrameNumberTone, trainingFrameTravelY } from './GameScene';

describe('training frame number presentation', () => {
  it('formats positive and negative values without sign symbols', () => {
    expect(formatTrainingFrameNumber(7)).toBe('7');
    expect(formatTrainingFrameNumber(-7)).toBe('7');
    expect(formatTrainingFrameNumber(0)).toBe('0');
    expect(formatTrainingFrameNumber(-7)).not.toMatch(/[+-]/);
  });

  it('maps frame direction to positive, negative, and neutral tones', () => {
    expect(trainingFrameNumberTone(1)).toBe('positive');
    expect(trainingFrameNumberTone(-1)).toBe('negative');
    expect(trainingFrameNumberTone(0)).toBe('neutral');
  });

  it('travels to a point just below the health bar without crossing it', () => {
    expect(trainingFrameTravelY(520, 90, 50)).toBe(-393);
    expect(trainingFrameTravelY(100, 90, 50)).toBe(0);
  });
});
