'use client';

import { usePrefs } from '@/lib/prefs';
import { peso } from '@/lib/money';
import { coinsFor, jarLevel, runwayFill, type CategorySpend } from '@/lib/runway';

/**
 * Money, drawn.
 *
 * Three pictures instead of three columns of pesos. The gauge answers the only
 * question a student's ledger is really for — how long can I keep going — and
 * the other two answer "where did it go" and "how much is left in each pot"
 * without anyone doing arithmetic in their head.
 *
 * SVG and CSS transforms. The coin stacks are genuinely in 3D (rotateX plus
 * rotateZ is the isometric pair), and they cost nothing to download.
 */

const CATEGORY_COLOR: Record<string, string> = {
  Food: '#34D9A0', Transport: '#7C6CFF', School: '#38D6F2',
  Bills: '#FF6B6B', Fun: '#FF6FA8', Health: '#B07CFF', Other: '#FFC24B',
};

export const colourOf = (c: string) => CATEGORY_COLOR[c] ?? CATEGORY_COLOR.Other;

/* ----------------------------------------------------------------- runway */

/**
 * Days left at your own rate of spending.
 *
 * The sweep is red at the empty end and green at the full one, and the needle
 * sits where you are — which is the one thing you want to see from across the
 * room. When there is nothing to divide by it says so rather than pointing at
 * infinity, because a gauge that lies is worse than a blank one.
 */
export function RunwayGauge({
  days, fill, burn,
}: { days: number | null; fill: number; burn: number }) {
  const { prefs } = usePrefs();
  const W = 320;
  const H = 176;
  const cx = W / 2;
  const cy = 150;
  const r = 128;
  const sweep = Math.PI * r;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={days === null ? 'Runway unknown — nothing spent yet' : `${days} days of runway`}>
      <defs>
        <linearGradient id="runway" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF6B6B" />
          <stop offset="45%" stopColor="#FFC24B" />
          <stop offset="100%" stopColor="#34D9A0" />
        </linearGradient>
      </defs>

      <path d={`M${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="var(--card2)" strokeWidth="20" strokeLinecap="round" />
      <path d={`M${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke="url(#runway)" strokeWidth="20" strokeLinecap="round"
        strokeDasharray={sweep} strokeDashoffset={sweep * (1 - fill)}
        style={{ transition: prefs.motion ? 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' : 'none' }} />

      <g transform={`rotate(${-90 + fill * 180} ${cx} ${cy})`}
        style={{ transition: prefs.motion ? 'transform .9s cubic-bezier(.2,.8,.2,1)' : 'none' }}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - r + 26} stroke="var(--tx)" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="7.5" fill="var(--tx)" />
      </g>

      <text x={cx} y={cy - 34} fill="var(--tx)" fontSize="38" fontWeight="800" textAnchor="middle"
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-.03em' }}>
        {days === null ? '—' : days}
      </text>
      <text x={cx} y={cy - 14} fill="var(--tx3)" fontSize="10" letterSpacing="1.4" textAnchor="middle">
        {days === null ? 'NOTHING SPENT YET' : 'DAYS OF RUNWAY'}
      </text>
      <text x={cx} y={H - 4} fill="var(--tx3)" fontSize="10" textAnchor="middle">
        {burn > 0 ? `${peso(burn)} a day, your own last thirty` : 'no spending to average'}
      </text>
    </svg>
  );
}

/* ----------------------------------------------------------------- stacks */

/**
 * The month as stacks of coins, one per category.
 *
 * Height is money. Four stacks says in a second what four rows of pesos says
 * in ten, and the tallest one is the conversation you need to have with
 * yourself.
 */
export function Stacks({ spend, onPick }: { spend: CategorySpend[]; onPick?: (c: string) => void }) {
  const top = spend.slice(0, 5);
  if (top.length === 0) {
    return <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: 0 }}>Nothing spent this month yet.</p>;
  }

  return (
    <div style={{ perspective: 700, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 26, minHeight: 172, paddingTop: 12 }}>
      {top.map((s) => {
        const n = coinsFor(s.total);
        const c = colourOf(s.category);
        return (
          <button key={s.category} onClick={() => onPick?.(s.category)} disabled={!onPick}
            style={{ width: 62, textAlign: 'center', cursor: onPick ? 'pointer' : 'default' }}
            aria-label={`${s.category}: ${peso(s.total)}`}>
            <span style={{
              display: 'block', position: 'relative', height: 110,
              transformStyle: 'preserve-3d', transform: 'rotateX(56deg) rotateZ(-45deg)',
            }}>
              {Array.from({ length: n }, (_, i) => (
                <span key={i} aria-hidden style={{
                  position: 'absolute', left: 0, bottom: i * 9, width: 54, height: 54, borderRadius: 8,
                  background: `linear-gradient(140deg, ${c}, color-mix(in srgb, ${c} 45%, #000))`,
                  border: '1px solid rgba(255,255,255,.15)',
                }} />
              ))}
            </span>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--tx3)', letterSpacing: '.06em', marginTop: 4 }}>
              {s.category.toUpperCase()}
            </span>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: 'var(--tx2)', fontVariantNumeric: 'tabular-nums' }}>
              {peso(s.total)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- jars */

/**
 * A budget is an envelope that drains.
 *
 * A percentage bar tells you a number; a jar with a level in it tells you how
 * much is *left*, which is the thing you act on. One that has been poured past
 * goes red and says by how much.
 */
export function Jars({
  jars,
}: { jars: { category: string; budget: number; spent: number }[] }) {
  const { prefs } = usePrefs();

  if (jars.length === 0) {
    return <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: 0 }}>No budgets set. A jar needs a size first.</p>;
  }

  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
      {jars.map((j) => {
        const { left, fill, over } = jarLevel(j.spent, j.budget);
        const c = over ? '#FF6B6B' : colourOf(j.category);
        return (
          <div key={j.category} style={{ width: 84, textAlign: 'center' }}>
            <div style={{
              position: 'relative', height: 96, borderRadius: '10px 10px 16px 16px', overflow: 'hidden',
              border: `2px solid ${over ? c : 'var(--line2)'}`,
              background: 'linear-gradient(180deg, rgba(255,255,255,.03), transparent)',
            }}
              role="img"
              aria-label={`${j.category}: ${over ? `${peso(-left)} over` : `${peso(left)} left`} of ${peso(j.budget)}`}>
              <span aria-hidden style={{
                position: 'absolute', left: 0, right: 0, bottom: 0, height: `${fill * 100}%`,
                background: `linear-gradient(180deg, ${c}, color-mix(in srgb, ${c} 40%, #000))`,
                transition: prefs.motion ? 'height .8s cubic-bezier(.2,.8,.2,1)' : 'none',
              }} />
              <span aria-hidden style={{
                position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                fontSize: 11.5, fontWeight: 800, color: fill > 0.45 ? '#0A0C13' : 'var(--tx2)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {over ? 'over' : peso(left)}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--tx3)', marginTop: 6, letterSpacing: '.05em' }}>
              {j.category.toUpperCase()}
            </div>
            <div style={{ fontSize: 10, color: over ? c : 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
              {peso(j.spent)} of {peso(j.budget)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
