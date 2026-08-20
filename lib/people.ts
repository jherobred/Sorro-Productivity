'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { PAL } from './pal';
import { isBot, BOT_NAME } from './bot';

/**
 * Who wrote this.
 *
 * Every social surface used to label its authors with `id.slice(0, 2)` — the
 * first two characters of a UUID. So a post was by "A4", a reply was by "0F",
 * and the avatar said the same thing. People have handles; `bd_profiles` is
 * readable by everyone (its RLS is `select true`, deliberately, because a
 * feed without names is not a feed).
 *
 * One query for the lot rather than one per row: a page of thirty posts is a
 * handful of distinct authors, and thirty round trips to render a list is the
 * kind of thing that only shows up on someone else's connection.
 */

export type Person = { user_id: string; name: string; handle: string | null; photo_url: string | null };

export const PROFILES = ['profiles'] as const;

export function useProfiles() {
  return useQuery({
    queryKey: PROFILES,
    staleTime: 300_000,
    queryFn: async (): Promise<Record<string, Person>> => {
      const { data, error } = await supabase.from('bd_profiles').select('user_id,name,handle,photo_url').limit(500);
      if (error) throw error;
      const out: Record<string, Person> = {};
      for (const p of (data ?? []) as Person[]) out[p.user_id] = p;
      return out;
    },
  });
}

/** A stable colour per person, for the avatar behind their initials. */
export function hueOf(id: string): string {
  const v = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return Object.values(PAL)[v % 10];
}

export type Display = { label: string; sub: string; initials: string; photo: string | null; hue: string; bot: boolean };

/**
 * What to put next to a post: the handle if they have one, their name if not,
 * and only then something generic. Never the id — an id is not a name, and
 * showing one tells the reader nothing except that the app does not know.
 */
export function displayOf(profiles: Record<string, Person>, id: string, me: string): Display {
  const p = profiles[id];
  const bot = isBot(id);
  const handle = p?.handle?.trim() ? `@${p.handle.trim()}` : '';
  const name = p?.name?.trim() ?? '';

  const label = bot ? BOT_NAME : id === me ? 'You' : handle || name || 'Someone';
  // The name sits under the handle when both exist, the way Twitter and
  // Instagram order them; "You" still shows whose account it is.
  const sub = bot ? '' : handle && name && label !== name ? name : id === me ? handle || name : '';

  const seed = name || handle || id;
  const initials = bot ? 'BB' : (seed.replace(/^@/, '').trim().slice(0, 2) || '??').toUpperCase();

  return { label, sub, initials, photo: p?.photo_url ?? null, hue: hueOf(id), bot };
}
