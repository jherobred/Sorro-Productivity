/**
 * When a habit is due, and what counts as keeping it.
 *
 * A weekday habit is not broken by a Saturday, and a once-a-week habit is kept
 * by any one day of its week. Streaks skip the days a habit was never asked
 * for, and a day a streak freeze was spent on is forgiven rather than counted.
 * A count or minutes habit is kept when its target is reached, not by the
 * first tap toward it.
 *
 * Pure, so `node --test lib/habitSchedule.check.ts` covers it.
 */

import type { HabitFrequency, HabitKind } from './habitTypes.ts';

export type ScheduledHabit = {
  id: string;
  kind: HabitKind;
  target: number | null;
  frequency?: HabitFrequency;
  custom_days?: number[];
};
export type DayTick = { habit_id: string; on_date: string; value: number };

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Monday of the week `d` is in. */
export const weekStart = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

export function isDueOn(h: ScheduledHabit, d: Date): boolean {
  const dow = d.getDay();
  switch (h.frequency) {
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekends': return dow === 0 || dow === 6;
    case 'custom_days': return !h.custom_days?.length || h.custom_days.includes(dow);
    default: return true;
  }
}

export const targetOf = (h: ScheduledHabit) => (h.kind === 'bin' ? 1 : Math.max(1, h.target ?? 1));

/** How far a day's tick is toward the target. */
export function progress(h: ScheduledHabit, tick: DayTick | undefined) {
  const target = targetOf(h);
  const value = tick ? (h.kind === 'bin' ? 1 : Math.max(0, tick.value)) : 0;
  return { value, target, done: value >= target, pct: Math.min(100, (value / target) * 100) };
}

export function ticksByDay(ticks: readonly DayTick[], habitId: string): Map<string, DayTick> {
  const out = new Map<string, DayTick>();
  for (const t of ticks) if (t.habit_id === habitId) out.set(t.on_date, t);
  return out;
}

/** Whether any day of the week starting `monday` reached the target. */
function weekKept(h: ScheduledHabit, days: Map<string, DayTick>, monday: Date): boolean {
  for (let i = 0; i < 7; i++) if (progress(h, days.get(dayKey(addDays(monday, i)))).done) return true;
  return false;
}

/** Whether a once-a-week habit has already been kept this week. */
export const keptThisWeek = (h: ScheduledHabit, ticks: readonly DayTick[], today: Date) => weekKept(h, ticksByDay(ticks, h.id), weekStart(today));

/**
 * Kept in a row, ending today: days, or weeks for a once-a-week habit. Today
 * (or this week) still being open does not break it.
 */
export function currentStreak(h: ScheduledHabit, ticks: readonly DayTick[], today: Date, frozen: ReadonlySet<string> = new Set()): number {
  const days = ticksByDay(ticks, h.id);
  if (h.frequency === 'weekly') {
    let monday = weekStart(today);
    if (!weekKept(h, days, monday)) monday = addDays(monday, -7);
    let n = 0;
    while (n < 520 && weekKept(h, days, monday)) { n++; monday = addDays(monday, -7); }
    return n;
  }
  let d = progress(h, days.get(dayKey(today))).done ? today : addDays(today, -1);
  let n = 0;
  for (let guard = 0; guard < 3700; guard++, d = addDays(d, -1)) {
    const key = dayKey(d);
    if (!isDueOn(h, d) || frozen.has(key)) continue;
    if (!progress(h, days.get(key)).done) break;
    n++;
  }
  return n;
}

/** The longest run on record, by the same rules as `currentStreak`. */
export function bestStreak(h: ScheduledHabit, ticks: readonly DayTick[], today: Date, frozen: ReadonlySet<string> = new Set()): number {
  const days = ticksByDay(ticks, h.id);
  const first = [...days.keys()].sort()[0];
  if (!first) return 0;
  let best = 0, run = 0;
  if (h.frequency === 'weekly') {
    for (let monday = weekStart(parseDay(first)); monday <= today; monday = addDays(monday, 7)) {
      run = weekKept(h, days, monday) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  }
  for (let d = parseDay(first); d <= today; d = addDays(d, 1)) {
    const key = dayKey(d);
    if (!isDueOn(h, d) || frozen.has(key)) continue;
    if (progress(h, days.get(key)).done) best = Math.max(best, ++run);
    else if (key !== dayKey(today)) run = 0;
  }
  return best;
}

/**
 * Due days kept over the last `span` days, today included only once it is
 * kept. A once-a-week habit is judged by whole weeks inside the window.
 */
export function hitRate(h: ScheduledHabit, ticks: readonly DayTick[], today: Date, span = 30) {
  const days = ticksByDay(ticks, h.id);
  let kept = 0, due = 0;
  if (h.frequency === 'weekly') {
    const weeks = Math.max(1, Math.floor(span / 7));
    for (let i = 0; i < weeks; i++) {
      const monday = addDays(weekStart(today), -7 * i);
      const ok = weekKept(h, days, monday);
      if (i === 0 && !ok) continue;
      due++;
      if (ok) kept++;
    }
  } else {
    for (let i = 0; i < span; i++) {
      const d = addDays(today, -i);
      if (!isDueOn(h, d)) continue;
      const ok = progress(h, days.get(dayKey(d))).done;
      if (i === 0 && !ok) continue;
      due++;
      if (ok) kept++;
    }
  }
  return { kept, due, pct: due ? Math.round((kept / due) * 100) : 0 };
}

/** How a day went across every habit. Once-a-week habits count only on the day they were done. */
export function dayScore(habits: readonly ScheduledHabit[], ticks: readonly DayTick[], d: Date) {
  const key = dayKey(d);
  let due = 0, done = 0;
  for (const h of habits) {
    const ok = progress(h, ticks.find((t) => t.habit_id === h.id && t.on_date === key)).done;
    if (h.frequency === 'weekly' ? ok : isDueOn(h, d)) {
      due++;
      if (ok) done++;
    }
  }
  return { due, done };
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function scheduleLabel(h: ScheduledHabit): string {
  switch (h.frequency) {
    case 'weekdays': return 'Weekdays';
    case 'weekends': return 'Weekends';
    case 'weekly': return 'Once a week';
    case 'custom_days': {
      const picked = [...(h.custom_days ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      return picked.length && picked.length < 7 ? picked.map((n) => DAY_NAMES[n]).join(', ') : 'Every day';
    }
    default: return 'Every day';
  }
}
