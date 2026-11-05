'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from './supabase';
import { defineMutation, queryClient } from './offline';
import { undoChange, foldStream, type Undo, type ToolDone, type StreamState } from './assistantLogic';
import { splitSse } from '@/supabase/functions/assistant/sse';
import { toast } from './toast';

export type { ToolDone };
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; tools: ToolDone[]; created_at: string; pending?: boolean; error?: string };
export type Chat = { id: string; title: string; updated_at: string };

export function useChats() {
  return useQuery({
    queryKey: ['chats'],
    queryFn: async (): Promise<Chat[]> => {
      const { data, error } = await supabase.from('sorro_chats').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useChatMessages(chatId: string | null) {
  return useQuery({
    queryKey: ['chat', chatId],
    enabled: !!chatId,
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase.from('sorro_chat_messages').select('id,role,content,tools,created_at').eq('chat_id', chatId!).order('created_at');
      if (error) throw error;
      return (data ?? []) as ChatMessage[];
    },
  });
}

export type SendResult = { chat_id: string; text: string; tools: ToolDone[] };
export class AssistantError extends Error { constructor(public code: string, message: string, public retry?: string | null, public tools: ToolDone[] = [], public chatId?: string) { super(message); } }

const MESSAGES: Record<string, string> = {
  no_key: 'The assistant is not switched on yet: it needs a Gemini key in Supabase.',
  rate_limited: 'The free Gemini quota is used up for now.',
  model_failed: 'Gemini did not answer. Your message is kept; try again.',
  signed_out: 'You are signed out. Sign in again to use the assistant.',
  dropped: 'The connection dropped before Sorro finished. Anything he already did is saved in this chat, so check it before trying again.',
};

const failure = (code: string, b: { retry?: string | null; tools?: ToolDone[]; chat_id?: string } = {}) =>
  new AssistantError(code, MESSAGES[code] ?? 'You are offline. The assistant answers once you are back online.', b.retry, b.tools ?? [], b.chat_id);

/** Streams the reply: `onText` gets the whole text so far after each piece arrives. */
export async function sendToAssistant(chatId: string | null, message: string, context?: string, onText?: (full: string) => void): Promise<SendResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw failure('signed_out');
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/assistant`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ chat_id: chatId ?? undefined, message, context }),
      });
    } catch { throw failure(navigator.onLine ? 'model_failed' : 'offline'); }
    if (!res.ok || !res.body) {
      let b: { error?: string; retry?: string | null; tools?: ToolDone[]; chat_id?: string } = {};
      try { b = await res.json(); } catch { /* not JSON */ }
      throw failure(b.error ?? 'model_failed', b);
    }
    let s: StreamState = { text: '' };
    let buf = '';
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const { events, rest } = splitSse(buf + value);
        buf = rest;
        for (const ev of events) { const before = s.text; s = foldStream(s, ev); if (s.text !== before) onText?.(s.text); }
      }
    } catch { /* connection dropped: handled below as a stream with no ending */ }
    if (s.error) throw failure(s.error.error, s.error);
    // No ending: the server may still have saved what it did, so the chat refetch below shows it.
    if (!s.done) throw failure('dropped', { chat_id: s.chat_id });
    return { chat_id: s.done.chat_id, text: s.text.trim(), tools: s.done.tools };
  } finally {
    // Whatever the assistant wrote shows up in Tasks, Calendar and Notes without a reload, even after a failure.
    for (const k of ['tasks', 'events', 'notes', 'chats', 'chat']) void queryClient.invalidateQueries({ queryKey: [k] });
  }
}

let currentChat: string | null = null;
const chatListeners = new Set<() => void>();
const setCurrentChat = (id: string | null) => { if (id !== currentChat) { currentChat = id; chatListeners.forEach(f => f()); } };

/** The open chat, shared by Home and the fox sheet so one conversation follows you across tabs. */
export function useCurrentChat(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(f => { chatListeners.add(f); return () => { chatListeners.delete(f); }; }, () => currentChat, () => null);
  return [id, setCurrentChat];
}

/** Thrown when the row changed after the assistant touched it: the undo is skipped rather than overwrite that. */
export class UndoStale extends Error {}

const UNDO = defineMutation('assistant.undo', async (v: { undo: Undo; at: string; messageId?: string; tools?: ToolDone[] }) => {
  const c = undoChange(v.undo, v.at);
  let q = supabase.from(c.table).update(c.patch).eq('id', c.id);
  for (const [k, val] of Object.entries(c.only)) q = val === null ? q.is(k, null) : q.eq(k, val as string | boolean);
  const { data, error } = await q.select('id');
  if (error) throw error;
  if (!data?.length) throw new UndoStale('It changed after the assistant made it, so it was left as it is.');
  // Saved on the message, so Undo does not come back after a reload.
  if (v.messageId && v.tools) await supabase.from('sorro_chat_messages').update({ tools: v.tools }).eq('id', v.messageId);
});

export function useAssistantUndo() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { undo: Undo; at: string; messageId?: string; tools?: ToolDone[] }>({
    mutationKey: UNDO,
    onError: (e) => { if (e instanceof UndoStale) toast(e.message); },
    onSettled: () => { for (const k of ['tasks', 'events', 'notes', 'chat']) void qc.invalidateQueries({ queryKey: [k] }); },
  });
}
