'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { PAL } from './pal';
import { settler } from './settle';

export type Scratch = {
  id: string; text: string; tag: string; color: string;
  pinned: boolean; position: number; created_at: string;
};

const KEY = ['scratch'] as const;

/** Tag cycle from the prototype's scratchpad. */
export const SCRATCH_TAGS = ['Note', 'Idea', 'Todo', 'Link'] as const;
export const TAG_COLOR: Record<string, string> = {
  Note: PAL.cyan, Idea: PAL.amber, Todo: PAL.mint, Link: PAL.violet,
};

export function useScratch() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Scratch[]> => {
      const { data, error } = await supabase
        .from('bd_scratch')
        .select('id,text,tag,color,pinned,position,created_at')
        .is('deleted_at', null)
        .order('pinned', { ascending: false })
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

const ADD = defineMutation('scratch.add', async (v: { id: string; text: string; tag: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_scratch').insert({ ...v, user_id, position: Date.now() % 2_000_000_000 });
  if (error) throw error;
});

const SAVE = defineMutation('scratch.save', async (v: { id: string; patch: Partial<Scratch> }) => {
  const { error } = await supabase.from('bd_scratch').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DEL = defineMutation('scratch.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_scratch').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('scratch.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_scratch', p_id: v.id });
  if (error) throw error;
});

export function useScratchActions() {
  const qc = useQueryClient();
  const settle = settler(qc, KEY);
  const patchLocal = (fn: (p: Scratch[]) => Scratch[]) => {
    const prev = queryClient.getQueryData<Scratch[]>(KEY) ?? [];
    queryClient.setQueryData<Scratch[]>(KEY, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: Scratch[] | undefined) => {
    if (ctx) queryClient.setQueryData(KEY, ctx);
  };

  const add = useMutation<unknown, Error, { id: string; text: string; tag: string; color: string }>({ mutationKey: ADD, onSettled: settle });
  const restore = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE, onSettled: settle });

  const save = useMutation({
    mutationKey: SAVE,
    onMutate: (v: { id: string; patch: Partial<Scratch> }) =>
      patchLocal((p) => p.map((n) => (n.id === v.id ? { ...n, ...v.patch } : n))),
    onError: rollback,
    onSettled: settle,
  });

  const del = useMutation({
    mutationKey: DEL,
    onMutate: (v: { id: string }) => patchLocal((p) => p.filter((n) => n.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });

  const removeWithUndo = (n: Scratch) => {
    del.mutate({ id: n.id });
    toast('Note deleted', () => restore.mutate({ id: n.id }));
  };

  return { add, save, del, restore, removeWithUndo };
}

/** "3m", "2h", "yesterday" — the compact stamp the scratchpad rows show. */
/**
 * A complete phrase, not a fragment.
 *
 * This used to return bare tokens — "now", "yesterday", "3m" — and five call
 * sites appended " ago" to them, which rendered "yesterday ago" and "now ago"
 * on the feed and in Settings. Owning the whole phrase is the only version that
 * cannot be misused: there is nothing left for a caller to add.
 */
export function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
