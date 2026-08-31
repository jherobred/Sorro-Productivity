/**
 * The day, as a person lives it rather than as a clock draws it.
 *
 * Someone who eats tapsilog at 01:20 has not started Tuesday; they are still
 * finishing Monday. A calendar boundary at midnight files that meal under the
 * wrong day, splits one evening across two rows in every feed, and makes
 * "today's spend" reset while you are still out.
 *
 * So the day turns at 04:00. Everything that groups or totals by day has to
 * agree on it — Fuel's water and meals, the jar feeds, today's spend, and the
 * daily burn behind Money's runway — or the two tabs will disagree at 2am and
 * one of them will be wrong.
 *
 * Pure, so it can be checked without a DOM: lib/logday.check.ts.
 */

/** The hour the day turns over. Local time, not UTC — this is about the person. */
export const DAY_CUT_H = 4;

/**
 * Local `YYYY-MM-DD`, spelled out here rather than imported.
 *
 * Every pure lib in this repo that carries a `.check.ts` is dependency-free, so
 * `node lib/*.check.ts` can run it without a bundler resolving paths —
 * `days.ts` and `series.ts` already keep their own copy of this for the same
 * reason. One line is the cheaper half of that trade.
 */
const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The logical day an instant belongs to, as `YYYY-MM-DD`.
 *
 * Shifting back by the cutoff and then taking the calendar date handles month
 * ends, year ends and February without a single special case.
 */
export function logDay(at: Date | string | number): string {
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return ymd(new Date(d.getTime() - DAY_CUT_H * 3600_000));
}

/** Whether two instants fall in the same lived day. */
export function sameLogDay(a: Date | string | number, b: Date | string | number): boolean {
  const x = logDay(a);
  return x !== '' && x === logDay(b);
}

/**
 * The instant a logical day begins — `YYYY-MM-DD` at 04:00 local.
 *
 * Ranged queries need this: "everything in Monday" is `[start, start + 24h)`,
 * which is not the same window as Monday on a calendar.
 */
export function logDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, DAY_CUT_H, 0, 0, 0);
}

/**
 * Group anything dated into lived days, newest day first, newest row first
 * inside each day — the order a feed is read in.
 *
 * Returned as entries rather than a Map so it maps straight to JSX without the
 * caller spreading it, which is the only thing every call site then does.
 */
export function groupByLogDay<T>(
  rows: readonly T[],
  at: (row: T) => Date | string | number,
): Array<{ day: string; rows: T[] }> {
  const bins = new Map<string, T[]>();
  for (const row of rows) {
    const key = logDay(at(row));
    if (!key) continue;
    const bin = bins.get(key);
    if (bin) bin.push(row);
    else bins.set(key, [row]);
  }
  const ms = (row: T) => new Date(at(row)).getTime();
  return [...bins.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, rows]) => ({ day, rows: rows.sort((a, b) => ms(b) - ms(a)) }));
}

/**
 * How a day heading reads. "Today" and "Yesterday" are what you actually scan
 * for; anything older gets its date.
 *
 * `now` is a parameter so the label can be checked without freezing the clock.
 */
export function logDayLabel(day: string, now: Date = new Date()): string {
  const today = logDay(now);
  if (day === today) return 'Today';
  const yesterday = logDay(new Date(logDayStart(today).getTime() - 12 * 3600_000));
  if (day === yesterday) return 'Yesterday';
  const d = logDayStart(day);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
