import test from 'node:test';
import assert from 'node:assert/strict';
import { columnOf, ordered, drop, overLimit, cardCode, type BoardMap } from './board.ts';

test('done wins, a missing or stale spot is Todo', () => {
  const map: BoardMap = { a: { s: 'review' }, b: { s: 'done' } };
  assert.equal(columnOf({ id: 'a', done: false }, map), 'review');
  assert.equal(columnOf({ id: 'a', done: true }, map), 'done');
  assert.equal(columnOf({ id: 'b', done: false }, map), 'todo');
  assert.equal(columnOf({ id: 'c', done: false }, map), 'todo');
});

test('placed cards keep their dropped order ahead of the rest', () => {
  const map: BoardMap = { c: { o: 0 }, a: { o: 1 } };
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(ordered(rows, map, (x, y) => y.id.localeCompare(x.id)).map((r) => r.id), ['c', 'a', 'd', 'b']);
});

test('a drop renumbers the target column and sets the column, except for Done', () => {
  const map: BoardMap = { x: { s: 'doing', o: 4 } };
  assert.deepEqual(drop(map, ['p', 'q'], 'x', 'review', 1), { p: { o: 0 }, x: { s: 'review', o: 1 }, q: { o: 2 } });
  assert.deepEqual(drop(map, ['p'], 'x', 'done', 0), { x: { s: 'doing', o: 0 }, p: { o: 1 } });
  // Moving within a column does not count the card twice, and an index past the end appends.
  assert.deepEqual(Object.keys(drop({}, ['p', 'x', 'q'], 'x', 'todo', 9)), ['p', 'q', 'x']);
});

test('limits and codes', () => {
  assert.equal(overLimit(4, 3), true);
  assert.equal(overLimit(3, 3), false);
  assert.equal(overLimit(9, undefined), false);
  assert.equal(cardCode('3f9a00ff-0000', 'School'), cardCode('3f9a00ff-0000', 'School'));
  assert.match(cardCode('3f9a00ff-0000', 'School'), /^SCH-\d{3}$/);
  assert.match(cardCode('t1', null), /^TSK-\d{3}$/);
});
