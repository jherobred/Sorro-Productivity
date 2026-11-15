import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { extraDays, formRange, gridRange, spillRange } from './calendarRange.ts';

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
const local = (d: Date) => `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
test('an edit that ends before it starts runs into the next day', () => {
  const r = formRange('2026-09-22', '23:00', '01:00');
  deepStrictEqual([local(r.starts), local(r.ends), r.nextDay], ['22 23:00', '23 01:00', true]);
  const same = formRange('2026-09-22', '09:00', '10:30');
  deepStrictEqual([local(same.ends), same.nextDay], ['22 10:30', false]);
  const month = formRange('2026-09-30', '22:00', '02:00');
  deepStrictEqual(month.ends.getMonth(), 9);
});
test('overnight is not a multi-day event, a three-day one keeps its length', () => {
  deepStrictEqual(extraDays(at(22, 23), at(23, 1)), 0);
  deepStrictEqual(extraDays(at(22, 9), at(22, 10)), 0);
  deepStrictEqual(extraDays(at(21, 9), at(23, 17)), 2);
  const r = formRange('2026-09-21', '09:00', '17:00', 2);
  deepStrictEqual(local(r.ends), '23 17:00');
});
test('the part after midnight shows on the next day only', () => {
  deepStrictEqual(spillRange(at(22, 23), at(23, 1, 30), new Date(2026, 8, 23)), { start: 0, end: 1.5 });
  deepStrictEqual(spillRange(at(22, 23), at(23, 0), new Date(2026, 8, 23)), null);
  deepStrictEqual(spillRange(at(22, 23), at(23, 1), new Date(2026, 8, 22)), null);
  deepStrictEqual(spillRange(at(21, 9), at(23, 17), new Date(2026, 8, 22)), { start: 0, end: 24 });
});
