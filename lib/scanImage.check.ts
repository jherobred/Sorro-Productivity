import test from 'node:test';
import assert from 'node:assert/strict';
import { blackWhite, homography, magicColour, pageSize, project, rotateRight, warpQuad, type Pixels } from './scanImage.ts';

/** A test page: paper lit brighter on the left than the right, with a dark ink bar across the middle. */
function page(w = 120, h = 80): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const light = 235 - (x / w) * 110;                 // a shadow deepening to the right
    const ink = y >= 38 && y < 42 && x >= 20 && x < 100;
    const v = ink ? light * 0.25 : light;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}
const at = (img: Pixels, x: number, y: number) => img.data[(y * img.width + x) * 4];

test('four corners map exactly where they were asked to', () => {
  const from = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
  const to = [{ x: 12, y: 8 }, { x: 180, y: 20 }, { x: 170, y: 140 }, { x: 5, y: 120 }];
  const h = homography(from, to);
  from.forEach((p, i) => {
    const q = project(h, p);
    assert.ok(Math.abs(q.x - to[i].x) < 1e-6 && Math.abs(q.y - to[i].y) < 1e-6);
  });
  assert.throws(() => homography(from, [to[0], to[0], to[0], to[0]]));
});

test('a page between four corners is laid flat at its own size', () => {
  const src = page();
  // The whole photo as the page gives the photo back.
  const flat = warpQuad(src, [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 }, { x: 0, y: 80 }], 120, 80);
  assert.ok(Math.abs(at(flat, 10, 10) - at(src, 10, 10)) <= 2);
  assert.ok(Math.abs(at(flat, 60, 40) - at(src, 60, 40)) <= 2);
  // Just the ink bar's band, stretched to fill.
  const band = warpQuad(src, [{ x: 20, y: 38 }, { x: 100, y: 38 }, { x: 100, y: 42 }, { x: 20, y: 42 }], 40, 8);
  assert.ok(at(band, 20, 4) < 80);
  assert.deepEqual(pageSize([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }]), { width: 300, height: 200 });
  assert.deepEqual(pageSize([{ x: 0, y: 0 }, { x: 4400, y: 0 }, { x: 4400, y: 2200 }, { x: 0, y: 2200 }]), { width: 2200, height: 1100 });
});

test('black and white keeps the ink and loses the shadow', () => {
  const bw = blackWhite(page());
  assert.equal(at(bw, 60, 40), 0, 'ink is black');
  assert.equal(at(bw, 10, 10), 255, 'bright paper is white');
  assert.equal(at(bw, 110, 70), 255, 'shadowed paper is white too');
});

test('magic colour whitens the paper across the shadow and keeps the ink dark', () => {
  const mc = magicColour(page());
  assert.ok(at(mc, 10, 10) > 230);
  assert.ok(at(mc, 110, 70) > 230);
  assert.ok(at(mc, 60, 40) < 60);
});

test('a quarter turn swaps the sides and carries the pixels round', () => {
  const src = page(4, 2);
  src.data[0] = 7;                                       // top left, red channel
  const r = rotateRight(src);
  assert.equal(r.width, 2); assert.equal(r.height, 4);
  assert.equal(r.data[(0 * r.width + 1) * 4], 7, 'top left lands top right');
});
