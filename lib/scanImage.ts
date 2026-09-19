/**
 * What the scanner does to a photo of a page, the way a document scanner does:
 * straighten the page from its four corners, then clean it up. Pure functions
 * over pixel arrays, so they can be checked without a browser.
 *
 *   warpQuad    the page between four corners, stretched flat into a rectangle
 *   magicColour the paper made white and the shadows lifted, ink kept in colour
 *   blackWhite  ink black, everything else white, which is what reads best
 */

export type Pt = { x: number; y: number };
export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

/**
 * The 3×3 projective map taking `from[i]` to `to[i]` for four point pairs, as
 * the eight unknowns of the matrix with the last entry fixed at 1.
 */
export function homography(from: Pt[], to: Pt[]): number[] {
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8×9 augmented matrix.
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Those corners do not make a page.');
    for (let c = col; c < 9; c++) a[col][c] /= p;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (f) for (let c = col; c < 9; c++) a[r][c] -= f * a[col][c];
    }
  }
  return [...a.map((row) => row[8]), 1];
}

export function project(h: number[], p: Pt): Pt {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

/** The size the flattened page should be: its edges' own lengths, averaged across opposite sides. */
export function pageSize(quad: Pt[], max = 2200): { width: number; height: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let width = (d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2;
  let height = (d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2;
  const scale = Math.min(1, max / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale)); height = Math.max(1, Math.round(height * scale));
  return { width, height };
}

/**
 * The page between four corners (top left, top right, bottom right, bottom
 * left) laid flat. Each output pixel is traced back into the photo and read
 * from the four pixels around where it lands.
 */
export function warpQuad(src: Pixels, quad: Pt[], width: number, height: number): Pixels {
  const back = homography([{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }], quad);
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width, sh = src.height, s = src.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = back[6] * (x + 0.5) + back[7] * (y + 0.5) + back[8];
      const fx = Math.min(sw - 1.001, Math.max(0, (back[0] * (x + 0.5) + back[1] * (y + 0.5) + back[2]) / w - 0.5));
      const fy = Math.min(sh - 1.001, Math.max(0, (back[3] * (x + 0.5) + back[4] * (y + 0.5) + back[5]) / w - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * tx;
        const bottom = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * tx;
        out[o + c] = top + (bottom - top) * ty;
      }
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}

/** Sums over every rectangle in O(1): an integral image of one channel, one wider and taller than the picture. */
function integral(img: Pixels, pick: (i: number) => number): Float64Array {
  const { width: w, height: h } = img;
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += pick((y * w + x) * 4);
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1] + row;
    }
  }
  return sum;
}
function boxMean(sum: Float64Array, w: number, h: number, x: number, y: number, r: number) {
  const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
  const W = w + 1;
  return (sum[y1 * W + x1] - sum[y0 * W + x1] - sum[y1 * W + x0] + sum[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
}
const grey = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Each pixel against the brightness of the paper around it. A pixel clearly
 * darker than its neighbourhood is ink; the rest is paper. A shadow across the
 * page darkens the neighbourhood with it, so it does not turn into ink.
 */
export function blackWhite(img: Pixels, strength = 0.14): Pixels {
  const { width: w, height: h, data } = img;
  const sum = integral(img, (i) => grey(data, i));
  const r = Math.max(8, Math.round(Math.min(w, h) / 24));
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = grey(data, i) < boxMean(sum, w, h, x, y, r) * (1 - strength) ? 0 : 255;
      out[i] = out[i + 1] = out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * The paper made white, the way a scanner's colour mode does it: each channel
 * divided by the lighting around it, so the light falling on the page cancels
 * out, and the ink that is left is deepened a little.
 */
export function magicColour(img: Pixels): Pixels {
  const { width: w, height: h, data } = img;
  const r = Math.max(10, Math.round(Math.min(w, h) / 16));
  const sums = [0, 1, 2].map((c) => integral(img, (i) => data[i + c]));
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const light = Math.max(1, boxMean(sums[c], w, h, x, y, r));
        const v = Math.min(1, data[i + c] / light);
        out[i + c] = Math.round(255 * Math.pow(v, 2.2));
      }
      out[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/** The photo turned a quarter to the right. */
export function rotateRight(img: Pixels): Pixels {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, o = (x * h + (h - 1 - y)) * 4;
    out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2]; out[o + 3] = data[i + 3];
  }
  return { width: h, height: w, data: out };
}
