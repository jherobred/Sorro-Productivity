'use client';

import { useEffect, useState } from 'react';
import { supabase, currentUserId } from './supabase';

/**
 * Who else is actually here, right now.
 *
 * The header used to show three hard-coded initials on every screen. They were
 * decoration: the same three faces on Money, on Habits, on a page nobody else
 * could see. A presence indicator that is always on says nothing, and worse, it
 * implies people are watching things they are not.
 *
 * This joins a Realtime channel keyed to whatever you are looking at, so a face
 * appears only when that person is on the same thing at the same time. On a
 * screen nobody else is on, the cluster renders nothing at all — which is the
 * useful signal.
 *
 * `room` is null for surfaces where presence is meaningless (your own money,
 * your own habits). Passing null joins nothing and costs nothing.
 */

export type Peer = { user_id: string; name: string; at: number };

export function usePresence(room: string | null): Peer[] {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    if (!room) { setPeers([]); return; }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      let me: string;
      try {
        me = await currentUserId();
      } catch {
        return;   // signed out: nothing to announce, nothing to show
      }
      if (cancelled) return;

      const { data } = await supabase.from('bd_profiles').select('name').eq('user_id', me).maybeSingle();
      const name = data?.name ?? 'Someone';

      channel = supabase.channel(`presence:${room}`, { config: { presence: { key: me } } });

      const read = () => {
        const state = channel!.presenceState<{ name: string; at: number }>();
        const out: Peer[] = [];
        for (const [user_id, metas] of Object.entries(state)) {
          // Yourself is not company.
          if (user_id === me) continue;
          const m = metas[0];
          out.push({ user_id, name: m?.name ?? 'Someone', at: m?.at ?? 0 });
        }
        out.sort((a, b) => a.at - b.at);
        setPeers(out);
      };

      channel
        .on('presence', { event: 'sync' }, read)
        .on('presence', { event: 'join' }, read)
        .on('presence', { event: 'leave' }, read)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void channel!.track({ name, at: Date.now() });
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [room]);

  return peers;
}

/**
 * The room for a section, or null where being watched would be strange.
 *
 * Collaboration is the test: a project board, a thread, the feed and the people
 * directory are shared surfaces. Your budget, your weight and your habits are
 * not, and a face hovering over them would be alarming rather than useful.
 */
export function roomFor(section: string, id?: string | null): string | null {
  if (section === 'projects') return id ? `project:${id}` : 'projects';
  if (section === 'community') return 'community';
  if (section === 'people') return 'people';
  return null;
}
