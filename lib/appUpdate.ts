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
 *    manifest — `{ "version": "1.1.0", "url": "…/sorro-1.1.0.apk", "notes":
 *    "…" }` — which GitHub Releases serves happily. With it unset the section
 *    says so plainly rather than offering a button that goes nowhere.
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '2.3.0';
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
      // With no timeout, a captive portal or a dead host leaves this stuck on
      // "checking" for as long as the tab lives — the button gives no way out
      // and no way to try again. Ten seconds, then say so.
      const res = await fetch(UPDATE_URL, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
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

/**
 * Whether a newer Sorro is live than the one running here.
 *
 * Every build writes /version.json. A tab left open, a phone app resumed from
 * the background or a service worker holding an old copy keeps running the old
 * code; this reads the deployed version on open, on return to the app and every
 * half hour, and gives back the newer version number, or null.
 */
export function useLiveVersion(): string | null {
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    const look = async () => {
      if (process.env.NODE_ENV !== 'production' || !navigator.onLine || document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const { version } = (await res.json()) as { version?: string };
        if (!gone && version && isNewer(version, APP_VERSION)) setLive(version);
      } catch { /* offline or a bad answer: try again later */ }
    };
    const first = setTimeout(look, 4000);
    const every = setInterval(look, 30 * 60_000);
    document.addEventListener('visibilitychange', look);
    addEventListener('online', look);
    return () => { gone = true; clearTimeout(first); clearInterval(every); document.removeEventListener('visibilitychange', look); removeEventListener('online', look); };
  }, []);
  return live;
}

/**
 * Loads the new version: the service worker fetches its new copy first, so the
 * reload does not come back from the old cache. The installed apps load the
 * live site, so this updates them too.
 */
export async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await Promise.race([reg.update(), new Promise(r => setTimeout(r, 5000))]);
  } catch { /* reload anyway: pages are network-first */ }
  location.reload();
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

    return () => {
      document.removeEventListener('pointerdown', ask, opts);
      document.removeEventListener('keydown', ask, opts);
      document.removeEventListener('touchstart', ask, opts);
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
