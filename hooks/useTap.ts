'use client';

import { useMemo, useRef } from 'react';

/**
 * A tap, as distinct from a scroll.
 *
 * Rows that open something live inside a scrolling column, and `onClick` cannot
 * tell the difference between "I chose this" and "I dragged past this". On a
 * phone that means opening a random exercise every time you flick the list —
 * the finger lands on a row, travels, lifts, and the browser reports a click
 * because the element under both ends was the same.
 *
 * So: a tap is a pointer that went down and came back up within `SLOP` pixels
 * and `LIMIT` milliseconds. Anything further is a scroll. Anything longer is a
 * hold, and belongs to whatever long-press handler wants it.
 *
 * `touch-action` is deliberately left alone. Swallowing the gesture would stop
 * the column scrolling at all, which is a worse bug than the one being fixed.
 *
 * Returns props for a real `<button>`, so Enter and Space keep working through
 * the native click path without any of the pointer logic running.
 */

/** How far a finger may travel and still have meant it. */
export const TAP_SLOP = 10;
/** Past this it is a hold, not a tap. */
export const TAP_LIMIT_MS = 700;

export function useTap<T extends HTMLElement = HTMLButtonElement>(
  onTap: () => void,
  opts: { slop?: number; limitMs?: number } = {},
) {
  const slop = opts.slop ?? TAP_SLOP;
  const limit = opts.limitMs ?? TAP_LIMIT_MS;

  const start = useRef({ x: 0, y: 0, t: 0, live: false });
  // Keyboard fires a synthetic click with no preceding pointerdown. Without
  // this flag the pointer path would swallow it and the row would be
  // unreachable without a mouse.
  const viaPointer = useRef(false);
  const fn = useRef(onTap);
  fn.current = onTap;

  return useMemo(() => ({
    onPointerDown: (e: React.PointerEvent<T>) => {
      // Primary button only. A right-click fires pointerdown/pointerup like any
      // other press, so without this a context menu also triggered whatever the
      // row's tap does — on Money that armed the jar you were only asking about.
      if (e.button !== 0) return;
      start.current = { x: e.clientX, y: e.clientY, t: Date.now(), live: true };
      viaPointer.current = true;
    },
    onPointerMove: (e: React.PointerEvent<T>) => {
      const s = start.current;
      if (!s.live) return;
      if (Math.abs(e.clientX - s.x) > slop || Math.abs(e.clientY - s.y) > slop) s.live = false;
    },
    onPointerCancel: () => { start.current.live = false; },
    onPointerLeave: () => { start.current.live = false; },
    onPointerUp: (e: React.PointerEvent<T>) => {
      const s = start.current;
      start.current = { ...s, live: false };
      if (!s.live) return;
      if (Date.now() - s.t > limit) return;
      if (Math.abs(e.clientX - s.x) > slop || Math.abs(e.clientY - s.y) > slop) return;
      fn.current();
    },
    onClick: () => {
      // Only the keyboard's synthetic click gets here; a pointer already fired.
      if (viaPointer.current) { viaPointer.current = false; return; }
      fn.current();
    },
  }), [slop, limit]);
}

/**
 * One tap does one thing, two taps do another, with no delay on the first.
 *
 * The usual double-tap costs every single tap a 300ms wait while the handler
 * listens for a second one. That is only worth paying when the single action is
 * expensive to undo. Arming a jar is neither — so it fires immediately, and the
 * second tap simply undoes it on its way to the other action.
 */
export function useDoubleTap<T extends HTMLElement = HTMLButtonElement>(
  onSingle: () => void,
  onDouble: () => void,
  windowMs = 300,
  /**
   * Passed straight to useTap. A row that also answers a hold should set
   * `limitMs` below the long-press threshold, or one press fires both — the
   * menu at 420ms and then the tap on release.
   */
  opts: { slop?: number; limitMs?: number } = {},
) {
  const last = useRef(0);
  const single = useRef(onSingle);
  const dbl = useRef(onDouble);
  single.current = onSingle;
  dbl.current = onDouble;

  return useTap<T>(() => {
    const now = Date.now();
    if (now - last.current < windowMs) {
      last.current = 0;
      dbl.current();
      return;
    }
    last.current = now;
    single.current();
  }, opts);
}
