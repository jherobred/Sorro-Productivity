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
/** Matches BOT_ID in lib/bot.ts, so the label lights up in the preview too. */
const BOT = '00000000-0000-4000-8000-00000000b07d';

const store = new Map<string, unknown>();

export function fixture<T>(prefix: string): T | null {
  if (!DEV_FIXTURES) return null;
  return (store.get(prefix) as T | undefined) ?? null;
}

export function seedDevFixtures() {
  if (!DEV_FIXTURES) return;

  // Fixtures are a static world. Pages call useQuery with an inline queryFn,
  // which beats the per-key default below, so the first invalidate after a
  // mutation would refetch from a signed-out Supabase and wipe the screen.
  // Nothing to revalidate against here, so invalidation is simply off.
  queryClient.invalidateQueries = (async () => {}) as typeof queryClient.invalidateQueries;

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
    task('t5', LIST.personal, 'Gym · push day', ymdOf(0), 'med', 0),
    task('t6', LIST.school, 'Read Chapter 7 · algorithms', ymdOf(0), 'low', 1),
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
    ev('e6', 'Deep work · thesis outline', D(1), 13, 0, 14, 30, 'Library 3F', '#34D9A0'),
    ev('e7', 'CS 191 Lecture', D(1), 15, 0, 16, 30, "Eng'g 302", '#7C8CFF'),
    ev('e8', 'Group call · capstone', D(1), 19, 30, 20, 30, 'Meet', '#B07CFF'),
    ev('e9', 'CS 165 Lab', D(2), 10, 0, 12, 0, 'CS Lab 2', '#7C8CFF'),
    ev('e10', 'STS 1', D(2), 16, 0, 17, 30, 'Palma 105', '#7C8CFF'),
    ev('e11', 'CS 150 Lecture', D(3), 9, 0, 10, 30, "Eng'g 214", '#7C8CFF'),
    ev('e12', 'Consultation · Prof. Alonzo', D(3), 14, 0, 15, 0, 'Faculty 12', '#FFC24B'),
    ev('e13', 'CS 191 Lecture', D(4), 15, 0, 16, 30, "Eng'g 302", '#7C8CFF'),
    ev('e14', 'CSSS general assembly', D(4), 17, 30, 19, 0, 'AVR', '#B07CFF'),
    ev('e15', 'Gym with Rene', D(5), 8, 0, 9, 30, 'UP Gym', '#FF6B6B', 'gcal_ics'),
    ev('study_s1', 'S1: Wind-down & Hydration', D(1), 14, 40, 15, 30, 'Desk', '#34D9A0'),
    ev('study_s2', 'S2: Reset Nap', D(1), 15, 30, 17, 20, 'Bed', '#8A86A6'),
    ev('study_s3', 'S3: Recovery & Dinner', D(1), 17, 20, 18, 0, 'Kitchen', '#FFC24B'),
    ev('study_s4', 'S4: Study Session 1 (Difficult Concepts)', D(1), 18, 0, 20, 30, 'Desk', '#7C8CFF'),
    ev('study_s5', 'S5: Screen-Free Break', D(1), 20, 30, 21, 0, 'Room', '#34D9A0'),
    ev('study_s6', 'S6: Study Session 2 (Active Recall)', D(1), 21, 0, 23, 15, 'Desk', '#7C8CFF'),
    ev('study_s7', 'S7: Rest Break', D(1), 23, 15, 23, 30, 'Room', '#34D9A0'),
    ev('study_s8', 'S8: Study Session 3 (Summary Review)', D(1), 23, 30, 24, 0, 'Desk', '#7C8CFF'),
    ev('study_s8_2', 'S8: Study Session 3 (Summary Review cont.)', D(2), 0, 0, 0, 30, 'Desk', '#7C8CFF'),
    ev('study_s9', 'S9: Core Night Sleep', D(2), 0, 30, 6, 0, 'Bed', '#8A86A6'),
    ev('study_s10', 'S10: Breakfast & Travel', D(2), 6, 0, 7, 0, 'Transit', '#38D6F2'),
    ev('study_classes', 'Class Hours', D(2), 7, 0, 12, 0, 'Campus', '#7C8CFF'),
    ev('study_s11', 'S11: Final Light Review', D(2), 12, 0, 12, 45, 'Library', '#FFC24B'),
    ev('study_exam', 'Major Course Test', D(2), 13, 0, 15, 0, 'Exam Hall', '#FF6FA8'),
    { id: 'e16', title: 'STS paper due', starts_at: iso(D(1), 0), ends_at: iso(D(1), 23, 59), all_day: true, location: '', color: '#FF6B6B', source: 'app', remind_minutes: null, snoozed_until: null, deleted_at: null },
    { id: 'e17', title: 'Math 114 midterm', starts_at: iso(D(4), 0), ends_at: iso(D(4), 23, 59), all_day: true, location: '', color: '#FFC24B', source: 'app', remind_minutes: null, snoozed_until: null, deleted_at: null },
  ]);

  // `challenge_id` is what splits this page in two: null is one of yours, an id
  // is a challenge you joined writing itself here. h4 and h5 are the mirrors of
  // ch1 and ch2 below, so the divider and the second group have something to
  // draw in the preview.
  seed(['habits'], [
    { id: 'h1', name: 'Read 20 pages', color: '#FF6B6B', kind: 'bin', target: null, position: 0, archived_at: null, challenge_id: null },
    { id: 'h2', name: 'Drink 8 glasses', color: '#38D6F2', kind: 'bin', target: null, position: 1, archived_at: null, challenge_id: null },
    { id: 'h3', name: 'No phone before bed', color: '#B07CFF', kind: 'bin', target: null, position: 2, archived_at: null, challenge_id: null },
    { id: 'h4', name: '6 a.m. club', color: '#FFC24B', kind: 'bin', target: null, position: 3, archived_at: null, challenge_id: 'ch1' },
    { id: 'h5', name: 'No-skip gym', color: '#FF6B6B', kind: 'bin', target: null, position: 4, archived_at: null, challenge_id: 'ch2' },
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
    { id: 'a1', name: 'Cash', kind: 'cash', color: '#34D9A0', opening_centavos: 450000 },
    { id: 'a2', name: 'Maribank', kind: 'ewallet', color: '#7C8CFF', opening_centavos: 1250000 },
  ]);
  seed(['budgets'], [
    { id: 'b1', category: 'Food', period: 'monthly', amount_centavos: 600000 },
    { id: 'b2', category: 'Transport', period: 'monthly', amount_centavos: 200000 },
  ]);
  seed(['transactions'], [
    { id: 'x1', account_id: 'a1', name: 'Jeepney fare', amount_centavos: 2400, category: 'Transport', occurred_at: iso(-1, 8), deleted_at: null },
    { id: 'x2', account_id: 'a1', name: 'Lunch · canteen', amount_centavos: 9500, category: 'Food', occurred_at: iso(-1, 12), deleted_at: null },
    { id: 'x3', account_id: 'a2', name: 'Groceries', amount_centavos: 87500, category: 'Food', occurred_at: iso(-5, 17), deleted_at: null },
  ]);
  seed(['to_buy'], [
    { id: 'y1', name: 'Notebook + pens', amount_centavos: 18000, bought_at: null },
  ]);

  seed(['home_projects'], [
    { id: 'p1', name: 'Capstone · routing app', progress: 45, color: '#B07CFF' },
    { id: 'p2', name: 'Portfolio site', progress: 78, color: '#34D9A0' },
  ]);
  seed(['home_recent_notes'], [
    { id: 'n1', title: 'Normalisation · 3NF', updated_at: iso(0, 13) },
    { id: 'n2', title: 'Eigenvectors and diagonalisation', updated_at: iso(-1, 16) },
  ]);

  const mins = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  seed(['notifications'], [
    { id: 'f1', kind: 'canvas', title: 'CS 191 · Proposal defence moved to Friday', body: 'CS 191 · Bring two printed copies of the revised scope. Slots are first come, first served.', href: null, source: 'canvas_lms', read_at: null, created_at: mins(14) },
    { id: 'f2', kind: 'task', title: 'Problem set 4 is overdue', body: 'Was due four days ago. Still sitting in School.', href: '/tasks/', source: 'app', read_at: null, created_at: mins(52) },
    { id: 'f3', kind: 'challenge', title: 'Rain T. passed you in 6 a.m. club', body: 'You are #2 with 12. One more morning takes it back.', href: '/community/', source: 'app', read_at: null, created_at: mins(140) },
    { id: 'f4', kind: 'canvas', title: 'STS 1 · Reading list for week 12 posted', body: 'STS 1 · Chapters 7 and 8, plus the Ellul excerpt in Files.', href: null, source: 'canvas_lms', read_at: null, created_at: mins(320) },
    { id: 'f5', kind: 'event', title: 'Capstone standup in 30 minutes', body: 'Meet · 7:30 AM tomorrow', href: '/calendar/', source: 'app', read_at: mins(400), created_at: mins(420) },
    { id: 'f6', kind: 'social', title: 'Jules replied to your thread', body: '“We scoped to one corridor and wrote the network bit as future work.”', href: '/community/', source: 'app', read_at: mins(600), created_at: mins(610) },
  ]);

  seed(['integrations'], []);

  // `icon` and `cover` are the folder's face — an emoji, an `ic:` app icon, a
  // `grad:` cover, or a storage path. See components/projects/Look.tsx.
  const proj = (
    id: string, name: string, tag: string, color: string, progress: number, position: number,
    deadline: string | null = null, icon = '', cover = '',
  ) => ({ id, name, tag, color, progress, position, deadline, icon, cover, user_id: 'me' });
  seed(['projects'], [
    proj('p1', 'Capstone · routing app', 'School', '#B07CFF', 45, 0, ymdOf(21), '🚍', 'grad:dusk'),
    proj('p2', 'CSSS orientation', 'Org', '#38D6F2', 80, 1, null, 'ic:people'),
    proj('p3', 'Jeepney tracker', 'Side', '#34D9A0', 20, 2, null, 'ic:code', 'grad:moss'),
    proj('p4', 'OS machine project', 'School', '#7C8CFF', 60, 3, ymdOf(9), '🖥️'),
    proj('p5', 'Portfolio site', 'Personal', '#FFC24B', 78, 4, null, 'ic:star', 'grad:sun'),
    proj('p6', 'Thesis reading list', 'Research', '#FF6FA8', 15, 5),
  ]);
  seed(['project_members'], [
    { project_id: 'p1', user_id: 'jl', role_label: 'GTFS', color: '#7C6CFF', active: true },
    { project_id: 'p1', user_id: 'rt', role_label: '', color: '#34D9A0', active: true },
    { project_id: 'p2', user_id: 'bc', role_label: '', color: '#FFC24B', active: true },
  ]);
  seed(['cards'], [
    { id: 'k1', project_id: 'p1', title: 'GTFS import rewrite', col: 'doing', color: '#B07CFF', position: 0, assignee_id: 'jl' },
    { id: 'k2', project_id: 'p1', title: 'Limitations section', col: 'todo', color: '#B07CFF', position: 1 },
    { id: 'k3', project_id: 'p1', title: 'Book the defence slot', col: 'todo', color: '#FF6B6B', position: 2 },
    { id: 'k4', project_id: 'p1', title: 'Corridor map export', col: 'done', color: '#34D9A0', position: 3, assignee_id: 'rt' },
    { id: 'k5', project_id: 'p2', title: 'Book the AVR', col: 'done', color: '#38D6F2', position: 0 },
    { id: 'k6', project_id: 'p2', title: 'Print the deck', col: 'doing', color: '#38D6F2', position: 1 },
    { id: 'k7', project_id: 'p3', title: 'Pick a map tile source', col: 'todo', color: '#34D9A0', position: 0 },
  ]);
  seed(['project_comments'], []);

  seed(['people'], [
    { id: 'pe1', name: 'Jules Lopez', category: 'Groupmate', color: '#7C6CFF', email: 'jules@up.edu.ph', note: 'Handles the GTFS import. Answers fastest on Messenger.' },
    { id: 'pe2', name: 'Rain Tolentino', category: 'Classmate', color: '#34D9A0', email: '', note: 'Sits front row in CS 191. Has every handout.' },
    { id: 'pe3', name: 'Prof. Alonzo', category: 'Prof', color: '#38D6F2', email: 'alonzo@up.edu.ph', note: 'Consultation Tue 2–4, room 304. Wants the scope narrowed.' },
    { id: 'pe4', name: 'Bea Cruz', category: 'Friend', color: '#FF6FA8', email: '', note: '' },
  ]);

  seed(['folders'], [
    { id: 'f1', name: 'CS 191', parent_id: null },
    { id: 'f2', name: 'Scans', parent_id: null },
  ]);
  const file = (id: string, name: string, kind: string, size_bytes: number, folder_id: string | null, days: number) =>
    ({ id, name, kind, size_bytes, folder_id, starred: false, storage_path: `me/${id}-${name}`,
       created_at: new Date(Date.now() - days * 86400000).toISOString() });
  seed(['files'], [
    file('fl1', 'Proposal draft 3.pdf', 'doc', 842_000, 'f1', 1),
    file('fl2', 'Corridor map.png', 'img', 1_940_000, 'f1', 2),
    file('fl3', 'Orientation deck.pdf', 'doc', 5_100_000, null, 3),
    file('fl4', 'Normalisation notes.md', 'doc', 12_400, null, 4),
    file('fl5', 'Whiteboard 08-14.jpg', 'img', 2_310_000, 'f2', 5),
    file('fl6', 'Reviewer bundle.zip', 'zip', 18_700_000, null, 9),
  ]);

  const post = (id: string, author_id: string, caption: string, tag: string, image_path: string | null, mins: number) =>
    ({ id, author_id, caption, tag, image_path, created_at: new Date(Date.now() - mins * 60000).toISOString() });
  seed(['posts'], [
    post('po1', 'jl', 'Finally got the offline tiles rendering on a jeepney route. Six weeks of GTFS wrangling for this one screenshot.', 'Capstone', 'demo/route.png', 22),
    post('po2', 'rt', 'Fourteen-day study streak. The 6 a.m. library slot is undefeated.', 'Habits', 'demo/streak.png', 120),
    post('po3', 'csss', 'Orientation deck is up in Files. Bring a laptop, bring a friend, bring snacks.', 'Org', 'demo/deck.png', 300),
    post('po4', 'me', 'Normalisation notes rewritten as a single page. Third normal form finally clicked.', 'Notes', null, 1440),
  ]);
  seed(['post_likes'], [
    { post_id: 'po1', user_id: 'rt' }, { post_id: 'po1', user_id: 'bc' },
    { post_id: 'po2', user_id: 'me' }, { post_id: 'po2', user_id: 'jl' }, { post_id: 'po2', user_id: 'bc' },
  ]);
  seed(['post_saves'], []);

  // Everybody in the feed has a handle now, so the preview needs profiles to
  // read one out of. bd_profiles is world-readable by design.
  seed(['profiles'], {
    me: { user_id: 'me', name: 'Jhems Reduta', handle: 'jhemsreduta07', photo_url: null },
    // One profile carries a picture so the avatar's photo path is exercised in
    // the preview, not just the initials fallback.
    jl: { user_id: 'jl', name: 'Jules Lopez', handle: 'juleslopez', photo_url: '/ex/pullup-0.jpg' },
    rt: { user_id: 'rt', name: 'Rain Tolentino', handle: 'raintol', photo_url: null },
    bc: { user_id: 'bc', name: 'Bea Cruz', handle: null, photo_url: null },
    csss: { user_id: 'csss', name: 'CS Student Society', handle: 'csss', photo_url: null },
  });

  seed(['comment_counts'], { 'discussion:th1': 2, 'photo:po1': 1 });

  // Who the picker offers by default. Everybody else has to be found by handle
  // — see useKnownPeople in lib/people.ts. 'csss' is deliberately absent so the
  // handle-only path has something to prove.
  seed(['known_people'], ['jl', 'rt', 'bc']);

  // Messages. One direct chat and one group, with a shared post in each, so
  // the panel, the bubbles and the shared-post card all have something to draw.
  const mAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();
  seed(['conversations'], [
    { id: 'cv1', created_by: 'me', title: '', is_group: false, updated_at: mAgo(4) },
    { id: 'cv2', created_by: 'rt', title: 'Capstone crew', is_group: true, updated_at: mAgo(90) },
  ]);
  seed(['conversation_members'], [
    { conversation_id: 'cv1', user_id: 'me', last_read_at: mAgo(0) },
    { conversation_id: 'cv1', user_id: 'jl', last_read_at: mAgo(3) },
    { conversation_id: 'cv2', user_id: 'me', last_read_at: mAgo(200) },
    { conversation_id: 'cv2', user_id: 'rt', last_read_at: mAgo(80) },
    { conversation_id: 'cv2', user_id: 'bc', last_read_at: mAgo(85) },
  ]);
  const msg = (id: string, conversation_id: string, author_id: string, body: string, n: number,
               share?: { kind: string; id: string }) =>
    ({ id, conversation_id, author_id, body, share_kind: share?.kind ?? null,
       share_id: share?.id ?? null, created_at: mAgo(n) });
  seed(['messages', 'cv1'], [
    msg('m1', 'cv1', 'jl', 'did you push the GTFS fix?', 30),
    msg('m2', 'cv1', 'me', 'yeah, it is on master. screenshot below', 22),
    msg('m3', 'cv1', 'me', '', 21, { kind: 'photo', id: 'po1' }),
    msg('m4', 'cv1', 'jl', 'beautiful. alonzo will love it', 4),
  ]);
  seed(['messages', 'cv2'], [
    msg('m5', 'cv2', 'rt', 'anyone free to review the limitations section?', 120),
    msg('m6', 'cv2', 'bc', '', 95, { kind: 'discussion', id: 'th1' }),
    msg('m7', 'cv2', 'bc', 'this thread has the answer', 90),
  ]);
  seed(['challenge_stars'], [
    { challenge_id: 'ch1', user_id: 'rt' },
    { challenge_id: 'ch1', user_id: 'bc' },
    { challenge_id: 'ch2', user_id: 'me' },
  ]);
  seed(['threads'], [
    { id: 'th1', author_id: 'me', title: 'Anyone else stuck on the CS 191 proposal scope?', body: 'Alonzo keeps saying one corridor only, but the rubric asks for a network-level evaluation. How are you all squaring that?', tag: 'CS 191', created_at: new Date(Date.now() - 60*60000).toISOString() },
    { id: 'th2', author_id: 'rt', title: 'Best library floor for deep work, ranked', body: 'Fourth floor is silent but freezing. Second has outlets but the aircon drips. Ground floor is a food court with books.', tag: 'Campus', created_at: new Date(Date.now() - 240*60000).toISOString() },
    { id: 'th3', author_id: 'bc', title: 'Selling: OS textbook, 8th ed, barely opened', body: 'Bought it, never used it, the slides were enough. Six hundred pesos or trade for a Math 55 reviewer.', tag: 'Market', created_at: new Date(Date.now() - 1500*60000).toISOString() },
    // What the bot's output looks like once it is running, so the Bot label
    // and the empty-room problem it exists to solve are both visible here.
    { id: 'th4', author_id: BOT, title: 'Drag a task onto an hour to give it a time', body: 'Untimed tasks live in the rail on the left of Calendar. Drop one on a slot and it becomes an event; drag it back out and it is a task again.', tag: 'Tip', created_at: new Date(Date.now() - 95*60000).toISOString() },
    { id: 'th5', author_id: BOT, title: 'Read the exam paper backwards first', body: 'Spend the first two minutes scanning from the last question up. You will find the marks-heavy ones before you have spent your good hour on question one.', tag: 'Campus', created_at: new Date(Date.now() - 300*60000).toISOString() },
  ]);
  seed(['thread_votes'], [
    { thread_id: 'th1', user_id: 'jl' }, { thread_id: 'th1', user_id: 'rt' },
    { thread_id: 'th2', user_id: 'me' }, { thread_id: 'th2', user_id: 'bc' }, { thread_id: 'th2', user_id: 'jl' },
  ]);
  seed(['thread_replies'], [
    { id: 'tr1', thread_id: 'th1', author_id: 'jl', body: 'We scoped to one corridor and wrote the network bit as future work. He signed it.', created_at: new Date(Date.now() - 48*60000).toISOString() },
    { id: 'tr2', thread_id: 'th1', author_id: 'rt', body: 'Same. Put the rubric line in your limitations section and cite the consultation date.', created_at: new Date(Date.now() - 31*60000).toISOString() },
  ]);

  seed(['ranked'], { rp: 1340, peak_rp: 1425, wins: 7, losses: 5, season: 's1' });
  const chal = (
    id: string, name: string, description: string, metric: string, rule: string,
    target: number | null, unit: string, color: string, startOff: number, endOff: number,
    settled: string | null = null, winner: string | null = null,
  ) => ({
    id, owner_id: 'me', name, description, habit_label: '', metric, rule, target, unit,
    starts_on: ymdOf(startOff), ends_on: ymdOf(endOff), color,
    visibility: 'public', join_code: null, ranked: true, settled_at: settled, winner_id: winner,
    stake_rp: 20,
  });
  seed(['challenges'], [
    chal('ch1', '6 a.m. club', 'Wake before six. Photo of the clock or it did not happen.', 'habit', 'most', null, 'days', '#FFC24B', -10, 4),
    chal('ch2', 'No-skip gym', 'Three sessions a week, no excuses, for the rest of the term.', 'body', 'most', null, 'sessions', '#FF6B6B', -17, 11),
    chal('ch3', 'Read 20 pages', 'Daily reading. First to a hundred pages takes it.', 'habit', 'first_to', 100, 'pages', '#34D9A0', 2, 30),
    chal('ch4', 'Inbox to zero', 'Whoever clears the most tasks before the midterms.', 'task', 'most', null, 'tasks', '#7C6CFF', -30, -2, iso(-1, 20), 'rt'),
    { ...chal('ch5', 'Ninety pages, seven days', 'Anything counts as long as it is not a feed. Post what you read.', 'habit', 'first_to', 90, 'pages', '#38D6F2', -1, 6), owner_id: BOT },
  ]);
  const mem = (challenge_id: string, user_id: string, display_name: string, progress: number, rp_delta = 0, placed: number | null = null) =>
    ({ challenge_id, user_id, display_name, habit_id: null, progress, rp_delta, placed, joined_at: iso(-10, 8) });
  seed(['challenge_members'], [
    mem('ch1', 'rt', 'Rain T.', 14), mem('ch1', 'me', 'You', 12), mem('ch1', 'jl', 'Jules L.', 9), mem('ch1', 'bc', 'Bea C.', 6),
    mem('ch2', 'jl', 'Jules L.', 9), mem('ch2', 'me', 'You', 8), mem('ch2', 'rt', 'Rain T.', 5),
    mem('ch3', 'bc', 'Bea C.', 0), mem('ch3', 'csss', 'CSSS', 0),
    mem('ch4', 'rt', 'Rain T.', 41, 88, 1), mem('ch4', 'me', 'You', 37, 40, 2), mem('ch4', 'jl', 'Jules L.', 22, 14, 3),
  ]);

  // Day-by-day numbers, so the bars and the arena have something to draw.
  // Deterministic rather than random: a preview that reshuffles every reload
  // is a preview you cannot compare against yesterday's screenshot.
  const dayRows: { challenge_id: string; user_id: string; on_date: string; value: number }[] = [];
  const pattern: Record<string, number[]> = {
    rt: [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1],
    me: [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1],
    jl: [0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1],
    bc: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  };
  for (const [cid, who] of [['ch1', ['rt', 'me', 'jl', 'bc']], ['ch2', ['jl', 'me', 'rt']]] as const) {
    for (const u of who) {
      pattern[u].forEach((v, i) => {
        if (v) dayRows.push({ challenge_id: cid, user_id: u, on_date: ymdOf(-13 + i), value: v });
      });
    }
  }
  seed(['challenge_days'], dayRows);

  // What "my own tables" would answer for each metric, so the auto-count path
  // renders without a signed-in session behind it.
  const mineSeries = (bits: number[]) => {
    const out: Record<string, number> = {};
    bits.forEach((v, i) => { out[ymdOf(-13 + i)] = v; });
    return out;
  };
  seed(['metric'], {
    task: mineSeries([2, 0, 3, 1, 0, 4, 2, 1, 0, 3, 2, 0, 1, 2]),
    habit: mineSeries(pattern.me),
    body: mineSeries([1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0]),
    steps: mineSeries([6, 9, 4, 11, 8, 3, 7, 10, 5, 9, 6, 2, 8, 7]),
    study: mineSeries([2, 1, 0, 3, 2, 0, 1, 2, 3, 0, 1, 2, 0, 2]),
    nospend: mineSeries([1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1]),
    written: mineSeries([1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0]),
  });

  // Body: a month of days so the rings, the ribbon and the arc all have
  // something, and enough sessions that the map runs warm in places.
  const bodyDay = (back: number, water: number, steps: number, weight: number, from: string, to: string) => ({
    on_date: ymdOf(-back), water, steps, weight,
    sleep_from: from, sleep_to: to,
    sleep_h: Math.round(((Number(to.slice(0, 2)) + 24 - Number(from.slice(0, 2))) % 24) * 10) / 10,
  });
  seed(['body_days'], [
    bodyDay(0, 5, 6820, 68.2, '23:40', '07:10'),
    bodyDay(1, 8, 11240, 68.4, '23:10', '06:50'),
    bodyDay(2, 6, 4310, 68.4, '00:20', '08:00'),
    bodyDay(3, 7, 9870, 68.6, '22:50', '06:40'),
    bodyDay(5, 4, 7220, 68.9, '01:10', '08:30'),
    bodyDay(8, 6, 8410, 69.1, '23:30', '07:00'),
    bodyDay(12, 7, 10120, 69.4, '23:00', '06:30'),
    bodyDay(18, 5, 5980, 69.8, '00:40', '08:10'),
    bodyDay(25, 6, 7640, 70.2, '23:20', '07:20'),
  ]);

  seed(['meals'], [
    { id: 'ml1', on_date: ymdOf(0), name: 'Tapsilog', slot: 'Breakfast', kcal: 620, protein: 34, carbs: 68, fat: 22, photo_path: null },
    { id: 'ml2', on_date: ymdOf(0), name: 'Chicken rice, canteen', slot: 'Lunch', kcal: 540, protein: 38, carbs: 62, fat: 14, photo_path: null },
    { id: 'ml3', on_date: ymdOf(0), name: 'Iced coffee and a pandesal', slot: 'Snack', kcal: 260, protein: 6, carbs: 40, fat: 8, photo_path: null },
  ]);

  seed(['workouts'], [
    { id: 'w1', on_date: ymdOf(-1), name: 'Push day', groups: ['chest', 'arms'], minutes: 55 },
    { id: 'w2', on_date: ymdOf(-3), name: 'Pull day', groups: ['back', 'arms'], minutes: 48 },
    { id: 'w3', on_date: ymdOf(-4), name: 'Run', groups: ['cardio'], minutes: 32 },
  ]);

  // Enough history for the gym screen to have something to prefill from and a
  // best to beat. Bench climbs 55 → 60 across the two push days on purpose.
  seed(['workout_sets'], [
    { id: 'ws1', workout_id: 'w1', exercise: 'Bench press', position: 0, weight_kg: 60, reps: 8, done: true },
    { id: 'ws2', workout_id: 'w1', exercise: 'Bench press', position: 1, weight_kg: 60, reps: 7, done: true },
    { id: 'ws3', workout_id: 'w1', exercise: 'Overhead press', position: 2, weight_kg: 35, reps: 8, done: true },
    { id: 'ws4', workout_id: 'w1', exercise: 'Cable pushdown', position: 3, weight_kg: 25, reps: 12, done: true },
    { id: 'ws5', workout_id: 'w2', exercise: 'Deadlift', position: 0, weight_kg: 100, reps: 5, done: true },
    { id: 'ws6', workout_id: 'w2', exercise: 'Barbell row', position: 1, weight_kg: 50, reps: 10, done: true },
    { id: 'ws7', workout_id: 'w2', exercise: 'Pull-up', position: 2, weight_kg: 0, reps: 8, done: true },
    { id: 'ws8', workout_id: 'w3', exercise: 'Run', position: 0, weight_kg: 0, reps: 32, done: true },
  ]);

  seed(['notebooks'], [
    { id: 'nb1', name: '3rd year', color: '#7C8CFF', position: 0, created_at: iso(-40, 9) },
    { id: 'nb2', name: 'Capstone research', color: '#B07CFF', position: 1, created_at: iso(-20, 9) },
  ]);

  // Notes are whole markdown documents now — one row, no blocks. The preview,
  // the word count, the graph edges and the backlinks are all read out of this
  // text, so seeding it seeds every one of them.
  const note = (id: string, notebook_id: string, title: string, body: string, hoursAgo: number) =>
    ({ id, notebook_id, title, body, position: 0, created_at: iso(-7, 9), updated_at: iso(0, Math.max(0, 20 - hoursAgo)), deleted_at: null });

  seed(['notes'], [
    note('nt1', 'nb1', 'Sprint planning', [
      'Scope is **one corridor**. The network-level evaluation goes in future work — see [[Routing literature]].',
      '',
      '## This week',
      '- [x] Rebuild the GTFS import with the 2026 feed',
      '- [ ] Draft the limitations section',
      '- [ ] Book the defence slot — Friday',
      '',
      '|| Alonzo wants the rubric line quoted verbatim in the limitations.',
      '',
      '## Open questions',
      '- Do we cite the consultation date, or the email?',
      '- Is 4,318 stops enough for the sample claim?',
      '',
      '> Six weeks of GTFS wrangling for one screenshot.',
      '',
      '```',
      'SELECT stop_id, COUNT(*)',
      'FROM stop_times',
      'GROUP BY stop_id',
      'HAVING COUNT(*) > 40;',
      '```',
    ].join('\n'), 1),
    note('nt2', 'nb1', 'Normalisation · 3NF', [
      'Third normal form finally clicked. Every non-key column depends on *the key, the whole key, and nothing but the key*.',
      '',
      '1. Remove repeating groups → 1NF',
      '2. Remove partial dependencies → 2NF',
      '3. Remove transitive dependencies → 3NF',
      '',
      'Related: [[Sprint planning]]',
    ].join('\n'), 3),
    note('nt3', 'nb1', 'Ellul reading',
      'Technique as an autonomous force. Compare with the routing work in [[Sprint planning]].', 26),
    note('nt4', 'nb2', 'Routing literature',
      'Papers on offline-first transit routing. The one worth stealing from is cited in [[Sprint planning]].', 50),
  ]);

  seed(['notes_trash'], [
    { id: 'nt9', notebook_id: 'nb1', title: 'Old outline', body: 'Superseded by the sprint plan.', position: 0,
      created_at: iso(-9, 9), updated_at: iso(-5, 9), deleted_at: iso(-2, 9) },
  ]);

  seed(['note_tags'], { nt1: ['cs191', 'capstone'], nt2: ['cs191'], nt4: ['reading'] });
  seed(['me_handle'], 'jhemsreduta07');

  // Journal — a month of entries so the heat map, the streak and "on this day"
  // all have something to draw. Dates are built from today so the preview never
  // goes stale.
  const jDay = (back: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - back);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const jText = [
    'Six hours on the GTFS import and it finally parsed. The bug was mine — I had been filtering stop_times before joining, so every corridor came out empty.\n\nRain brought the rubric printout. The wording is stricter than I remembered, which means the limitations section gets rewritten tonight.',
    'Quiet day. Read the Ellul chapter twice and still owe it a third pass.',
    'Group call ran long. Jules is taking the frontend after all, which is a relief and a small blow to the ego at once.',
    'Nothing much. Bus at 6:40, not 6:50 — writing that down somewhere permanent.',
  ];
  const jMoods = ['good', 'okay', 'great', null, 'rough'];
  const jEntries = [0, 1, 2, 3, 5, 6, 7, 9, 10, 12, 13, 14, 17, 20, 24, 27]
    .map((back, i) => ({
      id: `je${i}`, entry_date: jDay(back),
      text: jText[i % jText.length].slice(0, i % 3 === 0 ? undefined : 90),
      mood: jMoods[i % jMoods.length],
    }));
  // A year ago today, for the "on this day" rail.
  jEntries.push({ id: 'je-old', entry_date: jDay(365), text: 'First week of third year. Terrified of CS 191.', mood: 'okay' });

  seed(['journal_dates'], jEntries.map((e) => e.entry_date));
  seed(['journal_month'], jEntries);
  seed(['journal_on_this_day'], [jEntries[jEntries.length - 1]]);

  // A canvas row is a board or a saved graph view (0003_canvas_v2.sql), so the
  // preview seeds one of each - otherwise the Graph tab shows its empty state
  // and there is nothing to look at.
  const board = (id: string, name: string, color: string, position: number, kind = 'canvas', settings: unknown = {}) =>
    ({ id, name, kind, color, position, viewport: { x: 0, y: 0, z: 1 }, settings, updated_at: iso(0, 10) });

  seed(['canvases'], [
    board('c1', 'Capstone map', '#7C6CFF', 0),
    board('c2', 'Thesis argument', '#34D9A0', 1),
    board('gv1', 'Everything', '#38D6F2', 2, 'graph',
      { canvases: true, cards: true, notes: true, orphans: true, labels: true, spread: 1 }),
  ]);

  const node = (
    canvas_id: string, id: string, text: string, x: number, y: number,
    w = 180, h = 80, color = '#7C6CFF', kind = 'text',
    extra: { note_id?: string | null; ref_canvas?: string | null } = {},
  ) => ({
    id, canvas_id, kind, text, x, y, w, h, color,
    note_id: extra.note_id ?? null, ref_canvas: extra.ref_canvas ?? null, z: 0,
  });

  const c1Nodes = [
    node('c1', 'g1', 'Routing engine', 20, 20, 400, 300, '#34D9A0', 'group'),
    node('c1', 'cn1', 'Offline tiles \u2014 six weeks of GTFS wrangling', 50, 70, 200, 90),
    node('c1', 'cn2', 'Corridor evaluation only.\nNetwork-level is future work.', 50, 190, 200, 90, '#FFC24B'),
    node('c1', 'cn3', 'Alonzo signed off on the narrowed scope', 470, 70, 200, 80, '#FF6B6B'),
    node('c1', 'cn4', 'Dataset: 4,318 jeepney stops', 470, 200, 200, 70, '#38D6F2'),
    node('c1', 'cn5', 'Defence \u2014 Friday, two printed copies', 470, 320, 200, 70, '#FF6FA8'),
    node('c1', 'cn6', 'Sprint planning', 250, 420, 220, 104, '#7C8CFF', 'note', { note_id: 'nt1' }),
    node('c1', 'cn7', 'Thesis argument', 520, 440, 220, 104, '#34D9A0', 'canvas', { ref_canvas: 'c2' }),
  ];
  const c2Nodes = [
    node('c2', 'dn1', 'Claim: offline routing is the constraint', 60, 60, 220, 90, '#34D9A0'),
    node('c2', 'dn2', 'Routing literature', 60, 220, 220, 104, '#B07CFF', 'note', { note_id: 'nt4' }),
  ];
  const c1Edges = [
    { id: 'ce1', canvas_id: 'c1', from_node: 'cn1', to_node: 'cn3', from_side: 'right', to_side: 'left', label: 'scope', color: '#7C6CFF' },
    { id: 'ce2', canvas_id: 'c1', from_node: 'cn2', to_node: 'cn4', from_side: 'right', to_side: 'left', label: '', color: '#FFC24B' },
    { id: 'ce3', canvas_id: 'c1', from_node: 'cn3', to_node: 'cn5', from_side: 'bottom', to_side: 'top', label: 'then', color: '#FF6B6B' },
    { id: 'ce4', canvas_id: 'c1', from_node: 'cn6', to_node: 'cn1', from_side: 'top', to_side: 'bottom', label: 'writes up', color: '#7C8CFF' },
  ];
  const c2Edges = [
    { id: 'de1', canvas_id: 'c2', from_node: 'dn1', to_node: 'dn2', from_side: 'bottom', to_side: 'top', label: 'rests on', color: '#34D9A0' },
  ];

  seed(['canvas_nodes', 'c1'], c1Nodes);
  seed(['canvas_edges', 'c1'], c1Edges);
  seed(['canvas_nodes', 'c2'], c2Nodes);
  seed(['canvas_edges', 'c2'], c2Edges);
  // The graph reads every board at once, not one board at a time.
  seed(['canvas_nodes_all'], [...c1Nodes, ...c2Nodes]);
  seed(['canvas_edges_all'], [...c1Edges, ...c2Edges]);

  // Two photos on whichever day is open, one of them put away, so the grid,
  // the drawer and the row of verbs all have something to show. The storage
  // paths are fake: signing them fails and MediaFrame draws its placeholder,
  // which is the same thing a slow connection shows.
  seed(['journal_photos'], [
    { id: 'jp1', name: 'whiteboard.jpg', storage_path: 'me/whiteboard.jpg', position: 0, archived_at: null, deleted_at: null },
    { id: 'jp2', name: 'lecture-slide.png', storage_path: 'me/lecture-slide.png', position: 1, archived_at: iso(-1, 9), deleted_at: null },
  ]);
  seed(['photo_pins'], []);

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
