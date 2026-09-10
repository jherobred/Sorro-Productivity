'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { ContextMenu, type CtxItem } from '../ContextMenu';
import { usePrefs } from '@/lib/prefs';
import { toast } from '@/lib/toast';
import { ask, confirmAsk } from '@/lib/ask';
import { preview } from '@/lib/md';
import type { Note } from '@/lib/notes';
import {
  useBoards, useNodes, useEdges, useCanvasActions, anchor, edgePath, bestSides, bounds, blankNode,
  resized, CANVAS_COLORS, SNAP, type Board, type CNode, type CEdge, type Handle, type Kind, type Side,
} from '@/lib/canvas';

/**
 * The infinite canvas, rebuilt on Obsidian's.
 *
 * Shape follows the notebook next door: the boards are a list on the left, the
 * board fills the rest, and on a phone the list *is* the screen until you open
 * one. The old version hid every board behind a scrolling row of pills, which
 * on a phone meant the fifth canvas did not exist.
 *
 * Coordinates: cards live in world space and never move when you pan or zoom.
 * The viewport is one {x, y, z} triple and a single CSS transform on the world
 * layer does all of it, so a board with three hundred cards costs the same to
 * pan as one with three, and text stays crisp because it is a transform rather
 * than a redraw.
 *
 *   screen = world * z + offset
 *   world  = (screen - offset) / z
 *
 * Four card kinds, and the two new ones are the point: a **note** card shows a
 * note from the notebook and opens it, a **canvas** card opens another board.
 * That is what makes a set of boards a graph rather than a pile of drawings,
 * and it is what the graph view reads.
 *
 * Gestures, as asked for: **the wheel zooms**, about the pointer, the way it
 * does in Figma and in Obsidian's canvas with the setting flipped. Shift+wheel
 * pans sideways and a two-finger pinch zooms. Drag empty space to pan, drag a
 * card to move it, drag any edge or corner to resize it, drag a side dot to
 * connect — and if you let that dot go over nothing, you get a new card there,
 * already joined on, which is the move that makes an Obsidian canvas fast to
 * think in. Shift-drag marquees, double-click empty space makes a card,
 * double-click a card opens it, ⌘/Ctrl+Z undoes.
 */

const MIN_Z = 0.1;
const MAX_Z = 4;
const GRID = 40;
const SAVE_MS = 600;

const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

type VP = { x: number; y: number; z: number };
type Sel = { nodes: string[]; edges: string[] };
type Draft = { x: number; y: number; w?: number; h?: number };

type Gesture =
  | { g: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { g: 'move'; sx: number; sy: number; start: Record<string, Draft> }
  | { g: 'resize'; id: string; handle: Handle; sx: number; sy: number; x: number; y: number; w: number; h: number }
  | { g: 'link'; from: string; side: Side; x: number; y: number; over: string | null }
  | { g: 'marquee'; sx: number; sy: number; x: number; y: number }
  | null;

export function Canvas({
  notes, phone, boardId, onBoard, onOpenNote,
}: {
  notes: Note[];
  phone: boolean;
  /** Which board is open. Held by the page, so the graph can open one. */
  boardId: string | null;
  onBoard: (id: string | null) => void;
  onOpenNote: (id: string) => void;
}) {
  const { prefs } = usePrefs();
  const { data: allBoards = [] } = useBoards();
  const boards = useMemo(() => allBoards.filter((b) => b.kind !== 'graph'), [allBoards]);

  const setBoardId = onBoard;
  const board = boards.find((b) => b.id === boardId) ?? null;

  // On a wide screen an empty right pane is wasted; on a phone the list is the
  // screen and opening a board is a navigation.
  useEffect(() => {
    if (!phone && !board && boards.length) setBoardId(boards[0].id);
    if (boardId && !boards.some((b) => b.id === boardId)) setBoardId(null);
  }, [phone, board, boards, boardId, setBoardId]);

  const A = useCanvasActions(board?.id ?? null);

  const newBoard = () => {
    const id = crypto.randomUUID();
    A.newBoard.mutate({
      id, name: `Canvas ${boards.length + 1}`, kind: 'canvas',
      color: CANVAS_COLORS[boards.length % CANVAS_COLORS.length],
      position: boards.length, viewport: { x: 0, y: 0, z: 1 }, settings: {},
    });
    setBoardId(id);
  };

  const list = (
    <BoardList
      boards={boards} selected={board?.id ?? null} phone={phone}
      onPick={setBoardId} onNew={newBoard}
      onRename={(b) => void ask('Rename canvas', { initial: b.name, placeholder: 'Canvas name' })
        .then((n) => { if (n) A.saveBoard.mutate({ id: b.id, patch: { name: n } }); })}
      onColor={(b, color) => A.saveBoard.mutate({ id: b.id, patch: { color } })}
      onDelete={(b) => void confirmAsk(`Delete “${b.name}”?`, {
        message: 'The cards on it go too. You can undo from the toast.',
        confirmLabel: 'Delete', danger: true,
      }).then((yes) => {
        if (!yes) return;
        A.delBoard.mutate({ id: b.id });
        toast(`Deleted “${b.name}”`, () => A.restoreBoard.mutate({ id: b.id }));
      })} />
  );

  if (phone) {
    return board
      ? <Board key={board.id} board={board} notes={notes} boards={boards} A={A} phone
          accent={prefs.accent} dark={prefs.theme === 'dark'}
          onOpenNote={onOpenNote} onOpenBoard={setBoardId} onBack={() => setBoardId(null)} />
      : <div className="navsb" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{list}</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
      <aside className="navsb" style={{ width: 196, flex: 'none', overflowY: 'auto', minHeight: 0 }}>{list}</aside>
      {board ? (
        <Board key={board.id} board={board} notes={notes} boards={boards} A={A} phone={false}
          accent={prefs.accent} dark={prefs.theme === 'dark'}
          onOpenNote={onOpenNote} onOpenBoard={setBoardId} />
      ) : (
        <div style={{ ...PANEL, flex: 1, display: 'grid', placeItems: 'center', gap: 12, minHeight: 320 }}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 10 }}>
            <p style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No canvases yet.</p>
            <button onClick={newBoard} className="k-squish" style={{ ...BTN, background: 'var(--acc)', color: 'var(--ink)', border: 0 }}>
              <Icon name="plus" size={13} color="var(--ink)" />New canvas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- list */

export function BoardList({
  boards, selected, phone, newLabel = 'New canvas', onPick, onNew, onRename, onColor, onDelete,
}: {
  boards: Board[]; selected: string | null; phone: boolean; newLabel?: string;
  onPick: (id: string) => void; onNew: () => void;
  onRename: (b: Board) => void; onColor: (b: Board, c: string) => void; onDelete: (b: Board) => void;
}) {
  const { prefs } = usePrefs();
  const [menu, setMenu] = useState<{ x: number; y: number; board: Board } | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button onClick={onNew} className="hov k-squish" style={{
        display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px', minHeight: 36,
        borderRadius: 10, border: '1px dashed var(--line2)', fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)',
      }}>
        <Icon name="plus" size={13} color="var(--tx3)" />{newLabel}
      </button>

      {boards.map((b) => {
        const on = b.id === selected;
        return (
          <button key={b.id} onClick={() => onPick(b.id)} aria-current={on ? 'true' : undefined}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, board: b }); }}
            className="hov" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', minHeight: phone ? 44 : 38,
              borderRadius: 10, textAlign: 'left',
              border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`,
              background: on ? 'color-mix(in srgb, var(--acc) 12%, transparent)' : 'var(--card)',
              boxShadow: on ? 'none' : 'var(--sh)',
            }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: b.color, flex: 'none' }} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700,
              color: on ? 'var(--accTx)' : 'var(--tx2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {b.name}
            </span>
            {phone && <Icon name="chev" size={13} color="var(--tx3)" />}
          </button>
        );
      })}

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="node" label={menu.board.name}
          onClose={() => setMenu(null)} accent={prefs.accent} dark={prefs.theme === 'dark'}
          items={[
            { label: 'Rename', icon: 'edit', run: () => onRename(menu.board) },
            {
              label: 'Colour', icon: 'palette',
              items: CANVAS_COLORS.map((c) => ({
                label: c, icon: 'palette' as const, checked: menu.board.color === c,
                run: () => onColor(menu.board, c),
              })),
            },
            { label: 'Delete', icon: 'trash', danger: true, run: () => onDelete(menu.board) },
          ]} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ board */

function Board({
  board, notes, boards, A, phone, accent, dark, onOpenNote, onOpenBoard, onBack,
}: {
  board: Board;
  notes: Note[];
  boards: Board[];
  A: ReturnType<typeof useCanvasActions>;
  phone: boolean;
  accent: string;
  dark: boolean;
  onOpenNote: (id: string) => void;
  onOpenBoard: (id: string) => void;
  onBack?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const { data: nodes = [] } = useNodes(board.id);
  const { data: edges = [] } = useEdges(board.id);

  const [vp, setVp] = useState<VP>(board.viewport ?? { x: 0, y: 0, z: 1 });
  const [sel, setSel] = useState<Sel>({ nodes: [], edges: [] });
  const [gesture, setGesture] = useState<Gesture>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string; items: CtxItem[] } | null>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const boardById = useMemo(() => new Map(boards.map((b) => [b.id, b])), [boards]);
  const view = useCallback((n: CNode): CNode => ({ ...n, ...(drafts[n.id] ?? {}) }), [drafts]);

  /* ---------------------------------------------------------------- undo */

  /**
   * One stack of inverses, pushed by whatever just happened. Not a full
   * command history — no redo, no coalescing — but it covers the gestures you
   * regret: a card dropped in the wrong place, a delete, a colour, a
   * connection. A canvas without undo is a canvas people are afraid to use.
   */
  const undos = useRef<{ label: string; run: () => void }[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);
  const pushUndo = useCallback((label: string, run: () => void) => {
    undos.current = [...undos.current.slice(-49), { label, run }];
    setUndoDepth(undos.current.length);
  }, []);
  const undo = useCallback(() => {
    const last = undos.current.pop();
    setUndoDepth(undos.current.length);
    if (!last) return;
    last.run();
    toast(`Undid ${last.label}`);
  }, []);

  /* -------------------------------------------------------- coordinates */

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

  // The viewport is written back on a debounce — a pan fires hundreds of
  // updates and none of them is worth a round trip on its own. Skipping the
  // no-op keeps opening a board from writing to it.
  const saveBoardRef = useRef(A.saveBoard);
  saveBoardRef.current = A.saveBoard;
  useEffect(() => {
    const at = board.viewport ?? { x: 0, y: 0, z: 1 };
    if (Math.abs(at.x - vp.x) < 1 && Math.abs(at.y - vp.y) < 1 && Math.abs(at.z - vp.z) < 0.01) return;
    const t = setTimeout(() => saveBoardRef.current.mutate({ id: board.id, patch: { viewport: vp } }), 900);
    return () => clearTimeout(t);
  }, [vp, board.id, board.viewport]);

  /**
   * Wheel, non-passive so preventDefault actually stops the page scrolling
   * behind the board. A trackpad pinch arrives as a wheel event with ctrlKey
   * set in every browser, which is why one handler covers wheel and pinch.
   */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Shift is the sideways-scroll modifier every OS already uses, so it is
      // the one gesture that stays a pan. Everything else zooms about the
      // pointer: 0.0025 puts one mouse notch (~100px) at about 1.28x, the step
      // Figma and Obsidian settled on, and a trackpad's small deltas land on
      // the same curve so both feel like one control.
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setVp((v) => ({ ...v, x: v.x - (e.deltaX || e.deltaY) }));
        return;
      }
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0025));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /** Two-finger pinch on a touch screen. */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let at: { d: number; cx: number; cy: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ cx: (t[0].clientX + t[1].clientX) / 2, cy: (t[0].clientY + t[1].clientY) / 2 });

    const start = (e: TouchEvent) => { if (e.touches.length === 2) at = { d: dist(e.touches), ...mid(e.touches) }; };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !at) return;
      e.preventDefault();
      const d = dist(e.touches);
      const m = mid(e.touches);
      zoomAt(m.cx, m.cy, d / at.d);
      at = { d, ...m };
    };
    const end = () => { at = null; };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
    };
  }, [zoomAt]);

  /* ------------------------------------------------------------- create */

  const addCard = (wx: number, wy: number, kind: Kind = 'text', extra: Partial<CNode> = {}) => {
    const node = { ...blankNode(board.id, kind, wx, wy, accent, nodes.length), ...extra };
    A.addNodes.mutate({ nodes: [node] });
    pushUndo('the new card', () => A.delNodes.mutate({ ids: [node.id] }));
    setSel({ nodes: [node.id], edges: [] });
    if (kind === 'text') setEditing(node.id);
    return node;
  };

  const insertNote = (wx: number, wy: number, n: Note) =>
    addCard(wx, wy, 'note', { note_id: n.id, text: n.title || 'Untitled', color: accent });

  const insertBoard = (wx: number, wy: number, b: Board) =>
    addCard(wx, wy, 'canvas', { ref_canvas: b.id, text: b.name, color: b.color });

  /* ------------------------------------------------------------ gestures */

  const nodeAt = (wx: number, wy: number): CNode | null => {
    // Topmost first, and groups last so a card sitting inside a group wins.
    const sorted = [...nodes].map(view)
      .sort((a, b) => (b.kind === 'group' ? -1 : 0) - (a.kind === 'group' ? -1 : 0) || b.z - a.z);
    return sorted.find((n) => wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) ?? null;
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
    setGesture({ g: 'pan', sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y });
  };

  const onNodeDown = (e: React.PointerEvent, n: CNode) => {
    e.stopPropagation();
    if (e.button === 2) return;
    if (e.button === 1) { setGesture({ g: 'pan', sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y }); return; }

    const already = sel.nodes.includes(n.id);
    const next: Sel = e.shiftKey
      ? { nodes: already ? sel.nodes.filter((i) => i !== n.id) : [...sel.nodes, n.id], edges: [] }
      : already ? sel : { nodes: [n.id], edges: [] };
    setSel(next);

    const start: Record<string, Draft> = {};
    for (const id of next.nodes.length ? next.nodes : [n.id]) {
      const at = byId.get(id);
      if (at) start[id] = { x: view(at).x, y: view(at).y };
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
      const snap = (v: number) => (e.altKey ? Math.round(v) : Math.round(v / SNAP) * SNAP);
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
      setDrafts((d) => ({ ...d, [gesture.id]: resized(gesture, dx, dy, !e.altKey) }));
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

  /**
   * A blank card at the end of a connection that landed on nothing, nudged so
   * the drop point is the middle of the side facing back at its parent.
   */
  const blankAt = (g: { side: Side; x: number; y: number }, from: CNode): CNode => {
    const n = blankNode(board.id, 'text', g.x, g.y, from.color || accent, nodes.length);
    const off = 0.5;
    if (g.side === 'right') n.x = Math.round(g.x);
    if (g.side === 'left') n.x = Math.round(g.x - n.w);
    if (g.side === 'bottom') n.y = Math.round(g.y);
    if (g.side === 'top') n.y = Math.round(g.y - n.h);
    if (g.side === 'left' || g.side === 'right') n.y = Math.round(g.y - n.h * off);
    if (g.side === 'top' || g.side === 'bottom') n.x = Math.round(g.x - n.w * off);
    A.addNodes.mutate({ nodes: [n] });
    return n;
  };

  const onPointerUp = () => {
    if (!gesture) return;

    if (gesture.g === 'move' || gesture.g === 'resize') {
      const moves: { id: string; x: number; y: number; w?: number; h?: number }[] = [];
      const before: typeof moves = [];
      for (const [id, d] of Object.entries(drafts)) {
        const n = byId.get(id);
        if (!n) continue;
        const changed = d.x !== n.x || d.y !== n.y || (d.w !== undefined && d.w !== n.w) || (d.h !== undefined && d.h !== n.h);
        if (!changed) continue;
        moves.push({ id, x: Math.round(d.x), y: Math.round(d.y), w: d.w, h: d.h });
        before.push({ id, x: n.x, y: n.y, w: n.w, h: n.h });
      }
      // Commit on drop, not per frame — one write per card that actually moved.
      if (moves.length) {
        A.moveNodes.mutate({ moves });
        pushUndo(gesture.g === 'resize' ? 'the resize' : 'the move', () => A.moveNodes.mutate({ moves: before }));
      }
      setDrafts({});
    }

    if (gesture.g === 'link') {
      const from = byId.get(gesture.from);
      if (from) {
        // Dropped on a card: join them. Dropped on nothing: make the card you
        // were reaching for, where you let go, already connected. That second
        // case is the one that makes an Obsidian canvas quick — the thought
        // and the card that holds it are one gesture.
        const to = gesture.over ? byId.get(gesture.over) ?? null : blankAt(gesture, from);
        if (to) {
          const [, toSide] = bestSides(view(from), to);
          const edge: CEdge = {
            id: crypto.randomUUID(), canvas_id: board.id,
            from_node: from.id, to_node: to.id, from_side: gesture.side, to_side: toSide,
            label: '', color: from.color || accent,
          };
          A.addEdges.mutate({ edges: [edge] });
          const fresh = !gesture.over;
          pushUndo(fresh ? 'the new card' : 'the connection', () => {
            A.delEdges.mutate({ ids: [edge.id] });
            if (fresh) A.delNodes.mutate({ ids: [to.id] });
          });
          if (fresh) { setSel({ nodes: [to.id], edges: [] }); setEditing(to.id); }
        }
      }
    }

    if (gesture.g === 'marquee') {
      const x0 = Math.min(gesture.sx, gesture.x), x1 = Math.max(gesture.sx, gesture.x);
      const y0 = Math.min(gesture.sy, gesture.y), y1 = Math.max(gesture.sy, gesture.y);
      setSel({
        nodes: nodes.map(view).filter((n) => n.x < x1 && n.x + n.w > x0 && n.y < y1 && n.y + n.h > y0).map((n) => n.id),
        edges: [],
      });
    }

    setGesture(null);
  };

  /* -------------------------------------------------------------- verbs */

  const removeSelection = useCallback((nodeIds: string[], edgeIds: string[]) => {
    const goneNodes = nodes.filter((n) => nodeIds.includes(n.id));
    // Edges hanging off a deleted card die with it, so undo has to bring them
    // back too — otherwise "undo delete" returns the cards and loses the wiring.
    const goneEdges = edges.filter((e) => edgeIds.includes(e.id) || nodeIds.includes(e.from_node) || nodeIds.includes(e.to_node));
    if (edgeIds.length) A.delEdges.mutate({ ids: edgeIds });
    if (nodeIds.length) A.delNodes.mutate({ ids: nodeIds });
    const n = goneNodes.length + goneEdges.length;
    if (!n) return;
    pushUndo('the delete', () => {
      if (goneNodes.length) A.addNodes.mutate({ nodes: goneNodes });
      if (goneEdges.length) A.addEdges.mutate({ edges: goneEdges });
    });
    setSel({ nodes: [], edges: [] });
    toast(`Deleted ${n} item${n === 1 ? '' : 's'}`, () => {
      if (goneNodes.length) A.addNodes.mutate({ nodes: goneNodes });
      if (goneEdges.length) A.addEdges.mutate({ edges: goneEdges });
    });
  }, [nodes, edges, A, pushUndo]);

  const recolour = (ids: string[], color: string) => {
    const before = ids.map((id) => ({ id, color: byId.get(id)?.color ?? accent }));
    for (const id of ids) A.saveNode.mutate({ id, patch: { color } });
    pushUndo('the colour', () => before.forEach((b) => A.saveNode.mutate({ id: b.id, patch: { color: b.color } })));
  };

  /** What a card does when you open it: its note, its board, or its text. */
  const activate = (n: CNode) => {
    if (n.kind === 'note' && n.note_id) { onOpenNote(n.note_id); return; }
    if (n.kind === 'canvas' && n.ref_canvas) { onOpenBoard(n.ref_canvas); return; }
    setEditing(n.id);
  };

  /* ----------------------------------------------------------- keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (/input|textarea/i.test(el?.tagName ?? '')) {
        if (e.key === 'Escape') el?.blur();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault(); setSel({ nodes: nodes.map((n) => n.id), edges: [] }); return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && (sel.nodes.length || sel.edges.length)) {
        e.preventDefault(); removeSelection(sel.nodes, sel.edges); return;
      }
      if (e.key === 'Escape') { setSel({ nodes: [], edges: [] }); setEditing(null); }
      if (e.key === '=' || e.key === '+') { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); }
      if (e.key === '-') { const r = wrap.current!.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); }
      if (e.key === '0') fit();
      if (e.key === 'Enter' && sel.nodes.length === 1) { const n = byId.get(sel.nodes[0]); if (n) activate(n); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, nodes, removeSelection, fit, zoomAt, undo]);

  /* --------------------------------------------------------------- menu */

  const insertItems = (wx: number, wy: number): CtxItem[] => [
    { label: 'New card', icon: 'plus', run: () => addCard(wx, wy) },
    { label: 'New group', icon: 'layers', run: () => addCard(wx, wy, 'group') },
    {
      label: 'Insert a note', icon: 'book',
      items: notes.length
        ? notes.slice(0, 24).map((n) => ({ label: n.title || 'Untitled', icon: 'text' as const, run: () => insertNote(wx, wy, n) }))
        : [{ label: 'No notes yet', icon: 'text' as const, disabled: true }],
    },
    {
      label: 'Insert a canvas', icon: 'grid',
      items: boards.filter((b) => b.id !== board.id).length
        ? boards.filter((b) => b.id !== board.id).map((b) => ({ label: b.name, icon: 'grid' as const, run: () => insertBoard(wx, wy, b) }))
        : [{ label: 'No other canvases', icon: 'grid' as const, disabled: true }],
    },
  ];

  const cardItems = (n: CNode): CtxItem[] => [
    { label: n.kind === 'note' ? 'Open the note' : n.kind === 'canvas' ? 'Open the canvas' : 'Edit text',
      icon: n.kind === 'text' || n.kind === 'group' ? 'edit' : 'expand', run: () => activate(n) },
    { label: 'Rename', icon: 'text', run: () => void ask('Card text', { initial: n.text, placeholder: 'Card text' })
      .then((t) => { if (t !== null) A.saveNode.mutate({ id: n.id, patch: { text: t } }); }) },
    { label: 'Duplicate', icon: 'copy', run: () => {
      const copy = { ...n, id: crypto.randomUUID(), x: n.x + 24, y: n.y + 24, z: nodes.length };
      A.addNodes.mutate({ nodes: [copy] });
      pushUndo('the duplicate', () => A.delNodes.mutate({ ids: [copy.id] }));
    } },
    { label: 'Bring to front', icon: 'up', run: () => A.saveNode.mutate({ id: n.id, patch: { z: nodes.length + 1 } }) },
    {
      label: 'Colour', icon: 'palette',
      items: CANVAS_COLORS.map((c) => ({
        label: c, icon: 'palette' as const, checked: n.color === c,
        run: () => recolour(sel.nodes.includes(n.id) ? sel.nodes : [n.id], c),
      })),
    },
    { label: 'Delete', icon: 'trash', danger: true, run: () => removeSelection(sel.nodes.includes(n.id) ? sel.nodes : [n.id], []) },
  ];

  const openMenuAt = (sx: number, sy: number) => {
    const w = toWorld(sx, sy);
    const hit = nodeAt(w.x, w.y);
    if (hit) setSel((s) => (s.nodes.includes(hit.id) ? s : { nodes: [hit.id], edges: [] }));
    setMenu({
      x: sx, y: sy,
      label: hit ? (hit.text.slice(0, 24) || 'Card') : board.name,
      items: hit ? cardItems(hit) : [
        ...insertItems(w.x, w.y),
        { label: 'Zoom to fit', icon: 'target', run: fit },
        { label: 'Undo', icon: 'undo', disabled: undoDepth === 0, run: undo },
      ],
    });
  };

  /* ------------------------------------------------------------- render */

  // A 10px dot is a mouse target; a finger needs about twice that (WCAG
  // 2.5.5), so the hit area grows on touch while the dot itself does not.
  const HANDLE = phone ? 24 : 11;
  const EDGE = phone ? 16 : 8;
  const selSet = useMemo(() => new Set(sel.nodes), [sel.nodes]);
  const ordered = useMemo(
    () => [...nodes].sort((a, b) => (a.kind === 'group' ? -1 : 0) - (b.kind === 'group' ? -1 : 0) || a.z - b.z),
    [nodes],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0, gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        {onBack && (
          <button onClick={onBack} className="hov" aria-label="All canvases"
            style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line2)', display: 'grid', placeItems: 'center' }}>
            <Icon name="back" size={14} color="var(--tx2)" />
          </button>
        )}
        <span style={{ width: 8, height: 8, borderRadius: 3, background: board.color, flex: 'none' }} />
        <div style={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {board.name}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>
          {nodes.length} card{nodes.length === 1 ? '' : 's'} · {edges.length} link{edges.length === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ ...PANEL, position: 'relative', flex: 1, minHeight: phone ? 380 : 320, overflow: 'hidden' }}>
        <div
          ref={wrap}
          onPointerDown={onBackgroundDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onDoubleClick={(e) => { const w = toWorld(e.clientX, e.clientY); addCard(w.x, w.y); }}
          onContextMenu={(e) => { e.preventDefault(); openMenuAt(e.clientX, e.clientY); }}
          role="application"
          aria-label={`${board.name} canvas`}
          style={{
            position: 'absolute', inset: 0, touchAction: 'none', overflow: 'hidden',
            cursor: gesture?.g === 'pan' ? 'grabbing' : 'grab',
            // The dot grid is painted in screen space but sized and offset from
            // the viewport, so it reads as part of the world for free.
            backgroundImage: 'radial-gradient(circle, var(--line2) 1px, transparent 1px)',
            backgroundSize: `${GRID * vp.z}px ${GRID * vp.z}px`,
            backgroundPosition: `${vp.x}px ${vp.y}px`,
          }}>

          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.z})`, transformOrigin: '0 0' }}>
            <svg style={{ position: 'absolute', left: -20000, top: -20000, width: 40000, height: 40000, overflow: 'visible', pointerEvents: 'none' }}>
              <defs>
                {(['on', 'off'] as const).map((k) => (
                  <marker key={k} id={`ar-${board.id}-${k}`} viewBox="0 0 10 10" refX={9} refY={5}
                    markerWidth={5} markerHeight={5} orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" opacity={k === 'on' ? 1 : 0.85} />
                  </marker>
                ))}
              </defs>
              <g transform="translate(20000, 20000)">
                {edges.map((e) => {
                  const from = byId.get(e.from_node);
                  const to = byId.get(e.to_node);
                  if (!from || !to) return null;
                  const a = anchor(view(from), e.from_side);
                  const b = anchor(view(to), e.to_side);
                  const d = edgePath(a, e.from_side, b, e.to_side);
                  const on = sel.edges.includes(e.id);
                  return (
                    <g key={e.id} style={{ pointerEvents: 'stroke' }}>
                      {/* Fat invisible stroke, so a 2px line is still clickable. */}
                      <path d={d} stroke="transparent" strokeWidth={14} fill="none" style={{ cursor: 'pointer' }}
                        onPointerDown={(ev) => { ev.stopPropagation(); setSel({ nodes: [], edges: [e.id] }); }}
                        onContextMenu={(ev) => {
                          ev.preventDefault(); ev.stopPropagation();
                          setMenu({
                            x: ev.clientX, y: ev.clientY, label: e.label || 'Connection',
                            items: [
                              { label: 'Label…', icon: 'edit', run: () => void ask('Label this connection', { initial: e.label, placeholder: 'e.g. leads to' })
                                .then((l) => { if (l !== null) A.saveEdge.mutate({ id: e.id, patch: { label: l } }); }) },
                              { label: 'Flip direction', icon: 'refresh', run: () => A.saveEdge.mutate({
                                id: e.id, patch: { from_node: e.to_node, to_node: e.from_node, from_side: e.to_side, to_side: e.from_side },
                              }) },
                              { label: 'Delete', icon: 'trash', danger: true, run: () => removeSelection([], [e.id]) },
                            ],
                          });
                        }} />
                      <path d={d} stroke={e.color} strokeWidth={on ? 3 : 2} fill="none"
                        markerEnd={`url(#ar-${board.id}-${on ? 'on' : 'off'})`} opacity={on ? 1 : 0.85} />
                      {e.label && (
                        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle"
                          style={{ fill: 'var(--tx2)', fontSize: 11, fontWeight: 600, paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 4 }}>
                          {e.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {gesture?.g === 'link' && (() => {
                  const from = byId.get(gesture.from);
                  if (!from) return null;
                  const a = anchor(view(from), gesture.side);
                  return <path d={edgePath(a, gesture.side, { x: gesture.x, y: gesture.y }, 'left')}
                    stroke="var(--acc)" strokeWidth={2} strokeDasharray="6 4" fill="none" />;
                })()}

                {gesture?.g === 'marquee' && (
                  <rect x={Math.min(gesture.sx, gesture.x)} y={Math.min(gesture.sy, gesture.y)}
                    width={Math.abs(gesture.x - gesture.sx)} height={Math.abs(gesture.y - gesture.sy)}
                    fill="color-mix(in srgb, var(--acc) 12%, transparent)" stroke="var(--acc)" strokeWidth={1} />
                )}
              </g>
            </svg>

            {ordered.map((raw) => {
              const n = view(raw);
              return (
                <Card
                  key={n.id} node={n} selected={selSet.has(n.id)} editing={editing === n.id}
                  note={n.note_id ? noteById.get(n.note_id) ?? null : null}
                  target={n.ref_canvas ? boardById.get(n.ref_canvas) ?? null : null}
                  linking={gesture?.g === 'link' && gesture.over === n.id}
                  handle={HANDLE} edge={EDGE}
                  onDown={(e) => onNodeDown(e, raw)}
                  onActivate={() => activate(n)}
                  onEdited={(text) => A.saveNode.mutate({ id: n.id, patch: { text } })}
                  onDoneEditing={() => setEditing(null)}
                  onLink={(side, e) => {
                    const w = toWorld(e.clientX, e.clientY);
                    setGesture({ g: 'link', from: n.id, side, x: w.x, y: w.y, over: null });
                  }}
                  onResize={(h, e) => setGesture({
                    g: 'resize', id: n.id, handle: h,
                    sx: e.clientX, sy: e.clientY, x: n.x, y: n.y, w: n.w, h: n.h,
                  })} />
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------ toolbars */}
        <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 6, zIndex: 4, flexWrap: 'wrap' }}>
          <button onClick={() => { const c = centreOfView(); addCard(c.x, c.y); }} className="k-squish"
            style={{ ...BTN, background: 'var(--acc)', color: 'var(--ink)', border: 0 }}>
            <Icon name="plus" size={13} color="var(--ink)" />Card
          </button>
          <button onClick={(e) => { const c = centreOfView(); setMenu({ x: e.clientX, y: e.clientY, label: 'Insert', items: insertItems(c.x, c.y) }); }}
            className="hov k-squish" style={BTN}>
            <Icon name="layers" size={13} color="var(--tx2)" />Insert
          </button>
          <button onClick={undo} disabled={undoDepth === 0} className="hov k-squish" aria-label="Undo"
            style={{ ...BTN, opacity: undoDepth ? 1 : 0.45 }}>
            <Icon name="undo" size={13} color="var(--tx2)" />Undo
          </button>
        </div>

        {sel.nodes.length > 0 && (
          <div className="k-bloom hbar" style={{
            position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 14, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 14,
            background: 'var(--card2)', border: '1px solid var(--line2)', boxShadow: 'var(--shl)',
            maxWidth: 'calc(100% - 24px)', overflowX: 'auto',
          }}>
            <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, color: 'var(--tx3)', marginRight: 2 }}>
              {sel.nodes.length} selected
            </span>
            {sel.nodes.length === 1 && (
              <button onClick={() => { const n = byId.get(sel.nodes[0]); if (n) activate(n); }}
                className="hov k-squish" aria-label="Open this card"
                style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center' }}>
                <Icon name="edit" size={13} color="var(--tx2)" />
              </button>
            )}
            {CANVAS_COLORS.map((c) => (
              <button key={c} onClick={() => recolour(sel.nodes, c)} aria-label={`Colour ${c}`} className="k-swatch"
                style={{ flex: 'none', width: phone ? 26 : 20, height: phone ? 26 : 20, borderRadius: 6, background: c }} />
            ))}
            <button onClick={() => removeSelection(sel.nodes, sel.edges)} className="hov k-squish" aria-label="Delete selection"
              style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', marginLeft: 3 }}>
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
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.9 }}>
              {phone ? 'Tap Card to drop one in.' : 'Double-click anywhere to drop a card.'}<br />
              <span style={{ fontSize: 11 }}>
                Insert puts a note or another canvas on the board — that is what the graph reads.
              </span>
            </div>
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} kind="node" label={menu.label} items={menu.items}
          onClose={() => setMenu(null)} accent={accent} dark={dark} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- card */

function Card({
  node: n, selected, editing, note, target, linking, handle, edge,
  onDown, onActivate, onEdited, onDoneEditing, onLink, onResize,
}: {
  node: CNode; selected: boolean; editing: boolean;
  note: Note | null; target: Board | null; linking: boolean;
  handle: number; edge: number;
  onDown: (e: React.PointerEvent) => void;
  onActivate: () => void;
  onEdited: (text: string) => void;
  onDoneEditing: () => void;
  onLink: (side: Side, e: React.PointerEvent) => void;
  onResize: (h: Handle, e: React.PointerEvent) => void;
}) {
  const isGroup = n.kind === 'group';
  const [hover, setHover] = useState(false);
  // Obsidian shows a card's connection dots on hover, not only once it is
  // selected — reaching for one should not cost a click first.
  const showDots = (selected || hover) && !isGroup;

  return (
    <div
      onPointerDown={onDown}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={(e) => { e.stopPropagation(); onActivate(); }}
      style={{
        position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h,
        borderRadius: isGroup ? 14 : 11,
        background: isGroup ? `color-mix(in srgb, ${n.color} 7%, transparent)` : 'var(--card2)',
        border: `${selected ? 2 : 1}px solid ${selected ? 'var(--acc)' : isGroup ? `color-mix(in srgb, ${n.color} 50%, transparent)` : 'var(--line2)'}`,
        boxShadow: selected ? 'var(--shl)' : isGroup ? 'none' : 'var(--sh)',
        cursor: 'grab', userSelect: 'none',
      }}>

      {isGroup ? (
        <div style={{ padding: '7px 11px', fontSize: 11, fontWeight: 800, letterSpacing: '.02em', color: n.color }}>
          {n.text || 'Group'}
        </div>
      ) : editing ? (
        <CardEditor text={n.text} onChange={onEdited} onDone={onDoneEditing} />
      ) : n.kind === 'note' ? (
        <CardBody icon="book" kicker={note ? 'Note' : 'Note — missing'} color={n.color}
          title={note?.title || n.text || 'Untitled'} body={note ? preview(note.body, 120) : 'This note has been deleted.'} />
      ) : n.kind === 'canvas' ? (
        <CardBody icon="grid" kicker="Canvas" color={target?.color ?? n.color}
          title={target?.name || n.text || 'Canvas'} body={target ? 'Double-click to open this board.' : 'This canvas has been deleted.'} />
      ) : (
        <div style={{
          padding: '9px 11px', fontSize: 12, lineHeight: 1.45, fontWeight: 600, height: '100%',
          color: n.text ? 'var(--tx)' : 'var(--tx3)', whiteSpace: 'pre-wrap', overflow: 'hidden',
        }}>
          {n.text || 'Empty card — double-click to write'}
        </div>
      )}

      {!isGroup && (
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 2, background: n.color }} />
      )}

      {/* Every edge and every corner resizes — the whole box is the handle,
          which is what people try first and what every other canvas allows. */}
      {(selected || hover) && HANDLES.map((h) => (
        <span key={h} aria-hidden
          onPointerDown={(e) => { e.stopPropagation(); onResize(h, e); }}
          style={{ ...edgeBox(h, edge), position: 'absolute', zIndex: 3, touchAction: 'none', cursor: CURSOR[h] }} />
      ))}
      {selected && !isGroup && (
        <span aria-hidden style={{
          position: 'absolute', right: -1, bottom: -1, width: 9, height: 9,
          borderBottom: '2px solid var(--acc)', borderRight: '2px solid var(--acc)',
          borderBottomRightRadius: 4, pointerEvents: 'none',
        }} />
      )}

      {/* The four circles do one job: start a connection. Let go over another
          card to join them, or over empty space for a new card already on the
          end of the line. */}
      {showDots && (['top', 'right', 'bottom', 'left'] as Side[]).map((side) => {
        const p = anchor({ x: 0, y: 0, w: n.w, h: n.h }, side);
        return (
          <span key={side} title="Drag to connect — or to empty space for a new card"
            onPointerDown={(e) => { e.stopPropagation(); onLink(side, e); }}
            style={{
              position: 'absolute', left: p.x - handle / 2, top: p.y - handle / 2,
              width: handle, height: handle, borderRadius: handle / 2,
              background: 'var(--acc)', border: '2px solid var(--card)',
              cursor: 'crosshair', zIndex: 4, touchAction: 'none',
            }} />
        );
      })}

      {linking && (
        <span aria-hidden style={{ position: 'absolute', inset: -3, borderRadius: 13, border: '2px dashed var(--acc)' }} />
      )}
    </div>
  );
}

function CardBody({
  icon, kicker, title, body, color,
}: { icon: 'book' | 'grid'; kicker: string; title: string; body: string; color: string }) {
  return (
    <div style={{ padding: '9px 11px', height: '100%', display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon name={icon} size={11} color={color} />
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.11em', textTransform: 'uppercase', color: 'var(--tx3)' }}>
          {kicker}
        </span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {title}
      </div>
      <div style={{
        fontSize: 11, lineHeight: 1.45, color: 'var(--tx3)', overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
      }}>
        {body}
      </div>
    </div>
  );
}

/**
 * Card text saves on a debounce and flushes when the editor goes away, rather
 * than only on blur. A card is a note in miniature, and it used to lose text
 * the same way one did: type, navigate, and the keystrokes that never reached a
 * write were gone.
 */
function CardEditor({ text, onChange, onDone }: { text: string; onChange: (t: string) => void; onDone: () => void }) {
  const [value, setValue] = useState(text);
  const timer = useRef<number>(0);
  const latest = useRef<string | null>(null);
  const save = useRef(onChange);
  save.current = onChange;

  useEffect(() => () => {
    clearTimeout(timer.current);
    if (latest.current !== null) save.current(latest.current);
  }, []);

  const type = (t: string) => {
    setValue(t);
    latest.current = t;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const v = latest.current;
      latest.current = null;
      if (v !== null) save.current(v);
    }, SAVE_MS);
  };

  return (
    <textarea
      autoFocus
      value={value}
      onChange={(e) => type(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={onDone}
      onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
      placeholder="Type…"
      className="writing"
      style={{
        width: '100%', height: '100%', padding: '9px 11px', resize: 'none',
        fontSize: 12, lineHeight: 1.45, fontFamily: 'inherit', color: 'var(--tx)', background: 'transparent',
      }} />
  );
}

/**
 * Where a resize handle sits and how far it reaches. Edges are thin strips down
 * the whole side; corners are squares that overlap them and win, because they
 * are declared after. Everything is inset by half its thickness so the grab
 * area straddles the border rather than sitting inside the card, which is what
 * makes the cursor change exactly where the edge looks like it is.
 */
function edgeBox(h: Handle, t: number): React.CSSProperties {
  const half = -t / 2;
  const corner = { width: t, height: t };
  switch (h) {
    case 'n': return { top: half, left: t, right: t, height: t };
    case 's': return { bottom: half, left: t, right: t, height: t };
    case 'w': return { left: half, top: t, bottom: t, width: t };
    case 'e': return { right: half, top: t, bottom: t, width: t };
    case 'nw': return { top: half, left: half, ...corner };
    case 'ne': return { top: half, right: half, ...corner };
    case 'sw': return { bottom: half, left: half, ...corner };
    case 'se': return { bottom: half, right: half, ...corner };
  }
}

const CURSOR: Record<Handle, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

export const PANEL: React.CSSProperties = { background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)' };
export const BTN: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9,
  border: '1px solid var(--line2)', background: 'var(--card2)',
  fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)', minHeight: 34,
};
export const ICON_BTN: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line2)', background: 'var(--card2)',
  display: 'grid', placeItems: 'center',
};
