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
test('"at" followed by a time is a time, not a place', () => {
  const e = parseEvent('Dinner at 7pm tomorrow', now)!;
  assert.equal(e.title, 'Dinner');
  assert.equal(e.location, undefined);
  assert.equal(local(e.starts_at), '2026-11-04 19:00');
});
test('words that start like a day or month stay in the title', () => {
  assert.equal(parseEvent('Wedding sat 5pm', now)!.title, 'Wedding');
  assert.equal(parseEvent('Friends reunion sat 5pm', now)!.title, 'Friends reunion');
  assert.equal(parseEvent('Decide 3 options fri', now)!.title, 'Decide 3 options');
});
test('a number inside the title is not a time', () => {
  const e = parseEvent('Math 21 exam fri', now)!;
  assert.equal(e.title, 'Math 21 exam');
  assert.equal(e.all_day, true);
});
test('a repeat starts on the soonest listed day', () => {
  const e = parseEvent('Gym every Mon and Wed 6pm', now)!;
  assert.deepEqual(e.repeat, { days: [1, 3] });
  assert.equal(local(e.starts_at), '2026-11-04 18:00');
});
test('a range ending pm can start in the morning', () => {
  const e = parseEvent('class 9-1pm', now)!;
  assert.equal(local(e.starts_at), '2026-11-03 09:00');
  assert.equal(local(e.ends_at), '2026-11-03 13:00');
});
test('today\'s weekday later today is today', () => {
  const friday = new Date(2026, 10, 6, 10, 0);
  assert.equal(local(parseEvent('dentist fri 3pm', friday)!.starts_at), '2026-11-06 15:00');
});
test('a range past midnight ends the next day', () => {
  const a = parseEvent('party tomorrow 11pm-1am', now)!;
  assert.equal(local(a.starts_at), '2026-11-04 23:00');
  assert.equal(local(a.ends_at), '2026-11-05 01:00');
  const b = parseEvent('night shift 11-1am', now)!;
  assert.equal(local(b.starts_at), '2026-11-03 23:00');
  assert.equal(local(b.ends_at), '2026-11-04 01:00');
  const c = parseEvent('stream 10pm-2', now)!;
  assert.equal(local(c.starts_at), '2026-11-03 22:00');
  assert.equal(local(c.ends_at), '2026-11-04 02:00');
  const d = parseEvent('late study 10:30pm-12:30am', now)!;
  assert.equal(local(d.ends_at), '2026-11-04 00:30');
});
test('a daytime range still stays in the day', () => {
  const e = parseEvent('lab 1-3am', now)!;
  assert.equal(local(e.starts_at), '2026-11-03 01:00');
  assert.equal(local(e.ends_at), '2026-11-03 03:00');
});
