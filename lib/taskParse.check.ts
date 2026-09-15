import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickTask } from './taskParse.ts';

// Tuesday 15 September 2026, 10:00 in the morning.
const now = new Date(2026, 8, 15, 10, 0);
const ctx = {
  lists: [{ id: 'school', name: 'School' }, { id: 'errands', name: 'Errands' }],
  tags: [{ name: 'CS 191' }, { name: 'Math 114' }],
};
const local = (iso: string | null) => iso && new Date(iso).toString().slice(0, 21);

test('one line fills in the date, time, priority, course and list', () => {
  const t = parseQuickTask('Read chapter 7 tomorrow 3pm !high #CS191 @school', now, ctx);
  assert.equal(t.title, 'Read chapter 7');
  assert.equal(t.due_on, '2026-09-16');
  assert.equal(t.time, '15:00');
  assert.equal(local(t.due_at), 'Wed Sep 16 2026 15:00');
  assert.equal(t.priority, 'high');
  assert.equal(t.course, 'CS 191');
  assert.equal(t.listId, 'school');
  assert.deepEqual(t.tokens.map((k) => k.label), ['Tomorrow', '3:00 PM', 'High priority', 'CS 191', 'School']);
});

test('dates in words and numbers, with the little word before them', () => {
  assert.deepEqual([parseQuickTask('Submit essay by friday', now, ctx)].map((t) => [t.title, t.due_on]), [['Submit essay', '2026-09-18']]);
  assert.equal(parseQuickTask('Pay rent sep 30', now, ctx).due_on, '2026-09-30');
  assert.equal(parseQuickTask('Pay rent 30 September', now, ctx).due_on, '2026-09-30');
  assert.equal(parseQuickTask('Renew passport 1/5', now, ctx).due_on, '2027-01-05');
  assert.equal(parseQuickTask('Lab report in 3 days', now, ctx).due_on, '2026-09-18');
  assert.equal(parseQuickTask('Plan trip next week', now, ctx).due_on, '2026-09-21');
  assert.equal(parseQuickTask('Quiz next friday', now, ctx).due_on, '2026-09-25');
  assert.equal(parseQuickTask('Group call tuesday', now, ctx).due_on, '2026-09-15');
  assert.equal(parseQuickTask('Deadline 2026-10-02', now, ctx).due_on, '2026-10-02');
});

test('a time on its own is the next time that clock comes round', () => {
  const later = parseQuickTask('Standup at 11:30am', now, ctx);
  assert.deepEqual([later.title, later.due_on, later.time], ['Standup', '2026-09-15', '11:30']);
  const passed = parseQuickTask('Standup 9:30 am', now, ctx);
  assert.deepEqual([passed.due_on, passed.time], ['2026-09-16', '09:30']);
  assert.equal(parseQuickTask('Dinner tonight', now, ctx).time, '20:00');
  assert.equal(parseQuickTask('Lunch noon', now, ctx).time, '12:00');
  assert.equal(parseQuickTask('Review 12am', now, ctx).time, '00:00');
});

test('words that match nothing, or were switched off, stay in the title', () => {
  const t = parseQuickTask('Call mom #family @nowhere', now, ctx);
  assert.deepEqual([t.title, t.course, t.listId, t.tokens.length], ['Call mom #family @nowhere', null, null, 0]);
  const kept = parseQuickTask('Meet next friday', now, { ...ctx, ignore: new Set(['next friday']) });
  assert.deepEqual([kept.title, kept.due_on], ['Meet next friday', null]);
  assert.equal(parseQuickTask('Buy constructor toString', now, ctx).title, 'Buy constructor toString');
  assert.equal(parseQuickTask('Fix bug !!', now, ctx).priority, 'med');
});
