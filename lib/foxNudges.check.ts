import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextNudge, reactionNudge, claimNudge, freshLog, nudgeLine, buildFacts, DEFAULT_FOX_TIMES, type Facts, type FoxEvent, type Nudge } from './foxNudges.ts';

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
test('templates name three titles, then the rest as a count', () => {
  const n = nextNudge(at(9), { ...none, dueToday: ['A', 'B', 'C', 'D', 'E'] }, log0, DEFAULT_FOX_TIMES)!;
  assert.match(n.text, /A.*B.*C/);
  assert.match(n.text, /2 more/);
  assert.doesNotMatch(n.text, /\bD\b/);
});

const tn: Nudge = { key: 'k', kind: 'morning', text: 'Template' };
test('the Gemini line wins when it comes in time', async () => assert.equal(await nudgeLine(tn, async () => 'Fresh'), 'Fresh'));
test('a failure falls back to the template', async () => assert.equal(await nudgeLine(tn, async () => { throw new Error('no_key'); }), 'Template'));
test('a slow answer falls back to the template', async () => assert.equal(await nudgeLine(tn, () => new Promise(r => setTimeout(() => r('Late'), 50)), 10), 'Template'));
test('an empty answer falls back to the template', async () => assert.equal(await nudgeLine(tn, async () => '  '), 'Template'));

test('facts come from open tasks and today\'s timed events, deleted ones left out', () => {
  const now = at(9);
  const f = buildFacts([
    { id: 'a', title: 'Essay', done: false, due_on: '2026-11-05', deleted_at: null },
    { id: 'b', title: 'Lab', done: false, due_on: '2026-11-03', deleted_at: null },
    { id: 'c', title: 'Done one', done: true, due_on: '2026-11-05', deleted_at: null, completed_at: new Date(2026, 10, 5, 8).toISOString() },
    { id: 'd', title: 'Gone', done: false, due_on: '2026-11-05', deleted_at: '2026-11-04T00:00:00Z' },
  ], [
    { title: 'Standup', starts_at: new Date(2026, 10, 5, 10, 30).toISOString(), all_day: false, deleted_at: null },
    { title: 'Holiday', starts_at: new Date(2026, 10, 5).toISOString(), all_day: true, deleted_at: null },
  ], now);
  assert.deepEqual(f.dueToday, ['Essay']);
  assert.deepEqual(f.overdue, ['Lab']);
  assert.deepEqual(f.unfinishedToday, [{ id: 'a', title: 'Essay' }]);
  assert.equal(f.doneToday, 1);
  assert.deepEqual(f.events, [{ title: 'Standup', time: '10:30' }]);
});
