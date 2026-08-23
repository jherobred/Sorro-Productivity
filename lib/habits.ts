'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';

export type Habit = {
  id: string;
  name: string;
  color: string;
  kind: 'bin' | 'count' | 'dur';
  target: number | null;
  position: number;
  archived_at: string | null;
  /**
   * The challenge this habit mirrors, or null for one you made yourself.
   *
   * Joining a challenge used to leave you with a scoreboard in Community and
   * nothing on the page you open every morning, so people joined and then
   * forgot. Every challenge now writes a habit here (lib/challenges.ts), and
   * the Habits page keeps them in their own group below your own.
   */
  challenge_id: string | null;
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
        .select('id,name,color,kind,target,position,archived_at,challenge_id')
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

/**
 * The habit that stands for a challenge, made once and found thereafter.
 *
 * Not an upsert: the uniqueness is a *partial* index (`where challenge_id is
 * not null`, migration 0011) and PostgREST cannot describe that predicate to
 * ON CONFLICT, so the inference would fail at run time. Insert, and treat a
 * refusal as somebody else's insert having won the race - then read theirs.
 */
export async function mirrorHabit(v: {
  challenge_id: string; name: string; color: string;
}): Promise<string | null> {
  const user_id = await currentUserId();

  const found = await supabase.from('bd_habits')
    .select('id').eq('user_id', user_id).eq('challenge_id', v.challenge_id).maybeSingle();
  if (found.data?.id) return found.data.id;

  const id = crypto.randomUUID();
  const { error } = await supabase.from('bd_habits')
    .insert({ id, user_id, name: v.name, color: v.color, challenge_id: v.challenge_id });
  if (!error) return id;

  const again = await supabase.from('bd_habits')
    .select('id').eq('user_id', user_id).eq('challenge_id', v.challenge_id).maybeSingle();
  if (again.data?.id) return again.data.id;
  throw error;
}

/** Put the mirror away when you leave. Archived, never deleted: the ticks are
 *  yours and a streak should not vanish because a challenge ended. */
export async function retireMirror(challenge_id: string) {
  const user_id = await currentUserId();
  await supabase.from('bd_habits')
    .update({ archived_at: new Date().toISOString() })
    .eq('user_id', user_id).eq('challenge_id', challenge_id);
}

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
  const settle = settler(qc, TICKS_KEY, HABITS_KEY);

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
        { id: v.id, name: v.name, color: v.color, kind: 'bin', target: null, position: prev.length, archived_at: null, challenge_id: null },
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
