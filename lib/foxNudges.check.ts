import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextNudge, reactionNudge, claimNudge, freshLog, nudgeLine, buildFacts, foxSchedule, mayShow, DEFAULT_FOX_TIMES, type Facts, type FoxEvent, type Nudge } from './foxNudges.ts';

const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m);
const none: Facts = { dueToday: [], overdue: [], events: [], doneToday: 0, unfinishedToday: [] };
const log0 = freshLog(null, '2026-11-05');

test('the first check of the day is the morning plan, once', () => {
  const n = nextNudge(at(9), none, log0, DEFAULT_FOX_TIMES);
  assert.equal(n?.kind, 'morning');
  assert.match(n!.text, /clear/i);
  assert.equal(nextNudge(at(9), none, { ...log0, morning: true }, DEFAULT_FOX_TIMES), null);
});
test('no morning plan after the evening time; the wrap-up comes instead', () => {
  const n = nextNudge(at(21, 5), { ...none, unfinishedToday: [{ id: 't1', title: 'Essay' }] }, log0, DEFAULT_FOX_TIMES);
  assert.equal(n?.kind, 'evening');
  assert.deepEqual(n?.moveIds, ['t1']);
});
test('an evening with nothing unfinished has no move', () => {
  assert.equal(nextNudge(at(21, 5), none, log0, DEFAULT_FOX_TIMES)?.moveIds, undefined);
});
test('overdue: at most 3 a day, 3 hours apart, never 22:00 to 07:00', () => {
  const f = { ...none, overdue: ['Lab report'] };
  const day = { ...log0, morning: true };
  assert.equal(nextNudge(at(10), f, day, DEFAULT_FOX_TIMES)?.kind, 'overdue');
  assert.equal(nextNudge(at(10), f, { ...day, overdue: 3 }, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(12), f, { ...day, overdue: 1, lastOverdueAt: at(10).getTime() }, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(6, 30), f, day, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(22, 30), f, { ...day, evening: true }, DEFAULT_FOX_TIMES), null);
});
test('nothing overdue means no overdue nudge', () => {
  assert.equal(nextNudge(at(10), none, { ...log0, morning: true }, DEFAULT_FOX_TIMES), null);
});
test('a new day starts a fresh log', () => {
  const old = { ...log0, morning: true, overdue: 3 };
  assert.equal(freshLog(old, '2026-11-05'), old);
  assert.deepEqual(freshLog(old, '2026-11-06'), freshLog(null, '2026-11-06'));
});
test('reactions: once per event, one per 10 minutes', () => {
  const e: FoxEvent = { kind: 'task_done', id: 't1', title: 'Essay' };
  const n = reactionNudge(e, log0, 1_000_000);
  assert.equal(n?.kind, 'reaction');
  assert.equal(reactionNudge(e, { ...log0, seen: [n!.key] }, 2_000_000), null);
  assert.equal(reactionNudge({ ...e, id: 't2' }, { ...log0, lastReactionAt: 1_000_000 }, 1_000_000 + 599_999), null);
});
test('a claim is refused the second time, as from another window', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const n = nextNudge(at(9), none, log0, DEFAULT_FOX_TIMES)!;
  assert.equal(claimNudge(store, n, at(9)), true);
  assert.equal(claimNudge(store, n, at(9)), false);
});
test('templates list five titles as bullets, one a line, then the rest as a count', () => {
  const n = nextNudge(at(9), { ...none, dueToday: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], events: [{ title: 'Lab', time: '10:00' }] }, log0, DEFAULT_FOX_TIMES)!;
  assert.match(n.text, /Due today:\n• A\n• B\n• C\n• D\n• E\n• and 2 more/);
  assert.match(n.text, /On the calendar:\n• 10:00 Lab/);
  assert.doesNotMatch(n.text, /\bF\b/);
  assert.ok(n.text.endsWith(n.list!));
  const e = nextNudge(at(21), { ...none, unfinishedToday: [{ id: 'x', title: 'Essay' }, { id: 'y', title: 'Lab' }] }, log0, DEFAULT_FOX_TIMES)!;
  assert.match(e.text, /Still open:\n• Essay\n• Lab/);
  const o = nextNudge(at(12), { ...none, overdue: ['Lab'] }, { ...log0, morning: true }, DEFAULT_FOX_TIMES)!;
  assert.equal(o.kind, 'overdue');
  assert.match(o.text, /\n• Lab$/);
});
test('Gemini writes the opening; the exact bullets stay under it, and a list it wrote is dropped', async () => {
  const n: Nudge = { key: 'k', kind: 'morning', text: 'T\n• A', list: 'Due today:\n• A' };
  assert.equal(await nudgeLine(n, async () => 'Essay first.'), 'Essay first.\nDue today:\n• A');
  assert.equal(await nudgeLine(n, async () => 'Busy one.\n- A\n* B'), 'Busy one.\nDue today:\n• A');
  assert.equal(await nudgeLine(n, async () => '• A'), n.text);
});

const tn: Nudge = { key: 'k', kind: 'morning', text: 'Template' };
test('the Gemini line wins when it comes in time', async () => assert.equal(await nudgeLine(tn, async () => 'Fresh'), 'Fresh'));
test('a failure falls back to the template', async () => assert.equal(await nudgeLine(tn, async () => { throw new Error('no_key'); }), 'Template'));
test('a slow answer falls back to the template', async () => assert.equal(await nudgeLine(tn, () => new Promise(r => setTimeout(() => r('Late'), 50)), 10), 'Template'));
test('an empty answer falls back to the template', async () => assert.equal(await nudgeLine(tn, async () => '  '), 'Template'));

test('facts come from open tasks and today\'s Important timed events, deleted ones left out', () => {
  const now = at(9);
  const f = buildFacts([
    { id: 'a', title: 'Essay', done: false, due_on: '2026-11-05', deleted_at: null },
    { id: 'b', title: 'Lab', done: false, due_on: '2026-11-03', deleted_at: null },
    { id: 'c', title: 'Done one', done: true, due_on: '2026-11-05', deleted_at: null, completed_at: new Date(2026, 10, 5, 8).toISOString() },
    { id: 'd', title: 'Gone', done: false, due_on: '2026-11-05', deleted_at: '2026-11-04T00:00:00Z' },
  ], [
    { title: 'Standup', starts_at: new Date(2026, 10, 5, 10, 30).toISOString(), all_day: false, deleted_at: null, important: true },
    { title: 'Travel', starts_at: new Date(2026, 10, 5, 9, 30).toISOString(), all_day: false, deleted_at: null },
    { title: 'Holiday', starts_at: new Date(2026, 10, 5).toISOString(), all_day: true, deleted_at: null, important: true },
  ], now);
  assert.deepEqual(f.dueToday, ['Essay']);
  assert.deepEqual(f.overdue, ['Lab']);
  assert.deepEqual(f.unfinishedToday, [{ id: 'a', title: 'Essay' }]);
  assert.equal(f.doneToday, 1);
  assert.deepEqual(f.events, [{ title: 'Standup', time: '10:30' }]);
});

test('the phone gets tomorrow morning and the next evening', () => {
  const a = foxSchedule(new Date(2026, 10, 5, 22, 0), { dueTomorrow: ['Essay', 'Lab', 'Quiz'] }, DEFAULT_FOX_TIMES);
  assert.equal(a.length, 2);
  assert.deepEqual(a.map(x => x.at!.getDate()), [6, 6]);
  assert.equal(a[0].at!.getHours(), 8);
  assert.match(a[0].body, /3 due today:\n• Essay\n• Lab\n• Quiz/);
  const b = foxSchedule(new Date(2026, 10, 5, 9, 0), { dueTomorrow: [] }, DEFAULT_FOX_TIMES);
  assert.equal(b[1].at!.getDate(), 5);
  assert.equal(b[1].at!.getHours(), 21);
});

test('F2: an app left open past midnight waits for the morning time; an open does not', () => {
  assert.equal(nextNudge(at(0, 1), none, log0, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(7, 59), none, log0, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(8), none, log0, DEFAULT_FOX_TIMES)?.kind, 'morning');
  assert.equal(nextNudge(at(6), none, log0, DEFAULT_FOX_TIMES, true)?.kind, 'morning');
});
test('F3: the morning plan holds off the overdue nudge for its 3 hours', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const f = { ...none, overdue: ['Lab'] };
  assert.equal(claimNudge(store, nextNudge(at(9), f, log0, DEFAULT_FOX_TIMES)!, at(9)), true);
  const log = JSON.parse(mem.get('sorro-fox-nudges')!);
  assert.equal(nextNudge(at(9, 1), f, log, DEFAULT_FOX_TIMES), null);
  assert.equal(nextNudge(at(12), f, log, DEFAULT_FOX_TIMES)?.kind, 'overdue');
});
test('F4: overdue tasks mean the day is not clear', () => {
  assert.doesNotMatch(nextNudge(at(9), { ...none, overdue: ['Lab'] }, log0, DEFAULT_FOX_TIMES)!.text, /clear/i);
});
test('F5: offline, device prefs are enough; online, wait for the account', () => {
  assert.equal(mayShow({ loaded: false, online: false, proactive: undefined, visible: true, notify: false }), true);
  assert.equal(mayShow({ loaded: false, online: true, proactive: undefined, visible: true, notify: false }), false);
  assert.equal(mayShow({ loaded: true, online: true, proactive: false, visible: true, notify: false }), false);
});
test('F1: a hidden window claims nothing unless notifications are on', () => {
  assert.equal(mayShow({ loaded: true, online: true, proactive: true, visible: false, notify: false }), false);
  assert.equal(mayShow({ loaded: true, online: true, proactive: true, visible: false, notify: true }), true);
});
