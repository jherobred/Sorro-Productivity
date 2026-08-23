'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The Android build, from the app's own side.
 *
 * Two separate jobs that both live in Settings → App:
 *
 * 1. **Fullscreen.** On the web the Fullscreen API needs a user gesture, so
 *    this can only ever be a button — the preference cannot re-enter it on
 *    load, and pretending otherwise would leave a toggle that says "on" over
 *    a screen that plainly is not. Inside the Capacitor shell the WebView is
 *    already edge to edge, so the toggle is about the system bars.
 *
 * 2. **Updates.** The APK is not in a store, so nothing checks for a new build
 *    on the user's behalf. NEXT_PUBLIC_UPDATE_URL points at a small JSON
 *    manifest — `{ "version": "1.1.0", "url": "…/basedly-1.1.0.apk", "notes":
 *    "…" }` — which GitHub Releases serves happily. With it unset the section
 *    says so plainly rather than offering a button that goes nowhere.
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0';
export const UPDATE_URL = process.env.NEXT_PUBLIC_UPDATE_URL ?? '';

export type Release = { version: string; url: string; notes?: string; size_bytes?: number };

/** Semver-ish compare, enough for `1.2.10` vs `1.10.0`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

export type UpdateState =
  | { kind: 'unconfigured' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'available'; release: Release }
  | { kind: 'failed'; message: string };

export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>(UPDATE_URL ? { kind: 'idle' } : { kind: 'unconfigured' });

  const check = useCallback(async () => {
    if (!UPDATE_URL) return;
    setState({ kind: 'checking' });
    try {
      // cache: 'no-store' or a CDN will happily answer with the build you
      // already have, which is the one failure mode that makes this useless.
      const res = await fetch(UPDATE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Update server said ${res.status}`);
      const release = (await res.json()) as Release;
      if (!release?.version || !release?.url) throw new Error('Update manifest is missing a version or a link');
      setState(isNewer(release.version, APP_VERSION) ? { kind: 'available', release } : { kind: 'current' });
    } catch (e) {
      setState({ kind: 'failed', message: e instanceof Error ? e.message : 'Could not reach the update server' });
    }
  }, []);

  return { state, check };
}

/** Whether the document is currently presented fullscreen. */
export function useFullscreen() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const supported = typeof document !== 'undefined'
    && !!document.documentElement.requestFullscreen;

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch { /* the browser refused; the change event never fires, so `on` stays honest */ }
  }, []);

  return { on, supported, toggle };
}

/**
 * Stay fullscreen, across reloads.
 *
 * The Fullscreen API only answers to a user gesture, which is why the App tab
 * has always had a button rather than a switch — a remembered "on" would come
 * back to a screen that was plainly not fullscreen and a toggle that lied.
 *
 * The way round it is not to ask on load. This arms a one-shot listener for the
 * *first* thing the person does — a tap, a key, a scroll — and asks then, inside
 * a gesture the browser accepts. In practice that is the moment they touch the
 * first tab, so the address bar goes on the way in and the switch tells the
 * truth. It never re-arms while fullscreen, and leaving fullscreen deliberately
 * (Escape, the system gesture) arms it again for the next launch rather than
 * fighting the person who just left.
 *
 * Native is exempt: the APK is already edge to edge (capacitor.config.ts) and
 * has no browser chrome to hide.
 */
export function useAlwaysFullscreen(want: boolean) {
  /**
   * Asked once, then left alone. Without this, saying "no thanks" to the
   * prompt and pressing back again would ask again, and again — a dialog you
   * cannot get rid of is worse than the thing it is asking about.
   */
  const declined = useRef(false);

  useEffect(() => {
    if (!want) { declined.current = false; return; }
    if (typeof document === 'undefined') return;
    if (!document.documentElement.requestFullscreen) return;
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return;

    let armed = true;
    const ask = () => {
      if (!armed || document.fullscreenElement) return;
      armed = false;
      // A refusal is fine and needs no handling: `fullscreenchange` never
      // fires, so nothing in the UI claims to be fullscreen when it is not.
      void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    };

    const opts = { once: true, capture: true } as const;
    document.addEventListener('pointerdown', ask, opts);
    document.addEventListener('keydown', ask, opts);
    document.addEventListener('touchstart', ask, opts);

    /**
     * Coming back out, on purpose or by accident.
     *
     * A back swipe in Chrome on Android leaves fullscreen. The browser does
     * that itself and there is no cancelling it — `preventDefault` on a back
     * gesture is not a thing a page is allowed to do. So the interception has
     * to happen *after*: notice that we are suddenly not fullscreen any more,
     * and ask whether that was meant.
     *
     * The dialog's own button is what makes the way back possible. A page
     * cannot re-enter fullscreen from an event handler the user did not cause,
     * but a tap on "Stay fullscreen" is exactly the gesture the API wants.
     */
    const onChange = () => {
      if (document.fullscreenElement) { armed = true; return; }
      if (declined.current) return;
      void import('./ask').then(({ confirmAsk }) => confirmAsk('Leave fullscreen?', {
        message: 'Back takes you out of fullscreen. You can go straight back in.',
        confirmLabel: 'Stay fullscreen',
      }).then((stay) => {
        if (stay) void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        else declined.current = true;
      }));
    };
    document.addEventListener('fullscreenchange', onChange);

    return () => {
      document.removeEventListener('pointerdown', ask, opts);
      document.removeEventListener('keydown', ask, opts);
      document.removeEventListener('touchstart', ask, opts);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [want]);
}

/* ---- self-check ---------------------------------------------------------- */
if (process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
  console.assert(isNewer('1.1.0', '1.0.0'), 'minor bump is newer');
  console.assert(isNewer('1.10.0', '1.9.0'), 'ten beats nine');
  console.assert(isNewer('1.0.1', '1.0.0'), 'patch bump is newer');
  console.assert(!isNewer('1.0.0', '1.0.0'), 'same is not newer');
  console.assert(!isNewer('0.9.0', '1.0.0'), 'older is not newer');
  console.assert(isNewer('2.0', '1.9.9'), 'short version still compares');
}
