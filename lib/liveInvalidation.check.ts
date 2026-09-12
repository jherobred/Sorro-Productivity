import assert from 'node:assert/strict';
import test from 'node:test';
import { createInvalidationQueue } from './liveInvalidation.ts';

function setup() {
  let busy = false;
  let id = 0;
  const timers = new Map<number, () => void>();
  const invalidated: string[] = [];
  const queue = createInvalidationQueue({
    busy: () => busy,
    invalidate: key => invalidated.push(key),
    schedule: run => { timers.set(++id, run); return id; },
    cancel: timer => { timers.delete(timer); },
  });
  return { queue, timers, invalidated, writing: (value: boolean) => { busy = value; }, tick: () => {
    const runs = [...timers.values()]; timers.clear(); for (const run of runs) run();
  } };
}

test('a burst of row events refetches each affected query prefix once', () => {
  const s = setup();
  for (let i = 0; i < 30; i++) s.queue.add(['notes', 'home_recent_notes']);
  s.queue.add(['tasks']);
  assert.equal(s.timers.size, 1); s.tick();
  assert.deepEqual(s.invalidated, ['notes', 'home_recent_notes', 'tasks']);
});

test('realtime cannot overwrite optimistic edits while a write is executing', () => {
  const s = setup(); s.writing(true); s.queue.add(['tasks']); s.tick();
  assert.deepEqual(s.invalidated, []); assert.equal(s.timers.size, 1);
  s.queue.add(['notes']); s.writing(false); s.tick();
  assert.deepEqual(s.invalidated, ['tasks', 'notes']);
});

test('unmount cancels retry timers and prevents stale callbacks after account changes', () => {
  const s = setup(); s.writing(true); s.queue.add(['tasks']); s.tick();
  const stale = [...s.timers.values()][0]; s.queue.dispose();
  s.writing(false); stale(); s.queue.add(['notes']); s.tick();
  assert.deepEqual(s.invalidated, []); assert.equal(s.timers.size, 0);
});
