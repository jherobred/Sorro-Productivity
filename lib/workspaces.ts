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
 *
 * **Three roles, and they mean something now.** Membership used to grant
 * visibility of the workspace row and nothing else: `bd_projects` and
 * `bd_files` carry a `workspace_id` but their policies only ever asked
 * `user_id = auth.uid()`, so inviting somebody showed them the name of a space
 * and none of the work in it. Migration 0013 adds the policies that make it
 * real — a **viewer** reads everything in the space, an **editor** also
 * writes, and the **owner** additionally manages people and can delete it.
 * Anything with no workspace_id is personal and none of this touches it.
 */

export type Role = 'owner' | 'editor' | 'viewer';

export type Workspace = { id: string; name: string; color: string; owner_id: string; role: Role };

export type Member = { user_id: string; role: Role };

const KEY = ['workspaces'] as const;
const MEMBERS = ['workspace_members'] as const;

/** The id meaning "just me". Not a row — see above. */
export const PERSONAL = null;

/** What each role is allowed to do, in the words the sheet shows. */
export const ROLE_NOTE: Record<Role, string> = {
  owner: 'Manages people, can delete the space',
  editor: 'Can add and change anything in it',
  viewer: 'Can read everything, changes nothing',
};

export function useWorkspaces() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Workspace[]> => {
      const { data, error } = await supabase
        .from('bd_workspaces')
        .select('id,name,color,owner_id,bd_workspace_members(role)')
        .is('deleted_at', null)
        .order('created_at');
      if (error) throw error;
      const me = await currentUserId().catch(() => null);
      return (data ?? []).map((w) => {
        const row = w as typeof w & { bd_workspace_members?: { role: Role }[] };
        return {
          id: w.id, name: w.name, color: w.color, owner_id: w.owner_id,
          role: (w.owner_id === me ? 'owner' : row.bd_workspace_members?.[0]?.role ?? 'editor') as Role,
        };
      });
    },
  });
}

/**
 * Who is in one space.
 *
 * Enabled only while the managing sheet is open: this is the one screen that
 * needs it, and every other surface would be paying for a query it never
 * reads. The owner is included from `bd_workspaces.owner_id` rather than
 * trusted from a membership row, which is the same rule `bd_ws_role` follows
 * in the database.
 */
export function useMembers(workspaceId: string | null) {
  return useQuery({
    queryKey: [...MEMBERS, workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.from('bd_workspace_members')
        .select('user_id,role').eq('workspace_id', workspaceId as string).order('joined_at');
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
}

const CREATE = defineMutation('ws.create', async (v: { id: string; name: string; color: string }) => {
  const owner_id = await currentUserId();
  const { error } = await supabase.from('bd_workspaces').insert({ ...v, owner_id });
  if (error) throw error;
  // The owner is a member too, or every membership check would exclude them.
  const { error: memberError } = await supabase.from('bd_workspace_members').insert({ workspace_id: v.id, user_id: owner_id, role: 'owner' });
  if (memberError) throw memberError;
});

const EDIT = defineMutation('ws.edit', async (v: { id: string; patch: { name?: string; color?: string } }) => {
  const { error } = await supabase.from('bd_workspaces').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

/**
 * Soft delete, so Undo is one flag.
 *
 * The projects and files inside keep their `workspace_id` and are simply
 * invisible while the space is deleted — restoring it brings the whole space
 * back exactly as it was. A hard delete would cascade the memberships away and
 * strand everybody else's access with no way to give it back.
 */
const DELETE = defineMutation('ws.delete', async (v: { id: string; at: string | null }) => {
  const { error } = await supabase.from('bd_workspaces').update({ deleted_at: v.at }).eq('id', v.id);
  if (error) throw error;
});

const LEAVE = defineMutation('ws.leave', async (v: { id: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_workspace_members')
    .delete().eq('workspace_id', v.id).eq('user_id', user_id);
  if (error) throw error;
});

// Through the RPC rather than a plain insert: it checks that the caller owns
// the space and that the target is a real person, and upserts so re-inviting
// somebody at a different role changes their role instead of failing on the
// primary key.
const INVITE = defineMutation('ws.invite', async (v: { id: string; user_id: string; role: Exclude<Role, 'owner'> }) => {
  const { error } = await supabase.rpc('bd_ws_invite', { p_ws: v.id, p_user: v.user_id, p_role: v.role });
  if (error) throw error;
});

const REMOVE_MEMBER = defineMutation('ws.removeMember', async (v: { id: string; user_id: string }) => {
  const { error } = await supabase.from('bd_workspace_members')
    .delete().eq('workspace_id', v.id).eq('user_id', v.user_id);
  if (error) throw error;
});

export function useWorkspaceActions() {
  const qc = useQueryClient();
  const settle = settler(qc, KEY, MEMBERS);
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
  const edit = useMutation<unknown, Error, { id: string; patch: { name?: string; color?: string } }>({
    mutationKey: EDIT,
    onMutate: (v) => patch((p) => p.map((w) => (w.id === v.id ? { ...w, ...v.patch } : w))),
    onSettled: settle,
  });
  const del = useMutation<unknown, Error, { id: string; at: string | null }>({
    mutationKey: DELETE,
    onMutate: (v) => patch((p) => (v.at ? p.filter((w) => w.id !== v.id) : p)),
    onSettled: settle,
  });
  const leave = useMutation<unknown, Error, { id: string }>({
    mutationKey: LEAVE,
    onMutate: (v) => patch((p) => p.filter((w) => w.id !== v.id)),
    onSettled: settle,
  });
  const invite = useMutation<unknown, Error, { id: string; user_id: string; role: Exclude<Role, 'owner'> }>({
    mutationKey: INVITE,
    onError: (e) => toast(e.message),
    onSettled: settle,
  });
  const removeMember = useMutation<unknown, Error, { id: string; user_id: string }>({
    mutationKey: REMOVE_MEMBER,
    onSettled: settle,
  });

  return {
    create, edit, del, leave, invite, removeMember,
    add(name: string, color: string) {
      create.mutate({ id: crypto.randomUUID(), name, color });
      toast(`Created “${name}”`);
    },
    rename(id: string, name: string) {
      edit.mutate({ id, patch: { name } });
      toast(`Renamed to “${name}”`);
    },
    /** Deleting a space is the one destructive act in the sidebar. It undoes. */
    removeWithUndo(w: Workspace) {
      del.mutate({ id: w.id, at: new Date().toISOString() });
      toast(`Deleted “${w.name}”`, () => del.mutate({ id: w.id, at: null }));
    },
    /**
     * Leaving has no Undo, and offering one would be a lie: only the owner can
     * add somebody to a space, so pressing Undo could not put you back. The UI
     * confirms first instead — see components/SpaceSheet.
     */
    leaveSpace(w: Workspace) {
      leave.mutate({ id: w.id });
      toast(`Left “${w.name}” — the owner can add you back`);
    },
  };
}
