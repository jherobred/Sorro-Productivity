'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { whenLabel } from '@/lib/notes';
import { BoardPreview } from './BoardPreview';
import type { Board, CNode } from '@/lib/canvas';

/**
 * The shelf for canvases and for graphs, in the same cover language as the
 * notebook shelf.
 *
 * Notebooks land you on a list and you pick one. Canvas and Graph did not —
 * they dropped you straight into whichever board happened to be last, so a
 * second canvas was something you had to already know existed before you could
 * reach it. Same shelf, one kind at a time.
 *
 * The graph shelf carries one tile it did not create: the automatic graph of
 * every note and the links between them. That view is not a board and has no
 * row in the table, but it is the thing most people mean by "the graph", so it
 * sits at the front rather than being replaced by the custom ones.
 */

const COLOURS = [
  { n: 'Violet', v: '#B07CFF' }, { n: 'Indigo', v: '#7C6CFF' }, { n: 'Cyan', v: '#38D6F2' },
  { n: 'Mint', v: '#34D9A0' }, { n: 'Amber', v: '#FFC24B' }, { n: 'Coral', v: '#FF6B6B' },
];

export function BoardShelf({
  kind, boards, nodes, onOpen, onNew, onRename, onRecolour, onDelete, onOpenAuto,
}: {
  kind: 'canvas' | 'graph';
  boards: Board[];
  /** Every node across every board, for the per-board count. */
  nodes: CNode[];
  onOpen: (b: Board) => void;
  onNew: () => void;
  onRename: (b: Board) => void;
  onRecolour: (b: Board, color: string) => void;
  onDelete: (b: Board) => void;
  /** Graph only: open the automatic all-notes graph. */
  onOpenAuto?: () => void;
}) {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxGroup[] } | null>(null);

  const noun = kind === 'graph' ? 'graph' : 'canvas';
  // "canvas" takes -es, "graph" takes -s. `${noun}es` gave "graphes".
  const plural = kind === 'graph' ? 'graphs' : 'canvases';
  const icon: IconName = kind === 'graph' ? 'link' : 'grid';

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of nodes) m.set(n.canvas_id, (m.get(n.canvas_id) ?? 0) + 1);
    return m;
  }, [nodes]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = boards.filter((b) => b.kind === kind && (!term || b.name.toLowerCase().includes(term)));
    return list.sort((a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name));
  }, [boards, kind, q, desc]);

  const openMenu = (e: React.MouseEvent, b: Board) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: r.left - 150, y: r.bottom + 6, label: b.name,
      items: [
        { items: [{ label: 'Open', icon, run: () => onOpen(b) }] },
        { items: [{ label: 'Rename', icon: 'edit', run: () => onRename(b) }] },
        {
          label: 'Colour',
          items: COLOURS.map((c) => ({
            label: c.n, icon: 'palette' as IconName, run: () => onRecolour(b, c.v),
          })),
        },
        { items: [{ label: `Delete ${noun}`, icon: 'trash', danger: true, run: () => onDelete(b) }] },
      ],
    });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="project" label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'} />
      )}

      <div className="library-bar" style={{ paddingBottom: 0, borderBottom: 'none' }}>
        <div className="library-heading">
          <h1>{kind === 'graph' ? 'Graphs' : 'Whiteboards'}</h1>
          <span className="library-meta">{rows.length} {rows.length === 1 ? noun : plural}</span>
        </div>

        <label className="library-search" style={{ width: phone ? '100%' : 280 }}>
          <Icon name="search" size={15} color="var(--tx3)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find a ${noun}`}
            aria-label={`Find ${plural}`} />
        </label>

        <button onClick={() => setDesc((v) => !v)} className="library-icon-button hov tap"
          title={desc ? 'Sort Z to A' : 'Sort A to Z'} aria-label={desc ? 'Sort Z to A' : 'Sort A to Z'}
          style={{ width: 38, height: 38 }}>
          <Icon name="sort" size={15} color="var(--tx2)" />
        </button>

        {kind === 'graph' && onOpenAuto && (
          <button onClick={onOpenAuto} className="studio-button">
            <Icon name="layers" size={14} />All notes
          </button>
        )}

        <button onClick={onNew} className="studio-button primary">
          <Icon name={icon} size={15} />New {noun}
        </button>
      </div>

      <div className="navsb k-stagger" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'grid', alignItems: 'start', alignContent: 'start',
        gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: 14, paddingRight: 2,
      }}>
        {kind === 'graph' && onOpenAuto && !q.trim() && (
          <button onClick={onOpenAuto} className="board-tile k-squish">
            <span className="board-tile-art">
              <BoardPreview seed="basedly-auto-graph" kind="graph" />
            </span>
            <span className="board-tile-foot">
              <span className="notebook-spine" style={{ background: 'var(--studio-blue)' }} />
              <span className="board-tile-text">
                <strong>All notes</strong>
                <small className="library-meta">Graph · automatic</small>
              </span>
            </span>
          </button>
        )}

        {rows.map((b, i) => (
          <div
            key={b.id}
            role="button" tabIndex={0} aria-label={`Open ${b.name || noun}`}
            onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen(b);}}}
            className="board-tile k-squish"
            onClick={() => onOpen(b)}
            onContextMenu={(e) => { e.preventDefault(); openMenu(e, b); }}
            style={{ ['--i' as string]: i, cursor: 'pointer' }}
          >
            <span className="board-tile-art">
              <BoardPreview seed={b.id} color={b.color} kind={kind} />
              <button
                onClick={(e) => openMenu(e, b)} className="board-tile-menu hov"
                aria-label={`Actions for ${b.name}`} aria-haspopup="menu"
              >
                <Icon name="dots" size={14} color="var(--tx2)" />
              </button>
            </span>
            <span className="board-tile-foot">
              <span className="notebook-spine" style={{ background: b.color }} />
              <span className="board-tile-text">
                <strong>{b.name || `Untitled ${noun}`}</strong>
                <small className="library-meta">
                  {kind === 'graph' ? 'Graph' : 'Canvas'} · {counts.get(b.id) ?? 0} · {whenLabel(b.updated_at)}
                </small>
              </span>
            </span>
          </div>
        ))}

        {rows.length === 0 && (
          <div style={{
            gridColumn: '1 / -1', padding: '40px 16px', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascots/otter.svg" alt="" width={64} height={64} style={{ opacity: .9 }} />
            <div className="metaline">
              {q.trim() ? `No ${noun} matches “${q.trim()}”.` : `No ${plural} yet. Make one.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
