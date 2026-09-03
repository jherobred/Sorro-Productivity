/**
 * Self-check for lib/md.ts — the one runnable thing that fails if the markdown
 * layer breaks. No framework: Node strips the types and runs it.
 *
 *   node lib/md.check.ts
 */

import assert from 'node:assert/strict';
import { parse, spans, wikiTargets, toggleTask, applyKind, wrap, newline, preview, taskCount, inlineMarkup } from './md.ts';

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

/* inlineMarkup -------------------------------------------------------------
 * The highlight/color toolbar writes raw `<span>`/`<mark>` HTML into the note
 * body (NoteEditor's applyTextColor/applyHighlight); the reader renders that
 * back as real React elements. This is the gate that decides what counts as
 * "markup" versus plain text carrying literal angle brackets — every payload
 * that must NOT survive as HTML is asserted here. */
{
  const span = inlineMarkup('<span style="color: var(--pal-coral, #FF6B6B)">hello</span>');
  assert.deepEqual(span, { tag: 'span', color: 'var(--pal-coral, #FF6B6B)', text: 'hello' });

  const mark = inlineMarkup('<mark style="background: rgba(255, 194, 75, 0.28); padding: 1px 4px; border-radius: 4px;">hi</mark>');
  assert.deepEqual(mark, { tag: 'mark', background: 'rgba(255, 194, 75, 0.28)', text: 'hi' });

  // A substring test used to gate dangerouslySetInnerHTML — any text merely
  // containing "<span" or "<mark" rendered its ENTIRE contents as raw HTML.
  // These must all fail to match, so the caller's fallback renders them as
  // inert text instead.
  assert.equal(inlineMarkup('<span></span><img src=x onerror="alert(1)">'), null, 'no color attribute: not the toolbar shape');
  assert.equal(inlineMarkup('<span style="color: red">x</span><img src=x onerror=alert(1)>'), null, 'trailing content after the closing tag');
  assert.equal(inlineMarkup('plain text mentioning <span> and <mark> in prose'), null, 'unclosed tags in ordinary text');
  assert.equal(inlineMarkup('<mark style="background: red" onmouseover="alert(1)">x</mark>'), null, 'extra attribute breaks the exact shape');

  // Whatever IS captured must come back as inert data, never re-parsed as HTML:
  // this confirms an attacker cannot smuggle a second tag through the captured
  // style value or inner text and have it come back out as markup.
  const injected = inlineMarkup('<span style="color: red;"><img src=x onerror=alert(1)></span>');
  assert.equal(injected?.tag, 'span');
  assert.equal(injected?.text, '<img src=x onerror=alert(1)>', 'captured verbatim as text, not re-parsed as HTML by the caller');
}

/* preview ----------------------------------------------------------------- */
assert.equal(preview('# Heading\n\nThe body line.'), 'Heading');
assert.equal(preview('\n\n- **bold** point'), 'bold point', 'markers are stripped');
assert.equal(preview(''), '');

console.log('md.ts ok');
