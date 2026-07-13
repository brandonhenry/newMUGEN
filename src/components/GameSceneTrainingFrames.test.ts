import { describe, expect, it } from 'vitest';
import { formatTrainingFrameNumber, trainingFrameNumberTone } from './GameScene';

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
});
