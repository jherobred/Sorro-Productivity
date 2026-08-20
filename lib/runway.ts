/**
 * Money, reckoned.
 *
 * One question a student's ledger has to answer — *how long can I keep going*
 * — and the arithmetic for the pictures around it. Pure, with no imports, so
 * `node lib/runway.check.ts` can run it: a runway that is wrong by a factor is
 * worse than no runway, because you would plan around it.
 *
 * A note on signs. Every row in `bd_transactions` is money going out, stored as
 * a positive number; the whole app abs()es it. Nothing here assumes otherwise,
 * and every function takes the absolute value so a stray negative cannot make a
 * week's spending look like income.
 */

export type Spend = { amount_centavos: number; category: string; occurred_at: string };

const DAY = 86_400_000;

export const outgo = (t: { amount_centavos: number }) => Math.abs(t.amount_centavos);

/** Everything spent in the window. */
export function spentBetween(txns: Spend[], fromMs: number, toMs: number): number {
  return txns.reduce((sum, t) => {
    const at = new Date(t.occurred_at).getTime();
    return at >= fromMs && at <= toMs ? sum + outgo(t) : sum;
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
    const key = t.category || 'Other';
    m.set(key, (m.get(key) ?? 0) + outgo(t));
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

/** Coins in a stack: one per `per`, capped so a big month is still drawable. */
export function coinsFor(total: number, per = 50_000, max = 9): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.min(max, Math.round(total / per)));
}

/** The start of the current month, as an instant. */
export function monthStart(now = new Date()): number {
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}
