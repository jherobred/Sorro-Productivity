'use client';

import { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { usePrefs } from '@/lib/prefs';
import { GROUPS, GROUP_LABEL, type Group } from '@/lib/body';

/**
 * The instruments.
 *
 * Every one of these replaces a row with a minus and a plus. The rule they
 * share: the picture *is* the control. You do not read a number and then press
 * a stepper next to it — you tap the glass and it fills, you drag the arc and
 * the night moves, you touch the part of the body you trained.
 *
 * SVG and CSS, nothing to download. The rings and the arc are stroke-dash
 * arithmetic; the body map is one silhouette with a warm layer over it.
 */

/* ------------------------------------------------------------------ rings */

export type Ring = { label: string; value: number; goal: number; color: string; unit: string };

/**
 * Three arcs, sharing a centre. Concentric rather than three separate gauges
 * because the day is one thing: you can see at a glance whether it is going
 * well without reading three numbers and comparing them yourself.
 */
export function Rings({ rings, size = 176 }: { rings: Ring[]; size?: number }) {
  const { prefs } = usePrefs();
  const mid = size / 2;
  const band = size * 0.082;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}
      role="img" aria-label={rings.map((r) => `${r.label} ${Math.round((r.value / r.goal) * 100)} percent`).join(', ')}>
      <g transform={`rotate(-90 ${mid} ${mid})`}>
        {rings.map((r, i) => {
          const radius = mid - band / 2 - i * (band + size * 0.028);
          const circ = 2 * Math.PI * radius;
          const pct = Math.max(0, Math.min(1, r.goal > 0 ? r.value / r.goal : 0));
          return (
            <g key={r.label}>
              <circle cx={mid} cy={mid} r={radius} fill="none" stroke="var(--card2)" strokeWidth={band} />
              <circle cx={mid} cy={mid} r={radius} fill="none" stroke={r.color} strokeWidth={band}
                strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
                style={{ transition: prefs.motion ? 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' : 'none' }} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/* --------------------------------------------------------------- the glass */

/**
 * Water. One tap is one cup, the glass fills, and that is the whole
 * interaction — no number, no stepper, no keyboard. Tapping a filled mark
 * takes it back off.
 */
export function Vessel({ cups, goal, onSet }: { cups: number; goal: number; onSet: (n: number) => void }) {
  const { prefs } = usePrefs();
  const pct = Math.max(0, Math.min(1, cups / goal));

  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
      <button onClick={() => onSet(Math.min(goal + 4, cups + 1))} className="k-squish"
        aria-label={`Add a cup — ${cups} of ${goal} so far`}
        style={{
          width: 78, height: 104, borderRadius: '12px 12px 20px 20px', position: 'relative', overflow: 'hidden',
          border: '2px solid var(--line2)', background: 'linear-gradient(180deg, rgba(56,214,242,.06), transparent)',
        }}>
        <span aria-hidden style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pct * 100}%`,
          background: 'linear-gradient(180deg, #38D6F2, #1B7E9B)',
          boxShadow: '0 -6px 20px rgba(56,214,242,.45)',
          transition: prefs.motion ? 'height .6s cubic-bezier(.2,.8,.2,1)' : 'none',
        }}>
          <span style={{
            position: 'absolute', left: '-10%', right: '-10%', top: -7, height: 14,
            borderRadius: '50%', background: '#5CE4FA', opacity: 0.8,
          }} />
        </span>
        <span aria-hidden style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          fontSize: 19, fontWeight: 800, color: pct > 0.55 ? '#062028' : 'var(--tx2)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {cups}
        </span>
      </button>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 190 }}>
        {Array.from({ length: goal }, (_, i) => {
          const on = i < cups;
          return (
            <button key={i} onClick={() => onSet(on && i === cups - 1 ? i : i + 1)}
              aria-label={`${i + 1} cups`} aria-pressed={on}
              style={{
                width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center',
                border: `1px solid ${on ? '#2A93B4' : 'var(--line2)'}`,
                background: on ? 'rgba(56,214,242,.2)' : 'transparent',
              }}>
              {on && <Icon name="check" size={10} color="#9FE9F8" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- the arc */

/**
 * Sleep as a night rather than a number.
 *
 * The arc runs from the evening, over midnight, into the morning. Two handles:
 * when you went down and when you got up. Dragging them is easier than typing
 * 7.5 and rather more honest, and the hours fall out of the two ends.
 */
export function SleepArc({
  from, to, onChange,
}: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const W = 320;
  const H = 118;
  const box = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<'from' | 'to' | null>(null);

  // The arc spans 18:00 → 12:00, eighteen hours, which is every plausible night.
  const SPAN_START = 18;
  const SPAN_H = 18;

  const toT = (clock: string) => {
    const [h, m] = clock.split(':').map(Number);
    const hour = (h + (m || 0) / 60 - SPAN_START + 24) % 24;
    return Math.max(0, Math.min(1, hour / SPAN_H));
  };
  const toClock = (t: number) => {
    const hour = (SPAN_START + t * SPAN_H) % 24;
    const h = Math.floor(hour);
    const m = Math.round(((hour - h) * 60) / 10) * 10;
    return `${String(m === 60 ? h + 1 : h).padStart(2, '0')}:${String(m === 60 ? 0 : m).padStart(2, '0')}`;
  };

  const at = (t: number) => {
    const a = Math.PI * (1 - t);
    return { x: W / 2 + Math.cos(a) * (W / 2 - 22), y: H - 18 - Math.sin(a) * (H - 42) };
  };

  const a = toT(from);
  const b = toT(to);
  const pa = at(a);
  const pb = at(b);

  const move = (e: React.PointerEvent) => {
    if (!drag || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = Math.max(0, Math.min(1, (x - 22) / (W - 44)));
    if (drag === 'from') onChange(toClock(t), to);
    else onChange(from, toClock(t));
  };

  return (
    <svg ref={box} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ touchAction: 'none' }}
      onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}
      role="img" aria-label={`Asleep from ${from} to ${to}`}>
      <path d={`M22 ${H - 18} A ${W / 2 - 22} ${H - 42} 0 0 1 ${W - 22} ${H - 18}`}
        fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="4 6" />
      <path d={`M${pa.x} ${pa.y} A ${W / 2 - 22} ${H - 42} 0 0 1 ${pb.x} ${pb.y}`}
        fill="none" stroke="var(--acc)" strokeWidth="6" strokeLinecap="round" />

      <circle cx={pa.x} cy={pa.y} r="9" fill="var(--acc)" style={{ cursor: 'grab' }}
        onPointerDown={() => setDrag('from')} />
      <circle cx={pb.x} cy={pb.y} r="9" fill="#38D6F2" style={{ cursor: 'grab' }}
        onPointerDown={() => setDrag('to')} />

      <text x={pa.x} y={H - 2} fill="var(--tx3)" fontSize="10" textAnchor="middle"
        style={{ fontVariantNumeric: 'tabular-nums' }}>{from}</text>
      <text x={pb.x} y={H - 2} fill="var(--tx3)" fontSize="10" textAnchor="middle"
        style={{ fontVariantNumeric: 'tabular-nums' }}>{to}</text>
    </svg>
  );
}

/* ------------------------------------------------------------- the body map */

/**
 * A silhouette that warms where you trained.
 *
 * Cold legs on a Thursday is an argument you can see, which no row of numbers
 * ever makes. Tapping a region logs a session for that group, so the picture
 * is the input as well as the output.
 */
export function BodyMap({
  heat, onTap, height = 210,
}: { heat: Record<Group, number>; onTap?: (g: Group) => void; height?: number }) {
  const warm = (g: Group) => {
    const h = heat[g] ?? 0;
    if (h <= 0) return 'transparent';
    // cool amber through to a hot coral, so "trained hard, recently" reads hot
    return h > 0.66 ? '#FF6B6B' : h > 0.33 ? '#FF9A5B' : '#FFC24B';
  };

  const parts: { g: Group; d: string; label: string }[] = [
    { g: 'chest', d: 'M33 31 h24 l7 8 v20 h-38 V39 z', label: 'Chest' },
    { g: 'core', d: 'M26 60 h38 v22 l-4 24 h-30 l-4-24 z', label: 'Core' },
    { g: 'arms', d: 'M26 39 l-8 4 -5 38 7 2 9-36 z M64 39 l8 4 5 38 -7 2 -9-36 z', label: 'Arms' },
    { g: 'legs', d: 'M34 108 l-3 52 h12 l3-32 3 32 h12 l-3-52 z', label: 'Legs' },
  ];

  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 10 }}>
      <svg viewBox="0 0 90 172" height={height} role="img"
        aria-label={GROUPS.map((g) => `${GROUP_LABEL[g]} ${Math.round((heat[g] ?? 0) * 100)} percent`).join(', ')}>
        <g fill="var(--card2)" stroke="var(--line2)" strokeWidth="1.1">
          <circle cx="45" cy="15" r="11.5" />
          {parts.map((p) => <path key={p.g} d={p.d} />)}
        </g>
        <g>
          {parts.map((p) => (
            <path key={p.g} d={p.d} fill={warm(p.g)} opacity={0.62}
              onClick={() => onTap?.(p.g)}
              style={{ cursor: onTap ? 'pointer' : undefined }}>
              <title>{`${p.label} — ${Math.round((heat[p.g] ?? 0) * 100)}%`}</title>
            </path>
          ))}
        </g>
      </svg>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
        {GROUPS.map((g) => {
          const h = heat[g] ?? 0;
          return (
            <button key={g} onClick={() => onTap?.(g)} disabled={!onTap}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999,
                border: `1px solid ${h > 0 ? warm(g) : 'var(--line2)'}`,
                fontSize: 10, fontWeight: 700, color: h > 0 ? 'var(--tx)' : 'var(--tx3)',
                background: h > 0 ? `color-mix(in srgb, ${warm(g)} 16%, transparent)` : 'transparent',
              }}>
              {GROUP_LABEL[g]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- the ribbon */

/**
 * Weight, as a ribbon with a lit endpoint. A line chart that says where you are
 * now rather than making you find the last dot yourself.
 */
export function Ribbon({ points, color = '#FFC24B' }: { points: { day: string; value: number }[]; color?: string }) {
  const W = 320;
  const H = 90;
  const vals = points.map((p) => p.value).filter((v) => v > 0);
  if (vals.length < 2) {
    return <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: 0 }}>Two readings and this becomes a line.</p>;
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(0.4, max - min);
  const xs = (i: number) => 6 + (i / (points.length - 1)) * (W - 12);
  const ys = (v: number) => H - 14 - ((v - min) / span) * (H - 30);

  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${xs(i)} ${ys(p.value || min)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`Weight from ${min} to ${max}, now ${last.value}`}>
      <defs>
        <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${xs(points.length - 1)} ${H} L ${xs(0)} ${H} Z`} fill="url(#ribbon)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs(points.length - 1)} cy={ys(last.value || min)} r="4.5" fill={color} />
      <text x={W - 6} y={12} fill="var(--tx2)" fontSize="11" textAnchor="end"
        style={{ fontVariantNumeric: 'tabular-nums' }}>{last.value} kg</text>
    </svg>
  );
}
