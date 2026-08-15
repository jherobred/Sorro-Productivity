'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, currentUserId } from './supabase';
import { DEFAULT_ACCENT } from './pal';

export type Prefs = {
  theme: 'dark' | 'light';
  accent: string;
  motion: boolean;
  navPicks: string[];
  fabPos: { x: number; y: number } | null;
  calView: 'week' | 'month' | 'day' | 'agenda' | 'countdown';
  journalMode: string | null;

  /* Accessibility. Each of these maps to a WCAG success criterion:
     fontScale → 1.4.4 Resize Text, contrast → 1.4.6, underlineLinks → 1.4.1
     (colour is not the only visual means), reduceTransparency → 1.4.11, and
     `motion` above → 2.3.3 Animation from Interactions. */
  fontScale: number;              // 0.875 – 1.375, applied to the root font size
  density: 'comfortable' | 'compact';
  contrast: 'normal' | 'high';
  underlineLinks: boolean;
  reduceTransparency: boolean;
  alwaysShowLabels: boolean;      // phone nav labels under the icons

  /* Behaviour. */
  weekStart: 'mon' | 'sun';
  time24: boolean;
  haptics: boolean;
  landing: string;                // section to open on launch
  confirmDelete: boolean;

  /* Which kinds of event may raise a notification. */
  notify: { tasks: boolean; events: boolean; social: boolean; challenges: boolean; canvas: boolean };
};

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark', // README: dark is the product default
  accent: DEFAULT_ACCENT,
  motion: true,
  navPicks: ['home', 'calendar', 'tasks', 'notebooks', 'more'],
  fabPos: null,
  calView: 'week',
  journalMode: null,

  fontScale: 1,
  density: 'comfortable',
  contrast: 'normal',
  underlineLinks: false,
  reduceTransparency: false,
  alwaysShowLabels: false,

  weekStart: 'mon',
  time24: false,
  haptics: true,
  landing: 'home',
  confirmDelete: false,

  notify: { tasks: true, events: true, social: true, challenges: true, canvas: true },
};

const LS_KEY = 'basedly-prefs';

/** Push prefs into the CSS custom properties the design system reads. */
export function applyPrefs(p: Prefs) {
  const r = document.documentElement;
  r.setAttribute('data-theme', p.theme);
  r.style.setProperty('--acc', p.accent);
  r.style.setProperty(
    '--accTx',
    `color-mix(in srgb, ${p.accent} ${p.theme === 'light' ? '62%, #1C1A26' : '82%, #FFFFFF'})`
  );
  r.style.setProperty('--gl2', `color-mix(in srgb, ${p.accent} 55%, transparent)`);

  // Motion is a first-class product setting, so the user's choice wins over the
  // OS hint. `prefers-reduced-motion` only decides the *default* (see
  // DEFAULT_PREFS); once motion is on, we animate even if the OS asks not to —
  // otherwise a machine with animation effects disabled (common on Windows)
  // silently flattens the whole design.
  const reduced = !p.motion;
  r.setAttribute('data-motion', p.motion ? 'on' : 'off');
  r.style.setProperty('--anim', reduced ? 'paused' : 'running');
  r.classList.toggle('nomo', reduced);

  // Text resize (WCAG 1.4.4). Everything in the design is sized in px off the
  // prototype, so scaling the root font size alone would not move it — the
  // layout reads --fs through the `zoom`-style multiplier on the app frame.
  r.style.setProperty('--fs', String(p.fontScale ?? 1));
  r.setAttribute('data-density', p.density ?? 'comfortable');
  r.setAttribute('data-contrast', p.contrast ?? 'normal');
  r.classList.toggle('ulink', !!p.underlineLinks);
  r.classList.toggle('noglass', !!p.reduceTransparency);
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    if (typeof window === 'undefined') return DEFAULT_PREFS;
    try {
      return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') };
    } catch {
      return DEFAULT_PREFS;
    }
  });

  // Reconcile from the server once — prefs follow the user across devices.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await currentUserId().catch(() => null);
      if (!uid) return;
      const { data } = await supabase
        .from('bd_profiles')
        .select('prefs')
        .eq('user_id', uid)
        .single();
      if (cancelled || !data?.prefs || Object.keys(data.prefs).length === 0) return;
      const merged = { ...DEFAULT_PREFS, ...(data.prefs as Partial<Prefs>) };
      setPrefs(merged);
      localStorage.setItem(LS_KEY, JSON.stringify(merged));
      applyPrefs(merged);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyPrefs(prefs);
  }, [prefs]);

  const update = useCallback(async (patch: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(LS_KEY, JSON.stringify(next));
      // Fire-and-forget: local write already happened, so a failed sync
      // costs nothing the next reconcile will not fix.
      // Reads the cached id — flipping a switch should not cost an auth round
      // trip before it even reaches the profile row.
      void currentUserId()
        .then((uid) => supabase.from('bd_profiles').update({ prefs: next }).eq('user_id', uid))
        .catch(() => { /* signed out: the local write already happened */ });
      return next;
    });
  }, []);

  return { prefs, update };
}
