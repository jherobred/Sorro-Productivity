'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { whenLabel } from '@/lib/notes';
import type { Board, CNode } from '@/lib/canvas';

/**
 * The shelf for canvases and for graphs.
 *
 * Notebooks land you on a list and you pick one. Canvas and Graph did not —
 * they dropped you straight into whichever board happened to be last, so a
 * second canvas was something you had to already know existed before you could
 * reach it. Same shelf, same table, one kind at a time.
 *
 * The graph shelf carries one row it did not create: the automatic graph of
 * every note and the links between them. That view is not a board and has no
 * row in the table, but it is the thing most people mean by "the graph", so it
 * sits at the top rather than being replaced by the custom ones.
 */

const HEAD: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.02em',
  textAlign: 'left', padding: '9px 12px', whiteSpace: 'nowrap',
};

const NEW_BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 999,
  minHeight: 36, border: '1px solid var(--line2)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)',
};

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
    const r = e.currentTarget.getBoundingClientRect();
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onNew} className="tap acc" style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999,
          minHeight: 36, background: 'var(--acc)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700,
        }}>
          <Icon name={icon} size={15} color="var(--ink)" />New {noun}
        </button>

        {kind === 'graph' && onOpenAuto && (
          <button onClick={onOpenAuto} className="hov tap" style={NEW_BTN}>
            <Icon name="layers" size={14} color="var(--tx3)" />All notes
          </button>
        )}

        <button onClick={() => setDesc((v) => !v)} className="hov tap"
          title={desc ? 'Sort Z to A' : 'Sort A to Z'} aria-label={desc ? 'Sort Z to A' : 'Sort A to Z'}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
          <Icon name="sort" size={15} color="var(--tx2)" />
        </button>

        <label style={{
          marginLeft: phone ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8,
          flex: phone ? '1 1 100%' : '0 0 260px',
          padding: '0 12px', height: 36, borderRadius: 10, border: '1px solid var(--line2)', background: 'var(--card)',
        }}>
          <Icon name="search" size={14} color="var(--tx3)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find ${plural}`}
            aria-label={`Find ${plural}`}
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
              <th style={{ ...HEAD, width: 34 }} aria-label="Colour" />
              <th style={HEAD}>Title</th>
              {!phone && <th style={{ ...HEAD, width: 90 }}>Nodes</th>}
              <th style={{ ...HEAD, width: phone ? 74 : 120 }}>Updated</th>
              <th style={{ ...HEAD, width: 44 }} aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {kind === 'graph' && onOpenAuto && !q.trim() && (
              <tr onClick={onOpenAuto} className="hov" style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}>
                  <span aria-hidden style={{
                    width: 10, height: 10, borderRadius: 3, display: 'block',
                    background: 'var(--accTx)',
                  }} />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="layers" size={13} color="var(--tx3)" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>All notes</span>
                    <span className="kicker" style={{ letterSpacing: '.1em' }}>Automatic</span>
                  </div>
                </td>
                {!phone && <td style={{ padding: '10px 12px' }} className="metaline num">—</td>}
                <td style={{ padding: '10px 12px' }} className="metaline">Live</td>
                <td />
              </tr>
            )}

            {rows.map((b) => (
              <tr key={b.id} onClick={() => onOpen(b)} className="hov"
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '10px 12px' }}>
                  <span aria-hidden style={{
                    width: 10, height: 10, borderRadius: 3, display: 'block', background: b.color,
                  }} />
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Icon name={icon} size={13} color="var(--tx3)" />
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: 'var(--tx)', minWidth: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{b.name || `Untitled ${noun}`}</span>
                  </div>
                </td>
                {!phone && (
                  <td style={{ padding: '10px 12px' }} className="metaline num">{counts.get(b.id) ?? 0}</td>
                )}
                <td style={{ padding: '10px 12px' }} className="metaline">{whenLabel(b.updated_at)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <button onClick={(e) => openMenu(e, b)} className="hov"
                    aria-label={`Actions for ${b.name}`} aria-haspopup="menu"
                    style={{ width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center' }}>
                    <Icon name="dots" size={14} color="var(--tx3)" />
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 && (
              <tr>
                <td colSpan={phone ? 4 : 5} style={{ padding: '26px 12px', textAlign: 'center' }}>
                  <div className="metaline">
                    {q.trim() ? `No ${noun} matches “${q.trim()}”.` : `No ${plural} yet. Make one.`}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
