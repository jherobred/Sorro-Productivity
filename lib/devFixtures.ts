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

export const devFixturesOn = () =>
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_FIXTURES === '1';

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

export function seedDevFixtures() {
  if (!devFixturesOn()) return;

  // Seeded data is stale the moment it lands, so the first refetch would replace
  // it with the empty result a signed-out Supabase client returns. Freezing the
  // queries is what makes the preview survive longer than staleTime.
  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  });

  queryClient.setQueryData(['lists'], [
    { id: LIST.school, name: 'School', color: '#7C8CFF', position: 0 },
    { id: LIST.personal, name: 'Personal', color: '#FFC24B', position: 1 },
    { id: LIST.errands, name: 'Errands', color: '#34D9A0', position: 2 },
  ]);

  const task = (id: string, list: string, title: string, due: string, priority: string, stars: number, notes = '') =>
    ({ id, list_id: list, title, notes, done: false, due_on: due, priority, stars, position: 0, deleted_at: null });

  queryClient.setQueryData(['tasks'], [
    task('t1', LIST.school, 'Finish CS 191 problem set 4', ymdOf(-4), 'high', 4, 'Sections 3 and 5 only.'),
    task('t2', LIST.school, 'Email Prof. Santos about regrade', ymdOf(-2), 'med', 2),
    task('t3', LIST.errands, 'Return library books', ymdOf(-1), 'low', 0),
    task('t4', LIST.school, 'Draft thesis outline', ymdOf(0), 'high', 5, 'Three chapters, bullet form.'),
    task('t5', LIST.personal, 'Gym — push day', ymdOf(0), 'med', 0),
    task('t6', LIST.school, 'Read Chapter 7 — algorithms', ymdOf(0), 'low', 1),
    task('t7', LIST.school, 'Capstone group sync notes', ymdOf(1), 'med', 3),
    task('t8', LIST.errands, 'Buy notebook + pens', ymdOf(2), 'low', 0),
    task('t9', LIST.personal, 'Call home', ymdOf(3), 'med', 2),
  ]);

  const ev = (id: string, title: string, d: number, sh: number, sm: number, eh: number, em: number, loc: string, color: string) =>
    ({ id, title, starts_at: iso(d, sh, sm), ends_at: iso(d, eh, em), all_day: false, location: loc, color, remind_minutes: null, snoozed_until: null, deleted_at: null });

  const ws = new Date();
  ws.setHours(0, 0, 0, 0);
  ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));

  queryClient.setQueryData(['events', ws.toISOString()], [
    ev('e1', 'CS 150 Lecture', 0, 9, 0, 10, 30, "Eng'g 214", '#7C8CFF'),
    ev('e2', 'Deep work — thesis outline', 0, 13, 0, 14, 30, 'Library 3F', '#34D9A0'),
    ev('e3', 'CS 191 Lecture', 0, 15, 0, 16, 30, "Eng'g 302", '#7C8CFF'),
    ev('e4', 'Group call — capstone', 0, 19, 30, 20, 30, 'Discord', '#B07CFF'),
    ev('e5', 'CS 165 Lecture', 1, 10, 0, 11, 30, "Eng'g 210", '#7C8CFF'),
    ev('e6', 'Gym — pull day', 1, 17, 0, 18, 0, 'UST Gym', '#FF6FA8'),
  ]);

  queryClient.setQueryData(['habits'], [
    { id: 'h1', name: 'Read 20 pages', color: '#FF6B6B', kind: 'bin', target: null, position: 0, archived_at: null },
    { id: 'h2', name: 'Drink 8 glasses', color: '#38D6F2', kind: 'bin', target: null, position: 1, archived_at: null },
    { id: 'h3', name: 'No phone before bed', color: '#B07CFF', kind: 'bin', target: null, position: 2, archived_at: null },
  ]);
  const ticks: { habit_id: string; on_date: string; value: number }[] = [];
  for (let g = 0; g <= 5; g++) ticks.push({ habit_id: 'h1', on_date: ymdOf(-g), value: 1 });
  for (let g = 1; g <= 9; g++) if (g !== 4) ticks.push({ habit_id: 'h2', on_date: ymdOf(-g), value: 1 });
  for (let g = 0; g <= 12; g++) if (g % 3) ticks.push({ habit_id: 'h3', on_date: ymdOf(-g), value: 1 });
  for (const d of [7, 30, 365]) queryClient.setQueryData(['habit_ticks', d], ticks);

  queryClient.setQueryData(['scratch'], [
    { id: 's1', text: 'Ask about the thesis template margins', tag: 'Note', color: '#38D6F2', pinned: true, position: 0, created_at: iso(0, 9) },
    { id: 's2', text: 'Bus leaves at 6:40, not 6:50', tag: 'Idea', color: '#FFC24B', pinned: false, position: 1, created_at: iso(-1, 11) },
    { id: 's3', text: 'Library closes early on Fridays', tag: 'Todo', color: '#34D9A0', pinned: false, position: 2, created_at: iso(-2, 14) },
  ]);

  queryClient.setQueryData(['accounts'], [
    { id: 'a1', name: 'Cash', kind: 'cash', color: '#34D9A0' },
    { id: 'a2', name: 'Maribank', kind: 'ewallet', color: '#7C8CFF' },
  ]);
  queryClient.setQueryData(['budgets'], [
    { id: 'b1', category: 'Food', period: 'monthly', amount_centavos: 600000 },
    { id: 'b2', category: 'Transport', period: 'monthly', amount_centavos: 200000 },
  ]);
  queryClient.setQueryData(['transactions'], [
    { id: 'x1', account_id: 'a1', name: 'Jeepney fare', amount_centavos: 2400, category: 'Transport', occurred_at: iso(-1, 8), deleted_at: null },
    { id: 'x2', account_id: 'a1', name: 'Lunch — canteen', amount_centavos: 9500, category: 'Food', occurred_at: iso(-1, 12), deleted_at: null },
    { id: 'x3', account_id: 'a2', name: 'Groceries', amount_centavos: 87500, category: 'Food', occurred_at: iso(-5, 17), deleted_at: null },
  ]);
  queryClient.setQueryData(['to_buy'], [
    { id: 'y1', name: 'Notebook + pens', amount_centavos: 18000, bought_at: null },
  ]);

  queryClient.setQueryData(['home_projects'], [
    { id: 'p1', name: 'Capstone — routing app', progress: 45, color: '#B07CFF' },
    { id: 'p2', name: 'Portfolio site', progress: 78, color: '#34D9A0' },
  ]);
  queryClient.setQueryData(['home_recent_notes'], [
    { id: 'n1', title: 'Normalisation — 3NF', updated_at: iso(0, 13) },
    { id: 'n2', title: 'Eigenvectors and diagonalisation', updated_at: iso(-1, 16) },
  ]);

  const mins = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
  queryClient.setQueryData(['notifications'], [
    { id: 'f1', kind: 'canvas', title: 'CS 191 — Proposal defence moved to Friday', body: 'CS 191 · Bring two printed copies of the revised scope. Slots are first come, first served.', href: null, source: 'canvas_lms', read_at: null, created_at: mins(14) },
    { id: 'f2', kind: 'task', title: 'Problem set 4 is overdue', body: 'Was due four days ago. Still sitting in School.', href: '/tasks/', source: 'app', read_at: null, created_at: mins(52) },
    { id: 'f3', kind: 'challenge', title: 'Rain T. passed you in 6 a.m. club', body: 'You are #2 with 12. One more morning takes it back.', href: '/community/', source: 'app', read_at: null, created_at: mins(140) },
    { id: 'f4', kind: 'canvas', title: 'STS 1 — Reading list for week 12 posted', body: 'STS 1 · Chapters 7 and 8, plus the Ellul excerpt in Files.', href: null, source: 'canvas_lms', read_at: null, created_at: mins(320) },
    { id: 'f5', kind: 'event', title: 'Capstone standup in 30 minutes', body: 'Meet · 7:30 AM tomorrow', href: '/calendar/', source: 'app', read_at: mins(400), created_at: mins(420) },
    { id: 'f6', kind: 'social', title: 'Jules replied to your thread', body: '“We scoped to one corridor and wrote the network bit as future work.”', href: '/community/', source: 'app', read_at: mins(600), created_at: mins(610) },
  ]);

  queryClient.setQueryData(['integrations'], []);

  queryClient.setQueryData(['java_files'], [
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
