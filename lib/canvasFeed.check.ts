import test from 'node:test';
import assert from 'node:assert/strict';
import { readCanvasNotes, readAnnouncement, freshIds, rememberIds, reminderTimes, notificationId } from './canvasFeed.ts';

test('a synced assignment gives back its course and link', () => {
  assert.deepEqual(readCanvasNotes('CS 191 — https://ust.instructure.com/courses/12/assignments/34'), { course: 'CS 191', url: 'https://ust.instructure.com/courses/12/assignments/34' });
  assert.deepEqual(readCanvasNotes('Ethics — Unit 2 — https://ust.instructure.com/courses/9/assignments/1'), { course: 'Ethics — Unit 2', url: 'https://ust.instructure.com/courses/9/assignments/1' });
  assert.deepEqual(readCanvasNotes('Just some notes'), { course: 'Just some notes', url: null });
  assert.deepEqual(readCanvasNotes(null), { course: '', url: null });
});

test('an announcement body gives back its course and text', () => {
  assert.deepEqual(readAnnouncement('STS 1 · Chapters 7 and 8 · plus the excerpt'), { course: 'STS 1', text: 'Chapters 7 and 8 · plus the excerpt' });
  assert.deepEqual(readAnnouncement('No course here'), { course: '', text: 'No course here' });
});

test('only items not seen before are new, and the first look announces nothing', () => {
  assert.deepEqual(freshIds(['a', 'b'], null), []);
  assert.deepEqual(freshIds(['a', 'b', 'c'], ['a']), ['b', 'c']);
  assert.deepEqual(rememberIds(['c', 'a'], ['a', 'b']), ['c', 'a', 'b']);
  assert.equal(rememberIds(Array.from({ length: 10 }, (_, i) => String(i)), null, 4).length, 4);
});

test('reminders come a day and an hour before, never in the past', () => {
  const due = Date.UTC(2026, 8, 18, 15, 59);
  assert.deepEqual(reminderTimes(due, due - 3 * 86_400_000).map((r) => r.lead), ['day', 'hour']);
  assert.deepEqual(reminderTimes(due, due - 5 * 3_600_000).map((r) => r.lead), ['hour']);
  assert.deepEqual(reminderTimes(due, due - 30 * 60_000), []);
  const id = notificationId('asg_123:day');
  assert.ok(Number.isInteger(id) && id > 0 && id < 2 ** 31);
  assert.equal(id, notificationId('asg_123:day'));
  assert.notEqual(id, notificationId('asg_123:hour'));
});
