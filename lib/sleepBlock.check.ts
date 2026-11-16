import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SLEEP_HOURS, sleepRange } from './sleepBlock.ts';

const span = (hours: number, now: Date, day: Date) => {
  const range = sleepRange(hours, now, day);
  return { start: new Date(range.starts_at), end: new Date(range.ends_at), ms: Date.parse(range.ends_at) - Date.parse(range.starts_at) };
};

test('the sleep control offers 8, 6, 4 and 2 hours, in that order', () => {
  assert.deepEqual([...SLEEP_HOURS], [8, 6, 4, 2]);
});

test('8 hours after noon is tonight, ending at 7 the next morning', () => {
  const now = new Date(2026, 10, 16, 15, 4, 40);
  const got = span(8, now, now);
  assert.equal(got.end.getDate(), 17);
  assert.equal(got.end.getHours(), 7);
  assert.equal(got.end.getMinutes(), 0);
  assert.equal(got.start.getDate(), 16);
  assert.equal(got.start.getHours(), 23);
  assert.equal(got.ms, 8 * 3_600_000);
});

test('8 hours before noon ends at this minute', () => {
  const now = new Date(2026, 10, 16, 7, 12, 40);
  const got = span(8, now, now);
  assert.equal(got.end.getDate(), 16);
  assert.equal(got.end.getHours(), 7);
  assert.equal(got.end.getMinutes(), 12);
  assert.equal(got.end.getSeconds(), 0);
  assert.equal(got.start.getDate(), 15);
  assert.equal(got.start.getHours(), 23);
  assert.equal(got.start.getMinutes(), 12);
});

test('2 hours in the afternoon is a nap ending now', () => {
  const now = new Date(2026, 10, 16, 15, 40, 20);
  const got = span(2, now, now);
  assert.equal(got.end.getHours(), 15);
  assert.equal(got.end.getMinutes(), 40);
  assert.equal(got.start.getHours(), 13);
  assert.equal(got.start.getMinutes(), 40);
  assert.equal(got.ms, 2 * 3_600_000);
});

test('a day that is not today ends at 7 that morning', () => {
  const now = new Date(2026, 10, 16, 22, 0, 0);
  const day = new Date(2026, 10, 18, 15, 0, 0);
  const got = span(6, now, day);
  assert.equal(got.end.getDate(), 18);
  assert.equal(got.end.getHours(), 7);
  assert.equal(got.start.getDate(), 18);
  assert.equal(got.start.getHours(), 1);
  assert.equal(got.ms, 6 * 3_600_000);
});
