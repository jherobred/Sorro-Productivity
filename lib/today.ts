'use client';

import { useMemo } from 'react';
import { useEvents, weekStart, hoursOf, type Ev } from './events';
import { useTasks } from './tasks';
import { useHabits, useTicks, ymd } from './habits';
import { useBudgets, useTransactions } from './money';

/**
 * Everything three of the five shells need to say what today looks like.
 *
 * The Today spine (L3), the day column (L4) and the hub board (L2) all want the
 * same four answers — what is next, what is due, how many habits are ticked,
 * what is left to spend. Reading them here means one set of queries feeds all
 * three, and the answers cannot disagree between two pieces of chrome that are
 * on screen at the same time.
 */

export type TodayShape = {
  /** Today's events, earliest first, all-day ones excluded. */
  events: Ev[];
  /** The next event that has not finished, or the one running right now. */
  next: Ev | null;
  /** True when `next` has already started. */
  ongoing: boolean;
  /** Minutes until `next` begins. Negative once it has. */
  minsTo: number;
  dueToday: number;
  overdue: number;
  habitsDone: number;
  habitsTotal: number;
  /** Centavos left against this month's budgets, or null when none are set. */
  leftCentavos: number | null;
  spentPct: number;
};

const MIN = 60_000;

export function useToday(): TodayShape {
  const ws = useMemo(() => weekStart(new Date()), []);
  const { data: events = [] } = useEvents(ws, 7);
  const { data: tasks = [] } = useTasks();
  const { data: habits = [] } = useHabits();
  const { data: ticks = [] } = useTicks(1);
  const { data: budgets = [] } = useBudgets();
  const { data: txns = [] } = useTransactions();

  return useMemo(() => {
    const now = new Date();
    const today = ymd(now);

    const mine = events
      .filter((e) => !e.all_day && e.starts_at.slice(0, 10) === today)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    // "Next" means the first thing that has not ended — an event already
    // running is more useful to show than the one after it.
    const next = mine.find((e) => new Date(e.ends_at) > now) ?? null;
    const startsAt = next ? new Date(next.starts_at) : null;
    const ongoing = !!startsAt && startsAt <= now;
    const minsTo = startsAt ? Math.round((startsAt.getTime() - now.getTime()) / MIN) : 0;

    const open = tasks.filter((t) => !t.done && !t.deleted_at);
    const dueToday = open.filter((t) => t.due_on === today).length;
    const overdue = open.filter((t) => !!t.due_on && t.due_on < today).length;

    const doneIds = new Set(ticks.filter((t) => t.on_date === today).map((t) => t.habit_id));
    const habitsDone = habits.filter((h) => doneIds.has(h.id)).length;

    // Budgets are per-category for the month; spend is every outgoing txn in it.
    const monthPrefix = today.slice(0, 7);
    const budgeted = budgets.reduce((n, b) => n + b.amount_centavos, 0);
    const spent = txns
      .filter((t) => !t.deleted_at && t.occurred_at.startsWith(monthPrefix) && t.amount_centavos < 0)
      .reduce((n, t) => n + Math.abs(t.amount_centavos), 0);

    return {
      events: mine,
      next,
      ongoing,
      minsTo,
      dueToday,
      overdue,
      habitsDone,
      habitsTotal: habits.length,
      leftCentavos: budgeted ? budgeted - spent : null,
      spentPct: budgeted ? Math.min(100, Math.round((spent / budgeted) * 100)) : 0,
    };
  }, [events, tasks, habits, ticks, budgets, txns]);
}

/** "in 2h 10m", "in 8m", "now". Never a bare minute count past an hour. */
export function untilLabel(mins: number, ongoing: boolean): string {
  if (ongoing) return 'now';
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

/** The fraction of `next` already elapsed, for the countdown bar. */
export function elapsedPct(e: Ev | null): number {
  if (!e) return 0;
  const s = new Date(e.starts_at).getTime();
  const t = new Date(e.ends_at).getTime();
  const n = Date.now();
  if (n <= s || t <= s) return 0;
  return Math.min(100, ((n - s) / (t - s)) * 100);
}

export { hoursOf };
