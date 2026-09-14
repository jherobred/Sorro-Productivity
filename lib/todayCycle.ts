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
 * importance, which is the order the old rotating card used. With nothing in
 * that window the card still shows what is open instead of claiming there is
 * nothing to do.
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
  const picked = [...late, ...soon];
  const list = picked.length ? picked : [...open].sort((a, b) => (a.due_on ?? '9999-99-99').localeCompare(b.due_on ?? '9999-99-99'));
  return list.slice(0, max);
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

/** "1h 05m", "12m 30s", "40s". */
export function countdownText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
