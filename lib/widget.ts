'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { appScheme, asUrl } from './nativeAuth';
import { queryClient } from './offline';
import { logDay } from './logday';
import { CUP_ML } from './hydration';
import { GOALS } from './body';
import { ymd, streak, useHabitActions, type Habit, type Tick } from './habits';
import { useWaterActions, type Sip } from './water';
import { peso, type Txn } from './money';
import type { Task } from './tasks';
import { toast } from './toast';

/**
 * The home-screen widgets, from this side.
 *
 * Two jobs, opposite directions.
 *
 *   out  Push a snapshot of today to native so the widgets have something to
 *        draw. Built from the React Query cache and nothing else — it subscribes
 *        to the cache rather than calling the hooks, because a hook would mean
 *        five more live queries on every screen in the app, and the widget is
 *        not worth a refetch storm to feed.
 *
 *   in   Replay the taps made while the app was closed. A cup logged on the
 *        home screen has already moved the widget; this is where it becomes a
 *        row in Supabase, through the same mutations the app itself uses, so it
 *        inherits the offline queue, the optimistic update and the retry.
 *
 * Nothing here runs on the web build. See android/.../Snap.java for the other
 * half, which is where the JSON below is read.
 */

type WidgetHabit = { id: string; name: string; color: string; done: boolean; streak: number };

type Snapshot = {
  /** Calendar date — what a habit tick is filed under. */
  date: string;
  /** Lived day, turning at 04:00 — what water and spend are filed under. */
  logDay: string;
  tasksOpen: number;
  water: number;
  waterGoal: number;
  /** Pre-formatted: the peso sign and grouping are this side's problem, not Java's. */
  spent: string;
  habitsDone: number;
  habitsAll: number;
  habits: WidgetHabit[];
};

type PendingOp =
  | { op: 'water'; at: string }
  | { op: 'habit'; id: string; date: string };

const Bridge = registerPlugin<{
  push(o: { snapshot: string }): Promise<void>;
  takePending(): Promise<{ ops: string }>;
}>('WidgetBridge');

const native = () => Capacitor.isNativePlatform();

/**
 * The `do=` values that are simply a section to open. Allow-listed rather than
 * interpolated straight into a path: the link arrives from outside the app, and
 * `router.push` should never be handed a string this file has not vouched for.
 */
const SECTIONS = new Set(['home', 'tasks', 'fuel', 'money', 'habits']);

/**
 * Today's ticks, from whichever windows are cached.
 *
 * `useTicks(n)` is called with 1, 7 and 30 across the app, so there is no single
 * key to read. Any window includes today, so a habit counts as done if any of
 * them says so; the streak needs history, so it is computed from the longest.
 */
function ticksFromCache(): { today: Set<string>; history: Tick[] } {
  const rows = queryClient.getQueriesData<Tick[]>({ queryKey: ['habit_ticks'] });
  const on = ymd(new Date());
  const today = new Set<string>();
  let history: Tick[] = [];

  for (const [, ticks] of rows) {
    if (!ticks) continue;
    for (const t of ticks) if (t.on_date === on) today.add(t.habit_id);
    if (ticks.length > history.length) history = ticks;
  }
  return { today, history };
}

function build(): Snapshot {
  const now = new Date();
  const date = ymd(now);
  const day = logDay(now);

  const tasks = queryClient.getQueryData<Task[]>(['tasks']) ?? [];
  const habits = queryClient.getQueryData<Habit[]>(['habits']) ?? [];
  const sips = queryClient.getQueryData<Sip[]>(['water_log', day]) ?? [];
  const txns = queryClient.getQueryData<Txn[]>(['transactions']) ?? [];
  const { today: done, history } = ticksFromCache();

  // Twelve rows is more than a widget shows without scrolling and more than
  // anyone keeps as daily habits. The cap is on the JSON, which crosses a
  // bridge and lands in SharedPreferences.
  const rows: WidgetHabit[] = habits.slice(0, 12).map((h) => ({
    id: h.id,
    name: h.short_name || h.name,
    color: h.color,
    done: done.has(h.id),
    streak: streak(history, h.id),
  }));

  return {
    date,
    logDay: day,
    tasksOpen: tasks.filter((t) => !t.done && !t.deleted_at).length,
    water: sips.length,
    waterGoal: GOALS.water,
    // The same sum Money's header prints, so the two never disagree.
    spent: peso(
      txns
        .filter((t) => logDay(t.occurred_at) === day)
        .reduce((s, t) => s + Math.abs(t.amount_centavos), 0),
    ),
    habitsDone: rows.filter((h) => h.done).length,
    habitsAll: rows.length,
    habits: rows,
  };
}

/** The last snapshot actually sent, so an unchanged cache costs nothing. */
let sent = '';

/**
 * The launch intent stays on the activity for as long as it lives, so
 * getLaunchUrl answers with the same widget tap every time it is asked. Asking
 * again — a remount, a sign-in, a reload — would reopen a sheet the person has
 * already dealt with.
 */
let launchConsumed = false;

async function push() {
  if (!native()) return;
  const json = JSON.stringify(build());
  if (json === sent) return;
  sent = json;
  await Bridge.push({ snapshot: json }).catch(() => {
    // An older APK with no plugin, or a bridge that is not up yet. Retry on the
    // next cache change; there is nothing to tell the user.
    sent = '';
  });
}

/**
 * Wire the widgets to the running app. Called once, by the Shell.
 *
 * `onCapture` is how a widget button opens a composer: task and note land on
 * the same sheet the app's own + button opens, with the keyboard already up.
 * Handing it in rather than routing from here keeps the Shell the only thing
 * that decides what a sheet is.
 */
export function useWidgetBridge(onCapture: (kind: 'task' | 'note') => void) {
  const router = useRouter();
  const W = useWaterActions();
  const H = useHabitActions();

  useEffect(() => {
    if (!native()) return;
    let alive = true;

    /**
     * Replay what was tapped while the app was shut.
     *
     * takePending clears as it reads, so this must not run twice concurrently —
     * hence the flag rather than a plain await. Ops go straight into the normal
     * mutations, which persist themselves, so a crash after this point loses
     * nothing that the app would not also have lost.
     */
    const drain = async () => {
      const raw = await Bridge.takePending().catch(() => null);
      if (!alive || !raw?.ops) return;

      let ops: PendingOp[] = [];
      try {
        const parsed: unknown = JSON.parse(raw.ops);
        if (Array.isArray(parsed)) ops = parsed as PendingOp[];
      } catch {
        return;
      }
      if (ops.length === 0) return;

      for (const op of ops) {
        if (op.op === 'water' && op.at) {
          W.add.mutate({ id: crypto.randomUUID(), at: op.at, ml: CUP_ML });
        } else if (op.op === 'habit' && op.id && op.date) {
          H.tick.mutate({ habitId: op.id, date: op.date });
        }
      }
      toast(ops.length === 1 ? 'Logged from your widget' : `${ops.length} logged from your widget`);
    };

    /** A widget link, opened cold or while the app was already up. */
    const follow = async (url: string | undefined | null) => {
      const s = await appScheme();
      if (!url?.startsWith(s + 'log')) return;
      const what = asUrl(url, s).searchParams.get('do');

      // Task and note land on the sheet the app's own + button opens, keyboard
      // up. Money does not: its page puts the pad on screen precisely because
      // Money is opened to log, so routing there is already the fast path, and
      // it is the one that gets a jar and a kind rather than a "Quick expense".
      if (what === 'task' || what === 'note') onCapture(what);
      else if (what && SECTIONS.has(what)) router.push(`/${what}/`);
    };

    // Push whenever anything the snapshot reads from moves. Debounced, because
    // a single mutation settles the cache several times and the widget only has
    // to be right by the time you look at it.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void push();
      }, 500);
    };
    const unsubscribe = queryClient.getQueryCache().subscribe(schedule);

    void drain();
    schedule();

    const links = App.addListener('appUrlOpen', ({ url }) => void follow(url));
    // Cold start: the launch intent is not an appUrlOpen event, it is already
    // on the activity by the time any of this runs.
    if (!launchConsumed) {
      launchConsumed = true;
      void App.getLaunchUrl().then((r) => { if (alive) void follow(r?.url); });
    }
    // Coming back from the home screen is the moment the queue is most likely
    // to have something in it, and the moment the snapshot is most likely stale.
    const resumed = App.addListener('resume', () => { void drain(); void push(); });

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      unsubscribe();
      void links.then((h) => h.remove());
      void resumed.then((h) => h.remove());
    };
    // Mount-only: the mutation objects are recreated every render and the
    // listeners must not be. `.mutate` is stable enough to close over — it
    // reads the client, not this render's state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
