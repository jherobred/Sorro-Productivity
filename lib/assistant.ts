'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { defineMutation, queryClient } from './offline';
import { undoChange, type Undo, type ToolDone } from './assistantLogic';
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
};

export async function sendToAssistant(chatId: string | null, message: string, context?: string): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('assistant', { body: { chat_id: chatId ?? undefined, message, context } });
  if (error) {
    let body: { error?: string; retry?: string | null; tools?: ToolDone[]; chat_id?: string } = {};
    try { body = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
    const code = body.error ?? (navigator.onLine ? 'model_failed' : 'offline');
    if (body.tools?.length) for (const k of ['tasks', 'events', 'notes', 'chats']) void queryClient.invalidateQueries({ queryKey: [k] });
    throw new AssistantError(code, MESSAGES[code] ?? 'You are offline. The assistant answers once you are back online.', body.retry, body.tools ?? [], body.chat_id);
  }
  // Whatever the assistant wrote shows up in Tasks, Calendar and Notes without a reload.
  for (const k of ['tasks', 'events', 'notes', 'chats']) void queryClient.invalidateQueries({ queryKey: [k] });
  return data as SendResult;
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
