import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveAttackCell, resolveDpadActions, TouchControls } from './TouchControls';

beforeAll(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? '';
    }
  }
  Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });
});

afterEach(cleanup);

function mockBounds(element: Element, left: number, top: number, width: number, height: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({})
  });
}

describe('mobile touch coordinate resolution', () => {
  it('resolves the full attack rectangle into six gap-free cells', () => {
    expect(resolveAttackCell(0, 0, 180, 120)).toBe('jump');
    expect(resolveAttackCell(60, 0, 180, 120)).toBe('jab');
    expect(resolveAttackCell(179.9, 0, 180, 120)).toBe('heavy');
    expect(resolveAttackCell(0, 119.9, 180, 120)).toBe('kick');
    expect(resolveAttackCell(60, 60, 180, 120)).toBe('special');
    expect(resolveAttackCell(180, 120, 180, 120)).toBe('charge');

    for (let y = 0; y <= 120; y += 3) {
      for (let x = 0; x <= 180; x += 3) {
        expect(resolveAttackCell(x, y, 180, 120)).not.toBeNull();
      }
    }
  });

  it('resolves cardinals, diagonals, and a small neutral center', () => {
    expect(resolveDpadActions(75, 75, 150, 150)).toEqual([]);
    expect(resolveDpadActions(145, 75, 150, 150)).toEqual(['right']);
    expect(resolveDpadActions(5, 75, 150, 150)).toEqual(['left']);
    expect(resolveDpadActions(140, 10, 150, 150)).toEqual(['right', 'up']);
    expect(resolveDpadActions(10, 140, 150, 150)).toEqual(['left', 'down']);
  });
});

describe('TouchControls', () => {
  it('delivers a very short off-center attack tap and keeps feedback active until release', () => {
    const onAction = vi.fn();
    render(<TouchControls onAction={onAction} forceVisible />);
    const cluster = screen.getByLabelText('Attack controls');
    mockBounds(cluster, 100, 200, 180, 120);

    fireEvent.pointerDown(cluster, { pointerId: 11, pointerType: 'touch', clientX: 165, clientY: 205, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(1, 'jab', true);
    expect(screen.getByTestId('touch-jab').classList.contains('is-active')).toBe(true);

    fireEvent.pointerUp(cluster, { pointerId: 11, pointerType: 'touch', clientX: 165, clientY: 205, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(1, 'jab', false);
    expect(screen.getByTestId('touch-jab').classList.contains('is-active')).toBe(false);
  });

  it('slides movement between sectors while holding the same pointer', () => {
    const onAction = vi.fn();
    render(<TouchControls onAction={onAction} forceVisible />);
    const pad = screen.getByLabelText('Movement pad');
    mockBounds(pad, 20, 40, 150, 150);

    fireEvent.pointerDown(pad, { pointerId: 7, pointerType: 'touch', clientX: 165, clientY: 115, button: 0 });
    expect(onAction).toHaveBeenLastCalledWith(1, 'right', true);

    fireEvent.pointerMove(pad, { pointerId: 7, pointerType: 'touch', clientX: 25, clientY: 45, button: 0 });
    expect(onAction.mock.calls.slice(-3)).toEqual([
      [1, 'right', false],
      [1, 'left', true],
      [1, 'up', true]
    ]);

    fireEvent.pointerCancel(pad, { pointerId: 7, pointerType: 'touch', button: 0 });
    expect(onAction.mock.calls.slice(-2)).toEqual([
      [1, 'left', false],
      [1, 'up', false]
    ]);
  });

  it('uses reference counts so one pointer cannot release an action owned by another', () => {
    const onAction = vi.fn();
    render(<TouchControls onAction={onAction} forceVisible />);
    const cluster = screen.getByLabelText('Attack controls');
    mockBounds(cluster, 0, 0, 180, 120);

    fireEvent.pointerDown(cluster, { pointerId: 1, pointerType: 'touch', clientX: 90, clientY: 90, button: 0 });
    fireEvent.pointerDown(cluster, { pointerId: 2, pointerType: 'touch', clientX: 90, clientY: 90, button: 0 });
    expect(onAction.mock.calls.filter((call) => call[1] === 'special' && call[2] === true)).toHaveLength(1);

    fireEvent.pointerUp(cluster, { pointerId: 1, pointerType: 'touch', clientX: 90, clientY: 90, button: 0 });
    expect(onAction.mock.calls.filter((call) => call[1] === 'special' && call[2] === false)).toHaveLength(0);
    fireEvent.pointerUp(cluster, { pointerId: 2, pointerType: 'touch', clientX: 90, clientY: 90, button: 0 });
    expect(onAction.mock.calls.filter((call) => call[1] === 'special' && call[2] === false)).toHaveLength(1);
  });

  it('renders colored numeric attacks and routes the pause control through the action callback', () => {
    const onAction = vi.fn();
    render(<TouchControls onAction={onAction} forceVisible controlScheme="beginner" />);

    expect(screen.getByTestId('touch-jab').textContent).toBe('1');
    expect(screen.getByTestId('touch-jab').getAttribute('aria-label')).toBe('1');
    expect(screen.getByTestId('touch-heavy').classList.contains('touch-number-2')).toBe(true);

    const pause = screen.getByTestId('touch-pause');
    fireEvent.pointerDown(pause, { pointerId: 20, pointerType: 'touch', button: 0 });
    fireEvent.pointerUp(pause, { pointerId: 20, pointerType: 'touch', button: 0 });
    expect(onAction.mock.calls.slice(-2)).toEqual([
      [1, 'pause', true],
      [1, 'pause', false]
    ]);
  });

  it('suppresses selection, dragging, and context menus inside the controls', () => {
    render(<TouchControls onAction={() => undefined} forceVisible />);
    const root = screen.getByLabelText('Touch controls');
    for (const type of ['selectstart', 'dragstart', 'contextmenu']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
  });
});
