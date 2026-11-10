import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLoad } from './dayLoad.ts';

test('a quiet month counts items one for one', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(n => dayLoad(n, 3)), [0, 1, 2, 3, 4]);
});
test('a packed month is scaled to its busiest day, and one item still shows', () => {
  assert.deepEqual([0, 1, 3, 6, 9, 12].map(n => dayLoad(n, 12)), [0, 1, 1, 2, 3, 4]);
});
