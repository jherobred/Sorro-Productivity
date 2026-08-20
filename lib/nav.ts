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

  // Track section changes. Re-visiting a section collapses the loop rather than
  // growing the stack, so back can't get stuck ping-ponging between two pages.
  useEffect(() => {
    const prior = stack.lastIndexOf(pathname);
    if (prior >= 0) stack.length = prior;
    stack.push(pathname);
  }, [pathname]);

  useEffect(() => {
    /**
     * One back gesture, one step — however many handlers heard it.
     *
     * The mouse's side button fires `mousedown`, and Chrome navigates on it
     * anyway despite the preventDefault, which lands a `popstate` a few
     * milliseconds later. Both called goBack, so one press popped two entries
     * off the stack: from a note you did not land on the notebook, you landed
     * on Home. Anything inside this window is the same gesture arriving twice.
     */
    let lastAt = 0;
    const goBack = () => {
      const now = Date.now();
      if (now - lastAt < 400) return;
      lastAt = now;

      if (closeTopOverlay()) return;
      // stack ends with the current path; the one before it is the target.
      if (stack.length > 1) {
        stack.pop();
        router.push(stack[stack.length - 1]);
        return;
      }
      if (pathname !== '/home/') router.push('/home/');
      // Otherwise we are at the root of the session: stay put.
    };

    // A sentinel entry means the platform's own back has somewhere to land, so
    // a gesture-back can never pop past the first page and unload the app.
    if (typeof history !== 'undefined' && !history.state?.bdGuard) {
      history.replaceState({ ...history.state, bdGuard: true }, '');
      history.pushState({ ...history.state, bdGuard: true, bdSentinel: true }, '');
    }

    const onPop = () => {
      // Re-arm the sentinel first so the next back also has somewhere to land.
      history.pushState({ bdGuard: true, bdSentinel: true }, '');
      goBack();
    };

    // Mouse button 3 is "back", 4 is "forward". Chrome and Edge navigate on
    // pointerdown, so cancelling there is what actually stops it — auxclick is
    // too late. Typing in a field is exempt so the gesture stays predictable.
    const onDown = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.button === 3) goBack();
    };

    window.addEventListener('popstate', onPop);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('auxclick', onDown);

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
      dispose?.();
    };
  }, [router, pathname]);
}
