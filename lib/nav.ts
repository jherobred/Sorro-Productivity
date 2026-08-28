'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Back never leaves Basedly.
 *
 * Three things can fire "back" and all three used to walk the user out of the
 * app: the mouse's side button, the browser/Android gesture, and Android's
 * hardware key. They all funnel through `goBack()` here, which walks our own
 * stack of visited sections instead of the platform history.
 *
 * Order of dismissal, which is the order the user expects (Nielsen: reverse the
 * most recent action first):
 *   1. the topmost open overlay — sheet, palette, menu
 *   2. the previous section in this session
 *   3. Home
 *   4. nothing. Never exit, never navigate off-site.
 */

const stack: string[] = [];
const overlays: { id: number; close: () => void }[] = [];
let nextId = 1;

/**
 * Register an open overlay so back closes it rather than changing section.
 * Returns the disposer — call it when the overlay closes by any other route.
 */
export function pushOverlay(close: () => void): () => void {
  const id = nextId++;
  overlays.push({ id, close });
  return () => {
    const i = overlays.findIndex((o) => o.id === id);
    if (i >= 0) overlays.splice(i, 1);
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
    // `close` is usually an inline arrow, so depending on it would re-register
    // every render. `open` is the meaningful edge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/**
 * Installed once by the Shell. Keeps the section stack, and owns every back
 * gesture on every platform.
 */
export function useBackGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Keep internal stack for section tracking
    if (stack[stack.length - 1] !== pathname) {
      stack.push(pathname);
    }
  }, [pathname]);

  useEffect(() => {
    let lastAt = 0;
    const goBack = () => {
      const now = Date.now();
      if (now - lastAt < 300) return;
      lastAt = now;

      // If an overlay is open, dismiss the overlay first
      if (closeTopOverlay()) return;

      // Otherwise navigate back in history
      if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else if (pathname !== '/home/') {
        router.push('/home/');
      }
    };

    const onPop = (e: PopStateEvent) => {
      // If an overlay is open, intercept back to close the overlay instead of navigating away
      if (overlays.length > 0) {
        if (closeTopOverlay()) {
          // Re-push current state so page URL doesn't navigate away
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    // Mouse button 3 is "back", 4 is "forward"
    const onDown = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.button === 3) goBack();
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
      const handle = await App.addListener('backButton', () => goBack());
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
