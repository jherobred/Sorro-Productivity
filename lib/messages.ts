'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';
import type { Kind } from './community';

/**
 * Messages.
 *
 * A conversation is a row, the people in it are rows, and what was said is
 * rows. Nothing clever: the interesting parts are in the schema
 * (0005_messaging.sql) where RLS decides who may see what, and in the one rule
 * this file keeps — **a shared post is a reference, never a copy.** A message
 * carries `share_kind` and `share_id`; the card is rendered from the live post
 * at read time. Copy the caption into the message instead and you have
 * published a snapshot of something the author may since have taken down.
 *
 * Sending is optimistic, because a chat that waits for a round trip before it
 * shows your own sentence feels broken even when it is working.
 */

export type Conversation = {
  id: string;
  created_by: string;
  title: string;
  is_group: boolean;
  updated_at: string;
};

export type Member = { conversation_id: string; user_id: string; last_read_at: string };

export type Message = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  share_kind: Kind | null;
  share_id: string | null;
  created_at: string;
};

export const CONVOS = ['conversations'] as const;
export const MEMBERS = ['conversation_members'] as const;
export const messagesKey = (id: string | null) => ['messages', id] as const;

/* ------------------------------------------------------------------- reads */

export function useConversations() {
  return useQuery({
    queryKey: CONVOS,
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase.from('bd_conversations')
        .select('id,created_by,title,is_group,updated_at').order('updated_at', { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as Conversation[];
    },
  });
}

/** Everyone in every conversation you are in — one query, not one per chat. */
export function useMembers() {
  return useQuery({
    queryKey: MEMBERS,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase.from('bd_conversation_members')
        .select('conversation_id,user_id,last_read_at');
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: messagesKey(conversationId),
    enabled: !!conversationId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase.from('bd_messages')
        .select('id,conversation_id,author_id,body,share_kind,share_id,created_at')
        .eq('conversation_id', conversationId!).is('deleted_at', null)
        .order('created_at').limit(300);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}

/* --------------------------------------------------------------- mutations */

const SEND = defineMutation('msg.send', async (v: Message) => {
  const author_id = await currentUserId();
  const { error } = await supabase.from('bd_messages').insert({
    id: v.id, conversation_id: v.conversation_id, author_id,
    body: v.body, share_kind: v.share_kind, share_id: v.share_id,
  });
  if (error) throw error;
});

const READ = defineMutation('msg.read', async (v: { conversation_id: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', v.conversation_id).eq('user_id', user_id);
  if (error) throw error;
});

const LEAVE = defineMutation('msg.leave', async (v: { conversation_id: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_conversation_members')
    .delete().eq('conversation_id', v.conversation_id).eq('user_id', user_id);
  if (error) throw error;
});

const UNSEND = defineMutation('msg.unsend', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_messages')
    .update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

/* ----------------------------------------------------------------- actions */

export function useMessageActions(me: string) {
  const qc = useQueryClient();
  const settle = settler(qc, CONVOS, MEMBERS);

  const send = useMutation<unknown, Error, Message, Message[]>({
    mutationKey: SEND,
    onMutate: (v) => {
      const k = messagesKey(v.conversation_id);
      const prev = queryClient.getQueryData<Message[]>(k) ?? [];
      queryClient.setQueryData<Message[]>(k, [...prev, { ...v, author_id: me }]);
      return prev;
    },
    onError: (e, v, ctx) => {
      if (ctx) queryClient.setQueryData(messagesKey(v.conversation_id), ctx);
      toast(`Not sent — ${e.message}`);
    },
    onSettled: (_d, _e, v) => {
      settle();
      if (qc.isMutating() <= 1) void qc.invalidateQueries({ queryKey: messagesKey(v.conversation_id) });
    },
  });

  const markRead = useMutation<unknown, Error, { conversation_id: string }>({
    mutationKey: READ,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Member[]>(MEMBERS) ?? [];
      queryClient.setQueryData<Member[]>(MEMBERS, prev.map((m) =>
        (m.conversation_id === v.conversation_id && m.user_id === me
          ? { ...m, last_read_at: new Date().toISOString() } : m)));
    },
    onSettled: settle,
  });

  const leave = useMutation<unknown, Error, { conversation_id: string }>({
    mutationKey: LEAVE,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Conversation[]>(CONVOS) ?? [];
      queryClient.setQueryData<Conversation[]>(CONVOS, prev.filter((c) => c.id !== v.conversation_id));
    },
    onSettled: settle,
  });

  const unsend = useMutation<unknown, Error, { id: string; conversation_id: string }>({
    mutationKey: UNSEND,
    onMutate: (v) => {
      const k = messagesKey(v.conversation_id);
      const prev = queryClient.getQueryData<Message[]>(k) ?? [];
      queryClient.setQueryData<Message[]>(k, prev.filter((m) => m.id !== v.id));
    },
    onSettled: settle,
  });

  /** Say something. `share` attaches a post by reference. */
  const say = (conversation_id: string, body: string, share?: { kind: Kind; id: string }) => {
    if (!body.trim() && !share) return;
    send.mutate({
      id: crypto.randomUUID(), conversation_id, author_id: me,
      body: body.trim(), share_kind: share?.kind ?? null, share_id: share?.id ?? null,
      created_at: new Date().toISOString(),
    });
  };

  return { send, say, markRead, leave, unsend };
}

/**
 * Find-or-create, in the database rather than here. Three round trips from the
 * client is three chances to end up with two "1:1" conversations, each holding
 * half the history. See bd_start_dm in 0005_messaging.sql.
 */
export async function startDm(otherId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('bd_start_dm', { p_other: otherId });
  if (error) { toast(error.message); return null; }
  void queryClient.invalidateQueries({ queryKey: CONVOS });
  void queryClient.invalidateQueries({ queryKey: MEMBERS });
  return data as string;
}

export async function startGroup(title: string, members: string[]): Promise<string | null> {
  const { data, error } = await supabase.rpc('bd_start_group', { p_title: title, p_members: members });
  if (error) { toast(error.message); return null; }
  void queryClient.invalidateQueries({ queryKey: CONVOS });
  void queryClient.invalidateQueries({ queryKey: MEMBERS });
  return data as string;
}

/** Unread when somebody else has spoken since you last looked. */
export function unreadOf(convo: Conversation, mine: Member | undefined): boolean {
  if (!mine) return false;
  return convo.updated_at > mine.last_read_at;
}

/** What to call a chat: its title, or whoever else is in it. */
export function titleOf(
  convo: Conversation,
  members: Member[],
  me: string,
  nameOf: (id: string) => string,
): string {
  if (convo.title.trim()) return convo.title.trim();
  const others = members.filter((m) => m.conversation_id === convo.id && m.user_id !== me);
  if (others.length === 0) return 'Just you';
  return others.map((m) => nameOf(m.user_id)).join(', ');
}
