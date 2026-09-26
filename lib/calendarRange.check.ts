import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { gridRange } from './calendarRange.ts';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString();
test('a midnight-ending event stays at the end of its starting day', () => {
  deepStrictEqual(gridRange(at(22, 23, 30), at(23, 0)), { start: 23.5, end: 24 });
  deepStrictEqual(gridRange(at(22, 23), at(23, 1)), { start: 23, end: 24 });
});
test('morning and ordinary events keep their local start and end hours', () => {
  deepStrictEqual(gridRange(at(23, 0), at(23, 0, 30)), { start: 0, end: .5 });
  deepStrictEqual(gridRange(at(23, 7), at(23, 8)), { start: 7, end: 8 });
  deepStrictEqual(gridRange(at(23, 13), at(23, 14, 30)), { start: 13, end: 14.5 });
});
test('a multi-day event clips at midnight and a bad duration never stretches backwards', () => {
  deepStrictEqual(gridRange(at(22, 14), at(24, 9)), { start: 14, end: 24 });
  deepStrictEqual(gridRange(at(22, 14), at(22, 13)), { start: 14, end: 14.25 });
});
