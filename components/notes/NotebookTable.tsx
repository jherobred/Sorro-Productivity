'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { preview } from '@/lib/md';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
import { useMyIdentity, type Identity } from '@/lib/people';
import { Face } from '../AccountSheet';
import type { Board } from '@/lib/canvas';

/**
 * The notebook shelf — Evernote's landing screen.
 *
 * You do not open Evernote inside a note. You open it on a list of notebooks,
 * with a count and a date against each, and pick one. The old screen skipped
 * that step and dropped you into a three-level tree, which is why finding
 * anything meant expanding two things first.
 *
 * A row expands in place to show what is inside it, so "which notebook was that
 * in?" is answered without leaving the list.
 *
 * Canvases and graph views sit on the same shelf. They are a kind of notebook —
 * a place your work lives — and hiding them behind a tab meant you had to
 * remember they existed before you could find them.
 */

const COLOURS = [
  { n: 'Violet', v: '#B07CFF' }, { n: 'Indigo', v: '#7C6CFF' }, { n: 'Cyan', v: '#38D6F2' },
  { n: 'Mint', v: '#34D9A0' }, { n: 'Amber', v: '#FFC24B' }, { n: 'Coral', v: '#FF6B6B' },
];

const HEAD: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.02em',
  textAlign: 'left', padding: '9px 12px', whiteSpace: 'nowrap',
};

export function NotebookTable({
  notebooks, notes, boards, onOpen, onNew, onRename, onRecolour, onDelete, onOpenNote,
  onNewBoard, onOpenBoard, onRenameBoard, onDeleteBoard,
  archivedNbIds, onToggleArchive, trashCount = 0, onOpenTrash,
}: {
  notebooks: Notebook[];
  notes: Note[];
  /** Canvases and graph views — the other two kinds of notebook. */
  boards: Board[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (b: Notebook, name: string) => void;
  onRecolour: (b: Notebook, color: string) => void;
  onDelete: (b: Notebook) => void;
  onOpenNote: (notebookId: string, noteId: string) => void;
  onNewBoard: (kind: 'canvas' | 'graph') => void;
  onOpenBoard: (b: Board) => void;
  onRenameBoard: (b: Board) => void;
  onDeleteBoard: (b: Board) => void;
  archivedNbIds?: Set<string>;
  onToggleArchive?: (id: string) => void;
  trashCount?: number;
  onOpenTrash?: () => void;
}) {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  const me = useMyIdentity();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [desc, setDesc] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxGroup[] } | null>(null);

  const byBook = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) {
      const list = m.get(n.notebook_id);
      if (list) list.push(n);
      else m.set(n.notebook_id, [n]);
    }
    return m;
  }, [notes]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = notebooks.filter((b) => !term || b.name.toLowerCase().includes(term));
    return [...list].sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name));
  }, [notebooks, q, desc]);

  const boardRows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = boards.filter((b) => !term || b.name.toLowerCase().includes(term));
    return [...list].sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name));
  }, [boards, q, desc]);

  const rowMenu = (b: Notebook): CtxGroup[] => {
    const isArchived = archivedNbIds?.has(b.id) ?? false;
    return [
      { items: [
        { label: 'Open', icon: 'book', run: () => onOpen(b.id) },
        { label: open[b.id] ? 'Collapse' : 'Show notes', icon: open[b.id] ? 'collapse' : 'expand',
          run: () => setOpen((o) => ({ ...o, [b.id]: !o[b.id] })) },
      ] },
      { label: 'Notebook', items: [
        { label: 'Rename', icon: 'edit', shortcut: 'F2',
          run: () => void ask('Rename notebook', { initial: b.name, placeholder: 'Notebook name' })
            .then((n) => { if (n && n !== b.name) onRename(b, n); }) },
        { label: 'Colour', icon: 'palette', items: COLOURS.map((c) => ({
          label: c.n, icon: 'palette' as IconName, checked: b.color === c.v, run: () => onRecolour(b, c.v),
        })) },
        { label: isArchived ? 'Unarchive notebook' : 'Archive notebook', icon: 'clock', run: () => onToggleArchive?.(b.id) },
        { label: 'Copy name', icon: 'copy', run: () => { void navigator.clipboard?.writeText(b.name); toast('Copied'); } },
      ] },
      { items: [
        { label: 'Delete notebook', icon: 'trash', danger: true,
          hint: (byBook.get(b.id)?.length ?? 0) ? 'Its notes go to the trash' : undefined,
          run: () => void confirmAsk(`Delete “${b.name}”?`, {
            message: (byBook.get(b.id)?.length ?? 0)
              ? `${byBook.get(b.id)!.length} notes move to the trash, where you can still get them back.`
              : 'It is empty.',
            confirmLabel: 'Delete', danger: true,
          }).then((yes) => { if (yes) onDelete(b); }) },
      ] },
    ];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="project" label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onNew} className="tap acc" style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999,
          minHeight: 36, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700,
        }}>
          <Icon name="bookPlus" size={15} color="var(--ink)" />New notebook
        </button>

        <button onClick={() => setDesc((v) => !v)} className="hov tap"
          title={desc ? 'Sort Z to A' : 'Sort A to Z'} aria-label={desc ? 'Sort Z to A' : 'Sort A to Z'}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
          <Icon name="sort" size={15} color="var(--tx2)" />
        </button>

        {onOpenTrash && (
          <button
            onClick={onOpenTrash}
            className="hov tap"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 12px',
              minHeight: 36,
              borderRadius: 999,
              border: '1px solid var(--line2)',
              background: 'var(--card)',
              color: trashCount > 0 ? 'var(--pal-coral)' : 'var(--tx3)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Icon name="trash" size={13} color="var(--pal-coral)" />
            <span>Bin{trashCount > 0 ? ` (${trashCount})` : ''}</span>
          </button>
        )}

        <label style={{
          marginLeft: phone ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: phone ? '1 1 100%' : '0 0 240px',
          padding: '0 12px', height: 36, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card)',
        }}>
          <Icon name="search" size={14} color="var(--tx3)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find notebooks"
            aria-label="Find notebooks"
            style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--tx)', fontFamily: 'inherit' }} />
        </label>
      </div>

      <div className="navsb" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        background: 'var(--card)', borderRadius: 14, boxShadow: 'var(--sh)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              <th style={{ ...HEAD, width: 34 }} aria-label="Expand" />
              <th style={HEAD}>Title</th>
              {!phone && <th style={{ ...HEAD, width: 90 }}>Notes</th>}
              {!phone && <th style={{ ...HEAD, width: 140 }}>Created by</th>}
              <th style={{ ...HEAD, width: phone ? 74 : 120 }}>Updated</th>
              <th style={{ ...HEAD, width: 44 }} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const kids = byBook.get(b.id) ?? [];
              const last = kids.reduce<string | null>((a, n) => (!a || n.updated_at > a ? n.updated_at : a), null);
              const isOpen = !!open[b.id];
              const isArchived = archivedNbIds?.has(b.id) ?? false;
              return (
                <BookRow key={b.id} book={b} kids={kids} last={last} me={me} phone={phone} isOpen={isOpen} isArchived={isArchived}
                  onToggle={() => setOpen((o) => ({ ...o, [b.id]: !o[b.id] }))}
                  onOpen={() => onOpen(b.id)}
                  onOpenNote={(nid) => onOpenNote(b.id, nid)}
                  onMenu={(x, y) => setMenu({ x, y, label: b.name, items: rowMenu(b) })} />
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', fontSize: 12.5, color: 'var(--tx3)' }}>
                  {q ? `Nothing called “${q}”.` : 'Nothing here yet. Make a notebook.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * A canvas or a graph view on the shelf. No expander: what is inside a canvas
 * is a picture, and a list of card titles would not tell you anything a glance
 * at the board would not tell you faster.
 */
function BoardRow({
  board: b, me, phone, onOpen, onMenu,
}: { board: Board; me: Identity; phone: boolean; onOpen: () => void; onMenu: (x: number, y: number) => void }) {
  const cell: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--tx2)', verticalAlign: 'middle' };
  const kind = b.kind === 'graph' ? 'Graph' : 'Canvas';
  const displayName = me.name && me.name.toLowerCase() !== 'gemini'
    ? me.name
    : (me.handle && me.handle.toLowerCase() !== 'gemini' ? (me.handle.startsWith('@') ? me.handle : `@${me.handle}`) : 'Owner');

  return (
    <tr className="row" style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
      onDoubleClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}>
      <td style={{ ...cell, paddingRight: 0 }}>
        <span style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name={b.kind === 'graph' ? 'link' : 'grid'} size={13} color="var(--tx3)" />
        </span>
      </td>
      <td style={cell}>
        <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%', minHeight: 30 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color, flex: 'none' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {b.name}
          </span>
          <span style={{
            flex: 'none', padding: '2px 7px', borderRadius: 6, fontSize: 9.5, fontWeight: 800,
            letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx3)', border: '1px solid var(--line2)',
          }}>
            {kind}
          </span>
        </button>
      </td>
      {!phone && <td style={cell}>—</td>}
      {!phone && (
        <td style={cell}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: 140 }}>
            <Face name={displayName} photo={me.photo} size={20} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
          </div>
        </td>
      )}
      <td style={{ ...cell, color: 'var(--tx3)' }}>{b.updated_at ? whenLabel(b.updated_at) : '—'}</td>
      <td style={{ ...cell, paddingLeft: 0 }}>
        <button onClick={(e) => { e.stopPropagation(); onMenu(e.clientX, e.clientY); }}
          className="hov" aria-label={`Actions for ${b.name}`}
          style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
          <Icon name="dots" size={15} color="var(--tx3)" />
        </button>
      </td>
    </tr>
  );
}

const NEW_BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 999,
  minHeight: 36, border: '1px solid var(--line2)', fontSize: 12, fontWeight: 700, color: 'var(--tx2)',
};

function BookRow({
  book: b, kids, last, me, phone, isOpen, isArchived, onToggle, onOpen, onOpenNote, onMenu,
}: {
  book: Notebook; kids: Note[]; last: string | null; me: Identity; phone: boolean; isOpen: boolean; isArchived?: boolean;
  onToggle: () => void; onOpen: () => void; onOpenNote: (id: string) => void;
  onMenu: (x: number, y: number) => void;
}) {
  const cell: React.CSSProperties = { padding: '10px 12px', fontSize: 12.5, color: 'var(--tx2)', verticalAlign: 'middle' };
  const displayName = me.name && me.name.toLowerCase() !== 'gemini'
    ? me.name
    : (me.handle && me.handle.toLowerCase() !== 'gemini' ? (me.handle.startsWith('@') ? me.handle : `@${me.handle}`) : 'Owner');

  return (
    <>
      <tr className="row" style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer', opacity: isArchived ? 0.75 : 1 }}
        onDoubleClick={onOpen}
        onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}>
        <td style={{ ...cell, paddingRight: 0 }}>
          <button onClick={onToggle} aria-expanded={isOpen} aria-label={isOpen ? 'Hide notes' : 'Show notes'}
            className="hov" style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
            <Icon name="chev" size={12} color="var(--tx3)"
              style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .22s' }} />
          </button>
        </td>

        <td style={cell}>
          <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', width: '100%', minHeight: 30 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color, flex: 'none' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.name}
            </span>
            {isArchived && (
              <span style={{
                flex: 'none', padding: '1px 6px', borderRadius: 5, fontSize: 9.5, fontWeight: 800,
                letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--pal-amber)',
                background: 'color-mix(in srgb, var(--pal-amber) 16%, transparent)',
                border: '1px solid color-mix(in srgb, var(--pal-amber) 30%, transparent)',
              }}>
                Archived
              </span>
            )}
            {phone && <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{kids.length}</span>}
          </button>
        </td>

        {!phone && <td style={cell}>{kids.length}</td>}
        {!phone && (
          <td style={cell}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: 140 }}>
              <Face name={displayName} photo={me.photo} size={20} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </span>
            </div>
          </td>
        )}
        <td style={{ ...cell, color: 'var(--tx3)' }}>{last ? whenLabel(last) : '—'}</td>
        <td style={{ ...cell, paddingLeft: 0 }}>
          <button onClick={(e) => { e.stopPropagation(); onMenu(e.clientX, e.clientY); }}
            className="hov" aria-label={`Actions for ${b.name}`}
            style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
            <Icon name="dots" size={15} color="var(--tx3)" />
          </button>
        </td>
      </tr>

      {isOpen && kids.map((n) => (
        <tr key={n.id} className="row" style={{ borderBottom: '1px solid var(--line)' }}>
          <td />
          <td colSpan={phone ? 2 : 4} style={{ padding: '8px 12px' }}>
            <button onClick={() => onOpenNote(n.id)} style={{ display: 'block', width: '100%', textAlign: 'left', minHeight: 30 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>{n.title || 'Untitled'}</span>
              <span style={{
                display: 'block', fontSize: 11, color: 'var(--tx3)', marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {preview(n.body, 90) || 'Empty'}
              </span>
            </button>
          </td>
          <td style={{ padding: '8px 12px', fontSize: 11, color: 'var(--tx3)' }}>{whenLabel(n.updated_at)}</td>
          <td />
        </tr>
      ))}

      {isOpen && kids.length === 0 && (
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
          <td />
          <td colSpan={6} style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--tx3)' }}>Empty notebook.</td>
        </tr>
      )}
    </>
  );
}
