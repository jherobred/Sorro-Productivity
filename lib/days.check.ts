/**
 * Self-check for lib/days.ts — the journal's calendar arithmetic.
 *
 *   node lib/days.check.ts
 */

import assert from 'node:assert/strict';
import { ymd, fromYmd, monthOf, monthGrid, shiftMonth, heat, words, streaks } from './days.ts';

/* yyyy-mm-dd is local, not UTC ------------------------------------------- */
{
  const d = fromYmd('2026-08-19');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 19, 'a date string must not shift a day west of Greenwich');
  assert.equal(ymd(d), '2026-08-19', 'round trips');
  assert.equal(monthOf('2026-08-19'), '2026-08');
}

/* month grid -------------------------------------------------------------- */
{
  // August 2026 starts on a Saturday, so Monday-first leaves five blanks.
  const g = monthGrid('2026-08');
  assert.equal(g.length, 5 + 31);
  assert.deepEqual(g.slice(0, 5), [null, null, null, null, null]);
  assert.equal(g[5], '2026-08-01');
  assert.equal(g[g.length - 1], '2026-08-31');

  // February in a leap year, and one that starts on a Monday (no leaders).
  assert.equal(monthGrid('2024-02').filter(Boolean).length, 29);
  assert.equal(monthGrid('2024-01')[0], '2024-01-01', 'a Monday start has no blanks');
}

/* month arithmetic wraps the year ---------------------------------------- */
assert.equal(shiftMonth('2026-01', -1), '2025-12');
assert.equal(shiftMonth('2026-12', 1), '2027-01');
assert.equal(shiftMonth('2026-08', 0), '2026-08');

/* heat -------------------------------------------------------------------- */
assert.equal(heat(''), 0);
assert.equal(heat('three words here'), 1);
assert.equal(heat('w '.repeat(60)), 2);
assert.equal(heat('w '.repeat(200)), 3);
assert.equal(words('  one   two  '), 2);

/* streaks ----------------------------------------------------------------- */
{
  assert.deepEqual(streaks([]), { current: 0, best: 0 });

  const back = (n: number) => ymd(new Date(Date.now() - n * 86400000));

  // Today, yesterday, the day before: a live run of three.
  assert.deepEqual(streaks([back(2), back(1), back(0)]), { current: 3, best: 3 });

  // Ending yesterday still counts as live — the day is not over until it is.
  assert.equal(streaks([back(2), back(1)]).current, 2);

  // A gap ends the current run but not the record.
  const old = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'];
  const s = streaks([...old, back(0)]);
  assert.equal(s.best, 4);
  assert.equal(s.current, 1);

  // Out-of-order input must not fool it.
  assert.equal(streaks([back(1), back(0), back(2)]).current, 3);
}

console.log('days.ts ok');
