import test from 'node:test';
import assert from 'node:assert/strict';
import { readCalendar } from '../supabase/functions/sync/ics.ts';

const feed = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const from = Date.UTC(2026, 8, 1), to = Date.UTC(2026, 9, 1);     // September 2026

test('duplicate masters and revisions produce unique upsert keys, newest revision wins', () => {
  const newer = vevent('UID:dup', 'SEQUENCE:2', 'SUMMARY:New room', 'DTSTART:20260901T010000Z', 'RRULE:FREQ=WEEKLY;COUNT=2');
  const older = vevent('UID:dup', 'SEQUENCE:1', 'SUMMARY:Old room', 'DTSTART:20260901T010000Z', 'RRULE:FREQ=WEEKLY;COUNT=2');
  const got = readCalendar(feed(newer, older, newer), from, to);
  assert.equal(got.length, 2);
  assert.equal(new Set(got.map(e => e.externalId)).size, 2);
  assert.ok(got.every(e => e.summary === 'New room'));
});

test('cancelled exceptions need no DTSTART and moved exceptions survive EXDATE and window edges', () => {
  const got = readCalendar(feed(
    vevent('UID:r', 'DTSTART:20260901T010000Z', 'RRULE:FREQ=WEEKLY;COUNT=8', 'EXDATE:20260915T010000Z'),
    vevent('UID:r', 'RECURRENCE-ID:20260908T010000Z', 'STATUS:CANCELLED'),
    vevent('UID:r', 'RECURRENCE-ID:20260915T010000Z', 'DTSTART:20260916T010000Z'),
    vevent('UID:r', 'RECURRENCE-ID:20261006T010000Z', 'DTSTART:20260930T010000Z'),
  ), from, to);
  assert.deepEqual(got.map(e => e.start.slice(0, 10)), ['2026-09-01', '2026-09-16', '2026-09-22', '2026-09-29', '2026-09-30']);
});

test('a weekly class becomes every one of its meetings in the window, at Manila time', () => {
  const ics = feed(vevent('UID:cs191', 'SUMMARY:CS 191 lecture', 'DTSTART;TZID=Asia/Manila:20260803T090000', 'DTEND;TZID=Asia/Manila:20260803T103000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'));
  const got = readCalendar(ics, from, to);
  assert.equal(got.length, 13);                                     // Sep 2026 has 4 Mon, 5 Wed, 4 Fri
  assert.equal(got[0].start, '2026-09-02T01:00:00.000Z');          // Wed 2 Sep, 9:00 in Manila
  assert.equal(got[0].end, '2026-09-02T02:30:00.000Z');
  assert.equal(got[0].externalId, 'cs191@20260902T010000Z');
  assert.equal(new Set(got.map((e) => e.externalId)).size, got.length);
});

test('a removed meeting stays removed and a moved one lands where it was moved', () => {
  const ics = feed(
    vevent('UID:lab', 'SUMMARY:Lab', 'DTSTART;TZID=Asia/Manila:20260901T130000', 'DTEND;TZID=Asia/Manila:20260901T150000', 'RRULE:FREQ=WEEKLY', 'EXDATE;TZID=Asia/Manila:20260915T130000'),
    vevent('UID:lab', 'SUMMARY:Lab (room 402)', 'RECURRENCE-ID;TZID=Asia/Manila:20260922T130000', 'DTSTART;TZID=Asia/Manila:20260923T100000', 'DTEND;TZID=Asia/Manila:20260923T120000'),
    vevent('UID:lab', 'RECURRENCE-ID;TZID=Asia/Manila:20260929T130000', 'DTSTART;TZID=Asia/Manila:20260929T130000', 'STATUS:CANCELLED'),
  );
  const got = readCalendar(ics, from, to);
  assert.deepEqual(got.map((e) => e.start), ['2026-09-01T05:00:00.000Z', '2026-09-08T05:00:00.000Z', '2026-09-23T02:00:00.000Z']);
  assert.equal(got[2].summary, 'Lab (room 402)');
  assert.equal(got[2].externalId, 'lab@20260922T050000Z');
});

test('COUNT and UNTIL end a series', () => {
  const counted = readCalendar(feed(vevent('UID:a', 'DTSTART:20260901T000000Z', 'RRULE:FREQ=DAILY;COUNT=3')), from, to);
  assert.equal(counted.length, 3);
  const until = readCalendar(feed(vevent('UID:b', 'DTSTART:20260901T000000Z', 'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20260907T000000Z')), from, to);
  assert.deepEqual(until.map((e) => e.start.slice(0, 10)), ['2026-09-01', '2026-09-03', '2026-09-05', '2026-09-07']);
  // A series that began years ago still counts its COUNT from the start.
  assert.equal(readCalendar(feed(vevent('UID:c', 'DTSTART:20200101T000000Z', 'RRULE:FREQ=DAILY;COUNT=5')), from, to).length, 0);
});

test('an all-day yearly event comes round on its date', () => {
  const got = readCalendar(feed(vevent('UID:bday', 'SUMMARY:Mama\\, birthday', 'DTSTART;VALUE=DATE:19700915', 'DTEND;VALUE=DATE:19700916', 'RRULE:FREQ=YEARLY')), from, to);
  assert.equal(got.length, 1);
  assert.equal(got[0].start, '2026-09-15T00:00:00.000Z');
  assert.equal(got[0].allDay, true);
  assert.equal(got[0].summary, 'Mama, birthday');
});

test('a wall time in a daylight-saving zone keeps its hour across the change', () => {
  const got = readCalendar(feed(vevent('UID:ny', 'DTSTART;TZID=America/New_York:20261026T090000', 'DTEND;TZID=America/New_York:20261026T100000', 'RRULE:FREQ=WEEKLY;COUNT=2')), Date.UTC(2026, 9, 20), Date.UTC(2026, 10, 10));
  assert.deepEqual(got.map((e) => e.start), ['2026-10-26T13:00:00.000Z', '2026-11-02T14:00:00.000Z']);
});

test('the second Tuesday and the last Friday of each month', () => {
  const second = readCalendar(feed(vevent('UID:m', 'DTSTART:20260811T010000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU')), from, to);
  assert.deepEqual(second.map((e) => e.start.slice(0, 10)), ['2026-09-08']);
  const last = readCalendar(feed(vevent('UID:l', 'DTSTART:20260828T010000Z', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR')), from, to);
  assert.deepEqual(last.map((e) => e.start.slice(0, 10)), ['2026-09-25']);
});

test('one-off events keep the id older syncs gave them, and folded lines unfold', () => {
  const got = readCalendar(feed(vevent('UID:once', 'SUMMARY:Thesis defen', ' se', 'DTSTART:20260918T020000Z', 'DTEND:20260918T030000Z', 'BEGIN:VALARM', 'SUMMARY:alarm', 'END:VALARM')), from, to);
  assert.equal(got.length, 1);
  assert.equal(got[0].externalId, 'once');
  assert.equal(got[0].summary, 'Thesis defense');
});
