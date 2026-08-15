'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, currentUserId } from './supabase';
import { defineMutation, queryClient } from './offline';
import { toast } from './toast';

/** Obsidian-style canvases: many boards, each with its own remembered viewport. */

export type Side = 'top' | 'right' | 'bottom' | 'left';

export type CNode = {
  id: string;
  canvas_id: string;
  kind: 'text' | 'note' | 'group';
  text: string;
  x: number; y: number; w: number; h: number;
  color: string;
  note_id: string | null;
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

export type Board = {
  id: string;
  name: string;
  color: string;
  position: number;
  viewport: { x: number; y: number; z: number };
  updated_at: string;
};

/** Obsidian's six card colours, in its order. */
export const CANVAS_COLORS = ['#7C6CFF', '#FF6B6B', '#FFC24B', '#34D9A0', '#38D6F2', '#FF6FA8'];

const BOARDS = ['canvases'] as const;
const nodesKey = (id: string | null) => ['canvas_nodes', id] as const;
const edgesKey = (id: string | null) => ['canvas_edges', id] as const;

export function useBoards() {
  return useQuery({
    queryKey: BOARDS,
    queryFn: async (): Promise<Board[]> => {
      const { data, error } = await supabase.from('bd_canvases')
        .select('id,name,color,position,viewport,updated_at')
        .is('deleted_at', null).order('position').order('created_at');
      if (error) throw error;
      return (data ?? []) as Board[];
    },
  });
}

export function useNodes(canvasId: string | null) {
  return useQuery({
    queryKey: nodesKey(canvasId),
    enabled: !!canvasId,
    queryFn: async (): Promise<CNode[]> => {
      const { data, error } = await supabase.from('bd_canvas_nodes')
        .select('id,canvas_id,kind,text,x,y,w,h,color,note_id,z').eq('canvas_id', canvasId!);
      if (error) throw error;
      return (data ?? []) as CNode[];
    },
  });
}

export function useEdges(canvasId: string | null) {
  return useQuery({
    queryKey: edgesKey(canvasId),
    enabled: !!canvasId,
    queryFn: async (): Promise<CEdge[]> => {
      const { data, error } = await supabase.from('bd_canvas_edges')
        .select('id,canvas_id,from_node,to_node,from_side,to_side,label,color').eq('canvas_id', canvasId!);
      if (error) throw error;
      return (data ?? []) as CEdge[];
    },
  });
}

/* ------------------------------------------------------------- mutations */

const NEW_BOARD = defineMutation('canvas.newBoard', async (v: { id: string; name: string; color: string }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_canvases').insert({ ...v, user_id });
  if (error) throw error;
});
const SAVE_BOARD = defineMutation('canvas.saveBoard', async (v: { id: string; patch: Partial<Board> }) => {
  const { error } = await supabase.from('bd_canvases').update(v.patch).eq('id', v.id);
  if (error) throw error;
});
const DEL_BOARD = defineMutation('canvas.delBoard', async (v: { id: string }) => {
  const { error } = await supabase.from('bd_canvases').update({ deleted_at: new Date().toISOString() }).eq('id', v.id);
  if (error) throw error;
});

const ADD_NODE = defineMutation('canvas.addNode', async (v: Omit<CNode, 'z'> & { z?: number }) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_canvas_nodes').insert({ ...v, z: v.z ?? 0, user_id });
  if (error) throw error;
});
const SAVE_NODE = defineMutation('canvas.saveNode', async (v: { id: string; patch: Partial<CNode> }) => {
  const { error } = await supabase.from('bd_canvas_nodes').update(v.patch).eq('id', v.id);
  if (error) throw error;
});
const DEL_NODE = defineMutation('canvas.delNode', async (v: { ids: string[] }) => {
  const { error } = await supabase.from('bd_canvas_nodes').delete().in('id', v.ids);
  if (error) throw error;
});

const ADD_EDGE = defineMutation('canvas.addEdge', async (v: CEdge) => {
  const user_id = await currentUserId();
  const { error } = await supabase.from('bd_canvas_edges').insert({ ...v, user_id });
  if (error) throw error;
});
const SAVE_EDGE = defineMutation('canvas.saveEdge', async (v: { id: string; patch: Partial<CEdge> }) => {
  const { error } = await supabase.from('bd_canvas_edges').update(v.patch).eq('id', v.id);
  if (error) throw error;
});
const DEL_EDGE = defineMutation('canvas.delEdge', async (v: { ids: string[] }) => {
  const { error } = await supabase.from('bd_canvas_edges').delete().in('id', v.ids);
  if (error) throw error;
});

/**
 * Every node/edge write is applied to the cache first. Dragging a card commits
 * on drop rather than per frame, but the optimistic patch is still what keeps
 * the card where you left it while the round trip finishes.
 */
export function useCanvasActions(canvasId: string | null) {
  const qc = useQueryClient();
  const nk = nodesKey(canvasId);
  const ek = edgesKey(canvasId);

  const settleNodes = () => void qc.invalidateQueries({ queryKey: nk });
  const settleEdges = () => void qc.invalidateQueries({ queryKey: ek });
  const settleBoards = () => void qc.invalidateQueries({ queryKey: BOARDS });

  const patchNodes = (fn: (p: CNode[]) => CNode[]) => {
    const prev = queryClient.getQueryData<CNode[]>(nk) ?? [];
    queryClient.setQueryData<CNode[]>(nk, fn(prev));
    return prev;
  };
  const patchEdges = (fn: (p: CEdge[]) => CEdge[]) => {
    const prev = queryClient.getQueryData<CEdge[]>(ek) ?? [];
    queryClient.setQueryData<CEdge[]>(ek, fn(prev));
    return prev;
  };

  const addNode = useMutation<unknown, Error, CNode, CNode[]>({
    mutationKey: ADD_NODE,
    onMutate: (v) => patchNodes((p) => [...p, v]),
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(nk, ctx); },
    onSettled: settleNodes,
  });

  const saveNode = useMutation<unknown, Error, { id: string; patch: Partial<CNode> }, CNode[]>({
    mutationKey: SAVE_NODE,
    onMutate: (v) => patchNodes((p) => p.map((n) => (n.id === v.id ? { ...n, ...v.patch } : n))),
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(nk, ctx); },
    onSettled: settleNodes,
  });

  const delNode = useMutation<unknown, Error, { ids: string[] }, CNode[]>({
    mutationKey: DEL_NODE,
    onMutate: (v) => {
      // Edges dangling off a deleted card would render to nowhere, so they go too.
      patchEdges((p) => p.filter((e) => !v.ids.includes(e.from_node) && !v.ids.includes(e.to_node)));
      return patchNodes((p) => p.filter((n) => !v.ids.includes(n.id)));
    },
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(nk, ctx); },
    onSettled: () => { settleNodes(); settleEdges(); },
  });

  const addEdge = useMutation<unknown, Error, CEdge, CEdge[]>({
    mutationKey: ADD_EDGE,
    onMutate: (v) => patchEdges((p) => [...p, v]),
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(ek, ctx); },
    onSettled: settleEdges,
  });

  const saveEdge = useMutation<unknown, Error, { id: string; patch: Partial<CEdge> }, CEdge[]>({
    mutationKey: SAVE_EDGE,
    onMutate: (v) => patchEdges((p) => p.map((e) => (e.id === v.id ? { ...e, ...v.patch } : e))),
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(ek, ctx); },
    onSettled: settleEdges,
  });

  const delEdge = useMutation<unknown, Error, { ids: string[] }, CEdge[]>({
    mutationKey: DEL_EDGE,
    onMutate: (v) => patchEdges((p) => p.filter((e) => !v.ids.includes(e.id))),
    onError: (_e, _v, ctx) => { if (ctx) queryClient.setQueryData(ek, ctx); },
    onSettled: settleEdges,
  });

  return {
    addNode, saveNode, delNode, addEdge, saveEdge, delEdge,
    newBoard: useMutation<unknown, Error, { id: string; name: string; color: string }>({ mutationKey: NEW_BOARD, onSettled: settleBoards }),
    saveBoard: useMutation<unknown, Error, { id: string; patch: Partial<Board> }>({ mutationKey: SAVE_BOARD, onSettled: settleBoards }),
    delBoard: useMutation<unknown, Error, { id: string }>({ mutationKey: DEL_BOARD, onSettled: settleBoards }),
    deleteSelection(nodeIds: string[], edgeIds: string[]) {
      if (edgeIds.length) delEdge.mutate({ ids: edgeIds });
      if (nodeIds.length) delNode.mutate({ ids: nodeIds });
      const n = nodeIds.length + edgeIds.length;
      if (n) toast(`Deleted ${n} item${n === 1 ? '' : 's'}`);
    },
  };
}

/* --------------------------------------------------------------- geometry */

/** Where an edge leaves a card, in world coordinates. */
export function anchor(n: CNode, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: n.x + n.w / 2, y: n.y };
    case 'bottom': return { x: n.x + n.w / 2, y: n.y + n.h };
    case 'left': return { x: n.x, y: n.y + n.h / 2 };
    case 'right': return { x: n.x + n.w, y: n.y + n.h / 2 };
  }
}

const OUT: Record<Side, [number, number]> = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

/**
 * A cubic bezier whose control points push straight out of each side, which is
 * what makes Obsidian's edges leave a card perpendicular instead of cutting
 * diagonally across it. Control distance grows with the gap, capped so long
 * edges do not balloon.
 */
export function edgePath(a: { x: number; y: number }, aSide: Side, b: { x: number; y: number }, bSide: Side): string {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const pull = Math.min(Math.max(dist * 0.4, 30), 180);
  const [ax, ay] = OUT[aSide];
  const [bx, by] = OUT[bSide];
  return `M ${a.x} ${a.y} C ${a.x + ax * pull} ${a.y + ay * pull}, ${b.x + bx * pull} ${b.y + by * pull}, ${b.x} ${b.y}`;
}

/** Pick the pair of sides that gives the shortest, least-crossing connection. */
export function bestSides(a: CNode, b: CNode): [Side, Side] {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Bounding box of every node, for zoom-to-fit. */
export function bounds(nodes: CNode[]) {
  if (!nodes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
