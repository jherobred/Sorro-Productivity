'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { fixture } from './devFixtures';
import { LINK_PREFIX, decodeLink, encodeLink, type LinkItem } from './linkText';

export { LINK_PREFIX, decodeLink, encodeLink, findUrl, safeUrl, siteOf, type LinkItem } from './linkText';

/**
 * Saved links.
 *
 * Each link is a scratchpad row tagged Link whose text is `@@link` and a small
 * JSON object, so links sync, go live across devices and come back from the
 * trash like every other row, without a new table. The Home scratchpad leaves
 * these rows out (lib/scratch.ts), so a library of links never floods it.
 * Category colours and their order ride the synced prefs.
 */

export const LINKS_KEY = ['scratch', 'links'] as const;

export function useLinks() {
  return useQuery({
    queryKey: LINKS_KEY,
    queryFn: async (): Promise<LinkItem[]> => {
      const fx = fixture<LinkItem[]>('links');
      if (fx) return fx;
      const { data, error } = await supabase
        .from('sorro_scratch')
        .select('id,text,pinned,position,created_at')
        .is('deleted_at', null)
        .like('text', `${LINK_PREFIX}%`)
        .order('created_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map(decodeLink).filter((l): l is LinkItem => !!l);
    },
  });
}

export type NewLink = Pick<LinkItem, 'id' | 'url' | 'label' | 'note' | 'category' | 'folder' | 'position'> & { color: string };

const ADD = defineMutation('links.add', async (v: NewLink) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_scratch').insert({
    id: v.id, user_id, text: encodeLink(v), tag: 'Link', color: v.color, position: v.position,
  });
  if (error) throw error;
});

const SAVE = defineMutation('links.save', async (v: { id: string; link: LinkItem; color?: string }) => {
  const patch: Record<string, unknown> = { text: encodeLink(v.link), pinned: v.link.pinned, position: v.link.position };
  if (v.color) patch.color = v.color;
  const { error } = await supabase.from('sorro_scratch').update(patch).eq('id', v.id);
  if (error) throw error;
});

const DEL = defineMutation('links.del', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_scratch').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('links.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('sorro_restore', { p_table: 'sorro_scratch', p_id: v.id });
  if (error) throw error;
});

export function useLinkActions() {
  const qc = useQueryClient();
  const settle = settler(qc, LINKS_KEY);
  const patch = (fn: (p: LinkItem[]) => LinkItem[]) => {
    const prev = queryClient.getQueryData<LinkItem[]>(LINKS_KEY) ?? [];
    queryClient.setQueryData<LinkItem[]>(LINKS_KEY, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: LinkItem[] | undefined) => { if (ctx) queryClient.setQueryData(LINKS_KEY, ctx); };

  const add = useMutation<unknown, Error, NewLink, LinkItem[]>({
    mutationKey: ADD,
    onMutate: (v) => patch((p) => [{ id: v.id, url: v.url, label: v.label, note: v.note, category: v.category, folder: v.folder ?? '', pinned: false, position: v.position, created_at: new Date().toISOString() }, ...p]),
    onError: rollback,
    onSettled: settle,
  });
  const save = useMutation<unknown, Error, { id: string; link: LinkItem; color?: string }, LinkItem[]>({
    mutationKey: SAVE,
    onMutate: (v) => patch((p) => p.map((l) => (l.id === v.id ? v.link : l))),
    onError: rollback,
    onSettled: settle,
  });
  const del = useMutation<unknown, Error, { id: string }, LinkItem[]>({
    mutationKey: DEL,
    onMutate: (v) => patch((p) => p.filter((l) => l.id !== v.id)),
    onError: rollback,
    onSettled: settle,
  });
  const restore = useMutation<unknown, Error, { id: string; link: LinkItem }, LinkItem[]>({
    mutationKey: RESTORE,
    onMutate: (v) => patch((p) => (p.some((l) => l.id === v.id) ? p : [v.link, ...p])),
    onError: rollback,
    onSettled: settle,
  });
  return { add, save, del, restore };
}
