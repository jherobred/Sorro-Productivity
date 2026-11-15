import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeLink, encodeLink, findUrl, safeUrl, siteOf, LINK_PREFIX } from './linkText.ts';

test('only web addresses are kept, and a bare domain gets https', () => {
  assert.equal(safeUrl('ust.edu.ph'), 'https://ust.edu.ph/');
  assert.equal(safeUrl('https://docs.google.com/document/d/abc/edit'), 'https://docs.google.com/document/d/abc/edit');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,<b>x</b>'), null);
  assert.equal(safeUrl('not a link'), null);
  assert.equal(safeUrl('hello'), null);
  assert.equal(safeUrl(''), null);
});

test('a link is found inside a pasted line or a dropped list', () => {
  assert.equal(findUrl('Slides for Thursday: https://canva.com/design/xyz, thanks'), 'https://canva.com/design/xyz');
  assert.equal(findUrl('# comment\nhttps://ust.instructure.com/courses/1'), 'https://ust.instructure.com/courses/1');
  assert.equal(findUrl('no links here'), null);
});

test('a stored link survives the round trip, and other scratch rows are ignored', () => {
  const text = encodeLink({ url: 'https://gci.world/2026', label: 'GCI World 2026', note: 'Portal login', category: 'Programs', folder: 'fd1' });
  assert.ok(text.startsWith(LINK_PREFIX));
  const row = { id: 'a', text, pinned: true, position: -3, created_at: '2026-09-15T00:00:00Z' };
  assert.deepEqual(decodeLink(row), { id: 'a', url: 'https://gci.world/2026', label: 'GCI World 2026', note: 'Portal login', category: 'Programs', folder: 'fd1', pinned: true, position: -3, created_at: '2026-09-15T00:00:00Z' });
  assert.equal(decodeLink({ ...row, text: encodeLink({ url: 'https://a.io', label: '', note: '', category: '' }) })?.folder, '', 'a link saved before folders sits at the top');
  assert.equal(decodeLink({ ...row, text: 'Buy eggs' }), null);
  assert.equal(decodeLink({ ...row, text: `${LINK_PREFIX}{"u":"javascript:alert(1)"}` }), null);
  assert.equal(decodeLink({ ...row, text: `${LINK_PREFIX}{broken` }), null);
});

test('a site reads as host and path', () => {
  assert.deepEqual(siteOf('https://www.youtube.com/watch?v=1'), { host: 'youtube.com', path: '/watch' });
  assert.deepEqual(siteOf('https://ust.edu.ph/'), { host: 'ust.edu.ph', path: '' });
});
test('a malformed stored link gives a host, never a throw (News reads every stored link)', () => {
  assert.doesNotThrow(() => siteOf('https://'));
  assert.equal(typeof siteOf('https://').host, 'string');
});
