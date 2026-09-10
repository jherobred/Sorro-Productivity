'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { ColorPicker } from '../ColorPicker';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { ask, confirmAsk } from '@/lib/ask';
import { toast } from '@/lib/toast';
import { preview } from '@/lib/md';
import { whenLabel, type Note, type Notebook } from '@/lib/notes';
import { ProgBlur } from '../core/ProgBlur';
import { NotebookCover } from './NotebookCover';
import type { Board } from '@/lib/canvas';

/**
 * The Notebooks tab — Evernote's landing screen, wearing covers.
 *
 * You do not open Evernote inside a note. You open it on a shelf of notebooks
 * and pick one. Here every notebook is a cover card: art identifies it, the
 * name sits on a progressive-blur veil, and the row menu (right-click or the
 * dots) carries rename, recolour, archive and delete. "Show notes" expands the
 * card in place, so "which notebook was that in?" is answered without leaving.
 *
 * Canvases and graph views sit on the same shelf as cover tiles — they are a
 * kind of notebook, and hiding them behind a tab meant you had to remember
 * they existed before you could find them.
 */

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
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [desc, setDesc] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxGroup[] } | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number; value: string; apply: (c: string) => void } | null>(null);

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
        { label: 'Colour', icon: 'palette', swatch: b.color,
          run: () => setPicker({ x: menu?.x ?? 80, y: menu?.y ?? 80, value: b.color, apply: (c) => onRecolour(b, c) }) },
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

  const boardMenu = (b: Board): CtxGroup[] => [
    { items: [
      { label: 'Open', icon: b.kind === 'graph' ? 'link' : 'grid', run: () => onOpenBoard(b) },
      { label: 'Rename', icon: 'edit', run: () => onRenameBoard(b) },
    ] },
    { items: [
      { label: `Delete ${b.kind === 'graph' ? 'graph' : 'canvas'}`, icon: 'trash', danger: true, run: () => onDeleteBoard(b) },
    ] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, flex: 1 }}>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="project" label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'} />
      )}
      {picker && (
        <ColorPicker x={picker.x} y={picker.y} value={picker.value}
          onChange={picker.apply} onClose={() => setPicker(null)} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onNew} className="tap acc k-glass" style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 999,
          minHeight: 38, background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800,
        }}>
          <Icon name="bookPlus" size={15} color="var(--accInk)" />New notebook
        </button>

        <button onClick={() => setDesc((v) => !v)} className="hov tap"
          title={desc ? 'Sort Z to A' : 'Sort A to Z'} aria-label={desc ? 'Sort Z to A' : 'Sort A to Z'}
          style={{ width: 38, height: 38, borderRadius: 'var(--r-sm)', border: '1px solid var(--line2)', background: 'var(--card)', display: 'grid', placeItems: 'center' }}>
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
              padding: '7px 13px',
              minHeight: 38,
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
          padding: '0 13px', height: 38, borderRadius: 'var(--r-sm)', border: '1px solid var(--line2)', background: 'var(--card)',
        }}>
          <Icon name="search" size={14} color="var(--tx3)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find notebooks"
            aria-label="Find notebooks"
            style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--tx)', fontFamily: 'inherit' }} />
        </label>
      </div>

      <div className="navsb k-stagger" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'grid', alignItems: 'start', alignContent: 'start',
        gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(225px, 1fr))',
        gap: 12, paddingRight: 2,
      }}>
        {rows.map((b, i) => (
          <BookCard key={b.id} book={b} index={i} kids={byBook.get(b.id) ?? []} phone={phone}
            isOpen={!!open[b.id]} isArchived={archivedNbIds?.has(b.id) ?? false}
            onToggle={() => setOpen((o) => ({ ...o, [b.id]: !o[b.id] }))}
            onOpen={() => onOpen(b.id)}
            onOpenNote={(nid) => onOpenNote(b.id, nid)}
            onMenu={(x, y) => setMenu({ x, y, label: b.name, items: rowMenu(b) })} />
        ))}

        {rows.length === 0 && (
          <div style={{
            gridColumn: '1 / -1', padding: '40px 16px', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascots/otter.svg" alt="" width={64} height={64} style={{ opacity: .9 }} />
            <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
              {q ? `Nothing called “${q}”.` : 'Nothing here yet. Make a notebook.'}
            </div>
          </div>
        )}

        {/* Canvases and graphs live on the same shelf, as tiles. */}
        {boardRows.map((b, i) => (
          <BoardTile key={b.id} board={b} index={rows.length + i}
            onOpen={() => onOpenBoard(b)}
            onMenu={(x, y) => setMenu({ x, y, label: b.name, items: boardMenu(b) })} />
        ))}
      </div>

      {/* New board doors. The tiles above open what exists; these make more. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 'none' }}>
        <button onClick={() => onNewBoard('canvas')} className="hov k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', minHeight: 36,
          borderRadius: 999, border: '1px solid var(--line2)', background: 'var(--card2)',
          fontSize: 12, fontWeight: 700, color: 'var(--tx2)',
        }}>
          <Icon name="grid" size={13} color="var(--pal-cyan)" />New canvas
        </button>
        <button onClick={() => onNewBoard('graph')} className="hov k-squish" style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', minHeight: 36,
          borderRadius: 999, border: '1px solid var(--line2)', background: 'var(--card2)',
          fontSize: 12, fontWeight: 700, color: 'var(--tx2)',
        }}>
          <Icon name="link" size={13} color="var(--pal-violet)" />New graph
        </button>
      </div>
    </div>
  );
}

function BoardTile({
  board: b, index, onOpen, onMenu,
}: {
  board: Board; index: number; onOpen: () => void; onMenu: (x: number, y: number) => void;
}) {
  return (
    <div
      className="clay k-squish"
      onClick={onOpen}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
      style={{ ['--i' as string]: index, position: 'relative', overflow: 'hidden', padding: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 132, width: '100%', cursor: 'pointer' }}
    >
      <NotebookCover seed={b.id} color={b.color} />
      <span style={{
        position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 8,
        display: 'grid', placeItems: 'center',
        background: 'color-mix(in srgb, var(--card) 62%, transparent)',
        border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}>
        <Icon name={b.kind === 'graph' ? 'link' : 'grid'} size={12} color="var(--tx2)" />
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onMenu(e.clientX, e.clientY); }}
        className="hov" aria-label={`Actions for ${b.name}`} aria-haspopup="menu"
        style={{
          position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 9,
          display: 'grid', placeItems: 'center',
          background: 'color-mix(in srgb, var(--card) 62%, transparent)',
          border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        <Icon name="dots" size={14} color="var(--tx2)" />
      </button>
      <ProgBlur edge="bottom" size={52} strength={12} />
      <span style={{ position: 'relative', padding: '9px 11px 10px', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 12.5, fontWeight: 800, color: 'var(--tx)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {b.name}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
          {b.kind === 'graph' ? 'Graph' : 'Canvas'}
        </span>
      </span>
    </div>
  );
}

function BookCard({
  book: b, index, kids, phone, isOpen, isArchived, onToggle, onOpen, onOpenNote, onMenu,
}: {
  book: Notebook; index: number; kids: Note[]; phone: boolean; isOpen: boolean; isArchived: boolean;
  onToggle: () => void; onOpen: () => void; onOpenNote: (id: string) => void;
  onMenu: (x: number, y: number) => void;
}) {
  const last = kids.reduce<string | null>((a, n) => (!a || n.updated_at > a ? n.updated_at : a), null);
  return (
    <div
      className={isOpen ? 'clay' : 'clay k-squish'}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
      style={{
        ['--i' as string]: index,
        gridColumn: isOpen && phone ? '1 / -1' : undefined,
        position: 'relative', overflow: 'hidden', padding: 0, textAlign: 'left',
        display: 'flex', flexDirection: 'column', width: '100%',
        opacity: isArchived ? 0.78 : 1,
      }}
    >
      {/* The cover opens the notebook. Art first, name on the blur veil, and
          never a button inside a button — the cover is a click surface, the
          chevron and dots are separate buttons layered over it. */}
      <div
        onClick={isOpen ? undefined : onOpen}
        role={isOpen ? undefined : 'button'}
        aria-label={isOpen ? undefined : `Open ${b.name}`}
        style={{
          position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          minHeight: 132, width: '100%', cursor: isOpen ? 'default' : 'pointer', textAlign: 'left', padding: 0,
        }}
      >
        <NotebookCover seed={b.id} color={b.color} />
        {isArchived && (
          <span style={{
            position: 'absolute', top: 8, left: 8, padding: '3px 8px', borderRadius: 999,
            fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase',
            color: 'var(--pal-amber)', background: 'color-mix(in srgb, var(--card) 62%, transparent)',
            border: '1px solid color-mix(in srgb, var(--pal-amber) 32%, transparent)',
          }}>
            Archived
          </span>
        )}
        <ProgBlur edge="bottom" size={60} strength={12} />
        <span style={{ position: 'relative', padding: '10px 12px 11px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{
            fontSize: 13.5, fontWeight: 800, letterSpacing: '-.01em', color: 'var(--tx)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {b.name}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--tx3)' }}>
            {kids.length} note{kids.length === 1 ? '' : 's'}{last ? ` · ${whenLabel(last)}` : ''}
          </span>
        </span>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-expanded={isOpen} aria-label={isOpen ? 'Hide notes' : 'Show notes'}
        className="hov"
        style={{
          position: 'absolute', top: 6, right: 40, width: 30, height: 30, borderRadius: 9,
          display: 'grid', placeItems: 'center',
          background: 'color-mix(in srgb, var(--card) 62%, transparent)',
          border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        <Icon name="chev" size={13} color="var(--tx2)"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .22s' }} />
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onMenu(e.clientX, e.clientY); }}
        className="hov" aria-label={`Actions for ${b.name}`} aria-haspopup="menu"
        style={{
          position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 9,
          display: 'grid', placeItems: 'center',
          background: 'color-mix(in srgb, var(--card) 62%, transparent)',
          border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        <Icon name="dots" size={14} color="var(--tx2)" />
      </button>

      {/* Expanded in place: the notes the cover stands for. */}
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--line)', background: 'var(--card)', padding: 8, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }} className="navsb">
          {kids.map((n) => (
            <button key={n.id} onClick={(e) => { e.stopPropagation(); onOpenNote(n.id); }}
              className="row" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 10 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.title || 'Untitled'}
              </span>
              <span style={{
                display: 'block', fontSize: 10.5, color: 'var(--tx3)', marginTop: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {preview(n.body, 70) || 'Empty'} · {whenLabel(n.updated_at)}
              </span>
            </button>
          ))}
          {kids.length === 0 && (
            <div style={{ padding: '10px', fontSize: 11, color: 'var(--tx3)', textAlign: 'center' }}>Empty notebook.</div>
          )}
        </div>
      )}
    </div>
  );
}
