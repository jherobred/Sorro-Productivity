'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

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
  'bd_tasks', 'bd_subtasks', 'bd_lists', 'bd_events', 'bd_goals', 'bd_milestones', 'bd_terms',
  // habits
  'bd_habits', 'bd_habit_ticks',
  // notes and canvases
  'bd_notes', 'bd_notebooks', 'bd_note_tags', 'bd_canvases', 'bd_canvas_nodes', 'bd_canvas_edges',
  'bd_journal_entries', 'bd_journal_photos', 'bd_scratch',
  // money
  'bd_transactions', 'bd_accounts', 'bd_budgets', 'bd_to_buy', 'bd_subscriptions',
  // body
  'bd_body_days', 'bd_meals', 'bd_workouts', 'bd_workout_sets', 'bd_gym_days',
  // work
  'bd_projects', 'bd_cards', 'bd_project_comments', 'bd_project_members',
  'bd_files', 'bd_folders', 'bd_java_files',
  // people and community
  'bd_posts', 'bd_threads', 'bd_post_likes', 'bd_thread_votes',
  'bd_post_comments', 'bd_thread_replies', 'bd_post_saves',
  'bd_conversations', 'bd_conversation_members', 'bd_messages',
  'bd_people', 'bd_profiles', 'bd_notifications',
  'bd_workspaces', 'bd_workspace_members',
  // challenges
  'bd_challenges', 'bd_challenge_members', 'bd_challenge_days', 'bd_challenge_stars',
] as const;

/** Screens that cache a table under a name other than its own. */
const ALSO: Record<string, string[]> = {
  bd_notes: ['notes_trash', 'home_recent_notes'],
  bd_projects: ['home_projects'],
  bd_profiles: ['me_handle'],
  bd_post_comments: ['comments', 'comment_counts'],
  bd_thread_replies: ['comments', 'comment_counts'],
  bd_journal_entries: ['journal_dates', 'journal_month', 'journal_on_this_day'],
  // Every auto-sourced challenge metric reads one of these, so a tick anywhere
  // has to reach the standings as well as the screen it happened on.
  bd_tasks: ['metric'],
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
 * Changes arrive one row at a time; a fifteen-row insert is fifteen events for
 * one screen. Collect the tables that spoke and refetch each once.
 */
function batcher(qc: QueryClient) {
  const hot = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  return (table: string) => {
    for (const p of prefixesFor(table)) hot.add(p);
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      // Still writing: the optimistic cache is the truth until the pen stops.
      // Keep what we heard and ask again after the write settles.
      if (qc.isMutating() > 0) {
        timer = setTimeout(() => { timer = null; flush(); }, 400);
        return;
      }
      flush();
    }, 120);

    function flush() {
      const keys = [...hot];
      hot.clear();
      for (const k of keys) void qc.invalidateQueries({ queryKey: [k] });
    }
  };
}

/**
 * Mount once, in the Shell. Everything below it stays live.
 *
 * ponytail: one channel with ~50 bindings. If Realtime ever starts complaining
 * about binding count, split TABLES across two channels — the batcher does not
 * care how many sockets fed it.
 */
export function useLiveSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const bump = batcher(qc);
    const channel = supabase.channel('bd:live');

    for (const table of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => bump(table));
    }
    channel.subscribe();

    /**
     * The backstop. Realtime can drop a socket without either side noticing —
     * a phone that slept, a tunnel, a laptop lid. Coming back to the app is the
     * one moment a stale screen is guaranteed to be looked at, so refetch what
     * is on it. `visibilitychange` fires where `focus` does not: a phone
     * returning from the background never focuses anything.
     */
    let wakeTimer: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      if (document.visibilityState !== 'visible') return;
      // Still writing: mirror batcher()'s own retry rather than dropping the
      // catch-up — this is the one moment it exists to cover. A paused
      // mutation (offline, queued) is parked, not executing, so it must not
      // count here or this retries forever while offline.
      const busy = qc.getMutationCache().findAll({ status: 'pending' }).some((m) => !m.state.isPaused);
      if (busy) { wakeTimer = setTimeout(wake, 400); return; }
      void qc.invalidateQueries({ type: 'active' });
    };
    document.addEventListener('visibilitychange', wake);

    return () => {
      document.removeEventListener('visibilitychange', wake);
      if (wakeTimer) clearTimeout(wakeTimer);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}
