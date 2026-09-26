/**
 * Money, reckoned.
 *
 * One question a student's ledger has to answer — *how long can I keep going*
 * — and the arithmetic for the pictures around it. Pure, with no imports, so
 * `node lib/runway.check.ts` can run it: a runway that is wrong by a factor is
 * worse than no runway, because you would plan around it.
 *
 * **Signs.** A positive `amount_centavos` is money going out, a negative one is
 * money coming in. That is what the seed data, the to-buy converter and the
 * metrics query have always written, so it is the convention rather than a
 * choice made here.
 *
 * This file used to `Math.abs()` everything, on the belief that no row could
 * ever be income. The keypad has an Income button, so rows could — and every
 * one of them shortened the runway it should have lengthened: ₱5,000 of
 * allowance came off the balance *and* went on the burn rate. Nothing abs()es
 * any more. `outgo` takes the positive side, `incoming` the negative one, and
 * a row can only ever count as one of the two.
 */

import { logDay, logDayStart } from './logday.ts';

export type Spend = { amount_centavos: number; category: string; occurred_at: string };

const DAY = 86_400_000;

/** Money out, or zero for a row that was money in. */
export const outgo = (t: { amount_centavos: number }) => Math.max(0, t.amount_centavos);

/** Money in, or zero for a row that was money out. */
export const incoming = (t: { amount_centavos: number }) => Math.max(0, -t.amount_centavos);

/** What the row does to a balance: spending subtracts, income adds. */
export const net = (t: { amount_centavos: number }) => -t.amount_centavos;

/** Opening balance plus everything that has happened to it since. */
export function balanceOf(opening: number, txns: { amount_centavos: number }[]): number {
  return txns.reduce((sum, t) => sum + net(t), opening);
}

/** Everything spent in the window. Income in the window is not negative spend. */
export function spentBetween(txns: Spend[], fromMs: number, toMs: number): number {
  return txns.reduce((sum, t) => {
    const at = new Date(t.occurred_at).getTime();
    return at >= fromMs && at <= toMs ? sum + outgo(t) : sum;
  }, 0);
}

/** Everything earned in the window. */
export function earnedBetween(txns: Spend[], fromMs: number, toMs: number): number {
  return txns.reduce((sum, t) => {
    const at = new Date(t.occurred_at).getTime();
    return at >= fromMs && at <= toMs ? sum + incoming(t) : sum;
  }, 0);
}

/**
 * What a day costs you, averaged over the last `days`.
 *
 * Averaged over the window rather than over "days you actually spent
 * something": a Sunday you buy nothing is still a Sunday, and counting only
 * the busy days would flatter the burn rate and stretch the runway.
 */
export function burnPerDay(txns: Spend[], days = 30, now = Date.now()): number {
  if (days <= 0) return 0;
  return Math.round(spentBetween(txns, now - days * DAY, now) / days);
}

/**
 * How many whole days the balance lasts at that burn.
 *
 * `null` when there is nothing to divide by — a month with no spending is not
 * infinite runway, it is a question the data cannot answer, and a gauge
 * pointing at ∞ would be a lie with a needle on it.
 */
export function runwayDays(balance: number, burn: number): number | null {
  if (burn <= 0) return null;
  if (balance <= 0) return 0;
  return Math.min(999, Math.floor(balance / burn));
}

/** Runway as a fraction of a comfortable month, for the gauge's sweep. */
export function runwayFill(days: number | null, comfortable = 30): number {
  if (days === null) return 0;
  return Math.max(0, Math.min(1, days / comfortable));
}

export type CategorySpend = { category: string; total: number };

/** What went where in the window, biggest first. */
export function byCategory(txns: Spend[], fromMs: number, toMs: number): CategorySpend[] {
  const m = new Map<string, number>();
  for (const t of txns) {
    const at = new Date(t.occurred_at).getTime();
    if (at < fromMs || at > toMs) continue;
    const spent = outgo(t);
    if (spent === 0) continue;
    const key = t.category || 'Other';
    m.set(key, (m.get(key) ?? 0) + spent);
  }
  return [...m.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/** How full a budget's jar is, 0–1, and whether it has been poured past. */
export function jarLevel(spent: number, budget: number): { left: number; fill: number; over: boolean } {
  if (budget <= 0) return { left: 0, fill: 0, over: spent > 0 };
  const left = budget - spent;
  return { left, fill: Math.max(0, Math.min(1, left / budget)), over: left < 0 };
}

/** The start of the current logical month, at the shared 04:00 boundary. */
export function monthStart(now = new Date()): number {
  return logDayStart(logDay(now).slice(0, 7) + '-01').getTime();
}

/* ------------------------------------------------------- the day-by-day set */

export type DaySpend = { day: string; total: number };

/** `YYYY-MM-DD` in local time. `toISOString` would file a 9pm expense tomorrow. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Spend per logical day across a run of days, oldest first, days with nothing
 * spent included as zeroes.
 *
 * The zeroes are the point. A sparkline drawn only from the days you bought
 * something is a lie about the shape of a month, and a streak counter cannot
 * count what is not in the list.
 */
export function dailySpend(txns: Spend[], days = 30, now = new Date()): DaySpend[] {
  const totals = new Map<string, number>();
  for (const t of txns) {
    const spent = outgo(t);
    if (spent === 0) continue;
    const key = logDay(t.occurred_at);
    totals.set(key, (totals.get(key) ?? 0) + spent);
  }

  const out: DaySpend[] = [];
  const current = logDayStart(logDay(now));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(current.getFullYear(), current.getMonth(), current.getDate() - i);
    const day = localDay(d);
    out.push({ day, total: totals.get(day) ?? 0 });
  }
  return out;
}

/** Every day of `now`'s logical month, for the heatmap grid. */
export function monthSpend(txns: Spend[], now = new Date()): DaySpend[] {
  const current = logDayStart(logDay(now));
  const end = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
  return dailySpend(txns, end, new Date(current.getFullYear(), current.getMonth(), end, 12));
}

/**
 * Consecutive days up to and including today on which nothing was spent.
 *
 * Today counts. Ending the streak at yesterday would mean the counter only
 * moved after midnight, which is the one time nobody is looking at it.
 */
export function noSpendStreak(series: DaySpend[]): number {
  let n = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].total > 0) break;
    n++;
  }
  return n;
}

/**
 * The last seven days against the seven before them.
 *
 * `pct` is null when there is no earlier week to compare against — "up 100%"
 * from nothing is arithmetic, not information.
 */
export function weekDelta(txns: Spend[], now = Date.now()): { current: number; previous: number; pct: number | null } {
  const current = spentBetween(txns, now - 7 * DAY, now);
  const previous = spentBetween(txns, now - 14 * DAY, now - 7 * DAY);
  return {
    current,
    previous,
    pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
  };
}
