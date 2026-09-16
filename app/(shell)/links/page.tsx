'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/Icon';
import { ContextMenu, type CtxContent } from '@/components/ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { useOverlayBack } from '@/lib/nav';
import { ask } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { TAG_COLORS } from '@/lib/tagList';
import { findUrl, safeUrl, siteOf, useLinkActions, useLinks, type LinkItem } from '@/lib/links';
import { ago } from '@/lib/scratch';
import './links.css';

type Category = { name: string; color: string };
type Sort = 'recent' | 'az' | 'site' | 'mine';
/** Compact is a row per link; expanded opens the card out to show the whole thing. */
type View = 'compact' | 'expanded';

const NONE_COLOR = '#7a7a74';
const INTERNAL = 'application/x-basedly-link';
const SORT_KEY = 'bd_links_sort';
const VIEW_KEY = 'bd_links_view';
const SORTS: { id: Sort; label: string }[] = [
  { id: 'recent', label: 'Newest first' },
  { id: 'az', label: 'A to Z' },
  { id: 'site', label: 'By site' },
  { id: 'mine', label: 'Your order' },
];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews: a selected textarea still copies.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

const labelOf = (l: LinkItem) => l.label || siteOf(l.url).host;

export default function LinksPage() {
  const { prefs, update } = usePrefs();
  const { data: links = [], isPending } = useLinks();
  const A = useLinkActions();

  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSortState] = useState<Sort>(() => {
    try { return (localStorage.getItem(SORT_KEY) as Sort | null) ?? 'recent'; } catch { return 'recent'; }
  });
  const [view, setViewState] = useState<View>(() => {
    try { return (localStorage.getItem(VIEW_KEY) as View | null) ?? 'compact'; } catch { return 'compact'; }
  });
  const [editing, setEditing] = useState<LinkItem | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxContent } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLInputElement>(null);

  const setSort = (next: Sort) => { setSortState(next); try { localStorage.setItem(SORT_KEY, next); } catch { /* this visit only */ } };
  const setView = (next: View) => { setViewState(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* this visit only */ } };

  /* ---- categories: the kept order and colours, plus any a link names that this device has not heard of yet */
  const stored = prefs.linkCategories;
  const categories: Category[] = useMemo(() => {
    const out = [...(stored ?? [])];
    for (const l of links) {
      if (l.category && !out.some((c) => c.name.toLowerCase() === l.category.toLowerCase())) {
        out.push({ name: l.category, color: TAG_COLORS[out.length % TAG_COLORS.length].value });
      }
    }
    return out;
  }, [stored, links]);
  const colorOf = (name: string) => categories.find((c) => c.name === name)?.color ?? NONE_COLOR;
  const countOf = (name: string) => links.filter((l) => l.category === name).length;
  const loose = links.filter((l) => !l.category).length;
  const addCategory = (list: Category[], name: string): Category[] =>
    list.some((c) => c.name.toLowerCase() === name.toLowerCase()) ? list : [...list, { name, color: TAG_COLORS[list.length % TAG_COLORS.length].value }];

  /* ---- saving */
  const saveLink = (rawUrl: string, rawLabel: string, category: string) => {
    const clean = safeUrl(rawUrl) ?? findUrl(rawUrl);
    if (!clean) { toast('That is not a web link. Paste an address that starts with http, or a site like ust.edu.ph.'); urlRef.current?.focus(); return false; }
    const dupe = links.find((l) => l.url === clean);
    if (dupe) {
      toast(`Already saved as “${labelOf(dupe)}”`, () => setEditing(dupe), { action: 'Edit', icon: 'link' });
      return false;
    }
    const id = crypto.randomUUID();
    const name = rawLabel.trim() || siteOf(clean).host;
    if (category && !(stored ?? []).some((c) => c.name === category)) void update({ linkCategories: addCategory(categories, category) });
    A.add.mutate({ id, url: clean, label: name, note: '', category, position: Math.min(0, ...links.map((l) => l.position)) - 1, color: category ? colorOf(category) : NONE_COLOR });
    toast(`Saved “${name}”${category ? ` in ${category}` : ''}`, () => A.del.mutate({ id }), { tone: 'success', icon: 'link' });
    return true;
  };

  const submit = () => {
    if (saveLink(url, label, filter ?? '')) { setUrl(''); setLabel(''); urlRef.current?.focus(); }
  };

  /** A link from a drop or a paste lands in the bar with its label to write. */
  const take = (text: string) => {
    const found = findUrl(text);
    if (!found) { toast('Nothing in that looked like a link'); return; }
    setUrl(found);
    setLabel('');
    requestAnimationFrame(() => labelRef.current?.focus());
  };

  // Drop a link anywhere on the page, or paste one while nothing is being typed in.
  const takeRef = useRef(take);
  takeRef.current = take;
  useEffect(() => {
    let depth = 0;
    const external = (e: DragEvent) => {
      const types = Array.from(e.dataTransfer?.types ?? []);
      return !types.includes(INTERNAL) && (types.includes('text/uri-list') || types.includes('text/plain'));
    };
    const enter = (e: DragEvent) => { if (!external(e)) return; depth += 1; setDropping(true); };
    const over = (e: DragEvent) => { if (external(e)) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } };
    const leave = (e: DragEvent) => { if (!external(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDropping(false); };
    const drop = (e: DragEvent) => {
      if (!external(e)) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);
      takeRef.current(e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '');
    };
    const paste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (/input|textarea|select/i.test(el.tagName) || el.isContentEditable)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (findUrl(text)) { e.preventDefault(); takeRef.current(text); }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, []);

  /* ---- what is shown */
  const q = query.trim().toLowerCase();
  const matches = links.filter((l) => (filter === null || l.category === filter)
    && (!q || `${l.label} ${l.url} ${l.note} ${l.category}`.toLowerCase().includes(q)));
  const ordered = useMemo(() => [...matches].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === 'az') return labelOf(a).localeCompare(labelOf(b));
    if (sort === 'site') return siteOf(a.url).host.localeCompare(siteOf(b.url).host) || labelOf(a).localeCompare(labelOf(b));
    if (sort === 'mine') return a.position - b.position;
    return b.created_at.localeCompare(a.created_at);
  }), [matches, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = filter === null && !q
    ? [...categories.map((c) => ({ key: c.name, title: c.name, color: c.color, items: ordered.filter((l) => l.category === c.name) })),
      { key: '', title: 'No category', color: NONE_COLOR, items: ordered.filter((l) => !l.category) }].filter((s) => s.items.length)
    : [{ key: filter ?? 'results', title: q ? `${ordered.length} ${ordered.length === 1 ? 'match' : 'matches'}` : filter || 'No category', color: filter ? colorOf(filter) : NONE_COLOR, items: ordered }];

  /* ---- changing links */
  const put = (l: LinkItem, patch: Partial<LinkItem>) => {
    const next = { ...l, ...patch };
    A.save.mutate({ id: l.id, link: next, color: next.category ? colorOf(next.category) : NONE_COLOR });
  };
  const moveTo = (l: LinkItem, category: string) => {
    if (l.category === category) return;
    put(l, { category });
    toast(category ? `Moved to ${category}` : 'Category removed', () => put({ ...l, category }, { category: l.category }), { icon: 'link' });
  };
  const remove = (l: LinkItem) => {
    A.del.mutate({ id: l.id });
    toast(`Deleted “${labelOf(l)}”`, () => A.restore.mutate({ id: l.id, link: l }), { tone: 'danger' });
  };
  const copy = async (l: LinkItem) => {
    if (await copyText(l.url)) {
      setCopied(l.id);
      setTimeout(() => setCopied((c) => (c === l.id ? null : c)), 1600);
      toast(`Copied ${labelOf(l)}`, undefined, { icon: 'copy' });
    } else toast('Could not copy. Hold the link to copy it instead.');
  };
  const nudge = (l: LinkItem, list: LinkItem[], by: -1 | 1) => {
    const mine = [...list].sort((a, b) => a.position - b.position);
    const i = mine.findIndex((x) => x.id === l.id);
    const other = mine[i + by];
    if (!other) return;
    // Equal positions (links saved before any reordering) are spread first so a swap moves something.
    if (other.position === l.position) {
      mine.forEach((x, n) => { if (x.position !== n) put(x, { position: n }); });
      put(l, { position: i + by });
      put(other, { position: i });
    } else {
      put(l, { position: other.position });
      put(other, { position: l.position });
    }
    if (sort !== 'mine') setSort('mine');
  };

  const linkMenu = (l: LinkItem, list: LinkItem[], x: number, y: number) => setMenu({
    x, y, label: labelOf(l), items: [
      { items: [
        { icon: 'copy', label: 'Copy link', run: () => void copy(l) },
        { icon: 'text', label: 'Copy with label', run: () => void copyText(`${labelOf(l)}: ${l.url}`).then((ok) => ok && toast('Label and link copied', undefined, { icon: 'copy' })) },
        { icon: 'edit', label: 'Edit', run: () => setEditing(l) },
        { icon: 'pin', label: l.pinned ? 'Unpin' : 'Pin to the top', run: () => put(l, { pinned: !l.pinned }) },
      ] },
      { items: [
        { icon: 'tag', label: 'Move to', items: [
          ...categories.map((c) => ({ icon: 'tag' as const, label: c.name, swatch: c.color, checked: l.category === c.name, run: () => moveTo(l, c.name) })),
          { icon: 'close', label: 'No category', checked: !l.category, run: () => moveTo(l, '') },
        ] },
        { icon: 'chevronUp', label: 'Move up', run: () => nudge(l, list, -1) },
        { icon: 'chevronDown', label: 'Move down', run: () => nudge(l, list, 1) },
      ] },
      { items: [{ icon: 'trash', label: 'Delete', danger: true, run: () => remove(l) }] },
    ],
  });

  /* ---- changing categories */
  const newCategory = async () => {
    const name = (await ask('New category', { placeholder: 'School, Programs, Reading', confirmLabel: 'Add' }))?.trim().replace(/\s+/g, ' ');
    if (!name) return;
    void update({ linkCategories: addCategory(categories, name) });
    setFilter(categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.name ?? name);
  };
  const renameCategory = async (c: Category) => {
    const name = (await ask('Rename category', { initial: c.name, confirmLabel: 'Rename' }))?.trim().replace(/\s+/g, ' ');
    if (!name || name === c.name) return;
    void update({ linkCategories: categories.map((x) => (x.name === c.name ? { ...x, name } : x)) });
    for (const l of links.filter((x) => x.category === c.name)) put(l, { category: name });
    if (filter === c.name) setFilter(name);
    toast(`Renamed to ${name}`, undefined, { icon: 'tag' });
  };
  const deleteCategory = (c: Category) => {
    const inside = links.filter((l) => l.category === c.name);
    void update({ linkCategories: categories.filter((x) => x.name !== c.name) });
    for (const l of inside) put(l, { category: '' });
    if (filter === c.name) setFilter(null);
    toast(`${c.name} removed. Its ${inside.length} ${inside.length === 1 ? 'link stays' : 'links stay'} saved.`, () => {
      void update({ linkCategories: categories });
      for (const l of inside) put({ ...l, category: '' }, { category: c.name });
    }, { icon: 'tag' });
  };
  const shiftCategory = (c: Category, by: -1 | 1) => {
    const list = [...categories];
    const i = list.findIndex((x) => x.name === c.name);
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void update({ linkCategories: list });
  };
  const categoryMenu = (c: Category, x: number, y: number) => setMenu({
    x, y, label: c.name, items: [
      { items: [
        { icon: 'pen', label: 'Rename', run: () => void renameCategory(c) },
        { icon: 'copy', label: 'Copy every link in it', run: () => void copyAll(c.name) },
      ] },
      { label: 'Colour', items: TAG_COLORS.map((t) => ({ icon: 'palette' as const, label: t.name, swatch: t.value, checked: c.color === t.value, run: () => void update({ linkCategories: categories.map((x) => (x.name === c.name ? { ...x, color: t.value } : x)) }) })) },
      { items: [
        { icon: 'chevronLeft', label: 'Move earlier', run: () => shiftCategory(c, -1) },
        { icon: 'chevronRight', label: 'Move later', run: () => shiftCategory(c, 1) },
        { icon: 'trash', label: 'Remove category', danger: true, run: () => deleteCategory(c) },
      ] },
    ],
  });
  const copyAll = async (name: string) => {
    const list = links.filter((l) => l.category === name);
    if (list.length && await copyText(list.map((l) => `${labelOf(l)}: ${l.url}`).join('\n'))) toast(`${list.length} ${list.length === 1 ? 'link' : 'links'} copied`, undefined, { icon: 'copy' });
  };

  const dropOn = (name: string) => ({
    onDragOver: (e: React.DragEvent) => { if (Array.from(e.dataTransfer.types).includes(INTERNAL)) { e.preventDefault(); setTarget(name); } },
    onDragLeave: () => setTarget((t) => (t === name ? null : t)),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(INTERNAL);
      const l = links.find((x) => x.id === id);
      setTarget(null);
      if (l) { e.preventDefault(); moveTo(l, name); }
    },
  });

  const preview = safeUrl(url) ?? findUrl(url);

  return (
    <div className="lnk">
      <header className="lnk-head">
        <div>
          <h1 className="section-title">Links</h1>
          <p>Drop a link anywhere on this page, or paste one. Give it a label, keep it in a category, and copy it in one tap.</p>
        </div>
      </header>

      <form className={'lnk-add' + (url && !preview ? ' is-bad' : '')} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="lnk-field is-url">
          <Icon name="link" size={17} />
          <input ref={urlRef} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste or drop a link" aria-label="Link" inputMode="url" autoComplete="off"
            onPaste={(e) => { const text = e.clipboardData.getData('text/plain'); if (findUrl(text)) { e.preventDefault(); take(text); } }} />
        </label>
        <label className="lnk-field">
          <Icon name="pen" size={16} />
          <input ref={labelRef} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={preview ? siteOf(preview).host : 'Label'} aria-label="Label" maxLength={120} />
        </label>
        <button type="submit" className="lnk-save" disabled={!url.trim()}>
          <Icon name="plus" size={16} />Save{filter ? ` to ${filter}` : ''}
        </button>
      </form>

      <div className="lnk-toolbar">
        <div className="lnk-cats" role="tablist" aria-label="Categories">
          <button type="button" role="tab" aria-selected={filter === null} onClick={() => setFilter(null)}>All<b>{links.length}</b></button>
          {categories.map((c) => (
            <button key={c.name} type="button" role="tab" aria-selected={filter === c.name} className={target === c.name ? 'is-target' : undefined}
              style={{ '--c': c.color } as React.CSSProperties} onClick={() => setFilter(c.name)}
              onContextMenu={(e) => { e.preventDefault(); categoryMenu(c, e.clientX, e.clientY); }} {...dropOn(c.name)}>
              <i aria-hidden="true" />{c.name}<b>{countOf(c.name)}</b>
            </button>
          ))}
          {(loose > 0 || filter === '') && (
            <button type="button" role="tab" aria-selected={filter === ''} className={target === '' ? 'is-target' : undefined} onClick={() => setFilter('')} {...dropOn('')}>
              <i aria-hidden="true" />No category<b>{loose}</b>
            </button>
          )}
          <button type="button" className="lnk-cat-add" onClick={() => void newCategory()}><Icon name="plus" size={13} />Category</button>
        </div>
        <label className="lnk-search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search links" aria-label="Search links" />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><Icon name="close" size={12} /></button>}
        </label>
        <label className="lnk-sort">
          <Icon name="sort" size={15} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort links">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <div className="lnk-view" role="group" aria-label="How much of each link to show">
          <button type="button" aria-pressed={view === 'compact'} onClick={() => setView('compact')}><Icon name="list" size={15} />Compact</button>
          <button type="button" aria-pressed={view === 'expanded'} onClick={() => setView('expanded')}><Icon name="expand" size={15} />Expanded</button>
        </div>
      </div>

      {isPending ? <p className="lnk-muted">Loading your links…</p> : links.length === 0 ? (
        <button type="button" className="lnk-empty" onClick={() => urlRef.current?.focus()}>
          <span><Icon name="link" size={28} /></span>
          <b>No links yet</b>
          <small>Drag a link from your browser onto this page, or copy one and press Ctrl+V here.</small>
        </button>
      ) : ordered.length === 0 ? (
        <p className="lnk-muted">{q ? `Nothing matches “${query.trim()}”.` : 'Nothing in this category yet. Save a link while it is selected, or drag one onto its chip.'}</p>
      ) : sections.map((s) => {
        const cat = categories.find((c) => c.name === s.key);
        return (
          <section key={s.key || 'none'} className="lnk-section" style={{ '--c': s.color } as React.CSSProperties} aria-label={s.title}>
            <header className="lnk-section-head">
              <i aria-hidden="true" />
              <h2>{s.title}</h2>
              <b>{s.items.length}</b>
              {cat && (
                <>
                  <button type="button" className="lnk-ghost" onClick={() => void copyAll(cat.name)}><Icon name="copy" size={13} />Copy all</button>
                  <button type="button" className="lnk-icon" aria-label={`${cat.name} options`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); categoryMenu(cat, r.left - 150, r.bottom + 4); }}><Icon name="dots" size={16} /></button>
                </>
              )}
            </header>
            <ul className={'lnk-grid' + (view === 'expanded' ? ' is-expanded' : '')}>
              {s.items.map((l) => {
                const site = siteOf(l.url);
                const color = l.category ? colorOf(l.category) : NONE_COLOR;
                const drag = {
                  draggable: true,
                  onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData(INTERNAL, l.id); e.dataTransfer.effectAllowed = 'move'; },
                  onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); linkMenu(l, s.items, e.clientX, e.clientY); },
                };
                const more = (e: React.MouseEvent<HTMLButtonElement>) => { const r = e.currentTarget.getBoundingClientRect(); linkMenu(l, s.items, r.left - 170, r.bottom + 4); };
                const copyButton = (
                  <button type="button" className={'lnk-copybtn' + (copied === l.id ? ' is-done' : '')} onClick={() => void copy(l)} aria-label={`Copy ${labelOf(l)}`}>
                    <Icon name={copied === l.id ? 'check' : 'copy'} size={15} /><span>{copied === l.id ? 'Copied' : 'Copy'}</span>
                  </button>
                );
                // Expanded says the whole thing: the address in full, the note as
                // written, where it lives and when it was saved. Compact keeps a
                // link to a line.
                if (view === 'expanded') return (
                  <li key={l.id} className={'lnk-card is-wide' + (l.pinned ? ' is-pinned' : '')} style={{ '--c': color } as React.CSSProperties} {...drag}>
                    <div className="lnk-wide-head">
                      <span className="lnk-avatar" aria-hidden="true">{site.host.charAt(0).toUpperCase()}</span>
                      <span className="lnk-wide-copy">
                        <b>{l.pinned && <Icon name="pin" size={13} />}{labelOf(l)}</b>
                        <a className="lnk-url" href={l.url} target="_blank" rel="noopener noreferrer" draggable={false}>{l.url}</a>
                      </span>
                      <button type="button" className="lnk-icon" aria-label={`More for ${labelOf(l)}`} onClick={more}><Icon name="dots" size={16} /></button>
                    </div>
                    {l.note && <p className="lnk-note">{l.note}</p>}
                    <div className="lnk-wide-meta">
                      <span className="lnk-chip"><i aria-hidden="true" />{l.category || 'No category'}</span>
                      <span>{site.host}</span>
                      <span>Saved {ago(l.created_at)}</span>
                    </div>
                    <div className="lnk-wide-actions">
                      <a className="lnk-open" href={l.url} target="_blank" rel="noopener noreferrer" draggable={false}><Icon name="arrowR" size={15} />Open</a>
                      {copyButton}
                      <button type="button" className="lnk-ghost" onClick={() => setEditing(l)}><Icon name="edit" size={14} />Edit</button>
                    </div>
                  </li>
                );
                return (
                  <li key={l.id} className={'lnk-card' + (l.pinned ? ' is-pinned' : '')} style={{ '--c': color } as React.CSSProperties} {...drag}>
                    <a className="lnk-main" href={l.url} target="_blank" rel="noopener noreferrer" draggable={false} title={l.url}>
                      <span className="lnk-avatar" aria-hidden="true">{site.host.charAt(0).toUpperCase()}</span>
                      <span className="lnk-copy">
                        <b>{l.pinned && <Icon name="pin" size={12} />}{labelOf(l)}</b>
                        <small>{site.host}{site.path}</small>
                        {l.note && <em>{l.note}</em>}
                      </span>
                    </a>
                    {copyButton}
                    <button type="button" className="lnk-icon" aria-label={`More for ${labelOf(l)}`} onClick={more}><Icon name="dots" size={16} /></button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {dropping && typeof document !== 'undefined' && createPortal(
        <div className="lnk-drop" aria-hidden="true"><div><Icon name="link" size={26} />Drop to save this link{filter ? ` in ${filter}` : ''}</div></div>,
        document.body,
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} kind="links" label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}

      {editing && (
        <LinkSheet link={editing} categories={categories} onClose={() => setEditing(null)}
          onSave={(next) => {
            if (next.category && !categories.some((c) => c.name === next.category)) void update({ linkCategories: addCategory(categories, next.category) });
            put(editing, next);
            toast('Link saved', undefined, { tone: 'success', icon: 'check' });
          }}
          onDelete={() => remove(editing)} />
      )}
    </div>
  );
}

function LinkSheet({ link, categories, onClose, onSave, onDelete }: {
  link: LinkItem;
  categories: Category[];
  onClose: () => void;
  onSave: (next: Partial<LinkItem>) => void;
  onDelete: () => void;
}) {
  useOverlayBack(true, onClose);
  const [url, setUrl] = useState(link.url);
  const [label, setLabel] = useState(link.label);
  const [note, setNote] = useState(link.note);
  const [category, setCategory] = useState(link.category);
  const [pinned, setPinned] = useState(link.pinned);
  const [fresh, setFresh] = useState('');
  const clean = safeUrl(url);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="lnk-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="lnk-sheet" role="dialog" aria-modal="true" aria-labelledby="lnk-sheet-title"
        onSubmit={(e) => { e.preventDefault(); if (!clean) return; onSave({ url: clean, label: label.trim(), note: note.trim(), category: fresh.trim() || category, pinned }); onClose(); }}>
        <header className="lnk-sheet-head">
          <h2 id="lnk-sheet-title">Edit link</h2>
          <button type="button" className="lnk-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <label className="lnk-sheet-field"><span>Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={clean ? siteOf(clean).host : 'Label'} maxLength={120} autoFocus /></label>
        <label className="lnk-sheet-field"><span>Link</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" aria-invalid={!clean} />
          {!clean && <small className="is-bad">Web links only, starting with http or https.</small>}</label>
        <label className="lnk-sheet-field"><span>Note <em>optional</em></span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Password hint, which week, who shared it" maxLength={200} /></label>
        <div className="lnk-sheet-field">
          <span>Category</span>
          <div className="lnk-sheet-chips" role="radiogroup" aria-label="Category">
            <button type="button" role="radio" aria-checked={!category && !fresh} onClick={() => { setCategory(''); setFresh(''); }}>None</button>
            {categories.map((c) => (
              <button key={c.name} type="button" role="radio" aria-checked={category === c.name && !fresh} style={{ '--c': c.color } as React.CSSProperties}
                onClick={() => { setCategory(c.name); setFresh(''); }}><i aria-hidden="true" />{c.name}</button>
            ))}
          </div>
          <input value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="Or type a new category" aria-label="New category" maxLength={40} />
        </div>
        <label className="lnk-sheet-toggle"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />Pin it to the top</label>
        <div className="lnk-sheet-actions">
          <button type="button" className="lnk-ghost is-danger" onClick={() => { onDelete(); onClose(); }}><Icon name="trash" size={15} />Delete</button>
          <button type="submit" className="lnk-save" disabled={!clean}>Save changes</button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
