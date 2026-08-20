'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';

/**
 * One feed.
 *
 * Community had two halves that never spoke: a photo feed and a list of
 * question threads, on separate tabs, each with its own idea of what a post
 * was. Nobody has two things to say and stops to decide which tab they belong
 * on — Reddit and Instagram are the same product with different defaults, and
 * this merges them into one stream you scroll once.
 *
 * The two tables stay. A photo is still a `bd_posts` row and a discussion is
 * still a `bd_threads` row, because they carry different things (an image
 * path; a title) and because rewriting live rows to prove a point is how you
 * lose them. `Item` below is the shape the screen reads, and `useFeed` merges
 * and sorts. One list, two sources, no migration.
 *
 * Reactions follow the same split: `bd_post_likes` and `bd_thread_votes` are
 * the same gesture on different tables, so `react()` picks by kind and the UI
 * never has to know which.
 */

export type Kind = 'photo' | 'discussion';

export type Item = {
  id: string;
  kind: Kind;
  author_id: string;
  /** Discussions have one; photos do not. */
  title: string;
  /** The caption, or the discussion's detail. May be empty. */
  body: string;
  tag: string;
  image_path: string | null;
  created_at: string;
};

export type Comment = { id: string; author_id: string; body: string; created_at: string };

export const POSTS = ['posts'] as const;
export const THREADS = ['threads'] as const;
export const LIKES = ['post_likes'] as const;
export const VOTES = ['thread_votes'] as const;
export const COMMENT_COUNTS = ['comment_counts'] as const;
export const commentsKey = (kind: Kind, id: string) => ['comments', kind, id] as const;

export const TAGS = ['Update', 'Ask', 'Win', 'Help', 'Rant', 'Resource'] as const;

/* ------------------------------------------------------------------- reads */

type PostRow = { id: string; author_id: string; caption: string; tag: string; image_path: string | null; created_at: string };
type ThreadRow = { id: string; author_id: string; title: string; body: string; tag: string; created_at: string };

export function usePosts() {
  return useQuery({
    queryKey: POSTS,
    queryFn: async (): Promise<PostRow[]> => {
      const { data, error } = await supabase.from('bd_posts')
        .select('id,author_id,caption,tag,image_path,created_at').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useThreads() {
  return useQuery({
    queryKey: THREADS,
    queryFn: async (): Promise<ThreadRow[]> => {
      const { data, error } = await supabase.from('bd_threads')
        .select('id,author_id,title,body,tag,created_at').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLikes() {
  return useQuery({
    queryKey: LIKES,
    queryFn: async () => {
      const { data, error } = await supabase.from('bd_post_likes').select('post_id,user_id');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useVotes() {
  return useQuery({
    queryKey: VOTES,
    queryFn: async () => {
      const { data, error } = await supabase.from('bd_thread_votes').select('thread_id,user_id');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * How many comments each item has, in two queries rather than one per card.
 * The rows are ids only — a count is all the card shows, and pulling every
 * comment body to render a number would be a page of text nobody reads.
 */
export function useCommentCounts() {
  return useQuery({
    queryKey: COMMENT_COUNTS,
    queryFn: async (): Promise<Record<string, number>> => {
      const [a, b] = await Promise.all([
        supabase.from('bd_post_comments').select('post_id').is('deleted_at', null),
        supabase.from('bd_thread_replies').select('thread_id').is('deleted_at', null),
      ]);
      const out: Record<string, number> = {};
      for (const r of a.data ?? []) out[`photo:${r.post_id}`] = (out[`photo:${r.post_id}`] ?? 0) + 1;
      for (const r of b.data ?? []) out[`discussion:${r.thread_id}`] = (out[`discussion:${r.thread_id}`] ?? 0) + 1;
      return out;
    },
  });
}

export function useComments(kind: Kind, id: string, enabled: boolean) {
  return useQuery({
    queryKey: commentsKey(kind, id),
    enabled,
    queryFn: async (): Promise<Comment[]> => {
      const q = kind === 'photo'
        ? supabase.from('bd_post_comments').select('id,author_id,body,created_at').eq('post_id', id)
        : supabase.from('bd_thread_replies').select('id,author_id,body,created_at').eq('thread_id', id);
      const { data, error } = await q.is('deleted_at', null).order('created_at');
      if (error) throw error;
      return (data ?? []) as Comment[];
    },
  });
}

export type Sort = 'new' | 'top';
export type Filter = 'all' | 'photo' | 'discussion';

/** The stream: both tables, one order. */
export function useFeed(sort: Sort, filter: Filter, reactions: Record<string, number>) {
  const { data: posts = [] } = usePosts();
  const { data: threads = [] } = useThreads();

  return useMemo(() => {
    const items: Item[] = [
      ...posts.map((p): Item => ({
        id: p.id, kind: 'photo', author_id: p.author_id, title: '',
        body: p.caption, tag: p.tag, image_path: p.image_path, created_at: p.created_at,
      })),
      ...threads.map((t): Item => ({
        id: t.id, kind: 'discussion', author_id: t.author_id, title: t.title,
        body: t.body, tag: t.tag, image_path: null, created_at: t.created_at,
      })),
    ].filter((i) => filter === 'all' || i.kind === filter);

    // "Top" is by reactions, then recency — a tie on nought is still a feed,
    // not an arbitrary shuffle.
    return items.sort((a, b) => (sort === 'top'
      ? (reactions[key(b)] ?? 0) - (reactions[key(a)] ?? 0) || b.created_at.localeCompare(a.created_at)
      : b.created_at.localeCompare(a.created_at)));
  }, [posts, threads, sort, filter, reactions]);
}

export const key = (i: Item | { kind: Kind; id: string }) => `${i.kind}:${i.id}`;

/* --------------------------------------------------------------- mutations */

const ADD_POST = defineMutation('cm2.addPost', async (v: { id: string; caption: string; tag: string; image_path: string | null }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_posts').insert({ ...v, author_id });
  if (error) throw error;
});

const ADD_THREAD = defineMutation('cm2.addThread', async (v: { id: string; title: string; body: string; tag: string }) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_threads').insert({ ...v, author_id });
  if (error) throw error;
});

const EDIT = defineMutation('cm2.edit', async (v: { kind: Kind; id: string; title: string; body: string }) => {
  const { error } = v.kind === 'photo'
    ? await supabase.from('bd_posts').update({ caption: v.body }).eq('id', v.id)
    : await supabase.from('bd_threads').update({ title: v.title, body: v.body }).eq('id', v.id);
  if (error) throw error;
});

const DEL = defineMutation('cm2.del', async (v: { kind: Kind; id: string }) => {
  const table = v.kind === 'photo' ? 'bd_posts' : 'bd_threads';
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('cm2.restore', async (v: { kind: Kind; id: string }) => {
  const { error } = await supabase.rpc('bd_restore', {
    p_table: v.kind === 'photo' ? 'bd_posts' : 'bd_threads', p_id: v.id,
  });
  if (error) throw error;
});

const REACT = defineMutation('cm2.react', async (v: { kind: Kind; id: string; on: boolean }) => {
  const user_id = await currentUserId();
  const table = v.kind === 'photo' ? 'bd_post_likes' : 'bd_thread_votes';
  const col = v.kind === 'photo' ? 'post_id' : 'thread_id';
  const { error } = v.on
    ? await supabase.from(table).insert({ [col]: v.id, user_id })
    : await supabase.from(table).delete().eq(col, v.id).eq('user_id', user_id);
  if (error) throw error;
});

const COMMENT = defineMutation('cm2.comment', async (v: { kind: Kind; id: string; body: string }) => {
  const author_id = await currentUserId();
  const { error } = v.kind === 'photo'
    ? await supabase.from('bd_post_comments').insert({ post_id: v.id, author_id, body: v.body })
    : await supabase.from('bd_thread_replies').insert({ thread_id: v.id, author_id, body: v.body });
  if (error) throw error;
});

/* ----------------------------------------------------------------- actions */

export function useCommunityActions(me: string) {
  const qc = useQueryClient();
  const settle = settler(qc, POSTS, THREADS, LIKES, VOTES, COMMENT_COUNTS);

  const patch = <T,>(k: readonly unknown[], fn: (p: T[]) => T[]) => {
    const prev = queryClient.getQueryData<T[]>(k) ?? [];
    queryClient.setQueryData<T[]>(k, fn(prev));
    return prev;
  };

  const addPost = useMutation<unknown, Error, { id: string; caption: string; tag: string; image_path: string | null }>({
    mutationKey: ADD_POST,
    onMutate: (v) => patch<PostRow>(POSTS, (p) => [{ ...v, author_id: me, created_at: new Date().toISOString() }, ...p]),
    onSettled: settle,
  });

  const addThread = useMutation<unknown, Error, { id: string; title: string; body: string; tag: string }>({
    mutationKey: ADD_THREAD,
    onMutate: (v) => patch<ThreadRow>(THREADS, (p) => [{ ...v, author_id: me, created_at: new Date().toISOString() }, ...p]),
    onSettled: settle,
  });

  const edit = useMutation<unknown, Error, { kind: Kind; id: string; title: string; body: string }>({
    mutationKey: EDIT,
    onMutate: (v) => {
      if (v.kind === 'photo') patch<PostRow>(POSTS, (p) => p.map((r) => (r.id === v.id ? { ...r, caption: v.body } : r)));
      else patch<ThreadRow>(THREADS, (p) => p.map((r) => (r.id === v.id ? { ...r, title: v.title, body: v.body } : r)));
    },
    onSettled: settle,
  });

  const del = useMutation<unknown, Error, { kind: Kind; id: string }>({
    mutationKey: DEL,
    onMutate: (v) => {
      if (v.kind === 'photo') patch<PostRow>(POSTS, (p) => p.filter((r) => r.id !== v.id));
      else patch<ThreadRow>(THREADS, (p) => p.filter((r) => r.id !== v.id));
    },
    onSettled: settle,
  });

  const restore = useMutation<unknown, Error, { kind: Kind; id: string }>({ mutationKey: RESTORE, onSettled: settle });

  const react = useMutation<unknown, Error, { kind: Kind; id: string; on: boolean }>({
    mutationKey: REACT,
    onMutate: (v) => {
      if (v.kind === 'photo') {
        patch<{ post_id: string; user_id: string }>(LIKES, (p) => (v.on
          ? [...p, { post_id: v.id, user_id: me }]
          : p.filter((l) => !(l.post_id === v.id && l.user_id === me))));
      } else {
        patch<{ thread_id: string; user_id: string }>(VOTES, (p) => (v.on
          ? [...p, { thread_id: v.id, user_id: me }]
          : p.filter((l) => !(l.thread_id === v.id && l.user_id === me))));
      }
    },
    onSettled: settle,
  });

  const comment = useMutation<unknown, Error, { kind: Kind; id: string; body: string }>({
    mutationKey: COMMENT,
    onMutate: (v) => {
      queryClient.setQueryData<Comment[]>(commentsKey(v.kind, v.id), (p) => [
        ...(p ?? []),
        { id: `pending-${Date.now()}`, author_id: me, body: v.body, created_at: new Date().toISOString() },
      ]);
      const counts = queryClient.getQueryData<Record<string, number>>(COMMENT_COUNTS) ?? {};
      const k = `${v.kind}:${v.id}`;
      queryClient.setQueryData(COMMENT_COUNTS, { ...counts, [k]: (counts[k] ?? 0) + 1 });
    },
    onSettled: () => {
      settle();
      if (qc.isMutating() <= 1) void qc.invalidateQueries({ queryKey: ['comments'] });
    },
  });

  return {
    addPost, addThread, edit, react, comment,
    /** Soft delete, with the row kept so Undo is a single flag. */
    remove(item: Item) {
      del.mutate({ kind: item.kind, id: item.id });
      const name = (item.title || item.body || 'post').slice(0, 30);
      toast(`Deleted “${name}”`, () => restore.mutate({ kind: item.kind, id: item.id }));
    },
  };
}
