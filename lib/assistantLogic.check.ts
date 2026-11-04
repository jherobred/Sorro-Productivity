import { test } from 'node:test';
import assert from 'node:assert/strict';
import { undoChange, suggestions, foldStream, chatContext, type StreamState } from './assistantLogic.ts';

test('undoing a created row soft-deletes it', () => {
  const c = undoChange({ table: 'sorro_tasks', id: 't1', action: 'delete' }, '2026-11-03T10:00:00.000Z');
  assert.deepEqual(c, { table: 'sorro_tasks', id: 't1', patch: { deleted_at: '2026-11-03T10:00:00.000Z' }, only: { deleted_at: null } });
});
test('undoing a completion reopens the task', () => {
  assert.deepEqual(undoChange({ table: 'sorro_tasks', id: 't1', action: 'uncomplete' }, 'x').patch, { done: false, completed_at: null });
});
test('undoing an append puts the old body back', () => {
  assert.deepEqual(undoChange({ table: 'sorro_notes', id: 'n1', action: 'restore_body', body: 'old', after: 'old\n\nnew' }, 'x').patch, { body: 'old' });
  assert.throws(() => undoChange({ table: 'sorro_notes', id: 'n1', action: 'restore_body', body: 'old' }, 'x'));
});
test('an undo for a table outside the assistant\'s reach is refused', () => {
  assert.throws(() => undoChange({ table: 'sorro_profiles' as never, id: 'p', action: 'delete' }, 'x'));
});
test('suggestions come from what is actually there', () => {
  assert.deepEqual(suggestions({ dueToday: 0, overdue: 0, eventsTomorrow: 0, notebooks: [] }), ['Plan my week', 'Add a task for tomorrow']);
  const s = suggestions({ dueToday: 3, overdue: 2, eventsTomorrow: 4, notebooks: ['CS 191'] });
  assert.ok(s.includes('What is overdue?'));
  assert.ok(s.includes('Plan tomorrow around my 4 events'));
  assert.ok(s.includes('Summarize my CS 191 notes'));
  assert.ok(s.length <= 3);
});
test('an undo only applies to the row as the assistant left it', () => {
  assert.deepEqual(undoChange({ table: 'sorro_tasks', id: 't', action: 'delete' }, 'now').only, { deleted_at: null });
  assert.deepEqual(undoChange({ table: 'sorro_tasks', id: 't', action: 'uncomplete' }, 'now').only, { done: true });
  assert.deepEqual(undoChange({ table: 'sorro_notes', id: 'n', action: 'restore_body', body: 'old', after: 'old\n\nnew' }, 'now').only, { body: 'old\n\nnew' });
});

test('text chunks append, done ends the stream', () => {
  let s: StreamState = { text: '' };
  s = foldStream(s, { event: 'text', data: '"Added "' });
  s = foldStream(s, { event: 'text', data: '"it."' });
  s = foldStream(s, { event: 'done', data: '{"chat_id":"c1","tools":[]}' });
  assert.equal(s.text, 'Added it.');
  assert.deepEqual(s.done, { chat_id: 'c1', tools: [] });
});
test('an error event keeps the text and the tools that already ran', () => {
  const s = foldStream({ text: 'Part' }, { event: 'error', data: '{"error":"model_failed","retry":null,"chat_id":"c1","tools":[{"name":"create_task","label":"Added"}]}' });
  assert.equal(s.text, 'Part');
  assert.equal(s.error?.tools.length, 1);
});
test('an unknown event changes nothing', () => {
  const s: StreamState = { text: 'x' };
  assert.equal(foldStream(s, { event: 'ping', data: '' }), s);
});
test('context names the tab and the open item', () => {
  assert.equal(chatContext('Notes', '?note=n1'), 'The user is on the Notes tab with note n1 open.');
  assert.equal(chatContext('Tasks', ''), 'The user is on the Tasks tab.');
  assert.equal(chatContext('Tasks', '?detail=t9'), 'The user is on the Tasks tab with task t9 open.');
});
