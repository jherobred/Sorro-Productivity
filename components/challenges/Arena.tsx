'use client';

import { usePrefs } from '@/lib/prefs';

/**
 * The Arena: a challenge as a race you can watch.
 *
 * A leaderboard is a table, and a table is a thing you read. This is a floor in
 * perspective with one lane per competitor and a token that sits where they
 * have got to — the same numbers, arranged so you can see the gap without
 * doing arithmetic.
 *
 * All of it is CSS transforms: `rotateX` on the floor for the perspective, and
 * an equal and opposite `rotateX` on each token so the discs stand up off it
 * like counters on a board. No canvas, no library, nothing to download, and it
 * composites on the GPU — which is what keeps it smooth inside the Android
 * WebView where a redrawn canvas would not be.
 *
 * The lanes carry the same colours as the rest of the card, so a glance at the
 * track and a glance at the standings agree with each other.
 */

export type Racer = {
  id: string;
  label: string;
  color: string;
  /** How far along, 0–1. */
  at: number;
  score: number;
  you: boolean;
};

export function Arena({
  racers, unit, target, height = 260, tilt = 56,
}: {
  racers: Racer[];
  unit: string;
  /** Drawn as the finish line when the rule has one. */
  target?: number | null;
  height?: number;
  tilt?: number;
}) {
  const { prefs } = usePrefs();
  const lanes = Math.max(1, racers.length);
  const laneH = Math.min(64, (height - 40) / lanes);
  const motion = prefs.motion;

  return (
    <div style={{ perspective: 900, perspectiveOrigin: '50% 30%', padding: '4px 0 2px' }}>
      <div
        role="img"
        aria-label={racers.map((r) => `${r.label}: ${r.score} ${unit}`).join('. ')}
        style={{
          position: 'relative', height, borderRadius: 8, overflow: 'hidden',
          transform: `rotateX(${tilt}deg) scale(1.02)`, transformStyle: 'preserve-3d',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--acc) 14%, transparent), transparent 60%), var(--card2)',
          borderTop: '1px solid var(--line2)',
        }}>

        {/* the floor's grid, and the finish line at the far end */}
        <span aria-hidden style={{
          position: 'absolute', inset: 0,
          backgroundImage:
            `repeating-linear-gradient(0deg, var(--line) 0 1px, transparent 1px ${Math.round(laneH)}px),
             repeating-linear-gradient(90deg, color-mix(in srgb, var(--line2) 60%, transparent) 0 1px, transparent 1px 72px)`,
        }} />
        {target != null && (
          <span aria-hidden style={{
            position: 'absolute', left: 0, right: 0, top: 10, height: 12, opacity: 0.5,
            backgroundImage: 'repeating-linear-gradient(90deg, var(--tx) 0 10px, transparent 10px 20px)',
          }} />
        )}

        {racers.map((r, i) => {
          const top = 18 + i * laneH;
          const at = Math.max(0.02, Math.min(0.94, r.at));
          return (
            <span key={r.id} aria-hidden style={{ position: 'absolute', left: '3%', right: '3%', top, height: laneH }}>
              {/* the ground the token has covered */}
              <span style={{
                position: 'absolute', top: '50%', translate: '0 -50%', left: 0,
                width: `${at * 100}%`, height: 5, borderRadius: 3,
                transform: `rotateX(-${tilt}deg)`, transformOrigin: '50% 100%',
                background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${r.color} 70%, transparent))`,
                transition: motion ? 'width .9s cubic-bezier(.2,.8,.2,1)' : 'none',
              }} />
              <span style={{
                position: 'absolute', top: '50%', translate: '0 -50%', left: `${at * 100}%`,
                display: 'flex', alignItems: 'center', gap: 8,
                transform: `rotateX(-${tilt}deg)`, transformOrigin: '50% 100%',
                transition: motion ? 'left .9s cubic-bezier(.2,.8,.2,1)' : 'none',
              }}>
                <span style={{
                  width: r.you ? 38 : 32, height: r.you ? 38 : 32, borderRadius: 11,
                  display: 'grid', placeItems: 'center',
                  fontSize: r.you ? 10 : 10.5, fontWeight: 800, color: '#0A0C13',
                  background: `linear-gradient(150deg, ${r.color}, color-mix(in srgb, ${r.color} 45%, #000))`,
                  boxShadow: `0 12px 22px -10px rgba(0,0,0,.9), 0 0 0 2px rgba(255,255,255,.14) inset${r.you ? `, 0 0 0 2px ${r.color}` : ''}`,
                }}>
                  {r.you ? 'YOU' : r.label.replace(/^@/, '').slice(0, 2).toUpperCase()}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 800, color: 'var(--tx)', whiteSpace: 'nowrap',
                  background: 'color-mix(in srgb, var(--card) 82%, transparent)',
                  border: '1px solid var(--line2)', padding: '2px 8px', borderRadius: 999,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {r.score}
                </span>
              </span>
            </span>
          );
        })}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 8,
        fontSize: 10, color: 'var(--tx3)', letterSpacing: '.06em',
      }}>
        <span>START</span>
        <span>{target != null ? `${target} ${unit} — FINISH` : `MOST ${unit.toUpperCase()} WINS`}</span>
      </div>
    </div>
  );
}
