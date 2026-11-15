import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childFolders, fileSize, folderCounts, folderPath, folderTree, freshFolderName, renameFile, vaultItems, vaultKind, type VaultFile } from './vaultLogic.ts';
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

const folders = [
  { id: 'a', name: 'School', parent_id: null },
  { id: 'b', name: 'CS 191', parent_id: 'a' },
  { id: 'c', name: 'Week 3', parent_id: 'b' },
  { id: 'd', name: 'Art', parent_id: null },
];
const placed = [link('p1', 'https://a.io', 'A', '2026-11-01', { folder: 'b' })];
const placedFiles = [{ ...file('g1', 'Map.png', 'img', '2026-11-02'), folder_id: 'c' }, file('g2', 'Top.pdf', 'doc', '2026-11-03')];

test('a folder shows only its own items; the top shows unfiled ones; no place shows all', () => {
  assert.deepEqual(vaultItems(placed, placedFiles, 'all', '', 'b').map(i => i.id), ['p1']);
  assert.deepEqual(vaultItems(placed, placedFiles, 'all', '', null).map(i => i.id), ['g2']);
  assert.equal(vaultItems(placed, placedFiles, 'all', '').length, 3);
});
test('sorting by name, oldest and size keeps the pinned on top', () => {
  assert.deepEqual(vaultItems(links, files, 'all', '', undefined, 'name').map(i => i.title), ['arxiv.org', 'Bundle.zip', 'Draft.pdf', 'Map.png', 'Wireframes']);
  assert.deepEqual(vaultItems(links, files, 'all', '', undefined, 'old').map(i => i.id), ['f3', 'l2', 'l1', 'f1', 'f2']);
  assert.deepEqual(vaultItems(links, files, 'all', '', undefined, 'size').map(i => i.id), ['f3', 'l2', 'f2', 'f1', 'l1']);
});
test('folders: children, the breadcrumb trail, the subtree and nested counts', () => {
  assert.deepEqual(childFolders(folders, null).map(f => f.name), ['Art', 'School']);
  assert.deepEqual(folderPath(folders, 'c').map(f => f.name), ['School', 'CS 191', 'Week 3']);
  assert.deepEqual(folderPath([{ id: 'x', name: 'X', parent_id: 'x' }], 'x').map(f => f.id), ['x']);
  assert.deepEqual([...folderTree(folders, 'a')].sort(), ['a', 'b', 'c']);
  const counts = folderCounts(folders, vaultItems(placed, placedFiles, 'all', ''));
  assert.deepEqual([counts.get('a'), counts.get('b'), counts.get('c'), counts.get('d')], [2, 2, 1, 0]);
});
test('new folder names do not collide, and a rename keeps the file type', () => {
  assert.equal(freshFolderName(folders, null, 'Art'), 'Art 2');
  assert.equal(freshFolderName(folders, 'a', 'Art'), 'Art');
  assert.equal(freshFolderName(folders, null, '  '), 'New folder');
  assert.equal(renameFile('Draft.pdf', 'Final'), 'Final.pdf');
  assert.equal(renameFile('Draft.pdf', 'Final.docx'), 'Final.docx');
  assert.equal(renameFile('Draft.pdf', '   '), 'Draft.pdf');
});
