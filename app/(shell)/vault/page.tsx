'use client';
/**
 * T5 Vault: one shelf for what you keep. Paste a link or drop a file into the bar (V.add),
 * narrow the shelf with the chips and search (V.filter), and open, pin or remove from each card (V.shelf).
 * Links are the saved links in lib/links.ts; files live in sorro_files and the private sorro-files bucket.
 */
import { useRef, useState } from 'react';
import { Fox } from '@/components/Fox';
import { Icon, type IconName } from '@/components/Icon';
import { useLinks, useLinkActions, safeUrl, type LinkItem } from '@/lib/links';
import { useFiles, useFileActions, VAULT_MAX_BYTES, type VaultFile } from '@/lib/vault';
import { vaultItems, type VaultFilter, type VaultItem } from '@/lib/vaultLogic';
import { signedUrl, useSignedUrl } from '@/lib/uploads';
import { ago } from '@/lib/notify';
import { toast } from '@/lib/toast';
import './vault.css';

const FILTERS: { id: VaultFilter; name: string }[] = [{ id: 'all', name: 'All' }, { id: 'links', name: 'Links' }, { id: 'images', name: 'Images' }, { id: 'docs', name: 'Documents' }, { id: 'other', name: 'Other' }];
const FILE_ICON: Record<string, IconName> = { img: 'image', doc: 'docPage', vid: 'play', audio: 'play', zip: 'archive', other: 'files' };
const LINK_COLOR = '#7a7a74';

function Thumb({ file }: { file: VaultFile }) {
  const url = useSignedUrl('sorro-files', file.kind === 'img' ? file.storage_path : null);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt="" loading="lazy" /> : <Icon name={FILE_ICON[file.kind] ?? 'files'} size={26} />;
}

function Card({ item, onOpen, onKeep, onRemove }: { item: VaultItem; onOpen(): void; onKeep(): void; onRemove(): void }) {
  const isLink = item.type === 'link';
  const face = <>
    <span className="vt-face" data-type={item.type}>{isLink ? <span className="vt-letter" aria-hidden="true">{item.sub.charAt(0).toUpperCase()}</span> : <Thumb file={item.file} />}</span>
    <span className="vt-text"><strong>{item.title}</strong><small>{item.sub} · {ago(item.at)}</small>{isLink && item.link.note && <em>{item.link.note}</em>}</span>
  </>;
  return <li className="vt-card" data-kept={item.kept}>
    {isLink ? <a className="vt-open" href={item.link.url} target="_blank" rel="noopener noreferrer">{face}</a> : <button type="button" className="vt-open" onClick={onOpen}>{face}</button>}
    <div className="vt-tools">
      <button type="button" aria-pressed={item.kept} aria-label={`${item.kept ? 'Unpin' : 'Pin'} ${item.title}`} title={item.kept ? 'Unpin' : 'Pin to the top'} onClick={onKeep}><Icon name={item.kept ? 'star' : 'pin'} size={14} /></button>
      <button type="button" aria-label={`Remove ${item.title}`} title="Remove" onClick={onRemove}><Icon name="trash" size={14} /></button>
    </div>
  </li>;
}

export default function VaultPage() {
  const links = useLinks();
  const files = useFiles();
  const L = useLinkActions();
  const F = useFileActions();
  const [filter, setFilter] = useState<VaultFilter>('all');
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const all = vaultItems(links.data ?? [], files.data ?? [], 'all', '');
  const shown = vaultItems(links.data ?? [], files.data ?? [], filter, q);

  const addLink = (raw: string) => {
    const url = safeUrl(raw);
    if (!url) { toast('That does not look like a web address.', undefined, { tone: 'danger' }); return false; }
    if ((links.data ?? []).some(l => l.url === url)) { toast('That link is already in your Vault.'); return true; }
    L.add.mutate({ id: crypto.randomUUID(), url, label: '', note: '', category: '', position: Math.min(0, ...(links.data ?? []).map(l => l.position)) - 1, color: LINK_COLOR });
    toast('Link saved');
    return true;
  };
  const addFiles = async (list: File[]) => {
    for (const file of list) {
      setBusy(n => n + 1);
      try { await F.upload.mutateAsync(file); toast(`Saved ${file.name}`); }
      catch (e) { toast(`${file.name}: ${(e as Error).message || 'could not be saved'}`, undefined, { tone: 'danger' }); }
      finally { setBusy(n => n - 1); }
    }
  };
  const openFile = async (f: VaultFile) => {
    // The tab opens inside the tap, so the browser does not block it; the signed address follows.
    const tab = window.open('', '_blank');
    const url = await signedUrl('sorro-files', f.storage_path);
    if (!url) { tab?.close(); toast('Couldn’t open that file. Try again.', undefined, { tone: 'danger' }); return; }
    if (tab) { tab.opener = null; tab.location.href = url; return; }
    // No new tab (the phone and Windows apps): hand the address to the system as a link.
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.click();
  };
  const keep = (i: VaultItem) => i.type === 'link' ? L.save.mutate({ id: i.id, link: { ...i.link, pinned: !i.kept } }) : F.star.mutate({ id: i.id, starred: !i.kept });
  const remove = (i: VaultItem) => {
    if (i.type === 'link') { const link: LinkItem = i.link; L.del.mutate({ id: i.id }); toast('Link removed', () => L.restore.mutate({ id: i.id, link })); }
    else { F.remove.mutate({ id: i.id }); toast(`Removed ${i.title}`, () => F.restore.mutate({ id: i.id })); }
  };

  const pending = links.isPending || files.isPending;
  const failed = links.isError || files.isError;
  return <div className="vt" data-part="V" data-over={over}
    onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
    onDrop={e => { if (!e.dataTransfer.files.length) return; e.preventDefault(); setOver(false); void addFiles([...e.dataTransfer.files]); }}>
    <h1 className="sr-only">Vault</h1>
    <form className="vt-add" data-part="V.add" onSubmit={e => { e.preventDefault(); if (draft.trim() && addLink(draft)) setDraft(''); }}>
      <Icon name="link" size={16} />
      <input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Paste a link to keep it" aria-label="Paste a link to keep it" inputMode="url" autoCapitalize="none" />
      {draft.trim() && <button className="sx-pill">Save link</button>}
      <button type="button" className="vt-upload" onClick={() => picker.current?.click()} disabled={busy > 0}><Icon name="upload" size={15} />{busy > 0 ? 'Uploading' : 'Upload'}</button>
      <input ref={picker} type="file" multiple hidden accept="image/*,video/*,application/pdf" onChange={e => { const list = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(list); }} />
    </form>
    <p className="vt-hint">Drop photos, clips or PDFs anywhere on this page, up to {VAULT_MAX_BYTES / 1024 / 1024} MB each. Only you can see them.</p>

    {all.length > 0 && <div className="vt-filter" data-part="V.filter">
      <div className="vt-chips" role="tablist" aria-label="Show">{FILTERS.map(f => <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}>{f.name}</button>)}</div>
      <label className="vt-search"><Icon name="search" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search the Vault" aria-label="Search the Vault" /></label>
    </div>}

    {pending ? <div className="wg-skel" aria-label="Loading"><span /><span /></div>
      : failed ? <p className="vt-none">Couldn’t load your Vault. <button type="button" onClick={() => { void links.refetch(); void files.refetch(); }}>Try again</button></p>
      : !all.length ? <div className="sx-empty"><Fox pose="sit" size={56} tone="muted" /><p>Nothing kept yet. Paste a link above, or drop a file here.</p></div>
      : !shown.length ? <p className="vt-none">Nothing matches. <button type="button" onClick={() => { setFilter('all'); setQ(''); }}>Show everything</button></p>
      : <ul className="vt-shelf" data-part="V.shelf">{shown.map(i => <Card key={i.type + i.id} item={i} onOpen={() => { if (i.type === 'file') void openFile(i.file); }} onKeep={() => keep(i)} onRemove={() => remove(i)} />)}</ul>}
    {over && <div className="vt-drop" aria-hidden="true"><Icon name="upload" size={22} />Drop to keep it in the Vault</div>}
  </div>;
}
