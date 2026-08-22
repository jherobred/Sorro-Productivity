'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';
import { fixture } from './devFixtures';
import type { WorkoutSet } from './lift';

/**
 * The sets of a session, as rows.
 *
 * The arithmetic lives in `lib/lift.ts` (pure, `node lib/lift.check.ts`); this
 * file only fetches and writes. Everything the screen shows — volume, an
 * estimated max, what you lifted last time — is derived, so there is no total
 * stored anywhere to fall out of step with the sets it came from.
 */

export const SETS = ['workout_sets'] as const;

/** One cache entry per window of sessions, keyed by the ids it covers. */
const keyFor = (ids: string[]) => [...SETS, ids.slice().sort().join(',')] as const;

/**
 * Every set belonging to the sessions on screen, in one query rather than one
 * per session. Skipped entirely when there are none — a new account should not
 * spend a round trip proving it has nothing.
 */
export function useSets(workoutIds: string[]) {
  return useQuery({
    queryKey: keyFor(workoutIds),
    enabled: workoutIds.length > 0,
    queryFn: async (): Promise<WorkoutSet[]> => {
      const fx = fixture<WorkoutSet[]>('workout_sets');
      if (fx) return fx.filter((s) => workoutIds.includes(s.workout_id));
      const { data, error } = await supabase.from('bd_workout_sets')
        .select('id,workout_id,exercise,position,weight_kg,reps,done')
        .in('workout_id', workoutIds).order('position');
      if (error) throw error;
      // `numeric(6,2)` arrives from PostgREST as a string. Left alone, every
      // sum downstream concatenates instead of adding and a session's volume
      // reads "6060".
      return (data ?? []).map((s) => ({
        ...s, weight_kg: Number(s.weight_kg), reps: Number(s.reps),
      })) as WorkoutSet[];
    },
  });
}

/* --------------------------------------------------------------- mutations */

const ADD_SET = defineMutation('gym.addSet', async (v: WorkoutSet) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_workout_sets').insert({ ...v, user_id });
  if (error) throw error;
});

const EDIT_SET = defineMutation('gym.editSet', async (v: { id: string; patch: Partial<WorkoutSet> }) => {
  const { error } = await supabase.from('bd_workout_sets').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DEL_SET = defineMutation('gym.delSet', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_workout_sets').delete().eq('id', v.id);
  if (error) throw error;
});

export function useSetActions(workoutIds: string[]) {
  const qc = useQueryClient();
  const key = keyFor(workoutIds);
  const settle = settler(qc, SETS);

  const patch = (fn: (p: WorkoutSet[]) => WorkoutSet[]) => {
    const prev = queryClient.getQueryData<WorkoutSet[]>(key) ?? [];
    queryClient.setQueryData<WorkoutSet[]>(key, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: WorkoutSet[] | undefined) => {
    if (ctx) queryClient.setQueryData(key, ctx);
  };

  const addSet = useMutation<unknown, Error, WorkoutSet, WorkoutSet[]>({
    mutationKey: ADD_SET,
    onMutate: (v) => patch((p) => [...p, v]),
    onError: (e, v, ctx) => { rollback(e, v, ctx); toast(e.message); },
    onSettled: settle,
  });

  const editSet = useMutation<unknown, Error, { id: string; patch: Partial<WorkoutSet> }, WorkoutSet[]>({
    mutationKey: EDIT_SET,
    onMutate: (v) => patch((p) => p.map((s) => (s.id === v.id ? { ...s, ...v.patch } : s))),
    onError: rollback,
    onSettled: settle,
  });

  const delSet = useMutation<unknown, Error, { id: string }, WorkoutSet[]>({
    mutationKey: DEL_SET,
    onMutate: (v) => patch((p) => p.filter((s) => s.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });

  return { addSet, editSet, delSet };
}
