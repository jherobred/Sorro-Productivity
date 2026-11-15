'use client';
/**
 * T5 Vault: one shelf for what you keep, in folders. Paste a link or drop a file into the bar (V.add);
 * it lands in the folder you are in. The bar under it (V.bar) has the folder trail, a new folder, sort,
 * grid or list, and select. Folders (V.folders) open on a tap and take items dropped on them.
 * Narrow the shelf with the chips and search (V.filter); open, pin, edit, move or remove from each card (V.shelf),
 * or select several and act on them at once (V.select). Editing a card opens V.edit.
 * Links are the saved links in lib/links.ts; files and folders live in lib/vault.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Fox } from '@/components/Fox';
import { Icon, type IconName } from '@/components/Icon';
import { ContextMenu, type CtxItem } from '@/components/ContextMenu';
import { useLinks, useLinkActions, safeUrl, type LinkItem } from '@/lib/links';
import { useFiles, useFileActions, useFolders, useFolderActions, VAULT_MAX_BYTES, type VaultFile, type VaultFolder } from '@/lib/vault';
import { childFolders, folderCounts, folderPath, folderTree, freshFolderName, renameFile, vaultItems, type VaultFilter, type VaultItem, type VaultSort } from '@/lib/vaultLogic';
import { signedUrl, useSignedUrl } from '@/lib/uploads';
import { supabase } from '@/lib/supabase';
import { useOverlayBack } from '@/lib/nav';
import { ago } from '@/lib/notify';
import { toast } from '@/lib/toast';
import './vault.css';

const FILTERS: { id: VaultFilter; name: string }[] = [{ id: 'all', name: 'All' }, { id: 'links', name: 'Links' }, { id: 'images', name: 'Images' }, { id: 'docs', name: 'Documents' }, { id: 'other', name: 'Other' }];
const SORTS: { id: VaultSort; name: string }[] = [{ id: 'new', name: 'Newest' }, { id: 'old', name: 'Oldest' }, { id: 'name', name: 'Name' }, { id: 'type', name: 'Type' }, { id: 'size', name: 'Size' }];
const FILE_ICON: Record<string, IconName> = { img: 'image', doc: 'docPage', vid: 'play', audio: 'play', zip: 'archive', other: 'files' };
const LINK_COLOR = '#7a7a74';
const DRAG = 'application/x-sorro-vault';
const keyOf = (i: VaultItem) => `${i.type}:${i.id}`;

/** A choice the Vault remembers on this device: the sort and the grid or list. */
function useLocal<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => { const v = localStorage.getItem(key) as T | null; if (v && allowed.includes(v)) setValue(v); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, (v: T) => { setValue(v); try { localStorage.setItem(key, v); } catch { /* private mode */ } }];
}

function Thumb({ file }: { file: VaultFile }) {
  const url = useSignedUrl('sorro-files', file.kind === 'img' ? file.storage_path : null);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" loading="lazy" /> : <Icon name={FILE_ICON[file.kind] ?? 'files'} size={26} />;
}

type CardProps = {
  item: VaultItem; where: string | null; selecting: boolean; selected: boolean;
  onOpen(): void; onKeep(): void; onEdit(): void; onMenu(x: number, y: number): void; onToggle(): void; onDrag(e: React.DragEvent): void;
};
function Card({ item, where, selecting, selected, onOpen, onKeep, onEdit, onMenu, onToggle, onDrag }: CardProps) {
  const isLink = item.type === 'link';
  const face = <>
    <span className="vt-face" data-type={item.type}>{isLink ? <span className="vt-letter" aria-hidden="true">{item.sub.charAt(0).toUpperCase()}</span> : <Thumb file={item.file} />}</span>
    <span className="vt-text"><strong>{item.title}</strong><small>{where ? <><Icon name="folder" size={11} /> {where} · </> : null}{item.sub} · {ago(item.at)}</small>{isLink && item.link.note && <em>{item.link.note}</em>}</span>
  </>;
  return <li className="vt-card" data-kept={item.kept} data-selected={selected} draggable={!selecting} onDragStart={onDrag}
    onContextMenu={e => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}>
    {selecting ? <button type="button" className="vt-open" aria-pressed={selected} onClick={onToggle}>{face}</button>
      : isLink ? <a className="vt-open" href={item.link.url} target="_blank" rel="noopener noreferrer">{face}</a>
      : <button type="button" className="vt-open" onClick={onOpen}>{face}</button>}
    {selecting ? <span className="vt-check" aria-hidden="true">{selected && <Icon name="check" size={14} />}</span>
      : <div className="vt-tools">
        <button type="button" aria-pressed={item.kept} aria-label={`${item.kept ? 'Unpin' : 'Pin'} ${item.title}`} title={item.kept ? 'Unpin' : 'Pin to the top'} onClick={onKeep}><Icon name={item.kept ? 'star' : 'pin'} size={14} /></button>
        <button type="button" aria-label={`Edit ${item.title}`} title="Edit" onClick={onEdit}><Icon name="edit" size={14} /></button>
        <button type="button" aria-label={`More for ${item.title}`} title="More" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onMenu(r.left, r.bottom + 4); }}><Icon name="moreVert" size={14} /></button>
      </div>}
  </li>;
}

/** Folder choices for a select: the top, then every folder by its trail. `skip` leaves out a folder and what is under it. */
function folderOptions(folders: VaultFolder[], skip?: Set<string>) {
  return [{ id: '', name: 'Top of the Vault' }, ...folders.filter(f => !skip?.has(f.id)).map(f => ({ id: f.id, name: folderPath(folders, f.id).map(p => p.name).join(' / ') }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))];
}

type Draft = { kind: 'item'; item: VaultItem } | { kind: 'folder'; folder: VaultFolder | null; parent: string | null };
function EditSheet({ draft, folders, onClose, onSaveItem, onSaveFolder, onRemove, onOpen }: {
  draft: Draft; folders: VaultFolder[]; onClose(): void;
  onSaveItem(item: VaultItem, v: { name: string; url: string; note: string; folder: string; kept: boolean }): boolean;
  onSaveFolder(folder: VaultFolder | null, v: { name: string; folder: string }): void;
  onRemove(): void; onOpen(): void;
}) {
  useOverlayBack(true, onClose);
  const item = draft.kind === 'item' ? draft.item : null;
  const link = item?.type === 'link' ? item.link : null;
  const folder = draft.kind === 'folder' ? draft.folder : null;
  const [name, setName] = useState(item ? (link ? link.label : item.title) : folder?.name ?? freshFolderName(folders, draft.kind === 'folder' ? draft.parent : null));
  const [url, setUrl] = useState(link?.url ?? '');
  const [note, setNote] = useState(link?.note ?? '');
  const [place, setPlace] = useState(item ? item.folder ?? '' : (folder ? folder.parent_id : draft.kind === 'folder' ? draft.parent : null) ?? '');
  const [kept, setKept] = useState(item?.kept ?? false);
  const title = item ? `Edit ${link ? 'link' : 'file'}` : folder ? 'Edit folder' : 'New folder';
  const options = folderOptions(folders, folder ? folderTree(folders, folder.id) : undefined);
  return <div className="vt-sheet-back" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form className="vt-sheet" data-part="V.edit" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
      onSubmit={e => {
        e.preventDefault();
        if (item) { if (onSaveItem(item, { name, url, note, folder: place, kept })) onClose(); }
        else { onSaveFolder(folder, { name, folder: place }); onClose(); }
      }}>
      <header><strong>{title}</strong><button type="button" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button></header>
      <label><span>Name</span><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={link ? 'Leave blank to use the site' : 'Name'} maxLength={200} /></label>
      {link && <label><span>Address</span><input value={url} onChange={e => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" required /></label>}
      {link && <label><span>Note</span><textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Why you kept it, a login hint, anything" maxLength={1000} /></label>}
      <label><span>Folder</span><select value={place} onChange={e => setPlace(e.target.value)}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      {item && <label className="vt-sheet-check"><input type="checkbox" checked={kept} onChange={e => setKept(e.target.checked)} /><span>Pin to the top</span></label>}
      <footer>
        {item && <button type="button" className="vt-ghost" onClick={() => { onOpen(); }}><Icon name={link ? 'link' : 'eye'} size={14} />Open</button>}
        {(item || folder) && <button type="button" className="vt-ghost vt-danger" onClick={() => { onRemove(); onClose(); }}><Icon name="trash" size={14} />{folder ? 'Delete folder' : 'Remove'}</button>}
        <span className="vt-grow" />
        <button type="button" className="vt-ghost" onClick={onClose}>Cancel</button>
        <button className="sx-pill">{item || folder ? 'Save' : 'Create'}</button>
      </footer>
    </form>
  </div>;
}

export default function VaultPage() {
  const links = useLinks();
  const files = useFiles();
  const folders = useFolders();
  const L = useLinkActions();
  const F = useFileActions();
  const D = useFolderActions();
  const [place, setPlace] = useState<string | null>(null);
  const [filter, setFilter] = useState<VaultFilter>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useLocal<VaultSort>('sorro.vault.sort', 'new', SORTS.map(s => s.id));
  const [view, setView] = useLocal<'grid' | 'list'>('sorro.vault.view', 'grid', ['grid', 'list']);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxItem[] } | null>(null);
  const [draft, setDraftSheet] = useState<Draft | null>(null);
  const [text, setText] = useState('');
  const [over, setOver] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  useOverlayBack(selecting, () => { setSelecting(false); setPicked(new Set()); });

  const allFolders = useMemo(() => folders.data ?? [], [folders.data]);
  // A folder deleted on another device sends this one back to the top.
  const here = place && allFolders.some(f => f.id === place) ? place : null;
  const searching = q.trim().length > 0;
  const everything = vaultItems(links.data ?? [], files.data ?? [], 'all', '');
  const shown = vaultItems(links.data ?? [], files.data ?? [], filter, q, searching ? undefined : here, sort);
  const subfolders = searching ? [] : childFolders(allFolders, here);
  const counts = useMemo(() => folderCounts(allFolders, everything), [allFolders, everything]);
  const trail = folderPath(allFolders, here);
  const nameOf = (id: string | null) => id ? allFolders.find(f => f.id === id)?.name ?? '' : '';
  const pickedItems = everything.filter(i => picked.has(keyOf(i)));

  const addLink = (raw: string) => {
    const url = safeUrl(raw);
    if (!url) { toast('That does not look like a web address.', undefined, { tone: 'danger' }); return false; }
    const known = (links.data ?? []).find(l => l.url === url);
    if (known) { toast(`That link is already in your Vault${known.folder ? ` in ${nameOf(known.folder)}` : ''}.`); return true; }
    L.add.mutate({ id: crypto.randomUUID(), url, label: '', note: '', category: '', folder: here ?? '', position: Math.min(0, ...(links.data ?? []).map(l => l.position)) - 1, color: LINK_COLOR });
    toast(here ? `Link saved to ${nameOf(here)}` : 'Link saved');
    return true;
  };
  const addFiles = async (list: File[]) => {
    const folder_id = here;
    for (const file of list) {
      setBusy(n => n + 1);
      try { await F.upload.mutateAsync({ file, folder_id }); toast(`Saved ${file.name}`); }
      catch (e) { toast(`${file.name}: ${(e as Error).message || 'could not be saved'}`, undefined, { tone: 'danger' }); }
      finally { setBusy(n => n - 1); }
    }
  };
  const openFile = async (f: VaultFile, download = false) => {
    // The tab opens inside the tap, so the browser does not block it; the signed address follows.
    const tab = download ? null : window.open('', '_blank');
    const url = download
      ? (await supabase.storage.from('sorro-files').createSignedUrl(f.storage_path, 120, { download: f.name })).data?.signedUrl ?? null
      : await signedUrl('sorro-files', f.storage_path);
    if (!url) { tab?.close(); toast('Couldn’t open that file. Try again.', undefined, { tone: 'danger' }); return; }
    if (tab) { tab.opener = null; tab.location.href = url; return; }
    // No new tab (the phone and Windows apps), or a download: hand the address to the system as a link.
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click();
  };
  const openItem = (i: VaultItem) => {
    if (i.type === 'file') { void openFile(i.file); return; }
    const a = document.createElement('a'); a.href = i.link.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.click();
  };
  const setKept = (i: VaultItem, kept: boolean) => i.type === 'link' ? L.save.mutate({ id: i.id, link: { ...i.link, pinned: kept } }) : F.star.mutate({ id: i.id, starred: kept });
  const moveItem = (i: VaultItem, folder: string | null) => {
    if ((i.folder ?? null) === folder) return;
    if (i.type === 'link') L.save.mutate({ id: i.id, link: { ...i.link, folder: folder ?? '' } });
    else F.move.mutate({ id: i.id, folder_id: folder });
  };
  const move = (list: VaultItem[], folder: string | null) => {
    const moving = list.filter(i => (i.folder ?? null) !== folder);
    if (!moving.length) return;
    const back = moving.map(i => [i, i.folder ?? null] as const);
    moving.forEach(i => moveItem(i, folder));
    toast(`Moved ${moving.length === 1 ? moving[0].title : `${moving.length} items`} to ${folder ? nameOf(folder) : 'the top of the Vault'}`, () => back.forEach(([i, f]) => moveItem({ ...i, folder } as VaultItem, f)));
  };
  const remove = (list: VaultItem[]) => {
    list.forEach(i => i.type === 'link' ? L.del.mutate({ id: i.id }) : F.remove.mutate({ id: i.id }));
    toast(list.length === 1 ? `Removed ${list[0].title}` : `Removed ${list.length} items`, () => list.forEach(i => {
      if (i.type === 'link') { const link: LinkItem = i.link; L.restore.mutate({ id: i.id, link }); }
      else F.restore.mutate({ id: i.id, file: i.file });
    }));
  };
  const copy = (textToCopy: string) => { void navigator.clipboard?.writeText(textToCopy).then(() => toast('Copied'), () => toast('Couldn’t copy that.', undefined, { tone: 'danger' })); };

  const moveMenu = (list: VaultItem[]): CtxItem[] => folderOptions(allFolders).map(o => ({
    label: o.name, icon: o.id ? 'folder' : 'home', disabled: list.every(i => (i.folder ?? '') === o.id), run: () => move(list, o.id || null),
  }));
  const itemMenu = (i: VaultItem, x: number, y: number) => setMenu({
    x, y, label: i.title, items: [
      { label: 'Open', icon: i.type === 'link' ? 'link' : 'eye', run: () => openItem(i) },
      { label: 'Edit', icon: 'edit', run: () => setDraftSheet({ kind: 'item', item: i }) },
      i.type === 'link' ? { label: 'Copy address', icon: 'copy', run: () => copy(i.link.url) } : { label: 'Download', icon: 'download', run: () => void openFile(i.file, true) },
      { label: 'Move to', icon: 'folder', items: moveMenu([i]) },
      { label: i.kept ? 'Unpin' : 'Pin to the top', icon: 'pin', run: () => setKept(i, !i.kept) },
      { label: 'Select', icon: 'check', run: () => { setSelecting(true); setPicked(new Set([keyOf(i)])); } },
      { label: 'Remove', icon: 'trash', danger: true, run: () => remove([i]) },
    ],
  });

  const saveItem = (i: VaultItem, v: { name: string; url: string; note: string; folder: string; kept: boolean }) => {
    const folder = v.folder || null;
    if (i.type === 'link') {
      const url = safeUrl(v.url);
      if (!url) { toast('That does not look like a web address.', undefined, { tone: 'danger' }); return false; }
      L.save.mutate({ id: i.id, link: { ...i.link, url, label: v.name.trim().slice(0, 200), note: v.note.trim().slice(0, 1000), folder: v.folder, pinned: v.kept } });
    } else {
      const name = renameFile(i.file.name, v.name);
      if (name !== i.file.name) F.rename.mutate({ id: i.id, name });
      if (folder !== (i.folder ?? null)) F.move.mutate({ id: i.id, folder_id: folder });
      if (v.kept !== i.kept) F.star.mutate({ id: i.id, starred: v.kept });
    }
    toast('Saved');
    return true;
  };
  const saveFolder = (folder: VaultFolder | null, v: { name: string; folder: string }) => {
    const parent_id = v.folder || null;
    if (!folder) {
      const name = freshFolderName(allFolders, parent_id, v.name);
      D.add.mutate({ id: crypto.randomUUID(), name, parent_id, position: 0 });
      toast(`Made ${name}`);
      return;
    }
    const name = v.name.trim().slice(0, 80) || folder.name;
    D.save.mutate({ id: folder.id, ...(name !== folder.name && { name: freshFolderName(allFolders.filter(f => f.id !== folder.id), parent_id, name) }), ...(parent_id !== folder.parent_id && { parent_id }) });
  };
  const deleteFolder = (f: VaultFolder) => {
    const inside = everything.filter(i => i.folder === f.id);
    const kids = allFolders.filter(k => k.parent_id === f.id);
    inside.filter(i => i.type === 'link').forEach(i => moveItem(i, f.parent_id));
    D.del.mutate({ id: f.id, parent_id: f.parent_id });
    if (here === f.id) setPlace(f.parent_id);
    toast(`Deleted ${f.name}${inside.length + kids.length ? '. What was in it moved up a level.' : ''}`, () => {
      D.add.mutate(f);
      kids.forEach(k => D.save.mutate({ id: k.id, parent_id: f.id }));
      inside.forEach(i => moveItem({ ...i, folder: f.parent_id } as VaultItem, f.id));
    });
  };
  const folderMenu = (f: VaultFolder, x: number, y: number) => setMenu({
    x, y, label: f.name, items: [
      { label: 'Open', icon: 'folder', run: () => setPlace(f.id) },
      { label: 'Rename or move', icon: 'edit', run: () => setDraftSheet({ kind: 'folder', folder: f, parent: f.parent_id }) },
      { label: 'New folder inside', icon: 'folderPlus', run: () => setDraftSheet({ kind: 'folder', folder: null, parent: f.id }) },
      { label: 'Delete folder', icon: 'trash', danger: true, hint: 'What is inside moves up a level', run: () => deleteFolder(f) },
    ],
  });

  // Dragging a card carries it, or everything selected when the card is one of them.
  const dragItems = (e: React.DragEvent, i: VaultItem) => {
    const keys = picked.has(keyOf(i)) ? [...picked] : [keyOf(i)];
    e.dataTransfer.setData(DRAG, JSON.stringify(keys));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropTarget = (folder: string | null) => ({
    'data-drop': target === (folder ?? '') ? 'true' : undefined,
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); e.stopPropagation(); setTarget(folder ?? ''); } },
    onDragLeave: () => setTarget(null),
    onDrop: (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(DRAG);
      if (!raw) return;
      e.preventDefault(); e.stopPropagation(); setTarget(null);
      const keys = new Set(JSON.parse(raw) as string[]);
      move(everything.filter(i => keys.has(keyOf(i))), folder);
      setPicked(new Set()); setSelecting(false);
    },
  });

  const toggle = (i: VaultItem) => setPicked(p => { const n = new Set(p); if (n.has(keyOf(i))) n.delete(keyOf(i)); else n.add(keyOf(i)); return n; });
  const endSelect = () => { setSelecting(false); setPicked(new Set()); };

  const pending = links.isPending || files.isPending;
  const failed = links.isError || files.isError;
  const emptyHere = !shown.length && !subfolders.length;
  return <div className="vt" data-part="V" data-over={over} data-view={view}
    onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
    onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}>
    <h1 className="sr-only">Vault</h1>
    <form className="vt-add" data-part="V.add" onSubmit={e => { e.preventDefault(); if (text.trim() && addLink(text)) setText(''); }}>
      <Icon name="link" size={16} />
      <input value={text} onChange={e => setText(e.target.value)} placeholder={here ? `Paste a link to keep it in ${nameOf(here)}` : 'Paste a link to keep it'} aria-label="Paste a link to keep it" inputMode="url" autoCapitalize="none" />
      {text.trim() && <button className="sx-pill">Save link</button>}
      <button type="button" className="vt-upload" onClick={() => picker.current?.click()} disabled={busy > 0}><Icon name="upload" size={15} />{busy > 0 ? 'Uploading' : 'Upload'}</button>
      <input ref={picker} type="file" multiple hidden accept="image/*,video/*,application/pdf" onChange={e => { const list = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(list); }} />
    </form>

    <div className="vt-bar" data-part="V.bar">
      <nav className="vt-trail" aria-label="Folder">
        <button type="button" aria-current={!here && !searching ? 'page' : undefined} onClick={() => { setPlace(null); setQ(''); }} {...dropTarget(null)}><Icon name="files" size={14} />Vault</button>
        {!searching && trail.map(f => <span key={f.id} className="vt-crumb"><Icon name="chevR" size={12} /><button type="button" aria-current={f.id === here ? 'page' : undefined} onClick={() => setPlace(f.id)} onContextMenu={e => { e.preventDefault(); folderMenu(f, e.clientX, e.clientY); }} {...dropTarget(f.id)}>{f.name}</button></span>)}
        {searching && <span className="vt-crumb"><Icon name="chevR" size={12} /><span>Results everywhere</span></span>}
      </nav>
      <div className="vt-acts">
        <button type="button" className="vt-ghost" onClick={() => setDraftSheet({ kind: 'folder', folder: null, parent: here })} title="New folder"><Icon name="folderPlus" size={15} /><span>Folder</span></button>
        <label className="vt-sort" title="Sort"><Icon name="sort" size={14} /><select value={sort} onChange={e => setSort(e.target.value as VaultSort)} aria-label="Sort by">{SORTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="vt-views" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'grid'} aria-label="Grid" title="Grid" onClick={() => setView('grid')}><Icon name="grid" size={14} /></button>
          <button type="button" aria-pressed={view === 'list'} aria-label="List" title="List" onClick={() => setView('list')}><Icon name="list" size={14} /></button>
        </div>
        <button type="button" className="vt-ghost" aria-pressed={selecting} onClick={() => selecting ? endSelect() : setSelecting(true)}><Icon name="check" size={15} /><span>{selecting ? 'Done' : 'Select'}</span></button>
      </div>
    </div>

    {everything.length + allFolders.length > 0 && <div className="vt-filter" data-part="V.filter">
      <div className="vt-chips" role="tablist" aria-label="Show">{FILTERS.map(f => <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.name}</button>)}</div>
      <label className="vt-search"><Icon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search every folder" aria-label="Search the Vault" />{q && <button type="button" aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={12} /></button>}</label>
    </div>}

    {subfolders.length > 0 && <ul className="vt-folders" data-part="V.folders" aria-label="Folders">
      {subfolders.map(f => <li key={f.id} className="vt-folder" {...dropTarget(f.id)} onContextMenu={e => { e.preventDefault(); folderMenu(f, e.clientX, e.clientY); }}>
        <button type="button" className="vt-folder-open" onClick={() => setPlace(f.id)}><Icon name="folder" size={18} /><span><strong>{f.name}</strong><small>{counts.get(f.id) ?? 0} {(counts.get(f.id) ?? 0) === 1 ? 'item' : 'items'}</small></span></button>
        <button type="button" className="vt-folder-more" aria-label={`More for ${f.name}`} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); folderMenu(f, r.left, r.bottom + 4); }}><Icon name="moreVert" size={14} /></button>
      </li>)}
    </ul>}

    {pending ? <div className="wg-skel" aria-label="Loading"><span /><span /></div>
      : failed ? <p className="vt-none">Couldn’t load your Vault. <button type="button" onClick={() => { void links.refetch(); void files.refetch(); void folders.refetch(); }}>Try again</button></p>
      : !everything.length && !allFolders.length ? <div className="sx-empty"><Fox pose="sit" size={56} tone="muted" /><p>Nothing kept yet. Paste a link above, drop a file here, or make a folder.</p></div>
      : emptyHere ? (searching || filter !== 'all'
        ? <p className="vt-none">Nothing matches. <button type="button" onClick={() => { setFilter('all'); setQ(''); }}>Show everything</button></p>
        : <p className="vt-none">This folder is empty. Paste a link, upload, or drag items onto it.</p>)
      : shown.length > 0 && <ul className="vt-shelf" data-part="V.shelf" data-view={view}>{shown.map(i => <Card key={keyOf(i)} item={i}
          where={searching && i.folder ? nameOf(i.folder) : null} selecting={selecting} selected={picked.has(keyOf(i))}
          onOpen={() => openItem(i)} onKeep={() => setKept(i, !i.kept)} onEdit={() => setDraftSheet({ kind: 'item', item: i })}
          onMenu={(x, y) => itemMenu(i, x, y)} onToggle={() => toggle(i)} onDrag={e => dragItems(e, i)} />)}</ul>}

    <p className="vt-hint">Drop photos, clips or PDFs anywhere on this page, up to {VAULT_MAX_BYTES / 1024 / 1024} MB each{here ? `; they go into ${nameOf(here)}` : ''}. Drag a card onto a folder to move it. Only you can see them.</p>

    {selecting && <div className="vt-selbar" data-part="V.select" role="toolbar" aria-label="Selected items">
      <strong>{picked.size} selected</strong>
      <button type="button" className="vt-ghost" onClick={() => setPicked(picked.size === shown.length ? new Set() : new Set(shown.map(keyOf)))}>{picked.size === shown.length && shown.length ? 'None' : 'All'}</button>
      <span className="vt-grow" />
      <button type="button" className="vt-ghost" disabled={!picked.size} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.top - 8, label: 'Move to', items: moveMenu(pickedItems).map(m => ({ ...m, run: () => { m.run?.(); endSelect(); } })) }); }}><Icon name="folder" size={14} />Move</button>
      <button type="button" className="vt-ghost" disabled={!picked.size} onClick={() => { const pin = !pickedItems.every(i => i.kept); pickedItems.forEach(i => setKept(i, pin)); endSelect(); }}><Icon name="pin" size={14} />{pickedItems.length && pickedItems.every(i => i.kept) ? 'Unpin' : 'Pin'}</button>
      <button type="button" className="vt-ghost vt-danger" disabled={!picked.size} onClick={() => { remove(pickedItems); endSelect(); }}><Icon name="trash" size={14} />Remove</button>
      <button type="button" className="vt-ghost" aria-label="Stop selecting" onClick={endSelect}><Icon name="close" size={14} /></button>
    </div>}

    {menu && <ContextMenu x={menu.x} y={menu.y} kind="vault" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
    {draft && <EditSheet key={draft.kind === 'item' ? keyOf(draft.item) : draft.folder?.id ?? 'new'} draft={draft} folders={allFolders} onClose={() => setDraftSheet(null)}
      onSaveItem={saveItem} onSaveFolder={saveFolder}
      onRemove={() => { if (draft.kind === 'item') remove([draft.item]); else if (draft.folder) deleteFolder(draft.folder); }}
      onOpen={() => { if (draft.kind === 'item') openItem(draft.item); }} />}
    {over && <div className="vt-drop" aria-hidden="true"><Icon name="upload" size={22} />Drop to keep it in {here ? nameOf(here) : 'the Vault'}</div>}
  </div>;
}
