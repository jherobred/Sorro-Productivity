'use client';

import { useCallback, useEffect, useState } from 'react';

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

/* ---- self-check ---------------------------------------------------------- */
if (process.env.NODE_ENV !== 'production' && typeof window === 'undefined') {
  console.assert(isNewer('1.1.0', '1.0.0'), 'minor bump is newer');
  console.assert(isNewer('1.10.0', '1.9.0'), 'ten beats nine');
  console.assert(isNewer('1.0.1', '1.0.0'), 'patch bump is newer');
  console.assert(!isNewer('1.0.0', '1.0.0'), 'same is not newer');
  console.assert(!isNewer('0.9.0', '1.0.0'), 'older is not newer');
  console.assert(isNewer('2.0', '1.9.9'), 'short version still compares');
}
