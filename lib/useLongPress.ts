'use client';

import { useCallback, useRef, useState } from 'react';
import { K } from './pal';

export type CtxTarget = { x: number; y: number; kind: string; id: string; label: string };

/**
 * The universal hold-to-edit gesture (ANNOTATIONS "Long-press").
 * Hold 420 ms to open a context menu at the pointer with navigator.vibrate(12);
 * moving more than 7 px cancels it, which is what lets long-press and drag
 * share one pointerdown.
 */
export function useLongPress() {
  const [ctx, setCtx] = useState<CtxTarget | null>(null);
  const timer = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const start = useCallback(
    (e: React.PointerEvent, kind: string, id: string, label: string) => {
      // Primary button only. A right-click already opens the menu through
      // onContextMenu; letting it also arm the hold timer re-anchored the menu
      // 420ms later if the button was held still.
      if (e.button !== 0) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let moved = false;

      clear();
      timer.current = window.setTimeout(() => {
        if (moved) return;
        navigator.vibrate?.(K.hapticMs);
        setCtx({ x: x0, y: y0, kind, id, label });
      }, K.longPressMs);

      const move = (m: PointerEvent) => {
        if (moved) return;
        if (Math.hypot(m.clientX - x0, m.clientY - y0) > K.longPressCancelPx) {
          moved = true;
          clear();
        }
      };
      const up = () => {
        clear();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [clear]
  );

  /** Right-click opens the same menu without waiting out the hold. */
  const onContextMenu = useCallback((e: React.MouseEvent, kind: string, id: string, label: string) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, kind, id, label });
  }, []);

  return { ctx, setCtx, start, onContextMenu, close: () => setCtx(null) };
}
