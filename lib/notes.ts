'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';
import { settler } from './settle';
import { wikiTargets } from './md';
import { keepPageDraft, acknowledgePage, discardPageDraft, pageRecovery, setPageState } from './noteRecovery';

/**
 * Notebooks and notes, Evernote's shape: a notebook holds notes, a note is one
 * markdown document, and tags cut across both. Sections are gone — Evernote
 * never had them, and the old three-level tree was most of what made this
 * screen feel like filing rather than writing.
 *
 * Two rules this file exists to keep, both of them paid for in lost text:
 *
 * 1. **Writes are upserts, not updates.** A note is created optimistically so
 *    the editor can open on it immediately. An UPDATE against a row the server
 *    has not inserted yet matches nothing and reports *success* — the note
 *    saves into a void. An upsert either finds the row or creates it, so the
 *    order the two writes arrive in stops mattering.
 *
 * 2. **Unsaved text outranks the server.** Between a keystroke and the write it
 *    triggers, the only copy of that text is in the cache. Any refetch landing
 *    in that window — a settle from another mutation, window focus, reconnect —
 *    replaces the cache with older rows. `pending` below is overlaid on every
 *    read so a refetch cannot drop what has not been written yet.
 */

export type Notebook = {
  id: string; name: string; color: string; position: number; created_at: string;
  deleted_at?: string | null;
};

export type Note = {
  id: string; notebook_id: string; title: string; body: string;
  position: number; created_at: string; updated_at: string; deleted_at: string | null;
};

export const NB_KEY = ['notebooks'] as const;
const NB_TRASH_KEY = ['notebooks_trash'] as const;
export const NOTE_KEY = ['notes'] as const;
const TRASH_KEY = ['notes_trash'] as const;
const TAG_KEY = ['note_tags'] as const;

const NOTE_COLS = 'id,notebook_id,title,body,position,created_at,updated_at,deleted_at';

/** Typed-but-unwritten text, keyed by note id. See rule 2 above. */
const pending = new Map<string, { title: string; body: string }>();
export const pendingPageText = (id: string) => pending.get(id);
export const markPending = (id: string, v: { title: string; body: string; notebook_id?: string }) => {
  pending.set(id, v);
  const notebook_id = v.notebook_id ?? queryClient.getQueryData<Note[]>(NOTE_KEY)?.find(n => n.id === id)?.notebook_id;
  if (notebook_id) keepPageDraft({ id, notebook_id, title: v.title, body: v.body });
};
export const clearPending = (id: string) => { pending.delete(id); discardPageDraft(id); };

const overlay = (rows: Note[]): Note[] => {
  const known = new Set(rows.map(n => n.id));
  const drafts = (queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [])
    .filter(n => !known.has(n.id) && !n.deleted_at && pending.has(n.id));
  return [...drafts, ...rows].map(n => pending.has(n.id) ? {...n, ...pending.get(n.id)!} : n);
};

/* ------------------------------------------------------------------- reads */

export function useNotebooks() {
  return useQuery({
    queryKey: NB_KEY,
    queryFn: async (): Promise<Notebook[]> => {
      const { data, error } = await supabase.from('sorro_notebooks')
        .select('id,name,color,position,created_at,deleted_at').is('deleted_at', null).order('position').order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNotebookTrash() {
  return useQuery({ queryKey: NB_TRASH_KEY, queryFn: async (): Promise<Notebook[]> => {
    const { data, error } = await supabase.from('sorro_notebooks').select('id,name,color,position,created_at,deleted_at')
      .not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  } });
}

/**
 * Every live note, bodies included.
 *
 * ponytail: the note list needs a snippet of each body, so this pulls the
 * documents whole rather than adding a second query for previews. A student's
 * notebook is a few hundred KB; if that ever stops being true, select a
 * `left(body, 200)` view here and fetch the full body per open note.
 */
export function useNotes() {
  return useQuery({
    queryKey: NOTE_KEY,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase.from('sorro_notes')
        .select(NOTE_COLS + ',sorro_notebooks!inner(deleted_at)').is('deleted_at', null).is('sorro_notebooks.deleted_at', null).order('updated_at', { ascending: false }).limit(500);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Note[];
      const recovered = await pageRecovery().catch(() => []);
      for (const { draft } of recovered) {
        if (!draft || pending.has(draft.id)) continue;
        const server = rows.find(n => n.id === draft.id);
        if (server && Date.parse(server.updated_at) <= Date.parse(draft.at)) {
          pending.set(draft.id, draft); setPageState(draft.id, 'error');
        }
      }
      const missing = recovered.flatMap(r => r.draft && !rows.some(n => n.id === r.draft!.id) ? [r.draft] : []);
      if (missing.length) {
        // A failed first insert has no server row. Recover that draft only if
        // its notebook is live; never resurrect a page or notebook in the bin.
        const [{ data: existing }, { data: books }] = await Promise.all([
          supabase.from('sorro_notes').select('id').in('id', missing.map(d => d.id)),
          supabase.from('sorro_notebooks').select('id').is('deleted_at', null).in('id', [...new Set(missing.map(d => d.notebook_id))]),
        ]);
        if (existing && books) for (const d of missing) if (!existing.some(n => n.id === d.id) && books.some(b => b.id === d.notebook_id)) {
          pending.set(d.id, d); setPageState(d.id, 'error');
          rows.unshift({ id:d.id, notebook_id:d.notebook_id, title:d.title, body:d.body, position:0, created_at:d.at, updated_at:d.at, deleted_at:null });
        }
      }
      return overlay(rows);
    },
  });
}

/** Evernote's trash: deleted notes stay recoverable until they are purged. */
export function useTrash() {
  return useQuery({
    queryKey: TRASH_KEY,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase.from('sorro_notes')
        .select(NOTE_COLS).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });
}

/** Tags for every note, grouped — one query rather than one per open note. */
export function useTags() {
  return useQuery({
    queryKey: TAG_KEY,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase.from('sorro_note_tags').select('note_id,tag').order('tag').limit(10000);
      if (error) throw error;
      const out: Record<string, string[]> = {};
      for (const r of data ?? []) (out[r.note_id] ??= []).push(r.tag);
      return out;
    },
  });
}

/** The signed-in user's handle, for the notebook table's "Created by" column. */
export function useMe() {
  return useQuery({
    queryKey: ['me_handle'],
    staleTime: 600_000,
    queryFn: async (): Promise<string> => {
      const uid = await currentUserId();
      if (uid) {
        // `user_id`, not `id` — sorro_profiles is keyed on the auth uid under that
        // name everywhere else in the app. Filtering on `id` matched nothing,
        // the error went into the discarded half of the result, and the
        // notebook table's "Created by" column said "you" for every account.
        const { data } = await supabase.from('sorro_profiles').select('handle,name').eq('user_id', uid).maybeSingle();
        if (data?.handle && data.handle.toLowerCase() !== 'gemini') return data.handle;
        if (data?.name && data.name.toLowerCase() !== 'gemini') return data.name;
      }
      return 'you';
    },
  });
}

/* --------------------------------------------------------------- mutations */

const NEW_NB = defineMutation('nb2.newNotebook', async (v: { id: string; name: string; color: string; position: number }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_notebooks').insert({ ...v, user_id });
  if (error) throw error;
});

const EDIT_NB = defineMutation('nb2.editNotebook', async (v: { id: string; patch: Partial<Notebook> }) => {
  const { error } = await supabase.from('sorro_notebooks').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DEL_NB = defineMutation('nb2.delNotebook', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_notebooks').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const REORDER_NB = defineMutation('nb2.reorderNotebooks', async (v: { ids: string[] }) => {
  const { error } = await supabase.rpc('reorder_notebooks', { notebook_ids: v.ids });
  if (error) throw error;
});
let notebookOrderVersion = 0;

const RESTORE_NB = defineMutation('nb2.restoreNotebook', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_notebooks').update({ deleted_at: null }).eq('id', v.id);
  if (error) throw error;
});

const PURGE_NB = defineMutation('nb2.purgeNotebook', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_notebooks').delete().eq('id', v.id);
  if (error) throw error;
});

const NEW_NOTE = defineMutation('nb2.newNote', async (v: { id: string; notebook_id: string; title: string; body: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_notes').upsert({ ...v, user_id, position: 0 }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
  acknowledgePage(v);
  const draft = pending.get(v.id);
  if (draft?.title === v.title && draft.body === v.body) { pending.delete(v.id); setPageState(v.id, 'saved'); }
});

/** Rule 1: upsert, so a save can never lose a race with its own insert. */
const SAVE_NOTE = defineMutation('nb2.saveNote', async (v: { id: string; notebook_id: string; title: string; body: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_notes').upsert({ ...v, user_id }, { onConflict: 'id' });
  if (error) throw error;
  acknowledgePage(v);
  // Drop the overlay only if nothing newer replaced it while this was in flight.
  const p = pending.get(v.id);
  if (p && p.body === v.body && p.title === v.title) { pending.delete(v.id); setPageState(v.id, 'saved'); }
});

const MOVE_NOTE = defineMutation('nb2.moveNote', async (v: { id: string; notebook_id: string }) => {
  const { error } = await supabase.from('sorro_notes').update({ notebook_id: v.notebook_id }).eq('id', v.id);
  if (error) throw error;
});

const DEL_NOTE = defineMutation('nb2.delNote', async (v: { id: string }) => {
  const { error } = await supabase.from('sorro_notes').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE_NOTE = defineMutation('nb2.restoreNote', async (v: { id: string }) => {
  const { error } = await supabase.rpc('sorro_restore', { p_table: 'sorro_notes', p_id: v.id });
  if (error) throw error;
});

const PURGE = defineMutation('nb2.purge', async (v: { ids: string[] }) => {
  const { error } = await supabase.from('sorro_notes').delete().in('id', v.ids);
  if (error) throw error;
});

const SET_TAGS = defineMutation('nb2.setTags', async (v: { note_id: string; tags: string[] }) => {
  const user_id = await currentUserId();
  const { error: delError } = await supabase.from('sorro_note_tags').delete().eq('note_id', v.note_id);
  if (delError) throw delError;   // else a failed clear plus a successful insert unions old and new tags
  if (!v.tags.length) return;
  const { error } = await supabase.from('sorro_note_tags')
    .insert(v.tags.map((tag) => ({ user_id, note_id: v.note_id, tag })));
  if (error) throw error;
});

/* ------------------------------------------------------------------ actions */

export function useNoteActions() {
  const qc = useQueryClient();
  const settle = settler(qc, NB_KEY, NB_TRASH_KEY, NOTE_KEY, TRASH_KEY);

  const patchNotes = (fn: (p: Note[]) => Note[]) => {
    const prev = queryClient.getQueryData<Note[]>(NOTE_KEY) ?? [];
    queryClient.setQueryData<Note[]>(NOTE_KEY, fn(prev));
    return prev;
  };
  const rollbackNotes = (_e: unknown, _v: unknown, ctx: Note[] | undefined) => {
    if (ctx) queryClient.setQueryData(NOTE_KEY, ctx);
  };

  const newNotebook = useMutation<unknown, Error, { id: string; name: string; color: string; position: number }, Notebook[]>({
    mutationKey: NEW_NB,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Notebook[]>(NB_KEY) ?? [];
      queryClient.setQueryData<Notebook[]>(NB_KEY, [...prev, { ...v, created_at: new Date().toISOString() }]);
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(NB_KEY, ctx); },
    onSettled: settle,
  });

  const editNotebook = useMutation<unknown, Error, { id: string; patch: Partial<Notebook> }, Notebook[]>({
    mutationKey: EDIT_NB,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Notebook[]>(NB_KEY) ?? [];
      queryClient.setQueryData<Notebook[]>(NB_KEY, prev.map((b) => (b.id === v.id ? { ...b, ...v.patch } : b)));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(NB_KEY, ctx); },
    onSettled: settle,
  });

  const delNotebook = useMutation<unknown, Error, { id: string }, { books: Notebook[]; notes: Note[] }>({
    mutationKey: DEL_NB,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Notebook[]>(NB_KEY) ?? [];
      queryClient.setQueryData<Notebook[]>(NB_KEY, prev.filter((b) => b.id !== v.id));
      const notes = patchNotes((p) => p.filter((n) => n.notebook_id !== v.id));
      return { books: prev, notes };
    },
    onError: (_e, _v, ctx) => { if (ctx) { queryClient.setQueryData(NB_KEY, ctx.books); queryClient.setQueryData(NOTE_KEY, ctx.notes); } },
    onSettled: settle,
  });

  const reorderNotebooks = useMutation<unknown, Error, { ids: string[] }, { previous: Notebook[]; version: number }>({
    mutationKey: REORDER_NB,
    scope: { id: 'notebook-order' },
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: NB_KEY });
      const previous = queryClient.getQueryData<Notebook[]>(NB_KEY) ?? [];
      const positions = new Map(ids.map((id, index) => [id, index]));
      queryClient.setQueryData<Notebook[]>(NB_KEY, previous.map(b => ({ ...b, position: positions.get(b.id) ?? b.position })).sort((a,b) => a.position - b.position));
      return { previous, version: ++notebookOrderVersion };
    },
    onError: (_error, _variables, context) => {
      if (context?.version === notebookOrderVersion) queryClient.setQueryData(NB_KEY, context.previous);
      toast('Notebook order could not be saved. Try again when connected.');
    },
    onSettled: () => { if (qc.isMutating({ mutationKey: REORDER_NB }) === 1) return qc.invalidateQueries({ queryKey: NB_KEY }); },
  });

  const restoreNotebook = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_NB, onSettled: settle });
  const purgeNotebook = useMutation<unknown, Error, { id: string }>({ mutationKey: PURGE_NB, onSettled: settle });

  const newNote = useMutation<unknown, Error, { id: string; notebook_id: string; title: string; body: string }, Note[]>({
    mutationKey: NEW_NOTE,
    scope: { id: 'page-writes' },
    onMutate: (v) => { markPending(v.id, v); return patchNotes((p) => [{
      ...v, position: 0, created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(), deleted_at: null,
    }, ...p]); },
    // Keep a newly opened page if creation fails while its editor is already
    // saving. A rollback here would remove newer work from the library.
    onError: (e, v) => { setPageState(v.id, 'error'); toast(`Page kept on this device — ${e.message}`); },
    onSuccess: settle,
  });

  /**
   * Two deliberate omissions here, both of them about not throwing text away.
   *
   * No settle: refetching the list while the user is still typing replaces the
   * text under the cursor with whatever the server last heard. The list
   * re-sorts itself from the optimistic patch instead.
   *
   * No rollback: every other mutation restores the previous cache when a write
   * fails, and for a save that means replacing what the user just typed with an
   * older copy of their own note — the failure mode this rewrite exists to end.
   * The typed text stays, the toast says the write did not land, and the next
   * keystroke tries again.
   */
  const saveNote = useMutation<unknown, Error, { id: string; notebook_id: string; title: string; body: string }, Note[]>({
    mutationKey: SAVE_NOTE,
    scope: { id: 'page-writes' },
    onMutate: (v) => { markPending(v.id, v); return patchNotes((p) => p.map((n) => (n.id === v.id
      ? { ...n, title: v.title, body: v.body, updated_at: new Date().toISOString() } : n))); },
    onError: (e, v) => { setPageState(v.id, 'error'); toast(`Not saved yet — ${e.message}`); },
  });

  const moveNote = useMutation<unknown, Error, { id: string; notebook_id: string }, Note[]>({
    mutationKey: MOVE_NOTE,
    onMutate: (v) => patchNotes((p) => p.map((n) => (n.id === v.id ? { ...n, notebook_id: v.notebook_id } : n))),
    onError: rollbackNotes,
    onSettled: settle,
  });

  const delNote = useMutation<unknown, Error, { id: string }, Note[]>({
    mutationKey: DEL_NOTE,
    onMutate: (v) => {
      // A pending save for a note being deleted would upsert it back to life.
      clearPending(v.id);
      return patchNotes((p) => p.filter((n) => n.id !== v.id));
    },
    onError: rollbackNotes,
    onSettled: settle,
  });

  const restoreNote = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE_NOTE, onSettled: settle });
  const purge = useMutation<unknown, Error, { ids: string[] }>({ mutationKey: PURGE, onSettled: settle });

  const setTags = useMutation<unknown, Error, { note_id: string; tags: string[] }>({
    mutationKey: SET_TAGS,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Record<string, string[]>>(TAG_KEY) ?? {};
      queryClient.setQueryData(TAG_KEY, { ...prev, [v.note_id]: v.tags });
    },
    onSettled: () => { if (qc.isMutating() <= 1) void qc.invalidateQueries({ queryKey: TAG_KEY }); },
  });

  const deleteWithUndo = (n: Note) => {
    delNote.mutate({ id: n.id });
    toast(`Deleted “${n.title || 'Untitled'}”`, () => restoreNote.mutate({ id: n.id }));
  };

  return {
    newNotebook, editNotebook, reorderNotebooks, delNotebook, restoreNotebook, purgeNotebook,
    newNote, saveNote, moveNote, delNote, restoreNote, purge, deleteWithUndo,
    setTags,
  };
}

/* ------------------------------------------------------------------- utils */

/**
 * Every `[[wiki link]]` in the notebook, resolved to note ids by title.
 *
 * There is a `sorro_note_links` table for this, written on every save. Nothing
 * reads it any more: the bodies are already loaded for the list's snippets, so
 * the edges are one pass over text that is in memory — no write path to keep in
 * step, and no way for the table to disagree with the notes it describes.
 */
export function linkGraph(notes: Note[]): { from: string; to: string }[] {
  const byTitle = new Map(notes.map((n) => [n.title.trim().toLowerCase(), n.id]));
  const out: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (const n of notes) {
    for (const t of wikiTargets(n.body)) {
      const to = byTitle.get(t.toLowerCase());
      if (!to || to === n.id) continue;
      const key = `${n.id}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from: n.id, to });
    }
  }
  return out;
}

/** "2 minutes ago" / "Aug 16" — the note list's date column. */
export function whenLabel(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}
