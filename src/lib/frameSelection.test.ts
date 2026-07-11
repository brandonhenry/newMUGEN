import { describe, expect, it } from 'vitest';
import { addFrameRangeToSelection } from './frameSelection';

describe('addFrameRangeToSelection', () => {
  const frameBank = ['frame-0', 'frame-1', 'frame-2', 'frame-3', 'frame-4'];

  it('adds an inclusive forward range in frame-bank order', () => {
    expect(addFrameRangeToSelection(['frame-1'], frameBank, 1, 4)).toEqual([
      'frame-1',
      'frame-2',
      'frame-3',
      'frame-4'
    ]);
  });

  it('adds a reverse range in frame-bank order without duplicating selected frames', () => {
    expect(addFrameRangeToSelection(['frame-4', 'frame-2'], frameBank, 4, 1)).toEqual([
      'frame-4',
      'frame-2',
      'frame-1',
      'frame-3'
    ]);
  });
});
