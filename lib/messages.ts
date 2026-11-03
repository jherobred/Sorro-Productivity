'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';
import { fixture } from './devFixtures';
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
  /** An attachment, denormalised onto the message. See 0008 for why. */
  attach_path: string | null;
  attach_name: string | null;
  attach_kind: string | null;
  attach_size: number | null;
  created_at: string;
  /** Stamped when the text was changed, so a bubble can say so. */
  edited_at?: string | null;
};

/** Why somebody reported a message. Matches the CHECK in migration 0012. */
export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or advertising' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'explicit', label: 'Explicit or graphic' },
  { id: 'scam', label: 'Scam or impersonation' },
  { id: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

/** What the composer is holding but has not sent yet. */
export type Attachment = { path: string; name: string; kind: string; size: number };

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
        .select('id,conversation_id,author_id,body,share_kind,share_id,attach_path,attach_name,attach_kind,attach_size,created_at,edited_at')
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
    attach_path: v.attach_path, attach_name: v.attach_name,
    attach_kind: v.attach_kind, attach_size: v.attach_size,
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

/**
 * Taking a message back is a soft delete, and that is the whole design.
 *
 * A row that is still there can be restored by Undo, and — more to the point —
 * it can still be read by whoever ends up reviewing a report. A hard delete
 * would make "say something vile, then unsend it" a complete escape. The
 * trigger in 0012 records every one of these either way.
 */
const UNSEND = defineMutation('msg.unsend', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_messages')
    .update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('msg.restore', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_messages')
    .update({ deleted_at: null }).eq('id', v.id);
  if (error) throw error;
});

const EDIT = defineMutation('msg.edit', async (v: { id: string; body: string }) => {
  const { error } = await supabase.from('bd_messages')
    .update({ body: v.body, edited_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const REPORT = defineMutation('msg.report', async (v: {
  message_id: string; conversation_id: string; reason: ReportReason; note: string;
}) => {
  const { error } = await supabase.from('bd_message_reports').insert(v);
  // 23505 is the one-report-per-person index doing its job. Pressing report
  // twice is not two reports, and saying "already reported" is the honest
  // answer rather than an error.
  if (error && error.code !== '23505') throw error;
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

  const restore = useMutation<unknown, Error, { id: string; conversation_id: string; row: Message }>({
    mutationKey: RESTORE,
    onMutate: (v) => {
      const k = messagesKey(v.conversation_id);
      const prev = queryClient.getQueryData<Message[]>(k) ?? [];
      // Back where it was, not at the end: a restored message that jumps to the
      // bottom of the thread rewrites the conversation.
      queryClient.setQueryData<Message[]>(k, [...prev, v.row]
        .sort((a, b) => a.created_at.localeCompare(b.created_at)));
    },
    onSettled: settle,
  });

  const edit = useMutation<unknown, Error, { id: string; conversation_id: string; body: string }>({
    mutationKey: EDIT,
    onMutate: (v) => {
      const k = messagesKey(v.conversation_id);
      const prev = queryClient.getQueryData<Message[]>(k) ?? [];
      queryClient.setQueryData<Message[]>(k, prev.map((m) =>
        (m.id === v.id ? { ...m, body: v.body, edited_at: new Date().toISOString() } : m)));
    },
    onSettled: settle,
  });

  const report = useMutation<unknown, Error, {
    message_id: string; conversation_id: string; reason: ReportReason; note: string;
  }>({ mutationKey: REPORT });

  /** Unsend with the way back attached. */
  const takeBack = (m: Message) => {
    unsend.mutate({ id: m.id, conversation_id: m.conversation_id });
    toast('Message removed', () => restore.mutate({ id: m.id, conversation_id: m.conversation_id, row: m }));
  };

  /**
   * Say something. `share` attaches a post by reference; `attach` carries a
   * file already sitting in the `bd-feed` bucket — `putAttachment` below is the
   * only thing that should ever put one there.
   */
  const say = (
    conversation_id: string, body: string,
    share?: { kind: Kind; id: string }, attach?: Attachment | null,
  ) => {
    if (!body.trim() && !share && !attach) return;
    send.mutate({
      id: crypto.randomUUID(), conversation_id, author_id: me,
      body: body.trim(), share_kind: share?.kind ?? null, share_id: share?.id ?? null,
      attach_path: attach?.path ?? null, attach_name: attach?.name ?? null,
      attach_kind: attach?.kind ?? null, attach_size: attach?.size ?? null,
      created_at: new Date().toISOString(),
    });
  };

  return { send, say, markRead, leave, unsend, restore, edit, report, takeBack };
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

/* ------------------------------------------------------------ attachments */

/** Anything bigger than this is a link to share, not a message to send. */
export const ATTACH_MAX = 25 * 1024 * 1024;

/** What sorro_files.kind calls things, from a MIME type or a file name. */
export function kindOfFile(name: string, mime = ''): string {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'md'].includes(ext)) return 'doc';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  if (['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  return 'file';
}

/**
 * Put a file where the people in the conversation can read it.
 *
 * `bd-feed` rather than `sorro-files`, because storage RLS on `sorro-files` is
 * owner-only for every command — an attachment left there opens for the sender
 * and 400s for everybody else, which is the worst kind of bug because the
 * person who can test it is the one person it works for. 0008 has the rest.
 */
export async function putAttachment(file: File): Promise<Attachment> {
  if (file.size > ATTACH_MAX) throw new Error('That file is over 25 MB');
  const user_id = await currentUserId();
  const path = `${user_id}/msg/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from('bd-feed')
    .upload(path, file, { cacheControl: '3600', contentType: file.type || undefined });
  if (error) throw error;
  return { path, name: file.name, kind: kindOfFile(file.name, file.type), size: file.size };
}

/**
 * Send something out of your Drive.
 *
 * Copied, not referenced. `sorro-files` is yours alone at the storage layer, and
 * the alternative — widening its read policy so a recipient can sign a URL —
 * would hand every signed-in account the keys to everyone's private documents
 * to save one round trip.
 */
export async function attachFromDrive(
  f: { name: string; kind: string; size_bytes: number; storage_path: string },
): Promise<Attachment> {
  if (f.size_bytes > ATTACH_MAX) throw new Error('That file is over 25 MB');
  const { data, error } = await supabase.storage.from('sorro-files').download(f.storage_path);
  if (error || !data) throw error ?? new Error('Could not read that file');
  const user_id = await currentUserId();
  const path = `${user_id}/msg/${crypto.randomUUID()}-${f.name}`;
  const { error: up } = await supabase.storage.from('bd-feed')
    .upload(path, data, { cacheControl: '3600', contentType: data.type || undefined });
  if (up) throw up;
  return { path, name: f.name, kind: f.kind || kindOfFile(f.name, data.type), size: f.size_bytes };
}

export type DriveFile = { id: string; name: string; kind: string; size_bytes: number; storage_path: string };

/** Your Drive, for the picker. One small list, read straight through. */
export async function driveFiles(): Promise<DriveFile[]> {
  const fx = fixture<DriveFile[]>('files');
  if (fx) return fx;
  const { data, error } = await supabase.from('sorro_files')
    .select('id,name,kind,size_bytes,storage_path')
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}

/** "2.4 MB" — the only place a byte count is ever shown. */
export function sizeLabel(bytes: number): string {
  if (!bytes) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i += 1; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
