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

const EDIT_SEC = defineMutation('nb.editSection', async (v: { id: string; patch: { name?: string; notebook_id?: string } }) => {
  const { error } = await supabase.from('bd_sections').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

/**
 * Sections and notebooks are hard-deleted — they have no deleted_at, and
 * adding one would mean teaching every read path to filter. What they hold is
 * not lost with them: notes move up to the notebook's first remaining section,
 * or to another notebook, before the container goes. Removing a shelf should
 * not burn the books on it.
 */
const DEL_SEC = defineMutation('nb.delSection', async (v: { id: string; moveTo: string | null }) => {
  if (v.moveTo) {
    const { error } = await supabase.from('bd_notes').update({ section_id: v.moveTo }).eq('section_id', v.id);
    if (error) throw error;
  }
  const { error } = await supabase.from('bd_sections').delete().eq('id', v.id);
  if (error) throw error;
});

const EDIT_NB = defineMutation('nb.editNotebook', async (v: { id: string; patch: { name?: string; color?: string } }) => {
  const { error } = await supabase.from('bd_notebooks').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const MOVE_NOTE = defineMutation('nb.moveNote', async (v: { id: string; section_id: string }) => {
  const { error } = await supabase.from('bd_notes').update({ section_id: v.section_id }).eq('id', v.id);
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

  /**
   * Creates are optimistic, and that is a correctness fix rather than a
   * nicety.
   *
   * None of these put the new row in the cache: they wrote to the server and
   * waited for the refetch. So a note you had just made did not exist locally,
   * the editor opened on it anyway, and the first block you typed referenced a
   * note the cache had never heard of. The block write failed its foreign key,
   * the rollback undid the optimistic block, and the text vanished as you
   * typed it.
   */
  const patchList = <T,>(key: readonly unknown[], row: T) => {
    const prev = queryClient.getQueryData<T[]>(key) ?? [];
    queryClient.setQueryData<T[]>(key, [...prev, row]);
    return prev;
  };
  const rollbackList = <T,>(key: readonly unknown[]) =>
    (_e: unknown, _v: unknown, ctx: T[] | undefined) => {
      if (ctx) queryClient.setQueryData(key, ctx);
    };

  const newNotebook = useMutation<unknown, Error, { id: string; name: string; color: string }, Notebook[]>({
    mutationKey: NEW_NB,
    onMutate: (v) => patchList<Notebook>(NB_KEY, { ...v, position: Number.MAX_SAFE_INTEGER }),
    onError: rollbackList<Notebook>(NB_KEY),
    onSettled: settle,
  });
  const newSection = useMutation<unknown, Error, { id: string; notebook_id: string; name: string }, Sec[]>({
    mutationKey: NEW_SEC,
    onMutate: (v) => patchList<Sec>(SEC_KEY, { ...v, position: Number.MAX_SAFE_INTEGER }),
    onError: rollbackList<Sec>(SEC_KEY),
    onSettled: settle,
  });
  const newNote = useMutation<unknown, Error, { id: string; section_id: string; title: string }, Note[]>({
    mutationKey: NEW_NOTE,
    onMutate: (v) => patchList<Note>(NOTE_KEY, {
      ...v, body: '', position: Number.MAX_SAFE_INTEGER,
      updated_at: new Date().toISOString(), deleted_at: null,
    }),
    onError: rollbackList<Note>(NOTE_KEY),
    onSettled: settle,
  });
  const restoreNote = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_NOTE, onSettled: settle });

  const saveNote = useMutation({
    mutationKey: SAVE_NOTE,
    onMutate: (v: { id: string; patch: Partial<Note> }) => {
      const prev = queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [];
      queryClient.setQueryData<Note[]>(NOTE_KEY, prev.map((n) => (n.id === v.id ? { ...n, ...v.patch } : n)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(NOTE_KEY, ctx); },
    // Deliberately no settle: refetching the list mid-edit replaces the title
    // you are typing with the one the server last heard about.
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

  const editSection = useMutation<unknown, Error, { id: string; patch: { name?: string; notebook_id?: string } }>({
    mutationKey: EDIT_SEC,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Sec[]>(SEC_KEY) ?? [];
      queryClient.setQueryData<Sec[]>(SEC_KEY, prev.map((x) => (x.id === v.id ? { ...x, ...v.patch } : x)));
    },
    onSettled: settle,
  });
  const delSection = useMutation<unknown, Error, { id: string; moveTo: string | null }>({
    mutationKey: DEL_SEC,
    onMutate: (v) => {
      const secs = queryClient.getQueryData<Sec[]>(SEC_KEY) ?? [];
      queryClient.setQueryData<Sec[]>(SEC_KEY, secs.filter((x) => x.id !== v.id));
      const ns = queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [];
      queryClient.setQueryData<Note[]>(NOTE_KEY, v.moveTo
        ? ns.map((n) => (n.section_id === v.id ? { ...n, section_id: v.moveTo! } : n))
        : ns.filter((n) => n.section_id !== v.id));
    },
    onSettled: settle,
  });
  const editNotebook = useMutation<unknown, Error, { id: string; patch: { name?: string; color?: string } }>({
    mutationKey: EDIT_NB,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Notebook[]>(NB_KEY) ?? [];
      queryClient.setQueryData<Notebook[]>(NB_KEY, prev.map((x) => (x.id === v.id ? { ...x, ...v.patch } : x)));
    },
    onSettled: settle,
  });
  const moveNote = useMutation<unknown, Error, { id: string; section_id: string }>({
    mutationKey: MOVE_NOTE,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [];
      queryClient.setQueryData<Note[]>(NOTE_KEY, prev.map((n) => (n.id === v.id ? { ...n, section_id: v.section_id } : n)));
    },
    onSettled: settle,
  });

  return {
    newNotebook, newSection, newNote, saveNote, delNote, restoreNote, removeWithUndo,
    editSection, delSection, editNotebook, moveNote,
  };
}
