import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateStorageKeys } from './storageKeys.ts';

function fake(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

test('an old key moves to its sorro name', () => {
  const s = fake({ 'basedly-prefs': '{"theme":"dark"}' });
  assert.equal(migrateStorageKeys(s), 1);
  assert.equal(s.getItem('sorro-prefs'), '{"theme":"dark"}');
  assert.equal(s.getItem('basedly-prefs'), null);
});
test('an existing new key is kept and the old one still goes', () => {
  const s = fake({ 'basedly-prefs': 'old', 'sorro-prefs': 'new' });
  migrateStorageKeys(s);
  assert.equal(s.getItem('sorro-prefs'), 'new');
  assert.equal(s.getItem('basedly-prefs'), null);
});
test('a second run changes nothing', () => {
  const s = fake({ 'basedly-prefs': 'x' });
  migrateStorageKeys(s);
  const before = [...s.map];
  assert.equal(migrateStorageKeys(s), 0);
  assert.deepEqual([...s.map], before);
});
test('unrelated keys are left alone', () => {
  const s = fake({ 'sb-jdk-auth-token': 't' });
  assert.equal(migrateStorageKeys(s), 0);
  assert.equal(s.getItem('sb-jdk-auth-token'), 't');
});
test('dynamic and underscore keys keep their suffix', () => {
  const s = fake({ 'basedly-focus:abc': '1', basedly_deleted_gcal_events: '2' });
  migrateStorageKeys(s);
  assert.equal(s.getItem('sorro-focus:abc'), '1');
  assert.equal(s.getItem('sorro_deleted_gcal_events'), '2');
});
