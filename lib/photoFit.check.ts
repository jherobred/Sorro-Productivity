/**
 * Self-check for lib/photoFit.ts.
 *
 *   node lib/photoFit.check.ts
 *
 * The assertion worth reading is the direction of the drag. Inverting it is
 * the one mistake here you cannot see in a screenshot — the picture simply
 * moves the wrong way under your finger, and it looks like a broken control
 * rather than a wrong sign.
 */

import assert from 'node:assert/strict';
import { CENTRED, clamp, toFit, pan, setZoom, isCentred, MIN_ZOOM, MAX_ZOOM } from './photoFit.ts';

/* reading a stored value ---------------------------------------------------- */
assert.deepEqual(toFit(undefined), CENTRED, 'a profile that has never been framed is centred');
assert.deepEqual(toFit(null), CENTRED);
assert.deepEqual(toFit({}), CENTRED, 'the column defaults to {} and that has to work');
assert.deepEqual(toFit({ x: 20, y: 80, zoom: 2 }), { x: 20, y: 80, zoom: 2 });
assert.deepEqual(toFit({ x: 30 }), { x: 30, y: 50, zoom: 1 }, 'a partial row keeps its one real value');

// Junk must still render a picture, never throw and never blank the avatar.
assert.deepEqual(toFit({ x: -40, y: 900, zoom: 99 }), { x: 0, y: 100, zoom: MAX_ZOOM }, 'out of range is pulled back in');
assert.deepEqual(toFit({ x: 'left', y: null, zoom: NaN }), CENTRED, 'wrong types fall back rather than break');
// Infinity is not a number somebody meant, so it falls back to the default
// rather than clamping to max — a picture at 4× is a decision, not a repair.
assert.deepEqual(toFit({ zoom: Infinity }), CENTRED);
assert.deepEqual(toFit('not an object at all'), CENTRED);

/* clamping ------------------------------------------------------------------ */
assert.equal(clamp(5, 0, 100), 5);
assert.equal(clamp(-5, 0, 100), 0);
assert.equal(clamp(105, 0, 100), 100);

/* dragging ------------------------------------------------------------------ */
{
  // Drag right by a tenth of the frame at 1×: the picture follows the finger,
  // so the position percentage goes DOWN by ten.
  const f = pan(CENTRED, 40, 0, 400, 400);
  assert.equal(f.x, 40, 'dragging right moves the picture right');
  assert.equal(f.y, 50, 'a horizontal drag leaves the vertical alone');
}
{
  const f = pan(CENTRED, 0, 40, 400, 400);
  assert.equal(f.y, 40, 'dragging down moves the picture down');
}
{
  // The same gesture at 4× moves a quarter as far. This is what makes the
  // last few pixels of framing reachable on a phone.
  const one = pan(CENTRED, 40, 0, 400, 400);
  const four = pan({ ...CENTRED, zoom: 4 }, 40, 0, 400, 400);
  assert.equal(50 - four.x, (50 - one.x) / 4, 'zoomed in, the same drag is finer');
}
{
  // A hard fling cannot push the subject off the edge and strand it there.
  const f = pan(CENTRED, 100_000, -100_000, 400, 400);
  assert.deepEqual({ x: f.x, y: f.y }, { x: 0, y: 100 }, 'a fling stops at the edge');
  assert.ok(pan(f, -100_000, 100_000, 400, 400).x === 100, 'and it can always come back');
}
{
  // A frame that has not been measured yet must not divide by zero.
  const f = pan(CENTRED, 10, 10, 0, 0);
  assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), 'an unmeasured frame stays a number');
}
assert.equal(pan(CENTRED, 0, 0, 400, 400).zoom, 1, 'panning never changes the zoom');

/* zooming ------------------------------------------------------------------- */
assert.equal(setZoom(CENTRED, 2.5).zoom, 2.5);
assert.equal(setZoom(CENTRED, 0.2).zoom, MIN_ZOOM, 'you cannot zoom out past the frame');
assert.equal(setZoom(CENTRED, 40).zoom, MAX_ZOOM);
{
  const moved = pan(CENTRED, 40, 40, 400, 400);
  assert.deepEqual(
    { x: setZoom(moved, 3).x, y: setZoom(moved, 3).y },
    { x: moved.x, y: moved.y },
    'zooming keeps where you framed it',
  );
}

/* the shortcut -------------------------------------------------------------- */
assert.ok(isCentred(CENTRED));
assert.ok(!isCentred(pan(CENTRED, 1, 0, 400, 400)));
assert.ok(!isCentred(setZoom(CENTRED, 1.5)));

console.log('photoFit: ok');
