'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { linkGraph, type Note, type Notebook } from '@/lib/notes';
import {
  useBoards, useAllNodes, useAllEdges, useCanvasActions,
  CANVAS_COLORS, DEFAULT_GRAPH, type Board, type GraphSettings,
} from '@/lib/canvas';
import { buildGraph, degrees, neighbours, type GEdge, type GNode } from '@/lib/graph';
import { BoardList, PANEL, BTN, ICON_BTN } from './Canvas';

/**
 * The graph view — Obsidian's, and a kind of note in its own right.
 *
 * Two things it is, that the old one was not:
 *
 * **It draws the canvases.** Every board is a hub, every card on it a dot on a
 * spoke, and the connections you drew between cards are the lines between them.
 * Cards that embed a note reach across to the notebook, and notes reach to each
 * other through their `[[links]]`. The old graph knew only about notes, so a
 * board full of work showed up as nothing at all.
 *
 * **There can be more than one.** A graph view is a saved row like a canvas is
 * — its own name, colour, viewport and set of switches — so "everything" and
 * "just the thesis boards" are two saved views rather than a toggle you have to
 * set again every time.
 *
 * Canvas 2D rather than SVG or DOM: the whole scene is redrawn every frame
 * while the simulation is warm, and a few hundred DOM nodes that all move at
 * once is the one thing browsers are bad at.
 *
 * ponytail: O(n²) repulsion, recomputed each tick. Fine to a few hundred dots;
 * past that this wants a Barnes-Hut quadtree.
 */

const REPULSION = 3600;
const SPRING = 0.014;
const CENTRE_PULL = 0.005;
const DAMPING = 0.86;
const COOL = 0.994;

/** How far apart each kind of edge wants its ends. Spokes sit closest. */
const REST: Record<GEdge['kind'], number> = { holds: 74, embeds: 104, links: 132 };

type P = {
  id: string; x: number; y: number; vx: number; vy: number;
  r: number; color: string; title: string; kind: GNode['kind']; ref: string;
};

export function GraphView({
  notes, notebooks, phone, onOpenNote, onOpenBoard,
}: {
  notes: Note[];
  notebooks: Notebook[];
  phone: boolean;
  onOpenNote: (id: string) => void;
  onOpenBoard: (id: string) => void;
}) {
  const { prefs } = usePrefs();
  const { data: allBoards = [] } = useBoards();
  const graphs = useMemo(() => allBoards.filter((b) => b.kind === 'graph'), [allBoards]);
  const canvases = useMemo(() => allBoards.filter((b) => b.kind !== 'graph'), [allBoards]);

  const [graphId, setGraphId] = useState<string | null>(null);
  const graph = graphs.find((b) => b.id === graphId) ?? null;
  const A = useCanvasActions(null);

  useEffect(() => {
    if (!phone && !graph && graphs.length) setGraphId(graphs[0].id);
    if (graphId && !graphs.some((b) => b.id === graphId)) setGraphId(null);
  }, [phone, graph, graphs, graphId]);

  const newGraph = () => {
    const id = crypto.randomUUID();
    A.newBoard.mutate({
      id, name: graphs.length ? `Graph ${graphs.length + 1}` : 'Everything', kind: 'graph',
      color: CANVAS_COLORS[(graphs.length + 2) % CANVAS_COLORS.length],
      position: graphs.length, viewport: { x: 0, y: 0, z: 1 }, settings: DEFAULT_GRAPH,
    });
    setGraphId(id);
  };

  const list = (
    <BoardList
      boards={graphs} selected={graph?.id ?? null} phone={phone} newLabel="New graph"
      onPick={setGraphId} onNew={newGraph}
      onRename={(b) => void ask('Rename graph', { initial: b.name, placeholder: 'Graph name' })
        .then((n) => { if (n) A.saveBoard.mutate({ id: b.id, patch: { name: n } }); })}
      onColor={(b, color) => A.saveBoard.mutate({ id: b.id, patch: { color } })}
      onDelete={(b) => void confirmAsk(`Delete “${b.name}”?`, {
        message: 'Only the saved view goes — your canvases and notes are untouched.',
        confirmLabel: 'Delete', danger: true,
      }).then((yes) => {
        if (!yes) return;
        A.delBoard.mutate({ id: b.id });
        toast(`Deleted “${b.name}”`, () => A.restoreBoard.mutate({ id: b.id }));
      })} />
  );

  const empty = (
    <div style={{ ...PANEL, flex: 1, display: 'grid', placeItems: 'center', minHeight: 320 }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10, textAlign: 'center', padding: 20 }}>
        <p style={{ fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.7 }}>
          No graph views yet.<br />
          <span style={{ fontSize: 11 }}>A graph view is a saved picture of your canvases and notes.</span>
        </p>
        <button onClick={newGraph} className="k-squish" style={{ ...BTN, background: 'var(--acc)', color: 'var(--ink)', border: 0 }}>
          <Icon name="plus" size={13} color="var(--ink)" />New graph
        </button>
      </div>
    </div>
  );

  const board = graph ? (
    <Scene
      key={graph.id} graph={graph} boards={canvases} notes={notes} notebooks={notebooks} phone={phone}
      accent={prefs.accent}
      onSettings={(patch) => A.saveBoard.mutate({ id: graph.id, patch: { settings: { ...DEFAULT_GRAPH, ...graph.settings, ...patch } } })}
      onOpenNote={onOpenNote} onOpenBoard={onOpenBoard}
      onBack={phone ? () => setGraphId(null) : undefined} />
  ) : empty;

  if (phone) {
    return graph
      ? board
      : <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{graphs.length ? list : empty}</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
      <aside className="navsb" style={{ width: 196, flex: 'none', overflowY: 'auto', minHeight: 0 }}>{list}</aside>
      {board}
    </div>
  );
}

/* ------------------------------------------------------------------ scene */

function Scene({
  graph, boards, notes, notebooks, phone, accent, onSettings, onOpenNote, onOpenBoard, onBack,
}: {
  graph: Board;
  boards: Board[];
  notes: Note[];
  notebooks: Notebook[];
  phone: boolean;
  accent: string;
  onSettings: (patch: Partial<GraphSettings>) => void;
  onOpenNote: (id: string) => void;
  onOpenBoard: (id: string) => void;
  onBack?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const particles = useRef<P[]>([]);
  const alpha = useRef(1);
  const view = useRef({ x: 0, y: 0, z: 1 });
  const drag = useRef<{ id: string | null; sx: number; sy: number; moved: boolean; ox: number; oy: number } | null>(null);
  /** Set by anything that changes the picture while the simulation is cold. */
  const dirty = useRef(true);
  const [hover, setHover] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const s: GraphSettings = { ...DEFAULT_GRAPH, ...graph.settings };

  const { data: cards = [] } = useAllNodes();
  const { data: cardEdges = [] } = useAllEdges();

  const { nodes, edges } = useMemo(() => {
    // Cards outlive their board: deleting a canvas only stamps deleted_at, and
    // the cards are still there to be read. Drawing them would put a cluster of
    // orphans on the graph for a board nobody can open.
    const live = new Set(boards.map((b) => b.id));
    return buildGraph({
      boards: boards.map((b) => ({ id: b.id, name: b.name, color: b.color })),
      cards: cards.filter((c) => live.has(c.canvas_id)),
      cardEdges,
      notes: notes.map((n) => ({ id: n.id, title: n.title, notebook_id: n.notebook_id })),
      noteLinks: linkGraph(notes),
      notebookColor: Object.fromEntries(notebooks.map((b) => [b.id, b.color])),
    }, { canvases: s.canvases, cards: s.cards, notes: s.notes, orphans: s.orphans });
  }, [boards, cards, cardEdges, notes, notebooks, s.canvases, s.cards, s.notes, s.orphans]);

  const degree = useMemo(() => degrees(edges), [edges]);
  const lit = useMemo(() => (hover ? neighbours(edges, hover) : null), [edges, hover]);
  const litRef = useRef<Set<string> | null>(null);
  litRef.current = lit;

  /* Build (and keep) the particle set. A node already on screen keeps its
     position, so adding one card does not re-throw the whole picture. */
  useEffect(() => {
    const prev = new Map(particles.current.map((p) => [p.id, p]));
    const r = wrap.current?.getBoundingClientRect();
    const cx = (r?.width ?? 600) / 2;
    const cy = (r?.height ?? 400) / 2;

    particles.current = nodes.map((n, i) => {
      const at = prev.get(n.id);
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const deg = degree.get(n.id) ?? 0;
      const base = n.kind === 'canvas' ? 6 : n.kind === 'note' ? 4 : 3.4;
      return {
        id: n.id,
        x: at?.x ?? cx + Math.cos(angle) * 170,
        y: at?.y ?? cy + Math.sin(angle) * 170,
        vx: 0, vy: 0,
        r: base + Math.min(10, deg * (n.kind === 'canvas' ? 0.7 : 1.5)),
        color: n.color, title: n.title, kind: n.kind, ref: n.ref,
      };
    });
    alpha.current = 1;
    dirty.current = true;
  }, [nodes, degree]);

  /* The simulation and the draw share one loop. */
  useEffect(() => {
    const cv = canvas.current;
    const box = wrap.current;
    if (!cv || !box) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const size = () => {
      dirty.current = true;
      const r = box.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    const css = getComputedStyle(document.documentElement);
    const line = css.getPropertyValue('--line2').trim() || 'rgba(150,150,180,.25)';
    const tx = css.getPropertyValue('--tx2').trim() || '#999';

    const tick = () => {
      const ps = particles.current;
      const r = box.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      const moving = alpha.current > 0.005;

      // A settled graph is a still picture. Redrawing it sixty times a second
      // costs a phone its battery for nothing.
      if (!moving && !dirty.current) { raf = requestAnimationFrame(tick); return; }
      dirty.current = false;

      const byId = new Map(ps.map((p) => [p.id, p]));

      if (moving) {
        const repel = REPULSION * s.spread * s.spread;
        for (let i = 0; i < ps.length; i++) {
          const a = ps[i];
          for (let j = i + 1; j < ps.length; j++) {
            const b = ps[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d2 = Math.max(64, dx * dx + dy * dy);
            const f = repel / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            a.vx -= fx; a.vy -= fy;
            b.vx += fx; b.vy += fy;
          }
          a.vx += (cx - a.x) * CENTRE_PULL;
          a.vy += (cy - a.y) * CENTRE_PULL;
        }

        for (const e of edges) {
          const a = byId.get(e.from), b = byId.get(e.to);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = (d - REST[e.kind] * s.spread) * SPRING;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }

        for (const p of ps) {
          if (drag.current?.id === p.id) { p.vx = 0; p.vy = 0; continue; }
          p.vx *= DAMPING; p.vy *= DAMPING;
          p.x += p.vx * alpha.current;
          p.y += p.vy * alpha.current;
        }
        alpha.current *= COOL;
      }

      /* ------------------------------------------------------------ draw */
      const near = litRef.current;
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.save();
      ctx.translate(view.current.x, view.current.y);
      ctx.scale(view.current.z, view.current.z);

      for (const e of edges) {
        const a = byId.get(e.from), b = byId.get(e.to);
        if (!a || !b) continue;
        const on = !near || (near.has(a.id) && near.has(b.id));
        ctx.strokeStyle = on && near ? accent : line;
        ctx.globalAlpha = near ? (on ? 0.95 : 0.12) : e.kind === 'holds' ? 0.4 : 0.6;
        ctx.lineWidth = e.kind === 'links' ? 1.4 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const labels = s.labels && (view.current.z > 0.45 || ps.length < 50);
      ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (const p of ps) {
        const on = !near || near.has(p.id);
        ctx.globalAlpha = on ? 1 : 0.22;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color.startsWith('#') ? p.color : accent;
        ctx.fill();
        // A board is the hub of its cluster, so it gets a ring the cards do not.
        if (p.kind === 'canvas') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 3.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (hover === p.id) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (labels) {
          ctx.globalAlpha = on ? 0.9 : 0.15;
          ctx.fillStyle = tx;
          const t = p.title.length > 24 ? `${p.title.slice(0, 23)}…` : p.title;
          ctx.fillText(t, p.x, p.y + p.r + 12);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      raf = requestAnimationFrame(tick);
    };
    // Draw the first frame now rather than waiting for a frame callback: a tab
    // that is not compositing yet never gets one, and would show a blank board.
    tick();

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [edges, hover, accent, s.spread, s.labels]);

  /* ------------------------------------------------------------- pointer */

  const at = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.current.x) / view.current.z,
      y: (e.clientY - r.top - view.current.y) / view.current.z,
    };
  };

  const hit = (wx: number, wy: number) =>
    particles.current.find((p) => Math.hypot(p.x - wx, p.y - wy) <= p.r + 8) ?? null;

  const onDown = (e: React.PointerEvent) => {
    dirty.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const w = at(e);
    const p = hit(w.x, w.y);
    drag.current = {
      id: p?.id ?? null, sx: e.clientX, sy: e.clientY, moved: false,
      ox: p ? p.x : view.current.x, oy: p ? p.y : view.current.y,
    };
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) {
      const w = at(e);
      const p = hit(w.x, w.y);
      setHover(p?.id ?? null);
      dirty.current = true;
      return;
    }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.hypot(dx, dy) > 3) d.moved = true;
    dirty.current = true;
    if (d.id) {
      const p = particles.current.find((n) => n.id === d.id);
      if (p) { p.x = d.ox + dx / view.current.z; p.y = d.oy + dy / view.current.z; }
      alpha.current = Math.max(alpha.current, 0.35);
    } else {
      view.current = { ...view.current, x: d.ox + dx, y: d.oy + dy };
    }
  };

  const open = useCallback((id: string) => {
    const p = particles.current.find((n) => n.id === id);
    if (!p) return;
    if (p.kind === 'note') { onOpenNote(p.ref); return; }
    if (p.kind === 'canvas') { onOpenBoard(p.ref); return; }
    // A card: open the board it sits on, which is where you can act on it.
    const card = cards.find((c) => c.id === p.ref);
    if (card) onOpenBoard(card.canvas_id);
  }, [cards, onOpenNote, onOpenBoard]);

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.id && !d.moved) open(d.id);
  };

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dirty.current = true;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const v = view.current;
      const z = Math.min(3, Math.max(0.15, v.z * Math.exp(-e.deltaY * 0.0018)));
      view.current = { z, x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z };
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const recentre = () => { view.current = { x: 0, y: 0, z: 1 }; alpha.current = 1; dirty.current = true; };

  const counts = useMemo(() => ({
    canvas: nodes.filter((n) => n.kind === 'canvas').length,
    card: nodes.filter((n) => n.kind === 'card').length,
    note: nodes.filter((n) => n.kind === 'note').length,
  }), [nodes]);

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        {onBack && (
          <button onClick={onBack} className="hov" aria-label="All graphs"
            style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
            <Icon name="back" size={14} color="var(--tx2)" />
          </button>
        )}
        <span style={{ width: 8, height: 8, borderRadius: 3, background: graph.color, flex: 'none' }} />
        <div style={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {graph.name}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
          {counts.canvas} canvas · {counts.card} cards · {counts.note} notes · {edges.length} links
        </div>
      </div>

      <div style={{ ...PANEL, position: 'relative', flex: 1, minHeight: phone ? 380 : 320, overflow: 'hidden' }}>
        <div ref={wrap}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          onPointerLeave={() => { drag.current = null; setHover(null); dirty.current = true; }}
          style={{
            position: 'absolute', inset: 0, touchAction: 'none',
            cursor: hover ? 'pointer' : 'grab',
          }}>
          <canvas ref={canvas} style={{ display: 'block' }} />
        </div>

        <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', gap: 5, zIndex: 3 }}>
          <button onClick={() => setShowSettings((v) => !v)} className="hov k-squish" aria-pressed={showSettings}
            aria-label="Graph settings" style={ICON_BTN}>
            <Icon name="cog" size={14} color="var(--tx2)" />
          </button>
          <button onClick={recentre} className="hov k-squish" aria-label="Re-centre" style={ICON_BTN}>
            <Icon name="target" size={14} color="var(--tx2)" />
          </button>
        </div>

        {showSettings && (
          <div className="k-bloom" style={{
            position: 'absolute', right: 12, top: 52, zIndex: 4, width: 208, padding: 12,
            borderRadius: 14, background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
            display: 'flex', flexDirection: 'column', gap: 9,
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
              What to draw
            </div>
            <Toggle label="Canvases" on={s.canvases} onChange={(v) => onSettings({ canvases: v })} />
            <Toggle label="Cards" on={s.cards} onChange={(v) => onSettings({ cards: v })} />
            <Toggle label="Notes" on={s.notes} onChange={(v) => onSettings({ notes: v })} />
            <Toggle label="Unlinked" on={s.orphans} onChange={(v) => onSettings({ orphans: v })} />
            <Toggle label="Labels" on={s.labels} onChange={(v) => onSettings({ labels: v })} />
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--tx3)' }}>Spread</span>
              <input type="range" min={0.5} max={2} step={0.1} value={s.spread}
                onChange={(e) => { alpha.current = 1; onSettings({ spread: Number(e.target.value) }); }}
                style={{ accentColor: 'var(--acc)' }} />
            </label>
          </div>
        )}

        {hover && (() => {
          const p = particles.current.find((n) => n.id === hover);
          if (!p) return null;
          return (
            <div style={{
              position: 'absolute', left: 12, bottom: 12, zIndex: 3, maxWidth: 'calc(100% - 24px)',
              padding: '6px 10px', borderRadius: 10, background: 'var(--card2)',
              border: '1px solid var(--line2)', fontSize: 11, color: 'var(--tx2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <b style={{ color: 'var(--accTx)' }}>{p.kind === 'canvas' ? 'Canvas' : p.kind === 'note' ? 'Note' : 'Card'}</b>
              {' · '}{p.title}
            </div>
          );
        })()}

        {nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.9 }}>
              Nothing to draw yet.<br />
              <span style={{ fontSize: 11 }}>Put cards on a canvas, or link notes with [[double brackets]].</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} className="hov" style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 8,
      fontSize: 11.5, fontWeight: 600, color: on ? 'var(--tx)' : 'var(--tx3)', textAlign: 'left',
    }}>
      <span style={{
        width: 26, height: 15, borderRadius: 999, flex: 'none', position: 'relative',
        background: on ? 'var(--acc)' : 'var(--line2)', transition: 'background .2s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 13 : 2, width: 11, height: 11, borderRadius: '50%',
          background: on ? '#0C0F16' : 'var(--tx3)', transition: 'left .2s',
        }} />
      </span>
      {label}
    </button>
  );
}
