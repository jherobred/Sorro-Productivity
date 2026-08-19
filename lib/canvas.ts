'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { settler } from './settle';
import { toast } from './toast';

/**
 * Canvases — Obsidian's infinite board, rewritten.
 *
 * What the old version got wrong, and what this file exists to keep right:
 *
 * 1. **The card kinds were fiction.** The board wrote `kind: 'text'` and
 *    `'group'`; the table's check constraint allowed `'hub' | 'note' | 'flag' |
 *    'muted'`, left over from a scratch-board that no longer exists. Every card
 *    insert failed, so production held two canvases and zero cards — a board
 *    where everything you drop vanishes on the next refetch. `KINDS` below is
 *    now the same list as `bd_canvas_nodes_kind_check` (0003_canvas_v2.sql).
 *    If you add a kind here, add it there in the same commit.
 *
 * 2. **Card text was only ever saved on blur.** A card is a note in miniature
 *    and it loses text the same way: type, navigate away, and the keystrokes
 *    that never reached a write are gone. Text now saves on a debounce with the
 *    typed-but-unwritten copy overlaid on every read, which is the rule
 *    `lib/notes.ts` arrived at the hard way.
 *
 * 3. **A canvas row is a board or a graph view.** A saved graph needs a name, a
 *    colour and a remembered viewport, which is precisely this table. `kind`
 *    says which it is; `settings` carries what the graph draws.
 */

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** Must match bd_canvas_nodes_kind_check. See rule 1 above. */
export const KINDS = ['text', 'note', 'canvas', 'group'] as const;
export type Kind = (typeof KINDS)[number];

export type CNode = {
  id: string;
  canvas_id: string;
  kind: Kind;
  text: string;
  x: number; y: number; w: number; h: number;
  color: string;
  /** Set on `note` cards: the note this card shows. */
  note_id: string | null;
  /** Set on `canvas` cards: the board this card opens. */
  ref_canvas: string | null;
  z: number;
};

export type CEdge = {
  id: string;
  canvas_id: string;
  from_node: string;
  to_node: string;
  from_side: Side;
  to_side: Side;
  label: string;
  color: string;
};

export type GraphSettings = {
  canvases: boolean;   // the board hubs themselves
  cards: boolean;      // every card on every board
  notes: boolean;      // notebook notes
  orphans: boolean;    // things nothing points at
  labels: boolean;
  spread: number;      // 0.5 – 2, how far apart the simulation settles
};

export const DEFAULT_GRAPH: GraphSettings = {
  canvases: true, cards: true, notes: true, orphans: true, labels: true, spread: 1,
};

export type Board = {
  id: string;
  name: string;
  kind: 'canvas' | 'graph';
  color: string;
  position: number;
  viewport: { x: number; y: number; z: number };
  settings: Partial<GraphSettings>;
  updated_at: string;
};

/** Obsidian's six card colours, in its order. */
export const CANVAS_COLORS = ['#7C6CFF', '#FF6B6B', '#FFC24B', '#34D9A0', '#38D6F2', '#FF6FA8'];

const BOARD_COLS = 'id,name,kind,color,position,viewport,settings,updated_at';
const NODE_COLS = 'id,canvas_id,kind,text,x,y,w,h,color,note_id,ref_canvas,z';
const EDGE_COLS = 'id,canvas_id,from_node,to_node,from_side,to_side,label,color';

export const BOARDS = ['canvases'] as const;
export const nodesKey = (id: string | null) => ['canvas_nodes', id] as const;
export const edgesKey = (id: string | null) => ['canvas_edges', id] as const;
export const ALL_NODES = ['canvas_nodes_all'] as const;
export const ALL_EDGES = ['canvas_edges_all'] as const;

/** Typed-but-unwritten card text, keyed by node id. See rule 2 above. */
const pending = new Map<string, string>();
const overlay = (rows: CNode[]): CNode[] =>
  rows.map((n) => (pending.has(n.id) ? { ...n, text: pending.get(n.id)! } : n));

/* ------------------------------------------------------------------- reads */

/** Every canvas row. Callers filter by kind — boards and graphs share a shelf. */
export function useBoards() {
  return useQuery({
    queryKey: BOARDS,
    queryFn: async (): Promise<Board[]> => {
      const { data, error } = await supabase.from('bd_canvases')
        .select(BOARD_COLS).is('deleted_at', null).order('position').order('created_at');
      if (error) throw error;
      return (data ?? []).map((b) => ({ ...b, settings: b.settings ?? {} })) as Board[];
    },
  });
}

export function useNodes(canvasId: string | null) {
  return useQuery({
    queryKey: nodesKey(canvasId),
    enabled: !!canvasId,
    queryFn: async (): Promise<CNode[]> => {
      const { data, error } = await supabase.from('bd_canvas_nodes').select(NODE_COLS).eq('canvas_id', canvasId!);
      if (error) throw error;
      return overlay((data ?? []) as CNode[]);
    },
  });
}

export function useEdges(canvasId: string | null) {
  return useQuery({
    queryKey: edgesKey(canvasId),
    enabled: !!canvasId,
    queryFn: async (): Promise<CEdge[]> => {
      const { data, error } = await supabase.from('bd_canvas_edges').select(EDGE_COLS).eq('canvas_id', canvasId!);
      if (error) throw error;
      return (data ?? []) as CEdge[];
    },
  });
}

/**
 * Every card and every connection, across every board — what the graph view
 * draws. One query each rather than one per board: RLS already scopes these to
 * the signed-in user, and a student's boards are a few hundred rows.
 *
 * ponytail: no pagination. Add a `limit` and a "too big to draw" notice if
 * anyone's boards ever run to thousands of cards.
 */
export function useAllNodes() {
  return useQuery({
    queryKey: ALL_NODES,
    queryFn: async (): Promise<CNode[]> => {
      const { data, error } = await supabase.from('bd_canvas_nodes').select(NODE_COLS);
      if (error) throw error;
      return overlay((data ?? []) as CNode[]);
    },
  });
}

export function useAllEdges() {
  return useQuery({
    queryKey: ALL_EDGES,
    queryFn: async (): Promise<CEdge[]> => {
      const { data, error } = await supabase.from('bd_canvas_edges').select(EDGE_COLS);
      if (error) throw error;
      return (data ?? []) as CEdge[];
    },
  });
}

/* --------------------------------------------------------------- mutations */

const NEW_BOARD = defineMutation('cv2.newBoard', async (v: Omit<Board, 'updated_at'>) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_canvases').insert({
    id: v.id, user_id, name: v.name, kind: v.kind, color: v.color,
    position: v.position, viewport: v.viewport, settings: v.settings,
  });
  if (error) throw error;
});

const SAVE_BOARD = defineMutation('cv2.saveBoard', async (v: { id: string; patch: Partial<Board> }) => {
  const { error } = await supabase.from('bd_canvases').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DEL_BOARD = defineMutation('cv2.delBoard', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_canvases')
    .update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const RESTORE_BOARD = defineMutation('cv2.restoreBoard', async (v: { id: string }) => {
  const { error } = await supabase.rpc('bd_restore', { p_table: 'bd_canvases', p_id: v.id });
  if (error) throw error;
});

/** Insert, not upsert-on-conflict-do-nothing: undo re-adds the same id. */
const ADD_NODES = defineMutation('cv2.addNodes', async (v: { nodes: CNode[] }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_canvas_nodes')
    .upsert(v.nodes.map((n) => ({ ...n, user_id })), { onConflict: 'id' });
  if (error) throw error;
});

const SAVE_NODE = defineMutation('cv2.saveNode', async (v: { id: string; patch: Partial<CNode> }) => {
  const { error } = await supabase.from('bd_canvas_nodes').update(v.patch).eq('id', v.id);
  if (error) throw error;
  if (v.patch.text !== undefined && pending.get(v.id) === v.patch.text) pending.delete(v.id);
});

/** One round trip for a whole drag, however many cards moved. */
const MOVE_NODES = defineMutation('cv2.moveNodes', async (v: { moves: { id: string; x: number; y: number; w?: number; h?: number }[] }) => {
  for (const m of v.moves) {
    const patch: Record<string, number> = { x: m.x, y: m.y };
    if (m.w !== undefined) patch.w = m.w;
    if (m.h !== undefined) patch.h = m.h;
    const { error } = await supabase.from('bd_canvas_nodes').update(patch).eq('id', m.id);
    if (error) throw error;
  }
});

const DEL_NODES = defineMutation('cv2.delNodes', async (v: { ids: string[] }) => {
  const { error } = await supabase.from('bd_canvas_nodes').delete().in('id', v.ids);
  if (error) throw error;
});

const ADD_EDGES = defineMutation('cv2.addEdges', async (v: { edges: CEdge[] }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_canvas_edges')
    .upsert(v.edges.map((e) => ({ ...e, user_id })), { onConflict: 'id' });
  if (error) throw error;
});

const SAVE_EDGE = defineMutation('cv2.saveEdge', async (v: { id: string; patch: Partial<CEdge> }) => {
  const { error } = await supabase.from('bd_canvas_edges').update(v.patch).eq('id', v.id);
  if (error) throw error;
});

const DEL_EDGES = defineMutation('cv2.delEdges', async (v: { ids: string[] }) => {
  const { error } = await supabase.from('bd_canvas_edges').delete().in('id', v.ids);
  if (error) throw error;
});

/* ----------------------------------------------------------------- actions */

export function useCanvasActions(canvasId: string | null) {
  const qc = useQueryClient();
  const nk = nodesKey(canvasId);
  const ek = edgesKey(canvasId);

  // The board reads its own board-scoped keys; the graph reads the two
  // everything keys. A write has to refresh both or the graph goes stale the
  // moment you add a card.
  const settleNodes = settler(qc, nk, ALL_NODES);
  const settleEdges = settler(qc, ek, ALL_EDGES);
  const settleBoards = settler(qc, BOARDS);

  const patchNodes = (fn: (p: CNode[]) => CNode[]) => {
    const prev = queryClient.getQueryData<CNode[]>(nk) ?? [];
    queryClient.setQueryData<CNode[]>(nk, fn(prev));
    queryClient.setQueryData<CNode[]>(ALL_NODES, (all) => (all ? fn(all) : all));
    return prev;
  };
  const patchEdges = (fn: (p: CEdge[]) => CEdge[]) => {
    const prev = queryClient.getQueryData<CEdge[]>(ek) ?? [];
    queryClient.setQueryData<CEdge[]>(ek, fn(prev));
    queryClient.setQueryData<CEdge[]>(ALL_EDGES, (all) => (all ? fn(all) : all));
    return prev;
  };
  const undoNodes = (_e: unknown, _v: unknown, ctx: CNode[] | undefined) => {
    if (ctx) queryClient.setQueryData(nk, ctx);
  };
  const undoEdges = (_e: unknown, _v: unknown, ctx: CEdge[] | undefined) => {
    if (ctx) queryClient.setQueryData(ek, ctx);
  };

  const addNodes = useMutation<unknown, Error, { nodes: CNode[] }, CNode[]>({
    mutationKey: ADD_NODES,
    onMutate: (v) => patchNodes((p) => [...p.filter((n) => !v.nodes.some((m) => m.id === n.id)), ...v.nodes]),
    onError: (e, _v, ctx) => { undoNodes(e, _v, ctx); toast(e.message); },
    onSettled: settleNodes,
  });

  /**
   * No rollback on a text save, for the reason `lib/notes.ts` spells out:
   * restoring the previous cache after a failed write replaces what was just
   * typed with an older copy of it.
   */
  const saveNode = useMutation<unknown, Error, { id: string; patch: Partial<CNode> }, CNode[]>({
    mutationKey: SAVE_NODE,
    onMutate: (v) => {
      if (v.patch.text !== undefined) pending.set(v.id, v.patch.text);
      return patchNodes((p) => p.map((n) => (n.id === v.id ? { ...n, ...v.patch } : n)));
    },
    onError: (e, v, ctx) => {
      if (v.patch.text === undefined) undoNodes(e, v, ctx);
      toast(`Not saved yet — ${e.message}`);
    },
    onSettled: settleNodes,
  });

  const moveNodes = useMutation<unknown, Error, { moves: { id: string; x: number; y: number; w?: number; h?: number }[] }, CNode[]>({
    mutationKey: MOVE_NODES,
    onMutate: (v) => patchNodes((p) => p.map((n) => {
      const m = v.moves.find((q) => q.id === n.id);
      return m ? { ...n, x: m.x, y: m.y, w: m.w ?? n.w, h: m.h ?? n.h } : n;
    })),
    onError: (e, _v, ctx) => { undoNodes(e, _v, ctx); toast(e.message); },
    onSettled: settleNodes,
  });

  const delNodes = useMutation<unknown, Error, { ids: string[] }, CNode[]>({
    mutationKey: DEL_NODES,
    onMutate: (v) => {
      // Connections to a card that is going would draw to nowhere.
      patchEdges((p) => p.filter((e) => !v.ids.includes(e.from_node) && !v.ids.includes(e.to_node)));
      for (const id of v.ids) pending.delete(id);
      return patchNodes((p) => p.filter((n) => !v.ids.includes(n.id)));
    },
    onError: (e, _v, ctx) => { undoNodes(e, _v, ctx); toast(e.message); },
    onSettled: () => { settleNodes(); settleEdges(); },
  });

  const addEdges = useMutation<unknown, Error, { edges: CEdge[] }, CEdge[]>({
    mutationKey: ADD_EDGES,
    onMutate: (v) => patchEdges((p) => [...p.filter((e) => !v.edges.some((m) => m.id === e.id)), ...v.edges]),
    onError: (e, _v, ctx) => { undoEdges(e, _v, ctx); toast(e.message); },
    onSettled: settleEdges,
  });

  const saveEdge = useMutation<unknown, Error, { id: string; patch: Partial<CEdge> }, CEdge[]>({
    mutationKey: SAVE_EDGE,
    onMutate: (v) => patchEdges((p) => p.map((e) => (e.id === v.id ? { ...e, ...v.patch } : e))),
    onError: (e, _v, ctx) => { undoEdges(e, _v, ctx); toast(e.message); },
    onSettled: settleEdges,
  });

  const delEdges = useMutation<unknown, Error, { ids: string[] }, CEdge[]>({
    mutationKey: DEL_EDGES,
    onMutate: (v) => patchEdges((p) => p.filter((e) => !v.ids.includes(e.id))),
    onError: (e, _v, ctx) => { undoEdges(e, _v, ctx); toast(e.message); },
    onSettled: settleEdges,
  });

  const newBoard = useMutation<unknown, Error, Omit<Board, 'updated_at'>, Board[]>({
    mutationKey: NEW_BOARD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Board[]>(BOARDS) ?? [];
      queryClient.setQueryData<Board[]>(BOARDS, [...prev, { ...v, updated_at: new Date().toISOString() }]);
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(BOARDS, ctx); toast(e.message); },
    onSettled: settleBoards,
  });

  const saveBoard = useMutation<unknown, Error, { id: string; patch: Partial<Board> }, Board[]>({
    mutationKey: SAVE_BOARD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Board[]>(BOARDS) ?? [];
      queryClient.setQueryData<Board[]>(BOARDS, prev.map((b) => (b.id === v.id ? { ...b, ...v.patch } : b)));
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(BOARDS, ctx); },
    onSettled: settleBoards,
  });

  const delBoard = useMutation<unknown, Error, { id: string }, Board[]>({
    mutationKey: DEL_BOARD,
    onMutate: (v) => {
      const prev = queryClient.getQueryData<Board[]>(BOARDS) ?? [];
      queryClient.setQueryData<Board[]>(BOARDS, prev.filter((b) => b.id !== v.id));
      return prev;
    },
    onError: (e, _v, ctx) => { if (ctx) queryClient.setQueryData(BOARDS, ctx); toast(e.message); },
    onSettled: settleBoards,
  });

  const restoreBoard = useMutation<unknown, Error, { id: string }>({
    mutationKey: RESTORE_BOARD, onSettled: settleBoards,
  });

  return {
    addNodes, saveNode, moveNodes, delNodes,
    addEdges, saveEdge, delEdges,
    newBoard, saveBoard, delBoard, restoreBoard,
  };
}

/* --------------------------------------------------------------- geometry */

/** Where an edge leaves a card, in world coordinates. */
export function anchor(n: { x: number; y: number; w: number; h: number }, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: n.x + n.w / 2, y: n.y };
    case 'bottom': return { x: n.x + n.w / 2, y: n.y + n.h };
    case 'left': return { x: n.x, y: n.y + n.h / 2 };
    case 'right': return { x: n.x + n.w, y: n.y + n.h / 2 };
  }
}

const OUT: Record<Side, [number, number]> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * A cubic bezier whose control points push straight out of each side — what
 * makes Obsidian's edges leave a card perpendicular rather than cutting
 * diagonally across it. Control distance grows with the gap, capped so a long
 * edge does not balloon.
 */
export function edgePath(a: { x: number; y: number }, aSide: Side, b: { x: number; y: number }, bSide: Side): string {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const pull = Math.min(Math.max(dist * 0.4, 30), 180);
  const [ax, ay] = OUT[aSide];
  const [bx, by] = OUT[bSide];
  return `M ${a.x} ${a.y} C ${a.x + ax * pull} ${a.y + ay * pull}, ${b.x + bx * pull} ${b.y + by * pull}, ${b.x} ${b.y}`;
}

/** The pair of sides that gives the shortest, least-crossing connection. */
export function bestSides(a: CNode, b: CNode): [Side, Side] {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Bounding box of every card, for zoom-to-fit. */
export function bounds(nodes: { x: number; y: number; w: number; h: number }[]) {
  if (!nodes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** Card defaults per kind, so "new card" is one call everywhere. */
export function blankNode(canvas_id: string, kind: Kind, wx: number, wy: number, color: string, z: number): CNode {
  const w = kind === 'group' ? 320 : kind === 'text' ? 200 : 220;
  const h = kind === 'group' ? 220 : kind === 'text' ? 92 : 104;
  return {
    id: crypto.randomUUID(), canvas_id, kind,
    text: kind === 'group' ? 'Group' : '',
    x: Math.round(wx - w / 2), y: Math.round(wy - h / 2), w, h,
    color, note_id: null, ref_canvas: null,
    z: kind === 'group' ? -1 : z,
  };
}
