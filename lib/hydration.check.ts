/**
 * Self-check for lib/hydration.ts.
 *
 *   node lib/hydration.check.ts
 *
 * Every threshold here is a published figure, so these assertions are the place
 * the sources are pinned. If one of them starts failing, either a constant
 * drifted or somebody changed the science — both are worth stopping for.
 */

import assert from 'node:assert/strict';
import {
  hydration, expectedBy, fillPct, goalPct, inLastHour, hourOf,
  GOAL_ML, HOUR_CAP, DAY_MAX, CUP_ML, SCALE_ML, GOAL_MARK, WAKE_H, BED_H,
} from './hydration.ts';

const key = (t: number, h: number, at: number) => hydration(t, h, at).key;

/* the constants are the sources ------------------------------------------- */
{
  assert.equal(GOAL_ML, 2500, 'EFSA 2010 upper of the 2.0-2.5 L adult band');
  assert.equal(HOUR_CAP, 1000, 'maximum renal free-water clearance, ~0.8-1.0 L/hour');
  assert.equal(GOAL_ML / CUP_ML, 10, 'the goal is exactly the ten cups drawn');
  assert.ok(SCALE_ML > GOAL_ML, 'the column must have room above the goal or it cannot show overshoot');
}

/* pace is time-weighted ---------------------------------------------------- */
{
  assert.equal(expectedBy(WAKE_H), 0, 'nothing is expected at waking');
  assert.equal(expectedBy(BED_H), GOAL_ML, 'the whole goal is expected by bed');
  assert.equal(expectedBy(3), 0, 'before waking clamps to zero, it does not go negative');
  assert.equal(expectedBy(30), GOAL_ML, 'after bed clamps to the goal');
  const mid = expectedBy((WAKE_H + BED_H) / 2);
  assert.ok(Math.abs(mid - GOAL_ML / 2) < 1, 'half the day, half the goal');
}

/* the six states ----------------------------------------------------------- */
{
  // 15:45 -> expected ~1.46 L
  assert.equal(key(1500, 250, 15.75), 'pace');
  assert.equal(key(850, 250, 15.75), 'behind');
  assert.equal(key(2100, 250, 15.75), 'ahead');
  assert.equal(key(2500, 200, 15), 'done', 'reaching the goal is its own state, not "ahead"');
  assert.equal(key(1200, 1100, 15), 'fast');
  assert.equal(key(4200, 100, 20), 'over');
}

/* the hourly ceiling outranks everything ----------------------------------- */
{
  assert.equal(key(2600, 1100, 15), 'fast', 'past the goal, but the rate is the louder problem');
  assert.equal(key(4500, 1100, 20), 'fast', 'and it outranks the daily maximum too');
  assert.equal(key(100, HOUR_CAP, 12), 'behind', 'exactly at the cap is not yet over it');
  assert.equal(key(100, HOUR_CAP + 1, 12), 'fast', 'one millilitre past it is');
}

/* mornings have a low bar, which is the point of weighting by time --------- */
{
  assert.equal(key(0, 0, WAKE_H), 'pace', 'no water at 07:00 is not a failure');
  assert.equal(key(400, 250, 9.7), 'pace', '0.4 L by 09:42 is fine');
  assert.equal(key(900, 250, 9.7), 'ahead', 'but 0.9 L that early is ahead');
  assert.equal(key(0, 0, 18), 'behind', 'nothing by 18:00 certainly is a failure');
}

/* the behind message counts real cups -------------------------------------- */
{
  const s = hydration(850, 250, 15.75);
  assert.match(s.head, /cups behind/);
  assert.equal(s.head, '2 cups behind', `expected ~2 cups short of ${expectedBy(15.75)}ml, got "${s.head}"`);
  // Singular has to be reachable, and it only is early: later in the day the
  // 60%-of-pace gate is already several cups wide before it trips at all.
  assert.equal(hydration(200, 0, 9.4).head, '1 cup behind', 'singular, not "1 cups"');
  assert.ok(expectedBy(20) - 0 > CUP_ML * 4, 'by 20:00 "behind" can never mean one cup');
}

/* every state says something, and only warnings shout ---------------------- */
for (const c of [[1500, 250, 15.75], [850, 250, 15.75], [2100, 250, 15.75],
                 [2500, 200, 15], [1200, 1100, 15], [4200, 100, 20]] as const) {
  const s = hydration(c[0], c[1], c[2]);
  assert.ok(s.head && s.why && s.act, `${s.key} must carry all three sentences`);
  assert.ok(s.waveSec > 0, `${s.key} needs a wave speed`);
  assert.match(s.hue, /^#[0-9A-F]{6}$/i, `${s.key} needs a real hue`);
  assert.equal(s.alarm, s.key === 'fast' || s.key === 'over', `only the two warnings pulse (${s.key})`);
}

/* drawing ------------------------------------------------------------------ */
{
  assert.equal(fillPct(0), 0);
  assert.equal(fillPct(SCALE_ML), 100);
  assert.ok(fillPct(GOAL_ML) < 100, 'the goal is not the top of the glass');
  assert.ok(Math.abs(fillPct(GOAL_ML) - GOAL_MARK) < 0.01, 'the goal line sits where the goal fills to');
  assert.ok(fillPct(DAY_MAX) > GOAL_MARK, 'overshoot draws above the line');
  assert.equal(fillPct(99999), 100, 'and still never overflows the glass');
  assert.equal(goalPct(GOAL_ML), 100);
  assert.equal(goalPct(GOAL_ML * 2), 100, 'the bar caps at the goal even when the glass does not');
}

/* rubbish in, an answer out ------------------------------------------------ */
{
  assert.equal(key(Number.NaN, 0, 12), 'behind', 'a broken total is treated as none');
  assert.equal(key(-500, 0, 12), 'behind', 'negative is floored, not inverted');
  assert.equal(fillPct(Number.NaN), 0);
  assert.doesNotThrow(() => hydration(1000, Number.NaN, Number.NaN));
}

/* the rolling hour --------------------------------------------------------- */
{
  const now = new Date('2026-08-31T15:41:00');
  const iso = (mins: number) => new Date(now.getTime() - mins * 60000).toISOString();
  const rows = [[iso(10), 250], [iso(35), 500], [iso(58), 250], [iso(90), 250]] as const;
  assert.equal(inLastHour(rows, now), 1000, 'only what fell inside the last 60 minutes counts');
  assert.equal(inLastHour([], now), 0);
  assert.equal(inLastHour([['not a date', 250]], now), 0, 'an unparseable stamp is skipped, not NaN');
  // ...and that is exactly the burst the rule is meant to catch.
  assert.equal(hydration(1500, inLastHour([...rows, [iso(2), 250]], now), 15.75).key, 'fast');
}

/* hourOf ------------------------------------------------------------------- */
{
  assert.equal(hourOf(new Date('2026-08-31T15:45:00')), 15.75);
  assert.equal(hourOf(new Date('2026-08-31T00:00:00')), 0);
}

console.log('hydration.check.ts ok');
