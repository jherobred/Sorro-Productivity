/**
 * Day series: the arithmetic behind every bar, streak and total on a challenge
 * card.
 *
 * Its own module with no imports, so `node lib/series.check.ts` can run it. A
 * leaderboard that miscounts is worse than no leaderboard — people will trust
 * it, and then find out.
 *
 * Everything here works in *local* days. A task ticked at 11pm on Tuesday is a
 * Tuesday task wherever the server thinks it happened, which is why the
 * timestamps get converted with `localDay` rather than sliced off an ISO
 * string.
 */

export type Series = Record<string, number>;

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The local calendar day an instant fell on. */
export function localDay(iso: string): string {
  return ymd(new Date(iso));
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Every day from `from` to `to`, inclusive. Empty if the range is backwards. */
export function daysBetween(from: string, to: string): string[] {
  const a = fromYmd(from);
  const b = fromYmd(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) return [];
  const out: string[] = [];
  // A term is months; the cap is a guard against a mistyped year, not a limit.
  for (let i = 0; a <= b && i < 800; i++) {
    out.push(ymd(a));
    a.setDate(a.getDate() + 1);
  }
  return out;
}

/** A zeroed series, so a day nobody did anything is a 0 rather than a hole. */
export function emptySeries(from: string, to: string): Series {
  const out: Series = {};
  for (const d of daysBetween(from, to)) out[d] = 0;
  return out;
}

/**
 * Count events per day. Days outside the window are dropped rather than
 * appearing at the edges — a challenge counts what happened during it.
 */
export function countByDay(days: string[], from: string, to: string): Series {
  const out = emptySeries(from, to);
  for (const d of days) if (d in out) out[d] += 1;
  return out;
}

/** Sum values per day (steps, minutes, pesos). */
export function sumByDay(rows: { day: string; value: number }[], from: string, to: string): Series {
  const out = emptySeries(from, to);
  for (const r of rows) if (r.day in out) out[r.day] += r.value;
  return out;
}

/** One point for any day that had *something* — gym days, days written. */
export function markByDay(days: string[], from: string, to: string): Series {
  const out = emptySeries(from, to);
  for (const d of days) if (d in out) out[d] = 1;
  return out;
}

/**
 * Days in the window with nothing recorded — the shape a "no-spend week" needs.
 * Today counts only once it is over, so a clean morning does not award a point
 * you might still lose by lunchtime.
 */
export function absentByDay(days: string[], from: string, to: string, today = ymd(new Date())): Series {
  const had = new Set(days);
  const out = emptySeries(from, to);
  for (const d of Object.keys(out)) out[d] = !had.has(d) && d < today ? 1 : 0;
  return out;
}

export const totalOf = (s: Series): number =>
  Object.values(s).reduce((a, b) => a + b, 0);

/** The longest run of consecutive days with anything on them. */
export function bestStreak(s: Series): number {
  let best = 0;
  let run = 0;
  for (const d of Object.keys(s).sort()) {
    if (s[d] > 0) { run += 1; best = Math.max(best, run); } else run = 0;
  }
  return best;
}

/** The run ending today (or yesterday — today is still in play). */
export function liveStreak(s: Series, today = ymd(new Date())): number {
  const days = Object.keys(s).sort().filter((d) => d <= today);
  let run = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (s[days[i]] > 0) run += 1;
    else if (days[i] === today) continue;   // today is not a miss yet
    else break;
  }
  return run;
}

/** The last `n` days, oldest first — what a sparkline draws. */
export function tail(s: Series, n: number): { day: string; value: number }[] {
  return Object.keys(s).sort().slice(-n).map((day) => ({ day, value: s[day] }));
}

/** Bar heights as fractions of the busiest day, so a sparkline scales itself. */
export function normalise(bars: { day: string; value: number }[]): number[] {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return bars.map((b) => b.value / max);
}

/** Only the days that changed, so a sync writes what it must and nothing more. */
export function diffSeries(next: Series, stored: Series): { on_date: string; value: number }[] {
  const out: { on_date: string; value: number }[] = [];
  for (const [day, value] of Object.entries(next)) {
    if ((stored[day] ?? 0) !== value) out.push({ on_date: day, value });
  }
  return out;
}
