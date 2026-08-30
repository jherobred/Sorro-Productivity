/**
 * Self-check for edgeBetween in lib/canvas.ts — which two graph dots may be
 * joined, and what row that join writes.
 *
 *   node lib/graphEdge.check.ts
 */

import assert from 'node:assert/strict';
import { edgeBetween } from './graph.ts';

const ID = () => 'fixed-id';

/* two cards on the board is the only pairing that makes a row ------------- */
{
  const e = edgeBetween('card:aaa', 'card:bbb', 'board-1', '#8B7CFF', ID);
  assert.ok(e, 'two cards join');
  assert.equal(e.from_node, 'aaa', 'the namespace prefix comes off');
  assert.equal(e.to_node, 'bbb');
  assert.equal(e.canvas_id, 'board-1', 'the edge belongs to the board, not the cards');
  assert.equal(e.color, '#8B7CFF');
  assert.equal(e.label, '');
}

/* everything else on the graph is drawn, not owned ------------------------ */
for (const [a, b, why] of [
  ['note:aaa', 'card:bbb', 'a note is a row in another table'],
  ['card:aaa', 'note:bbb', 'and in either position'],
  ['canvas:aaa', 'card:bbb', 'a board hub is not a card'],
  ['card:aaa', 'canvas:bbb', 'and in either position'],
  ['note:aaa', 'note:bbb', 'two notes link through their text, not here'],
] as const) {
  assert.equal(edgeBetween(a, b, 'board-1', '#fff', ID), null, why);
}

/* a dot joined to itself ------------------------------------------------- */
assert.equal(edgeBetween('card:aaa', 'card:aaa', 'board-1', '#fff', ID), null, 'no self-edge');

/* missing ends ----------------------------------------------------------- */
assert.equal(edgeBetween('', 'card:bbb', 'board-1', '#fff', ID), null);
assert.equal(edgeBetween('card:aaa', '', 'board-1', '#fff', ID), null);

/* a card id that itself contains the prefix string ----------------------- */
{
  const e = edgeBetween('card:card:x', 'card:bbb', 'board-1', '#fff', ID);
  assert.ok(e);
  assert.equal(e.from_node, 'card:x', 'only the leading namespace is stripped');
}

console.log('graphEdge.check.ts ok');
