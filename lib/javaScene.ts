/**
 * Scene model — the one bridge between a real Java trace step and every
 * visualiser mode.
 *
 * Rule: nothing in a Scene is invented. Every value, marker and stat is read
 * out of the `Step` the interpreter actually produced. If a fact is not
 * derivable from the trace, it is absent, and the renderer draws nothing for
 * it. No placeholder arrays, no fake move counters, no demo trees.
 *
 * Implemented in this file (see `sceneFor`), consumed by
 * `components/java/Java3DVisualizer.tsx`.
 */

import type { FrameSnap, HeapObj, Local, Step } from './java';

export type SceneKind = 'array' | 'matrix' | 'tree' | 'list' | 'graph' | 'stack' | 'hanoi' | 'frames';

/** One addressable value. `index` is its slot in its own column/row. */
export type SceneCell = { id: string; value: string; index: number; column: string };

/** A node in a tree or graph. `parent` is set for trees, absent for graphs. */
export type SceneNode = { id: string; label: string; value: string; depth: number; parent?: string };

export type SceneEdge = { from: string; to: string; label?: string; directed: boolean };

/** What the current step is doing to these ids. Drives colour and motion. */
export type MarkerRole = 'cursor' | 'compare' | 'swap' | 'pivot' | 'sorted' | 'visited' | 'active' | 'found';
export type Marker = { ids: string[]; role: MarkerRole };

/** A vertical or horizontal grouping: a Hanoi peg, a stack, a queue, a matrix row. */
export type SceneColumn = { id: string; label: string; cellIds: string[] };

/** A counter derived from the trace. Never fabricated. */
export type SceneStat = { label: string; value: string };

export type Scene = {
  kind: SceneKind;
  title: string;
  subtitle: string;
  cells: SceneCell[];
  columns: SceneColumn[];
  nodes: SceneNode[];
  edges: SceneEdge[];
  markers: Marker[];
  stats: SceneStat[];
};

export const EMPTY_SCENE: Scene = {
  kind: 'frames',
  title: '',
  subtitle: '',
  cells: [],
  columns: [],
  nodes: [],
  edges: [],
  markers: [],
  stats: [],
};

/* ====================================================== 1. shape of a heap */

/*
 * `heapOf()` in lib/java.ts has already decided what each live object *is* —
 * it writes a fixed cell shape per shape of object. These tests read that
 * encoding back. No method or variable name is consulted: a program that
 * calls its tree `t` and its method `wobble()` classifies identically.
 *
 *   int[]      → type ends `[]`,    cells are the elements
 *   int[][]    → type ends `[][]`,  text is `RxC Matrix`, cells are row-major
 *   val+left/right → cells `[val, 'L:<child>', 'R:<child>']`
 *   val+next       → cells `[val, '-> <next>']`
 */

const isMatrixObj = (h: HeapObj): boolean => !!h.cells && h.type.endsWith('[][]');

const isArrayObj = (h: HeapObj): boolean =>
  !!h.cells && h.type.endsWith('[]') && !h.type.endsWith('[][]');

const isTreeObj = (h: HeapObj): boolean =>
  !!h.cells && h.cells.length === 3 && h.cells[1].startsWith('L:') && h.cells[2].startsWith('R:');

const isListObj = (h: HeapObj): boolean =>
  !!h.cells && h.cells.length === 2 && h.cells[1].startsWith('-> ');

/** An object heap entry is `<path>#<objectId>`; an array entry is just its name. */
const pathOf = (h: HeapObj): string => {
  const i = h.name.lastIndexOf('#');
  return i < 0 ? h.name : h.name.slice(0, i);
};

const objIdOf = (h: HeapObj): string => {
  const i = h.name.lastIndexOf('#');
  return i < 0 ? h.name : h.name.slice(i + 1);
};

/** The visible name of a structure: `root.left#4` is still called `root`. */
const rootNameOf = (h: HeapObj): string => pathOf(h).split('.')[0];

const MATRIX_DIMS = /^(\d+)x(\d+) Matrix$/;

/* ========================================================== 2. the markers */

/**
 * Roles for locals that hold an index. Only names that are indices by
 * convention are listed, and a name only produces a marker when its value is
 * an integer inside the visible structure — so `n = arr.length` marks nothing.
 *
 * This is the one place a name is read, and the contract says so: "if locals
 * `i` and `j` exist and index a visible array, emit cursor/compare markers for
 * exactly those indices".
 */
const INDEX_ROLE: Record<string, MarkerRole> = {
  i: 'cursor',
  idx: 'cursor',
  index: 'cursor',
  pos: 'cursor',
  low: 'cursor',
  lo: 'cursor',
  left: 'cursor',
  start: 'cursor',
  first: 'cursor',
  head: 'cursor',
  front: 'cursor',
  j: 'compare',
  high: 'compare',
  hi: 'compare',
  right: 'compare',
  end: 'compare',
  last: 'compare',
  tail: 'compare',
  back: 'compare',
  mid: 'active',
  cur: 'active',
  curr: 'active',
  current: 'active',
  node: 'active',
  pi: 'pivot',
  pivotindex: 'pivot',
  pivotidx: 'pivot',
};

const INT_TYPES = new Set(['int', 'long', 'short', 'byte']);

/** The frame that is executing. Later scopes shadow earlier ones, as in Java. */
function liveLocals(frames: FrameSnap[]): Map<string, Local> {
  const m = new Map<string, Local>();
  for (const l of frames[frames.length - 1]?.locals ?? []) m.set(l.name, l);
  return m;
}

/** The integer a local holds, or null if it does not hold one. */
function intOf(l: Local | undefined): number | null {
  if (!l || !INT_TYPES.has(l.type)) return null;
  const v = l.value.v;
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}

/** The heap id of the object a reference local points at, or null. */
function refIdOf(l: Local): string | null {
  const v = l.value.v;
  if (typeof v !== 'object' || v === null) return null;
  const id = (v as { _id?: unknown })._id;
  return typeof id === 'number' ? String(id) : null;
}

function collect(pairs: [MarkerRole, string][]): Marker[] {
  const byRole = new Map<MarkerRole, string[]>();
  for (const [role, id] of pairs) {
    const ids = byRole.get(role);
    if (!ids) byRole.set(role, [id]);
    else if (!ids.includes(id)) ids.push(id);
  }
  return [...byRole]
    .map(([role, ids]) => ({ ids, role }))
    .sort((a, b) => a.role.localeCompare(b.role));
}

/** Locals that hold a valid index into a structure of `count` slots. */
function indexMarkers(
  locals: Map<string, Local>,
  count: number,
  idAt: (i: number) => string
): Marker[] {
  const pairs: [MarkerRole, string][] = [];
  for (const [name, l] of locals) {
    const role = INDEX_ROLE[name.toLowerCase()];
    if (!role) continue;
    const v = intOf(l);
    if (v === null || v < 0 || v >= count) continue;
    pairs.push([role, idAt(v)]);
  }
  return collect(pairs);
}

/** Locals that point straight at a drawn object. Exact — no index guessed. */
function refMarkers(locals: Map<string, Local>, sceneIds: Set<string>): Marker[] {
  const pairs: [MarkerRole, string][] = [];
  for (const [name, l] of locals) {
    const role = INDEX_ROLE[name.toLowerCase()];
    if (!role) continue;
    const id = refIdOf(l);
    if (id === null) continue;
    const sceneId = `obj:${id}`;
    if (sceneIds.has(sceneId)) pairs.push([role, sceneId]);
  }
  return collect(pairs);
}

/* ============================================================ 3. the stats */

/**
 * Facts that hold for every step. Both are counted, never estimated.
 *
 * `depth` comes from the frames. `printed` is `step.out`, the number of lines
 * the program had written by this statement — so it rewinds with the scrubber
 * rather than reporting the finished run.
 *
 * It is only emitted for a real step. The renderer synthesises a stand-in Step
 * when the call site passes none, and that stand-in carries
 * `out: series.length`, which counts printed *numbers*, not lines — zero for
 * any program that prints sentences. Showing that would be exactly the kind of
 * plausible wrong number this file exists to avoid.
 */
function commonStats(frames: FrameSnap[], step: Step | null): SceneStat[] {
  const out: SceneStat[] = [];
  if (frames.length > 1) out.push({ label: 'depth', value: String(frames.length) });
  if (step) out.push({ label: 'printed', value: String(step.out) });
  return out;
}

/* ======================================================== 4. per-kind scenes */

function arrayScene(h: HeapObj, frames: FrameSnap[], step: Step | null): Scene {
  const name = pathOf(h);
  const id = (i: number) => `${name}[${i}]`;
  const cells: SceneCell[] = (h.cells ?? []).map((value, i) => ({
    id: id(i),
    value,
    index: i,
    column: name,
  }));
  return {
    kind: 'array',
    title: name,
    subtitle: `${h.type} · ${cells.length} values`,
    cells,
    columns: [{ id: name, label: name, cellIds: cells.map((c) => c.id) }],
    nodes: [],
    edges: [],
    markers: indexMarkers(liveLocals(frames), cells.length, id),
    stats: [{ label: 'len', value: String(cells.length) }, ...commonStats(frames, step)],
  };
}

/** Three same-typed arrays side by side are pegs — the shape a Hanoi board has. */
function hanoiScene(pegs: HeapObj[], frames: FrameSnap[], step: Step | null): Scene {
  const cells: SceneCell[] = [];
  const columns: SceneColumn[] = pegs.map((h) => {
    const name = pathOf(h);
    const ids = (h.cells ?? []).map((value, i) => {
      const cell = { id: `${name}[${i}]`, value, index: i, column: name };
      cells.push(cell);
      return cell.id;
    });
    return { id: name, label: name, cellIds: ids };
  });
  return {
    kind: 'hanoi',
    title: pegs.map(pathOf).join(' / '),
    subtitle: `${pegs[0].type} · ${columns.length} pegs`,
    cells,
    columns,
    nodes: [],
    edges: [],
    markers: [],
    // Slots, not disks: an empty peg still has its array elements, and calling
    // those disks would be a count the program never made.
    stats: [{ label: 'slots', value: String(cells.length) }, ...commonStats(frames, step)],
  };
}

/**
 * A square 0/1 matrix with a zero diagonal is an adjacency matrix, so the same
 * step can also be drawn as the graph it encodes. Every edge here is a cell the
 * program really set; only the reading is structural. The scene stays `matrix`
 * — the general kind — and the graph is there for the Graph mode pill.
 */
function adjacencyGraph(cells: string[], n: number): { nodes: SceneNode[]; edges: SceneEdge[] } | null {
  if (n < 2 || cells.length !== n * n) return null;
  if (!cells.every((c) => c === '0' || c === '1')) return null;
  for (let i = 0; i < n; i++) if (cells[i * n + i] !== '0') return null;

  let symmetric = true;
  for (let i = 0; i < n && symmetric; i++) {
    for (let j = i + 1; j < n; j++) {
      if (cells[i * n + j] !== cells[j * n + i]) {
        symmetric = false;
        break;
      }
    }
  }

  const nodes: SceneNode[] = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    label: String(i),
    value: String(i),
    depth: 0,
  }));
  const edges: SceneEdge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = symmetric ? i + 1 : 0; j < n; j++) {
      if (i !== j && cells[i * n + j] === '1') {
        edges.push({ from: `n${i}`, to: `n${j}`, directed: !symmetric });
      }
    }
  }
  return { nodes, edges };
}

/** Row/column pairs that are indices by convention, in preference order. */
const GRID_PAIRS: [string, string][] = [
  ['r', 'c'],
  ['row', 'col'],
  ['i', 'j'],
];

function matrixScene(h: HeapObj, frames: FrameSnap[], step: Step | null): Scene {
  const name = pathOf(h);
  const flat = h.cells ?? [];
  const dims = MATRIX_DIMS.exec(h.text);
  const cols = dims ? Number(dims[2]) : 0;
  // Without a column count the grid cannot be laid out, and guessing one would
  // put real values in wrong places — so it is drawn as the flat row it is.
  if (!cols) return arrayScene(h, frames, step);
  const rows = Math.ceil(flat.length / cols);

  const cells: SceneCell[] = [];
  const columns: SceneColumn[] = [];
  for (let r = 0; r < rows; r++) {
    const ids: string[] = [];
    for (let c = 0; c < cols; c++) {
      const at = r * cols + c;
      if (at >= flat.length) break;
      const cell = { id: `${name}[${r}][${c}]`, value: flat[at], index: c, column: `${name}[${r}]` };
      cells.push(cell);
      ids.push(cell.id);
    }
    columns.push({ id: `${name}[${r}]`, label: String(r), cellIds: ids });
  }

  const locals = liveLocals(frames);
  const markers: Marker[] = [];
  for (const [rn, cn] of GRID_PAIRS) {
    const r = intOf(locals.get(rn));
    const c = intOf(locals.get(cn));
    if (r === null || c === null || r < 0 || r >= rows || c < 0 || c >= cols) continue;
    markers.push({ ids: [`${name}[${r}][${c}]`], role: 'active' });
    break;
  }

  const graph = rows === cols ? adjacencyGraph(flat, rows) : null;

  return {
    kind: 'matrix',
    title: name,
    subtitle: `${h.type} · ${rows}x${cols}`,
    cells,
    columns,
    nodes: graph?.nodes ?? [],
    edges: graph?.edges ?? [],
    markers,
    stats: [{ label: 'grid', value: `${rows}x${cols}` }, ...commonStats(frames, step)],
  };
}

/** A chain of `val + next` objects, in the order the heap walked them. */
function listScene(objs: HeapObj[], frames: FrameSnap[], step: Step | null): Scene {
  const column = rootNameOf(objs[0]);
  const cells: SceneCell[] = objs.map((h, i) => ({
    id: `obj:${objIdOf(h)}`,
    value: h.cells![0],
    index: i,
    column,
  }));
  return {
    kind: 'list',
    title: column,
    subtitle: `${objs[0].type} · ${cells.length} nodes`,
    cells,
    columns: [{ id: column, label: column, cellIds: cells.map((c) => c.id) }],
    nodes: [],
    edges: [],
    markers: refMarkers(liveLocals(frames), new Set(cells.map((c) => c.id))),
    stats: [{ label: 'length', value: String(cells.length) }, ...commonStats(frames, step)],
  };
}

type TreeNode = {
  id: string;
  path: string;
  val: string;
  l: string;
  r: string;
  kids: (TreeNode | null)[];
  attached: boolean;
};

/**
 * Rebuild the tree from the heap.
 *
 * The heap names each node by the path it was reached along (`root`,
 * `root.left`, `root.left.right`), which is the whole structure — except that
 * a node already recorded under a recursive frame's own name is not recorded
 * twice, so a subtree can arrive detached. Those are re-attached through the
 * `L:`/`R:` child values the parent records, and only when exactly one parent
 * can claim them. An ambiguous one stays a separate root: two small trees is a
 * truthful picture, a wrongly joined one is not.
 */
function linkTree(objs: HeapObj[]): TreeNode[] {
  const nodes: TreeNode[] = objs.map((h) => ({
    id: objIdOf(h),
    path: pathOf(h),
    val: h.cells![0],
    l: h.cells![1].slice(2),
    r: h.cells![2].slice(2),
    kids: [null, null],
    attached: false,
  }));

  const byPath = new Map<string, TreeNode>();
  for (const n of nodes) if (!byPath.has(n.path)) byPath.set(n.path, n);

  for (const n of nodes) {
    const dot = n.path.lastIndexOf('.');
    if (dot < 0) continue;
    const seg = n.path.slice(dot + 1);
    if (seg !== 'left' && seg !== 'right') continue;
    const parent = byPath.get(n.path.slice(0, dot));
    const slot = seg === 'left' ? 0 : 1;
    if (!parent || parent === n || parent.kids[slot]) continue;
    parent.kids[slot] = n;
    n.attached = true;
  }

  const holds = (top: TreeNode, target: TreeNode): boolean => {
    if (top === target) return true;
    for (const k of top.kids) if (k && holds(k, target)) return true;
    return false;
  };

  for (const n of nodes) {
    if (n.attached) continue;
    const claims: [TreeNode, number][] = [];
    for (const p of nodes) {
      if (p === n) continue;
      if (!p.kids[0] && p.l === n.val) claims.push([p, 0]);
      if (!p.kids[1] && p.r === n.val) claims.push([p, 1]);
    }
    if (claims.length !== 1) continue;
    const [parent, slot] = claims[0];
    if (holds(n, parent)) continue;
    parent.kids[slot] = n;
    n.attached = true;
  }

  return nodes;
}

function treeScene(objs: HeapObj[], frames: FrameSnap[], step: Step | null): Scene {
  const linked = linkTree(objs);
  const out: SceneNode[] = [];
  const seen = new Set<string>();

  // Preorder, left before right: `nodeSlots()` in the renderer lays children out
  // in the order it meets them, so this order is what puts left on the left.
  const walk = (n: TreeNode, depth: number, parent?: string) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    const id = `obj:${n.id}`;
    out.push(parent ? { id, label: n.val, value: n.val, depth, parent } : { id, label: n.val, value: n.val, depth });
    for (const k of n.kids) if (k) walk(k, depth + 1, id);
  };
  for (const n of linked) if (!n.attached) walk(n, 0);
  for (const n of linked) walk(n, 0);

  // Named after whichever object ended up on top, not whichever the heap
  // happened to list first: a subtree can be recorded before its own root.
  const top = objs.find((h) => out.length > 0 && objIdOf(h) === out[0].id.slice(4)) ?? objs[0];

  const height = out.reduce((h, n) => Math.max(h, n.depth + 1), 0);
  return {
    kind: 'tree',
    title: rootNameOf(top),
    subtitle: `${objs[0].type} · ${out.length} nodes`,
    cells: [],
    columns: [],
    nodes: out,
    edges: [],
    markers: refMarkers(liveLocals(frames), new Set(out.map((n) => n.id))),
    stats: [
      { label: 'nodes', value: String(out.length) },
      { label: 'height', value: String(height) },
      ...commonStats(frames, step),
    ],
  };
}

/**
 * The honest default: no structure was recognised, so the call stack itself is
 * the picture — one column per frame, one tile per local it really holds.
 */
function framesScene(frames: FrameSnap[], step: Step | null): Scene {
  // The innermost frames are the live ones; a deep recursion cannot fit on the
  // stage, so the outer ones are left off rather than squeezed into nothing.
  const shown = frames.slice(-6);
  const cells: SceneCell[] = [];
  const columns: SceneColumn[] = shown.map((f, fi) => {
    const cut = f.sig.indexOf('(');
    const label = cut < 0 ? f.sig : f.sig.slice(0, cut);
    const ids = f.locals.map((l, li) => {
      const cell = {
        id: `f${fi}:${li}:${l.name}`,
        value: `${l.name} = ${l.text}`,
        index: li,
        column: `f${fi}`,
      };
      cells.push(cell);
      return cell.id;
    });
    return { id: `f${fi}`, label, cellIds: ids };
  });

  const innermost = frames[frames.length - 1];
  const cut = innermost ? innermost.sig.indexOf('(') : -1;
  return {
    kind: 'frames',
    title: innermost ? (cut < 0 ? innermost.sig : innermost.sig.slice(0, cut)) : '',
    subtitle: frames.length ? `call stack · ${frames.length} frames` : '',
    cells,
    columns,
    nodes: [],
    edges: [],
    markers: [],
    stats: commonStats(frames, step),
  };
}

/* ============================================================== 5. sceneFor */

/**
 * Derive the scene for one trace step.
 *
 * @param step  the trace step being displayed, or null for the final state
 * @param frames call stack at that step
 * @param heap  heap objects at that step
 * @param series values printed so far
 */
export function sceneFor(
  step: Step | null,
  frames: FrameSnap[],
  heap: HeapObj[],
  series: number[],
): Scene {
  // `series` holds the numbers a program printed, which is the Output panel's
  // data, not the memory the visualiser draws. Reading it here would be
  // inventing a structure the step does not have.
  void series;

  // `step` is used only for its output count (see `commonStats`). The line and
  // the note are already rendered elsewhere, and every structural value below
  // is read out of the frames and the heap, never out of the step.

  if (!frames.length && !heap.length) return EMPTY_SCENE;

  // Richest structure first: a program that built a tree is showing a tree,
  // even while an input array is still in scope. Ambiguity falls to the more
  // general kind, which is why a matrix outranks the arrays beside it.
  const trees = heap.filter(isTreeObj);
  if (trees.length) return treeScene(trees, frames, step);

  const lists = heap.filter(isListObj);
  if (lists.length) return listScene(lists, frames, step);

  // An array with no elements draws as nothing, so it cannot be the structure
  // the step is about — and an empty one is always in scope, because `main`
  // holds `String[] args`. Skipping it lets the real structure below it win.
  const filled = (h: HeapObj) => (h.cells?.length ?? 0) > 0;
  const matrices = heap.filter((h) => isMatrixObj(h) && filled(h));
  const arrays = heap.filter((h) => isArrayObj(h) && !isMatrixObj(h) && filled(h));

  if (!matrices.length && arrays.length === 3) {
    const [a, b, c] = arrays;
    if (a.type === b.type && b.type === c.type) return hanoiScene(arrays, frames, step);
  }

  if (matrices.length) return matrixScene(matrices[0], frames, step);
  if (arrays.length) return arrayScene(arrays[0], frames, step);

  return framesScene(frames, step);
}
