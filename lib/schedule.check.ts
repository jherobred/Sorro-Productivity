/**
 * Self-check for lib/schedule.ts — the one runnable thing that fails if a
 * scanned timetable would land on the wrong day or at the wrong hour.
 *
 *   node lib/schedule.check.ts
 */

import assert from 'node:assert/strict';
import {
  normaliseTime, normaliseDay, toRow, dedupe, occurrences, eventTitle,
  defaultRange, validYmd, minutesOf, type Row,
} from './schedule.ts';

/* times -------------------------------------------------------------------- */
assert.equal(normaliseTime('9:00'), '09:00');
assert.equal(normaliseTime('09:00'), '09:00');
assert.equal(normaliseTime('9:00 AM'), '09:00');
assert.equal(normaliseTime('9:00am'), '09:00');
assert.equal(normaliseTime('9'), '09:00');
assert.equal(normaliseTime('13:00'), '13:00');
assert.equal(normaliseTime('1:00 PM'), '13:00');
assert.equal(normaliseTime('12:00 AM'), '00:00', 'midnight is 00:00, not 12:00');
assert.equal(normaliseTime('12:00 PM'), '12:00', 'noon stays noon');
assert.equal(normaliseTime('7.30'), '07:30', 'a full stop separates as well as a colon');
assert.equal(normaliseTime('1:00'), '13:00', 'a bare 1 on a timetable is the afternoon');
assert.equal(normaliseTime('6:30'), '18:30');
assert.equal(normaliseTime('7:00'), '07:00', 'but 7 is the morning');
assert.equal(normaliseTime('0900'), '09:00');
assert.equal(normaliseTime('1430'), '14:30');
assert.equal(normaliseTime(''), null);
assert.equal(normaliseTime('TBA'), null);
assert.equal(normaliseTime('25:00'), null);
assert.equal(normaliseTime('9:75'), null);
assert.equal(minutesOf('14:30'), 870);

/* days --------------------------------------------------------------------- */
assert.equal(normaliseDay('M'), 'mon');
assert.equal(normaliseDay('Tues'), 'tue');
assert.equal(normaliseDay('TH'), 'thu');
assert.equal(normaliseDay('H'), 'thu');
assert.equal(normaliseDay('Wednesday'), 'wed');
assert.equal(normaliseDay('sun.'), 'sun');
assert.equal(normaliseDay('X'), null);

/* a scanned row, judged ----------------------------------------------------- */
{
  const ok = toRow({
    title: 'Data Structures', code: 'ICS 2605', location: 'CS Lab 2',
    days: ['mon', 'WED'], start: '9:00', end: '10:30', raw: 'ICS 2605 MW 9:00-10:30 CS Lab 2', confidence: 0.94,
  }, 0, '#7C6CFF');
  assert.deepEqual(ok.days, ['mon', 'wed']);
  assert.equal(ok.start, '09:00');
  assert.equal(ok.problems.length, 0);
  assert.equal(ok.include, true, 'a clean row is ticked to import');
  assert.equal(eventTitle(ok), 'ICS 2605 — Data Structures');

  const backwards = toRow({ title: 'Ethics', days: ['fri'], start: '15:00', end: '14:00', confidence: 1 }, 1, '#fff');
  assert.deepEqual(backwards.problems, ['Ends before it starts']);
  assert.equal(backwards.include, false, 'a broken row is not ticked');

  const empty = toRow({ title: '', days: ['zzz'], start: 'TBA', end: '', confidence: 0 }, 2, '#fff');
  assert.equal(empty.problems.length, 4, 'no title, no day, no start, no end');
  assert.equal(empty.title, 'Untitled class', 'but it still shows up to be fixed, never dropped');

  const noCode = toRow({ title: 'PATH-FIT 2', code: 'PATH-FIT', days: ['sat'], start: '7:00', end: '9:00', confidence: 1 }, 3, '#fff');
  assert.equal(eventTitle(noCode), 'PATH-FIT 2', 'a code already inside the title is not repeated');
}

/* the same class read twice ------------------------------------------------- */
{
  const mk = (title: string, start: string): Row =>
    toRow({ title, days: ['mon'], start, end: '10:30', confidence: 1 }, 0, '#fff');
  const rows = [mk('Algo', '09:00'), mk('algo', '09:00'), mk('Algo', '13:00')];
  assert.equal(dedupe(rows).length, 2, 'case-insensitive on title, but a different time is a different class');
}

/* occurrences --------------------------------------------------------------- */
{
  // 2026-08-17 is a Monday.
  const row = toRow({ title: 'CS 150', days: ['mon', 'wed'], start: '09:00', end: '10:30', confidence: 1 }, 0, '#fff');
  const occ = occurrences(row, '2026-08-17', '2026-08-30');

  assert.equal(occ.length, 4, 'two weeks of a Mon/Wed class');
  const first = new Date(occ[0].starts_at);
  assert.equal(first.getDay(), 1, 'the first meeting is a Monday');
  assert.equal(first.getHours(), 9, 'and it is at nine in the morning, locally');
  assert.equal(new Date(occ[0].ends_at).getHours(), 10);
  assert.equal(new Date(occ[0].ends_at).getMinutes(), 30);
  assert.equal(new Date(occ[1].starts_at).getDay(), 3, 'then the Wednesday');

  // Every meeting is on a day the row asked for, and none is outside the range.
  for (const o of occ) {
    const d = new Date(o.starts_at);
    assert.ok([1, 3].includes(d.getDay()));
    assert.ok(new Date(o.ends_at) > new Date(o.starts_at));
  }

  assert.equal(occurrences(row, '2026-08-30', '2026-08-17').length, 0, 'a backwards range yields nothing');
  assert.equal(occurrences(row, '2026-08-18', '2026-08-18').length, 0, 'a Tuesday-only range yields nothing');

  const single = occurrences(row, '2026-08-17', '2026-08-17');
  assert.equal(single.length, 1, 'the range includes its last day');

  const broken = toRow({ title: 'x', days: [], start: '', end: '', confidence: 0 }, 0, '#fff');
  assert.equal(occurrences(broken, '2026-08-17', '2026-12-19').length, 0, 'a row with problems writes nothing');
}

/* the guard rail ------------------------------------------------------------ */
{
  const row = toRow({ title: 'Daily', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], start: '08:00', end: '09:00', confidence: 1 }, 0, '#fff');
  const many = occurrences(row, '2020-01-01', '2030-01-01');
  assert.ok(many.length <= 800, 'a mistyped decade cannot write ten thousand rows');
}

/* dates --------------------------------------------------------------------- */
{
  const r = defaultRange(new Date(2026, 7, 20));
  assert.equal(r.from, '2026-08-20');
  assert.equal(r.to, '2026-12-10', 'sixteen weeks out');
  assert.equal(validYmd('2026-02-30'), null, 'February has no thirtieth');
  assert.equal(validYmd('2026-02-28'), '2026-02-28');
  assert.equal(validYmd('nope'), null);
}

console.log('schedule.ts ok');
