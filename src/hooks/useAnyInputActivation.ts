import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { hasActiveGamepadInput } from '../lib/gamepads';

type AnyInputActivationOptions = {
  enabled?: boolean;
  ready?: boolean;
  onAccept: () => void;
  onBack?: () => void;
};

export function useAnyInputActivation({
  enabled = true,
  ready = true,
  onAccept,
  onBack
}: AnyInputActivationOptions) {
  const acceptedRef = useRef(false);
  const onAcceptRef = useRef(onAccept);
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onAcceptRef.current = onAccept;
  }, [onAccept]);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (enabled && ready) acceptedRef.current = false;
  }, [enabled, ready]);

  const accept = useCallback((event?: Event) => {
    if (!enabled || !ready || acceptedRef.current) return;
    event?.preventDefault();
    event?.stopPropagation();
    event?.stopImmediatePropagation();
    acceptedRef.current = true;
    onAcceptRef.current();
  }, [enabled, ready]);

  useLayoutEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isTextEntryTarget(event.target)) return;
      if (event.key === 'Tab') return;
      if (event.key === 'Escape' && onBackRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onBackRef.current();
        return;
      }
      accept(event);
    };
    const onPointerDown = (event: PointerEvent) => accept(event);
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      accept(event);
    };
    const onTouchStart = (event: TouchEvent) => accept(event);
    const onClick = (event: MouseEvent) => accept(event);
    const onGamepadConnected = (event: GamepadEvent) => accept(event);

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    window.addEventListener('click', onClick, true);
    window.addEventListener('gamepadconnected', onGamepadConnected, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('gamepadconnected', onGamepadConnected, true);
    };
  }, [accept, enabled]);

  useLayoutEffect(() => {
    if (!enabled || !ready) return undefined;
    let frame = 0;
    const tick = () => {
      if (hasActiveGamepadInput()) accept();
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [accept, enabled, ready]);

  return accept;
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName;
  if (tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (tagName !== 'INPUT') return false;
  const input = target as HTMLInputElement;
  const type = (input.type || 'text').toLowerCase();
  return !['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
}
