import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streak } from './taskStreak.ts';

const done = (due: string, at: string) => ({ done: true, due_on: due, completed_at: `${at}T10:00:00` });

test('each instance finished by its due date adds one', () => {
  assert.equal(streak([done('2026-11-01', '2026-11-01'), done('2026-11-02', '2026-11-02'), done('2026-11-03', '2026-11-02')]), 3);
});
test('a late finish ends the run', () => {
  assert.equal(streak([done('2026-11-01', '2026-11-01'), done('2026-11-02', '2026-11-04'), done('2026-11-03', '2026-11-03')]), 1);
});
test('an instance left undone ends the run', () => {
  assert.equal(streak([done('2026-11-01', '2026-11-01'), { done: false, due_on: '2026-11-02', completed_at: null }, done('2026-11-03', '2026-11-03')]), 1);
});
test('the open instance waiting for today does not break it', () => {
  assert.equal(streak([done('2026-11-01', '2026-11-01'), done('2026-11-02', '2026-11-02'), { done: false, due_on: '2026-11-04', completed_at: null }]), 2);
});
test('no history, no streak', () => {
  assert.equal(streak([]), 0);
});
