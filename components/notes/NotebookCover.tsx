'use client';

/**
 * Generative cover art for notebooks, canvases and the shelf hero.
 *
 * The art is derived from a hash of the notebook's id, so the same notebook
 * wears the same cover in every session, and the notebook's own colour stays
 * visible as the base tint — recolouring a notebook visibly changes its cover.
 * Everything is CSS gradients plus one shared noise tile: no network, no image
 * payloads, offline-safe in the Capacitor APK, correct in both themes because
 * every layer mixes against var(--card).
 *
 * `coverArt()` returns the background string alone (for the shelf hero band);
 * `NotebookCover` wraps it as an element that fills its parent.
 */

import { PAL } from '@/lib/pal';

const HUES = [
  PAL.coral, PAL.indigo, PAL.cyan, PAL.mint, PAL.violet,
  PAL.amber, PAL.pink, PAL.sky, PAL.lime,
];

/** One grain tile, shared by every cover. fractalNoise at high frequency. */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E")`;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A layered CSS background: three pastel blobs drifting over the notebook's
 * colour tint, a sheen across the top, and grain on top of everything.
 */
export function coverArt(seed: string, color?: string): string {
  const h = hash(seed || 'notebook');
  const hueA = HUES[h % HUES.length];
  const hueB = HUES[(h >>> 3) % HUES.length];
  const hueC = HUES[(h >>> 6) % HUES.length];
  // Blob anchors drift with the hash so covers do not all lean the same way.
  const ax = 8 + (h % 44);
  const ay = 4 + ((h >>> 5) % 36);
  const bx = 52 + ((h >>> 9) % 40);
  const by = 8 + ((h >>> 12) % 42);
  const cx = 24 + ((h >>> 15) % 56);

  return [
    `radial-gradient(120% 95% at ${ax}% ${ay}%, color-mix(in srgb, ${hueA} 52%, transparent) 0%, transparent 56%)`,
    `radial-gradient(110% 85% at ${bx}% ${by}%, color-mix(in srgb, ${hueB} 46%, transparent) 0%, transparent 54%)`,
    `radial-gradient(150% 130% at ${cx}% 118%, color-mix(in srgb, ${hueC} 58%, transparent) 0%, transparent 62%)`,
    `linear-gradient(150deg, rgba(255,255,255,.12) 0%, transparent 42%)`,
    color
      ? `color-mix(in srgb, ${color} 26%, var(--card))`
      : 'var(--card2)',
  ].join(', ');
}

export function NotebookCover({
  seed, color, className, style,
}: {
  seed: string;
  /** The notebook's colour — the base tint of its cover. */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div aria-hidden className={className} style={{
      position: 'absolute', inset: 0, background: coverArt(seed, color), overflow: 'hidden', ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0, backgroundImage: GRAIN, opacity: .07, mixBlendMode: 'overlay',
      }} />
    </div>
  );
}
