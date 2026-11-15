'use client';
/**
 * The Vault's files and folders: file rows in sorro_files, bytes in the private sorro-files bucket,
 * folders in sorro_folders (id, name, parent_id, position). Links come from lib/links.ts and keep
 * their folder in their own text. Every change but an upload is shown at once and waits for a
 * connection when offline, like the rest of the app (lib/offline.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { fixture } from './devFixtures';
import { uploadTo } from './uploads';
import { SAFE_TYPES, effectiveType } from './uploadGuard';
import { vaultKind, type VaultFile, type VaultFolder } from './vaultLogic';

export type { VaultFile, VaultFolder };
export const FILES_KEY = ['files'] as const;
export const FOLDERS_KEY = ['folders'] as const;
/** Photos, clips and PDFs. The bucket's own allow-list is the real gate. */
export const VAULT_TYPES = new Set([...SAFE_TYPES, 'application/pdf']);
export const VAULT_MAX_BYTES = 40 * 1024 * 1024;

export function useFiles() {
  return useQuery({
    queryKey: FILES_KEY,
    queryFn: async (): Promise<VaultFile[]> => {
      const fx = fixture<VaultFile[]>('files');
      if (fx) return fx;
      const { data, error } = await supabase.from('sorro_files')
        .select('id,name,kind,size_bytes,storage_path,folder_id,starred,created_at')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as VaultFile[];
    },
  });
}

export function useFolders() {
  return useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: async (): Promise<VaultFolder[]> => {
      const fx = fixture<VaultFolder[]>('folders');
      if (fx) return fx;
      const { data, error } = await supabase.from('sorro_folders').select('id,name,parent_id,position').order('position').limit(1000);
      if (error) throw error;
      return (data ?? []) as VaultFolder[];
    },
  });
}

const patchFile = async (id: string, values: Record<string, unknown>) => {
  const { error } = await supabase.from('sorro_files').update(values).eq('id', id);
  if (error) throw error;
};
type FilePatch = { id: string; values: Partial<Pick<VaultFile, 'name' | 'folder_id' | 'starred'>> & { deleted_at?: string | null } };
const FILE_PATCH = defineMutation('files.patch', (v: FilePatch) => patchFile(v.id, v.values));

const FOLDER_ADD = defineMutation('folders.add', async (v: VaultFolder) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('sorro_folders').insert({ id: v.id, user_id, name: v.name, parent_id: v.parent_id, position: v.position ?? 0 });
  if (error) throw error;
});
const FOLDER_SAVE = defineMutation('folders.save', async (v: { id: string; name?: string; parent_id?: string | null }) => {
  const values: Record<string, unknown> = {};
  if (v.name !== undefined) values.name = v.name;
  if (v.parent_id !== undefined) values.parent_id = v.parent_id;
  const { error } = await supabase.from('sorro_folders').update(values).eq('id', v.id);
  if (error) throw error;
});
/** A deleted folder hands its files and folders to its parent first, so nothing inside is lost. */
const FOLDER_DEL = defineMutation('folders.del', async (v: { id: string; parent_id: string | null }) => {
  const r1 = await supabase.from('sorro_files').update({ folder_id: v.parent_id }).eq('folder_id', v.id);
  if (r1.error) throw r1.error;
  const r2 = await supabase.from('sorro_folders').update({ parent_id: v.parent_id }).eq('parent_id', v.id);
  if (r2.error) throw r2.error;
  const { error } = await supabase.from('sorro_folders').delete().eq('id', v.id);
  if (error) throw error;
});

function cachePatch<T>(key: readonly unknown[], fn: (rows: T[]) => T[]): T[] {
  const prev = queryClient.getQueryData<T[]>(key) ?? [];
  queryClient.setQueryData<T[]>(key, fn(prev));
  return prev;
}

export function useFileActions() {
  const qc = useQueryClient();
  const settle = settler(qc, FILES_KEY);
  const rollback = (_e: unknown, _v: unknown, ctx: VaultFile[] | undefined) => { if (ctx) queryClient.setQueryData(FILES_KEY, ctx); };
  const patch = useMutation<unknown, Error, FilePatch, VaultFile[]>({
    mutationKey: FILE_PATCH,
    onMutate: (v) => cachePatch<VaultFile>(FILES_KEY, rows => v.values.deleted_at ? rows.filter(f => f.id !== v.id) : rows.map(f => f.id === v.id ? { ...f, ...v.values } : f)),
    onError: rollback,
    onSettled: settle,
  });
  return {
    upload: useMutation({
      mutationFn: async (v: File | { file: File; folder_id: string | null }) => {
        const file = v instanceof File ? v : v.file;
        const folder_id = v instanceof File ? null : v.folder_id;
        const storage_path = await uploadTo('sorro-files', file, { types: VAULT_TYPES, maxBytes: VAULT_MAX_BYTES });
        const user_id = await currentUserId();
        const { error } = await supabase.from('sorro_files').insert({ user_id, name: file.name.slice(0, 200), kind: vaultKind(effectiveType(file)), size_bytes: file.size, storage_path, folder_id });
        if (error) throw error;
      },
      onSettled: () => qc.invalidateQueries({ queryKey: FILES_KEY }),
    }),
    star: { mutate: (v: { id: string; starred: boolean }) => patch.mutate({ id: v.id, values: { starred: v.starred } }) },
    rename: { mutate: (v: { id: string; name: string }) => patch.mutate({ id: v.id, values: { name: v.name } }) },
    move: { mutate: (v: { id: string; folder_id: string | null }) => patch.mutate({ id: v.id, values: { folder_id: v.folder_id } }) },
    // Moved to the trash, not erased: the row keeps its file, so Undo brings it back.
    remove: { mutate: (v: { id: string }) => patch.mutate({ id: v.id, values: { deleted_at: new Date().toISOString() } }) },
    restore: {
      mutate: (v: { id: string; file?: VaultFile }) => {
        if (v.file) cachePatch<VaultFile>(FILES_KEY, rows => rows.some(f => f.id === v.id) ? rows : [v.file!, ...rows]);
        patch.mutate({ id: v.id, values: { deleted_at: null } });
      },
    },
  };
}

export function useFolderActions() {
  const qc = useQueryClient();
  const settle = settler(qc, FOLDERS_KEY, FILES_KEY);
  const rollback = (_e: unknown, _v: unknown, ctx: VaultFolder[] | undefined) => { if (ctx) queryClient.setQueryData(FOLDERS_KEY, ctx); };
  const add = useMutation<unknown, Error, VaultFolder, VaultFolder[]>({
    mutationKey: FOLDER_ADD,
    onMutate: (v) => cachePatch<VaultFolder>(FOLDERS_KEY, rows => [...rows, v]),
    onError: rollback,
    onSettled: settle,
  });
  const save = useMutation<unknown, Error, { id: string; name?: string; parent_id?: string | null }, VaultFolder[]>({
    mutationKey: FOLDER_SAVE,
    onMutate: (v) => cachePatch<VaultFolder>(FOLDERS_KEY, rows => rows.map(f => f.id === v.id ? { ...f, ...(v.name !== undefined && { name: v.name }), ...(v.parent_id !== undefined && { parent_id: v.parent_id }) } : f)),
    onError: rollback,
    onSettled: settle,
  });
  const del = useMutation<unknown, Error, { id: string; parent_id: string | null }, VaultFolder[]>({
    mutationKey: FOLDER_DEL,
    onMutate: (v) => {
      cachePatch<VaultFile>(FILES_KEY, rows => rows.map(f => f.folder_id === v.id ? { ...f, folder_id: v.parent_id } : f));
      return cachePatch<VaultFolder>(FOLDERS_KEY, rows => rows.filter(f => f.id !== v.id).map(f => f.parent_id === v.id ? { ...f, parent_id: v.parent_id } : f));
    },
    onError: rollback,
    onSettled: settle,
  });
  return { add, save, del };
}
