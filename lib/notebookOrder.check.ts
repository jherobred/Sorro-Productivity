import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { moveNotebook } from './notebookOrder.ts';

test('moving a notebook preserves every other notebook and works in both directions', () => {
  const ids = ['first', 'hidden', 'middle', 'last'];
  deepStrictEqual(moveNotebook(ids, 'first', 'last'), ['hidden', 'middle', 'last', 'first']);
  deepStrictEqual(moveNotebook(ids, 'last', 'first'), ['last', 'first', 'hidden', 'middle']);
  deepStrictEqual(ids, ['first', 'hidden', 'middle', 'last']);
});
test('stale and unchanged drag targets leave the order intact', () => {
  deepStrictEqual(moveNotebook(['a', 'b'], 'missing', 'b'), ['a', 'b']);
  deepStrictEqual(moveNotebook(['a', 'b'], 'a', 'missing'), ['a', 'b']);
  deepStrictEqual(moveNotebook(['a', 'b'], 'a', 'a'), ['a', 'b']);
});
