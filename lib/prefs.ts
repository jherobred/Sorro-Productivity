'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { DEFAULT_ACCENT } from './pal';

export type Prefs = {
  theme: 'dark' | 'light';
  accent: string;
  motion: boolean;
  navPicks: string[];
  fabPos: { x: number; y: number } | null;
  calView: 'week' | 'month' | 'day' | 'agenda' | 'countdown';
  journalMode: string | null;
};

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark', // README: dark is the product default
  accent: DEFAULT_ACCENT,
  motion: true,
  navPicks: ['home', 'calendar', 'tasks', 'notebooks', 'more'],
  fabPos: null,
  calView: 'week',
  journalMode: null,
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

  // Motion is a product setting, not just a media query — it freezes every
  // infinite loop (--anim) and nulls entrance animations (.nomo).
  const reduced = !p.motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  r.style.setProperty('--anim', reduced ? 'paused' : 'running');
  r.classList.toggle('nomo', reduced);
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
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from('bd_profiles')
        .select('prefs')
        .eq('user_id', auth.user.id)
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
      void supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          void supabase.from('bd_profiles').update({ prefs: next }).eq('user_id', data.user.id);
        }
      });
      return next;
    });
  }, []);

  return { prefs, update };
}
