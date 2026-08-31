'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { fixture } from './devFixtures';
import {
  countByDay, sumByDay, markByDay, absentByDay, localDay, type Series,
} from './series';

/**
 * What a challenge counts, and where it reads it.
 *
 * This is the change the whole rebuild hangs off. A challenge used to ask you
 * to press `+` once per task, per gym day, per push-up — a second to-do list
 * about your first one, which is why they died on day three. The app already
 * holds all of it: your tasks, your habit ticks, your workouts, your steps,
 * your calendar, your spending, your journal.
 *
 * **Every query here reads only your own rows.** RLS makes that a fact rather
 * than a policy: nobody else's client can see your tasks, and yours cannot see
 * theirs. So each person's own session computes their own number and publishes
 * *that* to `bd_challenge_days` — the count leaves, the data never does.
 *
 * `manual` is kept, because "read three chapters" is real and no table knows
 * about it. It is the fallback, not the default.
 */

export type MetricId =
  | 'task' | 'habit' | 'body' | 'steps' | 'study' | 'nospend' | 'written' | 'manual';

export type MetricDef = {
  id: MetricId;
  label: string;
  hint: string;
  icon: string;
  unit: string;
  /** False means a person types it in. Only `manual` is false. */
  auto: boolean;
};

export const METRICS: MetricDef[] = [
  { id: 'task', label: 'Tasks finished', hint: 'Anything you tick off in Tasks', icon: 'task', unit: 'tasks', auto: true },
  { id: 'habit', label: 'A habit kept', hint: 'Days you tick one of your habits', icon: 'habit', unit: 'days', auto: true },
  { id: 'body', label: 'Gym days', hint: 'Days with a session in Gym', icon: 'gym', unit: 'days', auto: true },
  { id: 'steps', label: 'Steps', hint: 'A point per thousand steps', icon: 'steps', unit: 'k steps', auto: true },
  { id: 'study', label: 'Study hours', hint: 'Calendar blocks with study, review, reading or deep work in the title', icon: 'clock', unit: 'hours', auto: true },
  { id: 'nospend', label: 'No-spend days', hint: 'Finished days with nothing spent', icon: 'money', unit: 'days', auto: true },
  { id: 'written', label: 'Days written', hint: 'Days with a journal entry or a note touched', icon: 'pen', unit: 'days', auto: true },
  { id: 'manual', label: 'Count it myself', hint: 'For anything the app cannot see', icon: 'plus', unit: 'times', auto: false },
];

export const metricDef = (id: string): MetricDef =>
  METRICS.find((m) => m.id === id) ?? METRICS[METRICS.length - 1];

/** Old rows carry ids from before this list; keep them meaning something. */
export function normaliseMetric(id: string | null | undefined): MetricId {
  if (!id) return 'manual';
  if (id === 'project') return 'manual';   // bd_cards has no "moved on" date to count
  return (METRICS.some((m) => m.id === id) ? id : 'manual') as MetricId;
}

/** Which words in a calendar title make a block count as study. */
const STUDY = /(stud|review|revis|reading|read |deep work|thesis|problem set|practice)/i;

/**
 * Your own day-by-day count for one metric, over one window.
 *
 * One query per metric rather than a join across six tables: the queries are
 * tiny, they only ever touch the signed-in user's rows, and TanStack caches
 * them per window so three challenges on the same metric cost one round trip.
 */
export function useMyMetric(
  metric: MetricId, from: string, to: string, habitId?: string | null, enabled = true,
) {
  return useQuery({
    queryKey: ['metric', metric, from, to, habitId ?? ''],
    enabled: enabled && !!from && !!to && metric !== 'manual',
    staleTime: 60_000,
    queryFn: async (): Promise<Series> => {
      const fx = fixture<Record<string, Series>>('metric');
      if (fx) return fx[metric] ?? {};

      // Timestamps are compared against the window's local edges, converted to
      // instants; date columns are compared as plain dates.
      const startISO = new Date(`${from}T00:00:00`).toISOString();
      const endISO = new Date(`${to}T23:59:59.999`).toISOString();

      switch (metric) {
        case 'task': {
          const { data } = await supabase.from('bd_tasks')
            .select('completed_at,updated_at').eq('done', true).is('deleted_at', null);
          const valid = (data ?? []).filter((r) => {
            const ts = r.completed_at || r.updated_at;
            if (!ts) return false;
            const d = localDay(ts);
            return d >= from && d <= to;
          });
          return countByDay(valid.map((r) => localDay((r.completed_at || r.updated_at) as string)), from, to);
        }
        case 'habit': {
          let q = supabase.from('bd_habit_ticks').select('on_date,habit_id')
            .gte('on_date', from).lte('on_date', to);
          if (habitId) q = q.eq('habit_id', habitId);
          const { data } = await q;
          return markByDay((data ?? []).map((r) => r.on_date as string), from, to);
        }
        case 'body': {
          const { data } = await supabase.from('bd_workouts').select('on_date')
            .gte('on_date', from).lte('on_date', to);
          return markByDay((data ?? []).map((r) => r.on_date as string), from, to);
        }
        case 'steps': {
          const { data } = await supabase.from('bd_body_days').select('on_date,steps')
            .gte('on_date', from).lte('on_date', to);
          return sumByDay((data ?? []).map((r) => ({
            day: r.on_date as string, value: Math.round((Number(r.steps) || 0) / 1000),
          })), from, to);
        }
        case 'study': {
          const { data } = await supabase.from('bd_events').select('title,starts_at,ends_at')
            .is('deleted_at', null).eq('all_day', false)
            .gte('starts_at', startISO).lte('starts_at', endISO);
          const rows = (data ?? [])
            .filter((e) => STUDY.test(String(e.title ?? '')))
            .map((e) => ({
              day: localDay(e.starts_at as string),
              value: Math.max(0, Math.round(
                (new Date(e.ends_at as string).getTime() - new Date(e.starts_at as string).getTime()) / 3_600_000)),
            }));
          return sumByDay(rows, from, to);
        }
        case 'nospend': {
          // Every row in bd_transactions is money going out — the amount is
          // stored positive and the whole app abs()es it. Filtering on a
          // negative amount, which is what "spend" looks like in most ledgers,
          // would have matched nothing here and scored every day a clean one.
          const { data } = await supabase.from('bd_transactions').select('occurred_at,amount_centavos')
            .is('deleted_at', null).neq('amount_centavos', 0)
            .gte('occurred_at', startISO).lte('occurred_at', endISO);
          return absentByDay((data ?? []).map((r) => localDay(r.occurred_at as string)), from, to);
        }
        case 'written': {
          const [j, n] = await Promise.all([
            supabase.from('bd_journal_entries').select('entry_date')
              .is('deleted_at', null).gte('entry_date', from).lte('entry_date', to),
            supabase.from('bd_notes').select('updated_at')
              .is('deleted_at', null).gte('updated_at', startISO).lte('updated_at', endISO),
          ]);
          const days = [
            ...(j.data ?? []).map((r) => r.entry_date as string),
            ...(n.data ?? []).map((r) => localDay(r.updated_at as string)),
          ];
          return markByDay(days, from, to);
        }
        default:
          return {};
      }
    },
  });
}

/* --------------------------------------------------------------- templates */

export type Template = {
  id: string;
  name: string;
  blurb: string;
  metric: MetricId;
  rule: 'most' | 'first_to' | 'streak';
  target: number | null;
  days: number;
  color: string;
  stake: number;
};

/**
 * Three taps instead of a form. A template carries the metric, the rule, the
 * window and a sensible stake, so the only decisions left are who is in it and
 * whether to change the name.
 */
export const TEMPLATES: Template[] = [
  { id: 'tasks-week', name: 'Most tasks this week', blurb: 'Whoever ticks the most in seven days', metric: 'task', rule: 'most', target: null, days: 7, color: '#7C6CFF', stake: 20 },
  { id: 'gym-5', name: 'Gym five times', blurb: 'First to five sessions takes it', metric: 'body', rule: 'first_to', target: 5, days: 14, color: '#34D9A0', stake: 30 },
  { id: 'nospend', name: 'No-spend week', blurb: 'Most days without spending a peso', metric: 'nospend', rule: 'most', target: null, days: 7, color: '#FFC24B', stake: 25 },
  { id: 'streak', name: 'Longest streak', blurb: 'A habit, every day, until somebody drops it', metric: 'habit', rule: 'streak', target: null, days: 21, color: '#FF6B6B', stake: 40 },
  { id: 'study-20', name: 'Twenty study hours', blurb: 'First to twenty hours of blocks', metric: 'study', rule: 'first_to', target: 20, days: 14, color: '#38D6F2', stake: 30 },
  { id: 'steps', name: 'Step count', blurb: 'Most thousands of steps in a week', metric: 'steps', rule: 'most', target: null, days: 7, color: '#FF6FA8', stake: 20 },
  { id: 'written', name: 'Write every day', blurb: 'Most days with something written down', metric: 'written', rule: 'most', target: null, days: 14, color: '#B07CFF', stake: 20 },
  { id: 'custom', name: 'Something else', blurb: 'The full form, for anything not up there', metric: 'manual', rule: 'most', target: null, days: 7, color: '#8B7CFF', stake: 0 },
];

/** A duel is a template with one opponent and a short fuse. */
export const DUEL: Template = {
  id: 'duel', name: 'Duel', blurb: 'Seven days, head to head, most tasks',
  metric: 'task', rule: 'most', target: null, days: 7, color: '#FF6B6B', stake: 20,
};
