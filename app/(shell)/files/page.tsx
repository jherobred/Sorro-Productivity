'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon, type IconName } from '@/components/Icon';
import { FolderGridSkeleton } from '@/components/Skeleton';
import { supabase, currentUserId } from '@/lib/supabase';
import { defineMutation, queryClient } from '@/lib/offline';
import { RowActions } from '@/components/MoneyRows';
import { toast } from '@/lib/toast';
import { PAL } from '@/lib/pal';
import { useLayout } from '@/lib/useLayout';
import { ask } from '@/lib/ask';
import { settler } from '@/lib/settle';

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
// The id is the caller's, not the database's. It was being passed in, used for
// the optimistic row, and then dropped on the way to the insert — so the
// folder you could see had one id and the folder that existed had another, and
// anything holding the first (a rename opened on the new folder, a file
// dropped into it) addressed a row that was never there.
const NEW_FOLDER = defineMutation('files.newFolder', async (v: { id: string; name: string; parent_id: string | null }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_folders').insert({ id: v.id, user_id, name: v.name, parent_id: v.parent_id });
  if (error) throw error;
});

const RENAME_FOLDER = defineMutation('files.renameFolder', async (v: { id: string; name: string }) => {
  const { error } = await supabase.from('bd_folders').update({ name: v.name }).eq('id', v.id);
  if (error) throw error;
});
/**
 * Deleting a folder does not delete what is in it. The files move up to the
 * Drive root, which is the only outcome that cannot lose anything — and it is
 * what every drive does when you remove a container rather than its contents.
 */
const DEL_FOLDER = defineMutation('files.delFolder', async (v: { id: string }) => {
  const { error: e1 } = await supabase.from('bd_files').update({ folder_id: null }).eq('folder_id', v.id);
  if (e1) throw e1;
  const { error } = await supabase.from('bd_folders').delete().eq('id', v.id);
  if (error) throw error;
});

export default function FilesPage() {
  const { phone } = useLayout();
  const qc = useQueryClient();
  const settle = settler(qc, FILES, FOLDERS);
  const inputRef = useRef<HTMLInputElement>(null);

  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [grid, setGrid] = useState(true);
  const [busy, setBusy] = useState(false);

  const { data: files = [], isPending: filesPending } = useQuery({
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

  const rename = useMutation<unknown, Error, { id: string; name: string }>({
    mutationKey: RENAME,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<FileRow[]>(FILES) ?? [];
      queryClient.setQueryData<FileRow[]>(FILES, prev.map((f) => (f.id === v.id ? { ...f, name: v.name } : f)));
    },
    onSettled: settle,
  });
  // Undo carries the row, so the file reappears on press rather than on refetch.
  const restore = useMutation<unknown, Error, { id: string; row?: FileRow }>({
    mutationKey: RESTORE,
    onMutate: (v) => {
      if (!v.row) return;
      const prev = queryClient.getQueryData<FileRow[]>(FILES) ?? [];
      if (prev.some((f) => f.id === v.id)) return;
      queryClient.setQueryData<FileRow[]>(FILES, [v.row, ...prev]);
    },
    onSettled: settle,
  });
  const newFolder = useMutation<unknown, Error, { id: string; name: string; parent_id: string | null }>({
    mutationKey: NEW_FOLDER,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Folder[]>(FOLDERS) ?? [];
      queryClient.setQueryData<Folder[]>(FOLDERS, [...prev, { id: v.id, name: v.name, parent_id: v.parent_id }]);
    },
    onSettled: settle,
  });
  const renameFolder = useMutation<unknown, Error, { id: string; name: string }>({
    mutationKey: RENAME_FOLDER,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Folder[]>(FOLDERS) ?? [];
      queryClient.setQueryData<Folder[]>(FOLDERS, prev.map((f) => (f.id === v.id ? { ...f, name: v.name } : f)));
    },
    onSettled: settle,
  });
  const delFolder = useMutation<unknown, Error, { id: string }, Folder[]>({
    mutationKey: DEL_FOLDER,
    onMutate: (v) => {
      const prevF = queryClient.getQueryData<Folder[]>(FOLDERS) ?? [];
      queryClient.setQueryData<Folder[]>(FOLDERS, prevF.filter((f) => f.id !== v.id));
      const prevFiles = queryClient.getQueryData<FileRow[]>(FILES) ?? [];
      queryClient.setQueryData<FileRow[]>(FILES, prevFiles.map((f) => (f.folder_id === v.id ? { ...f, folder_id: null } : f)));
      return prevF;
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(FOLDERS, ctx); },
    onSettled: settle,
  });
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

  const renamePrompt = (f: FileRow) =>
    void ask('Rename file', { initial: f.name, placeholder: 'File name' })
      .then((n) => { if (n && n !== f.name) { rename.mutate({ id: f.id, name: n }); toast('File renamed'); } });

  const removeFile = (f: FileRow) => {
    del.mutate({ id: f.id });
    toast(`Deleted \u201C${f.name}\u201D`, () => restore.mutate({ id: f.id, row: f }));
  };

  const tool: React.CSSProperties = {
    width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
  };

  return (
    <div style={{ padding: phone ? '14px 14px 24px' : '20px 24px 28px', maxWidth: 1240, marginInline: 'auto' }}>
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
          {/* Same order as Projects: the folder exists first, the name is a
              correction. Dismissing the rename leaves you an "Untitled folder"
              rather than nothing at all. */}
          <button onClick={() => {
            const id = crypto.randomUUID();
            newFolder.mutate({ id, name: 'Untitled folder', parent_id: folder });
            void ask('Name the folder', { initial: 'Untitled folder', placeholder: 'Folder name', confirmLabel: 'Rename' })
              .then((n) => { if (n && n !== 'Untitled folder') renameFolder.mutate({ id, name: n }); });
          }}
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
              <div key={f.id} className="tt" style={{ ...folderTile, position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <Icon name="proj" size={16} color={PAL.amber} />
                  {/* The vertical dots used to be decoration. Now they are the
                      two things you would have wanted them to be. */}
                  <span style={{ marginLeft: 'auto' }}>
                    <RowActions label={f.name}
                      onEdit={() => void ask('Rename folder', { initial: f.name, placeholder: 'Folder name' })
                        .then((n) => { if (n && n !== f.name) { renameFolder.mutate({ id: f.id, name: n }); toast('Folder renamed'); } })}
                      onDelete={() => {
                        const n = files.filter((x) => x.folder_id === f.id).length;
                        delFolder.mutate({ id: f.id });
                        if (folder === f.id) setFolder(null);
                        toast(n ? `Deleted \u201C${f.name}\u201D \u00B7 ${n} file${n === 1 ? '' : 's'} moved to Drive` : `Deleted \u201C${f.name}\u201D`);
                      }} />
                  </span>
                </div>
                <button onClick={() => setFolder(f.id)} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 11 }}>{f.name}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                    {files.filter((x) => x.folder_id === f.id).length} items
                  </div>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ ...KICKER, marginBottom: 10 }}>Files{busy ? ' · uploading…' : ''}</div>

      {filesPending && <FolderGridSkeleton phone={phone} count={6} label="Loading your files" />}

      {filesPending ? null : grid ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          {/* Grid used to be the read-only view: renaming or deleting meant
              switching to the list first. Same handles in both. */}
          {shown.map((f) => (
            <div key={f.id} className="tt" style={folderTile}>
              <button onClick={() => open(f)} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
                <div style={{
                  height: 62, borderRadius: 10, marginBottom: 10,
                  background: `linear-gradient(140deg, color-mix(in srgb, ${KIND[f.kind]?.c ?? PAL.cyan} 38%, var(--card2)), var(--card2))`,
                  display: 'grid', placeItems: 'center',
                }}>
                  <Icon name={KIND[f.kind]?.ic ?? 'files'} size={18} color={KIND[f.kind]?.c ?? PAL.cyan} />
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>{human(f.size_bytes)}</span>
                <span style={{ marginLeft: 'auto' }}>
                  <RowActions label={f.name} onEdit={() => renamePrompt(f)} onDelete={() => removeFile(f)} />
                </span>
              </div>
            </div>
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
              <RowActions label={f.name} onEdit={() => renamePrompt(f)} onDelete={() => removeFile(f)} />
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
