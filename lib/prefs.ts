'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { supabase, currentUserId, cachedUserId } from './supabase';
import { DEFAULT_ACCENT, RETIRED_ACCENT } from './pal';
import { DEFAULT_SHELL, isShellLayout, type ShellLayout } from './shellLayouts';
import { EMPTY_PLAN } from './lift';
import type { Tag } from './tagList';
import type { TaskRepeat } from './taskRepeat';
import type { BoardMap, Col } from './board';
import type { EventLocalMeta } from './events';
import { defineMutation, queryClient } from './offline';
import { themeIsDark, type ThemePref } from './theme';
import { PreferenceOutbox, preferenceDelta, mergePreferencePatch, type PreferencePatch } from './preferenceSync';

export type Prefs = {
  taskEventLinks?: Record<string, string[]>;
  calendarHourHeight?: number;
  calendarFreeTimeArrows?: boolean;
  calendarSurfaceStyle?: 'solid' | 'translucent';
  calendarTimersPosition?: 'top' | 'bottom';
  calendarToolbarPosition?: 'top' | 'bottom';
  calendarPowerSave?: boolean;
  calendarTaskPlans?: Record<string, { date: string; starts_at: string | null }>;

  theme: ThemePref;
  /** Labels every region with its part code (lib/parts.ts). */
  showParts?: boolean;
  /** Notes pinned to the sidebar, newest first, at most 8. */
  pinnedNotes?: string[];
  accent: string;
  motion: boolean;
  navPicks: string[];
  calView: 'week' | 'month' | 'day' | 'agenda' | 'countdown';
  /**
   * How the Tasks page lays its rows out. See app/(shell)/tasks/page.tsx.
   * 'list' is the retired flat list, still found in saved prefs; it opens Agenda.
   */
  taskView: 'groups' | 'agenda' | 'table' | 'board' | 'list';
  /** What the Tasks board splits into columns by. */
  taskBoardBy: 'list' | 'course' | 'priority';
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

  /**
   * A colour picked for a page in a notebook, by page id. Pages have no column
   * for it, and this rides the same synced profile prefs as everything above,
   * so it follows the account to other devices without a migration.
   */
  noteColors: Record<string, string>;

  /** Courses and tags kept on the notebook library. See lib/tagList.ts. */
  tags: Tag[];
  /** Tag ids on each notebook, by notebook id. */
  notebookTags: Record<string, string[]>;
  /** Notebooks whose cover photo fills the whole cover instead of sitting inside a margin. */
  coverFill: Record<string, boolean>;
  /** How My Tasks sorts, and which way. */
  taskSort: { key: TaskSortKey; desc: boolean };
  /** A description, an archived flag, and whether its tasks stay out of My Tasks' main views, for each project by its list id. See lib/projects.ts. */
  projectMeta?: Record<string, { note?: string; archived?: boolean; hidden?: boolean }>;
  /** Link categories in the order you arranged them, with their colours. See lib/links.ts. */
  linkCategories?: { name: string; color: string }[];
  /** How each repeating task comes back, by task id. See lib/taskRepeat.ts. */
  taskRepeat?: Record<string, TaskRepeat>;
  /** Where each task sits on the Board tab, by task id. See lib/board.ts. */
  taskBoard?: BoardMap;
  /** Work-in-progress limits on the Board, by column. 0 is no limit. */
  boardLimits?: Partial<Record<Col, number>>;
  /** The Board as one row of columns, or one row per project. */
  boardView?: 'status' | 'lanes';
  /**
   * An event's short name and how it repeats, by event id. These were kept on
   * the device that set them, so a repeating class showed once on every other
   * device; here they follow the account. See getEventMetaMap in lib/events.ts.
   */
  eventMeta?: Record<string, EventLocalMeta>;
};

export type TaskSortKey = 'smart' | 'due' | 'priority' | 'stars' | 'title' | 'created';

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  accent: DEFAULT_ACCENT,
  motion: true,
  navPicks: ['home', 'calendar', 'tasks', 'notebooks', 'more'],
  calView: 'week',
  taskView: 'groups',
  taskBoardBy: 'list',
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

  noteColors: {},

  tags: [],
  notebookTags: {},
  coverFill: {},
  taskSort: { key: 'smart', desc: false },
};

const LS_KEY = 'sorro-prefs';

let followSystem: Prefs | null = null;
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (followSystem) applyPrefs(followSystem); });
}

/** Push prefs into the CSS custom properties the design system reads. */
export function applyPrefs(p: Prefs) {
  const r = document.documentElement;
  r.setAttribute('data-theme', themeIsDark(p.theme) ? 'dark' : 'light');
  followSystem = p.theme === 'system' ? p : null;

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
  r.classList.toggle('parts', !!p.showParts);
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
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const stored = { ...DEFAULT_PREFS, motion: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, ...saved } as Prefs;
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
/** Whether the account's own copy has been read yet. Until then a write could replace newer prefs with this device's older ones. */
let loadedFromServer = false;
export const prefsLoaded = () => loadedFromServer;
const listeners = new Set<() => void>();
const preview = process.env.NEXT_PUBLIC_DEV_FIXTURES === '1' && process.env.NODE_ENV !== 'production';
const outbox = typeof window === 'undefined' ? null : new PreferenceOutbox(window.localStorage);
let owner: string | null = null;
let hydrationEdits: PreferencePatch = {};

const SAVE_PREFS = defineMutation('prefs.save', async ({ uid }: { uid: string }) => {
  if (!outbox || preview || await currentUserId() !== uid) return;
  await outbox.flush(uid, async () => {
    const { data, error } = await supabase.from('sorro_profiles').select('prefs').eq('user_id', uid).single();
    if (error) throw error;
    return data?.prefs ?? {};
  }, async prefs => {
    const { error } = await supabase.from('sorro_profiles').update({ prefs }).eq('user_id', uid).select('user_id').single();
    if (error) throw error;
  });
});
queryClient.setMutationDefaults(SAVE_PREFS, { ...queryClient.getMutationDefaults(SAVE_PREFS), scope: { id: 'preferences' } });
function syncPreferences(uid: string) {
  if (preview || !outbox || !Object.keys(outbox.pending(uid)).length) return;
  // The shared save indicator and retry action observe this mutation too.
  void queryClient.getMutationCache().build<unknown, Error, { uid: string }, unknown>(queryClient, { mutationKey: SAVE_PREFS }).execute({ uid }).catch(() => {});
}
if (typeof window !== 'undefined') window.addEventListener('online', () => { if (owner) syncPreferences(owner); });

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

/** Hydrate account preferences while preserving local changes still waiting to sync. */
async function hydrateFromServer() {
  const uid = await currentUserId().catch(() => null);
  if (!uid) return;
  owner = uid;
  if (preview) { loadedFromServer = true; return; }
  const { data, error } = await supabase.from('sorro_profiles').select('prefs').eq('user_id', uid).single();
  if (await currentUserId().catch(() => null) !== uid) return;
  const remote = data?.prefs as Partial<Prefs> | undefined;
  if (!error) {
    const pending = mergePreferencePatch(outbox?.pending(uid) ?? {}, hydrationEdits, true);
    const saved = remote && Object.keys(remote).length ? remote : state;
    state = mergePreferencePatch({ ...DEFAULT_PREFS, ...saved }, pending) as Prefs;
    loadedFromServer = true;
    hydrationEdits = {};
    localStorage.setItem(LS_KEY, JSON.stringify(state));
    applyPrefs(state);
    emit();
  }
  syncPreferences(uid);
}

export function setPrefs(patch: Partial<Prefs>) {
  const delta = preferenceDelta(state, patch);
  state = { ...state, ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  applyPrefs(state);
  emit();
  if (preview || !Object.keys(delta).length) return;
  if (!loadedFromServer) hydrationEdits = mergePreferencePatch(hydrationEdits, delta, true);
  const queue = (uid: string) => { outbox?.enqueue(uid, delta); syncPreferences(uid); };
  if (owner && cachedUserId() === owner) queue(owner);
  else void currentUserId().then(uid => { owner = uid; queue(uid); }).catch(() => { /* signed out: device preferences only */ });
}

/** The current prefs, for code outside React: a mutation, a query function. */
export const getPrefs = () => state;

export function usePrefs() {
  const prefs = useSyncExternalStore(subscribe, () => state, () => DEFAULT_PREFS);
  const update = useCallback(async (patch: Partial<Prefs>) => setPrefs(patch), []);
  return { prefs, update };
}
