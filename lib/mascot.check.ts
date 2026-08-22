/**
 * Self-check for lib/mascot.ts.
 *
 *   node lib/mascot.check.ts
 *
 * The assertions worth reading are the ones about last place. They are the
 * design, written down where it can fail a run rather than only in a comment.
 */

import assert from 'node:assert/strict';
import { ANIMALS, animalOf, moodOf, daysSince, streakOf, nudge } from './mascot.ts';

const TODAY = '2026-08-23';

/* the creature -------------------------------------------------------------- */
assert.ok(ANIMALS.includes(animalOf('anything at all')));
assert.equal(animalOf('abc'), animalOf('abc'), 'the same person is the same animal every time');
assert.equal(animalOf(''), ANIMALS[0], 'an empty id still gets a face');
{
  const spread = new Set(Array.from({ length: 200 }, (_, i) => animalOf(`user-${i}-uuid`)));
  assert.equal(spread.size, ANIMALS.length, 'all eight get used across a crowd');
}

/* how long since ------------------------------------------------------------ */
assert.equal(daysSince({}, TODAY), null, 'never started is not the same as long ago');
assert.equal(daysSince({ '2026-08-23': 2 }, TODAY), 0);
assert.equal(daysSince({ '2026-08-22': 1, '2026-08-23': 0 }, TODAY), 1, 'a zero day is not a day you did it');
assert.equal(daysSince({ '2026-08-01': 5, '2026-08-19': 1 }, TODAY), 4, 'the most recent one wins');

/* mood ---------------------------------------------------------------------- */
assert.equal(moodOf({ daysSince: 0, leading: true }), 'blazing');
assert.equal(moodOf({ daysSince: 0, leading: false }), 'keen');
assert.equal(moodOf({ daysSince: 2, leading: false }), 'keen');
assert.equal(moodOf({ daysSince: 3, leading: false }), 'resting');
assert.equal(moodOf({ daysSince: null, leading: false }), 'waiting');

// The rule, as a test: position never makes the face worse, in either direction.
for (const since of [0, 1, 2, 3, 10]) {
  const behind = moodOf({ daysSince: since, leading: false });
  const ahead = moodOf({ daysSince: since, leading: true });
  assert.ok(behind !== 'resting' || ahead === 'resting',
    'the leader who has stopped gets the same sleepy face as anyone else who has');
  if (since > 0) {
    assert.equal(behind, ahead, 'past today, standing changes nothing at all');
  }
}
assert.equal(moodOf({ daysSince: 0, leading: false }), 'keen',
  'last place who turned up this morning looks like someone who turned up this morning');

/* streaks ------------------------------------------------------------------- */
assert.equal(streakOf({}, TODAY), 0);
assert.equal(streakOf({ '2026-08-23': 1 }, TODAY), 1);
assert.equal(streakOf({ '2026-08-21': 1, '2026-08-22': 1, '2026-08-23': 1 }, TODAY), 3);
assert.equal(streakOf({ '2026-08-21': 1, '2026-08-23': 1 }, TODAY), 1, 'a gap ends it');
assert.equal(streakOf({ '2026-08-22': 1, '2026-08-21': 1 }, TODAY), 0,
  'a streak that stopped yesterday is not a streak today');

/* what it says -------------------------------------------------------------- */
{
  const said = (o: Parameters<typeof nudge>[0]) => nudge(o);

  assert.match(said({ mood: 'blazing', streak: 4, leading: true, leader: 'You', daysLeft: 5 }), /4 days/);
  assert.match(said({ mood: 'waiting', streak: 0, leading: false, leader: 'Mika', daysLeft: 9 }), /Mika/);
  assert.match(said({ mood: 'waiting', streak: 0, leading: false, leader: null, daysLeft: 9 }), /Nobody has started/);
  assert.match(said({ mood: 'resting', streak: 0, leading: false, leader: 'Mika', daysLeft: 1 }), /still counts/);
  assert.match(said({ mood: 'keen', streak: 0, leading: false, leader: 'Mika', daysLeft: 3 }), /today/);
  assert.match(said({ mood: 'resting', streak: 0, leading: false, leader: 'Mika', daysLeft: 0 }), /finishing it/);

  // Nothing the screen says to you is about the gap.
  for (const mood of ['blazing', 'keen', 'waiting', 'resting'] as const) {
    for (const daysLeft of [0, 1, 4, 30]) {
      const line = said({ mood, streak: 2, leading: false, leader: 'Mika', daysLeft });
      assert.doesNotMatch(line, /behind|last|losing|beat you/i, `"${line}" keeps off the gap`);
    }
  }
}

console.log('mascot.check.ts — all good');
