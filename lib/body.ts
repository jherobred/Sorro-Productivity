'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';
import { fixture } from './devFixtures';
import { ymd } from './series';
import { MUSCLES, type Muscle } from './lift';

/**
 * Body, as instruments rather than rows.
 *
 * The old screen was six numbers each with a minus and a plus, which is a
 * spreadsheet with feelings. The data underneath was fine; it just had no
 * shape. This is the same tables, read for the three things a dashboard should
 * answer at a glance: how the day is going, what you have trained lately, and
 * what you ate.
 *
 * Two changes to the schema (0006), both because a number you type is a number
 * you get wrong: sleep is now *when* rather than how long, and workouts are a
 * dated log with muscle groups rather than a weekly plan with tick boxes.
 */

export type Day = {
  on_date: string;
  sleep_h: number | null;
  sleep_from: string | null;
  sleep_to: string | null;
  water: number;
  steps: number;
  weight: number | null;
};

export type Meal = {
  id: string; on_date: string; name: string; slot: string;
  kcal: number; protein: number; carbs: number; fat: number; photo_path: string | null;
};

export type Workout = {
  id: string; on_date: string; name: string; groups: string[]; minutes: number;
};

/**
 * What the body map can warm, top to bottom, which is how it is drawn.
 *
 * Defined in `lib/lift.ts` and re-exported here: the exercise catalogue files
 * every movement under one of these, and two copies of the same list is one
 * copy that goes stale.
 */
export const GROUPS = MUSCLES;
export type Group = Muscle;

export const GROUP_LABEL: Record<Group, string> = {
  chest: 'Chest', back: 'Back', arms: 'Arms', core: 'Core', legs: 'Legs', cardio: 'Cardio',
};

/** The day's targets. Not settings yet — one place to change them when they are. */
export const GOALS = { water: 8, steps: 10000, sleep: 8, kcal: 2200 };

const DAYS = ['body_days'] as const;
const MEALS = ['meals'] as const;
const WORKOUTS = ['workouts'] as const;

/* ------------------------------------------------------------------- reads */

/** The last `back` days, so the rings, the ribbon and the map share one fetch. */
export function useBodyDays(back = 30) {
  const from = ymd(new Date(Date.now() - back * 864e5));
  return useQuery({
    queryKey: [...DAYS, back],
    queryFn: async (): Promise<Day[]> => {
      const fx = fixture<Day[]>('body_days');
      if (fx) return fx;
      const { data, error } = await supabase.from('bd_body_days')
        .select('on_date,sleep_h,sleep_from,sleep_to,water,steps,weight')
        .gte('on_date', from).order('on_date');
      if (error) throw error;
      return (data ?? []) as Day[];
    },
  });
}

export function useMeals(on: string) {
  return useQuery({
    queryKey: [...MEALS, on],
    queryFn: async (): Promise<Meal[]> => {
      const fx = fixture<Meal[]>('meals');
      if (fx) return fx;
      const { data, error } = await supabase.from('bd_meals')
        .select('id,on_date,name,slot,kcal,protein,carbs,fat,photo_path')
        .eq('on_date', on).order('id');
      if (error) throw error;
      return (data ?? []) as Meal[];
    },
  });
}

export function useWorkouts(back = 28) {
  const from = ymd(new Date(Date.now() - back * 864e5));
  return useQuery({
    queryKey: [...WORKOUTS, back],
    queryFn: async (): Promise<Workout[]> => {
      const fx = fixture<Workout[]>('workouts');
      if (fx) return fx;
      const { data, error } = await supabase.from('bd_workouts')
        .select('id,on_date,name,groups,minutes').gte('on_date', from).order('on_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Workout[];
    },
  });
}

/* --------------------------------------------------------------- mutations */

const SET_DAY = defineMutation('body2.setDay', async (v: { on_date: string; patch: Partial<Day> }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_body_days')
    .upsert({ user_id, on_date: v.on_date, ...v.patch }, { onConflict: 'user_id,on_date' });
  if (error) throw error;
});

const ADD_MEAL = defineMutation('body2.addMeal', async (v: Meal) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_meals').insert({ ...v, user_id });
  if (error) throw error;
});

const DEL_MEAL = defineMutation('body2.delMeal', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_meals').delete().eq('id', v.id);
  if (error) throw error;
});

const ADD_WORKOUT = defineMutation('body2.addWorkout', async (v: Workout) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_workouts').insert({ ...v, user_id });
  if (error) throw error;
});

/** A session grows while you are in it: its muscles and its length both follow the sets. */
const EDIT_WORKOUT = defineMutation('body2.editWorkout', async (v: { id: string; patch: Partial<Workout> }) => {
  const { error } = await supabase.from('bd_workouts').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DEL_WORKOUT = defineMutation('body2.delWorkout', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_workouts').delete().eq('id', v.id);
  if (error) throw error;
});

/* ----------------------------------------------------------------- actions */

export function useBodyActions(back = 30, on = ymd(new Date())) {
  const qc = useQueryClient();
  const dayKey = [...DAYS, back] as const;
  const mealKey = [...MEALS, on] as const;
  const workKey = [...WORKOUTS, 28] as const;
  const settle = settler(qc, dayKey, mealKey, workKey);

  const setDay = useMutation<unknown, Error, { on_date: string; patch: Partial<Day> }, Day[]>({
    mutationKey: SET_DAY,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Day[]>(dayKey) ?? [];
      const hit = prev.some((d) => d.on_date === v.on_date);
      queryClient.setQueryData<Day[]>(dayKey, hit
        ? prev.map((d) => (d.on_date === v.on_date ? { ...d, ...v.patch } : d))
        : [...prev, {
            on_date: v.on_date, sleep_h: null, sleep_from: null, sleep_to: null,
            water: 0, steps: 0, weight: null, ...v.patch,
          }]);
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(dayKey, ctx); toast(e.message); },
    onSettled: settle,
  });

  const addMeal = useMutation<unknown, Error, Meal, Meal[]>({
    mutationKey: ADD_MEAL,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Meal[]>(mealKey) ?? [];
      queryClient.setQueryData<Meal[]>(mealKey, [...prev, v]);
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(mealKey, ctx); toast(e.message); },
    onSettled: settle,
  });

  const delMeal = useMutation<unknown, Error, { id: string }, Meal[]>({
    mutationKey: DEL_MEAL,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Meal[]>(mealKey) ?? [];
      queryClient.setQueryData<Meal[]>(mealKey, prev.filter((m) => m.id !== v.id));
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(mealKey, ctx); },
    onSettled: settle,
  });

  const addWorkout = useMutation<unknown, Error, Workout, Workout[]>({
    mutationKey: ADD_WORKOUT,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Workout[]>(workKey) ?? [];
      queryClient.setQueryData<Workout[]>(workKey, [v, ...prev]);
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(workKey, ctx); toast(e.message); },
    onSettled: settle,
  });

  const editWorkout = useMutation<unknown, Error, { id: string; patch: Partial<Workout> }, Workout[]>({
    mutationKey: EDIT_WORKOUT,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Workout[]>(workKey) ?? [];
      queryClient.setQueryData<Workout[]>(workKey, prev.map((w) => (w.id === v.id ? { ...w, ...v.patch } : w)));
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(workKey, ctx); toast(e.message); },
    onSettled: settle,
  });

  const delWorkout = useMutation<unknown, Error, { id: string }, Workout[]>({
    mutationKey: DEL_WORKOUT,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Workout[]>(workKey) ?? [];
      queryClient.setQueryData<Workout[]>(workKey, prev.filter((w) => w.id !== v.id));
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(workKey, ctx); },
    onSettled: settle,
  });

  return { setDay, addMeal, delMeal, addWorkout, editWorkout, delWorkout };
}

/* --------------------------------------------------------------- reckoning */

/** Hours between two clock times, wrapping midnight — the arc's whole job. */
export function sleepHours(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;
  const mins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const a = mins(from);
  const b = mins(to);
  const span = b >= a ? b - a : 1440 - a + b;
  return Math.round((span / 60) * 10) / 10;
}

/** How warm each muscle group is, 0–1, from the last `days` of workouts. */
export function heatOf(workouts: Workout[], days = 7): Record<Group, number> {
  const cutoff = ymd(new Date(Date.now() - days * 864e5));
  const out = Object.fromEntries(GROUPS.map((g) => [g, 0])) as Record<Group, number>;
  for (const w of workouts) {
    if (w.on_date < cutoff) continue;
    // A session two days ago should read warmer than one six days ago.
    const age = Math.max(0, (Date.now() - new Date(`${w.on_date}T12:00`).getTime()) / 864e5);
    const weight = Math.max(0.25, 1 - age / days);
    for (const g of w.groups) if (g in out) out[g as Group] = Math.min(1, out[g as Group] + weight * 0.5);
  }
  return out;
}

export const dayOf = (days: Day[], on: string): Day | null => days.find((d) => d.on_date === on) ?? null;
