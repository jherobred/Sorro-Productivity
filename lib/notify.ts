'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { PAL } from './pal';
import { settler } from './settle';
import { fixture } from './devFixtures';

/**
 * The notification feed behind the bell in the top bar and the announcements
 * pane on Home. Rows come from three places:
 *   - the app itself (a task fell overdue, a challenge settled)
 *   - Canvas LMS announcements, written by the sync Edge Function
 *   - anything else with an `external_id`, deduped by the unique index
 */

export type Notif = {
  id: string;
  kind: 'info' | 'task' | 'event' | 'canvas' | 'social' | 'challenge';
  title: string;
  body: string;
  href: string | null;
  source: string;
  read_at: string | null;
  created_at: string;
};

const KEY = ['notifications'] as const;

export const NOTIF_HUE: Record<Notif['kind'], string> = {
  info: PAL.sky,
  task: PAL.indigo,
  event: PAL.violet,
  canvas: PAL.coral,
  social: PAL.pink,
  challenge: PAL.amber,
};

export const NOTIF_ICON: Record<Notif['kind'], string> = {
  info: 'spark', task: 'task', event: 'cal', canvas: 'book', social: 'chat', challenge: 'trophy',
};

export function useNotifications() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Notif[]> => {
      const fx = fixture<Notif[]>('notifications');
      if (fx) return fx;
      const { data, error } = await supabase
        .from('sorro_notifications')
        .select('id,kind,title,body,href,source,read_at,created_at')
        // Only the fox's notes are shown now; Canvas announcements would crowd them out of the 60.
        .eq('source', 'fox')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter((n) => !n.read_at).length;
}

const ADD = defineMutation('notif.add', async (v: {
  id?: string; kind: Notif['kind']; title: string; body?: string; href?: string; source?: string; external_id?: string;
}) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_notifications').insert({
    ...(v.id ? { id: v.id } : {}), user_id, kind: v.kind, title: v.title, body: v.body ?? '',
    href: v.href ?? null, source: v.source ?? 'app', external_id: v.external_id ?? null,
  });
  // A duplicate external_id means the row already arrived from a previous sync,
  // which is the index doing its job — not a failure worth surfacing.
  if (error && error.code !== '23505') throw error;
});

const READ = defineMutation('notif.read', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_notifications')
    .update({ read_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const READ_ALL = defineMutation('notif.readAll', async () => {
  const { error } = await supabase.from('sorro_notifications')
    .update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (error) throw error;
});

const CLEAR = defineMutation('notif.clear', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_notifications').delete().eq('id', v.id);
  if (error) throw error;
});

export function useNotifActions() {
  const qc = useQueryClient();
  const settle = settler(qc, KEY);
  const patchLocal = (fn: (p: Notif[]) => Notif[]) => {
    const prev = queryClient.getQueryData<Notif[]>(KEY) ?? [];
    queryClient.setQueryData<Notif[]>(KEY, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: Notif[] | undefined) => {
    if (ctx) queryClient.setQueryData(KEY, ctx);
  };
  const now = () => new Date().toISOString();

  return {
    add: useMutation<unknown, Error, { id?: string; kind: Notif['kind']; title: string; body?: string; href?: string; source?: string; external_id?: string }>(
      { mutationKey: ADD, onSettled: settle }),
    read: useMutation({
      mutationKey: READ,
      onMutate: (v: { id: string }) => patchLocal((p) => p.map((n) => (n.id === v.id ? { ...n, read_at: now() } : n))),
      onError: rollback,
      onSettled: settle,
    }),
    readAll: useMutation<unknown, Error, void, Notif[]>({
      mutationKey: READ_ALL,
      onMutate: () => patchLocal((p) => p.map((n) => (n.read_at ? n : { ...n, read_at: now() }))),
      onError: rollback,
      onSettled: settle,
    }),
    clear: useMutation({
      mutationKey: CLEAR,
      onMutate: (v: { id: string }) => patchLocal((p) => p.filter((n) => n.id !== v.id)),
      onError: rollback,
      onSettled: settle,
    }),
  };
}

/** "now", "12m", "3h", "yesterday", "4d" — matches the scratchpad stamp. */
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
