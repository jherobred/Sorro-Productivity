/**
 * Self-check for lib/logday.ts.
 *
 *   node lib/logday.check.ts
 */

import assert from 'node:assert/strict';
import { logDay, sameLogDay, logDayStart, groupByLogDay, logDayLabel, DAY_CUT_H } from './logday.ts';

const at = (s: string) => new Date(s);

/* the boundary itself ------------------------------------------------------ */
{
  assert.equal(logDay(at('2026-08-31T03:59:59')), '2026-08-30', 'a minute before the cut is still yesterday');
  assert.equal(logDay(at('2026-08-31T04:00:00')), '2026-08-31', 'the cut itself starts the new day');
  assert.equal(logDay(at('2026-08-31T12:00:00')), '2026-08-31');
  assert.equal(logDay(at('2026-08-31T23:59:59')), '2026-08-31');
  assert.equal(logDay(at('2026-09-01T01:20:00')), '2026-08-31', 'tapsilog after midnight is still Monday');
}

/* rollovers the shift has to survive without special cases ----------------- */
{
  assert.equal(logDay(at('2026-01-01T02:00:00')), '2025-12-31', 'across a year end');
  assert.equal(logDay(at('2026-03-01T00:30:00')), '2026-02-28', 'non-leap February');
  assert.equal(logDay(at('2024-03-01T00:30:00')), '2024-02-29', 'leap February');
  assert.equal(logDay(at('2026-09-01T04:00:00')), '2026-09-01', 'the cut on the first of a month');
}

/* bad input is answered, not thrown ---------------------------------------- */
assert.equal(logDay(new Date('nonsense')), '', 'an invalid date yields no day rather than "NaN-NaN-NaN"');
assert.equal(sameLogDay(new Date('nonsense'), new Date('nonsense')), false, 'two unknowns are not the same day');

/* sameLogDay ---------------------------------------------------------------- */
assert.equal(sameLogDay(at('2026-08-31T22:00'), at('2026-09-01T02:00')), true, 'an evening and its small hours');
assert.equal(sameLogDay(at('2026-08-31T03:00'), at('2026-08-31T05:00')), false, 'either side of the cut');

/* logDayStart is the inverse ------------------------------------------------ */
for (const s of ['2026-08-31T04:00:00', '2026-08-31T18:30:00', '2026-09-01T03:00:00']) {
  const day = logDay(at(s));
  const start = logDayStart(day);
  assert.equal(start.getHours(), DAY_CUT_H, 'a day starts at the cutoff hour');
  assert.equal(logDay(start), day, 'the start of a day belongs to that day');
  assert.ok(at(s).getTime() >= start.getTime(), 'no instant precedes the start of its own day');
  assert.ok(at(s).getTime() < start.getTime() + 864e5, 'and none reaches the next one');
}

/* grouping: newest day first, newest row first ------------------------------ */
{
  const rows = [
    { id: 'silog', when: '2026-08-31T07:45:00' },
    { id: 'tapsi', when: '2026-09-01T01:20:00' },   // belongs to the 31st
    { id: 'isaw', when: '2026-08-31T15:30:00' },
    { id: 'boodle', when: '2026-08-30T19:10:00' },
  ];
  const g = groupByLogDay(rows, (r) => r.when);
  assert.deepEqual(g.map((x) => x.day), ['2026-08-31', '2026-08-30'], 'newest day first');
  assert.deepEqual(g[0].rows.map((r) => r.id), ['tapsi', 'isaw', 'silog'], 'newest row first inside a day');
  assert.equal(g[0].rows.length, 3, 'the 01:20 row landed on the 31st, not a day of its own');
  assert.equal(groupByLogDay([], (r: { when: string }) => r.when).length, 0, 'nothing in, nothing out');
}

/* labels -------------------------------------------------------------------- */
{
  const now = at('2026-08-31T15:41:00');
  assert.equal(logDayLabel('2026-08-31', now), 'Today');
  assert.equal(logDayLabel('2026-08-30', now), 'Yesterday');
  assert.notEqual(logDayLabel('2026-08-24', now), 'Today');
  // 02:00 still reads as "Today" because the day has not turned yet.
  assert.equal(logDayLabel('2026-08-31', at('2026-09-01T02:00:00')), 'Today');
}

console.log('logday.check.ts ok');
