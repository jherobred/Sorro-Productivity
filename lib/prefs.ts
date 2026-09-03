'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { supabase, currentUserId } from './supabase';
import { DEFAULT_ACCENT, RETIRED_ACCENT } from './pal';
import { DEFAULT_SHELL, isShellLayout, type ShellLayout } from './shellLayouts';
import { EMPTY_PLAN } from './lift';

export type Prefs = {
  theme: 'dark' | 'light';
  accent: string;
  motion: boolean;
  navPicks: string[];
  calView: 'week' | 'month' | 'day' | 'agenda' | 'countdown';
  /** How the Tasks page lays its rows out. See app/(shell)/tasks/page.tsx. */
  taskView: 'groups' | 'list' | 'table' | 'board';
  sidebar: 'open' | 'compact' | 'hidden' | 'collapsed';
  /** Which of the five shells draws the chrome. See lib/shellLayouts.ts. */
  shellLayout: ShellLayout;
  /** Which shared space you are in. null is Personal, which is not a row. */
  workspace: string | null;
  lockEvents: boolean;
  journalMode: string | null;
  /** Hide the resident bot's posts from the feed. Its challenges stay. */
  hideBot: boolean;
  /** Seven slots, Monday first: which split each weekday carries, or ''. */
  gymPlan: string[];
  /**
   * ISO timestamp the open gym session started tracking from, so the stopwatch
   * survives a reload instead of guessing. Cleared when the session ends.
   */
  gymStartAt?: string;
  /**
   * Go fullscreen on the first tap, every launch. Web only — the APK is already
   * edge to edge and has no browser chrome to hide. See useAlwaysFullscreen.
   */
  alwaysFullscreen: boolean;

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

  /* Sound & Companions. */
  soundEnabled: boolean;
  mascotVariant: 'head' | 'full';

  /* Which kinds of event may raise a notification. */
  notify: { tasks: boolean; events: boolean; social: boolean; challenges: boolean; canvas: boolean };
};

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark', // README: dark is the product default
  accent: DEFAULT_ACCENT,
  motion: true,
  navPicks: ['home', 'calendar', 'tasks', 'notebooks', 'more'],
  calView: 'week',
  taskView: 'groups',
  sidebar: 'open',
  shellLayout: DEFAULT_SHELL,
  workspace: null,
  lockEvents: false,
  journalMode: null,
  hideBot: false,
  gymPlan: EMPTY_PLAN,
  alwaysFullscreen: false,

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

  soundEnabled: true,
  mascotVariant: 'head',

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
  r.setAttribute('data-shell', p.shellLayout ?? 'L3');
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
    const stored = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') } as Prefs;
    // Everyone who never picked an accent has the old default written to disk,
    // so shipping a new one without this would change nothing for them.
    if (stored.accent === RETIRED_ACCENT) stored.accent = DEFAULT_ACCENT;
    // A value written by an older build, or hand-edited, must not take the
    // shell down a branch that does not exist.
    if (!isShellLayout(stored.shellLayout)) stored.shellLayout = DEFAULT_SHELL;
    return stored;
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * Read once, at module load, not inside subscribe().
 *
 * subscribe() used to do `state = read()` on the first subscriber. React runs
 * it between the first getSnapshot() and the check it makes straight after
 * subscribing, so the snapshot changed identity underneath React on every
 * mount: it warned "The result of getSnapshot should be cached to avoid an
 * infinite loop" and re-rendered every usePrefs consumer an extra time, which
 * on this app is the Shell and most of the routes under it.
 *
 * Reading here is safe for the static export because getServerSnapshot still
 * returns DEFAULT_PREFS, so hydration matches the prerendered HTML and React
 * swaps to the stored prefs on the render after. applyPrefs stays in
 * subscribe, where a DOM write belongs — getSnapshot must stay pure.
 */
let state: Prefs = typeof window === 'undefined' ? DEFAULT_PREFS : read();
let hydrated = false;
const listeners = new Set<() => void>();

const emit = () => { for (const l of listeners) l(); };

function subscribe(l: () => void) {
  // The first subscriber hydrates from storage. Doing it lazily rather than at
  // module scope keeps the server render deterministic.
  if (!hydrated) {
    hydrated = true;
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
