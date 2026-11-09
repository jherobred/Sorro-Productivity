'use client';
/** The Vault's files: rows in sorro_files, bytes in the private sorro-files bucket. Links come from lib/links.ts. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { fixture } from './devFixtures';
import { uploadTo } from './uploads';
import { SAFE_TYPES, effectiveType } from './uploadGuard';
import { vaultKind, type VaultFile } from './vaultLogic';

export type { VaultFile };
export const FILES_KEY = ['files'] as const;
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
        .select('id,name,kind,size_bytes,storage_path,starred,created_at')
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as VaultFile[];
    },
  });
}

export function useFileActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: FILES_KEY });
  const patch = (id: string, values: Record<string, unknown>) => async () => {
    const { error } = await supabase.from('sorro_files').update(values).eq('id', id);
    if (error) throw error;
  };
  return {
    upload: useMutation({
      mutationFn: async (file: File) => {
        const storage_path = await uploadTo('sorro-files', file, { types: VAULT_TYPES, maxBytes: VAULT_MAX_BYTES });
        const user_id = await currentUserId();
        const { error } = await supabase.from('sorro_files').insert({ user_id, name: file.name.slice(0, 200), kind: vaultKind(effectiveType(file)), size_bytes: file.size, storage_path });
        if (error) throw error;
      },
      onSettled: done,
    }),
    star: useMutation({ mutationFn: (v: { id: string; starred: boolean }) => patch(v.id, { starred: v.starred })(), onSettled: done }),
    // Moved to the trash, not erased: the row keeps its file, so Undo brings it back.
    remove: useMutation({ mutationFn: (v: { id: string }) => patch(v.id, { deleted_at: new Date().toISOString() })(), onSettled: done }),
    restore: useMutation({ mutationFn: (v: { id: string }) => patch(v.id, { deleted_at: null })(), onSettled: done }),
  };
}
