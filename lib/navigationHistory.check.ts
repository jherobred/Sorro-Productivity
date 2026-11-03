import assert from 'node:assert/strict';
import test from 'node:test';
import { createOverlayHistory, type NavigationState } from './navigationHistory.ts';

function browser() {
  const entries = [{ url: 'https://sorro.test/', state: { __NA: true, tree: 'home' } as NavigationState }];
  let index = 0;
  const microtasks: (() => void)[] = [];
  const traversals: (() => void)[] = [];
  const read = () => entries[index];
  const write = (kind: 'push' | 'replace', state: NavigationState, url?: string | URL | null) => {
    const entry = { url: url == null ? read().url : new URL(String(url), read().url).href, state };
    if (kind === 'push') { entries.splice(index + 1); entries.push(entry); index++; }
    else entries[index] = entry;
  };
  const nav = createOverlayHistory({
    read,
    push: (state, _title, url) => write('push', state, url),
    replace: (state, _title, url) => write('replace', state, url),
    back: () => { traversals.push(() => { if (index > 0) { index--; nav.pop(); } }); },
    defer: (run) => microtasks.push(run),
  }, 'test');
  const flushMicrotasks = () => { while (microtasks.length) microtasks.shift()!(); };
  const flush = () => { flushMicrotasks(); while (traversals.length) { traversals.shift()!(); flushMicrotasks(); } };
  return {
    nav, read, entries, flush, flushMicrotasks,
    back() { if (index > 0) { index--; nav.pop(); flush(); } },
    route(path: string) { nav.write('push', { __NA: true, tree: path }, '', path); },
    depth: () => index,
  };
}

test('one side-button traversal closes only the focused nested view, then returns through visited routes', () => {
  const b = browser();
  b.route('/tasks'); b.route('/notebooks');
  const closed: string[] = [];
  b.nav.register(() => closed.push('notebook'));
  b.nav.register(() => closed.push('page'));
  b.nav.register(() => closed.push('camera'));
  assert.equal(b.depth(), 3);
  assert.equal(b.read().state?.__NA, true);
  b.back(); assert.deepEqual(closed, ['camera']);
  b.back(); assert.deepEqual(closed, ['camera', 'page']);
  b.back(); assert.deepEqual(closed, ['camera', 'page', 'notebook']);
  assert.equal(b.read().url, 'https://sorro.test/notebooks');
  b.back(); assert.equal(b.read().url, 'https://sorro.test/tasks');
  b.back(); assert.equal(b.read().url, 'https://sorro.test/');
});

test('closing a child with its own button keeps the parent focused', () => {
  const b = browser(); let parentCloses = 0;
  const parent = b.nav.register(() => parentCloses++);
  const child = b.nav.register(() => assert.fail('unmounted child must not close again'));
  child(); b.flush();
  assert.equal(parentCloses, 0); assert.equal(b.depth(), 1);
  parent(); b.flush(); assert.equal(b.depth(), 0);
});

test('Strict Mode effect replay and menu-to-dialog replacement do not add history entries', () => {
  const b = browser();
  const first = b.nav.register(() => {}); first();
  const second = b.nav.register(() => {}); b.flush();
  assert.equal(b.entries.length, 2);
  second(); const dialog = b.nav.register(() => {}); b.flush();
  assert.equal(b.entries.length, 2);
  dialog(); b.flush(); assert.equal(b.depth(), 0);
});

test('navigation from an open dialog removes its temporary entry and retains real route order', () => {
  const b = browser(); b.route('/calendar');
  let closed = 0; const dispose = b.nav.register(() => closed++);
  b.route('/tasks'); dispose(); b.flush();
  assert.equal(closed, 1);
  assert.deepEqual(b.entries.map(e => new URL(e.url).pathname), ['/', '/calendar', '/tasks']);
  b.back(); assert.equal(b.read().url, 'https://sorro.test/calendar');
  b.back(); assert.equal(b.read().url, 'https://sorro.test/');
});

test('Next router tree replacement keeps back protection without clobbering router state', () => {
  const b = browser(); let closed = 0;
  b.nav.register(() => closed++);
  b.nav.write('replace', { __NA: true, tree: 'updated' }, '');
  assert.equal(b.read().state?.tree, 'updated');
  b.back(); assert.equal(closed, 1); assert.equal(b.depth(), 0);
});

test('a new overlay during a pending close traversal remains open', () => {
  const b = browser();
  b.nav.register(() => {})(); b.flushMicrotasks();
  let closed = 0; b.nav.register(() => closed++); b.flush();
  assert.equal(closed, 0); assert.equal(b.depth(), 1);
  b.back(); assert.equal(closed, 1);
});

test('a new route during a pending close traversal is not accidentally popped', () => {
  const b = browser(); b.route('/calendar');
  b.nav.register(() => {})(); b.flushMicrotasks();
  b.route('/tasks'); b.flush();
  assert.equal(b.read().url, 'https://sorro.test/tasks');
  assert.deepEqual(b.entries.map(e => new URL(e.url).pathname), ['/', '/calendar', '/tasks']);
});

test('query and hash routes count as real destinations, with no duplicate dialog entries', () => {
  const b = browser(); b.route('/tasks?list=school');
  b.nav.register(() => {}); b.route('/tasks?list=personal#today'); b.flush();
  b.back(); assert.equal(b.read().url, 'https://sorro.test/tasks?list=school');
});
