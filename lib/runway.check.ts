/**
 * Self-check for lib/runway.ts — the money arithmetic.
 *
 *   node lib/runway.check.ts
 */

import assert from 'node:assert/strict';
import {
  outgo, incoming, net, balanceOf, spentBetween, earnedBetween, burnPerDay, runwayDays, runwayFill,
  byCategory, jarLevel, monthStart, localDay, dailySpend, monthSpend, noSpendStreak, weekDelta,
} from './runway.ts';

const NOW = new Date(2026, 7, 20, 12, 0).getTime();
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const txns = [
  { amount_centavos: 9500, category: 'Food', occurred_at: at(0) },
  { amount_centavos: 2400, category: 'Transport', occurred_at: at(0) },
  { amount_centavos: 15000, category: 'Food', occurred_at: at(3) },
  { amount_centavos: 60000, category: 'School', occurred_at: at(12) },
  { amount_centavos: 4000, category: 'Food', occurred_at: at(40) },   // outside a 30-day window
];

/* signs --------------------------------------------------------------------- */
assert.equal(outgo({ amount_centavos: 9500 }), 9500);
assert.equal(outgo({ amount_centavos: -9500 }), 0, 'income is not spending');
assert.equal(incoming({ amount_centavos: -9500 }), 9500);
assert.equal(incoming({ amount_centavos: 9500 }), 0, 'spending is not income');
assert.equal(net({ amount_centavos: 9500 }), -9500, 'spending comes off the balance');
assert.equal(net({ amount_centavos: -9500 }), 9500, 'income goes on it');

/* balance ------------------------------------------------------------------- */
assert.equal(balanceOf(100_000, []), 100_000);
assert.equal(balanceOf(100_000, [{ amount_centavos: 2400 }]), 97_600);
assert.equal(balanceOf(100_000, [{ amount_centavos: -500_000 }]), 600_000,
  'the bug this file exists for: allowance must raise the balance, not lower it');

/* windows ------------------------------------------------------------------- */
assert.equal(spentBetween(txns, NOW - 30 * DAY, NOW), 86900, 'the 40-day-old row is out of range');
assert.equal(spentBetween(txns, NOW - DAY, NOW), 11900, 'today only');
assert.equal(spentBetween([], NOW - 30 * DAY, NOW), 0);
assert.equal(earnedBetween(txns, NOW - 30 * DAY, NOW), 0, 'none of these rows is income');
assert.equal(
  earnedBetween([{ amount_centavos: -500_000, category: 'Allowance', occurred_at: at(2) }], NOW - 30 * DAY, NOW),
  500_000);

/* burn and runway ----------------------------------------------------------- */
{
  const burn = burnPerDay(txns, 30, NOW);
  assert.equal(burn, Math.round(86900 / 30), 'averaged over every day in the window, not the busy ones');

  // 29, not 30: the burn is rounded up to whole centavos and the days are
  // floored. Both err short, which is the direction a runway should err.
  assert.equal(runwayDays(86900, burn), 29, 'a month of balance at a month of burn, rounded conservatively');
  assert.equal(runwayDays(0, burn), 0, 'no money is no runway');
  assert.equal(runwayDays(-500, burn), 0, 'and neither is an overdraft');
  assert.equal(runwayDays(50000, 0), null,
    'nothing spent is a question the data cannot answer, not an infinite runway');
  assert.equal(runwayDays(100_000_000, 1), 999, 'capped rather than absurd');
  assert.equal(burnPerDay(txns, 0, NOW), 0, 'a zero-day window does not divide by zero');

  const withIncome = [...txns, { amount_centavos: -500_000, category: 'Allowance', occurred_at: at(1) }];
  assert.equal(burnPerDay(withIncome, 30, NOW), burn, 'income does not raise the burn rate');
}

/* the gauge's sweep --------------------------------------------------------- */
assert.equal(runwayFill(15, 30), 0.5);
assert.equal(runwayFill(60, 30), 1, 'the needle stops at full');
assert.equal(runwayFill(null), 0);
assert.equal(runwayFill(0, 30), 0);

/* where it went ------------------------------------------------------------- */
{
  const cats = byCategory(txns, NOW - 30 * DAY, NOW);
  assert.deepEqual(cats, [
    { category: 'School', total: 60000 },
    { category: 'Food', total: 24500 },
    { category: 'Transport', total: 2400 },
  ], 'biggest first, and the out-of-window food is not counted');

  const unlabelled = byCategory([{ amount_centavos: 100, category: '', occurred_at: at(1) }], NOW - DAY * 5, NOW);
  assert.equal(unlabelled[0].category, 'Other', 'a blank category is Other, not blank');

  const withIncome = byCategory(
    [...txns, { amount_centavos: -500_000, category: 'Allowance', occurred_at: at(1) }], NOW - 30 * DAY, NOW);
  assert.equal(withIncome.find((c) => c.category === 'Allowance'), undefined,
    'a chart of where it went has no bar for money that came in');
}

/* jars ---------------------------------------------------------------------- */
{
  assert.deepEqual(jarLevel(20000, 60000), { left: 40000, fill: 2 / 3, over: false });
  assert.deepEqual(jarLevel(60000, 60000), { left: 0, fill: 0, over: false }, 'exactly empty is not over');
  const over = jarLevel(75000, 60000);
  assert.equal(over.over, true);
  assert.equal(over.fill, 0, 'an overspent jar is empty, never negative');
  assert.equal(jarLevel(10, 0).over, true, 'spending against no budget at all is over it');
}

/* month --------------------------------------------------------------------- */
{
  const start = new Date(monthStart(new Date(2026, 7, 20)));
  assert.equal(start.getDate(), 1);
  assert.equal(start.getMonth(), 7);
  assert.equal(start.getHours(), 0);
}

/* day by day ---------------------------------------------------------------- */
{
  assert.equal(localDay(new Date(2026, 0, 5)), '2026-01-05', 'zero-padded, and local rather than UTC');

  const series = dailySpend(txns, 5, new Date(NOW));
  assert.equal(series.length, 5);
  assert.equal(series[4].day, localDay(new Date(NOW)), 'oldest first, today last');
  assert.equal(series[4].total, 11900, 'both of today\'s rows');
  assert.equal(series[1].total, 15000, 'three days ago');
  assert.equal(series[0].total, 0, 'a quiet day is a zero, not a missing entry');

  const income = dailySpend([{ amount_centavos: -500_000, category: 'X', occurred_at: at(0) }], 3, new Date(NOW));
  assert.deepEqual(income.map((d) => d.total), [0, 0, 0], 'income draws no bar on a spending chart');

  // A 31-day month gets 31 cells, and the last one is the 31st.
  const grid = monthSpend(txns, new Date(2026, 7, 20));
  assert.equal(grid.length, 31);
  assert.equal(grid[0].day, '2026-08-01');
  assert.equal(grid[30].day, '2026-08-31');

  const feb = monthSpend([], new Date(2026, 1, 10));
  assert.equal(feb.length, 28, 'February 2026 is short and the grid knows it');
}

/* streak -------------------------------------------------------------------- */
{
  const d = (day: string, total: number) => ({ day, total });
  assert.equal(noSpendStreak([d('a', 100), d('b', 0), d('c', 0)]), 2, 'counts back from today');
  assert.equal(noSpendStreak([d('a', 0), d('b', 100)]), 0, 'spending today ends the streak at zero');
  assert.equal(noSpendStreak([]), 0);
  assert.equal(noSpendStreak([d('a', 0), d('b', 0)]), 2, 'all quiet is all streak');
}

/* week over week ------------------------------------------------------------ */
{
  const w = weekDelta(txns, NOW);
  assert.equal(w.current, 26900, 'today and three days ago');
  assert.equal(w.previous, 60000, 'the school run, twelve days back');
  assert.equal(w.pct, Math.round(((26900 - 60000) / 60000) * 100));

  assert.equal(weekDelta([], NOW).pct, null, 'no earlier week is no percentage');
}

console.log('runway.ts ok');
