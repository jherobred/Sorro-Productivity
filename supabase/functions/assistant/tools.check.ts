import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArgs, TOOLS, freeSlots } from './tools.ts';

test('every declared tool validates', () => {
  for (const t of TOOLS) assert.ok(typeof t.name === 'string' && t.description.length > 10);
});
test('an unknown tool is refused', () => {
  assert.equal(validateArgs('delete_everything', {}).ok, false);
});
test('a task needs a title, and the date must be a real day', () => {
  assert.equal(validateArgs('create_task', {}).ok, false);
  assert.equal(validateArgs('create_task', { title: '  ' }).ok, false);
  assert.equal(validateArgs('create_task', { title: 'Buy pens', due_on: '2026-02-30' }).ok, false);
  const ok = validateArgs('create_task', { title: 'Buy pens', due_on: '2026-11-04', priority: 'high' });
  assert.equal(ok.ok, true);
});
test('priority is one of low, med, high', () => {
  assert.equal(validateArgs('create_task', { title: 'x', priority: 'urgent' }).ok, false);
});
test('an event must end after it starts', () => {
  assert.equal(validateArgs('create_event', { title: 'Lab', starts_at: '2026-11-04T10:00:00+08:00', ends_at: '2026-11-04T09:00:00+08:00' }).ok, false);
  assert.equal(validateArgs('create_event', { title: 'Lab', starts_at: '2026-11-04T09:00:00+08:00', ends_at: '2026-11-04T10:30:00+08:00' }).ok, true);
});
test('list ranges are fixed words', () => {
  assert.equal(validateArgs('list_tasks', { range: 'today' }).ok, true);
  assert.equal(validateArgs('list_tasks', { range: 'forever' }).ok, false);
});
test('free time needs a date and a sensible length', () => {
  assert.equal(validateArgs('find_free_time', { date: '2026-11-05', minutes: 45 }).ok, true);
  assert.equal(validateArgs('find_free_time', { date: '2026-11-05', minutes: 0 }).ok, false);
});
test('ids must look like ids', () => {
  assert.equal(validateArgs('complete_task', { id: 'abc' }).ok, false);
  assert.equal(validateArgs('complete_task', { id: '3f2b8c1e-1d2a-4f5b-9c3d-0a1b2c3d4e5f' }).ok, true);
});
test('free slots skip busy time and keep the day between 7 and 22', () => {
  assert.deepEqual(freeSlots([[9 * 60, 10 * 60 + 30], [13 * 60, 14 * 60]], 60), [[420, 540], [630, 780], [840, 1320]]);
  assert.deepEqual(freeSlots([[7 * 60, 22 * 60]], 15), []);
});
test('appending works on plain markdown and Page notes, and refuses every other format', async () => {
  const { appendTo } = await import('./tools.ts');
  assert.equal(appendTo('# Notes\n\nold', 'new line'), '# Notes\n\nold\n\nnew line');
  assert.equal(appendTo('<!-- sorro-text:v1 -->\n<p>old</p>', 'a <b> & c'), '<!-- sorro-text:v1 -->\n<p>old</p><p>a &lt;b&gt; &amp; c</p>');
  assert.equal(appendTo('<!-- sorro-recall:v1 -->\n{"html":"","schedule":{}}', 'x'), null);
  assert.equal(appendTo('<!-- sorro-board:v1 -->\n{}', 'x'), null);
  assert.equal(appendTo('# Journal · 2026-11-03\n\nhi', 'x'), null);
});
test('day bounds carry the user\'s own offset', async () => {
  const { zoneOffset } = await import('./tools.ts');
  assert.equal(zoneOffset('Asia/Manila', '2026-11-04'), '+08:00');
  assert.equal(zoneOffset('America/New_York', '2026-11-04'), '-05:00');
  assert.equal(zoneOffset('America/New_York', '2026-07-04'), '-04:00');
});
