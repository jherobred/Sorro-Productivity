'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { createInvalidationQueue } from './liveInvalidation';

/**
 * One socket for the whole app.
 *
 * **The bug this fixes.** Only eleven tables were ever in the `supabase_realtime`
 * publication — the community layer and project cards — and only four screens
 * ever opened a channel. Everything else (tasks, calendar, notes, habits, money,
 * files, the gym, the journal) had no live path at all, so a phone and a desktop
 * signed into the same account only agreed after `staleTime` expired *and* the
 * window happened to be focused. Tick a task on the laptop and the phone in your
 * hand kept showing it unticked, indefinitely, because a phone with the app in
 * front of you never fires a focus event. That is the "sync delay": not slow, but
 * absent.
 *
 * **Why one channel and not one per screen.** The old `useRealtime(table, key)`
 * opened `rt:<table>:<filter>` wherever it was called — and Messages and the
 * MessengerDock both called it with the same arguments, so two channels raced for
 * one Phoenix topic on one socket. A subscription that belongs to the session,
 * not to a screen, cannot collide with itself, unsubscribes exactly once, and
 * survives navigation instead of tearing down and rejoining on every route
 * change. It is mounted once, by the Shell.
 *
 * **Invalidation is by prefix.** TanStack matches `['events']` against
 * `['events', weekStart, days]`, so one entry per table covers every window a
 * screen has cached — which is the rule fact 3 in HANDOFF.md exists to enforce.
 * Table `bd_x` maps to prefix `['x']`; the handful of screens that cache a table
 * under a second name are listed in ALSO.
 *
 * **Your own echo is ignored while you are writing.** Refetching on the echo of
 * your own write replays exactly the race `settler()` was built to stop: the read
 * lands after a later optimistic update and overwrites it. Somebody else's change
 * is worth a refetch; your own, mid-edit, is not.
 */

/** Tables worth a socket. Personal ones included — that is the whole point. */
const TABLES = [
  // planning
  'sorro_tasks', 'sorro_subtasks', 'sorro_lists', 'sorro_events', 'bd_goals', 'sorro_milestones', 'sorro_terms',
  // habits
  'bd_habits', 'bd_habit_ticks',
  // notes and canvases
  'sorro_notes', 'sorro_notebooks', 'sorro_note_tags', 'sorro_canvases', 'sorro_canvas_nodes', 'sorro_canvas_edges',
  'sorro_journal_entries', 'sorro_journal_photos', 'sorro_scratch',
  // money
  'bd_transactions', 'bd_accounts', 'bd_budgets', 'bd_to_buy', 'bd_subscriptions',
  // body
  'bd_body_days', 'bd_meals', 'bd_workouts', 'bd_workout_sets', 'bd_gym_days',
  'sorro_java_files', 'sorro_profiles', 'sorro_notifications',
] as const;

/** Screens that cache a table under a name other than its own. */
const ALSO: Record<string, string[]> = {
  sorro_notebooks: ['notebooks_trash', 'notes'],
  sorro_notes: ['notes_trash', 'home_recent_notes'],
  sorro_projects: ['home_projects'],
  sorro_profiles: ['me_handle'],
  bd_post_comments: ['comments', 'comment_counts'],
  bd_thread_replies: ['comments', 'comment_counts'],
  sorro_journal_entries: ['journal_dates', 'journal_month', 'journal_on_this_day'],
  // Every auto-sourced challenge metric reads one of these, so a tick anywhere
  // has to reach the standings as well as the screen it happened on.
  sorro_tasks: ['metric'],
  bd_habit_ticks: ['metric'],
  bd_workouts: ['metric'],
  bd_body_days: ['metric'],
  bd_transactions: ['metric'],
  bd_challenge_days: ['metric'],
};

const prefixesFor = (table: string): string[] => [
  table.replace(/^bd_/, ''),
  ...(ALSO[table] ?? []),
];

/**
 * How long away makes a return worth a full catch-up. Deliberately the global
 * `staleTime` from lib/offline.ts: below it every query is considered current
 * anyway, so refetching them all would be buying nothing with a round trip.
 */
const CATCHUP_AFTER_MS = 30_000;

/**
 * Changes arrive one row at a time; a fifteen-row insert is fifteen events for
 * one screen. Collect the tables that spoke and refetch each once.
 */
function hasExecutingWrites(qc: QueryClient) {
  return qc.getMutationCache().findAll({ status: 'pending' }).some(m => !m.state.isPaused);
}

function batcher(qc: QueryClient) {
  return createInvalidationQueue({
    busy: () => hasExecutingWrites(qc),
    invalidate: key => { void qc.invalidateQueries({ queryKey: [key] }); },
    schedule: (run, delay) => setTimeout(run, delay),
    cancel: timer => clearTimeout(timer),
  });
}

/**
 * Mount once, in the Shell. Everything below it stays live.
 *
 * Only the retained app sections subscribe to change events.
 */
export function useLiveSync() {
  const qc = useQueryClient();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_FIXTURES === '1' && process.env.NODE_ENV !== 'production') return;
    const bump = batcher(qc);
    const channel = supabase.channel('bd:live');

    for (const table of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => bump.add(prefixesFor(table)));
    }

    /**
     * Whether the socket has been anything other than joined since the last
     * catch-up. A drop is the only way a change can be missed, so it is also
     * the only thing that makes a catch-up worth its round trips.
     */
    let dropped = false;
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') dropped = true;
      else if (dropped) wake();
    });

    /**
     * The backstop. Realtime can drop a socket without either side noticing —
     * a phone that slept, a tunnel, a laptop lid. Coming back to the app is the
     * one moment a stale screen is guaranteed to be looked at, so refetch what
     * is on it. `visibilitychange` fires where `focus` does not: a phone
     * returning from the background never focuses anything.
     *
     * **But not on every switch back.** `invalidateQueries({type:'active'})`
     * refetches every mounted query *regardless of staleTime* — so glancing at
     * another app for three seconds cost a whole screen of round trips on
     * return, which on campus wifi is the "everything has high ping" symptom
     * itself. That is only ever useful if something was actually missed, and
     * with the socket up nothing was: Realtime delivered it while we were away.
     *
     * So the catch-up runs when the socket dropped, or when we were gone long
     * enough that it could have died without saying so. Under that, TanStack's
     * own refetchOnWindowFocus already refetches whatever passed staleTime,
     * which is the same freshness promise every query has anyway.
     */
    let wakeTimer: ReturnType<typeof setTimeout> | null = null;
    let hiddenAt: number | null = document.visibilityState === 'hidden' ? Date.now() : null;
    function wake() {
      if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
      if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
      if (!navigator.onLine) return;
      if (!dropped && (hiddenAt === null || Date.now() - hiddenAt < CATCHUP_AFTER_MS)) return;
      // Still writing: mirror batcher()'s own retry rather than dropping the
      // catch-up — this is the one moment it exists to cover. A paused
      // mutation (offline, queued) is parked, not executing, so it must not
      // count here or this retries forever while offline.
      const busy = hasExecutingWrites(qc);
      if (busy) { wakeTimer = setTimeout(wake, 400); return; }
      dropped = false;
      hiddenAt = null;
      void qc.invalidateQueries({ type: 'active' });
    };
    document.addEventListener('visibilitychange', wake);

    return () => {
      bump.dispose();
      document.removeEventListener('visibilitychange', wake);
      if (wakeTimer) clearTimeout(wakeTimer);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
