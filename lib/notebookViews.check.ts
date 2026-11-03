import test from 'node:test';
import assert from 'node:assert/strict';
import { readJournalBook, writeJournalBook, combineJournals, bookDays, readJournal } from './journalPage.ts';
import { pagePreview, writeBoard, writeStudy } from './pageKinds.ts';
import { pageThumb } from './pageThumb.ts';
import { addTag, renameTag, removeTag, toggleTag, courseIs, findTag } from './tagList.ts';
import { clampPlacement, coverScale, frameCentreInImage, outputSize, turned } from './cropMath.ts';

const NL = String.fromCharCode(10);
const note = (body: string) => ({ body, created_at: '2026-09-10T09:00:00' });
const photo = (id: string) => ({ id, asset: { localId: id, name: id + '.webp' }, caption: '', tilt: 1 });

test('a single-day journal is written back byte for byte, with or without photos', () => {
  const plain = '# Journal · 2026-09-14' + NL + 'A quiet day.' + NL;
  assert.equal(writeJournalBook(readJournalBook(note(plain))), plain);
  const withPhoto = '# Journal · 2026-09-14' + NL + 'Rain.' + NL + '<!-- sorro-journal-photos:v1 -->' + JSON.stringify([photo('p1')]);
  const book = readJournalBook(note(withPhoto));
  assert.equal(book.entries['2026-09-14'].photos.length, 1);
  assert.equal(writeJournalBook(book), withPhoto);
});

test('writing another day keeps it in the same page and reads back unchanged', () => {
  const book = readJournalBook(note('# Journal · 2026-09-14' + NL + 'First.'));
  const next = { ...book, entries: { ...book.entries, '2026-09-16': { prose: 'Third.' + NL, photos: [photo('a')] }, '2026-09-15': { prose: 'Second.', photos: [] } } };
  const body = writeJournalBook(next);
  assert.ok(body.startsWith('# Journal · 2026-09-14' + NL + 'First.'));
  const again = readJournalBook(note(body));
  assert.deepEqual(bookDays(again), ['2026-09-14', '2026-09-15', '2026-09-16']);
  assert.equal(again.entries['2026-09-15'].prose, 'Second.');
  assert.equal(again.entries['2026-09-16'].prose, 'Third.' + NL);
  assert.equal(again.entries['2026-09-16'].photos[0].id, 'a');
  assert.equal(writeJournalBook(again), body);
  // The old reader still finds the first day's writing at the top of the page.
  assert.ok(readJournal(body).prose.startsWith('First.'));
});

test('an emptied day is dropped, and a damaged photo list never eats the writing', () => {
  const body = '# Journal · 2026-09-14' + NL + 'Keep.' + NL + '<!-- basedly-journal-day:2026-09-15 -->' + NL + 'Later.';
  const book = readJournalBook(note(body));
  const emptied = { ...book, entries: { ...book.entries, '2026-09-15': { prose: '   ', photos: [] } } };
  assert.equal(writeJournalBook(emptied), '# Journal · 2026-09-14' + NL + 'Keep.');
  const broken = body + NL + '<!-- basedly-journal-photos:v2 -->{oops';
  const read = readJournalBook(note(broken));
  assert.ok(read.entries['2026-09-15'].prose.includes('Later.'));
  assert.ok(read.entries['2026-09-15'].prose.includes('{oops'));
});

test('combining journals keeps both pages writing for a shared day', () => {
  const mine = readJournalBook(note('# Journal · 2026-09-14' + NL + 'Mine.'));
  const theirs = readJournalBook({ body: '# Journal · 2026-09-14' + NL + 'Theirs.' + NL + '<!-- basedly-journal-day:2026-09-12 -->' + NL + 'Older.', created_at: '2026-09-12T08:00:00' });
  const merged = combineJournals(mine, theirs);
  assert.equal(merged.entries['2026-09-14'].prose, 'Mine.' + NL + NL + 'Theirs.');
  assert.equal(merged.entries['2026-09-12'].prose, 'Older.');
});

test('journal previews show writing, never the photo list or day markers', () => {
  const body = '# Journal · 2026-09-13' + NL + 'Rain.' + NL + '<!-- basedly-journal-day:2026-09-14 -->' + NL + 'Pancit after class.' + NL + '<!-- basedly-journal-photos:v2 -->' + JSON.stringify({ '2026-09-14': [photo('p')] });
  assert.equal(pagePreview(body), 'Pancit after class.');
  const thumb = pageThumb(body);
  assert.equal(thumb.kind, 'journal');
  if (thumb.kind === 'journal') { assert.deepEqual(thumb.lines, ['Pancit after class.']); assert.equal(thumb.photos, 1); }
});

test('page thumbnails read every format into lines and shapes', () => {
  const md = pageThumb('# Plan' + NL + '- [x] Import' + NL + '- [ ] Draft' + NL + '> quote' + NL + 'Body **bold** text');
  assert.equal(md.kind, 'document');
  if (md.kind === 'document') assert.deepEqual(md.lines.map((l) => l.tone), ['title', 'done', 'todo', 'quote', 'body']);
  const html = pageThumb('<!-- basedly-doc:v1 -->' + NL + JSON.stringify({ version: 1, kind: 'document', tabs: [{ id: 't', title: 'T', html: '<p data-style="title">Report</p><h2>Method</h2><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><p>Done &amp; dusted</p></li></ul>' }] }));
  if (html.kind === 'document') assert.deepEqual(html.lines, [{ tone: 'title', text: 'Report' }, { tone: 'heading', text: 'Method' }, { tone: 'done', text: 'Done & dusted' }]);
  const board = pageThumb(writeBoard({ version: 1, kind: 'whiteboard', items: [{ id: 's', type: 'stroke', x: 10, y: 20, w: 100, h: 50, color: '#123', width: 4, points: [[0, 0, 0.5], [100, 50, 0.5]] }] }));
  assert.equal(board.kind, 'board');
  if (board.kind === 'board') { assert.ok(board.box && board.box.x < 10); assert.equal(board.shapes[0].type, 'stroke'); }
  const empty = pageThumb(writeBoard({ version: 1, kind: 'whiteboard', items: [] }));
  if (empty.kind === 'board') assert.equal(empty.box, null);
  const pdf = pageThumb(writeBoard({ version: 1, kind: 'pdf', items: [{ id: 'on', type: 'text', x: 700, y: 50, w: 100, h: 60, color: '#000', text: 'note' }, { id: 'off', type: 'text', x: 10, y: 50, w: 100, h: 60, color: '#000', text: 'margin' }], pdf: { asset: { localId: 'a', name: 'a.pdf' }, pages: [{ w: 760, h: 990, y: 0 }], margin: 620 } }));
  if (pdf.kind === 'pdf') { assert.equal(pdf.shapes.length, 1); assert.equal(pdf.box.x, 620); }
  const list = pageThumb(writeStudy({ version: 1, kind: 'checklist', items: [{ id: 'a', text: 'Read', done: true }] }));
  if (list.kind === 'checklist') assert.deepEqual(list.items, [{ text: 'Read', done: true }]);
});

test('tags ignore case and spacing, and removing one clears it everywhere', () => {
  let { tags } = addTag([], '  CS   191 ', 'a');
  assert.equal(tags[0].name, 'CS 191');
  const again = addTag(tags, 'cs 191', 'b');
  assert.equal(again.tags, tags);
  assert.equal(again.tag?.id, 'a');
  tags = addTag(tags, 'Thesis', 'c').tags;
  assert.notEqual(tags[0].color, tags[1].color);
  assert.equal(renameTag(tags, 'c', 'CS 191'), null);
  assert.equal(renameTag(tags, 'c', 'Thesis draft')?.[1].name, 'Thesis draft');
  let assigned = toggleTag({}, 'nb1', 'a');
  assigned = toggleTag(assigned, 'nb1', 'c');
  assigned = toggleTag(assigned, 'nb2', 'a');
  assert.deepEqual(toggleTag(assigned, 'nb2', 'a').nb2, undefined);
  const removed = removeTag(tags, assigned, 'a');
  assert.deepEqual(removed.assigned, { nb1: ['c'] });
  assert.equal(findTag(removed.tags, 'cs 191'), undefined);
  assert.ok(courseIs('cs  191', { id: 'a', name: 'CS 191', color: '' }));
  assert.ok(!courseIs(null, { id: 'a', name: 'CS 191', color: '' }));
});

test('the crop never leaves a gap and the output matches what the frame shows', () => {
  const image = { w: 1200, h: 800 }, frame = { w: 400, h: 400 };
  assert.equal(coverScale(image, frame, 0), 0.5);
  assert.deepEqual(turned(image, 1), { w: 800, h: 1200 });
  const far = clampPlacement({ x: 9999, y: -9999, zoom: 1, turn: 0 }, image, frame);
  assert.equal(far.x, 100);
  assert.equal(Math.abs(far.y), 0);
  const zoomed = clampPlacement({ x: 0, y: 0, zoom: 9, turn: 0 }, image, frame);
  assert.equal(zoomed.zoom, 4);
  // Dragged fully right, the frame shows the photo's left edge.
  const centre = frameCentreInImage(image, frame, far);
  assert.deepEqual([Math.round(centre.x), Math.round(centre.y)], [400, 400]);
  // A quarter turn swaps which way the photo can move.
  const turnedFar = clampPlacement({ x: 9999, y: 9999, zoom: 1, turn: 1 }, image, frame);
  assert.deepEqual([turnedFar.x, turnedFar.y], [0, 100]);
  assert.deepEqual(outputSize(image, frame, { x: 0, y: 0, zoom: 1, turn: 0 }), { w: 800, h: 800 });
  assert.deepEqual(outputSize({ w: 6000, h: 4000 }, frame, { x: 0, y: 0, zoom: 1, turn: 0 }), { w: 1600, h: 1600 });
});
