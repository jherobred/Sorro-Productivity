import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileSize, vaultItems, vaultKind, type VaultFile } from './vaultLogic.ts';
import type { LinkItem } from './linkText.ts';

const link = (id: string, url: string, label: string, at: string, more: Partial<LinkItem> = {}): LinkItem => ({ id, url, label, note: '', category: '', pinned: false, position: 0, created_at: at, ...more });
const file = (id: string, name: string, kind: string, at: string, starred = false): VaultFile => ({ id, name, kind, size_bytes: 2048, storage_path: 'me/' + id, starred, created_at: at });

const links = [link('l1', 'https://www.figma.com/file/x', 'Wireframes', '2026-11-01'), link('l2', 'https://arxiv.org/abs/1', '', '2026-11-03', { pinned: true, note: 'small models' })];
const files = [file('f1', 'Map.png', 'img', '2026-11-02'), file('f2', 'Draft.pdf', 'doc', '2026-11-04'), file('f3', 'Bundle.zip', 'zip', '2026-10-01', true)];

test('pinned and starred come first, then newest, links and files together', () => {
  assert.deepEqual(vaultItems(links, files, 'all', '').map(i => i.id), ['l2', 'f3', 'f2', 'f1', 'l1']);
});
test('each filter keeps only its kind', () => {
  assert.deepEqual(vaultItems(links, files, 'links', '').map(i => i.id), ['l2', 'l1']);
  assert.deepEqual(vaultItems(links, files, 'images', '').map(i => i.id), ['f1']);
  assert.deepEqual(vaultItems(links, files, 'docs', '').map(i => i.id), ['f2']);
  assert.deepEqual(vaultItems(links, files, 'other', '').map(i => i.id), ['f3']);
});
test('search reads the name, the site and the note; a link with no label is named by its site', () => {
  assert.deepEqual(vaultItems(links, files, 'all', 'FIGMA').map(i => i.id), ['l1']);
  assert.deepEqual(vaultItems(links, files, 'all', 'small models').map(i => i.id), ['l2']);
  assert.equal(vaultItems(links, files, 'all', 'arxiv')[0].title, 'arxiv.org');
});
test('kinds fit the table’s allowed values, and sizes read plainly', () => {
  assert.deepEqual(['image/png', 'video/mp4', 'application/pdf', 'application/zip'].map(vaultKind), ['img', 'vid', 'doc', 'other']);
  assert.deepEqual([512, 2048, 5_100_000].map(fileSize), ['512 B', '2 KB', '4.9 MB']);
});
