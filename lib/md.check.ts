/**
 * Self-check for lib/md.ts — the one runnable thing that fails if the markdown
 * layer breaks. No framework: Node strips the types and runs it.
 *
 *   node lib/md.check.ts
 */

import assert from 'node:assert/strict';
import { parse, spans, wikiTargets, toggleTask, applyKind, wrap, newline, preview, taskCount } from './md.ts';

/* parse ------------------------------------------------------------------- */
{
  const doc = ['# Title', '', 'Plain line', '- one', '- two', '1. first', '2. second',
    '- [ ] open', '- [x] shut', '> quoted', '|| callout', '---', '```', 'code();', '```'].join('\n');
  const ls = parse(doc);
  assert.equal(ls[0].kind, 'h1');
  assert.equal(ls[0].text, 'Title');
  assert.equal(ls[1].kind, 'blank');
  assert.equal(ls[2].kind, 'p');
  assert.equal(ls[3].kind, 'bullet');
  assert.equal(ls[5].n, 1);
  assert.equal(ls[6].n, 2, 'numbered runs count up');
  assert.equal(ls[7].kind, 'todo');
  assert.equal(ls[7].done, false);
  assert.equal(ls[8].done, true);
  assert.equal(ls[9].kind, 'quote');
  assert.equal(ls[10].kind, 'callout');
  assert.equal(ls[11].kind, 'divider');
  assert.equal(ls[12].kind, 'code');
  assert.equal(ls[12].text, 'code();', 'a fence collapses to one line');
  assert.equal(ls[12].i, 12, 'and keeps the source index of its opening fence');
}

/* the `###` before `#` ordering ------------------------------------------- */
assert.equal(parse('### deep')[0].kind, 'h3');
assert.equal(parse('### deep')[0].text, 'deep');

/* inline ------------------------------------------------------------------ */
{
  const s = spans('a **bold** and *it* and `x` and [[Note]]');
  assert.deepEqual(s.map((x) => x.s), ['text', 'bold', 'text', 'italic', 'text', 'code', 'text', 'link']);
  assert.equal(s[7].text, 'Note');
  assert.deepEqual(wikiTargets('[[A]] then [[B]] then [[A]]'), ['A', 'B'], 'de-duplicated');
}

/* toggleTask -------------------------------------------------------------- */
{
  const doc = '- [ ] one\n- [x] two';
  assert.equal(toggleTask(doc, 0), '- [x] one\n- [x] two');
  assert.equal(toggleTask(doc, 1), '- [ ] one\n- [ ] two');
  assert.equal(toggleTask(doc, 9), doc, 'a line that is not there changes nothing');
  assert.deepEqual(taskCount(doc), { done: 1, total: 2 });
}

/* applyKind --------------------------------------------------------------- */
{
  const doc = 'one\ntwo';
  const on = applyKind(doc, 0, doc.length, 'bullet');
  assert.equal(on.body, '- one\n- two');
  const off = applyKind(on.body, 0, on.body.length, 'bullet');
  assert.equal(off.body, 'one\ntwo', 'pressing it twice takes it off');
  assert.equal(applyKind('- one', 0, 5, 'h2').body, '## one', 'one marker replaces another');
}

/* wrap -------------------------------------------------------------------- */
{
  assert.equal(wrap('hello', 0, 5, '**').body, '**hello**');
  const w = wrap('hello', 0, 5, '**');
  assert.equal(wrap(w.body, w.from, w.to, '**').body, 'hello', 'unwraps what it wrapped');
  assert.equal(wrap('', 0, 0, '*').body, '*text*', 'empty selection gets a placeholder');
}

/* newline ----------------------------------------------------------------- */
{
  const a = newline('- one', 5);
  assert.equal(a.body, '- one\n- ');
  assert.equal(a.caret, 8);

  const b = newline('1. one', 6);
  assert.equal(b.body, '1. one\n2. ', 'numbered lists count on');

  const c = newline('- [x] done', 10);
  assert.equal(c.body, '- [x] done\n- [ ] ', 'the new item starts unticked');

  const d = newline('- ', 2);
  assert.equal(d.body, '', 'an empty item ends the list');
  assert.equal(d.caret, 0);

  const e = newline('plain', 5);
  assert.equal(e.body, 'plain\n');
}

/* preview ----------------------------------------------------------------- */
assert.equal(preview('# Heading\n\nThe body line.'), 'Heading');
assert.equal(preview('\n\n- **bold** point'), 'bold point', 'markers are stripped');
assert.equal(preview(''), '');

console.log('md.ts ok');
