'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../Icon';
import { ContextMenu, type CtxGroup } from '../ContextMenu';
import { ColorPicker } from '../ColorPicker';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { whenLabel } from '@/lib/notes';
import { ProgBlur } from '../core/ProgBlur';
import { NotebookCover } from './NotebookCover';
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
  const [picker, setPicker] = useState<{ x: number; y: number; value: string; apply: (c: string) => void } | null>(null);

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
        { items: [{
          label: 'Colour', icon: 'palette' as IconName, swatch: b.color,
          run: () => setPicker({ x: r.left - 150, y: r.bottom + 6, value: b.color, apply: (c) => onRecolour(b, c) }),
        }] },
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
      {picker && (
        <ColorPicker x={picker.x} y={picker.y} value={picker.value}
          onChange={picker.apply} onClose={() => setPicker(null)} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={onNew} className="tap acc k-glass" style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 15px', borderRadius: 999,
          minHeight: 38, background: 'var(--acc)', color: 'var(--accInk)', fontSize: 12.5, fontWeight: 800,
        }}>
          <Icon name={icon} size={15} color="var(--accInk)" />New {noun}
        </button>

        {kind === 'graph' && onOpenAuto && (
          <button onClick={onOpenAuto} className="hov tap k-squish" style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999,
            minHeight: 38, border: '1px solid var(--line2)', background: 'var(--card)', fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)',
          }}>
            <Icon name="layers" size={14} color="var(--tx2)" />All notes
          </button>
        )}

        <button onClick={() => setDesc((v) => !v)} className="hov tap"
          title={desc ? 'Sort Z to A' : 'Sort A to Z'} aria-label={desc ? 'Sort Z to A' : 'Sort A to Z'}
          style={{ width: 38, height: 38, borderRadius: 'var(--r-sm)', border: '1px solid var(--line2)', background: 'var(--card)', display: 'grid', placeItems: 'center' }}>
          <Icon name="sort" size={15} color="var(--tx2)" />
        </button>

        <label style={{
          marginLeft: phone ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 8,
          flex: phone ? '1 1 100%' : '0 0 260px',
          padding: '0 13px', height: 38, borderRadius: 'var(--r-sm)', border: '1px solid var(--line2)', background: 'var(--card)',
        }}>
          <Icon name="search" size={14} color="var(--tx3)" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Find ${plural}`}
            aria-label={`Find ${plural}`}
            style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--tx)', fontFamily: 'inherit' }} />
        </label>
      </div>

      <div className="navsb k-stagger" style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        display: 'grid', alignItems: 'start', alignContent: 'start',
        gridTemplateColumns: phone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(225px, 1fr))',
        gap: 12, paddingRight: 2,
      }}>
        {kind === 'graph' && onOpenAuto && !q.trim() && (
          <button onClick={onOpenAuto} className="clay k-squish" style={{
            position: 'relative', overflow: 'hidden', padding: 0, textAlign: 'left',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 132, width: '100%',
          }}>
            <NotebookCover seed="basedly-auto-graph" />
            <span style={{
              position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 8,
              display: 'grid', placeItems: 'center',
              background: 'color-mix(in srgb, var(--card) 62%, transparent)',
              border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            }}>
              <Icon name="layers" size={12} color="var(--tx2)" />
            </span>
            <ProgBlur edge="bottom" size={56} strength={12} />
            <span style={{ position: 'relative', padding: '9px 11px 10px', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--tx)' }}>All notes</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
                Automatic
              </span>
            </span>
          </button>
        )}

        {rows.map((b, i) => (
          <div
            key={b.id}
            className="clay k-squish"
            onClick={() => onOpen(b)}
            onContextMenu={(e) => { e.preventDefault(); openMenu(e, b); }}
            style={{
              ['--i' as string]: i,
              position: 'relative', overflow: 'hidden', padding: 0, textAlign: 'left', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minHeight: 132, width: '100%',
            }}
          >
            <NotebookCover seed={b.id} color={b.color} />
            <span style={{
              position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 8,
              display: 'grid', placeItems: 'center',
              background: 'color-mix(in srgb, var(--card) 62%, transparent)',
              border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            }}>
              <Icon name={icon} size={12} color="var(--tx2)" />
            </span>
            <button
              onClick={(e) => openMenu(e, b)} className="hov"
              aria-label={`Actions for ${b.name}`} aria-haspopup="menu"
              style={{
                position: 'absolute', top: 6, right: 6, width: 30, height: 30, borderRadius: 9,
                display: 'grid', placeItems: 'center',
                background: 'color-mix(in srgb, var(--card) 62%, transparent)',
                border: '1px solid var(--line2)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              }}
            >
              <Icon name="dots" size={14} color="var(--tx2)" />
            </button>
            <ProgBlur edge="bottom" size={56} strength={12} />
            <span style={{ position: 'relative', padding: '9px 11px 10px', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{
                fontSize: 12.5, fontWeight: 800, color: 'var(--tx)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {b.name || `Untitled ${noun}`}
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                {kind === 'graph' ? 'Graph' : 'Canvas'} · {counts.get(b.id) ?? 0} · {whenLabel(b.updated_at)}
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
