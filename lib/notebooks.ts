'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';

export type Notebook = { id: string; name: string; color: string; position: number };
export type Sec = { id: string; notebook_id: string; name: string; position: number };
export type Note = {
  id: string; section_id: string; title: string; body: string;
  position: number; updated_at: string; deleted_at: string | null;
};

const NB_KEY = ['notebooks'] as const;
const SEC_KEY = ['sections'] as const;
const NOTE_KEY = ['notes'] as const;

export function useNotebooks() {
  return useQuery({
    queryKey: NB_KEY,
    queryFn: async (): Promise<Notebook[]> => {
      const { data, error } = await supabase.from('bd_notebooks').select('id,name,color,position').order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSections() {
  return useQuery({
    queryKey: SEC_KEY,
    queryFn: async (): Promise<Sec[]> => {
      const { data, error } = await supabase.from('bd_sections').select('id,notebook_id,name,position').order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNotes() {
  return useQuery({
    queryKey: NOTE_KEY,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from('bd_notes')
        .select('id,section_id,title,body,position,updated_at,deleted_at')
        .is('deleted_at', null)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ---- Mutations ---------------------------------------------------------- */

const NEW_NB = defineMutation('nb.create', async (v: { id: string; name: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_notebooks').insert({ ...v, user_id });
  if (error) throw error;
});

const NEW_SEC = defineMutation('nb.newSection', async (v: { id: string; notebook_id: string; name: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_sections').insert({ ...v, user_id });
  if (error) throw error;
});

const NEW_NOTE = defineMutation('nb.newNote', async (v: { id: string; section_id: string; title: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_notes').insert({ ...v, user_id });
  if (error) throw error;
});

const SAVE_NOTE = defineMutation('nb.saveNote', async (v: { id: string; patch: Partial<Note> }) => {
  const { error } = await supabase.from('bd_notes').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DEL_NOTE = defineMutation('nb.delNote', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_notes').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE_NOTE = defineMutation('nb.restoreNote', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_notes', p_id: v.id });
  if (error) throw error;
});

export function useNotebookActions() {
  const qc = useQueryClient();
  const settle = () => {
    void qc.invalidateQueries({ queryKey: NB_KEY });
    void qc.invalidateQueries({ queryKey: SEC_KEY });
    void qc.invalidateQueries({ queryKey: NOTE_KEY });
  };

  const newNotebook = useMutation<unknown, Error, { id: string; name: string; color: string }>({ mutationKey: NEW_NB, onSettled: settle });
  const newSection = useMutation<unknown, Error, { id: string; notebook_id: string; name: string }>({ mutationKey: NEW_SEC, onSettled: settle });
  const newNote = useMutation<unknown, Error, { id: string; section_id: string; title: string }>({ mutationKey: NEW_NOTE, onSettled: settle });
  const restoreNote = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_NOTE, onSettled: settle });

  const saveNote = useMutation({
    mutationKey: SAVE_NOTE,
    onMutate: (v: { id: string; patch: Partial<Note> }) => {
      const prev = queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [];
      queryClient.setQueryData<Note[]>(NOTE_KEY, prev.map((n) => (n.id === v.id ? { ...n, ...v.patch } : n)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(NOTE_KEY, ctx); },
    onSettled: settle,
  });

  const delNote = useMutation({
    mutationKey: DEL_NOTE,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [];
      queryClient.setQueryData<Note[]>(NOTE_KEY, prev.filter((n) => n.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(NOTE_KEY, ctx); },
    onSettled: settle,
  });

  const removeWithUndo = (n: Note) => {
    delNote.mutate({ id: n.id });
    toast(`Deleted “${n.title}”`, () => restoreNote.mutate({ id: n.id }));
  };

  return { newNotebook, newSection, newNote, saveNote, delNote, restoreNote, removeWithUndo };
}
