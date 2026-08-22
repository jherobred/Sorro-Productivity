/**
 * Self-check for lib/lift.ts — the arithmetic the gym screen shows.
 *
 *   node lib/lift.check.ts
 */

import assert from 'node:assert/strict';
import {
  MUSCLES, EXERCISES, groupOf, kindOf, e1rm, volumeOf, bestByExercise,
  groupsOfSets, lastTime, nextSet, type WorkoutSet,
} from './lift.ts';

let n = 0;
const set = (o: Partial<WorkoutSet> & { exercise: string }): WorkoutSet => ({
  id: `s${++n}`, workout_id: 'w1', position: n, weight_kg: 0, reps: 0, done: true, ...o,
});

/* the catalogue ------------------------------------------------------------- */
assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length, 'no duplicate ids');
assert.equal(new Set(EXERCISES.map((e) => e.name)).size, EXERCISES.length, 'no duplicate names');
for (const e of EXERCISES) assert.ok(MUSCLES.includes(e.group), `${e.name} names a real muscle group`);
for (const g of MUSCLES) assert.ok(EXERCISES.some((e) => e.group === g), `${g} has something to do`);

assert.equal(groupOf('Back squat'), 'legs');
assert.equal(groupOf('  bench PRESS '), 'chest', 'case and padding do not matter');
assert.equal(groupOf('Sandbag carry'), 'core', 'anything typed in still has a home');
assert.equal(kindOf('Pull-up'), 'bodyweight');
assert.equal(kindOf('Sandbag carry'), 'weight', 'an unknown movement is assumed to be loaded');

/* estimated one-rep max ----------------------------------------------------- */
assert.equal(e1rm(100, 1), 100, 'a single is its own max');
assert.equal(e1rm(60, 8), 76, '60 x 8 ≈ 76');
assert.equal(e1rm(70, 5), 81.7, '70 x 5 beats it, which is the comparison the number is for');
assert.equal(e1rm(0, 8), 0, 'a bodyweight set has no estimate');
assert.equal(e1rm(50, 0), 0);
assert.equal(e1rm(-5, 5), 0, 'a negative weight is not a lift');
assert.equal(e1rm(50, 30), e1rm(50, 12), 'past twelve reps the formula is capped, not extrapolated');

/* volume -------------------------------------------------------------------- */
{
  const sets = [
    set({ exercise: 'Back squat', weight_kg: 60, reps: 5 }),
    set({ exercise: 'Back squat', weight_kg: 60, reps: 5 }),
    set({ exercise: 'Back squat', weight_kg: 80, reps: 3, done: false }),
  ];
  assert.equal(volumeOf(sets), 600, 'an unfinished set is not work');
  assert.equal(volumeOf([]), 0);
  assert.equal(volumeOf([set({ exercise: 'Plank', weight_kg: 0, reps: 60 })]), 0,
    'bodyweight moves no bar; the session still happened');
}

/* bests --------------------------------------------------------------------- */
{
  const sets = [
    set({ exercise: 'Bench press', weight_kg: 60, reps: 8 }),
    set({ exercise: 'Bench press', weight_kg: 80, reps: 1 }),
    set({ exercise: 'Bench press', weight_kg: 100, reps: 1, done: false }),
    set({ exercise: 'Deadlift', weight_kg: 100, reps: 5 }),
  ];
  const best = bestByExercise(sets);
  assert.equal(best['Bench press'], 80, 'the heaviest estimate wins');
  assert.equal(best['Deadlift'], 116.7);
  assert.ok(!('Squat' in best), 'nothing invented for an exercise never done');
}

/* which muscles ------------------------------------------------------------- */
{
  const g = groupsOfSets([
    set({ exercise: 'Run' }),
    set({ exercise: 'Back squat' }),
    set({ exercise: 'Bench press' }),
  ]);
  assert.deepEqual(g, ['chest', 'legs', 'cardio'], 'reported in the map order, not the logging order');
  assert.deepEqual(groupsOfSets([]), []);
}

/* last time ----------------------------------------------------------------- */
{
  const sets = [
    set({ exercise: 'Bench press', workout_id: 'old', weight_kg: 50, reps: 8 }),
    set({ exercise: 'Bench press', workout_id: 'mid', weight_kg: 55, reps: 8 }),
    set({ exercise: 'Bench press', workout_id: 'today', weight_kg: 60, reps: 8 }),
    set({ exercise: 'Deadlift', workout_id: 'old', weight_kg: 90, reps: 5 }),
  ];
  const order = ['today', 'mid', 'old'];

  assert.equal(lastTime(sets, order)['Bench press'].weight_kg, 60, 'newest session wins');
  assert.equal(lastTime(sets, order, 'today')['Bench press'].weight_kg, 55,
    'today is skipped, so the prefill is what you did last week');
  assert.equal(lastTime(sets, order, 'today')['Deadlift'].weight_kg, 90);
  assert.ok(!lastTime(sets, order, 'today')['Squat'], 'an exercise never done has no last time');
}

/* the next set -------------------------------------------------------------- */
assert.deepEqual(nextSet(undefined, 'weight'), { weight_kg: 20, reps: 8 });
assert.deepEqual(nextSet(undefined, 'bodyweight'), { weight_kg: 0, reps: 10 });
assert.deepEqual(
  nextSet(set({ exercise: 'Back squat', weight_kg: 82.5, reps: 5 }), 'weight'),
  { weight_kg: 82.5, reps: 5 },
  'the repeat is the offer; a change is a correction',
);

console.log('lift.check.ts — all good');
