import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textHtml, writeText, readRecall, writeRecall, recallCards, nextReview, sorroType } from './noteTypes.ts';
import { DOC_MARKER } from './docFormat.ts';

test('a Page body round-trips its html', () => {
  assert.equal(textHtml(writeText('<p>Hi</p>')), '<p>Hi</p>');
});
test('plain markdown opens in Page as html, nothing saved', () => {
  assert.match(textHtml('# Title\n\nSome **bold** text') ?? '', /<h1>Title<\/h1>/);
});
test('an old Document stays a Document until converted', () => {
  assert.equal(textHtml(DOC_MARKER + JSON.stringify({ version: 1, kind: 'document', tabs: [{ id: 't', title: 'T', html: '<p>x</p>' }] })), null);
  assert.equal(sorroType(DOC_MARKER + '{}'), 'document');
});
test('every body maps to a Sorro type', () => {
  assert.equal(sorroType(''), 'page');
  assert.equal(sorroType('just words'), 'page');
  assert.equal(sorroType(writeText('<p>x</p>')), 'page');
  assert.equal(sorroType(writeRecall({ html: '<h2>Q</h2><p>A</p>', schedule: {} })), 'recall');
  assert.equal(sorroType('# Journal · 2026-11-03\n\nhi'), 'fieldbook');
});
test('a recall page keeps its schedule', () => {
  const r = readRecall(writeRecall({ html: '<h2>Q</h2>', schedule: { abc: { ease: 2.5, interval: 3, due: '2026-11-06' } } }));
  assert.equal(r?.schedule.abc.interval, 3);
});
test('headings become questions with the text under them as the answer', () => {
  const cards = recallCards('<p>intro</p><h2>What is a heap?</h2><p>A tree with the heap property.</p><h3>Big-O of push?</h3><p>O(log n)</p>');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].question, 'What is a heap?');
  assert.match(cards[0].answer, /heap property/);
  assert.equal(cards[1].question, 'Big-O of push?');
  assert.notEqual(cards[0].key, cards[1].key);
});
test('a good answer pushes the next review out, a miss brings it back tomorrow', () => {
  const first = nextReview(undefined, 3, '2026-11-03');
  assert.equal(first.due, '2026-11-04');
  const second = nextReview(first, 3, '2026-11-04');
  assert.ok(second.interval > first.interval);
  const missed = nextReview(second, 0, '2026-11-10');
  assert.equal(missed.interval, 1);
  assert.equal(missed.due, '2026-11-11');
  assert.ok(missed.ease < second.ease);
});
test('due dates step by calendar day across a month end', () => {
  assert.equal(nextReview({ ease: 2.5, interval: 6, due: '2026-11-28' }, 2, '2026-11-28').due.slice(0, 7), '2026-12');
});
test('a Page and a Recall preview as words, not markup', async () => {
  const { pagePreview } = await import('./pageKinds.ts');
  assert.equal(pagePreview(writeText('<h2>Heaps</h2><p>A &amp; B</p>')), 'Heaps A & B');
  assert.equal(pagePreview(writeRecall({ html: '<h2>Q?</h2><p>A</p>', schedule: {} })), 'Q? A');
});
test('Page only opens notes it can hold whole', async () => {
  const { pageCanHold } = await import('./noteTypes.ts');
  assert.equal(pageCanHold(writeText('<p>x</p>')), true);
  assert.equal(pageCanHold(writeRecall({ html: '', schedule: {} })), true);
  assert.equal(pageCanHold('# Notes\n\n- a\n- b'), true);
  assert.equal(pageCanHold('| a | b |\n|---|---|\n| 1 | 2 |'), false);
  assert.equal(pageCanHold('$$\nx^2\n$$'), false);
  assert.equal(pageCanHold('See ![sketch](https://x.test/a.png)'), false);
  // A structured format that failed to parse never opens blank in Page.
  assert.equal(pageCanHold('<!-- sorro-board:v1 -->\n{broken'), false);
});
test('Convert to Page is offered only when nothing would be lost', async () => {
  const { documentSafeForPage } = await import('./noteTypes.ts');
  assert.equal(documentSafeForPage({ tabs: [{ title: 'T', html: '<p>x</p>' }] }), true);
  assert.equal(documentSafeForPage({ tabs: [{ title: 'T', html: '<table><tr><td>1</td></tr></table>' }] }), false);
  assert.equal(documentSafeForPage({ tabs: [{ title: 'T', html: '<div data-type="math-block"></div>' }] }), false);
  assert.equal(documentSafeForPage({ tabs: [{ title: 'T', html: '<p>x</p>' }], comments: [{}] }), false);
});
