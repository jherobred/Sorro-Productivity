'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';

export type Habit = {
  id: string;
  name: string;
  color: string;
  kind: 'bin' | 'count' | 'dur';
  target: number | null;
  position: number;
  archived_at: string | null;
};

export type Tick = { habit_id: string; on_date: string; value: number };

const HABITS_KEY = ['habits'] as const;
const TICKS_KEY = ['habit_ticks'] as const;

/** Local YYYY-MM-DD — habit day boundaries follow the user's timezone, not UTC. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function lastDays(n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push(d);
  }
  return out;
}

export function useHabits() {
  return useQuery({
    queryKey: HABITS_KEY,
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabase
        .from('bd_habits')
        .select('id,name,color,kind,target,position,archived_at')
        .is('archived_at', null)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTicks(days: number) {
  const from = ymd(lastDays(days)[0]);
  return useQuery({
    queryKey: [...TICKS_KEY, days],
    queryFn: async (): Promise<Tick[]> => {
      const { data, error } = await supabase
        .from('bd_habit_ticks')
        .select('habit_id,on_date,value')
        .gte('on_date', from);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Longest run of consecutive ticked days ending today. */
export function streak(ticks: Tick[], habitId: string): number {
  const set = new Set(ticks.filter((t) => t.habit_id === habitId).map((t) => t.on_date));
  let n = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Today not being ticked yet should not break yesterday's streak.
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1);
  while (set.has(ymd(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/* ---- Mutations ---------------------------------------------------------- */

// The RPC toggles the tick AND recomputes linked challenge progress in the same
// transaction, which is what BACKEND.md requires of POST /habits/:id/tick.
const TICK = defineMutation('habit.tick', async (v: { habitId: string; date: string; value?: number }) => {
  const { error } = await supabase.rpc('bd_habit_tick', {
    p_habit: v.habitId,
    p_date: v.date,
    p_value: v.value ?? 1,
  });
  if (error) throw error;
});

const CREATE = defineMutation('habit.create', async (v: { id: string; name: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_habits').insert({ ...v, user_id });
  if (error) throw error;
});

// Habits archive rather than soft-delete — the schema has archived_at, not deleted_at.
const ARCHIVE = defineMutation('habit.archive', async (v: { id: string; at: string | null }) => {
  const { error } = await supabase.from('bd_habits').update({ archived_at: v.at }).eq('id', v.id);
  if (error) throw error;
});

const RENAME = defineMutation('habit.rename', async (v: { id: string; name: string }) => {
  const { error } = await supabase.from('bd_habits').update({ name: v.name }).eq('id', v.id);
  if (error) throw error;
});

const SET_KIND = defineMutation('habit.setKind', async (v: { id: string; kind: Habit['kind'] }) => {
  const { error } = await supabase.from('bd_habits').update({ kind: v.kind }).eq('id', v.id);
  if (error) throw error;
});

export function useHabitActions(days: number) {
  const qc = useQueryClient();
  const tKey = [...TICKS_KEY, days];
  const settle = () => {
    void qc.invalidateQueries({ queryKey: TICKS_KEY });
    void qc.invalidateQueries({ queryKey: HABITS_KEY });
  };

  const tick = useMutation({
    mutationKey: TICK,
    onMutate: (v: { habitId: string; date: string; value?: number }) => {
      const prev = queryClient.getQueryData<Tick[]>(tKey) ?? [];
      const on = prev.some((t) => t.habit_id === v.habitId && t.on_date === v.date);
      queryClient.setQueryData<Tick[]>(
        tKey,
        on
          ? prev.filter((t) => !(t.habit_id === v.habitId && t.on_date === v.date))
          : [...prev, { habit_id: v.habitId, on_date: v.date, value: v.value ?? 1 }]
      );
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(tKey, ctx); },
    onSettled: settle,
  });

  // Optimistic: the new row has to appear on the press. Waiting for the round
  // trip made the button look dead on a slow connection, and offline — where
  // the write is queued rather than sent — it never appeared at all.
  const create = useMutation<unknown, Error, { id: string; name: string; color: string }, Habit[]>({
    mutationKey: CREATE,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Habit[]>(HABITS_KEY) ?? [];
      queryClient.setQueryData<Habit[]>(HABITS_KEY, [
        ...prev,
        { id: v.id, name: v.name, color: v.color, kind: 'bin', target: null, position: prev.length, archived_at: null },
      ]);
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(HABITS_KEY, ctx); },
    onSettled: settle,
  });
  const archive = useMutation<unknown, Error, { id: string; at: string | null }>({ mutationKey: ARCHIVE, onSettled: settle });

  const removeWithUndo = (h: Habit) => {
    archive.mutate({ id: h.id, at: new Date().toISOString() });
    toast(`Deleted “${h.name}”`, () => archive.mutate({ id: h.id, at: null }));
  };

  const rename = useMutation<unknown, Error, { id: string; name: string }>({ mutationKey: RENAME, onSettled: settle });
  const setKind = useMutation<unknown, Error, { id: string; kind: Habit['kind'] }>({ mutationKey: SET_KIND, onSettled: settle });

  return { tick, create, archive, rename, setKind, removeWithUndo };
}
