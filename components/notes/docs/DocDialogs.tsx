'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { getMarkRange } from '@tiptap/core';
import { Icon } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import type { Note } from '@/lib/notes';
import { DEFAULT_PAGE, PAPER, type DocPage, type PaperSize } from '@/lib/docFormat';
import { flattenMenus, type MenuEntry } from './DocMenu';
import { EMOJI, SPECIAL_CHARACTERS, TEXT_PALETTE, colorName } from './palette';

export function DocModal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useOverlayBack(true, () => close.current());
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('input, select, textarea, button:not(.doc-modal-close)');
    (first ?? box.current)?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="doc-modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) close.current(); }}>
      <div ref={box} className={'doc-modal' + (wide ? ' is-wide' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); return; }
          if (e.key !== 'Tab') return;
          const items = Array.from(box.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea') ?? []);
          const first = items[0], last = items.at(-1);
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }}>
        <header className="doc-modal-head">
          <h2>{title}</h2>
          <button type="button" className="doc-modal-close" aria-label="Close" onClick={() => close.current()}><Icon name="close" size={18} /></button>
        </header>
        <div className="doc-modal-body">{children}</div>
        {footer && <footer className="doc-modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------------- link */

export const noteHref = (id: string) => `/notebooks/?open=${encodeURIComponent(id)}`;
export const noteIdFromHref = (href: string) => /^\/notebooks\/\?open=([^&#]+)$/.exec(href)?.[1] ?? null;

function normalizeHref(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (noteIdFromHref(text)) return text;
  if (/^(https?:|mailto:|tel:)/i.test(text)) return text;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return 'https://' + text;
  return null;
}

export function LinkDialog({ editor, notes, noteId, onClose }: { editor: Editor; notes: Note[]; noteId: string; onClose: () => void }) {
  const initial = useMemo(() => {
    const { state } = editor;
    let { from, to } = state.selection;
    const link = state.schema.marks.link;
    if (from === to && link) {
      const range = getMarkRange(state.doc.resolve(from), link);
      if (range) ({ from, to } = range);
    }
    return { from, to, text: state.doc.textBetween(from, to, ' '), href: editor.getAttributes('link').href ?? '' };
  }, [editor]);
  const [text, setText] = useState(initial.text);
  const [href, setHref] = useState(initial.href);
  const [error, setError] = useState('');
  const query = href.trim().toLowerCase();
  const matches = useMemo(() => notes.filter((n) => n.id !== noteId && (!query || n.title.toLowerCase().includes(query)) && !/^(https?:|\/)/.test(query)).slice(0, 6), [notes, noteId, query]);

  const apply = (target = href, label = text) => {
    const url = normalizeHref(target);
    if (!url) { setError('Enter a web address, or pick a page from this notebook.'); return; }
    const words = label.trim() || initial.text || target;
    const chain = editor.chain().focus();
    if (words !== initial.text || initial.from === initial.to) {
      chain.insertContentAt({ from: initial.from, to: initial.to }, { type: 'text', text: words, marks: [{ type: 'link', attrs: { href: url } }] });
    } else {
      chain.setTextSelection({ from: initial.from, to: initial.to }).extendMarkRange('link').setLink({ href: url });
    }
    chain.run();
    onClose();
  };

  return (
    <DocModal title={initial.href ? 'Edit link' : 'Insert link'} onClose={onClose}
      footer={<>
        {initial.href && <button type="button" className="doc-button" onClick={() => { editor.chain().focus().setTextSelection({ from: initial.from, to: initial.to }).unsetLink().run(); onClose(); }}>Remove link</button>}
        <span className="doc-spacer" />
        <button type="button" className="doc-button" onClick={onClose}>Cancel</button>
        <button type="button" className="doc-button is-primary" onClick={() => apply()}>Apply</button>
      </>}>
      <label className="doc-field"><span>Text</span><input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text to display" /></label>
      <label className="doc-field"><span>Link</span>
        <input value={href} onChange={(e) => { setHref(e.target.value); setError(''); }} placeholder="Search pages or paste a link"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }} />
      </label>
      {error && <p className="doc-field-error" role="alert">{error}</p>}
      {matches.length > 0 && (
        <div className="doc-link-results" role="listbox" aria-label="Pages in your notebooks">
          {matches.map((n) => (
            <button key={n.id} type="button" className="doc-menu-item" onClick={() => apply(noteHref(n.id), text || n.title)}>
              <span className="doc-menu-icon"><Icon name="docPage" size={16} /></span>
              <span className="doc-menu-label">{n.title || 'Untitled'}</span>
            </button>
          ))}
        </div>
      )}
    </DocModal>
  );
}

/* ----------------------------------------------------------- page setup */

const PAGE_DEFAULT_KEY = 'bd_doc_page_default';
export function defaultPage(): DocPage {
  try {
    const saved = JSON.parse(localStorage.getItem(PAGE_DEFAULT_KEY) || 'null');
    if (saved && PAPER[saved.size as PaperSize] && saved.margins) return { ...DEFAULT_PAGE, ...saved };
  } catch { /* nothing saved */ }
  return DEFAULT_PAGE;
}

export function PageSetupDialog({ page, onApply, onClose }: { page: DocPage; onApply: (page: DocPage) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(page);
  const margin = (edge: keyof DocPage['margins'], value: string) => {
    const n = parseFloat(value);
    setDraft((d) => ({ ...d, margins: { ...d.margins, [edge]: Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 0 } }));
  };
  return (
    <DocModal title="Page setup" onClose={onClose} wide
      footer={<>
        <button type="button" className="doc-button" onClick={() => { try { localStorage.setItem(PAGE_DEFAULT_KEY, JSON.stringify(draft)); } catch { /* storage full */ } onApply(draft); onClose(); }}>Set as default</button>
        <span className="doc-spacer" />
        <button type="button" className="doc-button" onClick={onClose}>Cancel</button>
        <button type="button" className="doc-button is-primary" onClick={() => { onApply(draft); onClose(); }}>OK</button>
      </>}>
      <div className="doc-segmented" role="radiogroup" aria-label="Layout">
        <button type="button" role="radio" aria-checked={!draft.pageless} onClick={() => setDraft({ ...draft, pageless: false })}>Pages</button>
        <button type="button" role="radio" aria-checked={draft.pageless} onClick={() => setDraft({ ...draft, pageless: true })}>Pageless</button>
      </div>
      <p className="doc-hint">{draft.pageless ? 'One continuous page that fills the window. Page size and margins apply when you print.' : 'Separate pages with the size and margins below, as they will print.'}</p>
      <div className="doc-setup-grid">
        <fieldset className="doc-fieldset">
          <legend>Orientation</legend>
          {(['portrait', 'landscape'] as const).map((o) => (
            <label key={o} className="doc-radio"><input type="radio" name="orientation" checked={draft.orientation === o} onChange={() => setDraft({ ...draft, orientation: o })} />{o === 'portrait' ? 'Portrait' : 'Landscape'}</label>
          ))}
        </fieldset>
        <label className="doc-field"><span>Paper size</span>
          <select value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value as PaperSize })}>
            {Object.entries(PAPER).map(([id, paper]) => <option key={id} value={id}>{paper.name}</option>)}
          </select>
        </label>
        <fieldset className="doc-fieldset">
          <legend>Margins (inches)</legend>
          <div className="doc-margins">
            {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
              <label key={edge} className="doc-field is-inline"><span>{edge[0].toUpperCase() + edge.slice(1)}</span>
                <input type="number" min={0} max={4} step={0.1} value={draft.margins[edge]} onChange={(e) => margin(edge, e.target.value)} />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="doc-fieldset">
          <legend>Page color</legend>
          <div className="doc-page-colors">
            {[...TEXT_PALETTE[0].slice(7), ...TEXT_PALETTE[2]].map((hex) => (
              <button key={hex} type="button" className={'doc-swatch' + (draft.color === hex ? ' is-on' : '')} style={{ background: hex }}
                aria-label={colorName(hex)} title={colorName(hex)} onClick={() => setDraft({ ...draft, color: hex })} />
            ))}
          </div>
        </fieldset>
      </div>
    </DocModal>
  );
}

/* ----------------------------------------------------------- word count */

export function countText(text: string) {
  return {
    words: text.match(/[^\s]+/g)?.length ?? 0,
    characters: text.replace(/\n/g, '').length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
  };
}

export function WordCountDialog({ editor, pages, live, onLive, onClose }: { editor: Editor; pages: number; live: boolean; onLive: (on: boolean) => void; onClose: () => void }) {
  const { state } = editor;
  const whole = countText(state.doc.textBetween(0, state.doc.content.size, '\n', ' '));
  const part = state.selection.empty ? null : countText(state.doc.textBetween(state.selection.from, state.selection.to, '\n', ' '));
  const row = (label: string, total: number, selected?: number) => (
    <tr><th scope="row">{label}</th><td>{selected !== undefined ? `${selected.toLocaleString()} of ${total.toLocaleString()}` : total.toLocaleString()}</td></tr>
  );
  return (
    <DocModal title="Word count" onClose={onClose} footer={<><span className="doc-spacer" /><button type="button" className="doc-button is-primary" onClick={onClose}>OK</button></>}>
      <table className="doc-count-table"><tbody>
        {row('Pages', pages)}
        {row('Words', whole.words, part?.words)}
        {row('Characters', whole.characters, part?.characters)}
        {row('Characters excluding spaces', whole.charactersNoSpaces, part?.charactersNoSpaces)}
      </tbody></table>
      <label className="doc-check"><input type="checkbox" checked={live} onChange={(e) => onLive(e.target.checked)} />Display word count while typing</label>
    </DocModal>
  );
}

/* ------------------------------------------------------ characters, emoji */

export function SpecialCharactersDialog({ onInsert, onClose }: { onInsert: (text: string) => void; onClose: () => void }) {
  const [group, setGroup] = useState(0);
  return (
    <DocModal title="Insert special characters" onClose={onClose} wide>
      <div className="doc-segmented is-scroll" role="tablist">
        {SPECIAL_CHARACTERS.map((g, i) => <button key={g.name} type="button" role="tab" aria-selected={i === group} aria-checked={i === group} onClick={() => setGroup(i)}>{g.name}</button>)}
      </div>
      <div className="doc-char-grid">
        {Array.from(SPECIAL_CHARACTERS[group].chars).map((ch) => (
          <button key={ch} type="button" aria-label={`Insert ${ch}`} onClick={() => onInsert(ch)}>{ch}</button>
        ))}
      </div>
    </DocModal>
  );
}

export function EmojiDialog({ onInsert, onClose }: { onInsert: (text: string) => void; onClose: () => void }) {
  const list = useMemo(() => {
    const Segmenter = (Intl as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
    return Segmenter ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(EMOJI), (s) => s.segment) : Array.from(EMOJI);
  }, []);
  return (
    <DocModal title="Insert emoji" onClose={onClose} wide>
      <div className="doc-char-grid is-emoji">
        {list.map((emoji, i) => <button key={i} type="button" aria-label={`Insert ${emoji}`} onClick={() => onInsert(emoji)}>{emoji}</button>)}
      </div>
    </DocModal>
  );
}

/* ---------------------------------------------------------------- table */

export function TableDialog({ onInsert, onClose }: { onInsert: (rows: number, cols: number) => void; onClose: () => void }) {
  const [size, setSize] = useState({ rows: 1, cols: 1 });
  return (
    <DocModal title="Insert table" onClose={onClose}>
      <div className="doc-table-grid" role="grid" aria-label="Choose table size" onPointerLeave={() => setSize((s) => s)}>
        {Array.from({ length: 10 }, (_, r) => (
          <div key={r} role="row" className="doc-table-grid-row">
            {Array.from({ length: 10 }, (_, c) => (
              <button key={c} type="button" role="gridcell" aria-label={`${r + 1} by ${c + 1} table`}
                className={r < size.rows && c < size.cols ? 'is-on' : ''}
                onPointerEnter={() => setSize({ rows: r + 1, cols: c + 1 })} onFocus={() => setSize({ rows: r + 1, cols: c + 1 })}
                onClick={() => { onInsert(r + 1, c + 1); onClose(); }} />
            ))}
          </div>
        ))}
      </div>
      <p className="doc-hint is-center">{size.cols} x {size.rows}</p>
    </DocModal>
  );
}

/* ------------------------------------------------------------ shortcuts */

const EXTRA_SHORTCUTS: [string, string][] = [
  ['Search the menus', 'Alt+/'], ['Find', 'Ctrl+F'], ['Normal text', 'Ctrl+Alt+0'], ['Heading 1 to 6', 'Ctrl+Alt+1 … 6'],
  ['Numbered list', 'Ctrl+Shift+7'], ['Bulleted list', 'Ctrl+Shift+8'], ['Checklist', 'Ctrl+Shift+9'],
  ['Paste format', 'Ctrl+Alt+V'], ['Open a link or linked page', 'Ctrl+click'],
];

export function ShortcutsDialog({ menus, onClose }: { menus: { label: string; entries: MenuEntry[] }[]; onClose: () => void }) {
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const all = [...flattenMenus(menus).filter((r) => r.item.shortcut).map((r) => [r.item.label, r.item.shortcut!] as [string, string]), ...EXTRA_SHORTCUTS];
    return all.filter(([label]) => (seen.has(label) ? false : (seen.add(label), true)));
  }, [menus]);
  return (
    <DocModal title="Keyboard shortcuts" onClose={onClose} wide>
      <table className="doc-count-table is-shortcuts"><tbody>
        {rows.map(([label, keys]) => <tr key={label}><th scope="row">{label}</th><td><kbd>{keys}</kbd></td></tr>)}
      </tbody></table>
    </DocModal>
  );
}

/* ---------------------------------------------------------------- tags */

export function TagsDialog({ tags, onSet, onClose }: { tags: string[]; onSet: (tags: string[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const tag = draft.trim().replace(/^#/, '').slice(0, 40);
    if (tag && !tags.includes(tag)) onSet([...tags, tag]);
    setDraft('');
  };
  return (
    <DocModal title="Tags" onClose={onClose} footer={<><span className="doc-spacer" /><button type="button" className="doc-button is-primary" onClick={onClose}>Done</button></>}>
      <div className="doc-tags">
        {tags.map((t) => (
          <span key={t} className="doc-tag">#{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => onSet(tags.filter((x) => x !== t))}><Icon name="close" size={12} /></button></span>
        ))}
        {!tags.length && <p className="doc-hint">No tags yet. Tags help you find pages across notebooks.</p>}
      </div>
      <div className="doc-field is-row">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. cs191, reading" aria-label="New tag"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="doc-button" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>
    </DocModal>
  );
}
