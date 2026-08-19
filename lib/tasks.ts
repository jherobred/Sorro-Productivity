'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';

export type Task = {
  id: string;
  list_id: string | null;
  title: string;
  notes: string;
  done: boolean;
  due_on: string | null;
  /** A precise slot on the calendar. Without one the task sits in the all-day
      tray; `due_on` stays the date the Tasks page groups by either way. */
  due_at?: string | null;
  // Drives the checkbox ring colour (priCol in the prototype): high→coral,
  // med→amber, low/null→tx3.
  priority: 'low' | 'med' | 'high' | null;
  stars: number;
  position: number;
  deleted_at: string | null;
};

export type List = { id: string; name: string; color: string; position: number };

const TASKS_KEY = ['tasks'] as const;
const LISTS_KEY = ['lists'] as const;

export function useLists() {
  return useQuery({
    queryKey: LISTS_KEY,
    queryFn: async (): Promise<List[]> => {
      const { data, error } = await supabase
        .from('bd_lists')
        .select('id,name,color,position')
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTasks() {
  return useQuery({
    queryKey: TASKS_KEY,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('bd_tasks')
        .select('id,list_id,title,notes,done,due_on,due_at,priority,stars,position,deleted_at')
        .is('deleted_at', null)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ---- Mutations -----------------------------------------------------------
   Registered at module scope so a write queued offline can still be replayed
   after a full app restart, when the original closure is long gone. */

/**
 * Everything the composer can collect, not just a title. Creating a task and
 * then opening it to set the three things you already knew was two steps for
 * one intention.
 */
export type NewTask = {
  id: string;
  title: string;
  listId: string | null;
  notes?: string;
  due_on?: string | null;
  due_at?: string | null;
  priority?: 'low' | 'med' | 'high' | null;
  stars?: number;
};

const CREATE = defineMutation('task.create', async (v: NewTask) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_tasks').insert({
    id: v.id, user_id, title: v.title, list_id: v.listId,
    notes: v.notes ?? '',
    due_on: v.due_on ?? null,
    due_at: v.due_at ?? null,
    priority: v.priority ?? null,
    stars: v.stars ?? 0,
    position: Date.now() % 2_000_000_000,
  });
  if (error) throw error;
});

const UPDATE = defineMutation('task.update', async (v: { id: string; patch: Partial<Task> }) => {
  const { error } = await supabase.from('bd_tasks').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const COMPLETE = defineMutation('task.complete', async (v: { id: string; done: boolean }) => {
  const { error } = await supabase
    .from('bd_tasks')
    .update({ done: v.done, completed_at: v.done ? new Date().toISOString() : null })
    .eq('id', v.id);
  if (error) throw error;
});

const DELETE = defineMutation('task.delete', async (v: { id: string }) => {
  // Soft delete — undo has to survive a refresh, so it is a column, not memory.
  const { error } = await supabase
    .from('bd_tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('task.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_tasks', p_id: v.id });
  if (error) throw error;
});

/** Optimistically patch the cached list; returns the snapshot for rollback. */
function optimistic(fn: (prev: Task[]) => Task[]) {
  const prev = queryClient.getQueryData<Task[]>(TASKS_KEY) ?? [];
  queryClient.setQueryData<Task[]>(TASKS_KEY, fn(prev));
  return prev;
}

const rollback = (_e: unknown, _v: unknown, ctx: Task[] | undefined) => {
  if (ctx) queryClient.setQueryData(TASKS_KEY, ctx);
};

export function useTaskActions() {
  const qc = useQueryClient();
  const settle = settler(qc, TASKS_KEY);

  const create = useMutation({
    mutationKey: CREATE,
    onMutate: (v: NewTask) =>
      optimistic((prev) => [
        ...prev,
        {
          id: v.id,
          list_id: v.listId,
          title: v.title,
          notes: v.notes ?? '',
          done: false,
          due_on: v.due_on ?? null,
          due_at: v.due_at ?? null,
          priority: v.priority ?? null,
          stars: v.stars ?? 0,
          position: Number.MAX_SAFE_INTEGER,
          deleted_at: null,
        },
      ]),
    onError: rollback,
    onSettled: settle,
  });

  const update = useMutation({
    mutationKey: UPDATE,
    onMutate: (v: { id: string; patch: Partial<Task> }) =>
      optimistic((prev) => prev.map((t) => (t.id === v.id ? { ...t, ...v.patch } : t))),
    onError: rollback,
    onSettled: settle,
  });

  const complete = useMutation({
    mutationKey: COMPLETE,
    onMutate: (v: { id: string; done: boolean }) =>
      optimistic((prev) => prev.map((t) => (t.id === v.id ? { ...t, done: v.done } : t))),
    onError: rollback,
    onSettled: settle,
  });

  // mutationFn lives in setMutationDefaults, so the variables type has to be
  // stated explicitly — there is no function signature here to infer from.
  const restore = useMutation<unknown, Error, { id: string }>({
    mutationKey: RESTORE,
    onSettled: settle,
  });

  const remove = useMutation({
    mutationKey: DELETE,
    onMutate: (v: { id: string }) => optimistic((prev) => prev.filter((t) => t.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });

  /** Delete + toast with a working Undo inside the 4200 ms window. */
  const removeWithUndo = (task: Task) => {
    remove.mutate({ id: task.id });
    toast(`Deleted “${task.title}”`, () => restore.mutate({ id: task.id }));
  };

  return { create, update, complete, remove, restore, removeWithUndo };
}
