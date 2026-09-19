import test from 'node:test';
import assert from 'node:assert/strict';
import { isRepeat, nextDue, repeatLabel } from './taskRepeat.ts';

// 2026-09-14 is a Monday.
test('daily and every few days count on from the due date', () => {
  assert.equal(nextDue({ every: 'day' }, '2026-09-19', '2026-09-19'), '2026-09-20');
  assert.equal(nextDue({ every: 'day', interval: 3 }, '2026-09-19', '2026-09-19'), '2026-09-22');
  // Finished early: it still comes back a day after the date it was due.
  assert.equal(nextDue({ every: 'day' }, '2026-09-21', '2026-09-19'), '2026-09-22');
});

test('finishing late never makes another late task', () => {
  assert.equal(nextDue({ every: 'day' }, '2026-09-10', '2026-09-19'), '2026-09-20');
  assert.equal(nextDue({ every: 'week' }, '2026-09-07', '2026-09-19'), '2026-09-21');   // Monday stays Monday
});

test('weekdays skip the weekend', () => {
  assert.equal(nextDue({ every: 'weekday' }, '2026-09-18', '2026-09-18'), '2026-09-21'); // Friday to Monday
  assert.equal(nextDue({ every: 'weekday' }, '2026-09-15', '2026-09-15'), '2026-09-16');
});

test('weekly on named days walks through the week, then jumps the interval', () => {
  const rule = { every: 'week' as const, days: [1, 4] };                                  // Mon and Thu
  assert.equal(nextDue(rule, '2026-09-14', '2026-09-14'), '2026-09-17');
  assert.equal(nextDue(rule, '2026-09-17', '2026-09-17'), '2026-09-21');
  assert.equal(nextDue({ every: 'week', interval: 2, days: [1] }, '2026-09-14', '2026-09-14'), '2026-09-28');
});

test('monthly keeps its day, held to the end of short months', () => {
  assert.equal(nextDue({ every: 'month' }, '2026-01-31', '2026-01-31'), '2026-02-28');
  assert.equal(nextDue({ every: 'month' }, '2026-09-15', '2026-09-15'), '2026-10-15');
  assert.equal(nextDue({ every: 'year' }, '2028-02-29', '2028-02-29'), '2029-02-28');
});

test('a rule with an end stops coming back after it', () => {
  assert.equal(nextDue({ every: 'week', until: '2026-09-25' }, '2026-09-18', '2026-09-18'), '2026-09-25');
  assert.equal(nextDue({ every: 'week', until: '2026-09-24' }, '2026-09-18', '2026-09-18'), null);
});

test('a task with no date comes back counted from today', () => {
  assert.equal(nextDue({ every: 'day' }, null, '2026-09-19'), '2026-09-20');
});

test('labels read the way the picker offers them, and odd stored values are refused', () => {
  assert.equal(repeatLabel({ every: 'day' }), 'Every day');
  assert.equal(repeatLabel({ every: 'weekday' }), 'Weekdays');
  assert.equal(repeatLabel({ every: 'week' }, '2026-09-14'), 'Weekly on Mon');
  assert.equal(repeatLabel({ every: 'week', interval: 2, days: [4, 1] }), 'Every 2 weeks on Mon, Thu');
  assert.equal(repeatLabel({ every: 'month', until: '2026-12-31' }), 'Monthly, until 2026-12-31');
  assert.equal(isRepeat({ every: 'week', days: [1, 4] }), true);
  assert.equal(isRepeat({ every: 'hourly' }), false);
  assert.equal(isRepeat({ every: 'week', days: [9] }), false);
  assert.equal(isRepeat(null), false);
});
