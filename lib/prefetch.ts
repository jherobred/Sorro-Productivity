'use client';

import { queryClient } from './offline';
import { supabase } from './supabase';

/**
 * Start a section's query while the finger is still on the nav item.
 *
 * Every screen fetched on mount, so opening a tab was: navigate, paint an
 * empty page, *then* ask the server. The gap between a press and a usable
 * screen was a full round trip with nothing overlapping it — and on a campus
 * connection that is most of a second, every time, for a tab you open twenty
 * times a day.
 *
 * The press is not the first thing that happens. `pointerdown` fires before
 * the tap completes, and the eye takes a moment to follow a page transition,
 * so starting the fetch there buys 100–300ms for free without a single extra
 * request: this warms the *same query key* the page's `useQuery` will ask for,
 * so the page finds the answer already in the cache and never issues its own.
 *
 * Only the query each section opens *with*. Prefetching a whole section's data
 * on hover is how you turn a nav bar into a denial of service on your own
 * database.
 *
 * ponytail: the selects here are duplicated from the hooks that own them, and
 * a column added there must be added here or the page refetches. Kept as a
 * copy rather than an export because the alternative is restructuring nine
 * hooks to hand out their fetchers. Wrong-shaped data is not a risk — a
 * mismatch costs one refetch, which is what happens today anyway.
 */

type Warm = { key: readonly unknown[]; run: () => Promise<unknown> };

const WARM: Record<string, Warm> = {
  tasks: {
    key: ['tasks'],
    run: async () => {
      const { data, error } = await supabase.from('bd_tasks')
        .select('id,list_id,title,notes,done,due_on,due_at,priority,stars,position,deleted_at,completed_at')
        .is('deleted_at', null).order('position').limit(500);
      if(error) throw error;
      return data ?? [];
    },
  },
  habits: {
    key: ['habits'],
    run: async () => {
      const { data, error } = await supabase.from('bd_habits')
        .select('id,name,color,kind,target,position,archived_at,challenge_id')
        .is('archived_at', null).order('position');
      if(error) throw error;
      return data ?? [];
    },
  },
  projects: {
    key: ['projects'],
    run: async () => {
      const { data, error } = await supabase.from('bd_projects')
        .select('id,name,tag,color,progress,deadline,position,icon,cover,user_id')
        .is('deleted_at', null).order('position');
      if(error) throw error;
      return data ?? [];
    },
  },
  files: {
    key: ['files'],
    run: async () => {
      const { data, error } = await supabase.from('bd_files')
        .select('id,name,kind,size_bytes,storage_path,folder_id,starred,created_at')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(500);
      if(error) throw error;
      return data ?? [];
    },
  },
  community: {
    key: ['posts'],
    run: async () => {
      const { data, error } = await supabase.from('bd_posts')
        .select('id,author_id,title,caption,tag,image_path,created_at')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(40);
      if(error) throw error;
      return data ?? [];
    },
  },
  notebooks: {
    key: ['notebooks'],
    run: async () => {
      const { data, error } = await supabase.from('bd_notebooks')
        .select('id,name,color,position,created_at').order('position').order('created_at');
      if(error) throw error;
      return data ?? [];
    },
  },
};

/**
 * Warm a section. Safe to call on every pointerdown — `prefetchQuery` is a
 * no-op while the data is still fresh, so a jittery finger on one nav item
 * makes one request, not ten.
 */
export function prefetchSection(section: string): void {
  const w = WARM[section];
  if (!w) return;
  void queryClient.prefetchQuery({ queryKey: w.key, queryFn: w.run, staleTime: 30_000 });
}
