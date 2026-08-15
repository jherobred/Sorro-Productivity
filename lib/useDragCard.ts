'use client';

import { useRef, useState } from 'react';

/**
 * Drag a card horizontally to dismiss it — the kinetics "Drag to Dismiss"
 * interaction, to spec:
 *
 *   Track pointerdown/move/up, translate by the drag delta plus a subtle
 *   rotation, and fade opacity with distance. On release past a 100px threshold
 *   fling it off-screen; otherwise spring it back with
 *   cubic-bezier(0.34, 1.56, 0.64, 1).
 *
 * The vertical delta is watched too, but only to bail out: a mostly-vertical
 * gesture is the page scrolling, and stealing it would make a list unusable on
 * a phone. `onReorder` gets the vertical intent so the same grip can sort.
 */

export const DISMISS_PX = 100;
const CLAIM_PX = 8;          // movement before the gesture is ours
const ROTATE_PER_PX = 0.06;  // ~6° at the threshold — present, not silly
const FADE_OVER_PX = 260;

export type DragState = {
  id: string | null;
  dx: number;
  rot: number;
  opacity: number;
  /** true once released past the threshold, while the fling plays out. */
  flung: boolean;
};

const IDLE: DragState = { id: null, dx: 0, rot: 0, opacity: 1, flung: false };

export function useDragCard({
  onDismiss, onReorder,
}: {
  onDismiss: (id: string) => void;
  onReorder?: (id: string, dir: -1 | 1) => void;
}) {
  const [drag, setDrag] = useState<DragState>(IDLE);
  const settling = useRef(false);
  /**
   * Set once a gesture claims the pointer, cleared on the next pointerdown.
   * `drag` state is no good for this: a spring-back sets it to IDLE
   * synchronously in pointerup, so by the time the browser dispatches the
   * `click` that follows, the card looks idle again — and a 60px drag that
   * correctly sprang back would *also* open the card.
   */
  const wasDrag = useRef(false);

  const start = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || settling.current) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let claimed = false;
    let vertical = false;
    wasDrag.current = false;

    const onMove = (m: PointerEvent) => {
      const dx = m.clientX - sx;
      const dy = m.clientY - sy;

      if (!claimed) {
        if (Math.hypot(dx, dy) < CLAIM_PX) return;
        // Whichever axis won the first 8px owns the gesture from then on.
        vertical = Math.abs(dy) > Math.abs(dx);
        claimed = true;
        wasDrag.current = true;
        if (vertical) { stop(); return; }
      }

      setDrag({
        id,
        dx,
        rot: dx * ROTATE_PER_PX,
        opacity: Math.max(0.25, 1 - Math.abs(dx) / FADE_OVER_PX),
        flung: false,
      });
    };

    const onUp = (m: PointerEvent) => {
      stop();
      if (!claimed) return;
      if (vertical) {
        const dy = m.clientY - sy;
        if (Math.abs(dy) > 30) onReorder?.(id, dy > 0 ? 1 : -1);
        return;
      }

      const dx = m.clientX - sx;
      if (Math.abs(dx) > DISMISS_PX) {
        // Past the threshold: throw it the rest of the way, then hand over.
        settling.current = true;
        const away = Math.sign(dx) * (window.innerWidth + 120);
        setDrag({ id, dx: away, rot: away * ROTATE_PER_PX * 0.4, opacity: 0, flung: true });
        window.setTimeout(() => {
          onDismiss(id);
          settling.current = false;
          setDrag(IDLE);
        }, 400);
        return;
      }
      // Short of it: spring home.
      setDrag(IDLE);
    };

    const stop = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  /** Spread onto the card; pairs with the `.k-drag` classes. */
  const propsFor = (id: string) => {
    const on = drag.id === id;
    return {
      onPointerDown: (e: React.PointerEvent) => start(e, id),
      className: `k-drag ${on ? (drag.flung ? 'fling' : 'dragging') : 'settle'}`,
      style: {
        ['--kdx' as string]: `${on ? drag.dx : 0}px`,
        ['--kdr' as string]: `${on ? drag.rot : 0}deg`,
        opacity: on ? drag.opacity : 1,
      } as React.CSSProperties,
    };
  };

  return {
    drag,
    propsFor,
    dragging: drag.id,
    /** True if the press that just ended was a drag, not a click. */
    wasDrag: () => wasDrag.current,
  };
}
