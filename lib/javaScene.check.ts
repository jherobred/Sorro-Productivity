/**
 * Self-check for lib/javaScene.ts — the file that decides what the visualiser
 * draws. Every assertion below is a fact the interpreter really produced at
 * that step, so a scene that starts inventing values fails here.
 *
 *   node lib/javaScene.check.ts
 */

import assert from 'node:assert/strict';
import { run, type Step } from './java.ts';
import { JAVA_TEMPLATES } from './javaTemplates.ts';
import { EMPTY_SCENE, sceneFor, type MarkerRole, type Scene } from './javaScene.ts';

/* the harness -------------------------------------------------------------- */

/** The scene for the nth step of a shipped template whose note contains `note`. */
function at(id: string, note: string, nth = 0): { scene: Scene; step: Step } {
  const t = JAVA_TEMPLATES.find((x) => x.id === id);
  assert.ok(t, `no template ${id}`);
  const r = run(t.src);
  assert.equal(r.error, null, `${id} must run clean`);
  const hits = r.trace.filter((s) => s.note.includes(note));
  const step = hits[nth];
  assert.ok(step, `${id}: no step #${nth} whose note holds ${JSON.stringify(note)}`);
  return { scene: sceneFor(step, step.frames, step.heap, r.series), step };
}

const values = (s: Scene) => s.cells.map((c) => c.value);
const marked = (s: Scene, role: MarkerRole) => s.markers.find((m) => m.role === role)?.ids ?? [];
const stat = (s: Scene, label: string) => s.stats.find((x) => x.label === label)?.value;

/* an empty run draws nothing ----------------------------------------------- */
{
  assert.deepEqual(sceneFor(null, [], [], []), EMPTY_SCENE, 'no trace, no scene');
}

/* bubble-sort: the live array, and i / j where they really are -------------- */
{
  const { scene, step } = at('bubble-sort', 'Swapped arr[', 2);
  assert.equal(step.note, 'print: "Pass 1: Swapped arr[3] (89) <-> arr[4] (63)"');
  assert.equal(scene.kind, 'array');
  assert.equal(scene.title, 'arr');
  assert.deepEqual(
    values(scene),
    ['17', '42', '5', '63', '89', '28', '71', '12', '54', '33'],
    'the array mid-sort, three swaps in — not the input and not the result'
  );
  assert.deepEqual(scene.cells.map((c) => c.index), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(marked(scene, 'cursor'), ['arr[0]'], 'i = 0');
  assert.deepEqual(marked(scene, 'compare'), ['arr[3]'], 'j = 3');
  assert.equal(stat(scene, 'len'), '10');
  assert.equal(stat(scene, 'depth'), undefined, 'main alone is not a stack worth counting');
  // step.out, so it rewinds with the scrubber. The count is taken after the
  // statement runs, so it includes the line this step prints: two header lines,
  // two earlier swaps, and this one.
  assert.equal(stat(scene, 'printed'), '5', 'five lines printed through this swap');
  assert.deepEqual(
    scene.stats.map((s) => s.label),
    ['len', 'printed'],
    'no counter the trace cannot supply'
  );
}

/* quick-sort: recursion depth is counted, and `pivot` holds a value ---------- */
{
  const { scene, step } = at('quick-sort', 'Swapped arr[', 2);
  assert.equal(step.note, 'print: "  Swapped arr[3] <-> arr[3]"');
  assert.equal(scene.kind, 'array');
  assert.deepEqual(values(scene), ['5', '34', '25', '12', '22', '11', '90', '48', '73', '64']);
  assert.deepEqual(marked(scene, 'cursor').sort(), ['arr[1]', 'arr[3]'], 'low = 1, i = 3');
  assert.deepEqual(marked(scene, 'compare').sort(), ['arr[3]', 'arr[9]'], 'j = 3, high = 9');
  assert.deepEqual(
    marked(scene, 'pivot'),
    [],
    'the local `pivot` holds 64, a value — it is not an index, so nothing is marked'
  );
  assert.equal(stat(scene, 'depth'), '4', 'main + quickSort + quickSort + partition');
}

/* binary-search: low / mid / high are three separate roles ------------------ */
{
  const { scene, step } = at('binary-search', 'Checking mid index', 2);
  assert.equal(step.note, 'print: "Checking mid index 5 (val: 48)"');
  assert.deepEqual(values(scene), ['3', '8', '14', '22', '35', '48', '59', '71', '84', '96']);
  assert.deepEqual(marked(scene, 'cursor'), ['arr[5]'], 'low = 5');
  assert.deepEqual(marked(scene, 'compare'), ['arr[6]'], 'high = 6');
  assert.deepEqual(marked(scene, 'active'), ['arr[5]'], 'mid = 5, the cell it just read as 48');
  assert.equal(scene.cells[5].value, '48', 'and that cell really does hold 48');
}

/* two-sum: the marked pair is the pair the program printed ------------------ */
{
  const { scene, step } = at('two-sum', 'Comparison #', 3);
  assert.equal(step.note, 'print: "Comparison #4: checking a[0] (55) + a[4] (92) = "');
  assert.equal(scene.title, 'a');
  assert.deepEqual(values(scene), ['55', '25', '23', '35', '92', '10', '89', '22']);
  assert.deepEqual(marked(scene, 'cursor'), ['a[0]'], 'i = 0');
  assert.deepEqual(marked(scene, 'compare'), ['a[4]'], 'j = 4');
  assert.equal(scene.cells[0].value, '55');
  assert.equal(scene.cells[4].value, '92');
}

/* binary-tree: the real BST, in the real shape ------------------------------ */
{
  const { scene } = at('binary-tree', 'Inserted Node(80)');
  assert.equal(scene.kind, 'tree');
  assert.equal(scene.title, 'root');
  assert.equal(scene.cells.length, 0, 'a tree is drawn from nodes, not cells');
  assert.deepEqual(
    scene.nodes.map((n) => n.value),
    ['50', '30', '20', '40', '70', '60', '80'],
    'preorder, left before right — the order the renderer lays children out in'
  );
  assert.deepEqual(scene.nodes.map((n) => n.depth), [0, 1, 2, 2, 1, 2, 2]);

  const byValue = new Map(scene.nodes.map((n) => [n.value, n]));
  const parentOf = (v: string) =>
    scene.nodes.find((n) => n.id === byValue.get(v)!.parent)?.value ?? null;
  assert.equal(parentOf('50'), null, '50 was inserted first, so it is the root');
  assert.equal(parentOf('30'), '50');
  assert.equal(parentOf('70'), '50');
  assert.equal(parentOf('20'), '30');
  assert.equal(parentOf('40'), '30');
  assert.equal(parentOf('60'), '70');
  assert.equal(parentOf('80'), '70');
  assert.equal(stat(scene, 'nodes'), '7');
  assert.equal(stat(scene, 'height'), '3');
}

/* binary-tree, mid-recursion: only what is still reachable ------------------ */
{
  const { scene } = at('binary-tree', 'call insert(Node(50), 70)');
  assert.deepEqual(
    scene.nodes.map((n) => n.value),
    ['50', '30'],
    '70 has not been inserted yet, so the tree is two nodes and is drawn as two'
  );
  assert.equal(stat(scene, 'height'), '2');
}

/* linked-list: the chain, and the node `curr` is standing on ---------------- */
{
  const { scene, step } = at('linked-list', 'Visiting Node', 2);
  assert.equal(step.note, 'print: "Visiting Node [30] -> Next: 40"');
  assert.equal(scene.kind, 'list');
  assert.deepEqual(values(scene), ['10', '20', '30', '40', '50'], 'in next-pointer order');
  assert.deepEqual(scene.cells.map((c) => c.index), [0, 1, 2, 3, 4]);
  assert.equal(scene.columns.length, 1);
  assert.deepEqual(scene.columns[0].cellIds, scene.cells.map((c) => c.id));

  const third = scene.cells[2].id;
  assert.deepEqual(marked(scene, 'active'), [third], 'curr points at the node holding 30');
  assert.deepEqual(marked(scene, 'cursor'), [scene.cells[0].id], 'head still points at 10');
  assert.equal(stat(scene, 'length'), '5');
}

/* matrix-terrain: a half-built grid stays half-built ------------------------ */
{
  const { scene } = at('matrix-terrain', 'Voxel [2][3]');
  assert.equal(scene.kind, 'matrix');
  assert.equal(scene.title, 'terrain');
  assert.equal(stat(scene, 'grid'), '6x6');
  assert.equal(scene.columns.length, 6, 'one column per row of the matrix');
  assert.deepEqual(scene.columns.map((c) => c.label), ['0', '1', '2', '3', '4', '5']);
  assert.equal(scene.cells.length, 36);

  const cell = (r: number, c: number) => scene.cells[r * 6 + c];
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((c) => cell(0, c).value),
    ['2', '4', '6', '4', '2', '1'],
    'row 0 as the program computed it'
  );
  assert.equal(cell(2, 2).value, '10', 'the peak at the centre');
  assert.equal(cell(2, 3).value, '8', 'the voxel just written');
  assert.equal(cell(2, 4).value, '0', 'the next one has not been written yet, and is not guessed');
  assert.deepEqual(cell(5, 5).value, '0', 'nor has the last row');
  assert.deepEqual(marked(scene, 'active'), ['terrain[2][3]'], 'r = 2, c = 3');
  assert.deepEqual(scene.cells.map((c) => c.index).slice(0, 7), [0, 1, 2, 3, 4, 5, 0]);
}

/* graph-bfs: the adjacency matrix, plus the graph it encodes ---------------- */
{
  const { scene, step } = at('graph-bfs', 'Dequeued', 1);
  assert.equal(step.note, 'print: ">> Dequeued & Visited Node: 1"');
  assert.equal(scene.kind, 'matrix', 'a square int[][] is a matrix; the graph is the reading');
  assert.equal(stat(scene, 'grid'), '6x6');
  assert.deepEqual(scene.nodes.map((n) => n.value), ['0', '1', '2', '3', '4', '5']);
  assert.ok(scene.edges.every((e) => !e.directed), 'the matrix is symmetric, so the edges are not');

  // Every drawn edge is a 1 in the matrix, and every 1 is a drawn edge.
  const drawn = new Set(scene.edges.map((e) => `${e.from}-${e.to}`));
  let ones = 0;
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      const one = scene.cells[i * 6 + j].value === '1';
      if (one) ones++;
      assert.equal(drawn.has(`n${i}-n${j}`), one, `edge ${i}-${j} must match adj[${i}][${j}]`);
    }
  }
  assert.equal(scene.edges.length, ones);
  assert.equal(ones, 8, 'the eight links the template really declares');
}

/* tower-of-hanoi: the program never builds pegs, so no pegs are drawn ------- */
{
  const { scene, step } = at('tower-of-hanoi', 'Move Disk 1 from Peg C', 0);
  assert.equal(step.note, 'print: "Move Disk 1 from Peg C -> Peg B"');
  assert.equal(scene.kind, 'frames', 'nothing in the trace holds a disk, so the stack is the scene');
  assert.equal(scene.nodes.length, 0);
  assert.equal(stat(scene, 'depth'), '4', 'main plus three live solve() calls');
  assert.deepEqual(scene.columns.map((c) => c.label), ['main', 'solve', 'solve', 'solve']);
  assert.deepEqual(
    scene.columns[3].cellIds.map((id) => scene.cells.find((c) => c.id === id)!.value),
    ['n = 1', 'fromPeg = C', 'toPeg = B', 'auxPeg = A'],
    'the innermost frame, argument for argument'
  );
  assert.ok(
    scene.cells.some((c) => c.value === 'n = 3'),
    'and the outer call it came from is still on the stack'
  );
  assert.deepEqual(scene.markers, [], 'no local here indexes anything drawn');
}

/* stack-queue: four strings, because that is all the program makes ---------- */
{
  const { scene } = at('stack-queue', 'Pushing elements');
  assert.equal(scene.kind, 'array');
  assert.equal(scene.title, 'elements');
  assert.deepEqual(values(scene), ['A', 'B', 'C', 'D']);
  assert.equal(scene.subtitle, 'String[] · 4 values');
}

/* fibonacci-memo: a table that is genuinely still mostly empty -------------- */
{
  const { scene, step } = at('fibonacci-memo', 'Stored into Memo Table: fib(4)');
  assert.equal(step.note, 'print: "Stored into Memo Table: fib(4) = 3"');
  assert.equal(scene.title, 'memo');
  assert.deepEqual(
    values(scene),
    ['-1', '-1', '1', '2', '3', '-1', '-1', '-1', '-1', '-1', '-1', '-1', '-1'],
    'only fib(2..4) have been stored; the rest are the -1 the program wrote'
  );
  assert.equal(stat(scene, 'depth'), '10', 'nine nested fib() calls under main');
  assert.deepEqual(scene.markers, [], '`n` is a term number, not an index, so it marks nothing');
}

/* -------------------------------------------------------------------------- */
/* shapes no shipped template produces, checked on programs that do           */
/* -------------------------------------------------------------------------- */

const source = (body: string) => `class Main { public static void main(String[] args) { ${body} } }`;

function sceneOf(src: string, note: string): Scene {
  const r = run(src);
  assert.equal(r.error, null, r.error?.message);
  const step = r.trace.find((s) => s.note.includes(note));
  assert.ok(step, `no step whose note holds ${JSON.stringify(note)}`);
  return sceneFor(step, step.frames, step.heap, r.series);
}

/* three same-typed arrays are pegs ----------------------------------------- */
{
  const scene = sceneOf(
    source('int[] pegA = { 3, 2, 1 }; int[] pegB = new int[3]; int[] pegC = new int[3]; System.out.println("go");'),
    'print:'
  );
  assert.equal(scene.kind, 'hanoi');
  assert.deepEqual(scene.columns.map((c) => c.label), ['pegA', 'pegB', 'pegC']);
  assert.deepEqual(scene.columns[0].cellIds, ['pegA[0]', 'pegA[1]', 'pegA[2]']);
  assert.deepEqual(values(scene), ['3', '2', '1', '0', '0', '0', '0', '0', '0']);
  assert.equal(stat(scene, 'slots'), '9', 'nine array slots, which is what was counted');
}

/* two arrays are not pegs -------------------------------------------------- */
{
  const scene = sceneOf(source('int[] a = { 1, 2 }; int[] b = { 3 }; System.out.println("go");'), 'print:');
  assert.equal(scene.kind, 'array', 'two arrays are just arrays');
  assert.deepEqual(values(scene), ['1', '2']);
}

/* a subtree reached under its own name is put back where it belongs -------- */
{
  const scene = sceneOf(
    `class Main {
      static class Node { int val; Node left; Node right; Node(int v) { this.val = v; } }
      public static void main(String[] args) {
        Node cur = new Node(3);
        Node root = new Node(5);
        root.left = cur;
        root.right = new Node(8);
        System.out.println("built");
      }
    }`,
    'print:'
  );
  assert.equal(scene.kind, 'tree');
  assert.equal(scene.title, 'root', 'named after the node on top, not the one listed first');
  assert.deepEqual(scene.nodes.map((n) => n.value), ['5', '3', '8']);
  assert.deepEqual(scene.nodes.map((n) => n.depth), [0, 1, 1]);
  assert.equal(scene.nodes[1].parent, scene.nodes[0].id, '3 is the left child, not a second root');
  assert.equal(scene.nodes[2].parent, scene.nodes[0].id);
  assert.deepEqual(marked(scene, 'active'), [scene.nodes[1].id], 'the local `cur` is standing on 3');
}

/* an out-of-range local marks nothing -------------------------------------- */
{
  const scene = sceneOf(source('int[] a = { 7, 8 }; int i = 5; System.out.println("go");'), 'print:');
  assert.deepEqual(values(scene), ['7', '8']);
  assert.deepEqual(scene.markers, [], 'i = 5 is not a slot of a two-element array');
}

/* a program that builds nothing falls back to its own call stack ----------- */
{
  const scene = sceneOf(source('int x = 41; int y = x + 1; System.out.println(y);'), 'print:');
  assert.equal(scene.kind, 'frames');
  assert.deepEqual(scene.columns.map((c) => c.label), ['main']);
  assert.ok(scene.cells.some((c) => c.value === 'x = 41'), 'the locals it really holds');
  assert.ok(scene.cells.some((c) => c.value === 'y = 42'));
}

console.log('javaScene.ts ok');
