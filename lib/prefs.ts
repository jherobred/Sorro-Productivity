'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { supabase, currentUserId } from './supabase';
import { DEFAULT_ACCENT } from './pal';
import { EMPTY_PLAN } from './lift';

export type Prefs = {
  theme: 'dark' | 'light';
  accent: string;
  motion: boolean;
  navPicks: string[];
  calView: 'week' | 'month' | 'day' | 'agenda' | 'countdown';
  sidebar: 'open' | 'collapsed';
  /** Which shared space you are in. null is Personal, which is not a row. */
  workspace: string | null;
  lockEvents: boolean;
  journalMode: string | null;
  /** Hide the resident bot's posts from the feed. Its challenges stay. */
  hideBot: boolean;
  /** Seven slots, Monday first: which split each weekday carries, or ''. */
  gymPlan: string[];

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
  calView: 'week',
  sidebar: 'open',
  workspace: null,
  lockEvents: false,
  journalMode: null,
  hideBot: false,
  gymPlan: EMPTY_PLAN,

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

  r.classList.toggle('railshut', p.sidebar === 'collapsed');
}

/* ------------------------------------------------------------------ store */

/**
 * Preferences are ONE store, not per-component state.
 *
 * Every screen calls usePrefs(), and the previous version gave each caller its
 * own useState seeded from localStorage. Two things went wrong. Changing a
 * preference in one component left every other component holding the old value
 * until it happened to remount. Worse, each copy re-ran applyPrefs() with its
 * own stale snapshot, so a component re-rendering for an unrelated reason would
 * quietly undo a root class another component had just set — which is why the
 * sidebar collapsed and then silently sprang back open.
 */
function read(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

let state: Prefs = DEFAULT_PREFS;
let hydrated = false;
const listeners = new Set<() => void>();

const emit = () => { for (const l of listeners) l(); };

function subscribe(l: () => void) {
  // The first subscriber hydrates from storage. Doing it lazily rather than at
  // module scope keeps the server render deterministic.
  if (!hydrated) {
    hydrated = true;
    state = read();
    applyPrefs(state);
    void hydrateFromServer();
  }
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Prefs follow the user across devices; the server copy wins once it lands. */
async function hydrateFromServer() {
  const uid = await currentUserId().catch(() => null);
  if (!uid) return;
  const { data } = await supabase.from('bd_profiles').select('prefs').eq('user_id', uid).single();
  const remote = data?.prefs as Partial<Prefs> | undefined;
  if (!remote || Object.keys(remote).length === 0) return;
  state = { ...DEFAULT_PREFS, ...remote };
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  applyPrefs(state);
  emit();
}

export function setPrefs(patch: Partial<Prefs>) {
  state = { ...state, ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  applyPrefs(state);
  emit();
  // Fire-and-forget: the local write already happened, so a failed sync costs
  // nothing the next hydrate will not fix.
  const snapshot = state;
  void currentUserId()
    .then((uid) => supabase.from('bd_profiles').update({ prefs: snapshot }).eq('user_id', uid))
    .catch(() => { /* signed out */ });
}

export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, () => state, () => DEFAULT_PREFS);
  const update = useCallback(async (patch: Partial<Prefs>) => setPrefs(patch), []);
  return { prefs, update };
}
