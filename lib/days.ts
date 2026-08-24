/**
 * Calendar arithmetic and the journal's summaries. Pure — no React, no network,
 * no `use client` — so `node lib/days.check.ts` can run it.
 *
 * Dates are `yyyy-mm-dd` strings in the user's own timezone throughout. Passing
 * one to `new Date()` parses it as UTC midnight, which is the day before for
 * everyone west of Greenwich and the reason `fromYmd` exists.
 */

/* ------------------------------------------------------------------- dates */

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A yyyy-mm-dd read back as a local date, never as UTC midnight. */
export const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Step by calendar days, not milliseconds — a local day is 23h/25h across DST. */
const addDays = (s: string, n: number) => {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const monthOf = (s: string) => s.slice(0, 7);

/** Every day drawn in a month grid, Monday-first, including the blank leaders. */
export function monthGrid(ym: string): (string | null)[] {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => ymd(new Date(y, m - 1, i + 1))),
  ];
}

export const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  return monthOf(ymd(new Date(y, m - 1 + by, 1)));
};

/* --------------------------------------------------------------- summaries */

export const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** 0–3, for the heat map. Thresholds are a student's day, not a novelist's. */
export function heat(text: string): 0 | 1 | 2 | 3 {
  const w = words(text);
  if (!w) return 0;
  if (w < 40) return 1;
  if (w < 150) return 2;
  return 3;
}

/** Days written in an unbroken run ending today or yesterday, and the best ever. */
export function streaks(dates: string[]): { current: number; best: number } {
  if (!dates.length) return { current: 0, best: 0 };
  const set = new Set(dates);
  let best = 0;
  for (const d of set) {
    const prev = addDays(d, -1);
    if (set.has(prev)) continue;          // not the start of a run
    let n = 0;
    let cur = d;
    while (set.has(cur)) {
      n++;
      cur = addDays(cur, 1);
    }
    best = Math.max(best, n);
  }

  const today = ymd(new Date());
  const yesterday = addDays(today, -1);
  let anchor = set.has(today) ? today : set.has(yesterday) ? yesterday : null;
  let current = 0;
  while (anchor && set.has(anchor)) {
    current++;
    anchor = addDays(anchor, -1);
  }

  return { current, best };
}
