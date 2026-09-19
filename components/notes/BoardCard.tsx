'use client';

/**
 * A card on a board, drawn the way Obsidian's canvas draws one: a rounded card
 * edged in its colour, a photo on top when it has one, a title, and free text
 * under it. Any of its four sides starts a connection, and connections leave
 * from whichever sides of the two cards face each other, so moving a card
 * never leaves an arrow wrapped round the back of it.
 *
 * Cards made before this held their text as a list of fields. Those still read
 * as lines of text here, and become the card's text the first time it is edited.
 */

import type { PointerEvent as PE } from 'react';
import type { BoardItem } from '@/lib/pageKinds';
import { usePageAssetUrl } from '@/lib/pageAssets';

/** Obsidian's six card colours, plus none. */
export const CARD_COLORS = [
  { name: 'Grey', value: '' },
  { name: 'Red', value: '#e5484d' },
  { name: 'Orange', value: '#f76b15' },
  { name: 'Yellow', value: '#e2a400' },
  { name: 'Green', value: '#30a46c' },
  { name: 'Cyan', value: '#12a5b8' },
  { name: 'Purple', value: '#8e4ec6' },
];

export type Side = 'top' | 'right' | 'bottom' | 'left';
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const OUT: Record<Side, { x: number; y: number }> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
type Box = Pick<BoardItem, 'x' | 'y' | 'w' | 'h'>;
type Point = { x: number; y: number };

const anchor = (b: Box, side: Side): Point =>
  side === 'top' ? { x: b.x + b.w / 2, y: b.y } : side === 'right' ? { x: b.x + b.w, y: b.y + b.h / 2 }
    : side === 'bottom' ? { x: b.x + b.w / 2, y: b.y + b.h } : { x: b.x, y: b.y + b.h / 2 };

/** A curve that leaves `from` straight out of its side and arrives at `to` straight into its own. */
function bend(p: Point, sp: Side, q: Point, sq: Side | null): string {
  const reach = Math.max(36, Math.hypot(q.x - p.x, q.y - p.y) / 2.4);
  const c1 = { x: p.x + OUT[sp].x * reach, y: p.y + OUT[sp].y * reach };
  const c2 = sq ? { x: q.x + OUT[sq].x * reach, y: q.y + OUT[sq].y * reach } : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return `M${p.x},${p.y}C${c1.x},${c1.y} ${c2.x},${c2.y} ${q.x},${q.y}`;
}

/** The connection between two items, from the pair of sides closest to each other. */
export function linkPath(a: Box, b: Box): string {
  let best = { d: Infinity, sa: 'right' as Side, sb: 'left' as Side };
  for (const sa of SIDES) for (const sb of SIDES) {
    const p = anchor(a, sa), q = anchor(b, sb);
    // A side facing away from the other card is only used when nothing else is shorter.
    const away = (OUT[sa].x * (q.x - p.x) + OUT[sa].y * (q.y - p.y) < 0 ? 60 : 0) + (OUT[sb].x * (p.x - q.x) + OUT[sb].y * (p.y - q.y) < 0 ? 60 : 0);
    const d = Math.hypot(q.x - p.x, q.y - p.y) + away;
    if (d < best.d) best = { d, sa, sb };
  }
  return bend(anchor(a, best.sa), best.sa, anchor(b, best.sb), best.sb);
}

/** The connection being dragged out of a card, to wherever the pointer is. */
export function wirePath(a: Box, to: Point): string {
  let side: Side = 'right', d = Infinity;
  for (const s of SIDES) { const p = anchor(a, s); const e = Math.hypot(to.x - p.x, to.y - p.y); if (e < d) { d = e; side = s; } }
  return bend(anchor(a, side), side, to, null);
}

/** The card's text: its own, or the fields an older card was written with. */
export const cardText = (item: BoardItem) => item.body ?? (item.fields ?? []).filter((f) => f.trim()).join('\n');

function CardPhoto({ item }: { item: BoardItem }) {
  const { url, error } = usePageAssetUrl(item.photo);
  return url ? <img src={url} alt={item.photo?.name || 'Card photo'} draggable={false} /> : <span className="card-photo-wait">{error || 'Loading photo…'}</span>;
}

export function CardNode({ item, editing, onTitle, onText, onDoneEditing, onWire }: {
  item: BoardItem;
  editing: boolean;
  onTitle: (title: string) => void;
  onText: (text: string) => void;
  onDoneEditing: () => void;
  onWire: (e: PE) => void;
}) {
  const text = cardText(item);
  return (
    <div className={'card-node' + (item.color ? ' is-coloured' : '')} style={{ '--edge': item.color || 'var(--line2)' } as React.CSSProperties}>
      {item.photo && <div className="card-photo"><CardPhoto item={item} /></div>}
      <input className="card-title" aria-label="Card title" placeholder="Title" value={item.title ?? ''}
        onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onTitle(e.target.value)} />
      {editing
        ? <textarea className="card-text" autoFocus aria-label="Card text" placeholder="Write on the card…" value={text}
            onFocus={(e) => { const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end); }}
            onPointerDown={(e) => e.stopPropagation()} onChange={(e) => onText(e.target.value)} onBlur={onDoneEditing}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }} />
        : <div className={'card-text' + (text ? '' : ' is-empty')}>{text || 'Double-click to write'}</div>}
      {SIDES.map((side) => (
        <button key={side} type="button" className={'card-port is-' + side} aria-label={`Connect from the ${side} of this card`} onPointerDown={onWire} />
      ))}
    </div>
  );
}
