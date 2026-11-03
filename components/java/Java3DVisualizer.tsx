'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Icon } from '../Icon';
import { playClick } from '@/lib/audio';
import { PAL } from '@/lib/pal';
import { usePrefs } from '@/lib/prefs';
import { sceneFor, type MarkerRole, type Scene, type SceneEdge, type SceneKind } from '@/lib/javaScene';
import type { FrameSnap, HeapObj, Step } from '@/lib/java';

export interface AISimEntity {
  id: number;
  label: string;
  val: string | number;
  x: number;
  y: number;
  z: number;
  color: string;
  type?: 'cube' | 'sphere' | 'cylinder' | 'node';
}

export interface AISimLink {
  from: number;
  to: number;
  color: string;
  label?: string;
}

export interface AISimStep {
  line: number;
  message: string;
  highlightIds?: number[];
  activeId?: number;
  variables?: Record<string, unknown>;
}

export interface AISimulationData {
  title?: string;
  algorithm?: string;
  dimension?: '3d' | '2.5d' | '2d';
  suggestedMode?: VisMode;
  summary?: string;
  entities?: AISimEntity[];
  links?: AISimLink[];
  steps?: AISimStep[];
}

interface Java3DVisualizerProps {
  frames: FrameSnap[];
  heap: HeapObj[];
  series: number[];
  activeLine: number | null;
  stepNote?: string;
  phone?: boolean;
  aiSimulation?: AISimulationData | null;
  /**
   * The trace step being displayed. Optional so the call site can be wired
   * separately; when absent the step is reconstructed from the frames, heap and
   * line already passed, which carry the same facts.
   */
  step?: Step | null;
}

export type RenderStyle = 'stage2d' | 'orbit3d';
type ViewAngle = 'isometric' | 'perspective' | 'front' | 'top' | 'side' | 'free';
export type VisMode = 'auto' | 'arrays' | 'tree' | 'matrix' | 'hanoi' | 'graph' | 'stack' | 'list';
type ConcreteMode = Exclude<VisMode, 'auto'>;

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ProjectedPoint {
  x: number;
  y: number;
  z: number;
  scale: number;
}

/* ------------------------------------------------------------------ theme */

/**
 * Canvas cannot read CSS custom properties, so the theme tokens are resolved
 * off the root element into plain colour strings and handed to the painter.
 * They are re-read whenever `prefs.theme` or `prefs.accent` changes, which is
 * the signal the rest of the app already re-renders on: applyPrefs() writes
 * `data-theme` and `--acc` onto the root before the prefs store emits, so by
 * the time this effect runs the new values are on the element.
 *
 * Brand hues from lib/pal.ts are identical in both themes and stay literal.
 */
const TOKEN_FALLBACK = {
  bg: '#0B0A13',
  card: '#16151F',
  card2: '#1F1D2A',
  tx: '#EFEDF5',
  tx2: '#A29EBB',
  tx3: '#78748F',
  line2: 'rgba(170, 166, 210, .26)',
  acc: '#8B7CFF',
};
type Tokens = typeof TOKEN_FALLBACK;
const TOKEN_KEYS = Object.keys(TOKEN_FALLBACK) as (keyof Tokens)[];

function readTokens(): Tokens {
  if (typeof window === 'undefined') return TOKEN_FALLBACK;
  const css = getComputedStyle(document.documentElement);
  const out = { ...TOKEN_FALLBACK };
  for (const k of TOKEN_KEYS) out[k] = css.getPropertyValue(`--${k}`).trim() || TOKEN_FALLBACK[k];
  return out;
}

/* ----------------------------------------------------------------- easing */

const bezAt = (t: number, p1: number, p2: number) => {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
};

/**
 * The house curve, `cubic-bezier(.16, 1, .3, 1)` — the one every transition in
 * this app runs on (components/AsciiBar.tsx). Solved by bisecting x, which is
 * exact to ~4e-6 at 18 iterations and needs no dependency.
 */
function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 18; i++) {
    u = (lo + hi) / 2;
    if (bezAt(u, 0.16, 0.3) < t) lo = u;
    else hi = u;
  }
  return bezAt(u, 1, 1);
}

/** How long one trace step takes to travel to the next. */
const STEP_MS = 380;

/* ------------------------------------------------------------------ scene */

/**
 * A slot is where a value sits in its own structure, not on screen: `a` is the
 * column / depth axis, `b` the position within it. Transitions interpolate
 * slots rather than pixels, so a swap reads identically at any zoom, camera
 * angle or canvas size — and the same numbers drive the 2D stage and the 3D
 * orbit without being computed twice.
 */
type Slot = { a: number; b: number };

const lerpSlot = (prev: Slot | undefined, next: Slot, e: number): Slot =>
  prev ? { a: prev.a + (next.a - prev.a) * e, b: prev.b + (next.b - prev.b) * e } : next;

/** Higher rank wins, so a blanket `sorted` marker never hides the live swap. */
const ROLE_RANK: Record<MarkerRole, number> = {
  sorted: 0,
  visited: 1,
  active: 2,
  cursor: 3,
  pivot: 4,
  compare: 5,
  swap: 6,
  found: 7,
};

const roleColor = (role: MarkerRole | undefined, T: Tokens): string | null => {
  switch (role) {
    case 'cursor':
      return PAL.sky;
    case 'compare':
      return PAL.amber;
    case 'swap':
      return PAL.coral;
    case 'pivot':
      return PAL.violet;
    case 'sorted':
      return PAL.mint;
    case 'visited':
      return PAL.indigo;
    case 'active':
      return T.acc;
    case 'found':
      return PAL.lime;
    default:
      return null;
  }
};

const KIND_TO_MODE: Record<SceneKind, ConcreteMode> = {
  array: 'arrays',
  matrix: 'matrix',
  tree: 'tree',
  list: 'list',
  graph: 'graph',
  stack: 'stack',
  hanoi: 'hanoi',
  frames: 'stack',
};

type Family = 'row' | 'grid' | 'columns' | 'chain' | 'tree' | 'graph';

const FAMILY: Record<ConcreteMode, Family> = {
  arrays: 'row',
  matrix: 'grid',
  hanoi: 'columns',
  stack: 'columns',
  list: 'chain',
  tree: 'tree',
  graph: 'graph',
};

const needsNodes = (f: Family) => f === 'tree' || f === 'graph';

function cellSlots(scene: Scene): Map<string, Slot> {
  const m = new Map<string, Slot>();
  scene.columns.forEach((col, ci) => col.cellIds.forEach((id, pi) => m.set(id, { a: ci, b: pi })));
  for (const c of scene.cells) if (!m.has(c.id)) m.set(c.id, { a: 0, b: c.index });
  return m;
}

/** Graph nodes get a ring order; tree nodes get depth plus a tidy leaf slot. */
function nodeSlots(scene: Scene, radial: boolean): Map<string, Slot> {
  const m = new Map<string, Slot>();
  if (radial) {
    scene.nodes.forEach((n, i) => m.set(n.id, { a: 0, b: i }));
    return m;
  }

  const ids = new Set(scene.nodes.map((n) => n.id));
  const kids = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of scene.nodes) {
    if (n.parent && n.parent !== n.id && ids.has(n.parent)) {
      const arr = kids.get(n.parent);
      if (arr) arr.push(n.id);
      else kids.set(n.parent, [n.id]);
    } else {
      roots.push(n.id);
    }
  }

  const depthOf = new Map(scene.nodes.map((n) => [n.id, n.depth]));
  let leaf = 0;
  const seen = new Set<string>();
  // `seen` is the cycle guard: a malformed parent chain must not recurse away.
  const walk = (id: string): number => {
    if (seen.has(id)) return m.get(id)?.b ?? 0;
    seen.add(id);
    const cs = kids.get(id) ?? [];
    let x: number;
    if (!cs.length) {
      x = leaf++;
    } else {
      const xs = cs.map(walk);
      x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    m.set(id, { a: depthOf.get(id) ?? 0, b: x });
    return x;
  };
  roots.forEach(walk);
  for (const n of scene.nodes) if (!m.has(n.id)) m.set(n.id, { a: n.depth, b: leaf++ });
  return m;
}

/** One drawable value, independent of the structure it came from. */
type Vis = {
  id: string;
  label: string;
  sub: string;
  slot: Slot;
  prev?: Slot;
  role?: MarkerRole;
};

/* Depth reference for the orbit camera. Static: these are a grid, not weather. */
const STARFIELD_PARTICLES: Point3D[] = Array.from({ length: 42 }, (_, i) => {
  const theta = (i * 2.39996) % (Math.PI * 2);
  const phi = ((i * 1.61803) % Math.PI) - Math.PI / 2;
  const rad = 140 + ((i * 37) % 120);
  return {
    x: Math.cos(phi) * Math.cos(theta) * rad,
    y: Math.sin(phi) * rad * 0.7 + 30,
    z: Math.cos(phi) * Math.sin(theta) * rad,
  };
});

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function Java3DVisualizer({
  frames,
  heap,
  series,
  activeLine,
  stepNote,
  phone = false,
  aiSimulation,
  step,
}: Java3DVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { prefs } = usePrefs();

  const [renderStyle, setRenderStyle] = useState<RenderStyle>('stage2d');

  const [yaw, setYaw] = useState<number>(0.75);
  const [pitch, setPitch] = useState<number>(0.55);
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [visMode, setVisMode] = useState<VisMode>('auto');
  const [viewAngle, setViewAngle] = useState<ViewAngle>('isometric');
  const [isPerspective, setIsPerspective] = useState<boolean>(true);

  const animFrameIdRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistanceRef = useRef<number | null>(null);
  const isRightClickPanRef = useRef<boolean>(false);

  const [tokens, setTokens] = useState<Tokens>(TOKEN_FALLBACK);
  useEffect(() => {
    setTokens(readTokens());
  }, [prefs.theme, prefs.accent]);

  /* ------------------------------------------------------------- the data */

  /** Everything drawn comes from here. Nothing is invented downstream. */
  const scene = useMemo(() => {
    const s: Step | null =
      step ??
      (activeLine === null
        ? null
        : { line: activeLine, frames, heap, out: series.length, note: stepNote ?? '' });
    return sceneFor(s, frames, heap, series);
  }, [step, activeLine, frames, heap, series, stepNote]);

  const effectiveMode: ConcreteMode = visMode === 'auto' ? KIND_TO_MODE[scene.kind] : visMode;
  const family = FAMILY[effectiveMode];

  const slots = useMemo(
    () => (needsNodes(family) ? nodeSlots(scene, family === 'graph') : cellSlots(scene)),
    [scene, family]
  );

  const roles = useMemo(() => {
    const m = new Map<string, MarkerRole>();
    for (const mk of scene.markers) {
      for (const id of mk.ids) {
        const cur = m.get(id);
        if (!cur || ROLE_RANK[mk.role] > ROLE_RANK[cur]) m.set(id, mk.role);
      }
    }
    return m;
  }, [scene]);

  /* The transition: where things were, and when the move began. */
  const prevSlotsRef = useRef<Map<string, Slot>>(new Map());
  const lastSlotsRef = useRef<Map<string, Slot>>(slots);
  const tStartRef = useRef<number>(0);
  useEffect(() => {
    prevSlotsRef.current = lastSlotsRef.current;
    lastSlotsRef.current = slots;
    tStartRef.current = typeof performance !== 'undefined' ? performance.now() : 0;
  }, [slots]);

  const items = useMemo<Vis[]>(() => {
    const prev = prevSlotsRef.current;
    if (needsNodes(family)) {
      return scene.nodes
        .filter((n) => slots.has(n.id))
        .map((n) => ({
          id: n.id,
          label: n.value || n.label,
          sub: n.value && n.label && n.value !== n.label ? n.label : '',
          slot: slots.get(n.id)!,
          prev: prev.get(n.id),
          role: roles.get(n.id),
        }));
    }
    return scene.cells
      .filter((c) => slots.has(c.id))
      .map((c) => ({
        id: c.id,
        label: c.value,
        sub: String(c.index),
        slot: slots.get(c.id)!,
        prev: prev.get(c.id),
        role: roles.get(c.id),
      }));
  }, [scene, slots, roles, family]);

  /** Trees fall back to the parent links when no explicit edges are given. */
  const edges = useMemo<SceneEdge[]>(() => {
    if (!needsNodes(family)) return [];
    if (scene.edges.length) return scene.edges;
    return scene.nodes
      .filter((n) => n.parent && slots.has(n.parent))
      .map((n) => ({ from: n.parent!, to: n.id, directed: false }));
  }, [scene, slots, family]);

  /* ------------------------------------------------------------- controls */

  const setPresetAngle = useCallback((angle: ViewAngle) => {
    playClick();
    setViewAngle(angle);
    setPanX(0);
    setPanY(0);
    if (angle === 'isometric') {
      setIsPerspective(false);
      setYaw(0.75);
      setPitch(0.55);
      setZoom(1.0);
    } else if (angle === 'perspective') {
      setIsPerspective(true);
      setYaw(0.65);
      setPitch(0.48);
      setZoom(1.0);
    } else if (angle === 'front') {
      setIsPerspective(false);
      setYaw(0);
      setPitch(0.02);
      setZoom(1.0);
    } else if (angle === 'top') {
      setIsPerspective(false);
      setYaw(0);
      setPitch(1.52);
      setZoom(0.95);
    } else if (angle === 'side') {
      setIsPerspective(false);
      setYaw(Math.PI / 2);
      setPitch(0.05);
      setZoom(1.0);
    }
  }, []);

  const resetCamera = useCallback(() => {
    playClick();
    setViewAngle('perspective');
    setIsPerspective(true);
    setYaw(0.65);
    setPitch(0.48);
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    isRightClickPanRef.current = e.button === 2 || e.button === 1;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      pinchDistanceRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pointers = activePointersRef.current;
      if (!pointers.has(e.pointerId)) return;

      const prevPos = pointers.get(e.pointerId)!;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size >= 2) {
        const pts = Array.from(pointers.values());
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinchDistanceRef.current !== null && pinchDistanceRef.current > 0) {
          const deltaDist = currentDist - pinchDistanceRef.current;
          setZoom((z) => clamp(z + deltaDist * 0.005, 0.35, 3.5));
        }
        pinchDistanceRef.current = currentDist;
        return;
      }

      if (pointers.size === 1) {
        const dx = e.clientX - prevPos.x;
        const dy = e.clientY - prevPos.y;

        if (isRightClickPanRef.current || e.shiftKey || renderStyle === 'stage2d') {
          setPanX((px) => px + dx);
          setPanY((py) => py + dy);
        } else {
          setViewAngle('free');
          setYaw((y) => y + dx * 0.0075);
          setPitch((p) => clamp(p - dy * 0.0075, -0.25, 1.54));
        }
      }
    },
    [renderStyle]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchDistanceRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((z) => clamp(z - e.deltaY * 0.0015, 0.35, 3.5));
  }, []);

  /* ---------------------------------------------------------------- paint */

  /** Returns true once the current step transition has finished. */
  const renderScene = useCallback(
    (nowMs: number): boolean => {
      const canvas = canvasRef.current;
      if (!canvas) return true;
      const ctx = canvas.getContext('2d');
      if (!ctx) return true;

      const T = tokens;
      const parent = canvas.parentElement;
      const clientW = parent?.clientWidth || 600;
      const clientH = parent?.clientHeight || 380;
      const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;

      if (canvas.width !== clientW * dpr || canvas.height !== clientH * dpr) {
        canvas.width = clientW * dpr;
        canvas.height = clientH * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const width = clientW;
      const height = clientH;
      const isMobile = width < 480;
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2 + panX;
      const cy = height / 2 + panY;

      // Motion is a product setting, not an OS hint (lib/prefs.ts). With it off
      // the new state is simply the state, drawn at once.
      const raw = prefs.motion ? (nowMs - tStartRef.current) / STEP_MS : 1;
      const e = ease(clamp(raw, 0, 1));
      const settled = raw >= 1;

      const project = (x: number, y: number, z: number): ProjectedPoint => {
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        const x1 = x * cosY - z * sinY;
        const z1 = x * sinY + z * cosY;

        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        const y2 = y * cosP - z1 * sinP;
        const z2 = y * sinP + z1 * cosP;

        if (isPerspective) {
          const depth = z2 + 620;
          const scale = (390 / Math.max(40, depth)) * zoom;
          return { x: cx + x1 * scale * 1.8, y: cy + 20 - y2 * scale * 1.8, z: z2, scale };
        }
        const scale = 0.65 * zoom;
        return { x: cx + x1 * scale * 1.8, y: cy + 20 - y2 * scale * 1.8, z: z2, scale };
      };

      /* ------------------------------------------------------- header */

      const headerY = 46;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      if (scene.title) {
        ctx.fillStyle = T.tx;
        ctx.font = `900 ${isMobile ? 14 : 16}px system-ui, sans-serif`;
        ctx.fillText(scene.title, width / 2, headerY);
      }
      if (scene.subtitle) {
        ctx.fillStyle = T.tx3;
        ctx.font = `bold ${isMobile ? 8.5 : 9.5}px monospace`;
        ctx.fillText(scene.subtitle, width / 2, headerY + 15);
      }

      const stats = scene.stats.slice(0, isMobile ? 2 : 4);
      if (stats.length) {
        const chipW = isMobile ? 90 : 98;
        const gap = 6;
        const totalW = stats.length * chipW + (stats.length - 1) * gap;
        const chipY = headerY + 24;
        stats.forEach((s, i) => {
          const x = width / 2 - totalW / 2 + i * (chipW + gap);
          ctx.fillStyle = T.card;
          ctx.strokeStyle = T.line2;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x, chipY, chipW, 17, 5);
          ctx.fill();
          ctx.stroke();

          ctx.textAlign = 'left';
          ctx.fillStyle = T.tx3;
          ctx.font = 'bold 7.5px monospace';
          ctx.fillText(s.label.toUpperCase(), x + 6, chipY + 11.5);

          ctx.textAlign = 'right';
          ctx.fillStyle = T.tx;
          ctx.font = 'bold 8.5px monospace';
          ctx.fillText(s.value, x + chipW - 6, chipY + 11.5);
        });
        ctx.textAlign = 'center';
      }

      const aiOverride =
        renderStyle === 'orbit3d' && !!aiSimulation?.entities && aiSimulation.entities.length > 0;

      /* -------------------------------------------------- empty state */

      if (!items.length && !aiOverride) {
        // A correct blank beats a convincing demo: nothing is drawn that the
        // trace did not produce.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = T.tx2;
        ctx.font = `700 ${isMobile ? 12 : 13}px system-ui, sans-serif`;
        ctx.fillText('Nothing to show for this step', cx, cy - 8);
        ctx.fillStyle = T.tx3;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(
          needsNodes(family)
            ? `The trace has no ${family === 'tree' ? 'tree' : 'graph'} nodes here`
            : 'The trace has no values here',
          cx,
          cy + 12
        );
        ctx.restore();
        return true;
      }

      /* ---------------------------------------------------- geometry */

      let maxA = 0;
      let maxB = 0;
      for (const it of items) {
        if (it.slot.a > maxA) maxA = it.slot.a;
        if (it.slot.b > maxB) maxB = it.slot.b;
      }
      const cols = Math.max(1, Math.round(maxA) + 1);
      const across = Math.max(1, Math.round(maxB) + 1);
      const nItems = items.length;

      const stageY = cy + 18;
      const tile =
        family === 'row'
          ? clamp((width - 48) / across - (isMobile ? 5 : 7), 16, isMobile ? 34 : 40)
          : 34;
      const rowSp = tile + (isMobile ? 5 : 7);
      const gridCell = clamp(
        Math.min((width - 60) / across, (height - 190) / cols),
        14,
        isMobile ? 30 : 38
      );
      const colSp = clamp((width - 56) / cols, 52, isMobile ? 104 : 148);
      const colTileW = Math.min(colSp - 16, isMobile ? 84 : 108);
      const colRowH = 25;
      const colBaseY = Math.min(cy + 96, height - 44);
      const chainW = clamp((width - 70) / across - 24, 22, 46);
      const chainSp = chainW + 28;
      const treeH = clamp((width - 60) / across, 26, isMobile ? 62 : 88);
      const treeV = clamp((height - 178) / cols, 30, 60);
      const treeTop = cy - ((cols - 1) * treeV) / 2 + 12;
      const ringR = clamp(Math.min(width, height) * 0.3, 60, 190);

      const pos2 = (s: Slot): { x: number; y: number } => {
        switch (family) {
          case 'row':
            return { x: cx + (s.b - (across - 1) / 2) * rowSp, y: stageY };
          case 'grid':
            return {
              x: cx + (s.b - (across - 1) / 2) * gridCell,
              y: cy + 12 + (s.a - (cols - 1) / 2) * gridCell,
            };
          case 'columns':
            return {
              x: cx + (s.a - (cols - 1) / 2) * colSp,
              y: colBaseY - 10 - s.b * (colRowH + 3) - colRowH / 2,
            };
          case 'chain':
            return { x: cx + (s.b - (across - 1) / 2) * chainSp, y: cy + 8 };
          case 'tree':
            return { x: cx + (s.b - (across - 1) / 2) * treeH, y: treeTop + s.a * treeV };
          default: {
            const ang = (s.b / Math.max(1, nItems)) * Math.PI * 2 - Math.PI / 2;
            return { x: cx + Math.cos(ang) * ringR, y: cy + 12 + Math.sin(ang) * ringR * 0.66 };
          }
        }
      };

      const pos3 = (s: Slot): Point3D => {
        switch (family) {
          case 'row':
          case 'chain':
            return { x: (s.b - (across - 1) / 2) * 34, y: 0, z: 0 };
          case 'grid':
            return {
              x: (s.b - (across - 1) / 2) * 30,
              y: 0,
              z: (s.a - (cols - 1) / 2) * 30,
            };
          case 'columns':
            return { x: (s.a - (cols - 1) / 2) * 74, y: s.b * 26 - 50, z: 0 };
          case 'tree':
            return { x: (s.b - (across - 1) / 2) * 46, y: 74 - s.a * 48, z: 0 };
          default: {
            const ang = (s.b / Math.max(1, nItems)) * Math.PI * 2;
            return { x: Math.cos(ang) * 100, y: 0, z: Math.sin(ang) * 100 };
          }
        }
      };

      const is3d = renderStyle === 'orbit3d';
      const place = (s: Slot): ProjectedPoint => {
        if (is3d) {
          const p = pos3(s);
          return project(p.x, p.y, p.z);
        }
        const p = pos2(s);
        return { x: p.x, y: p.y, z: 0, scale: 1 };
      };

      /* ----------------------------------------- one sorted draw list */

      // Every primitive goes through here — background, edges, chrome and
      // values alike — so a far object can never paint over a near one.
      type Draw = { z: number; paint: () => void };
      const draws: Draw[] = [];
      const push = (z: number, paint: () => void) => draws.push({ z, paint });

      const face = (pts: ProjectedPoint[], fill: string, shade: number) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        if (shade > 0) {
          ctx.save();
          ctx.globalAlpha = shade;
          // Shadow is dark in both themes; --ink flips, so it cannot be used.
          ctx.fillStyle = '#000000';
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = T.line2;
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      const voxel = (c: Point3D, w: number, h: number, d: string, base: string, label: string) => {
        const dep = Number(d);
        const p000 = project(c.x - w / 2, c.y, c.z - dep / 2);
        const p100 = project(c.x + w / 2, c.y, c.z - dep / 2);
        const p110 = project(c.x + w / 2, c.y + h, c.z - dep / 2);
        const p010 = project(c.x - w / 2, c.y + h, c.z - dep / 2);
        const p001 = project(c.x - w / 2, c.y, c.z + dep / 2);
        const p101 = project(c.x + w / 2, c.y, c.z + dep / 2);
        const p111 = project(c.x + w / 2, c.y + h, c.z + dep / 2);
        const p011 = project(c.x - w / 2, c.y + h, c.z + dep / 2);
        void p000;

        face([p001, p101, p111, p011], base, 0.16);
        face([p101, p100, p110, p111], base, 0.32);
        face([p011, p111, p110, p010], base, 0);

        if (label && p011.scale > 0.22) {
          ctx.fillStyle = T.tx;
          ctx.font = `900 ${Math.max(9, Math.round(11 * p011.scale))}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, (p011.x + p111.x) / 2, (p011.y + p111.y) / 2);
        }
      };

      const orb = (p: ProjectedPoint, r: number, base: string, label: string, sub: string) => {
        const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.12, p.x, p.y, r);
        g.addColorStop(0, base);
        g.addColorStop(1, T.card);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = base;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.fillStyle = T.tx;
        ctx.font = `900 ${Math.max(9, Math.round(11 * Math.max(0.7, p.scale)))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p.x, p.y);
        if (sub) {
          ctx.fillStyle = T.tx3;
          ctx.font = 'bold 8px monospace';
          ctx.fillText(sub, p.x, p.y + r + 9);
        }
      };

      const flatTile = (
        p: ProjectedPoint,
        w: number,
        h: number,
        base: string | null,
        label: string,
        sub: string,
        subBelow: boolean
      ) => {
        ctx.beginPath();
        ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 8);
        ctx.fillStyle = T.card2;
        ctx.fill();
        if (base) {
          ctx.save();
          // Tint rather than replace: keeps the value legible in both themes.
          ctx.globalAlpha = 0.24;
          ctx.fillStyle = base;
          ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = base ?? T.line2;
        ctx.lineWidth = base ? 2 : 1.2;
        ctx.stroke();

        ctx.fillStyle = T.tx;
        ctx.font = `900 ${clamp(Math.round(h * 0.36), 9, 14)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p.x, p.y);

        if (sub) {
          ctx.fillStyle = base ?? T.tx3;
          ctx.font = 'bold 9px monospace';
          if (subBelow) ctx.fillText(sub, p.x, p.y + h / 2 + 11);
          else ctx.fillText(sub, p.x + w / 2 + 12, p.y);
        }
      };

      /* ------------------------------------------ background in orbit */

      if (is3d) {
        for (const p of STARFIELD_PARTICLES) {
          const proj = project(p.x, p.y, p.z);
          if (proj.scale <= 0.1) continue;
          push(proj.z, () => {
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = T.tx3;
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, Math.max(0.8, 1.4 * proj.scale), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          });
        }

        for (const r of [60, 120, 180]) {
          push(1e5, () => {
            ctx.strokeStyle = T.line2;
            ctx.globalAlpha = 0.45;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let s = 0; s <= 32; s++) {
              const a = (s / 32) * Math.PI * 2;
              const pt = project(Math.cos(a) * r, 0, Math.sin(a) * r);
              if (s === 0) ctx.moveTo(pt.x, pt.y);
              else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
          });
        }
      }

      /* ------------------------------------------ AI simulation input */

      if (aiOverride && aiSimulation) {
        const ents = aiSimulation.entities ?? [];
        const projected = new Map(ents.map((en) => [en.id, project(en.x, en.y, en.z)]));

        for (const lk of aiSimulation.links ?? []) {
          const p1 = projected.get(lk.from);
          const p2 = projected.get(lk.to);
          if (!p1 || !p2) continue;
          push((p1.z + p2.z) / 2 + 1, () => {
            ctx.strokeStyle = lk.color || T.line2;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            if (lk.label) {
              ctx.fillStyle = T.tx2;
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              ctx.fillText(lk.label, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2 - 4);
            }
          });
        }

        for (const en of ents) {
          const p = projected.get(en.id)!;
          const size = Math.max(16, Math.round(28 * p.scale));
          push(p.z, () => {
            const col = en.color || T.acc;
            if (en.type === 'sphere' || en.type === 'node') {
              orb(p, size / 2, col, String(en.val), en.label || '');
            } else {
              voxel({ x: en.x, y: en.y, z: en.z }, size, size, String(size), col, String(en.val));
              ctx.fillStyle = T.tx2;
              ctx.font = `bold ${Math.max(9, Math.round(10 * p.scale))}px monospace`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              ctx.fillText(en.label || String(en.val), p.x, p.y + size / 2 + 12);
            }
          });
        }
      } else {
        /* ----------------------------------------- the scene's values */

        const placed = items.map((it) => ({
          it,
          p: place(lerpSlot(it.prev, it.slot, e)),
          // A value that did not exist a step ago arrives rather than blinks in.
          alpha: it.prev ? 1 : e,
        }));
        const byId = new Map(placed.map((x) => [x.it.id, x.p]));

        /* column chrome: a base plate and a label per peg / stack / row */
        if (family === 'columns') {
          scene.columns.forEach((col, ci) => {
            const anchor = place({ a: ci, b: 0 });
            push(is3d ? anchor.z + 2 : 2, () => {
              const w = is3d ? colTileW * Math.max(0.5, anchor.scale) : colTileW;
              const baseY = is3d ? anchor.y + 16 : colBaseY;
              ctx.fillStyle = T.card;
              ctx.strokeStyle = T.line2;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.roundRect(anchor.x - w / 2 - 6, baseY, w + 12, 9, 4);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = T.tx2;
              ctx.font = 'bold 10px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              ctx.fillText(col.label, anchor.x, baseY + 22);
            });
          });
        }

        /* matrix chrome: name each row down the left edge */
        if (family === 'grid' && !is3d) {
          scene.columns.forEach((col, ci) => {
            const anchor = pos2({ a: ci, b: 0 });
            push(2, () => {
              ctx.fillStyle = T.tx3;
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'right';
              ctx.textBaseline = 'middle';
              ctx.fillText(col.label, anchor.x - gridCell / 2 - 8, anchor.y);
            });
          });
        }

        /* chain chrome: the links between consecutive nodes */
        if (family === 'chain') {
          const order = [...placed].sort((x, y) => x.it.slot.b - y.it.slot.b);
          for (let i = 0; i < order.length - 1; i++) {
            const a = order[i].p;
            const b = order[i + 1].p;
            push(is3d ? (a.z + b.z) / 2 + 1 : 1, () => {
              ctx.strokeStyle = T.tx3;
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.moveTo(a.x + chainW / 2, a.y);
              ctx.lineTo(b.x - chainW / 2, b.y);
              ctx.stroke();
              const ang = Math.atan2(b.y - a.y, b.x - a.x);
              const tipX = b.x - (chainW / 2) * Math.cos(ang);
              const tipY = b.y - (chainW / 2) * Math.sin(ang);
              ctx.fillStyle = T.tx3;
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(tipX - 6 * Math.cos(ang - 0.4), tipY - 6 * Math.sin(ang - 0.4));
              ctx.lineTo(tipX - 6 * Math.cos(ang + 0.4), tipY - 6 * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            });
          }
        }

        /* tree / graph edges */
        for (const ed of edges) {
          const a = byId.get(ed.from);
          const b = byId.get(ed.to);
          if (!a || !b) continue;
          const lit =
            roles.get(ed.from) && roles.get(ed.to)
              ? roleColor(roles.get(ed.to), T)
              : null;
          push(is3d ? (a.z + b.z) / 2 + 1 : 1, () => {
            ctx.strokeStyle = lit ?? T.line2;
            ctx.lineWidth = lit ? 2 : 1.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            if (ed.directed) {
              const ang = Math.atan2(b.y - a.y, b.x - a.x);
              const r = 16;
              const tipX = b.x - r * Math.cos(ang);
              const tipY = b.y - r * Math.sin(ang);
              ctx.fillStyle = lit ?? T.tx3;
              ctx.beginPath();
              ctx.moveTo(tipX, tipY);
              ctx.lineTo(tipX - 7 * Math.cos(ang - 0.4), tipY - 7 * Math.sin(ang - 0.4));
              ctx.lineTo(tipX - 7 * Math.cos(ang + 0.4), tipY - 7 * Math.sin(ang + 0.4));
              ctx.closePath();
              ctx.fill();
            }

            if (ed.label) {
              ctx.fillStyle = T.tx3;
              ctx.font = 'bold 8.5px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'alphabetic';
              ctx.fillText(ed.label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 4);
            }
          });
        }

        /* the values themselves */
        for (const { it, p, alpha } of placed) {
          const col = roleColor(it.role, T);
          push(p.z, () => {
            ctx.save();
            ctx.globalAlpha = alpha;
            if (col) {
              ctx.shadowColor = col;
              ctx.shadowBlur = 12;
            }

            if (needsNodes(family)) {
              orb(p, is3d ? Math.max(9, 16 * p.scale) : 16, col ?? T.acc, it.label, it.sub);
            } else if (is3d) {
              const w3 = pos3(lerpSlot(it.prev, it.slot, e));
              voxel(w3, 24, 22, '24', col ?? T.card2, it.label);
            } else if (family === 'columns') {
              flatTile(p, colTileW, colRowH, col, it.label, '', false);
            } else if (family === 'grid') {
              flatTile(p, gridCell - 3, gridCell - 3, col, it.label, '', false);
            } else if (family === 'chain') {
              flatTile(p, chainW, chainW * 0.78, col, it.label, '', false);
            } else {
              // A marked cell lifts out of the row so the comparison is visible.
              const lifted: ProjectedPoint = { ...p, y: p.y - (col ? 14 : 0) };
              flatTile(lifted, tile, tile, col, it.label, it.sub, true);
            }
            ctx.restore();
          });
        }
      }

      draws.sort((a, b) => b.z - a.z);
      for (const d of draws) d.paint();

      /* gizmo */
      if (is3d) {
        ctx.save();
        ctx.fillStyle = T.card;
        ctx.strokeStyle = T.line2;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(width - 36, 36, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        const ax = (dx: number, dz: number, col: string, name: string) => {
          const p = project(dx * 46, 0, dz * 46);
          const o = project(0, 0, 0);
          const sx = width - 36 + (p.x - o.x) * 0.34;
          const sy = 36 + (p.y - o.y) * 0.34;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(width - 36, 36);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.font = 'bold 7px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(name, sx, sy);
        };
        ax(1, 0, PAL.coral, 'x');
        ax(0, 1, PAL.sky, 'z');
        ctx.restore();
      }

      ctx.restore();
      return settled;
    },
    [
      tokens,
      prefs.motion,
      renderStyle,
      yaw,
      pitch,
      zoom,
      panX,
      panY,
      isPerspective,
      scene,
      items,
      edges,
      roles,
      family,
      aiSimulation,
    ]
  );

  useEffect(() => {
    let active = true;
    const tick = (nowMs: number) => {
      if (!active) return;
      lastFrameRef.current = nowMs;
      // A settled scene is a still picture; redrawing it sixty times a second
      // costs a phone its battery for nothing. Any camera or scene change
      // rebuilds renderScene, which restarts the loop.
      const done = renderScene(nowMs);
      animFrameIdRef.current = done ? null : requestAnimationFrame(tick);
    };
    animFrameIdRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (animFrameIdRef.current !== null) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [renderScene]);

  useEffect(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const ro = new ResizeObserver(() => renderScene(lastFrameRef.current));
    ro.observe(parent);
    return () => ro.disconnect();
  }, [renderScene]);

  /* ------------------------------------------------------------------ ui */

  const chrome: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderRadius: 9,
    background: 'var(--card)',
    border: '1px solid var(--line2)',
    boxShadow: 'var(--sh)',
    pointerEvents: 'auto',
  };

  const pill = (on: boolean): React.CSSProperties => ({
    padding: phone ? '3.5px 7px' : '4px 9px',
    borderRadius: 6,
    fontSize: phone ? 9.5 : 10.5,
    fontWeight: 700,
    border: 'none',
    background: on ? 'var(--acc)' : 'transparent',
    color: on ? 'var(--accent-ink)' : 'var(--tx2)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: phone ? 320 : 360,
        background: 'radial-gradient(circle at 50% 40%, var(--card) 0%, var(--bg) 100%)',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid var(--line2)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        style={{
          width: '100%',
          flex: 1,
          display: 'block',
          cursor: renderStyle === 'orbit3d' ? 'grab' : 'default',
          touchAction: 'none',
        }}
      />

      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          right: 10,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <div style={chrome}>
          <button
            onClick={() => {
              playClick();
              setRenderStyle('stage2d');
            }}
            className="k-squish"
            style={pill(renderStyle === 'stage2d')}
          >
            2.5D Stage
          </button>
          <button
            onClick={() => {
              playClick();
              setRenderStyle('orbit3d');
            }}
            className="k-squish"
            style={pill(renderStyle === 'orbit3d')}
          >
            3D Orbit
          </button>
        </div>

        <div style={{ ...chrome, overflowX: 'auto', maxWidth: '100%' }} className="navsb">
          {(
            [
              ['auto', 'Auto'],
              ['arrays', 'Array'],
              ['matrix', 'Matrix'],
              ['list', 'List'],
              ['hanoi', 'Hanoi'],
              ['stack', 'Stack'],
              ['tree', 'Tree'],
              ['graph', 'Graph'],
            ] as [VisMode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => {
                playClick();
                setVisMode(m);
              }}
              className="k-squish"
              style={pill(visMode === m)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={chrome}>
          <button
            onClick={resetCamera}
            title="Reset view"
            className="hov k-squish"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="refresh" size={11} color="var(--tx2)" />
          </button>
          <button
            onClick={() => setZoom((z) => clamp(z + 0.2, 0.35, 3.5))}
            title="Zoom in"
            className="hov k-squish"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              display: 'grid',
              placeItems: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--tx2)',
              cursor: 'pointer',
            }}
          >
            <Icon name="plus" size={10} color="var(--tx2)" />
          </button>
        </div>
      </div>

      {renderStyle === 'orbit3d' && (
        <div style={{ position: 'absolute', top: 46, right: 10, ...chrome }}>
          {(
            [
              ['isometric', 'Iso'],
              ['perspective', 'Persp'],
              ['front', 'Front'],
              ['top', 'Top'],
              ['side', 'Side'],
            ] as [ViewAngle, string][]
          ).map(([a, label]) => (
            <button
              key={a}
              onClick={() => setPresetAngle(a)}
              className="k-squish"
              style={pill(viewAngle === a)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          right: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pointerEvents: 'none',
          fontSize: 10.5,
          color: 'var(--tx3)',
          fontFamily: 'monospace',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'color-mix(in srgb, var(--acc) 16%, transparent)',
              color: 'var(--accTx)',
              fontSize: 9.5,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {renderStyle === 'stage2d' ? '2.5D STAGE' : '3D ORBIT'}
          </span>
          <span style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {stepNote || 'Drag to pan / rotate · Scroll to zoom'}
          </span>
        </div>

        {activeLine && (
          <span style={{ color: PAL.amber, fontWeight: 700, flexShrink: 0 }}>Line {activeLine}</span>
        )}
      </div>
    </div>
  );
}
