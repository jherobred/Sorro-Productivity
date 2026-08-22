'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '../Icon';
import { PeoplePicker } from '../PeoplePicker';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { settler } from '@/lib/settle';
import { useProfiles, displayOf } from '@/lib/people';
import { usePresence, type Peer } from '@/lib/presence';
import { confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';

/**
 * Who is on this project — the strip above the pipeline.
 *
 * The header used to draw three avatars reading MR, JL and RT. They were a
 * literal array in the JSX: the same three initials on every project, on
 * everybody's screen, for a board with one member. Every card drew "MR" as its
 * assignee for the same reason. A team that is a decoration is worse than no
 * team, because it makes a shared board look like it is already working.
 *
 * `bd_project_members` has existed the whole time, with a role and a colour per
 * person. This reads it, shows who is actually here, and lets you add someone
 * or leave. A green ring means they have the project open right now — that
 * comes off the presence channel the app already joins, so it costs nothing.
 */

const MEMBERS = ['project_members'] as const;

type MemberRow = { project_id: string; user_id: string; role_label: string; color: string; active: boolean };

export function useProjectMembers() {
  return useQuery({
    queryKey: MEMBERS,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await supabase.from('bd_project_members')
        .select('project_id,user_id,role_label,color,active');
      if (error) throw error;
      return data ?? [];
    },
  });
}

const ADD = defineMutation('proj.addMember', async (v: { project_id: string; user_ids: string[] }) => {
  const { error } = await supabase.from('bd_project_members')
    .insert(v.user_ids.map((user_id) => ({ project_id: v.project_id, user_id })));
  if (error) throw error;
});

const REMOVE = defineMutation('proj.removeMember', async (v: { project_id: string; user_id: string }) => {
  const { error } = await supabase.from('bd_project_members')
    .delete().eq('project_id', v.project_id).eq('user_id', v.user_id);
  if (error) throw error;
});

export function Crew({
  projectId, ownerId, color, room,
}: {
  projectId: string;
  ownerId: string;
  color: string;
  /** The presence room this project's page joins, or null on a phone. */
  room: string | null;
}) {
  const qc = useQueryClient();
  const [picking, setPicking] = useState(false);
  const [me, setMe] = useState('');
  const { data: profiles = {} } = useProfiles();
  const { data: all = [] } = useProjectMembers();
  const peers = usePresence(room);

  // The owner is on the project whether or not anybody wrote them a row.
  const rows = all.filter((m) => m.project_id === projectId);
  const ids = [ownerId, ...rows.map((m) => m.user_id).filter((id) => id !== ownerId)].filter(Boolean);

  useEffect(() => { void currentUserId().then(setMe).catch(() => setMe('')); }, []);
  const settle = settler(qc, MEMBERS);

  const add = useMutation<unknown, Error, { project_id: string; user_ids: string[] }>({
    mutationKey: ADD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<MemberRow[]>(MEMBERS) ?? [];
      queryClient.setQueryData<MemberRow[]>(MEMBERS, [
        ...prev,
        ...v.user_ids.map((user_id) => ({
          project_id: v.project_id, user_id, role_label: '', color, active: true,
        })),
      ]);
    },
    onSettled: settle,
  });

  const remove = useMutation<unknown, Error, { project_id: string; user_id: string }>({
    mutationKey: REMOVE,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<MemberRow[]>(MEMBERS) ?? [];
      queryClient.setQueryData<MemberRow[]>(MEMBERS,
        prev.filter((m) => !(m.project_id === v.project_id && m.user_id === v.user_id)));
    },
    onSettled: settle,
  });

  const here = (id: string) => peers.some((p: Peer) => p.user_id === id);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex' }}>
        {ids.slice(0, 6).map((id, i) => {
          const who = displayOf(profiles, id, me);
          const owner = id === ownerId;
          return (
            <button key={id} title={`${who.label}${owner ? ' · owner' : ''}${here(id) ? ' · here now' : ''}`}
              aria-label={`${who.label}${owner ? ', owner' : ''}`}
              onClick={() => {
                if (owner) { toast(`${who.label} owns this project`); return; }
                void confirmAsk(`Remove ${who.label}?`, {
                  message: 'They keep anything they wrote; they just stop seeing the board.',
                  confirmLabel: 'Remove', danger: true,
                }).then((yes) => { if (yes) remove.mutate({ project_id: projectId, user_id: id }); });
              }}
              style={{
                width: 26, height: 26, borderRadius: '50%', marginLeft: i ? -7 : 0,
                background: who.hue, display: 'grid', placeItems: 'center',
                fontSize: 9, fontWeight: 700, color: '#0C0F16',
                border: `2px solid ${here(id) ? 'var(--pal-mint)' : 'var(--bg)'}`,
                position: 'relative', zIndex: 6 - i,
              }}>
              {who.initials}
            </button>
          );
        })}
        {ids.length > 6 && (
          <span style={{
            width: 26, height: 26, borderRadius: '50%', marginLeft: -7, background: 'var(--card2)',
            border: '2px solid var(--bg)', display: 'grid', placeItems: 'center',
            fontSize: 9, fontWeight: 700, color: 'var(--tx2)',
          }}>+{ids.length - 6}</span>
        )}
      </div>

      <button onClick={() => setPicking(true)} className="hov" title="Add someone" aria-label="Add someone to this project"
        style={{
          width: 26, height: 26, borderRadius: '50%', border: '1px dashed var(--line2)',
          display: 'grid', placeItems: 'center', marginLeft: 2,
        }}>
        <Icon name="plus" size={12} color="var(--tx3)" />
      </button>

      {picking && (
        <PeoplePicker title="Add to this project" me={me} exclude={ids} multi askName={false}
          confirmLabel="Add" onClose={() => setPicking(false)}
          onPick={(picked) => {
            setPicking(false);
            add.mutate({ project_id: projectId, user_ids: picked });
            toast(picked.length === 1 ? 'Added to the project' : `${picked.length} people added`);
          }} />
      )}
    </div>
  );
}
