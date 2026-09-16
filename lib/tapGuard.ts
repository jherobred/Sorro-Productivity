'use client';

import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/**
 * Telling a tap apart from a scroll that ended on something tappable.
 *
 * The day grid fills its columns with empty slots you can tap to make an event,
 * and on a phone the only way to reach 9 p.m. is to drag the day upward — which
 * starts and ends on those same slots. Dragging left a new event behind every
 * time. The browser usually swallows the click that follows a scroll, but not
 * when the finger lands on a day that is still flicking: that tap stops the
 * motion and is delivered as an ordinary click.
 */
export type TapStart = { x: number; y: number; scroll: number; at: number; touch: boolean };
export type TapEnd = { x: number; y: number; scroll: number; scrolledAt: number; keyboard: boolean };

/** How far a finger may slide, and how soon after motion a tap is believed. */
export const TAP_SLOP_PX = 10;
export const TAP_SETTLE_MS = 300;

export function isTapGesture(start: TapStart | null, end: TapEnd): boolean {
  if (end.keyboard) return true;                                   // Enter or Space on a focused slot
  if (!start) return false;                                        // a click with no press of its own
  if (start.touch && start.at - end.scrolledAt < TAP_SETTLE_MS) return false;  // landed on a moving day
  if (end.scroll !== start.scroll) return false;                   // it scrolled under the finger
  return Math.hypot(end.x - start.x, end.y - start.y) <= TAP_SLOP_PX;
}

/** Every scroll position above the element, so any scrolling ancestor counts. */
function scrollUnder(el: Element | null): number {
  let total = typeof window === 'undefined' ? 0 : window.scrollY;
  for (let node: Element | null = el; node; node = node.parentElement) total += node.scrollTop;
  return total;
}

/**
 * `press` on pointerdown and `tapped` in the click handler. A click the guard
 * rejects belonged to a scroll, so the slot does nothing.
 */
export function useTapGuard() {
  const start = useRef<TapStart | null>(null);
  const scrolledAt = useRef(-Infinity);
  useEffect(() => {
    const moved = () => { scrolledAt.current = performance.now(); };
    // Capture, because a scroll event does not bubble out of the box it moved.
    document.addEventListener('scroll', moved, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', moved, { capture: true });
  }, []);
  return {
    press: (e: PointerEvent) => {
      start.current = { x: e.clientX, y: e.clientY, scroll: scrollUnder(e.currentTarget), at: performance.now(), touch: e.pointerType !== 'mouse' };
    },
    tapped: (e: MouseEvent) => {
      const began = start.current;
      start.current = null;
      return isTapGesture(began, { x: e.clientX, y: e.clientY, scroll: scrollUnder(e.currentTarget), scrolledAt: scrolledAt.current, keyboard: e.detail === 0 });
    },
  };
}
