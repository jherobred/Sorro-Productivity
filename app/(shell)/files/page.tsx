'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { SECHUE } from '@/lib/pal';

type FileRow = {
  id: string; name: string; kind: string; size_bytes: number;
  storage_path: string; starred: boolean; deleted_at: string | null;
};

const KEY = ['files'] as const;
const BUCKET = 'bd-files';

const kindOf = (n: string): string => {
  const e = n.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return 'img';
  if (['mp4', 'mov', 'webm'].includes(e)) return 'vid';
  if (['mp3', 'wav', 'm4a'].includes(e)) return 'audio';
  if (['zip', 'rar', '7z'].includes(e)) return 'zip';
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(e)) return 'doc';
  return 'other';
};

const humanSize = (b: number) =>
  b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const RENAME = defineMutation('files.rename', async (v: { id: string; name: string }) => {
  const { error } = await supabase.from('bd_files').update({ name: v.name }).eq('id', v.id);
  if (error) throw error;
});

const DEL = defineMutation('files.del', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_files').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE = defineMutation('files.restore', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_files', p_id: v.id });
  if (error) throw error;
});

export default function FilesPage() {
  const qc = useQueryClient();
  const settle = () => void qc.invalidateQueries({ queryKey: KEY });
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase
        .from('bd_files')
        .select('id,name,kind,size_bytes,storage_path,starred,deleted_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rename = useMutation<unknown, Error, { id: string; name: string }>({ mutationKey: RENAME, onSettled: settle });
  const restore = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE, onSettled: settle });
  const del = useMutation({
    mutationKey: DEL,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<FileRow[]>(KEY) ?? [];
      queryClient.setQueryData<FileRow[]>(KEY, prev.filter((f) => f.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(KEY, ctx); },
    onSettled: settle,
  });

  /**
   * Uploads go straight to Storage, not through a mutation queue — a paused
   * mutation cannot hold a File object across a restart, so uploads are the one
   * write that genuinely requires a connection.
   */
  async function upload(file: File) {
    setBusy(true);
    try {
      const user_id = await currentUserId();
      // Storage RLS keys on the first path segment being the user's id.
      const path = `${user_id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;

      const { error } = await supabase.from('bd_files').insert({
        user_id, name: file.name, kind: kindOf(file.name),
        size_bytes: file.size, storage_path: path,
      });
      if (error) throw error;
      toast(`Uploaded “${file.name}”`);
      settle();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function open(f: FileRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60);
    if (error || !data) return toast('Could not open that file');
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.025em' }}>Files</h1>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="acc"
          style={{ marginLeft: 'auto', minHeight: 40, padding: '0 16px', borderRadius: 14, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="upload" size={14} color="var(--ink)" />
          {busy ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={inputRef} type="file" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
      </header>

      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
        {files.length === 0 && <p style={{ padding: 16, fontSize: 12.5, color: 'var(--tx3)' }}>No files yet.</p>}
        {files.map((f, i) => (
          <div key={f.id} className="lensrow" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: '1px solid var(--line)', animationDelay: `${Math.min(i, 8) * 0.02}s` }}>
            <Icon name={f.kind === 'img' ? 'image' : f.kind === 'vid' ? 'play' : f.kind === 'zip' ? 'archive' : 'files'} size={16} color={SECHUE.files} />
            <button onClick={() => open(f)} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>{humanSize(f.size_bytes)}</div>
            </button>
            <button
              onClick={() => {
                const n = window.prompt('Rename file', f.name);
                if (n && n !== f.name) rename.mutate({ id: f.id, name: n });
              }}
              aria-label="Rename" style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
              <Icon name="edit" size={13} color="var(--tx3)" />
            </button>
            <button
              onClick={() => { del.mutate({ id: f.id }); toast(`Deleted “${f.name}”`, () => restore.mutate({ id: f.id })); }}
              aria-label="Delete" style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
              <Icon name="trash" size={13} color="var(--tx3)" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
