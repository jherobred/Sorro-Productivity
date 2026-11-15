import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textHtml, writeText, readRecall, writeRecall, recallCards, nextReview, sorroType, newBody, SORRO_TYPES, readReminders, writeReminders, remindersIn, readArtifact, writeArtifact, type Reminder } from './noteTypes.ts';
import { readBoard, writeBoard } from './pageKinds.ts';
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
  assert.equal(sorroType(''), 'note');
  assert.equal(sorroType('just words'), 'note');
  assert.equal(sorroType(writeText('<p>x</p>')), 'note');
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
test('the New page menu offers Note, Board, Reminders, Markup and Artifact, in that order', () => {
  assert.deepEqual(SORRO_TYPES.map(t => t.type), ['note', 'board', 'reminders', 'markup', 'artifact']);
  for (const t of SORRO_TYPES) assert.equal(sorroType(newBody(t.type)), t.type);
});
test('types no longer offered still open as what they are', () => {
  assert.equal(sorroType(writeBoard({ version: 1, kind: 'whiteboard', items: [], map: true })), 'map');
  assert.equal(sorroType('<!-- sorro-page:v1 -->\n' + JSON.stringify({ version: 1, kind: 'cornell', cues: '', notes: '', summary: '' })), 'cornell');
  assert.equal(sorroType('<!-- sorro-page:v1 -->\n' + JSON.stringify({ version: 1, kind: 'freepage', boxes: [] })), 'freepage');
  assert.equal(sorroType('<!-- sorro-page:v1 -->\n' + JSON.stringify({ version: 1, kind: 'code', language: 'java', code: '' })), 'code');
});
test('reminders keep their dates, flags and subtasks in the note body', () => {
  const items: Reminder[] = [
    { id: 'a', title: 'Problem 3', note: 'Chain rule', due: '2026-11-16', flag: true, done: false },
    { id: 'b', title: 'Show the derivative', note: '', flag: false, done: false, parent: 'a' },
    { id: 'c', title: 'Read chapter 6', note: '', due: '2026-11-20', flag: false, done: false },
    { id: 'd', title: 'Set up the repo', note: '', flag: false, done: true },
  ];
  const doc = readReminders(writeReminders({ version: 1, items }));
  assert.equal(doc?.items.length, 4);
  assert.equal(readReminders(writeReminders({ version: 1, items: [{ ...items[0], due: 'soon' }] })), null);
  const ids = (l: Parameters<typeof remindersIn>[1]) => remindersIn(items, l, '2026-11-16').map(r => r.id);
  assert.deepEqual(ids('Today'), ['a', 'b']);
  assert.deepEqual(ids('Scheduled'), ['a', 'b', 'c']);
  assert.deepEqual(ids('All'), ['a', 'b', 'c']);
  assert.deepEqual(ids('Flagged'), ['a', 'b']);
  assert.deepEqual(ids('Completed'), ['d']);
});
test('an artifact keeps its html and name', () => {
  assert.equal(readArtifact(writeArtifact({ version: 1, name: 'card', html: '<p>x</p>' }))?.html, '<p>x</p>');
  assert.equal(readArtifact('<!-- sorro-artifact:v1 -->\n{broken'), null);
});
test('a board keeps shapes, arrows and frames, and a markup page its html', () => {
  const board = readBoard(writeBoard({ version: 1, kind: 'pdf', html: { name: 'card', html: '<p>x</p>', w: 800, h: 1000 }, items: [
    { id: 'r', type: 'shape', shape: 'rect', x: 0, y: 0, w: 10, h: 10, color: '#000' },
    { id: 'f', type: 'shape', shape: 'frame', x: 0, y: 0, w: 10, h: 10, color: '#000', text: 'Loss' },
    { id: 'a', type: 'shape', shape: 'arrow', x: 0, y: 0, w: 10, h: 10, color: '#000', points: [[0, 10], [10, 0]] },
  ] }));
  assert.equal(board?.items.length, 3);
  assert.equal(board?.html?.name, 'card');
  assert.equal(readBoard(writeBoard({ version: 1, kind: 'whiteboard', items: [{ id: 'x', type: 'shape', shape: 'star' as never, x: 0, y: 0, w: 1, h: 1, color: '#000' }] })), null);
});
