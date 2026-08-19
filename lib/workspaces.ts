'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';

/**
 * Shared spaces.
 *
 * The sidebar had a "Personal" switcher listing three invented workspaces that
 * did nothing — picking one changed a label and no data. The tables were
 * already here, with RLS that lets you see a workspace if you own it or belong
 * to it, so this is wiring rather than new machinery.
 *
 * Everyone has a personal space that is not a row: it is the absence of one.
 * A student who never shares anything should not have to be told what a
 * workspace is, and "Personal" as a real record would need creating, could be
 * renamed into nonsense, and could be deleted out from under its own data.
 */

export type Workspace = { id: string; name: string; color: string; owner_id: string; role: string };

const KEY = ['workspaces'] as const;

/** The id meaning "just me". Not a row — see above. */
export const PERSONAL = null;

export function useWorkspaces() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Workspace[]> => {
      const { data, error } = await supabase
        .from('bd_workspaces')
        .select('id,name,color,owner_id,bd_workspace_members(role)')
        .order('created_at');
      if (error) throw error;
      const me = await currentUserId().catch(() => null);
      return (data ?? []).map((w) => {
        const row = w as typeof w & { bd_workspace_members?: { role: string }[] };
        return {
          id: w.id, name: w.name, color: w.color, owner_id: w.owner_id,
          role: w.owner_id === me ? 'owner' : row.bd_workspace_members?.[0]?.role ?? 'member',
        };
      });
    },
  });
}

const CREATE = defineMutation('ws.create', async (v: { id: string; name: string; color: string }) => {
  const owner_id = await currentUserId();
  const { error } = await supabase.from('bd_workspaces').insert({ ...v, owner_id });
  if (error) throw error;
  // The owner is a member too, or every membership check would exclude them.
  await supabase.from('bd_workspace_members').insert({ workspace_id: v.id, user_id: owner_id, role: 'owner' });
});

const RENAME = defineMutation('ws.rename', async (v: { id: string; name: string }) => {
  const { error } = await supabase.from('bd_workspaces').update({ name: v.name }).eq('id', v.id);
  if (error) throw error;
});

const LEAVE = defineMutation('ws.leave', async (v: { id: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_workspace_members')
    .delete().eq('workspace_id', v.id).eq('user_id', user_id);
  if (error) throw error;
});

export function useWorkspaceActions() {
  const qc = useQueryClient();
  const settle = settler(qc, KEY);
  const patch = (fn: (p: Workspace[]) => Workspace[]) => {
    const prev = queryClient.getQueryData<Workspace[]>(KEY) ?? [];
    queryClient.setQueryData<Workspace[]>(KEY, fn(prev));
    return prev;
  };

  const create = useMutation<unknown, Error, { id: string; name: string; color: string }>({
    mutationKey: CREATE,
    onMutate: (v) => patch((p) => [...p, { ...v, owner_id: '', role: 'owner' }]),
    onSettled: settle,
  });
  const rename = useMutation<unknown, Error, { id: string; name: string }>({
    mutationKey: RENAME,
    onMutate: (v) => patch((p) => p.map((w) => (w.id === v.id ? { ...w, name: v.name } : w))),
    onSettled: settle,
  });
  const leave = useMutation<unknown, Error, { id: string }>({
    mutationKey: LEAVE,
    onMutate: (v) => patch((p) => p.filter((w) => w.id !== v.id)),
    onSettled: settle,
  });

  return {
    create, rename, leave,
    add(name: string, color: string) {
      create.mutate({ id: crypto.randomUUID(), name, color });
      toast(`Created “${name}”`);
    },
  };
}
