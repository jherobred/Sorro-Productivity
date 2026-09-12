import test from 'node:test';
import assert from 'node:assert/strict';
import { DOC_MARKER, DEFAULT_PAGE, readDoc, writeDoc, openDoc, markdownToHtml, htmlText, docText, pagePixels, type DocRecord } from './docFormat.ts';
import { pageKind, pagePreview } from './pageKinds.ts';

const NL = String.fromCharCode(10);
const lines = (...rows: string[]) => rows.join(NL);

test('a document record reads back exactly as it was written', () => {
  const doc: DocRecord = {
    version: 1, kind: 'document',
    tabs: [{ id: 't1', title: 'Tab 1', html: '<p>Hello <strong>there</strong></p>' }, { id: 't2', title: 'Sources', html: '<p></p>' }],
    page: { ...DEFAULT_PAGE, orientation: 'landscape', margins: { top: 0.5, right: 1, bottom: 0.5, left: 1 } },
    comments: [{ id: 'c1', text: 'Cite this', quote: 'there', created: '2026-09-13T10:00:00.000Z', replies: [{ id: 'r1', text: 'Done', created: '2026-09-13T11:00:00.000Z' }] }],
    source: { format: 'markdown', text: 'Hello **there**' },
  };
  assert.deepEqual(readDoc(writeDoc(doc)), doc);
  assert.equal(pageKind(writeDoc(doc)), 'document');
});

test('a damaged record is reported, never replaced with an empty document', () => {
  const ok = { version: 1, kind: 'document', tabs: [{ id: 'a', title: 'Tab 1', html: '<p>x</p>' }] };
  assert.equal(readDoc(DOC_MARKER + '{broken'), null);
  assert.equal(readDoc(DOC_MARKER + JSON.stringify({ ...ok, tabs: [] })), null);
  assert.equal(readDoc(DOC_MARKER + JSON.stringify({ ...ok, tabs: [ok.tabs[0], ok.tabs[0]] })), null);
  assert.equal(readDoc(DOC_MARKER + JSON.stringify({ ...ok, page: { ...DEFAULT_PAGE, size: 'napkin' } })), null);
  assert.equal(readDoc(DOC_MARKER + JSON.stringify({ ...ok, comments: [{ id: 'c' }] })), null);
  assert.equal(openDoc(DOC_MARKER + '{broken').state, 'unreadable');
  assert.equal(readDoc('Plain markdown'), null);
});

test('a Markdown page opens converted, and keeps its original text for the record', () => {
  const opened = openDoc('# Plan' + NL + 'Do the thing');
  assert.equal(opened.state, 'converted');
  if (opened.state !== 'converted') return;
  assert.equal(opened.doc.source?.text, '# Plan' + NL + 'Do the thing');
  assert.equal(opened.doc.tabs[0].html, '<h1>Plan</h1><p>Do the thing</p>');
  const empty = openDoc('');
  assert.equal(empty.state === 'converted' && empty.doc.source, undefined);
});

test('every Markdown line kind has somewhere to go', () => {
  const html = markdownToHtml(lines(
    '## Week', '- one', '- two', '1. first', '2. second', '- [x] done', '- [ ] open',
    '> quoted', '|| heads up', '---', '```', 'if (a < b) {}', '```', '$$', 'x^2 < 1', '$$',
    '| Name | Score |', '| --- | --- |', '| Ana | 9 |',
  ));
  assert.match(html, /<h2>Week<\/h2>/);
  assert.match(html, /<ul><li><p>one<\/p><\/li><li><p>two<\/p><\/li><\/ul>/);
  assert.match(html, /<ol><li><p>first<\/p><\/li><li><p>second<\/p><\/li><\/ol>/);
  assert.match(html, /<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done<\/p><\/li><li data-type="taskItem" data-checked="false"><p>open<\/p><\/li><\/ul>/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote><blockquote><p>heads up<\/p><\/blockquote><hr>/);
  assert.match(html, /<pre><code>if \(a &lt; b\) \{\}<\/code><\/pre>/);
  assert.match(html, /<div data-type="math-block" data-latex="x\^2 &lt; 1"><\/div>/);
  assert.match(html, /<table><tbody><tr><th><p>Name<\/p><\/th><th><p>Score<\/p><\/th><\/tr><tr><td><p>Ana<\/p><\/td><td><p>9<\/p><\/td><\/tr><\/tbody><\/table>/);
});

test('conversion escapes text and drops unsafe addresses', () => {
  const html = markdownToHtml(lines(
    'A <script>alert(1)</script> & **bold** *it* `x` $y$ and [[Other note]]',
    '![bad](javascript:alert(1))',
    '![photo](https://images.unsplash.com/a.jpg)',
    '![image](me/0f6f3c2e-8f3a-4c8e-9f21-1a2b3c4d5e6f-board.png)',
    '<span style="color: #FF6B6B">warm</span>',
  ));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /A &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; <strong>bold<\/strong> <em>it<\/em> <code>x<\/code> <span data-type="math-inline" data-latex="y"><\/span> and \[\[Other note\]\]/);
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /<img src="https:\/\/images\.unsplash\.com\/a\.jpg" alt="photo">/);
  assert.match(html, /<img data-path="me\/0f6f3c2e-8f3a-4c8e-9f21-1a2b3c4d5e6f-board\.png"/);
  assert.match(html, /<span style="color: #FF6B6B">warm<\/span>/);
});

test('previews and link text come from what was written, not the markup', () => {
  assert.equal(htmlText('<h1>Plan</h1><p>Tom &amp; Jerry&#39;s <em>notes</em></p><ul><li><p>one</p></li></ul>'), 'Plan' + NL + 'Tom & Jerry' + "'" + 's notes' + NL + 'one');
  const doc: DocRecord = { version: 1, kind: 'document', tabs: [{ id: 'a', title: 'Tab 1', html: '<p>See [[Chemistry]]</p>' }], source: { format: 'markdown', text: 'Old [[Physics]] link' } };
  assert.equal(docText(doc), 'See [[Chemistry]]');
  assert.equal(pagePreview(writeDoc(doc)), 'See Chemistry');
});

test('page sizes follow orientation and margins are in inches', () => {
  assert.deepEqual(pagePixels(DEFAULT_PAGE), { width: 816, height: 1056, top: 96, right: 96, bottom: 96, left: 96 });
  const wide = pagePixels({ ...DEFAULT_PAGE, orientation: 'landscape', margins: { top: 0.5, right: 0.5, bottom: 0.5, left: 0.5 } });
  assert.equal(wide.width, 1056);
  assert.equal(wide.height, 816);
  assert.equal(wide.left, 48);
});
