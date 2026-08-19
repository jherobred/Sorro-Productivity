/**
 * Self-check for lib/graph.ts — the one runnable thing that fails if the graph
 * stops describing the boards. No framework: Node strips the types and runs it.
 *
 *   node lib/graph.check.ts
 */

import assert from 'node:assert/strict';
import { buildGraph, degrees, neighbours, boardNode, cardNode, noteNode, type GraphInput } from './graph.ts';

const input: GraphInput = {
  boards: [
    { id: 'b1', name: 'Thesis', color: '#7C6CFF' },
    { id: 'b2', name: 'Reading', color: '#34D9A0' },
  ],
  cards: [
    { id: 'c1', canvas_id: 'b1', kind: 'text', text: 'Chapter one\nsecond line', color: '#7C6CFF', note_id: null, ref_canvas: null },
    { id: 'c2', canvas_id: 'b1', kind: 'note', text: 'stale label', color: '#7C6CFF', note_id: 'n1', ref_canvas: null },
    { id: 'c3', canvas_id: 'b1', kind: 'canvas', text: 'stale label', color: '#7C6CFF', note_id: null, ref_canvas: 'b2' },
    { id: 'c4', canvas_id: 'b2', kind: 'group', text: 'Frame', color: '#34D9A0', note_id: null, ref_canvas: null },
  ],
  cardEdges: [{ from_node: 'c1', to_node: 'c2' }],
  notes: [
    { id: 'n1', title: 'Sources', notebook_id: 'nb1' },
    { id: 'n2', title: 'Loose note', notebook_id: 'nb1' },
  ],
  noteLinks: [{ from: 'n1', to: 'n2' }],
  notebookColor: { nb1: '#FFC24B' },
};

const ALL = { canvases: true, cards: true, notes: true, orphans: true };

/* what ends up in the picture --------------------------------------------- */
{
  const g = buildGraph(input, ALL);
  const ids = g.nodes.map((n) => n.id);
  assert.deepEqual(ids.filter((i) => i.startsWith('board:')), ['board:b1', 'board:b2']);
  assert.ok(!ids.includes(cardNode('c4')), 'a group is a frame, not a node');
  assert.equal(g.nodes.length, 2 + 3 + 2);

  const card = g.nodes.find((n) => n.id === cardNode('c1'))!;
  assert.equal(card.title, 'Chapter one', 'a card is labelled by its first line');

  const noteCard = g.nodes.find((n) => n.id === cardNode('c2'))!;
  assert.equal(noteCard.title, 'Sources', 'a note card takes the note’s title, not its stale copy');

  const canvasCard = g.nodes.find((n) => n.id === cardNode('c3'))!;
  assert.equal(canvasCard.title, 'Reading', 'a canvas card takes the board’s name');

  const note = g.nodes.find((n) => n.id === noteNode('n1'))!;
  assert.equal(note.color, '#FFC24B', 'notes take their notebook’s colour');
}

/* the wiring -------------------------------------------------------------- */
{
  const g = buildGraph(input, ALL);
  const has = (from: string, to: string, kind: string) =>
    g.edges.some((e) => e.from === from && e.to === to && e.kind === kind);

  assert.ok(has(boardNode('b1'), cardNode('c1'), 'holds'), 'a board holds its cards');
  assert.ok(has(cardNode('c2'), noteNode('n1'), 'embeds'), 'a note card joins its note');
  assert.ok(has(cardNode('c3'), boardNode('b2'), 'embeds'), 'a canvas card joins its board');
  assert.ok(has(cardNode('c1'), cardNode('c2'), 'links'), 'connections drawn on the board are links');
  assert.ok(has(noteNode('n1'), noteNode('n2'), 'links'), '[[wiki links]] are links');
  assert.ok(!g.edges.some((e) => e.from === boardNode('b2') && e.to === cardNode('c4')), 'no edge to a group');
}

/* an edge can never point at a node that is not drawn ---------------------- */
{
  const g = buildGraph(input, { canvases: false, cards: true, notes: false, orphans: true });
  const ids = new Set(g.nodes.map((n) => n.id));
  for (const e of g.edges) {
    assert.ok(ids.has(e.from) && ids.has(e.to), `dangling edge ${e.from}→${e.to}`);
  }
  assert.equal(g.edges.length, 1, 'only the card-to-card connection survives');
}

/* orphans ------------------------------------------------------------------ */
{
  const withOrphans = buildGraph(input, { ...ALL, canvases: false, cards: false });
  assert.equal(withOrphans.nodes.length, 2, 'both notes, one of them linked');

  const lonely: GraphInput = { ...input, noteLinks: [] };
  const hidden = buildGraph(lonely, { canvases: false, cards: false, notes: true, orphans: false });
  assert.equal(hidden.nodes.length, 0, 'nothing points at either note, so neither is drawn');
}

/* degrees and neighbours --------------------------------------------------- */
{
  const g = buildGraph(input, ALL);
  const d = degrees(g.edges);
  assert.equal(d.get(boardNode('b1')), 3, 'b1 holds three cards');
  assert.equal(d.get(cardNode('c4')) ?? 0, 0);

  const n = neighbours(g.edges, cardNode('c2'));
  assert.ok(n.has(cardNode('c2')), 'a node is its own neighbour, so the hover keeps it lit');
  assert.ok(n.has(boardNode('b1')) && n.has(cardNode('c1')) && n.has(noteNode('n1')));
  assert.ok(!n.has(noteNode('n2')), 'two hops away is not a neighbour');
}

console.log('graph.ts ok');
