'use client';

import { uploadTo } from '@/lib/uploads';

/**
 * The finished challenge, as a picture.
 *
 * A settled challenge used to be a line of text on a card nobody outside the
 * app ever saw. Drawn instead — podium, names, numbers, wordmark — it is a
 * thing worth posting, and every finish quietly advertises where it came from.
 *
 * Canvas rather than a screenshot library: it is 4:5 at 1080 wide whatever
 * phone drew it, it needs no DOM to be visible, and it is a few dozen lines
 * against a dependency.
 */

export type Standing = { label: string; score: number; color: string; place: number; you: boolean };

const W = 1080;
const H = 1350;

const round = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
};

export async function drawResult(
  title: string, subtitle: string, rows: Standing[], accent: string,
): Promise<Blob | null> {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return null;

  /* ground */
  c.fillStyle = '#0A0C13';
  c.fillRect(0, 0, W, H);
  const glow = c.createRadialGradient(W / 2, 210, 40, W / 2, 210, 780);
  glow.addColorStop(0, `${accent}44`);
  glow.addColorStop(1, '#0A0C1300');
  c.fillStyle = glow;
  c.fillRect(0, 0, W, H);

  /* the floor's lane markings, faint */
  c.strokeStyle = '#1B2032';
  c.lineWidth = 2;
  for (let y = 980; y < H; y += 46) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }

  /* title */
  c.textAlign = 'center';
  c.fillStyle = '#8F97B0';
  c.font = '600 30px ui-sans-serif, system-ui, sans-serif';
  c.fillText(subtitle.toUpperCase(), W / 2, 150);

  c.fillStyle = '#EDEFF7';
  c.font = '800 74px ui-sans-serif, system-ui, sans-serif';
  const words = title.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width > W - 160 && line) { lines.push(line); line = w; } else line = next;
  }
  lines.push(line);
  lines.slice(0, 2).forEach((l, i) => c.fillText(l, W / 2, 246 + i * 82));

  /* podium — second, first, third, the way a podium is actually arranged */
  const podium = [rows[1], rows[0], rows[2]].filter(Boolean);
  const order = [1, 0, 2];
  const heights = [280, 400, 210];
  const bw = 250;
  const gap = 26;
  const totalW = bw * 3 + gap * 2;
  const x0 = (W - totalW) / 2;
  const base = 1120;

  podium.forEach((r, slot) => {
    if (!r) return;
    const x = x0 + slot * (bw + gap);
    const h = heights[slot];
    const place = order[slot] + 1;

    /* the block */
    const g = c.createLinearGradient(x, base - h, x, base);
    g.addColorStop(0, r.color);
    g.addColorStop(1, `${r.color}22`);
    c.fillStyle = g;
    round(c, x, base - h, bw, h, 18);
    c.fill();

    /* place number, sunk into the block */
    c.fillStyle = 'rgba(10,12,19,.55)';
    c.font = '800 128px ui-sans-serif, system-ui, sans-serif';
    c.fillText(String(place), x + bw / 2, base - h + 132);

    /* disc above it */
    c.beginPath();
    c.arc(x + bw / 2, base - h - 74, 46, 0, Math.PI * 2);
    c.fillStyle = r.color;
    c.fill();
    c.fillStyle = '#0A0C13';
    c.font = '800 30px ui-sans-serif, system-ui, sans-serif';
    c.fillText(r.you ? 'YOU' : r.label.replace(/^@/, '').slice(0, 2).toUpperCase(), x + bw / 2, base - h - 63);

    /* name and score under the block */
    c.fillStyle = '#EDEFF7';
    c.font = '700 32px ui-sans-serif, system-ui, sans-serif';
    const name = r.label.length > 14 ? `${r.label.slice(0, 13)}…` : r.label;
    c.fillText(name, x + bw / 2, base + 54);
    c.fillStyle = r.color;
    c.font = '800 46px ui-sans-serif, system-ui, sans-serif';
    c.fillText(String(r.score), x + bw / 2, base + 108);
  });

  /* everyone else, one line */
  const rest = rows.slice(3);
  if (rest.length) {
    c.fillStyle = '#626A85';
    c.font = '500 26px ui-sans-serif, system-ui, sans-serif';
    c.fillText(rest.map((r) => `${r.place}. ${r.label} ${r.score}`).join('   ·   '), W / 2, base + 176);
  }

  /* wordmark */
  c.fillStyle = '#EDEFF7';
  c.font = '800 34px ui-sans-serif, system-ui, sans-serif';
  c.fillText('basedly', W / 2, H - 66);
  c.fillStyle = accent;
  round(c, W / 2 - 58, H - 48, 116, 5, 3);
  c.fill();

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png', 0.95));
}

/** Draw it, put it in the bucket, hand back the path a post can point at. */
export async function uploadResult(
  title: string, subtitle: string, rows: Standing[], accent: string,
): Promise<string | null> {
  const blob = await drawResult(title, subtitle, rows, accent);
  if (!blob) return null;
  const file = new File([blob], `${title.toLowerCase().replace(/\W+/g, '-').slice(0, 40)}.png`, { type: 'image/png' });
  return uploadTo('bd-feed', file);
}
