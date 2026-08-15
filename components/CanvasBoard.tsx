'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ContextMenu, type CtxItem } from './ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { useLayout } from '@/lib/useLayout';
import { toast } from '@/lib/toast';
import { ask } from '@/lib/ask';
import {
  useBoards, useNodes, useEdges, useCanvasActions, anchor, edgePath, bestSides, bounds,
  CANVAS_COLORS, type CNode, type CEdge, type Side,
} from '@/lib/canvas';

/**
 * An infinite canvas, built the way Obsidian's is.
 *
 * Coordinates: cards live in world space and never move when you pan or zoom.
 * The viewport is one {x, y, z} triple, and a single CSS transform on the world
 * layer does all the work — so a board with hundreds of cards costs the same to
 * pan as one with three, and text stays crisp because it is a transform rather
 * than a redraw.
 *
 *   screen = world * z + offset
 *   world  = (screen - offset) / z
 *
 * Gestures follow Obsidian: drag empty space or middle-drag to pan, wheel to
 * pan vertically, ctrl/⌘+wheel or pinch to zoom about the pointer, drag a card
 * to move it, drag its corner to resize, drag from a side dot to connect two
 * cards, marquee-select by dragging with shift, double-click empty space for a
 * new card, double-click a card to edit it.
 */

const MIN_Z = 0.1;
const MAX_Z = 4;
const GRID = 40;
const SNAP = 10;

type VP = { x: number; y: number; z: number };
type Sel = { nodes: string[]; edges: string[] };

type Gesture =
  | { g: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { g: 'move'; sx: number; sy: number; start: Record<string, { x: number; y: number }> }
  | { g: 'resize'; id: string; sx: number; sy: number; w: number; h: number }
  | { g: 'link'; from: string; side: Side; x: number; y: number; over: string | null }
  | { g: 'marquee'; sx: number; sy: number; x: number; y: number }
  | null;

export function CanvasBoard() {
  const { prefs } = usePrefs();
  const { phone } = useLayout();
  const wrap = useRef<HTMLDivElement>(null);

  const { data: boards = [] } = useBoards();
  const [boardId, setBoardId] = useState<string | null>(null);
  const board = boards.find((b) => b.id === boardId) ?? boards[0] ?? null;

  const { data: nodes = [] } = useNodes(board?.id ?? null);
  const { data: edges = [] } = useEdges(board?.id ?? null);
  const A = useCanvasActions(board?.id ?? null);

  const [vp, setVp] = useState<VP>({ x: 0, y: 0, z: 1 });
  const [sel, setSel] = useState<Sel>({ nodes: [], edges: [] });
  const [gesture, setGesture] = useState<Gesture>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[]; label: string; kind: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { x: number; y: number; w?: number; h?: number }>>({});

  useEffect(() => { if (board && board.id !== boardId) setBoardId(board.id); }, [board, boardId]);
  useEffect(() => {
    if (!board) return;
    setVp(board.viewport ?? { x: 0, y: 0, z: 1 });
    setSel({ nodes: [], edges: [] });
  }, [board?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------ coordinate space */

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = wrap.current?.getBoundingClientRect();
    return { x: ((cx - (r?.left ?? 0)) - vp.x) / vp.z, y: ((cy - (r?.top ?? 0)) - vp.y) / vp.z };
  }, [vp]);

  /** Zoom about a screen point, so whatever is under the pointer stays there. */
  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    setVp((v) => {
      const r = wrap.current?.getBoundingClientRect();
      const px = cx - (r?.left ?? 0);
      const py = cy - (r?.top ?? 0);
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * factor));
      return { z, x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z };
    });
  }, []);

  // The viewport is written back on a debounce — a pan fires hundreds of
  // updates and none of them are worth a round trip on their own.
  useEffect(() => {
    if (!board) return;
    const t = setTimeout(() => A.saveBoard.mutate({ id: board.id, patch: { viewport: vp } }), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vp, board?.id]);

  /**
   * Wheel handling, non-passive so preventDefault actually stops the page from
   * scrolling behind the board. A trackpad pinch arrives as a wheel event with
   * ctrlKey set — that is true in every browser, and it is why one handler
   * covers both the scroll wheel and the pinch.
   */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // 0.0025 puts one mouse notch (~100px) at about 1.28x, which is the step
      // Figma and Obsidian use. A trackpad pinch sends small deltas and lands on
      // the same curve, so both gestures feel like the same control.
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0025));
      else setVp((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /** Two-finger pinch on a touch screen. */
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ cx: (t[0].clientX + t[1].clientX) / 2, cy: (t[0].clientY + t[1].clientY) / 2 });

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch.current = { d: dist(e.touches), ...mid(e.touches) };
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch.current) return;
      e.preventDefault();
      const d = dist(e.touches);
      const m = mid(e.touches);
      zoomAt(m.cx, m.cy, d / pinch.current.d);
      pinch.current = { d, ...m };
    };
    const end = () => { pinch.current = null; };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
    };
  }, [zoomAt]);

  /* ------------------------------------------------------------- gestures */

  const nodeAt = (wx: number, wy: number): CNode | null => {
    // Topmost first, and groups last so a card inside a group still wins.
    const sorted = [...nodes].sort((a, b) => (b.kind === 'group' ? -1 : 0) - (a.kind === 'group' ? -1 : 0) || b.z - a.z);
    return sorted.find((n) => wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) ?? null;
  };

  const pos = (n: CNode) => drafts[n.id] ?? n;
  const view = (n: CNode): CNode => ({ ...n, ...(drafts[n.id] ?? {}) });

  const beginPan = (e: React.PointerEvent) => {
    setGesture({ g: 'pan', sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y });
  };

  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    setEditing(null);
    if (e.shiftKey) {
      const w = toWorld(e.clientX, e.clientY);
      setGesture({ g: 'marquee', sx: w.x, sy: w.y, x: w.x, y: w.y });
      return;
    }
    setSel({ nodes: [], edges: [] });
    beginPan(e);
  };

  const onNodeDown = (e: React.PointerEvent, n: CNode) => {
    e.stopPropagation();
    if (e.button === 2) return;
    if (e.button === 1) { beginPan(e); return; }

    const already = sel.nodes.includes(n.id);
    const next = e.shiftKey
      ? { nodes: already ? sel.nodes.filter((i) => i !== n.id) : [...sel.nodes, n.id], edges: [] }
      : already ? sel : { nodes: [n.id], edges: [] };
    setSel(next);

    const start: Record<string, { x: number; y: number }> = {};
    for (const id of next.nodes.length ? next.nodes : [n.id]) {
      const nn = nodes.find((m) => m.id === id);
      if (nn) start[id] = { x: pos(nn).x, y: pos(nn).y };
    }
    setGesture({ g: 'move', sx: e.clientX, sy: e.clientY, start });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!gesture) return;
    if (gesture.g === 'pan') {
      setVp((v) => ({ ...v, x: gesture.ox + (e.clientX - gesture.sx), y: gesture.oy + (e.clientY - gesture.sy) }));
      return;
    }
    if (gesture.g === 'move') {
      const dx = (e.clientX - gesture.sx) / vp.z;
      const dy = (e.clientY - gesture.sy) / vp.z;
      const snap = (v: number) => (e.altKey ? v : Math.round(v / SNAP) * SNAP);
      setDrafts((d) => {
        const next = { ...d };
        for (const [id, s] of Object.entries(gesture.start)) next[id] = { ...next[id], x: snap(s.x + dx), y: snap(s.y + dy) };
        return next;
      });
      return;
    }
    if (gesture.g === 'resize') {
      const dx = (e.clientX - gesture.sx) / vp.z;
      const dy = (e.clientY - gesture.sy) / vp.z;
      const n = nodes.find((m) => m.id === gesture.id);
      if (!n) return;
      setDrafts((d) => ({
        ...d,
        [gesture.id]: {
          x: pos(n).x, y: pos(n).y,
          w: Math.max(90, Math.round((gesture.w + dx) / SNAP) * SNAP),
          h: Math.max(56, Math.round((gesture.h + dy) / SNAP) * SNAP),
        },
      }));
      return;
    }
    if (gesture.g === 'link') {
      const w = toWorld(e.clientX, e.clientY);
      const over = nodeAt(w.x, w.y);
      setGesture({ ...gesture, x: w.x, y: w.y, over: over && over.id !== gesture.from ? over.id : null });
      return;
    }
    if (gesture.g === 'marquee') {
      const w = toWorld(e.clientX, e.clientY);
      setGesture({ ...gesture, x: w.x, y: w.y });
    }
  };

  const onPointerUp = () => {
    if (!gesture) return;

    if (gesture.g === 'move' || gesture.g === 'resize') {
      for (const [id, d] of Object.entries(drafts)) {
        const n = nodes.find((m) => m.id === id);
        if (!n) continue;
        const patch: Partial<CNode> = {};
        if (d.x !== n.x) patch.x = Math.round(d.x);
        if (d.y !== n.y) patch.y = Math.round(d.y);
        if (d.w !== undefined && d.w !== n.w) patch.w = Math.round(d.w);
        if (d.h !== undefined && d.h !== n.h) patch.h = Math.round(d.h);
        // Commit on drop, not per frame — one write per card that actually moved.
        if (Object.keys(patch).length) A.saveNode.mutate({ id, patch });
      }
      setDrafts({});
    }

    if (gesture.g === 'link' && gesture.over) {
      const from = nodes.find((n) => n.id === gesture.from)!;
      const to = nodes.find((n) => n.id === gesture.over)!;
      const [, toSide] = bestSides(from, to);
      A.addEdge.mutate({
        id: crypto.randomUUID(), canvas_id: board!.id,
        from_node: from.id, to_node: to.id,
        from_side: gesture.side, to_side: toSide,
        label: '', color: from.color || prefs.accent,
      });
    }

    if (gesture.g === 'marquee') {
      const x0 = Math.min(gesture.sx, gesture.x), x1 = Math.max(gesture.sx, gesture.x);
      const y0 = Math.min(gesture.sy, gesture.y), y1 = Math.max(gesture.sy, gesture.y);
      const hit = nodes.filter((n) => n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0).map((n) => n.id);
      setSel({ nodes: hit, edges: [] });
    }

    setGesture(null);
  };

  /* --------------------------------------------------------------- create */

  const addCard = (wx: number, wy: number, kind: CNode['kind'] = 'text') => {
    if (!board) return;
    const node: CNode = {
      id: crypto.randomUUID(), canvas_id: board.id, kind,
      text: kind === 'group' ? 'Group' : '',
      x: Math.round((wx - (kind === 'group' ? 160 : 90)) / SNAP) * SNAP,
      y: Math.round((wy - (kind === 'group' ? 110 : 40)) / SNAP) * SNAP,
      w: kind === 'group' ? 320 : 180, h: kind === 'group' ? 220 : 80,
      color: kind === 'group' ? CANVAS_COLORS[3] : prefs.accent,
      note_id: null, z: kind === 'group' ? -1 : nodes.length,
    };
    A.addNode.mutate(node);
    setSel({ nodes: [node.id], edges: [] });
    if (kind !== 'group') setEditing(node.id);
  };

  const centreOfView = () => {
    const r = wrap.current?.getBoundingClientRect();
    return toWorld((r?.left ?? 0) + (r?.width ?? 600) / 2, (r?.top ?? 0) + (r?.height ?? 400) / 2);
  };

  const fit = useCallback(() => {
    const b = bounds(nodes);
    const r = wrap.current?.getBoundingClientRect();
    if (!b || !r) return;
    const z = Math.min(MAX_Z, Math.max(MIN_Z, Math.min((r.width - 100) / Math.max(b.w, 1), (r.height - 100) / Math.max(b.h, 1))));
    setVp({ z, x: r.width / 2 - (b.x0 + b.w / 2) * z, y: r.height / 2 - (b.y0 + b.h / 2) * z });
  }, [nodes]);

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea/i.test((e.target as HTMLElement)?.tagName ?? '');
      if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.nodes.length || sel.edges.length)) {
        e.preventDefault();
        A.deleteSelection(sel.nodes, sel.edges);
        setSel({ nodes: [], edges: [] });
      }
      if (e.key === 'Escape') { setSel({ nodes: [], edges: [] }); setEditing(null); }
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSel({ nodes: nodes.map((n) => n.id), edges: [] }); }
      if (e.key === '=' || e.key === '+') { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); }
      if (e.key === '-') { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); }
      if (e.key === '0') fit();
      if (e.key === 'Enter' && sel.nodes.length === 1) setEditing(sel.nodes[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, nodes, A, fit, zoomAt]);

  /* --------------------------------------------------------------- render */

  const selSet = useMemo(() => new Set(sel.nodes), [sel.nodes]);
  const ordered = useMemo(() => [...nodes].sort((a, b) => (a.kind === 'group' ? -1 : 0) - (b.kind === 'group' ? -1 : 0) || a.z - b.z), [nodes]);

  const cardMenu = (n: CNode): CtxItem[] => [
    { label: 'Edit text', icon: 'edit', run: () => setEditing(n.id) },
    { label: 'Duplicate', icon: 'copy', run: () => A.addNode.mutate({ ...n, id: crypto.randomUUID(), x: n.x + 24, y: n.y + 24, z: nodes.length }) },
    { label: 'Bring to front', icon: 'up', run: () => A.saveNode.mutate({ id: n.id, patch: { z: nodes.length + 1 } }) },
    { label: 'Delete', icon: 'trash', run: () => A.deleteSelection([n.id], []), danger: true },
  ];

  if (!board) {
    return (
      <div style={{ ...PANEL, display: 'grid', placeItems: 'center', minHeight: 320, gap: 12 }}>
        <p style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No canvases yet.</p>
        <button onClick={() => A.newBoard.mutate({ id: crypto.randomUUID(), name: 'Untitled canvas', color: prefs.accent })}
          className="k-squish" style={{ ...BTN, background: 'var(--acc)', color: 'var(--ink)', border: 0 }}>
          <Icon name="plus" size={13} color="var(--ink)" />New canvas
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 10 }}>
      {/* ------------------------------------------------ canvas switcher */}
      <div className="hbar" style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', flex: 'none', paddingBottom: 2 }}>
        {boards.map((b) => {
          const on = b.id === board.id;
          return (
            <button key={b.id} onClick={() => setBoardId(b.id)} className="k-chip" aria-current={on ? 'true' : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  x: e.clientX, y: e.clientY, kind: 'node', label: b.name,
                  items: [
                    { label: 'Rename', icon: 'edit', run: () => void ask('Rename canvas', { initial: b.name, placeholder: 'Canvas name' }).then((n) => { if (n) A.saveBoard.mutate({ id: b.id, patch: { name: n } }); }) },
                    { label: 'Delete canvas', icon: 'trash', run: () => { A.delBoard.mutate({ id: b.id }); toast('Canvas deleted'); }, danger: true },
                  ],
                });
              }}
              style={{
                flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999,
                minHeight: 36, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
                border: `1px solid ${on ? 'var(--acc)' : 'var(--line2)'}`,
                background: on ? 'color-mix(in srgb, var(--acc) 16%, transparent)' : 'transparent',
                color: on ? 'var(--accTx)' : 'var(--tx2)',
              }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: b.color }} />
              {b.name}
            </button>
          );
        })}
        <button onClick={() => A.newBoard.mutate({ id: crypto.randomUUID(), name: `Canvas ${boards.length + 1}`, color: CANVAS_COLORS[boards.length % CANVAS_COLORS.length] })}
          className="hov k-squish" title="New canvas" aria-label="New canvas"
          style={{ flex: 'none', width: 34, height: 34, borderRadius: 999, border: '1px dashed var(--line2)', display: 'grid', placeItems: 'center' }}>
          <Icon name="plus" size={14} color="var(--tx3)" />
        </button>
      </div>

      {/* ------------------------------------------------------- the board */}
      <div style={{ ...PANEL, position: 'relative', flex: 1, minHeight: 360, overflow: 'hidden' }}>
        <div
          ref={wrap}
          onPointerDown={onBackgroundDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDoubleClick={(e) => { const w = toWorld(e.clientX, e.clientY); addCard(w.x, w.y); }}
          onContextMenu={(e) => {
            e.preventDefault();
            const w = toWorld(e.clientX, e.clientY);
            const hit = nodeAt(w.x, w.y);
            setMenu({
              x: e.clientX, y: e.clientY, kind: 'node',
              label: hit ? (hit.text.slice(0, 24) || 'Card') : 'Canvas',
              items: hit ? cardMenu(hit) : [
                { label: 'New card', icon: 'plus', run: () => addCard(w.x, w.y) },
                { label: 'New group', icon: 'layers', run: () => addCard(w.x, w.y, 'group') },
                { label: 'Zoom to fit', icon: 'zoomOut', run: fit },
                { label: 'Reset zoom', icon: 'target', run: () => setVp((v) => ({ ...v, z: 1 })) },
              ],
            });
          }}
          role="application"
          aria-label={`${board.name} canvas`}
          style={{
            position: 'absolute', inset: 0, touchAction: 'none', overflow: 'hidden',
            cursor: gesture?.g === 'pan' ? 'grabbing' : 'grab',
            // The dot grid is drawn in screen space but sized and offset from the
            // viewport, so it reads as part of the world without re-rendering.
            backgroundImage: 'radial-gradient(circle, var(--line2) 1px, transparent 1px)',
            backgroundSize: `${GRID * vp.z}px ${GRID * vp.z}px`,
            backgroundPosition: `${vp.x}px ${vp.y}px`,
          }}>

          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.z})`, transformOrigin: '0 0' }}>
            {/* edges under the cards */}
            <svg style={{ position: 'absolute', left: -20000, top: -20000, width: 40000, height: 40000, overflow: 'visible', pointerEvents: 'none' }}>
              <g transform="translate(20000, 20000)">
                {edges.map((e) => {
                  const from = nodes.find((n) => n.id === e.from_node);
                  const to = nodes.find((n) => n.id === e.to_node);
                  if (!from || !to) return null;
                  const a = anchor(view(from), e.from_side);
                  const b = anchor(view(to), e.to_side);
                  const on = sel.edges.includes(e.id);
                  return (
                    <g key={e.id} style={{ pointerEvents: 'stroke' }}>
                      {/* fat invisible stroke so the thin line is still clickable */}
                      <path d={edgePath(a, e.from_side, b, e.to_side)} stroke="transparent" strokeWidth={14} fill="none"
                        style={{ cursor: 'pointer' }}
                        onPointerDown={(ev) => { ev.stopPropagation(); setSel({ nodes: [], edges: [e.id] }); }}
                        onContextMenu={(ev) => {
                          ev.preventDefault(); ev.stopPropagation();
                          setMenu({
                            x: ev.clientX, y: ev.clientY, kind: 'node', label: e.label || 'Connection',
                            items: [
                              { label: 'Label…', icon: 'edit', run: () => void ask('Label this connection', { initial: e.label, placeholder: 'e.g. leads to' }).then((l) => { if (l !== null) A.saveEdge.mutate({ id: e.id, patch: { label: l } }); }) },
                              { label: 'Delete', icon: 'trash', run: () => A.deleteSelection([], [e.id]), danger: true },
                            ],
                          });
                        }} />
                      <path d={edgePath(a, e.from_side, b, e.to_side)} stroke={e.color} strokeWidth={on ? 3 : 2} fill="none"
                        markerEnd={`url(#arrow-${on ? 'on' : 'off'})`} opacity={on ? 1 : 0.8} />
                      {e.label && (
                        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle"
                          style={{ fill: 'var(--tx2)', fontSize: 11, fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 4 }}>
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* the edge being dragged */}
                {gesture?.g === 'link' && (() => {
                  const from = nodes.find((n) => n.id === gesture.from);
                  if (!from) return null;
                  const a = anchor(view(from), gesture.side);
                  return (
                    <path d={edgePath(a, gesture.side, { x: gesture.x, y: gesture.y }, 'left')}
                      stroke="var(--acc)" strokeWidth={2} strokeDasharray="6 4" fill="none" />
                  );
                })()}

                {gesture?.g === 'marquee' && (
                  <rect
                    x={Math.min(gesture.sx, gesture.x)} y={Math.min(gesture.sy, gesture.y)}
                    width={Math.abs(gesture.x - gesture.sx)} height={Math.abs(gesture.y - gesture.sy)}
                    fill="color-mix(in srgb, var(--acc) 12%, transparent)" stroke="var(--acc)" strokeWidth={1} />
                )}
              </g>

              <defs>
                {(['on', 'off'] as const).map((k) => (
                  <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={5} markerHeight={5} orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" opacity={k === 'on' ? 1 : 0.8} />
                  </marker>
                ))}
              </defs>
            </svg>

            {ordered.map((raw) => {
              const n = view(raw);
              const on = selSet.has(n.id);
              const isGroup = n.kind === 'group';
              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => onNodeDown(e, raw)}
                  onDoubleClick={(e) => { e.stopPropagation(); setEditing(n.id); }}
                  style={{
                    position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h,
                    borderRadius: isGroup ? 14 : 11,
                    background: isGroup ? `color-mix(in srgb, ${n.color} 7%, transparent)` : 'var(--card2)',
                    border: `${on ? 2 : 1}px solid ${on ? 'var(--acc)' : isGroup ? `color-mix(in srgb, ${n.color} 50%, transparent)` : 'var(--line2)'}`,
                    boxShadow: on ? 'var(--shl)' : isGroup ? 'none' : 'var(--sh)',
                    cursor: 'grab', userSelect: 'none',
                    transition: gesture ? 'none' : 'box-shadow .2s, border-color .2s',
                  }}>

                  {isGroup ? (
                    <div style={{ padding: '7px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '.02em', color: n.color }}>
                      {n.text || 'Group'}
                    </div>
                  ) : editing === n.id ? (
                    <textarea
                      autoFocus
                      defaultValue={n.text}
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={(e) => { A.saveNode.mutate({ id: n.id, patch: { text: e.target.value } }); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                      placeholder="Type…"
                      style={{
                        width: '100%', height: '100%', padding: '9px 11px', resize: 'none',
                        fontSize: 12, lineHeight: 1.45, fontFamily: 'inherit', color: 'var(--tx)',
                      }} />
                  ) : (
                    <div style={{ padding: '9px 11px', fontSize: 12, lineHeight: 1.45, fontWeight: 600, color: n.text ? 'var(--tx)' : 'var(--tx3)', overflow: 'hidden', height: '100%' }}>
                      {n.text || 'Empty card — double-click to write'}
                    </div>
                  )}

                  {/* colour stripe, so a glance groups the board */}
                  {!isGroup && (
                    <span aria-hidden style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 2, background: n.color }} />
                  )}

                  {/* side dots start an edge; corner grip resizes */}
                  {on && !isGroup && (['top', 'right', 'bottom', 'left'] as Side[]).map((side) => {
                    const p = anchor({ ...n, x: 0, y: 0 }, side);
                    return (
                      <span key={side} title={`Drag to connect (${side})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          const w = toWorld(e.clientX, e.clientY);
                          setGesture({ g: 'link', from: n.id, side, x: w.x, y: w.y, over: null });
                        }}
                        style={{
                          position: 'absolute', left: p.x - 5, top: p.y - 5, width: 10, height: 10, borderRadius: 5,
                          background: 'var(--acc)', border: '2px solid var(--card)', cursor: 'crosshair', zIndex: 2,
                        }} />
                    );
                  })}
                  {on && (
                    <span title="Drag to resize"
                      onPointerDown={(e) => { e.stopPropagation(); setGesture({ g: 'resize', id: n.id, sx: e.clientX, sy: e.clientY, w: n.w, h: n.h }); }}
                      style={{
                        position: 'absolute', right: -4, bottom: -4, width: 12, height: 12, borderRadius: 3,
                        background: 'var(--acc)', border: '2px solid var(--card)', cursor: 'nwse-resize', zIndex: 2,
                      }} />
                  )}

                  {gesture?.g === 'link' && gesture.over === n.id && (
                    <span aria-hidden style={{ position: 'absolute', inset: -3, borderRadius: 13, border: '2px dashed var(--acc)' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------- toolbars */}
        <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6, zIndex: 4, flexWrap: 'wrap' }}>
          <button onClick={() => { const c = centreOfView(); addCard(c.x, c.y); }} className="k-squish"
            style={{ ...BTN, background: 'var(--acc)', color: 'var(--ink)', border: 0 }}>
            <Icon name="plus" size={13} color="var(--ink)" />Card
          </button>
          <button onClick={() => { const c = centreOfView(); addCard(c.x, c.y, 'group'); }} className="hov k-squish" style={BTN}>
            <Icon name="layers" size={13} color="var(--tx2)" />Group
          </button>
        </div>

        {sel.nodes.length > 0 && (
          <div className="k-bloom" style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 14, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 14,
            background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', marginRight: 2 }}>
              {sel.nodes.length} selected
            </span>
            {CANVAS_COLORS.map((c) => (
              <button key={c} onClick={() => sel.nodes.forEach((id) => A.saveNode.mutate({ id, patch: { color: c } }))}
                aria-label={`Colour ${c}`} className="k-swatch"
                style={{ width: 20, height: 20, borderRadius: 6, background: c }} />
            ))}
            <button onClick={() => { A.deleteSelection(sel.nodes, sel.edges); setSel({ nodes: [], edges: [] }); }}
              className="hov k-squish" aria-label="Delete selection"
              style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', marginLeft: 3 }}>
              <Icon name="trash" size={13} color="var(--pal-coral)" />
            </button>
          </div>
        )}

        <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', alignItems: 'center', gap: 5, zIndex: 4 }}>
          <button onClick={() => { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); }}
            className="hov k-squish" aria-label="Zoom out" style={ICON_BTN}>
            <Icon name="zoomOut" size={14} color="var(--tx2)" />
          </button>
          <button onClick={() => setVp((v) => ({ ...v, z: 1 }))} className="hov k-squish" title="Reset zoom"
            style={{ ...ICON_BTN, width: 52, fontSize: 10.5, fontWeight: 700, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(vp.z * 100)}%
          </button>
          <button onClick={() => { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); }}
            className="hov k-squish" aria-label="Zoom in" style={ICON_BTN}>
            <Icon name="zoomIn" size={14} color="var(--tx2)" />
          </button>
          <button onClick={fit} className="hov k-squish" aria-label="Zoom to fit" style={ICON_BTN}>
            <Icon name="target" size={14} color="var(--tx2)" />
          </button>
        </div>

        {nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.8 }}>
              Double-click anywhere to drop a card.<br />
              {!phone && <span style={{ fontSize: 11 }}>Drag to pan · {navigator?.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+scroll to zoom · shift-drag to select</span>}
            </div>
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind={menu.kind} label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'} />
      )}
    </div>
  );
}

const PANEL: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)' };
const BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9,
  border: '1px solid var(--line2)', background: 'var(--card2)',
  fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', minHeight: 34,
};
const ICON_BTN: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card2)',
  display: 'grid', placeItems: 'center',
};
