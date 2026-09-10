'use client';

/**
 * A board's thumbnail: the cards actually on it, sketched on graph paper.
 *
 * This replaces the generative gradient cover art. A cover made of blobs told
 * you nothing about the board; a rough plan of its cards tells you which one
 * you are looking at. Layout is derived from the board id, so a board keeps
 * the same thumbnail between sessions, and the board's colour tints the cards
 * it owns. Everything is one inline SVG over a CSS grid — no ids, no network,
 * offline-safe in the APK, correct in both themes.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const W = 240;
const H = 108;

export function BoardPreview({
  seed, color, kind = 'canvas', height = 108,
}: {
  seed: string;
  /** The board's colour — tints the cards it owns. */
  color?: string;
  kind?: 'canvas' | 'graph';
  height?: number;
}) {
  const h = hash(seed || 'board');
  const tint = color || 'var(--tx3)';

  // 16px graph paper, drawn in CSS so the SVG needs no <defs> (and no ids that
  // would collide when several previews sit on the same page).
  const paper: React.CSSProperties = {
    display: 'block',
    height,
    backgroundImage:
      'linear-gradient(to right, var(--line) 1px, transparent 1px), linear-gradient(to bottom, var(--line) 1px, transparent 1px)',
    backgroundSize: '16px 16px',
  };

  if (kind === 'graph') {
    // Four nodes on a ring plus a hub, joined to the hub.
    const nodes = Array.from({ length: 4 }, (_, i) => {
      const a = ((h >>> (i * 3)) % 40) / 40 * Math.PI * 2 + i * 1.4;
      return [W / 2 + Math.cos(a) * (58 + (i % 2) * 14), H / 2 + Math.sin(a) * (28 + (i % 2) * 8)] as const;
    });
    return (
      <div aria-hidden style={paper}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
          {nodes.map(([x, y], i) => (
            <line key={`e${i}`} x1={W / 2} y1={H / 2} x2={x} y2={y} stroke="var(--line2)" strokeWidth="1.5" />
          ))}
          {nodes.map(([x, y], i) => (
            <circle key={`n${i}`} cx={x} cy={y} r={i % 2 ? 7 : 9}
              fill={i % 2 ? 'var(--card2)' : tint} fillOpacity={i % 2 ? 1 : 0.34}
              stroke={i % 2 ? 'var(--line2)' : tint} strokeWidth="1.5" />
          ))}
          <circle cx={W / 2} cy={H / 2} r="11" fill={tint} fillOpacity=".5" stroke={tint} strokeWidth="1.5" />
        </svg>
      </div>
    );
  }

  // 2–5 sticky cards, laid out on two rows without overlapping.
  const count = 2 + (h % 4);
  const cards = Array.from({ length: count }, (_, i) => {
    const perRow = Math.ceil(count / 2);
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const slot = (W - 28) / perRow;
    const w = Math.max(34, slot - 12 - ((h >>> (i * 2)) % 10));
    const hh = 24 + ((h >>> (i * 3)) % 12);
    return {
      x: 14 + col * slot + ((h >>> (i * 4)) % 6),
      y: 12 + row * 46 + ((h >>> (i * 5)) % 8),
      w, h: hh,
      own: (h >>> i) % 3 === 0,
    };
  });

  return (
    <div aria-hidden style={paper}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: '100%' }}>
        {cards.map((c, i) => (
          <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h}
            fill={c.own ? tint : 'var(--card2)'} fillOpacity={c.own ? 0.34 : 1}
            stroke={c.own ? tint : 'var(--line2)'} strokeOpacity={c.own ? 0.85 : 1} strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}
