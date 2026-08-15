'use client';

import { queryClient } from './offline';

/**
 * Development-only preview data.
 *
 * Every call site is guarded by `process.env.NODE_ENV !== 'production'`, which
 * Next.js replaces at build time — so in a production build the guard folds to
 * `false` and this module is dead-code-eliminated. It cannot be switched on by
 * an environment variable in prod, which is why this exists instead of a
 * password account or a runtime auth bypass.
 *
 * Enable locally with NEXT_PUBLIC_DEV_FIXTURES=1 in .env.local.
 */

/**
 * A module-level const, not a function call. Next inlines process.env.NODE_ENV
 * at build time, so in production this folds to the literal `false` — which is
 * what lets the minifier prove every guard below is unreachable and drop this
 * whole file's data. As a function it survived inlining once lib/events.ts
 * imported from here, and several kilobytes of fake student data shipped.
 */
export const DEV_FIXTURES =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_FIXTURES === '1';

export const devFixturesOn = () => DEV_FIXTURES;

const iso = (dayOffset: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const ymdOf = (o: number) => {
  const d = new Date();
  d.setDate(d.getDate() + o);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const LIST = {
  school: 'a2e14db5-e6ab-47be-bca2-c2e07459d318',
  personal: '13acaf10-3fc6-4777-817b-77872397abe8',
  errands: '7b6305bb-8174-40ce-a6cb-d6bfbf10d6e3',
};

/**
 * Fixture data by key prefix, for queries whose key is computed at call time.
 *
 * Pre-seeding the cache covers every fixed key, but a query like
 * `['events', <week>, <days>]` names a key nobody can predict, and TanStack's
 * *defaults* cannot help — an explicit queryFn always beats a default one. So
 * those queryFns ask here first.
 */
const store = new Map<string, unknown>();

export function fixture<T>(prefix: string): T | null {
  if (!DEV_FIXTURES) return null;
  return (store.get(prefix) as T | undefined) ?? null;
}

export function seedDevFixtures() {
  if (!DEV_FIXTURES) return;

  // Pre-seeding the cache alone is not enough: a component that mounts before
  // the seed, or any refetch that slips through, would hit Supabase and get the
  // empty result a signed-out client returns. Overriding the *queryFn* for each
  // key means the fixture is the answer however the query is reached.
  const seed = (key: readonly unknown[], data: unknown) => {
    store.set(String(key[0]), data);
    queryClient.setQueryDefaults(key, {
      queryFn: async () => data,
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    });
    queryClient.setQueryData(key, data);
  };

  seed(['lists'], [
    { id: LIST.school, name: 'School', color: '#7C8CFF', position: 0 },
    { id: LIST.personal, name: 'Personal', color: '#FFC24B', position: 1 },
    { id: LIST.errands, name: 'Errands', color: '#34D9A0', position: 2 },
  ]);

  const task = (id: string, list: string, title: string, due: string, priority: string, stars: number, notes = '') =>
    ({ id, list_id: list, title, notes, done: false, due_on: due, priority, stars, position: 0, deleted_at: null });

  seed(['tasks'], [
    task('t1', LIST.school, 'Finish CS 191 problem set 4', ymdOf(-4), 'high', 4, 'Sections 3 and 5 only.'),
    task('t2', LIST.school, 'Email Prof. Santos about regrade', ymdOf(-2), 'med', 2),
    task('t3', LIST.errands, 'Return library books', ymdOf(-1), 'low', 0),
    { ...task('t4', LIST.school, 'Draft thesis outline', ymdOf(0), 'high', 5, 'Three chapters, bullet form.'), due_at: iso(0, 11) },
    task('t5', LIST.personal, 'Gym — push day', ymdOf(0), 'med', 0),
    task('t6', LIST.school, 'Read Chapter 7 — algorithms', ymdOf(0), 'low', 1),
    { ...task('t7', LIST.school, 'Capstone group sync notes', ymdOf(1), 'med', 3), due_at: iso(1, 17, 30) },
    task('t8', LIST.errands, 'Buy notebook + pens', ymdOf(2), 'low', 0),
    task('t9', LIST.personal, 'Call home', ymdOf(3), 'med', 2),
  ]);

  const ev = (id: string, title: string, d: number, sh: number, sm: number, eh: number, em: number, loc: string, color: string, source = 'app') =>
    ({ id, title, starts_at: iso(d, sh, sm), ends_at: iso(d, eh, em), all_day: false, location: loc, color, source, remind_minutes: null, snoozed_until: null, deleted_at: null });

  // Monday of this week, so day offsets below read as weekdays.
  const mon = new Date();
  mon.setHours(0, 0, 0, 0);
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const off = Math.round((mon.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  const D = (weekday: number) => off + weekday;   // 0 = Monday

  /**
   * Seeded on the ['events'] prefix so every window — the 7-day grid and the
   * 42-day month — resolves to the same set; each view filters by day itself.
   * The three Capstone standups are deliberately consecutive at the same hour,
   * which is what the spanning-chip grouping pass collapses into one bar.
   */
  seed(['events'], [
    ev('e1', 'CS 150 Lecture', D(0), 9, 0, 10, 30, "Eng'g 214", '#7C8CFF'),
    ev('e2', 'Math 114', D(0), 13, 0, 14, 30, 'Math 201', '#7C8CFF'),
    ev('e3', 'Capstone standup', D(2), 7, 30, 8, 30, 'Meet', '#B07CFF'),
    ev('e4', 'Capstone standup', D(3), 7, 30, 8, 30, 'Meet', '#B07CFF'),
    ev('e5', 'Capstone standup', D(4), 7, 30, 8, 30, 'Meet', '#B07CFF'),
    ev('e6', 'Deep work — thesis outline', D(1), 13, 0, 14, 30, 'Library 3F', '#34D9A0'),
    ev('e7', 'CS 191 Lecture', D(1), 15, 0, 16, 30, "Eng'g 302", '#7C8CFF'),
    ev('e8', 'Group call — capstone', D(1), 19, 30, 20, 30, 'Meet', '#B07CFF'),
    ev('e9', 'CS 165 Lab', D(2), 10, 0, 12, 0, 'CS Lab 2', '#7C8CFF'),
    ev('e10', 'STS 1', D(2), 16, 0, 17, 30, 'Palma 105', '#7C8CFF'),
    ev('e11', 'CS 150 Lecture', D(3), 9, 0, 10, 30, "Eng'g 214", '#7C8CFF'),
    ev('e12', 'Consultation — Prof. Alonzo', D(3), 14, 0, 15, 0, 'Faculty 12', '#FFC24B'),
    ev('e13', 'CS 191 Lecture', D(4), 15, 0, 16, 30, "Eng'g 302", '#7C8CFF'),
    ev('e14', 'CSSS general assembly', D(4), 17, 30, 19, 0, 'AVR', '#B07CFF'),
    ev('e15', 'Gym with Rene', D(5), 8, 0, 9, 30, 'UP Gym', '#FF6B6B', 'gcal_ics'),
    { id: 'e16', title: 'STS paper due', starts_at: iso(D(1), 0), ends_at: iso(D(1), 23, 59), all_day: true, location: '', color: '#FF6B6B', source: 'app', remind_minutes: null, snoozed_until: null, deleted_at: null },
    { id: 'e17', title: 'Math 114 midterm', starts_at: iso(D(4), 0), ends_at: iso(D(4), 23, 59), all_day: true, location: '', color: '#FFC24B', source: 'app', remind_minutes: null, snoozed_until: null, deleted_at: null },
  ]);

  seed(['habits'], [
    { id: 'h1', name: 'Read 20 pages', color: '#FF6B6B', kind: 'bin', target: null, position: 0, archived_at: null },
    { id: 'h2', name: 'Drink 8 glasses', color: '#38D6F2', kind: 'bin', target: null, position: 1, archived_at: null },
    { id: 'h3', name: 'No phone before bed', color: '#B07CFF', kind: 'bin', target: null, position: 2, archived_at: null },
  ]);
  const ticks: { habit_id: string; on_date: string; value: number }[] = [];
  for (let g = 0; g <= 5; g++) ticks.push({ habit_id: 'h1', on_date: ymdOf(-g), value: 1 });
  for (let g = 1; g <= 9; g++) if (g !== 4) ticks.push({ habit_id: 'h2', on_date: ymdOf(-g), value: 1 });
  for (let g = 0; g <= 12; g++) if (g % 3) ticks.push({ habit_id: 'h3', on_date: ymdOf(-g), value: 1 });
  for (const d of [7, 30, 365]) seed(['habit_ticks', d], ticks);

  seed(['scratch'], [
    { id: 's1', text: 'Ask about the thesis template margins', tag: 'Note', color: '#38D6F2', pinned: true, position: 0, created_at: iso(0, 9) },
    { id: 's2', text: 'Bus leaves at 6:40, not 6:50', tag: 'Idea', color: '#FFC24B', pinned: false, position: 1, created_at: iso(-1, 11) },
    { id: 's3', text: 'Library closes early on Fridays', tag: 'Todo', color: '#34D9A0', pinned: false, position: 2, created_at: iso(-2, 14) },
  ]);

  seed(['accounts'], [
    { id: 'a1', name: 'Cash', kind: 'cash', color: '#34D9A0' },
    { id: 'a2', name: 'Maribank', kind: 'ewallet', color: '#7C8CFF' },
  ]);
  seed(['budgets'], [
    { id: 'b1', category: 'Food', period: 'monthly', amount_centavos: 600000 },
    { id: 'b2', category: 'Transport', period: 'monthly', amount_centavos: 200000 },
  ]);
  seed(['transactions'], [
    { id: 'x1', account_id: 'a1', name: 'Jeepney fare', amount_centavos: 2400, category: 'Transport', occurred_at: iso(-1, 8), deleted_at: null },
    { id: 'x2', account_id: 'a1', name: 'Lunch — canteen', amount_centavos: 9500, category: 'Food', occurred_at: iso(-1, 12), deleted_at: null },
    { id: 'x3', account_id: 'a2', name: 'Groceries', amount_centavos: 87500, category: 'Food', occurred_at: iso(-5, 17), deleted_at: null },
  ]);
  seed(['to_buy'], [
    { id: 'y1', name: 'Notebook + pens', amount_centavos: 18000, bought_at: null },
  ]);

  seed(['home_projects'], [
    { id: 'p1', name: 'Capstone — routing app', progress: 45, color: '#B07CFF' },
    { id: 'p2', name: 'Portfolio site', progress: 78, color: '#34D9A0' },
  ]);
  seed(['home_recent_notes'], [
    { id: 'n1', title: 'Normalisation — 3NF', updated_at: iso(0, 13) },
    { id: 'n2', title: 'Eigenvectors and diagonalisation', updated_at: iso(-1, 16) },
  ]);

  const mins = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  seed(['notifications'], [
    { id: 'f1', kind: 'canvas', title: 'CS 191 — Proposal defence moved to Friday', body: 'CS 191 · Bring two printed copies of the revised scope. Slots are first come, first served.', href: null, source: 'canvas_lms', read_at: null, created_at: mins(14) },
    { id: 'f2', kind: 'task', title: 'Problem set 4 is overdue', body: 'Was due four days ago. Still sitting in School.', href: '/tasks/', source: 'app', read_at: null, created_at: mins(52) },
    { id: 'f3', kind: 'challenge', title: 'Rain T. passed you in 6 a.m. club', body: 'You are #2 with 12. One more morning takes it back.', href: '/community/', source: 'app', read_at: null, created_at: mins(140) },
    { id: 'f4', kind: 'canvas', title: 'STS 1 — Reading list for week 12 posted', body: 'STS 1 · Chapters 7 and 8, plus the Ellul excerpt in Files.', href: null, source: 'canvas_lms', read_at: null, created_at: mins(320) },
    { id: 'f5', kind: 'event', title: 'Capstone standup in 30 minutes', body: 'Meet · 7:30 AM tomorrow', href: '/calendar/', source: 'app', read_at: mins(400), created_at: mins(420) },
    { id: 'f6', kind: 'social', title: 'Jules replied to your thread', body: '“We scoped to one corridor and wrote the network bit as future work.”', href: '/community/', source: 'app', read_at: mins(600), created_at: mins(610) },
  ]);

  seed(['integrations'], []);

  const proj = (id: string, name: string, tag: string, color: string, progress: number, position: number, deadline: string | null = null) =>
    ({ id, name, tag, color, progress, position, deadline });
  seed(['projects'], [
    proj('p1', 'Capstone — routing app', 'School', '#B07CFF', 45, 0, ymdOf(21)),
    proj('p2', 'CSSS orientation', 'Org', '#38D6F2', 80, 1),
    proj('p3', 'Jeepney tracker', 'Side', '#34D9A0', 20, 2),
    proj('p4', 'OS machine project', 'School', '#7C8CFF', 60, 3, ymdOf(9)),
    proj('p5', 'Portfolio site', 'Personal', '#FFC24B', 78, 4),
    proj('p6', 'Thesis reading list', 'Research', '#FF6FA8', 15, 5),
  ]);
  seed(['cards'], [
    { id: 'k1', project_id: 'p1', title: 'GTFS import rewrite', col: 'doing', color: '#B07CFF', position: 0 },
    { id: 'k2', project_id: 'p1', title: 'Limitations section', col: 'todo', color: '#B07CFF', position: 1 },
    { id: 'k3', project_id: 'p1', title: 'Book the defence slot', col: 'todo', color: '#FF6B6B', position: 2 },
    { id: 'k4', project_id: 'p1', title: 'Corridor map export', col: 'done', color: '#34D9A0', position: 3 },
    { id: 'k5', project_id: 'p2', title: 'Book the AVR', col: 'done', color: '#38D6F2', position: 0 },
    { id: 'k6', project_id: 'p2', title: 'Print the deck', col: 'doing', color: '#38D6F2', position: 1 },
    { id: 'k7', project_id: 'p3', title: 'Pick a map tile source', col: 'todo', color: '#34D9A0', position: 0 },
  ]);
  seed(['project_comments'], []);

  seed(['ranked'], { rp: 1340, peak_rp: 1425, wins: 7, losses: 5, season: 's1' });
  const chal = (
    id: string, name: string, description: string, metric: string, rule: string,
    target: number | null, unit: string, color: string, startOff: number, endOff: number,
    settled: string | null = null, winner: string | null = null,
  ) => ({
    id, owner_id: 'me', name, description, habit_label: '', metric, rule, target, unit,
    starts_on: ymdOf(startOff), ends_on: ymdOf(endOff), color,
    visibility: 'public', join_code: null, ranked: true, settled_at: settled, winner_id: winner,
  });
  seed(['challenges'], [
    chal('ch1', '6 a.m. club', 'Wake before six. Photo of the clock or it did not happen.', 'habit', 'most', null, 'days', '#FFC24B', -10, 4),
    chal('ch2', 'No-skip gym', 'Three sessions a week, no excuses, for the rest of the term.', 'body', 'most', null, 'sessions', '#FF6B6B', -17, 11),
    chal('ch3', 'Read 20 pages', 'Daily reading. First to a hundred pages takes it.', 'habit', 'first_to', 100, 'pages', '#34D9A0', 2, 30),
    chal('ch4', 'Inbox to zero', 'Whoever clears the most tasks before the midterms.', 'task', 'most', null, 'tasks', '#7C6CFF', -30, -2, iso(-1, 20), 'rt'),
  ]);
  const mem = (challenge_id: string, user_id: string, display_name: string, progress: number, rp_delta = 0, placed: number | null = null) =>
    ({ challenge_id, user_id, display_name, habit_id: null, progress, rp_delta, placed, joined_at: iso(-10, 8) });
  seed(['challenge_members'], [
    mem('ch1', 'rt', 'Rain T.', 14), mem('ch1', 'me', 'You', 12), mem('ch1', 'jl', 'Jules L.', 9), mem('ch1', 'bc', 'Bea C.', 6),
    mem('ch2', 'jl', 'Jules L.', 9), mem('ch2', 'me', 'You', 8), mem('ch2', 'rt', 'Rain T.', 5),
    mem('ch3', 'bc', 'Bea C.', 0), mem('ch3', 'csss', 'CSSS', 0),
    mem('ch4', 'rt', 'Rain T.', 41, 88, 1), mem('ch4', 'me', 'You', 37, 40, 2), mem('ch4', 'jl', 'Jules L.', 22, 14, 3),
  ]);

  seed(['notebooks'], [
    { id: 'nb1', name: '3rd year', color: '#7C8CFF', position: 0 },
    { id: 'nb2', name: 'Capstone research', color: '#B07CFF', position: 1 },
  ]);
  seed(['sections'], [
    { id: 'sc1', notebook_id: 'nb1', name: 'CS 191', position: 0 },
    { id: 'sc2', notebook_id: 'nb1', name: 'STS 1', position: 1 },
    { id: 'sc3', notebook_id: 'nb2', name: 'Reading', position: 0 },
  ]);
  seed(['notes'], [
    { id: 'nt1', section_id: 'sc1', title: 'Sprint planning', body: '', flag: null, position: 0, updated_at: iso(0, 11) },
    { id: 'nt2', section_id: 'sc1', title: 'Normalisation — 3NF', body: '', flag: null, position: 1, updated_at: iso(0, 13) },
    { id: 'nt3', section_id: 'sc2', title: 'Ellul reading', body: '', flag: null, position: 0, updated_at: iso(-1, 9) },
    { id: 'nt4', section_id: 'sc3', title: 'Routing literature', body: '', flag: null, position: 0, updated_at: iso(-2, 15) },
  ]);
  const blk = (id: string, note_id: string, kind: string, text: string, position: number, done = false) =>
    ({ id, note_id, kind, text, done, position });
  seed(['note_blocks', 'nt1'], [
    blk('b1', 'nt1', 'h1', 'Sprint planning', 0),
    blk('b2', 'nt1', 'text', 'Scope is **one corridor**. The network-level evaluation goes in future work — see [[Routing literature]].', 1),
    blk('b3', 'nt1', 'h2', 'This week', 2),
    blk('b4', 'nt1', 'todo', 'Rebuild the GTFS import with the 2026 feed', 3, true),
    blk('b5', 'nt1', 'todo', 'Draft the limitations section', 4),
    blk('b6', 'nt1', 'todo', 'Book the defence slot — Friday', 5),
    blk('b7', 'nt1', 'callout', 'Alonzo wants the rubric line quoted verbatim in the limitations.', 6),
    blk('b8', 'nt1', 'h2', 'Open questions', 7),
    blk('b9', 'nt1', 'bullet', 'Do we cite the consultation date, or the email?', 8),
    blk('b10', 'nt1', 'bullet', 'Is 4,318 stops enough for the sample claim?', 9),
    blk('b11', 'nt1', 'quote', 'Six weeks of GTFS wrangling for one screenshot.', 10),
    blk('b12', 'nt1', 'code', 'SELECT stop_id, COUNT(*)\nFROM stop_times\nGROUP BY stop_id\nHAVING COUNT(*) > 40;', 11),
  ]);
  seed(['note_blocks', 'nt2'], [
    blk('c1', 'nt2', 'h1', 'Normalisation — 3NF', 0),
    blk('c2', 'nt2', 'text', 'Third normal form finally clicked. Every non-key column depends on *the key, the whole key, and nothing but the key*.', 1),
    blk('c3', 'nt2', 'number', 'Remove repeating groups → 1NF', 2),
    blk('c4', 'nt2', 'number', 'Remove partial dependencies → 2NF', 3),
    blk('c5', 'nt2', 'number', 'Remove transitive dependencies → 3NF', 4),
    blk('c6', 'nt2', 'text', 'Related: [[Sprint planning]]', 5),
  ]);
  seed(['note_blocks', 'nt3'], [blk('d1', 'nt3', 'text', 'Technique as an autonomous force. Compare with the routing work in [[Sprint planning]].', 0)]);
  seed(['note_blocks', 'nt4'], [blk('e1', 'nt4', 'text', 'Papers on offline-first transit routing.', 0)]);
  seed(['backlinks', 'nt1'], [{ id: 'nt2', title: 'Normalisation — 3NF' }, { id: 'nt3', title: 'Ellul reading' }]);
  seed(['backlinks', 'nt4'], [{ id: 'nt1', title: 'Sprint planning' }]);

  seed(['canvases'], [
    { id: 'c1', name: 'Capstone map', color: '#7C6CFF', position: 0, viewport: { x: 40, y: 30, z: 1 }, updated_at: iso(0, 10) },
    { id: 'c2', name: 'Thesis argument', color: '#34D9A0', position: 1, viewport: { x: 0, y: 0, z: 1 }, updated_at: iso(-3, 16) },
  ]);
  const node = (id: string, text: string, x: number, y: number, w = 180, h = 80, color = '#7C6CFF', kind = 'text') =>
    ({ id, canvas_id: 'c1', kind, text, x, y, w, h, color, note_id: null, z: 0 });
  seed(['canvas_nodes', 'c1'], [
    node('g1', 'Routing engine', 20, 20, 400, 300, '#34D9A0', 'group'),
    node('cn1', 'Offline tiles — six weeks of GTFS wrangling', 50, 70, 200, 90),
    node('cn2', 'Corridor evaluation only.\nNetwork-level is future work.', 50, 190, 200, 90, '#FFC24B'),
    node('cn3', 'Alonzo signed off on the narrowed scope', 470, 70, 200, 80, '#FF6B6B'),
    node('cn4', 'Dataset: 4,318 jeepney stops', 470, 200, 200, 70, '#38D6F2'),
    node('cn5', 'Defence — Friday, two printed copies', 470, 320, 200, 70, '#FF6FA8'),
  ]);
  seed(['canvas_edges', 'c1'], [
    { id: 'ce1', canvas_id: 'c1', from_node: 'cn1', to_node: 'cn3', from_side: 'right', to_side: 'left', label: 'scope', color: '#7C6CFF' },
    { id: 'ce2', canvas_id: 'c1', from_node: 'cn2', to_node: 'cn4', from_side: 'right', to_side: 'left', label: '', color: '#FFC24B' },
    { id: 'ce3', canvas_id: 'c1', from_node: 'cn3', to_node: 'cn5', from_side: 'bottom', to_side: 'top', label: 'then', color: '#FF6B6B' },
  ]);
  seed(['canvas_nodes', 'c2'], []);
  seed(['canvas_edges', 'c2'], []);

  seed(['java_files'], [
    {
      id: 'j1', name: 'Fibonacci.java', updated_at: iso(-1, 20),
      src: `public class Fibonacci {
    static int fib(int n) {
        if (n < 2) return n;
        return fib(n - 1) + fib(n - 2);
    }

    public static void main(String[] args) {
        for (int i = 0; i < 12; i++) {
            System.out.println(fib(i));
        }
    }
}`,
    },
    {
      id: 'j2', name: 'Grades.java', updated_at: iso(-2, 15),
      src: `public class Grades {
    public static void main(String[] args) {
        int[] scores = {88, 94, 71, 65, 100};
        int total = 0;
        int best = scores[0];

        for (int s : scores) {
            total += s;
            if (s > best) best = s;
        }

        double avg = (double) total / scores.length;
        System.out.printf("Average %.2f, best %d%n", avg, best);

        String grade = avg >= 90 ? "A" : avg >= 80 ? "B" : "C";
        System.out.println("Grade: " + grade);
    }
}`,
    },
    {
      id: 'j3', name: 'Main.java', updated_at: iso(0, 11),
      src: `public class Main {
    public static void main(String[] args) {
        String name = "Mika";
        System.out.println("Hello, " + name + "!");

        int total = 0;
        for (int i = 1; i <= 10; i++) {
            total = total + i;
        }
        System.out.println("Sum of 1..10 = " + total);
    }
}`,
    },
  ]);
}

// Dev-only handle so the preview can be inspected from the console.
if (DEV_FIXTURES && typeof window !== 'undefined') {
  (window as unknown as { qc: typeof queryClient }).qc = queryClient;
}
