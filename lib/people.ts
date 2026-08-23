'use client';

import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { fixture } from './devFixtures';
import { PAL } from './pal';
import { isBot, BOT_NAME } from './bot';
import { animalOf, type Animal } from './mascot';
import { toFit, type Fit } from './photoFit';

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

export type Person = {
  user_id: string; name: string; handle: string | null; photo_url: string | null;
  /** The creature they picked, or null to fall back to the one their id hashes
   *  to. Read here so a leaderboard shows everybody's *chosen* animal without
   *  a second query per row. */
  animal: Animal | null;
  /** {x, y, zoom} — how their picture is framed. See components/PhotoFrame. */
  photo_fit: unknown;
};

export const PROFILES = ['profiles'] as const;

export function useProfiles() {
  return useQuery({
    queryKey: PROFILES,
    staleTime: 300_000,
    queryFn: async (): Promise<Record<string, Person>> => {
      const { data, error } = await supabase.from('bd_profiles').select('user_id,name,handle,photo_url,animal,photo_fit').limit(500);
      if (error) throw error;
      const out: Record<string, Person> = {};
      for (const p of (data ?? []) as Person[]) out[p.user_id] = p;
      return out;
    },
  });
}

/**
 * The link that gets somebody to your profile.
 *
 * A query parameter rather than a path segment, because this is a static export
 * (`output: 'export'`): `/u/[handle]` would need every handle known at build
 * time, and handles are made by people after the build. `/profile/?u=jhems`
 * needs no route at all and works identically in the APK's file:// webview.
 *
 * Null without a handle. There is nothing to link to, and a link to a UUID
 * would tell the person receiving it nothing about who sent it.
 */
/**
 * People you already share something with.
 *
 * The messaging picker used to list **every profile in the database**, because
 * `bd_profiles` is world-readable and the list was therefore free. That is the
 * wrong default: it makes a stranger and a groupmate the same single tap, so
 * everyone is effectively already your friend and an inbox is one bored person
 * away from being unusable.
 *
 * A connection here is something you both did: a conversation you are both in,
 * a project you are both on, a challenge you both joined. No friend requests,
 * no accept/decline, no table - the app already knows who you have actually
 * met. Anyone else has to be found by their exact handle, which means somebody
 * gave it to you.
 *
 * Challenges are filtered to the ones *you* are in, in a second query, rather
 * than read whole: a public challenge with two hundred people in it would put
 * two hundred strangers back in the list and undo the entire point.
 */
export const KNOWN_KEY = ['known_people'] as const;

export function useKnownPeople() {
  return useQuery({
    queryKey: KNOWN_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const fx = fixture<string[]>('known_people');
      if (fx) return fx;

      const { currentUserId } = await import('./supabase');
      const me = await currentUserId().catch(() => '');
      if (!me) return [];

      const mine = await supabase.from('bd_challenge_members').select('challenge_id').eq('user_id', me);
      const chalIds = (mine.data ?? []).map((r) => r.challenge_id as string);

      const [convo, proj, chal] = await Promise.all([
        // RLS already scopes this to conversations you belong to.
        supabase.from('bd_conversation_members').select('user_id'),
        supabase.from('bd_project_members').select('user_id'),
        chalIds.length
          ? supabase.from('bd_challenge_members').select('user_id').in('challenge_id', chalIds)
          : Promise.resolve({ data: [] as { user_id: string }[] }),
      ]);

      const out = new Set<string>();
      for (const r of [...(convo.data ?? []), ...(proj.data ?? []), ...(chal.data ?? [])]) {
        const id = (r as { user_id: string }).user_id;
        if (id && id !== me) out.add(id);
      }
      return [...out];
    },
  });
}

/**
 * Who you are, for the chrome: the name, the handle and the picture.
 *
 * A `useQuery` rather than the bare effect this used to be inside the Shell, so
 * the header, the More page and the account sheet share one round trip instead
 * of each running their own — and so a rename in Profile reaches all three the
 * moment the write settles.
 */
export type Identity = { id: string; name: string; handle: string | null; photo: string | null };

export const ME_KEY = ['me_identity'] as const;

export function useMyIdentity(): Identity {
  const { data } = useQuery({
    queryKey: ME_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<Identity> => {
      const { currentUserId } = await import('./supabase');
      const id = await currentUserId().catch(() => '');
      if (!id) return BLANK_ME;
      const { data: p } = await supabase.from('bd_profiles')
        .select('name,handle,photo_url').eq('user_id', id).maybeSingle();
      return { id, name: p?.name ?? '', handle: p?.handle ?? null, photo: p?.photo_url ?? null };
    },
  });
  return data ?? BLANK_ME;
}

const BLANK_ME: Identity = { id: '', name: '', handle: null, photo: null };

export function profileLink(handle: string | null | undefined): string | null {
  const h = (handle ?? '').trim().replace(/^@/, '');
  if (!h) return null;
  const origin = typeof window === 'undefined' ? 'https://basedly-web.vercel.app' : window.location.origin;
  return `${origin}/profile/?u=${encodeURIComponent(h)}`;
}

/** A stable colour per person, for the avatar behind their initials. */
export function hueOf(id: string): string {
  const v = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return Object.values(PAL)[v % 10];
}

export type Display = {
  label: string; sub: string; initials: string; photo: string | null; hue: string; bot: boolean;
  /** Always resolved: their pick if they made one, the id-derived one if not. */
  animal: Animal;
  /**
   * How to frame their picture. Every avatar in the app applies this, or the
   * face somebody carefully centred on their own profile is off-centre
   * everywhere else — which makes the framing control decorative.
   */
  fit: Fit;
};

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

  return {
    label, sub, initials, photo: p?.photo_url ?? null, hue: hueOf(id), bot,
    animal: p?.animal ?? animalOf(id), fit: toFit(p?.photo_fit),
  };
}
