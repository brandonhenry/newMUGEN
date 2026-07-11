import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyInputFrame, type InputFrameWithMetadata, type StageDefinition } from '../types';
import {
  DEFAULT_START_SIDE,
  START_SIDE_STORAGE_KEY,
  mirrorHorizontalInput,
  readStartSide,
  shouldMirrorStartSide,
  writeStartSide
} from './startSide';

const stage: StageDefinition = {
  id: 'side-test',
  name: 'Side Test',
  subtitle: '',
  floor: '',
  rail: '',
  light: '',
  fightPlane: { center: [0, 0, 0], width: 14, depth: 8, y: 0, rotationY: 0 }
};

describe('start side preference', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults invalid and missing values to left and persists valid values', () => {
    expect(readStartSide()).toBe(DEFAULT_START_SIDE);
    window.localStorage.setItem(START_SIDE_STORAGE_KEY, 'middle');
    expect(readStartSide()).toBe('left');
    writeStartSide('right');
    expect(readStartSide()).toBe('right');
  });

  it('tolerates unavailable storage', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readStartSide()).toBe('left');
    getItem.mockRestore();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => writeStartSide('right')).not.toThrow();
    setItem.mockRestore();
  });

  it('mirrors only physical horizontal input and its metadata', () => {
    const input = { ...emptyInputFrame(), left: true, dashForward: true } as InputFrameWithMetadata;
    input.__horizontalDashDirection = 'left';
    input.__pressedActions = ['left', 'jab'];
    input.__pressSequences = { left: 4, jab: 5 };
    const mirrored = mirrorHorizontalInput(input) as InputFrameWithMetadata;
    expect(mirrored.left).toBe(false);
    expect(mirrored.right).toBe(true);
    expect(mirrored.dashForward).toBe(true);
    expect(mirrored.__horizontalDashDirection).toBe('right');
    expect(mirrored.__pressedActions).toEqual(['right', 'jab']);
    expect(mirrored.__pressSequences).toMatchObject({ right: 4, jab: 5 });
  });

  it('resolves both player slots and authored or rotated starts', () => {
    expect(shouldMirrorStartSide(stage, 1, 'left')).toBe(false);
    expect(shouldMirrorStartSide(stage, 1, 'right')).toBe(true);
    expect(shouldMirrorStartSide(stage, 2, 'left')).toBe(true);
    expect(shouldMirrorStartSide(stage, 2, 'right')).toBe(false);

    const rotated = { ...stage, fightPlane: { ...stage.fightPlane!, rotationY: Math.PI / 2 } };
    expect(shouldMirrorStartSide(rotated, 1, 'right')).toBe(true);
    const reversed: StageDefinition = { ...stage, spawns: { p1: [2, 0, 0], p2: [-2, 0, 0] } };
    expect(shouldMirrorStartSide(reversed, 1, 'left')).toBe(true);
  });
});
