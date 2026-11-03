'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { defineMutation, queryClient } from './offline';
import { undoChange, type Undo } from './assistantLogic';

export type ToolDone = { name: string; label: string; undo?: Undo; link?: string; undone?: boolean };
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
export class AssistantError extends Error { constructor(public code: string, message: string, public retry?: string | null) { super(message); } }

const MESSAGES: Record<string, string> = {
  no_key: 'The assistant is not switched on yet: it needs a Gemini key in Supabase.',
  rate_limited: 'The free Gemini quota is used up for now.',
  model_failed: 'Gemini did not answer. Your message is kept; try again.',
  signed_out: 'You are signed out. Sign in again to use the assistant.',
};

export async function sendToAssistant(chatId: string | null, message: string, context?: string): Promise<SendResult> {
  const { data, error } = await supabase.functions.invoke('assistant', { body: { chat_id: chatId ?? undefined, message, context } });
  if (error) {
    let body: { error?: string; retry?: string | null } = {};
    try { body = await (error as { context?: Response }).context?.json(); } catch { /* not JSON */ }
    const code = body.error ?? (navigator.onLine ? 'model_failed' : 'offline');
    throw new AssistantError(code, MESSAGES[code] ?? 'You are offline. The assistant answers once you are back online.', body.retry);
  }
  // Whatever the assistant wrote shows up in Tasks, Calendar and Notes without a reload.
  for (const k of ['tasks', 'events', 'notes', 'chats']) void queryClient.invalidateQueries({ queryKey: [k] });
  return data as SendResult;
}

const UNDO = defineMutation('assistant.undo', async (v: { undo: Undo; at: string }) => {
  const c = undoChange(v.undo, v.at);
  const { error } = await supabase.from(c.table).update(c.patch).eq('id', c.id);
  if (error) throw error;
});

export function useAssistantUndo() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { undo: Undo; at: string }>({
    mutationKey: UNDO,
    onSettled: () => { for (const k of ['tasks', 'events', 'notes']) void qc.invalidateQueries({ queryKey: [k] }); },
  });
}
