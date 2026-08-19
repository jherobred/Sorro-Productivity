'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { usePrefs } from '@/lib/prefs';
import { linkGraph, type Note, type Notebook } from '@/lib/notes';

/**
 * Obsidian's graph view.
 *
 * Every note is a dot, every `[[link]]` an edge, and a force simulation settles
 * them: linked notes pull together, everything pushes apart, and the whole
 * drifts to the middle. Dots are sized by how many notes point at them, so the
 * hubs — the pages everything else references — are visible without reading a
 * single label.
 *
 * Canvas rather than SVG because the whole scene is redrawn every frame while
 * the simulation is warm, and because a few hundred DOM nodes that all move at
 * once is the one thing browsers are bad at.
 *
 * ponytail: O(n²) repulsion, recomputed each tick. That is fine to a few
 * hundred notes; past that this wants a Barnes-Hut quadtree.
 */

const REPULSION = 3400;
const SPRING = 0.012;
const SPRING_LEN = 110;
const CENTRE_PULL = 0.006;
const DAMPING = 0.86;
const COOL = 0.994;

type P = { id: string; x: number; y: number; vx: number; vy: number; r: number; color: string; title: string };

export function GraphView({
  notes, notebooks, onOpen, phone,
}: {
  notes: Note[];
  notebooks: Notebook[];
  onOpen: (id: string) => void;
  phone: boolean;
}) {
  const { prefs } = usePrefs();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const nodes = useRef<P[]>([]);
  const alpha = useRef(1);
  const view = useRef({ x: 0, y: 0, z: 1 });
  const drag = useRef<{ id: string | null; sx: number; sy: number; moved: boolean; ox: number; oy: number } | null>(null);
  /** Set by anything that changes the picture while the simulation is cold. */
  const dirty = useRef(true);
  const [hover, setHover] = useState<string | null>(null);
  const [orphans, setOrphans] = useState(true);

  const edges = useMemo(() => linkGraph(notes), [notes]);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.from, (d.get(e.from) ?? 0) + 1);
      d.set(e.to, (d.get(e.to) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  const shown = useMemo(
    () => (orphans ? notes : notes.filter((n) => degree.has(n.id))),
    [notes, orphans, degree],
  );

  /* Build (and keep) the particle set. A note that was already on screen keeps
     its position, so adding one note does not re-throw the whole graph. */
  useEffect(() => {
    const colour = new Map(notebooks.map((b) => [b.id, b.color]));
    const prev = new Map(nodes.current.map((p) => [p.id, p]));
    const r = wrap.current?.getBoundingClientRect();
    const cx = (r?.width ?? 600) / 2;
    const cy = (r?.height ?? 400) / 2;

    nodes.current = shown.map((n, i) => {
      const at = prev.get(n.id);
      const angle = (i / Math.max(1, shown.length)) * Math.PI * 2;
      return {
        id: n.id,
        x: at?.x ?? cx + Math.cos(angle) * 160,
        y: at?.y ?? cy + Math.sin(angle) * 160,
        vx: 0, vy: 0,
        r: 4 + Math.min(9, (degree.get(n.id) ?? 0) * 1.8),
        color: colour.get(n.notebook_id) ?? 'var(--acc)',
        title: n.title || 'Untitled',
      };
    });
    alpha.current = 1;
  }, [shown, notebooks, degree]);

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

    const styles = getComputedStyle(document.documentElement);
    const line = styles.getPropertyValue('--line2').trim() || 'rgba(150,150,180,.2)';
    const tx = styles.getPropertyValue('--tx2').trim() || '#999';
    const accent = prefs.accent;

    const tick = () => {
      const ps = nodes.current;
      const r = box.getBoundingClientRect();
      const cx = r.width / 2, cy = r.height / 2;
      const moving = alpha.current > 0.005;

      // A settled graph is a still picture. Redrawing it sixty times a second
      // costs a phone its battery for nothing.
      if (!moving && !dirty.current) { raf = requestAnimationFrame(tick); return; }
      dirty.current = false;

      if (moving) {
        for (let i = 0; i < ps.length; i++) {
          const a = ps[i];
          for (let j = i + 1; j < ps.length; j++) {
            const b = ps[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d2 = Math.max(64, dx * dx + dy * dy);
            const f = REPULSION / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            a.vx -= fx; a.vy -= fy;
            b.vx += fx; b.vy += fy;
          }
          a.vx += (cx - a.x) * CENTRE_PULL;
          a.vy += (cy - a.y) * CENTRE_PULL;
        }

        const byId = new Map(ps.map((p) => [p.id, p]));
        for (const e of edges) {
          const a = byId.get(e.from), b = byId.get(e.to);
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = (d - SPRING_LEN) * SPRING;
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

      /* draw */
      ctx.clearRect(0, 0, r.width, r.height);
      ctx.save();
      ctx.translate(view.current.x, view.current.y);
      ctx.scale(view.current.z, view.current.z);

      const byId2 = new Map(ps.map((p) => [p.id, p]));
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = byId2.get(e.from), b = byId2.get(e.to);
        if (!a || !b) continue;
        const lit = hover === a.id || hover === b.id;
        ctx.strokeStyle = lit ? accent : line;
        ctx.globalAlpha = lit ? 0.9 : 0.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      const labels = view.current.z > 0.6 || ps.length < 40;
      for (const p of ps) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color.startsWith('#') ? p.color : accent;
        ctx.globalAlpha = hover && hover !== p.id ? 0.45 : 1;
        ctx.fill();
        if (hover === p.id) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (labels) {
          ctx.globalAlpha = hover && hover !== p.id ? 0.35 : 0.85;
          ctx.fillStyle = tx;
          ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'center';
          const t = p.title.length > 22 ? `${p.title.slice(0, 21)}…` : p.title;
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
  }, [edges, hover, prefs.accent]);

  /* -------------------------------------------------------------- pointer */

  const at = (e: React.PointerEvent | React.MouseEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.current.x) / view.current.z,
      y: (e.clientY - r.top - view.current.y) / view.current.z,
    };
  };

  const hit = (wx: number, wy: number) =>
    nodes.current.find((p) => Math.hypot(p.x - wx, p.y - wy) <= p.r + 8) ?? null;

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
      return;
    }
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.hypot(dx, dy) > 3) d.moved = true;
    dirty.current = true;
    if (d.id) {
      const p = nodes.current.find((n) => n.id === d.id);
      if (p) { p.x = d.ox + dx / view.current.z; p.y = d.oy + dy / view.current.z; }
      alpha.current = Math.max(alpha.current, 0.35);
    } else {
      view.current = { ...view.current, x: d.ox + dx, y: d.oy + dy };
    }
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.id && !d.moved) onOpen(d.id);
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
      const z = Math.min(3, Math.max(0.2, v.z * Math.exp(-e.deltaY * 0.0018)));
      view.current = { z, x: px - ((px - v.x) / v.z) * z, y: py - ((py - v.y) / v.z) * z };
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const reset = () => { view.current = { x: 0, y: 0, z: 1 }; alpha.current = 1; dirty.current = true; };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--tx3)' }}>
        <span>{shown.length} notes · {edges.length} links</span>
        <button onClick={() => setOrphans((v) => !v)} aria-pressed={!orphans} className="hov" style={{
          marginLeft: 'auto', padding: '5px 11px', borderRadius: 999, minHeight: 30,
          border: `1px solid ${orphans ? 'var(--line2)' : 'var(--acc)'}`,
          fontSize: 11, fontWeight: 700, color: orphans ? 'var(--tx2)' : 'var(--accTx)',
        }}>
          {orphans ? 'Hide unlinked' : 'Show unlinked'}
        </button>
        <button onClick={reset} className="hov" title="Re-centre" aria-label="Re-centre the graph"
          style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
          <Icon name="target" size={14} color="var(--tx2)" />
        </button>
      </div>

      <div ref={wrap}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { drag.current = null; setHover(null); }}
        style={{
          flex: 1, minHeight: phone ? 320 : 0, position: 'relative', overflow: 'hidden',
          background: 'var(--card)', borderRadius: 14, boxShadow: 'var(--sh)',
          cursor: hover ? 'pointer' : 'grab', touchAction: 'none',
        }}>
        <canvas ref={canvas} style={{ display: 'block' }} />
        {shown.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 12.5, color: 'var(--tx3)' }}>
            Nothing to draw yet. Link notes with [[double brackets]].
          </div>
        )}
      </div>
    </div>
  );
}
