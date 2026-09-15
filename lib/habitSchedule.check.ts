import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isDueOn, progress, currentStreak, bestStreak, hitRate, dayScore, scheduleLabel, weekStart, dayKey, addDays,
  type ScheduledHabit, type DayTick,
} from './habitSchedule.ts';

// Wednesday, 16 September 2026.
const WED = new Date(2026, 8, 16);
const back = (n: number) => dayKey(addDays(WED, -n));
const tick = (habit_id: string, daysBack: number, value = 1): DayTick => ({ habit_id, on_date: back(daysBack), value });

const daily: ScheduledHabit = { id: 'd', kind: 'bin', target: null, frequency: 'daily' };
const weekdays: ScheduledHabit = { id: 'w', kind: 'bin', target: null, frequency: 'weekdays' };
const weekly: ScheduledHabit = { id: 'k', kind: 'bin', target: null, frequency: 'weekly' };
const pages: ScheduledHabit = { id: 'p', kind: 'count', target: 20, frequency: 'daily' };

test('schedules decide which days are due', () => {
  assert.equal(isDueOn(weekdays, new Date(2026, 8, 19)), false); // Saturday
  assert.equal(isDueOn(weekdays, WED), true);
  assert.equal(isDueOn({ ...daily, frequency: 'weekends' }, new Date(2026, 8, 20)), true); // Sunday
  const monWedFri: ScheduledHabit = { ...daily, frequency: 'custom_days', custom_days: [1, 3, 5] };
  assert.equal(isDueOn(monWedFri, WED), true);
  assert.equal(isDueOn(monWedFri, addDays(WED, 1)), false);
  assert.equal(isDueOn({ ...monWedFri, custom_days: [] }, addDays(WED, 1)), true);
  assert.equal(scheduleLabel({ ...monWedFri, custom_days: [5, 1, 3] }), 'Mon, Wed, Fri');
  assert.equal(scheduleLabel({ ...monWedFri, custom_days: [0, 6] }), 'Sat, Sun');
});

test('a count habit is kept at its target, not at the first tap', () => {
  assert.deepEqual(progress(pages, tick('p', 0, 12)), { value: 12, target: 20, done: false, pct: 60 });
  assert.equal(progress(pages, tick('p', 0, 20)).done, true);
  assert.equal(progress(daily, tick('d', 0, 0)).done, true);
  assert.equal(progress(daily, undefined).done, false);
});

test('today still open does not break a streak, a missed due day does', () => {
  const ticks = [tick('d', 1), tick('d', 2), tick('d', 3), tick('d', 5)];
  assert.equal(currentStreak(daily, ticks, WED), 3);
  assert.equal(currentStreak(daily, [...ticks, tick('d', 0)], WED), 4);
  assert.equal(bestStreak(daily, [...ticks, tick('d', 0)], WED), 4);
});

test('a weekday habit runs straight through the weekend', () => {
  // Wed back to the previous Wednesday: Tue, Mon, (Sun, Sat skipped), Fri, Thu, Wed.
  const ticks = [1, 2, 5, 6, 7].map((n) => tick('w', n));
  assert.equal(currentStreak(weekdays, ticks, WED), 5);
});

test('a frozen day is forgiven, not counted', () => {
  const ticks = [tick('d', 1), tick('d', 3), tick('d', 4)];
  assert.equal(currentStreak(daily, ticks, WED), 1);
  assert.equal(currentStreak(daily, ticks, WED, new Set([back(2)])), 3);
});

test('partial counts do not keep a streak', () => {
  const ticks = [tick('p', 1, 20), tick('p', 2, 5), tick('p', 3, 25)];
  assert.equal(currentStreak(pages, ticks, WED), 1);
  assert.equal(bestStreak(pages, ticks, WED), 1);
});

test('a once-a-week habit counts weeks, and this week still open does not break it', () => {
  const thisMonday = weekStart(WED);
  assert.equal(dayKey(thisMonday), '2026-09-14');
  const ticks: DayTick[] = [
    { habit_id: 'k', on_date: dayKey(addDays(thisMonday, -3)), value: 1 }, // last week's Friday
    { habit_id: 'k', on_date: dayKey(addDays(thisMonday, -14)), value: 1 }, // two weeks ago
  ];
  assert.equal(currentStreak(weekly, ticks, WED), 2);
  assert.equal(currentStreak(weekly, [...ticks, tick('k', 0)], WED), 3);
  assert.equal(currentStreak(weekly, ticks.slice(1), WED), 0);
});

test('hit rate counts due days, and today only once it is done', () => {
  const ticks = [tick('w', 1), tick('w', 2)];
  // Seven days back from Wednesday: Wed(today, open), Tue, Mon, Fri, Thu are due. Sat and Sun are not.
  assert.deepEqual(hitRate(weekdays, ticks, WED, 7), { kept: 2, due: 4, pct: 50 });
  assert.deepEqual(hitRate(weekdays, [...ticks, tick('w', 0)], WED, 7), { kept: 3, due: 5, pct: 60 });
});

test('a day score leaves out habits that were not due', () => {
  const saturday = new Date(2026, 8, 19);
  const ticks: DayTick[] = [{ habit_id: 'd', on_date: dayKey(saturday), value: 1 }];
  assert.deepEqual(dayScore([daily, weekdays, weekly], ticks, saturday), { due: 1, done: 1 });
  assert.deepEqual(dayScore([daily, weekdays], [], WED), { due: 2, done: 0 });
});
