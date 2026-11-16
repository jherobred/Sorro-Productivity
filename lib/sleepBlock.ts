import { ymd } from './days.ts';

/** The four lengths the calendar's Sleep control writes in one tap. */
export const SLEEP_HOURS = [8, 6, 4, 2] as const;
export type SleepHours = (typeof SLEEP_HOURS)[number];

/** Same lavender the study builder already uses for night sleep and naps. */
export const SLEEP_COLOR = '#8A86A6';

const WAKE_HOUR = 7;

/**
 * Where a one-tap sleep block sits on `day`.
 *
 * A short block (4h or 2h), and any block tapped before noon on the open day,
 * ends at the current minute: the nap, or the sleep you just woke from.
 * A 6h or 8h block tapped from noon onward on the open day ends at 7:00 the
 * next morning. Any other day ends at 7:00 that morning.
 *
 * The start is that many hours earlier. That is a duration, so it uses
 * milliseconds. Stepping the end onto the next morning still uses setDate.
 */
export function sleepRange(hours: number, now: Date, day: Date): { starts_at: string; ends_at: string } {
  const ends = new Date(day.getFullYear(), day.getMonth(), day.getDate(), WAKE_HOUR, 0, 0, 0);
  const today = ymd(now) === ymd(day);
  if (today && (hours <= 4 || now.getHours() < 12)) {
    ends.setHours(now.getHours(), now.getMinutes(), 0, 0);
  } else if (today) {
    ends.setDate(ends.getDate() + 1);
  }
  const starts = new Date(ends.getTime() - hours * 3_600_000);
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
}
