import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PreferenceOutbox, preferenceDelta, mergePreferencePatch, type PreferencePatch } from './preferenceSync.ts';

function disk() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
test('offline Hide, custom text and Canvas plans survive restart and stale remote hydration', async () => {
  const storage = disk(), box = new PreferenceOutbox(storage);
  const change = { eventMeta: { event: { hidden: true, title_color: '#ffffff' } }, calendarTaskPlans: { canvas: { date: '2026-10-03', starts_at: '2026-10-03T08:00:00Z' } } };
  box.enqueue('owner', preferenceDelta({}, change));
  await assert.rejects(box.flush('owner', async () => ({}), async () => { throw new Error('offline'); }));
  const restored = new PreferenceOutbox(storage);
  const hydrated = mergePreferencePatch({ eventMeta: { event: { hidden: false, color: '#4285f4' } }, theme: 'dark' }, restored.pending('owner'));
  assert.deepEqual(hydrated.eventMeta, { event: { hidden: true, title_color: '#ffffff', color: '#4285f4' } });
  assert.deepEqual(hydrated.calendarTaskPlans, change.calendarTaskPlans);
  let server: PreferencePatch = { theme: 'dark' };
  await restored.flush('owner', async () => server, async value => { server = value; });
  assert.deepEqual(server, { theme: 'dark', ...change });
  assert.deepEqual(new PreferenceOutbox(storage).pending('owner'), {});
});
test('a later change made during a request is written last and cannot be acknowledged early', async () => {
  const box = new PreferenceOutbox(disk());
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let server: PreferencePatch = {}, writes = 0;
  box.enqueue('owner', { eventMeta: { event: { hidden: true } } });
  const run = box.flush('owner', async () => server, async value => { writes++; if (writes === 1) await blocked; server = value; });
  await Promise.resolve();
  box.enqueue('owner', { eventMeta: { event: { hidden: false, color: '#f6bf26' } } });
  const duplicate = box.flush('owner', async () => server, async () => { throw new Error('must serialize'); });
  release(); await Promise.all([run, duplicate]);
  assert.equal(writes, 2);
  assert.deepEqual(server, { eventMeta: { event: { hidden: false, color: '#f6bf26' } } });
});
test('preference deltas preserve other devices fields and explicit plan resets', () => {
  const before = { theme: 'light', eventMeta: { a: { color: '#000000', hidden: false } }, calendarTaskPlans: { a: { date: '2026-10-03', starts_at: null } } };
  const patch = preferenceDelta(before, { eventMeta: { a: { color: '#000000', hidden: true } }, calendarTaskPlans: {} });
  const remote = { theme: 'dark', eventMeta: { a: { color: '#ffffff', hidden: false }, b: { hidden: true } }, calendarTaskPlans: before.calendarTaskPlans };
  assert.deepEqual(mergePreferencePatch(remote, patch), { ...remote, eventMeta: { a: { color: '#ffffff', hidden: true }, b: { hidden: true } }, calendarTaskPlans: {} });
  assert.deepEqual(mergePreferencePatch({}, patch, true).calendarTaskPlans, { a: null });
});
test('pending changes are isolated by account and an acknowledged account does not clear another', async () => {
  const box = new PreferenceOutbox(disk());
  box.enqueue('one', { eventMeta: { a: { hidden: true } } });
  box.enqueue('two', { calendarPowerSave: true });
  await box.flush('one', async () => ({}), async () => {});
  assert.deepEqual(box.pending('one'), {});
  assert.deepEqual(box.pending('two'), { calendarPowerSave: true });
});
