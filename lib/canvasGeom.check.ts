/**
 * Self-check for lib/canvasGeom.ts — the arithmetic behind dragging a card's
 * edges and drawing the lines between cards.
 *
 *   node lib/canvasGeom.check.ts
 */

import assert from 'node:assert/strict';
import { anchor, bestSides, bounds, edgePath, resized, MIN_W, MIN_H, type Handle } from './canvasGeom.ts';

const box = { x: 100, y: 100, w: 200, h: 100 };

/* anchors ------------------------------------------------------------------ */
assert.deepEqual(anchor(box, 'top'), { x: 200, y: 100 });
assert.deepEqual(anchor(box, 'bottom'), { x: 200, y: 200 });
assert.deepEqual(anchor(box, 'left'), { x: 100, y: 150 });
assert.deepEqual(anchor(box, 'right'), { x: 300, y: 150 });

/* which sides face each other ---------------------------------------------- */
assert.deepEqual(bestSides(box, { ...box, x: 600 }), ['right', 'left']);
assert.deepEqual(bestSides(box, { ...box, x: -400 }), ['left', 'right']);
assert.deepEqual(bestSides(box, { ...box, y: 600 }), ['bottom', 'top']);
assert.deepEqual(bestSides(box, { ...box, y: -400 }), ['top', 'bottom']);

/* the curve leaves each card perpendicular ---------------------------------- */
{
  const d = edgePath({ x: 0, y: 0 }, 'right', { x: 200, y: 0 }, 'left');
  assert.ok(d.startsWith('M 0 0 C '), 'a cubic from the first anchor');
  const [, c1x, c1y] = d.match(/C ([-\d.]+) ([-\d.]+),/)!.map(Number);
  assert.ok(c1x > 0, 'the first control point pushes out to the right');
  assert.equal(c1y, 0, 'and not up or down');
}

/* bounds -------------------------------------------------------------------- */
assert.equal(bounds([]), null);
assert.deepEqual(bounds([box, { x: 400, y: 50, w: 100, h: 100 }]),
  { x0: 100, y0: 50, x1: 500, y1: 200, w: 400, h: 150 });

/* resizing ------------------------------------------------------------------ */
{
  const g = { handle: 'se' as Handle, ...box };

  const bigger = resized(g, 60, 40);
  assert.deepEqual(bigger, { x: 100, y: 100, w: 260, h: 140 }, 'south-east grows width and height');

  const east = resized({ ...g, handle: 'e' }, 60, 999);
  assert.equal(east.h, 100, 'an east handle never touches the height');
  assert.equal(east.w, 260);

  const north = resized({ ...g, handle: 'n' }, 999, -50);
  assert.deepEqual(north, { x: 100, y: 50, w: 200, h: 150 }, 'north moves the top edge, the bottom stays');
  assert.equal(north.y + north.h, box.y + box.h, 'the far edge is exactly where it was');

  const west = resized({ ...g, handle: 'w' }, -70, 0);
  assert.equal(west.x + west.w, box.x + box.w, 'so is the right edge when dragging west');
  assert.equal(west.w, 270);

  const nw = resized({ ...g, handle: 'nw' }, -50, -50);
  assert.deepEqual(nw, { x: 50, y: 50, w: 250, h: 150 });
}

/* a card cannot be turned inside out ---------------------------------------- */
{
  const g = { handle: 'w' as Handle, ...box };
  const past = resized(g, 5000, 0);
  assert.equal(past.w, MIN_W, 'dragging the west edge past the east one stops at the minimum');
  assert.equal(past.x, box.x + box.w - MIN_W);
  assert.ok(past.w > 0 && past.x + past.w === box.x + box.w);

  const up = resized({ handle: 'n', ...box }, 0, 5000);
  assert.equal(up.h, MIN_H);
  assert.equal(up.y + up.h, box.y + box.h);

  const tiny = resized({ handle: 'se', ...box }, -5000, -5000);
  assert.equal(tiny.w, MIN_W);
  assert.equal(tiny.h, MIN_H);
  assert.equal(tiny.x, box.x, 'and the corner you are not holding has not moved');
}

/* snapping ------------------------------------------------------------------ */
{
  const g = { handle: 'se' as Handle, ...box };
  assert.equal(resized(g, 13, 0).w, 210, 'snapped to the ten-pixel grid');
  assert.equal(resized(g, 13, 0, false).w, 213, 'alt held: exactly where the pointer is');
}

console.log('canvasGeom.ts ok');
