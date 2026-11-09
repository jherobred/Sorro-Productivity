import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveTo } from './widgetOrder.ts';

test('a widget dropped on another takes its place, forwards and backwards', () => {
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveTo(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
});
test('dropping on itself or on something not on the board changes nothing', () => {
  const items = ['a', 'b'];
  assert.equal(moveTo(items, 'a', 'a'), items);
  assert.equal(moveTo(items, 'a', 'z'), items);
});
