/**
 * Self-check for lib/asciiBar.ts.
 *
 *   node lib/asciiBar.check.ts
 */

import assert from 'node:assert/strict';
import { barParts, barWidth, FULL, TRACK } from './asciiBar.ts';

/* the ends ----------------------------------------------------------------- */
{
  const empty = barParts(0, 24);
  assert.equal(empty.filled, '');
  assert.equal(empty.edge, '');
  assert.equal(empty.rest, TRACK.repeat(24));

  const full = barParts(100, 24);
  assert.equal(full.filled, FULL.repeat(24));
  assert.equal(full.edge, '', 'a full bar has no partial cell to draw');
  assert.equal(full.rest, '');
}

/* the row must never change length, or every number beside it shifts -------- */
for (const cells of [1, 3, 12, 24, 40]) {
  for (let p = 0; p <= 100; p += 0.5) {
    assert.equal(barWidth(barParts(p, cells)), cells, `width held at ${p}% over ${cells} cells`);
  }
}

/* out-of-range input is clamped, not overflowed ---------------------------- */
assert.equal(barParts(-40, 10).filled, '');
assert.equal(barParts(999, 10).filled, FULL.repeat(10));
assert.equal(barWidth(barParts(Number.NaN, 10)), 10);
assert.equal(barWidth(barParts(Number.POSITIVE_INFINITY, 10)), 10);

/* the eighth-block edge is what buys sub-cell resolution -------------------- */
{
  // Half of one cell in a 2-cell bar: one full cell, then a half block.
  const half = barParts(75, 2);
  assert.equal(half.filled, FULL);
  assert.equal(half.edge, '▌');

  // Three neighbouring percentages that whole-cell rounding would flatten into
  // the same picture have to differ here.
  const seen = new Set([26, 27, 28].map((p) => {
    const b = barParts(p, 24);
    return b.filled + b.edge;
  }));
  assert.equal(seen.size, 3, 'sub-cell steps stay distinguishable');
}

/* a degenerate width still renders something ------------------------------- */
assert.equal(barWidth(barParts(50, 0)), 1, 'zero cells is floored to one');

console.log('asciiBar.check.ts ok');
