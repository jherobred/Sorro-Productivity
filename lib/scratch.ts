'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { PAL } from './pal';
import { settler } from './settle';
import { LINK_PREFIX } from './linkText';

export type Scratch = {
  id: string;
  text: string;
  title?: string;
  photo_url?: string;
  tag: string;
  color: string;
  pinned: boolean;
  position: number;
  created_at: string;
};

const KEY = ['scratch'] as const;

/** Tag cycle from the prototype's scratchpad / journal. */
export const SCRATCH_TAGS = ['Journal', 'Note', 'Idea', 'Todo', 'Memory', 'Link'] as const;
export const TAG_COLOR: Record<string, string> = {
  Journal: PAL.amber,
  Note: PAL.cyan,
  Idea: PAL.indigo,
  Todo: PAL.mint,
  Memory: PAL.coral,
  Link: PAL.violet,
};

export function useScratch() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Scratch[]> => {
      const { data, error } = await supabase
        .from('sorro_scratch')
        .select('id,text,tag,color,pinned,position,created_at')
        .is('deleted_at', null)
        // Saved links live in this table too; they have their own page.
        .not('text', 'like', `${LINK_PREFIX}%`)
        .order('pinned', { ascending: false })
        .order('position')
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((d) => {
        // Try parsing JSON payload if photo_url / title was stored inside text
        let title: string | undefined;
        let photo_url: string | undefined;
        let text = d.text;
        if (text.startsWith('__JOURNAL__')) {
          try {
            const parsed = JSON.parse(text.replace('__JOURNAL__', ''));
            title = parsed.title;
            photo_url = parsed.photo_url;
            text = parsed.text;
          } catch {}
        }
        return {
          ...d,
          title,
          photo_url,
          text,
        };
      });
    },
  });
}

const ADD = defineMutation('scratch.add', async (v: { id: string; text: string; title?: string; photo_url?: string; tag: string; color: string }) => {
  const user_id = await currentUserId();
  let dbText = v.text;
  if (v.photo_url || v.title) {
    dbText = '__JOURNAL__' + JSON.stringify({
      title: v.title,
      photo_url: v.photo_url,
      text: v.text,
    });
  }
  const { error } = await supabase.from('sorro_scratch').insert({
    id: v.id,
    user_id,
    text: dbText,
    tag: v.tag,
    color: v.color,
    position: Date.now() % 2_000_000_000,
  });
  if (error) throw error;
});

const SAVE = defineMutation('scratch.save', async (v: { id: string; patch: Partial<Scratch> }) => {
  const patch: Record<string, unknown> = { ...v.patch };
  if (v.patch.photo_url !== undefined || v.patch.title !== undefined || v.patch.text !== undefined) {
    patch.text = '__JOURNAL__' + JSON.stringify({
      title: v.patch.title,
      photo_url: v.patch.photo_url,
      text: v.patch.text,
    });
    delete patch.title;
    delete patch.photo_url;
  }
  const { error } = await supabase.from('sorro_scratch').update(patch).eq('id', v.id);
  if (error) throw error;
});

const DEL = defineMutation('scratch.del', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_scratch').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('scratch.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('sorro_restore', { p_table: 'sorro_scratch', p_id: v.id });
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

  const add = useMutation({
    mutationKey: ADD,
    onMutate: (v: { id: string; text: string; title?: string; photo_url?: string; tag: string; color: string }) =>
      patchLocal((p) => [{
        id: v.id,
        text: v.text,
        title: v.title,
        photo_url: v.photo_url,
        tag: v.tag,
        color: v.color,
        pinned: false,
        position: 0,
        created_at: new Date().toISOString(),
      }, ...p]),
    onError: rollback,
    onSettled: settle,
  });

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
    toast('Entry deleted', () => restore.mutate({ id: n.id }));
  };

  return { add, save, del, restore, removeWithUndo };
}

export function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}
