'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { ask } from '@/lib/ask';

/** Ported from Basedly.dc.html markup 2185–2350 (Basedly Drive). */

type FileRow = {
  id: string; name: string; kind: string; size_bytes: number;
  storage_path: string; folder_id: string | null; starred: boolean; created_at: string;
};
type Folder = { id: string; name: string; parent_id: string | null };

const FILES = ['files'] as const;
const FOLDERS = ['folders'] as const;
const BUCKET = 'bd-files';

const KIND: Record<string, { n: string; c: string; ic: IconName }> = {
  img: { n: 'Images', c: PAL.violet, ic: 'image' },
  vid: { n: 'Videos', c: PAL.coral, ic: 'play' },
  doc: { n: 'Documents', c: PAL.amber, ic: 'book' },
  zip: { n: 'Archives', c: PAL.mint, ic: 'archive' },
  other: { n: 'Other', c: PAL.cyan, ic: 'files' },
};

const KICKER: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' };

const kindOf = (n: string): string => {
  const e = n.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return 'img';
  if (['mp4', 'mov', 'webm'].includes(e)) return 'vid';
  if (['zip', 'rar', '7z'].includes(e)) return 'zip';
  if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(e)) return 'doc';
  return 'other';
};
const human = (b: number) =>
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
const NEW_FOLDER = defineMutation('files.newFolder', async (v: { name: string; parent_id: string | null }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_folders').insert({ user_id, name: v.name, parent_id: v.parent_id });
  if (error) throw error;
});

export default function FilesPage() {
  const { phone } = useLayout();
  const qc = useQueryClient();
  const settle = () => { void qc.invalidateQueries({ queryKey: FILES }); void qc.invalidateQueries({ queryKey: FOLDERS }); };
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [grid, setGrid] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: files = [] } = useQuery({
    queryKey: FILES,
    queryFn: async (): Promise<FileRow[]> => {
      const { data, error } = await supabase.from('bd_files')
        .select('id,name,kind,size_bytes,storage_path,folder_id,starred,created_at')
        .is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: folders = [] } = useQuery({
    queryKey: FOLDERS,
    queryFn: async (): Promise<Folder[]> => {
      const { data, error } = await supabase.from('bd_folders').select('id,name,parent_id').order('position');
      if (error) throw error;
      return data ?? [];
    },
  });

  const rename = useMutation<unknown, Error, { id: string; name: string }>({ mutationKey: RENAME, onSettled: settle });
  const restore = useMutation<unknown, Error, { id: string }>({ mutationKey: RESTORE, onSettled: settle });
  const newFolder = useMutation<unknown, Error, { name: string; parent_id: string | null }>({ mutationKey: NEW_FOLDER, onSettled: settle });
  const del = useMutation({
    mutationKey: DEL,
    onMutate: (v: { id: string }) => {
      const prev = queryClient.getQueryData<FileRow[]>(FILES) ?? [];
      queryClient.setQueryData<FileRow[]>(FILES, prev.filter((f) => f.id !== v.id));
      return prev;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(FILES, ctx); },
    onSettled: settle,
  });

  const total = files.reduce((s, f) => s + f.size_bytes, 0) || 1;
  const kinds = useMemo(() => Object.entries(KIND).map(([k, meta]) => {
    const rows = files.filter((f) => f.kind === k);
    const size = rows.reduce((s, f) => s + f.size_bytes, 0);
    return { k, ...meta, size, pct: Math.round((size / total) * 100) };
  }), [files, total]);

  const shown = files.filter((f) =>
    (!kindFilter || f.kind === kindFilter) &&
    (folder === null || f.folder_id === folder) &&
    (!q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase())));

  async function upload(file: File) {
    setBusy(true);
    try {
      const user_id = await currentUserId();
      const path = `${user_id}/${crypto.randomUUID()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from('bd_files').insert({
        user_id, name: file.name, kind: kindOf(file.name),
        size_bytes: file.size, storage_path: path, folder_id: folder,
      });
      if (error) throw error;
      toast(`Uploaded “${file.name}”`);
      settle();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed');
    } finally { setBusy(false); }
  }

  async function open(f: FileRow) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(f.storage_path, 60);
    if (error || !data) return toast('Could not open that file');
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  const tool: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
  };

  return (
    <div style={{ padding: phone ? '16px 14px 26px' : '20px 24px 30px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: `color-mix(in srgb, ${PAL.indigo} 20%, transparent)`, display: 'grid', placeItems: 'center' }}>
            <Icon name="files" size={18} color={PAL.indigo} />
          </div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.2, whiteSpace: 'nowrap' }}>Basedly Drive</div>
            <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 2 }}>
              {folder ? `Drive › ${folders.find((f) => f.id === folder)?.name ?? '…'}` : 'Drive'} · {human(files.reduce((s, f) => s + f.size_bytes, 0))}
            </div>
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <button onClick={() => inputRef.current?.click()} className="hov" title="New file" style={tool}>
            <Icon name="upload" size={15} color="var(--tx2)" />
          </button>
          <input ref={inputRef} type="file" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <button onClick={() => void ask('New folder', { placeholder: 'Folder name', confirmLabel: 'Create' }).then((n) => { if (n) newFolder.mutate({ name: n, parent_id: folder }); })}
            className="hov" title="New folder" style={tool}>
            <Icon name="folderPlus" size={15} color="var(--tx2)" />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 11px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--line)', minWidth: 160 }}>
            <Icon name="search" size={14} color="var(--tx3)" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…"
              style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--tx)' }} />
          </div>
          <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--card)' }}>
            {([['grid', true], ['agenda', false]] as [IconName, boolean][]).map(([ic, g]) => (
              <button key={ic} onClick={() => setGrid(g)} title={g ? 'Grid view' : 'List view'} style={{
                width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center',
                background: grid === g ? 'var(--acc)' : 'transparent',
              }}>
                <Icon name={ic} size={14} color={grid === g ? '#0C0F16' : 'var(--tx2)'} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 18 }}>
        {kinds.map((k) => (
          <button key={k.k} onClick={() => setKindFilter(kindFilter === k.k ? null : k.k)} className="tt" style={{
            textAlign: 'left', padding: '13px 14px', borderRadius: 14, background: 'var(--card)', boxShadow: 'var(--sh)',
            border: `1px solid ${kindFilter === k.k ? k.c : 'var(--line)'}`,
          }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${k.c} 18%, transparent)` }}>
              <Icon name={k.ic} size={15} color={k.c} />
            </span>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 10 }}>{k.n}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{human(k.size)}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>{k.pct}%</span>
            </div>
          </button>
        ))}
      </div>

      {folders.length > 0 && (
        <>
          <div style={{ ...KICKER, marginBottom: 10 }}>Folders</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10, marginBottom: 20 }}>
            {folder && (
              <button onClick={() => setFolder(null)} className="tt" style={folderTile}>
                <Icon name="back" size={16} color="var(--tx3)" />
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 11 }}>Back to Drive</div>
              </button>
            )}
            {folders.filter((f) => f.parent_id === folder).map((f) => (
              <button key={f.id} onClick={() => setFolder(f.id)} className="tt" style={folderTile}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Icon name="proj" size={16} color={PAL.amber} />
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx3)' }}>⋮</span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 11 }}>{f.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  {files.filter((x) => x.folder_id === f.id).length} items
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ ...KICKER, marginBottom: 10 }}>Files{busy ? ' · uploading…' : ''}</div>

      {grid ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          {shown.map((f) => (
            <button key={f.id} onClick={() => open(f)} className="tt" style={folderTile}>
              <div style={{
                height: 62, borderRadius: 10, marginBottom: 10,
                background: `linear-gradient(140deg, color-mix(in srgb, ${KIND[f.kind]?.c ?? PAL.cyan} 38%, var(--card2)), var(--card2))`,
                display: 'grid', placeItems: 'center',
              }}>
                <Icon name={KIND[f.kind]?.ic ?? 'files'} size={18} color={KIND[f.kind]?.c ?? PAL.cyan} />
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3 }}>{human(f.size_bytes)}</div>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh)', overflow: 'hidden' }}>
          {shown.map((f) => (
            <div key={f.id} className="lensrow" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
              <Icon name={KIND[f.kind]?.ic ?? 'files'} size={16} color={KIND[f.kind]?.c ?? PAL.cyan} />
              <button onClick={() => open(f)} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--tx3)', fontWeight: 600 }}>{human(f.size_bytes)}</div>
              </button>
              <button onClick={() => void ask('Rename file', { initial: f.name, placeholder: 'File name' }).then((n) => { if (n && n !== f.name) rename.mutate({ id: f.id, name: n }); })}
                aria-label="Rename" style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
                <Icon name="edit" size={13} color="var(--tx3)" />
              </button>
              <button onClick={() => { del.mutate({ id: f.id }); toast(`Deleted “${f.name}”`, () => restore.mutate({ id: f.id })); }}
                aria-label="Delete" style={{ padding: 5, minWidth: 24, minHeight: 24 }}>
                <Icon name="trash" size={13} color="var(--tx3)" />
              </button>
            </div>
          ))}
        </div>
      )}

      {shown.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '10px 2px' }}>No files here yet.</div>}
    </div>
  );
}

const folderTile: React.CSSProperties = {
  textAlign: 'left', padding: '13px 14px', borderRadius: 14,
  background: 'var(--card)', boxShadow: 'var(--sh)', border: '1px solid var(--line)',
};
