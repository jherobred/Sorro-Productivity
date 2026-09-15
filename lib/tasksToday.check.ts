import test from 'node:test';
import assert from 'node:assert/strict';
import { sortTasks, filterTasks, agendaSections, boardColumns, courseNames, inScope, searchTasks, NO_FILTER, INBOX, NONE } from './taskViews.ts';
import { upcomingCycle, eventCountdown, countdownText, deadlineOf, deadlineClock, hashtags, nextTimedEvent, dayCountdown } from './todayCycle.ts';
import type { Task } from './tasks.ts';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, list_id: null, title: id, notes: '', done: false, due_on: null, due_at: null, priority: null, stars: 0, position: 0, deleted_at: null, ...extra,
});
const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();

test('smart order puts late work first, then the soonest due, then the more important', () => {
  const now = at('2026-09-15');
  const tasks = [
    task('undated-high', { priority: 'high' }),
    task('tomorrow-low', { due_on: '2026-09-16', priority: 'low' }),
    task('tomorrow-high', { due_on: '2026-09-16', priority: 'high' }),
    task('late', { due_on: '2026-09-12' }),
    task('today-timed', { due_on: '2026-09-15', due_at: new Date(at('2026-09-15', 17)).toISOString() }),
  ];
  assert.deepEqual(sortTasks(tasks, { key: 'smart', desc: false }, now).map((t) => t.id), ['late', 'today-timed', 'tomorrow-high', 'tomorrow-low', 'undated-high']);
  assert.deepEqual(sortTasks(tasks, { key: 'priority', desc: false }, now).map((t) => t.id).slice(0, 2), ['tomorrow-high', 'undated-high']);
  assert.equal(sortTasks(tasks, { key: 'due', desc: true }, now)[0].id, 'undated-high');
  assert.deepEqual(sortTasks([task('b'), task('a10'), task('a9')], { key: 'title', desc: false }, now).map((t) => t.id), ['a9', 'a10', 'b']);
});

test('filters combine, and inbox and "none" mean no list, no course and no priority', () => {
  const tasks = [
    task('a', { list_id: 'school', course: 'CS 191', priority: 'high' }),
    task('b', { course: 'cs  191' }),
    task('c', { list_id: 'school' }),
  ];
  assert.deepEqual(filterTasks(tasks, { ...NO_FILTER, course: 'CS 191' }).map((t) => t.id), ['a', 'b']);
  assert.deepEqual(filterTasks(tasks, { ...NO_FILTER, list: INBOX }).map((t) => t.id), ['b']);
  assert.deepEqual(filterTasks(tasks, { list: 'school', course: NONE, priority: NONE }).map((t) => t.id), ['c']);
  assert.deepEqual(courseNames(tasks, [{ id: 't', name: 'Thesis', color: '#000' }]), ['Thesis', 'CS 191']);
});

test('the agenda gives each day with work its own section and skips empty days', () => {
  const now = at('2026-09-15');
  const tasks = [
    task('late', { due_on: '2026-09-10' }),
    task('today-untimed', { due_on: '2026-09-15', priority: 'high' }),
    task('today-early', { due_on: '2026-09-15', due_at: new Date(at('2026-09-15', 9)).toISOString() }),
    task('friday', { due_on: '2026-09-18' }),
    task('far', { due_on: '2026-10-30' }),
    task('whenever'),
  ];
  const sections = agendaSections(tasks, '2026-09-15', { key: 'smart', desc: false }, now);
  assert.deepEqual(sections.map((s) => s.id), ['late', '2026-09-15', '2026-09-18', 'later', 'none']);
  assert.equal(sections[1].title, 'Today');
  assert.deepEqual(sections[1].tasks.map((t) => t.id), ['today-early', 'today-untimed']);
});

test('board columns keep every task somewhere, whatever they split by', () => {
  const now = at('2026-09-15');
  const lists = [{ id: 'school', name: 'School', color: '#00f', position: 0 }];
  const tasks = [task('a', { list_id: 'school', course: 'Thesis', priority: 'high' }), task('b', { list_id: 'gone' }), task('c')];
  const byList = boardColumns(tasks, 'list', lists, [], { key: 'smart', desc: false }, now);
  assert.deepEqual(byList.map((c) => [c.id, c.tasks.length]), [[INBOX, 2], ['school', 1]]);
  const byCourse = boardColumns(tasks, 'course', lists, [{ id: 't', name: 'Thesis', color: '#0a0' }, { id: 'm', name: 'Math', color: '#a00' }], { key: 'smart', desc: false }, now);
  assert.deepEqual(byCourse.map((c) => [c.title, c.tasks.length]), [['Thesis', 1], ['Math', 0], ['No course', 2]]);
  const byPriority = boardColumns(tasks, 'priority', lists, [], { key: 'smart', desc: false }, now);
  assert.equal(byPriority.reduce((n, c) => n + c.tasks.length, 0), 3);
});

test('the Today card cycles late work first, then the week by importance', () => {
  const tasks = [
    task('next-week-high', { due_on: '2026-09-30', priority: 'high' }),
    task('soon-low', { due_on: '2026-09-16', priority: 'low' }),
    task('soon-high', { due_on: '2026-09-18', priority: 'high' }),
    task('late', { due_on: '2026-09-14' }),
    task('done', { due_on: '2026-09-15', done: true }),
  ];
  assert.deepEqual(upcomingCycle(tasks, '2026-09-15', '2026-09-22').map((t) => t.id), ['late', 'soon-high', 'soon-low', 'next-week-high']);
  // Two tasks due far away still give the card something to turn to.
  assert.deepEqual(upcomingCycle([task('far', { due_on: '2026-12-01' }), task('farther', { due_on: '2026-12-09' })], '2026-09-15', '2026-09-22').map((t) => t.id), ['far', 'farther']);
});

test('deadlines count down to the second, with days, and keep counting once late', () => {
  const due = deadlineOf(task('a', { due_on: '2026-09-17' }))!;
  assert.equal(new Date(due).getHours(), 23);
  const now = new Date(2026, 8, 15, 19, 46, 37).getTime();
  assert.deepEqual(deadlineClock(due, now), { text: '2d 04:13:22', late: false });
  assert.deepEqual(deadlineClock(now - 3_725_000, now), { text: '01:02:05', late: true });
  assert.equal(deadlineOf(task('b')), null);
  assert.deepEqual(hashtags('Essay #draft', 'see #Draft and #cs-191 but not a#b'), ['draft', 'cs-191']);
});

test('the Up next bar measures the gap before an event, then the event itself', () => {
  const start = new Date(at('2026-09-15', 14)).toISOString(), end = new Date(at('2026-09-15', 16)).toISOString();
  const previousEnd = new Date(at('2026-09-15', 10)).toISOString();
  const waiting = eventCountdown({ starts_at: start, ends_at: end }, previousEnd, at('2026-09-15', 12));
  assert.equal(waiting.ongoing, false);
  assert.equal(waiting.share, 0.5);
  assert.equal(countdownText(waiting.msLeft), '2h 00m');
  const during = eventCountdown({ starts_at: start, ends_at: end }, previousEnd, at('2026-09-15', 15));
  assert.equal(during.ongoing, true);
  assert.equal(during.share, 0.5);
  assert.equal(countdownText(90_500), '1m 30s');
  assert.equal(countdownText(-5), '0s');
});

test('scopes: today takes in late work, done shows only finished tasks, lists and courses match', () => {
  const tasks = [
    task('late', { due_on: '2026-09-12', list_id: 'school' }),
    task('today', { due_on: '2026-09-15', course: 'CS 191', stars: 2 }),
    task('friday', { due_on: '2026-09-18' }),
    task('far', { due_on: '2026-10-30' }),
    task('undated'),
    task('finished', { due_on: '2026-09-15', done: true }),
  ];
  const ids = (scope: Parameters<typeof inScope>[1]) => tasks.filter((t) => inScope(t, scope, '2026-09-15', '2026-09-22')).map((t) => t.id);
  assert.deepEqual(ids('today'), ['late', 'today']);
  assert.deepEqual(ids('upcoming'), ['friday']);
  assert.deepEqual(ids('overdue'), ['late']);
  assert.deepEqual(ids('nodate'), ['undated']);
  assert.deepEqual(ids('starred'), ['today']);
  assert.deepEqual(ids('done'), ['finished']);
  assert.deepEqual(ids('list:school'), ['late']);
  assert.deepEqual(ids('list:inbox'), ['today', 'friday', 'far', 'undated']);
  assert.deepEqual(ids('course:cs 191'), ['today']);
  assert.deepEqual(searchTasks(tasks, 'CS to').map((t) => t.id), ['today']);
});

test('the calendar timers follow the event now or next, and count today down to 11:59 PM', () => {
  const iso = (h: number, m = 0) => new Date(2026, 8, 15, h, m).toISOString();
  const events = [
    { id: 'all-day', starts_at: iso(0), ends_at: iso(23, 59), all_day: true },
    { id: 'lecture', starts_at: iso(9), ends_at: iso(10, 30) },
    { id: 'lab', starts_at: iso(13), ends_at: iso(15) },
    { id: 'gone', starts_at: iso(11), ends_at: iso(12), deleted_at: iso(8) },
  ];
  const at = (h: number, m = 0) => new Date(2026, 8, 15, h, m).getTime();
  assert.deepEqual([nextTimedEvent(events, at(8)).next?.id, nextTimedEvent(events, at(8)).previousEnd], ['lecture', null]);
  assert.equal(nextTimedEvent(events, at(9, 30)).next?.id, 'lecture');
  assert.deepEqual([nextTimedEvent(events, at(11)).next?.id, nextTimedEvent(events, at(11)).previousEnd], ['lab', iso(10, 30)]);
  assert.equal(nextTimedEvent(events, at(16)).next, null);
  const noon = dayCountdown(at(12));
  assert.equal(noon.msLeft, (11 * 60 + 59) * 60_000);
  assert.ok(Math.abs(noon.share - 720 / 1439) < 1e-9);
  assert.equal(dayCountdown(at(23, 59) + 30_000).msLeft, 0);
});
