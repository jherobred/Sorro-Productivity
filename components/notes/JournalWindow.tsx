'use client';

import { useEffect, useState } from 'react';

/**
 * A window, above the calendar.
 *
 * The rail under it is all measurement — a heat map of how much you wrote, a
 * streak, the same day in years gone. Useful, and relentless: the first thing
 * the journal says to you is a score. This pane says nothing you can fail at.
 * It is a window with the weather of the hour in it, and one quiet line.
 *
 * The sky, the sun's height and the line all come from the clock, so it is
 * different at seven in the morning and at midnight, and it is drawn — no
 * image to fetch, nothing to load, no request that can fail. Static by choice:
 * something that moves in the corner of the eye is the opposite of calm.
 */

type Phase = 'dawn' | 'day' | 'dusk' | 'night';

/** Sky gradient, horizon glow, hills, and the light the glass throws back. */
const SKY: Record<Phase, { top: string; mid: string; low: string; hill: string; far: string; glow: string }> = {
  dawn:  { top: '#2B3A67', mid: '#7B6B9E', low: '#F2A98C', hill: '#2A2438', far: '#443B5C', glow: '#FFD8A8' },
  day:   { top: '#3E7DC9', mid: '#7FB6E8', low: '#CFE7F7', hill: '#2F4A52', far: '#4C6E75', glow: '#FFF3C4' },
  dusk:  { top: '#20244A', mid: '#5B4A82', low: '#E7856B', hill: '#241E33', far: '#3C3252', glow: '#FFC07A' },
  night: { top: '#0E1230', mid: '#1B2350', low: '#2D3566', hill: '#0B0E24', far: '#161B3C', glow: '#9FB4FF' },
};

const LINE: Record<Phase, string> = {
  dawn: 'Early. Nothing is due from you yet.',
  day: 'The day is still open. Write when you have a minute.',
  dusk: 'The light is going. Good time to put the day down.',
  night: 'Quiet hours. Say a little, or nothing at all.',
};

const HELLO: Record<Phase, string> = {
  dawn: 'Good morning', day: 'Good afternoon', dusk: 'Good evening', night: 'Still up',
};

function phaseOf(h: number): Phase {
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 16.5) return 'day';
  if (h >= 16.5 && h < 19.5) return 'dusk';
  return 'night';
}

/** Stars, scattered once from a fixed seed so they do not dance on re-render. */
const STARS = [
  [18, 14], [37, 26], [58, 11], [79, 30], [96, 18], [117, 27], [138, 13], [159, 24], [181, 16], [198, 29],
  [28, 38], [70, 41], [128, 39], [172, 44], [104, 46],
] as const;

export function JournalWindow() {
  // The clock moves under a window left open, and a pane that says "good
  // afternoon" at seven in the evening is worse than no pane at all. Starting
  // at a fixed hour and correcting on mount keeps the server's first paint and
  // the browser's agreeing, which a `new Date()` initialiser does not.
  const [now, setNow] = useState(() => new Date(2000, 0, 1, 9, 0));
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 300_000);
    return () => clearInterval(t);
  }, []);

  const h = now.getHours() + now.getMinutes() / 60;
  const p = phaseOf(h);
  const c = SKY[p];
  const night = p === 'night';

  // The sun climbs from the left at six and sets to the right at six; the moon
  // runs the same arc through the night. sin() gives the height.
  const t = Math.min(1, Math.max(0, night ? (((h + 6) % 24) / 12) : (h - 5) / 14));
  const W = 216, H = 92;
  const cx = 14 + t * (W - 28);
  const cy = 62 - Math.sin(t * Math.PI) * 40;

  const id = night ? 'jw-night' : `jw-${p}`;

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 14, boxShadow: 'var(--sh)', padding: 11,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A window: ${LINE[p]}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 9 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.top} />
            <stop offset="58%" stopColor={c.mid} />
            <stop offset="100%" stopColor={c.low} />
          </linearGradient>
          <radialGradient id={`${id}-glow`} cx="50%" cy="50%">
            <stop offset="0%" stopColor={c.glow} stopOpacity={0.85} />
            <stop offset="100%" stopColor={c.glow} stopOpacity={0} />
          </radialGradient>
          <clipPath id={`${id}-clip`}>
            <rect x="3" y="3" width={W - 6} height={H - 6} rx="7" />
          </clipPath>
        </defs>

        <g clipPath={`url(#${id}-clip)`}>
          <rect x="0" y="0" width={W} height={H} fill={`url(#${id})`} />

          {night && STARS.map(([sx, sy], i) => (
            <circle key={i} cx={sx} cy={sy} r={i % 3 === 0 ? 1.1 : 0.7} fill="#E8ECFF" opacity={0.75} />
          ))}

          <circle cx={cx} cy={cy} r="26" fill={`url(#${id}-glow)`} />
          <circle cx={cx} cy={cy} r={night ? 6 : 7.5} fill={night ? '#E9EDFF' : '#FFF6D8'} />
          {night && <circle cx={cx + 2.6} cy={cy - 2} r="5.2" fill={c.top} opacity={0.92} />}

          {/* Two ridges, so the view has a distance to it. */}
          <path d={`M-6 ${H - 26} Q 46 ${H - 44} 96 ${H - 28} T ${W + 6} ${H - 34} L ${W + 6} ${H} L -6 ${H} Z`}
            fill={c.far} opacity={0.85} />
          <path d={`M-6 ${H - 14} Q 60 ${H - 32} 120 ${H - 16} T ${W + 6} ${H - 22} L ${W + 6} ${H} L -6 ${H} Z`}
            fill={c.hill} />
        </g>

        {/* The window itself: frame, two mullions, sill. */}
        <g stroke="var(--card2)" strokeWidth="5" fill="none" opacity={0.95}>
          <line x1={W / 2} y1="3" x2={W / 2} y2={H - 3} />
          <line x1="3" y1={H / 2} x2={W - 3} y2={H / 2} />
        </g>
        <rect x="3" y="3" width={W - 6} height={H - 6} rx="7" fill="none" stroke="var(--card2)" strokeWidth="6" />
        <rect x="3" y="3" width={W - 6} height={H - 6} rx="7" fill="none" stroke="var(--line2)" strokeWidth="1" />
      </svg>

      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx2)' }}>
          {HELLO[p]}
        </div>
        <div style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--tx3)', marginTop: 1 }}>
          {LINE[p]}
        </div>
      </div>
    </div>
  );
}
