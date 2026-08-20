/**
 * Self-check for lib/runway.ts — the money arithmetic.
 *
 *   node lib/runway.check.ts
 */

import assert from 'node:assert/strict';
import {
  outgo, spentBetween, burnPerDay, runwayDays, runwayFill, byCategory, jarLevel, coinsFor, monthStart,
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
assert.equal(outgo({ amount_centavos: -9500 }), 9500,
  'a stray negative is still money out, never money in');

/* windows ------------------------------------------------------------------- */
assert.equal(spentBetween(txns, NOW - 30 * DAY, NOW), 86900, 'the 40-day-old row is out of range');
assert.equal(spentBetween(txns, NOW - DAY, NOW), 11900, 'today only');
assert.equal(spentBetween([], NOW - 30 * DAY, NOW), 0);

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

/* coins --------------------------------------------------------------------- */
assert.equal(coinsFor(0), 0);
assert.equal(coinsFor(1), 1, 'any spend at all is at least one coin');
assert.equal(coinsFor(250_000), 5);
assert.equal(coinsFor(90_000_000), 9, 'a big month still fits on the shelf');

/* month --------------------------------------------------------------------- */
{
  const start = new Date(monthStart(new Date(2026, 7, 20)));
  assert.equal(start.getDate(), 1);
  assert.equal(start.getMonth(), 7);
  assert.equal(start.getHours(), 0);
}

console.log('runway.ts ok');
