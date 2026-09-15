import type { Task } from './tasks';

/**
 * The two moving parts of the Today page, kept pure so they can be checked
 * without a browser: which tasks the upcoming card cycles through, and how far
 * along the wait for the next event is.
 */

const RANK: Record<string, number> = { high: 3, med: 2, low: 1 };

/**
 * The tasks the Today card cycles through, in the order it shows them.
 *
 * Late work comes first, oldest first. Then everything due within the week and
 * everything without a date, most important first and soonest within the same
 * importance, which is the order the old rotating card used. Tasks due further
 * out fill the remaining places, soonest first, so the card always has
 * something to turn to while more than one task is open.
 */
export function upcomingCycle(tasks: Task[], today: string, weekEnd: string, max = 8): Task[] {
  const open = tasks.filter((t) => !t.done && !t.deleted_at);
  const late = open
    .filter((t) => !!t.due_on && t.due_on < today)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!) || (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  const soon = open
    .filter((t) => !t.due_on || (t.due_on >= today && t.due_on <= weekEnd))
    .sort((a, b) => (RANK[b.priority ?? ''] ?? 0) - (RANK[a.priority ?? ''] ?? 0)
      || (a.due_on ?? '9999-99-99').localeCompare(b.due_on ?? '9999-99-99')
      || (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  const later = open
    .filter((t) => !!t.due_on && t.due_on > weekEnd)
    .sort((a, b) => a.due_on!.localeCompare(b.due_on!) || (a.due_at ?? '').localeCompare(b.due_at ?? ''));
  return [...late, ...soon, ...later].slice(0, max);
}

/** When a task is due: its time, or the last second of its day when it has none. */
export function deadlineOf(task: Task): number | null {
  if (task.due_at) {
    const at = Date.parse(task.due_at);
    if (Number.isFinite(at)) return at;
  }
  if (!task.due_on) return null;
  const [y, m, d] = task.due_on.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

/**
 * The exact time left before a deadline, down to the second: "2d 04:13:22"
 * with days, "04:13:22" within a day. `late` is true once it has passed, and
 * the text then counts how long ago.
 */
export function deadlineClock(deadline: number, now: number): { text: string; late: boolean } {
  const late = now > deadline;
  const total = Math.floor(Math.abs(deadline - now) / 1000);
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const clock = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { text: d ? `${d}d ${clock}` : clock, late };
}

/** `#hashtags` written in a task's title or notes, without repeats. */
export function hashtags(title: string, notes: string): string[] {
  const found = new Map<string, string>();
  for (const match of `${title} ${notes}`.matchAll(/(?:^|\s)#([a-z][\w-]{0,30})/gi)) {
    const key = match[1].toLowerCase();
    if (!found.has(key)) found.set(key, match[1]);
  }
  return [...found.values()];
}

export type Countdown = { ongoing: boolean; share: number; msLeft: number };

/**
 * How much of the wait for the next event has passed, from 0 to 1.
 *
 * Before an event the bar covers the gap it closes: from the end of the event
 * before it today, or from midnight when there was none, up to its start.
 * While it runs, the bar covers the event itself.
 */
export function eventCountdown(next: { starts_at: string; ends_at: string }, previousEnd: string | null, now: number): Countdown {
  const start = new Date(next.starts_at).getTime();
  const end = new Date(next.ends_at).getTime();
  if (now >= start) {
    return { ongoing: true, share: Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start))), msLeft: Math.max(0, end - now) };
  }
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const from = Math.min(now, Math.max(midnight.getTime(), previousEnd ? new Date(previousEnd).getTime() : 0));
  return { ongoing: false, share: Math.min(1, Math.max(0, (now - from) / Math.max(1, start - from))), msLeft: start - now };
}

type Timed = { starts_at: string; ends_at: string; all_day?: boolean; deleted_at?: string | null };

/**
 * The event the calendar's Up next timer follows: the one happening now, or
 * the next to start. `previousEnd` is when the last event before it finished,
 * where the wait for it began. All-day events have no clock time and are left out.
 */
export function nextTimedEvent<T extends Timed>(events: T[], now: number): { next: T | null; previousEnd: string | null } {
  const timed = events.filter((e) => !e.all_day && !e.deleted_at).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const next = timed.find((e) => Date.parse(e.ends_at) > now) ?? null;
  let previousEnd: string | null = null;
  for (const e of timed) if (Date.parse(e.ends_at) <= now && (!previousEnd || Date.parse(e.ends_at) > Date.parse(previousEnd))) previousEnd = e.ends_at;
  return { next, previousEnd };
}

/** The Today ends timer: the time left until 11:59 PM tonight, and how much of the day has gone. */
export function dayCountdown(now: number): { target: number; share: number; msLeft: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const target = new Date(now);
  target.setHours(23, 59, 0, 0);
  return { target: target.getTime(), share: Math.min(1, Math.max(0, (now - start.getTime()) / (target.getTime() - start.getTime()))), msLeft: Math.max(0, target.getTime() - now) };
}

/** "1h 05m", "12m 30s", "40s". */
export function countdownText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
