/**
 * Self-check for lib/series.ts — the arithmetic every challenge card shows.
 *
 *   node lib/series.check.ts
 */

import assert from 'node:assert/strict';
import {
  daysBetween, emptySeries, countByDay, sumByDay, markByDay, absentByDay,
  totalOf, bestStreak, liveStreak, tail, normalise, diffSeries, localDay, ymd,
} from './series.ts';

const FROM = '2026-08-17';   // a Monday
const TO = '2026-08-23';

/* the window ---------------------------------------------------------------- */
assert.equal(daysBetween(FROM, TO).length, 7, 'inclusive at both ends');
assert.equal(daysBetween(FROM, FROM).length, 1);
assert.equal(daysBetween(TO, FROM).length, 0, 'a backwards range is empty, not a crash');
assert.equal(daysBetween('2026-02-27', '2026-03-02').length, 4, 'across a month boundary');
assert.equal(daysBetween('2024-02-27', '2024-03-01').length, 4, 'and a leap day');
assert.equal(daysBetween('2020-01-01', '2030-01-01').length, 800, 'a mistyped decade is capped');

{
  const e = emptySeries(FROM, TO);
  assert.equal(Object.keys(e).length, 7);
  assert.equal(totalOf(e), 0, 'a day nobody did anything is a zero, not a hole');
}

/* counting ------------------------------------------------------------------ */
{
  const s = countByDay(['2026-08-17', '2026-08-17', '2026-08-19', '2026-08-30'], FROM, TO);
  assert.equal(s['2026-08-17'], 2, 'two on the Monday');
  assert.equal(s['2026-08-18'], 0);
  assert.equal(s['2026-08-19'], 1);
  assert.equal(totalOf(s), 3, 'the one outside the window does not count');
}

{
  const s = sumByDay([
    { day: '2026-08-17', value: 4200 },
    { day: '2026-08-17', value: 1800 },
    { day: '2026-08-20', value: 9000 },
  ], FROM, TO);
  assert.equal(s['2026-08-17'], 6000, 'two walks in one day add up');
  assert.equal(totalOf(s), 15000);
}

{
  const s = markByDay(['2026-08-17', '2026-08-17', '2026-08-21'], FROM, TO);
  assert.equal(s['2026-08-17'], 1, 'two sessions is still one gym day');
  assert.equal(totalOf(s), 2);
}

/* no-spend ------------------------------------------------------------------ */
{
  const spent = ['2026-08-18', '2026-08-21'];
  const s = absentByDay(spent, FROM, TO, '2026-08-22');
  assert.equal(s['2026-08-17'], 1, 'a clean day scores');
  assert.equal(s['2026-08-18'], 0, 'a day you spent does not');
  assert.equal(s['2026-08-22'], 0, 'today is still in play, so it scores nothing yet');
  assert.equal(s['2026-08-23'], 0, 'and tomorrow certainly does not');
  assert.equal(totalOf(s), 3, 'the 17th, 19th and 20th — the only finished, clean days');
}

/* streaks ------------------------------------------------------------------- */
{
  const s = { '2026-08-17': 1, '2026-08-18': 1, '2026-08-19': 0, '2026-08-20': 1, '2026-08-21': 1, '2026-08-22': 1, '2026-08-23': 0 };
  assert.equal(bestStreak(s), 3, 'the 20th to the 22nd');
  assert.equal(liveStreak(s, '2026-08-22'), 3, 'counting back from today');
  assert.equal(liveStreak(s, '2026-08-23'), 3, 'today is empty but is not a miss yet');
  assert.equal(bestStreak({}), 0);
  assert.equal(liveStreak({ '2026-08-23': 0 }, '2026-08-23'), 0);
}

/* sparkline ----------------------------------------------------------------- */
{
  const s = countByDay(['2026-08-17', '2026-08-19', '2026-08-19', '2026-08-23'], FROM, TO);
  const bars = tail(s, 7);
  assert.equal(bars.length, 7);
  assert.equal(bars[0].day, '2026-08-17', 'oldest first');
  assert.deepEqual(normalise(bars), [0.5, 0, 1, 0, 0, 0, 0.5], 'scaled to the busiest day');
  assert.deepEqual(normalise([{ day: 'x', value: 0 }]), [0], 'an empty week does not divide by zero');
  assert.equal(tail(s, 3).length, 3, 'a shorter tail is the last three days');
}

/* writing back only what changed -------------------------------------------- */
{
  const next = { a: 1, b: 2, c: 0 };
  const stored = { a: 1, b: 5 };
  assert.deepEqual(diffSeries(next, stored), [{ on_date: 'b', value: 2 }],
    'a is unchanged, c was already absent and is still zero');
  assert.deepEqual(diffSeries({ a: 0 }, {}), [], 'a zero against nothing stored is not a write');
}

/* local days ---------------------------------------------------------------- */
{
  const late = new Date(2026, 7, 18, 23, 40);
  assert.equal(localDay(late.toISOString()), '2026-08-18',
    'a task ticked at twenty to midnight belongs to that day, not the next one in UTC');
  assert.equal(ymd(new Date(2026, 0, 5)), '2026-01-05', 'months and days are padded');
}

console.log('series.ts ok');
