import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble, NEWS_KINDS, parseItems } from './assemble.ts';

test('a full set joins in order', () => {
  assert.equal(assemble([{ part: 2, of: 2, text: 'world' }, { part: 1, of: 2, text: 'hello ' }]), 'hello world');
});
test('a missing part waits', () => {
  assert.equal(assemble([{ part: 1, of: 3, text: 'a' }, { part: 3, of: 3, text: 'c' }]), null);
});
test('parts that disagree on the total wait', () => {
  assert.equal(assemble([{ part: 1, of: 2, text: 'a' }, { part: 2, of: 3, text: 'b' }]), null);
});
test('a repeated part counts once, the last copy wins', () => {
  assert.equal(assemble([{ part: 1, of: 2, text: 'old' }, { part: 2, of: 2, text: 'b' }, { part: 1, of: 2, text: 'a' }]), 'ab');
});
test('the nine news kinds are known', () => {
  assert.equal(NEWS_KINDS.length, 9);
  assert.ok(NEWS_KINDS.includes('ai-digest') && NEWS_KINDS.includes('ph-brief'));
});
test('items are read from pipe lines and the first plain line is the title', () => {
  const r = parseItems('AI digest, 3 Nov\n- Model X ships | Faster and cheaper | https://x.ai/news\nNo link here | just text\n');
  assert.equal(r.title, 'AI digest, 3 Nov');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].link, 'https://x.ai/news');
  assert.equal(r.items[1].link, '');
});
test('a five-field line carries why it matters and an image, and old three-field lines still read', () => {
  const r = parseItems('The Coffee News\nModel X ships | Faster (it answers in half the time) | Cheaper AI for apps like Sorro | https://img.x.ai/a.jpg | https://x.ai/news\nOld | three fields | https://old.example/a\n');
  assert.deepEqual(r.items[0], { headline: 'Model X ships', summary: 'Faster (it answers in half the time)', why: 'Cheaper AI for apps like Sorro', image: 'https://img.x.ai/a.jpg', link: 'https://x.ai/news' });
  assert.deepEqual(r.items[1], { headline: 'Old', summary: 'three fields', why: '', image: '', link: 'https://old.example/a' });
});
test('a non-link in the image or link slot is dropped, not trusted', () => {
  const r = parseItems('T\nA | b | c | javascript:alert(1) | not a url\n');
  assert.equal(r.items[0].image, '');
  assert.equal(r.items[0].link, '');
});
