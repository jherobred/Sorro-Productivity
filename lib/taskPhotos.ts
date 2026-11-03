'use client';

/**
 * Photos kept inside a task: a receipt, the whiteboard after the meeting, the
 * page of the textbook the task is about.
 *
 * They live in storage under the task, `<uid>/task-photos/<task id>/`, and the
 * folder listing is the list of photos, so no table has to change for a task
 * to hold any number of them. The folder is private to its owner like the rest
 * of `sorro-files`, and a photo is shown through a signed link.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { webpOf } from './webpPhoto';

export type TaskPhoto = { path: string; name: string; at: number };

const KEY = (taskId: string) => ['task-photos', taskId] as const;
const folder = (uid: string, taskId: string) => `${uid}/task-photos/${taskId}`;

async function listPhotos(taskId: string): Promise<TaskPhoto[]> {
  const uid = await currentUserId();
  if (uid === 'me') return [];                               // preview data has no storage
  const { data, error } = await supabase.storage.from('sorro-files').list(folder(uid, taskId), { limit: 200, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => /\.webp$/.test(f.name))
    .map((f) => ({ path: `${folder(uid, taskId)}/${f.name}`, name: f.name, at: Number(f.name.split('-')[0]) || 0 }))
    .sort((a, b) => a.at - b.at);
}

export function useTaskPhotos(taskId: string | null) {
  return useQuery({ queryKey: KEY(taskId ?? ''), queryFn: () => listPhotos(taskId!), enabled: !!taskId, staleTime: 60_000 });
}

export function useTaskPhotoActions(taskId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY(taskId) });
  return {
    /** Each photo is kept as a WebP no larger than 2000px, named by when it was added so the folder lists in order. */
    add: async (files: File[]) => {
      const uid = await currentUserId();
      if (uid === 'me') throw new Error('Photos need your account. Preview data cannot keep them.');
      for (const file of files) {
        const webp = await webpOf(file, 2000);
        const path = `${folder(uid, taskId)}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.webp`;
        const { error } = await supabase.storage.from('sorro-files').upload(path, webp, { contentType: 'image/webp', cacheControl: '3600' });
        if (error) throw error;
      }
      await refresh();
    },
    remove: async (photo: TaskPhoto) => {
      const { error } = await supabase.storage.from('sorro-files').remove([photo.path]);
      if (error) throw error;
      await refresh();
    },
  };
}
