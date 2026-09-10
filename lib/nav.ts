'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Clean navigation & overlay back handling.
 *
 * Back gestures on mobile/browser:
 * 1. Closes the topmost overlay if one is open without double-popping.
 * 2. If no overlay is open, standard browser back naturally pops history.
 */

type OverlayEntry = { id: number; close: () => void; pushedHistory: boolean };
const overlays: OverlayEntry[] = [];
let nextId = 1;
let isHandlingPopState = false;
/**
 * How many popstate events are this module's own doing.
 *
 * Closing an overlay by any route other than a back gesture has to undo the
 * history entry it pushed, which it does with history.back(). That fires
 * popstate — indistinguishable, at the handler, from the user pressing back.
 * The handler then closed the *next* overlay down, so a dialog opened over
 * anything already registered took both away with it. Counting the pops we
 * cause ourselves is what tells the two apart.
 */
let selfPops = 0;

/**
 * Register an open overlay so back closes it rather than changing section.
 * Returns the disposer — call it when the overlay closes by any other route.
 */
export function pushOverlay(close: () => void): () => void {
  const id = nextId++;
  let pushedHistory = false;

  if (typeof window !== 'undefined' && window.history) {
    try {
      window.history.pushState({ bdOverlay: id }, '');
      pushedHistory = true;
    } catch {}
  }

  const entry: OverlayEntry = { id, close, pushedHistory };
  overlays.push(entry);

  return () => {
    const idx = overlays.findIndex((o) => o.id === id);
    if (idx >= 0) {
      overlays.splice(idx, 1);
    }
    // Only pop history if this disposal was triggered programmatically (e.g. clicking an X button),
    // and NOT because the user already pressed the browser back button (popstate).
    if (!isHandlingPopState && pushedHistory && typeof window !== 'undefined') {
      if (window.history?.state?.bdOverlay === id) {
        selfPops++;
        try {
          window.history.back();
        } catch {
          selfPops--;
        }
      }
    }
  };
}

/** Closes the topmost overlay if there is one. */
export function closeTopOverlay(): boolean {
  if (overlays.length === 0) return false;
  const top = overlays[overlays.length - 1];
  if (!top) return false;
  
  // Trigger close
  top.close();
  return true;
}

export function useOverlayBack(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    return pushOverlay(close);
  }, [open]);
}

/**
 * Installed once by the Shell.
 */
export function useBackGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      // Our own undo of a pushState, not a gesture. Consume it and stop.
      if (selfPops > 0) { selfPops--; return; }
      if (overlays.length > 0) {
        const top = overlays[overlays.length - 1];
        if (top) {
          isHandlingPopState = true;
          try {
            top.close();
          } finally {
            // Reset on next microtask so React cleanup effects see isHandlingPopState = true
            setTimeout(() => {
              isHandlingPopState = false;
            }, 0);
          }
        }
      }
    };

    /**
     * Mouse button 3 is "back".
     *
     * One press raises BOTH mousedown and auxclick, and this handler was bound
     * to each of them — so a single click ran it twice and the app went back
     * two steps. Decide on mousedown; auxclick only mops up the default.
     *
     * With no overlay open there is nothing to intercept: let the browser do
     * its own back rather than calling history.back() on top of it, which was
     * the other half of the double. popstate below picks it up either way.
     */
    let suppressAux = false;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 3) return;
      suppressAux = overlays.length > 0;
      if (suppressAux) {
        e.preventDefault();
        closeTopOverlay();
      }
    };

    const onAux = (e: MouseEvent) => {
      if (e.button !== 3 || !suppressAux) return;
      suppressAux = false;
      e.preventDefault();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
      if (closeTopOverlay()) {
        e.preventDefault();
      }
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('auxclick', onAux);
    window.addEventListener('keydown', onKey);

    // Android hardware/gesture back, when running inside the Capacitor shell.
    let dispose: (() => void) | undefined;
    void (async () => {
      const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (!cap?.isNativePlatform?.()) return;
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        if (overlays.length > 0) {
          closeTopOverlay();
        } else if (canGoBack) {
          window.history.back();
        } else {
          // At root of app, minimize/exit
          App.minimizeApp();
        }
      });
      dispose = () => void handle.remove();
    })();

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('auxclick', onAux);
      window.removeEventListener('keydown', onKey);
      dispose?.();
    };
  }, [router, pathname]);
}
