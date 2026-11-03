'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';
import { uploadTo } from './uploads';
import { fixture } from './devFixtures';

/**
 * Journal photos and their pins, as a data layer.
 *
 * The photos used to be a query and four inline `supabase.from(...)` calls
 * inside the component, which is why they could only be added and destroyed:
 * every other verb needs a state the row does not lose on a refetch.
 *
 * Two timestamps carry all of it. `archived_at` is "put this away" — the photo
 * stays with the day, out of the grid, one click from coming back.
 * `deleted_at` is "gone", but gone as a row that still exists, so the toast can
 * offer undo and so the storage object is still there to undo *to*. Purging is
 * a separate, explicit act: the row goes, and then the file.
 *
 * Pin coordinates stay 0–100 percentages (BACKEND.md), so a pin points at the
 * same part of the picture at any render size.
 */

export type Photo = {
  id: string;
  name: string;
  storage_path: string;
  position: number;
  archived_at: string | null;
  deleted_at: string | null;
};

export type Pin = { id: string; x: number; y: number; text: string };

const COLS = 'id,name,storage_path,position,archived_at,deleted_at';

export const photoKey = (entryId: string | null) => ['journal_photos', entryId] as const;
export const pinKey = (photoId: string) => ['photo_pins', photoId] as const;

/* ------------------------------------------------------------------- reads */

/** Every photo on the day, hidden ones included — the caller splits them. */
export function usePhotos(entryId: string | null) {
  return useQuery({
    queryKey: photoKey(entryId),
    enabled: !!entryId,
    queryFn: async (): Promise<Photo[]> => {
      // The key carries the entry id, so a fixture default cannot match it -
      // same escape hatch lib/journal.ts uses for its windowed keys.
      const fx = fixture<Photo[]>('journal_photos');
      if (fx) return fx;
      const { data, error } = await supabase.from('sorro_journal_photos')
        .select(COLS).eq('entry_id', entryId!).order('position').order('created_at');
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
  });
}

export function usePins(photoId: string, enabled: boolean) {
  return useQuery({
    queryKey: pinKey(photoId),
    enabled,
    queryFn: async (): Promise<Pin[]> => {
      const { data, error } = await supabase.from('sorro_photo_annotations')
        .select('id,x,y,text').eq('photo_id', photoId).order('created_at');
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, x: Number(a.x), y: Number(a.y) }));
    },
  });
}

/* --------------------------------------------------------------- mutations */

const ADD = defineMutation('jp.add', async (v: Photo & { entry_id: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_journal_photos').insert({
    id: v.id, user_id, entry_id: v.entry_id, name: v.name,
    storage_path: v.storage_path, position: v.position,
  });
  if (error) throw error;
});

const PATCH = defineMutation('jp.patch', async (v: { id: string; patch: Partial<Photo> }) => {
  const { error } = await supabase.from('sorro_journal_photos').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

/**
 * Replace the picture, keep the row. The pins are pinned to *this photo*, and a
 * delete-then-add would drop them along with the row they hang off — so the
 * new object is written into the same row and the old file is removed after,
 * in that order. A failed update leaves an unreferenced upload, which is
 * cheaper than a row pointing at a file that is no longer there.
 */
const REPLACE = defineMutation('jp.replace', async (v: { id: string; storage_path: string; name: string; old_path: string }) => {
  const { error } = await supabase.from('sorro_journal_photos')
    .update({ storage_path: v.storage_path, name: v.name }).eq('id', v.id);
  if (error) throw error;
  if (v.old_path && v.old_path !== v.storage_path) {
    await supabase.storage.from('sorro-journal').remove([v.old_path]);
  }
});

const PURGE = defineMutation('jp.purge', async (v: { id: string; storage_path: string }) => {
  const { error } = await supabase.from('sorro_journal_photos').delete().eq('id', v.id);
  if (error) throw error;
  await supabase.storage.from('sorro-journal').remove([v.storage_path]);
});

const ADD_PIN = defineMutation('jp.addPin', async (v: Pin & { photo_id: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_photo_annotations')
    .insert({ id: v.id, user_id, photo_id: v.photo_id, x: v.x, y: v.y, text: v.text });
  if (error) throw error;
});

const EDIT_PIN = defineMutation('jp.editPin', async (v: { id: string; text: string }) => {
  const { error } = await supabase.from('sorro_photo_annotations').update({ text: v.text }).eq('id', v.id);
  if (error) throw error;
});

const DEL_PIN = defineMutation('jp.delPin', async (v: { id: string; photo_id: string }) => {
  const { error } = await supabase.from('sorro_photo_annotations').delete().eq('id', v.id);
  if (error) throw error;
});

const CLEAR_PINS = defineMutation('jp.clearPins', async (v: { photo_id: string }) => {
  const { error } = await supabase.from('sorro_photo_annotations').delete().eq('photo_id', v.photo_id);
  if (error) throw error;
});

/* ----------------------------------------------------------------- actions */

export function usePhotoActions(entryId: string | null) {
  const qc = useQueryClient();
  const key = photoKey(entryId);
  const settle = settler(qc, key);

  const patchList = (fn: (p: Photo[]) => Photo[]) => {
    const prev = queryClient.getQueryData<Photo[]>(key) ?? [];
    queryClient.setQueryData<Photo[]>(key, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: Photo[] | undefined) => {
    if (ctx) queryClient.setQueryData(key, ctx);
  };

  const add = useMutation<unknown, Error, Photo & { entry_id: string }, Photo[]>({
    mutationKey: ADD,
    onMutate: (v) => patchList((p) => [...p, v]),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  const patch = useMutation<unknown, Error, { id: string; patch: Partial<Photo> }, Photo[]>({
    mutationKey: PATCH,
    onMutate: (v) => patchList((p) => p.map((n) => (n.id === v.id ? { ...n, ...v.patch } : n))),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  const replace = useMutation<unknown, Error, { id: string; storage_path: string; name: string; old_path: string }, Photo[]>({
    mutationKey: REPLACE,
    onMutate: (v) => patchList((p) => p.map((n) => (n.id === v.id ? { ...n, storage_path: v.storage_path, name: v.name } : n))),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  const purge = useMutation<unknown, Error, { id: string; storage_path: string }, Photo[]>({
    mutationKey: PURGE,
    onMutate: (v) => patchList((p) => p.filter((n) => n.id !== v.id)),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  /** Upload the file, then write the row. Returns false if either half failed. */
  const upload = async (entry_id: string, file: File, position: number): Promise<boolean> => {
    try {
      const storage_path = await uploadTo('sorro-journal', file);
      add.mutate({
        id: crypto.randomUUID(), entry_id, name: file.name, storage_path,
        position, archived_at: null, deleted_at: null,
      });
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
      return false;
    }
  };

  const swap = async (photo: Photo, file: File): Promise<boolean> => {
    try {
      const storage_path = await uploadTo('sorro-journal', file);
      replace.mutate({ id: photo.id, storage_path, name: file.name, old_path: photo.storage_path });
      toast('Photo replaced');
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
      return false;
    }
  };

  const setArchived = (photo: Photo, archived: boolean) => {
    patch.mutate({ id: photo.id, patch: { archived_at: archived ? new Date().toISOString() : null } });
    toast(archived ? `Archived “${photo.name}”` : `Back in the day’s photos`,
      () => patch.mutate({ id: photo.id, patch: { archived_at: archived ? null : photo.archived_at } }));
  };

  /**
   * Delete leaves the row and the file where they are, so the toast's undo has
   * something to restore. Emptying them for good is the drawer's job.
   */
  const remove = (photo: Photo) => {
    patch.mutate({ id: photo.id, patch: { deleted_at: new Date().toISOString() } });
    toast(`Deleted “${photo.name}”`, () => patch.mutate({ id: photo.id, patch: { deleted_at: null } }));
  };

  const restore = (photo: Photo) => {
    patch.mutate({ id: photo.id, patch: { deleted_at: null, archived_at: null } });
    toast(`Restored “${photo.name}”`);
  };

  const rename = (photo: Photo, name: string) => {
    patch.mutate({ id: photo.id, patch: { name } });
    toast('Renamed', () => patch.mutate({ id: photo.id, patch: { name: photo.name } }));
  };

  return { upload, swap, setArchived, remove, restore, rename, purge, patch };
}

/** Pins for one photo. Small enough that each verb is one optimistic patch. */
export function usePinActions(photoId: string) {
  const qc = useQueryClient();
  const key = pinKey(photoId);
  const settle = settler(qc, key);

  const patchPins = (fn: (p: Pin[]) => Pin[]) => {
    const prev = queryClient.getQueryData<Pin[]>(key) ?? [];
    queryClient.setQueryData<Pin[]>(key, fn(prev));
    return prev;
  };
  const rollback = (_e: unknown, _v: unknown, ctx: Pin[] | undefined) => {
    if (ctx) queryClient.setQueryData(key, ctx);
  };

  const addPin = useMutation<unknown, Error, Pin & { photo_id: string }, Pin[]>({
    mutationKey: ADD_PIN,
    onMutate: (v) => patchPins((p) => [...p, v]),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  const editPin = useMutation<unknown, Error, { id: string; text: string }, Pin[]>({
    mutationKey: EDIT_PIN,
    onMutate: (v) => patchPins((p) => p.map((n) => (n.id === v.id ? { ...n, text: v.text } : n))),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  const delPin = useMutation<unknown, Error, { id: string; photo_id: string }, Pin[]>({
    mutationKey: DEL_PIN,
    onMutate: (v) => patchPins((p) => p.filter((n) => n.id !== v.id)),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  const clearPins = useMutation<unknown, Error, { photo_id: string }, Pin[]>({
    mutationKey: CLEAR_PINS,
    onMutate: () => patchPins(() => []),
    onError: (e, _v, ctx) => { rollback(e, _v, ctx); toast(e.message); },
    onSettled: settle,
  });

  return { addPin, editPin, delPin, clearPins };
}
