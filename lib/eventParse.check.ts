import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvent } from './eventParse.ts';

// Tuesday 3 Nov 2026, 10:00 local.
const now = new Date(2026, 10, 3, 10, 0);
const local = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

test('a repeating class with a place', () => {
  const e = parseEvent('CS 150 every Mon 9-10:30 at Eng 214', now)!;
  assert.equal(e.title, 'CS 150');
  assert.equal(e.location, 'Eng 214');
  assert.deepEqual(e.repeat, { days: [1] });
  assert.equal(local(e.starts_at), '2026-11-09 09:00');
  assert.equal(local(e.ends_at), '2026-11-09 10:30');
});
test('a weekday this week, one hour by default', () => {
  const e = parseEvent('dentist fri 3pm', now)!;
  assert.equal(e.title, 'dentist');
  assert.equal(local(e.starts_at), '2026-11-06 15:00');
  assert.equal(local(e.ends_at), '2026-11-06 16:00');
});
test('a month and day with a range', () => {
  const e = parseEvent('exam nov 20 8am-11am', now)!;
  assert.equal(local(e.starts_at), '2026-11-20 08:00');
  assert.equal(local(e.ends_at), '2026-11-20 11:00');
});
test('tomorrow and a bare hour reads as daytime', () => {
  const e = parseEvent('lunch tomorrow 12', now)!;
  assert.equal(local(e.starts_at), '2026-11-04 12:00');
});
test('a past weekday rolls to next week', () => {
  assert.equal(local(parseEvent('gym mon 6pm', now)!.starts_at), '2026-11-09 18:00');
});
test('a past date this year rolls to next year', () => {
  assert.equal(local(parseEvent('trip jan 5 9am', now)!.starts_at).slice(0, 4), '2027');
});
test('no time means all day', () => {
  const e = parseEvent('field trip thu', now)!;
  assert.equal(e.all_day, true);
  assert.equal(local(e.starts_at).slice(0, 10), '2026-11-05');
});
test('nothing to schedule gives null', () => {
  assert.equal(parseEvent('   ', now), null);
});
test('days step across a month end', () => {
  const e = parseEvent('call tomorrow 9am', new Date(2026, 10, 30, 10))!;
  assert.equal(local(e.starts_at), '2026-12-01 09:00');
});
