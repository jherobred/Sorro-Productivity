/**
 * Self-check for lib/java.ts — the interpreter already carries its own ~25
 * assertions in `demo()`; this is the file that makes `npm test` run them.
 *
 *   node lib/java.check.ts
 */

import assert from 'node:assert/strict';
import { demo, run } from './java.ts';

/* every assertion inside demo() throws on the first mismatch ---------------- */
assert.equal(demo(), 'java: all checks passed');

/* the trace itself, which is what the visualiser reads --------------------- */
{
  const r = run(`public class Main {
    public static void main(String[] args) {
      int[] a = { 3, 1, 2 };
      for (int i = 0; i < a.length; i++) System.out.println(a[i]);
    }
  }`);
  assert.equal(r.error, null);
  assert.deepEqual(r.out, ['3', '1', '2']);
  assert.ok(r.trace.length > 5, 'a loop records more than a handful of steps');

  const printed = r.trace.filter((s) => s.note.startsWith('print:'));
  assert.equal(printed.length, 3, 'one recorded step per printed line');
  assert.deepEqual(printed.map((s) => s.out), [1, 2, 3], 'out counts the lines printed so far');

  const mid = printed[1];
  assert.deepEqual(
    mid.heap.find((h) => h.name === 'a')?.cells,
    ['3', '1', '2'],
    'the heap snapshot carries the real array contents'
  );
  assert.equal(
    mid.frames[mid.frames.length - 1].locals.find((l) => l.name === 'i')?.text,
    '1',
    'and the frame carries the real loop counter'
  );
}

console.log('java.ts ok');
