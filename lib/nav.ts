'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Clean navigation & overlay back handling.
 *
 * Back gestures on mobile/browser:
 * 1. Closes the topmost overlay if one is open.
 * 2. If no overlay is open, standard browser back naturally pops history.
 */

const overlays: { id: number; close: () => void }[] = [];
let nextId = 1;

/**
 * Register an open overlay so back closes it rather than changing section.
 * Returns the disposer — call it when the overlay closes by any other route.
 */
export function pushOverlay(close: () => void): () => void {
  const id = nextId++;
  overlays.push({ id, close });

  if (typeof window !== 'undefined' && window.history) {
    try {
      window.history.pushState({ bdOverlay: id }, '');
    } catch {}
  }

  return () => {
    const i = overlays.findIndex((o) => o.id === id);
    if (i >= 0) {
      overlays.splice(i, 1);
      if (typeof window !== 'undefined' && window.history?.state?.bdOverlay === id) {
        window.history.back();
      }
    }
  };
}

/** Closes the topmost overlay if there is one. */
function closeTopOverlay(): boolean {
  const top = overlays.pop();
  if (!top) return false;
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
      if (overlays.length > 0) {
        const top = overlays.pop();
        if (top) {
          top.close();
        }
      }
    };

    // Mouse button 3 is "back"
    const onDown = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        if (overlays.length > 0) {
          closeTopOverlay();
        } else {
          window.history.back();
        }
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) return;
      if (closeTopOverlay()) e.preventDefault();
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('auxclick', onDown);
    window.addEventListener('keydown', onKey);

    // Android hardware/gesture back, when running inside the Capacitor shell.
    let dispose: (() => void) | undefined;
    void (async () => {
      const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
      if (!cap?.isNativePlatform?.()) return;
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', () => {
        if (overlays.length > 0) {
          closeTopOverlay();
        } else {
          window.history.back();
        }
      });
      dispose = () => void handle.remove();
    })();

    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('auxclick', onDown);
      window.removeEventListener('keydown', onKey);
      dispose?.();
    };
  }, [router, pathname]);
}
